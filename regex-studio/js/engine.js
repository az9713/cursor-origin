/* engine.js — backtracking regex engine (Session A)
 *
 * RS.matchAll(ast, str) → array of match objects
 *   match: { start, end, text, groups:[{start,end,text}|null,...], trace:[{label,start,end},...] }
 *   groups is 0-indexed (group[0] = group #1 in pattern)
 *   trace records which atoms matched which spans (only successful path)
 *
 * Engine uses continuation-passing style for correct greedy/lazy backtracking.
 * Captures and trace are restored on backtrack via save/restore.
 */
window.RS = window.RS || {};

/* Count max group index in an AST */
RS._maxGroup = function (node) {
  if (!node) return 0;
  var m = 0;
  if (node.type === 'group') m = node.index;
  if (node.alts)  node.alts.forEach(function (n) { m = Math.max(m, RS._maxGroup(n)); });
  if (node.items) node.items.forEach(function (n) { m = Math.max(m, RS._maxGroup(n)); });
  if (node.child) m = Math.max(m, RS._maxGroup(node.child));
  return m;
};

/* Assign capturing-group indexes left-to-right starting at startIndex. */
RS._reindexGroups = function (node, startIndex) {
  var n = startIndex;
  function walk(n0) {
    if (!n0) return;
    if (n0.type === 'group') { n0.index = n++; }
    if (n0.child) walk(n0.child);
    if (n0.items) n0.items.forEach(walk);
    if (n0.alts) n0.alts.forEach(walk);
  }
  walk(node);
  return n;
};

/* Try to match `ast` starting at `startPos` in `str`.
 * Returns a match object or null. */
RS._matchAt = function (ast, str, startPos) {
  var numGroups = RS._maxGroup(ast);
  /* caps[i] = {start, end} for group index i (1-based). Index 0 unused. */
  var caps = new Array(numGroups + 1).fill(null);
  var trace = []; /* [{label, start, end}] — only successful atoms */
  var REPEAT_LIMIT = 10000;

  /* ── helpers ── */
  function matchEscK(kind, ch) {
    switch (kind) {
      case 'd': return /\d/.test(ch);
      case 'D': return !/\d/.test(ch);
      case 'w': return /\w/.test(ch);
      case 'W': return !/\w/.test(ch);
      case 's': return /\s/.test(ch);
      case 'S': return !/\s/.test(ch);
      default:  return false;
    }
  }

  function matchClass(ch, ranges, negated) {
    var hit = false;
    for (var i = 0; i < ranges.length && !hit; i++) {
      var r = ranges[i];
      if (r.kind === 'char')   hit = (r.ch === ch);
      else if (r.kind === 'range') hit = (ch >= r.from && ch <= r.to);
      else if (r.kind === 'escape') {
        var code = r.code;
        if (code === 'n') hit = (ch === '\n');
        else if (code === 't') hit = (ch === '\t');
        else if ('dwsDWS'.indexOf(code) >= 0) hit = matchEscK(code, ch);
        else hit = (ch === code); /* literal */
      }
    }
    return negated ? !hit : hit;
  }

  /* ── core: go(node, pos, k) → end-position or -1
   *   k is a continuation: k(pos) → end-position or -1 */
  function go(node, pos, k) {
    if (!node) return k(pos);
    switch (node.type) {

      case 'empty': return k(pos);

      case 'char':
        if (pos < str.length && str[pos] === node.ch)
          return addTrace(node.ch === ' ' ? 'space' : '"' + node.ch + '"', pos, pos + 1, k);
        return -1;

      case 'escaped_char':
        if (pos < str.length && str[pos] === node.ch)
          return addTrace('\\' + node.raw, pos, pos + 1, k);
        return -1;

      case 'dot':
        if (pos < str.length && str[pos] !== '\n')
          return addTrace('.', pos, pos + 1, k);
        return -1;

      case 'anchor': {
        var ok = (node.kind === '^' && pos === 0) ||
                 (node.kind === '$' && pos === str.length);
        if (ok) return addTrace(node.kind, pos, pos, k);
        return -1;
      }

      case 'escape': {
        if (pos >= str.length) return -1;
        var ch = str[pos];
        if (matchEscK(node.kind, ch))
          return addTrace('\\' + node.kind, pos, pos + 1, k);
        return -1;
      }


      case 'charclass': {
        if (pos >= str.length) return -1;
        var ch = str[pos];
        if (matchClass(ch, node.ranges, node.negated)) {
          var lbl = RS.nodeSummary(node);
          return addTrace(lbl, pos, pos + 1, k);
        }
        return -1;
      }

      case 'group': {
        var idx = node.index;
        var saved = caps[idx];
        caps[idx] = { start: pos, end: -1 };
        var r = go(node.child, pos, function (p) {
          caps[idx] = { start: pos, end: p };
          return k(p);
        });
        if (r === -1) caps[idx] = saved;
        return r;
      }

      case 'ncgroup':
        return go(node.child, pos, k);

      case 'alt': {
        for (var ai = 0; ai < node.alts.length; ai++) {
          var savedCaps = caps.slice();
          var savedTrace = trace.length;
          var r = go(node.alts[ai], pos, k);
          if (r !== -1) return r;
          caps = savedCaps;
          trace.length = savedTrace;
        }
        return -1;
      }

      case 'concat':
        return goItems(node.items, 0, pos, k);

      case 'quantified':
        return goQuant(node, pos, k);

      default:
        return k(pos);
    }
  }

  /* add a trace entry and call continuation; pop on failure */
  function addTrace(label, s, e, k) {
    trace.push({ label: label, start: s, end: e });
    var r = k(e);
    if (r === -1) trace.pop();
    return r;
  }

  function goItems(items, idx, pos, k) {
    if (idx >= items.length) return k(pos);
    return go(items[idx], pos, function (p) {
      return goItems(items, idx + 1, p, k);
    });
  }

  function goQuant(qnode, pos, k) {
    var min = qnode.quant.min;
    var max = qnode.quant.max; /* Infinity or number */
    var greedy = qnode.quant.greedy !== false;

    function rep(count, pos) {
      if (greedy) {
        /* try to match one more */
        if (count < max && count < REPEAT_LIMIT) {
          var sc = caps.slice();
          var st = trace.length;
          var r = go(qnode.child, pos, function (p2) {
            /* prevent infinite zero-length loop */
            if (p2 === pos && count > 0) return -1;
            return rep(count + 1, p2);
          });
          if (r !== -1) return r;
          caps = sc;
          trace.length = st;
        }
        /* fall back: stop here if count in [min, ∞) */
        if (count >= min) return k(pos);
        return -1;
      } else {
        /* lazy: stop first if allowed */
        if (count >= min) {
          var r = k(pos);
          if (r !== -1) return r;
        }
        /* try one more */
        if (count < max && count < REPEAT_LIMIT) {
          var sc = caps.slice();
          var st = trace.length;
          var r2 = go(qnode.child, pos, function (p2) {
            if (p2 === pos && count > 0) return -1;
            return rep(count + 1, p2);
          });
          if (r2 !== -1) return r2;
          caps = sc;
          trace.length = st;
        }
        return -1;
      }
    }

    return rep(0, pos);
  }

  /* run the match */
  var endPos = go(ast, startPos, function (p) { return p; });
  if (endPos === -1) return null;

  return {
    start: startPos,
    end: endPos,
    text: str.slice(startPos, endPos),
    groups: caps.slice(1).map(function (c) {
      if (!c || c.end === -1) return null;
      return { start: c.start, end: c.end, text: str.slice(c.start, c.end) };
    }),
    trace: trace.slice()
  };
};

/* Find all non-overlapping matches (global, left-to-right) */
RS.matchAll = function (ast, str) {
  var results = [];
  var pos = 0;
  while (pos <= str.length) {
    var m = RS._matchAt(ast, str, pos);
    if (m !== null) {
      results.push(m);
      pos = m.end > pos ? m.end : pos + 1;
    } else {
      pos++;
    }
  }
  return results;
};
