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

const SEEDS = {
  open: { makeCells: seedOpen, start: { x: 2,  y: 8  }, goal: { x: 21, y: 8  } },
  maze: { makeCells: seedMaze, start: { x: 2,  y: 2  }, goal: { x: 21, y: 13 } },
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

  // ── 5. Path polyline ──────────────────────────────────────────────────────
  if (result && result.pathIdx.length > 1) {
    const lw = Math.max(2, cellSize * 0.17);
    ctx.strokeStyle = PATH_COLOR;
    ctx.lineWidth   = lw;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    const p0 = result.pathIdx[0];
    ctx.moveTo((p0 % COLS + 0.5) * cellSize, (((p0 / COLS) | 0) + 0.5) * cellSize);
    for (let k = 1; k < result.pathIdx.length; k++) {
      const p = result.pathIdx[k];
      ctx.lineTo((p % COLS + 0.5) * cellSize, (((p / COLS) | 0) + 0.5) * cellSize);
    }
    ctx.stroke();
  }

  // ── 6. Start / goal markers ───────────────────────────────────────────────
  drawCircleMarker(start.x, start.y, '#2c4a3e', 'S');
  drawCircleMarker(goal.x,  goal.y,  '#b4451a', 'G');

  // ── 7. Agent dot ──────────────────────────────────────────────────────────
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
function recompute() {
  const { cells, start, goal, algo } = state;
  const api = window.PSPath;

  state.agentStep = 0;

  // Guard: start or goal blocked
  const sI = goal.y * COLS + goal.x;  // typo-safe: check both
  const gI = start.y * COLS + start.x;
  if (cells[sI] && cells[sI].blocked) { state.result = null; return; }
  if (cells[gI] && cells[gI].blocked) { state.result = null; return; }

  if (algo === 'dijkstra') {
    state.result = api.dijkstra(cells, COLS, ROWS, start, goal);
  } else if (algo === 'astar') {
    state.result = api.astar(cells, COLS, ROWS, start, goal);
  } else if (algo === 'flow') {
    state.result = api.flowField(cells, COLS, ROWS, start, goal);
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
    lstPath.textContent = r.pathIdx
      .map(i => `(${i % COLS},${(i / COLS) | 0})`)
      .join(' → ');
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
  isPainting  = true;
  lastPainted = -1;
  const pos = canvasCell(e);
  if (!pos) return;
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
  state.agentStep = 0;
  state.result   = null;
  history.replaceState(null, '', `#/m/${id}`);
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
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
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
