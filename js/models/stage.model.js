'use strict';
/* ===================================================================
   Blocking & cues — MODEL
   Blocking plans (P.stage.plans): { id, name, sceneId, w, d, unit,
   snap, cur, items: [{ id, kind, label, color, fov? }], frames:
   [{ id, name, notes, pos: { itemId: { x, y, r } } }] } drawn on a
   1000-unit-wide diagram; and the cue sheet (P.cues): { id, cue, type,
   sceneId, at, desc, note, src?, anchor? }. The deck geometry, item
   placement, frames, cues, where each cue sits in the script and the
   calling script's standbys. Pure functions: no DOM, no Store, no UI
   state; the scenes (getScenes) are passed in. See js/mvvm.js.
   =================================================================== */

const StageModel = (() => {
  const COLORS = ['#e5484d', '#2468d8', '#1e8e54', '#e8830c', '#7a45c9', '#d6409f', '#12a594', '#8a6d3b'];
  const GREY = '#8a8f98';
  const KINDS = {
    actor: { label: 'Actor', w: 24 }, chair: { label: 'Chair' }, table: { label: 'Table' }, sofa: { label: 'Sofa' }, bed: { label: 'Bed' },
    door: { label: 'Door' }, platform: { label: 'Platform' }, prop: { label: 'Prop' }, text: { label: 'Label' },
    camera: { label: 'Camera' }, light: { label: 'Light' }, boom: { label: 'Boom mic' },
    strobe: { label: 'Strobe / head' }, softbox: { label: 'Softbox' }, umbrella: { label: 'Umbrella' }, reflector: { label: 'Reflector' }, backdrop: { label: 'Backdrop' }, flag: { label: 'Flag / V-flat' }, mark: { label: 'Talent mark' },
  };
  const PHOTO_ONLY = new Set(['strobe', 'softbox', 'umbrella', 'reflector', 'backdrop', 'flag', 'mark']), STAGE_ONLY = new Set(['boom', 'platform', 'bed', 'door', 'sofa']);
  /** kinds that are named as they are added */
  const ASK_LABEL = new Set(['actor', 'text', 'prop', 'strobe', 'softbox', 'umbrella', 'reflector', 'flag', 'mark']);
  const CUE_TYPES = ['LX', 'SND', 'VID', 'FLY', 'SET', 'FX', 'OTHER'];
  const CUE_FIELDS = ['cue', 'type', 'sceneId', 'at', 'desc', 'note'];
  const UNITS = ['m', 'ft'];
  const CENTRE = { x: 500, y: 300 };
  const clampN = (n, a, b) => Math.min(b, Math.max(a, n));
  const clone = x => JSON.parse(JSON.stringify(x));

  /** the kinds offered for a project mode: [key, { label }] */
  const kindsFor = mode => Object.entries(KINDS).filter(([k]) => mode === 'photo' ? !STAGE_ONLY.has(k) : !PHOTO_ONLY.has(k));
  const initials = s => (s || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  /** the camera's field of view as a focal length on Super 35 */
  const focal = fov => Math.round(18 / Math.tan((fov || 40) * Math.PI / 360));

  /* ---------- the deck ---------- */
  /** stage size → the drawn deck, its grid step and scale */
  function deck(plan) {
    const w = (plan && +plan.w) || 12, d = (plan && +plan.d) || 8, sc = Math.min(920 / w, 540 / d), W = w * sc, Hh = d * sc;
    let step = 1; for (const st of [1, 2, 5, 10, 20, 50]) { step = st; if (st * sc >= 34) break; }
    return { x: 500 - W / 2, y: 24, w: W, h: Hh, s: sc, wU: w, dU: d, unit: (plan && plan.unit) || 'm', step };
  }
  /** "1.2 m stage right of centre · 3.0 m upstage of the edge" */
  function posText(plan, pos) { const D = deck(plan), x = (pos.x - (D.x + D.w / 2)) / D.s, y = (D.y + D.h - pos.y) / D.s; return `${Math.abs(x).toFixed(1)} ${D.unit} ${x < 0 ? 'stage right' : 'stage left'} of centre · ${y.toFixed(1)} ${D.unit} upstage of the edge`; }
  /** a dragged position kept on the deck (and on a 10-unit grid when snapping) */
  function place(plan, x, y) {
    const D = deck(plan); x = clampN(x, D.x + 6, D.x + D.w - 6); y = clampN(y, D.y + 6, D.y + D.h - 6);
    if (plan.snap) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
    return { x, y };
  }

  /* ---------- plans ---------- */
  const plans = P => ((P.stage = P.stage || {}).plans = P.stage.plans || []);
  const findPlan = (P, id) => plans(P).find(p => p.id === id) || null;
  function addPlan(P) { const p = { id: newId(), name: 'Plan ' + (plans(P).length + 1), sceneId: '', items: [], frames: [{ id: newId(), name: 'Opening', notes: '', pos: {} }], cur: 0, snap: true }; plans(P).push(p); return p; }
  function removePlan(P, id) { const n = plans(P).length; P.stage.plans = plans(P).filter(p => p.id !== id); return P.stage.plans.length < n; }
  function setPlan(plan, k, v) {
    if (k === 'name' || k === 'sceneId') plan[k] = String(v ?? '');
    else if (k === 'snap') plan.snap = !!v;
    else if (k === 'w') plan.w = Math.max(2, +v || 12);
    else if (k === 'd') plan.d = Math.max(2, +v || 8);
    else if (k === 'unit') { if (!UNITS.includes(v)) return false; plan.unit = v; }
    else return false;
    return true;
  }
  const frame = plan => plan.frames[clampN(plan.cur || 0, 0, plan.frames.length - 1)];
  const posOf = (plan, id) => frame(plan).pos[id] || CENTRE;

  /* ---------- items ---------- */
  /** add an item on every frame, spread out from the centre → the item */
  function addItem(plan, kind, label = '', color) {
    if (!KINDS[kind]) return null;
    const it = { id: newId(), kind, label: label || '', color: color || (kind === 'actor' ? COLORS[plan.items.filter(i => i.kind === 'actor').length % COLORS.length] : GREY) };
    plan.items.push(it); const n = plan.items.length;
    plan.frames.forEach(f => f.pos[it.id] = { x: 500 + ((n * 37) % 160) - 80, y: 300 + ((n * 53) % 120) - 60, r: 0 });
    return it;
  }
  /** an actor for each name not on the plan yet, in a row along the front → how many */
  function addActors(plan, names) {
    const have = new Set(plan.items.filter(i => i.kind === 'actor').map(i => i.label.toUpperCase())); let n = 0;
    names.forEach(c => { if (have.has(c)) return; const it = { id: newId(), kind: 'actor', label: c, color: COLORS[plan.items.length % COLORS.length] }; plan.items.push(it); plan.frames.forEach(f => f.pos[it.id] = { x: 120 + (n % 8) * 100, y: 500, r: 0 }); have.add(c); n++; });
    return n;
  }
  function setItem(plan, id, k, v) {
    const it = plan.items.find(i => i.id === id); if (!it) return false;
    if (k === 'label') it.label = String(v ?? '');
    else if (k === 'color') { if (!COLORS.includes(v) && v !== GREY) return false; it.color = v; }
    else if (k === 'fov') it.fov = clampN(+v || 40, 10, 120);
    else return false;
    return true;
  }
  function removeItem(plan, id) { const n = plan.items.length; plan.items = plan.items.filter(x => x.id !== id); plan.frames.forEach(f => delete f.pos[id]); return plan.items.length < n; }
  /** move an item in the current frame (kept on the deck) → its position */
  function moveItem(plan, id, x, y) { const f = frame(plan), pos = f.pos[id] = f.pos[id] || { ...CENTRE, r: 0 }; Object.assign(pos, place(plan, x, y)); return pos; }
  function rotate(plan, id, deg) { const f = frame(plan), pos = f.pos[id]; if (!pos) return false; pos.r = (pos.r || 0) + deg; return true; }

  /* ---------- frames ---------- */
  /** copy the current positions as a new frame after it, and go there */
  function addFrame(plan) { const nf = { id: newId(), name: 'Frame ' + (plan.frames.length + 1), notes: '', pos: clone(frame(plan).pos) }; plan.frames.splice((plan.cur || 0) + 1, 0, nf); plan.cur = (plan.cur || 0) + 1; return nf; }
  function removeFrame(plan, i) { if (plan.frames.length < 2 || !plan.frames[i]) return false; plan.frames.splice(i, 1); plan.cur = clampN(plan.cur || 0, 0, plan.frames.length - 1); return true; }
  function goFrame(plan, i) { plan.cur = clampN(i, 0, plan.frames.length - 1); return plan.cur; }
  function setFrame(plan, k, v) { if (k !== 'name' && k !== 'notes') return false; frame(plan)[k] = String(v ?? ''); return true; }

  /* ---------- the cue sheet ---------- */
  const cues = P => (P.cues = P.cues || []);
  const sceneNum = (scenes, id) => (scenes.find(s => s.id === id) || {}).num || '';
  /** a new cue in the last scene → the cue */
  function addCue(P, scenes) { const c = { id: newId(), cue: '', type: 'LX', sceneId: (scenes[scenes.length - 1] || {}).id || '', at: '', desc: '', note: '' }; cues(P).push(c); return c; }
  function setCue(P, id, k, v) { const c = cues(P).find(x => x.id === id); if (!c || !CUE_FIELDS.includes(k)) return false; if (k === 'type' && !CUE_TYPES.includes(v)) return false; c[k] = String(v ?? ''); return true; }
  function moveCue(P, id, d) { const L = cues(P), i = L.findIndex(c => c.id === id), j = i + d; if (i < 0 || j < 0 || j >= L.length) return false; [L[i], L[j]] = [L[j], L[i]]; return true; }
  function removeCue(P, id) { const n = cues(P).length; P.cues = cues(P).filter(c => c.id !== id); return P.cues.length < n; }
  /** every "cue" line of the script not imported yet becomes a cue ("LX 4 — Fade to black") → how many */
  function importCues(P) {
    let n = 0, scene = '';
    (P.blocks || []).forEach(b => {
      if (b.type === 'scene') scene = b.id;
      if (b.type === 'cue' && b.text.trim() && !cues(P).some(c => c.src === b.id)) {
        const [a, ...r] = b.text.split(/\s+[-—:]\s+/), t = (a.match(/^[A-Z]+/) || ['OTHER'])[0];
        cues(P).push({ id: newId(), src: b.id, cue: a, type: CUE_TYPES.includes(t) ? t : 'OTHER', sceneId: scene, at: '', desc: r.join(' — ') || '', note: '' }); n++;
      }
    });
    return n;
  }
  /** pin a cue to a line (its trigger text filled from the line when empty); plain(text) strips formatting */
  function pin(P, id, blockId, plain) { const c = cues(P).find(x => x.id === id), b = (P.blocks || []).find(x => x.id === blockId); if (!c || !b) return false; c.anchor = b.id; if (!c.at) c.at = plain(b.text).slice(0, 60); return true; }
  function unpin(P, id) { const c = cues(P).find(x => x.id === id); if (!c || !c.anchor) return false; delete c.anchor; return true; }
  const csvRows = (P, scenes) => [['Cue', 'Type', 'Scene', 'Trigger', 'Description', 'Notes'], ...cues(P).map(c => [c.cue, c.type, sceneNum(scenes, c.sceneId), c.at, c.desc, c.note])];
  const printRows = (P, scenes) => cues(P).map(c => [c.cue, c.type, sceneNum(scenes, c.sceneId), c.at, c.desc, c.note]);

  /** where a cue lives in the script: its pin, the script's own cue line, or the first line containing its trigger text → block id */
  function anchor(P, c, scenes, plain) {
    const B = P.blocks || [];
    if (c.anchor && B.some(b => b.id === c.anchor)) return c.anchor;
    if (c.src && B.some(b => b.id === c.src)) return c.src;
    if (c.at && c.at.trim()) {
      const q = c.at.toLowerCase().replace(/[“”"]/g, '').trim(), sc = c.sceneId && scenes.find(s => s.id === c.sceneId), from = sc ? sc.idx : 0, to = sc ? sc.end : B.length;
      const b = B.slice(from, to).find(b => plain(b.text).toLowerCase().includes(q)) || B.find(b => plain(b.text).toLowerCase().includes(q)); if (b) return b.id;
    }
    return null;
  }
  /** the lines a cue can be pinned to (its scene's, else the whole script) */
  function pinChoices(P, c, scenes) { const sc = scenes.find(x => x.id === c.sceneId), B = P.blocks || []; return sc ? B.slice(sc.idx, sc.end) : B.slice(); }
  /**
   * the calling script: GO on each cue's line and STANDBY `lead` lines earlier (not before its scene)
   * → { go: Map(blockId → cues), standby: Map(blockId → cues), unpinned }
   */
  function calling(P, scenes, lead, plain) {
    const B = P.blocks || [], go = new Map(), standby = new Map(); let unpinned = 0;
    const put = (m, k, c) => (m.get(k) || m.set(k, []).get(k)).push(c);
    cues(P).forEach(c => {
      const id = anchor(P, c, scenes, plain); if (!id) { unpinned++; return; }
      const i = B.findIndex(b => b.id === id); put(go, id, c);
      let j = Math.max(0, i - lead); const sc = scenes.find(s => s.idx <= i && s.end > i); if (sc) j = Math.max(sc.idx, j);
      const sid = B[j].id; if (sid !== id) put(standby, sid, c);
    });
    return { go, standby, unpinned };
  }

  return { COLORS, GREY, KINDS, PHOTO_ONLY, STAGE_ONLY, ASK_LABEL, CUE_TYPES, CUE_FIELDS, UNITS, CENTRE, kindsFor, initials, focal, deck, posText, place, plans, findPlan, addPlan, removePlan, setPlan, frame, posOf, addItem, addActors, setItem, removeItem, moveItem, rotate, addFrame, removeFrame, goFrame, setFrame, cues, addCue, setCue, moveCue, removeCue, importCues, pin, unpin, csvRows, printRows, anchor, pinChoices, calling };
})();
