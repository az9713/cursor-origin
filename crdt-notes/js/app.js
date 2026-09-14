/**
 * app.js — UI controller for crdt-notes (Session C)
 *
 * Three peer panes (A, B, C) share one CRDT state in localStorage.
 * Each peer has an offline queue.  Title conflicts surface as cards.
 * Snapshot save/restore per-peer.
 * Hash routing: #/n/<noteId>
 *
 * Session C changes vs Session B:
 *   - PEER_IDS = ['A','B','C'] — all hardcoded A/B loops generalised
 *   - Conflict detection iterates all other peers (not just the one other)
 *   - buildConflictCard shows dynamic peer labels from conflict.peerX / conflict.peerY
 *   - resolveConflict updates lastSeenTitle + clears cards for ALL peers
 *   - doSnapshotRestore and doReset loop over PEER_IDS
 */

import {
  load, save, seedState,
  createNote, setTitle, applyTitleOp,
  applyBodyOp, applyCreateNote,
  diffBody, takeSnapshot, restoreSnapshot,
} from './crdt.js';

'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   PEER REGISTRY  (single source of truth for peer IDs)
═══════════════════════════════════════════════════════════════════════ */

const PEER_IDS = ['A', 'B', 'C'];

/* ═══════════════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════════════ */

let state = load();         // shared CRDT state (all peers see same data)

/**
 * Build the initial peers map from PEER_IDS so adding a 4th peer later
 * only requires changing PEER_IDS + HTML.
 */
function makePeerEntry(id) {
  return {
    id,
    online: true,
    queue: [],              // ops queued while offline
    snapshot: null,         // saved snapshot
    snapshotLabel: null,    // human-readable timestamp
    selectedNoteId: null,
    conflicts: [],          // { noteId, peerX, valueX, peerY, valueY }
    localState: null,       // offline fork — not written to shared storage
    // DOM refs filled in DOMContentLoaded
    el: null, statusEl: null, toggleBtn: null, queueBadge: null,
    noteListEl: null, editorTitleEl: null, editorBodyEl: null,
    conflictZoneEl: null, snapshotInfoEl: null,
  };
}

const peers = Object.fromEntries(PEER_IDS.map(id => [id, makePeerEntry(id)]));

/* Track last-seen title per (peer, noteId) to detect conflicts */
const lastSeenTitle = Object.fromEntries(PEER_IDS.map(id => [id, {}]));
/* Track last body text per (peer, noteId) to diff against */
const lastBody      = Object.fromEntries(PEER_IDS.map(id => [id, {}]));

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
  for (const id of PEER_IDS) {
    peers[id].selectedNoteId = noteId;
    renderPeer(id);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   DOM BOOTSTRAP
═══════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  for (const id of PEER_IDS) {
    const p = peers[id];
    p.el            = document.getElementById(`peer-${id}`);
    p.statusEl      = document.getElementById(`status-${id}`);
    p.toggleBtn     = document.getElementById(`toggle-${id}`);
    p.queueBadge    = document.getElementById(`queue-badge-${id}`);
    p.noteListEl    = document.getElementById(`note-list-${id}`);
    p.editorTitleEl = document.getElementById(`editor-title-${id}`);
    p.editorBodyEl  = document.getElementById(`editor-body-${id}`);
    p.conflictZoneEl= document.getElementById(`conflict-zone-${id}`);
    p.snapshotInfoEl= document.getElementById(`snapshot-info-${id}`);

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
    for (const id of PEER_IDS) peers[id].selectedNoteId = noteId;
  }

  renderAll();
});

/* ═══════════════════════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════════════════════ */

function renderAll() {
  for (const id of PEER_IDS) renderPeer(id);
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

/**
 * Build a conflict resolution card.
 * conflict = { noteId, peerX, valueX, peerY, valueY }
 *   peerX / peerY are peer IDs (e.g. 'A', 'B', 'C')
 *   valueX / valueY are the two competing title strings
 */
function buildConflictCard(peerId, conflict) {
  const card = document.createElement('div');
  card.className = 'conflict-card';
  card.innerHTML = `
    <h4>⚠ Title conflict on "${escapeHTML(conflict.noteId)}"</h4>
    <p>Two peers edited this title at the same time.</p>
    <div class="conflict-options">
      <button class="conflict-option" data-choice="X">
        <span class="conflict-label">Peer ${escapeHTML(conflict.peerX)}</span>
        ${escapeHTML(conflict.valueX)}
      </button>
      <button class="conflict-option" data-choice="Y">
        <span class="conflict-label">Peer ${escapeHTML(conflict.peerY)}</span>
        ${escapeHTML(conflict.valueY)}
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
 * then re-render all peers so the others see them.
 *
 * Session B constraint: flushQueue applies each op once to shared state
 * then calls save() exactly once at the end.
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
 * Apply an op to state.  Detect title conflicts across all peer pairs.
 * `fromPeer` = the peer that generated the op.
 */
function applyOp(st, op, fromPeer) {
  switch (op.type) {
    case 'create-note':
      return applyCreateNote(st, op);

    case 'set-title': {
      const note = st.notes[op.noteId];
      if (note) {
        /*
         * Conflict detection (generalised for N peers):
         * For each peer Y ≠ fromPeer, check if Y has a competing edit.
         *
         * Conditions for a conflict between X (fromPeer) and Y:
         *   1. State already has a different title than X's op  (concurrent edit in state)
         *   2. Y has previously seen/edited this title (lastSeenTitle[Y] is defined)
         *   3. Y's version differs from X's proposed value
         *   4. Y's version differs from the current state title
         *      (Y's lastSeen is a *pending* edit, not just what state already has)
         *
         * The conflict card is surfaced on peer Y's pane.
         */
        for (const otherId of PEER_IDS) {
          if (otherId === fromPeer) continue;

          const otherLastSeen = lastSeenTitle[otherId][op.noteId];
          if (
            note.title !== op.value &&
            otherLastSeen !== undefined &&
            otherLastSeen !== op.value &&
            note.title !== otherLastSeen
          ) {
            const peerOther = peers[otherId];
            // Only add once per (noteId) — don't stack duplicate cards
            const already = peerOther.conflicts.find(c => c.noteId === op.noteId);
            if (!already) {
              peerOther.conflicts.push({
                noteId: op.noteId,
                peerX: fromPeer,
                valueX: op.value,
                peerY: otherId,
                valueY: otherLastSeen,
              });
            }
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
 *
 * Session B constraints:
 *   - Online:  apply once to shared state, then save() — renderAll()
 *   - Offline: push to queue; apply only to that peer's localState;
 *              do NOT call save() on shared storage
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
  const noteId   = p.selectedNoteId;

  // Record what this peer considers the current title (used for conflict detection)
  lastSeenTitle[peerId][noteId] = newTitle;

  const res = setTitle(viewState(peerId), peerId, noteId, newTitle);
  dispatch(peerId, res.op);
}

function onBodyInput(peerId) {
  const p = peers[peerId];
  if (!p.selectedNoteId) return;

  const noteId = p.selectedNoteId;
  const st     = viewState(peerId);
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
  p.snapshot     = takeSnapshot(state);
  p.snapshotLabel = new Date().toLocaleTimeString();
  renderPeer(peerId);
}

/**
 * Restore a snapshot.
 *
 * Session B constraint: snapshot restore resets lastBody + forces editor
 * values to restored state for all peers.
 */
function doSnapshotRestore(peerId) {
  const p = peers[peerId];
  if (!p.snapshot) {
    alert('No snapshot saved yet.');
    return;
  }
  state = restoreSnapshot(p.snapshot);
  save(state);

  // Clear transient state on ALL peers after restore
  for (const id of PEER_IDS) {
    peers[id].queue     = [];
    peers[id].conflicts = [];
    peers[id].localState = null;
    lastSeenTitle[id]   = {};
    lastBody[id]        = {};
    // Deselect if note no longer exists
    if (peers[id].selectedNoteId && !state.notes[peers[id].selectedNoteId]) {
      peers[id].selectedNoteId = null;
    }
  }

  renderAll();

  // Force editor fields to match restored state even if a textarea had focus
  for (const id of PEER_IDS) {
    syncEditorFromState(id);
  }
}

/* ── Conflict resolution ──────────────────────────────────────────── */

/**
 * Resolve a title conflict by picking one of the two values.
 * choice = 'X' → peerX wins, choice = 'Y' → peerY wins.
 *
 * Session C: update lastSeenTitle for ALL peers and clear conflict cards
 * for this noteId from ALL peers (not just the two involved).
 */
function resolveConflict(peerId, conflict, choice) {
  const winnerValue = choice === 'X' ? conflict.valueX : conflict.valueY;

  // Write winner into shared state with a fresh lamport tick
  const res = setTitle(state, peerId, conflict.noteId, winnerValue);
  state = res.state;

  // Sync all peers' lastSeenTitle so no re-triggering
  for (const id of PEER_IDS) {
    lastSeenTitle[id][conflict.noteId] = winnerValue;
  }
  save(state);

  // Remove all conflict cards for this noteId from every peer pane
  for (const id of PEER_IDS) {
    peers[id].conflicts = peers[id].conflicts.filter(c => c.noteId !== conflict.noteId);
  }

  renderAll();
}

/* ── Reset ─────────────────────────────────────────────────────────── */

function doReset() {
  if (!confirm('Reset to seed state? All notes will be lost.')) return;
  state = seedState();
  save(state);

  for (const id of PEER_IDS) {
    peers[id].queue        = [];
    peers[id].conflicts    = [];
    peers[id].snapshot     = null;
    peers[id].snapshotLabel= null;
    peers[id].selectedNoteId = null;
    peers[id].online       = true;
    peers[id].localState   = null;
    lastSeenTitle[id]      = {};
    lastBody[id]           = {};
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

/**
 * Return the authoritative state for a given peer.
 * Offline peers see their localState fork; online peers see shared state.
 */
function viewState(peerId) {
  const p = peers[peerId];
  return (!p.online && p.localState) ? p.localState : state;
}

/**
 * Force editor fields to match the current (post-restore) state,
 * overriding any stale textarea value even if the field had focus.
 */
function syncEditorFromState(id) {
  const p = peers[id];
  const note = p.selectedNoteId ? viewState(id).notes[p.selectedNoteId] : null;
  if (!note) return;
  p.editorTitleEl.value = note.title;
  p.editorBodyEl.value  = note.body;
  lastSeenTitle[id][note.id] = note.title;
  lastBody[id][note.id]      = note.body;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
