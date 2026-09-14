/**
 * packet-forge/js/codec.js
 * Pure packet codec — no DOM, no side-effects.
 *
 * Builds and parses Ethernet II / IPv4 / TCP / UDP / ICMP frames.
 * Bytes are big-endian throughout.
 */
'use strict';

// ── Parsers ──────────────────────────────────────────────────────────────────

/** "AA:BB:CC:DD:EE:FF" (or no-colon) → Uint8Array(6) */
function parseMac(str) {
  const hex = (str || '').replace(/[:\s\-]/g, '').padEnd(12, '0');
  const out = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

/** "192.168.1.1" → Uint8Array(4) */
function parseIp(str) {
  const parts = (str || '0.0.0.0').split('.');
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    out[i] = (parseInt(parts[i], 10) || 0) & 0xff;
  }
  return out;
}

/** Hex string (with or without spaces) → Uint8Array */
function parseHex(str) {
  const clean = (str || '').replace(/\s/g, '');
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

/** Hex string → Uint8Array of exactly n bytes (zero-padded / truncated). */
function parseFixedHex(str, n) {
  const hex = (str || '').replace(/[^0-9a-fA-F]/g, '').padEnd(n * 2, '0');
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

// ── Formatters ────────────────────────────────────────────────────────────────

/** Uint8Array → lowercase hex string (no separators) */
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Checksums ─────────────────────────────────────────────────────────────────

/** One's-complement sum of 16-bit words in buf (Uint8Array). */
function ones16sum(buf) {
  let sum = 0;
  const len = buf.length;
  for (let i = 0; i + 1 < len; i += 2) {
    sum += (buf[i] << 8) | buf[i + 1];
  }
  // Pad odd byte
  if (len & 1) sum += buf[len - 1] << 8;
  // Fold carry
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return (~sum) & 0xffff;
}

/**
 * IPv4 header checksum.
 * hdr must be Uint8Array(20) with checksum field already zeroed.
 */
function ipv4Checksum(hdr) {
  return ones16sum(hdr);
}

/**
 * TCP/UDP checksum via IPv4 pseudo-header.
 * @param {Uint8Array} srcIp  4-byte source IP
 * @param {Uint8Array} dstIp  4-byte dest IP
 * @param {number}     proto  6 or 17
 * @param {Uint8Array} seg    full transport segment (header + payload, checksum zeroed)
 */
function transportChecksum(srcIp, dstIp, proto, seg) {
  const segLen = seg.length;
  // pseudo-header = srcIp(4) + dstIp(4) + zero(1) + proto(1) + length(2) = 12 bytes
  const buf = new Uint8Array(12 + segLen + (segLen & 1)); // pad to even
  buf.set(srcIp, 0);
  buf.set(dstIp, 4);
  buf[8] = 0;
  buf[9] = proto & 0xff;
  buf[10] = (segLen >> 8) & 0xff;
  buf[11] = segLen & 0xff;
  buf.set(seg, 12);
  return ones16sum(buf);
}

/**
 * ICMP checksum: ones' complement of the ICMP message (header + payload).
 * No TCP-style IPv4 pseudo-header. msg must have checksum field already zeroed.
 */
function icmpChecksum(msg) {
  return ones16sum(msg);
}

// ── Build packet ──────────────────────────────────────────────────────────────

/**
 * Build a complete Ethernet frame from state.
 *
 * @param  {object}  state       Application state object (see DEFAULT_STATE in app.js)
 * @returns {{ bytes: Uint8Array, fieldMap: Array<{field:string, start:number, end:number}> }}
 *
 * fieldMap entries list the [start, end) byte range of every named field in the
 * assembled packet.  The field names mirror the form row IDs (without "row-" prefix).
 */
function buildPacket(state) {
  const fieldMap = [];
  const mark = (field, start, end) => fieldMap.push({ field, start, end });

  // Parse addresses
  const ethDst  = parseMac(state.ethDst);
  const ethSrc  = parseMac(state.ethSrc);
  const ipSrc   = parseIp(state.ipSrc);
  const ipDst   = parseIp(state.ipDst);
  const payload = parseHex(state.payload);
  const proto   = Number(state.ipProto);

  // ── Transport layer ────────────────────────────────────────────────────────
  let transport;

  if (proto === 6) {
    // TCP  (20-byte header + payload)
    const tcpFlags =
      ((state.tcpFlagUrg ? 1 : 0) << 5) |
      ((state.tcpFlagAck ? 1 : 0) << 4) |
      ((state.tcpFlagPsh ? 1 : 0) << 3) |
      ((state.tcpFlagRst ? 1 : 0) << 2) |
      ((state.tcpFlagSyn ? 1 : 0) << 1) |
       (state.tcpFlagFin ? 1 : 0);

    transport = new Uint8Array(20 + payload.length);
    const dv = new DataView(transport.buffer);
    dv.setUint16(0,  Number(state.tcpSport) & 0xffff);
    dv.setUint16(2,  Number(state.tcpDport) & 0xffff);
    dv.setUint32(4,  Number(state.tcpSeq) >>> 0);
    dv.setUint32(8,  Number(state.tcpAck) >>> 0);
    transport[12] = 0x50;             // data offset = 5 (20 bytes), reserved = 0
    transport[13] = tcpFlags & 0x3f;
    dv.setUint16(14, Number(state.tcpWindow) & 0xffff);
    dv.setUint16(16, 0);              // checksum placeholder (must be 0 for computation)
    dv.setUint16(18, Number(state.tcpUrgent) & 0xffff);
    transport.set(payload, 20);

    const cksum = state.lockChecksum
      ? (Number(state.tcpManualCksum || 0) & 0xffff)
      : transportChecksum(ipSrc, ipDst, 6, transport);
    dv.setUint16(16, cksum);

  } else if (proto === 1) {
    // ICMP  (8-byte header + payload; checksum covers ICMP only — no pseudo-header)
    const rest = parseFixedHex(state.icmpRest, 4);
    transport = new Uint8Array(8 + payload.length);
    const dv = new DataView(transport.buffer);
    transport[0] = Number(state.icmpType) & 0xff;
    transport[1] = Number(state.icmpCode) & 0xff;
    dv.setUint16(2, 0);              // checksum placeholder (must be 0 for computation)
    transport.set(rest, 4);
    transport.set(payload, 8);

    const cksum = state.lockChecksum
      ? (Number(state.icmpManualCksum || 0) & 0xffff)
      : icmpChecksum(transport);
    dv.setUint16(2, cksum);

  } else {
    // UDP  (8-byte header + payload)
    const udpLen = 8 + payload.length;
    transport = new Uint8Array(udpLen);
    const dv = new DataView(transport.buffer);
    dv.setUint16(0, Number(state.udpSport) & 0xffff);
    dv.setUint16(2, Number(state.udpDport) & 0xffff);
    dv.setUint16(4, udpLen);          // length auto-computed
    dv.setUint16(6, 0);              // checksum placeholder
    transport.set(payload, 8);

    const cksum = state.lockChecksum
      ? (Number(state.udpManualCksum || 0) & 0xffff)
      : transportChecksum(ipSrc, ipDst, 17, transport);
    dv.setUint16(6, cksum);
  }

  // ── IPv4 header (20 bytes, IHL = 5) ───────────────────────────────────────
  const ipTotalLen = 20 + transport.length;
  const ipHdr = new Uint8Array(20);
  const ipDv  = new DataView(ipHdr.buffer);

  ipHdr[0] = 0x45;                   // version=4, IHL=5
  ipHdr[1] = Number(state.ipTos) & 0xff;
  ipDv.setUint16(2, ipTotalLen);
  ipDv.setUint16(4, Number(state.ipId) & 0xffff);

  // Flags: bit15=reserved(0), bit14=DF, bit13=MF; bits12-0=fragment offset
  const flagFrag =
    ((state.ipDf ? 1 : 0) << 14) |
    ((state.ipMf ? 1 : 0) << 13) |
    (Number(state.ipFragOffset) & 0x1fff);
  ipDv.setUint16(6, flagFrag);

  ipHdr[8]  = Number(state.ipTtl) & 0xff;
  ipHdr[9]  = proto & 0xff;
  ipHdr[10] = 0; ipHdr[11] = 0;     // checksum zeroed for computation
  ipHdr.set(ipSrc, 12);
  ipHdr.set(ipDst, 16);

  const ipCksum = state.lockChecksum
    ? (Number(state.ipManualCksum || 0) & 0xffff)
    : ipv4Checksum(ipHdr);
  ipDv.setUint16(10, ipCksum);

  // ── Assemble frame ─────────────────────────────────────────────────────────
  const totalLen = 14 + 20 + transport.length;
  const pkt = new Uint8Array(totalLen);
  let o = 0;

  // Ethernet header
  mark('eth-dst',  o, o + 6);  pkt.set(ethDst, o); o += 6;
  mark('eth-src',  o, o + 6);  pkt.set(ethSrc, o); o += 6;
  mark('eth-type', o, o + 2);  pkt[o++] = 0x08; pkt[o++] = 0x00;

  // IPv4 header — field by field so marks align exactly
  mark('ip-ver-ihl', o, o + 1); pkt[o++] = ipHdr[0];
  mark('ip-tos',     o, o + 1); pkt[o++] = ipHdr[1];
  mark('ip-totlen',  o, o + 2); pkt[o++] = ipHdr[2]; pkt[o++] = ipHdr[3];
  mark('ip-id',      o, o + 2); pkt[o++] = ipHdr[4]; pkt[o++] = ipHdr[5];
  mark('ip-flags',   o, o + 2); pkt[o++] = ipHdr[6]; pkt[o++] = ipHdr[7];
  mark('ip-ttl',     o, o + 1); pkt[o++] = ipHdr[8];
  mark('ip-proto',   o, o + 1); pkt[o++] = ipHdr[9];
  mark('ip-cksum',   o, o + 2); pkt[o++] = ipHdr[10]; pkt[o++] = ipHdr[11];
  mark('ip-src',     o, o + 4); pkt.set(ipSrc, o); o += 4;
  mark('ip-dst',     o, o + 4); pkt.set(ipDst, o); o += 4;

  // Transport header
  const tp = o;
  if (proto === 6) {
    mark('tcp-sport',  tp +  0, tp +  2);
    mark('tcp-dport',  tp +  2, tp +  4);
    mark('tcp-seq',    tp +  4, tp +  8);
    mark('tcp-ack',    tp +  8, tp + 12);
    mark('tcp-flags',  tp + 12, tp + 14);
    mark('tcp-window', tp + 14, tp + 16);
    mark('tcp-cksum',  tp + 16, tp + 18);
    mark('tcp-urgent', tp + 18, tp + 20);
    if (payload.length) mark('payload', tp + 20, tp + 20 + payload.length);
  } else if (proto === 1) {
    mark('icmp-type',  tp + 0, tp + 1);
    mark('icmp-code',  tp + 1, tp + 2);
    mark('icmp-cksum', tp + 2, tp + 4);
    mark('icmp-rest',  tp + 4, tp + 8);
    if (payload.length) mark('payload', tp + 8, tp + 8 + payload.length);
  } else {
    mark('udp-sport',  tp + 0, tp + 2);
    mark('udp-dport',  tp + 2, tp + 4);
    mark('udp-length', tp + 4, tp + 6);
    mark('udp-cksum',  tp + 6, tp + 8);
    if (payload.length) mark('payload', tp + 8, tp + 8 + payload.length);
  }
  pkt.set(transport, o);

  return { bytes: pkt, fieldMap };
}

// ── Parse packet ──────────────────────────────────────────────────────────────

/**
 * Attempt to parse raw bytes back into partial state.
 * Returns an object suitable for merging with DEFAULT_STATE, or null on failure.
 */
function parsePacket(bytes) {
  if (bytes.length < 14) return null;

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Ethernet
  const ethertype = dv.getUint16(12);
  if (ethertype !== 0x0800) return null;   // only IPv4

  const s = {};
  s.ethDst = Array.from(bytes.slice(0, 6)).map(b => b.toString(16).padStart(2, '0')).join(':');
  s.ethSrc = Array.from(bytes.slice(6, 12)).map(b => b.toString(16).padStart(2, '0')).join(':');

  if (bytes.length < 34) return s;

  // IPv4
  const ihl  = (bytes[14] & 0x0f) * 4;
  s.ipTos         = bytes[15];
  s.ipId          = dv.getUint16(18);
  const ff        = dv.getUint16(20);
  s.ipDf          = !!(ff & 0x4000);
  s.ipMf          = !!(ff & 0x2000);
  s.ipFragOffset  = ff & 0x1fff;
  s.ipTtl         = bytes[22];
  s.ipProto       = bytes[23];
  s.ipManualCksum = dv.getUint16(24);
  s.ipSrc         = Array.from(bytes.slice(26, 30)).join('.');
  s.ipDst         = Array.from(bytes.slice(30, 34)).join('.');

  const tpStart = 14 + ihl;

  if (s.ipProto === 6 && bytes.length >= tpStart + 20) {
    // TCP
    s.tcpSport   = dv.getUint16(tpStart + 0);
    s.tcpDport   = dv.getUint16(tpStart + 2);
    s.tcpSeq     = dv.getUint32(tpStart + 4) >>> 0;
    s.tcpAck     = dv.getUint32(tpStart + 8) >>> 0;
    const dataOff = (bytes[tpStart + 12] >> 4) * 4;
    const flags   = bytes[tpStart + 13];
    s.tcpFlagUrg = !!(flags & 0x20);
    s.tcpFlagAck = !!(flags & 0x10);
    s.tcpFlagPsh = !!(flags & 0x08);
    s.tcpFlagRst = !!(flags & 0x04);
    s.tcpFlagSyn = !!(flags & 0x02);
    s.tcpFlagFin = !!(flags & 0x01);
    s.tcpWindow  = dv.getUint16(tpStart + 14);
    s.tcpManualCksum = dv.getUint16(tpStart + 16);
    s.tcpUrgent  = dv.getUint16(tpStart + 18);
    s.payload    = bytesToHex(bytes.slice(tpStart + dataOff));

  } else if (s.ipProto === 17 && bytes.length >= tpStart + 8) {
    // UDP
    s.udpSport   = dv.getUint16(tpStart + 0);
    s.udpDport   = dv.getUint16(tpStart + 2);
    s.udpManualCksum = dv.getUint16(tpStart + 6);
    s.payload    = bytesToHex(bytes.slice(tpStart + 8));

  } else if (s.ipProto === 1 && bytes.length >= tpStart + 8) {
    // ICMP
    s.icmpType         = bytes[tpStart];
    s.icmpCode         = bytes[tpStart + 1];
    s.icmpManualCksum  = dv.getUint16(tpStart + 2);
    s.icmpRest         = bytesToHex(bytes.slice(tpStart + 4, tpStart + 8));
    s.payload          = bytesToHex(bytes.slice(tpStart + 8));
  }

  return s;
}
