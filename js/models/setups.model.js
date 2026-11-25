'use strict';
/* ===================================================================
   Setups & looks — MODEL
   A photo project keeps its setups as the script's scene blocks, so
   schedule, call sheets and breakdown work unchanged. A setup is a
   heading line "Name — Location — Time" plus one notes line (action),
   with extra fields in P.sceneMeta[id] { est, synopsis, color,
   locationId }. Pure functions: no DOM, no Store, no UI state; the
   scene list (getScenes) is passed in. See js/mvvm.js.
   =================================================================== */

const SetupsModel = (() => {
  /** colour labels: [value, label] */
  const COLORS = [['', 'No colour'], ['#e5484d', 'Red'], ['#e8830c', 'Orange'], ['#ca8a04', 'Yellow'], ['#1e8e54', 'Green'], ['#2468d8', 'Blue'], ['#7a45c9', 'Purple'], ['#d6409f', 'Pink']];
  const PARTS = ['name', 'loc', 'time'];
  /** shot statuses that count as done */
  const DONE = ['Approved', 'Delivered'];
  const SEP = /\s+—\s+/;

  /** "Name — Location — Time" (a dash typed inside a part is kept apart; empty trailing parts are dropped) */
  const heading = (name, loc, time) => [name, loc, time].map(x => (x || '').replace(/\s+—\s+/g, ' - ').trim()).reduce((a, x, i, arr) => (i === 0 || x || arr.slice(i + 1).some(Boolean)) ? a.concat(x) : a, []).join(' — ');
  /** a heading block → { name, loc, time } */
  function parts(b) { const pr = ((b && b.text) || '').split(SEP); return { name: pr[0] || '', loc: pr[1] || '', time: pr[2] || '' }; }

  const meta = (P, id) => (P.sceneMeta = P.sceneMeta || {})[id] = P.sceneMeta[id] || {};
  const metaOf = (P, id) => (P.sceneMeta || {})[id] || {};
  const head = (P, s) => P.blocks[s.idx];
  /** the setup's notes line (null when it has none) */
  const notesBlock = (P, s) => P.blocks.slice(s.idx + 1, s.end).find(x => x.type === 'action') || null;
  const newBlock = (type, text = '') => ({ id: newId(), type, text });

  /* ---------- reading ---------- */
  /** what a setup card shows */
  function card(P, s) {
    const m = metaOf(P, s.id), shots = ((P.photo || {}).shots || []).filter(x => x.sceneId === s.id), nb = notesBlock(P, s);
    return {
      id: s.id, num: s.num, ...parts(head(P, s)), est: m.est || '', synopsis: m.synopsis || '', color: m.color || '', notes: nb ? nb.text : '',
      shots: shots.length, done: shots.filter(x => DONE.includes(x.status)).length, day: (P.days || []).findIndex(d => d.sceneIds.includes(s.id)),
    };
  }
  const printRows = (P, scenes) => scenes.map(s => { const c = card(P, s); return [c.num, c.name, c.loc, c.time, c.est, c.synopsis, c.shots]; });

  /* ---------- editing ---------- */
  /** a new setup ("Setup N" and an empty notes line) after scenes[at], or at the end → the heading */
  function add(P, scenes, at) {
    const h = newBlock('scene', `Setup ${P.blocks.filter(b => b.type === 'scene').length + 1}`);
    const idx = at != null && scenes[at] ? scenes[at].end : P.blocks.length;
    P.blocks.splice(idx, 0, h, newBlock('action')); return h;
  }
  /** give every setup a notes line (back to front, so an insert never shifts a setup still to come) → how many were added */
  function ensureNotes(P, scenes) { let n = 0; [...scenes].reverse().forEach(s => { if (!notesBlock(P, s)) { P.blocks.splice(s.idx + 1, 0, newBlock('action')); n++; } }); return n; }
  /** swap setup i with its neighbour (d = -1 up, +1 down) */
  function move(P, scenes, i, d) {
    const a = scenes[i], b = scenes[i + d]; if (!a || !b) return false;
    const first = d < 0 ? b : a, second = d < 0 ? a : b, c1 = P.blocks.slice(first.idx, first.end), c2 = P.blocks.slice(second.idx, second.end);
    P.blocks.splice(first.idx, c1.length + c2.length, ...c2, ...c1); return true;
  }
  /** copy a setup's lines (new ids, "(copy)" added to the name) right after it; its card fields come too → the new heading */
  function duplicate(P, s) {
    const chunk = P.blocks.slice(s.idx, s.end).map(x => ({ ...x, id: newId() })), p = parts(chunk[0]); chunk[0].text = heading(p.name + ' (copy)', p.loc, p.time);
    P.blocks.splice(s.end, 0, ...chunk);
    const m = metaOf(P, s.id); if (Object.keys(m).length) P.sceneMeta[chunk[0].id] = JSON.parse(JSON.stringify(m));
    return chunk[0];
  }
  /** delete a setup's lines (its shots, tags and schedule entries stay until cleaned up) */
  function remove(P, s) { P.blocks.splice(s.idx, s.end - s.idx); return true; }
  /** change the name, location or time; the location links to a matching location profile */
  function setPart(P, s, k, v) {
    if (!PARTS.includes(k)) return false;
    const b = head(P, s), p = parts(b); p[k] = String(v ?? ''); b.text = heading(p.name, p.loc, p.time);
    if (k === 'loc') {
      const m = meta(P, s.id), want = p.loc.trim().toLowerCase(), L = want && (P.locations || []).find(l => (l.name || '').toLowerCase() === want);
      if (L) m.locationId = L.id; else delete m.locationId;
    }
    return true;
  }
  function setEst(P, id, v) { meta(P, id).est = v === '' || v == null ? '' : String(Math.max(0, +v || 0)); return true; }
  function setSynopsis(P, id, v) { meta(P, id).synopsis = String(v ?? ''); return true; }
  function setColor(P, id, c) { if (!COLORS.some(x => x[0] === (c || ''))) return false; const m = meta(P, id); if (c) m.color = c; else delete m.color; return true; }
  /** the notes line's text (made when missing) */
  function setNotes(P, s, v) { let nb = notesBlock(P, s); if (!nb) { nb = newBlock('action'); P.blocks.splice(s.idx + 1, 0, nb); } nb.text = String(v ?? ''); return true; }
  /** cast who could still be added: [{ value, label }] (value is the character, else the name) */
  const talentChoices = (P, cast, norm) => (P.people || []).filter(p => p.type === 'cast' && (p.character || p.name) && !cast.includes(norm(p.character || p.name))).map(p => ({ value: p.character || p.name, label: p.name || p.character }));

  return { COLORS, PARTS, DONE, heading, parts, meta, metaOf, notesBlock, card, printRows, add, ensureNotes, move, duplicate, remove, setPart, setEst, setSynopsis, setColor, setNotes, talentChoices };
})();
