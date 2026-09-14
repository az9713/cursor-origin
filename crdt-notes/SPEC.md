# CRDT notes — frozen spec

Internal spec for Wave 2 project 20. Vanilla HTML/CSS/JS. Persist to `localStorage` key `crdt-notes-v1`.

## Product

Local-first notes with **three simulated peers** on one page. Conflict cards, offline queue, snapshot restore. No network.

Lives at `crdt-notes/index.html`.

## Model

Each note: `{ id, title, body, lamport, peer }`. Sync is last-write-wins on title **or** a character-level log for body:

```
op: { peer, lamport, noteId, type: ins|del, index, ch? }
```

Apply ops in (lamport, peer) order. Concurrent inserts at the same index: peer id tie-break (string order: `A` before `B` before `C`).

Offline: a peer can be toggled offline; its ops queue until Online, then flush.

## Session A must

- Two peer panes (A and B) editing the same note list
- Create note, edit title/body on one peer, go online, see it on the other
- Offline queue: type on A while A is offline; B does not see it until A is online
- Concurrent title edit → conflict card: keep A / keep B
- Snapshot restore: save snapshot, edit, restore
- Hash `#/n/<noteId>`
- Reset seed (one shared note "Hello")

## Session B must

- `dispatch` online: applies op once to shared state and calls `save()`
- `dispatch` offline: applies op only to that peer's `localState` — does **not** call `save()`
- `flushQueue`: applies each queued op once to shared state, then calls `save()`
- Seed body characters live in `bodyLog` so replay is the source of truth
- Snapshot restore resets `lastBody` + forces editor values to restored state

## Session C must

- **Third peer C**: peer pane added alongside A and B (3-column layout)
- All hardcoded `['A','B']` loops replaced with `PEER_IDS = ['A','B','C']`
- Tie-break for concurrent body inserts at same index: peer id string order (A < B < C)
- Conflict cards work for any peer pair — show the two conflicting peer IDs and titles
- `resolveConflict` updates `lastSeenTitle` and removes conflict cards for **all** peers
- Snapshot restore and Reset generalised to loop over all `PEER_IDS`

## Out of scope

Rich text, presence cursors.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
