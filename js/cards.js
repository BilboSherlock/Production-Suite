'use strict';
/* ===================================================================
   Corkboard — VIEW. An index card for every scene; drag to reorder the
   script. Rules: js/models/cards.model.js; screen state and commands:
   js/viewmodels/cards.vm.js.
   =================================================================== */
const STRUCTURES = CardsModel.STRUCTURES, CARD_COLORS = CardsModel.COLORS;

Views.cards = function (root) {
  const vm = new CardsVM(), P = () => vm.P;
  const grid = h('div', { class: 'cork' });
  const filterSel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setColorFilter(e.target.value) });
  const structSel = h('select', { class: 'inp', style: { width: 'auto' }, title: 'Overlay a story structure on your scenes', onchange: e => vm.setStructure(e.target.value) });
  root.parentElement.classList.remove('noscroll');
  root.append(h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: () => add(null) }, icon('plus', 15), 'Add scene'), filterSel, structSel, h('span', { class: 'grow' }),
    h('span', { class: 'small muted' }, (Device.touchOn() ? 'Press and hold a card’s bottom strip, then drag it to reorder the scenes in your script.' : 'Drag a card by its grip to reorder the scenes in your script.') + ' Colour-code cards to track threads, locations or storylines.')), grid);

  function add(afterId) {
    const b = vm.addScene(afterId);
    setTimeout(() => { const t = $(`[data-sid="${b.id}"] .heading`, grid); t && t.focus(); }, 30);
  }
  async function remove(s) {
    const n = vm.linkedCount(s.id);
    if (await confirmBox(`Delete scene ${s.num} “${s.label}” from the script?${n ? ` Its ${n} linked shot/tag/frame/schedule item${n > 1 ? 's' : ''} will be removed too.` : ''} This can't be undone from here.`, 'Delete scene')) vm.removeScene(s.id);
  }
  const small = { width: '26px', height: '26px' }, keep = e => e.stopPropagation();
  function cardEl(r) {
    const s = r.scene;
    const card = h('div', { class: 'icard', 'data-sid': s.id, 'data-key': s.id, style: { '--cc': s.color || '' } },
      h('div', { class: 'hd' }, h('span', { class: 'n' }, s.num),
        h('textarea', { class: 'auto heading', rows: 1, placeholder: 'INT. LOCATION - DAY', value: r.heading, oninput: e => { const v = vm.setHeading(s.id, e.target.value); if (v != null && v !== e.target.value) { const at = e.target.selectionStart; e.target.value = v; e.target.setSelectionRange(at, at); } autosize(e.target); } })),
      h('div', { class: 'beats' }, h('span', { class: 'small muted' }, r.pages), r.beats.map(n => h('span', { class: 'beat' }, '★ ' + n))),
      h('textarea', { class: 'auto', rows: 3, placeholder: 'What happens in this scene…', value: r.synopsis, oninput: e => { vm.setSynopsis(s.id, e.target.value); autosize(e.target); } }),
      h('div', { class: 'swatches' }, vm.colors.map(c => h('button', { class: c === (s.color || '') ? 'on' : '', style: { background: c || 'var(--surface2)' }, title: c ? 'Colour label' : 'No colour', 'aria-label': 'colour', onclick: () => vm.setColor(s.id, c) }))),
      h('div', { class: 'foot', title: 'Drag to reorder' },
        icon('grid', 14), h('span', {}, `${fmtEighths(s.eighths)} pg · ${s.chars.size} chars${r.shots ? ` · ${r.shots} shots` : ''}`), h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', style: small, title: 'Open in script', onpointerdown: keep, onclick: () => { UI.scene = s.id; location.hash = `#/p/${P().id}/script`; } }, icon('pen', 14)),
        h('button', { class: 'icon-btn', style: small, title: 'Add a scene after this one', onpointerdown: keep, onclick: () => add(s.id) }, icon('plus', 14)),
        h('button', { class: 'icon-btn danger', style: small, title: 'Delete scene', onpointerdown: keep, onclick: () => remove(s) }, icon('trash', 14))));
    /* drag by the bottom strip, so the text boxes on the card stay editable */
    return DnD.item(card, 'scene', s.id, (id, after) => { if (vm.moveScene(id, s.id, after)) toast('Scene moved in the script'); }, { edge: 'x', handle: card.querySelector('.foot') });
  }
  function draw() {
    const B = vm.board, f = vm.color, sk = vm.structureKey;
    morph(filterSel, [h('option', { value: '' }, 'All colours'), ...vm.colors.filter(Boolean).map((c, i) => h('option', { value: c, selected: c === f }, 'Colour ' + (i + 1)))]);
    morph(structSel, [h('option', { value: '' }, 'Story structure: off'), ...Object.entries(vm.structures).map(([k, v]) => h('option', { value: k, selected: k === sk }, v.label))]);
    filterSel.value = f; structSel.value = sk;
    morph(grid, [
      B.track ? h('div', { class: 'struct', 'data-key': 'struct' }, h('div', { class: 'small muted', style: { marginBottom: '6px' } }, `${B.struct.label} — markers show where each beat should land in a ${B.total}-page script; the card below it shows where it actually lands.`),
        h('div', { class: 'strack' }, B.track.segs.map(g => h('i', { class: 'sseg', title: `Scene ${g.num}: pp ${g.a}–${g.b}`, style: { left: g.left + '%', width: g.width + '%', background: g.color || 'var(--surface3)' } })),
          B.track.marks.map(m => h('b', { class: 'smark', title: `${m.name} — target p.${m.page}`, style: { left: m.left + '%' } }, h('span', {}, m.name))))) : null,
      B.empty ? h('div', { class: 'empty', 'data-key': 'empty', style: { gridColumn: '1/-1' } }, h('h3', {}, 'No scenes yet'), h('p', {}, 'Add your first scene card, or write in the Script view.')) : null,
      ...B.rows.map(r => r.act ? h('div', { class: 'actsep', 'data-key': 'act:' + r.id }, r.act) : cardEl(r))]);
    autosizeAll(grid);
  }
  return bindView(vm, draw);
};
