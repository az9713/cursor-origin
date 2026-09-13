'use strict';
// ── Nit Lexer ─────────────────────────────────────────────────────────────────
// tokenize(src) → Token[]
// Token: { type, value, line, col }
// type: keyword string | 'IDENT' | 'NUMBER' | 'STRING' | 'COMMENT' |
//       '(' | ')' | '{' | '}' | ',' | ';' | '=' | 'OP' | 'EOF' | '?'

const TK = Object.freeze({
  FN: 'fn', LET: 'let', RETURN: 'return', USE: 'use',
  IDENT: 'IDENT', NUMBER: 'NUMBER', STRING: 'STRING', COMMENT: 'COMMENT',
  LP: '(', RP: ')', LB: '{', RB: '}',
  COMMA: ',', SEMI: ';', EQ: '=', OP: 'OP',
  EOF: 'EOF', UNK: '?'
});

const KW = new Set([TK.FN, TK.LET, TK.RETURN, TK.USE]);

function tokenize(src) {
  const out = [];
  let i = 0, ln = 1, cl = 1;

  while (i < src.length) {
    const sl = ln, sc = cl;
    const c = src[i];

    // Line comment  --
    if (c === '-' && src[i + 1] === '-') {
      let v = '';
      while (i < src.length && src[i] !== '\n') { v += src[i++]; cl++; }
      out.push({ type: TK.COMMENT, value: v, line: sl, col: sc });
      continue;
    }

    // Newline
    if (c === '\n') { i++; ln++; cl = 1; continue; }
    // Other whitespace
    if (c === ' ' || c === '\r' || c === '\t') { i++; cl++; continue; }

    // Number literal
    if (c >= '0' && c <= '9') {
      let v = '';
      while (i < src.length && (src[i] >= '0' && src[i] <= '9' || src[i] === '.')) {
        v += src[i++]; cl++;
      }
      out.push({ type: TK.NUMBER, value: v, line: sl, col: sc });
      continue;
    }

    // Identifier or keyword
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_') {
      let v = '';
      while (i < src.length) {
        const x = src[i];
        if ((x >= 'A' && x <= 'Z') || (x >= 'a' && x <= 'z') ||
            (x >= '0' && x <= '9') || x === '_') {
          v += x; i++; cl++;
        } else break;
      }
      out.push({ type: KW.has(v) ? v : TK.IDENT, value: v, line: sl, col: sc });
      continue;
    }

    // String literal
    if (c === '"') {
      let v = '"'; i++; cl++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\n') { ln++; cl = 1; v += '\n'; i++; }
        else { v += src[i++]; cl++; }
      }
      if (i < src.length && src[i] === '"') { v += '"'; i++; cl++; }
      out.push({ type: TK.STRING, value: v, line: sl, col: sc });
      continue;
    }

    // Single-character tokens
    const SINGLE = {
      '(': TK.LP, ')': TK.RP, '{': TK.LB, '}': TK.RB,
      ',': TK.COMMA, ';': TK.SEMI, '=': TK.EQ
    };
    if (SINGLE[c]) {
      out.push({ type: SINGLE[c], value: c, line: sl, col: sc });
      i++; cl++;
      continue;
    }

    // Operators  + - *
    if (c === '+' || c === '-' || c === '*') {
      out.push({ type: TK.OP, value: c, line: sl, col: sc });
      i++; cl++;
      continue;
    }

    // Unknown character
    out.push({ type: TK.UNK, value: c, line: sl, col: sc });
    i++; cl++;
  }

  out.push({ type: TK.EOF, value: '', line: ln, col: cl });
  return out;
}
