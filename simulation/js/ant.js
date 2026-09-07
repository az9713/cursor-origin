window.SIM = window.SIM || {};

SIM.Ant = function (world, rng) {
  this.world = world;
  this.rng = rng;
  this.x = world.nest.x + rng.float(-6, 6);
  this.y = world.nest.y + rng.float(-6, 6);
  this.vx = rng.float(-1, 1);
  this.vy = rng.float(-1, 1);
  this.speed = rng.float(1.2, 1.8);
  this.state = "explore";
  this.carrying = false;
  this.wander = rng.float(0, Math.PI * 2);
};

SIM.Ant.prototype._norm = function (vx, vy) {
  var len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len };
};

SIM.Ant.prototype._steer = function (tx, ty, w) {
  var d = this._norm(tx - this.x, ty - this.y);
  this.vx = this.vx * (1 - w) + d.x * w;
  this.vy = this.vy * (1 - w) + d.y * w;
};

SIM.World.prototype.spawnAnt = function () {
  return new SIM.Ant(this, this.rng);
};

SIM.World.prototype.syncPopulation = function (target) {
  while (this.ants.length < target) this.ants.push(this.spawnAnt());
  while (this.ants.length > target) this.ants.pop();
};

SIM.World.prototype.stepAnts = function () {
  if (!this.ants) this.ants = [];
  var i;
  for (i = 0; i < this.ants.length; i++) {
    this._stepAnt(this.ants[i]);
  }
};

SIM.World.prototype._stepAnt = function (ant) {
  var w = ant.world;

  if (ant.state === "explore") {
    var grad = w.sampleGradient(w.foodTrail, ant.x, ant.y);
    ant.wander += ant.rng.float(-0.5, 0.5);
    var wx = Math.cos(ant.wander) * 0.35;
    var wy = Math.sin(ant.wander) * 0.35;
    var gx = grad.x * (0.4 + grad.str * 0.8);
    var gy = grad.y * (0.4 + grad.str * 0.8);
    ant.vx = ant.vx * 0.82 + wx + gx;
    ant.vy = ant.vy * 0.82 + wy + gy;
    w.deposit(w.homeTrail, ant.x, ant.y, 0.012);

    if (w.pickFood(ant.x, ant.y)) {
      ant.carrying = true;
      ant.state = "return";
    }
  } else {
    w.deposit(w.foodTrail, ant.x, ant.y, 0.035);
    ant._steer(w.nest.x, w.nest.y, 0.28);
    if (w.atNest(ant.x, ant.y)) {
      ant.carrying = false;
      ant.state = "explore";
      w.foodCollected++;
      ant.wander = ant.rng.float(0, Math.PI * 2);
    }
  }

  var dir = ant._norm(ant.vx, ant.vy);
  ant.vx = dir.x;
  ant.vy = dir.y;
  var nx = ant.x + dir.x * ant.speed;
  var ny = ant.y + dir.y * ant.speed;
  var resolved = w.resolveCollision(ant, nx, ny);
  ant.x = Math.max(4, Math.min(SIM.W - 4, resolved.x));
  ant.y = Math.max(4, Math.min(SIM.H - 4, resolved.y));
};

SIM.World.prototype.render = function (ctx) {
  var i;
  ctx.clearRect(0, 0, SIM.W, SIM.H);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--street").trim() || "#ddd5c8";
  ctx.fillRect(0, 0, SIM.W, SIM.H);

  this._drawTrails(ctx);
  this._drawBuildings(ctx);
  this._drawFood(ctx);
  this._drawNest(ctx);
  this._drawAnts(ctx);
};

SIM.World.prototype._drawTrails = function (ctx) {
  var img = ctx.createImageData(this.pw, this.ph);
  var d = img.data;
  var i;
  for (i = 0; i < this.foodTrail.length; i++) {
    var f = this.foodTrail[i];
    var h = this.homeTrail[i];
    if (f < 0.02 && h < 0.02) continue;
    var px = i % this.pw;
    var py = (i / this.pw) | 0;
    var a = Math.min(180, (f * 140 + h * 80));
    var r = 180 + f * 50;
    var g = 69 + h * 40;
    var b = 26 + f * 20;
    var di = (py * this.pw + px) * 4;
    d[di] = r;
    d[di + 1] = g;
    d[di + 2] = b;
    d[di + 3] = a;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = "multiply";
  var off = document.createElement("canvas");
  off.width = this.pw;
  off.height = this.ph;
  off.getContext("2d").putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0, SIM.W, SIM.H);
  ctx.restore();
};

SIM.World.prototype._drawBuildings = function (ctx) {
  var i;
  for (i = 0; i < this.buildings.length; i++) {
    var b = this.buildings[i];
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--building").trim();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--building-edge").trim();
    ctx.lineWidth = 1.5;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.fillStyle = "rgba(255,253,248,0.35)";
    ctx.fillRect(b.x + 6, b.y + 6, Math.min(18, b.w - 12), Math.min(14, b.h - 12));
  }
};

SIM.World.prototype._drawFood = function (ctx) {
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--food").trim();
  var i;
  for (i = 0; i < this.foods.length; i++) {
    var f = this.foods[i];
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
};

SIM.World.prototype._drawNest = function (ctx) {
  var n = this.nest;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--nest").trim();
  ctx.strokeStyle = "#6b5010";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,253,248,0.5)";
  ctx.beginPath();
  ctx.arc(n.x - 3, n.y - 3, n.r * 0.35, 0, Math.PI * 2);
  ctx.fill();
};

SIM.World.prototype._drawAnts = function (ctx) {
  if (!this.ants) return;
  var i;
  for (i = 0; i < this.ants.length; i++) {
    var a = this.ants[i];
    var angle = Math.atan2(a.vy, a.vx);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angle);
    ctx.fillStyle = a.carrying ? "#2a251f" : "#5c564c";
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3, 2.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-3, -2.5);
    ctx.closePath();
    ctx.fill();
    if (a.carrying) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--food").trim();
      ctx.beginPath();
      ctx.arc(-1, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};
