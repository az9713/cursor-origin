'use strict';
// ── Circuit Lab — Session A ───────────────────────────────────────────────────

// ── ctx.roundRect polyfill ───────────────────────────────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y, x + w, y + r, r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x, y + h, x, y + h - r, r);
    this.lineTo(x, y + r);
    this.arcTo(x, y, x + r, y, r);
    this.closePath();
  };
}

// ── Seeds ─────────────────────────────────────────────────────────────────────
const SEEDS = {
  'xor': {
    id: 'xor',
    name: 'XOR from gates',
    hdl: [
      '# XOR built from AND / OR / NOT',
      'a   = IN 0',
      'b   = IN 1',
      'ab  = AND a b',
      'aob = OR  a b',
      'nab = NOT ab',
      'q   = AND aob nab',
      'y   = OUT q'
    ].join('\n')
  },
  'dff-reg': {
    id: 'dff-reg',
    name: '1-bit register',
    hdl: [
      '# 1-bit rising-edge D register',
      '# Toggle d then Step to latch',
      'd = IN 0',
      'q = DFF d',
      'y = OUT q'
    ].join('\n')
  }
};

const STORAGE_KEY = 'circuit-lab-v1';

// ── Gate geometry ─────────────────────────────────────────────────────────────
const GW = { IN: 76, OUT: 80, DFF: 84, DEFAULT: 80 };
const GH = { IN: 30, OUT: 30, DFF: 58, DEFAULT: 44 };
const PORT_HIT = 10;  // click radius for ports

function gateW(op) { return GW[op] ?? GW.DEFAULT; }
function gateH(op) { return GH[op] ?? GH.DEFAULT; }

function inputCount(op) {
  if (op === 'IN')  return 0;
  if (op === 'OUT' || op === 'NOT' || op === 'DFF') return 1;
  return 2;
}

function outputPort(x, y, op) {
  if (op === 'OUT') return null;
  return { x: x + gateW(op), y: y + gateH(op) / 2 };
}

function inputPorts(x, y, op) {
  const n = inputCount(op);
  const h = gateH(op);
  const w = gateW(op);
  if (n === 0) return [];
  if (n === 1) return [{ x, y: y + h / 2 }];
  return [
    { x, y: y + h / 3 },
    { x, y: y + 2 * h / 3 }
  ];
}

// ── Auto-layout ───────────────────────────────────────────────────────────────
function autoLayout(stmts) {
  const depthOf = Object.create(null);
  const visiting = new Set();

  function depth(name) {
    if (depthOf[name] !== undefined) return depthOf[name];
    if (visiting.has(name)) return 0;            // cycle guard
    visiting.add(name);
    const s = stmts.find(x => x.out === name);
    if (!s || s.op === 'IN') { visiting.delete(name); return (depthOf[name] = 0); }
    if (s.op === 'DFF')      { visiting.delete(name); return (depthOf[name] = 1); }
    const ad = s.args.filter(a => typeof a === 'string').map(a => depth(a));
    visiting.delete(name);
    return (depthOf[name] = 1 + (ad.length ? Math.max(...ad) : 0));
  }
  for (const s of stmts) depth(s.out);

  // Group by depth column
  const cols = {};
  for (const s of stmts) {
    const d = depthOf[s.out] ?? 0;
    (cols[d] = cols[d] || []).push(s);
  }

  const layout = {};
  const COL_W = 148, ROW_H = 80, PAD_X = 50, PAD_Y = 54;
  const depths = Object.keys(cols).map(Number).sort((a, b) => a - b);

  for (const d of depths) {
    const group = cols[d];
    for (let i = 0; i < group.length; i++) {
      layout[group[i].out] = { x: PAD_X + d * COL_W, y: PAD_Y + i * ROW_H };
    }
  }
  return layout;
}

/** Keep existing positions; auto-place new stmts; remove orphaned entries. */
function mergeLayout(stmts, existing) {
  const missing = stmts.filter(s => !existing[s.out]);
  let layout = { ...existing };

  if (missing.length) {
    const full = autoLayout(stmts);
    for (const s of missing) layout[s.out] = full[s.out] || { x: 200, y: 200 };
  }
  // Remove orphaned positions
  const names = new Set(stmts.map(s => s.out));
  for (const k of Object.keys(layout)) {
    if (!names.has(k)) delete layout[k];
  }
  return layout;
}

// ── Name generator ────────────────────────────────────────────────────────────
function genName(op, stmts) {
  const pfx = { IN:'in', OUT:'out', NOT:'not', AND:'and', OR:'or',
                XOR:'xor', NAND:'nand', NOR:'nor', DFF:'dff' }[op] ?? op.toLowerCase();
  const taken = new Set(stmts.map(s => s.out));
  let i = 1;
  while (taken.has(pfx + i)) i++;
  return pfx + i;
}

// ── App state ─────────────────────────────────────────────────────────────────
const state = {
  circuitId: 'xor',
  stmts:     [],
  layout:    {},
  sim:       null,

  // UI
  tool:        'select',   // 'select' | 'wire' | 'place:<OP>'
  wireSource:  null,       // stmt we're wiring from
  selected:    null,       // out-name of selected gate
  mousePos:    null,       // current canvas mouse position

  // Clock
  running:    false,
  runTimer:   null,
  clockCycle: 0,

  // Error
  parseErrors: [],
  settleError: null
};

// Drag micro-state (not in main state to avoid stale closure issues)
const drag = { active: false, out: null, offX: 0, offY: 0, didMove: false };

// Suppress HDL textarea input event when we're programmatically setting it
let suppressHDL = false;

// ── Storage ───────────────────────────────────────────────────────────────────
function loadStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveStorage(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
}
function saveCircuit() {
  const db = loadStorage();
  db[state.circuitId] = { hdl: hdlEl.value, layout: state.layout };
  saveStorage(db);
}

// ── Simulator helpers ─────────────────────────────────────────────────────────
function rebuildSim(preserveInputs = true) {
  const old = state.sim ? state.sim.snapshot() : {};
  state.sim = new Simulator(state.stmts);
  if (preserveInputs) {
    for (const s of state.stmts) {
      if (s.op === 'IN' && old[s.out] !== undefined)
        state.sim.setInput(s.out, old[s.out]);
    }
  }
  const res = state.sim.settle();
  state.settleError = res.error || null;
}

// ── HDL ↔ canvas sync ─────────────────────────────────────────────────────────
function updateHDLFromStmts() {
  suppressHDL = true;
  hdlEl.value = printHDL(state.stmts);
  suppressHDL = false;
}

function onHDLChange() {
  if (suppressHDL) return;
  const { stmts, errors } = parseHDL(hdlEl.value);
  state.stmts      = stmts;
  state.parseErrors = errors;
  state.layout     = mergeLayout(stmts, state.layout);
  rebuildSim();
  renderAll();
  saveCircuit();
}

// ── Gate operations ───────────────────────────────────────────────────────────
function placeGate(op, x, y) {
  const name = genName(op, state.stmts);
  let args;
  if (op === 'IN')                                   args = [state.stmts.filter(s => s.op === 'IN').length];
  else if (op === 'OUT' || HDL_UNARY.has(op))        args = ['_'];
  else                                               args = ['_', '_'];

  const stmt = { out: name, op, args };
  state.stmts  = [...state.stmts, stmt];
  state.layout[name] = {
    x: Math.max(4, x - gateW(op) / 2),
    y: Math.max(4, y - gateH(op) / 2)
  };
  rebuildSim();
  updateHDLFromStmts();
  renderAll();
  saveCircuit();
}

function wireGates(srcOut, dstStmt, portIdx) {
  state.stmts = state.stmts.map(s => {
    if (s.out !== dstStmt.out) return s;
    const a = [...s.args];
    a[portIdx] = srcOut;
    return { ...s, args: a };
  });
  rebuildSim();
  updateHDLFromStmts();
  renderAll();
  saveCircuit();
}

function deleteGate(out) {
  state.stmts  = state.stmts.filter(s => s.out !== out);
  delete state.layout[out];
  state.selected = null;
  rebuildSim();
  updateHDLFromStmts();
  renderAll();
  saveCircuit();
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function stepClock() {
  if (!state.sim) return;
  const res = state.sim.tick();
  state.settleError = res.error || null;
  state.clockCycle++;
  renderAll();
}

function startRun() {
  if (state.running) return;
  state.running = true;
  runBtn.textContent = '⏹ Stop';
  runBtn.classList.add('running');
  state.runTimer = setInterval(() => {
    stepClock();
  }, 500);
}
function stopRun() {
  if (!state.running) return;
  state.running = false;
  clearInterval(state.runTimer);
  runBtn.textContent = '▶ Run';
  runBtn.classList.remove('running');
}

// ── Circuit switching & reset ─────────────────────────────────────────────────
function switchCircuit(id) {
  stopRun();
  state.circuitId  = id;
  state.selected   = null;
  state.wireSource = null;
  state.tool       = 'select';
  state.clockCycle = 0;
  state.mousePos   = null;

  const db   = loadStorage();
  const data = db[id] || { hdl: SEEDS[id].hdl, layout: null };

  suppressHDL = true;
  hdlEl.value = data.hdl;
  suppressHDL = false;

  const { stmts, errors } = parseHDL(data.hdl);
  state.stmts       = stmts;
  state.parseErrors  = errors;
  state.layout      = data.layout ? mergeLayout(stmts, data.layout) : autoLayout(stmts);

  rebuildSim(false);
  updateToolUI();
  renderAll();

  history.replaceState(null, '', `#/c/${id}`);
  circSel.value = id;
}

function resetCircuit() {
  if (!confirm(`Reset "${SEEDS[state.circuitId]?.name}" to seed?`)) return;
  stopRun();
  const seedHDL = SEEDS[state.circuitId].hdl;

  suppressHDL = true;
  hdlEl.value = seedHDL;
  suppressHDL = false;

  const { stmts } = parseHDL(seedHDL);
  state.stmts       = stmts;
  state.parseErrors  = [];
  state.layout      = autoLayout(stmts);
  state.clockCycle  = 0;

  rebuildSim(false);

  const db = loadStorage();
  db[state.circuitId] = { hdl: seedHDL, layout: state.layout };
  saveStorage(db);

  renderAll();
}

// ── Canvas drawing ─────────────────────────────────────────────────────────────
function drawGrid(ctx, w, h) {
  ctx.fillStyle = 'rgba(42,37,31,0.07)';
  const S = 24;
  for (let x = S; x < w; x += S)
    for (let y = S; y < h; y += S) {
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
}

function drawGate(ctx, s, x, y, vals, isSelected, isWireSrc) {
  const w = gateW(s.op), h = gateH(s.op);
  const v = vals[s.out] ?? 0;

  ctx.save();

  // Shadow for selected
  if (isSelected) {
    ctx.shadowColor = 'rgba(180,69,26,0.25)';
    ctx.shadowBlur  = 8;
  }

  // Gate body
  ctx.fillStyle   = isSelected ? '#f5ead8' : '#fffdf8';
  ctx.strokeStyle = (isSelected || isWireSrc) ? '#b4451a' : '#2a251f';
  ctx.lineWidth   = (isSelected || isWireSrc) ? 2 : 1.5;
  ctx.beginPath();

  if (s.op === 'OUT') {
    ctx.roundRect(x, y, w, h, h / 2);
  } else {
    ctx.roundRect(x, y, w, h, 5);
  }
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  if (s.op === 'IN') {
    // Variable name on left
    ctx.fillStyle = '#2a251f';
    ctx.font      = '11px IBM Plex Mono';
    ctx.textAlign = 'left';
    ctx.fillText(s.out, x + 7, y + h / 2);
    // LED indicator
    const led = { x: x + w - 13, y: y + h / 2 };
    ctx.beginPath();
    ctx.arc(led.x, led.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = v ? '#b4451a' : '#cec5b3';
    ctx.fill();
    ctx.strokeStyle = '#2a251f'; ctx.lineWidth = 1;
    ctx.stroke();
    // Value text inside LED
    ctx.fillStyle = v ? '#fff' : '#6e6257';
    ctx.font      = 'bold 8px IBM Plex Mono';
    ctx.textAlign = 'center';
    ctx.fillText(v, led.x, led.y);

  } else if (s.op === 'OUT') {
    // LED on left
    const led = { x: x + 13, y: y + h / 2 };
    ctx.beginPath();
    ctx.arc(led.x, led.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = v ? '#b4451a' : '#cec5b3';
    ctx.fill();
    ctx.strokeStyle = '#2a251f'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = v ? '#fff' : '#6e6257';
    ctx.font      = 'bold 8px IBM Plex Mono';
    ctx.textAlign = 'center';
    ctx.fillText(v, led.x, led.y);
    // Name
    ctx.fillStyle = '#2a251f';
    ctx.font      = '11px IBM Plex Mono';
    ctx.textAlign = 'left';
    ctx.fillText(s.out, x + 26, y + h / 2);

  } else if (s.op === 'DFF') {
    ctx.fillStyle = '#2a251f';
    ctx.font      = 'bold 12px IBM Plex Mono';
    ctx.fillText('DFF', x + w / 2, y + h / 2 - 8);
    ctx.font      = '9px IBM Plex Mono';
    ctx.fillStyle = '#6e6257';
    ctx.fillText(s.out, x + w / 2, y + h / 2 + 8);
    // Port labels
    ctx.textAlign = 'left';  ctx.fillText('D', x + 5, y + h / 2);
    ctx.textAlign = 'right'; ctx.fillText('Q', x + w - 5, y + h / 2);
    // Clock indicator (small triangle at bottom)
    ctx.fillStyle = '#6e6257';
    const bx = x + w / 2, by = y + h - 6;
    ctx.beginPath();
    ctx.moveTo(bx - 5, by); ctx.lineTo(bx + 5, by); ctx.lineTo(bx, by - 6);
    ctx.closePath(); ctx.fill();

  } else {
    ctx.fillStyle = '#2a251f';
    ctx.font      = 'bold 12px IBM Plex Mono';
    ctx.fillText(s.op, x + w / 2, y + h / 2 - 6);
    ctx.font      = '9px IBM Plex Mono';
    ctx.fillStyle = '#6e6257';
    ctx.fillText(s.out, x + w / 2, y + h / 2 + 8);
  }

  ctx.restore();

  // Input port circles
  for (const p of inputPorts(x, y, s.op)) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#fffdf8';
    ctx.strokeStyle = '#2a251f';
    ctx.lineWidth   = 1.5;
    ctx.fill(); ctx.stroke();
  }
  // Output port dot
  const op = outputPort(x, y, s.op);
  if (op) {
    ctx.beginPath();
    ctx.arc(op.x, op.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = v ? '#b4451a' : '#2a251f';
    ctx.fill();
  }
}

function renderCanvas() {
  const canvas = document.getElementById('schematic');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ebe4d6';
  ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);

  if (!state.stmts.length) {
    ctx.fillStyle = '#6e6257';
    ctx.font      = '13px IBM Plex Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Empty circuit — type HDL or use the palette', W / 2, H / 2);
    return;
  }

  const vals = state.sim ? state.sim.snapshot() : {};

  // ── Wires (behind gates) ──────────────────────────────────────────────────
  for (const s of state.stmts) {
    const dPos = state.layout[s.out]; if (!dPos) continue;
    const iPts = inputPorts(dPos.x, dPos.y, s.op);

    for (let i = 0; i < s.args.length; i++) {
      const arg = s.args[i];
      if (typeof arg !== 'string') continue;
      const src = state.stmts.find(x => x.out === arg);
      if (!src) continue;
      const sPos = state.layout[src.out]; if (!sPos) continue;
      const sPort = outputPort(sPos.x, sPos.y, src.op);
      const dPort = iPts[i];
      if (!sPort || !dPort) continue;

      const v = vals[arg] ?? 0;
      ctx.save();
      ctx.strokeStyle = v ? 'rgba(180,69,26,0.85)' : 'rgba(110,98,87,0.7)';
      ctx.lineWidth   = v ? 2.2 : 1.8;
      ctx.beginPath();
      ctx.moveTo(sPort.x, sPort.y);
      const mx = (sPort.x + dPort.x) / 2;
      ctx.bezierCurveTo(mx, sPort.y, mx, dPort.y, dPort.x, dPort.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Wire preview ──────────────────────────────────────────────────────────
  if (state.wireSource && state.mousePos) {
    const sPos = state.layout[state.wireSource.out];
    if (sPos) {
      const sPort = outputPort(sPos.x, sPos.y, state.wireSource.op);
      if (sPort) {
        ctx.save();
        ctx.strokeStyle = 'rgba(180,69,26,0.55)';
        ctx.lineWidth   = 1.8;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(sPort.x, sPort.y);
        ctx.lineTo(state.mousePos.x, state.mousePos.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ── Gates ─────────────────────────────────────────────────────────────────
  for (const s of state.stmts) {
    const pos = state.layout[s.out]; if (!pos) continue;
    drawGate(ctx, s, pos.x, pos.y, vals,
      s.out === state.selected,
      state.wireSource && s.out === state.wireSource.out);
  }
}

// ── Hit testing ───────────────────────────────────────────────────────────────
function hitTest(mx, my) {
  for (const s of state.stmts) {
    const pos = state.layout[s.out]; if (!pos) continue;

    const op2 = outputPort(pos.x, pos.y, s.op);
    if (op2 && Math.hypot(mx - op2.x, my - op2.y) < PORT_HIT)
      return { kind: 'outPort', stmt: s };

    const ips = inputPorts(pos.x, pos.y, s.op);
    for (let i = 0; i < ips.length; i++) {
      if (Math.hypot(mx - ips[i].x, my - ips[i].y) < PORT_HIT)
        return { kind: 'inPort', stmt: s, portIdx: i };
    }

    const w = gateW(s.op), h = gateH(s.op);
    if (mx >= pos.x && mx <= pos.x + w && my >= pos.y && my <= pos.y + h)
      return { kind: 'gate', stmt: s };
  }
  return { kind: 'canvas', x: mx, y: my };
}

// ── Canvas events ─────────────────────────────────────────────────────────────
function canvasXY(e) {
  const r = schematic.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function handleCanvasClick(x, y) {
  if (drag.didMove) return;

  const hit = hitTest(x, y);

  // ── place mode ─────────────────────────────────────────────────────────────
  if (state.tool.startsWith('place:')) {
    const op = state.tool.slice(6);
    placeGate(op, x, y);
    state.tool = 'select';
    updateToolUI();
    return;
  }

  // ── wire mode ──────────────────────────────────────────────────────────────
  if (state.tool === 'wire') {
    if (hit.kind === 'inPort' && state.wireSource) {
      wireGates(state.wireSource.out, hit.stmt, hit.portIdx);
    } else if (hit.kind === 'outPort') {
      state.wireSource = hit.stmt;
      renderCanvas();
      return;
    }
    // cancel wire
    state.wireSource = null;
    state.tool       = 'select';
    updateToolUI();
    renderCanvas();
    return;
  }

  // ── select mode ────────────────────────────────────────────────────────────
  if (hit.kind === 'outPort') {
    state.wireSource = hit.stmt;
    state.tool       = 'wire';
    updateToolUI();
    renderCanvas();

  } else if (hit.kind === 'gate') {
    if (hit.stmt.op === 'IN') {
      // Toggle input
      const cur = state.sim ? (state.sim.values[hit.stmt.out] ?? 0) : 0;
      if (state.sim) {
        state.sim.setInput(hit.stmt.out, cur ^ 1);
        const res = state.sim.settle();
        state.settleError = res.error || null;
      }
      state.selected = hit.stmt.out;
    } else {
      state.selected = (state.selected === hit.stmt.out) ? null : hit.stmt.out;
    }
    renderAll();

  } else if (hit.kind === 'inPort') {
    // Nothing in select mode

  } else {
    state.selected = null;
    renderCanvas();
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderErrors() {
  const el = document.getElementById('hdl-errors');
  if (state.parseErrors.length) {
    el.style.display = 'block';
    el.textContent   = state.parseErrors.map(e => `Line ${e.lineNum}: ${e.msg}`).join('\n');
  } else if (state.settleError) {
    el.style.display = 'block';
    el.textContent   = '⚠ ' + state.settleError;
  } else {
    el.style.display = 'none';
  }

  const pill = document.getElementById('err-pill');
  const errCount = state.parseErrors.length + (state.settleError ? 1 : 0);
  if (errCount) {
    pill.hidden      = false;
    pill.textContent = errCount + (errCount === 1 ? ' error' : ' errors');
  } else {
    pill.hidden = true;
  }

  const rt = document.getElementById('roundtrip-pill');
  const ok = !state.parseErrors.length && checkRoundtrip(state.stmts);
  rt.textContent = ok ? 'roundtrip ok' : 'roundtrip fail';
  rt.className = 'rt-pill ' + (ok ? 'ok' : 'fail');
}

function renderTruthTable() {
  const wrap = document.getElementById('tt-wrap');
  if (!state.sim) { wrap.innerHTML = ''; return; }

  const tt = state.sim.truthTable();
  if (!tt) {
    const msg = state.sim.hasDFF()
      ? 'Sequential circuit — use Step / Run to clock'
      : state.stmts.filter(s => s.op === 'IN').length > 8
        ? 'Too many inputs (> 8)'
        : 'No inputs defined';
    wrap.innerHTML = `<p class="tt-msg">${msg}</p>`;
    return;
  }
  if (!tt.outNames.length) {
    wrap.innerHTML = '<p class="tt-msg">No probes (OUT) defined</p>';
    return;
  }

  const curIns = tt.inNames.map(n => state.sim.values[n] ?? 0);

  const inH  = tt.inNames.map(n  => `<th class="th-in">${n}</th>`).join('');
  const outH = tt.outNames.map(n => `<th class="th-out">${n}</th>`).join('');

  const rows = tt.rows.map(row => {
    const isCur = row.ins.every((v, i) => v === curIns[i]);
    const cells = [
      ...row.ins.map(v  => `<td class="${v ? 'one' : ''}">${v}</td>`),
      ...row.outs.map(v => `<td class="out-col${v ? ' one' : ''}">${v}</td>`)
    ].join('');
    return `<tr class="${isCur ? 'cur' : ''}">${cells}</tr>`;
  }).join('');

  wrap.innerHTML =
    `<table class="tt"><thead><tr>${inH}<th class="th-sep"></th>${outH}</tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
}

function renderStatus() {
  const el = document.getElementById('clock-lbl');
  if (state.sim && state.sim.hasDFF()) {
    el.textContent = `T = ${state.clockCycle}`;
  } else {
    el.textContent = '';
  }
}

function renderAll() {
  renderCanvas();
  renderErrors();
  renderTruthTable();
  renderStatus();
}

// ── Tool UI ───────────────────────────────────────────────────────────────────
function updateToolUI() {
  for (const btn of document.querySelectorAll('.palette [data-op]')) {
    btn.classList.toggle('active', state.tool === `place:${btn.dataset.op}`);
  }
  updateCanvasHint();
}

function updateCanvasHint() {
  const el = document.getElementById('canvas-hint');
  if (state.tool === 'wire') {
    el.textContent = 'Click an input port (○) to connect · Esc to cancel';
  } else if (state.tool.startsWith('place:')) {
    el.textContent = `Click canvas to place ${state.tool.slice(6)} · Esc to cancel`;
  } else if (state.selected) {
    el.textContent = `${state.selected} selected · Del to delete · Drag to move`;
  } else {
    el.textContent = 'Click output port (●) to wire · Click IN gate to toggle · Drag to move';
  }
}

// ── Canvas resize ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  const panel = document.querySelector('.canvas-wrap');
  schematic.width  = panel.clientWidth;
  schematic.height = panel.clientHeight;
  renderCanvas();
}

// ── Hash routing ──────────────────────────────────────────────────────────────
function handleHashNav() {
  const m  = location.hash.match(/^#\/c\/([A-Za-z0-9_-]+)/);
  const id = (m && SEEDS[m[1]]) ? m[1] : 'xor';
  if (id !== state.circuitId || !state.sim) switchCircuit(id);
  circSel.value = id;
}

// ── DOM refs (set in init) ────────────────────────────────────────────────────
let schematic, hdlEl, runBtn, circSel;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  schematic = document.getElementById('schematic');
  hdlEl     = document.getElementById('hdl');
  runBtn    = document.getElementById('run-btn');
  circSel   = document.getElementById('circuit-sel');

  // ── Canvas mouse events ───────────────────────────────────────────────────
  schematic.addEventListener('mousedown', e => {
    const { x, y } = canvasXY(e);
    drag.didMove   = false;
    drag.active    = false;

    const hit = hitTest(x, y);
    if (hit.kind === 'gate' && state.tool === 'select') {
      drag.active = true;
      drag.out    = hit.stmt.out;
      const pos   = state.layout[hit.stmt.out];
      drag.offX   = x - pos.x;
      drag.offY   = y - pos.y;
    }
  });

  schematic.addEventListener('mousemove', e => {
    const { x, y } = canvasXY(e);
    state.mousePos = { x, y };

    // Update cursor
    const hit = hitTest(x, y);
    if (state.tool.startsWith('place:'))   schematic.style.cursor = 'crosshair';
    else if (hit.kind === 'outPort')       schematic.style.cursor = 'crosshair';
    else if (hit.kind === 'inPort')        schematic.style.cursor = state.tool === 'wire' ? 'pointer' : 'default';
    else if (hit.kind === 'gate')          schematic.style.cursor = drag.active ? 'grabbing' : 'grab';
    else                                   schematic.style.cursor = 'default';

    if (drag.active && drag.out) {
      const nx = Math.max(0, x - drag.offX);
      const ny = Math.max(0, y - drag.offY);
      state.layout[drag.out] = { x: nx, y: ny };
      drag.didMove = true;
    }
    renderCanvas();
  });

  schematic.addEventListener('mouseup', e => {
    if (drag.active && drag.didMove) saveCircuit();
    drag.active = false;
    drag.out    = null;
  });

  schematic.addEventListener('mouseleave', () => {
    state.mousePos = null;
    if (drag.active && drag.didMove) saveCircuit();
    drag.active = false;
    renderCanvas();
  });

  schematic.addEventListener('click', e => {
    const { x, y } = canvasXY(e);
    handleCanvasClick(x, y);
  });

  // ── HDL textarea ──────────────────────────────────────────────────────────
  hdlEl.addEventListener('input', onHDLChange);

  // ── Palette buttons ───────────────────────────────────────────────────────
  for (const btn of document.querySelectorAll('.palette [data-op]')) {
    btn.addEventListener('click', () => {
      const op      = btn.dataset.op;
      const placing = `place:${op}`;
      state.tool    = (state.tool === placing) ? 'select' : placing;
      if (state.tool !== 'wire') state.wireSource = null;
      updateToolUI();
      renderCanvas();
    });
  }

  // ── Header buttons ────────────────────────────────────────────────────────
  document.getElementById('step-btn').addEventListener('click', () => {
    stepClock();
    if (!state.sim.hasDFF()) {
      // For pure combinational, show a pulse on the hint
      const el = document.getElementById('canvas-hint');
      el.textContent = 'Settled ✓';
      setTimeout(updateCanvasHint, 800);
    }
  });

  runBtn.addEventListener('click', () => {
    state.running ? stopRun() : startRun();
  });

  document.getElementById('reset-btn').addEventListener('click', resetCircuit);

  circSel.addEventListener('change', e => {
    const id = e.target.value;
    if (id && SEEDS[id]) switchCircuit(id);
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (document.activeElement === hdlEl) return;   // don't steal from editor

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      deleteGate(state.selected);
    }
    if (e.key === 'Escape') {
      state.wireSource = null;
      state.tool       = 'select';
      state.selected   = null;
      updateToolUI();
      renderCanvas();
    }
  });

  // ── Hash navigation ───────────────────────────────────────────────────────
  window.addEventListener('hashchange', handleHashNav);

  // ── Resize ────────────────────────────────────────────────────────────────
  window.addEventListener('resize', resizeCanvas);

  // ── Boot ──────────────────────────────────────────────────────────────────
  resizeCanvas();
  handleHashNav();
  updateToolUI();
});
