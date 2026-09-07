window.ML = window.ML || {};
ML.mountColumn_in_progress = function (host, issues) {
  var col = document.createElement("section");
  col.className = "ml-col ml-col-in_progress";
  col.dataset.status = "in_progress";
  var filtered = issues.filter(function (i) { return i.status === "in_progress"; });
  col.innerHTML = "<h3>In progress (" + filtered.length + ")</h3>";
  var stack = document.createElement("div");
  filtered.forEach(function (iss) { stack.appendChild(ML.renderBoardCard_in_progress(iss)); });
  col.appendChild(stack);
  col.addEventListener("dragover", function (ev) { ev.preventDefault(); col.classList.add("over"); });
  col.addEventListener("dragleave", function () { col.classList.remove("over"); });
  col.addEventListener("drop", function (ev) {
    ev.preventDefault();
    col.classList.remove("over");
    var id = ev.dataTransfer.getData("text/plain");
    var hit = ML.state.issues.filter(function (i) { return i.id === id; })[0];
    if (!hit) return;
    hit.status = "in_progress";
    hit.updatedAt = new Date().toISOString();
    ML.persist();
    ML.render();
  });
  host.appendChild(col);
};
