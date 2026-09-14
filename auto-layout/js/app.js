/**
 * Auto-layout Playground — Session C
 * Manages state, SVG canvas rendering, inspector panel, and fixture routing.
 */

import { solve } from './solver.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'auto-layout-v1';
const CANVAS_PAD  = 32; // extra whitespace around root in SVG viewBox

// Depth fill colours (parent drawn first so children appear on top)
const DEPTH_FILL = ['#cdc6bc', '#ddd7ce', '#eae4d8', '#f3ede4'];

// ─── Golden fixture values (±1 px tolerance check) ───────────────────────────

const GOLDEN = {
  'row-hug': {
    root:  { x:   0, y:  0, w: 348, h:  92 },
    a:     { x:  16, y: 16, w:  80, h:  60 },
    b:     { x: 104, y: 16, w: 120, h:  60 },
    c:     { x: 232, y: 16, w: 100, h:  60 },
  },
  'col-fill': {
    root:   { x:  0, y:   0, w: 480, h: 400 },
    header: { x: 16, y:  16, w: 448, h:  48 },
    body:   { x: 16, y:  72, w: 448, h: 264 },
    footer: { x: 16, y: 344, w: 448, h:  40 },
  },
  'wrap': {
    root:     { x:   0, y:  0, w: 480, h: 300 },
    'item-0': { x:  12, y: 12, w: 100, h:  60 },
    'item-1': { x: 120, y: 12, w: 100, h:  60 },
    'item-2': { x: 228, y: 12, w: 100, h:  60 },
    'item-3': { x: 336, y: 12, w: 100, h:  60 },
    'item-4': { x:  12, y: 80, w: 100, h:  60 },
    'item-5': { x: 120, y: 80, w: 100, h:  60 },
    'item-6': { x: 228, y: 80, w: 100, h:  60 },
    'item-7': { x: 336, y: 80, w: 100, h:  60 },
  },
  // Session C — abs-overlay golden
  // root:   fixed 400×300, col, pad=16, gap=8, align:stretch
  // photo:  flow fill×fixed h:160  → x=16,y=16,  w=368,h=160
  // footer: flow fill×fixed h:56   → x=16,y=184, w=368,h=56
  // badge:  absolute absX=8,absY=8 → x=24,y=24,  w=72, h=28
  'abs-overlay': {
    root:   { x:  0, y:   0, w: 400, h: 300 },
    photo:  { x: 16, y:  16, w: 368, h: 160 },
    footer: { x: 16, y: 184, w: 368, h:  56 },
    badge:  { x: 24, y:  24, w:  72, h:  28 },
  },
};

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentFixture: 'row-hug',
  selectedId:     null,
  trees:          {},  // { [fixtureId]: rootNode }
};

// ─── Default fixture trees ────────────────────────────────────────────────────

function makeNode(fields) {
  return {
    direction: 'row', wrap: false,
    sizingX: 'fixed', sizingY: 'fixed',
    w: 0, h: 0, padding: 0, gap: 0,
    justify: 'start', align: 'start',
    position: 'flow', absX: 0, absY: 0, // Session C
    children: [],
    ...fields,
  };
}

function defaultFixtures() {
  return {
    'row-hug': makeNode({
      id: 'root', name: 'Row Hug',
      direction: 'row', sizingX: 'hug', sizingY: 'hug',
      padding: 16, gap: 8,
      children: [
        makeNode({ id: 'a', name: 'Alpha',  w:  80, h: 60 }),
        makeNode({ id: 'b', name: 'Beta',   w: 120, h: 60 }),
        makeNode({ id: 'c', name: 'Gamma',  w: 100, h: 60 }),
      ],
    }),

    'col-fill': makeNode({
      id: 'root', name: 'Col Fill Frame',
      direction: 'col', sizingX: 'fixed', sizingY: 'fixed',
      w: 480, h: 400, padding: 16, gap: 8,
      children: [
        makeNode({ id: 'header', name: 'Header', sizingX: 'fill', sizingY: 'fixed', h: 48 }),
        makeNode({ id: 'body',   name: 'Body',   sizingX: 'fill', sizingY: 'fill'        }),
        makeNode({ id: 'footer', name: 'Footer', sizingX: 'fill', sizingY: 'fixed', h: 40 }),
      ],
    }),

    'wrap': makeNode({
      id: 'root', name: 'Wrap Frame',
      direction: 'row', wrap: true,
      sizingX: 'fixed', sizingY: 'fixed',
      w: 480, h: 300, padding: 12, gap: 8,
      children: Array.from({ length: 8 }, (_, i) =>
        makeNode({ id: `item-${i}`, name: `Item ${i + 1}`, w: 100, h: 60 })
      ),
    }),

    // Session C — absolute-inside-auto-layout demo
    // A card frame (col) with two flow children + one absolute badge overlay
    'abs-overlay': makeNode({
      id: 'root', name: 'Abs Overlay',
      direction: 'col', sizingX: 'fixed', sizingY: 'fixed',
      w: 400, h: 300, padding: 16, gap: 8, align: 'stretch',
      children: [
        makeNode({ id: 'photo',  name: 'Photo',  sizingX: 'fill', sizingY: 'fixed', h: 160 }),
        makeNode({ id: 'footer', name: 'Footer', sizingX: 'fill', sizingY: 'fixed', h:  56 }),
        makeNode({ id: 'badge',  name: 'Badge',  sizingX: 'fixed', sizingY: 'fixed',
                   w: 72, h: 28, position: 'absolute', absX: 8, absY: 8 }),
      ],
    }),
  };
}

// ─── Tree utilities ───────────────────────────────────────────────────────────

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function walkTree(node, fn) {
  fn(node);
  for (const c of node.children || []) walkTree(c, fn);
}

function findById(root, id) {
  let found = null;
  walkTree(root, n => { if (n.id === id) found = n; });
  return found;
}

function findParent(root, childId) {
  let parent = null;
  walkTree(root, n => {
    if ((n.children || []).some(c => c.id === childId)) parent = n;
  });
  return parent;
}

function nextId() {
  return 'n' + Date.now().toString(36);
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentFixture: state.currentFixture,
      trees: state.trees,
    }));
  } catch (_) {}
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ─── Hash routing ─────────────────────────────────────────────────────────────

function hashFixture() {
  const m = location.hash.match(/^#\/f\/(.+)/);
  return m ? m[1] : null;
}

function setHash(id) {
  history.replaceState(null, '', `#/f/${id}`);
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

function collectNodes(node, depth = 0) {
  const out = [{ node, depth }];
  // Session C: flow children before absolute children so absolutes render on top
  const ch = node.children || [];
  const flow = ch.filter(c => (c.position || 'flow') !== 'absolute');
  const abs  = ch.filter(c => (c.position || 'flow') === 'absolute');
  for (const c of [...flow, ...abs]) out.push(...collectNodes(c, depth + 1));
  return out;
}

function depthFill(d) {
  return DEPTH_FILL[Math.min(d, DEPTH_FILL.length - 1)];
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCanvas() {
  const svg  = document.getElementById('canvas');
  const root = state.trees[state.currentFixture];

  const vW = root._w + CANVAS_PAD * 2;
  const vH = root._h + CANVAS_PAD * 2;
  svg.setAttribute('viewBox', `${-CANVAS_PAD} ${-CANVAS_PAD} ${vW} ${vH}`);
  svg.setAttribute('width',  vW);
  svg.setAttribute('height', vH);

  const items = collectNodes(root);
  const sel   = state.selectedId;

  let markup = `<rect x="${-CANVAS_PAD}" y="${-CANVAS_PAD}" width="${vW}" height="${vH}" fill="#fffdf8" rx="4"/>`;

  for (const { node: n, depth } of items) {
    const isSelected = n.id === sel;
    const isAbsolute = (n.position || 'flow') === 'absolute';
    const fill   = depthFill(depth);
    const stroke = isSelected ? '#b4451a' : '#2a251f';
    const sw     = isSelected ? 2 : 1;
    // Session C: dashed stroke marks absolute-positioned nodes
    const dash   = isAbsolute ? ' stroke-dasharray="5 3"' : '';

    markup += `<rect
      x="${n._x}" y="${n._y}" width="${Math.max(1, n._w)}" height="${Math.max(1, n._h)}"
      fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="3"${dash}
      data-id="${escAttr(n.id)}" class="nr"/>`;

    // Label — only if enough room
    if (n._w > 22 && n._h > 14) {
      const labelX = n._x + 5;
      const labelY = n._y + 12;
      markup += `<text
        x="${labelX}" y="${labelY}"
        font-family="IBM Plex Mono, monospace" font-size="10"
        fill="${isSelected ? '#b4451a' : '#2a251f'}"
        style="pointer-events:none;user-select:none">${escAttr(n.name)}</text>`;
    }
  }

  svg.innerHTML = markup;
}

// ─── Inspector rendering ──────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sel(val, opt) { return val === opt ? 'selected' : ''; }

function renderInspector() {
  const panel = document.getElementById('inspector');
  const root  = state.trees[state.currentFixture];
  const node  = state.selectedId ? findById(root, state.selectedId) : null;

  if (!node) {
    panel.innerHTML = `
      <div class="inspector-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="3"  y="3"  width="7" height="7" rx="1"/>
          <rect x="14" y="3"  width="7" height="7" rx="1"/>
          <rect x="3"  y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <p>Select a node</p>
      </div>`;
    return;
  }

  const isRoot    = node.id === root.id;
  const parent    = findParent(root, node.id);
  const isAbsNode = (node.position || 'flow') === 'absolute'; // Session C
  // Absolute children are exempt from the fill-in-hug restriction
  const blockFillX = !isAbsNode && !!(parent && parent.sizingX === 'hug');
  const blockFillY = !isAbsNode && !!(parent && parent.sizingY === 'hug');
  const hasFW  = node.sizingX === 'fixed';
  const hasFH  = node.sizingY === 'fixed';

  panel.innerHTML = `
    <div class="inspector-inner">
      <div class="inspector-header">Inspector</div>
      <div class="inspector-scroll">

        <div class="inspector-section">Identity</div>
        <div class="field-row">
          <label>Name</label>
          <input id="f-name" type="text" value="${esc(node.name)}">
        </div>

        <div class="inspector-section">Layout</div>
        <div class="field-row">
          <label>Direction</label>
          <select id="f-dir">
            <option value="row" ${sel(node.direction,'row')}>Row</option>
            <option value="col" ${sel(node.direction,'col')}>Column</option>
          </select>
        </div>
        <div class="field-row">
          <label>Wrap</label>
          <input id="f-wrap" type="checkbox" ${node.wrap ? 'checked' : ''}>
        </div>
        <div class="field-row">
          <label>Padding</label>
          <input id="f-pad" type="number" min="0" max="400" value="${node.padding}">
        </div>
        <div class="field-row">
          <label>Gap</label>
          <input id="f-gap" type="number" min="0" max="200" value="${node.gap}">
        </div>
        <div class="field-row">
          <label>Justify</label>
          <select id="f-just">
            <option value="start"         ${sel(node.justify,'start')}>Start</option>
            <option value="center"        ${sel(node.justify,'center')}>Center</option>
            <option value="end"           ${sel(node.justify,'end')}>End</option>
            <option value="space-between" ${sel(node.justify,'space-between')}>Space Between</option>
            <option value="space-around"  ${sel(node.justify,'space-around')}>Space Around</option>
          </select>
        </div>
        <div class="field-row">
          <label>Align</label>
          <select id="f-algn">
            <option value="start"   ${sel(node.align,'start')}>Start</option>
            <option value="center"  ${sel(node.align,'center')}>Center</option>
            <option value="end"     ${sel(node.align,'end')}>End</option>
            <option value="stretch" ${sel(node.align,'stretch')}>Stretch</option>
          </select>
        </div>

        <div class="inspector-section">Position</div>
        <div class="field-row">
          <label>Mode</label>
          <select id="f-pos">
            <option value="flow"     ${sel(node.position||'flow','flow')}>Flow</option>
            <option value="absolute" ${sel(node.position||'flow','absolute')}>Absolute</option>
          </select>
        </div>
        ${isAbsNode ? `
        <div class="field-row">
          <label>Abs X</label>
          <input id="f-absx" type="number" min="-9999" max="9999" value="${node.absX || 0}">
        </div>
        <div class="field-row">
          <label>Abs Y</label>
          <input id="f-absy" type="number" min="-9999" max="9999" value="${node.absY || 0}">
        </div>` : ''}

        <div class="inspector-section">Sizing</div>
        <div class="field-row">
          <label>Width</label>
          <select id="f-sx">
            <option value="hug"   ${sel(node.sizingX,'hug')}>Hug</option>
            <option value="fill"  ${sel(node.sizingX,'fill')} ${blockFillX ? 'disabled' : ''}>Fill</option>
            <option value="fixed" ${sel(node.sizingX,'fixed')}>Fixed</option>
          </select>
          ${hasFW ? `<input id="f-w" type="number" min="1" max="2000" value="${node.w}" style="width:56px;flex:none">` : ''}
        </div>
        <div class="field-row">
          <label>Height</label>
          <select id="f-sy">
            <option value="hug"   ${sel(node.sizingY,'hug')}>Hug</option>
            <option value="fill"  ${sel(node.sizingY,'fill')} ${blockFillY ? 'disabled' : ''}>Fill</option>
            <option value="fixed" ${sel(node.sizingY,'fixed')}>Fixed</option>
          </select>
          ${hasFH ? `<input id="f-h" type="number" min="1" max="2000" value="${node.h}" style="width:56px;flex:none">` : ''}
        </div>

        <div class="computed-box">
          <span class="computed-lbl">Computed</span>
          <code>${fmt(node._x)},${fmt(node._y)} &nbsp; ${fmt(node._w)} × ${fmt(node._h)}</code>
        </div>

      </div>
      <div class="inspector-actions">
        <button class="btn btn-add" id="btn-add">+ Child</button>
        ${!isRoot ? `<button class="btn btn-del" id="btn-del">Delete</button>` : ''}
      </div>
    </div>`;

  // ── Bind events ──────────────────────────────────────────────────────────────

  function on(id, prop, parse) {
    const el = document.getElementById(id);
    if (!el) return;
    const ev = el.type === 'checkbox' ? 'change' : 'change';
    el.addEventListener(ev, () => {
      const raw = el.type === 'checkbox' ? el.checked : el.value;
      node[prop] = parse ? parse(raw) : raw;
      saveAndRender();
    });
  }

  on('f-name', 'name');
  on('f-dir',  'direction');
  on('f-wrap', 'wrap', v => Boolean(v));
  on('f-pad',  'padding', v => Math.max(0, parseInt(v, 10) || 0));
  on('f-gap',  'gap',     v => Math.max(0, parseInt(v, 10) || 0));
  on('f-just', 'justify');
  on('f-algn', 'align');
  on('f-pos',  'position'); // Session C
  on('f-absx', 'absX', v => parseInt(v, 10) || 0); // Session C
  on('f-absy', 'absY', v => parseInt(v, 10) || 0); // Session C
  on('f-sx',   'sizingX');
  on('f-sy',   'sizingY');
  on('f-w',    'w', v => Math.max(1, parseInt(v, 10) || 1));
  on('f-h',    'h', v => Math.max(1, parseInt(v, 10) || 1));

  document.getElementById('btn-add')?.addEventListener('click', () => {
    const id = nextId();
    node.children.push(makeNode({ id, name: 'Box', w: 80, h: 60 }));
    state.selectedId = id;
    saveAndRender();
  });

  document.getElementById('btn-del')?.addEventListener('click', () => {
    const parent = findParent(root, node.id);
    if (parent) {
      parent.children = parent.children.filter(c => c.id !== node.id);
      state.selectedId = null;
      saveAndRender();
    }
  });
}

function fmt(v) {
  return v !== undefined ? Math.round(v) : '?';
}

// ─── Status line ──────────────────────────────────────────────────────────────

function updateStatus() {
  const el     = document.getElementById('status-line');
  const golden = GOLDEN[state.currentFixture];

  if (!golden) { el.textContent = ''; return; }

  let checked = 0, bad = 0;
  walkTree(state.trees[state.currentFixture], n => {
    const g = golden[n.id];
    if (!g) return;
    checked++;
    if (Math.abs(n._x - g.x) > 1 || Math.abs(n._y - g.y) > 1 ||
        Math.abs(n._w - g.w) > 1 || Math.abs(n._h - g.h) > 1) {
      bad++;
    }
  });

  if (bad === 0 && checked > 0) {
    el.textContent  = `✓ golden (${checked} nodes)`;
    el.className    = 'status-line ok';
  } else {
    el.textContent  = `✗ ${bad}/${checked} nodes differ`;
    el.className    = 'status-line fail';
  }
}

// ─── Fixture switcher ─────────────────────────────────────────────────────────

function switchFixture(id) {
  if (!state.trees[id]) return;
  state.currentFixture = id;
  state.selectedId     = null;
  setHash(id);
  saveState();
  renderAll();
}

// ─── Render pipeline ──────────────────────────────────────────────────────────

function saveAndRender() {
  saveState();
  renderAll();
}

function coerceFillInHug(node, parent) {
  // Session C: absolute children are exempt — their fill resolves against parent inner box
  const isAbs = (node.position || 'flow') === 'absolute';
  if (parent && !isAbs) {
    if (parent.sizingX === 'hug' && node.sizingX === 'fill') node.sizingX = 'hug';
    if (parent.sizingY === 'hug' && node.sizingY === 'fill') node.sizingY = 'hug';
  }
  for (const c of node.children || []) coerceFillInHug(c, node);
}

function renderAll() {
  // Update toolbar buttons
  document.querySelectorAll('.fixture-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fixture === state.currentFixture);
  });

  // Fill inside Hug collapses to 0×0 — treat as Hug
  coerceFillInHug(state.trees[state.currentFixture], null);

  // Solve
  solve(state.trees[state.currentFixture]);

  // Render
  renderCanvas();
  renderInspector();
  updateStatus();
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function init() {
  const defaults = defaultFixtures();
  const saved    = loadSaved();

  // Merge saved trees with defaults (use saved if available and valid)
  for (const id of ['row-hug', 'col-fill', 'wrap', 'abs-overlay']) {
    state.trees[id] = (saved?.trees?.[id]) ? saved.trees[id] : deepClone(defaults[id]);
  }

  // Determine initial fixture from hash → saved → default
  const fromHash = hashFixture();
  state.currentFixture =
    (fromHash && state.trees[fromHash]) ? fromHash :
    (saved?.currentFixture && state.trees[saved.currentFixture]) ? saved.currentFixture :
    'row-hug';

  setHash(state.currentFixture);

  // Toolbar: fixture buttons
  document.querySelectorAll('.fixture-btn').forEach(btn => {
    btn.addEventListener('click', () => switchFixture(btn.dataset.fixture));
  });

  // Reset button
  document.getElementById('reset-btn').addEventListener('click', () => {
    const defs = defaultFixtures();
    state.trees[state.currentFixture] = deepClone(defs[state.currentFixture]);
    state.selectedId = null;
    saveState();
    renderAll();
  });

  // Canvas click — attached once; re-render does innerHTML so the SVG element persists
  document.getElementById('canvas').addEventListener('click', e => {
    const id = e.target.getAttribute('data-id');
    state.selectedId = id || null;
    renderAll();
  });

  // Hash navigation
  window.addEventListener('hashchange', () => {
    const fid = hashFixture();
    if (fid && state.trees[fid] && fid !== state.currentFixture) {
      state.currentFixture = fid;
      state.selectedId     = null;
      saveState();
      renderAll();
    }
  });

  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
