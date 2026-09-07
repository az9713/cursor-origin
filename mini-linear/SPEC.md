# Mini Linear — frozen spec

Internal spec for Project 1. Do not change this file during Session B polish. Session C may reorganize files but must not drop behavior listed here.

## Product

A static, no-backend issue tracker (Linear-lite). Vanilla HTML/CSS/JS. Persist to `localStorage` key `mini-linear-v1`. No new dependencies.

## Routes (hash)

- `#/board` — kanban
- `#/list` — table/list
- `#/issue/:id` — detail
- Default: `#/board`
- Filters live in the hash query: `q`, `status`, `assignee`, `priority`
  Example: `#/board?q=auth&status=todo&assignee=ada&priority=high`

## Issue fields

| Field | Type |
| --- | --- |
| id | string |
| title | string |
| description | string |
| status | `backlog` \| `todo` \| `in_progress` \| `done` |
| priority | `low` \| `medium` \| `high` \| `urgent` |
| assignee | user id or `""` (unassigned) |
| labels | string[] |
| createdAt | ISO string |
| updatedAt | ISO string |

## Must work

- Seed ~24 issues on first visit; later visits load from localStorage
- Create issue (title required)
- Edit title, description, status, priority, assignee, labels
- Delete issue
- Drag a card from one board column to another; status updates and persists
- Filters apply to both board and list; changing view keeps filters
- Deep link survives reload (same issue, same filters)
- Empty state when filters match nothing
- Board columns: Backlog, Todo, In progress, Done

## Session A (messy)

60–100 files. Duplicated CSS. Copy-pasted card/column components. Ugly but demoable.

## Session C (refactor)

Tokens in one CSS file, one state module, one router. Board drag, filters, and deep links must still work.

## Out of scope

Backend, auth, realtime, markdown rendering, file uploads, spreadsheet/vector nested apps.
