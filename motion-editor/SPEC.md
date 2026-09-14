# Motion editor — frozen spec

Internal spec for Wave 2 project 18. Vanilla HTML/CSS/JS. Persist to `localStorage` key `motion-editor-v1`.

## Product

Keyframe timeline, easing curves, playhead, preview stage, JSON export/import.

Lives at `motion-editor/index.html`.

## Model

```
clip: { durationMs, fps, nodes: [{ id, label, x, y, w, h, fill, track: [{ t, x, y, ease }] }] }
```

`t` is 0..1. Easing: `linear`, `easeIn`, `easeOut`, `easeInOut`. Interpolation between keyframes uses the left keyframe’s ease.

Playhead `p` in 0..1. Preview must match `sample(node, p)` — not CSS transitions as the source of truth.

## Session A must

- Seed: 2 nodes (box + label) with ≥ 3 keyframes each
- Stage preview + timeline with playhead, play/pause, scrub
- Select node; add/delete keyframe at playhead
- Change ease on a keyframe
- JSON export / import
- Hash `#/t/<ms>` optional playhead restore
- Reset

## Out of scope (later sessions)

Staggered children, motion paths, parented transforms.

## Session C must

- `node.staggerMs` (number, default 0) — delay in ms before the node's animation begins.
- `sample(node, p, durationMs)` applies stagger via effective time:
  `effectiveP = clamp((p * durationMs - staggerMs) / durationMs, 0, 1)`
- `sample()` remains the **only** source of truth for stage position; no CSS transitions.
- DEFAULT_CLIP Label node ships with `staggerMs: 200` so the effect is immediately visible.
- Inspector / side panel: number input for `staggerMs` on the selected node (enabled only when a node is selected).
- Imported JSON normalises missing `staggerMs` to `0` so old clips stay valid.
- Storage key unchanged: `motion-editor-v1`.

## Out of scope (future sessions)

Motion paths, parented transforms.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
