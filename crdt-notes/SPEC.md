# CRDT notes — frozen spec

Internal spec for Wave 2 project 20. Vanilla HTML/CSS/JS. Persist to `localStorage` key `crdt-notes-v1`.

## Product

Local-first notes with **two simulated peers** on one page. Conflict cards, offline queue, snapshot restore. No network.

Lives at `crdt-notes/index.html`.

## Model

Each note: `{ id, title, body, lamport, peer }`. Sync is last-write-wins on title **or** a character-level log for body:

```
op: { peer, lamport, noteId, type: ins|del, index, ch? }
```

Apply ops in (lamport, peer) order. Concurrent inserts at the same index: peer id tie-break (`A` before `B`).

Offline: a peer can be toggled offline; its ops queue until Online, then flush.

## Session A must

- Two peer panes (A and B) editing the same note list
- Create note, edit title/body on one peer, go online, see it on the other
- Offline queue: type on A while A is offline; B does not see it until A is online
- Concurrent title edit → conflict card: keep A / keep B
- Snapshot restore: save snapshot, edit, restore
- Hash `#/n/<noteId>`
- Reset seed (one shared note “Hello”)

## Out of scope (later sessions)

Rich text, presence cursors, third peer.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
