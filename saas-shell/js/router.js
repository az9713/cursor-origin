window.IC = window.IC || {};

IC.ROUTES = [
  "dashboard",
  "incidents",
  "incident",
  "war-room",
  "team",
  "settings",
  "oncall",
  "search"
];

IC.parseHash = function () {
  var h = (location.hash || "#/dashboard").replace(/^#/, "");
  if (h.charAt(0) !== "/") h = "/" + h;
  var parts = h.split("?");
  var path = parts[0];
  var q = new URLSearchParams(parts[1] || "");
  var segs = path.split("/").filter(Boolean);
  var view = segs[0] || "dashboard";
  if (IC.ROUTES.indexOf(view) === -1) view = "dashboard";
  return {
    view: view,
    id: view === "incident" || view === "war-room" ? decodeURIComponent(segs[1] || "") : "",
    q: q.get("q") || "",
    status: q.get("status") || "",
    severity: q.get("severity") || ""
  };
};

IC.writeHash = function (opts) {
  var next = Object.assign({}, IC.parseHash(), opts || {});
  var path;
  if (next.view === "incident" && next.id) {
    path = "/incident/" + encodeURIComponent(next.id);
  } else if (next.view === "war-room" && next.id) {
    path = "/war-room/" + encodeURIComponent(next.id);
  } else {
    path = "/" + next.view;
  }
  var params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.severity) params.set("severity", next.severity);
  var qs = params.toString();
  var hash = path + (qs ? "?" + qs : "");
  var current = location.hash.replace(/^#/, "");
  if (current === hash || current === hash.replace(/^\//, "")) {
    IC.render();
    return;
  }
  location.hash = hash;
};

IC.navTo = function (view, id) {
  IC.writeHash({ view: view, id: id || "", q: "", status: "", severity: "" });
};
