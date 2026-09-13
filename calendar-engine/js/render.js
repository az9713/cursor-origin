'use strict';
/* ── Calendar Engine — View rendering (Month / Week / Day) ──────────────────
   All times are converted to displayTz before any UI rendering.
   Layout constants:
     SLOT_H = 40px per 30-min slot   HOUR_H = 80px per hour   PPM = 80/60
   Events in week/day are absolutely positioned using top + height.
──────────────────────────────────────────────────────────────────────────── */

const SLOT_H  = 40;          // px per 30-min slot
const HOUR_H  = 80;          // px per hour
const TOTAL_H = 24 * HOUR_H; // 1920 px — full 24-hour column
const PPM     = HOUR_H / 60; // pixels per minute  (≈ 1.333)

const DAY_NAMES_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Date helpers ───────────────────────────────────────────────────────────

function isSameLocalDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth()    === d2.getMonth()    &&
         d1.getDate()     === d2.getDate();
}

/** Return midnight (local) for the given Date, without mutating it. */
function dayFloor(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** YYYY-MM-DD string from a JS Date (local timezone). */
function toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Parse "YYYY-MM-DD" → JS Date at midnight local. */
function fromDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Return the Sunday of the week containing d (local midnight). */
function weekSunday(d) {
  const r = dayFloor(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

/** Format human label for the month view header. */
function fmtMonth(d) {
  return MONTH_NAMES_FULL[d.getMonth()] + ' ' + d.getFullYear();
}

/** Format human label for the week view header. */
function fmtWeek(d) {
  const sun = weekSunday(d);
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  if (sun.getMonth() === sat.getMonth()) {
    return MONTH_NAMES_FULL[sun.getMonth()] + ' ' +
           sun.getDate() + '–' + sat.getDate() + ', ' + sun.getFullYear();
  }
  return MONTH_NAMES_FULL[sun.getMonth()] + ' ' + sun.getDate() +
         ' – ' + MONTH_NAMES_FULL[sat.getMonth()] + ' ' + sat.getDate() +
         ', ' + sat.getFullYear();
}

/** Format human label for the day view. */
function fmtDay(d) {
  return DAY_NAMES_SHORT[d.getDay()] + ', ' +
         MONTH_NAMES_FULL[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

// ── Shared event element builders ──────────────────────────────────────────

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build an event chip for the month view (compact, single-line).
 */
function makeChip(occ, displayTz) {
  const sMs = new Date(occ.startISO).getTime();
  const el = document.createElement('div');
  el.className = 'event-chip';
  if (occ._isRecurring) el.classList.add('recurring');
  el.dataset.occKey   = occ._occKey;
  el.dataset.eventId  = occ.id;
  el.dataset.occStart = occ.startISO;   // for exdate / edit-this-occurrence
  el.draggable = true;
  applyEventColor(el, occ.color);

  const timeStr = localTimeStrAMPM(sMs, displayTz);
  el.innerHTML =
    `<span class="ev-time">${escHtml(timeStr)}</span>` +
    `<span class="ev-title">${escHtml(occ.title)}</span>`;
  return el;
}

/**
 * Build a positioned event element for week / day views.
 * @param {object} occ         Occurrence object
 * @param {string} displayTz
 * @param {number} col         Column index (0-based) among overlapping events
 * @param {number} totalCols   Total overlapping columns
 */
function makeWeekEvent(occ, displayTz, col, totalCols) {
  const sMs = new Date(occ.startISO).getTime();
  const eMs = new Date(occ.endISO).getTime();
  const lp  = getLocalParts(sMs, displayTz);
  const startMin = lp.hour * 60 + lp.minute;
  const durMin   = Math.max(20, (eMs - sMs) / 60000);

  const el = document.createElement('div');
  el.className = 'week-event';
  if (occ._isRecurring) el.classList.add('recurring');
  el.dataset.occKey   = occ._occKey;
  el.dataset.eventId  = occ.id;
  el.dataset.occStart = occ.startISO;   // for exdate / edit-this-occurrence
  el.draggable = true;
  applyEventColor(el, occ.color);

  // Position
  const GAP = 2;
  const w = (1 / totalCols * 100);
  el.style.top    = (startMin * PPM) + 'px';
  el.style.height = (durMin  * PPM) + 'px';
  el.style.left   = `calc(${col / totalCols * 100}% + ${col * GAP}px)`;
  el.style.right  = `${(totalCols - col - 1) / totalCols * 100}%`;

  // Content
  const sStr = localTimeStrAMPM(sMs, displayTz);
  const eStr = localTimeStrAMPM(eMs, displayTz);
  el.innerHTML =
    `<span class="ev-title">${escHtml(occ.title)}</span>` +
    (durMin > 30 ? `<span class="ev-time">${escHtml(sStr)}–${escHtml(eStr)}</span>` : '');

  return el;
}

/**
 * Compute column layout for a set of occurrences (simple greedy assignment).
 * Returns items as { occ, col, totalCols }.
 */
function layoutOccs(occs, displayTz) {
  if (occs.length === 0) return [];

  const items = occs.map(occ => {
    const sMs = new Date(occ.startISO).getTime();
    const eMs = new Date(occ.endISO).getTime();
    const lp  = getLocalParts(sMs, displayTz);
    const startMin = lp.hour * 60 + lp.minute;
    const durMin   = Math.max(20, (eMs - sMs) / 60000);
    return { occ, startMin, endMin: startMin + durMin, col: 0 };
  });

  items.sort((a, b) => a.startMin - b.startMin);

  const colEnds = [];
  for (const item of items) {
    let placed = false;
    for (let c = 0; c < colEnds.length; c++) {
      if (item.startMin >= colEnds[c]) {
        item.col = c;
        colEnds[c] = item.endMin;
        placed = true;
        break;
      }
    }
    if (!placed) {
      item.col = colEnds.length;
      colEnds.push(item.endMin);
    }
  }

  const totalCols = Math.max(1, colEnds.length);
  items.forEach(item => (item.totalCols = totalCols));
  return items;
}

// ── Month view ─────────────────────────────────────────────────────────────

/**
 * Render the month view into `container`.
 * @param {Date}   focusDate   Any date in the target month (local midnight)
 * @param {string} displayTz
 * @param {HTMLElement} container
 * @returns {{ label:string }}
 */
function renderMonth(focusDate, displayTz, container) {
  const year  = focusDate.getFullYear();
  const month = focusDate.getMonth();

  // Grid: from the Sunday ≤ first of month  to  Saturday ≥ last of month
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth  = new Date(year, month + 1, 0);
  const gridStart    = weekSunday(firstOfMonth);
  const gridEnd      = new Date(lastOfMonth);
  gridEnd.setDate(lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));

  const rangeStartMs = gridStart.getTime();
  const rangeEndMs   = gridEnd.getTime() + 86400000;

  const occurrences = getOccurrencesInRange(rangeStartMs, rangeEndMs);
  const today = dayFloor(new Date());

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'month-grid';

  // Day-name header row
  DAY_NAMES_SHORT.forEach(name => {
    const h = document.createElement('div');
    h.className = 'month-col-header';
    h.textContent = name;
    grid.appendChild(h);
  });

  // Day cells
  for (let cur = new Date(gridStart); cur <= gridEnd; cur.setDate(cur.getDate() + 1)) {
    const d = new Date(cur);
    const cell = document.createElement('div');
    cell.className = 'month-cell';
    cell.dataset.date = toDateStr(d);
    if (d.getMonth() !== month)         cell.classList.add('other-month');
    if (isSameLocalDay(d, today))       cell.classList.add('today');
    if (isSameLocalDay(d, focusDate))   cell.classList.add('focused');

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d.getDate();
    cell.appendChild(num);

    // Occurrences on this day (filter by local date in displayTz)
    const dayOccs = occurrences.filter(o => {
      const sMs = new Date(o.startISO).getTime();
      const lp  = getLocalParts(sMs, displayTz);
      const ld  = new Date(lp.year, lp.month - 1, lp.day);
      return isSameLocalDay(ld, d);
    });

    const MAX_CHIPS = 3;
    dayOccs.slice(0, MAX_CHIPS).forEach(occ => cell.appendChild(makeChip(occ, displayTz)));
    if (dayOccs.length > MAX_CHIPS) {
      const more = document.createElement('div');
      more.className = 'more-events';
      more.textContent = '+' + (dayOccs.length - MAX_CHIPS) + ' more';
      cell.appendChild(more);
    }

    grid.appendChild(cell);
  }

  container.appendChild(grid);
  return { label: fmtMonth(focusDate) };
}

// ── Week / Day shared body builder ─────────────────────────────────────────

/**
 * Build the time gutter (left column with hour labels).
 */
function buildTimeGutter() {
  const gutter = document.createElement('div');
  gutter.className = 'time-gutter';
  gutter.style.height = TOTAL_H + 'px';

  for (let h = 0; h < 24; h++) {
    const label = document.createElement('div');
    label.className = 'time-label';
    label.style.top = h * HOUR_H + 'px';
    const ampm = h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : (h - 12) + 'pm';
    label.textContent = ampm;
    gutter.appendChild(label);
  }
  return gutter;
}

/**
 * Build the grid-lines overlay (positioned over the day columns).
 */
function buildGridLines() {
  const overlay = document.createElement('div');
  overlay.className = 'week-grid-lines';
  overlay.style.height = TOTAL_H + 'px';

  for (let i = 0; i < 48; i++) {
    const line = document.createElement('div');
    line.className = 'grid-line ' + (i % 2 === 0 ? 'hour' : 'half');
    line.style.top = i * SLOT_H + 'px';
    overlay.appendChild(line);
  }
  return overlay;
}

/**
 * Build a single day column with time-slots and positioned events.
 * @param {Date}     date       Local calendar date for this column
 * @param {object[]} occs       All occurrences for this day
 * @param {string}   displayTz
 */
function buildDayCol(date, occs, displayTz) {
  const col = document.createElement('div');
  col.className = 'week-day-col';
  col.dataset.date = toDateStr(date);
  col.style.height = TOTAL_H + 'px';

  // 48 time-slot divs (each 30 min)
  for (let slot = 0; slot < 48; slot++) {
    const s = document.createElement('div');
    s.className = 'time-slot';
    s.style.top    = slot * SLOT_H + 'px';
    s.style.height = SLOT_H + 'px';
    s.dataset.date = toDateStr(date);
    s.dataset.slot = String(slot);  // 0 = 00:00, 1 = 00:30 … 47 = 23:30
    col.appendChild(s);
  }

  // Lay out events
  const laid = layoutOccs(occs, displayTz);
  laid.forEach(({ occ, col: c, totalCols }) => {
    col.appendChild(makeWeekEvent(occ, displayTz, c, totalCols));
  });

  return col;
}

// ── Week view ──────────────────────────────────────────────────────────────

/**
 * Render the week view (Sun–Sat) into `container`.
 * @param {Date}   focusDate   Any date in the target week (local midnight)
 * @param {string} displayTz
 * @param {HTMLElement} container
 * @returns {{ label:string }}
 */
function renderWeek(focusDate, displayTz, container) {
  const sun = weekSunday(focusDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun); d.setDate(sun.getDate() + i); return d;
  });

  const rangeStartMs = sun.getTime() - 86400000;
  const rangeEndMs   = days[6].getTime() + 2 * 86400000;
  const occurrences  = getOccurrencesInRange(rangeStartMs, rangeEndMs);
  const today        = dayFloor(new Date());

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'week-wrap';

  // ── Header row ───────────────────────────────────────────────────────
  const hdrRow = document.createElement('div');
  hdrRow.className = 'week-header-row';

  const gutterPad = document.createElement('div');
  gutterPad.className = 'time-gutter-pad';
  hdrRow.appendChild(gutterPad);

  days.forEach((d, i) => {
    const h = document.createElement('div');
    h.className = 'week-col-header';
    h.dataset.date = toDateStr(d);
    if (isSameLocalDay(d, today)) h.classList.add('today');
    h.innerHTML =
      `<span class="wch-day">${DAY_NAMES_SHORT[i]}</span>` +
      `<span class="wch-num">${d.getDate()}</span>`;
    hdrRow.appendChild(h);
  });
  wrap.appendChild(hdrRow);

  // ── Scrollable body ──────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'week-body';

  body.appendChild(buildTimeGutter());

  // Inner scrollable area — must have explicit height so week-body can scroll it
  const bodyInner = document.createElement('div');
  bodyInner.style.cssText =
    `flex:1;position:relative;height:${TOTAL_H}px;flex-shrink:0;overflow:hidden;`;
  bodyInner.appendChild(buildGridLines());

  const colsWrap = document.createElement('div');
  colsWrap.className = 'week-cols';
  colsWrap.style.cssText = 'position:absolute;inset:0;display:flex;';

  days.forEach(d => {
    const dayOccs = occurrences.filter(o => {
      const sMs = new Date(o.startISO).getTime();
      const lp  = getLocalParts(sMs, displayTz);
      const ld  = new Date(lp.year, lp.month - 1, lp.day);
      return isSameLocalDay(ld, d);
    });
    colsWrap.appendChild(buildDayCol(d, dayOccs, displayTz));
  });

  bodyInner.appendChild(colsWrap);
  body.appendChild(bodyInner);
  wrap.appendChild(body);
  container.appendChild(wrap);

  // Scroll to 8am on initial render
  requestAnimationFrame(() => { body.scrollTop = 8 * HOUR_H - SLOT_H; });

  return { label: fmtWeek(focusDate) };
}

// ── Day view ───────────────────────────────────────────────────────────────

/**
 * Render the day view for a single date into `container`.
 * @param {Date}   focusDate   Target date (local midnight)
 * @param {string} displayTz
 * @param {HTMLElement} container
 * @returns {{ label:string }}
 */
function renderDay(focusDate, displayTz, container) {
  const rangeStartMs = focusDate.getTime() - 86400000;
  const rangeEndMs   = focusDate.getTime() + 2 * 86400000;
  const occurrences  = getOccurrencesInRange(rangeStartMs, rangeEndMs);
  const today        = dayFloor(new Date());

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'day-wrap';

  // ── Header row ───────────────────────────────────────────────────────
  const hdrRow = document.createElement('div');
  hdrRow.className = 'week-header-row';

  const gutterPad = document.createElement('div');
  gutterPad.className = 'time-gutter-pad';
  hdrRow.appendChild(gutterPad);

  const hdr = document.createElement('div');
  hdr.className = 'week-col-header day-single-header';
  hdr.dataset.date = toDateStr(focusDate);
  if (isSameLocalDay(focusDate, today)) hdr.classList.add('today');
  hdr.innerHTML =
    `<span class="wch-day">${DAY_NAMES_SHORT[focusDate.getDay()]}</span>` +
    `<span class="wch-num">${focusDate.getDate()}</span>` +
    `<span class="wch-month">${MONTH_NAMES_FULL[focusDate.getMonth()]} ${focusDate.getFullYear()}</span>`;
  hdrRow.appendChild(hdr);
  wrap.appendChild(hdrRow);

  // ── Scrollable body ──────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'week-body';

  body.appendChild(buildTimeGutter());

  const bodyInner = document.createElement('div');
  bodyInner.style.cssText =
    `flex:1;position:relative;height:${TOTAL_H}px;flex-shrink:0;overflow:hidden;`;
  bodyInner.appendChild(buildGridLines());

  const colsWrap = document.createElement('div');
  colsWrap.className = 'week-cols';
  colsWrap.style.cssText = 'position:absolute;inset:0;display:flex;';

  const dayOccs = occurrences.filter(o => {
    const sMs = new Date(o.startISO).getTime();
    const lp  = getLocalParts(sMs, displayTz);
    const ld  = new Date(lp.year, lp.month - 1, lp.day);
    return isSameLocalDay(ld, focusDate);
  });

  colsWrap.appendChild(buildDayCol(focusDate, dayOccs, displayTz));
  bodyInner.appendChild(colsWrap);
  body.appendChild(bodyInner);
  wrap.appendChild(body);
  container.appendChild(wrap);

  requestAnimationFrame(() => { body.scrollTop = 8 * HOUR_H - SLOT_H; });

  return { label: fmtDay(focusDate) };
}

// ── Navigation helpers (called from app.js) ────────────────────────────────

function prevFocus(view, focusDate) {
  const d = new Date(focusDate);
  if (view === 'month') return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  if (view === 'week')  { d.setDate(d.getDate() - 7); return d; }
  /* day */             { d.setDate(d.getDate() - 1); return d; }
}

function nextFocus(view, focusDate) {
  const d = new Date(focusDate);
  if (view === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  if (view === 'week')  { d.setDate(d.getDate() + 7); return d; }
  /* day */             { d.setDate(d.getDate() + 1); return d; }
}
