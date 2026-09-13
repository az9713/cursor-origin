# PLANTED.md — Session A mismatches

Internal reference. **Not linked from the UI.** Do not expose to evaluators before they submit findings.

Each row maps a SPEC correct behavior (numbered as in SPEC.md) to what was deliberately shipped wrong.

---

| # | SPEC correct behavior | What was planted | Where in index.html |
|---|---|---|---|
| 1 | Header title is **Spec hunter** | Title reads **"Issue Tracker"** | `<h1>Issue Tracker</h1>` in `<header>` |
| 2 | Empty submit shows **"Title is required"** | Error text reads **"Please enter a title"** | `#f-title-err` inner text |
| 3 | Status filter **Open hides `done` issues** | Open filter removes `todo` items, not `done` — done issues remain visible | `list.filter(i => i.status !== 'todo')` in `getVisible()` |
| 4 | Search matches title **and body** | Search checks `i.title` only; body is never queried | search predicate inside `getVisible()` |
| 5 | Assignee dropdown lists **Ada, Rio, Kai** | Dropdown offers **Ada, Lee, Sam** | `<option>` elements in create-form template |
| 6 | Hash `#/i/<id>` opens that issue | Routes use `#/issue/<id>` — both the link in `go()` calls and the regex match | `go('/issue/' + ...)` and `hash.match(/^#\/issue\/(\d+)$/)` |
| 7 | Priority sort: **P1 above P2 above P3** | Sort order is reversed — **P3 first, P2 second, P1 last** | `const rank = { P3: 0, P2: 1, P1: 2 }` in `getVisible()` |
| 8 | Delete **asks confirm; cancel keeps the row** | Delete removes the issue immediately with no confirmation dialog | `deleteIssue()` — no `confirm()` call |
| 9 | Sidebar count is the **filtered** list length | Count reflects `issues.length` (total), ignoring current filter/search | `const total = issues.length` in `renderList()` |
| 10 | `localStorage` key is **`spec-hunter-v1`** | Key is **`spec-hunter-data`** | `const STORAGE_KEY = 'spec-hunter-data'` |
| 11 | New issues get status **`open`** | Status dropdown defaults to **`todo`**; form value is used as-is | `<option value="todo" selected>` in create-form |
| 12 | Detail pane shows created date as **`YYYY-MM-DD`** | Date is formatted as **`MM/DD/YYYY`** | `fmtDate()` — returns `${m}/${d}/${y}` |

---

## Notes for scoring

- Bugs 3 and 11 interact: a newly created issue (status `todo`) disappears from the list when "Open" filter is active, because the Open filter incorrectly hides `todo` rather than `done`. Evaluators who notice new issues vanish have found evidence touching both bugs.
- Bug 6 also breaks the back-link from the list sidebar when navigating programmatically — any evaluator testing `#/i/1` directly in the address bar will find a 404.
- Bug 10 means any data stored under the correct key `spec-hunter-v1` is invisible to this app, and vice-versa. The app starts clean each time the correct key was used previously.
