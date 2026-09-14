/**
 * app.js — board-rules UI
 *
 * Wires chess engine (chess.js) + PGN (pgn.js) to the DOM.
 * Storage key: board-rules-v1
 * Hash routing: #/g/<gameId>
 */

import { Chess, GLYPHS, sqToAlg, algToSq, PIECE_VALUES, INITIAL_FEN } from './chess.js';
import { parsePGN, exportPGN, replayPGN } from './pgn.js';

const STORAGE_KEY = 'board-rules-v1';
const BOARD_SIZE = 8;

// ── Fixtures ──────────────────────────────────────────────────────────────────
const FIXTURES = [
  {
    id: 'scholars-mate',
    label: "Scholar's Mate attempt",
    pgn: '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#',
  },
  {
    id: 'castling-opening',
    label: 'Short castling (Italian)',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 O-O',
  },
  {
    id: 'chess960-518',
    label: 'Chess960 #518 (standard)',
    chess960: 518,
  },
  {
    id: 'chess960-0',
    label: 'Chess960 #0',
    chess960: 0,
  },
];

// ── State ─────────────────────────────────────────────────────────────────────
let chess = new Chess();
let selectedSq = -1;       // currently selected square index (-1 = none)
let legalTargets = [];     // squares that selected piece can move to
let gameId = _makeId();
let dragFromSq = -1;       // drag source square

// ── DOM refs ─────────────────────────────────────────────────────────────────
const boardEl   = document.getElementById('board');
const moveListEl = document.getElementById('move-list');
const statusEl  = document.getElementById('status-text');
const pgnTextarea = document.getElementById('pgn-textarea');
const evalFill   = document.getElementById('eval-fill');
const evalLabelEl = document.getElementById('eval-label');
const dragGhost  = document.getElementById('drag-ghost');
const fenEl      = document.getElementById('fen-display');

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  buildBoardDOM();
  buildFixtureButtons();
  attachControls();
  loadFromStorage();
  handleHash();
  window.addEventListener('hashchange', handleHash);
  renderAll();
}

// ── Hash routing ──────────────────────────────────────────────────────────────
function handleHash() {
  const id = parseHashId();
  if (id && id !== gameId) {
    loadGameById(id);
    renderAll();
  }
}

function parseHashId() {
  const m = location.hash.match(/^#\/g\/([A-Za-z0-9-]+)$/);
  return m ? m[1] : null;
}

function chess960IdFromKey(id) {
  const m = /^chess960-(\d+)$/.exec(id);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 0 && n <= 959 ? n : null;
}

function loadGameById(id) {
  const saved = loadGameFromStorage(id);
  if (saved) {
    gameId = id;
    reloadFromSaved(saved);
    return true;
  }
  const n960 = chess960IdFromKey(id);
  if (n960 != null) {
    chess = Chess.from960(n960);
    selectedSq = -1;
    legalTargets = [];
    gameId = `chess960-${n960}`;
    return true;
  }
  return false;
}

function setHash(id) {
  history.replaceState(null, '', `#/g/${id}`);
}

function _makeId() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Storage ───────────────────────────────────────────────────────────────────
function saveToStorage() {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[gameId] = {
      pgn: exportPGN(chess),
      startFen: chess.startFen(),
      chess960Id: chess.chess960Id,
      ts: Date.now(),
    };
    // Keep only the 20 most recent
    const keys = Object.keys(all).sort((a, b) => (all[b].ts || 0) - (all[a].ts || 0));
    if (keys.length > 20) keys.slice(20).forEach(k => delete all[k]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Storage save failed', e);
  }
}

function loadFromStorage() {
  const id = parseHashId();
  if (id) loadGameById(id);
}

function loadGameFromStorage(id) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return all[id] || null;
  } catch { return null; }
}

function reloadFromSaved(saved) {
  selectedSq = -1;
  legalTargets = [];
  let fen = saved.startFen || INITIAL_FEN;
  let moves = [];
  if (saved.pgn) {
    try {
      const games = parsePGN(saved.pgn);
      if (games.length) {
        const hdrFen = games[0].headers.get('FEN');
        if (!saved.startFen && hdrFen) fen = hdrFen;
        moves = games[0].moves;
      }
    } catch (e) {
      console.warn('Saved PGN parse failed', e);
    }
  }
  chess = new Chess(fen);
  if (saved.chess960Id != null) chess.chess960Id = saved.chess960Id;
  else {
    const n = chess960IdFromKey(gameId);
    if (n != null) chess.chess960Id = n;
  }
  try {
    if (moves.length) replayPGN(chess, moves);
  } catch (e) {
    console.warn('Saved PGN replay failed', e);
    chess = new Chess(fen);
    if (saved.chess960Id != null) chess.chess960Id = saved.chess960Id;
  }
}

// ── Build board DOM ───────────────────────────────────────────────────────────
function buildBoardDOM() {
  boardEl.innerHTML = '';
  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      // displayRow=0 is rank 8 (top), displayRow=7 is rank 1
      const rankIdx  = 7 - displayRow;   // 7..0
      const fileIdx  = displayCol;       // 0..7
      const sqIdx    = rankIdx * 8 + fileIdx; // 0..63 but row-major — wait, need sq(f,r)
      // Our sq function: sq(f, r) = (r << 3) | f
      const sqIndex  = (rankIdx << 3) | fileIdx;

      const div = document.createElement('div');
      div.className = `sq ${(rankIdx + fileIdx) % 2 === 0 ? 'dark' : 'light'}`;
      div.dataset.sq = sqIndex;

      div.addEventListener('click', onSquareClick);
      div.addEventListener('dragover', e => { e.preventDefault(); });
      div.addEventListener('drop', onSquareDrop);
      div.addEventListener('mousedown', onSquareMouseDown);

      boardEl.appendChild(div);
    }
  }
}

// ── Fixture buttons ───────────────────────────────────────────────────────────
function buildFixtureButtons() {
  const container = document.getElementById('fixtures-list');
  container.innerHTML = '';
  for (const fix of FIXTURES) {
    const btn = document.createElement('button');
    btn.className = 'fixture-btn';
    btn.textContent = fix.label;
    btn.addEventListener('click', () => loadFixture(fix));
    container.appendChild(btn);
  }
}

function loadFixture(fix) {
  selectedSq = -1;
  legalTargets = [];

  if (fix.chess960 != null) {
    loadChess960(fix.chess960);
    return;
  }

  chess = new Chess();
  gameId = _makeId();
  setHash(gameId);

  const games = parsePGN(fix.pgn);
  if (!games.length) return;
  try {
    replayPGN(chess, games[0].moves);
  } catch (e) {
    console.error('Fixture replay error', e);
  }
  saveToStorage();
  renderAll();
}

function loadChess960(id) {
  const n = ((id % 960) + 960) % 960;
  chess = Chess.from960(n);
  selectedSq = -1;
  legalTargets = [];
  gameId = `chess960-${n}`;
  setHash(gameId);
  saveToStorage();
  renderAll();
}

// ── Controls ──────────────────────────────────────────────────────────────────
function attachControls() {
  document.getElementById('btn-reset').addEventListener('click', () => {
    chess = new Chess();
    selectedSq = -1;
    legalTargets = [];
    gameId = _makeId();
    setHash(gameId);
    saveToStorage();
    renderAll();
  });

  document.getElementById('btn-takeback').addEventListener('click', () => {
    chess.undo();
    selectedSq = -1;
    legalTargets = [];
    saveToStorage();
    renderAll();
  });

  document.getElementById('btn-pgn-apply').addEventListener('click', applyPGN);
  document.getElementById('btn-pgn-export').addEventListener('click', () => {
    pgnTextarea.value = exportPGN(chess);
  });

  document.getElementById('btn-chess960').addEventListener('click', () => {
    loadChess960(Math.floor(Math.random() * 960));
  });
}

// ── PGN apply ─────────────────────────────────────────────────────────────────
function applyPGN() {
  const text = pgnTextarea.value.trim();
  if (!text) return;

  let games;
  try {
    games = parsePGN(text);
    if (!games.length) throw new Error('No games found');
  } catch (e) {
    flashStatus(`PGN error: ${e.message}`);
    return;
  }

  const fen = games[0].headers.get('FEN');
  const newChess = fen ? new Chess(fen) : new Chess();
  try {
    replayPGN(newChess, games[0].moves);
  } catch (e) {
    flashStatus(`PGN error: ${e.message}`);
    return;
  }

  chess = newChess;
  selectedSq = -1;
  legalTargets = [];
  gameId = _makeId();
  setHash(gameId);
  saveToStorage();
  renderAll();
}

// ── Click interaction ─────────────────────────────────────────────────────────
function onSquareClick(e) {
  const sqEl = e.currentTarget;
  const sq = parseInt(sqEl.dataset.sq);

  // Game over: no moves
  if (chess.isGameOver()) { deselect(); return; }

  const piece = chess.get(sq);

  if (selectedSq === -1) {
    // Select own piece
    if (piece && piece.color === chess.turn) {
      select(sq);
    }
    return;
  }

  // Already selected
  if (sq === selectedSq) {
    deselect();
    return;
  }

  // Clicking another own piece — re-select, unless this square is a legal
  // destination (Chess960 castle: drop the king onto its rook).
  if (piece && piece.color === chess.turn) {
    if (legalTargets.includes(sq)) {
      attemptMove(selectedSq, sq);
      return;
    }
    select(sq);
    return;
  }

  // Attempt move
  attemptMove(selectedSq, sq);
}

function select(sq) {
  selectedSq = sq;
  const legal = chess.moves(sq);
  legalTargets = [];
  for (const m of legal) {
    legalTargets.push(m.to);
    if ((m.flags === 'kcastle' || m.flags === 'qcastle') && m.rookFrom !== m.to) {
      legalTargets.push(m.rookFrom);
    }
  }
  renderBoard();
}

function deselect() {
  selectedSq = -1;
  legalTargets = [];
  renderBoard();
}

function attemptMove(fromSq, toSq) {
  const mv = chess.move(fromSq, toSq);
  if (!mv) {
    // Illegal — flash square
    flashSquare(toSq);
    deselect();
    return;
  }
  selectedSq = -1;
  legalTargets = [];
  saveToStorage();
  renderAll();
}

// ── Drag interaction ──────────────────────────────────────────────────────────
function onSquareMouseDown(e) {
  const sqEl = e.currentTarget;
  const sqIdx = parseInt(sqEl.dataset.sq);
  const piece = chess.get(sqIdx);
  if (!piece || piece.color !== chess.turn) return;

  dragFromSq = sqIdx;

  // Create ghost
  const glyph = Chess.glyph(piece);
  dragGhost.textContent = glyph;
  dragGhost.style.display = 'block';
  moveDragGhost(e.clientX, e.clientY);

  // Show legal targets
  select(sqIdx);

  const onMouseMove = (ev) => {
    moveDragGhost(ev.clientX, ev.clientY);
  };

  const onMouseUp = (ev) => {
    dragGhost.style.display = 'none';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    // Find which square we dropped on
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const sqEl2 = el?.closest('[data-sq]');
    if (!sqEl2) {
      deselect();
      dragFromSq = -1;
      return;
    }
    const toSq = parseInt(sqEl2.dataset.sq);
    if (toSq === dragFromSq) {
      // Just keep selected state
      dragFromSq = -1;
      return;
    }
    attemptMove(dragFromSq, toSq);
    dragFromSq = -1;
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  e.preventDefault();
}

function moveDragGhost(x, y) {
  dragGhost.style.left = x + 'px';
  dragGhost.style.top  = y + 'px';
}

function onSquareDrop(e) {
  e.preventDefault();
  // handled by mouseup above
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  renderBoard();
  renderMoveList();
  renderStatus();
  renderEvalBar();
  renderPGN();
  renderFEN();
  renderChess960Id();
  setHash(gameId);
}

function renderChess960Id() {
  const row = document.getElementById('chess960-row');
  const el = document.getElementById('chess960-id');
  if (!row || !el) return;
  if (chess.chess960Id == null) {
    row.hidden = true;
    el.textContent = '';
    return;
  }
  row.hidden = false;
  el.textContent = `Chess960 #${chess.chess960Id}`;
}

function renderBoard() {
  const boardArr = chess.board(); // [rank7..rank0][file0..file7]
  const hist = chess.history();
  const lastMove = hist[hist.length - 1];
  const inCheckSq = chess.inCheck() ? findKingSq(chess.turn) : -1;

  const squares = boardEl.querySelectorAll('.sq');
  squares.forEach(sqEl => {
    const sqIdx = parseInt(sqEl.dataset.sq);
    const fileIdx = sqIdx & 7;
    const rankIdx = sqIdx >> 3;

    // Clear overlays
    sqEl.classList.remove('selected', 'legal-target', 'last-move', 'in-check', 'has-piece');

    // Last move highlight
    if (lastMove && (lastMove.from === sqIdx || lastMove.to === sqIdx)) {
      sqEl.classList.add('last-move');
    }

    // In check
    if (sqIdx === inCheckSq) {
      sqEl.classList.add('in-check');
    }

    // Selected
    if (sqIdx === selectedSq) {
      sqEl.classList.add('selected');
    }

    // Legal target
    if (legalTargets.includes(sqIdx)) {
      sqEl.classList.add('legal-target');
    }

    // boardArr is [row0=rank8..row7=rank1]
    const displayRow = 7 - rankIdx;
    const piece = boardArr[displayRow]?.[fileIdx];

    // Render piece
    let pieceEl = sqEl.querySelector('.piece');
    if (piece) {
      sqEl.classList.add('has-piece');
      if (!pieceEl) {
        pieceEl = document.createElement('div');
        pieceEl.className = 'piece';
        sqEl.appendChild(pieceEl);
      }
      pieceEl.textContent = Chess.glyph(piece);
      // Mark dragging source
      if (sqIdx === dragFromSq) pieceEl.classList.add('dragging-source');
      else pieceEl.classList.remove('dragging-source');
    } else {
      if (pieceEl) pieceEl.remove();
    }
  });
}

function findKingSq(color) {
  for (let s = 0; s < 64; s++) {
    const p = chess.get(s);
    if (p && p.type === 'k' && p.color === color) return s;
  }
  return -1;
}

function renderMoveList() {
  const history = chess.history();
  moveListEl.innerHTML = '';

  for (let i = 0; i < history.length; i += 2) {
    const pair = document.createElement('span');
    pair.className = 'move-pair';

    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${Math.floor(i / 2) + 1}.`;
    pair.appendChild(num);

    // White move
    const wEl = document.createElement('span');
    wEl.className = 'move-san';
    if (i === history.length - 1) wEl.classList.add('current');
    wEl.textContent = history[i].san;
    wEl.dataset.idx = i;
    pair.appendChild(wEl);

    // Black move (if present)
    if (history[i + 1]) {
      const bEl = document.createElement('span');
      bEl.className = 'move-san';
      if (i + 1 === history.length - 1) bEl.classList.add('current');
      bEl.textContent = history[i + 1].san;
      bEl.dataset.idx = i + 1;
      pair.appendChild(bEl);
    }

    moveListEl.appendChild(pair);
  }

  // Scroll to bottom
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

function renderStatus() {
  const over = chess.isGameOver();
  const turnName = chess.turn === 'w' ? 'White' : 'Black';
  const dot = statusEl.previousElementSibling;

  if (dot) {
    dot.className = 'turn-dot ' + (chess.turn === 'w' ? 'white' : 'black');
  }

  if (over === 'checkmate') {
    const winner = chess.turn === 'w' ? 'Black' : 'White';
    statusEl.textContent = `Checkmate — ${winner} wins`;
  } else if (over === 'stalemate') {
    statusEl.textContent = 'Stalemate — Draw';
  } else if (over === 'draw50') {
    statusEl.textContent = '50-move rule — Draw';
  } else if (chess.inCheck()) {
    statusEl.textContent = `${turnName} is in check`;
  } else {
    statusEl.textContent = `${turnName} to move`;
  }
}

function renderEvalBar() {
  const { w, b } = chess.material();
  const total = w + b || 1;
  const whitePct = Math.round((w / total) * 100);
  evalFill.style.height = whitePct + '%';

  const diff = w - b;
  const sign = diff > 0 ? '+' : '';
  evalLabelEl.textContent = diff === 0 ? '=' : `${sign}${diff}`;
}

function renderPGN() {
  // Only update if user hasn't focused the textarea
  if (document.activeElement !== pgnTextarea) {
    pgnTextarea.value = exportPGN(chess);
  }
}

function renderFEN() {
  if (fenEl) fenEl.textContent = chess.fen();
}

// ── Flash helpers ─────────────────────────────────────────────────────────────
function flashSquare(sqIdx) {
  const el = boardEl.querySelector(`[data-sq="${sqIdx}"]`);
  if (!el) return;
  el.classList.add('illegal-flash');
  setTimeout(() => el.classList.remove('illegal-flash'), 400);
}

let _statusTimeout;
function flashStatus(msg) {
  statusEl.textContent = msg;
  clearTimeout(_statusTimeout);
  _statusTimeout = setTimeout(() => renderStatus(), 3000);
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
