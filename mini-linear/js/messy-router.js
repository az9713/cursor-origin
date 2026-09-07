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
