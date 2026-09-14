# Audio tracker — frozen spec

Internal spec for Wave 3 project 29. Vanilla HTML/CSS/JS. Persist to `localStorage` key `audio-tracker-v1`.

## Product

Multi-track audio tracker: piano roll, patterns, BPM, mixer, Web Audio playback, JSON song file. Playhead and notes must agree. Lives at `audio-tracker/index.html`.

A note that sounds on the wrong beat is a fail. Timing uses Web Audio `currentTime`, not `setInterval` as the clock.

## Model

```
song: { bpm, tracks: [{ id, name, gain, wave: sine|square|sawtooth, notes: [{ t, dur, midi }] }] }
```

`t` and `dur` are in beats (quarter notes). 16-step pattern view (4/4, one bar) plus a song length of ≥ 4 bars. Piano roll: click to add/remove a note at the cell under the cursor. Mixer: per-track gain. Play/stop schedules oscillators against a start `AudioContext` time.

JSON export/import the song object.

## Session A must

- Seed song: 2 tracks, audible notes, bpm 120
- Piano roll for the selected track; playhead line moves with audio
- Play / stop / BPM field
- Mixer gains
- Export / import JSON
- Hash `#/t/<ms>` optional playhead restore is not required; hash `#/s/<songId>` for seed vs user
- Reset
- Hub link `../`

## Out of scope (later sessions)

Swing, send/return, samples, piano-roll velocity.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
