window.KG = window.KG || {};

KG.layout = function (data) {
  var nodes = data.nodes.map(function (n, i) {
    var typeIndex = data.types.indexOf(n.type);
    var angle = (typeIndex / data.types.length) * Math.PI * 2 + (i % 17) * 0.11;
    var radius = 180 + (typeIndex * 70) + (i % 9) * 18;
    return {
      id: n.id,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      data: n
    };
  });
  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });
  var links = data.edges.map(function (e) {
    return { source: byId[e.source], target: byId[e.target], relation: e.relation };
  }).filter(function (l) { return l.source && l.target; });

  var ticks = 80;
  while (ticks--) {
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[j].x - nodes[i].x;
        var dy = nodes[j].y - nodes[i].y;
        var d2 = dx * dx + dy * dy || 1;
        var f = 900 / d2;
        var fx = dx * f;
        var fy = dy * f;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }
    links.forEach(function (l) {
      var dx = l.target.x - l.source.x;
      var dy = l.target.y - l.source.y;
      l.source.vx += dx * 0.012;
      l.source.vy += dy * 0.012;
      l.target.vx -= dx * 0.012;
      l.target.vy -= dy * 0.012;
    });
    nodes.forEach(function (n) {
      n.vx *= 0.72;
      n.vy *= 0.72;
      n.x += n.vx;
      n.y += n.vy;
    });
  }
  return { nodes: nodes, links: links, byId: byId };
};
