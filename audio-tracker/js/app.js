'use strict';

/* ═══════════════════════════════════════════════════════
   Constants
═══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'audio-tracker-v1';

// Piano-roll dimensions
const MIDI_HIGH  = 83;           // B5
const MIDI_LOW   = 48;           // C3
const MIDI_RANGE = MIDI_HIGH - MIDI_LOW + 1;  // 36 rows

const CELL_W     = 22;           // px per 16th-note step
const CELL_H     = 14;           // px per semitone row
const STEP_SIZE  = 0.25;         // beats (= 1 sixteenth note)
const TOTAL_BARS = 4;
const TOTAL_BEATS = TOTAL_BARS * 4;            // 16 quarter-note beats
const TOTAL_STEPS = TOTAL_BEATS / STEP_SIZE;   // 64 columns
const PX_PER_BEAT = CELL_W / STEP_SIZE;        // 88 px / beat
const GRID_W     = TOTAL_STEPS * CELL_W;       // 1408 px
const GRID_H     = MIDI_RANGE  * CELL_H;       //  504 px

// Twelve-tone helpers
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_SET  = new Set([1, 3, 6, 8, 10]);

function midiName(m) {
  return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}
function isBlack(m) { return BLACK_SET.has(m % 12); }

/* ═══════════════════════════════════════════════════════
   Seed song  (bpm 120, 2 tracks, C-major flavour)
═══════════════════════════════════════════════════════ */

const SEED_SONG = {
  bpm: 120,
  tracks: [
    {
      id: 'T1', name: 'Melody', gain: 0.65, wave: 'sine',
      notes: [
        { t:  0, dur: 1, midi: 60 },  // C4
        { t:  1, dur: 1, midi: 64 },  // E4
        { t:  2, dur: 1, midi: 67 },  // G4
        { t:  3, dur: 1, midi: 64 },  // E4
        { t:  4, dur: 1, midi: 65 },  // F4
        { t:  5, dur: 1, midi: 69 },  // A4
        { t:  6, dur: 2, midi: 67 },  // G4  (half note)
        { t:  8, dur: 1, midi: 60 },  // C4
        { t:  9, dur: 1, midi: 62 },  // D4
        { t: 10, dur: 1, midi: 64 },  // E4
        { t: 11, dur: 1, midi: 67 },  // G4
        { t: 12, dur: 1, midi: 69 },  // A4
        { t: 13, dur: 1, midi: 67 },  // G4
        { t: 14, dur: 1, midi: 64 },  // E4
        { t: 15, dur: 1, midi: 60 },  // C4
      ]
    },
    {
      id: 'T2', name: 'Bass', gain: 0.5, wave: 'sawtooth',
      notes: [
        { t:  0, dur: 2, midi: 48 },  // C3
        { t:  2, dur: 2, midi: 55 },  // G3
        { t:  4, dur: 2, midi: 53 },  // F3
        { t:  6, dur: 2, midi: 55 },  // G3
        { t:  8, dur: 2, midi: 48 },  // C3
        { t: 10, dur: 2, midi: 55 },  // G3
        { t: 12, dur: 2, midi: 53 },  // F3
        { t: 14, dur: 2, midi: 55 },  // G3
      ]
    }
  ]
};

/* ═══════════════════════════════════════════════════════
   State
═══════════════════════════════════════════════════════ */

let song          = null;
let selectedTrack = 0;
const engine      = new AudioEngine();

/* ═══════════════════════════════════════════════════════
   DOM refs
═══════════════════════════════════════════════════════ */

const elBpm        = document.getElementById('bpm');
const elPlayBtn    = document.getElementById('play-btn');
const elStopBtn    = document.getElementById('stop-btn');
const elExportBtn  = document.getElementById('export-btn');
const elImportBtn  = document.getElementById('import-btn');
const elImportFile = document.getElementById('import-file');
const elResetBtn   = document.getElementById('reset-btn');
const elStatus     = document.getElementById('status');
const elTracksPanel = document.getElementById('tracks-panel');
const elPrRuler    = document.getElementById('pr-ruler');
const elPrKeys     = document.getElementById('pr-keys');
const elPrGrid     = document.getElementById('pr-grid');
const elPrOuter    = document.getElementById('pr-grid-outer');
const elPlayhead   = document.getElementById('pr-playhead');

/* ═══════════════════════════════════════════════════════
   Hash routing
═══════════════════════════════════════════════════════ */

function getHashId() {
  const m = location.hash.match(/^#\/s\/(\w+)/);
  return m ? m[1] : null;
}
function setHash(id) {
  history.replaceState(null, '', '#/s/' + id);
}

/* ═══════════════════════════════════════════════════════
   Storage
═══════════════════════════════════════════════════════ */

function saveSong() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(song));
  setHash('user');
}
function loadSong() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

/* ═══════════════════════════════════════════════════════
   Initialise
═══════════════════════════════════════════════════════ */

function init() {
  const hid = getHashId();
  if (hid === 'seed') {
    song = deepClone(SEED_SONG);
  } else if (hid === 'user') {
    song = loadSong() || deepClone(SEED_SONG);
  } else {
    const saved = loadSong();
    if (saved) { song = saved; setHash('user'); }
    else        { song = deepClone(SEED_SONG); setHash('seed'); }
  }

  buildPianoRoll();
  renderAll();
}

/* ═══════════════════════════════════════════════════════
   Piano roll construction  (one-time setup)
═══════════════════════════════════════════════════════ */

function buildPianoRoll() {
  buildRuler();
  buildKeys();
  buildGridBg();

  elPrGrid.style.width  = GRID_W + 'px';
  elPrGrid.style.height = GRID_H + 'px';

  // Sync keys (vertical) and ruler (horizontal) to main scroll
  elPrOuter.addEventListener('scroll', () => {
    elPrKeys.style.transform  = `translateY(${-elPrOuter.scrollTop}px)`;
    elPrRuler.style.transform = `translateX(${-elPrOuter.scrollLeft}px)`;
  });

  elPrGrid.addEventListener('click', onGridClick);

  // Scroll so C4 is near the centre
  const c4Y = (MIDI_HIGH - 60) * CELL_H;
  setTimeout(() => {
    elPrOuter.scrollTop = Math.max(0, c4Y - elPrOuter.clientHeight / 2);
  }, 50);
}

function buildRuler() {
  elPrRuler.style.width = GRID_W + 'px';
  const frag = document.createDocumentFragment();

  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const x = bar * 4 * PX_PER_BEAT;

    // Bar label
    const bDiv = document.createElement('div');
    bDiv.className = 'r-bar';
    bDiv.style.left = x + 'px';
    bDiv.textContent = bar + 1;
    frag.appendChild(bDiv);

    // Beat ticks within bar (beats 2, 3, 4)
    for (let b = 1; b < 4; b++) {
      const bd = document.createElement('div');
      bd.className = 'r-beat';
      bd.style.left = (x + b * PX_PER_BEAT) + 'px';
      bd.textContent = b + 1;
      frag.appendChild(bd);
    }
  }

  elPrRuler.appendChild(frag);
}

function buildKeys() {
  elPrKeys.style.height = GRID_H + 'px';
  const frag = document.createDocumentFragment();

  for (let midi = MIDI_HIGH; midi >= MIDI_LOW; midi--) {
    const div  = document.createElement('div');
    const name = midiName(midi);
    const black = isBlack(midi);
    const isC   = (midi % 12 === 0);

    div.className = 'pr-key' + (black ? ' black' : ' white') + (isC ? ' c-note' : '');
    div.style.height = CELL_H + 'px';
    // Show label only on C notes and every 3rd white note for clarity
    if (isC || name === 'A' + name.slice(1)) {
      if (isC) div.textContent = name;
    }
    frag.appendChild(div);
  }

  elPrKeys.appendChild(frag);
}

function buildGridBg() {
  // Overlay tinted strips for black-key rows so the grid mirrors the keyboard
  const frag = document.createDocumentFragment();
  for (let midi = MIDI_HIGH; midi >= MIDI_LOW; midi--) {
    if (isBlack(midi)) {
      const div = document.createElement('div');
      div.className = 'grid-row-black';
      div.style.top    = (MIDI_HIGH - midi) * CELL_H + 'px';
      div.style.height = CELL_H + 'px';
      frag.appendChild(div);
    }
  }
  elPrGrid.appendChild(frag);
}

/* ═══════════════════════════════════════════════════════
   Grid click  — add / remove note
═══════════════════════════════════════════════════════ */

function onGridClick(e) {
  if (e.target.classList.contains('note-block')) return; // handled by note click
  // getBoundingClientRect already accounts for parent scroll, so no need to add scrollLeft/Top
  const rect = elPrGrid.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;

  const beatRaw     = x / PX_PER_BEAT;
  const snappedBeat = Math.floor(beatRaw / STEP_SIZE) * STEP_SIZE;
  const midiRow     = Math.floor(y / CELL_H);
  const midi        = MIDI_HIGH - midiRow;

  if (midi < MIDI_LOW || midi > MIDI_HIGH) return;
  if (snappedBeat < 0 || snappedBeat >= TOTAL_BEATS) return;

  const track = song.tracks[selectedTrack];
  const existing = track.notes.findIndex(n =>
    n.midi === midi &&
    snappedBeat >= n.t &&
    snappedBeat < n.t + n.dur
  );

  if (existing >= 0) {
    track.notes.splice(existing, 1);
  } else {
    track.notes.push({ t: snappedBeat, dur: STEP_SIZE, midi });
  }

  renderNotes();
  saveSong();
}

/* ═══════════════════════════════════════════════════════
   Render
═══════════════════════════════════════════════════════ */

function renderAll() {
  elBpm.value = song.bpm;
  renderTracks();
  renderNotes();
  renderPlayhead(-1);
}

function renderTracks() {
  elTracksPanel.innerHTML = '';

  const label = document.createElement('div');
  label.className = 'panel-section-label';
  label.textContent = 'Tracks & Mixer';
  elTracksPanel.appendChild(label);

  song.tracks.forEach((track, i) => {
    const sel = (i === selectedTrack);

    const item = document.createElement('div');
    item.className = 'track-item' + (sel ? ' selected' : '');

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'track-header';
    hdr.innerHTML = `
      <div class="track-sel-dot"></div>
      <span class="track-name">${escHtml(track.name)}</span>
    `;
    hdr.addEventListener('click', () => {
      selectedTrack = i;
      renderTracks();
      renderNotes();
    });

    // Controls
    const ctrls = document.createElement('div');
    ctrls.className = 'track-controls';

    // Gain row
    const gainRow = document.createElement('div');
    gainRow.className = 'ctrl-row';
    const gainId = `gain-${i}`;
    gainRow.innerHTML = `
      <label class="ctrl-label" for="${gainId}">Gain</label>
      <input type="range" id="${gainId}" min="0" max="1" step="0.01"
             value="${track.gain}">
      <span class="ctrl-val" id="gain-val-${i}">${pct(track.gain)}</span>
    `;
    gainRow.querySelector('input').addEventListener('input', function () {
      song.tracks[i].gain = parseFloat(this.value);
      document.getElementById('gain-val-' + i).textContent = pct(this.value);
      saveSong();
    });

    // Wave row
    const waveRow = document.createElement('div');
    waveRow.className = 'ctrl-row';
    waveRow.innerHTML = `
      <span class="ctrl-label">Wave</span>
      <select>
        ${['sine','square','sawtooth','triangle'].map(w =>
          `<option value="${w}"${track.wave === w ? ' selected' : ''}>${cap(w)}</option>`
        ).join('')}
      </select>
    `;
    waveRow.querySelector('select').addEventListener('change', function () {
      song.tracks[i].wave = this.value;
      saveSong();
    });

    ctrls.appendChild(gainRow);
    ctrls.appendChild(waveRow);
    item.appendChild(hdr);
    item.appendChild(ctrls);
    elTracksPanel.appendChild(item);
  });
}

function renderNotes() {
  // Remove existing note blocks (not background rows)
  elPrGrid.querySelectorAll('.note-block').forEach(n => n.remove());

  const track = song.tracks[selectedTrack];
  const frag  = document.createDocumentFragment();

  for (const note of track.notes) {
    if (note.t >= TOTAL_BEATS || note.t + note.dur <= 0) continue;
    if (note.midi > MIDI_HIGH || note.midi < MIDI_LOW) continue;

    const x = note.t * PX_PER_BEAT;
    const y = (MIDI_HIGH - note.midi) * CELL_H;
    const w = Math.min(note.dur * PX_PER_BEAT - 2, GRID_W - x - 1);
    const h = CELL_H - 2;

    const div = document.createElement('div');
    div.className = 'note-block';
    div.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(w,3)}px;height:${h}px`;

    // Click on note block removes it
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = track.notes.indexOf(note);
      if (idx >= 0) track.notes.splice(idx, 1);
      renderNotes();
      saveSong();
    });

    frag.appendChild(div);
  }

  elPrGrid.appendChild(frag);
}

function renderPlayhead(beat) {
  if (beat < 0) {
    elPlayhead.style.display = 'none';
    return;
  }
  const x = beat * PX_PER_BEAT;
  elPlayhead.style.display = 'block';
  elPlayhead.style.left    = x + 'px';

  // Auto-scroll to keep playhead in view
  const margin = 80;
  const right  = elPrOuter.scrollLeft + elPrOuter.clientWidth;
  if (x > right - margin) {
    elPrOuter.scrollLeft = x - margin;
  }
}

/* ═══════════════════════════════════════════════════════
   Playback controls
═══════════════════════════════════════════════════════ */

elPlayBtn.addEventListener('click', () => {
  if (engine.playing) return;
  elPlayBtn.disabled = true;
  elStopBtn.disabled = false;
  elBpm.disabled = true;

  engine.start(song, TOTAL_BEATS, (beat) => {
    if (beat < 0) {
      elPlayBtn.disabled = false;
      elStopBtn.disabled = true;
      elBpm.disabled = false;
      renderPlayhead(-1);
    } else {
      renderPlayhead(beat);
    }
  });
});

elStopBtn.addEventListener('click', () => {
  engine.stop(); // triggers onTick(-1) which resets buttons
});

elBpm.addEventListener('change', () => {
  if (engine.playing) { elBpm.value = song.bpm; return; }
  const v = parseInt(elBpm.value, 10);
  if (v >= 20 && v <= 300) {
    song.bpm = v;
    saveSong();
  } else {
    elBpm.value = song.bpm;
  }
});

/* ═══════════════════════════════════════════════════════
   Export / Import JSON
═══════════════════════════════════════════════════════ */

elExportBtn.addEventListener('click', () => {
  const json = JSON.stringify(song, (k, v) => {
    // strip internal flags like _scheduled
    if (typeof k === 'string' && k.startsWith('_')) return undefined;
    return v;
  }, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: 'audio-tracker-song.json'
  });
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Exported ✓');
});

elImportBtn.addEventListener('click', () => elImportFile.click());

elImportFile.addEventListener('change', () => {
  const file = elImportFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (typeof imported.bpm !== 'number' || !Array.isArray(imported.tracks)) {
        throw new Error('Invalid song format');
      }
      if (engine.playing) engine.stop();
      song = imported;
      saveSong();
      selectedTrack = 0;
      renderAll();
      setStatus('Imported: ' + file.name);
    } catch (err) {
      setStatus('Import failed — ' + err.message, true);
    }
  };
  reader.readAsText(file);
  elImportFile.value = '';
});

/* ═══════════════════════════════════════════════════════
   Reset
═══════════════════════════════════════════════════════ */

elResetBtn.addEventListener('click', () => {
  if (!confirm('Reset to seed song? All changes will be lost.')) return;
  if (engine.playing) engine.stop();
  localStorage.removeItem(STORAGE_KEY);
  song = deepClone(SEED_SONG);
  selectedTrack = 0;
  setHash('seed');
  renderAll();
  setStatus('Reset to seed song.');
});

/* ═══════════════════════════════════════════════════════
   Status bar
═══════════════════════════════════════════════════════ */

let _statusTimer;
function setStatus(msg, isErr = false) {
  elStatus.textContent = msg;
  elStatus.className   = 'status-msg' + (isErr ? ' err' : '');
  clearTimeout(_statusTimer);
  _statusTimer = setTimeout(() => { elStatus.textContent = ''; }, 3500);
}

/* ═══════════════════════════════════════════════════════
   Tiny utils
═══════════════════════════════════════════════════════ */

function pct(v)   { return Math.round(parseFloat(v) * 100) + '%'; }
function cap(s)   { return s.charAt(0).toUpperCase() + s.slice(1); }
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ═══════════════════════════════════════════════════════
   Boot
═══════════════════════════════════════════════════════ */

init();
