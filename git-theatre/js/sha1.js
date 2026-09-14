'use strict';
/**
 * Pure-JS SHA-1 (RFC 3174). No npm, no SubtleCrypto.
 * Exposed as window.SHA1 = { sha1Bytes, sha1Str }.
 */
(function (root) {

  function rotl32(x, n) {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  /**
   * sha1Bytes – compute SHA-1 of a Uint8Array; return 40-char lowercase hex.
   */
  function sha1Bytes(data) {
    const msgLen = data.length;
    // Pad to 512-bit (64-byte) boundary: append 0x80, then zeros, then 64-bit bit-length BE
    const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
    const msg = new Uint8Array(paddedLen);
    msg.set(data);
    msg[msgLen] = 0x80;

    const bitLen = msgLen * 8;          // may exceed 32-bit for large inputs
    const dv = new DataView(msg.buffer);
    dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
    dv.setUint32(paddedLen - 4, bitLen >>> 0,                           false);

    // Initial hash values (SHA-1 magic constants)
    let H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE,
        H3 = 0x10325476, H4 = 0xC3D2E1F0;

    const W = new Uint32Array(80);

    for (let off = 0; off < paddedLen; off += 64) {
      const bv = new DataView(msg.buffer, off, 64);

      // Prepare message schedule
      for (let i = 0; i < 16; i++) W[i] = bv.getUint32(i * 4, false);
      for (let i = 16; i < 80; i++) {
        W[i] = rotl32(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
      }

      let a = H0, b = H1, c = H2, d = H3, e = H4;

      for (let t = 0; t < 80; t++) {
        let f, k;
        if      (t < 20) { f = (b & c) | (~b & d);          k = 0x5A827999; }
        else if (t < 40) { f = b ^ c ^ d;                    k = 0x6ED9EBA1; }
        else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else             { f = b ^ c ^ d;                    k = 0xCA62C1D6; }

        const tmp = (rotl32(a, 5) + f + e + k + W[t]) >>> 0;
        e = d; d = c; c = rotl32(b, 30); b = a; a = tmp;
      }

      H0 = (H0 + a) >>> 0;
      H1 = (H1 + b) >>> 0;
      H2 = (H2 + c) >>> 0;
      H3 = (H3 + d) >>> 0;
      H4 = (H4 + e) >>> 0;
    }

    return [H0, H1, H2, H3, H4]
      .map(h => h.toString(16).padStart(8, '0'))
      .join('');
  }

  /**
   * sha1Str – compute SHA-1 of a UTF-8 string; return 40-char lowercase hex.
   */
  function sha1Str(str) {
    return sha1Bytes(new TextEncoder().encode(str));
  }

  root.SHA1 = { sha1Bytes, sha1Str };
})(window);
