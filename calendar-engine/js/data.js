'use strict';
/* ── Calendar Engine — Data model, localStorage, seed events ────────────────
   Event schema:
     { id, title, startISO, endISO, tz, rrule?, exdates[], color? }

   All times stored as UTC ISO strings. Display always goes through
   getLocalParts(utcMs, displayTz) from rrule.js.

   Seed: 8 events — 1 daily, 2 weekly, 1 weekly multi-day, 1 with exdate,
   1 count-limited daily, 2 one-offs, 1 monthly. All seeded in America/Los_Angeles.
──────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'calendar-engine-v1';

// Event color palette (cycles for new events)
const EVENT_COLORS = [
  '#b4451a', // rust
  '#4a7c59', // forest green
  '#5b7fa6', // steel blue
  '#7a5c91', // purple
  '#c67c28', // amber
  '#3a7d7d', // teal
  '#8b5a2b', // sienna
];

// ── ID generation ──────────────────────────────────────────────────────────

function genId() {
  return 'evt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Seed events ────────────────────────────────────────────────────────────
// Base week: Mon 2026-09-07 through Sun 2026-09-13 (today = Sep 13).
// All events seeded in America/Los_Angeles (PDT = UTC-7 in September).

function makeSeedEvents() {
  const tz = 'America/Los_Angeles';

  /** Convert a YYYY-MM-DD + hour + minute in LA to a UTC ISO string. */
  function iso(dateStr, h, m = 0) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(localToUTC(y, mo, d, h, m, 0, tz)).toISOString();
  }

  // Exdate: skip Yoga on Thu Sep 10 (the Thursday of the seed week)
  const yogaSkip = iso('2026-09-10', 7, 0);

  return [
    // ── 1. Daily — Morning Standup ─────────────────────────────────────
    {
      id: 'seed-standup',
      title: 'Morning Standup',
      startISO: iso('2026-09-07', 9, 0),
      endISO:   iso('2026-09-07', 9, 30),
      tz,
      rrule: 'FREQ=DAILY;INTERVAL=1',
      exdates: [],
      color: EVENT_COLORS[0],
    },

    // ── 2. Weekly (Mon) — Team Sync ────────────────────────────────────
    {
      id: 'seed-teamsync',
      title: 'Weekly Team Sync',
      startISO: iso('2026-09-07', 10, 0),
      endISO:   iso('2026-09-07', 11, 0),
      tz,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      exdates: [],
      color: EVENT_COLORS[1],
    },

    // ── 3. Weekly (Tue, Thu) with exdate on Thu Sep 10 ────────────────
    {
      id: 'seed-yoga',
      title: 'Yoga Class',
      startISO: iso('2026-09-08', 7, 0),   // first Tue
      endISO:   iso('2026-09-08', 8, 0),
      tz,
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
      exdates: [yogaSkip],                  // ← exdate: skip Sep 10 Thu
      color: EVENT_COLORS[2],
    },

    // ── 4. Daily for 5 days — Focus Block ─────────────────────────────
    {
      id: 'seed-focus',
      title: 'Deep Work Block',
      startISO: iso('2026-09-08', 14, 0),   // Tue Sep 8, 2pm
      endISO:   iso('2026-09-08', 16, 0),
      tz,
      rrule: 'FREQ=DAILY;COUNT=5',
      exdates: [],
      color: EVENT_COLORS[4],
    },

    // ── 5. Weekly (Fri) — 1:1 Manager ────────────────────────────────
    {
      id: 'seed-oneone',
      title: '1:1 with Manager',
      startISO: iso('2026-09-11', 13, 0),  // Fri Sep 11
      endISO:   iso('2026-09-11', 13, 30),
      tz,
      rrule: 'FREQ=WEEKLY;BYDAY=FR',
      exdates: [],
      color: EVENT_COLORS[5],
    },

    // ── 6. One-off — Design Sprint Kickoff ────────────────────────────
    {
      id: 'seed-sprint',
      title: 'Design Sprint Kickoff',
      startISO: iso('2026-09-13', 14, 0),   // today (Sep 13), 2pm
      endISO:   iso('2026-09-13', 15, 30),
      tz,
      rrule: '',
      exdates: [],
      color: EVENT_COLORS[3],
    },

    // ── 7. One-off — All-Hands ────────────────────────────────────────
    {
      id: 'seed-allhands',
      title: 'All-Hands Meeting',
      startISO: iso('2026-09-15', 9, 0),   // next Tue
      endISO:   iso('2026-09-15', 10, 30),
      tz,
      rrule: '',
      exdates: [],
      color: EVENT_COLORS[6],
    },

    // ── 8. Monthly — Rent Due (Session C seed) ────────────────────────
    {
      id: 'seed-rent',
      title: 'Rent Due',
      startISO: iso('2026-09-01', 9, 0),   // 1st of month, 9am
      endISO:   iso('2026-09-01', 9, 30),
      tz,
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
      exdates: [],
      color: EVENT_COLORS[3],   // purple
    },
  ];
}

// ── Storage ────────────────────────────────────────────────────────────────

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) { /* ignore parse errors */ }
  return null;
}

function saveEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function initEvents() {
  let events = loadEvents();
  if (!events) {
    events = makeSeedEvents();
    saveEvents(events);
  }
  return events;
}

function resetToSeed() {
  const events = makeSeedEvents();
  saveEvents(events);
  return events;
}

// ── CRUD ───────────────────────────────────────────────────────────────────

function getEvents() {
  return loadEvents() || [];
}

function addEvent(ev) {
  const events = getEvents();
  const full = {
    id:      ev.id || genId(),
    title:   ev.title || 'Untitled',
    startISO: ev.startISO,
    endISO:   ev.endISO,
    tz:      ev.tz || 'America/Los_Angeles',
    rrule:   ev.rrule || '',
    exdates: ev.exdates || [],
    color:   ev.color || EVENT_COLORS[events.length % EVENT_COLORS.length],
  };
  events.push(full);
  saveEvents(events);
  return full;
}

function updateEvent(id, changes) {
  const events = getEvents();
  const idx = events.findIndex(e => e.id === id);
  if (idx < 0) return null;
  events[idx] = { ...events[idx], ...changes };
  saveEvents(events);
  return events[idx];
}

function deleteEvent(id) {
  const events = getEvents().filter(e => e.id !== id);
  saveEvents(events);
}

/**
 * Add an exdate (ISO string) to a recurring event.
 * Used when dragging "this occurrence" to create an override.
 */
function addExdate(id, isoStr) {
  const events = getEvents();
  const ev = events.find(e => e.id === id);
  if (ev) {
    ev.exdates = ev.exdates || [];
    if (!ev.exdates.includes(isoStr)) ev.exdates.push(isoStr);
    saveEvents(events);
  }
}

/**
 * Get all expanded occurrences in a UTC ms range, sorted by start time.
 * Buffer rangeStart/End by 1 day to catch all events in any tz.
 */
function getOccurrencesInRange(rangeStartMs, rangeEndMs) {
  const events = getEvents();
  const buf = 86400000; // 1-day buffer
  const all = [];
  for (const ev of events) {
    const occs = expandEvent(ev, rangeStartMs - buf, rangeEndMs + buf);
    all.push(...occs);
  }
  all.sort((a, b) => a._occStartMs - b._occStartMs);
  return all;
}

/**
 * Pick the next color in the palette for new events.
 */
function nextColor() {
  const events = getEvents();
  return EVENT_COLORS[events.length % EVENT_COLORS.length];
}
