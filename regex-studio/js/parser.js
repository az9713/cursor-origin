/* parser.js — regex AST parser + printer for Session A
 *
 * Grammar (no lookbehind, no named groups):
 *   pattern  ::= alt
 *   alt      ::= concat ("|" concat)*
 *   concat   ::= quantified*
 *   quantified ::= atom quant?
 *   quant    ::= "*" | "+" | "?" | "{" INT ("," INT?)? "}"  (followed by "?"?)
 *   atom     ::= CHAR | "." | "^" | "$" | charclass
 *              | "(" pattern ")"  | "(?:" pattern ")"  | "\" escape
 *   charclass ::= "[" "^"? (CHAR | CHAR "-" CHAR | "\" escape)+ "]"
 *   escape   ::= d|w|s|D|W|S|n|t|\|.|*|+|?|(|)|[|]|{|}|^|$
 *
 * AST node types:
 *   {type:'alt',    alts:[node,...]}
 *   {type:'concat', items:[node,...]}
 *   {type:'quantified', child:node, quant:{min,max,greedy}}  max=Infinity means unbounded
 *   {type:'char',   ch:'a'}
 *   {type:'dot'}
 *   {type:'anchor', kind:'^'|'$'}
 *   {type:'escape', kind:'d'|'w'|'s'|'D'|'W'|'S'}
 *   {type:'escaped_char', ch:'\n'|'\t'|...}
 *   {type:'charclass', negated:bool, ranges:[range,...]}
 *     range: {kind:'char',ch} | {kind:'range',from,to} | {kind:'escape',code:'d'|...}
 *   {type:'group',   index:N, child:node}   (1-based)
 *   {type:'ncgroup', child:node}
 *   {type:'empty'}
 */
window.RS = window.RS || {};

RS.parse = function (src) {
  var pos = 0;
  var groupCount = 0;

  function err(msg) {
    var e = new Error(msg);
    e.index = pos;
    throw e;
  }

  function peek() { return src[pos]; }
  function done() { return pos >= src.length; }
  function eat(ch) {
    if (src[pos] !== ch) err("Expected '" + ch + "', got '" + (src[pos] || 'EOF') + "' at " + pos);
    pos++;
  }

  /* ── top-level ── */
  function parsePattern() { return parseAlt(); }

  function parseAlt() {
    var alts = [parseConcat()];
    while (!done() && src[pos] === '|') {
      pos++;
      alts.push(parseConcat());
    }
    if (alts.length === 1) return alts[0];
    return { type: 'alt', alts: alts };
  }

  function parseConcat() {
    var items = [];
    /* stop at | or ) */
    while (!done() && src[pos] !== '|' && src[pos] !== ')') {
      items.push(parseQuantified());
    }
    if (items.length === 0) return { type: 'empty' };
    if (items.length === 1) return items[0];
    return { type: 'concat', items: items };
  }

  function parseQuantified() {
    var atom = parseAtom();
    if (done()) return atom;
    var ch = src[pos];
    var q = null;
    if (ch === '*') { pos++; q = { min: 0, max: Infinity, greedy: true }; }
    else if (ch === '+') { pos++; q = { min: 1, max: Infinity, greedy: true }; }
    else if (ch === '?') { pos++; q = { min: 0, max: 1,        greedy: true }; }
    else if (ch === '{') {
      var saved = pos;
      pos++;
      var min = readInt();
      if (min === null) { pos = saved; return atom; }
      if (src[pos] === '}') {
        pos++;
        q = { min: min, max: min, greedy: true };
      } else if (src[pos] === ',') {
        pos++;
        if (src[pos] === '}') {
          pos++;
          q = { min: min, max: Infinity, greedy: true };
        } else {
          var max = readInt();
          if (max === null || src[pos] !== '}') { pos = saved; return atom; }
          pos++;
          q = { min: min, max: max, greedy: true };
        }
      } else {
        pos = saved;
        return atom;
      }
    }
    if (q && !done() && src[pos] === '?') { pos++; q.greedy = false; }
    return q ? { type: 'quantified', child: atom, quant: q } : atom;
  }

  function readInt() {
    var s = pos;
    while (!done() && src[pos] >= '0' && src[pos] <= '9') pos++;
    if (pos === s) return null;
    return parseInt(src.slice(s, pos), 10);
  }

  function parseAtom() {
    if (done()) err('Unexpected end of pattern');
    var ch = src[pos];

    if (ch === '(') {
      pos++;
      var nc = (src[pos] === '?' && src[pos + 1] === ':');
      if (nc) pos += 2;
      var idx = nc ? null : ++groupCount;
      var child = parsePattern();
      if (src[pos] !== ')') err("Expected ')' at " + pos);
      pos++;
      return nc
        ? { type: 'ncgroup', child: child }
        : { type: 'group', index: idx, child: child };
    }

    if (ch === '[') return parseCharClass();

    if (ch === '\\') {
      pos++;
      return parseEscape();
    }

    if (ch === '.') { pos++; return { type: 'dot' }; }
    if (ch === '^') { pos++; return { type: 'anchor', kind: '^' }; }
    if (ch === '$') { pos++; return { type: 'anchor', kind: '$' }; }

    /* reject unescaped metacharacters (except { } which can be literal) */
    if (ch === '*' || ch === '+' || ch === '?' || ch === ')' || ch === '|') {
      err("Unexpected metachar '" + ch + "' at " + pos);
    }
    if (ch === ']') err("Unexpected ']' at " + pos);

    /* ordinary character */
    pos++;
    return { type: 'char', ch: ch };
  }

  function parseCharClass() {
    eat('[');
    var neg = false;
    if (src[pos] === '^') { neg = true; pos++; }
    var ranges = [];
    while (!done() && src[pos] !== ']') {
      if (src[pos] === '\\') {
        pos++;
        var code = src[pos++];
        if ('dwsDWS'.indexOf(code) >= 0) {
          /* keep as named escape class for correct matching + roundtrip */
          ranges.push({ kind: 'escape', code: code });
        } else if (code === 'n') {
          ranges.push({ kind: 'char', ch: '\n' });
        } else if (code === 't') {
          ranges.push({ kind: 'char', ch: '\t' });
        } else {
          /* literal escaped char — store as {kind:'char'} so roundtrip is stable:
             print uses _escapeClassChar which re-escapes ] \ ^ - */
          ranges.push({ kind: 'char', ch: code });
        }
      } else {
        var from = src[pos++];
        if (src[pos] === '-' && src[pos + 1] && src[pos + 1] !== ']') {
          pos++; /* consume - */
          var to = src[pos++];
          ranges.push({ kind: 'range', from: from, to: to });
        } else {
          ranges.push({ kind: 'char', ch: from });
        }
      }
    }
    if (src[pos] !== ']') err("Unterminated character class");
    pos++;
    return { type: 'charclass', negated: neg, ranges: ranges };
  }

  function parseEscape() {
    if (done()) err('Unexpected end after \\');
    var ch = src[pos++];
    /* shorthand classes */
    if ('dwsDWS'.indexOf(ch) >= 0) return { type: 'escape', kind: ch };
    /* special chars */
    if (ch === 'n') return { type: 'escaped_char', ch: '\n', raw: 'n' };
    if (ch === 't') return { type: 'escaped_char', ch: '\t', raw: 't' };
    if (ch === 'r') return { type: 'escaped_char', ch: '\r', raw: 'r' };
    /* escaped metacharacters and literals */
    var metaOk = '|.*+?()[]{}\\^$';
    if (metaOk.indexOf(ch) >= 0) return { type: 'escaped_char', ch: ch, raw: ch };
    err("Unknown escape \\" + ch + " at " + (pos - 1));
  }

  var ast = parsePattern();
  if (!done() && src[pos] !== '') {
    err("Unexpected '" + src[pos] + "' at " + pos);
  }
  return ast;
};

/* ══════════════════════════════════════════════
 * Printer: AST → pattern string
 * Must be stable enough that parse→print→parse yields equal AST
 * ══════════════════════════════════════════════ */
RS.print = function (node) {
  if (!node) return '';
  switch (node.type) {
    case 'empty': return '';
    case 'alt':   return node.alts.map(RS.print).join('|');
    case 'concat': return node.items.map(RS.print).join('');
    case 'quantified': return RS.print(node.child) + RS._printQuant(node.quant);

    case 'char':         return RS._escapeAtomChar(node.ch);
    case 'dot':          return '.';
    case 'anchor':       return node.kind;
    case 'escape':       return '\\' + node.kind;
    case 'escaped_char': return '\\' + node.raw;

    case 'charclass':
      return '[' + (node.negated ? '^' : '') +
        node.ranges.map(function (r) {
          if (r.kind === 'char')   return RS._escapeClassChar(r.ch);
          if (r.kind === 'range')  return RS._escapeClassChar(r.from) + '-' + RS._escapeClassChar(r.to);
          if (r.kind === 'escape') return '\\' + r.code;
          return '';
        }).join('') + ']';

    case 'group':   return '(' + RS.print(node.child) + ')';
    case 'ncgroup': return '(?:' + RS.print(node.child) + ')';
    default: return '';
  }
};

RS._printQuant = function (q) {
  var s;
  if (q.min === 0 && q.max === Infinity) s = '*';
  else if (q.min === 1 && q.max === Infinity) s = '+';
  else if (q.min === 0 && q.max === 1)        s = '?';
  else if (q.max === Infinity)                 s = '{' + q.min + ',}';
  else if (q.min === q.max)                    s = '{' + q.min + '}';
  else                                         s = '{' + q.min + ',' + q.max + '}';
  if (!q.greedy) s += '?';
  return s;
};

/* In an atom context, escape metacharacters */
RS._escapeAtomChar = function (ch) {
  /* chars that MUST be escaped outside a class */
  var mustEscape = '\\.^$*+?[]{}()|';
  if (mustEscape.indexOf(ch) >= 0) return '\\' + ch;
  return ch;
};

/* In a charclass, escape ] \ ^ - */
RS._escapeClassChar = function (ch) {
  if (ch === ']' || ch === '\\' || ch === '^' || ch === '-') return '\\' + ch;
  return ch;
};

/* ── Roundtrip helpers ── */
RS.stable = function (v) { return JSON.stringify(v); };

RS.roundtripOk = function (pattern) {
  try {
    var a = RS.parse(pattern);
    var printed = RS.print(a);
    var b = RS.parse(printed);
    return RS.stable(a) === RS.stable(b);
  } catch (e) {
    return false;
  }
};

/* ── human-readable summary for builder chips ── */
RS.nodeSummary = function (node) {
  if (!node) return '∅';
  switch (node.type) {
    case 'char':         return node.ch === ' ' ? '·' : node.ch;
    case 'dot':          return '.';
    case 'anchor':       return node.kind;
    case 'escape':       return '\\' + node.kind;
    case 'escaped_char': return '\\' + node.raw;
    case 'charclass': {
      var inner = (node.negated ? '^' : '') +
        node.ranges.slice(0, 3).map(function (r) {
          if (r.kind === 'char')  return r.ch;
          if (r.kind === 'range') return r.from + '-' + r.to;
          return '\\' + r.code;
        }).join('');
      return '[' + inner + (node.ranges.length > 3 ? '…' : '') + ']';
    }
    case 'group':   return '(#' + node.index + ' ' + RS._childPreview(node.child) + ')';
    case 'ncgroup': return '(?:' + RS._childPreview(node.child) + ')';
    case 'quantified': return RS.nodeSummary(node.child) + RS._printQuant(node.quant);
    case 'concat':  return node.items.map(RS.nodeSummary).join('');
    case 'alt':     return node.alts.map(RS.nodeSummary).join('|');
    case 'empty':   return 'ε';
    default: return '?';
  }
};
RS._childPreview = function (node) {
  var s = RS.print(node || { type: 'empty' });
  return s.length > 12 ? s.slice(0, 12) + '…' : s;
};
