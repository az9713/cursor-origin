# Ledger books — frozen spec

Internal spec for Wave 3 project 25. Vanilla HTML/CSS/JS. Persist to `localStorage` key `ledger-books-v1`.

## Product

Double-entry ledger: chart of accounts, journal, trial balance, P&L. Every posted entry has equal debits and credits. Reverse and edit with an audit trail. Lives at `ledger-books/index.html`.

A report that does not foot is a product bug. Amounts are integer cents.

## Model

Account: `{ id, code, name, type: asset|liability|equity|revenue|expense }`.
Line: `{ accountId, debitCents, creditCents }` — exactly one of debit/credit non-zero.
Entry: `{ id, date, memo, lines[], posted, reversedBy?, reverses? }`.
Posting requires `sum(debits) === sum(credits)` and ≥ 2 lines.

Trial balance: per account, posted lines only. Totals equal.
P&L: revenue − expense for a date range.
Balance sheet identity: assets = liabilities + equity + (revenue − expense) using posted activity.

Edit of a posted entry is forbidden; reverse it (new opposite entry) then post a replacement. Audit list shows post/reverse.

## Session A must

- Seed chart (≥ 8 accounts) + ≥ 4 posted entries that already balance
- Journal: create (unbalanced form disabled), post, reverse
- Trial balance view that foots; P&L view
- Hash `#/e/<entryId>`
- Reset seed
- Hub link `../`

## Out of scope (later sessions)

Second book, period close, reversing-accrual automation beyond explicit reverse.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
