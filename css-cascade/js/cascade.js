/**
 * cascade.js — pure CSS-cascade logic (no DOM side-effects beyond a temp style)
 * Namespaced with CC_ to avoid global collisions.
 */
'use strict';

/* ─────────────────────────────────────────────
 * Specificity
 * ───────────────────────────────────────────── */

/**
 * Parse a single CSS selector string and return its [a, b, c] specificity.
 *   a = ID selectors
 *   b = class selectors, attribute selectors, pseudo-classes
 *   c = type (element) selectors, pseudo-elements
 *
 * Handles :not()/:is()/:has() by unwrapping argument; :where() = 0.
 * Does not handle :nth-child(An+B of sel) edge case.
 */
function CC_parseSpecificity(selector) {
  if (!selector) return [0, 0, 0];
  let s = selector.trim();
  let a = 0, b = 0, c = 0;

  // :where(...) contributes zero specificity — remove entirely
  s = s.replace(/:where\([^)]*\)/g, '');

  // :not()/:is()/:has()/:matches() — unwrap so contents are counted normally
  // (simplified: single level only)
  s = s.replace(/:(?:not|is|has|matches)\(([^)]*)\)/g, (_, inner) => ' ' + inner + ' ');

  // ::pseudo-elements → c
  s = s.replace(/::[\w-]+(\([^)]*\))?/g, () => { c++; return ' '; });

  // #id → a
  s = s.replace(/#[\w-]+/g, () => { a++; return ' '; });

  // [attr] → b
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return ' '; });

  // .class → b
  s = s.replace(/\.[\w-]+/g, () => { b++; return ' '; });

  // :pseudo-class (with or without parens) → b
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => { b++; return ' '; });

  // type selectors: remaining word tokens (not *, +, >, ~, or whitespace)
  const types = s.match(/\b[a-zA-Z][\w-]*\b/g) || [];
  c += types.length;

  return [a, b, c];
}

/**
 * Compare two [a,b,c] specificities.
 * Returns positive if sa > sb, negative if sa < sb, 0 if equal.
 */
function CC_cmpSpecificity(sa, sb) {
  for (let i = 0; i < 3; i++) {
    if (sa[i] !== sb[i]) return sa[i] - sb[i];
  }
  return 0;
}

/**
 * Format specificity as the canonical "(a,b,c)" string.
 */
function CC_fmtSpec(spec) {
  return `(${spec.join(',')})`;
}

/* ─────────────────────────────────────────────
 * Cascade layers (@layer)
 * ───────────────────────────────────────────── */

/**
 * True when `cssRule` is a CSSLayerBlockRule (`@layer name { ... }`).
 * Prefers the CSSOM class; falls back to type 16 (LAYER_BLOCK_RULE).
 */
function CC_isLayerBlock(cssRule) {
  if (!cssRule) return false;
  try {
    if (typeof CSSLayerBlockRule !== 'undefined' && cssRule instanceof CSSLayerBlockRule) {
      return true;
    }
  } catch (_) { /* ignore */ }
  return cssRule.type === 16 && typeof cssRule.name === 'string' && !!cssRule.cssRules;
}

/**
 * Human-readable layer path for the trace.
 * Empty path = unlayered. Anonymous segments render as "(anonymous)".
 */
function CC_layerLabel(layerPath) {
  if (!layerPath || !layerPath.length) return '';
  return layerPath.map(seg => seg || '(anonymous)').join('.');
}

/**
 * Compare two layer rank tuples (first-seen sibling index at each nesting level).
 * Empty / missing ranks mean unlayered at that level, which beats any sublayer.
 * Top-level unlayered (empty array) beats every named layer.
 * Returns positive if `a` wins over `b` (higher cascade priority).
 */
function CC_cmpLayerRanks(aRanks, bRanks) {
  const a = (aRanks && aRanks.length) ? aRanks : [Infinity];
  const b = (bRanks && bRanks.length) ? bRanks : [Infinity];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = i < a.length ? a[i] : Infinity;
    const bv = i < b.length ? b[i] : Infinity;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Wrap inner CSS in `@layer` blocks matching `layerPath` (inside-out).
 */
function CC_wrapInLayers(css, layerPath) {
  if (!layerPath || !layerPath.length) return css;
  return layerPath.reduceRight((inner, seg) => {
    const header = seg ? `@layer ${seg}` : '@layer';
    return `${header} {\n${inner}\n}`;
  }, css);
}

/* ─────────────────────────────────────────────
 * Rule parsing
 * ───────────────────────────────────────────── */

function CC_collectStyleProps(style) {
  const props = {};
  for (let i = 0; i < style.length; i++) {
    const p = style[i];
    props[p] = style.getPropertyValue(p);
  }
  // Keep shorthands too — longhands alone miss a `padding:` / `margin:` trace.
  ['padding', 'margin', 'border', 'background', 'font'].forEach(sh => {
    const v = style.getPropertyValue(sh);
    if (v) props[sh] = v;
  });
  return props;
}

function CC_enterLayerChild(parent, key, display) {
  if (!parent.children.has(key)) {
    parent.order.push(key);
    parent.children.set(key, { children: new Map(), order: [], display });
  }
  return {
    node: parent.children.get(key),
    rank: parent.order.indexOf(key),
  };
}

/**
 * Parse an array of CSS text strings (one per sheet) into rule objects.
 *
 * Rule object shape:
 *   id          — unique string: "<sheetIndex>_<ruleIndex>_<selectorIndex>"
 *   selector    — individual selector string (comma-splits are broken apart)
 *   props       — {propName: value} for every declaration in the rule
 *   sheetIndex  — 0-based index in cssTexts array
 *   ruleIndex   — walk order of the CSSStyleRule (unique per sheet)
 *   selectorIndex — index within the comma-separated selector list
 *   sourceOrder — integer for cascade sort (higher = later = wins ties)
 *   layerPath   — string[] of layer name segments; empty = unlayered
 *   layerRanks  — sibling-index tuple used to compare layers
 *   layerBlockId — identity of the enclosing CSSLayerBlockRule (or null)
 *
 * Uses a temporary <style> element in the current document to leverage
 * the browser's own CSS parser (including CSSLayerBlockRule). Cleaned up after.
 */
function CC_parseCSSRules(cssTexts) {
  const rules = [];
  const tmp = document.createElement('style');
  document.head.appendChild(tmp);

  const rootLayer = { children: new Map(), order: [] };
  let anonSeq = 0;
  let blockSeq = 0;

  function walk(cssRules, sheetIdx, layerNode, layerRanks, layerPath, layerBlockId, seq) {
    Array.from(cssRules || []).forEach(cssRule => {
      if (CC_isLayerBlock(cssRule)) {
        let node = layerNode;
        const ranks = layerRanks.slice();
        const path = layerPath.slice();
        const raw = cssRule.name || '';
        if (!raw) {
          const step = CC_enterLayerChild(node, `#anon${anonSeq++}`, '');
          node = step.node;
          ranks.push(step.rank);
          path.push('');
        } else {
          raw.split('.').filter(Boolean).forEach(seg => {
            const step = CC_enterLayerChild(node, seg, seg);
            node = step.node;
            ranks.push(step.rank);
            path.push(seg);
          });
        }
        walk(cssRule.cssRules, sheetIdx, node, ranks, path, ++blockSeq, seq);
        return;
      }

      if (cssRule.type !== CSSRule.STYLE_RULE) return;

      const props = CC_collectStyleProps(cssRule.style);
      const ruleIdx = seq.n++;
      const selectorText = cssRule.selectorText;
      const selectors = selectorText.split(',').map(s => s.trim());

      selectors.forEach((selector, selIdx) => {
        rules.push({
          id: `${sheetIdx}_${ruleIdx}_${selIdx}`,
          selector,
          props: { ...props },
          sheetIndex: sheetIdx,
          ruleIndex: ruleIdx,
          selectorIndex: selIdx,
          sourceOrder: sheetIdx * 100000 + ruleIdx * 100 + selIdx,
          layerPath: layerPath.slice(),
          layerRanks: layerRanks.slice(),
          layerBlockId,
        });
      });
    });
  }

  try {
    cssTexts.forEach((text, sheetIdx) => {
      try {
        tmp.textContent = text || '';
        const sheet = tmp.sheet;
        if (!sheet) return;
        walk(sheet.cssRules, sheetIdx, rootLayer, [], [], null, { n: 0 });
      } catch (_) {
        /* Skip sheets with parse errors */
      }
    });
  } finally {
    document.head.removeChild(tmp);
  }

  return rules;
}

/**
 * Find all rules from allRules that:
 *   1. Target element `el` (el.matches(selector) must be true)
 *   2. Declare a value for `property`
 *
 * Returns an array sorted in cascade order:
 *   - ascending layer priority (earlier layers first; unlayered last / wins)
 *   - then ascending specificity (lowest first)
 *   - ties broken by ascending sourceOrder (later source = later = wins)
 *
 * The CASCADE WINNER is therefore the LAST element in the returned array.
 * Disabled rules are still included; the caller filters them visually.
 */
function CC_declares(rule, property) {
  if (property in rule.props) return true;
  if (property === 'padding' || property === 'margin') {
    return ['-top', '-right', '-bottom', '-left'].some(s => (property + s) in rule.props);
  }
  return false;
}

function CC_declValue(rule, property) {
  if (property in rule.props) return rule.props[property];
  if (property === 'padding' || property === 'margin') {
    return ['-top', '-right', '-bottom', '-left']
      .map(s => rule.props[property + s])
      .filter(Boolean)
      .join(' ') || '';
  }
  return '';
}

function CC_findMatchingRules(el, allRules, property) {
  if (!el || !property) return [];

  const matching = [];

  allRules.forEach(rule => {
    if (!CC_declares(rule, property)) return;

    try {
      if (!el.matches(rule.selector)) return;
    } catch (_) {
      return;
    }

    matching.push({
      ...rule,
      props: { ...rule.props, [property]: CC_declValue(rule, property) },
      specificity: CC_parseSpecificity(rule.selector),
    });
  });

  // Sort: lowest layer first, then lowest specificity, then earliest source.
  // Winner = last item. Unlayered ranks as Infinity so it sorts last / wins.
  matching.sort((a, b) => {
    const lc = CC_cmpLayerRanks(a.layerRanks, b.layerRanks);
    if (lc !== 0) return lc;
    const sc = CC_cmpSpecificity(a.specificity, b.specificity);
    return sc !== 0 ? sc : a.sourceOrder - b.sourceOrder;
  });

  return matching;
}

/**
 * Rebuild CSS text for one sheet from parsed rules, excluding any rule
 * whose `id` is in the `disabledIds` Set.
 *
 * Re-emits `@layer` wrappers so the iframe cascade matches the trace.
 * Comma-separated selectors: if only some are disabled, the rest are kept.
 */
function CC_buildCSS(allRules, sheetIndex, disabledIds) {
  // Filter to this sheet
  const sheetRules = allRules.filter(r => r.sheetIndex === sheetIndex);

  // Group by ruleIndex so we can reconstruct multi-selector rules
  const byRule = new Map();
  sheetRules.forEach(rule => {
    if (!byRule.has(rule.ruleIndex)) byRule.set(rule.ruleIndex, []);
    byRule.get(rule.ruleIndex).push(rule);
  });

  const groups = [...byRule.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => {
      const enabled = group.filter(r => !disabledIds.has(r.id));
      if (!enabled.length) return null;
      const selectorStr = enabled.map(r => r.selector).join(', ');
      const propsText = Object.entries(enabled[0].props)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');
      return {
        css: `${selectorStr} {\n${propsText}\n}`,
        layerPath: enabled[0].layerPath || [],
        layerBlockId: enabled[0].layerBlockId == null ? null : enabled[0].layerBlockId,
      };
    })
    .filter(Boolean);

  // Flush consecutive groups from the same @layer block as one wrap so
  // anonymous/sibling rules in one block stay a single layer.
  const chunks = [];
  let buf = [];
  let bufKey = undefined;

  function flush() {
    if (!buf.length) return;
    const inner = buf.map(g => g.css).join('\n\n');
    chunks.push(CC_wrapInLayers(inner, buf[0].layerPath));
    buf = [];
  }

  groups.forEach(g => {
    const key = g.layerBlockId;
    if (buf.length && bufKey !== key) flush();
    bufKey = key;
    buf.push(g);
  });
  flush();

  return chunks.join('\n\n');
}

/* ─────────────────────────────────────────────
 * DOM helpers
 * ───────────────────────────────────────────── */

/**
 * Get a concise display path for an element.
 * e.g. "div#main > p.text.highlight"
 */
function CC_getElementPath(el) {
  if (!el || !el.tagName) return '';
  const parts = [];
  let cur = el;
  while (cur && cur.tagName && !['HTML', 'HEAD', 'BODY'].includes(cur.tagName)) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) {
      part += '#' + cur.id;
    } else if (cur.classList.length) {
      part += '.' + Array.from(cur.classList)
        .filter(c => c)
        .slice(0, 2)
        .join('.');
    }
    parts.unshift(part);
    if (parts.length >= 4) { parts.unshift('…'); break; }
    cur = cur.parentElement;
  }
  return parts.join(' › ');
}

/**
 * Get the child-index path from `el` up to (but not including) `root`.
 * Returns an array of integers, e.g. [1, 0] means
 * root.children[1].children[0] === el.
 */
function CC_getDOMPath(el, root) {
  const path = [];
  let cur = el;
  while (cur && cur !== root) {
    const parent = cur.parentElement;
    if (!parent) break;
    path.unshift(Array.from(parent.children).indexOf(cur));
    cur = parent;
  }
  return path;
}

/**
 * Restore element by index path starting from `root`.
 * Returns null if the path is invalid.
 */
function CC_getByDOMPath(root, path) {
  let el = root;
  for (const idx of path) {
    if (!el || idx < 0 || idx >= el.children.length) return null;
    el = el.children[idx];
  }
  return el;
}
