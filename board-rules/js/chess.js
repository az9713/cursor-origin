/**
 * chess.js — pure chess rules engine (no external dependencies)
 *
 * Exports a Chess class with:
 *   new Chess()            — standard starting position
 *   .moves(square?)        — legal moves [{ from, to, flags, san, piece, captured }]
 *   .move(from, to)        — make a move; returns move object or null
 *   .undo()                — undo last move; returns undone move or null
 *   .fen()                 — current FEN string
 *   .board()               — 8×8 array of { type, color } | null
 *   .inCheck()             — boolean
 *   .inCheckmate()         — boolean
 *   .inStalemate()         — boolean
 *   .isGameOver()          — checkmate | stalemate | draw50 | false
 *   .turn                  — 'w' | 'b'
 *   .history()             — array of past move objects
 *   .material()            — { w: number, b: number }
 */

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Piece glyphs
const GLYPHS = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

// File/rank helpers
const file = (sq) => sq & 7;          // 0-7 = a-h
const rank = (sq) => sq >> 3;         // 0-7 = rank 1-8
const sq = (f, r) => (r << 3) | f;
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const algToSq = (alg) => sq('abcdefgh'.indexOf(alg[0]), parseInt(alg[1]) - 1);
const sqToAlg = (s) => 'abcdefgh'[file(s)] + (rank(s) + 1);

// Initial board setup
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Castling rights bits
const CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8;

export class Chess {
  constructor(fen = INITIAL_FEN) {
    this._history = [];
    this._load(fen);
  }

  /** Load position from FEN */
  _load(fen) {
    const parts = fen.trim().split(/\s+/);
    const ranks = parts[0].split('/');

    // board[64]: { type: 'p'|'n'|..., color: 'w'|'b' } | null
    this._board = new Array(64).fill(null);

    for (let r = 7; r >= 0; r--) {
      const rowStr = ranks[7 - r];
      let f = 0;
      for (const ch of rowStr) {
        if (/\d/.test(ch)) {
          f += parseInt(ch);
        } else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          this._board[sq(f, r)] = { type: ch.toLowerCase(), color };
          f++;
        }
      }
    }

    this.turn = parts[1] === 'b' ? 'b' : 'w';

    // Castling rights
    this._castling = 0;
    const castleStr = parts[2] || '-';
    if (castleStr.includes('K')) this._castling |= CASTLE_WK;
    if (castleStr.includes('Q')) this._castling |= CASTLE_WQ;
    if (castleStr.includes('k')) this._castling |= CASTLE_BK;
    if (castleStr.includes('q')) this._castling |= CASTLE_BQ;

    // En passant
    this._ep = parts[3] && parts[3] !== '-' ? algToSq(parts[3]) : -1;

    this._halfmove = parseInt(parts[4]) || 0;
    this._fullmove = parseInt(parts[5]) || 1;
    this._history = [];
  }

  get(square) {
    if (typeof square === 'string') square = algToSq(square);
    return this._board[square];
  }

  board() {
    // Return 8x8 array [rank7..rank0] for display (rank 8 at top)
    const result = [];
    for (let r = 7; r >= 0; r--) {
      const row = [];
      for (let f = 0; f < 8; f++) {
        row.push(this._board[sq(f, r)]);
      }
      result.push(row);
    }
    return result;
  }

  /** Raw pseudo-legal moves for one color (doesn't filter for check) */
  _pseudoMoves(color) {
    const moves = [];
    const opp = color === 'w' ? 'b' : 'w';

    for (let s = 0; s < 64; s++) {
      const piece = this._board[s];
      if (!piece || piece.color !== color) continue;
      const f0 = file(s), r0 = rank(s);

      switch (piece.type) {
        case 'p': {
          const dir = color === 'w' ? 1 : -1;
          const startRank = color === 'w' ? 1 : 6;
          const promoRank = color === 'w' ? 7 : 0;

          // One forward
          const r1 = r0 + dir;
          if (onBoard(f0, r1) && !this._board[sq(f0, r1)]) {
            const flags = rank(sq(f0, r1)) === promoRank ? 'promotion' : '';
            moves.push({ from: s, to: sq(f0, r1), flags, piece: 'p', captured: null });
            // Two forward
            if (r0 === startRank) {
              const r2 = r0 + 2 * dir;
              if (!this._board[sq(f0, r2)]) {
                moves.push({ from: s, to: sq(f0, r2), flags: 'pawn2', piece: 'p', captured: null });
              }
            }
          }

          // Captures
          for (const df of [-1, 1]) {
            const ff = f0 + df;
            if (!onBoard(ff, r1)) continue;
            const target = sq(ff, r1);
            if (this._board[target]?.color === opp) {
              const flags = rank(target) === promoRank ? 'promotion-capture' : 'capture';
              moves.push({ from: s, to: target, flags, piece: 'p', captured: this._board[target].type });
            }
            // En passant
            if (this._ep === target) {
              moves.push({ from: s, to: target, flags: 'ep', piece: 'p', captured: 'p' });
            }
          }
          break;
        }

        case 'n': {
          const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
          for (const [df, dr] of offsets) {
            const ff = f0 + df, rr = r0 + dr;
            if (!onBoard(ff, rr)) continue;
            const target = sq(ff, rr);
            const cap = this._board[target];
            if (cap?.color === color) continue;
            moves.push({ from: s, to: target, flags: cap ? 'capture' : '', piece: 'n', captured: cap?.type || null });
          }
          break;
        }

        case 'b':
        case 'r':
        case 'q': {
          const diag = [[-1,-1],[-1,1],[1,-1],[1,1]];
          const orth = [[-1,0],[1,0],[0,-1],[0,1]];
          const dirs = piece.type === 'b' ? diag : piece.type === 'r' ? orth : [...diag, ...orth];

          for (const [df, dr] of dirs) {
            let ff = f0 + df, rr = r0 + dr;
            while (onBoard(ff, rr)) {
              const target = sq(ff, rr);
              const cap = this._board[target];
              if (cap) {
                if (cap.color !== color) {
                  moves.push({ from: s, to: target, flags: 'capture', piece: piece.type, captured: cap.type });
                }
                break;
              }
              moves.push({ from: s, to: target, flags: '', piece: piece.type, captured: null });
              ff += df; rr += dr;
            }
          }
          break;
        }

        case 'k': {
          const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
          for (const [df, dr] of offsets) {
            const ff = f0 + df, rr = r0 + dr;
            if (!onBoard(ff, rr)) continue;
            const target = sq(ff, rr);
            const cap = this._board[target];
            if (cap?.color === color) continue;
            moves.push({ from: s, to: target, flags: cap ? 'capture' : '', piece: 'k', captured: cap?.type || null });
          }

          // Castling
          if (color === 'w' && r0 === 0 && f0 === 4) {
            // King-side
            if ((this._castling & CASTLE_WK) &&
                !this._board[sq(5,0)] && !this._board[sq(6,0)]) {
              moves.push({ from: s, to: sq(6,0), flags: 'kcastle', piece: 'k', captured: null });
            }
            // Queen-side
            if ((this._castling & CASTLE_WQ) &&
                !this._board[sq(3,0)] && !this._board[sq(2,0)] && !this._board[sq(1,0)]) {
              moves.push({ from: s, to: sq(2,0), flags: 'qcastle', piece: 'k', captured: null });
            }
          } else if (color === 'b' && r0 === 7 && f0 === 4) {
            if ((this._castling & CASTLE_BK) &&
                !this._board[sq(5,7)] && !this._board[sq(6,7)]) {
              moves.push({ from: s, to: sq(6,7), flags: 'kcastle', piece: 'k', captured: null });
            }
            if ((this._castling & CASTLE_BQ) &&
                !this._board[sq(3,7)] && !this._board[sq(2,7)] && !this._board[sq(1,7)]) {
              moves.push({ from: s, to: sq(2,7), flags: 'qcastle', piece: 'k', captured: null });
            }
          }
          break;
        }
      }
    }
    return moves;
  }

  /** Is `color`'s king attacked? */
  _inCheck(color) {
    // Find king
    let kingSq = -1;
    for (let s = 0; s < 64; s++) {
      const p = this._board[s];
      if (p && p.type === 'k' && p.color === color) { kingSq = s; break; }
    }
    if (kingSq === -1) return false; // shouldn't happen
    return this._isAttacked(kingSq, color === 'w' ? 'b' : 'w');
  }

  /** Is `square` attacked by `attackerColor`? */
  _isAttacked(square, attackerColor) {
    const tf = file(square), tr = rank(square);

    // Knights
    for (const [df, dr] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const ff = tf + df, rr = tr + dr;
      if (!onBoard(ff, rr)) continue;
      const p = this._board[sq(ff, rr)];
      if (p && p.type === 'n' && p.color === attackerColor) return true;
    }

    // Sliding: bishops/queens on diagonals
    for (const [df, dr] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let ff = tf + df, rr = tr + dr;
      while (onBoard(ff, rr)) {
        const p = this._board[sq(ff, rr)];
        if (p) {
          if (p.color === attackerColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
        ff += df; rr += dr;
      }
    }

    // Sliding: rooks/queens on orthogonals
    for (const [df, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let ff = tf + df, rr = tr + dr;
      while (onBoard(ff, rr)) {
        const p = this._board[sq(ff, rr)];
        if (p) {
          if (p.color === attackerColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        ff += df; rr += dr;
      }
    }

    // King
    for (const [df, dr] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const ff = tf + df, rr = tr + dr;
      if (!onBoard(ff, rr)) continue;
      const p = this._board[sq(ff, rr)];
      if (p && p.type === 'k' && p.color === attackerColor) return true;
    }

    // Pawns
    const pawnDir = attackerColor === 'w' ? -1 : 1; // attacker pawn attacks from below (w) or above (b)
    for (const df of [-1, 1]) {
      const ff = tf + df, rr = tr + pawnDir;
      if (!onBoard(ff, rr)) continue;
      const p = this._board[sq(ff, rr)];
      if (p && p.type === 'p' && p.color === attackerColor) return true;
    }

    return false;
  }

  /** Apply a move to the board, return undo info */
  _applyMove(mv) {
    const undo = {
      from: mv.from, to: mv.to, flags: mv.flags,
      piece: mv.piece, captured: mv.captured,
      capturedSq: mv.to,
      castling: this._castling,
      ep: this._ep,
      halfmove: this._halfmove,
      fullmove: this._fullmove,
      turn: this.turn,
      promotedFrom: null,
    };

    const moving = this._board[mv.from];
    this._board[mv.from] = null;

    // En passant capture: remove captured pawn
    if (mv.flags === 'ep') {
      const epCaptureSq = sq(file(mv.to), rank(mv.from)); // same rank as 'from', file of 'to'
      undo.capturedSq = epCaptureSq;
      this._board[epCaptureSq] = null;
    }

    this._board[mv.to] = moving;

    // Promotion — always queen
    if (mv.flags === 'promotion' || mv.flags === 'promotion-capture') {
      undo.promotedFrom = moving.type;
      this._board[mv.to] = { type: 'q', color: moving.color };
    }

    // Castling — move rook
    if (mv.flags === 'kcastle') {
      const r = rank(mv.from);
      this._board[sq(5, r)] = this._board[sq(7, r)];
      this._board[sq(7, r)] = null;
    } else if (mv.flags === 'qcastle') {
      const r = rank(mv.from);
      this._board[sq(3, r)] = this._board[sq(0, r)];
      this._board[sq(0, r)] = null;
    }

    // Update en passant square
    this._ep = mv.flags === 'pawn2'
      ? sq(file(mv.from), (rank(mv.from) + rank(mv.to)) >> 1)
      : -1;

    // Update castling rights
    // Moving king
    if (moving.type === 'k') {
      if (moving.color === 'w') this._castling &= ~(CASTLE_WK | CASTLE_WQ);
      else                      this._castling &= ~(CASTLE_BK | CASTLE_BQ);
    }
    // Moving rook or capturing rook
    const rookRightsMap = {
      [sq(7,0)]: CASTLE_WK, [sq(0,0)]: CASTLE_WQ,
      [sq(7,7)]: CASTLE_BK, [sq(0,7)]: CASTLE_BQ,
    };
    if (rookRightsMap[mv.from] !== undefined) this._castling &= ~rookRightsMap[mv.from];
    if (rookRightsMap[mv.to]   !== undefined) this._castling &= ~rookRightsMap[mv.to];

    // Half-move clock
    if (moving.type === 'p' || mv.captured) this._halfmove = 0;
    else this._halfmove++;

    if (this.turn === 'b') this._fullmove++;
    this.turn = this.turn === 'w' ? 'b' : 'w';

    return undo;
  }

  /** Undo a previously applied move using undo info */
  _unapplyMove(undo) {
    this.turn     = undo.turn;
    this._castling = undo.castling;
    this._ep       = undo.ep;
    this._halfmove = undo.halfmove;
    this._fullmove = undo.fullmove;

    // Restore moving piece (handle promotion)
    const movedPiece = undo.promotedFrom
      ? { type: undo.promotedFrom, color: undo.turn }
      : this._board[undo.to];

    this._board[undo.from] = movedPiece;
    this._board[undo.to] = null;

    // Restore captured piece
    if (undo.captured) {
      this._board[undo.capturedSq] = { type: undo.captured, color: undo.turn === 'w' ? 'b' : 'w' };
    }

    // Undo castling rook move
    if (undo.flags === 'kcastle') {
      const r = rank(undo.from);
      this._board[sq(7, r)] = this._board[sq(5, r)];
      this._board[sq(5, r)] = null;
    } else if (undo.flags === 'qcastle') {
      const r = rank(undo.from);
      this._board[sq(0, r)] = this._board[sq(3, r)];
      this._board[sq(3, r)] = null;
    }
  }

  /** Generate all legal moves (optionally from a specific square) */
  moves(fromSq) {
    const pseudo = this._pseudoMoves(this.turn);
    const legal = [];

    for (const mv of pseudo) {
      if (fromSq !== undefined) {
        const s = typeof fromSq === 'string' ? algToSq(fromSq) : fromSq;
        if (mv.from !== s) continue;
      }

      const undo = this._applyMove(mv);
      const inCheck = this._inCheck(undo.turn); // check for the side that just moved
      this._unapplyMove(undo);

      if (!inCheck) {
        // Castling: ensure king doesn't pass through check
        if (mv.flags === 'kcastle' || mv.flags === 'qcastle') {
          const color = this.turn;
          const r = color === 'w' ? 0 : 7;
          const passSq = mv.flags === 'kcastle' ? sq(5, r) : sq(3, r);
          const opp = color === 'w' ? 'b' : 'w';
          // King must not be in check on origin or passing square
          if (this._isAttacked(mv.from, opp) || this._isAttacked(passSq, opp)) continue;
        }
        mv.san = this._toSAN(mv);
        legal.push(mv);
      }
    }

    return legal;
  }

  /** Make a move; returns the move object or null if illegal */
  move(fromArg, toArg) {
    const fromS = typeof fromArg === 'string' ? algToSq(fromArg) : fromArg;
    const toS   = typeof toArg   === 'string' ? algToSq(toArg)   : toArg;

    const legal = this.moves();
    const mv = legal.find(m => m.from === fromS && m.to === toS);
    if (!mv) return null;

    const undo = this._applyMove(mv);
    // Annotate with check/mate. Keep pre-move SAN so disambiguation
    // (Nbd2 vs Nd2) is not recomputed on an already-moved piece.
    mv.check = this._inCheck(this.turn);
    mv.checkmate = mv.check && this.moves().length === 0;
    const baseSan = (mv.san || '').replace(/[+#]+$/, '');
    if (mv.checkmate) mv.san = baseSan + '#';
    else if (mv.check) mv.san = baseSan + '+';
    else mv.san = baseSan;
    undo.san = mv.san;

    this._history.push({ mv, undo });
    return mv;
  }

  /** Undo last move; returns undone move or null */
  undo() {
    if (!this._history.length) return null;
    const { mv, undo } = this._history.pop();
    this._unapplyMove(undo);
    return mv;
  }

  /** Return move history */
  history() {
    return this._history.map(h => h.mv);
  }

  inCheck() {
    return this._inCheck(this.turn);
  }

  inCheckmate() {
    return this._inCheck(this.turn) && this.moves().length === 0;
  }

  inStalemate() {
    return !this._inCheck(this.turn) && this.moves().length === 0;
  }

  isGameOver() {
    if (this.inCheckmate()) return 'checkmate';
    if (this.inStalemate()) return 'stalemate';
    if (this._halfmove >= 100) return 'draw50';
    return false;
  }

  /** Material count */
  material() {
    let w = 0, b = 0;
    for (const p of this._board) {
      if (!p || p.type === 'k') continue;
      if (p.color === 'w') w += PIECE_VALUES[p.type] || 0;
      else                 b += PIECE_VALUES[p.type] || 0;
    }
    return { w, b };
  }

  /** FEN export */
  fen() {
    let fen = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this._board[sq(f, r)];
        if (!p) {
          empty++;
        } else {
          if (empty) { fen += empty; empty = 0; }
          const ch = p.type;
          fen += p.color === 'w' ? ch.toUpperCase() : ch;
        }
      }
      if (empty) fen += empty;
      if (r > 0) fen += '/';
    }

    fen += ' ' + this.turn;

    let castleStr = '';
    if (this._castling & CASTLE_WK) castleStr += 'K';
    if (this._castling & CASTLE_WQ) castleStr += 'Q';
    if (this._castling & CASTLE_BK) castleStr += 'k';
    if (this._castling & CASTLE_BQ) castleStr += 'q';
    fen += ' ' + (castleStr || '-');

    fen += ' ' + (this._ep >= 0 ? sqToAlg(this._ep) : '-');
    fen += ' ' + this._halfmove + ' ' + this._fullmove;

    return fen;
  }

  /** Glyph for a piece {type, color} */
  static glyph(piece) {
    if (!piece) return '';
    return GLYPHS[piece.color + piece.type.toUpperCase()] || '';
  }

  /** Convert internal square index to algebraic */
  static sqToAlg(s) { return sqToAlg(s); }

  /** Convert algebraic to internal square index */
  static algToSq(a) { return algToSq(a); }

  // ── SAN generation ────────────────────────────────────────────────────────

  _toSAN(mv) {
    const { from, to, flags, piece, captured } = mv;

    // Castling
    if (flags === 'kcastle') return mv.checkmate ? 'O-O#' : mv.check ? 'O-O+' : 'O-O';
    if (flags === 'qcastle') return mv.checkmate ? 'O-O-O#' : mv.check ? 'O-O-O+' : 'O-O-O';

    let san = '';
    const isCapture = !!captured || flags === 'ep';

    if (piece === 'p') {
      if (isCapture) san += 'abcdefgh'[file(from)];
    } else {
      san += piece.toUpperCase();
      // Disambiguation: find other pieces of same type that could reach `to`
      const ambig = this._ambiguousPieces(piece, from, to);
      if (ambig.length > 0) {
        const sameFile = ambig.filter(s => file(s) === file(from));
        const sameRank = ambig.filter(s => rank(s) === rank(from));
        if (sameFile.length === 0) san += 'abcdefgh'[file(from)];
        else if (sameRank.length === 0) san += (rank(from) + 1);
        else san += sqToAlg(from);
      }
    }

    if (isCapture) san += 'x';
    san += sqToAlg(to);

    if (flags === 'promotion' || flags === 'promotion-capture') san += '=Q';

    if (mv.checkmate) san += '#';
    else if (mv.check) san += '+';

    return san;
  }

  /** Find squares of other same-colored pieces of `type` that can also reach `toSq` */
  _ambiguousPieces(type, fromSq, toSq) {
    // Determine mover's color:
    // _toSAN is called both from moves() (before turn flip) and from move() (after turn flip).
    // In moves(): this.turn = mover → color = this.turn
    // In move():  this.turn = opponent → color = opposite of this.turn
    // We detect context by checking who owns the piece at fromSq.
    // After _applyMove, fromSq is empty; before it, fromSq has the piece.
    // So: if fromSq is empty now, turn has already flipped → mover = opposite of this.turn.
    const movedPieceColor = this._board[fromSq]
      ? this._board[fromSq].color          // called before _applyMove (from moves())
      : (this.turn === 'w' ? 'b' : 'w');   // called after _applyMove (from move())

    const results = [];
    for (let s = 0; s < 64; s++) {
      const p = this._board[s];
      if (!p || s === fromSq || p.type !== type || p.color !== movedPieceColor) continue;
      // Check if this piece can reach toSq via pseudo-moves
      const pseudo = this._pseudoMovesFrom(s);
      if (pseudo.some(m => m.to === toSq)) {
        // Legality check — temporarily apply and see if own king is in check
        const capPiece = this._board[toSq];
        const undo = this._applyMove({
          from: s, to: toSq,
          flags: capPiece ? 'capture' : '',
          piece: type,
          captured: capPiece?.type || null,
        });
        const inCheck = this._inCheck(undo.turn);
        this._unapplyMove(undo);
        if (!inCheck) results.push(s);
      }
    }
    return results;
  }

  /** Pseudo moves from a specific square (for disambiguation) */
  _pseudoMovesFrom(s) {
    const piece = this._board[s];
    if (!piece) return [];
    const all = this._pseudoMoves(piece.color);
    return all.filter(m => m.from === s);
  }
}

// ── SAN Parser ────────────────────────────────────────────────────────────────

/**
 * Parse a single SAN token and execute it on `chess`.
 * Returns the move object or throws on failure.
 */
export function parseSAN(chess, san) {
  // Strip check/mate markers
  const token = san.replace(/[+#!?]/g, '').trim();

  // Castling
  if (token === 'O-O-O' || token === '0-0-0') {
    const r = chess.turn === 'w' ? '1' : '8';
    const mv = chess.move('e' + r, 'c' + r);
    if (!mv) throw new Error(`Illegal castle: ${san}`);
    return mv;
  }
  if (token === 'O-O' || token === '0-0') {
    const r = chess.turn === 'w' ? '1' : '8';
    const mv = chess.move('e' + r, 'g' + r);
    if (!mv) throw new Error(`Illegal castle: ${san}`);
    return mv;
  }

  // Promotion (always queen for Session A)
  let promoToken = token.replace(/=[Qq]$/, '');

  // Parse destination square (last 2 chars)
  const dest = promoToken.slice(-2);
  if (!/^[a-h][1-8]$/.test(dest)) throw new Error(`Bad SAN dest: ${san}`);
  const toSq = algToSq(dest);

  promoToken = promoToken.slice(0, -2);

  // Capture marker
  promoToken = promoToken.replace('x', '');

  // Piece type
  let pieceType = 'p';
  if (/^[KQRBN]/.test(promoToken)) {
    pieceType = promoToken[0].toLowerCase();
    promoToken = promoToken.slice(1);
  }

  // Disambiguation (file, rank, or both)
  const disambig = promoToken; // remaining chars

  // Find matching legal move
  const legal = chess.moves();
  const candidates = legal.filter(m => {
    if (m.to !== toSq) return false;
    if (m.piece !== pieceType) return false;
    if (disambig.length === 0) return true;
    if (disambig.length === 1) {
      if (/[a-h]/.test(disambig)) return file(m.from) === 'abcdefgh'.indexOf(disambig);
      if (/[1-8]/.test(disambig)) return rank(m.from) === parseInt(disambig) - 1;
    }
    if (disambig.length === 2) return sqToAlg(m.from) === disambig;
    return true;
  });

  if (candidates.length !== 1) {
    throw new Error(`Ambiguous/illegal SAN: ${san} (${candidates.length} candidates)`);
  }

  const mv = chess.move(candidates[0].from, candidates[0].to);
  if (!mv) throw new Error(`Move failed: ${san}`);
  return mv;
}

export { GLYPHS, sqToAlg, algToSq, PIECE_VALUES };
