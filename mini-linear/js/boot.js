window.ML = window.ML || {};
ML.render = function () {
  var f = ML.parseHash();
  document.querySelectorAll(".ml-nav").forEach(function (a) {
    a.classList.toggle("on", a.getAttribute("data-view") === f.view);
  });
  document.getElementById("ml-title").textContent =
    f.view === "issue" ? f.issueId : (f.view === "list" ? "Issues" : "Board");
  var filters = document.getElementById("ml-filter-host");
  var main = document.getElementById("ml-main");
  main.innerHTML = "";
  if (f.view === "issue") {
    filters.innerHTML = "";
    ML.renderDetail(main, f);
    return;
  }
  ML.mountFilters(filters, f);
  if (f.view === "list") ML.renderList(main, f);
  else ML.renderBoard(main, f);
};
ML.boot = function () {
  ML.hydrate();
  document.getElementById("ml-new").addEventListener("click", ML.openCreate);
  document.getElementById("ml-modal-cancel").addEventListener("click", ML.closeCreate);
  document.getElementById("ml-modal-save").addEventListener("click", ML.submitCreate);
  document.getElementById("ml-modal-bg").addEventListener("click", function (ev) {
    if (ev.target.id === "ml-modal-bg") ML.closeCreate();
  });
  document.querySelectorAll(".ml-nav").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      var f = ML.parseHash();
      ML.writeHash({
        view: a.getAttribute("data-view"), issueId: "",
        q: f.q, status: f.status, assignee: f.assignee, priority: f.priority
      });
    });
  });
  var as = document.getElementById("ml-new-as");
  (ML.users || []).forEach(function (u) {
    var o = document.createElement("option");
    o.value = u.id;
    o.textContent = u.name;
    as.appendChild(o);
  });
  window.addEventListener("hashchange", ML.render);
  if (!location.hash) location.hash = "/board";
  else ML.render();
};
document.addEventListener("DOMContentLoaded", ML.boot);
