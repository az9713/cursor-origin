/**
 * solver.js — Geometric Constraint Solver
 *
 * Algorithm : Gauss-Newton with Levenberg-Marquardt damping.
 *             Jacobian computed via central finite differences.
 * Normalisation: angle/parallel residuals are normalised to pixel-scale
 *             (multiplied by CHAR_LEN) so all residuals share ~the same
 *             magnitude and the normal-equation matrix is well-conditioned.
 *
 * Max iterations: MAX_ITER (exported so the UI can display it).
 */

export const MAX_ITER     = 200;
const EPS_FD              = 1e-6;   // finite-difference step
const CONV_TOL            = 3e-4;   // rms residual threshold for "satisfied"
const MAX_STEP_PX         = 50;     // pixel cap per iteration
const CHAR_LEN            = 100;    // normalisation reference length (px)
const LAMBDA_INIT         = 1e-3;   // initial LM damping
const LAMBDA_UP           = 8;
const LAMBDA_DOWN         = 1 / 3;
const LAMBDA_MAX          = 1e9;
const LAMBDA_MIN          = 1e-12;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * solve(sketch) → { points, circles, status, dof, residual, iterations }
 *
 * sketch = { points[], lines[], circles[], constraints[] }
 *
 * Points with .fixed === true are held constant.
 * status: 'satisfied' | 'under' | 'over' | 'failed'
 * dof   : estimated degrees of freedom (vars − equations)
 */
export function solve(sketch) {
  const { points, lines, circles, constraints } = sketch;

  // ── Build variable vector ─────────────────────────────────────────────────
  const meta = [];   // { kind:'x'|'y'|'r', id }
  const vars = [];   // initial values

  for (const p of points) {
    if (p.fixed) continue;
    meta.push({ kind: 'x', id: p.id });
    meta.push({ kind: 'y', id: p.id });
    vars.push(p.x, p.y);
  }
  for (const c of circles) {
    meta.push({ kind: 'r', id: c.id });
    vars.push(c.r);
  }

  const n = vars.length;
  const { eqCount } = countEquations(constraints);
  const dof = n - eqCount;

  // Nothing to solve (all points are fixed)
  if (n === 0) {
    const status = dof < 0 ? 'over' : dof === 0 ? 'satisfied' : 'under';
    return makeResult(points, circles, meta, new Float64Array(vars), status, dof, 0, 0);
  }

  // ── Build line lookup map ─────────────────────────────────────────────────
  const lineMap = new Map(lines.map(l => [l.id, l]));

  // ── Residual function ─────────────────────────────────────────────────────
  // Captures base point/circle values; variables override them.
  const basePx = {}, basePy = {}, basePr = {};
  for (const p of points)  { basePx[p.id] = p.x; basePy[p.id] = p.y; }
  for (const c of circles) { basePr[c.id] = c.r; }

  function residuals(v) {
    // Build current position maps from variable vector
    const px = Object.assign({}, basePx);
    const py = Object.assign({}, basePy);
    const pr = Object.assign({}, basePr);
    for (let i = 0; i < meta.length; i++) {
      const { kind, id } = meta[i];
      if      (kind === 'x') px[id] = v[i];
      else if (kind === 'y') py[id] = v[i];
      else                   pr[id] = v[i];
    }

    const R = [];
    for (const con of constraints) {
      switch (con.type) {

        case 'coincident': {
          R.push(px[con.p1] - px[con.p2]);
          R.push(py[con.p1] - py[con.p2]);
          break;
        }

        case 'distance': {
          const dx = px[con.p1] - px[con.p2];
          const dy = py[con.p1] - py[con.p2];
          R.push(Math.hypot(dx, dy) - con.len);
          break;
        }

        case 'parallel': {
          const l1 = lineMap.get(con.l1);
          const l2 = lineMap.get(con.l2);
          const dx1 = px[l1.b] - px[l1.a], dy1 = py[l1.b] - py[l1.a];
          const dx2 = px[l2.b] - px[l2.a], dy2 = py[l2.b] - py[l2.a];
          const denom = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2) + 1e-9;
          // sin(θ) between lines normalised → pixel-scale
          R.push(CHAR_LEN * (dx1 * dy2 - dy1 * dx2) / denom);
          break;
        }

        case 'angle': {
          // Enforces: angle between l1 and l2 = con.deg degrees
          // sin(θ − α) = 0  equivalently: cross·cos(α) − dot·sin(α) = 0
          const l1 = lineMap.get(con.l1);
          const l2 = lineMap.get(con.l2);
          const dx1 = px[l1.b] - px[l1.a], dy1 = py[l1.b] - py[l1.a];
          const dx2 = px[l2.b] - px[l2.a], dy2 = py[l2.b] - py[l2.a];
          const len1 = Math.hypot(dx1, dy1);
          const len2 = Math.hypot(dx2, dy2);
          const denom = len1 * len2 + 1e-9;
          const cross = dx1 * dy2 - dy1 * dx2;
          const dot   = dx1 * dx2 + dy1 * dy2;
          const rad   = con.deg * Math.PI / 180;
          R.push(CHAR_LEN * (cross * Math.cos(rad) - dot * Math.sin(rad)) / denom);
          break;
        }

        case 'point-on-line': {
          // Perpendicular distance from point to infinite line = 0
          const l  = lineMap.get(con.l);
          const ax = px[l.a], ay = py[l.a];
          const bx = px[l.b], by = py[l.b];
          const len = Math.hypot(bx - ax, by - ay) + 1e-9;
          // cross product / |l| = signed perp distance
          R.push(((px[con.p] - ax) * (by - ay) - (py[con.p] - ay) * (bx - ax)) / len);
          break;
        }

        case 'radius': {
          R.push(pr[con.circle] - con.r);
          break;
        }
      }
    }
    return R;
  }

  // ── Gauss-Newton / LM iteration ───────────────────────────────────────────
  let x      = new Float64Array(vars);
  let f      = residuals(x);
  let lambda = LAMBDA_INIT;
  let err    = rmsOf(f);
  let iters  = 0;

  for (let iter = 0; iter < MAX_ITER && err > CONV_TOL; iter++) {
    iters++;
    const J = numericalJacobian(x, f, residuals);
    const m = f.length;

    // Build JᵀJ and rhs = -Jᵀf
    const JtJ = Array.from({ length: n }, () => new Float64Array(n));
    const rhs = new Float64Array(n);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        rhs[j] -= J[i][j] * f[i];
        for (let k = 0; k < n; k++) {
          JtJ[j][k] += J[i][j] * J[i][k];
        }
      }
    }

    // LM diagonal damping
    for (let j = 0; j < n; j++) JtJ[j][j] += lambda * (JtJ[j][j] || 1);

    const dx = solveLinear(JtJ, rhs);
    if (!dx) { lambda = Math.min(lambda * LAMBDA_UP, LAMBDA_MAX); continue; }

    // Clamp step size
    const stepLen = norm2(dx);
    if (stepLen > MAX_STEP_PX) {
      const s = MAX_STEP_PX / stepLen;
      for (let i = 0; i < n; i++) dx[i] *= s;
    }

    const xTry  = x.map((v, i) => v + dx[i]);
    const fTry  = residuals(xTry);
    const errTry = rmsOf(fTry);

    if (errTry <= err) {
      x      = xTry;
      f      = fTry;
      err    = errTry;
      lambda = Math.max(lambda * LAMBDA_DOWN, LAMBDA_MIN);
    } else {
      lambda = Math.min(lambda * LAMBDA_UP, LAMBDA_MAX);
    }
  }

  // ── Status classification ─────────────────────────────────────────────────
  const solved = err <= CONV_TOL;
  let status;
  if (!solved) {
    status = 'failed';
  } else if (dof > 0) {
    status = 'under';
  } else if (dof < 0) {
    status = 'over';
  } else {
    status = 'satisfied';
  }

  return makeResult(points, circles, meta, x, status, dof, err, iters);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Build Jacobian matrix via central differences. */
function numericalJacobian(x, f0, residFn) {
  const m = f0.length, n = x.length;
  const J = Array.from({ length: m }, () => new Float64Array(n));
  for (let j = 0; j < n; j++) {
    const xp = new Float64Array(x); xp[j] += EPS_FD;
    const xm = new Float64Array(x); xm[j] -= EPS_FD;
    const fp = residFn(xp);
    const fm = residFn(xm);
    for (let i = 0; i < m; i++) {
      J[i][j] = (fp[i] - fm[i]) / (2 * EPS_FD);
    }
  }
  return J;
}

/** Solve A·x = b with Gaussian elimination + partial pivoting.
 *  Returns solution array or null if singular. */
function solveLinear(A, b) {
  const n = b.length;
  // Build augmented matrix [A|b]
  const M = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(n + 1);
    for (let j = 0; j < n; j++) row[j] = A[i][j];
    row[n] = b[i];
    return row;
  });

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    if (maxRow !== col) { const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp; }

    const piv = M[col][col];
    if (Math.abs(piv) < 1e-14) continue; // rank-deficient column, skip

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / piv;
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }

  // Back-substitution
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    if (Math.abs(M[i][i]) > 1e-14) x[i] /= M[i][i];
  }
  return x;
}

/** Root-mean-square of array. */
function rmsOf(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v * v;
  return Math.sqrt(s / arr.length);
}

/** Euclidean norm. */
function norm2(arr) {
  let s = 0;
  for (const v of arr) s += v * v;
  return Math.sqrt(s);
}

/** Count total constraint equations (coincident = 2, others = 1). */
function countEquations(constraints) {
  let eqCount = 0;
  for (const c of constraints) {
    eqCount += (c.type === 'coincident') ? 2 : 1;
  }
  return { eqCount };
}

/** Assemble result object, applying solved variable vector back to entities. */
function makeResult(points, circles, meta, x, status, dof, residual, iterations) {
  const resultPoints = points.map(p => {
    if (p.fixed) return { ...p };
    const xi = meta.findIndex(m => m.kind === 'x' && m.id === p.id);
    if (xi < 0) return { ...p };
    return { ...p, x: x[xi], y: x[xi + 1] };
  });
  const resultCircles = circles.map(c => {
    const ri = meta.findIndex(m => m.kind === 'r' && m.id === c.id);
    if (ri < 0) return { ...c };
    return { ...c, r: Math.max(1, x[ri]) }; // r ≥ 1
  });
  return { points: resultPoints, circles: resultCircles, status, dof, residual, iterations };
}
