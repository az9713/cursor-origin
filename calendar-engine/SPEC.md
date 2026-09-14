# Calendar engine — frozen spec

Internal spec for Wave 2 project 14. Vanilla HTML/CSS/JS. Persist to `localStorage` key `calendar-engine-v1`.

## Product

Month / week / day views, drag events, RRULE-style recurrences, timezone + DST, exceptions, ICS import/export.

Lives at `calendar-engine/index.html`.

## Event model

```
{ id, title, startISO, endISO, tz, rrule?, exdates[] }
```

Session A `rrule` subset: `FREQ=DAILY|WEEKLY`, `INTERVAL`, `COUNT` or `UNTIL`, `BYDAY` (weekly).

Session C adds: `FREQ=MONTHLY`, `BYMONTHDAY` (defaults to the start date's day-of-month when omitted).

Times stored as ISO with offset. Display in a chosen timezone (`America/Los_Angeles` and `UTC` must both work). A weekly event that crosses a US DST boundary must keep local wall-clock hour.

## Session A must

- Seed: 6+ events including one daily, one weekly, one with an `exdate`
- Month / week / day toggle
- Click empty slot to create; click event to edit title/times/rrule
- Drag to move (updates `startISO`/`endISO`; recurring drag edits this instance via `exdate` + override, or “all events” if confirmed)
- ICS export of all events; ICS import appends
- Hash `#/d/YYYY-MM-DD` for the focused day
- Reset seed

## Session C must

- `FREQ=MONTHLY` recurrence with `BYMONTHDAY` (day-of-month; defaults to start date's day when omitted)
- `INTERVAL`, `COUNT`, and `UNTIL` supported for monthly series
- DST wall-clock behavior preserved (same local hour across DST transitions)
- Modal "Repeat" includes "Monthly"; reveals "Day of month" field pre-filled from start date
- Seed: `seed-rent` ("Rent Due", 1st of each month — `FREQ=MONTHLY;BYMONTHDAY=1`)
- Non-existent days silently skipped (e.g. `BYMONTHDAY=31` skips months with fewer days)
- ICS export/import: `BYMONTHDAY` round-trips correctly

## Out of scope

Working-hours layers, multiple calendars, invitees.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
