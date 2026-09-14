'use strict';

/* ═══════════════════════════════════════════════════════════════════
   app.js — Motion Editor   Session A
   ═══════════════════════════════════════════════════════════════════ */

// ─── Constants ───────────────────────────────────────────────────────────────

const LS_KEY     = 'motion-editor-v1';
const STAGE_W    = 380;
const STAGE_H    = 260;
const TL_LBL_W   = 100;   // left label column width in timeline
const TL_ROW_H   = 42;    // height of each node row
const TL_RULER_H = 22;    // time-ruler height
const TL_KF_R    = 6;     // half-size of keyframe diamond

// ─── Seed clip ───────────────────────────────────────────────────────────────

const DEFAULT_CLIP = {
  durationMs: 2000,
  fps: 60,
  nodes: [
    {
      id: 'node-box',
      label: 'Box',
      x: 30, y: 30, w: 70, h: 70,
      fill: '#b4451a',
      track: [
        { t: 0.00, x: 30,  y: 30,  ease: 'easeOut'    },
        { t: 0.50, x: 270, y: 30,  ease: 'easeInOut'  },
        { t: 1.00, x: 270, y: 155, ease: 'linear'     },
      ],
    },
    {
      id: 'node-label',
      label: 'Label',
      x: 40, y: 160, w: 120, h: 34,
      fill: '#2a251f',
      track: [
        { t: 0.00, x: 40,  y: 160, ease: 'linear'     },
        { t: 0.40, x: 150, y: 90,  ease: 'easeIn'     },
        { t: 1.00, x: 40,  y: 38,  ease: 'easeInOut'  },
      ],
    },
  ],
};

// ─── State ────────────────────────────────────────────────────────────────────

let clip;                 // current clip (mutable)
let playhead      = 0;   // 0..1
let playing       = false;
let selectedNodeId  = null;
let selectedKfIdx   = null;  // index in sorted track array
let rafId           = null;
let lastTs          = null;
let tlDragging      = false;

// ─── Persistence ──────────────────────────────────────────────────────────────

function isValidClip(c) {
  return !!(c && typeof c === 'object'
    && typeof c.durationMs === 'number' && c.durationMs > 0
    && Array.isArray(c.nodes)
    && c.nodes.every(n => n && Array.isArray(n.track)));
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidClip(parsed)) return parsed;
  } catch (_) { /* ignore */ }
  return null;
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(clip));
  } catch (_) { /* quota or private mode — keep working in memory */ }
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// ─── Contrast helper ─────────────────────────────────────────────────────────

function contrastColor(hex) {
  // Returns light or dark text color based on fill luminance
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#2a251f' : '#ebe4d6';
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const stageEl       = document.getElementById('stage');
const nodeListEl    = document.getElementById('nodeListItems');
const playBtn       = document.getElementById('playBtn');
const timeDisplay   = document.getElementById('timeDisplay');
const scrubRange    = document.getElementById('scrubRange');
const resetBtn      = document.getElementById('resetBtn');
const exportBtn     = document.getElementById('exportBtn');
const importFile    = document.getElementById('importFile');
const addKfBtn      = document.getElementById('addKfBtn');
const delKfBtn      = document.getElementById('delKfBtn');
const easeSelect    = document.getElementById('easeSelect');
const kfInfoEl      = document.getElementById('kfInfo');
const tlCanvas      = document.getElementById('timeline');
const tlCtx         = tlCanvas.getContext('2d');

// ─── Stage ────────────────────────────────────────────────────────────────────

/** Build or rebuild all node <div>s inside the stage. */
function buildStageNodes() {
  stageEl.innerHTML = '';
  for (const node of clip.nodes) {
    const el = document.createElement('div');
    el.className = 'stage-node';
    el.dataset.id = node.id;
    el.style.cssText = [
      `width:${node.w}px`,
      `height:${node.h}px`,
      `background:${node.fill}`,
      `color:${contrastColor(node.fill)}`,
    ].join(';');
    el.textContent = node.label;
    el.addEventListener('click', () => selectNode(node.id));
    stageEl.appendChild(el);
  }
}

/** Move all node divs to their sample() position. No CSS transitions. */
function renderStage() {
  for (const node of clip.nodes) {
    const el = stageEl.querySelector(`[data-id="${node.id}"]`);
    if (!el) continue;
    const pos = sample(node, playhead);
    el.style.left = pos.x + 'px';
    el.style.top  = pos.y + 'px';
    el.classList.toggle('selected', node.id === selectedNodeId);
  }
}

// ─── Node list (side panel) ───────────────────────────────────────────────────

function renderNodeList() {
  nodeListEl.innerHTML = '';
  for (const node of clip.nodes) {
    const item = document.createElement('div');
    item.className = 'node-item' + (node.id === selectedNodeId ? ' selected' : '');

    const swatch = document.createElement('span');
    swatch.className = 'node-swatch';
    swatch.style.background = node.fill;

    const nameEl = document.createElement('span');
    nameEl.textContent = node.label;

    item.append(swatch, nameEl);
    item.addEventListener('click', () => selectNode(node.id));
    nodeListEl.appendChild(item);
  }
}

// ─── Keyframe panel ───────────────────────────────────────────────────────────

function renderKfPanel() {
  const node = clip.nodes.find(n => n.id === selectedNodeId);
  const kfs  = node ? node.track.slice().sort((a, b) => a.t - b.t) : [];
  const kf   = (selectedKfIdx !== null) ? kfs[selectedKfIdx] : null;

  if (!kf) {
    kfInfoEl.textContent   = 'No keyframe selected';
    easeSelect.disabled    = true;
    delKfBtn.disabled      = true;
    return;
  }

  easeSelect.disabled   = false;
  easeSelect.value      = kf.ease;
  delKfBtn.disabled     = false;

  const ms = Math.round(kf.t * clip.durationMs);
  kfInfoEl.textContent = `t ${kf.t.toFixed(3)}  (${ms} ms)  x ${Math.round(kf.x)}  y ${Math.round(kf.y)}`;
}

// ─── Selection ────────────────────────────────────────────────────────────────

function selectNode(id) {
  selectedNodeId = id;
  selectedKfIdx  = null;
  refresh();
}

function selectKf(nodeId, sortedKfIdx) {
  // Also jump playhead to this keyframe's time
  selectedNodeId = nodeId;
  selectedKfIdx  = sortedKfIdx;
  const node = clip.nodes.find(n => n.id === nodeId);
  if (node) {
    const kf = node.track.slice().sort((a, b) => a.t - b.t)[sortedKfIdx];
    if (kf) setPlayhead(kf.t, false);  // false = don't recurse refresh
  }
  refresh();
}

/** Full re-render of all reactive UI. */
function refresh() {
  renderNodeList();
  renderStage();
  renderKfPanel();
  drawTimeline();
}

// ─── Timeline: sizing & drawing ──────────────────────────────────────────────

function resizeTimeline() {
  const w = tlCanvas.parentElement.clientWidth || 800;
  const h = TL_RULER_H + clip.nodes.length * TL_ROW_H;
  tlCanvas.width  = w;
  tlCanvas.height = h;
  tlCanvas.style.height = h + 'px';
}

/** Map normalised time t (0..1) to canvas x inside track area. */
function tlX(t) {
  return TL_LBL_W + t * (tlCanvas.width - TL_LBL_W);
}

/** Map canvas x to normalised time (clamped 0..1). */
function tlT(x) {
  return Math.max(0, Math.min(1, (x - TL_LBL_W) / (tlCanvas.width - TL_LBL_W)));
}

function drawTimeline() {
  const W      = tlCanvas.width;
  const H      = tlCanvas.height;
  const TRACK  = W - TL_LBL_W;
  const ctx    = tlCtx;

  ctx.clearRect(0, 0, W, H);

  // ── Background ──
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, W, H);

  // ── Label column ──
  ctx.fillStyle = '#ebe4d6';
  ctx.fillRect(0, 0, TL_LBL_W, H);

  // ── Time ruler ──
  ctx.fillStyle = '#d8d0c4';
  ctx.fillRect(TL_LBL_W, 0, TRACK, TL_RULER_H);

  ctx.font      = '9px IBM Plex Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i <= 10; i++) {
    const x  = TL_LBL_W + i * (TRACK / 10);
    const ms = Math.round(i * clip.durationMs / 10);
    ctx.fillStyle = '#8b7d6b';
    ctx.fillRect(x, TL_RULER_H - 5, 1, 5);
    if (i % 2 === 0) {
      ctx.fillText(ms + 'ms', x, 3);
    }
  }

  // ── Node rows ──
  for (let ni = 0; ni < clip.nodes.length; ni++) {
    const node = clip.nodes[ni];
    const rowY = TL_RULER_H + ni * TL_ROW_H;
    const midY = rowY + TL_ROW_H / 2;
    const isActiveNode = node.id === selectedNodeId;

    // Row background
    ctx.fillStyle = ni % 2 === 0 ? '#fffdf8' : '#f5f0e8';
    ctx.fillRect(TL_LBL_W, rowY, TRACK, TL_ROW_H);

    // Row divider
    ctx.strokeStyle = '#ddd5c8';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, rowY + TL_ROW_H);
    ctx.lineTo(W, rowY + TL_ROW_H);
    ctx.stroke();

    // Node color swatch in label column
    ctx.fillStyle = node.fill;
    ctx.fillRect(TL_LBL_W - 18, midY - 7, 11, 11);

    // Node label text
    ctx.fillStyle    = isActiveNode ? '#b4451a' : '#2a251f';
    ctx.font         = `${isActiveNode ? '600' : '400'} 12px IBM Plex Sans, system-ui, sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, 10, midY);

    // Track line
    ctx.strokeStyle = '#cdc5bb';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(TL_LBL_W, midY);
    ctx.lineTo(W, midY);
    ctx.stroke();

    // Keyframe diamonds
    const kfs = node.track.slice().sort((a, b) => a.t - b.t);
    for (let ki = 0; ki < kfs.length; ki++) {
      const kf         = kfs[ki];
      const kx         = tlX(kf.t);
      const isSelKf    = isActiveNode && ki === selectedKfIdx;

      ctx.save();
      ctx.translate(kx, midY);
      ctx.rotate(Math.PI / 4);

      if (isSelKf) {
        ctx.shadowColor = '#b4451a';
        ctx.shadowBlur  = 8;
      }

      ctx.fillStyle   = isSelKf ? '#b4451a'
                      : isActiveNode ? '#c4715a'
                      : '#9a8e82';
      ctx.strokeStyle = isSelKf ? '#7a2e0e' : '#7a6e64';
      ctx.lineWidth   = 1;
      ctx.fillRect(-TL_KF_R, -TL_KF_R, TL_KF_R * 2, TL_KF_R * 2);
      ctx.strokeRect(-TL_KF_R, -TL_KF_R, TL_KF_R * 2, TL_KF_R * 2);
      ctx.restore();
    }
  }

  // ── Label/track column divider ──
  ctx.strokeStyle = '#c4bbb0';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(TL_LBL_W, 0);
  ctx.lineTo(TL_LBL_W, H);
  ctx.stroke();

  // ── Playhead ──
  const phX = tlX(playhead);
  ctx.strokeStyle = '#b4451a';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(phX, 0);
  ctx.lineTo(phX, H);
  ctx.stroke();

  // Playhead grip triangle at top
  ctx.fillStyle = '#b4451a';
  ctx.beginPath();
  ctx.moveTo(phX - 5, 0);
  ctx.lineTo(phX + 5, 0);
  ctx.lineTo(phX,     9);
  ctx.closePath();
  ctx.fill();
}

// ─── Timeline interaction ─────────────────────────────────────────────────────

/** Returns {nodeId, kfIdx} if (mx,my) is near a keyframe diamond, else null. */
function tlHitKf(mx, my) {
  const HIT = TL_KF_R + 4;
  for (let ni = 0; ni < clip.nodes.length; ni++) {
    const node  = clip.nodes[ni];
    const rowY  = TL_RULER_H + ni * TL_ROW_H;
    const midY  = rowY + TL_ROW_H / 2;
    if (my < rowY || my > rowY + TL_ROW_H) continue;

    const kfs = node.track.slice().sort((a, b) => a.t - b.t);
    for (let ki = 0; ki < kfs.length; ki++) {
      const kx = tlX(kfs[ki].t);
      if (Math.abs(mx - kx) < HIT && Math.abs(my - midY) < HIT) {
        return { nodeId: node.id, kfIdx: ki };
      }
    }
  }
  return null;
}

function tlOnMouseDown(e) {
  const rect = tlCanvas.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  const my   = e.clientY - rect.top;

  if (mx < TL_LBL_W) {
    // Clicking the label column selects that node
    const ni = Math.floor((my - TL_RULER_H) / TL_ROW_H);
    if (ni >= 0 && ni < clip.nodes.length) {
      selectNode(clip.nodes[ni].id);
    }
    return;
  }

  // Try keyframe hit test first
  const hit = tlHitKf(mx, my);
  if (hit) {
    selectKf(hit.nodeId, hit.kfIdx);
    return;
  }

  // Otherwise scrub
  tlDragging = true;
  setPlayhead(tlT(mx));
}

function tlOnMouseMove(e) {
  if (!tlDragging) return;
  const rect = tlCanvas.getBoundingClientRect();
  setPlayhead(tlT(e.clientX - rect.left));
}

function tlOnMouseUp() {
  tlDragging = false;
}

// ─── Playhead ─────────────────────────────────────────────────────────────────

/**
 * Set the playhead to p (0..1) and update all dependent UI.
 * @param {number}  p          - Normalised time
 * @param {boolean} [doRefresh=true] - Whether to call refresh()
 */
function setPlayhead(p, doRefresh = true) {
  playhead = Math.max(0, Math.min(1, p));
  // Sync scrub range
  scrubRange.value = Math.round(playhead * 1000);
  // Update time display
  const ms = Math.round(playhead * clip.durationMs);
  timeDisplay.textContent = (ms / 1000).toFixed(3) + ' s';
  // Update URL hash
  history.replaceState(null, '', '#/t/' + ms);
  if (doRefresh) {
    renderStage();
    drawTimeline();
    renderKfPanel(); // kf info shows live x/y
  }
}

// ─── Playback ─────────────────────────────────────────────────────────────────

function startPlay() {
  if (playing) return;
  playing = true;
  lastTs  = null;
  playBtn.textContent = '⏸';
  rafId = requestAnimationFrame(tick);
}

function stopPlay() {
  if (!playing) return;
  playing = false;
  playBtn.textContent = '▶';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  lastTs = null;
}

function tick(ts) {
  if (!playing) return;
  if (lastTs !== null) {
    const dp = (ts - lastTs) / clip.durationMs;
    let p = playhead + dp;
    if (p > 1) p = 0;   // loop
    setPlayhead(p);
  }
  lastTs = ts;
  rafId  = requestAnimationFrame(tick);
}

// ─── Keyframe operations ──────────────────────────────────────────────────────

function addKeyframe() {
  if (!selectedNodeId) return;
  const node = clip.nodes.find(n => n.id === selectedNodeId);
  if (!node) return;

  // Round to 3 decimal places to keep t values clean
  const t = Math.round(playhead * 1000) / 1000;

  // Reject if a keyframe already exists within 2 ms tolerance
  const duplicate = node.track.some(k => Math.abs(k.t - t) < 0.002);
  if (duplicate) {
    kfInfoEl.textContent = '⚠ Keyframe already exists at this time';
    return;
  }

  const pos = sample(node, playhead);
  node.track.push({ t, x: Math.round(pos.x), y: Math.round(pos.y), ease: easeSelect.value });
  node.track.sort((a, b) => a.t - b.t);

  // Select the newly added keyframe
  selectedKfIdx = node.track.findIndex(k => Math.abs(k.t - t) < 0.002);

  persist();
  refresh();
}

function deleteKeyframe() {
  if (!selectedNodeId || selectedKfIdx === null) return;
  const node = clip.nodes.find(n => n.id === selectedNodeId);
  if (!node) return;

  const kfs = node.track.slice().sort((a, b) => a.t - b.t);
  const kf  = kfs[selectedKfIdx];
  if (!kf) return;

  // Remove by reference
  const idx = node.track.indexOf(kf);
  if (idx >= 0) node.track.splice(idx, 1);

  selectedKfIdx = null;
  persist();
  refresh();
}

function applyEaseChange() {
  if (!selectedNodeId || selectedKfIdx === null) return;
  const node = clip.nodes.find(n => n.id === selectedNodeId);
  if (!node) return;

  const kfs = node.track.slice().sort((a, b) => a.t - b.t);
  const kf  = kfs[selectedKfIdx];
  if (!kf) return;

  kf.ease = easeSelect.value;  // kf is a reference into node.track
  persist();
  renderStage();    // easing change affects position immediately
  renderKfPanel();
  // No need to redraw canvas (diamonds don't encode ease visually in Session A)
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function exportJSON() {
  const json  = JSON.stringify(clip, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = 'motion-clip.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.nodes || !Array.isArray(data.nodes)) throw new Error('Missing nodes array');
      if (!data.durationMs) data.durationMs = 2000;
      if (!data.fps)        data.fps        = 60;
      // Ensure every keyframe has the required fields
      for (const node of data.nodes) {
        node.track = (node.track || []).map(k => ({
          t: +k.t || 0,
          x: +k.x || 0,
          y: +k.y || 0,
          ease: k.ease || 'linear',
        }));
      }
      clip           = data;
      playhead       = 0;
      selectedNodeId = null;
      selectedKfIdx  = null;
      persist();
      fullInit();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function resetToDefault() {
  if (!confirm('Reset to the default clip? Unsaved work will be lost.')) return;
  stopPlay();
  clip           = deepClone(DEFAULT_CLIP);
  playhead       = 0;
  selectedNodeId = null;
  selectedKfIdx  = null;
  persist();
  fullInit();
}

// ─── Hash restore ─────────────────────────────────────────────────────────────

function applyHashPlayhead() {
  const m = location.hash.match(/^#\/t\/(\d+)$/);
  if (m) {
    const ms = parseInt(m[1], 10);
    setPlayhead(ms / clip.durationMs);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/** Full initialisation — called on page load and after reset/import. */
function fullInit() {
  buildStageNodes();
  renderNodeList();
  renderKfPanel();
  resizeTimeline();
  drawTimeline();
  setPlayhead(playhead, false);
  renderStage();
}

// ─── Event listeners ─────────────────────────────────────────────────────────

playBtn.addEventListener('click', () => {
  if (playing) stopPlay(); else startPlay();
});

scrubRange.addEventListener('input', () => {
  stopPlay();
  setPlayhead(parseInt(scrubRange.value, 10) / 1000);
});

resetBtn.addEventListener('click', resetToDefault);
exportBtn.addEventListener('click', exportJSON);

importFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) { importJSON(file); e.target.value = ''; }
});

addKfBtn.addEventListener('click', addKeyframe);
delKfBtn.addEventListener('click', deleteKeyframe);
easeSelect.addEventListener('change', applyEaseChange);

tlCanvas.addEventListener('mousedown', tlOnMouseDown);
window.addEventListener('mousemove', tlOnMouseMove);
window.addEventListener('mouseup',   tlOnMouseUp);

window.addEventListener('resize', () => {
  resizeTimeline();
  drawTimeline();
});

// Keyboard: Space = play/pause
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (playing) stopPlay(); else startPlay();
  }
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────

clip = loadFromStorage() || deepClone(DEFAULT_CLIP);
fullInit();
applyHashPlayhead();
window.addEventListener('hashchange', applyHashPlayhead);
