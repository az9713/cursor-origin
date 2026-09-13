'use strict';

// ─── Flatten / path helpers ────────────────────────────────────────────────────

/**
 * Flatten a nested JSON value to a Map of (JSON-stringified path) → {path, val}.
 * Only leaf nodes (primitives + null) are stored.
 *
 * @param {*}      val  - any JSON-serialisable value
 * @param {Array}  path - accumulator (start empty)
 * @returns {Map<string, {path: Array, val: *}>}
 */
function flattenLeaves(val, path = []) {
  // Leaf
  if (val === null || typeof val !== 'object') {
    return new Map([[JSON.stringify(path), { path, val }]]);
  }

  const m = new Map();
  const entries = Array.isArray(val)
    ? val.map((v, i) => [i, v])        // numeric keys for arrays
    : Object.entries(val);             // string keys for objects

  for (const [k, v] of entries) {
    for (const [pk, pv] of flattenLeaves(v, [...path, k])) {
      m.set(pk, pv);
    }
  }
  return m;
}

/**
 * Set a value at a dot-array path inside a mutable nested structure.
 * Creates intermediate objects/arrays as needed.
 *
 * @param {object|Array} root
 * @param {Array}        path  - e.g. ['flags', 'darkMode'] or ['items', 1, 'done']
 * @param {*}            value
 */
function setAtPath(root, path, value) {
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key     = path[i];
    const nextKey = path[i + 1];
    if (node[key] == null || typeof node[key] !== 'object') {
      node[key] = typeof nextKey === 'number' ? [] : {};
    }
    node = node[key];
  }
  node[path[path.length - 1]] = value;
}

/**
 * Delete a leaf at a dot-array path.
 * For arrays, splices the element; for objects, deletes the key.
 *
 * @param {object|Array} root
 * @param {Array}        path
 */
function deleteAtPath(root, path) {
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (node == null) return;
    node = node[path[i]];
  }
  if (node == null) return;
  const last = path[path.length - 1];
  if (Array.isArray(node)) node.splice(Number(last), 1);
  else delete node[last];
}

// ─── Three-way diff ────────────────────────────────────────────────────────────

/**
 * Compute hunks from base, ours, theirs.
 *
 * @typedef {{ id: string, path: Array, pathStr: string,
 *             kind: 'add'|'remove'|'change'|'conflict',
 *             side: 'ours'|'theirs'|null,
 *             baseVal: *, oursVal: *, theirsVal: * }} Hunk
 *
 * @param {object} base
 * @param {object} ours
 * @param {object} theirs
 * @returns {Hunk[]}
 */
function threeWayDiff(base, ours, theirs) {
  const flatBase   = flattenLeaves(base);
  const flatOurs   = flattenLeaves(ours);
  const flatTheirs = flattenLeaves(theirs);

  // Union of all leaf-path keys
  const allKeys = new Set([
    ...flatBase.keys(),
    ...flatOurs.keys(),
    ...flatTheirs.keys(),
  ]);

  const hunks = [];
  let seq = 0;

  for (const k of allKeys) {
    const bEntry = flatBase.get(k);
    const oEntry = flatOurs.get(k);
    const tEntry = flatTheirs.get(k);

    const bVal = bEntry !== undefined ? bEntry.val : undefined;
    const oVal = oEntry !== undefined ? oEntry.val : undefined;
    const tVal = tEntry !== undefined ? tEntry.val : undefined;

    const oursChanged   = JSON.stringify(oVal) !== JSON.stringify(bVal);
    const theirsChanged = JSON.stringify(tVal) !== JSON.stringify(bVal);

    // Skip paths unchanged on both sides
    if (!oursChanged && !theirsChanged) continue;

    // Path array (from whichever side has it)
    const path    = (bEntry ?? oEntry ?? tEntry).path;
    const pathStr = path.map(String).join('.');

    let kind, side;

    if (oursChanged && theirsChanged) {
      if (JSON.stringify(oVal) === JSON.stringify(tVal)) {
        // Both sides agree on the new value → safe auto-merge
        kind = 'change';
        side = 'ours';
      } else {
        kind = 'conflict';
        side = null;
      }
    } else if (oursChanged) {
      kind = bEntry === undefined ? 'add'
           : oEntry === undefined ? 'remove'
           : 'change';
      side = 'ours';
    } else {
      kind = bEntry === undefined ? 'add'
           : tEntry === undefined ? 'remove'
           : 'change';
      side = 'theirs';
    }

    hunks.push({
      id: `h${seq++}`,
      path,
      pathStr,
      kind,
      side,
      baseVal:   bVal,
      oursVal:   oVal,
      theirsVal: tVal,
    });
  }

  return hunks;
}

// ─── Build result ──────────────────────────────────────────────────────────────

/**
 * Deep-clone base and apply all non-conflict hunks.
 * Conflict hunks are returned in a pending Map.
 *
 * @param {object}  base
 * @param {Hunk[]}  hunks
 * @returns {{ result: object, pending: Map<string, Hunk> }}
 */
function buildResult(base, hunks) {
  const result  = JSON.parse(JSON.stringify(base));
  const pending = new Map();

  for (const h of hunks) {
    if (h.kind === 'conflict') {
      pending.set(h.id, h);
      continue;
    }
    const applyVal = h.side === 'ours' ? h.oursVal : h.theirsVal;
    if (applyVal === undefined) {
      deleteAtPath(result, h.path);
    } else {
      setAtPath(result, h.path, applyVal);
    }
  }

  return { result, pending };
}

export { flattenLeaves, setAtPath, deleteAtPath, threeWayDiff, buildResult };
