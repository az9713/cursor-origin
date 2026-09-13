'use strict';
/* ── Calendar Engine — Drag & drop ──────────────────────────────────────────
   Uses the HTML5 Drag & Drop API.

   Month view:  drag event-chip → drop on month-cell  (moves the date)
   Week/Day:    drag week-event → drop on time-slot   (moves date + time)

   For recurring events, shows a confirmation dialog ("this" vs "all").
──────────────────────────────────────────────────────────────────────────── */

// ── Drag state ─────────────────────────────────────────────────────────────

let _drag = null;
/*
  _drag = {
    eventId:   string,
    occKey:    string,
    startISO:  string,
    endISO:    string,
    isRecurring: boolean,
    sourceEl:  HTMLElement,
    slotOffset: number,   // slot offset within the event where drag started (week/day only)
  }
*/

// ── Setup (called once from app.js after each render) ─────────────────────

/**
 * Attach drag listeners to all draggable event elements and drop targets
 * in `container`.  Call this after every render.
 * @param {HTMLElement} container
 * @param {string}      view        'month' | 'week' | 'day'
 * @param {string}      displayTz
 */
function setupDrag(container, view, displayTz) {
  // ── Draggable event sources ────────────────────────────────────────
  container.querySelectorAll('[data-occ-key]').forEach(el => {
    el.addEventListener('dragstart', e => onDragStart(e, view, displayTz));
    el.addEventListener('dragend',   e => onDragEnd(e));
  });

  // ── Drop targets ──────────────────────────────────────────────────
  if (view === 'month') {
    container.querySelectorAll('.month-cell').forEach(el => {
      el.addEventListener('dragover',  onDragOverMonth);
      el.addEventListener('dragleave', onDragLeaveMonth);
      el.addEventListener('drop',      e => onDropMonth(e, displayTz));
    });
  } else {
    container.querySelectorAll('.time-slot').forEach(el => {
      el.addEventListener('dragover',  onDragOverSlot);
      el.addEventListener('dragleave', onDragLeaveSlot);
      el.addEventListener('drop',      e => onDropSlot(e, displayTz));
    });
  }
}

// ── Drag start ─────────────────────────────────────────────────────────────

function onDragStart(e, view, displayTz) {
  const el = e.currentTarget;
  _drag = {
    eventId:     el.dataset.eventId,
    occKey:      el.dataset.occKey,
    startISO:    null,
    endISO:      null,
    isRecurring: false,
    sourceEl:    el,
    slotOffset:  0,
  };

  // Look up the occurrence from the live events
  const ev = getEvents().find(ev => ev.id === _drag.eventId);
  if (!ev) { _drag = null; return; }

  // Determine which occurrence this is (by occKey index)
  // For a non-recurring event, just use its stored times
  if (!ev.rrule) {
    _drag.startISO    = ev.startISO;
    _drag.endISO      = ev.endISO;
    _drag.isRecurring = false;
  } else {
    // el.dataset.occStart is set by render.js to the occurrence's actual startISO
    _drag.startISO    = el.dataset.occStart || ev.startISO;
    _drag.endISO      = ev.endISO;  // duration calculated from base; will be overridden
    _drag.isRecurring = true;
  }

  // For week/day: compute which slot within the event was grabbed
  if ((view === 'week' || view === 'day') && el.classList.contains('week-event')) {
    const rect  = el.getBoundingClientRect();
    const yOff  = e.clientY - rect.top;          // pixels from top of event
    _drag.slotOffset = Math.floor(yOff / SLOT_H); // number of 30-min slots from top of event
  }

  el.classList.add('dragging');

  // Transfer payload
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({
    eventId:     _drag.eventId,
    startISO:    _drag.startISO,
    isRecurring: _drag.isRecurring,
  }));
}

function onDragEnd(e) {
  if (_drag && _drag.sourceEl) {
    _drag.sourceEl.classList.remove('dragging');
  }
  // Clear drag-over highlights
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  _drag = null;
}

// ── Month: drop on day cell ────────────────────────────────────────────────

function onDragOverMonth(e) {
  if (!_drag) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeaveMonth(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDropMonth(e, displayTz) {
  e.preventDefault();
  const cell = e.currentTarget;
  cell.classList.remove('drag-over');
  if (!_drag) return;

  const targetDateStr = cell.dataset.date; // "YYYY-MM-DD"
  if (!targetDateStr) return;

  const ev = getEvents().find(ev => ev.id === _drag.eventId);
  if (!ev) return;

  // Duration from base event
  const sMs = new Date(ev.startISO).getTime();
  const eMs = new Date(ev.endISO).getTime();
  const dur = eMs - sMs;
  // Wall-clock time comes from the specific occurrence (may differ from base after DST)
  const occSMs = new Date(_drag.startISO || ev.startISO).getTime();

  // Keep same wall-clock time, change date
  const evTz  = ev.tz || displayTz;
  const sLp   = getLocalParts(occSMs, evTz);
  const [ty, tm, td] = targetDateStr.split('-').map(Number);
  const newSMs = localToUTC(ty, tm, td, sLp.hour, sLp.minute, sLp.second, evTz);
  const newEMs = newSMs + dur;

  const newStartISO = new Date(newSMs).toISOString();
  const newEndISO   = new Date(newEMs).toISOString();

  applyMove(ev, _drag.startISO, newStartISO, newEndISO, displayTz);
}

// ── Week/Day: drop on time-slot ────────────────────────────────────────────

function onDragOverSlot(e) {
  if (!_drag) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeaveSlot(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDropSlot(e, displayTz) {
  e.preventDefault();
  const slot = e.currentTarget;
  slot.classList.remove('drag-over');
  if (!_drag) return;

  const targetDateStr = slot.dataset.date;  // "YYYY-MM-DD"
  const slotIdx       = parseInt(slot.dataset.slot, 10);  // 0–47
  if (!targetDateStr || isNaN(slotIdx)) return;

  const ev = getEvents().find(ev => ev.id === _drag.eventId);
  if (!ev) return;

  // Duration from base event
  const sMs = new Date(ev.startISO).getTime();
  const eMs = new Date(ev.endISO).getTime();
  const dur = eMs - sMs;

  // Compute new start time from drop slot, adjusted by where in the event we grabbed
  const evTz = ev.tz || displayTz;
  const adjSlotIdx = Math.max(0, slotIdx - _drag.slotOffset);
  const newHour    = Math.floor(adjSlotIdx / 2);
  const newMinute  = (adjSlotIdx % 2) * 30;

  const [ty, tm, td] = targetDateStr.split('-').map(Number);
  const newSMs = localToUTC(ty, tm, td, newHour, newMinute, 0, evTz);
  const newEMs = newSMs + dur;

  const newStartISO = new Date(newSMs).toISOString();
  const newEndISO   = new Date(newEMs).toISOString();

  applyMove(ev, _drag.startISO, newStartISO, newEndISO, displayTz);
}

// ── Move application ───────────────────────────────────────────────────────

/**
 * Apply a drag-move to an event.  For recurring events, shows the
 * "this / all" confirmation dialog.
 *
 * @param {object} ev           The base event object
 * @param {string} occStartISO  The occurrence's original startISO (for exdate)
 * @param {string} newStartISO
 * @param {string} newEndISO
 * @param {string} displayTz    (unused here, passed to confirm dialog)
 */
function applyMove(ev, occStartISO, newStartISO, newEndISO, displayTz) {
  if (!ev.rrule) {
    // Simple event — just move it
    updateEvent(ev.id, { startISO: newStartISO, endISO: newEndISO });
    if (window.CE_REFRESH) window.CE_REFRESH();
    return;
  }

  // Recurring — show confirmation
  const rc = document.getElementById('recur-confirm-overlay');
  document.getElementById('rc-event-name').textContent = ev.title;

  // Reset button labels (might have been changed by delete flow)
  document.getElementById('rc-this').textContent   = 'Edit this occurrence';
  document.getElementById('rc-all').textContent    = 'Edit all occurrences';

  const cleanup = () => {
    rc.classList.add('hidden');
  };

  const btnThis   = document.getElementById('rc-this');
  const btnAll    = document.getElementById('rc-all');
  const btnCancel = document.getElementById('rc-cancel-btn');

  // Clone to remove stale listeners
  const newBtnThis   = btnThis.cloneNode(true);
  const newBtnAll    = btnAll.cloneNode(true);
  const newBtnCancel = btnCancel.cloneNode(true);
  btnThis.replaceWith(newBtnThis);
  btnAll.replaceWith(newBtnAll);
  btnCancel.replaceWith(newBtnCancel);

  newBtnThis.addEventListener('click', () => {
    cleanup();
    // Add exdate for the dragged occurrence's date, create standalone override
    addExdate(ev.id, occStartISO);  // occStartISO = _drag.startISO passed in
    addEvent({
      title:    ev.title,
      startISO: newStartISO,
      endISO:   newEndISO,
      tz:       ev.tz,
      rrule:    '',
      exdates:  [],
      color:    ev.color,
    });
    if (window.CE_REFRESH) window.CE_REFRESH();
  }, { once: true });

  newBtnAll.addEventListener('click', () => {
    cleanup();
    // Shift the base event's start/end, keeping the duration
    const origSMs = new Date(ev.startISO).getTime();
    const newSMs  = new Date(newStartISO).getTime();
    const delta   = newSMs - origSMs;
    const newBaseEnd = new Date(new Date(ev.endISO).getTime() + delta).toISOString();
    updateEvent(ev.id, { startISO: newStartISO, endISO: newBaseEnd });
    if (window.CE_REFRESH) window.CE_REFRESH();
  }, { once: true });

  newBtnCancel.addEventListener('click', () => {
    cleanup();
    if (window.CE_REFRESH) window.CE_REFRESH(); // restore drag source
  }, { once: true });

  rc.classList.remove('hidden');
}

// ── Attach occ-start to week-event elements so drag can recover it ─────────
// Called from render.js indirectly — we patch makeWeekEvent to store the ISO.
// We add it here as a post-render step called from app.js.

/**
 * No-op: occStart is already set by render.js on each .week-event element.
 * Kept as a hook for future enhancements.
 */
function annotateWeekEvents(container, displayTz) {
  // render.js sets el.dataset.occStart = occ.startISO for every event element.
  // Nothing else to do here.
}
