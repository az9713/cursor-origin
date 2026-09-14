# Spec hunter — frozen spec

Internal spec for Wave 2 project 19. Vanilla HTML/CSS/JS. Persist to `localStorage` key `spec-hunter-v1`.

This file is the **correct** product. The shipped Session A UI must contain **12 intentional mismatches** listed only in `PLANTED.md` (internal). The running app must **not** comment, label, or hint those bugs.

## Product (as specified — the truth)

A tiny issue tracker: list + detail, create issue, status filter, search, assignee, hash routes.

Lives at `spec-hunter/index.html`.

## Correct behavior

1. Title in the header is **Spec hunter**
2. Create issue requires a non-empty title; empty submit shows “Title is required”
3. Status filter `Open` hides `done` issues
4. Search matches title **and** body
5. Assignee dropdown lists seed users **Ada, Rio, Kai**
6. Hash `#/i/<id>` opens that issue; back to `#/` is the list
7. Priority `P1` sorts above `P2` then `P3` when Sort = priority
8. Delete issue asks confirm; cancel keeps the row
9. Count in the sidebar is the **filtered** list length
10. `localStorage` key is exactly `spec-hunter-v1`
11. New issues get status `open` (not `todo`)
12. Detail pane shows created date as `YYYY-MM-DD`

Seed: 8 issues across statuses and priorities.

## Session A must

Ship a demoable tracker that **looks** complete, plus `PLANTED.md` naming the 12 mismatches (file not linked from the UI). Hub card must not spoil the bugs.

## Session C must

Issue labels (additive). Each issue may have `labels: string[]`. Detail pane can add/remove chips. Sidebar has a label filter applied **after** the planted status/search/sort logic — do not change those 12 mismatches. New issues start with `labels: []`. Persistence still uses the planted storage key.

## Out of scope (later sessions)

Fixing the 12 (that is a later agent eval).

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
