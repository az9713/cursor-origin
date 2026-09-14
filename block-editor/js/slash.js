/* slash.js — slash command menu */
'use strict';

const SlashMenu = (() => {
  const ITEMS = [
    { type: 'h1',     label: 'Heading 1',  icon: 'H1',  hint: '#'    },
    { type: 'h2',     label: 'Heading 2',  icon: 'H2',  hint: '##'   },
    { type: 'p',      label: 'Paragraph',  icon: 'P',   hint: 'text' },
    { type: 'bullet', label: 'Bullet list',icon: '•',   hint: '-'    },
    { type: 'todo',   label: 'To-do',      icon: '☐',   hint: '[]'   },
    { type: 'code',   label: 'Code',       icon: '</>',  hint: '```'  },
    { type: 'page',   label: 'Sub-page',   icon: '📄',  hint: 'page' },
  ];

  let menuEl = null;
  let active     = false;
  let selIdx     = 0;
  let query      = '';
  let onPickCb   = null;

  function getEl() {
    if (!menuEl) menuEl = document.getElementById('slash-menu');
    return menuEl;
  }

  function filtered() {
    if (!query) return ITEMS;
    const q = query.toLowerCase();
    return ITEMS.filter(it =>
      it.label.toLowerCase().includes(q) || it.type.includes(q)
    );
  }

  function render() {
    const el    = getEl();
    const items = filtered();
    if (!items.length) { hide(); return; }

    el.innerHTML = items.map((it, i) => `
      <div class="slash-item${i === selIdx ? ' selected' : ''}" data-idx="${i}">
        <span class="slash-icon">${it.icon}</span>
        <span class="slash-label">${it.label}</span>
        <span class="slash-hint">${it.hint}</span>
      </div>`).join('');

    el.querySelectorAll('.slash-item').forEach(row => {
      row.addEventListener('mouseenter', () => {
        selIdx = parseInt(row.dataset.idx, 10);
        render();
      });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault(); // don't steal focus from editor
        pick(parseInt(row.dataset.idx, 10));
      });
    });
  }

  function show(anchorEl, cb) {
    onPickCb = cb;
    query    = '';
    selIdx   = 0;
    active   = true;

    const rect = anchorEl.getBoundingClientRect();
    const el   = getEl();
    // Position below the block
    el.style.top  = (rect.bottom + window.scrollY + 6) + 'px';
    el.style.left = Math.max(8, rect.left + window.scrollX) + 'px';
    el.classList.remove('hidden');
    render();
  }

  function hide() {
    active   = false;
    onPickCb = null;
    query    = '';
    selIdx   = 0;
    const el = getEl();
    if (el) el.classList.add('hidden');
  }

  function updateQuery(q) {
    query  = q;
    selIdx = 0;
    render();
    if (!filtered().length) hide();
  }

  function pick(idx) {
    const items = filtered();
    if (idx < 0 || idx >= items.length) return;
    const chosen = items[idx];
    const cb = onPickCb;
    hide();
    if (cb) cb(chosen.type);
  }

  /** Returns true if key was consumed */
  function handleKey(e) {
    if (!active) return false;
    const items = filtered();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selIdx = (selIdx + 1) % items.length;
      render();
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selIdx = (selIdx - 1 + items.length) % items.length;
      render();
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(selIdx);
      return true;
    }
    if (e.key === 'Escape') {
      hide();
      return true;
    }
    return false;
  }

  // Hide on outside click
  document.addEventListener('mousedown', (e) => {
    if (active && menuEl && !menuEl.contains(e.target)) hide();
  });

  return {
    get active() { return active; },
    show, hide, updateQuery, handleKey,
  };
})();
