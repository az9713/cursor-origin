'use strict';
// ── Nit Parser ────────────────────────────────────────────────────────────────
// parseFile(tokens) → { uses, fns, vars, identOccs, errors }
//
// uses:      [{path, line, col}]                         use "file.nit" stmts
// fns:       [{name, line, col, params:[{name,line,col}]}]  fn declarations
// vars:      [{name, line, col}]                         let declarations (any scope)
// identOccs: [{name, line, col, isDef}]                  every IDENT occurrence
// errors:    [{msg, line}]                               parse errors

function parseFile(tokens) {
  // Strip comments for the parse pass; keep them available for highlight only
  const toks = tokens.filter(t => t.type !== TK.COMMENT);
  const EOF_TOK = { type: TK.EOF, value: '', line: 0, col: 0 };

  const uses = [], fns = [], vars = [], identOccs = [], errors = [];
  let pos = 0;

  const peek = (off = 0) => toks[pos + off] || EOF_TOK;
  const eat = () => toks[pos++] || EOF_TOK;

  function expect(type) {
    if (peek().type !== type) {
      const t = peek();
      errors.push({ msg: `Expected '${type}', got '${t.value || t.type}'`, line: t.line });
      return EOF_TOK;
    }
    return eat();
  }

  function addOcc(tok, isDef) {
    identOccs.push({ name: tok.value, line: tok.line, col: tok.col, isDef: !!isDef });
  }

  // ── Expression parsing ────────────────────────────────────────────────────
  function parseExpr() {
    parsePrimary();
    // Handle binary op chains:  expr op expr
    while (peek().type === TK.OP) {
      eat(); // consume operator
      parsePrimary();
    }
  }

  function parsePrimary() {
    const t = peek();

    if (t.type === TK.NUMBER || t.type === TK.STRING) { eat(); return; }

    if (t.type === TK.IDENT) {
      eat();
      if (peek().type === TK.LP) {
        // Function call: name(args...)
        addOcc(t, false);
        eat(); // (
        while (peek().type !== TK.RP && peek().type !== TK.EOF) {
          parseExpr();
          if (peek().type === TK.COMMA) eat(); else break;
        }
        if (peek().type === TK.RP) eat();
      } else {
        addOcc(t, false);
      }
      return;
    }

    if (t.type === TK.LP) {
      eat(); parseExpr();
      if (peek().type === TK.RP) eat();
      return;
    }

    // Anything else in primary position: skip if safe to avoid infinite loops
    if (t.type !== TK.EOF && t.type !== TK.SEMI &&
        t.type !== TK.RB  && t.type !== TK.RP) {
      eat();
    }
  }

  // ── Statement parsing ─────────────────────────────────────────────────────
  function parseStmt() {
    const t = peek();

    // let NAME = expr ;
    if (t.type === TK.LET) {
      eat();
      const nt = peek();
      if (nt.type === TK.IDENT) {
        eat();
        addOcc(nt, true); // declaration
        vars.push({ name: nt.value, line: nt.line, col: nt.col });
        if (peek().type === TK.EQ) eat();
        parseExpr();
      }
      if (peek().type === TK.SEMI) eat();
      return;
    }

    // return expr ;
    if (t.type === TK.RETURN) {
      eat();
      parseExpr();
      if (peek().type === TK.SEMI) eat();
      return;
    }

    // IDENT = expr ;   or   IDENT(...) ;   or   expr-stmt
    if (t.type === TK.IDENT) {
      eat();
      if (peek().type === TK.EQ) {
        // Assignment
        addOcc(t, false);
        eat(); parseExpr();
      } else if (peek().type === TK.LP) {
        // Call statement
        addOcc(t, false);
        eat();
        while (peek().type !== TK.RP && peek().type !== TK.EOF) {
          parseExpr();
          if (peek().type === TK.COMMA) eat(); else break;
        }
        if (peek().type === TK.RP) eat();
      } else {
        addOcc(t, false);
        parseExpr(); // e.g. ident + ident
      }
      if (peek().type === TK.SEMI) eat();
      return;
    }

    // Unexpected: skip one token for error recovery
    if (t.type !== TK.EOF && t.type !== TK.RB) {
      errors.push({ msg: `Unexpected '${t.value || t.type}' in statement`, line: t.line });
      eat();
    }
  }

  // ── Block  { stmts... } ───────────────────────────────────────────────────
  function parseBlock() {
    expect(TK.LB);
    while (peek().type !== TK.RB && peek().type !== TK.EOF) parseStmt();
    expect(TK.RB);
  }

  // ── Top-level ─────────────────────────────────────────────────────────────
  while (peek().type !== TK.EOF) {
    const t = peek();

    // use "path.nit" ;
    if (t.type === TK.USE) {
      eat();
      const pt = peek();
      if (pt.type === TK.STRING) {
        eat();
        uses.push({ path: pt.value.slice(1, -1), line: t.line, col: t.col });
      } else {
        errors.push({ msg: `Expected string after 'use'`, line: t.line });
      }
      if (peek().type === TK.SEMI) eat();
      continue;
    }

    // fn NAME ( params? ) block
    if (t.type === TK.FN) {
      eat();
      const nt = peek();
      if (nt.type === TK.IDENT) {
        eat();
        addOcc(nt, true); // fn name is a declaration
        const params = [];
        if (peek().type === TK.LP) {
          eat();
          while (peek().type !== TK.RP && peek().type !== TK.EOF) {
            const pt = peek();
            if (pt.type === TK.IDENT) {
              eat();
              addOcc(pt, true); // param is a declaration
              params.push({ name: pt.value, line: pt.line, col: pt.col });
              if (peek().type === TK.COMMA) eat();
            } else { eat(); break; }
          }
          if (peek().type === TK.RP) eat();
        }
        fns.push({ name: nt.value, line: nt.line, col: nt.col, params });
        if (peek().type === TK.LB) parseBlock();
      } else {
        errors.push({ msg: `Expected function name after 'fn'`, line: t.line });
      }
      continue;
    }

    // Top-level let (unusual but allowed by grammar)
    if (t.type === TK.LET) {
      eat();
      const nt = peek();
      if (nt.type === TK.IDENT) {
        eat();
        addOcc(nt, true);
        vars.push({ name: nt.value, line: nt.line, col: nt.col });
        if (peek().type === TK.EQ) eat();
        parseExpr();
      }
      if (peek().type === TK.SEMI) eat();
      continue;
    }

    // Unexpected at top level: skip for recovery
    errors.push({ msg: `Unexpected '${t.value || t.type}' at top level`, line: t.line });
    eat();
  }

  return { uses, fns, vars, identOccs, errors };
}
