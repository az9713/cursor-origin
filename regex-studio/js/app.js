/* app.js — Regex Studio main application (Session A) */
window.RS = window.RS || {};

/* ══════════════════════════════════════════════
 * Constants & presets
 * ══════════════════════════════════════════════ */
RS.STORE = 'regex-studio-v1';
RS.syncing = false;

RS.PRESETS = [
  {
    id: 'digits',
    name: 'Digits  \\d+',
    pattern: '\\d+',
    haystack: 'In 2024, there were 365 days and 12 months of 4 seasons.'
  },
  {
    id: 'email-ish',
    name: 'Email-ish',
    pattern: '[\\w.+-]+@[\\w-]+\\.[a-z]{2,}',
    haystack: 'Contact alice@example.com or support@test.org for help.'
  },
  {
    id: 'protocol',
    name: 'URL protocol',
    pattern: '(https?|ftp)://[\\w./%-]+',
    haystack: 'Visit https://example.com or ftp://files.example.org/data and http://old.site.net'
  }
];

RS.SEED_PRESET = RS.PRESETS[0];

/* ══════════════════════════════════════════════
 * Storage helpers
 * ══════════════════════════════════════════════ */
RS.esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

RS.loadStore = function () {
  try { return JSON.parse(localStorage.getItem(RS.STORE) || '{}') || {}; }
  catch (e) { return {}; }
};
RS.saveStore = function (patch) {
  var cur = RS.loadStore();
  Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
  localStorage.setItem(RS.STORE, JSON.stringify(cur));
};

/* ══════════════════════════════════════════════
 * Hash routing
 * ══════════════════════════════════════════════ */
RS.parseHash = function () {
  var h = (location.hash || '').replace(/^#/, '');
  var parts = h.split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) return { kind: 'p', id: decodeURIComponent(parts[1]) };
  return { kind: '', id: '' };
};
RS.writeHash = function (kind, id) {
  location.hash = kind && id ? '/' + kind + '/' + encodeURIComponent(id) : '';
};

/* ══════════════════════════════════════════════
 * State
 * ══════════════════════════════════════════════ */
RS.currentAst = null;
RS.currentMatches = [];
RS.selectedMatchIdx = -1;

/* ══════════════════════════════════════════════
 * Presets panel
 * ══════════════════════════════════════════════ */
RS.renderPresets = function () {
  var hash = RS.parseHash();
  var html = RS.PRESETS.map(function (p) {
    var on = (hash.kind === 'p' && hash.id === p.id) ? ' on' : '';
    return '<button type="button" class="preset-btn' + on + '" data-pid="' + RS.esc(p.id) + '">' + RS.esc(p.name) + '</button>';
  }).join('');
  document.getElementById('presets').innerHTML = '<h3>Presets</h3>' + html;
};

/* ══════════════════════════════════════════════
 * Builder rendering
 * ══════════════════════════════════════════════ */

/* normalise AST into a top-level list of branches (array of arrays of quantified nodes) */
RS._flattenAlt = function (node) {
  /* returns array of branch nodes (each is a concat/single/empty) */
  if (!node || node.type === 'empty') return [{ type: 'empty' }];
  if (node.type === 'alt') return node.alts;
  return [node];
};

RS._concatItems = function (node) {
  /* returns array of items from a concat, or wraps single node */
  if (!node || node.type === 'empty') return [];
  if (node.type === 'concat') return node.items;
  return [node];
};

RS.renderBuilder = function (ast) {
  var el = document.getElementById('builder');
  if (!ast) { el.innerHTML = '<p class="builder-empty">Enter a pattern above.</p>'; return; }

  var branches = RS._flattenAlt(ast);
  var html = '';

  branches.forEach(function (branch, bi) {
    if (bi > 0) html += '<div class="or-sep">|</div>';
    html += '<div class="branch-row" data-branch="' + bi + '">';
    html += '<span class="branch-label">' + (branches.length > 1 ? 'alt ' + (bi + 1) : '') + '</span>';
    html += '<div class="branch-chips">';

    var items = RS._concatItems(branch);
    if (items.length === 0) {
      html += '<span style="color:var(--muted);font-size:0.78rem;font-style:italic">empty</span>';
    }
    items.forEach(function (item, ii) {
      html += RS._chipHtml(item, bi, ii);
    });

    html += '</div>'; /* branch-chips */
    /* remove branch btn (only when >1 branch) */
    if (branches.length > 1) {
      html += '<button type="button" class="chip-rm rm-branch" data-branch="' + bi + '" title="Remove this branch" style="align-self:center">× branch</button>';
    }
    html += '</div>'; /* branch-row */
  });

  /* Add alt branch button */
  html += '<div style="padding:0.35rem 0"><button type="button" class="builder-add-btn" id="add-branch-btn">+ Alt branch (|)</button></div>';

  el.innerHTML = html;
};

RS._chipHtml = function (item, bi, ii) {
  /* Unwrap quantified to get child + quant */
  var child = item, q = null;
  if (item.type === 'quantified') { child = item.child; q = item.quant; }

  var typeClass = {
    char: '', dot: 'chip-dot', anchor: 'chip-anchor',
    escape: 'chip-escape', escaped_char: 'chip-escape',
    charclass: 'chip-class', group: 'chip-group', ncgroup: 'chip-ncgroup',
    empty: ''
  }[child.type] || '';

  var label = RS.nodeSummary(child);
  /* truncate long labels */
  if (label.length > 14) label = label.slice(0, 13) + '…';
  var quantLabel = q ? RS._printQuant(q) : '';

  /* Use double-quote attribute delimiters; RS.esc escapes " → &quot; safely */
  var nodeJson = RS.esc(JSON.stringify(item));

  return '<div class="chip ' + typeClass + '" data-branch="' + bi + '" data-idx="' + ii + '" data-node="' + nodeJson + '">' +
    '<div class="chip-body" data-toggle-quant="1" title="Click to change quantifier">' +
    '<span class="chip-atom">' + RS.esc(label) + '</span>' +
    '<span class="chip-quant">' + RS.esc(quantLabel || '') + '</span>' +
    '</div>' +
    '<button type="button" class="chip-rm" data-rm-branch="' + bi + '" data-rm-idx="' + ii + '" title="Remove">×</button>' +
    '</div>';
};

RS._printQuant = function (q) {
  if (!q) return '';
  var s;
  if (q.min === 0 && q.max === Infinity) s = '*';
  else if (q.min === 1 && q.max === Infinity) s = '+';
  else if (q.min === 0 && q.max === 1)        s = '?';
  else if (q.max === Infinity)                 s = '{' + q.min + ',}';
  else if (q.min === q.max)                    s = '{' + q.min + '}';
  else                                         s = '{' + q.min + ',' + q.max + '}';
  if (q.greedy === false) s += '?';
  return s;
};

/* ── Rebuild AST from builder DOM ── */
RS.astFromBuilder = function () {
  var branchRows = document.querySelectorAll('#builder .branch-row');
  if (branchRows.length === 0) return null;

  var branches = [];
  branchRows.forEach(function (row) {
    var chips = row.querySelectorAll('.chip[data-node]');
    var items = [];
    chips.forEach(function (chip) {
      try {
        var node = JSON.parse(chip.getAttribute('data-node'));
        items.push(node);
      } catch (e) {}
    });
    if (items.length === 0) branches.push({ type: 'empty' });
    else if (items.length === 1) branches.push(items[0]);
    else branches.push({ type: 'concat', items: items });
  });

  if (branches.length === 0) return { type: 'empty' };
  if (branches.length === 1) return branches[0];
  return { type: 'alt', alts: branches };
};

/* ── Quant popup ── */
RS._activePopup = null;
RS.closePopup = function () {
  if (RS._activePopup) { RS._activePopup.remove(); RS._activePopup = null; }
};

RS.openQuantPopup = function (chip, nodeJson) {
  RS.closePopup();
  var node = JSON.parse(nodeJson);
  /* unwrap quantified */
  var child = node, curQ = null;
  if (node.type === 'quantified') { child = node.child; curQ = node.quant; }

  var opts = [
    { label: 'none', q: null },
    { label: '* (0 or more)', q: { min: 0, max: Infinity, greedy: true } },
    { label: '+ (1 or more)', q: { min: 1, max: Infinity, greedy: true } },
    { label: '? (0 or 1)',    q: { min: 0, max: 1,        greedy: true } }
  ];

  var popup = document.createElement('div');
  popup.className = 'quant-popup';
  popup.innerHTML = '<strong style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:0.2rem">QUANTIFIER</strong>';

  opts.forEach(function (opt) {
    var btn = document.createElement('button');
    btn.textContent = opt.label;
    var isActive = (!opt.q && !curQ) || (opt.q && curQ &&
      opt.q.min === curQ.min && opt.q.max === curQ.max && opt.q.greedy === curQ.greedy);
    if (isActive) btn.className = 'active';
    btn.onclick = function () {
      var newNode = opt.q ? { type: 'quantified', child: child, quant: opt.q } : child;
      chip.setAttribute('data-node', JSON.stringify(newNode));
      chip.querySelector('.chip-atom').textContent = RS.nodeSummary(child);
      chip.querySelector('.chip-quant').textContent = opt.q ? RS._printQuant(opt.q) : '';
      RS.closePopup();
      RS.builderToPattern();
    };
    popup.appendChild(btn);
  });

  /* custom {n,m} */
  var customLabel = document.createElement('div');
  customLabel.style.cssText = 'font-size:0.7rem;color:var(--muted);margin-top:0.3rem';
  customLabel.textContent = 'Custom {n,m}:';
  popup.appendChild(customLabel);
  var customRow = document.createElement('div');
  customRow.style.cssText = 'display:flex;gap:0.3rem;align-items:center';
  customRow.innerHTML = '<input id="cp-min" type="number" min="0" step="1" style="width:3.5rem;border:1px solid var(--line);padding:0.15rem 0.25rem;font-family:var(--mono)" placeholder="min">' +
    '<span style="font-family:var(--mono)">,</span>' +
    '<input id="cp-max" type="number" min="0" step="1" style="width:3.5rem;border:1px solid var(--line);padding:0.15rem 0.25rem;font-family:var(--mono)" placeholder="max">' +
    '<button style="border:1px solid var(--line);background:transparent;padding:0.15rem 0.4rem;font-size:0.75rem">Set</button>';
  customRow.querySelector('button').onclick = function () {
    var minV = parseInt(customRow.querySelector('#cp-min').value, 10);
    var maxV = customRow.querySelector('#cp-max').value;
    if (isNaN(minV) || minV < 0) return;
    var maxN = maxV === '' ? Infinity : parseInt(maxV, 10);
    if (maxN !== Infinity && (isNaN(maxN) || maxN < minV)) return;
    var newQ = { min: minV, max: maxN, greedy: true };
    var newNode = { type: 'quantified', child: child, quant: newQ };
    chip.setAttribute('data-node', JSON.stringify(newNode));
    chip.querySelector('.chip-atom').textContent = RS.nodeSummary(child);
    chip.querySelector('.chip-quant').textContent = RS._printQuant(newQ);
    RS.closePopup();
    RS.builderToPattern();
  };
  popup.appendChild(customRow);

  chip.style.position = 'relative';
  chip.appendChild(popup);
  RS._activePopup = popup;
};

/* ══════════════════════════════════════════════
 * Haystack highlight
 * ══════════════════════════════════════════════ */
RS.renderHaystack = function (str, matches) {
  var el = document.getElementById('haystack-hl');
  if (!str) { el.innerHTML = '<span style="color:var(--muted);font-style:italic">Haystack output…</span>'; return; }
  if (!matches || matches.length === 0) {
    el.textContent = str;
    return;
  }
  var html = '';
  var cur = 0;
  matches.forEach(function (m, mi) {
    if (cur < m.start) html += RS.esc(str.slice(cur, m.start));
    var sel = mi === RS.selectedMatchIdx ? ' selected' : '';
    html += '<span class="hl-match' + sel + '" data-match="' + mi + '">' + RS.esc(str.slice(m.start, m.end)) + '</span>';
    cur = m.end;
  });
  if (cur < str.length) html += RS.esc(str.slice(cur));
  el.innerHTML = html;
};

/* ══════════════════════════════════════════════
 * Matches list
 * ══════════════════════════════════════════════ */
RS.renderMatchesList = function (matches, str) {
  var el = document.getElementById('matches-list');
  var lbl = document.getElementById('matches-label');
  if (!matches || matches.length === 0) {
    lbl.textContent = 'Matches';
    el.innerHTML = '<p class="hint">No matches.</p>';
    return;
  }
  lbl.textContent = 'Matches (' + matches.length + ')';
  el.innerHTML = matches.map(function (m, mi) {
    var sel = mi === RS.selectedMatchIdx ? ' selected' : '';
    var preview = m.text.length > 30 ? m.text.slice(0, 29) + '…' : m.text;
    return '<div class="match-item' + sel + '" data-match="' + mi + '">' +
      '<span class="match-num">#' + (mi + 1) + '</span>' +
      '<span class="match-text">' + RS.esc(preview) + '</span>' +
      '<span class="match-span">[' + m.start + ',' + m.end + ']</span>' +
      '</div>';
  }).join('');
};

/* ══════════════════════════════════════════════
 * Capture table
 * ══════════════════════════════════════════════ */
RS.renderCaptures = function (match) {
  var el = document.getElementById('capture-table');
  if (!match) { el.innerHTML = '<p class="hint">Select a match.</p>'; return; }
  var rows = '<tr><th>#</th><th>Text</th><th>Span</th></tr>';
  rows += '<tr><td><strong>0</strong></td><td><code>' + RS.esc(match.text) + '</code></td><td><code>[' + match.start + ',' + match.end + ']</code></td></tr>';
  match.groups.forEach(function (g, i) {
    if (!g) {
      rows += '<tr><td>' + (i + 1) + '</td><td class="capture-null">—</td><td class="capture-null">—</td></tr>';
    } else {
      rows += '<tr><td>' + (i + 1) + '</td><td><code>' + RS.esc(g.text) + '</code></td><td><code>[' + g.start + ',' + g.end + ']</code></td></tr>';
    }
  });
  el.innerHTML = '<table class="capture-table">' + rows + '</table>';
};

/* ══════════════════════════════════════════════
 * Explain this match (trace)
 * ══════════════════════════════════════════════ */
RS.renderExplain = function (match, str) {
  var el = document.getElementById('explain');
  if (!match) { el.innerHTML = '<p class="explain-empty">Select a match to trace.</p>'; return; }
  if (!match.trace || match.trace.length === 0) {
    el.innerHTML = '<p class="explain-empty">No trace (pattern matched empty).</p>';
    return;
  }
  var rows = '<tr><th>Atom</th><th>Consumed</th><th>Span</th></tr>';
  match.trace.forEach(function (t, ti) {
    var consumed = t.end > t.start ? str.slice(t.start, t.end) : '(zero-width)';
    rows += '<tr class="trace-row" data-ti="' + ti + '">' +
      '<td><code>' + RS.esc(t.label) + '</code></td>' +
      '<td><code>' + RS.esc(consumed) + '</code></td>' +
      '<td><code>' + t.start + '-' + t.end + '</code></td>' +
      '</tr>';
  });
  el.innerHTML = '<table class="explain-table">' + rows + '</table>';
};

/* ══════════════════════════════════════════════
 * Select a match (updates highlight + captures + explain)
 * ══════════════════════════════════════════════ */
RS.selectMatch = function (idx) {
  RS.selectedMatchIdx = idx;
  var hay = document.getElementById('haystack').value;
  RS.renderHaystack(hay, RS.currentMatches);
  RS.renderMatchesList(RS.currentMatches, hay);
  var m = RS.currentMatches[idx] || null;
  RS.renderCaptures(m);
  RS.renderExplain(m, hay);
};

/* ══════════════════════════════════════════════
 * Core: apply pattern (parse → engine → render all)
 * ══════════════════════════════════════════════ */
RS.applyPattern = function (pattern, fromBuilder) {
  var patEl = document.getElementById('pattern');
  var rtEl = document.getElementById('roundtrip');
  if (!fromBuilder) patEl.value = pattern;

  /* persist */
  RS.saveStore({ pattern: pattern, haystack: document.getElementById('haystack').value });

  /* parse */
  var ast;
  try {
    ast = RS.parse(pattern);
    patEl.classList.remove('err');
    document.getElementById('parse-err-bar').hidden = true;
  } catch (e) {
    patEl.classList.add('err');
    var errEl = document.getElementById('parse-err-bar');
    errEl.textContent = 'Parse error at ' + e.index + ': ' + e.message;
    errEl.hidden = false;
    rtEl.hidden = true;
    if (!fromBuilder) RS.renderBuilder(RS.currentAst); /* keep old builder */
    RS.currentMatches = [];
    RS.renderHaystack(document.getElementById('haystack').value, []);
    RS.renderMatchesList([], '');
    RS.renderCaptures(null);
    RS.renderExplain(null, '');
    return;
  }

  RS.currentAst = ast;

  /* update builder */
  if (!fromBuilder) {
    RS.syncing = true;
    RS.renderBuilder(ast);
    RS.syncing = false;
  }

  /* roundtrip chip */
  var rt = RS.roundtripOk(pattern);
  rtEl.hidden = false;
  rtEl.textContent = 'roundtrip ' + (rt ? 'ok' : 'fail');
  rtEl.className = 'pill ' + (rt ? 'ok' : rt === false ? 'bad' : 'dim');

  /* run engine */
  var hay = document.getElementById('haystack').value;
  RS.currentMatches = [];
  RS.selectedMatchIdx = -1;
  try {
    RS.currentMatches = RS.matchAll(ast, hay);
  } catch (e) {
    console.warn('Engine error:', e);
  }
  RS.renderHaystack(hay, RS.currentMatches);
  RS.renderMatchesList(RS.currentMatches, hay);
  /* auto-select first match */
  if (RS.currentMatches.length > 0) {
    RS.selectedMatchIdx = 0;
    RS.renderHaystack(hay, RS.currentMatches);
    RS.renderMatchesList(RS.currentMatches, hay);
    RS.renderCaptures(RS.currentMatches[0]);
    RS.renderExplain(RS.currentMatches[0], hay);
  } else {
    RS.renderCaptures(null);
    RS.renderExplain(null, '');
  }
};

/* Apply haystack change without re-parsing pattern */
RS.applyHaystack = function (hay) {
  RS.saveStore({ haystack: hay });
  if (!RS.currentAst) {
    RS.renderHaystack(hay, []);
    RS.renderMatchesList([], hay);
    return;
  }
  RS.currentMatches = [];
  RS.selectedMatchIdx = -1;
  try {
    RS.currentMatches = RS.matchAll(RS.currentAst, hay);
  } catch (e) {}
  RS.renderHaystack(hay, RS.currentMatches);
  RS.renderMatchesList(RS.currentMatches, hay);
  if (RS.currentMatches.length > 0) {
    RS.selectedMatchIdx = 0;
    RS.renderHaystack(hay, RS.currentMatches);
    RS.renderMatchesList(RS.currentMatches, hay);
    RS.renderCaptures(RS.currentMatches[0]);
    RS.renderExplain(RS.currentMatches[0], hay);
  } else {
    RS.renderCaptures(null);
    RS.renderExplain(null, '');
  }
};

/* Build pattern from builder state and apply */
RS.builderToPattern = function () {
  if (RS.syncing) return;
  var ast = RS.astFromBuilder();
  if (!ast) return;
  var pattern = RS.print(ast);
  RS.applyPattern(pattern, true);
  document.getElementById('pattern').value = pattern;
};

/* ══════════════════════════════════════════════
 * Add atom from the builder-add form
 * ══════════════════════════════════════════════ */
RS.buildAtomFromForm = function () {
  var type = document.getElementById('add-type').value;
  var val = document.getElementById('add-value').value;
  var quantSel = document.getElementById('add-quant').value;
  var nVal = document.getElementById('add-quant-n').value;
  var mVal = document.getElementById('add-quant-m').value;

  var node;
  try {
    switch (type) {
      case 'char': {
        if (!val) { alert('Enter a character.'); return null; }
        var c = val[0];
        /* metacharacters must be stored as escaped_char so print→parse roundtrip is stable */
        var metaChars = '\\.^$*+?[]{}()|';
        if (metaChars.indexOf(c) >= 0) {
          node = { type: 'escaped_char', ch: c, raw: c };
        } else if (c === '\n') {
          node = { type: 'escaped_char', ch: '\n', raw: 'n' };
        } else if (c === '\t') {
          node = { type: 'escaped_char', ch: '\t', raw: 't' };
        } else {
          node = { type: 'char', ch: c };
        }
        break;
      }
      case 'dot':
        node = { type: 'dot' };
        break;
      case 'escape': {
        var k = val.trim();
        if ('dwsDWS'.indexOf(k) < 0) { alert('Escape class must be d, w, s, D, W, or S.'); return null; }
        node = { type: 'escape', kind: k };
        break;
      }
      case 'charclass': {
        /* val should be like a-z or A-Z0-9 (without brackets) */
        if (!val) { alert('Enter class contents, e.g. a-z0-9'); return null; }
        var pattern = '[' + val + ']';
        try {
          var parsed = RS.parse(pattern);
          node = parsed; /* should be a charclass node */
        } catch (e) {
          alert('Invalid character class: ' + e.message);
          return null;
        }
        break;
      }
      case 'anchor':
        node = { type: 'anchor', kind: (val === '$' ? '$' : '^') };
        break;
      case 'group':
      case 'ncgroup': {
        if (!val) { alert('Enter a pattern for the group.'); return null; }
        var inner;
        try { inner = RS.parse(val); } catch (e) { alert('Invalid pattern: ' + e.message); return null; }
        if (type === 'group') {
          /* find next group index */
          var nextIdx = RS._maxGroup(RS.currentAst || { type: 'empty' }) + 1;
          node = { type: 'group', index: nextIdx, child: inner };
        } else {
          node = { type: 'ncgroup', child: inner };
        }
        break;
      }
      case 'alt': {
        /* Add a new alt branch — handled separately */
        return 'ALT';
      }
      default:
        return null;
    }
  } catch (e) {
    alert('Error: ' + e.message);
    return null;
  }

  /* wrap in quantifier */
  if (quantSel && quantSel !== '') {
    var q;
    if (quantSel === '*')    q = { min: 0, max: Infinity, greedy: true };
    else if (quantSel === '+') q = { min: 1, max: Infinity, greedy: true };
    else if (quantSel === '?') q = { min: 0, max: 1,        greedy: true };
    else if (quantSel === '{n}') {
      var n = parseInt(nVal, 10);
      if (isNaN(n) || n < 0) { alert('Enter a valid integer n.'); return null; }
      q = { min: n, max: n, greedy: true };
    } else if (quantSel === '{n,m}') {
      var nn = parseInt(nVal, 10);
      var mm = mVal === '' ? Infinity : parseInt(mVal, 10);
      if (isNaN(nn) || nn < 0) { alert('Enter a valid integer n.'); return null; }
      if (mm !== Infinity && (isNaN(mm) || mm < nn)) { alert('m must be ≥ n.'); return null; }
      q = { min: nn, max: mm, greedy: true };
    }
    if (q) node = { type: 'quantified', child: node, quant: q };
  }

  return node;
};

/* ══════════════════════════════════════════════
 * Load preset
 * ══════════════════════════════════════════════ */
RS.loadPreset = function (id, useCanonical) {
  var p = RS.PRESETS.filter(function (x) { return x.id === id; })[0];
  if (!p) return false;
  var store = RS.loadStore();
  var hay;
  if (!useCanonical && store.presetId === id && store.haystack !== undefined) {
    hay = store.haystack;
  } else {
    hay = p.haystack;
  }
  var pat;
  if (!useCanonical && store.presetId === id && store.pattern !== undefined) {
    pat = store.pattern;
  } else {
    pat = p.pattern;
  }
  document.getElementById('haystack').value = hay;
  RS.applyPattern(pat, false);
  RS.saveStore({ presetId: id, pattern: pat, haystack: hay });
  return true;
};

/* ══════════════════════════════════════════════
 * Event bindings
 * ══════════════════════════════════════════════ */
RS.bind = function () {
  /* Pattern textarea */
  var patEl = document.getElementById('pattern');
  patEl.addEventListener('input', function () {
    clearTimeout(RS._pt);
    RS._pt = setTimeout(function () {
      RS.applyPattern(patEl.value, false);
    }, 200);
  });
  patEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      RS.applyPattern(patEl.value, false);
    }
  });

  /* Haystack textarea */
  var hayEl = document.getElementById('haystack');
  hayEl.addEventListener('input', function () {
    clearTimeout(RS._ht);
    RS._ht = setTimeout(function () {
      RS.applyHaystack(hayEl.value);
    }, 150);
  });

  /* Haystack highlight — click match */
  document.getElementById('haystack-hl').addEventListener('click', function (e) {
    var span = e.target.closest('.hl-match');
    if (!span) return;
    RS.selectMatch(parseInt(span.getAttribute('data-match'), 10));
  });

  /* Matches list — click */
  document.getElementById('matches-list').addEventListener('click', function (e) {
    var item = e.target.closest('.match-item');
    if (!item) return;
    RS.selectMatch(parseInt(item.getAttribute('data-match'), 10));
  });

  /* Reset button */
  document.getElementById('reset-btn').onclick = function () {
    localStorage.removeItem(RS.STORE);
    var hash = RS.parseHash();
    if (hash.kind === 'p') {
      RS.loadPreset(hash.id, true);
    } else {
      RS.writeHash('p', RS.SEED_PRESET.id);
      RS.loadPreset(RS.SEED_PRESET.id, true);
    }
    RS.renderPresets();
  };

  /* Presets panel */
  document.getElementById('presets').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-pid]');
    if (!btn) return;
    var id = btn.getAttribute('data-pid');
    RS._hashFromClick = true;
    var before = location.hash;
    RS.writeHash('p', id);
    if (location.hash === before) RS.loadPreset(id, true);
  });

  /* Builder — chip remove */
  document.getElementById('builder').addEventListener('click', function (e) {
    if (RS.syncing) return;

    /* close popup on outside click */
    if (!e.target.closest('.quant-popup') && !e.target.closest('[data-toggle-quant]')) {
      RS.closePopup();
    }

    /* chip remove */
    var rm = e.target.closest('[data-rm-branch][data-rm-idx]');
    if (rm) {
      var bi = parseInt(rm.getAttribute('data-rm-branch'), 10);
      var ii = parseInt(rm.getAttribute('data-rm-idx'), 10);
      RS._removeChip(bi, ii);
      return;
    }

    /* branch remove */
    var rmBranch = e.target.closest('.rm-branch');
    if (rmBranch) {
      var bi = parseInt(rmBranch.getAttribute('data-branch'), 10);
      RS._removeBranch(bi);
      return;
    }

    /* quantifier toggle */
    var toggle = e.target.closest('[data-toggle-quant]');
    if (toggle) {
      var chip = toggle.closest('.chip');
      if (chip) RS.openQuantPopup(chip, chip.getAttribute('data-node'));
      return;
    }

    /* add alt branch */
    if (e.target.id === 'add-branch-btn') {
      RS._addBranch();
      return;
    }
  });

  /* Builder-add form */
  document.getElementById('add-atom-btn').addEventListener('click', function () {
    var node = RS.buildAtomFromForm();
    if (!node) return;
    if (node === 'ALT') { RS._addBranch(); return; }
    RS._appendChipToLastBranch(node);
  });

  /* Show/hide n,m inputs based on quant selection */
  document.getElementById('add-quant').addEventListener('change', function () {
    var v = this.value;
    var extra = document.getElementById('quant-extra');
    if (v === '{n}' || v === '{n,m}') {
      extra.classList.add('show');
      document.getElementById('add-quant-m').disabled = v === '{n}';
    } else {
      extra.classList.remove('show');
    }
  });

  /* Explain trace — hover highlight */
  document.getElementById('explain').addEventListener('mouseover', function (e) {
    var row = e.target.closest('.trace-row');
    if (!row) return;
    var ti = parseInt(row.getAttribute('data-ti'), 10);
    var m = RS.currentMatches[RS.selectedMatchIdx];
    if (!m || !m.trace[ti]) return;
    var t = m.trace[ti];
    /* briefly highlight the corresponding span in haystack-hl */
    var spans = document.querySelectorAll('#haystack-hl .hl-match');
    spans.forEach(function (sp) {
      var mi = parseInt(sp.getAttribute('data-match'), 10);
      sp.style.outline = '';
    });
  });

  /* Close popup on document click */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.quant-popup') && !e.target.closest('[data-toggle-quant]')) {
      RS.closePopup();
    }
  }, true);

  /* Hash change */
  window.addEventListener('hashchange', function () {
    var fromClick = RS._hashFromClick;
    RS._hashFromClick = false;
    var hash = RS.parseHash();
    if (hash.kind === 'p') {
      RS.loadPreset(hash.id, fromClick);
      RS.renderPresets();
    }
  });
};

/* ── Helper: remove chip from branch row ── */
RS._removeChip = function (bi, ii) {
  var row = document.querySelector('#builder .branch-row[data-branch="' + bi + '"]');
  if (!row) return;
  var chips = Array.from(row.querySelectorAll('.chip[data-node]'));
  if (chips[ii]) chips[ii].remove();
  RS.builderToPattern();
};

/* ── Helper: remove a branch row ── */
RS._removeBranch = function (bi) {
  var ast = RS.astFromBuilder();
  var branches = RS._flattenAlt(ast);
  branches.splice(bi, 1);
  var newAst;
  if (branches.length === 0) newAst = { type: 'empty' };
  else if (branches.length === 1) newAst = branches[0];
  else newAst = { type: 'alt', alts: branches };
  var pattern = RS.print(newAst);
  RS.currentAst = newAst;
  RS.syncing = true;
  RS.renderBuilder(newAst);
  RS.syncing = false;
  RS.applyPattern(pattern, true);
  document.getElementById('pattern').value = pattern;
};

/* ── Helper: add a new alt branch ── */
RS._addBranch = function () {
  var ast = RS.astFromBuilder();
  var branches = RS._flattenAlt(ast);
  branches.push({ type: 'empty' });
  var newAst = { type: 'alt', alts: branches };
  var pattern = RS.print(newAst);
  RS.currentAst = newAst;
  RS.syncing = true;
  RS.renderBuilder(newAst);
  RS.syncing = false;
  RS.applyPattern(pattern, true);
  document.getElementById('pattern').value = pattern;
};

/* ── Helper: append chip to last branch ── */
RS._appendChipToLastBranch = function (node) {
  var ast = RS.astFromBuilder();
  var branches = RS._flattenAlt(ast);
  var last = branches[branches.length - 1];
  var items = RS._concatItems(last);
  items.push(node);
  var newBranch = items.length === 1 ? items[0] : { type: 'concat', items: items };
  branches[branches.length - 1] = newBranch;
  var newAst = branches.length === 1 ? branches[0] : { type: 'alt', alts: branches };
  var pattern = RS.print(newAst);
  RS.currentAst = newAst;
  RS.syncing = true;
  RS.renderBuilder(newAst);
  RS.syncing = false;
  RS.applyPattern(pattern, true);
  document.getElementById('pattern').value = pattern;
};

/* ══════════════════════════════════════════════
 * Boot
 * ══════════════════════════════════════════════ */
RS.boot = function () {
  RS.renderPresets();
  RS.bind();

  var hash = RS.parseHash();
  if (hash.kind === 'p') {
    if (RS.loadPreset(hash.id, false)) {
      RS.renderPresets();
      return;
    }
  }

  /* restore from storage */
  var store = RS.loadStore();
  if (store.pattern) {
    var hay = store.haystack || '';
    document.getElementById('haystack').value = hay;
    RS.applyPattern(store.pattern, false);
    return;
  }

  /* default: first preset */
  RS.writeHash('p', RS.SEED_PRESET.id);
  RS.loadPreset(RS.SEED_PRESET.id, true);
  RS.renderPresets();
};

document.addEventListener('DOMContentLoaded', RS.boot);
