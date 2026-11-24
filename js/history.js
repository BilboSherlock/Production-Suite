'use strict';
/* ===================================================================
   Undo for non-script views, orphaned-data safety, revisions,
   locked scene numbers, shared scene helpers
   =================================================================== */

/* ---------- undo / redo for everything except the script text ----------
   A step is the whole project minus what the script editor owns (it has its own undo),
   so every section — budget, photo, podcast, pitch, storyboard sequences, and any added
   later — is covered without keeping a list. Each section is stored with a signature;
   a section that did not change shares its copy with the step before, so memory only
   grows by what was edited. */
const deepShare = v => Array.isArray(v) ? v.map(deepShare) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepShare(x)])) : v;
const HIST_SKIP = new Set(['id', 'mode', 'title', 'created', 'updated', 'meta', 'settings', 'blocks', 'snapshots', 'revisions']);
const Hist = {
  stack: [], i: -1, active: false, pid: null, t: null, onchange: null,
  /* long strings (images as data URLs) are compared by length and tail, not in full */
  sig(v) { return JSON.stringify(v, (k, x) => (typeof x === 'string' && x.length > 400) ? x.length + ':' + x.slice(-24) : x) || ''; },
  take(P, prev) {
    const step = { parts: {}, sigs: {}, changed: !prev };
    for (const k of Object.keys(P)) {
      if (HIST_SKIP.has(k)) continue;
      const sig = Hist.sig(P[k]), same = prev && prev.sigs[k] === sig;
      step.sigs[k] = sig; step.parts[k] = same ? prev.parts[k] : deepShare(P[k]);
      if (!same) step.changed = true;
    }
    return step;
  },
  reset(P) { clearTimeout(Hist.t); Hist.t = null; Hist.stack = [Hist.take(P)]; Hist.i = 0; Hist.pid = P.id; Hist.fire(); },
  note() { if (!Hist.active) return; clearTimeout(Hist.t); Hist.t = setTimeout(Hist.commit, 450); },
  commit() {
    Hist.t = null; const P = Store.P; if (!P || !Hist.active || P.id !== Hist.pid) return;
    const s = Hist.take(P, Hist.stack[Hist.i]); if (!s.changed) return;
    Hist.stack = Hist.stack.slice(0, Hist.i + 1); Hist.stack.push(s); if (Hist.stack.length > 40) Hist.stack.shift(); Hist.i = Hist.stack.length - 1; Hist.fire();
  },
  flush() { if (Hist.t) { clearTimeout(Hist.t); Hist.commit(); } },
  can(d) { return d < 0 ? Hist.i > 0 : Hist.i < Hist.stack.length - 1; },
  fire() { if (Hist.onchange) Hist.onchange(); },
  step(d) {
    if (window.Collab && Collab.active(Store.P)) { toast('Undo is off during a live session, so nobody undoes other people’s work. Use Drafts or budget Versions to go back.', true); return; }
    Hist.flush(); const P = Store.P; if (!P || !Hist.can(d)) return;
    const from = Hist.stack[Hist.i]; Hist.i += d; const to = Hist.stack[Hist.i];
    for (const k in to.parts) if (to.parts[k] !== from.parts[k]) P[k] = deepShare(to.parts[k]);   // only the sections that differ
    Store.touch(); Hist.fire(); Router.refresh(); toast(d < 0 ? 'Undone' : 'Redone');
  },
};

/* ---------- orphaned data (items whose scene no longer exists) ---------- */
function orphanReport(P) {
  const valid = new Set(P.blocks.filter(b => b.type === 'scene').map(b => b.id));
  const bad = s => s && !valid.has(s);
  const r = { tags: P.tags.filter(t => bad(t.sceneId)).length, shots: P.shots.filter(t => bad(t.sceneId)).length, boards: P.boards.filter(t => bad(t.sceneId)).length,
    days: sum(P.days, d => d.sceneIds.filter(bad).length), notes: Object.keys(P.sceneMeta).filter(bad).length };
  r.props = sum(P.props.concat(P.wardrobe), x => x.sceneIds.filter(bad).length); r.tasks = P.tasks.filter(t => bad(t.sceneId)).length;
  const bids = new Set(P.blocks.map(b => b.id)), sids = new Set(P.shots.filter(t => !bad(t.sceneId)).map(t => t.id));
  r.lined = (P.lined || []).filter(l => !bids.has(l.from) || !bids.has(l.to) || !sids.has(l.shotId)).length;
  r.photo = (P.photo ? P.photo.shots : []).filter(t => bad(t.sceneId)).length;
  r.total = r.tags + r.shots + r.boards + r.days + r.notes + r.props + r.tasks + r.lined + r.photo;
  return r;
}
function purgeOrphans(P) {
  const valid = new Set(P.blocks.filter(b => b.type === 'scene').map(b => b.id)), ok = s => !s || valid.has(s);
  const r = orphanReport(P);
  P.tags = P.tags.filter(t => ok(t.sceneId)); P.shots = P.shots.filter(t => ok(t.sceneId));
  const shotIds = new Set(P.shots.map(s => s.id));
  P.boards = P.boards.filter(t => ok(t.sceneId)); P.boards.forEach(b => { if (b.shotId && !shotIds.has(b.shotId)) b.shotId = ''; });
  P.days.forEach(d => d.sceneIds = d.sceneIds.filter(ok));
  P.props.concat(P.wardrobe).forEach(x => x.sceneIds = x.sceneIds.filter(ok)); P.tasks.forEach(t => { if (!ok(t.sceneId)) t.sceneId = ''; });
  Object.keys(P.sceneMeta).forEach(k => { if (!ok(k)) delete P.sceneMeta[k]; });
  P.cues.forEach(c => { if (!ok(c.sceneId)) c.sceneId = ''; });
  if (P.photo) { P.photo.shots = P.photo.shots.filter(t => ok(t.sceneId)); const ps = new Set(P.photo.shots.map(s => s.id)); P.photo.selects.forEach(x => { if (x.shotId && !ps.has(x.shotId)) x.shotId = ''; }); Object.values(P.photo.runs).forEach(rs => rs.forEach(r => { if (r.sceneId && !ok(r.sceneId)) r.sceneId = ''; })); }
  { const bids = new Set(P.blocks.map(b => b.id)), sids = new Set(P.shots.map(t => t.id)); P.lined = (P.lined || []).filter(l => bids.has(l.from) && bids.has(l.to) && sids.has(l.shotId)); P.takes = (P.takes || []).filter(t => !t.shotId || sids.has(t.shotId)); }
  P.stage.plans.forEach(pl => { if (!ok(pl.sceneId)) pl.sceneId = ''; });
  Store.touch(); return r;
}
function sceneDataCount(P, id) {
  return P.tags.filter(t => t.sceneId === id).length + P.shots.filter(t => t.sceneId === id).length + P.boards.filter(t => t.sceneId === id).length
    + P.days.filter(d => d.sceneIds.includes(id)).length + P.props.concat(P.wardrobe).filter(x => x.sceneIds.includes(id)).length;
}

/* ---------- revisions ---------- */
const REV_COLORS = [
  { k: 'white', label: 'White', color: '#ffffff' }, { k: 'blue', label: 'Blue', color: '#cfe3ff' }, { k: 'pink', label: 'Pink', color: '#ffd5e5' },
  { k: 'yellow', label: 'Yellow', color: '#fff4b3' }, { k: 'green', label: 'Green', color: '#d3f2d0' }, { k: 'goldenrod', label: 'Goldenrod', color: '#f5dd9b' },
  { k: 'buff', label: 'Buff', color: '#efdcb8' }, { k: 'salmon', label: 'Salmon', color: '#ffd0bd' }, { k: 'cherry', label: 'Cherry', color: '#ffb5bd' },
];
const currentRev = P => P.revisions.find(r => r.id === P.settings.rev) || null;
const revColor = (P, id) => { const r = P.revisions.find(x => x.id === id); return r ? r.color : ''; };

/* ---------- locked scene numbers ---------- */
function lockSceneNumbers(P) { let n = 0; P.blocks.forEach(b => { if (b.type === 'scene') b.num = String(++n); }); P.settings.sceneNumLock = true; }
function unlockSceneNumbers(P) { P.blocks.forEach(b => { delete b.num; }); P.settings.sceneNumLock = false; }
function assignNewSceneNumbers(P) {
  const used = new Set(P.blocks.filter(b => b.type === 'scene' && b.num).map(b => b.num)); let prev = '', changed = false;
  P.blocks.forEach(b => {
    if (b.type !== 'scene') return;
    if (!b.num) {
      let cand;
      if (!prev) cand = 'A1';
      else { const m = /^(.*?)([A-Z]*)$/.exec(prev); let base = m[1], suf = m[2]; if (!suf) suf = 'A'; else suf = nextLetters(suf); cand = base + suf; while (used.has(cand)) { suf = nextLetters(suf); cand = base + suf; } }
      b.num = cand; used.add(cand); changed = true;
    }
    prev = b.num;
  });
  return changed;
}
function nextLetters(s) { const a = s.split(''); let i = a.length - 1; while (i >= 0) { if (a[i] === 'Z') { a[i] = 'A'; i--; } else { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); return a.join(''); } } return 'A' + a.join(''); }

/* ---------- moving a scene (used by script navigator and corkboard) ---------- */
function moveSceneBlocks(P, srcId, tgtId, after) {
  if (!srcId || srcId === tgtId) return false;
  const sc = getScenes(P), s = sc.find(x => x.id === srcId), t = sc.find(x => x.id === tgtId); if (!s || !t) return false;
  const chunk = P.blocks.splice(s.idx, s.end - s.idx);
  let ti = P.blocks.findIndex(b => b.id === tgtId);
  if (after) { ti++; while (ti < P.blocks.length && P.blocks[ti].type !== 'scene' && P.blocks[ti].type !== 'act') ti++; }
  P.blocks.splice(ti, 0, ...chunk);
  return true;
}

/* ---------- cast availability & schedule conflicts ---------- */
function parseUnavail(str) {
  const out = [];
  String(str || '').split(/[,;\n]+/).forEach(tok => {
    tok = tok.trim(); if (!tok) return;
    const m = /^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|to|–|—|-)\s*(\d{4}-\d{2}-\d{2})$/i.exec(tok);
    if (m) out.push([m[1], m[2]]); else if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) out.push([tok, tok]);
  });
  return out;
}
function dayConflicts(P, day, scenes) {
  const out = [];
  const ds = day.sceneIds.map(id => scenes.find(s => s.id === id)).filter(Boolean);
  const chars = new Set(); ds.forEach(s => sceneCast(P, s).forEach(c => chars.add(c)));
  if (day.date) {
    P.people.filter(p => p.type === 'cast' && p.character && chars.has(normChar(p.character))).forEach(p => {
      if (parseUnavail(p.unavail).some(([a, b]) => day.date >= a && day.date <= b)) out.push(`${p.name || p.character} is unavailable on ${day.date}`);
    });
    if (P.days.some(d => d !== day && d.date === day.date)) out.push('Another shoot day is booked on the same date');
  }
  return out;
}
