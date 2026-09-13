'use strict';
// ── Workspace persistence ─────────────────────────────────────────────────────
// localStorage key: language-workbench-v1

const LS_KEY = 'language-workbench-v1';

const SEED_FILES = {
  'main.nit': `-- Entry point
use "math.nit";
use "io.nit";

fn main() {
  let x = add(2, 3);
  let y = mul(x, 4);
  print(y);
  let msg = prompt("Value: ");
  return y;
}
`,

  'math.nit': `-- Math utilities

fn add(a, b) {
  return a + b;
}

fn mul(a, b) {
  return a * b;
}

fn square(n) {
  return mul(n, n);
}
`,

  'io.nit': `-- I/O helpers

fn print(val) {
  return val;
}

fn prompt(msg) {
  return msg;
}

fn format(prefix, val) {
  return prefix;
}
`
};

function loadWS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.files && typeof d.files === 'object') return d;
    }
  } catch (_) {}
  return null;
}

function saveWS(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      files:      state.files,
      openFiles:  state.openFiles,
      activeFile: state.activeFile
    }));
  } catch (_) {}
}

function resetWS() {
  const s = {
    files:      Object.assign({}, SEED_FILES),
    openFiles:  ['main.nit'],
    activeFile: 'main.nit'
  };
  saveWS(s);
  return s;
}

function initWS() {
  return loadWS() || resetWS();
}
