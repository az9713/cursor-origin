window.ML = window.ML || {};
ML.renderList = function (main, f) {
  var issues = ML.filterIssuesList(ML.state.issues, f);
  var wrap = document.createElement("div");
  wrap.className = "ml-list ml-listwrap";
  var head = document.createElement("div");
  head.className = "ml-row ml-rowhead";
  head.innerHTML = "<span>ID</span><span>Title</span><span>Status</span><span>Priority</span><span>Assignee</span>";
  wrap.appendChild(head);
  if (!issues.length) {
    var empty = document.createElement("div");
    empty.className = "ml-empty";
    empty.textContent = "No issues match these filters.";
    wrap.appendChild(empty);
  } else {
    issues.forEach(function (iss) { wrap.appendChild(ML.renderListRow(iss)); });
  }
  main.appendChild(wrap);
};
