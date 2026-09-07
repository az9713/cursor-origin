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
