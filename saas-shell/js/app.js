window.IC = window.IC || {};

IC.NAV = [
  { view: "dashboard", label: "Dashboard" },
  { view: "incidents", label: "Incidents" },
  { view: "team", label: "Team" },
  { view: "oncall", label: "On-call" },
  { view: "settings", label: "Settings" }
];

IC.esc = function (s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
};

IC.badgeSev = function (s) {
  return '<span class="badge sev-' + s + '">' + IC.esc(s) + "</span>";
};

IC.badgeSt = function (s) {
  return '<span class="badge st-' + s + '">' + IC.esc(s) + "</span>";
};

IC.renderNav = function (route) {
  document.getElementById("nav").innerHTML = IC.NAV.map(function (item) {
    var on = route.view === item.view ||
      ((route.view === "incident" || route.view === "war-room") && item.view === "incidents") ||
      (route.view === "search" && item.view === "incidents");
    return '<a class="nav-link' + (on ? " active" : "") + '" href="#/' + item.view + '">' +
      '<span class="nav-icon" aria-hidden="true">·</span>' + item.label + "</a>";
  }).join("");
};

IC.viewDashboard = function () {
  var active = IC.activeIncidentCount();
  var crit = IC.state.incidents.filter(function (i) { return i.severity === "critical" && i.status !== "resolved"; }).length;
  var resolved = IC.state.incidents.filter(function (i) { return i.status === "resolved"; }).length;
  var rows = IC.state.incidents.filter(function (i) { return i.status !== "resolved"; }).map(function (inc) {
    return "<tr data-id=\"" + inc.id + "\"><td>" + IC.esc(inc.id) + "</td><td>" + IC.esc(inc.title) +
      "</td><td>" + IC.badgeSev(inc.severity) + "</td><td>" + IC.badgeSt(inc.status) +
      "</td><td>" + IC.esc((IC.memberById(inc.assignee) || {}).name || "—") + "</td></tr>";
  }).join("");
  var activity = [];
  Object.keys(IC.state.timeline).forEach(function (id) {
    IC.state.timeline[id].forEach(function (ev) {
      activity.push({ id: id, ev: ev });
    });
  });
  activity.sort(function (a, b) { return a.ev.at < b.ev.at ? 1 : -1; });
  var feed = activity.slice(0, 6).map(function (a) {
    return "<li><div class=\"time\">" + IC.formatTime(a.ev.at) + "</div>" +
      "<div class=\"event-title\">" + IC.esc(a.id) + " · " + IC.esc(a.ev.title) + "</div>" +
      "<div class=\"event-body\">" + IC.esc(a.ev.body) + "</div></li>";
  }).join("");
  return '<div class="page-head"><div><h1>Dashboard</h1><p>' +
    IC.esc(IC.state.settings.workspace) + " · live workspace</p></div></div>" +
    '<div class="card-grid">' +
    '<article class="stat-card"><div class="label">Active</div><div class="value">' + active + '</div><div class="delta">open / investigating / mitigated</div></article>' +
    '<article class="stat-card"><div class="label">Critical</div><div class="value">' + crit + '</div><div class="delta">unresolved</div></article>' +
    '<article class="stat-card"><div class="label">Resolved</div><div class="value">' + resolved + '</div><div class="delta">this seed set</div></article>' +
    '<article class="stat-card"><div class="label">On-call</div><div class="value">' +
    IC.esc((IC.memberById((IC.state.oncall[IC.state.oncall.length - 1] || {}).primary) || {}).initials || "—") +
    '</div><div class="delta">primary today</div></article></div>' +
    '<div class="split-grid"><div class="panel"><div class="panel-head"><h2>Active incidents</h2></div>' +
    (rows
      ? '<table class="data-table"><thead><tr><th>ID</th><th>Title</th><th>Sev</th><th>Status</th><th>Owner</th></tr></thead><tbody>' + rows + "</tbody></table>"
      : '<div class="panel-body padded"><p class="state-empty">No active incidents.</p></div>') +
    '</div><div class="panel"><div class="panel-head"><h2>Recent activity</h2></div>' +
    '<ul class="timeline">' + feed + "</ul></div></div>";
};

IC.viewIncidents = function (route) {
  var list = IC.filterIncidents(route);
  var rows = list.map(function (inc) {
    return "<tr data-id=\"" + inc.id + "\"><td>" + IC.esc(inc.id) + "</td><td>" + IC.esc(inc.title) +
      "</td><td>" + IC.esc(inc.service) + "</td><td>" + IC.badgeSev(inc.severity) +
      "</td><td>" + IC.badgeSt(inc.status) + "</td></tr>";
  }).join("");
  return '<div class="page-head"><div><h1>Incidents</h1><p>Filter by status, severity, or search.</p></div></div>' +
    '<div class="filters">' +
    '<input type="search" data-k="q" placeholder="Search" value="' + IC.esc(route.q) + '">' +
    '<select data-k="status"><option value="">All statuses</option>' +
    ["open", "investigating", "mitigated", "resolved"].map(function (s) {
      return '<option' + (route.status === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select>" +
    '<select data-k="severity"><option value="">All severities</option>' +
    ["critical", "high", "medium", "low"].map(function (s) {
      return '<option' + (route.severity === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select></div>" +
    (rows
      ? '<div class="panel"><table class="data-table"><thead><tr><th>ID</th><th>Title</th><th>Service</th><th>Sev</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
      : '<div class="panel"><div class="panel-body padded"><p class="state-empty">No incidents match these filters.</p></div></div>');
};

IC.viewIncident = function (route) {
  var inc = IC.incidentById(route.id);
  if (!inc) {
    return '<div class="page-head"><div><h1>Incident not found</h1><p class="state-empty">Unknown id.</p></div></div>' +
      '<a class="btn" href="#/incidents">Back to list</a>';
  }
  var owner = IC.memberById(inc.assignee);
  return '<div class="breadcrumb"><a href="#/incidents">Incidents</a> / ' + IC.esc(inc.id) + "</div>" +
    '<div class="page-head"><div><h1>' + IC.esc(inc.title) + "</h1><p>" +
    IC.badgeSev(inc.severity) + " " + IC.badgeSt(inc.status) + " · " + IC.esc(inc.service) +
    "</p></div><div class=\"btn-group\">" +
    '<a class="btn-primary" href="#/war-room/' + encodeURIComponent(inc.id) + '">War room</a>' +
    '<button type="button" class="btn" data-status="investigating">Investigating</button>' +
    '<button type="button" class="btn" data-status="mitigated">Mitigated</button>' +
    '<button type="button" class="btn" data-status="resolved">Resolve</button></div></div>' +
    '<div class="panel"><div class="panel-body padded">' +
    "<p>" + IC.esc(inc.description) + "</p>" +
    "<p>Commander: " + IC.esc((IC.memberById(inc.commander) || {}).name || "—") +
    " · Assignee: " + IC.esc((owner || {}).name || "—") +
    " · Updated " + IC.formatTime(inc.updatedAt) + "</p></div></div>";
};

IC.viewWarRoom = function (route) {
  var inc = IC.incidentById(route.id);
  if (!inc) return IC.viewIncident(route);
  var events = (IC.state.timeline[inc.id] || []).slice().reverse().map(function (ev) {
    return "<li><div class=\"time\">" + IC.formatTime(ev.at) + " · " +
      IC.esc((IC.memberById(ev.author) || {}).name || ev.author) + "</div>" +
      "<div class=\"event-title\">" + IC.esc(ev.title) + "</div>" +
      "<div class=\"event-body\">" + IC.esc(ev.body) + "</div></li>";
  }).join("");
  var checks = (IC.state.warRoomChecklists[inc.id] || []).map(function (c) {
    return '<li><label><input type="checkbox" data-check="' + c.id + '"' +
      (c.done ? " checked" : "") + "> " + IC.esc(c.text) + "</label></li>";
  }).join("");
  return '<div class="breadcrumb"><a href="#/incident/' + encodeURIComponent(inc.id) + '">' +
    IC.esc(inc.id) + "</a> / War room</div>" +
    '<div class="page-head"><div><h1>War room</h1><p>' + IC.esc(inc.title) + "</p></div></div>" +
    '<div class="split-grid"><div class="panel"><div class="panel-head"><h2>Timeline</h2></div>' +
    '<ul class="timeline">' + (events || "<li>No events yet.</li>") + "</ul>" +
    '<div class="panel-body padded"><input id="note-title" placeholder="Title">' +
    '<textarea id="note-body" placeholder="Note"></textarea>' +
    '<button type="button" class="btn-primary" id="add-note">Add note</button></div></div>' +
    '<div class="panel"><div class="panel-head"><h2>Checklist</h2></div>' +
    (checks ? '<ul class="checklist">' + checks + "</ul>" :
      '<div class="panel-body padded"><p class="state-empty">No checklist for this incident.</p></div>') +
    "</div></div>";
};

IC.viewTeam = function () {
  var cards = IC.state.team.map(function (m) {
    return '<article class="stat-card"><div class="label">' + IC.esc(m.role) +
      '</div><div class="value" style="font-size:18px">' + IC.esc(m.name) +
      '</div><div class="delta">' + IC.esc(m.timezone) + "</div></article>";
  }).join("");
  return '<div class="page-head"><div><h1>Team</h1><p>Roster for this workspace.</p></div></div>' +
    '<div class="card-grid">' + cards + "</div>";
};

IC.viewOncall = function () {
  var rows = IC.state.oncall.map(function (d) {
    return "<tr><td>" + IC.formatDate(d.date) + "</td><td>" +
      IC.esc((IC.memberById(d.primary) || {}).name || d.primary) + "</td><td>" +
      IC.esc((IC.memberById(d.secondary) || {}).name || d.secondary) + "</td></tr>";
  }).join("");
  return '<div class="page-head"><div><h1>On-call</h1><p>Primary and secondary by day.</p></div></div>' +
    '<div class="panel"><table class="data-table"><thead><tr><th>Date</th><th>Primary</th><th>Secondary</th></tr></thead><tbody>' +
    rows + "</tbody></table></div>";
};

IC.viewSettings = function () {
  var s = IC.state.settings;
  return '<div class="page-head"><div><h1>Settings</h1><p>Persisted in localStorage.</p></div></div>' +
    '<div class="panel"><div class="panel-body padded">' +
    '<label>Workspace <input id="set-ws" value="' + IC.esc(s.workspace) + '"></label>' +
    '<label>Runbook URL <input id="set-rb" value="' + IC.esc(s.runbookUrl) + '"></label>' +
    '<label><input type="checkbox" id="set-email"' + (s.notifyEmail ? " checked" : "") + "> Email notify</label>" +
    '<label><input type="checkbox" id="set-slack"' + (s.notifySlack ? " checked" : "") + "> Slack notify</label>" +
    '<label><input type="checkbox" id="set-page"' + (s.autoPage ? " checked" : "") + "> Auto-page</label>" +
    '<p><button type="button" class="btn-primary" id="save-settings">Save</button></p></div></div>';
};

IC.viewSearch = function (route) {
  var hits = IC.searchAll(route.q);
  var rows = hits.map(function (h) {
    var href = h.type === "incident" ? "#/incident/" + encodeURIComponent(h.id) : "#/team";
    return "<tr data-href=\"" + href + "\"><td>" + IC.esc(h.type) + "</td><td>" +
      IC.esc(h.title) + "</td><td>" + IC.esc(h.snippet) + "</td></tr>";
  }).join("");
  return '<div class="page-head"><div><h1>Search</h1><p>' +
    (route.q ? "Results for “" + IC.esc(route.q) + "”" : "Type a query in the top bar.") +
    "</p></div></div>" +
    (hits.length
      ? '<div class="panel"><table class="data-table"><thead><tr><th>Type</th><th>Match</th><th>Meta</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
      : '<div class="panel"><div class="panel-body padded"><p class="state-empty">' +
        (route.q ? "No matches." : "Empty query.") + "</p></div></div>");
};

IC.render = function () {
  var route = IC.parseHash();
  IC.renderNav(route);
  var pill = document.getElementById("status-pill");
  var crit = IC.state.incidents.some(function (i) {
    return i.severity === "critical" && i.status !== "resolved";
  });
  pill.textContent = crit ? "Active critical incident" : "All systems nominal";
  pill.classList.toggle("critical", crit);
  var html;
  if (route.view === "dashboard") html = IC.viewDashboard();
  else if (route.view === "incidents") html = IC.viewIncidents(route);
  else if (route.view === "incident") html = IC.viewIncident(route);
  else if (route.view === "war-room") html = IC.viewWarRoom(route);
  else if (route.view === "team") html = IC.viewTeam();
  else if (route.view === "oncall") html = IC.viewOncall();
  else if (route.view === "settings") html = IC.viewSettings();
  else html = IC.viewSearch(route);
  document.getElementById("content").innerHTML = html;
  IC.bindView(route);
};

IC.bindView = function (route) {
  document.querySelectorAll(".data-table tbody tr[data-id]").forEach(function (tr) {
    tr.addEventListener("click", function () {
      IC.navTo("incident", tr.getAttribute("data-id"));
    });
  });
  document.querySelectorAll(".data-table tbody tr[data-href]").forEach(function (tr) {
    tr.addEventListener("click", function () { location.hash = tr.getAttribute("data-href").replace(/^#/, ""); });
  });
  document.querySelectorAll(".filters [data-k]").forEach(function (el) {
    el.addEventListener("change", function () {
      var patch = {};
      patch[el.getAttribute("data-k")] = el.value;
      IC.writeHash(patch);
    });
    if (el.tagName === "INPUT") {
      el.addEventListener("input", function () {
        var patch = {};
        patch[el.getAttribute("data-k")] = el.value;
        IC.writeHash(patch);
      });
    }
  });
  document.querySelectorAll("[data-status]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      IC.updateIncidentStatus(route.id, btn.getAttribute("data-status"));
      IC.render();
    });
  });
  var add = document.getElementById("add-note");
  if (add) {
    add.addEventListener("click", function () {
      var title = document.getElementById("note-title").value.trim();
      var body = document.getElementById("note-body").value.trim();
      if (!title) return;
      IC.addTimelineEvent(route.id, title, body, "alex");
      IC.render();
    });
  }
  document.querySelectorAll("[data-check]").forEach(function (box) {
    box.addEventListener("change", function () {
      IC.toggleChecklist(route.id, box.getAttribute("data-check"));
    });
  });
  var save = document.getElementById("save-settings");
  if (save) {
    save.addEventListener("click", function () {
      IC.updateSettings({
        workspace: document.getElementById("set-ws").value.trim() || IC.state.settings.workspace,
        runbookUrl: document.getElementById("set-rb").value.trim(),
        notifyEmail: document.getElementById("set-email").checked,
        notifySlack: document.getElementById("set-slack").checked,
        autoPage: document.getElementById("set-page").checked
      });
      IC.render();
    });
  }
};

IC.boot = function () {
  IC.load();
  document.getElementById("search-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    IC.writeHash({ view: "search", q: document.getElementById("global-search").value.trim() });
  });
  document.getElementById("help-btn").onclick = function () {
    document.getElementById("help-modal").showModal();
  };
  document.getElementById("help-close").onclick = function () {
    document.getElementById("help-modal").close();
  };
  document.getElementById("reset-btn").onclick = function () {
    IC.reset();
    IC.render();
  };
  var pending = "";
  window.addEventListener("keydown", function (ev) {
    var tag = (ev.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") {
      if (ev.key === "Escape") ev.target.blur();
      return;
    }
    if (ev.key === "?") {
      ev.preventDefault();
      document.getElementById("help-modal").showModal();
      return;
    }
    if (ev.key === "/") {
      ev.preventDefault();
      document.getElementById("global-search").focus();
      return;
    }
    if (ev.key === "Escape") {
      var modal = document.getElementById("help-modal");
      if (modal.open) modal.close();
      return;
    }
    if (ev.key === "g") { pending = "g"; return; }
    if (pending === "g") {
      pending = "";
      if (ev.key === "d") IC.navTo("dashboard");
      else if (ev.key === "i") IC.navTo("incidents");
      else if (ev.key === "t") IC.navTo("team");
      else if (ev.key === "s") IC.navTo("settings");
    }
  });
  window.addEventListener("hashchange", IC.render);
  if (!location.hash) location.hash = "/dashboard";
  else IC.render();
};

document.addEventListener("DOMContentLoaded", IC.boot);
