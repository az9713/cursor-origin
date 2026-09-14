'use strict';
/* ── Calendar Engine — Main application ─────────────────────────────────────
   Entry point.  Initialises state, wires up all event listeners,
   manages hash routing (#/d/YYYY-MM-DD), and calls render.js view functions.

   Global state is kept in window.CE_STATE so modal.js + drag.js can read it.
──────────────────────────────────────────────────────────────────────────── */

(function () {

  // ── State ────────────────────────────────────────────────────────────────

  window.CE_STATE = {
    view:       'month',                   // 'month' | 'week' | 'day'
    focusDate:  dayFloor(new Date()),      // current nav anchor (local midnight)
    displayTz:  'America/Los_Angeles',     // timezone used for display
  };

  const S = window.CE_STATE;

  // ── DOM refs ─────────────────────────────────────────────────────────────

  const root        = document.getElementById('calendar-root');
  const dateLabel   = document.getElementById('date-label');
  const tzPicker    = document.getElementById('tz-picker');
  const fileInput   = document.getElementById('file-input');

  // ── Init ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    initEvents();     // seed localStorage if first run
    initModal();      // wire modal DOM listeners

    // Parse hash for initial date
    applyHash(window.location.hash);

    // Toolbar: view buttons
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });

    // Date navigation
    document.getElementById('btn-prev').addEventListener('click',  () => navigate(-1));
    document.getElementById('btn-next').addEventListener('click',  () => navigate(+1));
    document.getElementById('btn-today').addEventListener('click', goToday);

    // Timezone
    tzPicker.value = S.displayTz;
    tzPicker.addEventListener('change', () => {
      S.displayTz = tzPicker.value;
      refresh();
    });

    // Export / Import / Reset
    document.getElementById('btn-export').addEventListener('click', () => {
      downloadICS(getEvents());
    });
    document.getElementById('btn-import').addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const imported = await readAndImportICS(file);
        imported.forEach(ev => addEvent(ev));
        alert(`Imported ${imported.length} event(s).`);
        refresh();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
      fileInput.value = '';
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('Reset to seed events? This will delete all your events.')) {
        resetToSeed();
        refresh();
      }
    });

    // Calendar root: click delegation for slots and event chips
    root.addEventListener('click', onRootClick);

    // Hash changes (browser back/fwd or external link)
    window.addEventListener('hashchange', () => applyHash(window.location.hash));

    // Expose refresh globally for modal + drag
    window.CE_REFRESH = refresh;

    // Initial render
    refresh();
  });

  // ── Routing ───────────────────────────────────────────────────────────────

  /**
   * Parse #/d/YYYY-MM-DD from the URL hash and set focusDate accordingly.
   */
  function applyHash(hash) {
    const m = hash.match(/#\/d\/(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const [y, mo, d] = m[1].split('-').map(Number);
      S.focusDate = new Date(y, mo - 1, d);
    }
    refresh();
  }

  /**
   * Update the URL hash without causing a hashchange event loop.
   */
  function pushHash(date) {
    const str = '#/d/' + toDateStr(date);
    if (window.location.hash !== str) {
      history.replaceState(null, '', str);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function navigate(dir) {
    S.focusDate = (dir < 0 ? prevFocus : nextFocus)(S.view, S.focusDate);
    refresh();
  }

  function goToday() {
    S.focusDate = dayFloor(new Date());
    refresh();
  }

  function setView(view) {
    S.view = view;
    // Update toolbar active state
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    refresh();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function refresh() {
    const { view, focusDate, displayTz } = S;

    // Update active button
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Render the appropriate view
    let result;
    if (view === 'month') {
      result = renderMonth(focusDate, displayTz, root);
    } else if (view === 'week') {
      result = renderWeek(focusDate, displayTz, root);
    } else {
      result = renderDay(focusDate, displayTz, root);
    }

    // Update date label
    dateLabel.textContent = result.label;

    // Push hash
    pushHash(focusDate);

    // Attach drag handlers
    setupDrag(root, view, displayTz);
    if (view !== 'month') annotateWeekEvents(root, displayTz);
  }

  // ── Click handling (delegated on root) ────────────────────────────────────

  function onRootClick(e) {
    // Ignore if inside modal
    if (e.target.closest('#modal-overlay') || e.target.closest('#recur-confirm-overlay')) return;

    // Click on event chip (month)
    const chip = e.target.closest('.event-chip');
    if (chip) {
      e.stopPropagation();
      const eventId   = chip.dataset.eventId;
      const occStart  = chip.dataset.occStart || null;
      openEditModal(eventId, occStart);
      return;
    }

    // Click on week-event
    const wev = e.target.closest('.week-event');
    if (wev) {
      e.stopPropagation();
      const eventId  = wev.dataset.eventId;
      const occStart = wev.dataset.occStart || null;
      openEditModal(eventId, occStart);
      return;
    }

    // Click on month-cell (empty area)
    const cell = e.target.closest('.month-cell');
    if (cell && S.view === 'month') {
      const dateStr = cell.dataset.date;
      if (dateStr) {
        openCreateModal({ date: dateStr, hour: 9, minute: 0, tz: S.displayTz });
      }
      return;
    }

    // Click on week-col-header → switch to day view
    const hdr = e.target.closest('.week-col-header');
    if (hdr && hdr.dataset.date) {
      const [y, m, d] = hdr.dataset.date.split('-').map(Number);
      S.focusDate = new Date(y, m - 1, d);
      setView('day');
      return;
    }

    // Click on time-slot (week/day) → create event at that time
    const slot = e.target.closest('.time-slot');
    if (slot && (S.view === 'week' || S.view === 'day')) {
      // Check that click was NOT on an event element
      if (!e.target.closest('.week-event')) {
        const dateStr = slot.dataset.date;
        const slotIdx = parseInt(slot.dataset.slot, 10);
        const hour    = Math.floor(slotIdx / 2);
        const minute  = (slotIdx % 2) * 30;
        if (dateStr) {
          openCreateModal({ date: dateStr, hour, minute, tz: S.displayTz });
        }
      }
    }
  }

})();
