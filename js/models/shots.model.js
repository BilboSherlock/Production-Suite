'use strict';
/* ===================================================================
   Shot list — MODEL
   Shots (P.shots) plan the coverage of each scene: size, angle,
   movement, lens, equipment, a description, notes, tags, a reference
   image, and whether it's been shot. Shots are kept in one list in
   scene order; a shot's label is its scene number plus a letter
   (12A, 12B…). Pure functions: no DOM, no Store, no UI state.
   See js/mvvm.js.
   =================================================================== */

const ShotsModel = (() => {
  const OPTS = {
    size: ['ECU', 'BCU', 'CU', 'MCU', 'MS', 'MWS', 'WS', 'EWS', 'Master', 'Insert', 'OTS', 'Two-shot', 'POV', 'Cutaway'],
    angle: ['Eye level', 'High angle', 'Low angle', "Bird's eye", "Worm's eye", 'Dutch tilt', 'Overhead'],
    move: ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Track', 'Handheld', 'Steadicam', 'Crane', 'Zoom', 'Whip pan', 'Push in', 'Pull out', 'Rack focus', 'Drone'],
    lens: ['14mm', '18mm', '24mm', '28mm', '35mm', '50mm', '85mm', '100mm', '135mm', '24-70mm', '70-200mm'],
    equip: ['Tripod', 'Dolly', 'Slider', 'Gimbal', 'Jib', 'Crane', 'Handheld rig', 'Steadicam', 'Drone', 'Car mount'],
  };
  const FIELDS = ['size', 'angle', 'move', 'lens', 'equip', 'desc', 'notes'];
  const COLS = ['Shot', 'Size', 'Angle', 'Movement', 'Lens', 'Equipment', 'Description', 'Tags', 'Notes', 'Done'];

  const newShot = (sceneId, o = {}) => Object.assign({ id: newId(), sceneId, size: '', angle: '', move: '', lens: '', equip: '', desc: '', notes: '', done: false }, o);
  const all = P => P.shots || [];
  const find = (P, id) => all(P).find(s => s.id === id) || null;
  const ofScene = (P, sceneId) => all(P).filter(s => s.sceneId === sceneId);
  /** "12A": scene number plus the shot's letter in that scene ('?' when the scene is gone) */
  function label(P, s, scenes) {
    const sc = scenes.find(x => x.id === s.sceneId); if (!sc) return '?';
    const i = ofScene(P, s.sceneId).indexOf(s);
    return sc.num + (i < 26 ? String.fromCharCode(65 + i) : '-' + (i + 1));
  }

  /* ---------- tags (the tag records live in P.shotTags; see js/tags.js) ---------- */
  /** does a shot pass a tag filter? F = { ids: Set, all }: '__none' = untagged; all = must carry every tag */
  const passTags = (s, F) => !F || !F.ids || !F.ids.size || (F.all ? [...F.ids].every(i => (s.tags || []).includes(i)) : [...F.ids].some(i => (s.tags || []).includes(i))) || (F.ids.has('__none') && !(s.tags || []).length);
  const tagNames = (P, s) => (s.tags || []).map(id => ((P.shotTags || []).find(t => t.id === id) || {}).name).filter(Boolean).join(', ');

  /* ---------- editing ---------- */
  /** a new shot at the end of its scene; it keeps the lens and equipment of the scene's last shot */
  function add(P, sceneId) {
    const list = (P.shots = P.shots || []), sib = ofScene(P, sceneId), last = sib[sib.length - 1];
    const s = newShot(sceneId, last ? { lens: last.lens, equip: last.equip } : {});
    list.splice(last ? list.indexOf(last) + 1 : list.length, 0, s); return s;
  }
  function update(s, k, v) { if (!FIELDS.includes(k)) return false; s[k] = String(v ?? ''); return true; }
  function setDone(s, on) { s.done = !!on; return true; }
  function setRef(s, url) { if (url) s.ref = url; else delete s.ref; return true; }
  /** move a shot up (-1) or down (+1) within its scene */
  function move(P, id, d) {
    const s = find(P, id); if (!s) return false;
    const sib = ofScene(P, s.sceneId), j = sib.indexOf(s) + d; if (j < 0 || j >= sib.length) return false;
    const a = P.shots.indexOf(s), b = P.shots.indexOf(sib[j]); [P.shots[a], P.shots[b]] = [P.shots[b], P.shots[a]]; return true;
  }
  /** a copy right after the shot (not done, no reference link to takes) → the copy */
  function duplicate(P, id) {
    const s = find(P, id); if (!s) return null;
    const c = Object.assign(JSON.parse(JSON.stringify(s)), { id: newId(), done: false });
    P.shots.splice(P.shots.indexOf(s) + 1, 0, c); return c;
  }
  /** delete a shot, its takes, and unlink its storyboard frames */
  function remove(P, id) {
    const n = all(P).length; P.shots = all(P).filter(s => s.id !== id); if (P.shots.length === n) return false;
    P.takes = (P.takes || []).filter(t => t.shotId !== id);
    (P.boards || []).forEach(b => { if (b.shotId === id) b.shotId = ''; });
    return true;
  }
  /** a master shot for every scene with no coverage → how many added */
  function addMasters(P, scenes) {
    let n = 0;
    scenes.forEach(sc => { if (!ofScene(P, sc.id).length) { (P.shots = P.shots || []).push(newShot(sc.id, { size: 'Master', angle: 'Eye level', move: 'Static', desc: 'Master — full coverage of the scene' })); n++; } });
    return n;
  }
  function resetDone(P) { const n = all(P).filter(s => s.done).length; all(P).forEach(s => { s.done = false; }); return n; }
  /** the director's notes for a scene (shown beside its shots) */
  function setDirNotes(P, sceneId, v) { const m = (P.sceneMeta = P.sceneMeta || {}); (m[sceneId] = m[sceneId] || {}).dirNotes = String(v ?? ''); return true; }

  /* ---------- what to show ---------- */
  const progress = list => { const done = list.filter(s => s.done).length; return { done, total: list.length, pct: list.length ? done / list.length * 100 : 0 }; };
  /** the picture for a shot: its storyboard frame, else its reference image */
  function frame(P, s) {
    const b = (P.boards || []).find(x => x.shotId === s.id && x.img);
    return b ? { kind: 'board', src: b.img } : s.ref ? { kind: 'ref', src: s.ref } : null;
  }
  /** scenes with their shots that pass the filter. sceneId: one scene, or 'all' */
  function groups(P, scenes, sceneId, F) {
    return scenes.filter(sc => sceneId === 'all' || sc.id === sceneId).map(sc => {
      const any = ofScene(P, sc.id), shots = any.filter(s => passTags(s, F));
      return { scene: sc, shots, any: any.length, progress: progress(shots) };
    });
  }
  const cells = (P, s, scenes) => [label(P, s, scenes), s.size, s.angle, s.move, s.lens, s.equip, s.desc, tagNames(P, s), s.notes];
  /** CSV: every scene, filtered by tags */
  function csvRows(P, scenes, F) {
    const rows = [['Scene', ...COLS]];
    scenes.forEach(sc => ofScene(P, sc.id).filter(s => passTags(s, F)).forEach(s => rows.push([sc.num, ...cells(P, s, scenes), s.done ? 'Yes' : ''])));
    return rows;
  }
  /** print: a heading row per scene that has shots */
  function printRows(P, scenes, sceneId, F) {
    const rows = [];
    groups(P, scenes, sceneId, F).forEach(g => { if (!g.shots.length) return; rows.push({ grp: `Scene ${g.scene.num} — ${g.scene.label}` }); g.shots.forEach(s => rows.push([...cells(P, s, scenes), s.done ? '✓' : ''])); });
    return { head: COLS, rows };
  }

  return {
    OPTS, FIELDS, COLS, newShot, all, find, ofScene, label, passTags, tagNames,
    add, update, setDone, setRef, move, duplicate, remove, addMasters, resetDone, setDirNotes,
    progress, frame, groups, csvRows, printRows,
  };
})();
