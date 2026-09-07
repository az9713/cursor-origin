# Adds Session A files only. Never overwrites protected Session C files.
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CSS = ROOT / "css"
JS = ROOT / "js"
SEED = JS / "seed"
CARDS = JS / "cards"
COLS = JS / "columns"
VIEWS = JS / "views"

PROTECT = {
    ROOT / "index.html",
    ROOT / "SPEC.md",
    ROOT / "css" / "tokens.css",
    ROOT / "css" / "app.css",
    ROOT / "js" / "state.js",
    ROOT / "js" / "router.js",
    ROOT / "js" / "app.js",
}

USERS = [
    {"id": "ada", "name": "Ada L.", "initials": "AL"},
    {"id": "linus", "name": "Linus T.", "initials": "LT"},
    {"id": "grace", "name": "Grace H.", "initials": "GH"},
    {"id": "tomas", "name": "Tomas C.", "initials": "TC"},
    {"id": "mei", "name": "Mei W.", "initials": "MW"},
]

LABELS = ["bug", "feature", "design", "infra", "docs", "perf"]

ISSUES = [
    ("LIN-1", "Auth token refresh races the login form", "backlog", "high", "ada", ["bug", "infra"], "Two tabs can mint overlapping refresh tokens."),
    ("LIN-2", "Board column headers clip at 1280px", "todo", "medium", "mei", ["bug", "design"], "In progress label truncates on laptop screens."),
    ("LIN-3", "Deep links drop assignee filter", "in_progress", "urgent", "linus", ["bug"], "Reloading #/board?assignee=ada shows everyone."),
    ("LIN-4", "Keyboard shortcut for new issue", "todo", "low", "grace", ["feature"], "Match Linear: C creates an issue."),
    ("LIN-5", "Empty state illustration is a broken SVG", "done", "low", "tomas", ["design"], "Replace with CSS-only empty state."),
    ("LIN-6", "Seed data should survive storage wipe", "backlog", "medium", "ada", ["infra"], "Add a Reset demo button that reloads seeds."),
    ("LIN-7", "Drag preview uses the wrong card skin", "in_progress", "high", "mei", ["bug", "design"], "List row ghost appears on the board."),
    ("LIN-8", "Priority urgent is not sorted first", "todo", "high", "linus", ["feature"], "List view should pin urgent above high."),
    ("LIN-9", "localStorage quota error is silent", "backlog", "medium", "tomas", ["infra"], "Show a toast when setItem throws."),
    ("LIN-10", "Filter chips do not wrap on mobile", "todo", "medium", "grace", ["design"], "Horizontal scroll is worse than wrap."),
    ("LIN-11", "Assignee avatar missing title attribute", "done", "low", "mei", ["bug", "docs"], "Hover should show full name."),
    ("LIN-12", "Cannot unassign from the detail pane", "in_progress", "high", "ada", ["bug"], "Empty option is missing from the select."),
    ("LIN-13", "CSV export of the current filter", "backlog", "low", "linus", ["feature"], "Out of scope for v1 but keep the issue."),
    ("LIN-14", "Column counts ignore active search", "todo", "urgent", "tomas", ["bug"], "Header says 8 while three cards are visible."),
    ("LIN-15", "Markdown in descriptions renders raw", "backlog", "low", "grace", ["feature", "docs"], "Stay plaintext for this bake-off."),
    ("LIN-16", "Done column should collapse on small screens", "todo", "medium", "mei", ["design"], "Stack columns; do not shrink cards to unreadability."),
    ("LIN-17", "Create modal does not trap focus", "in_progress", "high", "ada", ["bug"], "Tab escapes into the board."),
    ("LIN-18", "Duplicate LIN ids after reset", "done", "urgent", "linus", ["bug", "infra"], "Counter must start from max existing id."),
    ("LIN-19", "Label colors disagree between list and board", "todo", "low", "tomas", ["design"], "Copy-pasted CSS, two palettes."),
    ("LIN-20", "Search should match description too", "backlog", "medium", "grace", ["feature"], "Title-only search hides LIN-1."),
    ("LIN-21", "Hash router fights with Pages base path", "in_progress", "high", "mei", ["infra"], "App lives in /mini-linear/ on GitHub Pages."),
    ("LIN-22", "Dropping a card on padding does nothing", "todo", "medium", "ada", ["bug"], "Column hit target is only the card stack."),
    ("LIN-23", "First-run seed is only 8 issues", "done", "low", "linus", ["docs"], "Need ~24 for a believable board."),
    ("LIN-24", "Delete confirm is a native alert", "backlog", "low", "tomas", ["design"], "Keep alert for Session A; replace later if time."),
    ("LIN-25", "Priority filter does not compose with status", "in_progress", "urgent", "grace", ["bug"], "AND vs OR is inconsistent across views."),
    ("LIN-26", "List row click target is only the title", "todo", "medium", "mei", ["bug"], "Whole row should open detail."),
    ("LIN-27", "Back from detail should restore scroll", "backlog", "low", "ada", ["feature"], "Nice-to-have; do not block Session C."),
    ("LIN-28", "Safari drag ghost offset", "todo", "high", "linus", ["bug"], "Card jumps 40px left on dragstart."),
    ("LIN-29", "Sidebar active state uses a different brown", "todo", "low", "mei", ["design"], "Copy-pasted hover vs on classes."),
    ("LIN-30", "Board and list filters are two functions", "backlog", "medium", "ada", ["infra"], "They AND the same four fields."),
]


def write(path: Path, text: str) -> None:
    if path in PROTECT:
        raise SystemExit(f"refusing to overwrite protected file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.strip() + "\n", encoding="utf-8")


def main() -> None:
    write(
        JS / "users.js",
        "window.ML = window.ML || {};\nML.users = " + json.dumps(USERS) + ";",
    )
    write(
        JS / "labels.js",
        "window.ML = window.ML || {};\nML.labels = " + json.dumps(LABELS) + ";",
    )

    for idx, row in enumerate(ISSUES, start=1):
        iid, title, status, pri, who, labs, desc = row
        obj = {
            "id": iid,
            "title": title,
            "description": desc,
            "status": status,
            "priority": pri,
            "assignee": who,
            "labels": labs,
            "createdAt": f"2026-08-{(idx % 28) + 1:02d}T12:00:00.000Z",
            "updatedAt": f"2026-09-01T08:{(idx % 50):02d}:00.000Z",
        }
        write(
            SEED / f"issue-{idx:02d}.js",
            "\n".join(
                [
                    "window.ML = window.ML || {};",
                    "ML.seedIssues = ML.seedIssues || [];",
                    "ML.seedIssues.push(" + json.dumps(obj) + ");",
                ]
            ),
        )

    css_files = {
        "reset.css": "* { box-sizing: border-box; }\nhtml, body { margin: 0; height: 100%; }\nbutton, input, select, textarea { font: inherit; }\nbutton { cursor: pointer; }\na { color: inherit; }",
        "layout.css": 'body.ml-body { font-family: "Segoe UI", Tahoma, sans-serif; background: #ece9e2; color: #222; }\n.ml-shell { display: flex; min-height: 100vh; }\n.ml-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }\n#ml-main { flex: 1; min-height: 0; display: flex; flex-direction: column; }',
        "sidebar.css": ".ml-side { width: 220px; background: #2b2a28; color: #f3efe6; padding: 18px 14px; }\n.ml-side h1 { font-size: 15px; margin: 0 0 18px; letter-spacing: 0.04em; }\n.ml-side a { display: block; padding: 8px 10px; text-decoration: none; border-radius: 4px; margin-bottom: 4px; color: #ddd6c8; }\n.ml-side a.on, .ml-side a:hover { background: #4a463f; color: #fff; }",
        "header.css": ".ml-top { display: flex; gap: 12px; align-items: center; padding: 12px 16px; background: #f7f4ee; border-bottom: 1px solid #d4cec2; }\n.ml-top h2 { margin: 0; font-size: 18px; flex: 1; }",
        "buttons.css": ".btn-new { background: #c45c26; color: #fff; border: 0; padding: 8px 12px; border-radius: 3px; }\n.btn-new:hover { background: #a34818; }\n.btn-ghost { background: transparent; border: 1px solid #bbb; padding: 6px 10px; }",
        "filters.css": ".ml-filters { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 16px; background: #efebe3; }\n.ml-filters input, .ml-filters select { padding: 6px 8px; border: 1px solid #cfc6b6; background: #fff; }",
        "filters-bar.css": ".ml-filters input[type=\"search\"] { min-width: 180px; }",
        "board.css": ".ml-board { display: grid; grid-template-columns: repeat(4, minmax(200px, 1fr)); gap: 10px; padding: 12px; align-items: start; overflow: auto; flex: 1; }",
        "board-page.css": ".ml-col { background: #e4ded3; border: 1px solid #cfc6b8; min-height: 240px; padding: 8px; }\n.ml-col h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }\n.ml-col.over { outline: 2px dashed #c45c26; }",
        "column-backlog.css": ".ml-col-backlog { background: #e8e4dc; }",
        "column-todo.css": ".ml-col-todo { background: #e3e8e1; }",
        "column-progress.css": ".ml-col-in_progress { background: #e8e0d4; }",
        "column-done.css": ".ml-col-done { background: #dde6e2; }",
        "card.css": ".ml-card { background: #fff; border: 1px solid #d7d0c4; padding: 8px; margin-bottom: 8px; cursor: grab; }\n.ml-card:active { cursor: grabbing; }\n.ml-card h4 { margin: 0 0 6px; font-size: 13px; }",
        "card-board.css": ".ml-card .meta { font-size: 11px; color: #666; display: flex; gap: 6px; flex-wrap: wrap; }",
        "card-list.css": ".ml-row { display: grid; grid-template-columns: 72px 1fr 110px 100px 90px; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #ddd6ca; background: #fff; cursor: pointer; }\n.ml-row:hover { background: #f6f1e8; }\n.ml-rowhead { font-size: 11px; text-transform: uppercase; color: #888; background: #efeae1; }",
        "list.css": ".ml-list { flex: 1; overflow: auto; }",
        "list-page.css": ".ml-listwrap { padding: 0 0 40px; }",
        "detail.css": ".ml-detail { max-width: 720px; padding: 20px; }\n.ml-detail input.title { width: 100%; font-size: 22px; border: 0; border-bottom: 1px solid #ddd; padding: 6px 0; background: transparent; }\n.ml-detail textarea { width: 100%; min-height: 140px; padding: 8px; border: 1px solid #d5ccbe; }\n.ml-detail .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }",
        "modal.css": ".ml-modal-bg { position: fixed; inset: 0; background: rgba(30,24,16,.45); display: flex; align-items: center; justify-content: center; }\n.ml-modal { background: #fff; padding: 18px; width: min(480px, 92vw); border: 1px solid #ccc; }\n.ml-modal-bg.hidden, .ml-modal.hidden { display: none; }\n.ml-modal h3 { margin-top: 0; }\n.ml-modal input, .ml-modal textarea, .ml-modal select { width: 100%; margin: 6px 0 10px; padding: 8px; }",
        "badges.css": ".pill { font-size: 10px; padding: 2px 6px; border-radius: 99px; background: #eee; }\n.pill-bug { background: #f3d0c8; }\n.pill-feature { background: #d5e4f2; }\n.pill-design { background: #eadcf3; }\n.pill-infra { background: #dce8d8; }\n.pill-docs { background: #efe6c8; }\n.pill-perf { background: #d8e8ea; }\n.pri-urgent { color: #9b1c1c; font-weight: 700; }\n.pri-high { color: #b4451a; }\n.pri-medium { color: #6b5a2a; }\n.pri-low { color: #555; }",
        "empty.css": ".ml-empty { padding: 48px 16px; text-align: center; color: #777; }",
        "avatars.css": ".av { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: #4a463f; color: #fff; font-size: 10px; align-items: center; justify-content: center; }",
        "banner.css": ".ml-banner { font-size: 12px; padding: 6px 12px; background: #efe0d0; border-bottom: 1px solid #d4cec2; }",
    }
    for name, body in css_files.items():
        write(CSS / name, body)

    write(
        JS / "storage-list.js",
        """
window.ML = window.ML || {};
ML.STORE_KEY = "mini-linear-v1";
ML.loadListStore = function () {
  try {
    var raw = localStorage.getItem(ML.STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};
ML.saveListStore = function (state) {
  localStorage.setItem(ML.STORE_KEY, JSON.stringify(state));
};
""",
    )
    write(
        JS / "storage-board.js",
        """
window.ML = window.ML || {};
ML.loadBoardStore = function () {
  try {
    var raw = localStorage.getItem("mini-linear-v1");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};
ML.saveBoardStore = function (state) {
  localStorage.setItem("mini-linear-v1", JSON.stringify(state));
};
""",
    )
    write(
        JS / "messy-state.js",
        r"""
window.ML = window.ML || {};
ML.state = { issues: [], nextN: 31 };
ML.persist = function () {
  var payload = { issues: ML.state.issues, nextN: ML.state.nextN };
  if (ML.saveListStore) ML.saveListStore(payload);
  else if (ML.saveBoardStore) ML.saveBoardStore(payload);
};
ML.hydrate = function () {
  var saved = (ML.loadListStore && ML.loadListStore()) || (ML.loadBoardStore && ML.loadBoardStore());
  if (saved && Array.isArray(saved.issues) && saved.issues.length) {
    ML.state.issues = saved.issues;
    ML.state.nextN = saved.nextN || (saved.issues.length + 1);
    return;
  }
  ML.state.issues = (ML.seedIssues || []).map(function (x) {
    return Object.assign({}, x, { labels: x.labels.slice() });
  });
  ML.state.nextN = ML.state.issues.length + 1;
  ML.persist();
};
ML.userById = function (id) {
  return (ML.users || []).filter(function (u) { return u.id === id; })[0] || null;
};
ML.nextId = function () {
  var n = ML.state.nextN++;
  return "LIN-" + n;
};
""",
    )
    write(
        JS / "messy-router.js",
        r"""
window.ML = window.ML || {};
ML.parseHash = function () {
  var h = (location.hash || "#/board").replace(/^#/, "");
  if (h.charAt(0) !== "/") h = "/" + h;
  var parts = h.split("?");
  var path = parts[0];
  var q = new URLSearchParams(parts[1] || "");
  var segs = path.split("/").filter(Boolean);
  var view = segs[0] || "board";
  var issueId = view === "issue" ? decodeURIComponent(segs[1] || "") : "";
  if (view !== "board" && view !== "list" && view !== "issue") view = "board";
  return {
    view: view, issueId: issueId,
    q: q.get("q") || "", status: q.get("status") || "",
    assignee: q.get("assignee") || "", priority: q.get("priority") || ""
  };
};
ML.writeHash = function (opts) {
  var cur = ML.parseHash();
  var next = Object.assign({}, cur, opts || {});
  var path = next.view === "issue" ? "/issue/" + encodeURIComponent(next.issueId) : "/" + next.view;
  var q = new URLSearchParams();
  if (next.q) q.set("q", next.q);
  if (next.status) q.set("status", next.status);
  if (next.assignee) q.set("assignee", next.assignee);
  if (next.priority) q.set("priority", next.priority);
  var qs = q.toString();
  location.hash = path + (qs ? "?" + qs : "");
};
""",
    )
    write(
        JS / "filters-list.js",
        r"""
window.ML = window.ML || {};
ML.filterIssuesList = function (issues, f) {
  return issues.filter(function (iss) {
    if (f.status && iss.status !== f.status) return false;
    if (f.assignee && iss.assignee !== f.assignee) return false;
    if (f.priority && iss.priority !== f.priority) return false;
    if (f.q) {
      var blob = (iss.title + " " + iss.description + " " + iss.id).toLowerCase();
      if (blob.indexOf(f.q.toLowerCase()) === -1) return false;
    }
    return true;
  });
};
""",
    )
    write(
        JS / "filters-board.js",
        r"""
window.ML = window.ML || {};
ML.filterIssuesBoard = function (issues, f) {
  return issues.filter(function (iss) {
    if (f.status && iss.status !== f.status) return false;
    if (f.assignee && iss.assignee !== f.assignee) return false;
    if (f.priority && iss.priority !== f.priority) return false;
    if (f.q) {
      var blob = (iss.title + " " + iss.description + " " + iss.id).toLowerCase();
      if (blob.indexOf(String(f.q).toLowerCase()) === -1) return false;
    }
    return true;
  });
};
""",
    )
    write(
        CARDS / "card-inner.js",
        r"""
window.ML = window.ML || {};
ML._cardInner = function (iss) {
  var u = ML.userById(iss.assignee);
  var labs = (iss.labels || []).map(function (l) {
    return '<span class="pill pill-' + l + '">' + l + "</span>";
  }).join(" ");
  return (
    "<h4>" + iss.title.replace(/</g, "&lt;") + "</h4>" +
    '<div class="meta"><span>' + iss.id + '</span><span class="pri-' + iss.priority + '">' +
    iss.priority + "</span>" + labs +
    (u ? '<span class="av" title="' + u.name + '">' + u.initials + "</span>" : "<span>unassigned</span>") +
    "</div>"
  );
};
""",
    )
    for status in ("backlog", "todo", "in_progress", "done"):
        write(
            CARDS / f"card-board-{status}.js",
            f"""
window.ML = window.ML || {{}};
ML.renderBoardCard_{status} = function (iss) {{
  var el = document.createElement("article");
  el.className = "ml-card ml-card-{status}";
  el.draggable = true;
  el.dataset.id = iss.id;
  el.innerHTML = ML._cardInner(iss);
  el.addEventListener("click", function () {{
    var f = ML.parseHash();
    ML.writeHash({{ view: "issue", issueId: iss.id, q: f.q, status: f.status, assignee: f.assignee, priority: f.priority }});
  }});
  el.addEventListener("dragstart", function (ev) {{
    ev.dataTransfer.setData("text/plain", iss.id);
    ev.dataTransfer.effectAllowed = "move";
  }});
  return el;
}};
""",
        )
    write(
        CARDS / "card-list.js",
        r"""
window.ML = window.ML || {};
ML.renderListRow = function (iss) {
  var u = ML.userById(iss.assignee);
  var el = document.createElement("div");
  el.className = "ml-row";
  el.dataset.id = iss.id;
  el.innerHTML =
    "<span>" + iss.id + "</span><span>" + iss.title.replace(/</g, "&lt;") + "</span><span>" +
    iss.status + "</span><span class='pri-" + iss.priority + "'>" + iss.priority + "</span><span>" +
    (u ? u.name : "Unassigned") + "</span>";
  el.addEventListener("click", function () {
    var f = ML.parseHash();
    ML.writeHash({ view: "issue", issueId: iss.id, q: f.q, status: f.status, assignee: f.assignee, priority: f.priority });
  });
  return el;
};
""",
    )
    for status, label in (
        ("backlog", "Backlog"),
        ("todo", "Todo"),
        ("in_progress", "In progress"),
        ("done", "Done"),
    ):
        write(
            COLS / f"col-{status}.js",
            f"""
window.ML = window.ML || {{}};
ML.mountColumn_{status} = function (host, issues) {{
  var col = document.createElement("section");
  col.className = "ml-col ml-col-{status}";
  col.dataset.status = "{status}";
  var filtered = issues.filter(function (i) {{ return i.status === "{status}"; }});
  col.innerHTML = "<h3>{label} (" + filtered.length + ")</h3>";
  var stack = document.createElement("div");
  filtered.forEach(function (iss) {{ stack.appendChild(ML.renderBoardCard_{status}(iss)); }});
  col.appendChild(stack);
  col.addEventListener("dragover", function (ev) {{ ev.preventDefault(); col.classList.add("over"); }});
  col.addEventListener("dragleave", function () {{ col.classList.remove("over"); }});
  col.addEventListener("drop", function (ev) {{
    ev.preventDefault();
    col.classList.remove("over");
    var id = ev.dataTransfer.getData("text/plain");
    var hit = ML.state.issues.filter(function (i) {{ return i.id === id; }})[0];
    if (!hit) return;
    hit.status = "{status}";
    hit.updatedAt = new Date().toISOString();
    ML.persist();
    ML.render();
  }});
  host.appendChild(col);
}};
""",
        )
    write(
        VIEWS / "filters-ui.js",
        r"""
window.ML = window.ML || {};
ML.mountFilters = function (host, f) {
  host.innerHTML = "";
  var wrap = document.createElement("div");
  wrap.className = "ml-filters";
  wrap.innerHTML =
    '<input type="search" placeholder="Search" value="' + String(f.q).replace(/"/g, "&quot;") + '">' +
    '<select data-k="status"><option value="">All statuses</option>' +
    ["backlog","todo","in_progress","done"].map(function (s) {
      return '<option value="' + s + '"' + (f.status === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select>" +
    '<select data-k="assignee"><option value="">All assignees</option>' +
    (ML.users || []).map(function (u) {
      return '<option value="' + u.id + '"' + (f.assignee === u.id ? " selected" : "") + ">" + u.name + "</option>";
    }).join("") + "</select>" +
    '<select data-k="priority"><option value="">All priorities</option>' +
    ["urgent","high","medium","low"].map(function (s) {
      return '<option value="' + s + '"' + (f.priority === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select>";
  var search = wrap.querySelector("input");
  search.addEventListener("input", function () { ML.writeHash({ q: search.value }); });
  wrap.querySelectorAll("select").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var patch = {};
      patch[sel.getAttribute("data-k")] = sel.value;
      ML.writeHash(patch);
    });
  });
  host.appendChild(wrap);
};
""",
    )
    write(
        VIEWS / "board.js",
        r"""
window.ML = window.ML || {};
ML.renderBoard = function (main, f) {
  var issues = ML.filterIssuesBoard(ML.state.issues, f);
  var board = document.createElement("div");
  board.className = "ml-board";
  main.appendChild(board);
  if (!issues.length) {
    board.innerHTML = '<div class="ml-empty">No issues match these filters.</div>';
    return;
  }
  ML.mountColumn_backlog(board, issues);
  ML.mountColumn_todo(board, issues);
  ML.mountColumn_in_progress(board, issues);
  ML.mountColumn_done(board, issues);
};
""",
    )
    write(
        VIEWS / "list.js",
        r"""
window.ML = window.ML || {};
ML.renderList = function (main, f) {
  var issues = ML.filterIssuesList(ML.state.issues, f);
  var wrap = document.createElement("div");
  wrap.className = "ml-list ml-listwrap";
  var head = document.createElement("div");
  head.className = "ml-row ml-rowhead";
  head.innerHTML = "<span>ID</span><span>Title</span><span>Status</span><span>Priority</span><span>Assignee</span>";
  wrap.appendChild(head);
  if (!issues.length) {
    var empty = document.createElement("div");
    empty.className = "ml-empty";
    empty.textContent = "No issues match these filters.";
    wrap.appendChild(empty);
  } else {
    issues.forEach(function (iss) { wrap.appendChild(ML.renderListRow(iss)); });
  }
  main.appendChild(wrap);
};
""",
    )
    write(
        VIEWS / "detail.js",
        r"""
window.ML = window.ML || {};
ML.renderDetail = function (main, f) {
  var iss = ML.state.issues.filter(function (i) { return i.id === f.issueId; })[0];
  var box = document.createElement("div");
  box.className = "ml-detail";
  if (!iss) {
    box.innerHTML = '<p>Issue not found.</p><button class="btn-ghost" type="button" id="back">Back</button>';
    main.appendChild(box);
    box.querySelector("#back").onclick = function () { ML.writeHash({ view: "board", issueId: "" }); };
    return;
  }
  var userOpts = '<option value="">Unassigned</option>' + (ML.users || []).map(function (u) {
    return '<option value="' + u.id + '"' + (iss.assignee === u.id ? " selected" : "") + ">" + u.name + "</option>";
  }).join("");
  var labelBoxes = (ML.labels || []).map(function (l) {
    var on = (iss.labels || []).indexOf(l) !== -1;
    return '<label><input type="checkbox" data-label="' + l + '"' + (on ? " checked" : "") + "> " + l + "</label>";
  }).join(" ");
  box.innerHTML =
    '<p><button class="btn-ghost" type="button" id="back">Back to board</button></p>' +
    '<input class="title" value="' + iss.title.replace(/"/g, "&quot;") + '">' +
    "<textarea>" + iss.description.replace(/</g, "&lt;") + "</textarea>" +
    '<div class="grid">' +
    '<label>Status<select id="st">' +
    ["backlog","todo","in_progress","done"].map(function (s) {
      return "<option" + (iss.status === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select></label>" +
    '<label>Priority<select id="pr">' +
    ["low","medium","high","urgent"].map(function (s) {
      return "<option" + (iss.priority === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select></label>" +
    '<label>Assignee<select id="as">' + userOpts + "</select></label></div>" +
    "<p>Labels<br>" + labelBoxes + "</p>" +
    '<p><button type="button" class="btn-new" id="save">Save</button> ' +
    '<button type="button" class="btn-ghost" id="del">Delete</button></p>';
  main.appendChild(box);
  box.querySelector("#back").onclick = function () { ML.writeHash({ view: "board", issueId: "" }); };
  box.querySelector("#save").onclick = function () {
    iss.title = box.querySelector(".title").value.trim() || iss.title;
    iss.description = box.querySelector("textarea").value;
    iss.status = box.querySelector("#st").value;
    iss.priority = box.querySelector("#pr").value;
    iss.assignee = box.querySelector("#as").value;
    iss.labels = Array.prototype.map.call(box.querySelectorAll("input[data-label]:checked"), function (c) {
      return c.getAttribute("data-label");
    });
    iss.updatedAt = new Date().toISOString();
    ML.persist();
    ML.writeHash({ view: "board", issueId: "" });
  };
  box.querySelector("#del").onclick = function () {
    if (!confirm("Delete " + iss.id + "?")) return;
    ML.state.issues = ML.state.issues.filter(function (i) { return i.id !== iss.id; });
    ML.persist();
    ML.writeHash({ view: "board", issueId: "" });
  };
};
""",
    )
    write(
        JS / "modal.js",
        r"""
window.ML = window.ML || {};
ML.openCreate = function () {
  document.getElementById("ml-modal-bg").classList.remove("hidden");
  document.getElementById("ml-new-title").focus();
};
ML.closeCreate = function () {
  document.getElementById("ml-modal-bg").classList.add("hidden");
};
ML.submitCreate = function () {
  var title = document.getElementById("ml-new-title").value.trim();
  if (!title) return;
  var iss = {
    id: ML.nextId(),
    title: title,
    description: document.getElementById("ml-new-desc").value,
    status: document.getElementById("ml-new-status").value,
    priority: document.getElementById("ml-new-pri").value,
    assignee: document.getElementById("ml-new-as").value,
    labels: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  ML.state.issues.unshift(iss);
  ML.persist();
  ML.closeCreate();
  document.getElementById("ml-new-title").value = "";
  document.getElementById("ml-new-desc").value = "";
  ML.render();
};
""",
    )
    write(
        JS / "boot.js",
        r"""
window.ML = window.ML || {};
ML.render = function () {
  var f = ML.parseHash();
  document.querySelectorAll(".ml-nav").forEach(function (a) {
    a.classList.toggle("on", a.getAttribute("data-view") === f.view);
  });
  document.getElementById("ml-title").textContent =
    f.view === "issue" ? f.issueId : (f.view === "list" ? "Issues" : "Board");
  var filters = document.getElementById("ml-filter-host");
  var main = document.getElementById("ml-main");
  main.innerHTML = "";
  if (f.view === "issue") {
    filters.innerHTML = "";
    ML.renderDetail(main, f);
    return;
  }
  ML.mountFilters(filters, f);
  if (f.view === "list") ML.renderList(main, f);
  else ML.renderBoard(main, f);
};
ML.boot = function () {
  ML.hydrate();
  document.getElementById("ml-new").addEventListener("click", ML.openCreate);
  document.getElementById("ml-modal-cancel").addEventListener("click", ML.closeCreate);
  document.getElementById("ml-modal-save").addEventListener("click", ML.submitCreate);
  document.getElementById("ml-modal-bg").addEventListener("click", function (ev) {
    if (ev.target.id === "ml-modal-bg") ML.closeCreate();
  });
  document.querySelectorAll(".ml-nav").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      var f = ML.parseHash();
      ML.writeHash({
        view: a.getAttribute("data-view"), issueId: "",
        q: f.q, status: f.status, assignee: f.assignee, priority: f.priority
      });
    });
  });
  var as = document.getElementById("ml-new-as");
  (ML.users || []).forEach(function (u) {
    var o = document.createElement("option");
    o.value = u.id;
    o.textContent = u.name;
    as.appendChild(o);
  });
  window.addEventListener("hashchange", ML.render);
  if (!location.hash) location.hash = "/board";
  else ML.render();
};
document.addEventListener("DOMContentLoaded", ML.boot);
""",
    )

    css_hrefs = "\n".join(f'  <link rel="stylesheet" href="css/{name}">' for name in css_files)
    scripts = ["js/users.js", "js/labels.js"]
    for idx in range(1, len(ISSUES) + 1):
        scripts.append(f"js/seed/issue-{idx:02d}.js")
    scripts += [
        "js/storage-list.js",
        "js/storage-board.js",
        "js/messy-state.js",
        "js/messy-router.js",
        "js/filters-list.js",
        "js/filters-board.js",
        "js/cards/card-inner.js",
        "js/cards/card-board-backlog.js",
        "js/cards/card-board-todo.js",
        "js/cards/card-board-in_progress.js",
        "js/cards/card-board-done.js",
        "js/cards/card-list.js",
        "js/columns/col-backlog.js",
        "js/columns/col-todo.js",
        "js/columns/col-in_progress.js",
        "js/columns/col-done.js",
        "js/views/filters-ui.js",
        "js/views/board.js",
        "js/views/list.js",
        "js/views/detail.js",
        "js/modal.js",
        "js/boot.js",
    ]
    script_tags = "\n".join(f'  <script src="{s}"></script>' for s in scripts)

    write(
        ROOT / "messy.html",
        f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mini Linear (Session A)</title>
{css_hrefs}
</head>
<body class="ml-body">
  <div class="ml-banner">Session A messy build. Clean app: <a href="./index.html">index.html</a></div>
  <div class="ml-shell">
    <aside class="ml-side">
      <h1>Mini Linear</h1>
      <a class="ml-nav" data-view="board" href="#/board">Board</a>
      <a class="ml-nav" data-view="list" href="#/list">Issues</a>
    </aside>
    <div class="ml-main">
      <header class="ml-top">
        <h2 id="ml-title">Board</h2>
        <button type="button" class="btn-new" id="ml-new">New issue</button>
      </header>
      <div id="ml-filter-host"></div>
      <div id="ml-main"></div>
    </div>
  </div>
  <div id="ml-modal-bg" class="ml-modal-bg hidden">
    <div class="ml-modal" role="dialog" aria-labelledby="ml-modal-h">
      <h3 id="ml-modal-h">New issue</h3>
      <label>Title<input id="ml-new-title" required></label>
      <label>Description<textarea id="ml-new-desc"></textarea></label>
      <label>Status
        <select id="ml-new-status">
          <option value="backlog">backlog</option>
          <option value="todo" selected>todo</option>
          <option value="in_progress">in_progress</option>
          <option value="done">done</option>
        </select>
      </label>
      <label>Priority
        <select id="ml-new-pri">
          <option>low</option>
          <option selected>medium</option>
          <option>high</option>
          <option>urgent</option>
        </select>
      </label>
      <label>Assignee
        <select id="ml-new-as"><option value="">Unassigned</option></select>
      </label>
      <p>
        <button type="button" class="btn-new" id="ml-modal-save">Create</button>
        <button type="button" class="btn-ghost" id="ml-modal-cancel">Cancel</button>
      </p>
    </div>
  </div>
{script_tags}
</body>
</html>
""",
    )

    files = [p for p in ROOT.rglob("*") if p.is_file()]
    print("total files in mini-linear:", len(files))


if __name__ == "__main__":
    main()
