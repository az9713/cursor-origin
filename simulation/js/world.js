window.SIM = window.SIM || {};

SIM.W = 960;
SIM.H = 640;
SIM.PGRID = 4;

SIM.World = function (seed) {
  this.seed = seed >>> 0;
  this.rng = SIM.createRng(this.seed);
  this.buildings = [];
  this.foods = [];
  this.nest = { x: SIM.W / 2, y: SIM.H / 2, r: 14 };
  this.pw = Math.ceil(SIM.W / SIM.PGRID);
  this.ph = Math.ceil(SIM.H / SIM.PGRID);
  this.foodTrail = new Float32Array(this.pw * this.ph);
  this.homeTrail = new Float32Array(this.pw * this.ph);
  this.foodCollected = 0;
  this.tick = 0;
  this._buildCity();
  this._placeNest();
  this._placeFood();
};

SIM.World.prototype.idx = function (gx, gy) {
  return gy * this.pw + gx;
};

SIM.World.prototype.clampGrid = function (gx, gy) {
  return [
    Math.max(0, Math.min(this.pw - 1, gx)),
    Math.max(0, Math.min(this.ph - 1, gy))
  ];
};

SIM.World.prototype.worldToGrid = function (x, y) {
  return this.clampGrid(Math.floor(x / SIM.PGRID), Math.floor(y / SIM.PGRID));
};

SIM.World.prototype.deposit = function (trail, x, y, amount) {
  var g = this.worldToGrid(x, y);
  var i = this.idx(g[0], g[1]);
  trail[i] = Math.min(1, trail[i] + amount);
  if (g[0] > 0) trail[i - 1] = Math.min(1, trail[i - 1] + amount * 0.5);
  if (g[0] < this.pw - 1) trail[i + 1] = Math.min(1, trail[i + 1] + amount * 0.5);
  if (g[1] > 0) trail[i - this.pw] = Math.min(1, trail[i - this.pw] + amount * 0.5);
  if (g[1] < this.ph - 1) trail[i + this.pw] = Math.min(1, trail[i + this.pw] + amount * 0.5);
};

SIM.World.prototype.sampleGradient = function (trail, x, y) {
  var g = this.worldToGrid(x, y);
  var gx = g[0];
  var gy = g[1];
  var c = trail[this.idx(gx, gy)];
  var l = gx > 0 ? trail[this.idx(gx - 1, gy)] : 0;
  var r = gx < this.pw - 1 ? trail[this.idx(gx + 1, gy)] : 0;
  var u = gy > 0 ? trail[this.idx(gx, gy - 1)] : 0;
  var d = gy < this.ph - 1 ? trail[this.idx(gx, gy + 1)] : 0;
  return { x: (r - l) * SIM.PGRID, y: (d - u) * SIM.PGRID, str: c };
};

SIM.World.prototype.fadeTrails = function (rate) {
  var f = 1 - rate;
  var i;
  for (i = 0; i < this.foodTrail.length; i++) {
    this.foodTrail[i] *= f;
    this.homeTrail[i] *= f;
  }
};

SIM.World.prototype.pointInBuilding = function (x, y, pad) {
  pad = pad || 0;
  var i;
  for (i = 0; i < this.buildings.length; i++) {
    var b = this.buildings[i];
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
      return b;
    }
  }
  return null;
};

SIM.World.prototype.resolveCollision = function (ant, nx, ny) {
  var b = this.pointInBuilding(nx, ny, 2);
  if (!b) return { x: nx, y: ny, hit: false };

  var cx = nx < b.x ? b.x : nx > b.x + b.w ? b.x + b.w : nx;
  var cy = ny < b.y ? b.y : ny > b.y + b.h ? b.y + b.h : ny;
  var dx = nx - cx;
  var dy = ny - cy;
  var len = Math.hypot(dx, dy) || 1;
  var push = 3;
  nx = cx + (dx / len) * push;
  ny = cy + (dy / len) * push;

  if (Math.abs(dx) > Math.abs(dy)) ant.vx *= -0.6;
  else ant.vy *= -0.6;

  if (this.pointInBuilding(nx, ny, 0)) {
    nx = ant.x;
    ny = ant.y;
    ant.vx = -ant.vx;
    ant.vy = -ant.vy;
  }
  return { x: nx, y: ny, hit: true };
};

SIM.World.prototype.pickFood = function (x, y) {
  var i;
  for (i = this.foods.length - 1; i >= 0; i--) {
    var f = this.foods[i];
    if (Math.hypot(f.x - x, f.y - y) < f.r + 4) {
      this.foods.splice(i, 1);
      return true;
    }
  }
  return false;
};

SIM.World.prototype.atNest = function (x, y) {
  return Math.hypot(x - this.nest.x, y - this.nest.y) < this.nest.r + 6;
};

SIM.World.prototype._buildCity = function () {
  var cols = 4;
  var rows = 3;
  var padX = 36;
  var padY = 36;
  var cellW = (SIM.W - padX * 2) / cols;
  var cellH = (SIM.H - padY * 2) / rows;
  var r = 0;
  var c;

  for (r = 0; r < rows; r++) {
    for (c = 0; c < cols; c++) {
      if (this.rng.next() < 0.18) continue;
      var inset = this.rng.float(8, 18);
      var bw = cellW - inset * 2 - this.rng.float(0, 12);
      var bh = cellH - inset * 2 - this.rng.float(0, 12);
      var bx = padX + c * cellW + inset + this.rng.float(0, 8);
      var by = padY + r * cellH + inset + this.rng.float(0, 8);
      this.buildings.push({ x: bx, y: by, w: bw, h: bh });
    }
  }

  var extra = this.rng.int(2, 5);
  while (extra-- > 0) {
    var ew = this.rng.float(40, 120);
    var eh = this.rng.float(40, 120);
    var ex = this.rng.float(20, SIM.W - ew - 20);
    var ey = this.rng.float(20, SIM.H - eh - 20);
    if (!this.pointInBuilding(ex + ew / 2, ey + eh / 2, 10)) {
      this.buildings.push({ x: ex, y: ey, w: ew, h: eh });
    }
  }
};

SIM.World.prototype._freeSpot = function (margin) {
  margin = margin || 20;
  var tries = 80;
  while (tries--) {
    var x = this.rng.float(margin, SIM.W - margin);
    var y = this.rng.float(margin, SIM.H - margin);
    if (!this.pointInBuilding(x, y, 12)) return { x: x, y: y };
  }
  return { x: SIM.W / 2, y: SIM.H / 2 };
};

SIM.World.prototype._placeNest = function () {
  var spot = this._freeSpot(40);
  this.nest.x = spot.x;
  this.nest.y = spot.y;
};

SIM.World.prototype._placeFood = function () {
  var count = this.rng.int(10, 18);
  var i;
  this.foods = [];
  for (i = 0; i < count; i++) {
    var spot = this._freeSpot(16);
    var dist = Math.hypot(spot.x - this.nest.x, spot.y - this.nest.y);
    if (dist < 60) continue;
    this.foods.push({ x: spot.x, y: spot.y, r: 5 + this.rng.float(0, 3) });
  }
};

SIM.World.prototype.reset = function () {
  this.rng = SIM.createRng(this.seed);
  this.buildings = [];
  this.foods = [];
  this.foodTrail.fill(0);
  this.homeTrail.fill(0);
  this.foodCollected = 0;
  this.tick = 0;
  this._buildCity();
  this._placeNest();
  this._placeFood();
};
