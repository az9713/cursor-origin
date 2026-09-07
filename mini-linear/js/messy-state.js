window.ML = window.ML || {};
ML.state = { issues: [], nextN: 31 };
ML.persist = function () {
  var payload = { issues: ML.state.issues, nextN: ML.state.nextN };
  if (ML.saveListStore) ML.saveListStore(payload);
  else if (ML.saveBoardStore) ML.saveBoardStore(payload);
};
ML.hydrate = function () {
  var saved = (ML.loadListStore && ML.loadListStore()) || (ML.loadBoardStore && ML.loadBoardStore());
  if (saved && Array.isArray(saved.issues) && saved.issues.length) {
    ML.state.issues = saved.issues;
    ML.state.nextN = saved.nextN || (saved.issues.length + 1);
    return;
  }
  ML.state.issues = (ML.seedIssues || []).map(function (x) {
    return Object.assign({}, x, { labels: x.labels.slice() });
  });
  ML.state.nextN = ML.state.issues.length + 1;
  ML.persist();
};
ML.userById = function (id) {
  return (ML.users || []).filter(function (u) { return u.id === id; })[0] || null;
};
ML.nextId = function () {
  var n = ML.state.nextN++;
  return "LIN-" + n;
};
