'use strict';
/* ===================================================================
   Corkboard — MODEL
   An index card per scene: the heading (the scene's line in the
   script), a synopsis and a colour label (P.sceneMeta[id]), plus an
   optional story-structure overlay (P.settings.structure) showing where
   each beat should land. Pure functions: no DOM, no Store, no UI state.
   See js/mvvm.js.
   =================================================================== */

const CardsModel = (() => {
  const STRUCTURES = {
    three: { label: 'Three-act', beats: [['Opening image', .01], ['Inciting incident', .12], ['End of Act 1', .25], ['Midpoint', .5], ['End of Act 2', .75], ['Climax', .9], ['Resolution', .98]] },
    cat: { label: 'Save the Cat (15 beats)', beats: [['Opening image', .01], ['Theme stated', .05], ['Set-up', .08], ['Catalyst', .1], ['Debate', .15], ['Break into 2', .2], ['B story', .22], ['Fun & games', .3], ['Midpoint', .5], ['Bad guys close in', .6], ['All is lost', .75], ['Dark night of the soul', .8], ['Break into 3', .85], ['Finale', .93], ['Final image', .99]] },
    hero: { label: 'Hero’s journey', beats: [['Ordinary world', .05], ['Call to adventure', .1], ['Refusal', .14], ['Meeting the mentor', .18], ['Crossing the threshold', .25], ['Tests, allies, enemies', .38], ['Approach', .5], ['The ordeal', .6], ['The reward', .7], ['The road back', .78], ['Resurrection', .9], ['Return with the elixir', .98]] },
    seq: { label: 'Eight sequences', beats: [['Seq 1 — status quo', .06], ['Seq 2 — predicament', .19], ['Seq 3 — lock-in', .31], ['Seq 4 — first culmination', .44], ['Seq 5 — second culmination', .56], ['Seq 6 — all is lost', .69], ['Seq 7 — the push', .81], ['Seq 8 — resolution', .94]] },
  };
  /** '' = no colour */
  const COLORS = ['', '#e5484d', '#f76b15', '#ca8a04', '#30a46c', '#0091ff', '#6e56cf', '#d6409f'];

  const meta = (P, id) => { P.sceneMeta = P.sceneMeta || {}; return P.sceneMeta[id] = P.sceneMeta[id] || {}; };
  const structure = P => STRUCTURES[(P.settings || {}).structure] || null;
  function setStructure(P, k) { if (k && !STRUCTURES[k]) return false; P.settings.structure = k || ''; return true; }

  /* ---------- a card ---------- */
  /** the heading is the scene's own line in the script: capitals, marked with the revision being tracked */
  function setHeading(P, id, v) { const b = ScriptModel.find(P, id); if (!b || b.type !== 'scene') return null; b.text = String(v).toUpperCase(); ScriptModel.markRev(P, b); return b.text; }
  function setSynopsis(P, id, v) { meta(P, id).synopsis = String(v ?? ''); return true; }
  function setColor(P, id, c) { if (!COLORS.includes(c || '')) return false; const m = meta(P, id); if (c) m.color = c; else delete m.color; return true; }
  /** a new scene (heading + an empty line) at block index `at` (default: the end) → the heading */
  function addScene(P, at) {
    const h = ScriptModel.newBlock(P, 'scene'), line = ScriptModel.newBlock(P, ScriptModel.defType(P.mode));
    P.blocks.splice(at == null ? P.blocks.length : at, 0, h, line);
    if (P.settings.sceneNumLock) ScriptModel.assignNumbers(P);
    return h;
  }
  /** remove a scene's lines [idx, end); a script is never left empty */
  function removeScene(P, s) { P.blocks.splice(s.idx, s.end - s.idx); if (!P.blocks.length) P.blocks.push({ id: newId(), type: 'scene', text: '' }); return true; }

  /* ---------- pages and the structure overlay ---------- */
  /** the pages a scene covers, from paginate()'s blockPage → { a, b } (1-based) */
  const span = (blockPage, s) => ({ a: blockPage[s.idx] + 1, b: blockPage[Math.max(s.idx, s.end - 1)] + 1 });
  const pages = sp => sp.a === sp.b ? `p.${sp.a}` : `pp.${sp.a}–${sp.b}`;
  const target = (pc, total) => Math.max(1, Math.round(pc * total));
  /** the structure's beats that land inside these pages */
  const beatsIn = (struct, total, sp) => struct ? struct.beats.filter(([, pc]) => { const t = target(pc, total); return t >= sp.a && t <= sp.b; }).map(b => b[0]) : [];
  /** the overlay's track: a segment per scene and a marker per beat, as percentages */
  function track(struct, total, scenes, blockPage) {
    if (!struct) return null;
    return {
      segs: scenes.map(s => { const sp = span(blockPage, s); return { id: s.id, num: s.num, a: sp.a, b: sp.b, color: s.color || '', left: (sp.a - 1) / total * 100, width: Math.max(.4, (sp.b - sp.a + 1) / total * 100) }; }),
      marks: struct.beats.map(([name, pc]) => ({ name, page: target(pc, total), left: pc * 100 })),
    };
  }
  /** the cards to show, with an act separator before each new act: [{ act } | { scene }] */
  function rows(scenes, color) {
    const out = []; let lastAct = null;
    scenes.filter(s => !color || s.color === color).forEach(s => { if (s.act && s.act !== lastAct) out.push({ act: s.act, id: s.id }); lastAct = s.act; out.push({ scene: s }); });
    return out;
  }

  return { STRUCTURES, COLORS, meta, structure, setStructure, setHeading, setSynopsis, setColor, addScene, removeScene, span, pages, target, beatsIn, track, rows };
})();
