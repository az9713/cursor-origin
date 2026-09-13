'use strict';
/* ── Codebase Atlas — Main Application ─────────────────────────
   Depends on: window.Seed (seed.js), window.SymbolParser (index.js)
──────────────────────────────────────────────────────────────── */
(function () {

  var STORAGE_KEY = 'codebase-atlas-v1';

  /* ── State ─────────────────────────────────────────────────── */
  var S = {
    files:          new Map(),   // path → {path, language, text}
    activeFile:     null,        // currently open file path
    activeSymbol:   null,        // selected symbol name
    editMode:       false,       // editor in edit mode?
    editBuffer:     null,        // unsaved textarea content
    folderExp:      {},          // folderKey → true (expanded)
    index:          { defs: {}, refs: {} },
    palResults:     [],          // current palette results
    palSel:         0,           // selected index
    renTarget:      null         // symbol being renamed
  };

  /* ── Storage ────────────────────────────────────────────────── */
  function saveFiles() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([].concat(
        Array.from(S.files.values())
      )));
    } catch (e) { console.warn('Save failed:', e.message); }
  }

  function loadFiles() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (arr && arr.length >= 350) {
          arr.forEach(function (f) { S.files.set(f.path, f); });
          return true;
        }
      }
    } catch (e) { /* fall through to seed */ }
    return false;
  }

  function seedFiles() {
    var arr = window.Seed.generate();
    arr.forEach(function (f) { S.files.set(f.path, f); });
    saveFiles();
  }

  /* ── Index ──────────────────────────────────────────────────── */
  function rebuildIndex() {
    S.index = window.SymbolParser.buildIndex(S.files);
  }

  /* ── Syntax highlighting ────────────────────────────────────── */
  var KW = 'return|const|let|var|if|else|for|while|do|switch|case|break|continue' +
           '|new|delete|typeof|instanceof|in|of|throw|try|catch|finally|async|await' +
           '|export|import|class|extends|null|undefined|true|false|this|function';
  var KW_RE = new RegExp('\\b(' + KW + ')\\b', 'g');

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function highlightLine(line) {
    // Detect comment start (outside strings – simplified but works for gen'd code)
    var commentIdx = line.indexOf('//');
    var code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    var comment = commentIdx >= 0 ? line.slice(commentIdx) : '';

    // Escape
    code = escHtml(code);

    // Strings (single/double quoted)
    code = code.replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g,
      '<span class="s">$1</span>');

    // function Name( → keyword + fn name
    code = code.replace(
      /\b(function)\s+([A-Za-z_]\w*)/g,
      '<span class="k">$1</span> <span class="fn">$2</span>'
    );

    // Other keywords (avoid replacing inside spans - simple approach)
    code = code.replace(KW_RE, '<span class="k">$1</span>');

    // Numbers
    code = code.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="n">$1</span>');

    if (comment) {
      return code + '<span class="c">' + escHtml(comment) + '</span>';
    }
    return code;
  }

  function highlight(text) {
    return text.split('\n').map(highlightLine).join('\n');
  }

  /* ── File tree ───────────────────────────────────────────────── */
  function buildTreeData(paths) {
    var root = {};
    paths.slice().sort().forEach(function (path) {
      var parts = path.split('/');
      var node = root;
      for (var i = 0; i < parts.length - 1; i++) {
        var p = parts[i];
        if (!node[p]) node[p] = { _d: true, ch: {} };
        node = node[p].ch;
      }
      var fname = parts[parts.length - 1];
      node[fname] = { _d: false, path: path };
    });
    return root;
  }

  function getDepth(prefix) {
    if (!prefix) return 0;
    return prefix.split('/').length;
  }

  function renderTreeNode(node, prefix) {
    var ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;padding:0;margin:0';

    Object.keys(node).sort(function (a, b) {
      // Dirs before files
      var ad = node[a]._d, bd = node[b]._d;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    }).forEach(function (name) {
      var item = node[name];
      var li = document.createElement('li');
      var depth = getDepth(prefix);
      var indent = 8 + depth * 14;

      if (item._d) {
        var key = prefix ? prefix + '/' + name : name;
        var expanded = S.folderExp[key] === true;

        var div = document.createElement('div');
        div.className = 'tree-row tree-dir';
        div.style.paddingLeft = indent + 'px';
        div.innerHTML =
          '<span class="tree-arrow">' + (expanded ? '▾' : '▸') + '</span>' +
          '<span class="tree-icon">📁</span>' +
          '<span class="tree-label">' + escHtml(name) + '</span>';
        div.addEventListener('click', function () {
          S.folderExp[key] = !expanded;
          renderFileTree();
        });
        li.appendChild(div);

        if (expanded) {
          li.appendChild(renderTreeNode(item.ch, key));
        }
      } else {
        var div2 = document.createElement('div');
        var isActive = item.path === S.activeFile;
        div2.className = 'tree-row tree-file' + (isActive ? ' active' : '');
        div2.style.paddingLeft = (indent + 14) + 'px';
        div2.innerHTML = '<span class="tree-label">' + escHtml(name) + '</span>';
        div2.addEventListener('click', function () { openFile(item.path); });
        li.appendChild(div2);
      }

      ul.appendChild(li);
    });
    return ul;
  }

  function renderFileTree() {
    var container = document.getElementById('file-tree');
    var hd        = document.getElementById('tree-hd');
    var hdCount   = document.getElementById('hd-count');

    var n = S.files.size;
    hd.textContent = 'Files';
    hdCount.textContent = n + ' files';

    var treeData = buildTreeData(Array.from(S.files.keys()));
    var ul = renderTreeNode(treeData, '');
    container.innerHTML = '';
    container.appendChild(ul);
  }

  /* ── Hash routing ────────────────────────────────────────────── */
  function setHash(path) {
    var h = '#/f/' + encodeURIComponent(path);
    if (location.hash !== h) history.pushState(null, '', h);
  }

  function readHash() {
    var m = location.hash.match(/^#\/f\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function handleHashChange() {
    var path = readHash();
    if (path && S.files.has(path) && path !== S.activeFile) {
      S.activeFile   = path;
      S.activeSymbol = null;
      S.editMode     = false;
      S.editBuffer   = null;
      renderFileTree();
      renderEditor();
      renderOutline();
      renderCallGraph();
    }
  }

  /* ── Open file ───────────────────────────────────────────────── */
  function openFile(path) {
    if (S.editMode && S.editBuffer !== null) {
      if (!confirm('Discard unsaved changes?')) return;
    }
    S.activeFile   = path;
    S.activeSymbol = null;
    S.editMode     = false;
    S.editBuffer   = null;
    setHash(path);
    renderFileTree();
    renderEditor();
    renderOutline();
    renderCallGraph();
  }

  /* ── Editor ──────────────────────────────────────────────────── */
  function renderEditor() {
    var file       = S.files.get(S.activeFile);
    var pathEl     = document.getElementById('editor-path');
    var actsEl     = document.getElementById('editor-acts');
    var emptyEl    = document.getElementById('editor-empty');
    var displayEl  = document.getElementById('code-display');
    var editEl     = document.getElementById('code-edit');
    var btnEdit    = document.getElementById('btn-edit');
    var btnSave    = document.getElementById('btn-save');
    var btnCancel  = document.getElementById('btn-cancel');

    if (!file) {
      pathEl.innerHTML = '<em style="color:var(--text-faint)">No file open</em>';
      actsEl.style.display = 'none';
      emptyEl.classList.remove('hidden');
      displayEl.classList.add('hidden');
      editEl.classList.add('hidden');
      return;
    }

    // Breadcrumb
    var parts = file.path.split('/');
    var dir   = parts.slice(0, -1).join('/');
    var fname = parts[parts.length - 1];
    pathEl.innerHTML = dir
      ? escHtml(dir) + '/<strong>' + escHtml(fname) + '</strong>'
      : '<strong>' + escHtml(fname) + '</strong>';

    actsEl.style.display = 'flex';
    emptyEl.classList.add('hidden');

    if (S.editMode) {
      displayEl.classList.add('hidden');
      editEl.classList.remove('hidden');
      if (editEl.value === '' || S.editBuffer === null) {
        editEl.value = file.text;
        S.editBuffer = file.text;
      }
      btnEdit.classList.add('hidden');
      btnSave.classList.remove('hidden');
      btnCancel.classList.remove('hidden');
    } else {
      displayEl.innerHTML = highlight(file.text);
      displayEl.classList.remove('hidden');
      editEl.classList.add('hidden');
      btnEdit.classList.remove('hidden');
      btnSave.classList.add('hidden');
      btnCancel.classList.add('hidden');
    }
  }

  function enterEditMode() {
    var file = S.files.get(S.activeFile);
    if (!file) return;
    S.editMode   = true;
    S.editBuffer = file.text;
    renderEditor();
    document.getElementById('code-edit').focus();
  }

  function saveEdit() {
    var file    = S.files.get(S.activeFile);
    if (!file) return;
    var newText = document.getElementById('code-edit').value;
    var updated = Object.assign({}, file, { text: newText });
    S.files.set(S.activeFile, updated);
    S.editMode   = false;
    S.editBuffer = null;
    saveFiles();
    rebuildIndex();
    renderEditor();
    renderOutline();
    renderCallGraph();
  }

  function cancelEdit() {
    S.editMode   = false;
    S.editBuffer = null;
    renderEditor();
  }

  /* ── Outline ─────────────────────────────────────────────────── */
  function renderOutline() {
    var body  = document.getElementById('outline-body');
    var hd    = document.getElementById('outline-hd');
    var file  = S.files.get(S.activeFile);

    if (!file) {
      hd.textContent = 'Outline';
      body.innerHTML = '<div style="padding:10px 12px;color:var(--text-faint);font-size:12px;font-style:italic">Open a file to see its symbols</div>';
      return;
    }

    var parts = file.path.split('/');
    hd.textContent = parts[parts.length - 1];

    var syms = window.SymbolParser.parseSymbols(file.text);

    if (!syms.length) {
      body.innerHTML = '<div style="padding:10px 12px;color:var(--text-faint);font-size:12px;font-style:italic">No function symbols found</div>';
      return;
    }

    var frag = document.createDocumentFragment();
    syms.forEach(function (sym) {
      var isActive = sym.name === S.activeSymbol;
      var div = document.createElement('div');
      div.className = 'sym-row' + (isActive ? ' active' : '');

      var icoSpan  = document.createElement('span');
      icoSpan.className = 'sym-icon';
      icoSpan.textContent = 'ƒ';

      var nameSpan = document.createElement('span');
      nameSpan.className = 'sym-name';
      nameSpan.textContent = sym.name;

      var lineSpan = document.createElement('span');
      lineSpan.className = 'sym-line';
      lineSpan.textContent = ':' + sym.line;

      var renBtn = document.createElement('button');
      renBtn.className = 'sym-rename-btn';
      renBtn.textContent = 'rename';
      renBtn.setAttribute('data-sym', sym.name);

      div.appendChild(icoSpan);
      div.appendChild(nameSpan);
      div.appendChild(lineSpan);
      div.appendChild(renBtn);

      div.addEventListener('click', function (e) {
        if (e.target === renBtn) return;
        selectSymbol(sym.name);
      });
      renBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openRename(sym.name);
      });

      frag.appendChild(div);
    });

    body.innerHTML = '';
    body.appendChild(frag);
  }

  function selectSymbol(name) {
    S.activeSymbol = name;
    renderOutline();
    renderCallGraph();
  }

  /* ── Call Graph ──────────────────────────────────────────────── */
  function renderCallGraph() {
    var body = document.getElementById('cg-body');
    var hd   = document.getElementById('cg-hd');

    if (!S.activeSymbol) {
      hd.textContent = 'Call Graph';
      body.innerHTML = '<div style="padding:10px 12px;color:var(--text-faint);font-size:12px;font-style:italic">Click a symbol in the outline</div>';
      return;
    }

    hd.textContent = S.activeSymbol;

    var callees = window.SymbolParser.getCallees(S.activeFile, S.activeSymbol, S.files, S.index);
    var callers = window.SymbolParser.getCallers(S.activeSymbol, S.index);

    var html = '';

    // Callees
    html += '<div class="cg-section">';
    html += '<div class="cg-label">Calls →  (' + callees.length + ')</div>';
    if (callees.length === 0) {
      html += '<div class="cg-empty">No outgoing calls to known symbols</div>';
    } else {
      callees.forEach(function (c) {
        var targetFile = c.definedIn[0].file;
        html += '<div class="cg-item" data-file="' + escAttr(targetFile) + '" data-sym="' + escAttr(c.name) + '">' +
          '<span class="cg-fn">' + escHtml(c.name) + '</span>' +
          '<span class="cg-path">' + escHtml(targetFile) + '</span>' +
          '</div>';
      });
    }
    html += '</div>';

    // Callers
    var displayCallers = callers.slice(0, 40);
    html += '<div class="cg-section">';
    html += '<div class="cg-label">← Called by (' + callers.length + ')</div>';
    if (callers.length === 0) {
      html += '<div class="cg-empty">No callers found</div>';
    } else {
      displayCallers.forEach(function (c) {
        html += '<div class="cg-item" data-file="' + escAttr(c.file) + '" data-sym="' + escAttr(c.callerFn) + '">' +
          '<span class="cg-fn">' + escHtml(c.callerFn) + '</span>' +
          '<span class="cg-path">' + escHtml(c.file) + '</span>' +
          '</div>';
      });
      if (callers.length > 40) {
        html += '<div class="cg-more">+' + (callers.length - 40) + ' more…</div>';
      }
    }
    html += '</div>';

    body.innerHTML = html;

    // Wire click handlers
    Array.from(body.querySelectorAll('.cg-item')).forEach(function (el) {
      el.addEventListener('click', function () {
        var filePath = el.getAttribute('data-file');
        var symName  = el.getAttribute('data-sym');
        if (filePath) {
          openFile(filePath);
          if (symName) {
            // Wait for render then select
            setTimeout(function () { selectSymbol(symName); }, 30);
          }
        }
      });
    });
  }

  function escAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  /* ── Command palette ─────────────────────────────────────────── */
  function openPalette() {
    var overlay = document.getElementById('pal-overlay');
    var input   = document.getElementById('pal-input');
    overlay.classList.remove('hidden');
    input.value = '';
    input.focus();
    S.palSel = 0;
    updatePalette('');
  }

  function closePalette() {
    document.getElementById('pal-overlay').classList.add('hidden');
  }

  function matches(str, terms) {
    var s = str.toLowerCase();
    return terms.every(function (t) { return s.indexOf(t) !== -1; });
  }

  function updatePalette(query) {
    var terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var fileResults = [];
    var symResults  = [];

    // File matches
    S.files.forEach(function (f, path) {
      if (fileResults.length >= 12) return;
      if (!terms.length || matches(path, terms)) {
        fileResults.push({ type: 'file', path: path });
      }
    });

    // Symbol matches
    var defEntries = Object.keys(S.index.defs);
    for (var i = 0; i < defEntries.length && symResults.length < 12; i++) {
      var name = defEntries[i];
      if (!terms.length || matches(name, terms)) {
        var defs = S.index.defs[name];
        symResults.push({ type: 'symbol', name: name, file: defs[0].file, line: defs[0].line });
      }
    }

    S.palResults = fileResults.concat(symResults);
    S.palSel     = 0;
    renderPalette();
  }

  function renderPalette() {
    var container = document.getElementById('pal-results');
    var results   = S.palResults;

    if (!results.length) {
      container.innerHTML = '<div class="pal-empty">No results</div>';
      return;
    }

    var html = '';
    var fileResults = results.filter(function (r) { return r.type === 'file'; });
    var symResults  = results.filter(function (r) { return r.type === 'symbol'; });

    if (fileResults.length) {
      html += '<div class="pal-sec-hd">Files</div>';
      fileResults.forEach(function (r, i) {
        var sel = i === S.palSel;
        html += '<div class="pal-row' + (sel ? ' sel' : '') + '" data-idx="' + i + '">' +
          '<span class="pal-row-ico">📄</span>' +
          '<div class="pal-row-body"><div class="pal-row-name">' + escHtml(r.path) + '</div></div>' +
          '</div>';
      });
    }

    if (symResults.length) {
      html += '<div class="pal-sec-hd">Symbols</div>';
      symResults.forEach(function (r, i) {
        var idx = fileResults.length + i;
        var sel = idx === S.palSel;
        html += '<div class="pal-row' + (sel ? ' sel' : '') + '" data-idx="' + idx + '">' +
          '<span class="pal-row-ico" style="font-style:italic;color:var(--tok-fn)">ƒ</span>' +
          '<div class="pal-row-body">' +
          '<div class="pal-row-name">' + escHtml(r.name) + '</div>' +
          '<div class="pal-row-sub">' + escHtml(r.file) + ':' + r.line + '</div>' +
          '</div></div>';
      });
    }

    container.innerHTML = html;

    // Wire clicks
    Array.from(container.querySelectorAll('.pal-row')).forEach(function (el) {
      el.addEventListener('click', function () {
        selectPaletteItem(parseInt(el.getAttribute('data-idx'), 10));
      });
    });

    // Scroll selected into view
    var selEl = container.querySelector('.pal-row.sel');
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
  }

  function selectPaletteItem(idx) {
    var r = S.palResults[idx];
    if (!r) return;
    closePalette();
    if (r.type === 'file') {
      openFile(r.path);
    } else {
      openFile(r.file);
      setTimeout(function () { selectSymbol(r.name); }, 30);
    }
  }

  /* ── Rename ──────────────────────────────────────────────────── */
  function openRename(symbolName) {
    S.renTarget = symbolName;
    var overlay  = document.getElementById('ren-overlay');
    var input    = document.getElementById('ren-input');
    var desc     = document.getElementById('ren-desc');
    var countEl  = document.getElementById('ren-count');

    var defCount = (S.index.defs[symbolName] || []).length;
    var refCount = (S.index.refs[symbolName] || []).length;

    desc.textContent = 'Rename "' + symbolName + '" everywhere in the codebase.';
    countEl.textContent = defCount + ' definition' + (defCount !== 1 ? 's' : '') +
      ', ' + refCount + ' reference' + (refCount !== 1 ? 's' : '');

    input.value = symbolName;
    overlay.classList.remove('hidden');
    input.select();
    input.focus();
  }

  function closeRename() {
    S.renTarget = null;
    document.getElementById('ren-overlay').classList.add('hidden');
  }

  function doRename() {
    var input   = document.getElementById('ren-input');
    var newName = input.value.trim();
    var oldName = S.renTarget;

    if (!newName || !oldName) { closeRename(); return; }
    if (newName === oldName)   { closeRename(); return; }

    if (!/^[A-Za-z_]\w*$/.test(newName)) {
      alert('Invalid identifier: ' + newName);
      return;
    }

    // Word-boundary replacement across all files
    var re = new RegExp('\\b' + oldName + '\\b', 'g');
    var changedCount = 0;

    S.files.forEach(function (file, path) {
      var newText = file.text.replace(re, newName);
      if (newText !== file.text) {
        changedCount++;
        S.files.set(path, Object.assign({}, file, { text: newText }));
      }
    });

    if (S.activeSymbol === oldName) S.activeSymbol = newName;

    closeRename();
    saveFiles();
    rebuildIndex();
    renderFileTree();
    renderEditor();
    renderOutline();
    renderCallGraph();

    console.info('[Atlas] Renamed "' + oldName + '" → "' + newName + '" in ' + changedCount + ' file(s)');
  }

  /* ── Reset seed ──────────────────────────────────────────────── */
  function resetSeed() {
    if (!confirm('Reset to original seed? All edits will be lost.')) return;
    localStorage.removeItem(STORAGE_KEY);
    S.files.clear();
    S.activeFile   = null;
    S.activeSymbol = null;
    S.editMode     = false;
    S.editBuffer   = null;
    S.folderExp    = {};
    seedFiles();
    rebuildIndex();
    history.pushState(null, '', location.pathname);
    renderFileTree();
    renderEditor();
    renderOutline();
    renderCallGraph();
  }

  /* ── Keyboard handler ────────────────────────────────────────── */
  function handleKeyDown(e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';

    // Ctrl/Cmd+K or Ctrl/Cmd+P → toggle palette
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'p')) {
      e.preventDefault();
      var ov = document.getElementById('pal-overlay');
      if (ov.classList.contains('hidden')) openPalette();
      else closePalette();
      return;
    }

    // Escape → close overlays
    if (e.key === 'Escape') {
      closePalette();
      closeRename();
      return;
    }

    // Palette navigation
    var palOverlay = document.getElementById('pal-overlay');
    if (!palOverlay.classList.contains('hidden')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        S.palSel = Math.min(S.palSel + 1, S.palResults.length - 1);
        renderPalette();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        S.palSel = Math.max(S.palSel - 1, 0);
        renderPalette();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectPaletteItem(S.palSel);
      }
      return;
    }

    // Ctrl+S → save when editing
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && S.editMode) {
      e.preventDefault();
      saveEdit();
    }
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    // Load or seed files
    if (!loadFiles()) seedFiles();
    rebuildIndex();

    // Wire header buttons
    document.getElementById('btn-palette').addEventListener('click', openPalette);
    document.getElementById('btn-reset').addEventListener('click', resetSeed);

    // Wire editor buttons
    document.getElementById('btn-edit').addEventListener('click', enterEditMode);
    document.getElementById('btn-save').addEventListener('click', saveEdit);
    document.getElementById('btn-cancel').addEventListener('click', cancelEdit);

    // Wire rename dialog
    document.getElementById('ren-confirm').addEventListener('click', doRename);
    document.getElementById('ren-cancel').addEventListener('click', closeRename);
    document.getElementById('ren-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter')  doRename();
      if (e.key === 'Escape') closeRename();
    });

    // Wire palette
    document.getElementById('pal-input').addEventListener('input', function (e) {
      updatePalette(e.target.value);
    });
    document.getElementById('pal-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); selectPaletteItem(S.palSel); }
    });

    // Dismiss overlays on backdrop click
    document.getElementById('pal-overlay').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closePalette();
    });
    document.getElementById('ren-overlay').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeRename();
    });

    // Global keyboard
    document.addEventListener('keydown', handleKeyDown);

    // Hash routing
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate',   handleHashChange);

    // Initial render
    renderFileTree();
    handleHashChange();

    // Open first file if no hash
    if (!S.activeFile) {
      var firstPath = null;
      S.files.forEach(function (f, p) { if (!firstPath) firstPath = p; });
      if (firstPath) openFile(firstPath);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
