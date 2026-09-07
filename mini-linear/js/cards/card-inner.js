window.ML = window.ML || {};
ML._cardInner = function (iss) {
  var u = ML.userById(iss.assignee);
  var labs = (iss.labels || []).map(function (l) {
    return '<span class="pill pill-' + l + '">' + l + "</span>";
  }).join(" ");
  return (
    "<h4>" + iss.title.replace(/</g, "&lt;") + "</h4>" +
    '<div class="meta"><span>' + iss.id + '</span><span class="pri-' + iss.priority + '">' +
    iss.priority + "</span>" + labs +
    (u ? '<span class="av" title="' + u.name + '">' + u.initials + "</span>" : "<span>unassigned</span>") +
    "</div>"
  );
};
