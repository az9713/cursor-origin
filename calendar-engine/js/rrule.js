'use strict';
/* ── Calendar Engine — RRULE + DST wall-clock helpers ──────────────────────
   Implements FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, COUNT, UNTIL,
   BYDAY (weekly), BYMONTHDAY (monthly).
   DST wall-clock: recurring events keep the same local hour even across
   spring-forward / fall-back boundaries (America/Los_Angeles ↔ UTC offset
   changes). Uses Intl.DateTimeFormat for timezone conversions — no moment.js.
──────────────────────────────────────────────────────────────────────────── */

// ── Timezone primitives ────────────────────────────────────────────────────

/**
 * Get local date/time parts for a UTC millisecond timestamp in an IANA tz.
 * @param {number} utcMs
 * @param {string} tz  e.g. "America/Los_Angeles" | "UTC"
 * @returns {{ year:number, month:number, day:number, hour:number, minute:number, second:number }}
 */
function getLocalParts(utcMs, tz) {
  const d = new Date(utcMs);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const g = type => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  const h = g('hour');
  return {
    year:   g('year'),
    month:  g('month'),   // 1–12
    day:    g('day'),     // 1–31
    hour:   h === 24 ? 0 : h,   // Intl may return 24:00 for midnight
    minute: g('minute'),
    second: g('second'),
  };
}

/**
 * Convert a local wall-clock date/time in the given IANA timezone to UTC ms.
 * Uses iterative refinement to handle DST gaps/overlaps (converges in ≤3 iters).
 *
 * Example: 9am PDT (UTC-7) → 16:00 UTC; 9am PST (UTC-8) → 17:00 UTC.
 * A daily event starting at 9am will stay at 9am local even after clocks change.
 *
 * @param {number} year  @param {number} month (1-based)  @param {number} day
 * @param {number} hour  @param {number} minute  @param {number} second
 * @param {string} tz
 * @returns {number} UTC ms
 */
function localToUTC(year, month, day, hour, minute, second, tz) {
  let ms = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  for (let i = 0; i < 5; i++) {
    const lp = getLocalParts(ms, tz);
    const localMs  = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute, lp.second);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, second || 0);
    const diff = targetMs - localMs;
    if (Math.abs(diff) < 1000) break;
    ms += diff;
  }
  return ms;
}

/**
 * Format a UTC ms timestamp as "YYYY-MM-DD" in the given timezone.
 * @param {number} utcMs  @param {string} tz
 * @returns {string}
 */
function localDateStr(utcMs, tz) {
  const lp = getLocalParts(utcMs, tz);
  return lp.year + '-' +
    String(lp.month).padStart(2, '0') + '-' +
    String(lp.day).padStart(2, '0');
}

/**
 * Format a UTC ms timestamp as "HH:MM" in the given timezone.
 */
function localTimeStr(utcMs, tz) {
  const lp = getLocalParts(utcMs, tz);
  return String(lp.hour).padStart(2, '0') + ':' +
         String(lp.minute).padStart(2, '0');
}

/**
 * Format a UTC ms timestamp as "h:mm am/pm" in the given timezone.
 */
function localTimeStrAMPM(utcMs, tz) {
  const lp = getLocalParts(utcMs, tz);
  const h = lp.hour;
  const m = lp.minute;
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  return h12 + (m > 0 ? ':' + String(m).padStart(2,'0') : '') + ampm;
}

/**
 * Add N calendar days to a {year, month, day} object.
 * Pure calendar arithmetic — no DST concerns here.
 */
function addCalDays(ymd, n) {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// ── RRULE primitives ───────────────────────────────────────────────────────

/** BYDAY code → day-of-week number (0=Sun … 6=Sat) */
const BYDAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * Parse an ICS date string (YYYYMMDD | YYYYMMDDTHHmmssZ | YYYYMMDDTHHmmss)
 * to UTC milliseconds.
 */
function parseICSDate(str) {
  if (!str) return null;
  str = str.trim().replace(/^[A-Z-]+=/, ''); // strip TZID=... prefix if present
  const y = +str.slice(0, 4), mo = +str.slice(4, 6) - 1, d = +str.slice(6, 8);
  if (str.length <= 8) return Date.UTC(y, mo, d);
  const h = +str.slice(9, 11), m = +str.slice(11, 13), s = +str.slice(13, 15) || 0;
  return Date.UTC(y, mo, d, h, m, s);
}

/**
 * Parse an RRULE string to a params object.
 * Input: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"
 * Or:    "RRULE:FREQ=WEEKLY;BYDAY=MO,WE"
 */
function parseRRule(str) {
  if (!str) return {};
  const body = str.startsWith('RRULE:') ? str.slice(6) : str;
  const p = {};
  body.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) p[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim();
  });
  return p;
}

/**
 * Get the day-of-week (0=Sun … 6=Sat) for a local calendar date in the given tz.
 */
function getLocalDOW(year, month, day, tz) {
  const ms = localToUTC(year, month, day, 12, 0, 0, tz);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const s = fmt.format(new Date(ms));  // "Sun" | "Mon" | ... | "Sat"
  const ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return ORDER.indexOf(s);
}

/**
 * Check whether a UTC occurrence timestamp falls on a date listed in exdates.
 * Comparison is by local calendar date in the event's timezone.
 */
function isExcluded(event, startMs, tz) {
  if (!event.exdates || event.exdates.length === 0) return false;
  const ds = localDateStr(startMs, tz);
  return event.exdates.some(ex => {
    const exMs = typeof ex === 'string' ? new Date(ex).getTime() : ex;
    return localDateStr(exMs, tz) === ds;
  });
}

// ── RRULE expansion ────────────────────────────────────────────────────────

/**
 * Expand a single event (optionally recurring) into concrete occurrences
 * that overlap with [rangeStartMs, rangeEndMs].
 *
 * Each occurrence is a shallow-copy of the event with updated startISO / endISO
 * and extra fields: _occKey (stable string), _isRecurring (bool), _occStartMs (number).
 *
 * @param {object} event
 * @param {number} rangeStartMs  UTC ms (inclusive)
 * @param {number} rangeEndMs    UTC ms (inclusive)
 * @returns {object[]} occurrences sorted by start time
 */
function expandEvent(event, rangeStartMs, rangeEndMs) {
  const bStartMs = new Date(event.startISO).getTime();
  const bEndMs   = new Date(event.endISO).getTime();
  const duration = Math.max(0, bEndMs - bStartMs);
  const tz = event.tz || 'UTC';

  // ── Non-recurring ─────────────────────────────────────────────────────
  if (!event.rrule) {
    if (bStartMs <= rangeEndMs && bEndMs >= rangeStartMs) {
      return [{ ...event, _occKey: event.id + ':0', _isRecurring: false, _occStartMs: bStartMs }];
    }
    return [];
  }

  const p = parseRRule(event.rrule);
  const freq  = (p.FREQ || '').toUpperCase();
  const ivl   = Math.max(1, parseInt(p.INTERVAL || '1', 10));
  const cnt   = p.COUNT  ? parseInt(p.COUNT, 10) : null;
  const until = p.UNTIL  ? parseICSDate(p.UNTIL)  : null;

  // BYDAY: "MO,WE,FR" → [1,3,5]
  const byDayNums = p.BYDAY
    ? p.BYDAY.split(',').map(s => BYDAY_MAP[s.trim().toUpperCase().slice(-2)] ?? 0)
    : null;

  // Base occurrence's local wall-clock time
  const baseLp = getLocalParts(bStartMs, tz);
  const { hour, minute, second } = baseLp;

  const results = [];
  let occIdx = 0;
  const MAX_ITER = 5000;  // safety cap

  // ── DAILY ─────────────────────────────────────────────────────────────
  if (freq === 'DAILY') {
    let cur = { year: baseLp.year, month: baseLp.month, day: baseLp.day };

    for (let i = 0; i < MAX_ITER; i++) {
      const sMs = localToUTC(cur.year, cur.month, cur.day, hour, minute, second, tz);
      const eMs = sMs + duration;

      if (until !== null && sMs > until) break;
      if (cnt !== null && occIdx >= cnt) break;
      if (sMs > rangeEndMs) break;

      if (eMs >= rangeStartMs && !isExcluded(event, sMs, tz)) {
        results.push({
          ...event,
          startISO: new Date(sMs).toISOString(),
          endISO:   new Date(eMs).toISOString(),
          _occKey:  event.id + ':' + occIdx,
          _isRecurring: true,
          _occStartMs: sMs,
        });
      }
      occIdx++;
      cur = addCalDays(cur, ivl);
    }
  }

  // ── MONTHLY ───────────────────────────────────────────────────────────
  else if (freq === 'MONTHLY') {
    // BYMONTHDAY: comma-separated day-of-month numbers (1–31).
    // Default: the start date's day-of-month (RFC 5545 implicit rule).
    const byMonthDay = p.BYMONTHDAY
      ? p.BYMONTHDAY.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= 31)
      : [baseLp.day];

    let curYear  = baseLp.year;
    let curMonth = baseLp.month;  // 1–12

    outer:
    for (let i = 0; i < MAX_ITER; i++) {
      // Days in curYear/curMonth (e.g. 28 for Feb non-leap)
      const daysInMonth = new Date(Date.UTC(curYear, curMonth, 0)).getUTCDate();

      for (const dom of byMonthDay) {
        if (dom > daysInMonth) continue; // skip non-existent days (e.g. Feb 30)

        const sMs = localToUTC(curYear, curMonth, dom, hour, minute, second, tz);
        if (sMs < bStartMs - 1000) continue; // before series start
        const eMs = sMs + duration;

        if (until !== null && sMs > until) break outer;
        if (cnt   !== null && occIdx >= cnt) break outer;
        if (sMs > rangeEndMs) break outer;

        if (eMs >= rangeStartMs && !isExcluded(event, sMs, tz)) {
          results.push({
            ...event,
            startISO: new Date(sMs).toISOString(),
            endISO:   new Date(eMs).toISOString(),
            _occKey:  event.id + ':' + occIdx,
            _isRecurring: true,
            _occStartMs: sMs,
          });
        }
        occIdx++;
      }

      // Advance by INTERVAL months
      curMonth += ivl;
      while (curMonth > 12) { curMonth -= 12; curYear++; }

      // Early bail: if the entire next month is beyond rangeEndMs (no COUNT/UNTIL cap)
      if (cnt === null && until === null) {
        const firstOfNext = localToUTC(curYear, curMonth, 1, 0, 0, 0, tz);
        if (firstOfNext > rangeEndMs) break;
      }
    }
  }

  // ── WEEKLY ────────────────────────────────────────────────────────────
  else if (freq === 'WEEKLY') {
    // Day-of-week of the base date in tz
    const baseDOW = getLocalDOW(baseLp.year, baseLp.month, baseLp.day, tz);
    // Which DOWs to emit each week (default: same DOW as base)
    const targetDOWs = (byDayNums ?? [baseDOW]).sort((a, b) => a - b);

    // Sunday (DOW=0) of the week containing the base date
    let weekSun = addCalDays(
      { year: baseLp.year, month: baseLp.month, day: baseLp.day },
      -baseDOW,
    );

    outer:
    for (let w = 0; w < MAX_ITER; w++) {
      for (const dow of targetDOWs) {
        const candYmd = addCalDays(weekSun, dow);
        const sMs = localToUTC(candYmd.year, candYmd.month, candYmd.day, hour, minute, second, tz);
        if (sMs < bStartMs - 1000) continue; // before the series started
        const eMs = sMs + duration;

        if (until !== null && sMs > until) break outer;
        if (cnt !== null && occIdx >= cnt) break outer;
        if (sMs > rangeEndMs) break outer;

        if (eMs >= rangeStartMs && !isExcluded(event, sMs, tz)) {
          results.push({
            ...event,
            startISO: new Date(sMs).toISOString(),
            endISO:   new Date(eMs).toISOString(),
            _occKey:  event.id + ':' + occIdx,
            _isRecurring: true,
            _occStartMs: sMs,
          });
        }
        occIdx++;
      }
      weekSun = addCalDays(weekSun, 7 * ivl);
    }
  }

  return results;
}

// ── Hex → rgba helper (for event color backgrounds) ────────────────────────

/**
 * Convert a hex color and alpha to "rgba(r,g,b,a)" string.
 * Falls back to a default rust tint if hex is malformed.
 */
function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 6) return `rgba(180,69,26,${alpha})`;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Apply event color CSS custom properties to an element.
 */
function applyEventColor(el, color) {
  const c = color || '#b4451a';
  el.style.setProperty('--ev-color', c);
  el.style.setProperty('--ev-color-bg', hexToRgba(c, 0.13));
}
