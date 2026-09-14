'use strict';
/* ── Calendar Engine — Create / Edit modal ──────────────────────────────────
   openCreateModal(defaults) — opens modal for a new event
   openEditModal(eventId, occStartISO) — opens modal to edit an existing event
   closeModal() — close without saving

   The modal reads/writes event data via data.js CRUD.
   After save or delete it calls window.CE_REFRESH() to re-render.
──────────────────────────────────────────────────────────────────────────── */

// ── DOM refs (set once on DOMContentLoaded) ────────────────────────────────
let modal, overlay, form;
let fTitle, fStartDate, fStartTime, fEndDate, fEndTime, fTz, fFreq;
let fInterval, fIntervalUnit, fEnds, fCount, fUntil, fByMonthDay;
let rruleSection, bydayRow, byMonthdayRow, countRow, untilRow;
let btnDelete, modalHeading;

// State for current edit session
let _editingId       = null;  // event id being edited (null = create)
let _editingOccISO   = null;  // occurrence ISO when editing a recurring instance

function initModal() {
  overlay      = document.getElementById('modal-overlay');
  modal        = document.getElementById('modal-card');
  form         = document.getElementById('event-form');
  fTitle       = document.getElementById('ev-title');
  fStartDate   = document.getElementById('ev-start-date');
  fStartTime   = document.getElementById('ev-start-time');
  fEndDate     = document.getElementById('ev-end-date');
  fEndTime     = document.getElementById('ev-end-time');
  fTz          = document.getElementById('ev-tz');
  fFreq        = document.getElementById('ev-freq');
  fInterval    = document.getElementById('ev-interval');
  fIntervalUnit = document.getElementById('ev-interval-unit');
  fEnds        = document.getElementById('ev-ends');
  fCount       = document.getElementById('ev-count');
  fUntil       = document.getElementById('ev-until');
  rruleSection    = document.getElementById('rrule-section');
  bydayRow        = document.getElementById('byday-row');
  byMonthdayRow   = document.getElementById('bymonthday-row');
  countRow        = document.getElementById('count-row');
  untilRow        = document.getElementById('until-row');
  fByMonthDay     = document.getElementById('ev-bymonthday');
  btnDelete    = document.getElementById('btn-delete-ev');
  modalHeading = document.getElementById('modal-heading');

  // Freq change → show/hide rrule fields
  fFreq.addEventListener('change', onFreqChange);
  fEnds.addEventListener('change', onEndsChange);

  // Close button
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  // Overlay click → close
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // Cancel button
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

  // Delete button
  btnDelete.addEventListener('click', onDelete);

  // Form submit
  form.addEventListener('submit', onSave);

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
  });
}

// ── Visibility ─────────────────────────────────────────────────────────────

function openCreateModal(defaults = {}) {
  _editingId     = null;
  _editingOccISO = null;
  modalHeading.textContent = 'New Event';
  btnDelete.classList.add('hidden');

  const tz = defaults.tz || (window.CE_STATE && window.CE_STATE.displayTz) || 'America/Los_Angeles';

  // Default date/time
  const now = new Date();
  const defDate = defaults.date ? new Date(defaults.date + 'T00:00:00') : now;
  const defHour = defaults.hour !== undefined ? defaults.hour : now.getHours() + 1;
  const defMin  = defaults.minute !== undefined ? defaults.minute : 0;
  const defEnd  = new Date(defDate.getFullYear(), defDate.getMonth(), defDate.getDate(), defHour + 1, defMin);

  fTitle.value      = '';
  fStartDate.value  = toInputDate(defDate);
  fStartTime.value  = toInputTime(defHour, defMin);
  fEndDate.value    = toInputDate(defDate);
  fEndTime.value    = toInputTime(defEnd.getHours(), defEnd.getMinutes());
  fTz.value         = tz;
  fFreq.value       = '';
  fInterval.value   = '1';
  fEnds.value       = 'never';
  fUntil.value      = '';
  fCount.value      = '10';
  fByMonthDay.value = String(defDate.getDate()); // default to start date's day
  uncheckAllByday();
  onFreqChange();

  show();
  setTimeout(() => fTitle.focus(), 50);
}

function openEditModal(eventId, occStartISO) {
  const events = getEvents();
  const ev = events.find(e => e.id === eventId);
  if (!ev) return;

  _editingId     = eventId;
  _editingOccISO = occStartISO || null;
  modalHeading.textContent = ev._isRecurring || ev.rrule ? 'Edit Event' : 'Edit Event';
  btnDelete.classList.remove('hidden');

  const tz = ev.tz || 'America/Los_Angeles';
  const seriesStart = new Date(ev.startISO).getTime();
  const seriesEnd   = new Date(ev.endISO).getTime();
  const duration    = Number.isFinite(seriesEnd - seriesStart) ? seriesEnd - seriesStart : 0;
  const sMs = occStartISO ? new Date(occStartISO).getTime() : seriesStart;
  const eMs = (Number.isFinite(sMs) ? sMs : seriesStart) + duration;
  const sLp = getLocalParts(sMs, tz);
  const eLp = getLocalParts(eMs, tz);

  fTitle.value     = ev.title || '';
  fStartDate.value = padDate(sLp.year, sLp.month, sLp.day);
  fStartTime.value = padTime(sLp.hour, sLp.minute);
  fEndDate.value   = padDate(eLp.year, eLp.month, eLp.day);
  fEndTime.value   = padTime(eLp.hour, eLp.minute);
  fTz.value        = tz;

  // Parse RRULE
  const p = parseRRule(ev.rrule || '');
  fFreq.value     = p.FREQ || '';
  fInterval.value = p.INTERVAL || '1';
  uncheckAllByday();
  if (p.BYDAY) {
    p.BYDAY.split(',').forEach(d => {
      const cb = document.querySelector(`input[name="byday"][value="${d.trim().toUpperCase()}"]`);
      if (cb) cb.checked = true;
    });
  }
  // BYMONTHDAY: use explicit value, or default to start date's day-of-month
  fByMonthDay.value = p.BYMONTHDAY ? p.BYMONTHDAY.split(',')[0].trim() : String(sLp.day);
  if (p.UNTIL) {
    fEnds.value  = 'until';
    fUntil.value = icsDateToInputDate(p.UNTIL);
  } else if (p.COUNT) {
    fEnds.value  = 'count';
    fCount.value = p.COUNT;
  } else {
    fEnds.value = 'never';
  }

  onFreqChange();
  show();
  setTimeout(() => fTitle.focus(), 50);
}

function closeModal() {
  overlay.classList.add('hidden');
  _editingId     = null;
  _editingOccISO = null;
}

function show() {
  overlay.classList.remove('hidden');
}

// ── Dynamic field visibility ───────────────────────────────────────────────

function onFreqChange() {
  const freq = fFreq.value;
  const hasRRule = freq !== '';
  rruleSection.classList.toggle('hidden', !hasRRule);
  bydayRow.style.display      = freq === 'WEEKLY'  ? 'flex'  : 'none';
  byMonthdayRow.style.display = freq === 'MONTHLY' ? 'flex'  : 'none';
  fIntervalUnit.textContent   = freq === 'WEEKLY'  ? 'week(s)'
                              : freq === 'MONTHLY' ? 'month(s)'
                              : 'day(s)';
  // Auto-fill BYMONTHDAY from current start date when switching to Monthly
  if (freq === 'MONTHLY' && fStartDate.value) {
    const startDay = parseInt(fStartDate.value.split('-')[2], 10);
    if (!isNaN(startDay)) fByMonthDay.value = String(startDay);
  }
  onEndsChange();
}

function onEndsChange() {
  const ends = fEnds.value;
  countRow.classList.toggle('hidden', ends !== 'count');
  untilRow.classList.toggle('hidden', ends !== 'until');
}

// ── Save ───────────────────────────────────────────────────────────────────

function onSave(e) {
  e.preventDefault();

  const tz     = fTz.value || 'America/Los_Angeles';
  const title  = fTitle.value.trim() || 'Untitled';
  const rrule  = buildRRule();

  // Parse date+time inputs → UTC ISO
  const [sy, sm, sd] = fStartDate.value.split('-').map(Number);
  const [sh, smin]   = fStartTime.value.split(':').map(Number);
  const [ey, em, ed] = fEndDate.value.split('-').map(Number);
  const [eh, emin]   = fEndTime.value.split(':').map(Number);

  const startMs = localToUTC(sy, sm, sd, sh, smin, 0, tz);
  const endMs   = localToUTC(ey, em, ed, eh, emin, 0, tz);

  if (endMs <= startMs) {
    alert('End time must be after start time.');
    return;
  }

  const startISO = new Date(startMs).toISOString();
  const endISO   = new Date(endMs).toISOString();

  if (_editingId) {
    // Edit existing
    if (_editingOccISO && getEvents().find(e => e.id === _editingId)?.rrule) {
      // Recurring — confirm scope
      showRecurringEditConfirm({
        id: _editingId,
        occStartISO: _editingOccISO,
        title, startISO, endISO, tz, rrule,
      });
      closeModal();
      return;
    }
    updateEvent(_editingId, { title, startISO, endISO, tz, rrule, exdates: getEvents().find(e=>e.id===_editingId)?.exdates||[] });
  } else {
    addEvent({ title, startISO, endISO, tz, rrule, exdates: [] });
  }

  closeModal();
  if (window.CE_REFRESH) window.CE_REFRESH();
}

// ── Delete ─────────────────────────────────────────────────────────────────

function onDelete() {
  if (!_editingId) return;
  const ev = getEvents().find(e => e.id === _editingId);
  if (!ev) { closeModal(); return; }

  if (ev.rrule && _editingOccISO) {
    showRecurringDeleteConfirm(_editingId, _editingOccISO, ev.title);
  } else {
    if (confirm(`Delete "${ev.title}"?`)) {
      deleteEvent(_editingId);
      closeModal();
      if (window.CE_REFRESH) window.CE_REFRESH();
    }
  }
}

// ── Recurring action dialogs ───────────────────────────────────────────────

function showRecurringEditConfirm(payload) {
  const rc = document.getElementById('recur-confirm-overlay');
  document.getElementById('rc-event-name').textContent = payload.title;

  const btn1 = document.getElementById('rc-this');
  const btn2 = document.getElementById('rc-all');
  const btn3 = document.getElementById('rc-cancel-btn');

  const cleanup = () => {
    rc.classList.add('hidden');
    btn1.replaceWith(btn1.cloneNode(true));
    btn2.replaceWith(btn2.cloneNode(true));
  };

  document.getElementById('rc-this').addEventListener('click', function doThis() {
    cleanup();
    // Add exdate for original occurrence, create override event
    addExdate(payload.id, payload.occStartISO);
    const base = getEvents().find(e => e.id === payload.id);
    addEvent({
      title: payload.title,
      startISO: payload.startISO,
      endISO:   payload.endISO,
      tz:       payload.tz,
      rrule:    '',
      exdates:  [],
      color:    base ? base.color : undefined,
    });
    if (window.CE_REFRESH) window.CE_REFRESH();
  }, { once: true });

  document.getElementById('rc-all').addEventListener('click', function doAll() {
    cleanup();
    updateEvent(payload.id, {
      title:    payload.title,
      startISO: payload.startISO,
      endISO:   payload.endISO,
      tz:       payload.tz,
      rrule:    payload.rrule,
    });
    if (window.CE_REFRESH) window.CE_REFRESH();
  }, { once: true });

  document.getElementById('rc-cancel-btn').addEventListener('click', cleanup, { once: true });

  rc.classList.remove('hidden');
}

function showRecurringDeleteConfirm(id, occISO, title) {
  closeModal();
  const rc = document.getElementById('recur-confirm-overlay');
  document.getElementById('rc-event-name').textContent = title;
  // Repurpose buttons
  document.getElementById('rc-this').textContent   = 'Delete this occurrence';
  document.getElementById('rc-all').textContent    = 'Delete all occurrences';
  document.getElementById('rc-cancel-btn').textContent = 'Cancel';

  const cleanup = () => {
    rc.classList.add('hidden');
    // restore default labels
    document.getElementById('rc-this').textContent   = 'Edit this occurrence';
    document.getElementById('rc-all').textContent    = 'Edit all occurrences';
  };

  document.getElementById('rc-this').addEventListener('click', function() {
    cleanup();
    addExdate(id, occISO);
    if (window.CE_REFRESH) window.CE_REFRESH();
  }, { once: true });

  document.getElementById('rc-all').addEventListener('click', function() {
    cleanup();
    deleteEvent(id);
    if (window.CE_REFRESH) window.CE_REFRESH();
  }, { once: true });

  document.getElementById('rc-cancel-btn').addEventListener('click', cleanup, { once: true });

  rc.classList.remove('hidden');
}

// ── RRULE builder ──────────────────────────────────────────────────────────

function buildRRule() {
  const freq = fFreq.value;
  if (!freq) return '';

  let parts = ['FREQ=' + freq];
  const ivl = parseInt(fInterval.value, 10);
  if (ivl > 1) parts.push('INTERVAL=' + ivl);

  if (freq === 'WEEKLY') {
    const checked = [...document.querySelectorAll('input[name="byday"]:checked')]
      .map(cb => cb.value);
    if (checked.length > 0) parts.push('BYDAY=' + checked.join(','));
  }

  if (freq === 'MONTHLY') {
    const dom = parseInt(fByMonthDay.value, 10);
    if (dom >= 1 && dom <= 31) parts.push('BYMONTHDAY=' + dom);
  }

  const ends = fEnds.value;
  if (ends === 'count') {
    const cnt = parseInt(fCount.value, 10);
    if (cnt > 0) parts.push('COUNT=' + cnt);
  } else if (ends === 'until') {
    const ut = fUntil.value; // YYYY-MM-DD
    if (ut) {
      const [y, m, d] = ut.split('-').map(Number);
      parts.push('UNTIL=' + y + String(m).padStart(2,'0') + String(d).padStart(2,'0') + 'T235959Z');
    }
  }

  return parts.join(';');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toInputDate(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function toInputTime(h, m) {
  return String(h).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0');
}

function padDate(y, m, d) {
  return y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}

function padTime(h, m) {
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}

function icsDateToInputDate(icsStr) {
  if (!icsStr) return '';
  return icsStr.slice(0,4) + '-' + icsStr.slice(4,6) + '-' + icsStr.slice(6,8);
}

function uncheckAllByday() {
  document.querySelectorAll('input[name="byday"]').forEach(cb => (cb.checked = false));
}
