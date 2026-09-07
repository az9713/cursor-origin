window.ML = window.ML || {};
ML.filterIssuesBoard = function (issues, f) {
  return issues.filter(function (iss) {
    if (f.status && iss.status !== f.status) return false;
    if (f.assignee && iss.assignee !== f.assignee) return false;
    if (f.priority && iss.priority !== f.priority) return false;
    if (f.q) {
      var blob = (iss.title + " " + iss.description + " " + iss.id).toLowerCase();
      if (blob.indexOf(String(f.q).toLowerCase()) === -1) return false;
    }
    return true;
  });
};
