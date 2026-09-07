window.ML = window.ML || {};

ML.escape = function (s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
};

ML.cardInner = function (iss) {
  var u = ML.userById(iss.assignee);
  var labs = (iss.labels || []).map(function (l) {
    return '<span class="pill pill-' + l + '">' + ML.escape(l) + "</span>";
  }).join(" ");
  return (
    "<h4>" + ML.escape(iss.title) + "</h4>" +
    '<div class="meta"><span>' + ML.escape(iss.id) + '</span>' +
    '<span class="pri-' + iss.priority + '">' + ML.escape(iss.priority) + "</span>" +
    labs +
    (u
      ? '<span class="av" title="' + ML.escape(u.name) + '">' + ML.escape(u.initials) + "</span>"
      : "<span>unassigned</span>") +
    "</div>"
  );
};

ML.mountFilters = function (host, f) {
  host.innerHTML =
    '<div class="filters">' +
    '<input type="search" placeholder="Search" value="' + ML.escape(f.q) + '">' +
    '<select data-k="status"><option value="">All statuses</option>' +
    ["backlog", "todo", "in_progress", "done"].map(function (s) {
      return '<option value="' + s + '"' + (f.status === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select>" +
    '<select data-k="assignee"><option value="">All assignees</option>' +
    ML.USERS.map(function (u) {
      return '<option value="' + u.id + '"' + (f.assignee === u.id ? " selected" : "") + ">" + ML.escape(u.name) + "</option>";
    }).join("") + "</select>" +
    '<select data-k="priority"><option value="">All priorities</option>' +
    ["urgent", "high", "medium", "low"].map(function (s) {
      return '<option value="' + s + '"' + (f.priority === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select></div>";
  var search = host.querySelector("input");
  search.addEventListener("input", function () {
    ML.writeHash({ q: search.value });
  });
  host.querySelectorAll("select").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var patch = {};
      patch[sel.getAttribute("data-k")] = sel.value;
      ML.writeHash(patch);
    });
  });
};

ML.renderBoard = function (main, f) {
  var issues = ML.filterIssues(f);
  var board = document.createElement("div");
  board.className = "board";
  if (!issues.length) {
    board.innerHTML = '<div class="empty">No issues match these filters.</div>';
    main.appendChild(board);
    return;
  }
  [
    ["backlog", "Backlog"],
    ["todo", "Todo"],
    ["in_progress", "In progress"],
    ["done", "Done"]
  ].forEach(function (pair) {
    var status = pair[0];
    var label = pair[1];
    var col = document.createElement("section");
    col.className = "col col-" + status;
    col.dataset.status = status;
    var filtered = issues.filter(function (i) { return i.status === status; });
    col.innerHTML = "<h3>" + label + " (" + filtered.length + ")</h3>";
    filtered.forEach(function (iss) {
      var el = document.createElement("article");
      el.className = "card";
      el.draggable = true;
      el.dataset.id = iss.id;
      el.innerHTML = ML.cardInner(iss);
      el.addEventListener("click", function () {
        ML.writeHash({ view: "issue", issueId: iss.id });
      });
      el.addEventListener("dragstart", function (ev) {
        ev.dataTransfer.setData("text/plain", iss.id);
        ev.dataTransfer.effectAllowed = "move";
      });
      col.appendChild(el);
    });
    col.addEventListener("dragover", function (ev) {
      ev.preventDefault();
      col.classList.add("over");
    });
    col.addEventListener("dragleave", function () { col.classList.remove("over"); });
    col.addEventListener("drop", function (ev) {
      ev.preventDefault();
      col.classList.remove("over");
      var id = ev.dataTransfer.getData("text/plain");
      ML.setStatus(id, status);
      ML.render();
    });
    board.appendChild(col);
  });
  main.appendChild(board);
};

ML.renderList = function (main, f) {
  var issues = ML.filterIssues(f);
  var wrap = document.createElement("div");
  wrap.className = "list";
  var head = document.createElement("div");
  head.className = "row rowhead";
  head.innerHTML = "<span>ID</span><span>Title</span><span>Status</span><span>Priority</span><span>Assignee</span>";
  wrap.appendChild(head);
  if (!issues.length) {
    var empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No issues match these filters.";
    wrap.appendChild(empty);
  } else {
    issues.forEach(function (iss) {
      var u = ML.userById(iss.assignee);
      var el = document.createElement("div");
      el.className = "row";
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.innerHTML =
        "<span>" + ML.escape(iss.id) + "</span><span>" + ML.escape(iss.title) + "</span><span>" +
        ML.escape(iss.status) + "</span><span class='pri-" + iss.priority + "'>" + ML.escape(iss.priority) +
        "</span><span>" + ML.escape(u ? u.name : "Unassigned") + "</span>";
      el.addEventListener("click", function () {
        ML.writeHash({ view: "issue", issueId: iss.id });
      });
      wrap.appendChild(el);
    });
  }
  main.appendChild(wrap);
};

ML.renderDetail = function (main, f) {
  var iss = ML.state.issues.filter(function (i) { return i.id === f.issueId; })[0];
  var box = document.createElement("div");
  box.className = "detail";
  if (!iss) {
    box.innerHTML = '<p>Issue not found.</p><button class="btn-ghost" type="button" id="back">Back</button>';
    main.appendChild(box);
    box.querySelector("#back").onclick = function () { ML.writeHash({ view: "board", issueId: "" }); };
    return;
  }
  var userOpts = '<option value="">Unassigned</option>' + ML.USERS.map(function (u) {
    return '<option value="' + u.id + '"' + (iss.assignee === u.id ? " selected" : "") + ">" + ML.escape(u.name) + "</option>";
  }).join("");
  var labelBoxes = ML.LABELS.map(function (l) {
    var on = (iss.labels || []).indexOf(l) !== -1;
    return '<label><input type="checkbox" data-label="' + l + '"' + (on ? " checked" : "") + "> " + l + "</label>";
  }).join(" ");
  box.innerHTML =
    '<p><button class="btn-ghost" type="button" id="back">Back to board</button></p>' +
    '<input class="title" value="' + ML.escape(iss.title) + '">' +
    "<textarea>" + ML.escape(iss.description) + "</textarea>" +
    '<div class="grid">' +
    "<label>Status<select id=\"st\">" +
    ["backlog", "todo", "in_progress", "done"].map(function (s) {
      return "<option" + (iss.status === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select></label>" +
    "<label>Priority<select id=\"pr\">" +
    ["low", "medium", "high", "urgent"].map(function (s) {
      return "<option" + (iss.priority === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select></label>" +
    "<label>Assignee<select id=\"as\">" + userOpts + "</select></label></div>" +
    "<p>Labels<br>" + labelBoxes + "</p>" +
    '<p><button type="button" class="btn" id="save">Save</button> ' +
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
    ML.upsert(iss);
    ML.writeHash({ view: "board", issueId: "" });
  };
  box.querySelector("#del").onclick = function () {
    if (!confirm("Delete " + iss.id + "?")) return;
    ML.remove(iss.id);
    ML.writeHash({ view: "board", issueId: "" });
  };
};

ML.openCreate = function () {
  document.getElementById("modal-bg").hidden = false;
  document.getElementById("new-title").focus();
};

ML.closeCreate = function () {
  document.getElementById("modal-bg").hidden = true;
};

ML.submitCreate = function () {
  var title = document.getElementById("new-title").value.trim();
  if (!title) return;
  ML.upsert({
    id: ML.nextId(),
    title: title,
    description: document.getElementById("new-desc").value,
    status: document.getElementById("new-status").value,
    priority: document.getElementById("new-pri").value,
    assignee: document.getElementById("new-as").value,
    labels: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  ML.closeCreate();
  document.getElementById("new-title").value = "";
  document.getElementById("new-desc").value = "";
  ML.render();
};

ML.render = function () {
  var f = ML.parseHash();
  document.querySelectorAll("[data-view]").forEach(function (a) {
    a.classList.toggle("on", a.getAttribute("data-view") === f.view);
  });
  document.getElementById("title").textContent =
    f.view === "issue" ? f.issueId : (f.view === "list" ? "Issues" : "Board");
  var filters = document.getElementById("filters");
  var main = document.getElementById("view");
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
  document.getElementById("new").addEventListener("click", ML.openCreate);
  document.getElementById("modal-cancel").addEventListener("click", ML.closeCreate);
  document.getElementById("modal-save").addEventListener("click", ML.submitCreate);
  document.getElementById("modal-bg").addEventListener("click", function (ev) {
    if (ev.target.id === "modal-bg") ML.closeCreate();
  });
  document.querySelectorAll("[data-view]").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      ML.writeHash({ view: a.getAttribute("data-view"), issueId: "" });
    });
  });
  var as = document.getElementById("new-as");
  ML.USERS.forEach(function (u) {
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
