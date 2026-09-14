# Audio tracker — frozen spec

Internal spec for Wave 3 project 29. Vanilla HTML/CSS/JS. Persist to `localStorage` key `audio-tracker-v1`.

## Product

Multi-track audio tracker: piano roll, patterns, BPM, mixer, Web Audio playback, JSON song file. Playhead and notes must agree. Lives at `audio-tracker/index.html`.

A note that sounds on the wrong beat is a fail. Timing uses Web Audio `currentTime`, not `setInterval` as the clock.

## Model

```
song: { bpm, swing: 0..1, tracks: [{ id, name, gain, wave: sine|square|sawtooth, notes: [{ t, dur, midi }] }] }
```

`t` and `dur` are in beats (quarter notes). Default `swing` is 0. A 16th is 0.25 beats. Odd 16ths (`t / 0.25` an odd integer) are delayed by `swing * 0.5 * 0.25` beats; even 16ths stay put. Playhead inverts the same map so it agrees with sounding notes.

16-step pattern view (4/4, one bar) plus a song length of ≥ 4 bars. Piano roll: click to add/remove a note at the cell under the cursor. Mixer: per-track gain. Play/stop schedules oscillators against a start `AudioContext` time.

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

## Session C must

- `song.swing` in `0..1`, default `0`. Seed song ships `swing: 0`.
- Delay odd 16th onsets: `step = t / 0.25`; if `step` is an odd integer (epsilon), `extraBeats = swing * 0.5 * 0.25`, schedule at `t + extraBeats`. Even 16ths unchanged.
- `swing = 0` is identity — Session A seed plays at the same audio times as before.
- Between 16th boundaries the warp is piecewise-linear so the playhead, driven from `AudioContext.currentTime`, maps back through the same swing and sits on a sounding note.
- UI: Swing slider 0–100% next to BPM. BPM stays disabled while playing.
- JSON export/import includes `swing`; missing/invalid values normalise to `0`.
- Hash `#/s/seed` still loads the seed song.
- Storage key unchanged: `audio-tracker-v1`.

## Out of scope (later sessions)

Send/return, samples, piano-roll velocity.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
