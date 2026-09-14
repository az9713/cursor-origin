/* path-studio/js/app.js — UI, canvas render, agent, storage, routing */
'use strict';

(function () {

// ── Constants ─────────────────────────────────────────────────────────────────
const COLS        = 24;
const ROWS        = 16;
const STORAGE_KEY = 'path-studio-v1';

// ── Seed maps ─────────────────────────────────────────────────────────────────
function makeCells(fn) {
  return Array.from({ length: COLS * ROWS }, (_, i) =>
    fn(i % COLS, (i / COLS) | 0)
  );
}

/** Open field: all cost-1 with a central cost-5 slow zone. */
function seedOpen() {
  return makeCells((x, y) => ({
    blocked: false,
    cost: (x >= 9 && x <= 14 && y >= 4 && y <= 11) ? 5 : 1,
  }));
}

/**
 * Corridor maze: border walls + three internal walls with gaps.
 *   H-wall y=4 : x=1..21 except x=10,11  (gap)
 *   H-wall y=11: x=2..22 except x=14,15  (gap)
 *   V-wall x=10: y=5..10 except y=7,8    (gap)
 *   V-wall x=16: y=1..10 except y=5,6    (gap)
 */
function seedMaze() {
  const cells = makeCells(() => ({ blocked: false, cost: 1 }));

  function block(x, y) {
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS)
      cells[y * COLS + x].blocked = true;
  }

  // Border
  for (let x = 0; x < COLS; x++) { block(x, 0); block(x, ROWS - 1); }
  for (let y = 1; y < ROWS - 1; y++) { block(0, y); block(COLS - 1, y); }

  // Horizontal wall y=4: gap at x=10,11
  for (let x = 1; x <= 21; x++) if (x !== 10 && x !== 11) block(x, 4);

  // Horizontal wall y=11: gap at x=14,15
  for (let x = 2; x <= 22; x++) if (x !== 14 && x !== 15) block(x, 11);

  // Vertical wall x=10: gap at y=7,8
  for (let y = 5; y <= 10; y++) if (y !== 7 && y !== 8) block(10, y);

  // Vertical wall x=16: gap at y=5,6
  for (let y = 1; y <= 10; y++) if (y !== 5 && y !== 6) block(16, y);

  return cells;
}

/**
 * Wall at x=12 (gap only at y=0) plus portal A through the wall.
 * Without the portal the path goes the long way around the top;
 * with it, A* / Dijkstra / flow field jump (11,8) ↔ (13,8).
 */
function seedPortals() {
  const cells = makeCells(() => ({ blocked: false, cost: 1 }));
  for (let y = 1; y < ROWS; y++) {
    cells[y * COLS + 12].blocked = true;
  }
  return cells;
}

const SEEDS = {
  open: {
    makeCells: seedOpen,
    start: { x: 2, y: 8 },
    goal:  { x: 21, y: 8 },
    portals: [],
  },
  maze: {
    makeCells: seedMaze,
    start: { x: 2, y: 2 },
    goal:  { x: 21, y: 13 },
    portals: [],
  },
  portals: {
    makeCells: seedPortals,
    start: { x: 2, y: 8 },
    goal:  { x: 21, y: 8 },
    portals: [{ a: { x: 11, y: 8 }, b: { x: 13, y: 8 }, letter: 'A' }],
  },
};

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  cells:       [],
  start:       { x: 2, y: 8 },
  goal:        { x: 21, y: 8 },
  algo:        'astar',
  showHeatmap: true,
  mapId:       'open',
  tool:        'blocked',
  result:      null,
  agentStep:   0,
  portals:     [],
  pendingPortal: null,
};

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('grid-canvas');
const ctx    = canvas.getContext('2d');
let cellSize = 32;

function computeCellSize() {
  const wrap = canvas.parentElement;
  const aw   = wrap.clientWidth  - 4;
  const ah   = wrap.clientHeight - 4;
  cellSize = Math.max(16, Math.min(44,
    Math.min((aw / COLS) | 0, (ah / ROWS) | 0)
  ));
  canvas.width  = COLS * cellSize;
  canvas.height = ROWS * cellSize;
}

// ── Render ────────────────────────────────────────────────────────────────────
const CELL_BLOCKED = '#2a251f';
const CELL_COST5   = '#d0c9b9';
const CELL_COST1   = '#fffdf8';
const GRID_LINE    = 'rgba(207,198,182,0.55)';
const PATH_COLOR   = '#b4451a';
const OPEN_COLOR   = 'rgba(44,120,100,0.40)';
const AGENT_COLOR  = '#ff8844';
const PORTAL_COLOR = '#2c7864';
const PORTAL_JUMP  = '#2c7864';

function heatAlpha(t) {
  // t in [0..1]: low = transparent, high = rust-tinted
  return (t * 0.62).toFixed(2);
}

function render() {
  const { cells, start, goal, result, showHeatmap, agentStep } = state;
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // ── 1. Cell base fills ────────────────────────────────────────────────────
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = cells[y * COLS + x];
      ctx.fillStyle = c.blocked ? CELL_BLOCKED
                    : c.cost >= 5 ? CELL_COST5
                    : CELL_COST1;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  // ── 2. Heatmap overlay (closed set, g-score / costTo) ────────────────────
  if (result && showHeatmap && result.closedSet.size > 0) {
    const { closedSet, gScores } = result;
    let maxG = 0;
    for (const i of closedSet) {
      if (isFinite(gScores[i]) && gScores[i] > maxG) maxG = gScores[i];
    }
    if (maxG > 0) {
      for (const i of closedSet) {
        if (!isFinite(gScores[i])) continue;
        const t = gScores[i] / maxG;
        ctx.fillStyle = `rgba(180,69,26,${heatAlpha(t)})`;
        ctx.fillRect((i % COLS) * cellSize, ((i / COLS) | 0) * cellSize, cellSize, cellSize);
      }
    }
  }

  // ── 3. Open-set frontier highlight ───────────────────────────────────────
  if (result && result.openSet.size > 0) {
    ctx.fillStyle = OPEN_COLOR;
    for (const i of result.openSet) {
      ctx.fillRect((i % COLS) * cellSize, ((i / COLS) | 0) * cellSize, cellSize, cellSize);
    }
  }

  // ── 4. Grid lines ─────────────────────────────────────────────────────────
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth   = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= COLS; x++) {
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, H);
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.moveTo(0, y * cellSize);
    ctx.lineTo(W, y * cellSize);
  }
  ctx.stroke();

  // ── 5. Path polyline (solid 4-adj; dashed portal jumps) ───────────────────
  if (result && result.pathIdx.length > 1) {
    drawPath(result.pathIdx);
  }

  // ── 6. Portal glyphs ──────────────────────────────────────────────────────
  const sg = (x, y) =>
    (x === start.x && y === start.y) || (x === goal.x && y === goal.y);
  for (const p of state.portals) {
    drawPortalGlyph(p.a.x, p.a.y, p.letter, sg(p.a.x, p.a.y));
    drawPortalGlyph(p.b.x, p.b.y, p.letter, sg(p.b.x, p.b.y));
  }

  // Pending first-click of a portal pair
  if (state.pendingPortal) {
    const { x, y } = state.pendingPortal;
    ctx.strokeStyle = PORTAL_COLOR;
    ctx.lineWidth   = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, cellSize - 4);
    ctx.setLineDash([]);
  }

  // ── 7. Start / goal markers ───────────────────────────────────────────────
  drawCircleMarker(start.x, start.y, '#2c4a3e', 'S');
  drawCircleMarker(goal.x,  goal.y,  '#b4451a', 'G');

  // ── 8. Agent dot ──────────────────────────────────────────────────────────
  if (result && result.found && result.pathIdx.length > 0) {
    const step = Math.min(agentStep, result.pathIdx.length - 1);
    const ai   = result.pathIdx[step];
    const ax   = ai % COLS, ay = (ai / COLS) | 0;
    const cx   = (ax + 0.5) * cellSize, cy = (ay + 0.5) * cellSize;
    const r    = cellSize * 0.28;

    ctx.fillStyle   = AGENT_COLOR;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }
}

function cellCenter(i) {
  return {
    x: ((i % COLS) + 0.5) * cellSize,
    y: (((i / COLS) | 0) + 0.5) * cellSize,
  };
}

function cellsAre4Adj(i, j) {
  const x1 = i % COLS, y1 = (i / COLS) | 0;
  const x2 = j % COLS, y2 = (j / COLS) | 0;
  return Math.abs(x1 - x2) + Math.abs(y1 - y2) === 1;
}

/** Same `pathIdx` as the debug list; portal jumps are dashed. */
function drawPath(path) {
  const lw = Math.max(2, cellSize * 0.17);
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';

  ctx.strokeStyle = PATH_COLOR;
  ctx.lineWidth   = lw;
  ctx.setLineDash([]);
  ctx.beginPath();
  let penDown = false;
  for (let k = 0; k < path.length; k++) {
    const c = cellCenter(path[k]);
    const nextAdj = k + 1 < path.length && cellsAre4Adj(path[k], path[k + 1]);
    if (!penDown) {
      if (nextAdj) { ctx.moveTo(c.x, c.y); penDown = true; }
    } else {
      ctx.lineTo(c.x, c.y);
      if (!nextAdj) { ctx.stroke(); ctx.beginPath(); penDown = false; }
    }
  }
  if (penDown) ctx.stroke();

  ctx.strokeStyle = PORTAL_JUMP;
  ctx.lineWidth   = Math.max(1.5, cellSize * 0.12);
  ctx.setLineDash([Math.max(3, cellSize * 0.18), Math.max(3, cellSize * 0.14)]);
  for (let k = 0; k < path.length - 1; k++) {
    if (cellsAre4Adj(path[k], path[k + 1])) continue;
    const a = cellCenter(path[k]);
    const b = cellCenter(path[k + 1]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPortalGlyph(x, y, letter, corner) {
  const cx = (x + 0.5) * cellSize;
  const cy = (y + 0.5) * cellSize;

  if (corner) {
    const bx = x * cellSize + cellSize * 0.78;
    const by = y * cellSize + cellSize * 0.22;
    ctx.fillStyle = PORTAL_COLOR;
    ctx.beginPath();
    ctx.arc(bx, by, cellSize * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle    = '#fff';
    ctx.font         = `700 ${Math.max(7, (cellSize * 0.22) | 0)}px "IBM Plex Mono",monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, bx, by);
    return;
  }

  const r = cellSize * 0.28;
  ctx.fillStyle = PORTAL_COLOR;
  ctx.beginPath();
  ctx.moveTo(cx,     cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx,     cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle    = '#fff';
  ctx.font         = `700 ${Math.max(9, (cellSize * 0.34) | 0)}px "IBM Plex Mono",monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, cy);
}

function drawCircleMarker(x, y, color, label) {
  const cx = (x + 0.5) * cellSize;
  const cy = (y + 0.5) * cellSize;
  const r  = cellSize * 0.36;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const fs = Math.max(9, (cellSize * 0.36) | 0);
  ctx.fillStyle    = '#fff';
  ctx.font         = `600 ${fs}px "IBM Plex Sans",sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

// ── Recompute pathfinding ─────────────────────────────────────────────────────
function portalPairs() {
  return state.portals
    .map(p => ({
      a: p.a.y * COLS + p.a.x,
      b: p.b.y * COLS + p.b.x,
    }))
    .filter(p => {
      const ca = state.cells[p.a], cb = state.cells[p.b];
      return ca && cb && !ca.blocked && !cb.blocked;
    });
}

function recompute() {
  const { cells, start, goal, algo } = state;
  const api = window.PSPath;
  const portals = portalPairs();

  state.agentStep = 0;

  // Guard: start or goal blocked
  const sI = start.y * COLS + start.x;
  const gI = goal.y * COLS + goal.x;
  if (cells[sI] && cells[sI].blocked) { state.result = null; return; }
  if (cells[gI] && cells[gI].blocked) { state.result = null; return; }

  if (algo === 'dijkstra') {
    state.result = api.dijkstra(cells, COLS, ROWS, start, goal, portals);
  } else if (algo === 'astar') {
    state.result = api.astar(cells, COLS, ROWS, start, goal, portals);
  } else if (algo === 'flow') {
    state.result = api.flowField(cells, COLS, ROWS, start, goal, portals);
  }

  // Show/hide "no path" badge
  const badge = document.getElementById('no-path-badge');
  if (badge) {
    badge.classList.toggle('visible', !!(state.result && !state.result.found));
  }
}

// ── Debug panel ───────────────────────────────────────────────────────────────
function updateDebug() {
  const r = state.result;

  const elOpen   = document.getElementById('stat-open');
  const elClosed = document.getElementById('stat-closed');
  const elPath   = document.getElementById('stat-path');
  const lstOpen   = document.getElementById('debug-open-list');
  const lstClosed = document.getElementById('debug-closed-list');
  const lstPath   = document.getElementById('debug-path-list');
  const elStep    = document.getElementById('agent-step-info');

  if (!r) {
    elOpen.textContent = elClosed.textContent = elPath.textContent = '—';
    lstOpen.textContent = lstClosed.textContent = lstPath.textContent = '';
    return;
  }

  elOpen.textContent   = r.openSet.size;
  elClosed.textContent = r.closedSet.size;
  elPath.textContent   = r.pathIdx.length
    ? `${r.pathIdx.length} cell${r.pathIdx.length === 1 ? '' : 's'}`
    : 'none';

  function renderSet(el, set, max = 64) {
    const arr    = [...set].slice(0, max);
    const rest   = set.size - arr.length;
    el.textContent = arr.map(i => `(${i % COLS},${(i / COLS) | 0})`).join('  ');
    if (rest > 0) el.textContent += `\n…+${rest} more`;
  }

  renderSet(lstOpen,   r.openSet,   48);
  renderSet(lstClosed, r.closedSet, 80);

  if (r.pathIdx.length) {
    lstPath.textContent = r.pathIdx.map((i, k, arr) => {
      const cell = `(${i % COLS},${(i / COLS) | 0})`;
      if (k === 0) return cell;
      const sep = cellsAre4Adj(arr[k - 1], i) ? ' → ' : ' ↷ ';
      return sep + cell;
    }).join('');
  } else {
    lstPath.textContent = r.found ? '' : 'No path found';
  }

  if (elStep) {
    const step = Math.min(state.agentStep, r.pathIdx.length - 1);
    elStep.textContent = r.found
      ? `Agent: step ${step + 1} / ${r.pathIdx.length}`
      : 'No path';
  }
}

// ── Mouse painting ────────────────────────────────────────────────────────────
let isPainting  = false;
let lastPainted = -1;

function canvasCell(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top)  * scaleY;
  const x  = (px / cellSize) | 0;
  const y  = (py / cellSize) | 0;
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
  return { x, y };
}

function findPortalAt(x, y) {
  return state.portals.find(p =>
    (p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y)
  );
}

function removePortalsAt(x, y) {
  state.portals = state.portals.filter(p =>
    !(p.a.x === x && p.a.y === y) && !(p.b.x === x && p.b.y === y)
  );
  if (state.pendingPortal && state.pendingPortal.x === x && state.pendingPortal.y === y) {
    state.pendingPortal = null;
  }
}

function nextPortalLetter() {
  const used = new Set(state.portals.map(p => p.letter));
  for (let i = 0; i < 26; i++) {
    const L = String.fromCharCode(65 + i);
    if (!used.has(L)) return L;
  }
  return String(state.portals.length + 1);
}

function updatePortalHint() {
  const el = document.getElementById('portal-hint');
  if (!el) return;
  if (state.tool !== 'portal') {
    el.textContent = '';
    return;
  }
  if (state.pendingPortal) {
    el.textContent = `Second cell for (${state.pendingPortal.x},${state.pendingPortal.y})…`;
  } else {
    el.textContent = 'Click two walkable cells to pair. Click a glyph to remove.';
  }
}

function applyPortalClick(x, y) {
  const cell = state.cells[y * COLS + x];
  if (!cell || cell.blocked) return false;

  const existing = findPortalAt(x, y);

  if (!state.pendingPortal) {
    if (existing) {
      state.portals = state.portals.filter(p => p !== existing);
      updatePortalHint();
      return true;
    }
    state.pendingPortal = { x, y };
    updatePortalHint();
    return true;
  }

  const p = state.pendingPortal;
  if (p.x === x && p.y === y) {
    state.pendingPortal = null;
    updatePortalHint();
    return true;
  }

  if (existing) {
    state.portals = state.portals.filter(pr => pr !== existing);
  }

  state.portals.push({
    a: { x: p.x, y: p.y },
    b: { x, y },
    letter: nextPortalLetter(),
  });
  state.pendingPortal = null;
  updatePortalHint();
  return true;
}

function applyTool(x, y) {
  const { tool, start, goal } = state;
  const isStart = x === start.x && y === start.y;
  const isGoal  = x === goal.x  && y === goal.y;
  const idx     = y * COLS + x;

  switch (tool) {
    case 'start':
      if (state.cells[idx] && state.cells[idx].blocked) return false; // skip blocked
      state.start = { x, y };
      return true;

    case 'goal':
      if (state.cells[idx] && state.cells[idx].blocked) return false;
      state.goal = { x, y };
      return true;

    case 'blocked':
      if (isStart || isGoal) return false;
      state.cells[idx] = { blocked: true, cost: 1 };
      removePortalsAt(x, y);
      return true;

    case 'cost1':
      if (isStart || isGoal) return false;
      state.cells[idx] = { blocked: false, cost: 1 };
      return true;

    case 'cost5':
      if (isStart || isGoal) return false;
      state.cells[idx] = { blocked: false, cost: 5 };
      return true;

    case 'erase':
      if (isStart || isGoal) return false;
      state.cells[idx] = { blocked: false, cost: 1 };
      return true;

    default:
      return false;
  }
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const pos = canvasCell(e);
  if (!pos) return;

  if (state.tool === 'portal') {
    const changed = applyPortalClick(pos.x, pos.y);
    if (changed) { recompute(); render(); updateDebug(); saveToStorage(); }
    return;
  }

  isPainting  = true;
  lastPainted = -1;
  const changed = applyTool(pos.x, pos.y);
  lastPainted = pos.y * COLS + pos.x;
  if (changed) { recompute(); render(); updateDebug(); saveToStorage(); }
}

function onMouseMove(e) {
  if (!isPainting) return;
  const pos = canvasCell(e);
  if (!pos) return;
  const idx = pos.y * COLS + pos.x;
  if (idx === lastPainted) return;
  lastPainted = idx;
  const changed = applyTool(pos.x, pos.y);
  if (changed) { recompute(); render(); updateDebug(); saveToStorage(); }
}

function onMouseUp() { isPainting = false; }

// ── Auto-step agent ───────────────────────────────────────────────────────────
let autoTimer = null;

function startAuto() {
  if (autoTimer) return;
  const btn = document.getElementById('auto-btn');
  btn.textContent = 'Stop';
  btn.classList.add('btn-active');

  autoTimer = setInterval(() => {
    const r = state.result;
    if (!r || !r.found || state.agentStep >= r.pathIdx.length - 1) {
      stopAuto();
      return;
    }
    state.agentStep++;
    render();
    updateDebug();
  }, 220);
}

function stopAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  const btn = document.getElementById('auto-btn');
  if (btn) { btn.textContent = 'Auto'; btn.classList.remove('btn-active'); }
}

// ── Seed map loading ──────────────────────────────────────────────────────────
function loadSeedMap(id) {
  const seed = SEEDS[id];
  if (!seed) return;
  stopAuto();
  state.mapId    = id;
  state.cells    = seed.makeCells();
  state.start    = { ...seed.start };
  state.goal     = { ...seed.goal };
  state.portals  = (seed.portals || []).map(p => ({
    a: { x: p.a.x, y: p.a.y },
    b: { x: p.b.x, y: p.b.y },
    letter: p.letter,
  }));
  state.pendingPortal = null;
  state.agentStep = 0;
  state.result   = null;
  history.replaceState(null, '', `#/m/${id}`);
  updatePortalHint();
}

// ── Storage ───────────────────────────────────────────────────────────────────
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cells:       state.cells.map(c => c.blocked ? 'b' : c.cost),
      start:       state.start,
      goal:        state.goal,
      algo:        state.algo,
      showHeatmap: state.showHeatmap,
      mapId:       state.mapId,
      portals:     state.portals,
    }));
  } catch (_) {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);

    if (Array.isArray(d.cells) && d.cells.length === COLS * ROWS) {
      state.cells = d.cells.map(v =>
        v === 'b' ? { blocked: true, cost: 1 } : { blocked: false, cost: +v || 1 }
      );
    } else {
      return false;
    }

    if (d.start && typeof d.start.x === 'number') state.start = d.start;
    if (d.goal  && typeof d.goal.x  === 'number') state.goal  = d.goal;
    if (d.algo  && ['dijkstra','astar','flow'].includes(d.algo)) state.algo = d.algo;
    if (typeof d.showHeatmap === 'boolean') state.showHeatmap = d.showHeatmap;
    if (d.mapId && SEEDS[d.mapId]) state.mapId = d.mapId;

    if (Array.isArray(d.portals)) {
      state.portals = d.portals.filter(p =>
        p && p.a && p.b &&
        Number.isInteger(p.a.x) && Number.isInteger(p.a.y) &&
        Number.isInteger(p.b.x) && Number.isInteger(p.b.y) &&
        p.a.x >= 0 && p.a.x < COLS && p.a.y >= 0 && p.a.y < ROWS &&
        p.b.x >= 0 && p.b.x < COLS && p.b.y >= 0 && p.b.y < ROWS &&
        typeof p.letter === 'string' && p.letter.length > 0
      ).map(p => ({
        a: { x: p.a.x, y: p.a.y },
        b: { x: p.b.x, y: p.b.y },
        letter: p.letter.slice(0, 2),
      }));
    } else {
      state.portals = [];
    }

    return true;
  } catch (_) {
    return false;
  }
}

// ── Hash routing ──────────────────────────────────────────────────────────────
function routeHash(overrideStorage) {
  const m = location.hash.match(/^#\/m\/(\w+)/);
  if (m && SEEDS[m[1]]) {
    loadSeedMap(m[1]);
    return true;
  }
  return false;
}

// ── Sync UI controls to state ─────────────────────────────────────────────────
function syncUI() {
  document.getElementById('algo-select').value        = state.algo;
  document.getElementById('heatmap-toggle').checked   = state.showHeatmap;
  document.getElementById('map-select').value         = state.mapId;

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === state.tool);
  });
  updatePortalHint();
}

// ── Event binding ─────────────────────────────────────────────────────────────
function bindEvents() {
  // Canvas paint
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // Algorithm select
  document.getElementById('algo-select').addEventListener('change', e => {
    state.algo = e.target.value;
    recompute(); render(); updateDebug(); saveToStorage();
  });

  // Heatmap toggle
  document.getElementById('heatmap-toggle').addEventListener('change', e => {
    state.showHeatmap = e.target.checked;
    render(); saveToStorage();
  });

  // Map select
  document.getElementById('map-select').addEventListener('change', e => {
    loadSeedMap(e.target.value);
    syncUI(); recompute(); render(); updateDebug(); saveToStorage();
  });

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tool = btn.dataset.tool;
      state.pendingPortal = null;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updatePortalHint();
      render();
    });
  });

  // Reset map
  document.getElementById('reset-btn').addEventListener('click', () => {
    loadSeedMap(state.mapId);
    syncUI(); recompute(); render(); updateDebug(); saveToStorage();
  });

  // Step agent
  document.getElementById('step-btn').addEventListener('click', () => {
    const r = state.result;
    if (!r || !r.found) return;
    if (state.agentStep < r.pathIdx.length - 1) {
      state.agentStep++;
      render(); updateDebug();
    }
  });

  // Auto step
  document.getElementById('auto-btn').addEventListener('click', () => {
    if (autoTimer) stopAuto(); else startAuto();
  });

  // Reset agent
  document.getElementById('reset-agent-btn').addEventListener('click', () => {
    stopAuto();
    state.agentStep = 0;
    render(); updateDebug();
  });

  // Resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { computeCellSize(); render(); }, 80);
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.pendingPortal) {
      state.pendingPortal = null;
      updatePortalHint();
      render();
    }
  });

  // Hash change (browser back/forward)
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#\/m\/(\w+)/);
    if (m && SEEDS[m[1]] && m[1] !== state.mapId) {
      loadSeedMap(m[1]);
      syncUI(); recompute(); render(); updateDebug();
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
function init() {
  // 1. Try hash first (shareable links take priority)
  const hashedMap = routeHash();

  // 2. If no hash, try storage
  if (!hashedMap) {
    const loaded = loadFromStorage();
    if (!loaded) {
      // 3. First visit: load default seed
      loadSeedMap('open');
    }
  }

  // 4. Wire up UI
  bindEvents();
  syncUI();

  // 5. Size canvas and draw
  computeCellSize();
  recompute();
  render();
  updateDebug();
}

document.addEventListener('DOMContentLoaded', init);

})();
