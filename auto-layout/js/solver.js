/**
 * Auto-layout solver — pure JS, zero DOM/CSS.
 *
 * Input:  node tree where every node matches:
 *   { id, name, w, h, padding, gap,
 *     direction: 'row'|'col', wrap: bool,
 *     justify: 'start'|'center'|'end'|'space-between'|'space-around',
 *     align:   'start'|'center'|'end'|'stretch',
 *     sizingX: 'hug'|'fill'|'fixed',
 *     sizingY: 'hug'|'fill'|'fixed',
 *     children: [] }
 *
 * Output: mutates every node in-place, writing:
 *   _x, _y  — absolute position (px)
 *   _w, _h  — computed size     (px)
 *
 * Two-phase algorithm:
 *   Phase 1 (bottom-up)  – compute intrinsic (natural) sizes; fill → 0.
 *   Phase 2 (top-down)   – resolve fill sizes; assign absolute positions.
 */

export function solve(root) {
  root._x = 0;
  root._y = 0;
  computeIntrinsic(root);
  layoutNode(root, 0, 0); // avW/avH only matter for fill roots (undefined; use 0)
}

// ─── Phase 1: intrinsic sizes (bottom-up) ────────────────────────────────────

function computeIntrinsic(node) {
  const ch = node.children || [];
  for (const c of ch) computeIntrinsic(c);

  const pad = normPad(node.padding);
  const gap = node.gap || 0;
  const dir = node.direction || 'row';

  if (ch.length === 0) {
    // Leaf: natural size = explicit (fixed) or 0 (hug/fill resolved later)
    node._iw = node.sizingX === 'fixed' ? (node.w || 0) : 0;
    node._ih = node.sizingY === 'fixed' ? (node.h || 0) : 0;
    return;
  }

  if (dir === 'row') {
    // Main axis: sum widths + gaps (skip fill children)
    // Cross axis: max height (skip fill children)
    const cntW = ch.reduce((s, c, i) =>
      s + (c.sizingX !== 'fill' ? c._iw : 0) + (i > 0 ? gap : 0), 0);
    const cntH = ch.reduce((m, c) =>
      Math.max(m, c.sizingY !== 'fill' ? c._ih : 0), 0);
    node._iw = intrinsicDim(node.sizingX, node.w, pad.l + cntW + pad.r);
    node._ih = intrinsicDim(node.sizingY, node.h, pad.t + cntH + pad.b);
  } else {
    // col: main = Y, cross = X
    const cntW = ch.reduce((m, c) =>
      Math.max(m, c.sizingX !== 'fill' ? c._iw : 0), 0);
    const cntH = ch.reduce((s, c, i) =>
      s + (c.sizingY !== 'fill' ? c._ih : 0) + (i > 0 ? gap : 0), 0);
    node._iw = intrinsicDim(node.sizingX, node.w, pad.l + cntW + pad.r);
    node._ih = intrinsicDim(node.sizingY, node.h, pad.t + cntH + pad.b);
  }
}

function intrinsicDim(sizing, explicit, hugged) {
  if (sizing === 'fixed') return explicit || 0;
  if (sizing === 'hug')   return Math.max(0, hugged);
  return 0; // fill — deferred to Phase 2
}

// ─── Phase 2: resolve fill + absolute positions (top-down) ───────────────────

function layoutNode(node, avW, avH) {
  // Resolve this node's own size
  node._w = dimResolve(node.sizingX, node.w, node._iw, avW);
  node._h = dimResolve(node.sizingY, node.h, node._ih, avH);

  const ch = node.children || [];
  if (!ch.length) return;

  const pad  = normPad(node.padding);
  const gap  = node.gap  || 0;
  const dir  = node.direction || 'row';
  const wrap = node.wrap  || false;
  const just = node.justify || 'start';
  const algn = node.align   || 'start';

  const iw = node._w - pad.l - pad.r; // inner width
  const ih = node._h - pad.t - pad.b; // inner height

  if (dir === 'row' && wrap) {
    wrapRow(node, ch, pad, gap, iw, ih, just, algn);
  } else if (dir === 'row') {
    rowLayout(node, ch, pad, gap, iw, ih, just, algn);
  } else {
    colLayout(node, ch, pad, gap, iw, ih, just, algn);
  }
}

function dimResolve(sizing, explicit, intrinsic, available) {
  if (sizing === 'fill')  return Math.max(0, available);
  if (sizing === 'fixed') return explicit || 0;
  return intrinsic; // hug
}

// ── Row layout (no wrap) ──────────────────────────────────────────────────────

function rowLayout(node, ch, pad, gap, iw, ih, just, algn) {
  // Distribute spare width to fill children
  const fillN  = ch.filter(c => c.sizingX === 'fill').length;
  const fixedW = ch.reduce((s, c) => s + (c.sizingX !== 'fill' ? c._iw : 0), 0);
  const gapW   = (ch.length - 1) * gap;
  const fillW  = fillN > 0 ? Math.max(0, (iw - fixedW - gapW) / fillN) : 0;

  for (const c of ch) {
    c._w = c.sizingX === 'fill' ? fillW : c._iw;
    c._h = (algn === 'stretch' || c.sizingY === 'fill') ? ih : c._ih;
  }

  const pos = distrib(iw, ch.map(c => c._w), gap, just);
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    c._x = node._x + pad.l + pos[i];
    c._y = node._y + pad.t + crossOff(algn, ih, c._h);
    layoutNode(c, c._w, c._h);
  }
}

// ── Col layout ────────────────────────────────────────────────────────────────

function colLayout(node, ch, pad, gap, iw, ih, just, algn) {
  const fillN  = ch.filter(c => c.sizingY === 'fill').length;
  const fixedH = ch.reduce((s, c) => s + (c.sizingY !== 'fill' ? c._ih : 0), 0);
  const gapH   = (ch.length - 1) * gap;
  const fillH  = fillN > 0 ? Math.max(0, (ih - fixedH - gapH) / fillN) : 0;

  for (const c of ch) {
    c._w = (algn === 'stretch' || c.sizingX === 'fill') ? iw : c._iw;
    c._h = c.sizingY === 'fill' ? fillH : c._ih;
  }

  const pos = distrib(ih, ch.map(c => c._h), gap, just);
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    c._x = node._x + pad.l + crossOff(algn, iw, c._w);
    c._y = node._y + pad.t + pos[i];
    layoutNode(c, c._w, c._h);
  }
}

// ── Wrap row layout ───────────────────────────────────────────────────────────

function wrapRow(node, ch, pad, gap, iw, ih, just, algn) {
  // Measure children (fill-X in wrap is treated as 0 — unsupported combination)
  for (const c of ch) {
    c._w = c.sizingX === 'fill' ? 0 : c._iw;
    c._h = c.sizingY === 'fill' ? 0 : c._ih;
  }

  // Break into lines greedily
  const lines = [];
  let line = [], lineW = 0;
  for (const c of ch) {
    const needed = line.length > 0 ? lineW + gap + c._w : c._w;
    if (line.length > 0 && needed > iw) {
      lines.push(line);
      line  = [c];
      lineW = c._w;
    } else {
      line.push(c);
      lineW = needed;
    }
  }
  if (line.length) lines.push(line);

  let y = 0; // offset within inner area (0 = top of inner)
  for (const ln of lines) {
    const lineH = ln.reduce((m, c) => Math.max(m, c._h), 0);
    const pos   = distrib(iw, ln.map(c => c._w), gap, just);
    for (let i = 0; i < ln.length; i++) {
      const c = ln[i];
      c._x = node._x + pad.l + pos[i];
      c._y = node._y + pad.t + y + crossOff(algn, lineH, c._h);
      layoutNode(c, c._w, c._h);
    }
    y += lineH + gap;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Distribute `sizes` items with `gap` spacing inside `containerSize`,
 * according to `justify`.  Returns array of start positions (relative to
 * container start, after any padding offset is applied by the caller).
 */
function distrib(containerSize, sizes, gap, justify) {
  const n         = sizes.length;
  const totalItems = sizes.reduce((s, v) => s + v, 0);
  const used       = totalItems + (n - 1) * gap;
  const free       = containerSize - used;
  const pos        = [];

  if (justify === 'space-between' && n > 1) {
    const extraGap = free / (n - 1);
    let x = 0;
    for (let i = 0; i < n; i++) { pos.push(x); x += sizes[i] + gap + extraGap; }
  } else if (justify === 'space-around' && n > 0) {
    const slot = free / n;
    let x = slot / 2;
    for (let i = 0; i < n; i++) { pos.push(x); x += sizes[i] + gap + slot; }
  } else {
    // start / center / end
    const off = justify === 'center' ? free / 2
              : justify === 'end'    ? free
              : 0;
    let x = Math.max(0, off);
    for (let i = 0; i < n; i++) { pos.push(x); x += sizes[i] + gap; }
  }

  return pos;
}

/** Cross-axis offset for alignment (start / center / end / stretch). */
function crossOff(align, containerSize, itemSize) {
  if (align === 'center') return Math.max(0, (containerSize - itemSize) / 2);
  if (align === 'end')    return Math.max(0, containerSize - itemSize);
  return 0; // start or stretch (size already applied)
}

/** Normalise padding to { t, r, b, l }. */
function normPad(p) {
  if (typeof p === 'number') return { t: p, r: p, b: p, l: p };
  if (p && typeof p === 'object' && !Array.isArray(p))
    return { t: p.top||0, r: p.right||0, b: p.bottom||0, l: p.left||0 };
  return { t: 0, r: 0, b: 0, l: 0 };
}
