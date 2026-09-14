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
 * Read a value at a dot-array path inside a nested structure.
 * Returns undefined if the path does not exist.
 *
 * @param {*}     root
 * @param {Array} path
 * @returns {*}
 */
function getAtPath(root, path) {
  let node = root;
  for (const key of path) {
    if (node == null) return undefined;
    node = node[key];
  }
  return node;
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

// ─── Move detection helpers ────────────────────────────────────────────────────

/**
 * Walk `val` recursively. For every plain-object array element that has an
 * `id` field, record  JSON.stringify(id) → pathToObject.
 * Also recurses into plain-object property values so nested arrays are found.
 *
 * @param {*}     val
 * @param {Array} path
 * @returns {Map<string, Array>}   serialised id → path array
 */
function collectIdObjects(val, path = []) {
  const m = new Map();
  if (val === null || typeof val !== 'object') return m;

  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      const item     = val[i];
      const itemPath = [...path, i];
      // Record array elements that are plain objects with an `id` field
      if (item !== null && typeof item === 'object' && !Array.isArray(item) && 'id' in item) {
        m.set(JSON.stringify(item.id), itemPath);
      }
      // Recurse for nested structures inside this element
      for (const [k, v] of collectIdObjects(item, itemPath)) {
        if (!m.has(k)) m.set(k, v);
      }
    }
  } else {
    // Plain object — recurse into values to find nested arrays
    for (const [k, v] of Object.entries(val)) {
      for (const [idKey, childPath] of collectIdObjects(v, [...path, k])) {
        if (!m.has(idKey)) m.set(idKey, childPath);
      }
    }
  }

  return m;
}

// ─── Three-way diff ────────────────────────────────────────────────────────────

/**
 * Compute hunks from base, ours, theirs.
 *
 * @typedef {{ id: string, path: Array, pathStr: string,
 *             kind: 'add'|'remove'|'change'|'conflict'|'move',
 *             side: 'ours'|'theirs'|null,
 *             baseVal: *, oursVal: *, theirsVal: *,
 *             fromPath?: Array, toPath?: Array, fromPathStr?: string, toPathStr?: string,
 *             arrayPath?: Array, sideArray?: Array }} Hunk
 *
 * @param {object} base
 * @param {object} ours
 * @param {object} theirs
 * @returns {Hunk[]}
 */
function threeWayDiff(base, ours, theirs) {
  let seq = 0;

  // ── Step 1 : Move detection ───────────────────────────────────────────────
  const baseIds   = collectIdObjects(base);
  const oursIds   = collectIdObjects(ours);
  const theirsIds = collectIdObjects(theirs);

  const moveHunks            = [];
  const suppressedArrayPaths = new Set(); // JSON-stringified array-path arrays

  for (const [idKey, basePath] of baseIds) {
    const oursPath   = oursIds.get(idKey);
    const theirsPath = theirsIds.get(idKey);

    const basePathStr = JSON.stringify(basePath);
    const oursMoved   = oursPath   && JSON.stringify(oursPath)   !== basePathStr;
    const theirsMoved = theirsPath && JSON.stringify(theirsPath) !== basePathStr;

    if (!oursMoved && !theirsMoved) continue;

    // When both sides moved, prefer ours (simple resolution)
    const side    = oursMoved ? 'ours'   : 'theirs';
    const toPath  = oursMoved ? oursPath : theirsPath;
    const sideVal = oursMoved ? ours     : theirs;

    // Parent array is one level up from the element path (e.g. ['items'] from ['items', 2])
    const arrayPath    = basePath.slice(0, -1);
    const arrayPathKey = JSON.stringify(arrayPath);
    const sideArray    = getAtPath(sideVal, arrayPath);

    if (!Array.isArray(sideArray)) continue; // guard against non-array parents

    suppressedArrayPaths.add(arrayPathKey);

    const oursObjPath   = oursIds.get(idKey)   ?? basePath;
    const theirsObjPath = theirsIds.get(idKey) ?? basePath;

    moveHunks.push({
      id:          `h${seq++}`,
      kind:        'move',
      side,
      // Canonical path for compatibility with existing code
      path:        basePath,
      pathStr:     basePath.map(String).join('.'),
      // Move-specific fields
      fromPath:    basePath,
      toPath,
      fromPathStr: basePath.map(String).join('.'),
      toPathStr:   toPath.map(String).join('.'),
      arrayPath,
      sideArray:   JSON.parse(JSON.stringify(sideArray)),
      baseVal:     getAtPath(base,   basePath),
      oursVal:     getAtPath(ours,   oursObjPath),
      theirsVal:   getAtPath(theirs, theirsObjPath),
    });
  }

  // ── Step 2 : Leaf diff (suppressing paths inside moved arrays) ────────────
  const flatBase   = flattenLeaves(base);
  const flatOurs   = flattenLeaves(ours);
  const flatTheirs = flattenLeaves(theirs);

  const allKeys = new Set([
    ...flatBase.keys(),
    ...flatOurs.keys(),
    ...flatTheirs.keys(),
  ]);

  const leafHunks = [];

  for (const k of allKeys) {
    const bEntry = flatBase.get(k);
    const oEntry = flatOurs.get(k);
    const tEntry = flatTheirs.get(k);

    const path = (bEntry ?? oEntry ?? tEntry).path;

    // Skip leaf paths that live inside a moved array — the array replacement
    // covers them wholesale; individual leaf hunks would be misleading.
    const suppressed = [...suppressedArrayPaths].some(arrStr => {
      const arr = JSON.parse(arrStr);
      return arr.length < path.length && arr.every((seg, i) => path[i] === seg);
    });
    if (suppressed) continue;

    const bVal = bEntry !== undefined ? bEntry.val : undefined;
    const oVal = oEntry !== undefined ? oEntry.val : undefined;
    const tVal = tEntry !== undefined ? tEntry.val : undefined;

    const oursChanged   = JSON.stringify(oVal) !== JSON.stringify(bVal);
    const theirsChanged = JSON.stringify(tVal) !== JSON.stringify(bVal);

    // Skip paths unchanged on both sides
    if (!oursChanged && !theirsChanged) continue;

    // Path array (from whichever side has it)
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

    leafHunks.push({
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

  // Move hunks first (applied before leaf hunks in buildResult)
  return [...moveHunks, ...leafHunks];
}

// ─── Build result ──────────────────────────────────────────────────────────────

/**
 * Deep-clone base and apply all non-conflict hunks.
 * Conflict hunks are returned in a pending Map.
 * Move hunks replace the entire parent array (once per unique array path).
 *
 * @param {object}  base
 * @param {Hunk[]}  hunks
 * @returns {{ result: object, pending: Map<string, Hunk> }}
 */
function buildResult(base, hunks) {
  const result            = JSON.parse(JSON.stringify(base));
  const pending           = new Map();
  const appliedArrayPaths = new Set(); // prevent double-applying a move for the same array

  for (const h of hunks) {
    if (h.kind === 'conflict') {
      pending.set(h.id, h);
      continue;
    }

    if (h.kind === 'move') {
      // Replace the entire parent array from the moving side — once per array path
      const key = JSON.stringify(h.arrayPath);
      if (!appliedArrayPaths.has(key)) {
        appliedArrayPaths.add(key);
        setAtPath(result, h.arrayPath, JSON.parse(JSON.stringify(h.sideArray)));
      }
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

export { flattenLeaves, getAtPath, setAtPath, deleteAtPath, threeWayDiff, buildResult };
