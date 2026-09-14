# Git theatre — frozen spec

Internal spec for Wave 3 project 22. Vanilla HTML/CSS/JS. Persist to `localStorage` key `git-theatre-v1`.

## Product

In-browser Git object store. Real blobs/trees/commits (content-addressed), branches, merge, rebase, reflog, DAG view, cat-file. No wasm git and no GitHub. Lives at `git-theatre/index.html`.

Hashes **must** change when content changes and stay put when it does not.

## Model

Objects: `{ type: blob|tree|commit, content }` addressed by hex SHA-1 of `type SP size NUL payload` (Git header). Trees are sorted `{name, mode, hash}` entries. Commits: `{ tree, parents[], author, message, timestamp }`.

Refs: `HEAD` (symbolic or detached), `refs/heads/<name>`. Working tree is a path→text map you can edit, then `add` + `commit`.

## Session A must

- Seed: at least 2 branches, 4+ commits, one merge parent pair visible in the DAG
- File list + editor for the working tree; stage/commit
- Branch create / checkout
- Merge another branch (fast-forward or two-parent commit; conflicting same-path edits become a visible conflict you must resolve)
- Rebase current branch onto another (replay unique commits; hashes of replayed commits change; originals remain in reflog)
- Reflog list; cat-file by hash; DAG of commits (nodes = short SHA + message)
- Hash `#/c/<sha>` selects a commit
- Reset seed
- Hub link `../`

## Out of scope (later sessions)

Cherry-pick, stash, remotes, packfiles, tags.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
