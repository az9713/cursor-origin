/**
 * app.js — UI controller for crdt-notes (Session A)
 *
 * Two peer panes (A, B) share one CRDT state in localStorage.
 * Each peer has an offline queue.  Title conflicts surface as cards.
 * Snapshot save/restore per-peer.
 * Hash routing: #/n/<noteId>
 */

import {
  load, save, seedState,
  createNote, setTitle, applyTitleOp,
  applyBodyOp, applyCreateNote,
  diffBody, takeSnapshot, restoreSnapshot,
} from './crdt.js';

'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════════════ */

let state = load();         // shared CRDT state (both peers see same data)

const peers = {
  A: {
    id: 'A',
    online: true,
    queue: [],              // ops queued while offline
    snapshot: null,         // saved snapshot
    snapshotLabel: null,    // human-readable timestamp
    selectedNoteId: null,
    conflicts: [],          // { noteId, peerA_value, peerB_value, lamportA, lamportB }
    localState: null,       // offline fork — not written to shared storage
    // DOM refs filled below
    el: null, statusEl: null, toggleBtn: null, queueBadge: null,
    noteListEl: null, editorTitleEl: null, editorBodyEl: null,
    conflictZoneEl: null, snapshotInfoEl: null,
  },
  B: {
    id: 'B',
    online: true,
    queue: [],
    snapshot: null,
    snapshotLabel: null,
    selectedNoteId: null,
    conflicts: [],
    localState: null,
    el: null, statusEl: null, toggleBtn: null, queueBadge: null,
    noteListEl: null, editorTitleEl: null, editorBodyEl: null,
    conflictZoneEl: null, snapshotInfoEl: null,
  },
};

/* Track last-seen title per peer so we can detect conflicts */
const lastSeenTitle = { A: {}, B: {} };
/* Track last body text per (peer, noteId) to diff against */
const lastBody = { A: {}, B: {} };

/* ═══════════════════════════════════════════════════════════════════════
   HASH ROUTING
═══════════════════════════════════════════════════════════════════════ */

function parseHash() {
  const h = location.hash;
  const m = h.match(/^#\/n\/(.+)$/);
  return m ? m[1] : null;
}

function navigateToNote(noteId) {
  location.hash = noteId ? `#/n/${noteId}` : '';
}

window.addEventListener('hashchange', () => {
  const noteId = parseHash();
  // Select that note in both panes
  for (const p of ['A', 'B']) {
    peers[p].selectedNoteId = noteId;
    renderPeer(p);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   DOM BOOTSTRAP
═══════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  for (const id of ['A', 'B']) {
    const p = peers[id];
    p.el           = document.getElementById(`peer-${id}`);
    p.statusEl     = document.getElementById(`status-${id}`);
    p.toggleBtn    = document.getElementById(`toggle-${id}`);
    p.queueBadge   = document.getElementById(`queue-badge-${id}`);
    p.noteListEl   = document.getElementById(`note-list-${id}`);
    p.editorTitleEl= document.getElementById(`editor-title-${id}`);
    p.editorBodyEl = document.getElementById(`editor-body-${id}`);
    p.conflictZoneEl= document.getElementById(`conflict-zone-${id}`);
    p.snapshotInfoEl = document.getElementById(`snapshot-info-${id}`);

    // Toggle online/offline
    p.toggleBtn.addEventListener('click', () => toggleOnline(id));

    // Title edit
    p.editorTitleEl.addEventListener('input', () => onTitleInput(id));
    p.editorTitleEl.addEventListener('blur',  () => onTitleInput(id));

    // Body edit
    p.editorBodyEl.addEventListener('input', () => onBodyInput(id));

    // Snapshot buttons
    document.getElementById(`snap-save-${id}`)
      .addEventListener('click', () => doSnapshotSave(id));
    document.getElementById(`snap-restore-${id}`)
      .addEventListener('click', () => doSnapshotRestore(id));

    // New note button
    document.getElementById(`new-note-${id}`)
      .addEventListener('click', () => doCreateNote(id));
  }

  // Global reset
  document.getElementById('btn-reset').addEventListener('click', doReset);

  // Initial hash
  const noteId = parseHash();
  if (noteId) {
    peers.A.selectedNoteId = noteId;
    peers.B.selectedNoteId = noteId;
  }

  renderAll();
});

/* ═══════════════════════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════════════════════ */

function renderAll() {
  renderPeer('A');
  renderPeer('B');
}

function renderPeer(id) {
  const p = peers[id];

  // Status badge
  p.statusEl.textContent = p.online ? 'Online' : 'Offline';
  p.statusEl.className = 'peer-status' + (p.online ? '' : ' offline');
  p.toggleBtn.textContent = p.online ? 'Go Offline' : 'Go Online';

  // Queue badge
  const qLen = p.queue.length;
  p.queueBadge.textContent = `${qLen} queued`;
  p.queueBadge.className = 'queue-badge' + (qLen > 0 ? ' visible' : '');

  // Note list
  renderNoteList(id);

  // Editor
  renderEditor(id);

  // Conflicts
  renderConflicts(id);

  // Snapshot info
  p.snapshotInfoEl.textContent = p.snapshotLabel
    ? `Snapshot: ${p.snapshotLabel}`
    : 'No snapshot';
}

function renderNoteList(id) {
  const p = peers[id];
  const el = p.noteListEl;
  el.innerHTML = '';

  const notes = Object.values(viewState(id).notes).sort((a, b) =>
    a.lamport - b.lamport || a.id.localeCompare(b.id)
  );

  for (const note of notes) {
    const item = document.createElement('div');
    item.className = 'note-item' + (note.id === p.selectedNoteId ? ' active' : '');
    item.textContent = note.title || 'Untitled';
    item.title = note.title || 'Untitled';
    item.addEventListener('click', () => {
      p.selectedNoteId = note.id;
      navigateToNote(note.id);
      renderPeer(id);
    });
    el.appendChild(item);
  }
}

function renderEditor(id) {
  const p = peers[id];
  const note = p.selectedNoteId ? viewState(id).notes[p.selectedNoteId] : null;

  const emptyDiv = document.getElementById(`editor-empty-${id}`);
  const editorDiv = document.getElementById(`editor-main-${id}`);

  if (!note) {
    emptyDiv.style.display = 'flex';
    editorDiv.style.display = 'none';
    return;
  }

  emptyDiv.style.display = 'none';
  editorDiv.style.display = 'flex';

  // Update title only if peer doesn't have focus on it
  if (document.activeElement !== p.editorTitleEl) {
    p.editorTitleEl.value = note.title;
    lastSeenTitle[id][note.id] = note.title;
  }

  // Update body only if peer doesn't have focus
  if (document.activeElement !== p.editorBodyEl) {
    p.editorBodyEl.value = note.body;
    lastBody[id][note.id] = note.body;
  }
}

function renderConflicts(id) {
  const p = peers[id];
  const zone = p.conflictZoneEl;
  zone.innerHTML = '';

  for (const conflict of p.conflicts) {
    const card = buildConflictCard(id, conflict);
    zone.appendChild(card);
  }
}

function buildConflictCard(peerId, conflict) {
  const card = document.createElement('div');
  card.className = 'conflict-card';
  card.innerHTML = `
    <h4>⚠ Title conflict on "${escapeHTML(conflict.noteId)}"</h4>
    <p>Two peers edited this title at the same time.</p>
    <div class="conflict-options">
      <button class="conflict-option" data-choice="A">
        <span class="conflict-label">Peer A</span>
        ${escapeHTML(conflict.valueA)}
      </button>
      <button class="conflict-option" data-choice="B">
        <span class="conflict-label">Peer B</span>
        ${escapeHTML(conflict.valueB)}
      </button>
    </div>
  `;

  card.querySelectorAll('.conflict-option').forEach(btn => {
    btn.addEventListener('click', () => {
      resolveConflict(peerId, conflict, btn.dataset.choice);
    });
  });

  return card;
}

/* ═══════════════════════════════════════════════════════════════════════
   ONLINE / OFFLINE
═══════════════════════════════════════════════════════════════════════ */

function toggleOnline(id) {
  const p = peers[id];
  p.online = !p.online;

  if (p.online) {
    flushQueue(id);
    p.localState = null;
  } else {
    p.localState = cloneState(state);
  }

  renderAll();
}

/**
 * Flush queued ops from peer `id` into shared state,
 * then re-render both peers so the other side sees them.
 */
function flushQueue(id) {
  const p = peers[id];

  for (const op of p.queue) {
    state = applyOp(state, op, id);
  }
  p.queue = [];
  p.localState = null;

  save(state);
  renderAll();
}

/* ═══════════════════════════════════════════════════════════════════════
   APPLY OPS (generic router)
═══════════════════════════════════════════════════════════════════════ */

/**
 * Apply an op to state.  Detect title conflicts.
 * `fromPeer` = the peer that generated the op.
 */
function applyOp(st, op, fromPeer) {
  switch (op.type) {
    case 'create-note':
      return applyCreateNote(st, op);

    case 'set-title': {
      const note = st.notes[op.noteId];
      if (note) {
        // Conflict detection: if both peers have edited since last sync
        // and the incoming op is concurrent (same lamport bracket)
        const otherPeer = fromPeer === 'A' ? 'B' : 'A';
        const otherLastSeen = lastSeenTitle[otherPeer][op.noteId];
        // Conflict: the note's current title differs from what either peer last saw
        // and both edits are "concurrent" (neither dominates because we haven't synced)
        if (
          note.title !== op.value &&
          otherLastSeen !== undefined &&
          otherLastSeen !== op.value &&
          note.title !== otherLastSeen
        ) {
          // Surface conflict card on the OTHER peer's pane
          const peerOther = peers[otherPeer];
          const already = peerOther.conflicts.find(c => c.noteId === op.noteId);
          if (!already) {
            peerOther.conflicts.push({
              noteId: op.noteId,
              valueA: fromPeer === 'A' ? op.value : note.title,
              valueB: fromPeer === 'B' ? op.value : note.title,
              opA: fromPeer === 'A' ? op : null,
              opB: fromPeer === 'B' ? op : null,
            });
          }
        }
      }
      return applyTitleOp(st, op);
    }

    case 'body-ins':
    case 'body-del':
      return applyBodyOp(st, op);

    default:
      return st;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   DISPATCH — send an op from a peer
═══════════════════════════════════════════════════════════════════════ */

/**
 * A peer dispatches an op.
 * - If online: apply immediately to shared state (both peers see it)
 * - If offline: push to queue
 */
function dispatch(peerId, op) {
  const p = peers[peerId];

  if (p.online) {
    state = applyOp(state, op, peerId);
    save(state);
    renderAll();
  } else {
    p.queue.push(op);
    if (!p.localState) p.localState = cloneState(state);
    p.localState = applyOp(p.localState, op, peerId);
    renderPeer(peerId);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   EVENT HANDLERS
═══════════════════════════════════════════════════════════════════════ */

function doCreateNote(peerId) {
  const res = createNote(viewState(peerId), peerId);
  peers[peerId].selectedNoteId = res.op.noteId;
  dispatch(peerId, res.op);
  navigateToNote(res.op.noteId);
}

function onTitleInput(peerId) {
  const p = peers[peerId];
  if (!p.selectedNoteId) return;

  const newTitle = p.editorTitleEl.value;
  const noteId = p.selectedNoteId;

  // Record what this peer considers the current title
  lastSeenTitle[peerId][noteId] = newTitle;

  const res = setTitle(viewState(peerId), peerId, noteId, newTitle);
  dispatch(peerId, res.op);
}

function onBodyInput(peerId) {
  const p = peers[peerId];
  if (!p.selectedNoteId) return;

  const noteId = p.selectedNoteId;
  const st = viewState(peerId);
  const oldBody = lastBody[peerId][noteId] ?? (st.notes[noteId]?.body ?? '');
  const newBody = p.editorBodyEl.value;

  if (oldBody === newBody) return;

  const res = diffBody(st, peerId, noteId, oldBody, newBody);
  lastBody[peerId][noteId] = newBody;

  for (const op of res.ops) {
    dispatch(peerId, op);
  }
}

/* ── Snapshot ─────────────────────────────────────────────────────── */
function doSnapshotSave(peerId) {
  const p = peers[peerId];
  p.snapshot = takeSnapshot(state);
  p.snapshotLabel = new Date().toLocaleTimeString();
  renderPeer(peerId);
}

function doSnapshotRestore(peerId) {
  const p = peers[peerId];
  if (!p.snapshot) {
    alert('No snapshot saved yet.');
    return;
  }
  state = restoreSnapshot(p.snapshot);
  save(state);
  // Clear queues and conflicts on both sides after restore
  for (const id of ['A', 'B']) {
    peers[id].queue = [];
    peers[id].conflicts = [];
    peers[id].localState = null;
    lastSeenTitle[id] = {};
    lastBody[id] = {};
    // Re-select note if it still exists
    if (peers[id].selectedNoteId && !state.notes[peers[id].selectedNoteId]) {
      peers[id].selectedNoteId = null;
    }
  }
  renderAll();
  // Force editor fields to match restored bodies even if a textarea has focus
  for (const id of ['A', 'B']) {
    syncEditorFromState(id);
  }
}

/* ── Conflict resolution ──────────────────────────────────────────── */
function resolveConflict(peerId, conflict, choice) {
  const p = peers[peerId];
  const winnerValue = choice === 'A' ? conflict.valueA : conflict.valueB;

  // Force the winner into state with a new tick (both peers agree)
  const res = setTitle(state, peerId, conflict.noteId, winnerValue);
  state = res.state;
  // Update lastSeen for both peers to avoid re-triggering conflicts
  lastSeenTitle['A'][conflict.noteId] = winnerValue;
  lastSeenTitle['B'][conflict.noteId] = winnerValue;
  save(state);

  // Remove from this peer's conflict list
  p.conflicts = p.conflicts.filter(c => c !== conflict);
  // Also remove from other peer
  const otherId = peerId === 'A' ? 'B' : 'A';
  peers[otherId].conflicts = peers[otherId].conflicts.filter(c =>
    c.noteId !== conflict.noteId
  );

  renderAll();
}

/* ── Reset ─────────────────────────────────────────────────────────── */
function doReset() {
  if (!confirm('Reset to seed state? All notes will be lost.')) return;
  state = seedState();
  save(state);

  for (const id of ['A', 'B']) {
    peers[id].queue = [];
    peers[id].conflicts = [];
    peers[id].snapshot = null;
    peers[id].snapshotLabel = null;
    peers[id].selectedNoteId = null;
    peers[id].online = true;
    peers[id].localState = null;
    lastSeenTitle[id] = {};
    lastBody[id] = {};
  }

  location.hash = '';
  renderAll();
}

/* ═══════════════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════════════ */

function cloneState(st) {
  return JSON.parse(JSON.stringify(st));
}

function viewState(peerId) {
  const p = peers[peerId];
  return (!p.online && p.localState) ? p.localState : state;
}

function syncEditorFromState(id) {
  const p = peers[id];
  const note = p.selectedNoteId ? viewState(id).notes[p.selectedNoteId] : null;
  if (!note) return;
  p.editorTitleEl.value = note.title;
  p.editorBodyEl.value = note.body;
  lastSeenTitle[id][note.id] = note.title;
  lastBody[id][note.id] = note.body;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
