/**
 * crdt.js — CRDT engine for crdt-notes (Session A)
 *
 * Model:
 *   Note: { id, title, body, lamport, peer }
 *   Op:   { peer, lamport, noteId, type, field?, index?, ch? }
 *
 * Title: last-write-wins (LWW) by (lamport, peer)
 * Body:  character-level log; ops applied in (lamport, peer) order;
 *        concurrent insert at same index: peer-id string tie-break (A < B < C).
 */

'use strict';

/* ── STORAGE KEY ────────────────────────────────────────────────────── */
const STORAGE_KEY = 'crdt-notes-v1';

/* ── INITIAL SEED ───────────────────────────────────────────────────── */
const SEED_NOTE_ID = 'seed-hello';
function seedState() {
  const seedBody = 'Welcome to crdt-notes!';
  // Seed characters must live in the log — replay is the source of truth.
  const bodyLog = [...seedBody].map((ch, i) => ({
    type: 'body-ins',
    peer: 'A',
    lamport: i + 1,
    noteId: SEED_NOTE_ID,
    index: i,
    ch,
  }));
  return {
    notes: {
      [SEED_NOTE_ID]: {
        id: SEED_NOTE_ID,
        title: 'Hello',
        body: seedBody,
        lamport: 1,
        peer: 'A',
      },
    },
    bodyLog,
    lamport: seedBody.length,
  };
}

/* ── PERSISTENCE ────────────────────────────────────────────────────── */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return seedState();
}

function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ── LAMPORT CLOCK ──────────────────────────────────────────────────── */
function tick(state, incomingLamport = 0) {
  state.lamport = Math.max(state.lamport, incomingLamport) + 1;
  return state.lamport;
}

/* ── NOTE OPERATIONS ────────────────────────────────────────────────── */

/**
 * Create a note and return the new state + op.
 * @param {Object} state
 * @param {string} peer
 * @param {string} [title]
 * @returns {{ state, op }}
 */
function createNote(state, peer, title = 'Untitled') {
  const lamport = tick(state);
  const id = `note-${peer}-${lamport}`;
  const note = { id, title, body: '', lamport, peer };
  return {
    state: {
      ...state,
      notes: { ...state.notes, [id]: note },
      lamport,
    },
    op: { type: 'create-note', peer, lamport, noteId: id, title, body: '' },
  };
}

/**
 * LWW title update.
 * Wins if incoming (lamport, peer) > current (note.lamport, note.peer).
 */
function applyTitleOp(state, op) {
  const note = state.notes[op.noteId];
  if (!note) return state;

  const wins = op.lamport > note.lamport ||
    (op.lamport === note.lamport && op.peer > note.peer);

  if (!wins) return state;

  return {
    ...state,
    notes: {
      ...state.notes,
      [op.noteId]: { ...note, title: op.value, lamport: op.lamport, peer: op.peer },
    },
    lamport: Math.max(state.lamport, op.lamport),
  };
}

/**
 * Produce a title-set op.
 */
function setTitle(state, peer, noteId, value) {
  const lamport = tick(state);
  const op = { type: 'set-title', peer, lamport, noteId, value };
  const newState = applyTitleOp({ ...state, lamport }, op);
  return { state: newState, op };
}

/**
 * Body CRDT: character-level insert/delete log.
 * Ops stored in (lamport, peer) order.
 * Reconstruction: replay all ops in order to build current string.
 */
function insertBodyOp(state, peer, noteId, index, ch) {
  const lamport = tick(state);
  const op = { type: 'body-ins', peer, lamport, noteId, index, ch };
  const newState = applyBodyOp({ ...state, lamport }, op);
  return { state: newState, op };
}

function deleteBodyOp(state, peer, noteId, index) {
  const lamport = tick(state);
  const op = { type: 'body-del', peer, lamport, noteId, index };
  const newState = applyBodyOp({ ...state, lamport }, op);
  return { state: newState, op };
}

/**
 * Apply a body op (ins/del) to the log and recompute note.body.
 */
function applyBodyOp(state, op) {
  if (!state.notes[op.noteId]) return state;

  // Insert op into sorted log
  const log = [...(state.bodyLog || []), op].sort(opOrder);

  // Rebuild body for this note from log
  const noteBody = replayBody(log, op.noteId);

  return {
    ...state,
    bodyLog: log,
    notes: {
      ...state.notes,
      [op.noteId]: { ...state.notes[op.noteId], body: noteBody },
    },
    lamport: Math.max(state.lamport, op.lamport),
  };
}

/**
 * Apply a create-note op from a remote peer.
 */
function applyCreateNote(state, op) {
  if (state.notes[op.noteId]) return state; // already exists
  return {
    ...state,
    notes: {
      ...state.notes,
      [op.noteId]: {
        id: op.noteId,
        title: op.title,
        body: op.body || '',
        lamport: op.lamport,
        peer: op.peer,
      },
    },
    lamport: Math.max(state.lamport, op.lamport),
  };
}

/**
 * Merge a full body log replacement (used when syncing).
 * Re-applies all known ops for a note.
 */
function rebuildBodyFromLog(state, noteId) {
  const body = replayBody(state.bodyLog || [], noteId);
  return {
    ...state,
    notes: {
      ...state.notes,
      [noteId]: { ...state.notes[noteId], body },
    },
  };
}

/* ── BODY REPLAY ────────────────────────────────────────────────────── */
function opOrder(a, b) {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  return a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0;
}

/**
 * Replay all body ops for a given noteId in (lamport, peer) order.
 * Concurrent inserts at same index: peer A before peer B.
 */
function replayBody(log, noteId) {
  const ops = log.filter(o => o.noteId === noteId);
  let chars = []; // array of { ch, opId } — opId = `${lamport}-${peer}-${index}`

  for (const op of ops) {
    if (op.type === 'body-ins') {
      // Determine insertion position accounting for concurrent ops already placed
      const pos = Math.min(op.index, chars.length);
      chars.splice(pos, 0, { ch: op.ch, opId: `${op.lamport}-${op.peer}` });
    } else if (op.type === 'body-del') {
      const pos = Math.min(op.index, chars.length - 1);
      if (pos >= 0) chars.splice(pos, 1);
    }
  }

  return chars.map(c => c.ch).join('');
}

/* ── SET BODY (textarea-level diff → ops) ───────────────────────────── */
/**
 * Produce ops for the difference between oldBody and newBody.
 * Simple Myers-style: find common prefix, common suffix, emit del/ins ops.
 */
function diffBody(state, peer, noteId, oldBody, newBody) {
  if (oldBody === newBody) return { state, ops: [] };

  let lo = 0;
  while (lo < oldBody.length && lo < newBody.length && oldBody[lo] === newBody[lo]) lo++;

  let oldHi = oldBody.length;
  let newHi = newBody.length;
  while (oldHi > lo && newHi > lo && oldBody[oldHi - 1] === newBody[newHi - 1]) {
    oldHi--; newHi--;
  }

  const ops = [];
  let curState = state;

  // Deletions (delete from right so indices stay stable in old string)
  for (let i = oldHi - 1; i >= lo; i--) {
    const res = deleteBodyOp(curState, peer, noteId, i);
    curState = res.state;
    ops.push(res.op);
  }

  // Insertions
  for (let i = lo; i < newHi; i++) {
    const res = insertBodyOp(curState, peer, noteId, i, newBody[i]);
    curState = res.state;
    ops.push(res.op);
  }

  return { state: curState, ops };
}

/* ── SNAPSHOT ───────────────────────────────────────────────────────── */
function takeSnapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

function restoreSnapshot(snapshot) {
  // snapshot is a full state copy
  return JSON.parse(JSON.stringify(snapshot));
}

/* ── PUBLIC API ─────────────────────────────────────────────────────── */
export {
  load,
  save,
  seedState,
  tick,
  createNote,
  setTitle,
  applyTitleOp,
  insertBodyOp,
  deleteBodyOp,
  applyBodyOp,
  applyCreateNote,
  rebuildBodyFromLog,
  diffBody,
  takeSnapshot,
  restoreSnapshot,
  replayBody,
};
