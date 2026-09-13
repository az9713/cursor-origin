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

Times stored as ISO with offset. Display in a chosen timezone (`America/Los_Angeles` and `UTC` must both work). A weekly event that crosses a US DST boundary must keep local wall-clock hour.

## Session A must

- Seed: 6+ events including one daily, one weekly, one with an `exdate`
- Month / week / day toggle
- Click empty slot to create; click event to edit title/times/rrule
- Drag to move (updates `startISO`/`endISO`; recurring drag edits this instance via `exdate` + override, or “all events” if confirmed)
- ICS export of all events; ICS import appends
- Hash `#/d/YYYY-MM-DD` for the focused day
- Reset seed

## Out of scope (later sessions)

Working-hours layers, multiple calendars, invitees.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
