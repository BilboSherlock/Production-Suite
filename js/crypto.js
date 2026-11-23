'use strict';
/* ===================================================================
   Small, dependency-free crypto for live collaboration on a local
   network (plain HTTP has no WebCrypto): SHA-256, HMAC, PBKDF2,
   AES-256-CTR and encrypt-then-MAC. Verified against Node's crypto.
   =================================================================== */
const SBC = (() => {
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  /* ---------- SHA-256 (streaming-free, for byte arrays) ---------- */
  function sha256(data) {
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), n = data.length, padded = new Uint8Array(((n + 9 + 63) >> 6) << 6), dv = new DataView(padded.buffer);
    padded.set(data); padded[n] = 0x80; dv.setUint32(padded.length - 8, Math.floor(n / 0x20000000)); dv.setUint32(padded.length - 4, (n << 3) >>> 0);
    const w = new Uint32Array(64);
    for (let o = 0; o < padded.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) | 0; }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer); for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]); return out;
  }
  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key); const k = new Uint8Array(64); k.set(key);
    const ip = new Uint8Array(64 + msg.length), op = new Uint8Array(96); for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
    ip.set(msg, 64); op.set(sha256(ip), 64); return sha256(op);
  }
  /* PBKDF2-HMAC-SHA256 with the two HMAC pads pre-hashed per block (fast enough in pure JS) */
  function pbkdf2(pw, salt, iters, dkLen) {
    const blocks = Math.ceil(dkLen / 32), out = new Uint8Array(blocks * 32);
    for (let b = 1; b <= blocks; b++) {
      const s = new Uint8Array(salt.length + 4); s.set(salt); new DataView(s.buffer).setUint32(salt.length, b);
      let u = hmac(pw, s); const t = Uint8Array.from(u);
      for (let i = 1; i < iters; i++) { u = hmac(pw, u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
      out.set(t, (b - 1) * 32);
    }
    return out.slice(0, dkLen);
  }
  /* ---------- AES-256 (encryption only; CTR mode needs nothing else) ---------- */
  const SB = new Uint8Array(256), T0 = new Uint32Array(256), T1 = new Uint32Array(256), T2 = new Uint32Array(256), T3 = new Uint32Array(256);
  (() => {
    let p = 1, q = 1; const mul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = (a << 1) ^ (a & 0x80 ? 0x11b : 0); b >>= 1; } return r; };
    do { p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0); q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09; const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4)); SB[p] = (x ^ 0x63) & 0xff; } while (p !== 1);
    SB[0] = 0x63;
    for (let i = 0; i < 256; i++) { const s = SB[i], s2 = mul(s, 2), s3 = mul(s, 3); const t = ((s2 << 24) | (s << 16) | (s << 8) | s3) >>> 0; T0[i] = t; T1[i] = ((t >>> 8) | (t << 24)) >>> 0; T2[i] = ((t >>> 16) | (t << 16)) >>> 0; T3[i] = ((t >>> 24) | (t << 8)) >>> 0; }
  })();
  function expandKey(key) {   // 32-byte key -> 60 words
    const w = new Uint32Array(60), dv = new DataView(key.buffer, key.byteOffset, 32); for (let i = 0; i < 8; i++) w[i] = dv.getUint32(i * 4);
    let rcon = 1; const sub = x => ((SB[x >>> 24] << 24) | (SB[(x >>> 16) & 255] << 16) | (SB[(x >>> 8) & 255] << 8) | SB[x & 255]) >>> 0;
    for (let i = 8; i < 60; i++) { let t = w[i - 1]; if (i % 8 === 0) { t = sub(((t << 8) | (t >>> 24)) >>> 0) ^ (rcon << 24); rcon = (rcon << 1) ^ (rcon & 0x80 ? 0x11b : 0); } else if (i % 8 === 4) t = sub(t); w[i] = (w[i - 8] ^ t) >>> 0; }
    return w;
  }
  function encBlock(w, s0, s1, s2, s3, out, o) {
    s0 ^= w[0]; s1 ^= w[1]; s2 ^= w[2]; s3 ^= w[3];
    let k = 4, t0, t1, t2, t3;
    for (let r = 1; r < 14; r++) {
      t0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 255] ^ T2[(s2 >>> 8) & 255] ^ T3[s3 & 255] ^ w[k++]; t1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 255] ^ T2[(s3 >>> 8) & 255] ^ T3[s0 & 255] ^ w[k++];
      t2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 255] ^ T2[(s0 >>> 8) & 255] ^ T3[s1 & 255] ^ w[k++]; t3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 255] ^ T2[(s1 >>> 8) & 255] ^ T3[s2 & 255] ^ w[k++];
      s0 = t0; s1 = t1; s2 = t2; s3 = t3;
    }
    const f = (a, b, c, d, kk) => (((SB[a >>> 24] << 24) | (SB[(b >>> 16) & 255] << 16) | (SB[(c >>> 8) & 255] << 8) | SB[d & 255]) ^ w[kk]) >>> 0;
    out[o] = f(s0, s1, s2, s3, 56); out[o + 1] = f(s1, s2, s3, s0, 57); out[o + 2] = f(s2, s3, s0, s1, 58); out[o + 3] = f(s3, s0, s1, s2, 59);
  }
  /* CTR: the 16-byte iv is the first counter block, incremented big-endian */
  function ctr(key, iv, data) {
    const w = expandKey(key), out = new Uint8Array(data.length), ks = new Uint32Array(4), dv = new DataView(iv.buffer.slice(iv.byteOffset, iv.byteOffset + 16)), c = [dv.getUint32(0), dv.getUint32(4), dv.getUint32(8), dv.getUint32(12)];
    for (let o = 0; o < data.length; o += 16) {
      encBlock(w, c[0], c[1], c[2], c[3], ks, 0);
      const n = Math.min(16, data.length - o); for (let i = 0; i < n; i++) out[o + i] = data[o + i] ^ ((ks[i >> 2] >>> (24 - 8 * (i & 3))) & 255);
      for (let j = 3; j >= 0; j--) { c[j] = (c[j] + 1) >>> 0; if (c[j] !== 0) break; }
    }
    return out;
  }
  /* ---------- helpers ---------- */
  const enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const unhex = s => Uint8Array.from(s.match(/../g) || [], x => parseInt(x, 16));
  const b64 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const t = atob(s), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b; };
  const rand = n => { const b = new Uint8Array(n); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(b); return b; };
  const eq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
  /* one secret (the session code) -> three independent keys: encrypt, authenticate messages, authenticate requests */
  function deriveKeys(code, salt, iters = 100000) { const k = pbkdf2(enc(code), salt, iters, 96); return { enc: k.slice(0, 32), mac: k.slice(32, 64), auth: k.slice(64, 96) }; }
  /* encrypt-then-MAC: iv(16) | ciphertext | hmac(32) */
  function seal(keys, bytes) { const iv = rand(16), ct = ctr(keys.enc, iv, bytes), out = new Uint8Array(16 + ct.length + 32); out.set(iv); out.set(ct, 16); out.set(hmac(keys.mac, out.subarray(0, 16 + ct.length)), 16 + ct.length); return out; }
  function open(keys, blob) { if (blob.length < 48) return null; const body = blob.subarray(0, blob.length - 32); if (!eq(hmac(keys.mac, body), blob.subarray(blob.length - 32))) return null; return ctr(keys.enc, blob.subarray(0, 16), blob.subarray(16, blob.length - 32)); }
  const sealJSON = (keys, obj) => seal(keys, enc(JSON.stringify(obj))), openJSON = (keys, blob) => { const b = open(keys, blob); return b ? JSON.parse(dec(b)) : null; };
  /* a human-friendly session code, e.g. K7M-9QX-4TP-2WD */
  function newCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = rand(12); let s = ''; for (let i = 0; i < 12; i++) { s += A[r[i] % A.length]; if (i % 3 === 2 && i < 11) s += '-'; } return s; }
  return { sha256, hmac, pbkdf2, ctr, enc, dec, hex, unhex, b64, unb64, rand, eq, deriveKeys, seal, open, sealJSON, openJSON, newCode };
})();
if (typeof module !== 'undefined') module.exports = SBC;
