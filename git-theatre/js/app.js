'use strict';
/**
 * app.js — UI layer for git-theatre.
 *
 * Panels: Working Tree (left) + DAG / Reflog / Cat-file tabs (right).
 * Hash routing: #/c/<sha40>  →  selects commit.
 */
(function (root) {

  // ── App state ─────────────────────────────────────────────────────────────
  let currentFile  = null;   // filename open in editor
  let selectedSha  = null;   // commit highlighted in DAG
  let activeTab    = 'dag';  // 'dag' | 'reflog' | 'catfile'

  // ── Escape helper ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Full re-render ────────────────────────────────────────────────────────
  function renderAll() {
    const store = Git.load();
    renderBranchSelect(store);
    renderFileList(store);
    renderEditor(store);
    renderConflictBanner(store);
    renderActiveTab(store);
  }

  // ── Header: branch select ─────────────────────────────────────────────────
  function renderBranchSelect(store) {
    const current  = Git.headBranch(store);
    const branches = Git.getBranches(store);
    const sel = document.getElementById('branchSelect');
    sel.innerHTML = branches.map(b =>
      `<option value="${esc(b.name)}"${b.name === current ? ' selected' : ''}>${esc(b.name)}</option>`
    ).join('');
  }

  // ── Left: file list ───────────────────────────────────────────────────────
  function renderFileList(store) {
    const el        = document.getElementById('fileList');
    const files     = Object.keys(store.workingTree).sort();
    const conflicts = store.conflicts || [];

    el.innerHTML = files.map(f => {
      const isStaged   = !!store.index[f];
      const isConflict = conflicts.includes(f);
      const isActive   = f === currentFile;

      let cls = 'file-item';
      if (isActive)   cls += ' active';
      if (isConflict) cls += ' conflict';

      const status = isConflict ? '⚠' : (isStaged ? '✓' : '·');
      return `<div class="${cls}" onclick="App.openFile(${JSON.stringify(f)})" title="${esc(f)}">
        <span class="file-name">${esc(f)}</span>
        <span class="file-status${isConflict ? ' is-conflict' : (isStaged ? ' is-staged' : '')}">${status}</span>
      </div>`;
    }).join('');
  }

  // ── Left: editor ─────────────────────────────────────────────────────────
  function renderEditor(store) {
    const editor   = document.getElementById('fileEditor');
    const labelEl  = document.getElementById('editorFilename');

    if (currentFile && store.workingTree[currentFile] !== undefined) {
      // Only update if content differs (avoid caret jump)
      if (editor.value !== store.workingTree[currentFile]) {
        editor.value = store.workingTree[currentFile];
      }
      editor.disabled = false;
      labelEl.textContent = currentFile;
    } else {
      editor.value    = '';
      editor.disabled = true;
      labelEl.textContent = currentFile || '(no file selected)';
    }
  }

  // ── Left: conflict banner ─────────────────────────────────────────────────
  function renderConflictBanner(store) {
    const banner    = document.getElementById('conflictBanner');
    const conflicts = store.conflicts || [];
    if (conflicts.length) {
      banner.textContent = `⚠ Conflict in: ${conflicts.join(', ')} — resolve markers then Stage All + Commit`;
      banner.classList.add('visible');
    } else if (store.mergeState) {
      banner.textContent = 'Merge in progress — stage resolved files and commit';
      banner.classList.add('visible');
    } else if (store.cherryPickState) {
      banner.textContent = 'Cherry-pick in progress — resolve markers then Stage All + Commit';
      banner.classList.add('visible');
    } else {
      banner.classList.remove('visible');
    }
  }

  // ── Right: tabs ───────────────────────────────────────────────────────────
  function renderActiveTab(store) {
    if (activeTab === 'dag')     renderDAGTab(store);
    if (activeTab === 'reflog')  renderReflogTab(store);
    if (activeTab === 'catfile') { /* only on explicit action */ }
  }

  // ── DAG tab ───────────────────────────────────────────────────────────────

  function computeDAGLayout(commits) {
    // newest-first
    const sorted = [...commits].sort((a, b) => b.timestamp - a.timestamp);
    const layout = {};   // sha → { lane, row }
    const lanes  = [];   // lanes[i] = sha we're waiting for at that lane (null = free)

    for (let row = 0; row < sorted.length; row++) {
      const { sha, parents } = sorted[row];

      // Find existing lane or claim a new one
      let laneIdx = lanes.indexOf(sha);
      if (laneIdx === -1) {
        laneIdx = lanes.indexOf(null);
        if (laneIdx === -1) laneIdx = lanes.length;
      }
      lanes[laneIdx] = sha;   // occupy slot
      layout[sha] = { lane: laneIdx, row };

      // Primary parent continues the same lane; additional parents get new lanes
      if (!parents.length) {
        lanes[laneIdx] = null;
      } else {
        lanes[laneIdx] = parents[0];
        for (let i = 1; i < parents.length; i++) {
          const p = parents[i];
          if (!lanes.includes(p)) {
            let slot = lanes.indexOf(null);
            if (slot === -1) slot = lanes.length;
            lanes[slot] = p;
          }
        }
      }
    }

    return { layout, sorted };
  }

  function renderDAGSVG(commits, refs, selSha) {
    if (!commits.length)
      return '<p class="dag-empty">No commits yet.</p>';

    const { layout, sorted } = computeDAGLayout(commits);

    const ROW_H  = 54;
    const LW     = 22;    // lane width
    const NR     = 7;     // node radius
    const PAD    = 14;
    const TGAP   = 10;

    const maxLane = Math.max(0, ...Object.values(layout).map(l => l.lane));
    const textX   = PAD + (maxLane + 1) * LW + TGAP;
    const svgW    = Math.max(600, textX + 400);
    const svgH    = sorted.length * ROW_H + 30;

    // sha → [{ name, isCurrent }]
    const shaRefs = {};
    const headVal = refs['HEAD'] || '';
    let   headSha = headVal.startsWith('ref: ')
                    ? (refs[headVal.slice(5)] || null)
                    : (headVal || null);
    for (const [ref, sha] of Object.entries(refs)) {
      if (!ref.startsWith('refs/heads/')) continue;
      if (!shaRefs[sha]) shaRefs[sha] = [];
      shaRefs[sha].push({
        name: ref.slice('refs/heads/'.length),
        isCurrent: headVal === `ref: ${ref}`
      });
    }

    const COLORS = ['#b4451a','#1a6eb4','#4a9c4a','#8b4ab4','#b4a01a','#1a9eb4','#c06820'];
    const lc = l => COLORS[l % COLORS.length];

    const parts = [`<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">`];

    // ── Edges ──
    for (const c of sorted) {
      const { lane, row } = layout[c.sha];
      const x1 = PAD + lane * LW + LW / 2;
      const y1 = 15  + row * ROW_H + ROW_H / 2;

      for (let pi = 0; pi < c.parents.length; pi++) {
        const p = c.parents[pi];
        if (!layout[p]) continue;
        const { lane: pl, row: pr } = layout[p];
        const x2 = PAD + pl * LW + LW / 2;
        const y2 = 15  + pr * ROW_H + ROW_H / 2;
        const col = lc(pi === 0 ? lane : pl);
        if (x1 === x2) {
          parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2" opacity=".65"/>`);
        } else {
          const mid = Math.round((y1 + y2) / 2);
          parts.push(`<path d="M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}" fill="none" stroke="${col}" stroke-width="2" opacity=".65"/>`);
        }
      }
    }

    // ── Nodes + labels ──
    for (const c of sorted) {
      const { lane, row } = layout[c.sha];
      const cx  = PAD + lane * LW + LW / 2;
      const cy  = 15  + row  * ROW_H + ROW_H / 2;
      const col = lc(lane);
      const sel = c.sha === selSha;
      const fill= sel ? col : '#fffdf8';
      const sw  = sel ? 2.5 : 2;

      // HEAD ring
      if (c.sha === headSha) {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${NR + 4}" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="3,2" opacity=".5"/>`);
      }
      // Node
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${NR}" fill="${fill}" stroke="${col}" stroke-width="${sw}" style="cursor:pointer" onclick="App.selectCommit('${c.sha}')"/>`);

      // Branch badges
      const refs2 = shaRefs[c.sha] || [];
      let lx = textX;
      for (const r of refs2) {
        const bg  = r.isCurrent ? col : '#c8bbaa';
        const fg  = r.isCurrent ? '#fffdf8' : '#3a322a';
        const w   = r.name.length * 7.5 + 14;
        parts.push(`<rect x="${lx}" y="${cy-10}" width="${w}" height="20" rx="4" fill="${bg}"/>`);
        parts.push(`<text x="${lx+7}" y="${cy+5}" font-family="IBM Plex Mono,monospace" font-size="10" fill="${fg}">${esc(r.name)}</text>`);
        lx += w + 5;
      }

      // Short SHA
      const short = c.sha.slice(0, 7);
      const msg   = esc((c.message || '').replace(/\n[\s\S]*/,'').slice(0, 52));
      parts.push(`<text x="${lx}" y="${cy-4}" font-family="IBM Plex Mono,monospace" font-size="10" fill="#b4451a" style="cursor:pointer" onclick="App.selectCommit('${c.sha}')">${short}</text>`);
      parts.push(`<text x="${lx}" y="${cy+11}" font-family="IBM Plex Sans,sans-serif" font-size="11" fill="#2a251f">${msg}</text>`);
    }

    parts.push('</svg>');
    return parts.join('');
  }

  function renderDAGTab(store) {
    const commits = Git.getAllCommits(store);
    document.getElementById('dagContainer').innerHTML =
      renderDAGSVG(commits, store.refs, selectedSha);
  }

  // ── Reflog tab ────────────────────────────────────────────────────────────
  function renderReflogTab(store) {
    const el      = document.getElementById('reflogContainer');
    const reflog  = store.reflog || {};
    const current = Git.headBranch(store);

    // Put HEAD first, then current branch, then others sorted
    const orderedRefs = [
      'HEAD',
      current ? `refs/heads/${current}` : null,
      ...Object.keys(reflog).filter(r => r !== 'HEAD' && r !== `refs/heads/${current}`)
    ].filter(Boolean).filter(r => reflog[r] && reflog[r].length);

    let html = '';
    for (const ref of orderedRefs) {
      const entries = reflog[ref] || [];
      if (!entries.length) continue;
      html += `<div class="reflog-ref-header">${esc(ref)}</div>`;
      for (const e of entries) {
        const ts       = new Date(e.time).toLocaleTimeString();
        const newShort = e.new  ? e.new.slice(0, 7)  : '0000000';
        const oldShort = e.old  ? e.old.slice(0, 7)  : '0000000';
        const clickSha = e.new  || '';
        html += `<div class="reflog-entry">
          <div class="reflog-shas">
            <span class="sha-link" onclick="App.selectCommit('${clickSha}')">${newShort}</span>
            <span class="reflog-arrow">←</span>
            <span class="reflog-old">${oldShort}</span>
          </div>
          <div class="reflog-action">${esc(e.action)}</div>
          <div class="reflog-time">${ts}</div>
        </div>`;
      }
    }
    if (!html) html = '<p class="empty-msg">No reflog entries yet.</p>';
    el.innerHTML = html;
  }

  // ── Cat-file tab ──────────────────────────────────────────────────────────
  function showCatfile(sha) {
    const store = Git.load();
    const out   = Git.catFile(store, sha);
    document.getElementById('catfileOutput').textContent = out;
  }

  // ── Commit selection (hash routing) ───────────────────────────────────────
  function selectCommit(sha) {
    selectedSha = sha;
    history.pushState(null, '', `#/c/${sha}`);
    // Switch to cat-file tab and show output
    setTab('catfile');
    document.getElementById('catfileHash').value = sha;
    showCatfile(sha);
    renderAll();
  }

  function openFile(path) {
    currentFile = path;
    renderAll();
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  function setTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name)
    );
    document.querySelectorAll('.tab-pane').forEach(p =>
      p.classList.toggle('active', p.id === `tab-${name}`)
    );
    const store = Git.load();
    if (name === 'dag')    renderDAGTab(store);
    if (name === 'reflog') renderReflogTab(store);
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function showModal(id)  { document.getElementById(id).classList.add('visible'); }
  function closeModal(id) { document.getElementById(id).classList.remove('visible'); }

  function populateCherryPickModal() {
    const store   = Git.load();
    const commits = Git.getAllCommits(store).sort((a, b) => b.timestamp - a.timestamp);
    const head    = Git.resolveHead(store);
    const sel     = document.getElementById('cherryPickSelect');
    sel.innerHTML = '<option value="">— select a commit —</option>' +
      commits.map(c => {
        const short  = c.sha.slice(0, 7);
        const msg    = esc((c.message || '').split('\n')[0].slice(0, 48));
        const isHead = c.sha === head ? ' (HEAD)' : '';
        return `<option value="${c.sha}">${short}  ${msg}${isHead}</option>`;
      }).join('');
    const input = document.getElementById('cherryPickSha');
    const pre   = selectedSha || '';
    input.value = pre;
    sel.value   = pre && commits.some(c => c.sha === pre) ? pre : '';
  }

  function populateBranchSelect(selId) {
    const store   = Git.load();
    const current = Git.headBranch(store);
    const opts    = Git.getBranches(store)
      .filter(b => b.name !== current)
      .map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`)
      .join('');
    document.getElementById(selId).innerHTML = opts ||
      '<option value="">— no other branches —</option>';
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function toast(msg, isError) {
    const prev = document.querySelector('.notification');
    if (prev) prev.remove();
    const el = document.createElement('div');
    el.className = 'notification' + (isError ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; setTimeout(() => el.remove(), 350); }, 2800);
  }

  // ── Hash-based routing ────────────────────────────────────────────────────
  function handleHashChange() {
    const m = window.location.hash.match(/^#\/c\/([0-9a-f]{40})$/i);
    if (m) {
      selectedSha = m[1];
      document.getElementById('catfileHash').value = m[1];
      showCatfile(m[1]);
      if (activeTab !== 'catfile') setTab('catfile');
      renderAll();
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    Git.initIfEmpty();

    // Select first file
    const store = Git.load();
    const files = Object.keys(store.workingTree).sort();
    if (files.length) currentFile = files[0];

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    renderAll();

    // ── Editor: auto-save on input ──
    const editor = document.getElementById('fileEditor');
    editor.addEventListener('input', () => {
      if (!currentFile) return;
      Git.saveWorkingTreeFile(currentFile, editor.value);
      // Update file list status immediately
      const s = Git.load();
      renderFileList(s);
    });

    // ── New file button ──
    document.getElementById('newFileBtn').addEventListener('click', () => {
      const name = prompt('New filename:');
      if (!name || !name.trim()) return;
      const filename = name.trim().replace(/[\\/:*?"<>|]/g,'_');
      try {
        Git.createWorkingTreeFile(filename, '');
        currentFile = filename;
        renderAll();
      } catch(e) { toast(e.message, true); }
    });

    // ── Stage current file ──
    document.getElementById('stageFileBtn').addEventListener('click', () => {
      if (!currentFile) { toast('No file selected', true); return; }
      // Flush editor value to store first
      Git.saveWorkingTreeFile(currentFile, editor.value);
      try {
        Git.stageFile(currentFile);
        renderAll();
        toast(`Staged: ${currentFile}`);
      } catch(e) { toast(e.message, true); }
    });

    // ── Stage all ──
    document.getElementById('stageAllBtn').addEventListener('click', () => {
      if (currentFile) Git.saveWorkingTreeFile(currentFile, editor.value);
      Git.stageAll();
      renderAll();
      toast('Staged all files');
    });

    // ── Commit ──
    document.getElementById('commitBtn').addEventListener('click', () => {
      const msg = document.getElementById('commitMessage').value.trim();
      if (!msg) { toast('Enter a commit message', true); return; }
      if (currentFile) Git.saveWorkingTreeFile(currentFile, editor.value);
      try {
        const sha = Git.doCommit(msg);
        document.getElementById('commitMessage').value = '';
        selectedSha = sha;
        history.pushState(null, '', `#/c/${sha}`);
        renderAll();
        // Show the new commit in cat-file
        document.getElementById('catfileHash').value = sha;
        showCatfile(sha);
        setTab('catfile');
        toast(`Committed ${sha.slice(0,7)}`);
      } catch(e) { toast(e.message, true); }
    });

    // ── Branch select (checkout by dropdown) ──
    document.getElementById('branchSelect').addEventListener('change', (e) => {
      const branch = e.target.value;
      const s = Git.load();
      if (Git.headBranch(s) === branch) return;
      try {
        Git.doCheckout(branch);
        const s2    = Git.load();
        const files = Object.keys(s2.workingTree).sort();
        currentFile = files.includes(currentFile) ? currentFile : (files[0] || null);
        renderAll();
        toast(`Checked out: ${branch}`);
      } catch(e) { toast(e.message, true); }
    });

    // ── New branch ──
    document.getElementById('newBranchBtn').addEventListener('click', () => {
      document.getElementById('newBranchName').value = '';
      showModal('newBranchModal');
    });
    document.getElementById('newBranchConfirm').addEventListener('click', () => {
      const name = document.getElementById('newBranchName').value.trim();
      if (!name) { toast('Branch name required', true); return; }
      try {
        Git.createBranch(name);
        closeModal('newBranchModal');
        renderAll();
        toast(`Created branch: ${name}`);
      } catch(e) { toast(e.message, true); }
    });
    document.getElementById('newBranchName').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('newBranchConfirm').click();
    });

    // ── Merge ──
    document.getElementById('mergeBtn').addEventListener('click', () => {
      populateBranchSelect('mergeBranchSelect');
      showModal('mergeModal');
    });
    document.getElementById('mergeConfirm').addEventListener('click', () => {
      const branch = document.getElementById('mergeBranchSelect').value;
      if (!branch) { toast('Select a branch to merge', true); return; }
      try {
        const result = Git.doMerge(branch);
        closeModal('mergeModal');
        if (result.type === 'up-to-date') {
          toast('Already up to date');
        } else if (result.type === 'fast-forward') {
          selectedSha = result.sha;
          history.pushState(null, '', `#/c/${result.sha}`);
          toast(`Fast-forwarded → ${result.sha.slice(0,7)}`);
        } else if (result.type === 'merge') {
          selectedSha = result.sha;
          history.pushState(null, '', `#/c/${result.sha}`);
          toast(`Merged → ${result.sha.slice(0,7)}`);
        } else if (result.type === 'conflict') {
          currentFile = result.conflicts[0];
          toast(`⚠ Conflicts in: ${result.conflicts.join(', ')}`, true);
        }
        renderAll();
        if (result.sha) { showCatfile(result.sha); setTab('catfile'); }
      } catch(e) { toast(e.message, true); }
    });

    // ── Rebase ──
    document.getElementById('rebaseBtn').addEventListener('click', () => {
      populateBranchSelect('rebaseBranchSelect');
      showModal('rebaseModal');
    });
    document.getElementById('rebaseConfirm').addEventListener('click', () => {
      const branch = document.getElementById('rebaseBranchSelect').value;
      if (!branch) { toast('Select a target branch', true); return; }
      if (currentFile) Git.saveWorkingTreeFile(currentFile, editor.value);
      try {
        const result = Git.doRebase(branch);
        closeModal('rebaseModal');
        const n = Object.keys(result.oldToNew).length;
        selectedSha = result.newHead;
        history.pushState(null, '', `#/c/${result.newHead}`);
        renderAll();
        document.getElementById('catfileHash').value = result.newHead;
        showCatfile(result.newHead);
        setTab('catfile');
        toast(`Rebased ${n} commit(s) onto ${branch} → new tip ${result.newHead.slice(0,7)}`);
      } catch(e) { toast(e.message, true); }
    });

    // ── Cherry-pick ──
    document.getElementById('cherryPickBtn').addEventListener('click', () => {
      populateCherryPickModal();
      showModal('cherryPickModal');
    });
    document.getElementById('cherryPickSelect').addEventListener('change', (e) => {
      if (e.target.value) document.getElementById('cherryPickSha').value = e.target.value;
    });
    document.getElementById('cherryPickConfirm').addEventListener('click', () => {
      const sha = document.getElementById('cherryPickSha').value.trim()
               || document.getElementById('cherryPickSelect').value;
      if (!sha) { toast('Select or paste a commit SHA', true); return; }
      if (currentFile) Git.saveWorkingTreeFile(currentFile, editor.value);
      try {
        const result = Git.doCherryPick(sha);
        closeModal('cherryPickModal');
        if (result.type === 'conflict') {
          currentFile = result.conflicts[0];
          const s2 = Git.load();
          if (s2.cherryPickState && s2.cherryPickState.message) {
            document.getElementById('commitMessage').value = s2.cherryPickState.message;
          }
          renderAll();
          toast(`⚠ Conflicts in: ${result.conflicts.join(', ')}`, true);
          return;
        }
        selectedSha = result.sha;
        history.pushState(null, '', `#/c/${result.sha}`);
        renderAll();
        document.getElementById('catfileHash').value = result.sha;
        showCatfile(result.sha);
        setTab('catfile');
        toast(`Cherry-picked ${result.originalSha.slice(0,7)} → ${result.sha.slice(0,7)}`);
      } catch(e) { toast(e.message, true); }
    });
    document.getElementById('cherryPickSha').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('cherryPickConfirm').click();
    });

    // ── Reset seed ──
    document.getElementById('resetSeedBtn').addEventListener('click', () => {
      if (!confirm('Reset to seed? All changes will be lost.')) return;
      Git.resetToSeed();
      selectedSha = null;
      currentFile = null;
      history.pushState(null, '', window.location.pathname);
      const s2    = Git.load();
      const files = Object.keys(s2.workingTree).sort();
      currentFile = files[0] || null;
      setTab('dag');
      renderAll();
      toast('Reset to seed');
    });

    // ── Tabs ──
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });

    // ── Cat-file ──
    document.getElementById('catfileBtn').addEventListener('click', () => {
      const sha = document.getElementById('catfileHash').value.trim();
      if (!sha) return;
      showCatfile(sha);
      // If valid commit sha, also select it in DAG
      const store = Git.load();
      const obj   = Git.readObject(store, sha);
      if (obj && obj.type === 'commit') {
        selectedSha = sha;
        history.pushState(null, '', `#/c/${sha}`);
      }
    });
    document.getElementById('catfileHash').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('catfileBtn').click();
    });

    // ── Modal backdrop click-to-close ──
    document.querySelectorAll('.modal-backdrop').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target === el) el.classList.remove('visible');
      });
    });
  }

  // ── Expose to HTML inline handlers & hash routing ──────────────────────────
  root.App = { selectCommit, openFile, init };
  document.addEventListener('DOMContentLoaded', init);

})(window);
