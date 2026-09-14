'use strict';

/**
 * 16th-note swing.
 *
 * Grid time `t` is in quarter-note beats (a 16th = 0.25 beats).
 * Odd 16ths (step = t/0.25 odd integer) are delayed by
 *   extraBeats = swing * 0.5 * 0.25
 * so swing=0 is identity and swing=1 puts the off-beat halfway to the next 16th.
 *
 * Between 16th boundaries the map is piecewise-linear so the playhead can
 * invert the same warp and sit on a note while it sounds.
 */
const SWING_STEP = 0.25;
const SWING_PAIR = 0.5; // two 16ths = one 8th
const SWING_EPS  = 1e-9;

function clampSwing(swing) {
  const s = Number(swing);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.min(1, s);
}

/** Delay applied to a grid time that lands on an odd 16th (else 0). */
function swingExtraBeats(t, swing) {
  const s = clampSwing(swing);
  if (s === 0) return 0;
  const step = t / SWING_STEP;
  const nearest = Math.round(step);
  if (Math.abs(step - nearest) > 1e-6) return 0;
  if ((nearest & 1) !== 1) return 0;
  return s * 0.5 * SWING_STEP;
}

/** Grid beats → audio beats (continuous; matches extraBeats at 16th onsets). */
function gridToAudioBeats(t, swing) {
  const s = clampSwing(swing);
  if (s === 0) return t;
  const extra = swingExtraBeats(SWING_STEP, s);
  const pairIndex = Math.floor((t + SWING_EPS) / SWING_PAIR);
  const pairStart = pairIndex * SWING_PAIR;
  const u = t - pairStart;
  if (u <= SWING_STEP) {
    return pairStart + u * (SWING_STEP + extra) / SWING_STEP;
  }
  return pairStart + (SWING_STEP + extra) + (u - SWING_STEP) * (SWING_STEP - extra) / SWING_STEP;
}

/** Audio beats → grid beats (inverse of gridToAudioBeats). */
function audioToGridBeats(audioT, swing) {
  const s = clampSwing(swing);
  if (s === 0) return audioT;
  const extra = swingExtraBeats(SWING_STEP, s);
  const pairIndex = Math.floor((audioT + SWING_EPS) / SWING_PAIR);
  const pairStart = pairIndex * SWING_PAIR;
  const v = audioT - pairStart;
  const firstDur = SWING_STEP + extra;
  if (v <= firstDur) {
    return pairStart + v * SWING_STEP / firstDur;
  }
  const secondDur = SWING_STEP - extra;
  return pairStart + SWING_STEP + (v - firstDur) * SWING_STEP / secondDur;
}

/**
 * AudioEngine
 *
 * Musical time source: AudioContext.currentTime (Web Audio API).
 * A 25 ms lookahead scheduler pre-books oscillator start/stop times so
 * note playback is sample-accurate regardless of JS call-stack jitter.
 *
 * Usage:
 *   const engine = new AudioEngine();
 *   engine.start(song, totalBeats, (beat) => { ... });
 *   engine.stop();
 */
class AudioEngine {
  constructor() {
    this.ctx            = null;
    this.playing        = false;
    this.song           = null;
    this.songBeats      = 16;
    this.onTick         = null;   // (beat: number) => void  [beat < 0 means stopped]

    this._startAudioTime = 0;    // ctx.currentTime at beat 0
    this._nextBeat       = 0;    // highest beat position already scheduled
    this._nodes          = [];   // live OscillatorNodes (for early stop)
    this._schedTimer     = null;
    this._rafId          = null;
  }

  /* ── Boot ─────────────────────────────────────── */

  _boot() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /* ── Helpers ──────────────────────────────────── */

  _midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  _swing() {
    return clampSwing(this.song && this.song.swing);
  }

  /* ── Note scheduling ──────────────────────────── */

  _scheduleNote(track, note) {
    const bps    = this.song.bpm / 60;
    const swing  = this._swing();
    const tStart = this._startAudioTime + gridToAudioBeats(note.t, swing) / bps;
    const tEnd   = this._startAudioTime + gridToAudioBeats(note.t + note.dur, swing) / bps;
    const now    = this.ctx.currentTime;

    if (tEnd <= now) return; // already in the past

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type              = track.wave || 'sine';
    osc.frequency.value   = this._midiToHz(note.midi);

    const vol = Math.max(0.0001, Math.min(1, track.gain ?? 0.7));
    const envEnd = Math.max(tEnd - 0.015, tStart + 0.01);
    gain.gain.setValueAtTime(vol, tStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, envEnd);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(Math.max(tStart, now));
    osc.stop(Math.max(tEnd, now + 0.01));

    this._nodes.push(osc);
  }

  /* ── Lookahead scheduler (runs via setTimeout) ── */

  _schedule() {
    if (!this.playing) return;

    const LOOKAHEAD_S = 0.15;               // seconds ahead to pre-fill
    const bps         = this.song.bpm / 60;
    const swing       = this._swing();
    const now         = this.ctx.currentTime;
    const beatNow     = (now - this._startAudioTime) * bps;
    const beatAhead   = beatNow + LOOKAHEAD_S * bps;
    const cap         = Math.min(beatAhead, this.songBeats);

    for (const track of this.song.tracks) {
      for (const note of track.notes) {
        // Watermark is in audio beats so odd-16th delay is inside the window
        const audioT = gridToAudioBeats(note.t, swing);
        if (audioT >= this._nextBeat && audioT < cap) {
          this._scheduleNote(track, note);
        }
      }
    }

    // Advance watermark
    this._nextBeat = Math.max(this._nextBeat, cap);

    // Check end of song
    if (beatNow >= this.songBeats) {
      this.stop();
      return;
    }

    this._schedTimer = setTimeout(() => this._schedule(), 25);
  }

  /* ── rAF ticker (drives UI playhead) ─────────── */

  _raf() {
    if (!this.playing) return;
    const bps  = this.song.bpm / 60;
    const audioBeat = (this.ctx.currentTime - this._startAudioTime) * bps;
    // Invert swing so the playhead sits on a note while it sounds.
    // Clamp pre-roll (negative for ~50ms) before mapping — a negative audio
    // beat would land in the previous 8th-pair and jump the playhead.
    const beat = audioToGridBeats(Math.max(0, audioBeat), this._swing());
    if (this.onTick) this.onTick(Math.min(beat, this.songBeats));
    this._rafId = requestAnimationFrame(() => this._raf());
  }

  /* ── Public API ───────────────────────────────── */

  /**
   * Start playback.
   * @param {object} song        - { bpm, swing, tracks: [{wave, gain, notes: [{t, dur, midi}]}] }
   * @param {number} songBeats   - Total song length in beats
   * @param {function} onTick    - Called each animation frame with current beat; beat=-1 on stop
   */
  start(song, songBeats, onTick) {
    this._boot();
    this.song           = song;
    this.songBeats      = songBeats;
    this.onTick         = onTick;
    this.playing        = true;
    this._startAudioTime = this.ctx.currentTime + 0.05; // tiny pre-roll offset
    this._nextBeat      = 0;
    this._nodes         = [];

    this._schedule();
    this._raf();
  }

  /**
   * Stop playback immediately. Silences all live oscillators.
   * Calls onTick(-1) to notify UI.
   */
  stop() {
    this.playing = false;
    clearTimeout(this._schedTimer);
    cancelAnimationFrame(this._rafId);

    for (const n of this._nodes) {
      try { n.stop(0); } catch (_) { /* already stopped */ }
    }
    this._nodes = [];

    if (this.onTick) this.onTick(-1);
  }

  /** Current playback position in grid beats, or -1 if stopped. */
  get currentBeat() {
    if (!this.playing || !this.ctx) return -1;
    const audioBeat = (this.ctx.currentTime - this._startAudioTime) * (this.song.bpm / 60);
    return audioToGridBeats(Math.max(0, audioBeat), this._swing());
  }
}
