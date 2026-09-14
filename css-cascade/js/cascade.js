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
 * Rule parsing
 * ───────────────────────────────────────────── */

/**
 * Parse an array of CSS text strings (one per sheet) into rule objects.
 *
 * Rule object shape:
 *   id          — unique string: "<sheetIndex>_<ruleIndex>_<selectorIndex>"
 *   selector    — individual selector string (comma-splits are broken apart)
 *   props       — {propName: value} for every declaration in the rule
 *   sheetIndex  — 0-based index in cssTexts array
 *   ruleIndex   — index of the CSSStyleRule within the sheet
 *   selectorIndex — index within the comma-separated selector list
 *   sourceOrder — integer for cascade sort (higher = later = wins ties)
 *
 * Uses a temporary <style> element in the current document to leverage
 * the browser's own CSS parser. Cleaned up immediately after.
 */
function CC_parseCSSRules(cssTexts) {
  const rules = [];
  const tmp = document.createElement('style');
  document.head.appendChild(tmp);

  try {
    cssTexts.forEach((text, sheetIdx) => {
      try {
        tmp.textContent = text || '';
        const sheet = tmp.sheet;
        if (!sheet) return;

        Array.from(sheet.cssRules || []).forEach((cssRule, ruleIdx) => {
          if (cssRule.type !== CSSRule.STYLE_RULE) return;

          // Collect all declared properties
          const props = {};
          const style = cssRule.style;
          for (let i = 0; i < style.length; i++) {
            const p = style[i];
            props[p] = style.getPropertyValue(p);
          }

          // Split comma-separated selectors so each gets its own entry
          // (they may have different specificities for matching purposes)
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
              // Cascade source order: sheet index has highest weight,
              // then rule index, then selector index within a comma list.
              sourceOrder: sheetIdx * 100000 + ruleIdx * 100 + selIdx,
            });
          });
        });
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
 *   - ascending specificity (lowest first)
 *   - ties broken by ascending sourceOrder (later source = later = wins)
 *
 * The CASCADE WINNER is therefore the LAST element in the returned array.
 * Disabled rules are still included; the caller filters them visually.
 */
function CC_findMatchingRules(el, allRules, property) {
  if (!el || !property) return [];

  const matching = [];

  allRules.forEach(rule => {
    // Must declare the target property
    if (!(property in rule.props)) return;

    // Must match the element
    try {
      if (!el.matches(rule.selector)) return;
    } catch (_) {
      return; // Ignore invalid selectors
    }

    matching.push({
      ...rule,
      specificity: CC_parseSpecificity(rule.selector),
    });
  });

  // Sort: lowest specificity first; ties → earliest source order first.
  // Winner = last item (highest spec, or if tied, latest source order).
  matching.sort((a, b) => {
    const sc = CC_cmpSpecificity(a.specificity, b.specificity);
    return sc !== 0 ? sc : a.sourceOrder - b.sourceOrder;
  });

  return matching;
}

/**
 * Rebuild CSS text for one sheet from parsed rules, excluding any rule
 * whose `id` is in the `disabledIds` Set.
 *
 * Comma-separated selectors are handled correctly: if only some selectors
 * in a rule are disabled, the rest are kept with the same declarations.
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

  const chunks = [];

  // Iterate in source order
  [...byRule.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([, group]) => {
      // Keep only non-disabled selectors
      const enabled = group.filter(r => !disabledIds.has(r.id));
      if (!enabled.length) return;

      const selectorStr = enabled.map(r => r.selector).join(', ');
      // All selectors in a rule share the same declarations
      const propsText = Object.entries(enabled[0].props)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');

      chunks.push(`${selectorStr} {\n${propsText}\n}`);
    });

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
