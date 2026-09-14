'use strict';
// ── HDL Parser & Printer ─────────────────────────────────────────────────────
//
// Grammar:
//   stmt ::= ident "=" "NOT"  ident
//          | ident "=" ("AND"|"OR"|"XOR"|"NAND"|"NOR"|"XNOR") ident ident
//          | ident "=" "IN"  INT          # numbered input switch
//          | ident "=" "OUT" ident        # probe
//          | ident "=" "DFF" ident        # rising-edge D flip-flop
//
// Stmt object: { out: string, op: string, args: Array<string|number> }

const HDL_UNARY  = new Set(['NOT', 'DFF']);
const HDL_BINARY = new Set(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR']);

/**
 * Parse HDL text into an array of stmt objects.
 * @param {string} text
 * @returns {{ stmts: object[], errors: {lineNum:number, msg:string}[] }}
 */
function parseHDL(text) {
  const stmts  = [];
  const errors = [];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    // strip comments and trim
    const line = lines[i].replace(/#.*$/, '').trim();
    if (!line) continue;

    // ident = OP ...
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)(.*)$/);
    if (!m) {
      errors.push({ lineNum, msg: `Syntax error: "${line}"` });
      continue;
    }

    const out  = m[1];
    const op   = m[2].toUpperCase();
    const rest = m[3].trim().split(/\s+/).filter(Boolean);

    let stmt;
    try {
      if (op === 'IN') {
        if (rest.length < 1) throw new Error('IN expects an integer index');
        const n = parseInt(rest[0], 10);
        if (isNaN(n)) throw new Error(`IN index must be an integer, got "${rest[0]}"`);
        stmt = { out, op: 'IN', args: [n] };

      } else if (op === 'OUT') {
        if (rest.length < 1 || !/^[A-Za-z_]/.test(rest[0]))
          throw new Error('OUT expects a signal name');
        stmt = { out, op: 'OUT', args: [rest[0]] };

      } else if (HDL_UNARY.has(op)) {
        if (rest.length < 1) throw new Error(`${op} expects 1 argument`);
        stmt = { out, op, args: [rest[0]] };

      } else if (HDL_BINARY.has(op)) {
        if (rest.length < 2) throw new Error(`${op} expects 2 arguments`);
        stmt = { out, op, args: [rest[0], rest[1]] };

      } else {
        throw new Error(`Unknown operator "${op}"`);
      }
    } catch (e) {
      errors.push({ lineNum, msg: e.message });
      continue;
    }

    stmts.push(stmt);
  }

  return { stmts, errors };
}

/**
 * Print stmt array back to canonical HDL text.
 * parse(print(stmts)).stmts deep-equals stmts for valid stmts (roundtrip).
 * @param {object[]} stmts
 * @returns {string}
 */
function printHDL(stmts) {
  return stmts.map(s => {
    if (s.op === 'IN')          return `${s.out} = IN ${s.args[0]}`;
    if (s.op === 'OUT')         return `${s.out} = OUT ${s.args[0]}`;
    if (HDL_UNARY.has(s.op))   return `${s.out} = ${s.op} ${s.args[0]}`;
    /* binary */                return `${s.out} = ${s.op} ${s.args[0]} ${s.args[1]}`;
  }).join('\n');
}

/**
 * Verify roundtrip: parse(print(stmts)) === stmts (structural equality).
 * Returns true if the invariant holds.
 */
function checkRoundtrip(stmts) {
  try {
    const { stmts: re } = parseHDL(printHDL(stmts));
    return JSON.stringify(re) === JSON.stringify(stmts);
  } catch { return false; }
}
