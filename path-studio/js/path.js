/* path-studio/js/path.js — pathfinding engine (vanilla JS, no deps) */
'use strict';

// ── Min-heap priority queue ───────────────────────────────────────────────────
class MinHeap {
  constructor() { this._d = []; }

  push(item, priority) {
    this._d.push([priority, item]);
    this._bubbleUp(this._d.length - 1);
  }

  pop() {
    if (!this._d.length) return undefined;
    const top = this._d[0][1];
    const last = this._d.pop();
    if (this._d.length) {
      this._d[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this._d.length; }
  isEmpty()  { return this._d.length === 0; }

  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._d[p][0] <= this._d[i][0]) break;
      [this._d[p], this._d[i]] = [this._d[i], this._d[p]];
      i = p;
    }
  }

  _sinkDown(i) {
    const n = this._d.length;
    for (;;) {
      let m = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._d[l][0] < this._d[m][0]) m = l;
      if (r < n && this._d[r][0] < this._d[m][0]) m = r;
      if (m === i) break;
      [this._d[m], this._d[i]] = [this._d[i], this._d[m]];
      i = m;
    }
  }
}

// ── Grid helpers ──────────────────────────────────────────────────────────────
// 4-directional movement (N E S W)
const DIRS4 = [
  { dx: 0, dy: -1 },
  { dx: 1, dy:  0 },
  { dx: 0, dy:  1 },
  { dx:-1, dy:  0 },
];

/** Flat cell index */
function ci(x, y, cols) { return y * cols + x; }

/**
 * Visit each walkable neighbor of `curr`.
 * Order is stable: N, E, S, W, then portal partners (cost 1 teleport).
 * `portals` is an array of `{ a: index, b: index }` pairs (optional).
 * `visit(ni, edgeCost)` is called for each neighbor.
 */
function forEachNeighbor(cells, cols, rows, curr, portals, visit) {
  const cx = curr % cols;
  const cy = (curr / cols) | 0;

  for (const { dx, dy } of DIRS4) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
    const ni = ci(nx, ny, cols);
    if (cells[ni].blocked) continue;
    visit(ni, cells[ni].cost);
  }

  if (!portals || !portals.length) return;

  for (const p of portals) {
    let other = -1;
    if (curr === p.a) other = p.b;
    else if (curr === p.b) other = p.a;
    else continue;
    if (other < 0 || other >= cells.length) continue;
    if (cells[other].blocked) continue;
    visit(other, 1);
  }
}

/**
 * Reconstruct path from `prev` array.
 * Returns array of flat indices from start → goal.
 */
function reconstructPath(prev, startI, goalI) {
  const path = [];
  let curr = goalI;
  const LIMIT = 100000; // guard against cycles
  let steps = 0;
  while (curr !== undefined && curr !== startI && steps++ < LIMIT) {
    path.unshift(curr);
    curr = prev[curr];
  }
  if (curr === startI) path.unshift(startI);
  return path;
}

// ── Dijkstra ──────────────────────────────────────────────────────────────────
/**
 * @param {Array<{blocked:boolean, cost:number}>} cells  flat cell array
 * @param {number} cols
 * @param {number} rows
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} goal
 * @param {Array<{a:number,b:number}>} [portals]
 * @returns {{ pathIdx: number[], openSet: Set<number>, closedSet: Set<number>,
 *             gScores: Float32Array, found: boolean }}
 */
function dijkstra(cells, cols, rows, start, goal, portals) {
  const N      = cols * rows;
  const dist   = new Float32Array(N).fill(Infinity);
  const prev   = new Array(N).fill(undefined);
  const closed = new Set();
  const open   = new Set();

  const startI = ci(start.x, start.y, cols);
  const goalI  = ci(goal.x,  goal.y,  cols);

  dist[startI] = 0;
  const pq = new MinHeap();
  pq.push(startI, 0);
  open.add(startI);

  while (!pq.isEmpty()) {
    const curr = pq.pop();
    if (closed.has(curr)) continue;
    open.delete(curr);
    closed.add(curr);

    if (curr === goalI) break;

    forEachNeighbor(cells, cols, rows, curr, portals, (ni, edgeCost) => {
      if (closed.has(ni)) return;

      const nd = dist[curr] + edgeCost;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        prev[ni] = curr;
        pq.push(ni, nd);
        open.add(ni);
      }
    });
  }

  const found  = dist[goalI] < Infinity;
  const pathIdx = found ? reconstructPath(prev, startI, goalI) : [];

  return { pathIdx, openSet: open, closedSet: closed, gScores: dist, found };
}

// ── A* (Manhattan heuristic) ──────────────────────────────────────────────────
function manhattan(i, goalI, cols) {
  const x1 = i % cols,     y1 = (i / cols) | 0;
  const x2 = goalI % cols, y2 = (goalI / cols) | 0;
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Admissible when no portals (plain Manhattan). With portals, also consider
 * a single teleport hop so A* will pursue shortcuts instead of overestimating.
 */
function heuristic(i, goalI, cols, portals) {
  const h = manhattan(i, goalI, cols);
  if (!portals || !portals.length) return h;
  let best = h;
  for (const p of portals) {
    const viaA = manhattan(i, p.a, cols) + 1 + manhattan(p.b, goalI, cols);
    const viaB = manhattan(i, p.b, cols) + 1 + manhattan(p.a, goalI, cols);
    if (viaA < best) best = viaA;
    if (viaB < best) best = viaB;
  }
  return best;
}

/**
 * Same signature and return shape as dijkstra().
 * gScores holds g-values (cost so far from start).
 */
function astar(cells, cols, rows, start, goal, portals) {
  const N      = cols * rows;
  const g      = new Float32Array(N).fill(Infinity);
  const prev   = new Array(N).fill(undefined);
  const closed = new Set();
  const open   = new Set();

  const startI = ci(start.x, start.y, cols);
  const goalI  = ci(goal.x,  goal.y,  cols);

  g[startI] = 0;
  const pq = new MinHeap();
  pq.push(startI, heuristic(startI, goalI, cols, portals));
  open.add(startI);

  while (!pq.isEmpty()) {
    const curr = pq.pop();
    if (closed.has(curr)) continue;
    open.delete(curr);
    closed.add(curr);

    if (curr === goalI) break;

    forEachNeighbor(cells, cols, rows, curr, portals, (ni, edgeCost) => {
      if (closed.has(ni)) return;

      const ng = g[curr] + edgeCost;
      if (ng < g[ni]) {
        g[ni] = ng;
        prev[ni] = curr;
        pq.push(ni, ng + heuristic(ni, goalI, cols, portals));
        open.add(ni);
      }
    });
  }

  const found   = g[goalI] < Infinity;
  const pathIdx = found ? reconstructPath(prev, startI, goalI) : [];

  return { pathIdx, openSet: open, closedSet: closed, gScores: g, found };
}

// ── Flow field (cost-to-go from goal) ────────────────────────────────────────
/**
 * Runs Dijkstra backwards from goal to compute costTo[] for every cell.
 * Agent path from start is traced by greedy descent on costTo.
 *
 * Return shape matches dijkstra/astar; gScores holds costTo values.
 * openSet is empty after the full sweep (all reachable cells are closed).
 */
function flowField(cells, cols, rows, start, goal, portals) {
  const N      = cols * rows;
  const costTo = new Float32Array(N).fill(Infinity);
  const closed = new Set();
  const open   = new Set();

  const startI = ci(start.x, start.y, cols);
  const goalI  = ci(goal.x,  goal.y,  cols);

  // Dijkstra from goal — propagate cost-to-go outward
  costTo[goalI] = 0;
  const pq = new MinHeap();
  pq.push(goalI, 0);
  open.add(goalI);

  while (!pq.isEmpty()) {
    const curr = pq.pop();
    if (closed.has(curr)) continue;
    open.delete(curr);
    closed.add(curr);

    forEachNeighbor(cells, cols, rows, curr, portals, (ni, edgeCost) => {
      if (closed.has(ni)) return;

      const nd = costTo[curr] + edgeCost;
      if (nd < costTo[ni]) {
        costTo[ni] = nd;
        pq.push(ni, nd);
        open.add(ni);
      }
    });
  }

  // Trace agent path: greedy descent on costTo (4-neighbor then portal)
  const pathIdx = [];
  const found   = costTo[startI] < Infinity;

  if (found) {
    let curr = startI;
    const visited = new Set();
    while (curr !== goalI && !visited.has(curr)) {
      pathIdx.push(curr);
      visited.add(curr);

      let bestI = -1, bestCost = costTo[curr];

      forEachNeighbor(cells, cols, rows, curr, portals, (ni) => {
        if (costTo[ni] < bestCost) {
          bestCost = costTo[ni];
          bestI    = ni;
        }
      });

      if (bestI === -1) break;
      curr = bestI;
    }
    if (curr === goalI) pathIdx.push(goalI);
  }

  // open is empty after full sweep; re-use it to represent "frontier at end = ∅"
  return {
    pathIdx,
    openSet:   new Set(),   // all cells were closed
    closedSet: closed,
    gScores:   costTo,
    found,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
window.PSPath = { dijkstra, astar, flowField, forEachNeighbor };
