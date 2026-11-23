'use strict';
/* ===================================================================
   Project diff & patch for live collaboration.
   A project is a tree of objects and arrays. Arrays whose items all
   carry a string id are "keyed": items are added, removed and edited
   individually, and their order is carried by a hidden numeric key
   (_o) on every item, so concurrent inserts and moves always settle on
   the same order. Everything else (primitives, plain arrays) is
   replaced whole.
   Ops: {t:'s',p:[path],v}  set      {t:'d',p:[path]}  delete
   A path step starting with '#' addresses a keyed-array item by id.
   =================================================================== */
const SBD = (() => {
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const keyed = a => Array.isArray(a) && a.length > 0 && a.every(x => isObj(x) && typeof x.id === 'string' && x.id !== '');
  const EXCLUDE = new Set(['id', 'created', 'updated', 'snapshots', 'collab']);       // top-level project keys that are never shared
  /* copy objects and arrays, share strings and numbers */
  function clone(v) { if (v === null || typeof v !== 'object') return v; if (Array.isArray(v)) { const o = new Array(v.length); for (let i = 0; i < v.length; i++) o[i] = clone(v[i]); return o; } const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = clone(v[k]); return o; }
  function equal(a, b) {
    if (a === b) return true; if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false; return true; }
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined); if (ka.length !== kb.length) return false;
    for (const k of ka) if (!equal(a[k], b[k])) return false; return true;
  }
  function diff(a, b, path = [], ops = [], top = true) {
    if (a === b) return ops;
    if (isObj(a) && isObj(b)) {
      for (const k in b) { if (top && EXCLUDE.has(k)) continue; if (b[k] === undefined) continue; if (!(k in a) || a[k] === undefined) ops.push({ t: 's', p: [...path, k], v: clone(b[k]) }); else diff(a[k], b[k], [...path, k], ops, false); }
      for (const k in a) { if (top && EXCLUDE.has(k)) continue; if ((!(k in b) || b[k] === undefined) && a[k] !== undefined) ops.push({ t: 'd', p: [...path, k] }); }
      return ops;
    }
    if (Array.isArray(a) && Array.isArray(b) && (keyed(a) || keyed(b)) && (keyed(a) || !a.length) && (keyed(b) || !b.length)) {
      const ma = new Map(a.map(x => [x.id, x])), mb = new Map(b.map(x => [x.id, x]));
      b.forEach(x => { const o = ma.get(x.id); if (!o) ops.push({ t: 's', p: [...path, '#' + x.id], v: clone(x) }); else diff(o, x, [...path, '#' + x.id], ops, false); });
      a.forEach(x => { if (!mb.has(x.id)) ops.push({ t: 'd', p: [...path, '#' + x.id] }); });
      return ops;
    }
    if (!equal(a, b)) ops.push(b === undefined ? { t: 'd', p: path } : { t: 's', p: path, v: clone(b) });
    return ops;
  }
  /* find the container for the last path step; returns null if a parent is missing */
  function walk(doc, path) {
    let cur = doc;
    for (let i = 0; i < path.length; i++) {
      const k = path[i]; if (cur === null || typeof cur !== 'object') return null;
      if (k[0] === '#') { if (!Array.isArray(cur)) return null; cur = cur.find(x => x && x.id === k.slice(1)); if (!cur) return null; } else { if (Array.isArray(cur)) return null; cur = cur[k]; if (cur === undefined) return null; }
    }
    return cur;
  }
  const replaceInPlace = (t, s) => { if (Array.isArray(t)) { t.length = 0; t.push(...s); } else { for (const k of Object.keys(t)) delete t[k]; Object.assign(t, s); } };
  function apply(doc, op) {
    const p = op.p;
    const last = p[p.length - 1], parent = walk(doc, p.slice(0, -1)); if (parent === null && p.length) return false; const par = p.length ? parent : doc;
    if (par === null || typeof par !== 'object') return false;
    if (last[0] === '#') {
      if (!Array.isArray(par)) return false; const id = last.slice(1), i = par.findIndex(x => x && x.id === id);
      if (op.t === 'd') { if (i >= 0) par.splice(i, 1); return true; }
      const v = clone(op.v); if (i >= 0) replaceInPlace(par[i], v); else par.push(v); return true;
    }
    if (Array.isArray(par)) return false;
    if (op.t === 'd') { delete par[last]; return true; }
    const cur = par[last], v = clone(op.v); if (isObj(cur) && isObj(v)) replaceInPlace(cur, v); else if (Array.isArray(cur) && Array.isArray(v)) replaceInPlace(cur, v); else par[last] = v; return true;
  }
  const applyAll = (doc, ops) => { let n = 0; for (const o of ops) if (apply(doc, o)) n++; return n; };
  /* which top-level section and item ids an op batch touched (for targeted redraws) */
  function touched(ops) { const sec = new Set(), ids = new Set(); let structural = false; ops.forEach(o => { sec.add(o.p[0]); o.p.forEach(s => { if (s[0] === '#') ids.add(s.slice(1)); }); if (o.p.length && o.p[o.p.length - 1][0] === '#') structural = true; if (o.p[o.p.length - 1] === '_o') structural = true; }); return { sec, ids, structural }; }
  /* ---- hidden order keys ---- */
  const byOrder = (x, y) => ((x._o - y._o) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  function lisKeep(arr) {   // indices whose _o values form the longest increasing run
    const idx = [], tails = [], prev = new Array(arr.length).fill(-1);
    for (let i = 0; i < arr.length; i++) { const o = arr[i]._o; if (typeof o !== 'number' || !isFinite(o)) continue; let lo = 0, hi = tails.length; while (lo < hi) { const m = (lo + hi) >> 1, t = arr[tails[m]]; if (t._o < o || (t._o === o && t.id < arr[i].id)) lo = m + 1; else hi = m; } if (lo > 0) prev[i] = tails[lo - 1]; tails[lo] = i; }
    const keep = new Set(); let k = tails.length ? tails[tails.length - 1] : -1; while (k >= 0) { keep.add(k); k = prev[k]; } return keep;
  }
  function fixOrder(arr) {
    const n = arr.length, keep = lisKeep(arr); if (keep.size === n) return;
    let i = 0;
    while (i < n) {
      if (keep.has(i)) { i++; continue; }
      let j = i; while (j < n && !keep.has(j)) j++;
      const lo = i > 0 ? arr[i - 1]._o : null, hi = j < n ? arr[j]._o : null, cnt = j - i;
      let vals; if (lo === null && hi === null) vals = Array.from({ length: cnt }, (_, k) => 1000 * (k + 1)); else if (lo === null) vals = Array.from({ length: cnt }, (_, k) => hi - 1000 * (cnt - k)); else if (hi === null) vals = Array.from({ length: cnt }, (_, k) => lo + 1000 * (k + 1)); else { const st = (hi - lo) / (cnt + 1); vals = Array.from({ length: cnt }, (_, k) => lo + st * (k + 1)); if (st < 1e-6) { arr.forEach((x, q) => { x._o = 1000 * (q + 1); }); return; } }
      for (let k = 0; k < cnt; k++) arr[i + k]._o = vals[k];
      i = j;
    }
  }
  function normalize(node, top = true) {
    if (Array.isArray(node)) { if (keyed(node)) fixOrder(node); for (const x of node) normalize(x, false); return; }
    if (isObj(node)) for (const k in node) { if (top && EXCLUDE.has(k)) continue; normalize(node[k], false); }
  }
  function sortAll(node, top = true) {
    if (Array.isArray(node)) { if (keyed(node) && node.every(x => typeof x._o === 'number')) { let sorted = true; for (let i = 1; i < node.length; i++) if (byOrder(node[i - 1], node[i]) > 0) { sorted = false; break; } if (!sorted) node.sort(byOrder); } for (const x of node) sortAll(x, false); return; }
    if (isObj(node)) for (const k in node) { if (top && EXCLUDE.has(k)) continue; sortAll(node[k], false); }
  }
  return { clone, equal, diff, apply, applyAll, touched, keyed, normalize, sortAll, EXCLUDE };
})();
if (typeof module !== 'undefined') module.exports = SBD;
