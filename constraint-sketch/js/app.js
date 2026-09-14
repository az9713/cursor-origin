/**
 * app.js — Constraint Sketch Application
 * Handles: state, rendering, tools, storage, routing.
 */

import { solve, MAX_ITER } from './solver.js';

// ── Storage key & constants ───────────────────────────────────────────────────
const STORAGE_KEY = 'constraint-sketch-v1';
const POINT_RADIUS = 8;      // visual + hit radius for points (px)
const LINE_HIT     = 7;      // hit tolerance for lines/circles (px)

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  sketches:       {},          // id → sketch
  currentId:      null,        // active sketch id
  selected:       null,        // { type:'point'|'line'|'circle'|'constraint', id }
  tool:           'select',    // active tool
  constraintType: 'distance',  // selected constraint type
  pending:        [],          // entity ids being accumulated for constraint/line/circle
  pendingMeta:    [],          // {type,id} for constraint pending
  drag:           null,        // { pointId, lastX, lastY }
  mousePos:       { x: 0, y: 0 },
  solveResult:    null,        // last solve() output
};

// ── Seed Sketches ─────────────────────────────────────────────────────────────

function makeSeedRect(cx, cy) {
  const W = 200, H = 160;
  return {
    name: 'Rectangle',
    points: [
      { id: 'p1', x: cx - W/2, y: cy - H/2 },
      { id: 'p2', x: cx + W/2, y: cy - H/2 },
      { id: 'p3', x: cx + W/2, y: cy + H/2 },
      { id: 'p4', x: cx - W/2, y: cy + H/2 },
    ],
    lines: [
      { id: 'l1', a: 'p1', b: 'p2' },   // top
      { id: 'l2', a: 'p2', b: 'p3' },   // right
      { id: 'l3', a: 'p3', b: 'p4' },   // bottom
      { id: 'l4', a: 'p4', b: 'p1' },   // left
    ],
    circles: [],
    constraints: [
      { id: 'c1', type: 'distance', p1: 'p1', p2: 'p2', len: W },
      { id: 'c2', type: 'distance', p1: 'p2', p2: 'p3', len: H },
      { id: 'c3', type: 'distance', p1: 'p3', p2: 'p4', len: W },
      { id: 'c4', type: 'distance', p1: 'p4', p2: 'p1', len: H },
      { id: 'c5', type: 'parallel', l1: 'l1', l2: 'l3' },
      { id: 'c6', type: 'parallel', l1: 'l2', l2: 'l4' },
    ],
  };
}

function makeSeedTriangle(cx, cy) {
  // Right angle at p1 (bottom-left)
  return {
    name: 'Right Triangle',
    points: [
      { id: 'p1', x: cx - 100, y: cy + 80 },   // right-angle vertex
      { id: 'p2', x: cx + 100, y: cy + 80 },   // base endpoint
      { id: 'p3', x: cx - 100, y: cy - 80 },   // top endpoint
    ],
    lines: [
      { id: 'l1', a: 'p1', b: 'p2' },   // base (horizontal)
      { id: 'l2', a: 'p2', b: 'p3' },   // hypotenuse
      { id: 'l3', a: 'p1', b: 'p3' },   // vertical side
    ],
    circles: [],
    constraints: [
      { id: 'c1', type: 'distance', p1: 'p1', p2: 'p2', len: 200 },
      { id: 'c2', type: 'distance', p1: 'p1', p2: 'p3', len: 160 },
      { id: 'c3', type: 'angle',    l1: 'l1', l2: 'l3', deg: 90 },
    ],
  };
}

// ── ID generation ─────────────────────────────────────────────────────────────
let _seq = Date.now();
function uid(prefix = 'e') { return prefix + (++_seq).toString(36); }

// ── Sketch helpers ────────────────────────────────────────────────────────────
function currentSketch() { return state.sketches[state.currentId] || null; }

function getPoint(sketch, id)      { return sketch.points.find(p => p.id === id); }
function getLine(sketch, id)       { return sketch.lines.find(l => l.id === id); }
function getCircle(sketch, id)     { return sketch.circles.find(c => c.id === id); }
function getConstraint(sketch, id) { return sketch.constraints.find(c => c.id === id); }

/** Apply solved point/circle positions back into the sketch. */
function applySolve(sketch, result) {
  sketch.points  = result.points;
  sketch.circles = result.circles;
  state.solveResult = result;
}

/** Run solver and update sketch in place. */
function runSolver(sketch) {
  const result = solve(sketch);
  applySolve(sketch, result);
  return result;
}

// ── Storage ───────────────────────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sketches: state.sketches,
      currentId: state.currentId,
    }));
  } catch (e) { /* quota exceeded, ignore */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.sketches && typeof data.sketches === 'object') {
      state.sketches = data.sketches;
      state.currentId = data.currentId || Object.keys(data.sketches)[0] || null;
      return true;
    }
  } catch (e) { /* corrupted, ignore */ }
  return false;
}

// ── Hash routing ──────────────────────────────────────────────────────────────
function parseHash() {
  const m = location.hash.match(/^#\/s\/(.+)$/);
  return m ? m[1] : null;
}

function pushHash(id) {
  history.replaceState(null, '', '#/s/' + id);
}

window.addEventListener('hashchange', () => {
  const id = parseHash();
  if (id && state.sketches[id]) {
    switchSketch(id);
  }
});

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d');
const container = canvas.parentElement;   // .canvas-container

// Resize canvas to fill container
const ro = new ResizeObserver(entries => {
  const { width, height } = entries[0].contentRect;
  canvas.width  = Math.round(width);
  canvas.height = Math.round(height);
  render();
});
ro.observe(container);

// ── Rendering ─────────────────────────────────────────────────────────────────
function render() {
  const W = canvas.width, H = canvas.height;
  const sketch = currentSketch();
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#ebe4d6';
  ctx.fillRect(0, 0, W, H);

  // Grid
  drawGrid(W, H);

  if (!sketch) {
    drawEmptyHint(W, H);
    return;
  }

  // Constraint visual indicators
  drawConstraintIndicators(sketch);

  // Circles
  for (const c of sketch.circles) drawCircle(sketch, c);

  // Lines
  for (const l of sketch.lines) drawLine(sketch, l);

  // Points
  for (const p of sketch.points) drawPoint(p);

  // Tool overlay (preview lines while adding)
  drawToolOverlay(sketch);
}

function drawGrid(W, H) {
  const step = 40;
  ctx.strokeStyle = 'rgba(42,37,31,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
}

function drawEmptyHint(W, H) {
  ctx.fillStyle = 'rgba(42,37,31,0.3)';
  ctx.font = '14px IBM Plex Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Load a seed sketch or add entities with the toolbar', W/2, H/2);
}

function isSelected(type, id) {
  return state.selected && state.selected.type === type && state.selected.id === id;
}

function isPending(type, id) {
  return state.pendingMeta.some(m => m.type === type && m.id === id);
}

function drawPoint(p) {
  const sel  = isSelected('point', p.id);
  const pend = isPending('point', p.id);
  const r    = POINT_RADIUS;

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle   = sel ? '#b4451a' : pend ? '#7a6e60' : (p.fixed ? '#5a5048' : '#fffdf8');
  ctx.strokeStyle = sel ? '#b4451a' : pend ? '#7a6e60' : '#2a251f';
  ctx.lineWidth   = sel ? 2 : 1.5;
  ctx.fill();
  ctx.stroke();

  // Fixed indicator
  if (p.fixed && !sel) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(42,37,31,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawLine(sketch, l) {
  const a = getPoint(sketch, l.a);
  const b = getPoint(sketch, l.b);
  if (!a || !b) return;
  const sel  = isSelected('line', l.id);
  const pend = isPending('line', l.id);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = sel ? '#b4451a' : pend ? '#7a6e60' : '#2a251f';
  ctx.lineWidth   = sel ? 2.5 : 1.5;
  ctx.stroke();
}

function drawCircle(sketch, c) {
  const center = getPoint(sketch, c.c);
  if (!center) return;
  const sel  = isSelected('circle', c.id);
  const pend = isPending('circle', c.id);
  ctx.beginPath();
  ctx.arc(center.x, center.y, c.r, 0, Math.PI * 2);
  ctx.strokeStyle = sel ? '#b4451a' : pend ? '#7a6e60' : '#2a251f';
  ctx.lineWidth   = sel ? 2.5 : 1.5;
  ctx.stroke();
}

function drawConstraintIndicators(sketch) {
  for (const con of sketch.constraints) {
    const selCon = isSelected('constraint', con.id);
    switch (con.type) {

      case 'distance': {
        const p1 = getPoint(sketch, con.p1);
        const p2 = getPoint(sketch, con.p2);
        if (!p1 || !p2) break;
        drawDimensionLabel(p1, p2, con.len, selCon);
        break;
      }

      case 'radius': {
        const c = getCircle(sketch, con.circle);
        const center = c ? getPoint(sketch, c.c) : null;
        if (!center || !c) break;
        ctx.save();
        ctx.fillStyle = selCon ? '#b4451a' : '#7a6e60';
        ctx.font = '11px IBM Plex Mono, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('r=' + con.r, center.x + c.r * 0.7 + 4, center.y - c.r * 0.3);
        ctx.restore();
        break;
      }

      case 'parallel': {
        const l1 = getLine(sketch, con.l1);
        const l2 = getLine(sketch, con.l2);
        if (l1) drawParallelTick(sketch, l1, 1, selCon);
        if (l2) drawParallelTick(sketch, l2, 1, selCon);
        break;
      }

      case 'angle': {
        const l1 = getLine(sketch, con.l1);
        const l2 = getLine(sketch, con.l2);
        if (!l1 || !l2) break;
        // Find shared point
        const shared = findSharedPoint(l1, l2);
        if (shared) {
          const p = getPoint(sketch, shared);
          if (p) drawAngleMark(sketch, p, l1, l2, con.deg, selCon);
        }
        break;
      }

      case 'coincident': {
        const p1 = getPoint(sketch, con.p1);
        if (p1) {
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, POINT_RADIUS + 4, 0, Math.PI * 2);
          ctx.strokeStyle = selCon ? '#b4451a' : 'rgba(42,37,31,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        break;
      }

      case 'point-on-line': {
        const p = getPoint(sketch, con.p);
        if (p) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, POINT_RADIUS + 5, 0, Math.PI * 2);
          ctx.strokeStyle = selCon ? '#b4451a' : 'rgba(42,37,31,0.35)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        break;
      }
    }
  }
}

function drawDimensionLabel(p1, p2, len, selected) {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const llen = Math.hypot(dx, dy) + 1e-9;
  // Normal direction offset
  const nx = -dy / llen, ny = dx / llen;
  const off = 18;

  const tx = mx + nx * off, ty = my + ny * off;

  // Leader line
  ctx.beginPath();
  ctx.moveTo(p1.x + nx * 10, p1.y + ny * 10);
  ctx.lineTo(p2.x + nx * 10, p2.y + ny * 10);
  ctx.strokeStyle = selected ? '#b4451a' : 'rgba(180,69,26,0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.font = '600 11px IBM Plex Mono, monospace';
  ctx.fillStyle = selected ? '#b4451a' : '#7a4030';
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  // Rotate label along the line
  ctx.translate(tx, ty);
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;
  ctx.rotate(angle);
  // Background pill
  const text = len + 'px';
  const tw   = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(255,253,248,0.85)';
  ctx.fillRect(-tw/2, -8, tw, 16);
  ctx.fillStyle = selected ? '#b4451a' : '#7a4030';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawParallelTick(sketch, line, groupNum, selected) {
  const a = getPoint(sketch, line.a);
  const b = getPoint(sketch, line.b);
  if (!a || !b) return;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) + 1e-9;
  const ux = dx/len, uy = dy/len;
  const nx = -uy, ny = ux;
  const s = 5;

  ctx.save();
  ctx.translate(mx + nx * 12, my + ny * 12);
  ctx.rotate(Math.atan2(uy, ux));
  ctx.strokeStyle = selected ? '#b4451a' : 'rgba(42,37,31,0.4)';
  ctx.lineWidth = 1.5;
  // Single chevron ">"
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, -s);
  ctx.lineTo(s * 0.4, 0);
  ctx.lineTo(-s * 0.6, s);
  ctx.stroke();
  ctx.restore();
}

function drawAngleMark(sketch, vertex, l1, l2, deg, selected) {
  // Find the directions from the shared vertex
  function dirFromVertex(l, vid) {
    const a = getPoint(sketch, l.a), b = getPoint(sketch, l.b);
    if (!a || !b) return null;
    if (l.a === vid) return { dx: b.x - a.x, dy: b.y - a.y };
    return { dx: a.x - b.x, dy: a.y - b.y };
  }
  const d1 = dirFromVertex(l1, vertex.id);
  const d2 = dirFromVertex(l2, vertex.id);
  if (!d1 || !d2) return;

  const a1 = Math.atan2(d1.dy, d1.dx);
  const a2 = Math.atan2(d2.dy, d2.dx);
  const r  = 20;

  ctx.beginPath();
  ctx.arc(vertex.x, vertex.y, r, Math.min(a1, a2), Math.max(a1, a2));
  ctx.strokeStyle = selected ? '#b4451a' : 'rgba(42,37,31,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Label
  const midAngle = (a1 + a2) / 2;
  const tx = vertex.x + (r + 10) * Math.cos(midAngle);
  const ty = vertex.y + (r + 10) * Math.sin(midAngle);
  ctx.save();
  ctx.font = '10px IBM Plex Mono, monospace';
  ctx.fillStyle = selected ? '#b4451a' : '#7a4030';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(deg + '°', tx, ty);
  ctx.restore();
}

function findSharedPoint(l1, l2) {
  if (l1.a === l2.a || l1.a === l2.b) return l1.a;
  if (l1.b === l2.a || l1.b === l2.b) return l1.b;
  return null;
}

function drawToolOverlay(sketch) {
  // Preview line being drawn
  if (state.tool === 'line' && state.pending.length === 1) {
    const p = getPoint(sketch, state.pending[0]);
    if (p) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(state.mousePos.x, state.mousePos.y);
      ctx.strokeStyle = 'rgba(42,37,31,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Preview circle being drawn
  if (state.tool === 'circle' && state.pending.length === 1) {
    const p = getPoint(sketch, state.pending[0]);
    if (p) {
      const r = Math.hypot(state.mousePos.x - p.x, state.mousePos.y - p.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(r, 1), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(42,37,31,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ── Hit-testing ───────────────────────────────────────────────────────────────
function hitTest(x, y, sketch) {
  if (!sketch) return null;

  // Points (highest priority)
  for (const p of sketch.points) {
    if (Math.hypot(x - p.x, y - p.y) <= POINT_RADIUS + 3) {
      return { type: 'point', id: p.id };
    }
  }

  // Circle outlines
  for (const c of sketch.circles) {
    const center = getPoint(sketch, c.c);
    if (center && Math.abs(Math.hypot(x - center.x, y - center.y) - c.r) <= LINE_HIT) {
      return { type: 'circle', id: c.id };
    }
  }

  // Lines
  for (const l of sketch.lines) {
    const a = getPoint(sketch, l.a);
    const b = getPoint(sketch, l.b);
    if (a && b && distToSegment(x, y, a.x, a.y, b.x, b.y) <= LINE_HIT) {
      return { type: 'line', id: l.id };
    }
  }

  return null;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx*dx + dy*dy;
  if (lenSq < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq));
  return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
}

// ── Constraint spec ───────────────────────────────────────────────────────────
const CONSTRAINT_SPEC = {
  coincident:      { selects: ['point', 'point'],  hasValue: false },
  distance:        { selects: ['point', 'point'],  hasValue: true,  valueLabel: 'Distance (px)', defaultValue: 100 },
  parallel:        { selects: ['line',  'line'],   hasValue: false },
  angle:           { selects: ['line',  'line'],   hasValue: true,  valueLabel: 'Angle (°)',     defaultValue: 90 },
  'point-on-line': { selects: ['point', 'line'],   hasValue: false },
  radius:          { selects: ['circle'],           hasValue: true,  valueLabel: 'Radius (px)',   defaultValue: 60 },
};

function constraintHint() {
  const spec = CONSTRAINT_SPEC[state.constraintType];
  if (!spec) return '';
  const have = state.pendingMeta.length;
  const need = spec.selects.length;
  if (have >= need) {
    return spec.hasValue ? 'Enter value in inspector then click Apply' : '';
  }
  const next = spec.selects[have];
  return `Click a ${next} (${have}/${need})`;
}

// ── Canvas mouse events ───────────────────────────────────────────────────────
function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

canvas.addEventListener('mousemove', e => {
  const { x, y } = canvasCoords(e);
  state.mousePos = { x, y };

  if (state.drag) {
    const sketch = currentSketch();
    if (!sketch) return;
    const p = getPoint(sketch, state.drag.pointId);
    if (!p || p.fixed) return;

    p.x = x;
    p.y = y;
    const result = runSolver(sketch);
    save();
    updateStatus(result);
    updateInspector();
    render();
    return;
  }

  // Preview overlay
  if (state.tool === 'line' && state.pending.length === 1) render();
  if (state.tool === 'circle' && state.pending.length === 1) render();

  // Cursor style
  if (state.tool === 'select') {
    const hit = hitTest(x, y, currentSketch());
    canvas.style.cursor = hit ? (hit.type === 'point' ? 'grab' : 'pointer') : 'default';
  } else {
    canvas.style.cursor = 'crosshair';
  }
});

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const { x, y } = canvasCoords(e);
  const sketch = currentSketch();

  if (state.tool === 'select') {
    const hit = hitTest(x, y, sketch);
    if (hit) {
      state.selected = hit;
      if (hit.type === 'point') {
        state.drag = { pointId: hit.id };
        canvas.style.cursor = 'grabbing';
      }
    } else {
      state.selected = null;
    }
    updateInspector();
    render();
    return;
  }

  if (state.tool === 'point') {
    addPoint(x, y);
    return;
  }

  if (state.tool === 'line') {
    const hit = hitTest(x, y, sketch);
    if (hit && hit.type === 'point') {
      handleLineTool(hit.id);
    } else {
      // Create a new point at click location and start line from it
      const pid = addPoint(x, y, false /* don't reset tool */);
      handleLineTool(pid);
    }
    return;
  }

  if (state.tool === 'circle') {
    const hit = hitTest(x, y, sketch);
    if (state.pending.length === 0) {
      const centerId = (hit && hit.type === 'point')
        ? hit.id
        : addPoint(x, y, false);
      state.pending = [centerId];
      updateStatus(state.solveResult);
    } else {
      // Second click: set radius
      const center = getPoint(sketch, state.pending[0]);
      const r = Math.hypot(x - center.x, y - center.y);
      addCircle(state.pending[0], Math.max(r, 5));
      state.pending = [];
    }
    return;
  }

  if (state.tool === 'constraint') {
    const hit = hitTest(x, y, sketch);
    if (!hit) return;
    handleConstraintTool(hit);
    return;
  }
});

canvas.addEventListener('mouseup', e => {
  if (state.drag) {
    state.drag = null;
    canvas.style.cursor = 'grab';
  }
});

canvas.addEventListener('mouseleave', () => {
  state.drag = null;
});

// ── Tool: Point ───────────────────────────────────────────────────────────────
function addPoint(x, y, resetTool = true) {
  const sketch = currentSketch();
  if (!sketch) return;
  const id = uid('p');
  sketch.points.push({ id, x, y });
  if (resetTool) {
    state.selected = { type: 'point', id };
    updateInspector();
  }
  save();
  render();
  return id;
}

// ── Tool: Line ────────────────────────────────────────────────────────────────
function handleLineTool(pointId) {
  if (state.pending.length === 0) {
    state.pending = [pointId];
    updateStatus(state.solveResult);
  } else if (state.pending[0] !== pointId) {
    // Second point — create line
    const sketch = currentSketch();
    const id = uid('l');
    sketch.lines.push({ id, a: state.pending[0], b: pointId });
    state.pending = [];
    state.selected = { type: 'line', id };
    const result = runSolver(sketch);
    save();
    updateStatus(result);
    updateInspector();
    render();
  }
}

// ── Tool: Circle ──────────────────────────────────────────────────────────────
function addCircle(centerId, r) {
  const sketch = currentSketch();
  if (!sketch) return;
  const id = uid('c');
  sketch.circles.push({ id, c: centerId, r });
  state.selected = { type: 'circle', id };
  const result = runSolver(sketch);
  save();
  updateStatus(result);
  updateInspector();
  render();
}

// ── Tool: Constraint ──────────────────────────────────────────────────────────
function handleConstraintTool(hit) {
  const spec = CONSTRAINT_SPEC[state.constraintType];
  if (!spec) return;

  const needed = spec.selects[state.pendingMeta.length];
  if (hit.type !== needed) return;   // wrong entity type, ignore

  state.pendingMeta.push(hit);
  render();

  if (state.pendingMeta.length < spec.selects.length) {
    // Still need more entities
    updateInspector();
    updateStatus(state.solveResult);
    return;
  }

  // All entities selected
  if (!spec.hasValue) {
    finaliseConstraint(null);
  } else {
    // Show value form in inspector
    updateInspector();
    updateStatus(state.solveResult);
  }
}

function finaliseConstraint(value) {
  const sketch = currentSketch();
  if (!sketch) return;
  const spec = CONSTRAINT_SPEC[state.constraintType];
  const ids = state.pendingMeta.map(m => m.id);
  const id  = uid('con');

  let con;
  switch (state.constraintType) {
    case 'coincident':
      con = { id, type: 'coincident', p1: ids[0], p2: ids[1] }; break;
    case 'distance':
      con = { id, type: 'distance',   p1: ids[0], p2: ids[1], len: value }; break;
    case 'parallel':
      con = { id, type: 'parallel',   l1: ids[0], l2: ids[1] }; break;
    case 'angle':
      con = { id, type: 'angle',      l1: ids[0], l2: ids[1], deg: value }; break;
    case 'point-on-line':
      con = { id, type: 'point-on-line', p: ids[0], l: ids[1] }; break;
    case 'radius':
      con = { id, type: 'radius', circle: ids[0], r: value }; break;
    default: return;
  }

  sketch.constraints.push(con);
  state.pendingMeta = [];
  state.selected = { type: 'constraint', id };

  const result = runSolver(sketch);
  save();
  updateStatus(result);
  updateInspector();
  render();
}

function cancelConstraint() {
  state.pendingMeta = [];
  updateInspector();
  updateStatus(state.solveResult);
  render();
}

// ── Delete selected entity ────────────────────────────────────────────────────
function deleteSelected() {
  const sketch = currentSketch();
  if (!sketch || !state.selected) return;
  const { type, id } = state.selected;

  if (type === 'point') {
    sketch.points = sketch.points.filter(p => p.id !== id);
    // Remove lines and circles that reference this point
    sketch.lines   = sketch.lines.filter(l => l.a !== id && l.b !== id);
    sketch.circles = sketch.circles.filter(c => c.c !== id);
    sketch.constraints = sketch.constraints.filter(c =>
      c.p1 !== id && c.p2 !== id && c.p !== id);
  } else if (type === 'line') {
    sketch.lines = sketch.lines.filter(l => l.id !== id);
    sketch.constraints = sketch.constraints.filter(c =>
      c.l1 !== id && c.l2 !== id && c.l !== id);
  } else if (type === 'circle') {
    sketch.circles = sketch.circles.filter(c => c.id !== id);
    sketch.constraints = sketch.constraints.filter(c => c.circle !== id);
  } else if (type === 'constraint') {
    sketch.constraints = sketch.constraints.filter(c => c.id !== id);
  }

  state.selected = null;
  const result = runSolver(sketch);
  save();
  updateStatus(result);
  updateInspector();
  render();
}

// ── Status bar ────────────────────────────────────────────────────────────────
function updateStatus(result) {
  const dofEl     = document.getElementById('status-dof');
  const badgeEl   = document.getElementById('status-badge');
  const residEl   = document.getElementById('status-residual');
  const hintEl    = document.getElementById('status-hint');

  if (!result) {
    dofEl.textContent   = '';
    badgeEl.textContent = '';
    badgeEl.className   = 'badge';
    residEl.textContent = '';
  } else {
    dofEl.textContent = `DOF: ${result.dof}`;
    const statusLabels = {
      satisfied: 'Satisfied',
      under:     'Under-constrained',
      over:      'Over-constrained',
      failed:    'Failed',
    };
    badgeEl.textContent = statusLabels[result.status] || result.status;
    badgeEl.className   = `badge badge-${result.status}`;
    residEl.textContent = `res ${result.residual.toExponential(1)}  iter ${result.iterations}/${MAX_ITER}`;
  }

  // Tool hint
  if (state.tool === 'constraint') {
    hintEl.textContent = constraintHint();
  } else if (state.tool === 'line' && state.pending.length === 1) {
    hintEl.textContent = 'Click second point';
  } else if (state.tool === 'circle') {
    hintEl.textContent = state.pending.length === 0 ? 'Click center point' : 'Click to set radius';
  } else {
    hintEl.textContent = '';
  }
}

// ── Inspector ─────────────────────────────────────────────────────────────────
function updateInspector() {
  const el = document.getElementById('inspector-content');
  if (!el) return;

  const sketch = currentSketch();

  // Constraint creation pending
  if (state.tool === 'constraint') {
    const spec = CONSTRAINT_SPEC[state.constraintType];
    const have = state.pendingMeta.length;
    const need = spec.selects.length;
    const allSelected = have >= need;

    let html = `<div class="pending-hint">
      <strong>Adding ${state.constraintType}</strong><br>
      ${allSelected
        ? (spec.hasValue ? 'Enter value below then click Apply.' : 'Ready to apply.')
        : `Click a <strong>${spec.selects[have]}</strong> (${have}/${need})`
      }
    </div>`;

    if (allSelected && spec.hasValue) {
      html += `<div class="value-form">
        <label>${spec.valueLabel}
          <input class="insp-input" id="constraint-val-input" type="number"
                 value="${spec.defaultValue}" min="0.1" step="1">
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-apply-con">Apply</button>
          <button class="btn btn-ghost"   id="btn-cancel-con">Cancel</button>
        </div>
      </div>`;
    } else if (allSelected) {
      html += `<div class="btn-row">
        <button class="btn btn-primary" id="btn-apply-con-novalue">Apply</button>
        <button class="btn btn-ghost"   id="btn-cancel-con">Cancel</button>
      </div>`;
    } else {
      html += `<div class="btn-row">
        <button class="btn btn-ghost" id="btn-cancel-con">Cancel</button>
      </div>`;
    }

    el.innerHTML = html;

    document.getElementById('btn-cancel-con')?.addEventListener('click', cancelConstraint);
    document.getElementById('btn-apply-con')?.addEventListener('click', () => {
      const val = parseFloat(document.getElementById('constraint-val-input').value);
      if (!isNaN(val) && val > 0) finaliseConstraint(val);
    });
    document.getElementById('btn-apply-con-novalue')?.addEventListener('click', () => finaliseConstraint(null));
    return;
  }

  if (!sketch || !state.selected) {
    el.innerHTML = '<p class="inspector-empty">Nothing selected.<br>Click an entity or use the toolbar.</p>';
    return;
  }

  const { type, id } = state.selected;

  if (type === 'point') {
    const p = getPoint(sketch, id);
    if (!p) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="insp-section">
        <div class="insp-section-title">Point</div>
        <div class="insp-row"><span class="insp-key">ID</span><span class="insp-val">${p.id}</span></div>
        <div class="insp-row"><span class="insp-key">X</span>
          <input class="insp-input" id="pt-x" type="number" value="${p.x.toFixed(1)}" step="1"></div>
        <div class="insp-row"><span class="insp-key">Y</span>
          <input class="insp-input" id="pt-y" type="number" value="${p.y.toFixed(1)}" step="1"></div>
        <div class="insp-checkbox-row">
          <input type="checkbox" id="pt-fixed" ${p.fixed ? 'checked' : ''}>
          <label for="pt-fixed">Fixed (pinned)</label>
        </div>
      </div>
      <div class="insp-divider"></div>
      ${constraintListHtml(sketch, type, id)}
      <div class="btn-row">
        <button class="btn btn-danger" id="btn-delete-sel">Delete point</button>
      </div>`;
    document.getElementById('pt-x').addEventListener('change', e => {
      p.x = parseFloat(e.target.value) || p.x;
      const r = runSolver(sketch); save(); updateStatus(r); render();
    });
    document.getElementById('pt-y').addEventListener('change', e => {
      p.y = parseFloat(e.target.value) || p.y;
      const r = runSolver(sketch); save(); updateStatus(r); render();
    });
    document.getElementById('pt-fixed').addEventListener('change', e => {
      p.fixed = e.target.checked;
      const r = runSolver(sketch); save(); updateStatus(r); render();
    });
    bindConstraintListClicks(sketch);
    document.getElementById('btn-delete-sel')?.addEventListener('click', deleteSelected);
    return;
  }

  if (type === 'line') {
    const l = getLine(sketch, id);
    if (!l) { el.innerHTML = ''; return; }
    const a = getPoint(sketch, l.a), b = getPoint(sketch, l.b);
    const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y).toFixed(1) : '—';
    el.innerHTML = `
      <div class="insp-section">
        <div class="insp-section-title">Line</div>
        <div class="insp-row"><span class="insp-key">ID</span><span class="insp-val">${l.id}</span></div>
        <div class="insp-row"><span class="insp-key">From</span><span class="insp-val">${l.a}</span></div>
        <div class="insp-row"><span class="insp-key">To</span><span class="insp-val">${l.b}</span></div>
        <div class="insp-row"><span class="insp-key">Length</span><span class="insp-val">${len}px</span></div>
      </div>
      <div class="insp-divider"></div>
      ${constraintListHtml(sketch, type, id)}
      <div class="btn-row">
        <button class="btn btn-danger" id="btn-delete-sel">Delete line</button>
      </div>`;
    bindConstraintListClicks(sketch);
    document.getElementById('btn-delete-sel')?.addEventListener('click', deleteSelected);
    return;
  }

  if (type === 'circle') {
    const c = getCircle(sketch, id);
    if (!c) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="insp-section">
        <div class="insp-section-title">Circle</div>
        <div class="insp-row"><span class="insp-key">ID</span><span class="insp-val">${c.id}</span></div>
        <div class="insp-row"><span class="insp-key">Center</span><span class="insp-val">${c.c}</span></div>
        <div class="insp-row"><span class="insp-key">Radius</span>
          <input class="insp-input" id="circ-r" type="number" value="${c.r.toFixed(1)}" min="1"></div>
      </div>
      <div class="insp-divider"></div>
      ${constraintListHtml(sketch, type, id)}
      <div class="btn-row">
        <button class="btn btn-danger" id="btn-delete-sel">Delete circle</button>
      </div>`;
    document.getElementById('circ-r').addEventListener('change', e => {
      c.r = Math.max(1, parseFloat(e.target.value) || c.r);
      const r = runSolver(sketch); save(); updateStatus(r); render();
    });
    bindConstraintListClicks(sketch);
    document.getElementById('btn-delete-sel')?.addEventListener('click', deleteSelected);
    return;
  }

  if (type === 'constraint') {
    const con = getConstraint(sketch, id);
    if (!con) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="insp-section">
        <div class="insp-section-title">Constraint</div>
        <div class="insp-row"><span class="insp-key">Type</span><span class="insp-val">${con.type}</span></div>
        ${constraintParamsHtml(con)}
      </div>
      <div class="btn-row">
        <button class="btn btn-danger" id="btn-delete-sel">Delete constraint</button>
      </div>`;
    document.getElementById('btn-delete-sel')?.addEventListener('click', deleteSelected);

    // Editable value fields
    const lenInput = document.getElementById('con-len');
    if (lenInput) {
      lenInput.addEventListener('change', e => {
        con.len = parseFloat(e.target.value) || con.len;
        const r = runSolver(sketch); save(); updateStatus(r); render();
      });
    }
    const degInput = document.getElementById('con-deg');
    if (degInput) {
      degInput.addEventListener('change', e => {
        con.deg = parseFloat(e.target.value) || con.deg;
        const r = runSolver(sketch); save(); updateStatus(r); render();
      });
    }
    const rInput = document.getElementById('con-r');
    if (rInput) {
      rInput.addEventListener('change', e => {
        con.r = Math.max(1, parseFloat(e.target.value) || con.r);
        const r = runSolver(sketch); save(); updateStatus(r); render();
      });
    }
  }
}

function constraintParamsHtml(con) {
  switch (con.type) {
    case 'coincident':
      return `<div class="insp-row"><span class="insp-key">Points</span><span class="insp-val">${con.p1} · ${con.p2}</span></div>`;
    case 'distance':
      return `<div class="insp-row"><span class="insp-key">Points</span><span class="insp-val">${con.p1} · ${con.p2}</span></div>
              <div class="insp-row"><span class="insp-key">Len</span>
                <input class="insp-input" id="con-len" type="number" value="${con.len}" step="1"></div>`;
    case 'parallel':
      return `<div class="insp-row"><span class="insp-key">Lines</span><span class="insp-val">${con.l1} ∥ ${con.l2}</span></div>`;
    case 'angle':
      return `<div class="insp-row"><span class="insp-key">Lines</span><span class="insp-val">${con.l1} · ${con.l2}</span></div>
              <div class="insp-row"><span class="insp-key">Angle</span>
                <input class="insp-input" id="con-deg" type="number" value="${con.deg}" step="1"></div>`;
    case 'point-on-line':
      return `<div class="insp-row"><span class="insp-key">Point</span><span class="insp-val">${con.p}</span></div>
              <div class="insp-row"><span class="insp-key">Line</span><span class="insp-val">${con.l}</span></div>`;
    case 'radius':
      return `<div class="insp-row"><span class="insp-key">Circle</span><span class="insp-val">${con.circle}</span></div>
              <div class="insp-row"><span class="insp-key">Radius</span>
                <input class="insp-input" id="con-r" type="number" value="${con.r}" step="1"></div>`;
    default: return '';
  }
}

function constraintListHtml(sketch, entityType, entityId) {
  const related = sketch.constraints.filter(c => {
    switch (entityType) {
      case 'point':  return c.p1 === entityId || c.p2 === entityId || c.p === entityId;
      case 'line':   return c.l1 === entityId || c.l2 === entityId || c.l === entityId;
      case 'circle': return c.circle === entityId;
      default: return false;
    }
  });
  if (!related.length) return '<p class="inspector-empty">No constraints on this entity.</p>';
  const items = related.map(c => {
    const selected = state.selected?.type === 'constraint' && state.selected?.id === c.id;
    return `<div class="constraint-item ${selected ? 'selected' : ''}" data-con-id="${c.id}">
      <span class="constraint-type-tag">${c.type}</span>
      <span class="constraint-desc">${constraintShortDesc(c)}</span>
    </div>`;
  }).join('');
  return `<div class="insp-section">
    <div class="insp-section-title">Constraints (${related.length})</div>
    <div class="constraint-list">${items}</div>
  </div>`;
}

function bindConstraintListClicks(sketch) {
  document.querySelectorAll('[data-con-id]').forEach(el => {
    el.addEventListener('click', () => {
      state.selected = { type: 'constraint', id: el.dataset.conId };
      updateInspector();
      render();
    });
  });
}

function constraintShortDesc(c) {
  switch (c.type) {
    case 'coincident':   return `${c.p1} = ${c.p2}`;
    case 'distance':     return `|${c.p1}${c.p2}| = ${c.len}px`;
    case 'parallel':     return `${c.l1} ∥ ${c.l2}`;
    case 'angle':        return `${c.l1}∠${c.l2} = ${c.deg}°`;
    case 'point-on-line':return `${c.p} on ${c.l}`;
    case 'radius':       return `r(${c.circle}) = ${c.r}px`;
    default:             return c.type;
  }
}

// ── Sketch management ─────────────────────────────────────────────────────────
function createSketch(name) {
  const id = uid('sk');
  state.sketches[id] = { name, points: [], lines: [], circles: [], constraints: [] };
  return id;
}

function switchSketch(id) {
  state.currentId = id;
  state.selected  = null;
  state.pending   = [];
  state.pendingMeta = [];
  state.drag      = null;
  pushHash(id);
  save();
  const result = runSolver(currentSketch());
  updateSketchSelect();
  updateStatus(result);
  updateInspector();
  render();
}

function updateSketchSelect() {
  const sel = document.getElementById('sketch-select');
  sel.innerHTML = Object.entries(state.sketches)
    .map(([id, sk]) => `<option value="${id}" ${id === state.currentId ? 'selected' : ''}>${sk.name}</option>`)
    .join('');
}

function loadSeed(makeFn) {
  const W = canvas.width  || container.clientWidth  || 600;
  const H = canvas.height || container.clientHeight || 400;
  const id = uid('sk');
  const sketchData = makeFn(W / 2, H / 2);
  state.sketches[id] = { ...sketchData, points: sketchData.points, lines: sketchData.lines,
                          circles: sketchData.circles, constraints: sketchData.constraints };
  switchSketch(id);
}

function resetCurrentSketch() {
  const sketch = currentSketch();
  if (!sketch) return;
  // Ask for confirmation
  if (!confirm(`Reset "${sketch.name}"? All entities and constraints will be removed.`)) return;
  sketch.points = [];
  sketch.lines  = [];
  sketch.circles = [];
  sketch.constraints = [];
  state.selected = null;
  state.pending  = [];
  state.pendingMeta = [];
  state.solveResult = null;
  save();
  updateStatus(null);
  updateInspector();
  render();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  switch (e.key) {
    case 's': case 'S': setTool('select'); break;
    case 'p': case 'P': setTool('point');  break;
    case 'l': case 'L': setTool('line');   break;
    case 'c': case 'C': setTool('circle'); break;
    case 'Escape':
      state.pending = [];
      state.pendingMeta = [];
      state.selected = null;
      updateInspector();
      updateStatus(state.solveResult);
      render();
      break;
    case 'Delete':
    case 'Backspace':
      deleteSelected();
      break;
  }
});

function setTool(tool) {
  state.tool = tool;
  state.pending = [];
  state.pendingMeta = [];

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  updateStatus(state.solveResult);
  updateInspector();
  render();
}

// ── DOM wiring ────────────────────────────────────────────────────────────────
function wireDom() {
  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  // Constraint type select
  document.getElementById('constraint-type').addEventListener('change', e => {
    state.constraintType = e.target.value;
    state.pendingMeta = [];
    if (state.tool === 'constraint') {
      updateInspector();
      updateStatus(state.solveResult);
    }
  });

  // Seed sketch buttons
  document.getElementById('load-rect').addEventListener('click', () => {
    loadSeed(makeSeedRect);
  });
  document.getElementById('load-triangle').addEventListener('click', () => {
    loadSeed(makeSeedTriangle);
  });

  // Sketch select dropdown
  document.getElementById('sketch-select').addEventListener('change', e => {
    switchSketch(e.target.value);
  });

  // New sketch
  document.getElementById('btn-new-sketch').addEventListener('click', () => {
    const name = prompt('Sketch name:', 'Sketch ' + (Object.keys(state.sketches).length + 1));
    if (!name) return;
    const id = createSketch(name);
    switchSketch(id);
  });

  // Reset sketch
  document.getElementById('btn-reset-sketch').addEventListener('click', resetCurrentSketch);
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  wireDom();

  // Load persisted data or create default sketch
  let loaded = load();

  // Check hash for requested sketch
  const hashId = parseHash();
  if (hashId && state.sketches[hashId]) {
    state.currentId = hashId;
  }

  if (!loaded || Object.keys(state.sketches).length === 0) {
    // First run: create a welcome sketch with the rectangle seed
    // Use container client dimensions (available before ResizeObserver fires)
    const W = container.clientWidth  || 600;
    const H = container.clientHeight || 400;
    const id = uid('sk');
    const sketchData = makeSeedRect(W/2, H/2);
    state.sketches[id] = { ...sketchData };
    state.currentId = id;
    pushHash(id);
    save();
  } else if (!state.currentId || !state.sketches[state.currentId]) {
    state.currentId = Object.keys(state.sketches)[0];
  }

  pushHash(state.currentId);
  updateSketchSelect();

  // Run solver on load
  const sketch = currentSketch();
  if (sketch) {
    const result = runSolver(sketch);
    updateStatus(result);
  }

  updateInspector();
  render();
}

init();
