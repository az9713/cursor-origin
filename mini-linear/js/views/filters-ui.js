window.ML = window.ML || {};
ML.mountFilters = function (host, f) {
  host.innerHTML = "";
  var wrap = document.createElement("div");
  wrap.className = "ml-filters";
  wrap.innerHTML =
    '<input type="search" placeholder="Search" value="' + String(f.q).replace(/"/g, "&quot;") + '">' +
    '<select data-k="status"><option value="">All statuses</option>' +
    ["backlog","todo","in_progress","done"].map(function (s) {
      return '<option value="' + s + '"' + (f.status === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select>" +
    '<select data-k="assignee"><option value="">All assignees</option>' +
    (ML.users || []).map(function (u) {
      return '<option value="' + u.id + '"' + (f.assignee === u.id ? " selected" : "") + ">" + u.name + "</option>";
    }).join("") + "</select>" +
    '<select data-k="priority"><option value="">All priorities</option>' +
    ["urgent","high","medium","low"].map(function (s) {
      return '<option value="' + s + '"' + (f.priority === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select>";
  var search = wrap.querySelector("input");
  search.addEventListener("input", function () { ML.writeHash({ q: search.value }); });
  wrap.querySelectorAll("select").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var patch = {};
      patch[sel.getAttribute("data-k")] = sel.value;
      ML.writeHash(patch);
    });
  });
  host.appendChild(wrap);
};
