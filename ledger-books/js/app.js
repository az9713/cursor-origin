/**
 * app.js — UI controller for ledger-books
 * Depends on window.Ledger (ledger.js)
 * Hash routing: #/e/<entryId>
 */

'use strict';

const L = window.Ledger;
let state = L.loadState();

function book() {
  return L.currentBook(state);
}

// ─────────────────────────────────────────────
//  Toast system
// ─────────────────────────────────────────────

function toast(msg, type = 'info', duration = 3000) {
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ─────────────────────────────────────────────
//  Navigation / hash routing
// ─────────────────────────────────────────────

const VIEWS = ['journal', 'trial-balance', 'pl', 'accounts', 'audit'];

function activateView(viewId) {
  VIEWS.forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('active', v === viewId);
    document.querySelector(`[data-view="${v}"]`)?.classList.toggle('active', v === viewId);
  });

  // Render the active view
  switch (viewId) {
    case 'journal':       renderJournal();      break;
    case 'trial-balance': renderTrialBalance(); break;
    case 'pl':            renderPL();           break;
    case 'accounts':      renderAccounts();     break;
    case 'audit':         renderAudit();        break;
  }
}

/** Parse hash and activate appropriate view / scroll to entry */
function handleHash() {
  const hash = window.location.hash;
  const m = hash.match(/^#\/e\/(.+)$/);
  if (m) {
    activateView('journal');
    // Scroll to and open the entry card
    const entryId = m[1];
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-entry-id="${entryId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const body = card.querySelector('.entry-body');
        if (body) body.classList.add('open');
        card.style.outline = '2px solid var(--rust)';
        setTimeout(() => card.style.outline = '', 2000);
      }
    });
    return;
  }

  const viewMap = {
    '#/trial-balance': 'trial-balance',
    '#/pl':            'pl',
    '#/accounts':      'accounts',
    '#/audit':         'audit',
    '#/journal':       'journal',
    '#/':              'journal',
    '':                'journal',
  };
  const view = viewMap[hash] || 'journal';
  activateView(view);
}

// ─────────────────────────────────────────────
//  Accounts view
// ─────────────────────────────────────────────

function renderAccounts() {
  const grid = document.getElementById('accounts-grid');
  const types = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  const grouped = {};
  types.forEach(t => { grouped[t] = book().accounts.filter(a => a.type === t); });

  let html = '';
  types.forEach(type => {
    if (!grouped[type].length) return;
    html += `<div style="grid-column:1/-1;margin-top:var(--sp-3);">
      <span class="account-type type-${type}" style="font-size:.8rem;">${type.charAt(0).toUpperCase()+type.slice(1)}s</span>
    </div>`;
    grouped[type].forEach(a => {
      html += `<div class="account-chip">
        <span class="account-code">${a.code}</span>
        <span class="account-name">${escHtml(a.name)}</span>
        <span class="account-type type-${a.type}">${a.type}</span>
      </div>`;
    });
  });
  grid.innerHTML = html;
  document.getElementById('accounts-count').textContent = book().accounts.length;
}

// ─────────────────────────────────────────────
//  Journal view
// ─────────────────────────────────────────────

function renderJournal() {
  const list = document.getElementById('entry-list');
  // Sort newest date first
  const sorted = [...book().entries].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (b.postedAt || 0) - (a.postedAt || 0);
  });

  if (!sorted.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><p>No entries yet.</p></div>`;
    return;
  }

  list.innerHTML = sorted.map(entry => entryCardHtml(entry)).join('');

  // Attach toggle listeners
  list.querySelectorAll('.entry-head').forEach(head => {
    head.addEventListener('click', e => {
      if (e.target.closest('.entry-actions')) return;
      const card = head.closest('.entry-card');
      const body = card.querySelector('.entry-body');
      body.classList.toggle('open');
    });
  });

  // Action buttons
  list.querySelectorAll('[data-action="post"]').forEach(btn => {
    btn.addEventListener('click', () => doPost(btn.dataset.entryId));
  });
  list.querySelectorAll('[data-action="reverse"]').forEach(btn => {
    btn.addEventListener('click', () => doReverse(btn.dataset.entryId));
  });
  list.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => doDelete(btn.dataset.entryId));
  });
  list.querySelectorAll('[data-action="copy-link"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}#/e/${btn.dataset.entryId}`;
      navigator.clipboard?.writeText(url) || prompt('Copy link:', url);
      toast('Link copied', 'success');
    });
  });

  document.getElementById('journal-count').textContent = sorted.length;
}

function entryCardHtml(entry) {
  const getAcct = id => book().accounts.find(a => a.id === id);
  const totalDR = L.entryTotalDebits(entry);

  let statusClass, statusLabel;
  if (entry.reversedBy) {
    statusClass = 'reversed'; statusLabel = 'Reversed';
  } else if (entry.posted) {
    statusClass = 'posted'; statusLabel = 'Posted';
  } else {
    statusClass = 'draft'; statusLabel = 'Draft';
  }

  const actions = [];
  if (!entry.posted) {
    actions.push(`<button class="btn btn-sm btn-primary" data-action="post" data-entry-id="${entry.id}">Post</button>`);
    actions.push(`<button class="btn btn-sm btn-ghost" data-action="delete" data-entry-id="${entry.id}">Delete</button>`);
  } else if (!entry.reversedBy) {
    actions.push(`<button class="btn btn-sm btn-danger" data-action="reverse" data-entry-id="${entry.id}">Reverse</button>`);
  }
  actions.push(`<button class="btn btn-sm btn-ghost" data-action="copy-link" data-entry-id="${entry.id}" title="Copy link">🔗</button>`);

  const linesHtml = entry.lines.map(l => {
    const acct = getAcct(l.accountId);
    return `<tr>
      <td>${acct ? escHtml(acct.code) : l.accountId}</td>
      <td>${acct ? escHtml(acct.name) : '?'}</td>
      <td class="num debit-amt">${l.debitCents  ? L.formatCents(l.debitCents)  : ''}</td>
      <td class="num credit-amt">${l.creditCents ? L.formatCents(l.creditCents) : ''}</td>
    </tr>`;
  }).join('');

  let auditHtml = '';
  if (entry.reverses) {
    auditHtml = `<p class="entry-audit">Reversal of <a href="#/e/${entry.reverses}">${entry.reverses}</a></p>`;
  }
  if (entry.reversedBy) {
    auditHtml += `<p class="entry-audit">Reversed by <a href="#/e/${entry.reversedBy}">${entry.reversedBy}</a></p>`;
  }
  if (entry.postedAt) {
    auditHtml += `<p class="entry-audit">Posted ${L.formatTimestamp(entry.postedAt)}</p>`;
  }

  return `
  <div class="entry-card ${statusClass}" data-entry-id="${entry.id}">
    <div class="entry-head">
      <span class="entry-id">${escHtml(entry.id)}</span>
      <span class="entry-date">${L.formatDate(entry.date)}</span>
      <span class="entry-memo">${escHtml(entry.memo)}</span>
      <span class="entry-total">${L.formatCents(totalDR)}</span>
      <span class="entry-status status-${statusClass}">${statusLabel}</span>
      <div class="entry-actions">${actions.join('')}</div>
    </div>
    <div class="entry-body">
      <table class="entry-lines-tbl">
        <thead>
          <tr><th>Code</th><th>Account</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr>
        </thead>
        <tbody>${linesHtml}</tbody>
      </table>
      ${auditHtml}
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
//  Journal actions
// ─────────────────────────────────────────────

function doPost(entryId) {
  const res = L.postEntry(state, entryId);
  if (!res.ok) { toast(res.error, 'error'); return; }
  toast(`Entry ${entryId} posted ✓`, 'success');
  renderJournal();
}

function doReverse(entryId) {
  if (!confirm(`Reverse entry ${entryId}? A new balancing entry will be auto-posted.`)) return;
  const res = L.reverseEntry(state, entryId);
  if (!res.ok) { toast(res.error, 'error'); return; }
  toast(`Entry ${entryId} reversed → ${res.reversalEntry.id}`, 'success');
  renderJournal();
}

function doDelete(entryId) {
  if (!confirm(`Delete draft ${entryId}?`)) return;
  const res = L.deleteDraftEntry(state, entryId);
  if (!res.ok) { toast(res.error, 'error'); return; }
  toast(`Draft ${entryId} deleted`, 'info');
  renderJournal();
}

// ─────────────────────────────────────────────
//  New-entry modal
// ─────────────────────────────────────────────

let draftLines = [];

function openNewEntryModal() {
  draftLines = [
    { accountId: '', debitCents: 0, creditCents: 0 },
    { accountId: '', debitCents: 0, creditCents: 0 },
  ];
  document.getElementById('entry-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('entry-memo').value = '';
  renderDraftLines();
  updateBalanceIndicator();
  document.getElementById('modal-backdrop').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
}

function renderDraftLines() {
  const container = document.getElementById('lines-container');
  const accountOptions = [...book().accounts]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(a => `<option value="${a.id}">${escHtml(a.code)} — ${escHtml(a.name)}</option>`)
    .join('');

  container.innerHTML = draftLines.map((line, i) => `
    <div class="line-row">
      <select data-line="${i}" data-field="accountId">
        <option value="">— Select account —</option>
        ${accountOptions}
      </select>
      <input type="number" min="0" step="0.01" placeholder="Debit $"
             value="${line.debitCents ? (line.debitCents/100).toFixed(2) : ''}"
             data-line="${i}" data-field="debit" />
      <input type="number" min="0" step="0.01" placeholder="Credit $"
             value="${line.creditCents ? (line.creditCents/100).toFixed(2) : ''}"
             data-line="${i}" data-field="credit" />
      <button class="btn-ghost btn btn-sm" data-remove="${i}" title="Remove line">✕</button>
    </div>
  `).join('');

  // Pre-select account
  draftLines.forEach((line, i) => {
    const sel = container.querySelector(`select[data-line="${i}"]`);
    if (sel && line.accountId) sel.value = line.accountId;
  });

  // Listeners
  container.querySelectorAll('select[data-line]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.line;
      draftLines[i].accountId = sel.value;
      updateBalanceIndicator();
    });
  });
  container.querySelectorAll('input[data-field="debit"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.line;
      const cents = L.parseDollarsToCents(inp.value);
      draftLines[i].debitCents  = cents;
      draftLines[i].creditCents = 0; // mutual exclusion hint (UI only)
      updateBalanceIndicator();
    });
  });
  container.querySelectorAll('input[data-field="credit"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.line;
      const cents = L.parseDollarsToCents(inp.value);
      draftLines[i].creditCents = cents;
      draftLines[i].debitCents  = 0;
      updateBalanceIndicator();
    });
  });
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.remove;
      draftLines.splice(i, 1);
      renderDraftLines();
      updateBalanceIndicator();
    });
  });
}

function updateBalanceIndicator() {
  const indicator   = document.getElementById('balance-indicator');
  const saveBtn     = document.getElementById('btn-save-entry');
  const savePostBtn = document.getElementById('btn-save-post-entry');

  const totalDR = draftLines.reduce((s, l) => s + (l.debitCents || 0), 0);
  const totalCR = draftLines.reduce((s, l) => s + (l.creditCents || 0), 0);

  if (totalDR === 0 && totalCR === 0) {
    indicator.className = 'balance-indicator empty';
    indicator.textContent = 'Add amounts to balance';
    saveBtn.disabled = true;
    savePostBtn.disabled = true;
    return;
  }

  const diff = totalDR - totalCR;
  if (diff === 0) {
    indicator.className = 'balance-indicator balanced';
    indicator.textContent = `✓ Balanced — ${L.formatCents(totalDR)}`;
    saveBtn.disabled = false;
    savePostBtn.disabled = false;
  } else {
    indicator.className = 'balance-indicator unbalanced';
    const sign = diff > 0 ? `DR over by ${L.formatCents(Math.abs(diff))}` : `CR over by ${L.formatCents(Math.abs(diff))}`;
    indicator.textContent = `✗ ${sign}`;
    saveBtn.disabled = true;
    savePostBtn.disabled = true;
  }
}

function saveNewEntry(andPost = false) {
  const date = document.getElementById('entry-date').value;
  const memo = document.getElementById('entry-memo').value.trim();

  if (!date) { toast('Date is required', 'error'); return; }
  if (!memo)  { toast('Memo is required', 'error'); return; }

  // Build clean lines from draftLines (filter empties)
  const lines = draftLines.filter(l =>
    l.accountId && (l.debitCents > 0 || l.creditCents > 0)
  ).map(l => ({
    accountId:   l.accountId,
    debitCents:  l.debitCents,
    creditCents: l.creditCents,
  }));

  const err = L.validateEntryLines(lines, book().accounts);
  if (err) { toast(err, 'error'); return; }

  const result = L.createEntry(state, { date, memo, lines });
  if (!result.ok) { toast(result.error, 'error'); return; }

  if (andPost) {
    const postResult = L.postEntry(state, result.entry.id);
    if (!postResult.ok) {
      toast(`Draft saved but could not post: ${postResult.error}`, 'error');
    } else {
      toast(`Entry ${result.entry.id} saved & posted ✓`, 'success');
    }
  } else {
    toast(`Draft ${result.entry.id} saved`, 'info');
  }

  closeModal();
  renderJournal();
  // Navigate to entry
  window.location.hash = `#/e/${result.entry.id}`;
}

// ─────────────────────────────────────────────
//  Trial Balance view
// ─────────────────────────────────────────────

function renderTrialBalance() {
  const { rows, totalDebits, totalCredits, balanced } = L.trialBalance(state);
  const bookName = L.BOOK_LABELS[state.currentBookId] || 'Personal';

  const banner = document.getElementById('tb-banner');
  const tbody  = document.getElementById('tb-tbody');
  const tfootDR = document.getElementById('tb-tfoot-dr');
  const tfootCR = document.getElementById('tb-tfoot-cr');

  banner.className = `tb-foot-banner ${balanced ? 'ok' : 'fail'}`;
  banner.textContent = balanced
    ? `✓ ${bookName} trial balance foots — Total Debits = Total Credits = ${L.formatCents(totalDebits)}`
    : `✗ ${bookName} out of balance! Debits ${L.formatCents(totalDebits)} ≠ Credits ${L.formatCents(totalCredits)}`;

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="num" style="font-family:var(--font-mono)">${escHtml(r.account.code)}</td>
      <td>${escHtml(r.account.name)}</td>
      <td><span class="account-type type-${r.account.type}">${r.account.type}</span></td>
      <td class="debit-amt">${r.debitCents  ? L.formatCents(r.debitCents)  : ''}</td>
      <td class="credit-amt">${r.creditCents ? L.formatCents(r.creditCents) : ''}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" style="text-align:center;padding:var(--sp-5);color:var(--text-muted)">No posted entries yet.</td></tr>`;

  const cls = balanced ? 'foot-equal' : 'foot-unequal';
  tfootDR.innerHTML = `<span class="${cls}">${L.formatCents(totalDebits)}</span>`;
  tfootCR.innerHTML = `<span class="${cls}">${L.formatCents(totalCredits)}</span>`;
}

// ─────────────────────────────────────────────
//  P&L view
// ─────────────────────────────────────────────

function renderPL() {
  const fromDate = document.getElementById('pl-from').value || '2026-01-01';
  const toDate   = document.getElementById('pl-to').value   || new Date().toISOString().slice(0, 10);
  const { revenueRows, expenseRows, totalRevenue, totalExpense, net } = L.profitAndLoss(state, fromDate, toDate);

  const tbody = document.getElementById('pl-tbody');
  let html = '';

  html += `<tr><td colspan="2" class="pl-section-head">Revenue</td></tr>`;
  if (revenueRows.length) {
    revenueRows.forEach(r => {
      html += `<tr>
        <td style="padding-left:var(--sp-5)">${escHtml(r.account.name)}</td>
        <td class="num credit-amt">${L.formatCents(r.cents)}</td>
      </tr>`;
    });
  } else {
    html += `<tr><td colspan="2" style="padding-left:var(--sp-5);color:var(--text-muted);font-size:.82rem">No revenue in period</td></tr>`;
  }
  html += `<tr><td style="font-weight:600;padding-left:var(--sp-4)">Total Revenue</td><td class="num credit-amt" style="font-weight:600">${L.formatCents(totalRevenue)}</td></tr>`;

  html += `<tr><td colspan="2" class="pl-section-head" style="margin-top:var(--sp-3)">Expenses</td></tr>`;
  if (expenseRows.length) {
    expenseRows.forEach(r => {
      html += `<tr>
        <td style="padding-left:var(--sp-5)">${escHtml(r.account.name)}</td>
        <td class="num debit-amt">${L.formatCents(r.cents)}</td>
      </tr>`;
    });
  } else {
    html += `<tr><td colspan="2" style="padding-left:var(--sp-5);color:var(--text-muted);font-size:.82rem">No expenses in period</td></tr>`;
  }
  html += `<tr><td style="font-weight:600;padding-left:var(--sp-4)">Total Expenses</td><td class="num debit-amt" style="font-weight:600">${L.formatCents(totalExpense)}</td></tr>`;

  const netClass = net >= 0 ? 'credit-amt' : 'debit-amt';
  html += `<tr class="pl-net-row">
    <td>Net ${net >= 0 ? 'Income' : 'Loss'}</td>
    <td class="num ${netClass}">${L.formatCentsSigned(net)}</td>
  </tr>`;

  tbody.innerHTML = html;
}

// ─────────────────────────────────────────────
//  Audit log view
// ─────────────────────────────────────────────

function renderAudit() {
  const list = document.getElementById('audit-list');
  const sorted = [...book().auditLog].sort((a, b) => b.at - a.at);

  if (!sorted.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No audit events yet.</p></div>`;
    return;
  }

  list.innerHTML = sorted.map(ev => `
    <div class="audit-item">
      <span class="audit-time">${L.formatTimestamp(ev.at)}</span>
      <span class="audit-action ${ev.action}">${ev.action.toUpperCase()}</span>
      <a class="audit-ref" href="#/e/${ev.entryId}">${ev.entryId}</a>
      ${ev.reversesId ? `<span style="color:var(--text-muted);font-size:.78rem">← reverses <a class="audit-ref" href="#/e/${ev.reversesId}">${ev.reversesId}</a></span>` : ''}
      <span class="audit-desc">${escHtml(ev.memo)}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
//  Reset
// ─────────────────────────────────────────────

function doReset() {
  if (!confirm('Reset both books to seed data? All custom entries will be lost.')) return;
  L.resetToSeed(state);
  toast('Reset both books to seed', 'info');
  updateBookSwitcher();
  handleHash();
}

function updateBookSwitcher() {
  document.querySelectorAll('.book-btn').forEach(btn => {
    const on = btn.dataset.book === state.currentBookId;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function switchToBook(bookId) {
  if (bookId === state.currentBookId) return;
  const res = L.switchBook(state, bookId);
  if (!res.ok) { toast(res.error, 'error'); return; }
  closeModal();
  updateBookSwitcher();
  // Hash stays #/e/<id> but resolves only inside the current book.
  handleHash();
}

// ─────────────────────────────────────────────
//  Utility
// ─────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
//  Initialization
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Nav buttons
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = '#/' + btn.dataset.view;
    });
  });

  // Modal controls
  document.getElementById('btn-new-entry').addEventListener('click', openNewEntryModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('btn-add-line').addEventListener('click', () => {
    draftLines.push({ accountId: '', debitCents: 0, creditCents: 0 });
    renderDraftLines();
    updateBalanceIndicator();
  });
  document.getElementById('btn-save-entry').addEventListener('click', () => saveNewEntry(false));
  document.getElementById('btn-save-post-entry').addEventListener('click', () => saveNewEntry(true));

  // P&L date controls
  const fromInput = document.getElementById('pl-from');
  const toInput   = document.getElementById('pl-to');
  if (fromInput) {
    fromInput.value = '2026-01-01';
    toInput.value   = new Date().toISOString().slice(0, 10);
    fromInput.addEventListener('change', renderPL);
    toInput.addEventListener('change',   renderPL);
  }

  // Reset button
  document.getElementById('btn-reset').addEventListener('click', doReset);

  // Book switcher
  document.querySelectorAll('.book-btn').forEach(btn => {
    btn.addEventListener('click', () => switchToBook(btn.dataset.book));
  });
  updateBookSwitcher();

  // Hash routing
  window.addEventListener('hashchange', handleHash);
  handleHash(); // initial
});
