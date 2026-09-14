'use strict';

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

  /* ── Note scheduling ──────────────────────────── */

  _scheduleNote(track, note) {
    const bps    = this.song.bpm / 60;
    const tStart = this._startAudioTime + note.t / bps;
    const tEnd   = this._startAudioTime + (note.t + note.dur) / bps;
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
    const now         = this.ctx.currentTime;
    const beatNow     = (now - this._startAudioTime) * bps;
    const beatAhead   = beatNow + LOOKAHEAD_S * bps;
    const cap         = Math.min(beatAhead, this.songBeats);

    for (const track of this.song.tracks) {
      for (const note of track.notes) {
        // Schedule notes that fall in [_nextBeat, cap)
        if (note.t >= this._nextBeat && note.t < cap) {
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
    const beat = (this.ctx.currentTime - this._startAudioTime) * bps;
    // Clamp pre-roll (negative for ~50ms) to 0 so the UI does not treat
    // onTick(<0) as stop — that sentinel is reserved for stop().
    if (this.onTick) this.onTick(Math.max(0, Math.min(beat, this.songBeats)));
    this._rafId = requestAnimationFrame(() => this._raf());
  }

  /* ── Public API ───────────────────────────────── */

  /**
   * Start playback.
   * @param {object} song        - { bpm, tracks: [{wave, gain, notes: [{t, dur, midi}]}] }
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

  /** Current playback position in beats, or -1 if stopped. */
  get currentBeat() {
    if (!this.playing || !this.ctx) return -1;
    return (this.ctx.currentTime - this._startAudioTime) * (this.song.bpm / 60);
  }
}
