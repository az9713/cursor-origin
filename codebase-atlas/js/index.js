'use strict';
/* ── Codebase Atlas — Symbol Parser & Index ─────────────────────
   window.SymbolParser exposes:
     parseSymbols(text)             → [{name, line}]
     getFunctionBody(text, name)    → string
     buildIndex(filesMap)           → {defs, refs}
     getCallers(name, index)        → [{callerFn, file, line}]
     getCallees(path, name, files, index) → [{name, definedIn}]
──────────────────────────────────────────────────────────────── */
window.SymbolParser = (function () {

  /* ── Pattern to match named function declarations ────────────
     Matches (at any indentation):
       function foo(
       async function foo(
       export function foo(
       export async function foo(
  ──────────────────────────────────────────────────────────────── */
  var FN_RE = /^[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(/mg;

  /* Words that are NOT user-defined symbols */
  var KEYWORDS = new Set([
    'if','else','for','while','do','switch','case','break','continue',
    'return','new','delete','typeof','instanceof','in','of','throw',
    'try','catch','finally','void','yield','await','async','function',
    'var','let','const','class','extends','import','export','default',
    'null','undefined','true','false','this','super','arguments',
    // built-ins
    'Object','Array','Map','Set','Date','Math','JSON','Promise','Error',
    'TypeError','RangeError','String','Number','Boolean','Symbol',
    'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent',
    'decodeURIComponent','console','window','document','setTimeout',
    'clearTimeout','setInterval','clearInterval','fetch','require'
  ]);

  /* ── parseSymbols(text) ─────────────────────────────────────── */
  function parseSymbols(text) {
    var re = new RegExp(FN_RE.source, 'mg');
    var symbols = [];
    var m;
    while ((m = re.exec(text)) !== null) {
      var line = text.slice(0, m.index).split('\n').length; // 1-indexed
      symbols.push({ name: m[1], line: line });
    }
    return symbols;
  }

  /* ── getFunctionBody(text, symbolName) ──────────────────────── */
  function getFunctionBody(text, symbolName) {
    var lines = text.split('\n');
    var startIdx = -1;
    var depth = 0;
    var inBody = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (startIdx === -1) {
        var re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(/;
        var m = re.exec(line);
        if (m && m[1] === symbolName) {
          startIdx = i;
        }
      }

      if (startIdx !== -1) {
        for (var ci = 0; ci < line.length; ci++) {
          if (line[ci] === '{') { depth++; inBody = true; }
          else if (line[ci] === '}') depth--;
        }
        if (inBody && depth === 0) {
          return lines.slice(startIdx, i + 1).join('\n');
        }
      }
    }

    if (startIdx !== -1) return lines.slice(startIdx).join('\n');
    return '';
  }

  /* ── buildLineToFnMap(text, symbols) ────────────────────────── */
  function buildLineToFnMap(text, symbols) {
    var lineCount = text.split('\n').length;
    var map = new Array(lineCount).fill(null); // 0-indexed → fn name | null

    for (var i = 0; i < symbols.length; i++) {
      var start = symbols[i].line - 1;                           // to 0-indexed
      var end   = symbols[i + 1] ? symbols[i + 1].line - 2 : lineCount - 1;
      for (var l = start; l <= end && l < lineCount; l++) {
        map[l] = symbols[i].name;
      }
    }
    return map;
  }

  /* ── buildIndex(filesMap) ───────────────────────────────────── */
  /* Returns:
       defs  — { symbolName: [{file, line}] }        (where defined)
       refs  — { symbolName: [{file, line, inFn}] }  (where called)
  */
  function buildIndex(filesMap) {
    var defs = Object.create(null); // null-prototype avoids name clashes (constructor, etc.)
    var refs = Object.create(null);

    filesMap.forEach(function (file, path) {
      var text    = file.text;
      var symbols = parseSymbols(text);
      var lineMap = buildLineToFnMap(text, symbols);
      var lines   = text.split('\n');

      // Record definitions
      symbols.forEach(function (sym) {
        if (!defs[sym.name]) defs[sym.name] = [];
        defs[sym.name].push({ file: path, line: sym.line });
      });

      // Record references (all word( patterns)
      var callRe = /\b([A-Za-z_]\w*)\s*\(/g;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var m;
        callRe.lastIndex = 0;
        while ((m = callRe.exec(line)) !== null) {
          var name = m[1];
          if (!KEYWORDS.has(name)) {
            if (!refs[name]) refs[name] = [];
            refs[name].push({ file: path, line: i + 1, inFn: lineMap[i] });
          }
        }
      }
    });

    return { defs: defs, refs: refs };
  }

  /* ── getCallers(symbolName, index) ─────────────────────────── */
  /* Returns functions in OTHER files (or other functions) that
     call symbolName. De-duplicated by (file, callerFn). */
  function getCallers(symbolName, index) {
    var allRefs = index.refs[symbolName] || [];
    var defSet  = new Set(
      (index.defs[symbolName] || []).map(function (d) { return d.file + ':' + d.line; })
    );

    var seen    = new Set();
    var callers = [];

    allRefs.forEach(function (ref) {
      // Skip the definition line itself
      if (defSet.has(ref.file + ':' + ref.line)) return;
      // Skip self-calls (recursive)
      if (ref.inFn === symbolName) return;
      // Must have an enclosing function
      if (!ref.inFn) return;

      var key = ref.file + '::' + ref.inFn;
      if (!seen.has(key)) {
        seen.add(key);
        callers.push({ callerFn: ref.inFn, file: ref.file, line: ref.line });
      }
    });

    return callers;
  }

  /* ── getCallees(filePath, symbolName, filesMap, index) ─────── */
  /* Returns known symbols called inside symbolName's body. */
  function getCallees(filePath, symbolName, filesMap, index) {
    if (!filePath || !symbolName) return [];
    var file = filesMap.get(filePath);
    if (!file) return [];

    var body = getFunctionBody(file.text, symbolName);
    if (!body) return [];

    // Skip first line (the function declaration itself)
    var bodyLines = body.split('\n').slice(1);
    var bodyText  = bodyLines.join('\n');

    var callRe  = /\b([A-Za-z_]\w*)\s*\(/g;
    var found   = new Set();
    var m;
    while ((m = callRe.exec(bodyText)) !== null) {
      var name = m[1];
      if (!KEYWORDS.has(name) && name !== symbolName) {
        found.add(name);
      }
    }

    var callees = [];
    found.forEach(function (name) {
      if (index.defs[name]) {
        callees.push({ name: name, definedIn: index.defs[name] });
      }
    });
    return callees;
  }

  /* ── Public API ─────────────────────────────────────────────── */
  return {
    parseSymbols:    parseSymbols,
    getFunctionBody: getFunctionBody,
    buildIndex:      buildIndex,
    getCallers:      getCallers,
    getCallees:      getCallees
  };

})();
