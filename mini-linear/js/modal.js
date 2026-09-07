window.ML = window.ML || {};
ML.openCreate = function () {
  document.getElementById("ml-modal-bg").classList.remove("hidden");
  document.getElementById("ml-new-title").focus();
};
ML.closeCreate = function () {
  document.getElementById("ml-modal-bg").classList.add("hidden");
};
ML.submitCreate = function () {
  var title = document.getElementById("ml-new-title").value.trim();
  if (!title) return;
  var iss = {
    id: ML.nextId(),
    title: title,
    description: document.getElementById("ml-new-desc").value,
    status: document.getElementById("ml-new-status").value,
    priority: document.getElementById("ml-new-pri").value,
    assignee: document.getElementById("ml-new-as").value,
    labels: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  ML.state.issues.unshift(iss);
  ML.persist();
  ML.closeCreate();
  document.getElementById("ml-new-title").value = "";
  document.getElementById("ml-new-desc").value = "";
  ML.render();
};
