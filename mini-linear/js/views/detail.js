window.ML = window.ML || {};
ML.renderDetail = function (main, f) {
  var iss = ML.state.issues.filter(function (i) { return i.id === f.issueId; })[0];
  var box = document.createElement("div");
  box.className = "ml-detail";
  if (!iss) {
    box.innerHTML = '<p>Issue not found.</p><button class="btn-ghost" type="button" id="back">Back</button>';
    main.appendChild(box);
    box.querySelector("#back").onclick = function () { ML.writeHash({ view: "board", issueId: "" }); };
    return;
  }
  var userOpts = '<option value="">Unassigned</option>' + (ML.users || []).map(function (u) {
    return '<option value="' + u.id + '"' + (iss.assignee === u.id ? " selected" : "") + ">" + u.name + "</option>";
  }).join("");
  var labelBoxes = (ML.labels || []).map(function (l) {
    var on = (iss.labels || []).indexOf(l) !== -1;
    return '<label><input type="checkbox" data-label="' + l + '"' + (on ? " checked" : "") + "> " + l + "</label>";
  }).join(" ");
  box.innerHTML =
    '<p><button class="btn-ghost" type="button" id="back">Back to board</button></p>' +
    '<input class="title" value="' + iss.title.replace(/"/g, "&quot;") + '">' +
    "<textarea>" + iss.description.replace(/</g, "&lt;") + "</textarea>" +
    '<div class="grid">' +
    '<label>Status<select id="st">' +
    ["backlog","todo","in_progress","done"].map(function (s) {
      return "<option" + (iss.status === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select></label>" +
    '<label>Priority<select id="pr">' +
    ["low","medium","high","urgent"].map(function (s) {
      return "<option" + (iss.priority === s ? " selected" : "") + ">" + s + "</option>";
    }).join("") + "</select></label>" +
    '<label>Assignee<select id="as">' + userOpts + "</select></label></div>" +
    "<p>Labels<br>" + labelBoxes + "</p>" +
    '<p><button type="button" class="btn-new" id="save">Save</button> ' +
    '<button type="button" class="btn-ghost" id="del">Delete</button></p>';
  main.appendChild(box);
  box.querySelector("#back").onclick = function () { ML.writeHash({ view: "board", issueId: "" }); };
  box.querySelector("#save").onclick = function () {
    iss.title = box.querySelector(".title").value.trim() || iss.title;
    iss.description = box.querySelector("textarea").value;
    iss.status = box.querySelector("#st").value;
    iss.priority = box.querySelector("#pr").value;
    iss.assignee = box.querySelector("#as").value;
    iss.labels = Array.prototype.map.call(box.querySelectorAll("input[data-label]:checked"), function (c) {
      return c.getAttribute("data-label");
    });
    iss.updatedAt = new Date().toISOString();
    ML.persist();
    ML.writeHash({ view: "board", issueId: "" });
  };
  box.querySelector("#del").onclick = function () {
    if (!confirm("Delete " + iss.id + "?")) return;
    ML.state.issues = ML.state.issues.filter(function (i) { return i.id !== iss.id; });
    ML.persist();
    ML.writeHash({ view: "board", issueId: "" });
  };
};
