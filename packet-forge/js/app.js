/**
 * packet-forge/js/app.js
 * Application logic — state, form binding, hex rendering, routing.
 * Depends on codec.js (buildPacket, parsePacket, parseHex, bytesToHex).
 */
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'packet-forge-v1';

const DEFAULT_STATE = {
  ethDst: 'ff:ff:ff:ff:ff:ff',
  ethSrc: '00:11:22:33:44:55',

  ipTos:        0,
  ipId:         0x0001,
  ipDf:         true,
  ipMf:         false,
  ipFragOffset: 0,
  ipTtl:        64,
  ipProto:      6,          // 6 = TCP, 17 = UDP, 1 = ICMP
  ipSrc:        '192.168.1.1',
  ipDst:        '192.168.1.2',

  tcpSport:    54321,
  tcpDport:    80,
  tcpSeq:      0x00000000,
  tcpAck:      0x00000000,
  tcpFlagUrg:  false,
  tcpFlagAck:  false,
  tcpFlagPsh:  false,
  tcpFlagRst:  false,
  tcpFlagSyn:  true,
  tcpFlagFin:  false,
  tcpWindow:   65535,
  tcpUrgent:   0,

  udpSport:    1234,
  udpDport:    53,

  icmpType:    8,            // Echo Request
  icmpCode:    0,
  icmpRest:    '00000000',   // 4-byte rest-of-header

  payload:       '',
  lockChecksum:  false,
  tcpManualCksum: 0,
  udpManualCksum: 0,
  icmpManualCksum: 0,
  ipManualCksum:  0,
};

const PRESETS = {
  'tcp-syn': {
    ethDst: 'ff:ff:ff:ff:ff:ff',
    ethSrc: '00:11:22:33:44:55',
    ipTos:        0,
    ipId:         0x1234,
    ipDf:         true,
    ipMf:         false,
    ipFragOffset: 0,
    ipTtl:        64,
    ipProto:      6,
    ipSrc:        '192.168.1.10',
    ipDst:        '93.184.216.34',   // example.com
    tcpSport:     54321,
    tcpDport:     80,
    tcpSeq:       0xdeadbeef,
    tcpAck:       0x00000000,
    tcpFlagUrg:   false,
    tcpFlagAck:   false,
    tcpFlagPsh:   false,
    tcpFlagRst:   false,
    tcpFlagSyn:   true,
    tcpFlagFin:   false,
    tcpWindow:    65535,
    tcpUrgent:    0,
    udpSport:     1234,
    udpDport:     53,
    payload:      '',
    lockChecksum: false,
  },
  'udp-dns': {
    ethDst: 'ff:ff:ff:ff:ff:ff',
    ethSrc: '00:11:22:33:44:55',
    ipTos:        0,
    ipId:         0xabcd,
    ipDf:         false,
    ipMf:         false,
    ipFragOffset: 0,
    ipTtl:        64,
    ipProto:      17,
    ipSrc:        '192.168.1.10',
    ipDst:        '8.8.8.8',
    tcpSport:     54321,
    tcpDport:     80,
    tcpSeq:       0,
    tcpAck:       0,
    tcpFlagUrg:   false,
    tcpFlagAck:   false,
    tcpFlagPsh:   false,
    tcpFlagRst:   false,
    tcpFlagSyn:   false,
    tcpFlagFin:   false,
    tcpWindow:    65535,
    tcpUrgent:    0,
    udpSport:     1234,
    udpDport:     53,
    // Minimal DNS query for "example.com" type A
    payload:
      'aabb' +          // transaction ID
      '0100' +          // flags: standard query
      '0001' +          // QDCOUNT = 1
      '000000000000' +  // ANCOUNT NSCOUNT ARCOUNT = 0
      '07' + '6578616d706c65' + // label "example" (7 bytes)
      '03' + '636f6d' +          // label "com" (3 bytes)
      '00' +                     // root label
      '0001' +                   // QTYPE  = A
      '0001',                    // QCLASS = IN
    lockChecksum: false,
  },
  'icmp-echo': {
    ethDst: 'ff:ff:ff:ff:ff:ff',
    ethSrc: '00:11:22:33:44:55',
    ipTos:        0,
    ipId:         0x0042,
    ipDf:         true,
    ipMf:         false,
    ipFragOffset: 0,
    ipTtl:        64,
    ipProto:      1,
    ipSrc:        '192.168.1.10',
    ipDst:        '8.8.8.8',
    tcpSport:     54321,
    tcpDport:     80,
    tcpSeq:       0,
    tcpAck:       0,
    tcpFlagUrg:   false,
    tcpFlagAck:   false,
    tcpFlagPsh:   false,
    tcpFlagRst:   false,
    tcpFlagSyn:   false,
    tcpFlagFin:   false,
    tcpWindow:    65535,
    tcpUrgent:    0,
    udpSport:     1234,
    udpDport:     53,
    icmpType:     8,             // Echo Request
    icmpCode:     0,
    icmpRest:     '00010001',    // identifier=1, sequence=1
    // Windows-style 32-byte ping data: "abcdefghijklmnopqrstuvwabcdefghi"
    payload:
      '6162636465666768696a6b6c6d6e6f70' +
      '71727374757677616263646566676869',
    lockChecksum: false,
  },
};

// ── App state ─────────────────────────────────────────────────────────────────

let state = Object.assign({}, DEFAULT_STATE);
let currentFieldMap = [];
let currentBytes   = new Uint8Array(0);
let activeField    = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

const G  = id => document.getElementById(id);
const hx2 = n => '0x' + (n & 0xff).toString(16).padStart(2, '0');
const hx4 = n => '0x' + (n & 0xffff).toString(16).padStart(4, '0');
const hx8 = n => '0x' + ((n >>> 0).toString(16).padStart(8, '0'));

/** Parse a decimal or 0x-prefixed hex field value. */
function parseNum(v, base) {
  v = (v || '').toString().trim();
  if (v.startsWith('0x') || v.startsWith('0X')) return parseInt(v, 16) || 0;
  return parseInt(v, base || 10) || 0;
}

function parse32(v) { return parseNum(v) >>> 0; }

// ── Storage ───────────────────────────────────────────────────────────────────

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      state = Object.assign({}, DEFAULT_STATE, raw);
    }
  } catch (_) {}
}

// ── Form ↔ State ──────────────────────────────────────────────────────────────

function writeForm() {
  G('fld-eth-dst').value      = state.ethDst;
  G('fld-eth-src').value      = state.ethSrc;

  G('fld-ip-tos').value       = hx2(state.ipTos);
  G('fld-ip-id').value        = hx4(state.ipId);
  G('fld-ip-df').checked      = !!state.ipDf;
  G('fld-ip-mf').checked      = !!state.ipMf;
  G('fld-ip-frag').value      = state.ipFragOffset || 0;
  G('fld-ip-ttl').value       = state.ipTtl;
  G('fld-ip-proto').value     = state.ipProto;
  G('fld-ip-src').value       = state.ipSrc;
  G('fld-ip-dst').value       = state.ipDst;

  G('fld-tcp-sport').value    = state.tcpSport;
  G('fld-tcp-dport').value    = state.tcpDport;
  G('fld-tcp-seq').value      = hx8(state.tcpSeq);
  G('fld-tcp-ack-num').value  = hx8(state.tcpAck);
  G('fld-tcp-flag-urg').checked = !!state.tcpFlagUrg;
  G('fld-tcp-flag-ack').checked = !!state.tcpFlagAck;
  G('fld-tcp-flag-psh').checked = !!state.tcpFlagPsh;
  G('fld-tcp-flag-rst').checked = !!state.tcpFlagRst;
  G('fld-tcp-flag-syn').checked = !!state.tcpFlagSyn;
  G('fld-tcp-flag-fin').checked = !!state.tcpFlagFin;
  G('fld-tcp-window').value   = state.tcpWindow;
  G('fld-tcp-urgent').value   = state.tcpUrgent;

  G('fld-udp-sport').value    = state.udpSport;
  G('fld-udp-dport').value    = state.udpDport;

  G('fld-icmp-type').value    = state.icmpType;
  G('fld-icmp-code').value    = state.icmpCode;
  G('fld-icmp-rest').value    = state.icmpRest || '00000000';

  G('fld-payload').value      = state.payload;
  G('fld-lock-cksum').checked = !!state.lockChecksum;
}

function readForm() {
  state.ethDst = G('fld-eth-dst').value.trim();
  state.ethSrc = G('fld-eth-src').value.trim();

  state.ipTos        = parseNum(G('fld-ip-tos').value, 16);
  state.ipId         = parseNum(G('fld-ip-id').value, 16);
  state.ipDf         = G('fld-ip-df').checked;
  state.ipMf         = G('fld-ip-mf').checked;
  state.ipFragOffset = parseNum(G('fld-ip-frag').value);
  state.ipTtl        = parseNum(G('fld-ip-ttl').value);
  state.ipProto      = parseNum(G('fld-ip-proto').value);
  state.ipSrc        = G('fld-ip-src').value.trim();
  state.ipDst        = G('fld-ip-dst').value.trim();

  state.tcpSport   = parseNum(G('fld-tcp-sport').value);
  state.tcpDport   = parseNum(G('fld-tcp-dport').value);
  state.tcpSeq     = parse32(G('fld-tcp-seq').value);
  state.tcpAck     = parse32(G('fld-tcp-ack-num').value);
  state.tcpFlagUrg = G('fld-tcp-flag-urg').checked;
  state.tcpFlagAck = G('fld-tcp-flag-ack').checked;
  state.tcpFlagPsh = G('fld-tcp-flag-psh').checked;
  state.tcpFlagRst = G('fld-tcp-flag-rst').checked;
  state.tcpFlagSyn = G('fld-tcp-flag-syn').checked;
  state.tcpFlagFin = G('fld-tcp-flag-fin').checked;
  state.tcpWindow  = parseNum(G('fld-tcp-window').value);
  state.tcpUrgent  = parseNum(G('fld-tcp-urgent').value);

  state.udpSport = parseNum(G('fld-udp-sport').value);
  state.udpDport = parseNum(G('fld-udp-dport').value);

  state.icmpType = parseNum(G('fld-icmp-type').value) & 0xff;
  state.icmpCode = parseNum(G('fld-icmp-code').value) & 0xff;
  state.icmpRest = G('fld-icmp-rest').value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();

  state.payload      = G('fld-payload').value.replace(/\s/g, '');
  state.lockChecksum = G('fld-lock-cksum').checked;
}

// ── Protocol section visibility ───────────────────────────────────────────────

function updateSections() {
  const proto = Number(state.ipProto);
  G('section-tcp').style.display  = proto === 6  ? '' : 'none';
  G('section-udp').style.display  = proto === 17 ? '' : 'none';
  G('section-icmp').style.display = proto === 1  ? '' : 'none';
}

// ── Computed display labels ───────────────────────────────────────────────────

function u16(bytes, off) {
  return (bytes[off] << 8) | bytes[off + 1];
}

function fmtCksum(n) {
  return '0x' + (n & 0xffff).toString(16).padStart(4, '0');
}

function markMismatch(el, bad) {
  if (!el) return;
  el.classList.toggle('mismatch', !!bad);
}

function snapshotChecksums() {
  const { bytes } = buildPacket(Object.assign({}, state, { lockChecksum: false }));
  if (bytes.length < 26) return;
  state.ipManualCksum = u16(bytes, 24);
  if (Number(state.ipProto) === 6 && bytes.length >= 52) state.tcpManualCksum = u16(bytes, 50);
  if (Number(state.ipProto) === 17 && bytes.length >= 42) state.udpManualCksum = u16(bytes, 40);
  if (Number(state.ipProto) === 1 && bytes.length >= 38) state.icmpManualCksum = u16(bytes, 36);
}

function updateComputedDisplays(bytes) {
  if (bytes.length < 26) return;

  G('disp-ip-totlen').textContent = u16(bytes, 16) + ' B';
  G('disp-ip-cksum').textContent  = fmtCksum(u16(bytes, 24));

  const proto = Number(state.ipProto);
  if (proto === 6 && bytes.length >= 52) {
    G('disp-tcp-cksum').textContent = fmtCksum(u16(bytes, 50));
  }
  if (proto === 17 && bytes.length >= 42) {
    G('disp-udp-length').textContent = u16(bytes, 38) + ' B';
    G('disp-udp-cksum').textContent  = fmtCksum(u16(bytes, 40));
  }
  if (proto === 1 && bytes.length >= 38) {
    G('disp-icmp-cksum').textContent = fmtCksum(u16(bytes, 36));
  }

  let ipBad = false, l4Bad = false;
  if (state.lockChecksum) {
    const expected = buildPacket(Object.assign({}, state, { lockChecksum: false })).bytes;
    ipBad = expected.length >= 26 && u16(bytes, 24) !== u16(expected, 24);
    if (proto === 6 && bytes.length >= 52 && expected.length >= 52) {
      l4Bad = u16(bytes, 50) !== u16(expected, 50);
    }
    if (proto === 17 && bytes.length >= 42 && expected.length >= 42) {
      l4Bad = u16(bytes, 40) !== u16(expected, 40);
    }
    if (proto === 1 && bytes.length >= 38 && expected.length >= 38) {
      l4Bad = u16(bytes, 36) !== u16(expected, 36);
    }
  }
  markMismatch(G('disp-ip-cksum'), ipBad);
  markMismatch(G('disp-tcp-cksum'), proto === 6 && l4Bad);
  markMismatch(G('disp-udp-cksum'), proto === 17 && l4Bad);
  markMismatch(G('disp-icmp-cksum'), proto === 1 && l4Bad);
  const status = G('cksum-status');
  if (ipBad || l4Bad) {
    status.hidden = false;
    status.textContent = 'checksum mismatch';
  } else {
    status.hidden = true;
    status.textContent = '';
  }
}

// ── Hex dump renderer ─────────────────────────────────────────────────────────

/** Map each field name prefix → CSS class for coloring. */
function layerClass(field) {
  if (!field) return '';
  if (field.startsWith('eth'))     return 'hb-eth';
  if (field.startsWith('ip'))      return 'hb-ip';
  if (field.startsWith('tcp'))     return 'hb-tcp';
  if (field.startsWith('udp'))     return 'hb-udp';
  if (field.startsWith('icmp'))    return 'hb-icmp';
  return 'hb-payload';
}

function renderHex(bytes, fieldMap) {
  // Build byte→field lookup array
  const byteField = new Array(bytes.length).fill('');
  for (const { field, start, end } of fieldMap) {
    for (let i = start; i < end; i++) byteField[i] = field;
  }

  const COLS = 16;
  const rows = Math.ceil(bytes.length / COLS);
  let html = '';

  for (let r = 0; r < rows; r++) {
    const rowStart = r * COLS;

    // Offset
    html += `<span class="hx-off">${rowStart.toString(16).padStart(4, '0')}  </span>`;

    // Hex bytes
    for (let c = 0; c < COLS; c++) {
      const i = rowStart + c;
      if (i < bytes.length) {
        const f   = byteField[i];
        const cls = 'hb ' + layerClass(f) + (f === activeField ? ' active' : '');
        html += `<span class="${cls}" data-i="${i}" data-field="${f}">${
          bytes[i].toString(16).padStart(2, '0')
        }</span>`;
        html += (c === 7) ? '  ' : (c < COLS - 1 ? ' ' : '');
      } else {
        html += (c === 7) ? '    ' : '   ';
      }
    }

    html += '  ';

    // ASCII column
    for (let c = 0; c < COLS; c++) {
      const i = rowStart + c;
      if (i < bytes.length) {
        const f  = byteField[i];
        const b  = bytes[i];
        const ch = (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.';
        const cls = 'ha' + (f === activeField ? ' active' : '');
        html += `<span class="${cls}" data-i="${i}" data-field="${f}">${ch}</span>`;
      }
    }

    html += '\n';
  }

  G('hex-dump').innerHTML = html;

  // Attach click handlers (delegated via parent)
  // (handled once on pane-hex via event delegation — see setupEvents)
}

// ── Field activation (hex byte click → form highlight) ────────────────────────

function setActiveField(fieldName) {
  // Deactivate previous
  document.querySelectorAll('.field-row.active').forEach(el => el.classList.remove('active'));

  activeField = fieldName || null;

  if (fieldName) {
    const row = G('row-' + fieldName);
    if (row) {
      row.classList.add('active');
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Re-render hex to reflect new active field highlights
  // bytes haven't changed — use the cached copy
  if (currentBytes.length) {
    renderHex(currentBytes, currentFieldMap);
  }
}

// ── Main refresh cycle ────────────────────────────────────────────────────────

function refresh() {
  const { bytes, fieldMap } = buildPacket(state);
  currentBytes    = bytes;
  currentFieldMap = fieldMap;
  updateComputedDisplays(bytes);
  renderHex(bytes, fieldMap);
  save();
}

// ── Import / Export ───────────────────────────────────────────────────────────

function showModal(title, bodyHtml, onOk) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <h3 class="modal-title">${title}</h3>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-actions">
        ${onOk ? '<button class="btn btn-accent" id="modal-ok">Import</button>' : ''}
        <button class="btn" id="modal-close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  G('modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  if (onOk) {
    G('modal-ok').addEventListener('click', () => {
      onOk(overlay.querySelector('textarea').value);
      overlay.remove();
    });
    // Focus textarea
    const ta = overlay.querySelector('textarea');
    if (ta) setTimeout(() => ta.focus(), 50);
  }
}

function doImport(hexStr) {
  const bytes = parseHex(hexStr);
  const parsed = parsePacket(bytes);
  if (!parsed) {
    alert('Could not parse packet.\nMake sure it is an Ethernet II + IPv4 frame (hex bytes).');
    return;
  }
  state = Object.assign({}, DEFAULT_STATE, parsed, { lockChecksum: state.lockChecksum });
  if (state.lockChecksum) snapshotChecksums();
  writeForm();
  updateSections();
  refresh();
}

function doExport() {
  const { bytes } = buildPacket(state);
  // Format: 16 bytes per line, space-separated
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    lines.push(Array.from(bytes.slice(i, i + 16))
      .map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
  showModal('Export Hex',
    `<p>Copy the hex bytes below (${bytes.length} bytes total):</p>
     <textarea class="modal-textarea" readonly>${lines.join('\n')}</textarea>`);
  const ta = document.querySelector('.modal-textarea');
  if (ta) { ta.focus(); ta.select(); }
}

// ── Presets & Reset ───────────────────────────────────────────────────────────

function applyPreset(id) {
  const preset = PRESETS[id];
  if (!preset) return;
  state = Object.assign({}, DEFAULT_STATE, preset);
  writeForm();
  updateSections();
  activeField = null;
  refresh();
  history.replaceState(null, '', '#/p/' + id);
}

function doReset() {
  state = Object.assign({}, DEFAULT_STATE);
  writeForm();
  updateSections();
  activeField = null;
  refresh();
  history.replaceState(null, '', '#');
}

// ── Hash routing ──────────────────────────────────────────────────────────────

function handleHash() {
  const m = location.hash.match(/^#\/p\/([^/]+)$/);
  if (m && PRESETS[m[1]]) {
    state = Object.assign({}, DEFAULT_STATE, PRESETS[m[1]]);
    writeForm();
    updateSections();
    refresh();
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

function setupEvents() {
  // All form inputs → read + refresh
  const form = G('form-packet');
  form.addEventListener('input',  onFormChange);
  form.addEventListener('change', onFormChange);

  // Lock-checksum toggle (lives outside the form in the header)
  G('fld-lock-cksum').addEventListener('change', onFormChange);

  // Preset buttons
  G('btn-syn').addEventListener('click',       () => applyPreset('tcp-syn'));
  G('btn-udp-dns').addEventListener('click',   () => applyPreset('udp-dns'));
  G('btn-icmp-echo').addEventListener('click', () => applyPreset('icmp-echo'));

  // Reset
  G('btn-reset').addEventListener('click', doReset);

  // Import / Export
  G('btn-import').addEventListener('click', () => {
    showModal('Import Hex',
      '<p>Paste hex bytes (spaces optional). Must be Ethernet II + IPv4.</p>' +
      '<textarea class="modal-textarea" placeholder="ff ff ff ff ff ff 00 11 ..."></textarea>',
      doImport);
  });
  G('btn-export').addEventListener('click', doExport);

  // Hex dump — delegated click handler on the pane
  G('hex-dump-pane').addEventListener('click', e => {
    const el = e.target.closest('[data-field]');
    if (!el) return;
    const field = el.dataset.field;
    if (field) setActiveField(field);
  });

  // Hash changes
  window.addEventListener('hashchange', handleHash);
}

function onFormChange() {
  const wasLocked = state.lockChecksum;
  readForm();
  if (state.lockChecksum && !wasLocked) snapshotChecksums();
  updateSections();
  refresh();
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  load();
  writeForm();
  updateSections();
  handleHash();
  setupEvents();
  refresh();
}

document.addEventListener('DOMContentLoaded', init);
