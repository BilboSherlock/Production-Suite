'use strict';
/* ===================================================================
   Photo shot list — MODEL
   The frames planned for each setup of a photo shoot (P.photo.shots):
   { id, sceneId, title, subject, orient, camera, lens, lighting, pose,
   wardrobe, props, hair, notes, ref, hero, status, must, tags? }.
   Labels (1A, 1B…), filtering, grouping by setup, the status board,
   coverage, editing and the export rows. Pure functions: no DOM, no
   Store, no UI state; the setups (getScenes) are passed in.
   See js/mvvm.js.
   =================================================================== */

const PhotoShotsModel = (() => {
  const STATUS = ['Planned', 'Shot', 'Selected', 'Retouching', 'Client review', 'Approved', 'Delivered'];
  const TONE = { Planned: '#8a8f98', Shot: '#2468d8', Selected: '#7a45c9', Retouching: '#e8830c', 'Client review': '#d6409f', Approved: '#1e8e54', Delivered: '#0a7a3d' };
  const ORIENT = ['Portrait', 'Landscape', 'Square', 'Panoramic'];
  /** every status after Planned means the frame is in the can */
  const CAPTURED = STATUS.slice(1);
  const TEXT = ['title', 'subject', 'camera', 'lens', 'lighting', 'pose', 'wardrobe', 'props', 'hair', 'notes'];
  /** a new shot in a setup starts with the look of the setup's last shot */
  const CARRY = ['subject', 'camera', 'lens', 'lighting', 'wardrobe', 'hair', 'orient'];
  const HEAD = ['Shot', 'Setup', 'Description', 'Subject', 'Format', 'Camera / lens', 'Lighting', 'Wardrobe', 'Props', 'Hair / makeup', 'Hero', 'Status', 'Notes', 'Tags'];
  /** the printed sheet leaves out hair & makeup and notes */
  const PRINT_DROP = [9, 12];
  const blankFilter = () => ({ setup: '', status: '', hero: false, q: '' });

  const letterOf = i => i < 26 ? String.fromCharCode(65 + i) : '-' + (i + 1);
  const newShot = (sceneId, o = {}) => Object.assign({ id: newId(), sceneId, title: '', subject: '', orient: 'Portrait', camera: '', lens: '', lighting: '', pose: '', wardrobe: '', props: '', hair: '', notes: '', ref: '', hero: false, status: 'Planned', must: true }, o);
  const list = H => (H && H.shots) || [];
  const find = (H, id) => list(H).find(s => s.id === id) || null;
  const ofSetup = (H, sceneId) => list(H).filter(s => s.sceneId === sceneId);
  /** '1A': the setup's number and the shot's letter within it ('?' when its setup is gone) */
  function label(H, s, scenes) { const sc = scenes.find(x => x.id === s.sceneId); return sc ? sc.num + letterOf(ofSetup(H, s.sceneId).indexOf(s)) : '?'; }
  const isMust = s => s.must !== false;

  /* ---------- filtering ---------- */
  /** a filter with anything unknown reset (a setup that no longer exists shows everything) */
  function cleanFilter(F = {}, scenes = []) {
    return { setup: scenes.some(s => s.id === F.setup) ? F.setup : '', status: STATUS.includes(F.status) ? F.status : '', hero: !!F.hero, q: typeof F.q === 'string' ? F.q : '' };
  }
  /** the search looks through the shot's short text fields */
  const matches = (s, q) => !q || JSON.stringify(Object.values(s).filter(v => typeof v === 'string' && v.length < 400)).toLowerCase().includes(q.toLowerCase());
  /** shots passing the filter F and the tag filter (passTags(shot) → bool) */
  const visible = (H, F, passTags = () => true) => list(H).filter(s => passTags(s) && (!F.setup || s.sceneId === F.setup) && (!F.status || s.status === F.status) && (!F.hero || s.hero) && matches(s, F.q));
  /** the list view: one group per setup → [{ scene, count, shots }]; a setup with nothing shown is left out while a status, hero or search filter is on */
  function groups(H, scenes, F, passTags) {
    const vis = new Set(visible(H, F, passTags)), narrowed = !!(F.status || F.hero || F.q);
    return scenes.filter(sc => !F.setup || sc.id === F.setup).map(sc => { const mine = ofSetup(H, sc.id); return { scene: sc, count: mine.length, shots: mine.filter(s => vis.has(s)) }; }).filter(g => g.shots.length || !narrowed);
  }
  /** the status board: one column per status */
  function board(H, F, passTags) { const vis = visible(H, F, passTags); return STATUS.map(st => ({ status: st, tone: TONE[st], shots: vis.filter(s => s.status === st) })); }

  /** coverage of shots whose setup still exists */
  function stats(H, scenes) {
    const all = list(H).filter(s => scenes.some(x => x.id === s.sceneId)), must = all.filter(isMust);
    const counts = STATUS.map(st => [st, all.filter(s => s.status === st).length]);
    return { total: all.length, hero: all.filter(s => s.hero).length, must: must.length, captured: must.filter(s => CAPTURED.includes(s.status)).length, counts };
  }
  function statsText(S) { return [`${S.total} shots`, `${S.hero} hero`, `${S.captured}/${S.must} must-haves captured`, ...S.counts.filter(c => c[1]).map(([st, n]) => `${n} ${st.toLowerCase()}`)].join(' · '); }

  /* ---------- editing ---------- */
  /** add n shots to a setup, each carrying the look of the shot before → the last one added */
  function add(H, sceneId, n = 1) {
    H.shots = H.shots || []; let s = null;
    for (let i = 0; i < n; i++) { const last = ofSetup(H, sceneId).pop(); s = newShot(sceneId, last ? Object.fromEntries(CARRY.map(k => [k, last[k]])) : {}); H.shots.push(s); }
    return s;
  }
  function update(s, k, v) {
    if (TEXT.includes(k)) { s[k] = String(v ?? ''); return true; }
    if (k === 'status') { if (!STATUS.includes(v)) return false; s.status = v; return true; }
    if (k === 'orient') { if (!ORIENT.includes(v)) return false; s.orient = v; return true; }
    if (k === 'hero' || k === 'must') { s[k] = !!v; return true; }
    if (k === 'ref') { s.ref = String(v || ''); return true; }
    return false;
  }
  /** every shot of a setup to one status → how many changed */
  function setAll(H, sceneId, status) { if (!STATUS.includes(status)) return 0; let n = 0; ofSetup(H, sceneId).forEach(s => { if (s.status !== status) { s.status = status; n++; } }); return n; }
  /** a copy right after the shot, back to Planned and not hero → the copy */
  function duplicate(H, id) { const s = find(H, id); if (!s) return null; const c = { ...s, id: newId(), status: 'Planned', hero: false, tags: [...(s.tags || [])] }; H.shots.splice(H.shots.indexOf(s) + 1, 0, c); return c; }
  /** delete a shot; selects linked to it are unlinked */
  function remove(H, id) { const n = list(H).length; H.shots = list(H).filter(s => s.id !== id); if (H.shots.length === n) return false; SelectsModel.unlinkMissing(H); return true; }

  /* ---------- export ---------- */
  /** table rows; tagNames(shot) → 'Hero, Detail' */
  const rows = (H, scenes, shots, tagNames = () => '') => shots.map(s => [label(H, s, scenes), (scenes.find(x => x.id === s.sceneId) || {}).label || '', s.title, s.subject, s.orient, [s.camera, s.lens].filter(Boolean).join(' · '), s.lighting, s.wardrobe, s.props, s.hair, s.hero ? '★' : '', s.status, s.notes, tagNames(s)]);
  const forPrint = r => r.filter((_, i) => !PRINT_DROP.includes(i));

  return { STATUS, TONE, ORIENT, CAPTURED, TEXT, CARRY, HEAD, blankFilter, letterOf, newShot, list, find, ofSetup, label, isMust, cleanFilter, matches, visible, groups, board, stats, statsText, add, update, setAll, duplicate, remove, rows, forPrint };
})();
