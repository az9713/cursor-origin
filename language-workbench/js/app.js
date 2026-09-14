'use strict';
// ── Language Workbench · app.js ───────────────────────────────────────────────

// ── State ─────────────────────────────────────────────────────────────────────
const st = {
  files:      {},        // filename → source string
  tokens:     {},        // filename → Token[]
  parsed:     {},        // filename → ParseResult
  openFiles:  [],        // ordered list of open filenames
  activeFile: null,      // currently visible file
  dirty:      new Set(), // filenames with unsaved changes
  analysis:   null       // latest AnalysisResult
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const byId = id => document.getElementById(id);

const elFileTree  = byId('file-tree');
const elTabs      = byId('tabs');
const elEditorHL  = byId('editor-hl');
const elEditorTA  = byId('editor-ta');
const elNoFile    = byId('no-file');
const elOutline   = byId('outline');
const elDiagList  = byId('diag-list');
const elActResult = byId('act-result');
const elRenameIn  = byId('rename-in');
const elSBFile    = byId('sb-file');
const elSBPos     = byId('sb-pos');
const elSBDiag    = byId('sb-diag');

// ── Utilities ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Syntax highlight builder ──────────────────────────────────────────────────
const TK_CLASS = {
  [TK.FN]:     'tk-kw',
  [TK.LET]:    'tk-kw',
  [TK.RETURN]: 'tk-kw',
  [TK.USE]:    'tk-kw',
  [TK.STRING]: 'tk-str',
  [TK.NUMBER]: 'tk-num',
  [TK.COMMENT]:'tk-cmt'
};

function buildHighlight(src, toks) {
  // Pre-compute byte offset for each line start
  const lineOff = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') lineOff.push(i + 1);
  }
  const off = (ln, cl) => (lineOff[ln - 1] || 0) + (cl - 1);

  let html = '', prev = 0;
  for (const t of toks) {
    if (t.type === TK.EOF) break;
    const start = off(t.line, t.col);
    if (start >= src.length) break;
    if (start > prev) html += esc(src.slice(prev, start));
    const end = start + t.value.length;
    const cls = TK_CLASS[t.type];
    html += cls
      ? `<span class="${cls}">${esc(t.value)}</span>`
      : esc(t.value);
    prev = end;
  }
  if (prev < src.length) html += esc(src.slice(prev));
  return html + '\n'; // trailing newline keeps height aligned with textarea
}

// ── Parse & analyze ───────────────────────────────────────────────────────────
function reparseFile(fname) {
  const src = st.files[fname] || '';
  const toks = tokenize(src);
  st.tokens[fname] = toks;
  st.parsed[fname] = parseFile(toks);
}

function analyzeAll() {
  const map = new Map();
  for (const fname of Object.keys(st.files)) {
    map.set(fname, {
      source: st.files[fname],
      tokens: st.tokens[fname] || [],
      parsed: st.parsed[fname] || { uses: [], fns: [], vars: [], identOccs: [], errors: [] }
    });
  }
  st.analysis = analyzeWorkspace(map);
}

// ── Render: file tree ─────────────────────────────────────────────────────────
function renderFileTree() {
  const names = Object.keys(st.files).sort();
  elFileTree.innerHTML = names.map(fname => {
    const active = fname === st.activeFile ? ' active' : '';
    const dirty  = st.dirty.has(fname) ? ' show' : '';
    return `<div class="ft-item${active}" data-f="${esc(fname)}">` +
           `<span class="ft-dot${dirty}"></span>` +
           `<span>${esc(fname)}</span>` +
           `</div>`;
  }).join('');

  elFileTree.querySelectorAll('.ft-item').forEach(el => {
    el.addEventListener('click', () => openFile(el.dataset.f));
  });
}

// ── Render: tabs ──────────────────────────────────────────────────────────────
function renderTabs() {
  elTabs.innerHTML = st.openFiles.map(fname => {
    const active = fname === st.activeFile ? ' active' : '';
    const dirty  = st.dirty.has(fname);
    return `<div class="tab${active}" data-f="${esc(fname)}">` +
           (dirty ? `<span class="tab-dirty">●</span>` : '') +
           `<span>${esc(fname)}</span>` +
           `<span class="tab-close" data-close="${esc(fname)}">✕</span>` +
           `</div>`;
  }).join('');

  elTabs.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.tab-close')) return;
      openFile(el.dataset.f);
    });
  });
  elTabs.querySelectorAll('.tab-close').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      closeFile(el.dataset.close);
    });
  });
}

// ── Render: outline ───────────────────────────────────────────────────────────
function renderOutline() {
  if (!st.activeFile || !st.parsed[st.activeFile]) {
    elOutline.innerHTML = '<div class="ol-empty">—</div>';
    return;
  }
  const items = getOutline(st.parsed[st.activeFile]);
  if (!items.length) {
    elOutline.innerHTML = '<div class="ol-empty">No functions</div>';
    return;
  }
  elOutline.innerHTML = items.map(fn =>
    `<div class="ol-item" data-line="${fn.line}">` +
    `<span class="ol-kw">fn</span>` +
    `<span>${esc(fn.sig)}</span>` +
    `</div>`
  ).join('');

  elOutline.querySelectorAll('.ol-item').forEach(el => {
    el.addEventListener('click', () => goToLine(st.activeFile, +el.dataset.line));
  });
}

// ── Render: diagnostics ───────────────────────────────────────────────────────
function renderDiagnostics() {
  if (!st.analysis || !st.analysis.diagnostics.length) {
    elDiagList.innerHTML = '<div class="diag-empty">✓ No issues</div>';
    elSBDiag.textContent = '';
    elSBDiag.className = 'sb-ok';
    return;
  }
  const diags = st.analysis.diagnostics;
  elDiagList.innerHTML = diags.map((d, i) =>
    `<div class="diag-item" data-i="${i}">` +
    `<span class="diag-icon">✕</span>` +
    `<div class="diag-body">` +
    `<div class="diag-msg">${esc(d.msg)}</div>` +
    `<div class="diag-loc">${esc(d.file)}:${d.line}</div>` +
    `</div></div>`
  ).join('');

  elDiagList.querySelectorAll('.diag-item').forEach(el => {
    const d = diags[+el.dataset.i];
    el.addEventListener('click', () => goToLine(d.file, d.line));
  });

  const errN = diags.filter(d => d.sev === 'error').length;
  elSBDiag.textContent = `${errN} error${errN !== 1 ? 's' : ''}`;
  elSBDiag.className = 'sb-err';
}

// ── Render: editor ────────────────────────────────────────────────────────────
function renderEditor() {
  const hasFile = !!st.activeFile && (st.activeFile in st.files);
  elEditorHL.style.display  = hasFile ? '' : 'none';
  elEditorTA.style.display  = hasFile ? '' : 'none';
  elNoFile.style.display    = hasFile ? 'none' : 'flex';

  if (hasFile) {
    const src = st.files[st.activeFile];
    elEditorTA.value = src;
    elEditorHL.innerHTML = buildHighlight(src, st.tokens[st.activeFile] || []);
    syncScroll();
    elEditorTA.focus();
  }
}

// ── Full re-render (use when switching files, resetting, etc.) ────────────────
function renderAll() {
  renderFileTree();
  renderTabs();
  renderOutline();
  renderDiagnostics();
  renderEditor();
}

// ── Lightweight re-render after in-place edits (don't reset textarea.value) ──
function renderAfterEdit() {
  renderTabs();
  renderFileTree();
  renderOutline();
  renderDiagnostics();
  if (st.activeFile) {
    elEditorHL.innerHTML = buildHighlight(
      st.files[st.activeFile],
      st.tokens[st.activeFile] || []
    );
    syncScroll();
  }
}

// ── File operations ───────────────────────────────────────────────────────────
function openFile(fname) {
  if (!(fname in st.files)) return;
  if (!st.openFiles.includes(fname)) st.openFiles.push(fname);
  st.activeFile = fname;
  setHash(fname);
  renderAll();
  elSBFile.textContent = fname;
  elSBFile.className = 'sb-fname';
  schedSave();
}

function closeFile(fname) {
  st.openFiles = st.openFiles.filter(f => f !== fname);
  if (st.activeFile === fname) {
    st.activeFile = st.openFiles[st.openFiles.length - 1] || null;
    if (st.activeFile) setHash(st.activeFile);
    else location.hash = '';
  }
  renderAll();
  schedSave();
}

// ── Editor events ─────────────────────────────────────────────────────────────
elEditorTA.addEventListener('input', () => {
  if (!st.activeFile) return;
  const src = elEditorTA.value;
  st.files[st.activeFile] = src;
  st.dirty.add(st.activeFile);
  reparseFile(st.activeFile);
  analyzeAll();
  renderAfterEdit();
  schedSave();
});

elEditorTA.addEventListener('scroll', syncScroll);
elEditorTA.addEventListener('click',  updatePos);
elEditorTA.addEventListener('keyup',  updatePos);

function syncScroll() {
  elEditorHL.scrollTop  = elEditorTA.scrollTop;
  elEditorHL.scrollLeft = elEditorTA.scrollLeft;
}

function updatePos() {
  const off    = elEditorTA.selectionStart;
  const before = elEditorTA.value.slice(0, off);
  const lines  = before.split('\n');
  elSBPos.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goToLine(fname, targetLine) {
  if (!(fname in st.files)) return;
  if (!st.openFiles.includes(fname)) st.openFiles.push(fname);
  const needSwitch = st.activeFile !== fname;
  st.activeFile = fname;
  if (needSwitch) setHash(fname);

  if (needSwitch) {
    renderAll();
    elSBFile.textContent = fname;
    elSBFile.className = 'sb-fname';
  }

  requestAnimationFrame(() => {
    const src  = st.files[fname] || '';
    const rows = src.split('\n');
    let off = 0;
    for (let i = 0; i < Math.min(targetLine - 1, rows.length); i++) {
      off += rows[i].length + 1;
    }
    elEditorTA.selectionStart = elEditorTA.selectionEnd = off;
    const lh = parseFloat(getComputedStyle(elEditorTA).lineHeight) || 22;
    elEditorTA.scrollTop = Math.max(0, (targetLine - 1) * lh - elEditorTA.clientHeight / 3);
    syncScroll();
    elEditorTA.focus();
    updatePos();
  });
}

// ── Word at cursor ────────────────────────────────────────────────────────────
function wordAtCursor() {
  const { selectionStart, value } = elEditorTA;
  let s = selectionStart, e = selectionStart;
  while (s > 0 && /[A-Za-z0-9_]/.test(value[s - 1])) s--;
  while (e < value.length && /[A-Za-z0-9_]/.test(value[e])) e++;
  const w = value.slice(s, e);
  return /^[A-Za-z_]/.test(w) ? w : null;
}

const RESERVED = new Set(['fn', 'let', 'return', 'use']);

// ── Actions ───────────────────────────────────────────────────────────────────
byId('btn-goto').addEventListener('click', () => {
  const name = wordAtCursor();
  if (!name) return showResult('Place cursor on an identifier first');
  if (RESERVED.has(name)) return showResult(`'${name}' is a language keyword`);
  if (!st.analysis) return;

  const defs = st.analysis.globalDefs.get(name);
  if (!defs || !defs.length) {
    return showResult(`No definition found for '${esc(name)}'`);
  }
  // Prefer definition in current file; otherwise first found
  const def = defs.find(d => d.file === st.activeFile) || defs[0];
  goToLine(def.file, def.line);
  showResult(`→ ${esc(def.file)}:${def.line}  <em>(${def.kind})</em>`);
});

byId('btn-refs').addEventListener('click', () => {
  const name = wordAtCursor();
  if (!name) return showResult('Place cursor on an identifier first');
  if (RESERVED.has(name)) return showResult(`'${name}' is a language keyword`);
  if (!st.analysis) return;

  const occs = st.analysis.refs.get(name);
  if (!occs || !occs.length) return showResult(`No references found for '${esc(name)}'`);

  const items = occs.map(r =>
    `<div class="act-result-item" data-f="${esc(r.file)}" data-l="${r.line}">` +
    `${esc(r.file)}:${r.line}` +
    (r.isDef ? ` <em>(def)</em>` : '') +
    `</div>`
  ).join('');

  elActResult.innerHTML =
    `<div class="act-result-hdr">${occs.length} reference(s) of '${esc(name)}'</div>` + items;
  elActResult.classList.add('show');

  elActResult.querySelectorAll('.act-result-item').forEach(el => {
    el.addEventListener('click', () => goToLine(el.dataset.f, +el.dataset.l));
  });
});

byId('btn-rename').addEventListener('click', () => {
  const target  = elRenameIn.dataset.target || wordAtCursor();
  const newName = elRenameIn.value.trim();
  if (!target)  return showResult('Place cursor on an identifier first');
  if (RESERVED.has(target)) return showResult(`'${target}' is a language keyword`);
  if (!newName) return showResult('Enter a new name in the field below');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) return showResult('Invalid identifier (letters, digits, _ only)');
  if (RESERVED.has(newName)) return showResult(`'${newName}' is a reserved keyword`);
  if (target === newName) return showResult('New name is the same — nothing changed');

  doRename(target, newName);
  elRenameIn.value = '';
  elRenameIn.dataset.target = '';
  elRenameIn.placeholder = 'New name…';
  showResult(`Renamed '${esc(target)}' → '${esc(newName)}' across all files`);
});

// When user focuses the rename input, capture current word as the rename target
elRenameIn.addEventListener('focus', () => {
  const w = wordAtCursor();
  if (w && !RESERVED.has(w)) {
    elRenameIn.dataset.target = w;
    elRenameIn.placeholder = `New name for '${w}'…`;
  }
});

function showResult(htmlOrText) {
  const isHtml = htmlOrText.includes('<');
  elActResult.innerHTML = isHtml
    ? `<div class="act-result-hdr">&nbsp;</div><div class="act-result-item" style="cursor:default;pointer-events:none">${htmlOrText}</div>`
    : `<div class="act-result-hdr">&nbsp;</div><div class="act-result-item" style="cursor:default;pointer-events:none">${esc(htmlOrText)}</div>`;
  elActResult.classList.add('show');
}

function doRename(oldName, newName) {
  for (const fname of Object.keys(st.files)) {
    const src = st.files[fname];
    const toks = tokenize(src);
    const hits = toks.filter(t => t.type === TK.IDENT && t.value === oldName);
    if (!hits.length) continue;

    const lines = src.split('\n');
    function offset(line, col) {
      let o = 0;
      for (let i = 0; i < line - 1; i++) o += lines[i].length + 1;
      return o + (col - 1);
    }

    const spans = hits.map(t => {
      const start = offset(t.line, t.col);
      return { start, end: start + oldName.length };
    }).sort((a, b) => b.start - a.start);

    let next = src;
    for (const s of spans) {
      next = next.slice(0, s.start) + newName + next.slice(s.end);
    }
    if (next !== src) {
      st.files[fname] = next;
      st.dirty.add(fname);
      reparseFile(fname);
    }
  }
  analyzeAll();
  renderAll();
}

// ── Extract Function helpers ──────────────────────────────────────────────────

/**
 * Count unmatched '{' braces before character `offset` in src,
 * skipping over string literals and line comments so they don't skew depth.
 */
function braceDepthAt(src, offset) {
  let depth = 0, i = 0;
  while (i < offset && i < src.length) {
    const c = src[i];
    // Skip line comments  -- ...
    if (c === '-' && src[i + 1] === '-') {
      while (i < offset && i < src.length && src[i] !== '\n') i++;
      continue;
    }
    // Skip string literals (single-line in Nit: " ... ")
    if (c === '"') {
      i++;
      while (i < offset && i < src.length && src[i] !== '"' && src[i] !== '\n') i++;
      if (i < src.length && src[i] === '"') i++;
      continue;
    }
    if      (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return Math.max(0, depth);
}

/**
 * Return free identifiers in `selText`:
 * all IDENT tokens that are NOT declared by `let` inside the selection.
 * Order follows first appearance.
 */
function inferParams(selText) {
  const toks = tokenize(selText).filter(t => t.type !== TK.COMMENT && t.type !== TK.EOF);

  // Collect names introduced by `let NAME`
  const declared = new Set();
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i].type === TK.LET && toks[i + 1].type === TK.IDENT) {
      declared.add(toks[i + 1].value);
    }
  }

  // Walk tokens in order; yield first occurrence of each free IDENT
  const seen = new Set();
  const params = [];
  for (const t of toks) {
    if (t.type === TK.IDENT && !declared.has(t.value) && !seen.has(t.value)) {
      seen.add(t.value);
      params.push(t.value);
    }
  }
  return params;
}

/**
 * Return the character offset immediately after the closing `}` of the last
 * top-level fn in src.  Falls back to src.length if no fns exist.
 */
function findInsertionPoint(src) {
  // Build line→byte-offset table
  const lineOff = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') lineOff.push(i + 1);
  }
  const toCharOff = (line, col) => (lineOff[line - 1] || 0) + (col - 1);

  const toks = tokenize(src).filter(t => t.type !== TK.COMMENT);
  let lastRBOff = -1;
  let depth     = 0;
  let inTopFn   = false;

  for (const t of toks) {
    if (t.type === TK.EOF) break;
    if (t.type === TK.FN  && depth === 0) inTopFn = true;
    if (t.type === TK.LB) {
      depth++;
    } else if (t.type === TK.RB) {
      depth--;
      if (depth === 0 && inTopFn) {
        lastRBOff = toCharOff(t.line, t.col) + 1; // byte right after the }
        inTopFn   = false;
      }
    }
  }

  return lastRBOff >= 0 ? lastRBOff : src.length;
}

/**
 * Strip the common leading whitespace from every non-blank line in `text`,
 * then prepend `indent` to each line.
 */
function reindentLines(text, indent) {
  const lines = text.split('\n');
  let minInd = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^(\s*)/);
    if (m && m[1].length < minInd) minInd = m[1].length;
  }
  if (!isFinite(minInd)) minInd = 0;
  return lines
    .map(line => (line.trim() ? indent + line.slice(minInd) : ''))
    .join('\n');
}

// ── Extract Function action ───────────────────────────────────────────────────
byId('btn-extract').addEventListener('click', () => {
  if (!st.activeFile) return showResult('No file open');

  const src      = st.files[st.activeFile];
  const selStart = elEditorTA.selectionStart;
  const selEnd   = elEditorTA.selectionEnd;

  // Guard: non-empty selection required
  if (selStart === selEnd) return showResult('Select statements to extract first');

  const selText = src.slice(selStart, selEnd);
  if (!selText.trim()) return showResult('Selection is empty');

  // Guard: selection must be inside a { } block (i.e. a function body)
  if (braceDepthAt(src, selStart) === 0)
    return showResult('Selection must be inside a function body { … }');

  // Infer params = free identifiers not declared by let inside the selection
  const params    = inferParams(selText);
  const paramList = params.join(', ');

  // Pick a unique name  extracted_N
  const parsed = st.parsed[st.activeFile];
  const existingNames = new Set((parsed ? parsed.fns : []).map(f => f.name));
  let n = 1;
  while (existingNames.has('extracted_' + n)) n++;
  const fnName = 'extracted_' + n;

  // Find insertion point (right after the last top-level fn's closing })
  let insertOff = findInsertionPoint(src);
  if (insertOff < selEnd) insertOff = src.length; // safety: should never trigger

  // Build extracted function text
  const bodyText = reindentLines(selText.trimEnd(), '  ');
  const newFn    = '\nfn ' + fnName + '(' + paramList + ') {\n' + bodyText + '\n}\n';

  // Call statement that replaces the selection
  const callStmt = fnName + '(' + paramList + ');';

  // Step 1: replace selection with call statement in a temporary copy
  const afterReplace = src.slice(0, selStart) + callStmt + src.slice(selEnd);

  // Step 2: adjust insertion offset for the length delta introduced by step 1
  const insertOffAdj = insertOff + (callStmt.length - (selEnd - selStart));

  // Step 3: splice the new function in at the adjusted offset
  const newSrc = afterReplace.slice(0, insertOffAdj) + newFn + afterReplace.slice(insertOffAdj);

  // Commit the change
  st.files[st.activeFile] = newSrc;
  st.dirty.add(st.activeFile);
  reparseFile(st.activeFile);
  analyzeAll();
  renderAll();
  schedSave();

  // Restore cursor to the call site
  requestAnimationFrame(() => {
    elEditorTA.selectionStart = elEditorTA.selectionEnd = selStart;
    elEditorTA.focus();
    updatePos();
  });

  showResult('Extracted \u2192 fn ' + esc(fnName) + '(' + esc(paramList) + ')');
});

// ── Reset ─────────────────────────────────────────────────────────────────────
byId('btn-reset').addEventListener('click', () => {
  if (!confirm('Reset workspace to seed files? All edits will be lost.')) return;
  const ws = resetWS();
  Object.assign(st, {
    files:      ws.files,
    tokens:     {},
    parsed:     {},
    openFiles:  ws.openFiles,
    activeFile: ws.activeFile,
    dirty:      new Set(),
    analysis:   null
  });
  for (const fname of Object.keys(st.files)) reparseFile(fname);
  analyzeAll();
  setHash(ws.activeFile);
  renderAll();
  elSBFile.textContent = ws.activeFile;
  elSBFile.className = 'sb-fname';
  elActResult.classList.remove('show');
  elRenameIn.value = '';
});

// ── Persistence ───────────────────────────────────────────────────────────────
let saveTimer = null;
function schedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveWS({ files: st.files, openFiles: st.openFiles, activeFile: st.activeFile });
    st.dirty.clear();
    renderTabs();
    renderFileTree();
  }, 1500);
}

// ── Hash routing ──────────────────────────────────────────────────────────────
function setHash(fname) {
  history.replaceState(null, '', '#/f/' + encodeURIComponent(fname));
}

function handleHash() {
  const h = location.hash;
  if (h.startsWith('#/f/')) {
    const fname = decodeURIComponent(h.slice(4));
    if (fname in st.files) {
      if (!st.openFiles.includes(fname)) st.openFiles.push(fname);
      st.activeFile = fname;
      return true;
    }
  }
  return false;
}

window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (h.startsWith('#/f/')) {
    const fname = decodeURIComponent(h.slice(4));
    if (fname in st.files) openFile(fname);
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // F12 or Alt+D → Go to Definition
  if (e.key === 'F12' || (e.altKey && e.key === 'd')) {
    e.preventDefault();
    byId('btn-goto').click();
  }
  // Alt+R → Find References
  if (e.altKey && e.key === 'r') {
    e.preventDefault();
    byId('btn-refs').click();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  const ws = initWS();
  st.files      = ws.files;
  st.openFiles  = Array.isArray(ws.openFiles) ? [...ws.openFiles] : [];
  st.activeFile = ws.activeFile || null;

  // Parse every file
  for (const fname of Object.keys(st.files)) reparseFile(fname);
  analyzeAll();

  // Override active file from URL hash if present; otherwise publish it
  handleHash();
  if (st.activeFile) setHash(st.activeFile);

  renderAll();

  if (st.activeFile) {
    elSBFile.textContent = st.activeFile;
    elSBFile.className   = 'sb-fname';
  }
})();
