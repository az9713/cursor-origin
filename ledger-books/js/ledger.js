/**
 * ledger.js — pure domain logic for double-entry bookkeeping
 * Amounts in integer cents throughout. No DOM dependencies.
 * Storage key: ledger-books-v1
 */

'use strict';

const STORAGE_KEY = 'ledger-books-v1';

// ─────────────────────────────────────────────
//  Default seed data
// ─────────────────────────────────────────────

const SEED_ACCOUNTS = [
  { id: 'a1',  code: '1010', name: 'Cash',                  type: 'asset'     },
  { id: 'a2',  code: '1200', name: 'Accounts Receivable',   type: 'asset'     },
  { id: 'a3',  code: '1500', name: 'Equipment',             type: 'asset'     },
  { id: 'a4',  code: '2010', name: 'Accounts Payable',      type: 'liability' },
  { id: 'a5',  code: '2500', name: 'Notes Payable',         type: 'liability' },
  { id: 'a6',  code: '3010', name: 'Owner Equity',          type: 'equity'    },
  { id: 'a7',  code: '4010', name: 'Service Revenue',       type: 'revenue'   },
  { id: 'a8',  code: '4020', name: 'Interest Income',       type: 'revenue'   },
  { id: 'a9',  code: '5010', name: 'Salary Expense',        type: 'expense'   },
  { id: 'a10', code: '5020', name: 'Rent Expense',          type: 'expense'   },
  { id: 'a11', code: '5030', name: 'Utilities Expense',     type: 'expense'   },
];

// Posted entries — all balanced (sum debits = sum credits)
function buildSeedEntries() {
  const now = Date.now();
  return [
    {
      id: 'e1',
      date: '2026-01-15',
      memo: 'Owner invests capital into business',
      lines: [
        { accountId: 'a1', debitCents: 1500000, creditCents: 0 },  // Cash DR 15,000
        { accountId: 'a6', debitCents: 0,       creditCents: 1500000 }, // Owner Equity CR
      ],
      posted: true,
      postedAt: now - 7*86400000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'e2',
      date: '2026-02-01',
      memo: 'Purchase equipment on note payable',
      lines: [
        { accountId: 'a3', debitCents: 800000,  creditCents: 0 },   // Equipment DR 8,000
        { accountId: 'a5', debitCents: 0,        creditCents: 800000 },  // Notes Payable CR
      ],
      posted: true,
      postedAt: now - 6*86400000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'e3',
      date: '2026-02-15',
      memo: 'Billed client for consulting services',
      lines: [
        { accountId: 'a2', debitCents: 450000,  creditCents: 0 },   // A/R DR 4,500
        { accountId: 'a7', debitCents: 0,        creditCents: 450000 },  // Service Revenue CR
      ],
      posted: true,
      postedAt: now - 5*86400000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'e4',
      date: '2026-03-01',
      memo: 'Pay monthly rent and salaries',
      lines: [
        { accountId: 'a9', debitCents: 200000,  creditCents: 0 },   // Salary DR 2,000
        { accountId: 'a10', debitCents: 120000, creditCents: 0 },   // Rent DR 1,200
        { accountId: 'a1', debitCents: 0,        creditCents: 320000 }, // Cash CR 3,200
      ],
      posted: true,
      postedAt: now - 4*86400000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'e5',
      date: '2026-03-10',
      memo: 'Collect cash from client invoice',
      lines: [
        { accountId: 'a1', debitCents: 450000,  creditCents: 0 },   // Cash DR
        { accountId: 'a2', debitCents: 0,        creditCents: 450000 }, // A/R CR
      ],
      posted: true,
      postedAt: now - 3*86400000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'e6',
      date: '2026-03-20',
      memo: 'Utilities bill accrual',
      lines: [
        { accountId: 'a11', debitCents: 35000,  creditCents: 0 },   // Utilities DR 350
        { accountId: 'a4',  debitCents: 0,       creditCents: 35000 }, // A/P CR
      ],
      posted: true,
      postedAt: now - 2*86400000,
      reversedBy: null,
      reverses: null,
    },
  ];
}

// ─────────────────────────────────────────────
//  State helpers
// ─────────────────────────────────────────────

function emptyState() {
  return {
    accounts: [...SEED_ACCOUNTS],
    entries: buildSeedEntries(),
    auditLog: [],
    nextEntrySeq: 100,
  };
}

/** Load state from localStorage, falling back to seed. */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Basic integrity check
      if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.entries)) {
        // Seed entries postedAt may be missing if loaded from old save — patch
        parsed.entries.forEach(e => {
          if (e.posted && !e.postedAt) e.postedAt = Date.now();
        });
        return parsed;
      }
    }
  } catch (_) {
    // corrupted; fall through to seed
  }
  const state = emptyState();
  // Build initial audit log from seeded posted entries
  state.entries.forEach(e => {
    if (e.posted) {
      state.auditLog.push({
        at: e.postedAt,
        action: 'post',
        entryId: e.id,
        memo: e.memo,
      });
    }
  });
  return state;
}

/** Persist state to localStorage. */
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─────────────────────────────────────────────
//  ID generation
// ─────────────────────────────────────────────

function nextEntryId(state) {
  const id = 'e' + state.nextEntrySeq;
  state.nextEntrySeq += 1;
  return id;
}

// ─────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────

/**
 * Returns null if valid, or an error string.
 * Rules:
 *   - ≥ 2 lines
 *   - Each line: exactly one of debit/credit > 0, other === 0
 *   - sum(debits) === sum(credits)
 *   - All accountIds exist
 */
function validateEntryLines(lines, accounts) {
  if (!lines || lines.length < 2) return 'Entry must have at least 2 lines.';
  const accountIds = new Set(accounts.map(a => a.id));
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    if (!accountIds.has(line.accountId)) return `Unknown account id: ${line.accountId}`;
    const d = parseInt(line.debitCents, 10)  || 0;
    const c = parseInt(line.creditCents, 10) || 0;
    if (d < 0 || c < 0) return 'Amounts must be non-negative.';
    if (d === 0 && c === 0) return 'Each line must have a non-zero amount.';
    if (d > 0 && c > 0) return 'Each line must be debit-only or credit-only.';
    totalDebit  += d;
    totalCredit += c;
  }
  if (totalDebit !== totalCredit) {
    return `Entry does not balance: debits ${formatCents(totalDebit)} ≠ credits ${formatCents(totalCredit)}`;
  }
  return null; // valid
}

// ─────────────────────────────────────────────
//  CRUD operations
// ─────────────────────────────────────────────

/**
 * Create a new draft entry. Returns { ok, entry, error }.
 */
function createEntry(state, { date, memo, lines }) {
  const entry = {
    id: nextEntryId(state),
    date: date || new Date().toISOString().slice(0, 10),
    memo: memo || '',
    lines: lines.map(l => ({
      accountId:   l.accountId,
      debitCents:  parseInt(l.debitCents,  10) || 0,
      creditCents: parseInt(l.creditCents, 10) || 0,
    })),
    posted: false,
    postedAt: null,
    reversedBy: null,
    reverses: null,
  };
  state.entries.push(entry);
  saveState(state);
  return { ok: true, entry };
}

/**
 * Post a draft entry. Validates balance first.
 * Returns { ok, entry, error }.
 */
function postEntry(state, entryId) {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) return { ok: false, error: 'Entry not found.' };
  if (entry.posted) return { ok: false, error: 'Entry is already posted.' };

  const err = validateEntryLines(entry.lines, state.accounts);
  if (err) return { ok: false, error: err };

  entry.posted   = true;
  entry.postedAt = Date.now();
  state.auditLog.push({
    at: entry.postedAt,
    action: 'post',
    entryId: entry.id,
    memo: entry.memo,
  });
  saveState(state);
  return { ok: true, entry };
}

/**
 * Reverse a posted entry. Creates and auto-posts a mirror entry.
 * Returns { ok, reversalEntry, error }.
 */
function reverseEntry(state, entryId) {
  const orig = state.entries.find(e => e.id === entryId);
  if (!orig) return { ok: false, error: 'Entry not found.' };
  if (!orig.posted) return { ok: false, error: 'Cannot reverse a draft entry. Post it first.' };
  if (orig.reversedBy) return { ok: false, error: 'Entry has already been reversed.' };

  const now = Date.now();
  const reversalId = nextEntryId(state);
  const reversalLines = orig.lines.map(l => ({
    accountId:   l.accountId,
    debitCents:  l.creditCents, // swap
    creditCents: l.debitCents,
  }));

  const reversal = {
    id: reversalId,
    date: new Date().toISOString().slice(0, 10),
    memo: `REVERSAL of ${orig.id}: ${orig.memo}`,
    lines: reversalLines,
    posted: true,
    postedAt: now,
    reversedBy: null,
    reverses: orig.id,
  };

  orig.reversedBy = reversalId;
  state.entries.push(reversal);
  state.auditLog.push({
    at: now,
    action: 'reverse',
    entryId: reversalId,
    reversesId: orig.id,
    memo: reversal.memo,
  });
  saveState(state);
  return { ok: true, reversalEntry: reversal };
}

/**
 * Delete a draft (unposted) entry.
 */
function deleteDraftEntry(state, entryId) {
  const idx = state.entries.findIndex(e => e.id === entryId);
  if (idx === -1) return { ok: false, error: 'Entry not found.' };
  if (state.entries[idx].posted) return { ok: false, error: 'Cannot delete a posted entry.' };
  state.entries.splice(idx, 1);
  saveState(state);
  return { ok: true };
}

// ─────────────────────────────────────────────
//  Reporting
// ─────────────────────────────────────────────

/**
 * Trial balance — posted lines only, grouped by account.
 * Returns { rows, totalDebits, totalCredits, balanced }
 *   row: { account, debitCents, creditCents, netCents }
 */
function trialBalance(state) {
  const balances = new Map(); // accountId → { debit, credit }
  state.accounts.forEach(a => balances.set(a.id, { debit: 0, credit: 0 }));

  state.entries
    .filter(e => e.posted)
    .forEach(e => {
      e.lines.forEach(l => {
        const b = balances.get(l.accountId);
        if (!b) return;
        b.debit  += l.debitCents;
        b.credit += l.creditCents;
      });
    });

  let totalDebits  = 0;
  let totalCredits = 0;

  const rows = state.accounts.map(a => {
    const b = balances.get(a.id) || { debit: 0, credit: 0 };
    totalDebits  += b.debit;
    totalCredits += b.credit;
    return {
      account:     a,
      debitCents:  b.debit,
      creditCents: b.credit,
      netCents:    b.debit - b.credit,
    };
  }).filter(r => r.debitCents !== 0 || r.creditCents !== 0);

  return {
    rows,
    totalDebits,
    totalCredits,
    balanced: totalDebits === totalCredits,
  };
}

/**
 * P&L summary for a date range [fromDate, toDate] inclusive.
 * Returns { revenueRows, expenseRows, totalRevenue, totalExpense, net }
 */
function profitAndLoss(state, fromDate, toDate) {
  const revenueMap = new Map(); // accountId → cents
  const expenseMap = new Map();

  state.accounts
    .filter(a => a.type === 'revenue' || a.type === 'expense')
    .forEach(a => {
      if (a.type === 'revenue') revenueMap.set(a.id, 0);
      else expenseMap.set(a.id, 0);
    });

  state.entries
    .filter(e => e.posted && e.date >= fromDate && e.date <= toDate)
    .forEach(e => {
      e.lines.forEach(l => {
        if (revenueMap.has(l.accountId)) {
          // Revenue increases by credits (normal balance CR)
          revenueMap.set(l.accountId, revenueMap.get(l.accountId) + l.creditCents - l.debitCents);
        }
        if (expenseMap.has(l.accountId)) {
          // Expense increases by debits (normal balance DR)
          expenseMap.set(l.accountId, expenseMap.get(l.accountId) + l.debitCents - l.creditCents);
        }
      });
    });

  const getAcct = id => state.accounts.find(a => a.id === id);

  const revenueRows = [...revenueMap.entries()].map(([id, cents]) => ({
    account: getAcct(id),
    cents,
  })).filter(r => r.cents !== 0);

  const expenseRows = [...expenseMap.entries()].map(([id, cents]) => ({
    account: getAcct(id),
    cents,
  })).filter(r => r.cents !== 0);

  const totalRevenue = revenueRows.reduce((s, r) => s + r.cents, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.cents, 0);

  return {
    revenueRows,
    expenseRows,
    totalRevenue,
    totalExpense,
    net: totalRevenue - totalExpense,
  };
}

// ─────────────────────────────────────────────
//  Formatting utilities
// ─────────────────────────────────────────────

/** Format integer cents to "$1,234.56" */
function formatCents(cents) {
  if (cents === 0) return '—';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const centsStr = String(abs % 100).padStart(2, '0');
  const dollarsFormatted = dollars.toLocaleString('en-US');
  return (neg ? '(' : '') + '$' + dollarsFormatted + '.' + centsStr + (neg ? ')' : '');
}

/** Format cents with sign for net display */
function formatCentsSigned(cents) {
  if (cents === 0) return '$0.00';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const centsStr = String(abs % 100).padStart(2, '0');
  return (neg ? '-$' : '$') + dollars.toLocaleString('en-US') + '.' + centsStr;
}

/** Parse a dollar string like "1,234.56" or "1234.56" to integer cents */
function parseDollarsToCents(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[$,\s]/g, '');
  const f = parseFloat(cleaned);
  if (isNaN(f)) return 0;
  return Math.round(f * 100);
}

/** Format ISO date to friendly "Jan 15, 2026" */
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m-1]} ${d}, ${y}`;
}

/** Format a timestamp ms to "2026-03-01 14:22" */
function formatTimestamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sum debits across an entry's lines */
function entryTotalDebits(entry) {
  return entry.lines.reduce((s, l) => s + (parseInt(l.debitCents, 10) || 0), 0);
}

// ─────────────────────────────────────────────
//  Reset
// ─────────────────────────────────────────────

function resetToSeed(state) {
  const fresh = emptyState();
  // Build audit from seeded posted entries
  fresh.entries.forEach(e => {
    if (e.posted) {
      fresh.auditLog.push({
        at: e.postedAt,
        action: 'post',
        entryId: e.id,
        memo: e.memo,
      });
    }
  });
  Object.assign(state, fresh);
  saveState(state);
}

// ─────────────────────────────────────────────
//  Exports (namespace on window for script-tag usage)
// ─────────────────────────────────────────────

window.Ledger = {
  // State management
  loadState,
  saveState,
  resetToSeed,

  // Operations
  createEntry,
  postEntry,
  reverseEntry,
  deleteDraftEntry,

  // Reports
  trialBalance,
  profitAndLoss,

  // Validation
  validateEntryLines,

  // Formatting
  formatCents,
  formatCentsSigned,
  parseDollarsToCents,
  formatDate,
  formatTimestamp,
  entryTotalDebits,
};
