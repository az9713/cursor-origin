window.ML = window.ML || {};
ML.renderBoardCard_todo = function (iss) {
  var el = document.createElement("article");
  el.className = "ml-card ml-card-todo";
  el.draggable = true;
  el.dataset.id = iss.id;
  el.innerHTML = ML._cardInner(iss);
  el.addEventListener("click", function () {
    var f = ML.parseHash();
    ML.writeHash({ view: "issue", issueId: iss.id, q: f.q, status: f.status, assignee: f.assignee, priority: f.priority });
  });
  el.addEventListener("dragstart", function (ev) {
    ev.dataTransfer.setData("text/plain", iss.id);
    ev.dataTransfer.effectAllowed = "move";
  });
  return el;
};
