window.ML = window.ML || {};
ML.mountColumn_backlog = function (host, issues) {
  var col = document.createElement("section");
  col.className = "ml-col ml-col-backlog";
  col.dataset.status = "backlog";
  var filtered = issues.filter(function (i) { return i.status === "backlog"; });
  col.innerHTML = "<h3>Backlog (" + filtered.length + ")</h3>";
  var stack = document.createElement("div");
  filtered.forEach(function (iss) { stack.appendChild(ML.renderBoardCard_backlog(iss)); });
  col.appendChild(stack);
  col.addEventListener("dragover", function (ev) { ev.preventDefault(); col.classList.add("over"); });
  col.addEventListener("dragleave", function () { col.classList.remove("over"); });
  col.addEventListener("drop", function (ev) {
    ev.preventDefault();
    col.classList.remove("over");
    var id = ev.dataTransfer.getData("text/plain");
    var hit = ML.state.issues.filter(function (i) { return i.id === id; })[0];
    if (!hit) return;
    hit.status = "backlog";
    hit.updatedAt = new Date().toISOString();
    ML.persist();
    ML.render();
  });
  host.appendChild(col);
};
