# Spreadsheet — frozen spec

Internal spec for Project 2. Vanilla HTML/CSS/JS. No new dependencies. Persist to `localStorage` key `spreadsheet-v1`.

## Product

A single-page grid with a real formula engine (Excel-lite). Lives at `spreadsheet/index.html`.

## Grid

- Columns A–Z, rows 1–40
- Click selects a cell; Shift-click or drag selects a range
- Arrow keys / Tab move; Enter edits or commits; Escape cancels; Delete clears
- Formula bar shows the raw cell text
- Fill handle on the selection: drag down or right; relative refs adjust (`A1` → `A2` when filled down)
- Undo (button and Ctrl+Z), redo (Ctrl+Y)

## Cell model

- Store the raw string the user typed
- Display the computed value
- A leading `=` is a formula
- Numbers, plaintext, and empty cells are allowed

## Formula language

- Arithmetic: `+ - * /`, unary minus, parentheses
- Comparisons: `= <> > < >= <=` (used inside formulas, e.g. `=IF(A1>5,1,0)`)
- Cell refs: `A1`, `$A1`, `A$1`, `$A$1`
- Ranges: `A1:B3`
- Functions:
  - `SUM(range_or_values…)` — ignore blanks and non-numeric
  - `AVERAGE(range_or_values…)` — same, `#DIV/0!` if no numeric values
  - `IF(cond, then, else)` — `0` and `""` are false

## Errors

- `#CYCLE!` circular reference
- `#REF!` out of sheet
- `#DIV/0!` divide by zero or empty AVERAGE
- `#ERROR!` parse / arity / type failure

## CSV

- Export the used rectangle as CSV
- Import a CSV file into A1 (overwrite)

## Seed

First visit loads a produce table (A1:D9) plus a showcase block (F1:H13) covering SUM, AVERAGE, IF, cell refs, parentheses, unary minus, `#DIV/0!`, and `#CYCLE!`.

## Out of scope

Backend, named ranges, array formulas, other Excel functions, locale number formats.
