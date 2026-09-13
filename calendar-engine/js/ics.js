'use strict';
/* ── Calendar Engine — ICS import / export ──────────────────────────────────
   Exports all events to a standard VCALENDAR/VEVENT ICS file.
   Imports basic VEVENT blocks (DTSTART, DTEND, SUMMARY, RRULE, EXDATE).
──────────────────────────────────────────────────────────────────────────── */

// ── ICS date formatting ────────────────────────────────────────────────────

/**
 * Format a UTC ms timestamp as an ICS datetime string.
 * e.g. 20260907T160000Z
 */
function toICSDatetime(utcMs) {
  const d = new Date(utcMs);
  const pad = n => String(n).padStart(2, '0');
  return d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z';
}

/**
 * Fold long ICS lines at 75 chars (RFC 5545 §3.1).
 */
function foldLine(str) {
  if (str.length <= 75) return str;
  let out = '';
  let cur = 0;
  while (cur < str.length) {
    if (cur === 0) {
      out += str.slice(cur, 75);
      cur = 75;
    } else {
      out += '\r\n ' + str.slice(cur, cur + 74);
      cur += 74;
    }
  }
  return out;
}

// ── Export ─────────────────────────────────────────────────────────────────

/**
 * Generate an ICS file string for all events.
 * @param {object[]} events  Raw event objects (not expanded occurrences).
 * @returns {string}
 */
function exportICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//calendar-engine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    const sMs = new Date(ev.startISO).getTime();
    const eMs = new Date(ev.endISO).getTime();

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine('UID:' + ev.id));
    lines.push(foldLine('DTSTAMP:' + toICSDatetime(Date.now())));
    lines.push(foldLine('DTSTART:' + toICSDatetime(sMs)));
    lines.push(foldLine('DTEND:' + toICSDatetime(eMs)));
    lines.push(foldLine('SUMMARY:' + (ev.title || 'Untitled').replace(/\n/g, '\\n')));

    if (ev.tz) {
      lines.push(foldLine('X-WR-TIMEZONE:' + ev.tz));
    }
    if (ev.color) {
      lines.push(foldLine('X-CE-COLOR:' + ev.color));
    }

    if (ev.rrule) {
      const rruleBody = ev.rrule.startsWith('RRULE:') ? ev.rrule : 'RRULE:' + ev.rrule;
      lines.push(foldLine(rruleBody));
    }

    if (ev.exdates && ev.exdates.length > 0) {
      const exStr = ev.exdates.map(ex => toICSDatetime(new Date(ex).getTime())).join(',');
      lines.push(foldLine('EXDATE:' + exStr));
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Trigger a file download of the ICS data.
 */
function downloadICS(events) {
  const content = exportICS(events);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'calendar-engine.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * Unfold ICS content lines (RFC 5545 §3.1 — lines starting with space/tab
 * are continuations of the previous line).
 */
function unfoldICS(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

/**
 * Parse an ICS DTSTART/DTEND value (possibly with TZID parameter).
 * Returns UTC ms.
 */
function parseDTValue(valueWithParams) {
  // Could be: "20260907T160000Z" or "TZID=America/Los_Angeles:20260907T090000"
  const colonIdx = valueWithParams.lastIndexOf(':');
  if (colonIdx >= 0) {
    const tzidMatch = valueWithParams.slice(0, colonIdx).match(/TZID=([^;:]+)/);
    const dtStr = valueWithParams.slice(colonIdx + 1).trim();
    if (tzidMatch) {
      // Has TZID — parse as local time and convert to UTC
      const tz = tzidMatch[1];
      const y = +dtStr.slice(0,4), mo = +dtStr.slice(4,6), d = +dtStr.slice(6,8);
      const h = +(dtStr.slice(9,11)||'0'), m = +(dtStr.slice(11,13)||'0'), s = +(dtStr.slice(13,15)||'0');
      return localToUTC(y, mo, d, h, m, s, tz);
    }
    return parseICSDate(dtStr);
  }
  return parseICSDate(valueWithParams);
}

/**
 * Parse an ICS text string and return an array of event objects ready for addEvent().
 * Appends to existing events (no dedup on UID — caller handles duplicates).
 * @param {string} text   Raw ICS file content.
 * @returns {object[]}    New event objects (not yet saved).
 */
function importICS(text) {
  const unfolded = unfoldICS(text);
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();

    if (line === 'BEGIN:VEVENT') {
      current = { exdates: [] };
      continue;
    }
    if (line === 'END:VEVENT' && current) {
      // Validate minimal fields
      if (current.startISO && current.endISO) {
        events.push({
          id:      current.uid || genId(),
          title:   current.title || 'Imported Event',
          startISO: current.startISO,
          endISO:   current.endISO,
          tz:      current.tz || 'UTC',
          rrule:   current.rrule || '',
          exdates: current.exdates || [],
          color:   current.color || EVENT_COLORS[0],
        });
      }
      current = null;
      continue;
    }

    if (!current) continue;

    // Split property name from value (handle params like "DTSTART;TZID=...:")
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const propFull  = line.slice(0, colonIdx);   // e.g. "DTSTART;TZID=America/Los_Angeles"
    const value     = line.slice(colonIdx + 1);  // e.g. "20260907T090000"
    const propName  = propFull.split(';')[0].toUpperCase();

    switch (propName) {
      case 'UID':     current.uid   = value; break;
      case 'SUMMARY': current.title = value.replace(/\\n/g, '\n').replace(/\\,/g, ','); break;
      case 'X-WR-TIMEZONE': current.tz = value; break;
      case 'X-CE-COLOR':    current.color = value; break;

      case 'DTSTART': {
        const ms = parseDTValue(propFull.slice('DTSTART'.length) + ':' + value);
        current.startISO = new Date(ms).toISOString();
        // Infer tz from TZID if present
        const m = propFull.match(/TZID=([^;:]+)/);
        if (m && !current.tz) current.tz = m[1];
        break;
      }
      case 'DTEND': {
        const ms = parseDTValue(propFull.slice('DTEND'.length) + ':' + value);
        current.endISO = new Date(ms).toISOString();
        break;
      }
      case 'RRULE': {
        current.rrule = value; // e.g. "FREQ=WEEKLY;BYDAY=MO"
        break;
      }
      case 'EXDATE': {
        // May be comma-separated list, possibly with TZID param
        const dtPart = value; // simplified: treat as UTC-Z strings
        dtPart.split(',').forEach(s => {
          const ms = parseICSDate(s.trim());
          if (ms) current.exdates.push(new Date(ms).toISOString());
        });
        break;
      }
    }
  }

  return events;
}

/**
 * Read an ICS File object, import it, and return the new events.
 * @param {File} file
 * @returns {Promise<object[]>}
 */
function readAndImportICS(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const events = importICS(e.target.result);
        resolve(events);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}
