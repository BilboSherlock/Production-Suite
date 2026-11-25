'use strict';
/* ===================================================================
   Storyboard — MODEL
   Frames (P.boards) live in one ordered list. Each frame can belong to
   a free-form sequence (P.seqs), be tied to a scene and to a shot, and
   carries its drawing (layers, flattened img), a caption, a duration
   and an optional camera move (cam). The drawing studio and renderer
   (js/sbstudio.js, js/sbrender.js) work on the picture; this model
   keeps the board itself. Pure functions: no DOM, no Store, no UI state.
   See js/mvvm.js.
   =================================================================== */

const BoardsModel = (() => {
  const ASPECTS = { '16:9': 16 / 9, '2.39:1': 2.39, '1.85:1': 1.85, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 };
  const SEQ_COLORS = ['#e5484d', '#e8830c', '#e8a40c', '#1e8e54', '#12a594', '#2468d8', '#7a45c9', '#d6409f'];
  const SHOT_FIELDS = ['size', 'angle', 'move', 'lens'];
  const clone = x => JSON.parse(JSON.stringify(x));

  const newFrame = (o = {}) => Object.assign({ id: newId(), sceneId: '', seqId: '', shotId: '', img: '', base: '', ink: '', layers: [], caption: '', notes: '', dur: 3, size: '', angle: '', move: '', lens: '' }, o);
  const frames = P => P.boards || [];
  const seqs = P => P.seqs || [];
  const find = (P, id) => frames(P).find(b => b.id === id) || null;
  /** the frame shape as a number (width / height) */
  const aspect = P => ASPECTS[(P.settings || {}).aspect] || 16 / 9;
  function setAspect(P, k) { if (!ASPECTS[k]) return false; (P.settings = P.settings || {}).aspect = k; return true; }
  const dur = b => +b.dur || 3;
  const runtime = list => list.reduce((t, b) => t + dur(b), 0);
  const hasMove = b => !!(b.cam && b.cam.b);
  /** the view to open with: sequences unless the board is all scene-tied frames */
  const defaultView = P => (seqs(P).length || frames(P).some(b => !b.sceneId) || !frames(P).length) ? 'seq' : 'scene';

  /* ---------- frames ---------- */
  function add(P, o) { const b = newFrame(o); (P.boards = P.boards || []).push(b); return b; }
  function insertAfter(P, after, b) { const i = frames(P).indexOf(after); P.boards.splice(i < 0 ? P.boards.length : i + 1, 0, b); return b; }
  /** a blank frame right after another, in the same scene and sequence */
  const addAfter = (P, after) => insertAfter(P, after, newFrame({ sceneId: after.sceneId, seqId: after.seqId }));
  function setCaption(b, v) { b.caption = String(v ?? ''); return true; }
  /** a copy of a frame (new ids, no shot link) */
  function copyOf(b, over = {}) { const c = clone(b); c.id = newId(); c.shotId = ''; (c.layers || []).forEach(l => { l.id = newId(); }); return Object.assign(c, over); }
  function duplicate(P, id) { const b = find(P, id); return b ? insertAfter(P, b, copyOf(b)) : null; }
  /** paste a copied frame after `afterId` (or at the end), into the given group */
  function paste(P, src, afterId, over) { const c = copyOf(src, over), after = afterId && find(P, afterId); return after ? insertAfter(P, after, c) : (P.boards = P.boards || []).push(c) && c; }
  function remove(P, id) { const n = frames(P).length; P.boards = frames(P).filter(b => b.id !== id); return P.boards.length < n; }
  function unlinkShot(b) { if (!b.shotId) return false; b.shotId = ''; return true; }
  function freeFromScene(b) { if (!b.sceneId) return false; b.sceneId = ''; b.shotId = ''; return true; }
  /** swap with the frame d places away in `ids` (the order on screen) */
  function step(P, id, d, ids) {
    const i = ids.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= ids.length) return false;
    const L = frames(P), a = L.findIndex(b => b.id === id), c = L.findIndex(b => b.id === ids[j]); [L[a], L[c]] = [L[c], L[a]]; return true;
  }
  /** drag & drop: move a frame before another (or to the end), joining a group ({ seqId } or { sceneId }) */
  function place(P, id, beforeId, group) {
    const L = frames(P), src = find(P, id); if (!src || id === beforeId) return false;
    L.splice(L.indexOf(src), 1); if (group) Object.assign(src, group);
    const at = beforeId ? L.findIndex(b => b.id === beforeId) : -1; if (at >= 0) L.splice(at, 0, src); else L.push(src);
    return true;
  }
  /** take the drawing studio's result; keep the id; optionally create a shot; sync the linked shot */
  function save(P, id, out, makeShot) {
    const b = find(P, id); if (!b) return false;
    Object.assign(b, out, { id });
    if (makeShot && !b.shotId) shotFromFrame(P, b);
    const sh = (P.shots || []).find(x => x.id === b.shotId);
    if (sh && b.sync !== false) { SHOT_FIELDS.forEach(f => { if (b[f]) sh[f] = b[f]; }); if (!sh.desc && b.caption) sh.desc = b.caption; }
    return true;
  }

  /* ---------- sequences ---------- */
  function addSeq(P, name) { const s = { id: newId(), name: String(name || '').trim() || 'Sequence', note: '', color: SEQ_COLORS[seqs(P).length % SEQ_COLORS.length] }; (P.seqs = P.seqs || []).push(s); return s; }
  function updateSeq(s, k, v) {
    if (k === 'name') { s.name = String(v || '').trim() || 'Sequence'; return true; }
    if (k === 'color' || k === 'note') { s[k] = String(v ?? ''); return true; }
    return false;
  }
  function moveSeq(P, id, d) { const L = seqs(P), i = L.findIndex(s => s.id === id), j = i + d; if (i < 0 || j < 0 || j >= L.length) return false; [L[i], L[j]] = [L[j], L[i]]; return true; }
  /** delete a sequence; its frames stay, unsorted */
  function removeSeq(P, id) { const n = seqs(P).length; frames(P).forEach(b => { if (b.seqId === id) b.seqId = ''; }); P.seqs = seqs(P).filter(s => s.id !== id); return P.seqs.length < n; }

  /* ---------- building from the script and shot list ---------- */
  /** a frame for every scene without one. caption(scene) → its synopsis or first action line → how many added */
  function fromScript(P, scenes, caption) {
    let n = 0; scenes.forEach(s => { if (!frames(P).some(b => b.sceneId === s.id)) { add(P, { sceneId: s.id, caption: caption(s) }); n++; } }); return n;
  }
  /** a frame for every shot without one → how many added */
  function fromShots(P) {
    let n = 0; (P.shots || []).forEach(s => { if (!frames(P).some(b => b.shotId === s.id)) { add(P, { sceneId: s.sceneId, shotId: s.id, caption: s.desc, size: s.size, angle: s.angle, move: s.move, lens: s.lens }); n++; } }); return n;
  }
  /** a shot in the frame's scene (frames with no scene can't have one) → the shot */
  function shotFromFrame(P, b) {
    if (!b.sceneId) return null;
    const s = ShotsModel.add(P, b.sceneId); SHOT_FIELDS.forEach(f => { s[f] = b[f] || ''; }); s.desc = b.caption || ''; b.shotId = s.id; return s;
  }
  /** shots for every frame with a scene and no shot → { n, skipped } (skipped: no scene) */
  function shotsFromFrames(P) {
    let n = 0, skipped = 0; frames(P).forEach(b => { if (b.shotId) return; if (!b.sceneId) { skipped++; return; } if (shotFromFrame(P, b)) n++; }); return { n, skipped };
  }

  /* ---------- what to show ---------- */
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  /** sequences view: each sequence with its frames, then the unsorted ones (shown when any, or when there are no sequences) */
  function seqGroups(P) {
    const g = seqs(P).map(s => { const list = frames(P).filter(b => b.seqId === s.id); return { key: 'seq:' + s.id, seq: s, title: s.name, frames: list, group: { seqId: s.id }, secs: Math.round(runtime(list)) }; });
    const loose = frames(P).filter(b => !b.seqId);
    if (loose.length || !seqs(P).length) g.push({ key: 'seq:', seq: null, title: seqs(P).length ? 'Unsorted' : 'Frames', frames: loose, group: { seqId: '' } });
    return g;
  }
  /** scene view: every scene, then frames tied to no (existing) scene */
  function sceneGroups(P, scenes) {
    const g = scenes.map(sc => ({ key: 'sc:' + sc.id, scene: sc, title: sc.label, frames: frames(P).filter(b => b.sceneId === sc.id), group: { sceneId: sc.id } }));
    const loose = frames(P).filter(b => !b.sceneId || !scenes.some(s => s.id === b.sceneId));
    if (loose.length) g.push({ key: 'sc:', scene: null, title: 'Not tied to a scene', frames: loose, group: { sceneId: '' } });
    return g;
  }
  /** the corner label of a frame: "Sc 4 · 4B · Frame 2" */
  function cornerLabel(P, b, i, scenes) {
    const sc = scenes.find(s => s.id === b.sceneId), sh = (P.shots || []).find(s => s.id === b.shotId);
    return [sc && `Sc ${sc.num}`, sh && ShotsModel.label(P, sh, scenes), 'Frame ' + (i + 1)].filter(Boolean).join(' · ');
  }
  const clock = secs => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
  /** printing: [name, frames] per group of the current view, empty groups left out */
  function printGroups(P, scenes, view) {
    const g = view === 'scene' ? scenes.map(s => [`${s.num}. ${s.label}`, frames(P).filter(b => b.sceneId === s.id)])
      : [...seqs(P).map(s => [s.name, frames(P).filter(b => b.seqId === s.id)]), [seqs(P).length ? 'Unsorted' : 'Frames', frames(P).filter(b => !b.seqId)]];
    return g.filter(x => x[1].length);
  }

  return {
    ASPECTS, SEQ_COLORS, clone, newFrame, frames, seqs, find, aspect, setAspect, dur, runtime, hasMove, defaultView,
    add, insertAfter, addAfter, setCaption, copyOf, duplicate, paste, remove, unlinkShot, freeFromScene, step, place, save,
    addSeq, updateSeq, moveSeq, removeSeq, fromScript, fromShots, shotFromFrame, shotsFromFrames,
    plural, seqGroups, sceneGroups, cornerLabel, clock, printGroups,
  };
})();
