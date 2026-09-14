# Ledger books — frozen spec

Internal spec for Wave 3 project 25. Vanilla HTML/CSS/JS. Persist to `localStorage` key `ledger-books-v1`.

## Product

Double-entry ledger: chart of accounts, journal, trial balance, P&L. Every posted entry has equal debits and credits. Reverse and edit with an audit trail. Lives at `ledger-books/index.html`.

Two books (`personal`, `business`) share one storage key. Reports and hashes are scoped to the current book. A report that does not foot is a product bug. Amounts are integer cents.

## Model

Root: `{ books: { personal: Book, business: Book }, currentBookId }`.

Book: `{ id, accounts, entries, auditLog, nextEntrySeq }`.

Account: `{ id, code, name, type: asset|liability|equity|revenue|expense }`.
Line: `{ accountId, debitCents, creditCents }` — exactly one of debit/credit non-zero.
Entry: `{ id, date, memo, lines[], posted, reversedBy?, reverses? }`.
Posting requires `sum(debits) === sum(credits)` and ≥ 2 lines.

Trial balance: per account, posted lines only, **per book**. Totals equal.
P&L: revenue − expense for a date range, **per book**.
Balance sheet identity: assets = liabilities + equity + (revenue − expense) using posted activity.

Edit of a posted entry is forbidden; reverse it (new opposite entry) then post a replacement. Audit list shows post/reverse. Reverse in one book must not change the other book's totals.

Legacy Session A saves `{ accounts, entries, auditLog, nextEntrySeq }` migrate into `books.personal`; `books.business` is seeded.

## Session A must

- Seed chart (≥ 8 accounts) + ≥ 4 posted entries that already balance
- Journal: create (unbalanced form disabled), post, reverse
- Trial balance view that foots; P&L view
- Hash `#/e/<entryId>`
- Reset seed
- Hub link `../`

## Session C must

- Two books: `personal` and `business`, stored as `{ books: { personal: Book, business: Book }, currentBookId }`
- Each Book has its own accounts, entries, audit
- Personal seed: Session A chart (11 accounts) + 6 posted entries; trial balance foots **$35,550.00**
- Business seed: own chart + ≥ 4 posted balancing entries; trial balance foots
- Header switcher Personal | Business
- Hash `#/e/<entryId>` resolves within the current book only — switching books does not mix entries
- Trial balance and P&L compute per book
- Reverse already exists (Session A); reverse on personal must not change business totals
- Reset restores both seeds
- Storage key remains `ledger-books-v1`

## Out of scope (later sessions)

Period close, reversing-accrual automation beyond explicit reverse.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
