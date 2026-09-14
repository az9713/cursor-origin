/**
 * app.js — CSS Cascade Laboratory UI
 * Storage key: css-cascade-v1
 */
'use strict';

/* ═══════════════════════════════════════════════
 * Seed documents
 * ═══════════════════════════════════════════════ */

/* Seeds. `specificity` and `boxmodel` stay unlayered so Session A winners
 * (#main .highlight → crimson/210px; .outer .inner → 55%; .inner padding)
 * do not change. `layers` is the Session C demo. */
const SEEDS = {
  specificity: {
    name: 'Specificity Fight',
    html: `<h2>Select an element → inspect its cascade</h2>
<div class="box" id="main">
  <p class="text highlight">Competing selectors — who wins?</p>
  <p class="text">Plain paragraph</p>
</div>`,
    css1: `/* Sheet 1 – lower specificity */
p { color: steelblue; width: 82%; }
.text { color: tomato; }
.box .text { color: seagreen; width: 60%; }`,
    css2: `/* Sheet 2 – higher specificity */
#main p { color: goldenrod; width: 45%; }
.highlight { color: orchid; }
#main .highlight { color: crimson; width: 210px; }`,
  },

  boxmodel: {
    name: 'Box Model Width',
    html: `<div class="outer">
  <div class="inner box">← Inspect this div's width</div>
  <div class="inner">Another child div</div>
</div>`,
    css1: `/* Sheet 1 */
div { box-sizing: border-box; font-family: sans-serif; font-size: 14px; }
.outer { width: 480px; padding: 24px; background: #e8f0ff; }
.inner { background: #fff8e8; margin-bottom: 8px; padding: 10px; }`,
    css2: `/* Sheet 2 – cascade overrides */
.box { width: 300px; background: #ffe8e8; }
.inner { width: 75%; }
.outer .inner { width: 55%; }`,
  },

  layers: {
    name: 'Layer vs Unlayered',
    html: `<div class="box" id="hero">Layered #hero vs unlayered .box</div>
<p class="note">Unlayered color/width win even against an ID in @layer.</p>`,
    css1: `/* Sheet 1 – named layers (lose to unlayered) */
@layer reset {
  .box { color: gray; width: 90%; }
}
@layer theme {
  #hero { color: crimson; width: 400px; }
  .box { background: #ffe8e8; padding: 12px; }
}`,
    css2: `/* Sheet 2 – unlayered wins over any layer */
.box { box-sizing: border-box; color: navy; width: 180px; }`,
  },
};

/* ═══════════════════════════════════════════════
 * State
 * ═══════════════════════════════════════════════ */

const state = {
  docId:        'specificity',
  html:         '',
  css1:         '',
  css2:         '',
  disabledIds:  new Set(),   // Set<ruleId>
  selectedPath: null,        // number[] — child-index path into iframe body
  property:     'width',
};

/** All parsed rules from the current CSS editors. */
let parsedRules = [];

/* ═══════════════════════════════════════════════
 * DOM refs
 * ═══════════════════════════════════════════════ */

const $ = id => document.getElementById(id);
const DOM = {
  docSelect:  $('doc-select'),
  resetBtn:   $('reset-btn'),
  htmlEd:     $('html-editor'),
  css1Ed:     $('css1-editor'),
  css2Ed:     $('css2-editor'),
  preview:    $('preview'),
  treePane:   $('element-tree'),
  selDisplay: $('sel-display'),
  propSelect: $('prop-select'),
  trace:      $('cascade-trace'),
  computed:   $('computed-box'),
};

/* ═══════════════════════════════════════════════
 * Utilities
 * ═══════════════════════════════════════════════ */

const escH = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ═══════════════════════════════════════════════
 * Persistence
 * ═══════════════════════════════════════════════ */

const STORE_KEY = 'css-cascade-v1';

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      docId: state.docId,
      html:  state.html,
      css1:  state.css1,
      css2:  state.css2,
    }));
  } catch (_) {}
}

function restore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

/* ═══════════════════════════════════════════════
 * IFrame rendering
 * ═══════════════════════════════════════════════ */

/**
 * Build the full HTML document string to write into the iframe.
 * Excludes disabled rules from both stylesheets.
 */
function buildIframeDoc() {
  const css1 = parsedRules.length
    ? CC_buildCSS(parsedRules, 0, state.disabledIds)
    : state.css1;
  const css2 = parsedRules.length
    ? CC_buildCSS(parsedRules, 1, state.disabledIds)
    : state.css2;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  /* iframe baseline — does not participate in the user's cascade trace */
  body { margin: 12px; font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
</style>
<style id="__s1">${css1}</style>
<style id="__s2">${css2}</style>
</head>
<body>${state.html}</body>
</html>`;
}

/**
 * (Re)render the preview iframe. After writing:
 *   • Attach hover/click handlers inside the iframe
 *   • Rebuild the element tree
 *   • Restore previously selected element (if any)
 */
function renderIframe() {
  const frame = DOM.preview;
  const doc   = frame.contentDocument;
  if (!doc) return;

  doc.open();
  doc.write(buildIframeDoc());
  doc.close();

  // Attach interaction handlers
  doc.addEventListener('click',     onIframeClick, true);
  doc.addEventListener('mouseover', onIframeHover, true);
  doc.addEventListener('mouseout',  onIframeOut,   true);

  // Rebuild tree
  buildTree(doc);

  // Restore selection
  if (state.selectedPath) {
    const el = CC_getByDOMPath(doc.body, state.selectedPath);
    if (el) {
      applyHighlight(el);
      renderInspector(el);
      return;
    }
    state.selectedPath = null;
  }
  clearInspector();
}

/* ═══════════════════════════════════════════════
 * Element highlight in iframe (using attribute + injected style)
 * Avoids touching inline `style` so cascade values stay pristine.
 * ═══════════════════════════════════════════════ */

const ATTR_SEL = 'data-cc-sel';
const ATTR_HOV = 'data-cc-hov';

function ensureHighlightStyles(doc) {
  let st = doc.getElementById('__cc-hl');
  if (!st) {
    st = doc.createElement('style');
    st.id = '__cc-hl';
    doc.head.appendChild(st);
  }
  st.textContent = `
    [${ATTR_SEL}] {
      outline: 2px solid #b4451a !important;
      outline-offset: 2px !important;
    }
    [${ATTR_HOV}]:not([${ATTR_SEL}]) {
      outline: 1px dashed #b4451a !important;
      outline-offset: 1px !important;
      opacity: .9;
    }
  `;
}

function applyHighlight(el) {
  const doc = el.ownerDocument;
  ensureHighlightStyles(doc);
  // Remove previous selection marker
  doc.querySelectorAll(`[${ATTR_SEL}]`).forEach(e => e.removeAttribute(ATTR_SEL));
  el.setAttribute(ATTR_SEL, '1');
}

/* ═══════════════════════════════════════════════
 * IFrame event handlers
 * ═══════════════════════════════════════════════ */

function onIframeClick(e) {
  const el = e.target;
  if (!el || !el.tagName || ['HTML', 'BODY'].includes(el.tagName)) return;
  e.stopPropagation();

  applyHighlight(el);
  state.selectedPath = CC_getDOMPath(el, DOM.preview.contentDocument.body);
  renderInspector(el);
  updateTreeActive();
}

function onIframeHover(e) {
  const el = e.target;
  if (!el || !el.tagName || ['HTML', 'BODY'].includes(el.tagName)) return;
  const doc = DOM.preview.contentDocument;
  doc.querySelectorAll(`[${ATTR_HOV}]`).forEach(x => x.removeAttribute(ATTR_HOV));
  el.setAttribute(ATTR_HOV, '1');
}

function onIframeOut(e) {
  if (e.target) e.target.removeAttribute(ATTR_HOV);
}

/* ═══════════════════════════════════════════════
 * Inspector
 * ═══════════════════════════════════════════════ */

function renderInspector(el) {
  // Update path display
  const path = CC_getElementPath(el);
  DOM.selDisplay.textContent = path || el.tagName.toLowerCase();
  DOM.selDisplay.classList.remove('empty');

  const prop     = state.property;
  const matching = CC_findMatchingRules(el, parsedRules, prop);

  renderTrace(matching, prop);
  renderComputed(el, prop);
}

function clearInspector() {
  DOM.selDisplay.textContent = '— click an element in the preview —';
  DOM.selDisplay.classList.add('empty');
  DOM.trace.innerHTML    = '<p class="hint">Select an element to trace its cascade.</p>';
  DOM.computed.innerHTML = '<p class="hint">—</p>';
}

/* ─── Cascade trace table ─── */

function renderTrace(matching, prop) {
  if (!matching.length) {
    DOM.trace.innerHTML = `<p class="hint">No matching rules for <code>${escH(prop)}</code>.</p>`;
    return;
  }

  // Determine the current winner: last non-disabled rule in cascade order
  let winnerIdx = -1;
  for (let i = matching.length - 1; i >= 0; i--) {
    if (!state.disabledIds.has(matching[i].id)) { winnerIdx = i; break; }
  }

  // Display in REVERSE cascade order so the winner appears at the top.
  const displayList = [...matching].reverse();

  const rows = displayList.map(rule => {
    const origIdx = matching.indexOf(rule);
    const isWinner  = origIdx === winnerIdx;
    const isOff     = state.disabledIds.has(rule.id);
    const sheetLbl  = `S${rule.sheetIndex + 1}`;
    const srcLbl    = `${sheetLbl}·r${rule.ruleIndex + 1}`;
    const layerLbl  = CC_layerLabel(rule.layerPath) || '—';
    const rowClass  = [isWinner ? 'tr-win' : '', isOff ? 'tr-off' : ''].join(' ').trim();

    return `<tr class="${rowClass}">
      <td class="tc-sheet">${sheetLbl}</td>
      <td class="tc-sel"><code title="${escH(rule.selector)}">${escH(rule.selector)}</code></td>
      <td class="tc-layer" title="${escH(layerLbl)}">${escH(layerLbl)}</td>
      <td class="tc-val"><code>${escH(rule.props[prop])}</code></td>
      <td class="tc-spec">${CC_fmtSpec(rule.specificity)}</td>
      <td class="tc-src">${srcLbl}</td>
      <td class="tc-win">${isWinner && !isOff ? '✓' : ''}</td>
      <td class="tc-off">
        <label class="off-lbl" title="Disable this rule (what-if)">
          <input type="checkbox" data-rid="${escH(rule.id)}" ${isOff ? 'checked' : ''}>
          Off
        </label>
      </td>
    </tr>`;
  });

  DOM.trace.innerHTML = `<table class="trace-tbl">
    <thead>
      <tr>
        <th>Sheet</th>
        <th>Selector</th>
        <th>Layer</th>
        <th>Value</th>
        <th>Spec</th>
        <th>Src</th>
        <th></th>
        <th>Off</th>
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;

  // Bind disable checkboxes
  DOM.trace.querySelectorAll('[data-rid]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.disabledIds.add(cb.dataset.rid);
      else            state.disabledIds.delete(cb.dataset.rid);
      // Re-render iframe (which re-runs inspector via state.selectedPath)
      renderIframe();
    });
  });
}

/* ─── Computed values ─── */

function renderComputed(el, prop) {
  try {
    const win  = DOM.preview.contentWindow;
    const cs   = win.getComputedStyle(el);
    const cv   = cs.getPropertyValue(prop) || '(not set)';

    // camelCase version for JS property access (width, backgroundColor, etc.)
    const jsProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    const bcr      = el.getBoundingClientRect();
    const bcrWidth = bcr.width.toFixed(2);

    const showBCR = prop === 'width' || prop.includes('width');

    DOM.computed.innerHTML = `<table class="computed-tbl">
      <tr>
        <td class="cv-lbl">
          getComputedStyle(el)<br>
          <code>.${escH(jsProp)}</code>
        </td>
        <td class="cv-val"><code>${escH(cv)}</code></td>
      </tr>
      ${showBCR ? `<tr>
        <td class="cv-lbl">
          getBoundingClientRect()<br>
          <code>.width</code>
        </td>
        <td class="cv-val"><code>${bcrWidth}px</code></td>
      </tr>` : ''}
    </table>
    <p class="computed-note">Measured live from the iframe renderer — not estimated.</p>`;
  } catch (e) {
    DOM.computed.innerHTML = `<p class="hint">Error reading computed values: ${escH(e.message)}</p>`;
  }
}

/* ═══════════════════════════════════════════════
 * Element tree
 * ═══════════════════════════════════════════════ */

function buildTree(doc) {
  const html = renderTreeNodes(doc.body.children, [], 0);
  DOM.treePane.innerHTML = html || '<p class="hint">Empty document body.</p>';

  // Bind clicks
  DOM.treePane.querySelectorAll('.tn').forEach(node => {
    node.addEventListener('click', e => {
      e.stopPropagation();
      const path = node.dataset.p.split(',').map(Number);
      const el   = CC_getByDOMPath(doc.body, path);
      if (!el) return;

      applyHighlight(el);
      state.selectedPath = path;
      renderInspector(el);
      updateTreeActive();
    });
  });

  updateTreeActive();
}

function renderTreeNodes(children, parentPath, depth) {
  if (!children || !children.length) return '';

  return Array.from(children).map((el, idx) => {
    const path = [...parentPath, idx];
    const ps   = path.join(',');

    // Build label
    let lbl = `<span class="tn-tag">${escH(el.tagName.toLowerCase())}</span>`;
    if (el.id) {
      lbl += `<span class="tn-id">#${escH(el.id)}</span>`;
    }
    Array.from(el.classList)
      .filter(c => c)
      .slice(0, 3)
      .forEach(c => { lbl += `<span class="tn-cls">.${escH(c)}</span>`; });

    const childHtml = renderTreeNodes(el.children, path, depth + 1);

    return `<div class="ti">
      <span class="tn" data-p="${ps}" style="padding-left:${4 + depth * 14}px">${lbl}</span>
      ${childHtml ? `<div class="tc">${childHtml}</div>` : ''}
    </div>`;
  }).join('');
}

function updateTreeActive() {
  DOM.treePane.querySelectorAll('.tn').forEach(n => n.classList.remove('tn-active'));
  if (state.selectedPath) {
    const ps = state.selectedPath.join(',');
    const n  = DOM.treePane.querySelector(`[data-p="${ps}"]`);
    if (n) n.classList.add('tn-active');
  }
}

/* ═══════════════════════════════════════════════
 * Document loading
 * ═══════════════════════════════════════════════ */

function loadDoc(id, clearDisabled = true) {
  const seed = SEEDS[id];
  if (!seed) return;

  state.docId = id;
  state.html  = seed.html;
  state.css1  = seed.css1;
  state.css2  = seed.css2;
  if (clearDisabled) {
    state.disabledIds.clear();
    state.selectedPath = null;
  }

  DOM.htmlEd.value    = state.html;
  DOM.css1Ed.value    = state.css1;
  DOM.css2Ed.value    = state.css2;
  DOM.docSelect.value = id;

  reParse();
  renderIframe();
  clearInspector();
  persist();
}

function reParse() {
  parsedRules = CC_parseCSSRules([state.css1, state.css2]);
}

/* ═══════════════════════════════════════════════
 * Editor changes (debounced)
 * ═══════════════════════════════════════════════ */

const debouncedApply = debounce(() => {
  state.html = DOM.htmlEd.value;
  state.css1 = DOM.css1Ed.value;
  state.css2 = DOM.css2Ed.value;
  // Reset disabled rules on edit — old IDs may no longer be valid
  state.disabledIds.clear();
  reParse();
  renderIframe();
  persist();
}, 600);

/* ═══════════════════════════════════════════════
 * Hash routing  #/d/<docId>
 * ═══════════════════════════════════════════════ */

function applyHash() {
  const m = location.hash.match(/^#\/d\/(\w+)/);
  if (m && SEEDS[m[1]] && m[1] !== state.docId) loadDoc(m[1]);
}

function setHash(id) {
  history.replaceState(null, '', `#/d/${id}`);
}

/* ═══════════════════════════════════════════════
 * Boot
 * ═══════════════════════════════════════════════ */

(function init() {
  // Editor listeners
  DOM.htmlEd.addEventListener('input',  debouncedApply);
  DOM.css1Ed.addEventListener('input',  debouncedApply);
  DOM.css2Ed.addEventListener('input',  debouncedApply);

  // Doc picker
  DOM.docSelect.addEventListener('change', () => {
    const id = DOM.docSelect.value;
    setHash(id);
    loadDoc(id);
  });

  // Reset
  DOM.resetBtn.addEventListener('click', () => loadDoc(state.docId));

  // Property selector
  DOM.propSelect.addEventListener('change', () => {
    state.property = DOM.propSelect.value;
    if (state.selectedPath) {
      const el = CC_getByDOMPath(DOM.preview.contentDocument.body, state.selectedPath);
      if (el) renderInspector(el);
    }
  });

  // Hash navigation
  window.addEventListener('hashchange', applyHash);

  // ── Initial load ──
  const hashMatch = location.hash.match(/^#\/d\/(\w+)/);
  const hashDocId = hashMatch && SEEDS[hashMatch[1]] ? hashMatch[1] : null;

  if (hashDocId) {
    // Hash takes priority
    setHash(hashDocId);
    loadDoc(hashDocId);
    return;
  }

  // Try to restore from localStorage
  const saved = restore();
  if (saved) {
    state.docId = saved.docId in SEEDS ? saved.docId : 'specificity';
    state.html  = saved.html || SEEDS[state.docId].html;
    state.css1  = saved.css1 || SEEDS[state.docId].css1;
    state.css2  = saved.css2 || SEEDS[state.docId].css2;

    DOM.htmlEd.value    = state.html;
    DOM.css1Ed.value    = state.css1;
    DOM.css2Ed.value    = state.css2;
    DOM.docSelect.value = state.docId;

    setHash(state.docId);
    reParse();
    renderIframe();
    clearInspector();
  } else {
    setHash('specificity');
    loadDoc('specificity');
  }
})();
