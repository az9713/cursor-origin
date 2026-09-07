window.ML = window.ML || {};

ML.STORE_KEY = "mini-linear-v1";

ML.USERS = [
  { id: "ada", name: "Ada L.", initials: "AL" },
  { id: "linus", name: "Linus T.", initials: "LT" },
  { id: "grace", name: "Grace H.", initials: "GH" },
  { id: "tomas", name: "Tomas C.", initials: "TC" },
  { id: "mei", name: "Mei W.", initials: "MW" }
];

ML.LABELS = ["bug", "feature", "design", "infra", "docs", "perf"];

ML.SEED = [
  ["LIN-1", "Auth token refresh races the login form", "backlog", "high", "ada", ["bug", "infra"], "Two tabs can mint overlapping refresh tokens."],
  ["LIN-2", "Board column headers clip at 1280px", "todo", "medium", "mei", ["bug", "design"], "In progress label truncates on laptop screens."],
  ["LIN-3", "Deep links drop assignee filter", "in_progress", "urgent", "linus", ["bug"], "Reloading #/board?assignee=ada shows everyone."],
  ["LIN-4", "Keyboard shortcut for new issue", "todo", "low", "grace", ["feature"], "Match Linear: C creates an issue."],
  ["LIN-5", "Empty state illustration is a broken SVG", "done", "low", "tomas", ["design"], "Replace with CSS-only empty state."],
  ["LIN-6", "Seed data should survive storage wipe", "backlog", "medium", "ada", ["infra"], "Add a Reset demo button that reloads seeds."],
  ["LIN-7", "Drag preview uses the wrong card skin", "in_progress", "high", "mei", ["bug", "design"], "List row ghost appears on the board."],
  ["LIN-8", "Priority urgent is not sorted first", "todo", "high", "linus", ["feature"], "List view should pin urgent above high."],
  ["LIN-9", "localStorage quota error is silent", "backlog", "medium", "tomas", ["infra"], "Show a toast when setItem throws."],
  ["LIN-10", "Filter chips do not wrap on mobile", "todo", "medium", "grace", ["design"], "Horizontal scroll is worse than wrap."],
  ["LIN-11", "Assignee avatar missing title attribute", "done", "low", "mei", ["bug", "docs"], "Hover should show full name."],
  ["LIN-12", "Cannot unassign from the detail pane", "in_progress", "high", "ada", ["bug"], "Empty option is missing from the select."],
  ["LIN-13", "CSV export of the current filter", "backlog", "low", "linus", ["feature"], "Out of scope for v1 but keep the issue."],
  ["LIN-14", "Column counts ignore active search", "todo", "urgent", "tomas", ["bug"], "Header says 8 while three cards are visible."],
  ["LIN-15", "Markdown in descriptions renders raw", "backlog", "low", "grace", ["feature", "docs"], "Stay plaintext for this bake-off."],
  ["LIN-16", "Done column should collapse on small screens", "todo", "medium", "mei", ["design"], "Stack columns; do not shrink cards to unreadability."],
  ["LIN-17", "Create modal does not trap focus", "in_progress", "high", "ada", ["bug"], "Tab escapes into the board."],
  ["LIN-18", "Duplicate LIN ids after reset", "done", "urgent", "linus", ["bug", "infra"], "Counter must start from max existing id."],
  ["LIN-19", "Label colors disagree between list and board", "todo", "low", "tomas", ["design"], "Copy-pasted CSS, two palettes."],
  ["LIN-20", "Search should match description too", "backlog", "medium", "grace", ["feature"], "Title-only search hides LIN-1."],
  ["LIN-21", "Hash router fights with Pages base path", "in_progress", "high", "mei", ["infra"], "App lives in /mini-linear/ on GitHub Pages."],
  ["LIN-22", "Dropping a card on padding does nothing", "todo", "medium", "ada", ["bug"], "Column hit target is only the card stack."],
  ["LIN-23", "First-run seed is only 8 issues", "done", "low", "linus", ["docs"], "Need ~24 for a believable board."],
  ["LIN-24", "Delete confirm is a native alert", "backlog", "low", "tomas", ["design"], "Keep alert for Session A; replace later if time."],
  ["LIN-25", "Priority filter does not compose with status", "in_progress", "urgent", "grace", ["bug"], "AND vs OR is inconsistent across views."],
  ["LIN-26", "List row click target is only the title", "todo", "medium", "mei", ["bug"], "Whole row should open detail."],
  ["LIN-27", "Back from detail should restore scroll", "backlog", "low", "ada", ["feature"], "Nice-to-have; do not block Session C."],
  ["LIN-28", "Safari drag ghost offset", "todo", "high", "linus", ["bug"], "Card jumps 40px left on dragstart."]
];

ML.state = { issues: [], nextN: 29 };

ML.userById = function (id) {
  return ML.USERS.filter(function (u) { return u.id === id; })[0] || null;
};

ML.persist = function () {
  try {
    localStorage.setItem(ML.STORE_KEY, JSON.stringify({
      issues: ML.state.issues,
      nextN: ML.state.nextN
    }));
  } catch (err) {
    console.warn("mini-linear persist failed", err);
  }
};

ML.hydrate = function () {
  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(ML.STORE_KEY) || "null");
  } catch (err) {
    saved = null;
  }
  if (saved && Array.isArray(saved.issues) && saved.issues.length) {
    ML.state.issues = saved.issues;
    ML.state.nextN = saved.nextN || ML.maxId() + 1;
    return;
  }
  ML.state.issues = ML.SEED.map(function (row, i) {
    return {
      id: row[0],
      title: row[1],
      status: row[2],
      priority: row[3],
      assignee: row[4],
      labels: row[5].slice(),
      description: row[6],
      createdAt: "2026-08-" + String((i % 28) + 1).padStart(2, "0") + "T12:00:00.000Z",
      updatedAt: "2026-09-01T08:" + String(i % 50).padStart(2, "0") + ":00.000Z"
    };
  });
  ML.state.nextN = ML.maxId() + 1;
  ML.persist();
};

ML.maxId = function () {
  var max = 0;
  ML.state.issues.forEach(function (iss) {
    var n = parseInt(String(iss.id).replace(/^LIN-/, ""), 10);
    if (n > max) max = n;
  });
  return max;
};

ML.nextId = function () {
  var n = Math.max(ML.state.nextN, ML.maxId() + 1);
  ML.state.nextN = n + 1;
  return "LIN-" + n;
};

ML.filterIssues = function (f) {
  return ML.state.issues.filter(function (iss) {
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

ML.upsert = function (iss) {
  iss.updatedAt = new Date().toISOString();
  var i = ML.state.issues.findIndex(function (x) { return x.id === iss.id; });
  if (i === -1) ML.state.issues.unshift(iss);
  else ML.state.issues[i] = iss;
  ML.persist();
};

ML.remove = function (id) {
  ML.state.issues = ML.state.issues.filter(function (i) { return i.id !== id; });
  ML.persist();
};

ML.setStatus = function (id, status) {
  var iss = ML.state.issues.filter(function (i) { return i.id === id; })[0];
  if (!iss) return;
  iss.status = status;
  iss.updatedAt = new Date().toISOString();
  ML.persist();
};
