/**
 * pgn.js — PGN import / export
 *
 * Exports:
 *   parsePGN(text)            → array of { headers: Map, moves: string[] }
 *   exportPGN(chess, headers) → PGN string (movetext only for Session A)
 *   replayPGN(chess, moves)   → replays parsed move tokens; throws on error
 */

import { parseSAN } from './chess.js';

/**
 * Parse PGN text → array of game objects.
 * Very permissive parser; handles standard movetext.
 */
export function parsePGN(text) {
  const games = [];
  const chunks = text.trim().split(/\n\s*\n+/);

  let currentHeaders = new Map();
  let movetextLines = [];
  let inGame = false;

  const flush = () => {
    if (movetextLines.length) {
      const movetext = movetextLines.join(' ');
      games.push({ headers: currentHeaders, moves: extractMoves(movetext) });
      currentHeaders = new Map();
      movetextLines = [];
      inGame = false;
    }
  };

  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // PGN header tag
      const headerMatch = trimmed.match(/^\[(\w+)\s+"([^"]*)"\]/);
      if (headerMatch) {
        if (inGame) { flush(); }
        currentHeaders.set(headerMatch[1], headerMatch[2]);
        continue;
      }

      // Movetext
      inGame = true;
      movetextLines.push(trimmed);
    }
  }
  flush();

  // If no games found but there's text, treat entire input as raw movetext
  if (!games.length && text.trim()) {
    games.push({ headers: new Map(), moves: extractMoves(text.trim()) });
  }

  return games;
}

/** Extract SAN tokens from movetext string */
function extractMoves(movetext) {
  // Remove result markers, comments, variations, annotations
  let cleaned = movetext
    .replace(/\{[^}]*\}/g, '')    // { comments }
    .replace(/\([^)]*\)/g, '')    // (variations) — only handles one level
    .replace(/\$\d+/g, '')        // $NAG
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '') // results
    .replace(/\d+\.\s*\.\.\./g, '') // "3. ..." (black move numbers)
    .replace(/\d+\./g, '')        // move numbers
    .trim();

  // Split on whitespace
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);

  // Validate-ish: keep tokens that look like SAN
  return tokens.filter(t => /^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#!?]*$|^O-O(-O)?[+#!?]*$|^0-0(-0)?[+#!?]*$/.test(t));
}

/**
 * Replay an array of SAN tokens on `chess` (which should be at starting pos).
 * Throws an Error on illegal/unrecognized moves.
 */
export function replayPGN(chess, moves) {
  for (const san of moves) {
    parseSAN(chess, san);
  }
}

/**
 * Export current game as PGN movetext.
 * @param {Chess} chess — game instance
 * @param {Map}   headers — optional PGN headers
 * @returns string
 */
export function exportPGN(chess, headers) {
  let pgn = '';

  // Headers
  if (headers && headers.size) {
    for (const [key, val] of headers) {
      pgn += `[${key} "${val}"]\n`;
    }
    pgn += '\n';
  }

  // Movetext
  const history = chess.history();
  const tokens = [];

  for (let i = 0; i < history.length; i++) {
    if (i % 2 === 0) tokens.push(`${Math.floor(i / 2) + 1}.`);
    tokens.push(history[i].san);
  }

  // Determine result
  const over = chess.isGameOver();
  let result = '*';
  if (over === 'checkmate') result = chess.turn === 'b' ? '1-0' : '0-1';
  else if (over === 'stalemate' || over === 'draw50') result = '1/2-1/2';
  tokens.push(result);

  // Wrap at 80 chars
  let line = '';
  for (const token of tokens) {
    if (line.length + token.length + 1 > 80) {
      pgn += line.trimEnd() + '\n';
      line = '';
    }
    line += token + ' ';
  }
  if (line.trim()) pgn += line.trimEnd();

  return pgn.trim();
}
