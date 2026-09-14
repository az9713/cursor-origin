# Board rules — frozen spec

Internal spec for Wave 3 project 30. Vanilla HTML/CSS/JS. Persist to `localStorage` key `board-rules-v1`.

## Product

Chess rules engine + PGN board. Legal-move generator, board ↔ PGN, move list, takeback, simple eval bar. No chess library. Lives at `board-rules/index.html`.

A piece you can drag to an illegal square, or a PGN that does not replay, is the bug. Two views of one game.

## Rules (Session A)

Standard chess: sliding pieces, pawn double, captures, promotion (always queen), castling (rights + empty + not through check), en passant. Check / checkmate / stalemate. White to move first.

Eval bar: material only (Q=9 R=5 B=N=3 P=1), not a search.

PGN: import/export movetext (`1. e4 e5 2. Nf3 …`). SAN generator/parser for Session A subset (no annotations). Board FEN optional display.

## Session A must

- 8×8 board; click or drag a piece to a legal square only
- Move list; takeback
- PGN textarea: editing and applying replays; exporting matches the list
- Eval bar from material
- ≥ 2 fixtures: Scholar’s mate attempt; a short opening that includes castling
- Hash `#/g/<gameId>`
- Reset
- Hub link `../`

## Out of scope (later sessions)

Chess960, fairy pieces, engine search, clocks.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
