'use strict';
/* ===================================================================
   Corkboard — index cards for every scene. Drag to reorder the script.
   =================================================================== */
const STRUCTURES = {
  three: { label: 'Three-act', beats: [['Opening image', .01], ['Inciting incident', .12], ['End of Act 1', .25], ['Midpoint', .5], ['End of Act 2', .75], ['Climax', .9], ['Resolution', .98]] },
  cat: { label: 'Save the Cat (15 beats)', beats: [['Opening image', .01], ['Theme stated', .05], ['Set-up', .08], ['Catalyst', .1], ['Debate', .15], ['Break into 2', .2], ['B story', .22], ['Fun & games', .3], ['Midpoint', .5], ['Bad guys close in', .6], ['All is lost', .75], ['Dark night of the soul', .8], ['Break into 3', .85], ['Finale', .93], ['Final image', .99]] },
  hero: { label: 'Hero’s journey', beats: [['Ordinary world', .05], ['Call to adventure', .1], ['Refusal', .14], ['Meeting the mentor', .18], ['Crossing the threshold', .25], ['Tests, allies, enemies', .38], ['Approach', .5], ['The ordeal', .6], ['The reward', .7], ['The road back', .78], ['Resurrection', .9], ['Return with the elixir', .98]] },
  seq: { label: 'Eight sequences', beats: [['Seq 1 — status quo', .06], ['Seq 2 — predicament', .19], ['Seq 3 — lock-in', .31], ['Seq 4 — first culmination', .44], ['Seq 5 — second culmination', .56], ['Seq 6 — all is lost', .69], ['Seq 7 — the push', .81], ['Seq 8 — resolution', .94]] },
};
const CARD_COLORS = ['', '#e5484d', '#f76b15', '#ca8a04', '#30a46c', '#0091ff', '#6e56cf', '#d6409f'];

Views.cards = function (root) {
  const P = Store.P; let dragId = null;
  const grid = h('div', { class: 'cork' });
  const structSel = h('select', { class: 'inp', style: { width: 'auto' }, title: 'Overlay a story structure on your scenes', onchange: e => { P.settings.structure = e.target.value; Store.touch(); draw(); } }, h('option', { value: '' }, 'Story structure: off'), Object.entries(STRUCTURES).map(([k, v]) => h('option', { value: k, selected: k === P.settings.structure }, v.label)));
  const filterSel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: () => draw() }, h('option', { value: '' }, 'All colours'), CARD_COLORS.filter(Boolean).map((c, i) => h('option', { value: c }, 'Colour ' + (i + 1))));
  root.parentElement.classList.remove('noscroll');
  root.append(h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: () => addSceneAfter(null) }, icon('plus', 15), 'Add scene'), filterSel, structSel, h('span', { class: 'grow' }),
    h('span', { class: 'small muted' }, 'Drag a card by its grip to reorder the scenes in your script. Colour-code cards to track threads, locations or storylines.')), grid);

  function blockOf(id) { return P.blocks.find(b => b.id === id); }
  function addSceneAfter(s) {
    const nb = { id: uid(), type: 'scene', text: '' }, na = { id: uid(), type: DEFAULT_TYPE[P.mode], text: '' };
    if (P.settings.rev) { nb.rev = na.rev = P.settings.rev; }
    if (s) P.blocks.splice(s.end, 0, nb, na); else P.blocks.push(nb, na);
    if (P.settings.sceneNumLock) assignNewSceneNumbers(P);
    Store.touch(); draw(); setTimeout(() => { const t = $(`[data-sid="${nb.id}"] .heading`, grid); t && t.focus(); }, 30);
  }
  async function deleteScene(s) {
    const n = sceneDataCount(P, s.id);
    if (!(await confirmBox(`Delete scene ${s.num} “${s.label}” from the script?${n ? ` Its ${n} linked shot/tag/frame/schedule item${n > 1 ? 's' : ''} will be removed too.` : ''} This can't be undone from here.`, 'Delete scene'))) return;
    P.blocks.splice(s.idx, s.end - s.idx); if (!P.blocks.length) P.blocks.push({ id: uid(), type: 'scene', text: '' });
    purgeOrphans(P); draw();
  }
  function draw() {
    const scenes = getScenes(P), f = filterSel.value; grid.innerHTML = '';
    const pg = paginate(P), total = pg.count, struct = STRUCTURES[P.settings.structure];
    const span = s => ({ a: pg.blockPage[s.idx] + 1, b: pg.blockPage[Math.max(s.idx, s.end - 1)] + 1 });
    const beatsFor = s => { if (!struct) return []; const sp = span(s); return struct.beats.filter(([, pc]) => { const t = Math.max(1, Math.round(pc * total)); return t >= sp.a && t <= sp.b; }); };
    if (struct) grid.append(h('div', { class: 'struct' }, h('div', { class: 'small muted', style: { marginBottom: '6px' } }, `${struct.label} — markers show where each beat should land in a ${total}-page script; the card below it shows where it actually lands.`),
      h('div', { class: 'strack' }, scenes.map(s => { const sp = span(s); return h('i', { class: 'sseg', title: `Scene ${s.num}: pp ${sp.a}–${sp.b}`, style: { left: ((sp.a - 1) / total * 100) + '%', width: Math.max(.4, (sp.b - sp.a + 1) / total * 100) + '%', background: s.color || 'var(--surface3)' } }); }),
        struct.beats.map(([n, pc]) => h('b', { class: 'smark', title: `${n} — target p.${Math.max(1, Math.round(pc * total))}`, style: { left: (pc * 100) + '%' } }, h('span', {}, n))))));
    if (!scenes.length) grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, h('h3', {}, 'No scenes yet'), h('p', {}, 'Add your first scene card, or write in the Script view.')));
    let lastAct = null;
    scenes.filter(s => !f || s.color === f).forEach(s => {
      if (s.act && s.act !== lastAct) grid.append(h('div', { class: 'actsep' }, s.act)); lastAct = s.act;
      const meta = P.sceneMeta[s.id] = P.sceneMeta[s.id] || {}, blk = blockOf(s.id);
      const shots = P.shots.filter(x => x.sceneId === s.id).length;
      const card = h('div', { class: 'icard', 'data-sid': s.id, style: { '--cc': s.color || '' },
        ondragstart: e => { dragId = s.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); setTimeout(() => card.classList.add('dragging'), 0); },
        ondragend: () => { card.draggable = false; card.classList.remove('dragging'); $$('.icard.over-l,.icard.over-r').forEach(c => c.classList.remove('over-l', 'over-r')); },
        ondragover: e => { if (!dragId) return; e.preventDefault(); const r = card.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2; card.classList.toggle('over-r', right); card.classList.toggle('over-l', !right); },
        ondragleave: () => card.classList.remove('over-l', 'over-r'),
        ondrop: e => { e.preventDefault(); const r = card.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2; card.classList.remove('over-l', 'over-r'); if (moveSceneBlocks(P, dragId, s.id, after)) { Store.touch(); draw(); toast('Scene moved in the script'); } dragId = null; } },
        h('div', { class: 'hd' }, h('span', { class: 'n' }, s.num),
          h('textarea', { class: 'auto heading', rows: 1, placeholder: 'INT. LOCATION - DAY', value: blk.text, oninput: e => { blk.text = e.target.value.toUpperCase(); if (e.target.value !== blk.text) e.target.value = blk.text; autosize(e.target); Store.touch(); } })),
        h('div', { class: 'beats' }, h('span', { class: 'small muted' }, (() => { const sp = span(s); return sp.a === sp.b ? `p.${sp.a}` : `pp.${sp.a}–${sp.b}`; })()), beatsFor(s).map(([n]) => h('span', { class: 'beat' }, '★ ' + n))),
        h('textarea', { class: 'auto', rows: 3, placeholder: 'What happens in this scene…', value: meta.synopsis || '', oninput: e => { meta.synopsis = e.target.value; autosize(e.target); Store.touch(); } }),
        h('div', { class: 'swatches' }, CARD_COLORS.map(c => h('button', { class: c === (s.color || '') ? 'on' : '', style: { background: c || 'var(--surface2)' }, title: c ? 'Colour label' : 'No colour', 'aria-label': 'colour', onclick: () => { if (c) meta.color = c; else delete meta.color; Store.touch(); draw(); } }))),
        h('div', { class: 'foot', title: 'Drag to reorder', onmousedown: () => { card.draggable = true; }, onmouseup: () => { card.draggable = false; } },
          icon('grid', 14), h('span', {}, `${fmtEighths(s.eighths)} pg · ${s.chars.size} chars${shots ? ` · ${shots} shots` : ''}`), h('span', { class: 'grow' }),
          h('button', { class: 'icon-btn', style: { width: '26px', height: '26px' }, title: 'Open in script', onmousedown: e => e.stopPropagation(), onclick: () => { UI.scene = s.id; location.hash = `#/p/${P.id}/script`; } }, icon('pen', 14)),
          h('button', { class: 'icon-btn', style: { width: '26px', height: '26px' }, title: 'Add a scene after this one', onmousedown: e => e.stopPropagation(), onclick: () => addSceneAfter(s) }, icon('plus', 14)),
          h('button', { class: 'icon-btn danger', style: { width: '26px', height: '26px' }, title: 'Delete scene', onmousedown: e => e.stopPropagation(), onclick: () => deleteScene(s) }, icon('trash', 14))));
      grid.append(card);
    });
    autosizeAll(grid);
  }
  draw();
};
