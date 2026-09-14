'use strict';
/**
 * git.js — content-addressed Git object store + high-level operations.
 *
 * Storage key: 'git-theatre-v1' in localStorage.
 *
 * Object header format (for hashing):  type SP byteLen NUL payload
 * Tree payload:   sorted lines "mode\tname\thash40\n"
 * Commit payload: git-like header block + blank line + message
 *
 * Exposed as window.Git = { … }.
 */
(function (root) {

  const STORAGE_KEY = 'git-theatre-v1';
  const ENC = new TextEncoder();

  // ── Store I/O ────────────────────────────────────────────────────────────

  function freshStore() {
    return {
      objects:    {},   // sha40 → { type, payload }
      refs:       {},   // 'HEAD' | 'refs/heads/NAME' → sha40 | 'ref: refs/heads/NAME'
      workingTree:{},   // filename → text
      index:      {},   // filename → sha40 (staging area)
      reflog:     {},   // ref → [{ old, new, action, time }]
      conflicts:  [],   // filenames currently in conflict
      mergeState: null  // { parentSha, branchName } while merge is pending
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshStore();
      return Object.assign(freshStore(), JSON.parse(raw));
    } catch { return freshStore(); }
  }

  function save(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  // ── Object hashing & storage ─────────────────────────────────────────────

  /**
   * Compute SHA-1 of the git-format object:  "type byteLen\0payload"
   */
  function hashGitObject(type, payload) {
    const payloadBytes = ENC.encode(payload);
    const headerBytes  = ENC.encode(`${type} ${payloadBytes.length}\0`);
    const buf = new Uint8Array(headerBytes.length + payloadBytes.length);
    buf.set(headerBytes);
    buf.set(payloadBytes, headerBytes.length);
    return SHA1.sha1Bytes(buf);
  }

  function writeObject(store, type, payload) {
    const sha = hashGitObject(type, payload);
    if (!store.objects[sha]) store.objects[sha] = { type, payload };
    return sha;
  }

  function readObject(store, sha) {
    return store.objects[sha] || null;
  }

  // ── Blob ─────────────────────────────────────────────────────────────────

  function writeBlob(store, text) {
    return writeObject(store, 'blob', text);
  }

  // ── Tree ─────────────────────────────────────────────────────────────────
  // Tree payload: entries sorted by name, one per line: "mode\tname\tsha40"

  function serializeTree(entries) {
    return [...entries]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(e => `${e.mode}\t${e.name}\t${e.hash}`)
      .join('\n');
  }

  function deserializeTree(payload) {
    if (!payload) return [];
    return payload.split('\n').filter(Boolean).map(line => {
      const [mode, name, hash] = line.split('\t');
      return { mode, name, hash };
    });
  }

  function writeTree(store, entries) {
    return writeObject(store, 'tree', serializeTree(entries));
  }

  function readTree(store, sha) {
    const obj = readObject(store, sha);
    if (!obj || obj.type !== 'tree') return [];
    return deserializeTree(obj.payload);
  }

  // ── Commit ───────────────────────────────────────────────────────────────
  // Commit payload:
  //   tree <sha>\nparent <sha>\nauthor <name> <> <ms-timestamp>\n\n<message>

  function serializeCommit(c) {
    const lines = [`tree ${c.tree}`];
    for (const p of (c.parents || [])) lines.push(`parent ${p}`);
    lines.push(`author ${c.author || 'User'} <> ${c.timestamp}`);
    lines.push('');
    lines.push(c.message || '');
    return lines.join('\n');
  }

  function deserializeCommit(payload) {
    const sep = payload.indexOf('\n\n');
    const header = sep === -1 ? payload : payload.slice(0, sep);
    const message = sep === -1 ? '' : payload.slice(sep + 2).trimEnd();
    const c = { parents: [], message };
    for (const line of header.split('\n')) {
      if (line.startsWith('tree '))   { c.tree = line.slice(5); }
      else if (line.startsWith('parent ')) { c.parents.push(line.slice(7)); }
      else if (line.startsWith('author ')) {
        const m = line.match(/^author (.+) <> (\d+)$/);
        if (m) { c.author = m[1]; c.timestamp = +m[2]; }
      }
    }
    return c;
  }

  function writeCommit(store, c) {
    return writeObject(store, 'commit', serializeCommit(c));
  }

  function readCommit(store, sha) {
    if (!sha) return null;
    const obj = readObject(store, sha);
    if (!obj || obj.type !== 'commit') return null;
    return { sha, ...deserializeCommit(obj.payload) };
  }

  // ── Refs ─────────────────────────────────────────────────────────────────

  function resolveHead(store) {
    const head = store.refs['HEAD'];
    if (!head) return null;
    if (head.startsWith('ref: ')) return store.refs[head.slice(5)] || null;
    return head;
  }

  function headBranch(store) {
    const head = store.refs['HEAD'];
    if (head && head.startsWith('ref: refs/heads/'))
      return head.slice('ref: refs/heads/'.length);
    return null;
  }

  function getBranches(store) {
    return Object.entries(store.refs)
      .filter(([k]) => k.startsWith('refs/heads/'))
      .map(([k, sha]) => ({ name: k.slice('refs/heads/'.length), sha }));
  }

  // ── Reflog ───────────────────────────────────────────────────────────────

  function appendReflog(store, ref, oldSha, newSha, action) {
    if (!store.reflog[ref]) store.reflog[ref] = [];
    store.reflog[ref].unshift({
      old:  oldSha  || null,
      new:  newSha  || null,
      action,
      time: Date.now()
    });
    if (store.reflog[ref].length > 200) store.reflog[ref].length = 200;
  }

  // ── Working-tree helpers ─────────────────────────────────────────────────

  function treeToWorkingTree(store, treeSha) {
    const wt = {};
    for (const e of readTree(store, treeSha)) {
      const obj = readObject(store, e.hash);
      if (obj) wt[e.name] = obj.payload;
    }
    return wt;
  }

  // ── Graph helpers ────────────────────────────────────────────────────────

  /** BFS: all commits reachable from sha (inclusive). */
  function ancestorSet(store, sha) {
    const seen = new Set();
    const queue = [sha];
    while (queue.length) {
      const s = queue.shift();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      const c = readCommit(store, s);
      if (c) for (const p of c.parents) queue.push(p);
    }
    return seen;
  }

  /** BFS from b; return first sha reachable also from ancestorSet(a). */
  function findLCA(store, a, b) {
    const anA = ancestorSet(store, a);
    const queue = [b];
    const seen = new Set();
    while (queue.length) {
      const s = queue.shift();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      if (anA.has(s)) return s;
      const c = readCommit(store, s);
      if (c) for (const p of c.parents) queue.push(p);
    }
    return null;
  }

  /**
   * Commits reachable from `sha` but NOT in excludeSet,
   * topologically ordered (parents before children).
   */
  function uniqueCommits(store, sha, excludeSet) {
    const result = [];
    const visited = new Set();
    function dfs(s) {
      if (!s || visited.has(s) || excludeSet.has(s)) return;
      visited.add(s);
      const c = readCommit(store, s);
      if (!c) return;
      for (const p of c.parents) dfs(p);
      if (!excludeSet.has(s)) result.push(s);
    }
    dfs(sha);
    return result;  // parents appear before children
  }

  // ── Working-tree mutations (called from UI) ──────────────────────────────

  function saveWorkingTreeFile(path, text) {
    const store = load();
    store.workingTree[path] = text;
    save(store);
  }

  function createWorkingTreeFile(path, text) {
    const store = load();
    if (store.workingTree[path] !== undefined)
      throw new Error(`File already exists: ${path}`);
    store.workingTree[path] = text || '';
    save(store);
  }

  function deleteWorkingTreeFile(path) {
    const store = load();
    delete store.workingTree[path];
    delete store.index[path];
    save(store);
  }

  // ── Staging ──────────────────────────────────────────────────────────────

  function stageFile(path) {
    const store = load();
    const text = store.workingTree[path];
    if (text === undefined) throw new Error(`Not in working tree: ${path}`);
    store.index[path] = writeBlob(store, text);
    save(store);
  }

  /** Replaces entire index with current working tree (handles additions & deletions). */
  function stageAll() {
    const store = load();
    const newIndex = {};
    for (const [name, text] of Object.entries(store.workingTree)) {
      newIndex[name] = writeBlob(store, text);
    }
    store.index = newIndex;
    save(store);
  }

  // ── Commit ───────────────────────────────────────────────────────────────

  function doCommit(message, author) {
    author = author || 'User';
    const store = load();
    if (!Object.keys(store.index).length)
      throw new Error('Nothing staged. Stage files first.');

    const entries = Object.entries(store.index)
      .map(([name, hash]) => ({ name, mode: '100644', hash }));
    const treeSha = writeTree(store, entries);

    const headSha = resolveHead(store);
    const parents = headSha ? [headSha] : [];
    if (store.mergeState) parents.push(store.mergeState.parentSha);

    const commitSha = writeCommit(store, {
      tree: treeSha, parents, author, message, timestamp: Date.now()
    });

    const branch = headBranch(store);
    if (branch) {
      const ref = `refs/heads/${branch}`;
      appendReflog(store, ref,    headSha, commitSha, `commit: ${message}`);
      appendReflog(store, 'HEAD', headSha, commitSha, `commit (${branch}): ${message}`);
      store.refs[ref] = commitSha;
    } else {
      appendReflog(store, 'HEAD', headSha, commitSha, `commit: ${message}`);
      store.refs['HEAD'] = commitSha;   // detached HEAD advances
    }

    store.mergeState = null;
    store.conflicts  = [];
    save(store);
    return commitSha;
  }

  // ── Branch ops ───────────────────────────────────────────────────────────

  function createBranch(name, fromSha) {
    const store = load();
    const sha = fromSha || resolveHead(store);
    if (!sha) throw new Error('No HEAD to branch from');
    if (store.refs[`refs/heads/${name}`])
      throw new Error(`Branch '${name}' already exists`);
    store.refs[`refs/heads/${name}`] = sha;
    save(store);
  }

  function doCheckout(branchName) {
    const store = load();
    const ref = `refs/heads/${branchName}`;
    const sha = store.refs[ref];
    if (!sha) throw new Error(`Branch not found: ${branchName}`);

    const oldSha = resolveHead(store);
    const commit = readCommit(store, sha);
    if (commit) {
      store.workingTree = treeToWorkingTree(store, commit.tree);
      store.index = {};
      for (const e of readTree(store, commit.tree)) store.index[e.name] = e.hash;
    }

    store.refs['HEAD'] = `ref: ${ref}`;
    store.conflicts  = [];
    store.mergeState = null;
    appendReflog(store, 'HEAD', oldSha, sha, `checkout: ${branchName}`);
    save(store);
  }

  // ── Merge ────────────────────────────────────────────────────────────────

  function doMerge(branchName) {
    const store  = load();
    const curSha = resolveHead(store);
    const tgtSha = store.refs[`refs/heads/${branchName}`];

    if (!tgtSha) throw new Error(`Branch not found: ${branchName}`);
    if (!curSha) throw new Error('Nothing to merge into (no HEAD)');
    if (curSha === tgtSha) return { type: 'up-to-date' };

    const lca = findLCA(store, curSha, tgtSha);

    // ── Fast-forward ──
    if (lca === curSha) {
      const branch = headBranch(store);
      if (branch) {
        const ref = `refs/heads/${branch}`;
        appendReflog(store, ref,    curSha, tgtSha, `merge ${branchName}: Fast-forward`);
        appendReflog(store, 'HEAD', curSha, tgtSha, `merge ${branchName}: Fast-forward`);
        store.refs[ref] = tgtSha;
      }
      const commit = readCommit(store, tgtSha);
      if (commit) {
        store.workingTree = treeToWorkingTree(store, commit.tree);
        store.index = {};
        for (const e of readTree(store, commit.tree)) store.index[e.name] = e.hash;
      }
      store.conflicts  = [];
      store.mergeState = null;
      save(store);
      return { type: 'fast-forward', sha: tgtSha };
    }

    // Already up to date
    if (lca === tgtSha) return { type: 'up-to-date' };

    // ── Three-way merge ──
    const baseLca  = lca ? readCommit(store, lca) : null;
    const baseTree = baseLca ? treeToWorkingTree(store, baseLca.tree) : {};
    const ourTree  = treeToWorkingTree(store, readCommit(store, curSha).tree);
    const theirTree= treeToWorkingTree(store, readCommit(store, tgtSha).tree);

    const allFiles = new Set([
      ...Object.keys(ourTree), ...Object.keys(theirTree)
    ]);
    const merged    = {};
    const conflicts = [];

    for (const path of allFiles) {
      const base  = baseTree[path];
      const ours  = ourTree[path];
      const theirs= theirTree[path];

      if (ours === theirs) {
        if (ours !== undefined) merged[path] = ours;
        continue;
      }
      if (ours   === base) { if (theirs !== undefined) merged[path] = theirs; continue; }
      if (theirs === base) { if (ours   !== undefined) merged[path] = ours;   continue; }

      // True conflict
      merged[path] =
        `<<<<<<< HEAD\n${ours || ''}\n=======\n${theirs || ''}\n>>>>>>> ${branchName}`;
      conflicts.push(path);
    }

    // Update working tree & index
    store.workingTree = merged;
    const newIndex = {};
    for (const [name, text] of Object.entries(merged)) {
      newIndex[name] = writeBlob(store, text);
    }
    store.index     = newIndex;
    store.conflicts = conflicts;

    if (conflicts.length === 0) {
      // Auto-complete the merge commit
      const entries = Object.entries(merged)
        .map(([name, text]) => ({ name, mode: '100644', hash: newIndex[name] }));
      const treeSha   = writeTree(store, entries);
      const mergeSha  = writeCommit(store, {
        tree: treeSha, parents: [curSha, tgtSha],
        author: 'User', message: `Merge branch '${branchName}'`, timestamp: Date.now()
      });
      const branch = headBranch(store);
      if (branch) {
        const ref = `refs/heads/${branch}`;
        appendReflog(store, ref,    curSha, mergeSha, `merge ${branchName}: Merge made`);
        appendReflog(store, 'HEAD', curSha, mergeSha, `merge ${branchName}: Merge made`);
        store.refs[ref] = mergeSha;
      }
      store.mergeState = null;
      save(store);
      return { type: 'merge', sha: mergeSha };
    }

    store.mergeState = { parentSha: tgtSha, branchName };
    save(store);
    return { type: 'conflict', conflicts };
  }

  // ── Rebase ───────────────────────────────────────────────────────────────

  function doRebase(targetBranch) {
    const store     = load();
    const curBranch = headBranch(store);
    const curSha    = resolveHead(store);
    const tgtSha    = store.refs[`refs/heads/${targetBranch}`];

    if (!tgtSha)  throw new Error(`Branch not found: ${targetBranch}`);
    if (!curSha)  throw new Error('No HEAD');
    if (curSha === tgtSha) return { oldToNew: {}, newHead: tgtSha };

    const tgtAncestors = ancestorSet(store, tgtSha);
    // commits unique to current branch, in parent-first order
    const toReplay     = uniqueCommits(store, curSha, tgtAncestors);

    let newHead     = tgtSha;
    const oldToNew  = {};

    for (const sha of toReplay) {
      const c = readCommit(store, sha);
      if (!c) continue;

      // Compute diff: what did this commit change relative to its first parent?
      const parentSha  = c.parents[0] || null;
      const baseTree   = parentSha
        ? treeToWorkingTree(store, readCommit(store, parentSha).tree)
        : {};
      const commitTree = treeToWorkingTree(store, c.tree);

      // Apply that diff onto newHead's tree
      const newHeadC   = readCommit(store, newHead);
      const baseTarget = newHeadC ? treeToWorkingTree(store, newHeadC.tree) : {};
      const newTree    = { ...baseTarget };

      // Apply additions / modifications
      for (const [path, text] of Object.entries(commitTree)) {
        newTree[path] = text;
      }
      // Apply deletions
      for (const path of Object.keys(baseTree)) {
        if (!(path in commitTree)) delete newTree[path];
      }

      const entries = Object.entries(newTree)
        .map(([name, text]) => ({ name, mode: '100644', hash: writeBlob(store, text) }));
      const newTreeSha = writeTree(store, entries);

      const newSha = writeCommit(store, {
        tree:      newTreeSha,
        parents:   [newHead],
        author:    c.author,
        message:   c.message,
        timestamp: c.timestamp   // same timestamp, different parent → different hash ✓
      });

      oldToNew[sha] = newSha;
      newHead = newSha;
    }

    if (curBranch) {
      const ref = `refs/heads/${curBranch}`;
      appendReflog(store, ref,    curSha, newHead, `rebase: onto ${targetBranch}`);
      appendReflog(store, 'HEAD', curSha, newHead, `rebase: onto ${targetBranch}`);
      store.refs[ref] = newHead;
    }

    const headC = readCommit(store, newHead);
    if (headC) {
      store.workingTree = treeToWorkingTree(store, headC.tree);
      store.index = {};
      for (const e of readTree(store, headC.tree)) store.index[e.name] = e.hash;
    }
    store.conflicts  = [];
    store.mergeState = null;
    save(store);
    return { oldToNew, newHead };
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  /** Returns all commit objects reachable from any branch (or detached HEAD). */
  function getAllCommits(store) {
    const seen = new Set();
    const commits = [];
    function visit(sha) {
      if (!sha || seen.has(sha)) return;
      seen.add(sha);
      const c = readCommit(store, sha);
      if (!c) return;
      commits.push(c);
      for (const p of c.parents) visit(p);
    }
    const head = store.refs['HEAD'];
    if (head && !head.startsWith('ref: ')) visit(head);        // detached HEAD
    for (const [k, sha] of Object.entries(store.refs)) {
      if (k.startsWith('refs/heads/')) visit(sha);
    }
    return commits;
  }

  /** Human-readable cat-file output for a given sha. */
  function catFile(store, sha) {
    sha = (sha || '').trim();
    if (!sha) return 'error: empty hash';
    const obj = readObject(store, sha);
    if (!obj) return `error: object not found\n${sha}`;

    if (obj.type === 'tree') {
      const entries = deserializeTree(obj.payload);
      const body = entries
        .map(e => `${e.mode}  ${e.name.padEnd(24)}  ${e.hash}`)
        .join('\n');
      return `type: tree\nsha:  ${sha}\n\n${body}`;
    }

    return `type: ${obj.type}\nsha:  ${sha}\n\n${obj.payload}`;
  }

  // ── Seed ─────────────────────────────────────────────────────────────────
  // Fixed timestamps ⇒ deterministic hashes every reset.

  const T0 = 1_700_000_000_000;   // 2023-11-14

  function buildSeed() {
    const s = freshStore();

    // ── C1: initial commit on main ──
    const b_readme1 = writeBlob(s,
      '# Git Theatre\n\nWelcome to git-theatre — an in-browser Git object store.\n');
    const t1 = writeTree(s, [{ name:'README.md', mode:'100644', hash: b_readme1 }]);
    const c1 = writeCommit(s, { tree:t1, parents:[], author:'Alice',
                                 message:'Initial commit', timestamp: T0 });

    // ── C2: add hello.js ──
    const b_hello = writeBlob(s,
      'function hello() {\n  console.log("Hello, world!");\n}\nhello();\n');
    const t2 = writeTree(s, [
      { name:'README.md', mode:'100644', hash: b_readme1 },
      { name:'hello.js',  mode:'100644', hash: b_hello   }
    ]);
    const c2 = writeCommit(s, { tree:t2, parents:[c1], author:'Alice',
                                 message:'Add hello.js', timestamp: T0 + 100_000 });

    // ── C3: feature branch — add feature.js (child of C2) ──
    const b_feature = writeBlob(s,
      "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n");
    const t3 = writeTree(s, [
      { name:'README.md',  mode:'100644', hash: b_readme1 },
      { name:'feature.js', mode:'100644', hash: b_feature },
      { name:'hello.js',   mode:'100644', hash: b_hello   }
    ]);
    const c3 = writeCommit(s, { tree:t3, parents:[c2], author:'Bob',
                                 message:'Add feature.js', timestamp: T0 + 200_000 });

    // ── C4: main — update README (diverges from feature at C2) ──
    const b_readme2 = writeBlob(s,
      '# Git Theatre\n\nWelcome to git-theatre — an in-browser Git object store.\n\n## Features\n\n- Content-addressed objects (SHA-1)\n- Branches, merge, rebase\n');
    const t4 = writeTree(s, [
      { name:'README.md', mode:'100644', hash: b_readme2 },
      { name:'hello.js',  mode:'100644', hash: b_hello   }
    ]);
    const c4 = writeCommit(s, { tree:t4, parents:[c2], author:'Alice',
                                 message:'Update README with features', timestamp: T0 + 300_000 });

    // ── C5: merge commit — parents [C4, C3] ──
    const t5 = writeTree(s, [
      { name:'README.md',  mode:'100644', hash: b_readme2 },
      { name:'feature.js', mode:'100644', hash: b_feature },
      { name:'hello.js',   mode:'100644', hash: b_hello   }
    ]);
    const c5 = writeCommit(s, { tree:t5, parents:[c4, c3], author:'Alice',
                                 message:"Merge branch 'feature'", timestamp: T0 + 400_000 });

    // ── C6: dev branch — add dev.js (child of C2, NOT on main) ──
    const b_dev = writeBlob(s,
      '// dev experiment\nexport const VERSION = "0.1-dev";\n');
    const t6 = writeTree(s, [
      { name:'README.md', mode:'100644', hash: b_readme1 },
      { name:'dev.js',    mode:'100644', hash: b_dev    },
      { name:'hello.js',  mode:'100644', hash: b_hello  }
    ]);
    const c6 = writeCommit(s, { tree:t6, parents:[c2], author:'Carol',
                                 message:'Add dev.js (dev branch)', timestamp: T0 + 250_000 });

    // ── Refs ──
    s.refs['HEAD']                = 'ref: refs/heads/main';
    s.refs['refs/heads/main']     = c5;
    s.refs['refs/heads/feature']  = c3;
    s.refs['refs/heads/dev']      = c6;

    // Working tree = C5 tree
    s.workingTree = {
      'README.md':  '# Git Theatre\n\nWelcome to git-theatre — an in-browser Git object store.\n\n## Features\n\n- Content-addressed objects (SHA-1)\n- Branches, merge, rebase\n',
      'hello.js':   'function hello() {\n  console.log("Hello, world!");\n}\nhello();\n',
      'feature.js': "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n"
    };
    s.index = {
      'README.md':  b_readme2,
      'hello.js':   b_hello,
      'feature.js': b_feature
    };

    // Seed reflog (oldest last)
    const rl = (ref, o, n, a) => appendReflog(s, ref, o, n, a);
    rl('refs/heads/main',    null, c1, 'commit: Initial commit');
    rl('refs/heads/main',    c1,   c2, 'commit: Add hello.js');
    rl('refs/heads/main',    c2,   c4, 'commit: Update README with features');
    rl('refs/heads/main',    c4,   c5, "merge feature: Merge made");
    rl('refs/heads/feature', null, c2, 'branch: created from main');
    rl('refs/heads/feature', c2,   c3, 'commit: Add feature.js');
    rl('refs/heads/dev',     null, c2, 'branch: created from main');
    rl('refs/heads/dev',     c2,   c6, 'commit: Add dev.js (dev branch)');
    rl('HEAD',               null, c5, 'checkout: main');

    return s;
  }

  function resetToSeed() { save(buildSeed()); }

  function initIfEmpty() {
    if (!localStorage.getItem(STORAGE_KEY)) resetToSeed();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  root.Git = {
    // I/O
    load, save,
    // Object primitives
    hashGitObject, readObject,
    writeBlob, writeTree, writeCommit,
    readTree, readCommit,
    serializeCommit, deserializeCommit,
    // Refs
    resolveHead, headBranch, getBranches,
    // Working tree
    treeToWorkingTree,
    saveWorkingTreeFile, createWorkingTreeFile, deleteWorkingTreeFile,
    // Staging & commit
    stageFile, stageAll, doCommit,
    // Branch ops
    createBranch, doCheckout,
    // Merge & rebase
    doMerge, doRebase,
    // Query
    getAllCommits, catFile,
    appendReflog,
    // Seed
    resetToSeed, initIfEmpty
  };
})(window);
