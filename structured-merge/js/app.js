import { threeWayDiff, buildResult, setAtPath, deleteAtPath } from './diff.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Fixture 1 — "feature-flags" (nested object)
 *   Auto-merges : version (ours), flags.beta (theirs), team (theirs)
 *   Conflict    : flags.darkMode  (ours=true  vs  theirs='auto')
 *
 * Fixture 2 — "todo-list" (array element changes)
 *   Auto-merges : items[1].done (ours), items[2].text (theirs)
 *   Conflict    : status  (ours='review'  vs  theirs='done')
 */
const FIXTURES = {
  'feature-flags': {
    label: 'Feature Flags (nested object)',
    base: {
      app: 'launcher',
      flags: { darkMode: false, beta: false, analytics: true },
      team: 'platform',
      version: 3,
    },
    ours: {
      app: 'launcher',
      flags: { darkMode: true, beta: false, analytics: true },
      team: 'platform',
      version: 4,
    },
    theirs: {
      app: 'launcher',
      flags: { darkMode: 'auto', beta: true, analytics: true },
      team: 'growth',
      version: 3,
    },
  },

  'todo-list': {
    label: 'Todo List (array changes)',
    base: {
      title: 'Sprint 3',
      status: 'active',
      items: [
        { id: 1, text: 'Write tests',  done: true  },
        { id: 2, text: 'Fix bug',      done: false },
        { id: 3, text: 'Deploy',       done: false },
      ],
    },
    ours: {
      title: 'Sprint 3',
      status: 'review',
      items: [
        { id: 1, text: 'Write tests',  done: true  },
        { id: 2, text: 'Fix bug',      done: true  },   // ours marks done
        { id: 3, text: 'Deploy',       done: false },
      ],
    },
    theirs: {
      title: 'Sprint 3',
      status: 'done',
      items: [
        { id: 1, text: 'Write tests',   done: true  },
        { id: 2, text: 'Fix bug',       done: false },
        { id: 3, text: 'Deploy to prod', done: false }, // theirs renames task
      ],
    },
  },
};

// ─── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'structured-merge-v1';

/** @type {{ fixtureId: string|null, pendingMap: Object, result: object|null, autoHunks: Array, stash: Object }} */
let state = {
  fixtureId:  null,
  pendingMap: {},   // { [hunkId]: Hunk }  — remaining (unresolved) conflicts
  result:     null,
  autoHunks:  [],   // serialisable summary of auto-applied hunks (for display)
  stash:      {},   // per-fixture progress so switching does not drop resolutions
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (_) { /* ignore corrupt storage */ }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── Hash routing ──────────────────────────────────────────────────────────────

function getHashFixture() {
  const m = location.hash.match(/^#\/f\/(.+)$/);
  return m ? m[1] : null;
}

function setHash(id) {
  history.replaceState(null, '', `#/f/${id}`);
}

// ─── DOM refs ──────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const fixtureSelect   = $('fixture-select');
const paneBase        = $('pane-base');
const paneOurs        = $('pane-ours');
const paneTheirs      = $('pane-theirs');
const paneResult      = $('pane-result');
const conflictList    = $('conflict-list');
const autoList        = $('auto-list');
const conflictBadge   = $('conflict-badge');
const autoBadge       = $('auto-badge');
const pillConflict    = $('conflict-pill');
const pillCount       = $('pill-count');
const btnExport       = $('btn-export');
const btnReset        = $('btn-reset');

// ─── Render helpers ────────────────────────────────────────────────────────────

const fmt       = v => JSON.stringify(v, null, 2);
const fmtInline = v => (v === undefined ? 'undefined' : JSON.stringify(v));

function renderPanes(fixture) {
  paneBase.textContent   = fmt(fixture.base);
  paneOurs.textContent   = fmt(fixture.ours);
  paneTheirs.textContent = fmt(fixture.theirs);
}

function renderResult() {
  paneResult.textContent = fmt(state.result);
}

function renderAutoMerged() {
  const list = state.autoHunks ?? [];
  autoBadge.textContent = list.length;
  autoList.innerHTML    = '';

  if (list.length === 0) {
    autoList.innerHTML = '<p class="empty-note">No auto-merged changes.</p>';
    return;
  }

  for (const h of list) {
    const row = document.createElement('div');
    row.className = 'auto-hunk';
    row.innerHTML = `
      <span class="hunk-path" title="${h.pathStr}">${h.pathStr}</span>
      <span class="hunk-kind kind-${h.kind}">${h.kind}</span>
      <span class="hunk-side side-${h.side}">${h.side}</span>
      <code class="hunk-val" title="${fmtInline(h.val)}">${fmtInline(h.val)}</code>
    `;
    autoList.appendChild(row);
  }
}

function renderConflicts() {
  const pending = Object.values(state.pendingMap);
  const count   = pending.length;

  conflictBadge.textContent = count;
  pillCount.textContent     = count;

  // Toggle header pill style
  if (count === 0) {
    pillConflict.classList.add('pill-clear');
  } else {
    pillConflict.classList.remove('pill-clear');
  }

  conflictList.innerHTML = '';

  if (count === 0) {
    conflictList.innerHTML = '<p class="empty-note resolved-note">All conflicts resolved ✓</p>';
    return;
  }

  for (const h of pending) {
    const card = document.createElement('div');
    card.className = 'conflict-card';
    card.dataset.id = h.id;
    card.innerHTML = `
      <div class="cc-header">
        <span class="cc-path">${h.pathStr}</span>
        <span class="cc-badge">conflict</span>
      </div>
      <div class="cc-values">
        <div class="cv-col cv-base">
          <div class="cv-lbl">Base</div>
          <code>${fmtInline(h.baseVal)}</code>
        </div>
        <div class="cv-col cv-ours">
          <div class="cv-lbl">Ours</div>
          <code>${fmtInline(h.oursVal)}</code>
        </div>
        <div class="cv-col cv-theirs">
          <div class="cv-lbl">Theirs</div>
          <code>${fmtInline(h.theirsVal)}</code>
        </div>
      </div>
      <div class="cc-actions">
        <button class="btn-accept btn-accept-ours"   data-id="${h.id}" data-side="ours">✓ Accept Ours</button>
        <button class="btn-accept btn-accept-theirs" data-id="${h.id}" data-side="theirs">✓ Accept Theirs</button>
      </div>
    `;
    conflictList.appendChild(card);
  }

  // Wire accept buttons
  conflictList.querySelectorAll('.btn-accept').forEach(btn => {
    btn.addEventListener('click', () => acceptConflict(btn.dataset.id, btn.dataset.side));
  });
}

function renderAll(fixture) {
  renderPanes(fixture);
  renderAutoMerged();
  renderConflicts();
  renderResult();
  if (fixtureSelect) fixtureSelect.value = state.fixtureId;
}

// ─── Fixture loading ───────────────────────────────────────────────────────────

/**
 * Load a fixture. If the same fixture is already loaded and forceReset=false,
 * restore from persisted state instead of re-running the diff.
 */
function snapshotFixture(id) {
  if (!id) return;
  state.stash = state.stash || {};
  state.stash[id] = {
    pendingMap: state.pendingMap,
    result:     state.result,
    autoHunks:  state.autoHunks,
  };
}

function loadFixture(fixtureId, forceReset = false) {
  const fixture = FIXTURES[fixtureId];
  if (!fixture) return;

  const isSame = state.fixtureId === fixtureId;

  if (!forceReset && isSame && state.result !== null) {
    // Restore saved merge progress — just re-render
    setHash(fixtureId);
    renderAll(fixture);
    return;
  }

  if (!forceReset && state.fixtureId && state.fixtureId !== fixtureId) {
    snapshotFixture(state.fixtureId);
  }

  if (!forceReset && state.stash?.[fixtureId]?.result != null) {
    const saved = state.stash[fixtureId];
    state.fixtureId  = fixtureId;
    state.pendingMap = saved.pendingMap || {};
    state.result     = saved.result;
    state.autoHunks  = saved.autoHunks || [];
    saveState();
    setHash(fixtureId);
    renderAll(fixture);
    return;
  }

  // ── Fresh diff ──────────────────────────────────────────
  if (forceReset) {
    state.stash = state.stash || {};
    delete state.stash[fixtureId];
  }

  const hunks = threeWayDiff(fixture.base, fixture.ours, fixture.theirs);
  const { result, pending } = buildResult(fixture.base, hunks);

  state.fixtureId  = fixtureId;
  state.result     = result;
  state.pendingMap = Object.fromEntries(pending.entries());

  // Compact summary of auto-merged hunks (serialisable)
  state.autoHunks = hunks
    .filter(h => h.kind !== 'conflict')
    .map(h => ({
      id:      h.id,
      pathStr: h.pathStr,
      kind:    h.kind,
      side:    h.side,
      // Store null explicitly for 'remove' (undefined is not JSON-serialisable)
      val:     h.side === 'ours'
                 ? (h.oursVal   !== undefined ? h.oursVal   : null)
                 : (h.theirsVal !== undefined ? h.theirsVal : null),
    }));

  saveState();
  setHash(fixtureId);
  renderAll(fixture);
}

// ─── Accept conflict ───────────────────────────────────────────────────────────

function acceptConflict(id, side) {
  const h = state.pendingMap[id];
  if (!h) return;

  const val = side === 'ours' ? h.oursVal : h.theirsVal;
  if (val === undefined) {
    deleteAtPath(state.result, h.path);
  } else {
    setAtPath(state.result, h.path, val);
  }

  delete state.pendingMap[id];
  snapshotFixture(state.fixtureId);
  saveState();

  // Animate card out then remove
  const card = conflictList.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.classList.add('resolving');
    setTimeout(() => {
      card.remove();
      // If last conflict resolved, show resolved note
      if (Object.keys(state.pendingMap).length === 0) {
        conflictList.innerHTML = '<p class="empty-note resolved-note">All conflicts resolved ✓</p>';
      }
    }, 320);
  }

  // Update counts immediately
  const remaining = Object.keys(state.pendingMap).length;
  conflictBadge.textContent = remaining;
  pillCount.textContent     = remaining;
  if (remaining === 0) pillConflict.classList.add('pill-clear');

  renderResult();
}

// ─── Export ────────────────────────────────────────────────────────────────────

function exportResult() {
  const json = fmt(state.result);

  // Guard: result should always be valid, but be safe
  try { JSON.parse(json); }
  catch (_) { alert('Result is not valid JSON — this is a bug!'); return; }

  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `${state.fixtureId ?? 'merge'}-result.json`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Init ──────────────────────────────────────────────────────────────────────

function init() {
  loadState();

  // Populate fixture <select>
  for (const [id, f] of Object.entries(FIXTURES)) {
    const opt = Object.assign(document.createElement('option'), {
      value:       id,
      textContent: f.label,
    });
    fixtureSelect.appendChild(opt);
  }

  // Resolve start fixture: hash → saved → first
  const hashId  = getHashFixture();
  const startId = FIXTURES[hashId]          ? hashId
                : FIXTURES[state.fixtureId] ? state.fixtureId
                : Object.keys(FIXTURES)[0];

  loadFixture(startId);

  // Events
  fixtureSelect.addEventListener('change', () => loadFixture(fixtureSelect.value));
  btnExport.addEventListener('click', exportResult);
  btnReset.addEventListener('click',  () => loadFixture(state.fixtureId, true));
  window.addEventListener('hashchange', () => {
    const id = getHashFixture();
    if (id && id !== state.fixtureId) loadFixture(id);
  });
}

document.addEventListener('DOMContentLoaded', init);
