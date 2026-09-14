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

Fairy pieces, engine search, clocks.

## Session C must

- Chess960 (Fischer random): starting positions id 0–959; king between the two rooks on the back rank; bishops on opposite colors; black mirrors white. No fairy pieces.
- Castling uses Chess960 rules: after O-O / O-O-O the king ends on the g/c files and the rook on f/d; rights come from that start; the path is empty except the king and that rook; the king may not castle out of, through, or into check. King or rook may already stand on their destination square.
- UI: Chess960 button generates a position from a seed id 0–959 and shows the id. Fixture hash `#/g/chess960-518` is ID 518 = standard chess (`RNBQKBNR`).
- Session A fixtures (Scholar's mate, Italian O-O) still replay move-for-move. Session B SAN disambiguation (pre-move SAN, e.g. Nbd2 vs Nd2) still holds. Eval bar, takeback, PGN import/export still work.
- Local `js/chess.js` only (no chess.js npm).

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
