window.IC = window.IC || {};

IC.STORE = "saas-shell-v1";

IC.now = function () {
  return new Date().toISOString();
};

IC.seed = function () {
  var team = [
    { id: "alex", name: "Alex Rivera", role: "Incident Commander", initials: "AR", timezone: "America/Los_Angeles" },
    { id: "mei", name: "Mei Chen", role: "Platform Engineer", initials: "MC", timezone: "America/New_York" },
    { id: "sam", name: "Sam Okonkwo", role: "SRE Lead", initials: "SO", timezone: "Europe/London" },
    { id: "jordan", name: "Jordan Lee", role: "Backend Engineer", initials: "JL", timezone: "America/Chicago" },
    { id: "priya", name: "Priya Sharma", role: "Customer Support", initials: "PS", timezone: "Asia/Kolkata" },
    { id: "taylor", name: "Taylor Brooks", role: "Security Engineer", initials: "TB", timezone: "America/Denver" }
  ];

  var incidents = [
    {
      id: "INC-1042",
      title: "Payment API latency spike in us-east-1",
      severity: "critical",
      status: "investigating",
      service: "payments-api",
      assignee: "sam",
      commander: "alex",
      createdAt: "2026-09-07T14:22:00.000Z",
      updatedAt: "2026-09-07T15:01:00.000Z",
      description: "P99 latency jumped from 180ms to 2.4s starting ~14:15 UTC. Error rate at 3.2% on checkout endpoints. Suspected DB connection pool exhaustion after deploy v2.14.3."
    },
    {
      id: "INC-1041",
      title: "Auth token refresh failures",
      severity: "high",
      status: "mitigated",
      service: "auth-gateway",
      assignee: "mei",
      commander: "alex",
      createdAt: "2026-09-07T09:10:00.000Z",
      updatedAt: "2026-09-07T11:45:00.000Z",
      description: "Intermittent 401s on token refresh after Redis failover. Mitigated by rolling back config change. Root cause investigation ongoing."
    },
    {
      id: "INC-1040",
      title: "Webhook delivery backlog",
      severity: "medium",
      status: "open",
      service: "webhooks-worker",
      assignee: "jordan",
      commander: "sam",
      createdAt: "2026-09-07T07:30:00.000Z",
      updatedAt: "2026-09-07T07:30:00.000Z",
      description: "Queue depth exceeded 50k messages. Consumer pods scaled but lag persists. No customer-visible impact yet."
    },
    {
      id: "INC-1039",
      title: "Dashboard load errors in EU region",
      severity: "low",
      status: "resolved",
      service: "analytics-ui",
      assignee: "priya",
      commander: "sam",
      createdAt: "2026-09-06T16:00:00.000Z",
      updatedAt: "2026-09-06T18:20:00.000Z",
      description: "CDN cache invalidation caused stale bundle references. Fixed by purging edge cache and redeploying static assets."
    },
    {
      id: "INC-1038",
      title: "Elevated failed login attempts",
      severity: "medium",
      status: "resolved",
      service: "auth-gateway",
      assignee: "taylor",
      commander: "alex",
      createdAt: "2026-09-05T22:00:00.000Z",
      updatedAt: "2026-09-06T01:15:00.000Z",
      description: "Credential stuffing attack blocked by rate limiter. No successful breaches. Added IP blocklist entries."
    }
  ];

  var timeline = {
    "INC-1042": [
      { at: "2026-09-07T14:22:00.000Z", title: "Incident declared", body: "Pager triggered on P99 > 2s for 5 min.", author: "alex" },
      { at: "2026-09-07T14:28:00.000Z", title: "War room opened", body: "Bridge link posted to #incidents.", author: "alex" },
      { at: "2026-09-07T14:35:00.000Z", title: "Hypothesis: connection pool", body: "DB metrics show pool at 98% utilization.", author: "sam" },
      { at: "2026-09-07T14:50:00.000Z", title: "Rollback initiated", body: "Reverting payments-api to v2.14.2.", author: "mei" },
      { at: "2026-09-07T15:01:00.000Z", title: "Monitoring rollback", body: "Latency trending down but still elevated.", author: "sam" }
    ],
    "INC-1041": [
      { at: "2026-09-07T09:10:00.000Z", title: "Incident declared", body: "Auth refresh error rate > 1%.", author: "alex" },
      { at: "2026-09-07T10:00:00.000Z", title: "Config rollback", body: "Redis sentinel config reverted.", author: "mei" },
      { at: "2026-09-07T11:45:00.000Z", title: "Mitigated", body: "Error rate back to baseline.", author: "alex" }
    ],
    "INC-1040": [
      { at: "2026-09-07T07:30:00.000Z", title: "Incident declared", body: "Queue depth alert fired.", author: "sam" }
    ],
    "INC-1039": [
      { at: "2026-09-06T16:00:00.000Z", title: "Incident declared", body: "EU users reporting blank dashboard.", author: "sam" },
      { at: "2026-09-06T18:20:00.000Z", title: "Resolved", body: "CDN purge complete.", author: "priya" }
    ],
    "INC-1038": [
      { at: "2026-09-05T22:00:00.000Z", title: "Incident declared", body: "Security alert: brute force pattern.", author: "taylor" },
      { at: "2026-09-06T01:15:00.000Z", title: "Resolved", body: "Attack mitigated, no breach.", author: "taylor" }
    ]
  };

  var oncall = [
    { date: "2026-09-01", primary: "sam", secondary: "mei" },
    { date: "2026-09-02", primary: "mei", secondary: "jordan" },
    { date: "2026-09-03", primary: "jordan", secondary: "alex" },
    { date: "2026-09-04", primary: "alex", secondary: "taylor" },
    { date: "2026-09-05", primary: "taylor", secondary: "priya" },
    { date: "2026-09-06", primary: "priya", secondary: "sam" },
    { date: "2026-09-07", primary: "sam", secondary: "alex" }
  ];

  return {
    team: team,
    incidents: incidents,
    timeline: timeline,
    oncall: oncall,
    settings: {
      workspace: "Acme Platform",
      notifyEmail: true,
      notifySlack: true,
      autoPage: false,
      severityThreshold: "high",
      runbookUrl: "https://runbooks.internal/payments"
    },
    warRoomChecklists: {
      "INC-1042": [
        { id: "c1", text: "Confirm customer impact scope", done: true },
        { id: "c2", text: "Open status page incident", done: true },
        { id: "c3", text: "Notify stakeholders", done: false },
        { id: "c4", text: "Capture timeline entries", done: true }
      ]
    }
  };
};

IC.load = function () {
  try {
    var saved = JSON.parse(localStorage.getItem(IC.STORE) || "null");
    if (saved && saved.incidents && saved.team) {
      IC.state = saved;
      return;
    }
  } catch (e) {}
  IC.state = IC.seed();
  IC.persist();
};

IC.persist = function () {
  try {
    localStorage.setItem(IC.STORE, JSON.stringify(IC.state));
  } catch (e) {}
};

IC.reset = function () {
  IC.state = IC.seed();
  IC.persist();
};

IC.memberById = function (id) {
  return IC.state.team.filter(function (m) { return m.id === id; })[0] || null;
};

IC.incidentById = function (id) {
  return IC.state.incidents.filter(function (i) { return i.id === id; })[0] || null;
};

IC.filterIncidents = function (f) {
  var q = (f.q || "").toLowerCase();
  return IC.state.incidents.filter(function (inc) {
    if (f.status && inc.status !== f.status) return false;
    if (f.severity && inc.severity !== f.severity) return false;
    if (q) {
      var hay = (inc.id + " " + inc.title + " " + inc.service + " " + inc.description).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
};

IC.searchAll = function (q) {
  var needle = (q || "").toLowerCase();
  if (!needle) return [];
  var hits = [];
  IC.state.incidents.forEach(function (inc) {
    var hay = (inc.id + " " + inc.title + " " + inc.service + " " + inc.description).toLowerCase();
    if (hay.indexOf(needle) !== -1) {
      hits.push({ type: "incident", id: inc.id, title: inc.id + " — " + inc.title, snippet: inc.service + " · " + inc.severity });
    }
  });
  IC.state.team.forEach(function (m) {
    var hay = (m.name + " " + m.role).toLowerCase();
    if (hay.indexOf(needle) !== -1) {
      hits.push({ type: "team", id: m.id, title: m.name, snippet: m.role });
    }
  });
  return hits;
};

IC.updateSettings = function (patch) {
  Object.assign(IC.state.settings, patch);
  IC.persist();
};

IC.updateIncidentStatus = function (id, status) {
  var inc = IC.incidentById(id);
  if (!inc) return;
  inc.status = status;
  inc.updatedAt = IC.now();
  IC.persist();
};

IC.addTimelineEvent = function (incidentId, title, body, author) {
  if (!IC.state.timeline[incidentId]) IC.state.timeline[incidentId] = [];
  IC.state.timeline[incidentId].push({
    at: IC.now(),
    title: title,
    body: body,
    author: author || "alex"
  });
  IC.persist();
};

IC.toggleChecklist = function (incidentId, checkId) {
  var list = IC.state.warRoomChecklists[incidentId];
  if (!list) return;
  list.forEach(function (item) {
    if (item.id === checkId) item.done = !item.done;
  });
  IC.persist();
};

IC.activeIncidentCount = function () {
  return IC.state.incidents.filter(function (i) {
    return i.status === "open" || i.status === "investigating" || i.status === "mitigated";
  }).length;
};

IC.formatTime = function (iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

IC.formatDate = function (iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
