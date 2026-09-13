'use strict';
// ── Nit Workspace Analyzer ────────────────────────────────────────────────────
//
// analyzeWorkspace(filesMap) → { globalDefs, diagnostics, refs }
//
// filesMap : Map<filename, { source, tokens, parsed }>
// globalDefs: Map<name, [{file, line, col, kind}]>
// diagnostics: [{file, line, msg, sev}]
// refs:        Map<name, [{file, line, col, isDef}]>

function analyzeWorkspace(filesMap) {
  // ── 1. Collect global definitions ─────────────────────────────────────────
  const globalDefs = new Map(); // name → [{file, line, col, kind}]

  for (const [fname, info] of filesMap) {
    for (const fn of info.parsed.fns) {
      if (!globalDefs.has(fn.name)) globalDefs.set(fn.name, []);
      globalDefs.get(fn.name).push({ file: fname, line: fn.line, col: fn.col, kind: 'fn' });
    }
    for (const v of info.parsed.vars) {
      if (!globalDefs.has(v.name)) globalDefs.set(v.name, []);
      globalDefs.get(v.name).push({ file: fname, line: v.line, col: v.col, kind: 'var' });
    }
  }

  // ── 2. Build import map ────────────────────────────────────────────────────
  // importMap: filename → Set<imported fn name>
  const importMap = new Map();
  for (const [fname, info] of filesMap) {
    const imp = new Set();
    for (const u of info.parsed.uses) {
      const impFile = filesMap.get(u.path);
      if (impFile) {
        for (const fn of impFile.parsed.fns) imp.add(fn.name);
      }
    }
    importMap.set(fname, imp);
  }

  // ── 3. Build refs map ──────────────────────────────────────────────────────
  const refs = new Map(); // name → [{file, line, col, isDef}]
  for (const [fname, info] of filesMap) {
    for (const occ of info.parsed.identOccs) {
      if (!refs.has(occ.name)) refs.set(occ.name, []);
      refs.get(occ.name).push({ file: fname, line: occ.line, col: occ.col, isDef: occ.isDef });
    }
  }

  // ── 4. Diagnostics ─────────────────────────────────────────────────────────
  const diagnostics = [];

  for (const [fname, info] of filesMap) {
    // Unresolved import
    for (const u of info.parsed.uses) {
      if (!filesMap.has(u.path)) {
        diagnostics.push({ file: fname, line: u.line, msg: `Cannot resolve import '${u.path}'`, sev: 'error' });
      }
    }

    // Duplicate fn in same file
    const seenFns = new Map();
    for (const fn of info.parsed.fns) {
      if (seenFns.has(fn.name)) {
        diagnostics.push({ file: fname, line: fn.line, msg: `Duplicate function '${fn.name}'`, sev: 'error' });
      } else {
        seenFns.set(fn.name, fn);
      }
    }

    // Unknown fn call: IDENT ( where IDENT is not in visible scope
    const visible = new Set();
    for (const fn of info.parsed.fns)  visible.add(fn.name);
    for (const v  of info.parsed.vars) visible.add(v.name);
    for (const n  of (importMap.get(fname) || [])) visible.add(n);
    // Params across all fns (rough — avoids false positives inside fn bodies)
    for (const fn of info.parsed.fns) {
      for (const p of fn.params) visible.add(p.name);
    }

    const toks = info.tokens;
    const reported = new Set(); // avoid duplicate messages per name
    for (let k = 0; k < toks.length - 1; k++) {
      const t = toks[k], nx = toks[k + 1];
      if (t.type === TK.IDENT && nx.type === TK.LP) {
        if (!visible.has(t.value) && !reported.has(t.value)) {
          reported.add(t.value);
          diagnostics.push({ file: fname, line: t.line, msg: `Unknown function '${t.value}'`, sev: 'error' });
        }
      }
    }
  }

  return { globalDefs, diagnostics, refs };
}

// getOutline(parsed) → [{name, line, sig}]
function getOutline(parsed) {
  return parsed.fns.map(fn => ({
    name: fn.name,
    line: fn.line,
    sig: `${fn.name}(${fn.params.map(p => p.name).join(', ')})`
  }));
}
