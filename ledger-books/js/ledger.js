/**
 * ledger.js — pure domain logic for double-entry bookkeeping
 * Amounts in integer cents throughout. No DOM dependencies.
 * Storage key: ledger-books-v1
 *
 * Root state: { books: { personal: Book, business: Book }, currentBookId }
 * Each Book: { id, accounts, entries, auditLog, nextEntrySeq }
 */

'use strict';

const STORAGE_KEY = 'ledger-books-v1';

const BOOK_IDS = ['personal', 'business'];
const BOOK_LABELS = { personal: 'Personal', business: 'Business' };

// ─────────────────────────────────────────────
//  Default seed data — Personal (Session A)
// ─────────────────────────────────────────────

const SEED_ACCOUNTS_PERSONAL = [
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

/** Posted entries — all balanced (sum debits = sum credits). TB foots $35,550.00 */
function buildPersonalSeedEntries() {
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
//  Default seed data — Business (Session C)
// ─────────────────────────────────────────────

const SEED_ACCOUNTS_BUSINESS = [
  { id: 'b1',  code: '1100', name: 'Operating Cash',        type: 'asset'     },
  { id: 'b2',  code: '1300', name: 'Trade Receivables',     type: 'asset'     },
  { id: 'b3',  code: '1400', name: 'Merchandise Inventory', type: 'asset'     },
  { id: 'b4',  code: '2100', name: 'Trade Payables',        type: 'liability' },
  { id: 'b5',  code: '3100', name: 'Common Stock',          type: 'equity'    },
  { id: 'b6',  code: '4100', name: 'Product Sales',         type: 'revenue'   },
  { id: 'b7',  code: '5100', name: 'Cost of Goods Sold',    type: 'expense'   },
  { id: 'b8',  code: '5200', name: 'Office Expense',        type: 'expense'   },
  { id: 'b9',  code: '5300', name: 'Advertising Expense',   type: 'expense'   },
];

/** ≥ 4 posted balancing entries. TB foots $90,000.00 */
function buildBusinessSeedEntries() {
  const now = Date.now();
  return [
    {
      id: 'be1',
      date: '2026-01-10',
      memo: 'Founders contribute cash for common stock',
      lines: [
        { accountId: 'b1', debitCents: 4000000, creditCents: 0 },
        { accountId: 'b5', debitCents: 0,       creditCents: 4000000 },
      ],
      posted: true,
      postedAt: now - 8*86400000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'be2',
      date: '2026-01-20',
      memo: 'Purchase merchandise on account',
      lines: [
        { accountId: 'b3', debitCents: 1500000, creditCents: 0 },
        { accountId: 'b4', debitCents: 0,       creditCents: 1500000 },
      ],
      posted: true,
      postedAt: now - 7*86400000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'be3',
      date: '2026-02-05',
      memo: 'Invoice wholesale customer',
      lines: [
        { accountId: 'b2', debitCents: 2200000, creditCents: 0 },
        { accountId: 'b6', debitCents: 0,       creditCents: 2200000 },
      ],
      posted: true,
      postedAt: now - 5*86400000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'be4',
      date: '2026-02-05',
      memo: 'Record cost of goods sold',
      lines: [
        { accountId: 'b7', debitCents: 900000, creditCents: 0 },
        { accountId: 'b3', debitCents: 0,      creditCents: 900000 },
      ],
      posted: true,
      postedAt: now - 5*86400000 + 1000,
      reversedBy: null,
      reverses: null,
    },
    {
      id: 'be5',
      date: '2026-02-28',
      memo: 'Pay office rent and advertising',
      lines: [
        { accountId: 'b8', debitCents: 250000, creditCents: 0 },
        { accountId: 'b9', debitCents: 150000, creditCents: 0 },
        { accountId: 'b1', debitCents: 0,      creditCents: 400000 },
      ],
      posted: true,
      postedAt: now - 3*86400000,
      reversedBy: null,
      reverses: null,
    },
  ];
}

// ─────────────────────────────────────────────
//  Book builders
// ─────────────────────────────────────────────

function fillSeedAudit(book) {
  book.auditLog = [];
  book.entries.forEach(e => {
    if (e.posted) {
      book.auditLog.push({
        at: e.postedAt,
        action: 'post',
        entryId: e.id,
        memo: e.memo,
      });
    }
  });
}

function buildPersonalBook() {
  const book = {
    id: 'personal',
    accounts: SEED_ACCOUNTS_PERSONAL.map(a => ({ ...a })),
    entries: buildPersonalSeedEntries(),
    auditLog: [],
    nextEntrySeq: 100,
  };
  fillSeedAudit(book);
  return book;
}

function buildBusinessBook() {
  const book = {
    id: 'business',
    accounts: SEED_ACCOUNTS_BUSINESS.map(a => ({ ...a })),
    entries: buildBusinessSeedEntries(),
    auditLog: [],
    nextEntrySeq: 100,
  };
  fillSeedAudit(book);
  return book;
}

function isBookShape(book) {
  return book && Array.isArray(book.accounts) && Array.isArray(book.entries);
}

function patchBookEntries(book) {
  if (!Array.isArray(book.entries)) return;
  book.entries.forEach(e => {
    if (e.posted && !e.postedAt) e.postedAt = Date.now();
  });
  if (!Array.isArray(book.auditLog)) book.auditLog = [];
  if (typeof book.nextEntrySeq !== 'number') book.nextEntrySeq = 100;
}

function currentBook(state) {
  const id = state && BOOK_IDS.includes(state.currentBookId)
    ? state.currentBookId
    : 'personal';
  return state.books[id] || state.books.personal;
}

function bookOf(state, bookId) {
  if (bookId && state.books && state.books[bookId]) return state.books[bookId];
  return currentBook(state);
}

function switchBook(state, bookId) {
  if (!BOOK_IDS.includes(bookId) || !state.books[bookId]) {
    return { ok: false, error: 'Unknown book.' };
  }
  state.currentBookId = bookId;
  saveState(state);
  return { ok: true, currentBookId: bookId };
}

// ─────────────────────────────────────────────
//  State helpers
// ─────────────────────────────────────────────

function emptyState() {
  return {
    books: {
      personal: buildPersonalBook(),
      business: buildBusinessBook(),
    },
    currentBookId: 'personal',
  };
}

function normalizeRoot(parsed) {
  const personal = isBookShape(parsed.books && parsed.books.personal)
    ? parsed.books.personal
    : buildPersonalBook();
  const business = isBookShape(parsed.books && parsed.books.business)
    ? parsed.books.business
    : buildBusinessBook();
  personal.id = 'personal';
  business.id = 'business';
  patchBookEntries(personal);
  patchBookEntries(business);
  const currentBookId = parsed.currentBookId === 'business' ? 'business' : 'personal';
  return { books: { personal, business }, currentBookId };
}

/** Load state from localStorage, falling back to seed. Migrates Session A single-book saves. */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.books) {
        const state = normalizeRoot(parsed);
        saveState(state);
        return state;
      }
      // Legacy Session A: { accounts, entries, auditLog, nextEntrySeq }
      if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.entries)) {
        const state = normalizeRoot({
          books: {
            personal: {
              id: 'personal',
              accounts: parsed.accounts,
              entries: parsed.entries,
              auditLog: parsed.auditLog || [],
              nextEntrySeq: parsed.nextEntrySeq || 100,
            },
          },
          currentBookId: 'personal',
        });
        saveState(state);
        return state;
      }
    }
  } catch (_) {
    // corrupted; fall through to seed
  }
  return emptyState();
}

/** Persist state to localStorage. */
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─────────────────────────────────────────────
//  ID generation
// ─────────────────────────────────────────────

function nextEntryId(book) {
  const id = 'e' + book.nextEntrySeq;
  book.nextEntrySeq += 1;
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
//  CRUD operations (current book)
// ─────────────────────────────────────────────

/**
 * Create a new draft entry. Returns { ok, entry, error }.
 */
function createEntry(state, { date, memo, lines }) {
  const book = currentBook(state);
  const entry = {
    id: nextEntryId(book),
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
  book.entries.push(entry);
  saveState(state);
  return { ok: true, entry };
}

/**
 * Post a draft entry. Validates balance first.
 * Returns { ok, entry, error }.
 */
function postEntry(state, entryId) {
  const book = currentBook(state);
  const entry = book.entries.find(e => e.id === entryId);
  if (!entry) return { ok: false, error: 'Entry not found.' };
  if (entry.posted) return { ok: false, error: 'Entry is already posted.' };

  const err = validateEntryLines(entry.lines, book.accounts);
  if (err) return { ok: false, error: err };

  entry.posted   = true;
  entry.postedAt = Date.now();
  book.auditLog.push({
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
  const book = currentBook(state);
  const orig = book.entries.find(e => e.id === entryId);
  if (!orig) return { ok: false, error: 'Entry not found.' };
  if (!orig.posted) return { ok: false, error: 'Cannot reverse a draft entry. Post it first.' };
  if (orig.reversedBy) return { ok: false, error: 'Entry has already been reversed.' };

  const now = Date.now();
  const reversalId = nextEntryId(book);
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
  book.entries.push(reversal);
  book.auditLog.push({
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
  const book = currentBook(state);
  const idx = book.entries.findIndex(e => e.id === entryId);
  if (idx === -1) return { ok: false, error: 'Entry not found.' };
  if (book.entries[idx].posted) return { ok: false, error: 'Cannot delete a posted entry.' };
  book.entries.splice(idx, 1);
  saveState(state);
  return { ok: true };
}

// ─────────────────────────────────────────────
//  Reporting (per book)
// ─────────────────────────────────────────────

/**
 * Trial balance — posted lines only, grouped by account.
 * Optional bookId selects a book; otherwise uses the current book.
 * Returns { rows, totalDebits, totalCredits, balanced }
 *   row: { account, debitCents, creditCents, netCents }
 */
function trialBalance(state, bookId) {
  const book = bookOf(state, bookId);
  const balances = new Map(); // accountId → { debit, credit }
  book.accounts.forEach(a => balances.set(a.id, { debit: 0, credit: 0 }));

  book.entries
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

  const rows = book.accounts.map(a => {
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
 * Optional bookId selects a book; otherwise uses the current book.
 * Returns { revenueRows, expenseRows, totalRevenue, totalExpense, net }
 */
function profitAndLoss(state, fromDate, toDate, bookId) {
  const book = bookOf(state, bookId);
  const revenueMap = new Map(); // accountId → cents
  const expenseMap = new Map();

  book.accounts
    .filter(a => a.type === 'revenue' || a.type === 'expense')
    .forEach(a => {
      if (a.type === 'revenue') revenueMap.set(a.id, 0);
      else expenseMap.set(a.id, 0);
    });

  book.entries
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

  const getAcct = id => book.accounts.find(a => a.id === id);

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
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, fresh);
  saveState(state);
}

// ─────────────────────────────────────────────
//  Exports (namespace on window for script-tag usage)
// ─────────────────────────────────────────────

window.Ledger = {
  STORAGE_KEY,
  BOOK_IDS,
  BOOK_LABELS,

  // State management
  loadState,
  saveState,
  resetToSeed,
  currentBook,
  switchBook,

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
