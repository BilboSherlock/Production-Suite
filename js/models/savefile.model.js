'use strict';
/* ===================================================================
   Save files — MODEL. The .studiobindahh backup file: compact, checked
   and lossless. No DOM (runs in Node for the tests).

   Layout (little-endian):
     'SBX1' · u32 header length · header (JSON) · data … · 'SBX!' · u32 file length · u32 CRC-32 of the header
     header = { app, format: 1, kind: 'project' | 'bundle', title, n, exported,
                json:  { at, len, size, crc, comp: 'gzip' | 'none' },
                blobs: [{ at, len, crc, pre }] }
     at = offset from the end of the header; crc = CRC-32 of the stored bytes (of the
     uncompressed text for the JSON); pre = a data URL's prefix ('data:image/jpeg;base64').

   · Compact: images (base64 data URLs) are stored as raw bytes, a third smaller, and once
     each however often a project uses them; the rest is gzip-compressed JSON.
   · Lossless: an image goes into a blob only when it decodes and re-encodes to exactly the
     same text; in the JSON it becomes '\0sbx:N', and a string that already starts with '\0'
     gets one more, so every string comes back exactly. write() decodes what it wrote and
     compares it with the original before handing the file over.
   · Checked: every part has a CRC-32 and the trailer holds the file's length, so a cut-off
     or damaged file is noticed, never half-imported by accident. The JSON comes first,
     so a cut-off file still gives back everything but the images past the cut.
   · Old backups (.json) still open; a cut-off one is salvaged up to its last whole value.
   =================================================================== */
const SaveFile = (() => {
  const MAGIC = 'SBX1', END = 'SBX!', EXT = '.studiobindahh', FORMAT = 1, MIN_IMG = 200;

  const TBL = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  const utf8 = s => new TextEncoder().encode(s);
  const strict = b => new TextDecoder('utf-8', { fatal: true }).decode(b);
  const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));

  function b64(bytes) {
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) {
    let bin; try { bin = atob(s); } catch (e) { return null; }
    const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  /* as much of a cut-off or damaged gzip stream as decompresses */
  async function inflatePartial(bytes) {
    if (!canGzip()) return new Uint8Array(0);
    const s = new DecompressionStream('gzip'), w = s.writable.getWriter(), r = s.readable.getReader(), parts = []; let n = 0;
    w.write(bytes).catch(() => { }); w.close().catch(() => { });
    try { for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; } } catch (e) { /* stop at the damage */ }
    const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  async function gzip(bytes, inflate) {
    const s = inflate ? new DecompressionStream('gzip') : new CompressionStream('gzip'), w = s.writable.getWriter();
    w.write(bytes).catch(() => { }); w.close().catch(() => { });
    return new Uint8Array(await new Response(s.readable).arrayBuffer());
  }
  const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  /* ---------- writing ---------- */
  /** data (a project or a bundle) → the file's bytes. meta = { kind, title, n, exported } */
  async function encode(data, meta = {}) {
    const blobs = [], seen = new Map();
    const json = JSON.stringify(data, (k, v) => {
      if (typeof v !== 'string') return v;
      if (v.charCodeAt(0) === 0) return '\0' + v;
      if (v.length < MIN_IMG || !v.startsWith('data:')) return v;
      let i = seen.get(v); if (i !== undefined) return '\0sbx:' + i;
      const c = v.indexOf(','), pre = c > 0 ? v.slice(0, c) : '';
      if (!pre.endsWith(';base64')) return v;
      const body = v.slice(c + 1), bytes = unb64(body);
      if (!bytes || b64(bytes) !== body) return v;                       // kept as text unless it comes back exactly
      i = blobs.length; blobs.push({ pre, bytes }); seen.set(v, i); return '\0sbx:' + i;
    });
    if (json === undefined) throw new Error('There is nothing to save.');
    const raw = utf8(json); let body = raw, comp = 'none';
    if (canGzip()) { try { body = await gzip(raw); comp = 'gzip'; } catch (e) { body = raw; } }
    const parts = [body]; let at = body.length;
    const hb = blobs.map(b => { const r = { at, len: b.bytes.length, crc: crc32(b.bytes), pre: b.pre }; at += b.bytes.length; parts.push(b.bytes); return r; });
    const header = utf8(JSON.stringify({ app: 'StudioBindahh', format: FORMAT, kind: meta.kind || 'project', title: meta.title || '', n: meta.n || 1,
      exported: meta.exported || Date.now(), json: { at: 0, len: body.length, size: raw.length, crc: crc32(raw), comp }, blobs: hb }));
    const total = 8 + header.length + at + 12, out = new Uint8Array(total), dv = new DataView(out.buffer);
    out.set(utf8(MAGIC), 0); dv.setUint32(4, header.length, true); out.set(header, 8);
    let o = 8 + header.length; for (const p of parts) { out.set(p, o); o += p.length; }
    out.set(utf8(END), o); dv.setUint32(o + 4, total, true); dv.setUint32(o + 8, crc32(header), true);
    return out;
  }
  /** encode, then read it back and compare with the original — throws rather than hand over a file that would not restore exactly */
  async function write(data, meta) {
    const bytes = await encode(data, meta), back = await decode(bytes);
    if (!back.complete || JSON.stringify(back.data) !== JSON.stringify(data)) throw new Error('The backup did not read back exactly, so it was not saved. Please try again.');
    return bytes;
  }

  /* ---------- reading ---------- */
  /**
   * a file's bytes → { data, kind, title, exported, format: 'sbx' | 'json', complete, problems: [text], lost: { images, after } }
   * complete is false when something had to be left out; problems say what. Throws when nothing can be read.
   */
  async function decode(input) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (b.length >= 4 && ascii(b, 0, 4) === MAGIC) return readSbx(b);
    if (b[0] === 0x1f && b[1] === 0x8b) {
      if (!canGzip()) throw new Error('This browser cannot open compressed files. Please update it.');
      let raw; try { raw = await gzip(b, true); } catch (e) { throw new Error('This compressed file is damaged.'); }
      return fromText(new TextDecoder().decode(raw));
    }
    return fromText(new TextDecoder().decode(b));
  }

  function fromText(text) {
    text = text.replace(/^﻿/, '');
    const out = { kind: 'json', title: '', exported: null, format: 'json', complete: true, problems: [], lost: { images: 0, after: '' } };
    try { out.data = JSON.parse(text); return out; } catch (e) { /* salvage below */ }
    if (!/^\s*[{[]/.test(text)) throw new Error('This is not a StudioBindahh backup.');
    const s = salvage(text);
    if (!s) throw new Error('This backup is damaged and nothing in it could be read.');
    out.data = s.data; out.complete = false; out.lost.after = s.after;
    const kb = Math.round(s.dropped / 1024);
    out.problems.push(`The file is cut off or damaged${s.after ? ` part-way through “${s.after}”` : ''}. Everything before that point was recovered${kb ? `; the last ${kb} KB could not be read` : ''}.`);
    return out;
  }

  async function readSbx(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length < 8) throw new Error('This backup is cut off before its contents begin, so nothing can be recovered.');
    const H = dv.getUint32(4, true);
    if (8 + H > b.length) throw new Error('This backup is cut off before its contents begin, so nothing can be recovered.');
    const hbytes = b.subarray(8, 8 + H); let head;
    try { head = JSON.parse(strict(hbytes)); } catch (e) { throw new Error('This backup’s header is damaged, so it cannot be read.'); }
    if (!head || !head.json) throw new Error('This backup’s header is damaged, so it cannot be read.');
    if (head.format > FORMAT) throw new Error('This backup was made by a newer version of StudioBindahh. Update the app to open it.');
    const base = 8 + H, e = b.length - 12;
    const whole = b.length >= base + 12 && ascii(b, e, 4) === END && dv.getUint32(e + 4, true) === b.length && dv.getUint32(e + 8, true) === crc32(hbytes);
    const limit = whole ? e : b.length;
    const sec = x => base + x.at + x.len <= limit ? b.subarray(base + x.at, base + x.at + x.len) : null;

    const blobs = head.blobs || [], cache = [], lost = new Set();
    const blob = i => {
      if (cache[i] !== undefined) return cache[i];
      const x = blobs[i], by = x && sec(x); let s = '';
      if (by && crc32(by) === x.crc) s = x.pre + ',' + b64(by); else lost.add(i);
      return (cache[i] = s);
    };
    const revive = (k, v) => {
      if (typeof v !== 'string' || v.charCodeAt(0) !== 0) return v;
      if (v.charCodeAt(1) === 0) return v.slice(1);
      const m = /^\0sbx:(\d+)$/.exec(v); return m ? blob(+m[1]) : v;
    };

    /* the project data: whole and checked, or — cut off or damaged — read as far as it goes and salvaged */
    let jb = sec(head.json), raw = null, data, salvaged = null;
    if (jb) { try { raw = head.json.comp === 'gzip' ? await gzip(jb, true) : jb; } catch (x) { raw = null; } }
    if (raw && crc32(raw) === head.json.crc) data = JSON.parse(strict(raw), revive);
    else {
      const from = base + head.json.at, to = Math.min(from + head.json.len, limit);
      if (to > from) {
        const part = head.json.comp === 'gzip' ? await inflatePartial(b.subarray(from, to)) : b.subarray(from, to);
        salvaged = salvage(new TextDecoder().decode(part), revive);
      }
      if (!salvaged) throw new Error('The project data in this backup is ' + (jb ? 'damaged' : 'cut off') + ' and nothing in it could be read. Download it again from the device that made it.');
      data = salvaged.data;
    }
    const out = { data, kind: head.kind, title: head.title || '', exported: head.exported || null, format: 'sbx', complete: !lost.size && !salvaged, problems: [], lost: { images: lost.size, after: salvaged ? salvaged.after : '' } };
    if (salvaged) out.problems.push(`The file is ${jb ? 'damaged' : 'cut off'}${salvaged.after ? ` part-way through “${salvaged.after}”` : ''}. Everything before that point was recovered.`);
    if (lost.size) out.problems.push(`${lost.size} image${lost.size === 1 ? '' : 's'} could not be read (the file is ${whole ? 'damaged' : 'cut off'}) and ${lost.size === 1 ? 'was' : 'were'} left blank. Everything else was restored.`);
    return out;
  }

  /**
   * a JSON text that was cut off or damaged → { data, dropped (characters), after (the top-level
   * section it broke in) } — everything up to the last complete value, with the open brackets closed. null when nothing is usable.
   */
  function salvage(text, reviver) {
    let closers = '', ins = false, esc = false, top = '', str = '', depth = 0, best = null;
    /* a cut is safe between the items of a list or the project's own fields; an object inside a
       list is kept whole or not at all, never half-filled */
    const mark = i => { if (closers && (closers[0] === ']' || depth === 1)) best = { at: i, closers, top }; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (ins) {
        if (esc) esc = false; else if (c === '\\') esc = true;
        else if (c === '"') ins = false; else if (depth === 1 && str.length < 80) str += c;
        else if (c < ' ') break;                                     // a control character inside a string: the damage starts here
        continue;
      }
      if (c === '"') { ins = true; str = ''; }
      else if (c === ':') { if (depth === 1) top = str; }
      else if (c === '{' || c === '[') { closers = (c === '{' ? '}' : ']') + closers; depth++; mark(i + 1); }
      else if (c === '}' || c === ']') { if (closers[0] !== c) break; closers = closers.slice(1); depth--; if (!depth) { best = { at: i + 1, closers: '', top }; break; } mark(i + 1); }
      else if (c === ',') mark(i);
      else if (c < ' ' && !/\s/.test(c)) break;
    }
    if (!best) return null;
    try { return { data: JSON.parse(text.slice(0, best.at) + best.closers, reviver), dropped: text.length - best.at, after: best.top }; } catch (e) { return null; }
  }

  /** is this file name one of ours (or an older .json backup)? */
  const isBackup = name => /\.studiobindahh$|\.json$/i.test(name || '');

  return { EXT, FORMAT, encode, write, decode, salvage, crc32, isBackup };
})();
