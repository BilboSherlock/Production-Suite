'use strict';
/* ===================================================================
   Locations — VIEW. One card per location: photo, address, contact,
   permit, cost, notes and the scenes that use it.
   Rules: js/models/locations.model.js; commands: js/viewmodels/locations.vm.js.
   =================================================================== */
Views.locations = function (root) {
  const vm = new LocationsVM(), grid = h('div', { class: 'grid-cards' });
  root.append(h('div', { class: 'page' }, h('div', { class: 'page-h' }, h('h2', {}, 'Locations'), h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: fromScript }, icon('wand', 15), 'Add locations from script'),
    h('button', { class: 'btn primary', onclick: add }, icon('plus', 15), 'Add location')), grid));

  function fromScript() { const n = vm.fromScript(); toast(n ? `Added ${n} location${n > 1 ? 's' : ''}` : 'No new locations in the script', !n); }
  function add() { const l = vm.add(); setTimeout(() => { const i = $(`[data-key="${l.id}"] input`, grid); i && i.focus(); }, 30); }
  async function photo(l) { const f = await pickFile('image/*'); if (f) vm.update(l.id, 'photo', await readImage(f, 800)); }
  async function remove(l) { if (!vm.needsConfirm(l) || await confirmBox(`Delete “${l.name}”?`)) vm.remove(l.id); }
  /* text fields save quietly; the name also changes which scenes match, so it redraws */
  const fld = (l, k, label, o = {}) => h('div', { class: 'field', style: { marginBottom: '8px' } }, h('label', { class: 'lbl' }, label),
    h(o.area ? 'textarea' : 'input', { class: 'inp', rows: 2, value: l[k] || '', placeholder: o.ph || '', oninput: e => vm.update(l.id, k, e.target.value, { quiet: k !== 'name' }) }));

  function card({ l, used }) {
    return h('div', { class: 'card', 'data-key': l.id, style: { overflow: 'hidden' } },
      h('div', { class: 'loc-photo', style: l.photo ? { backgroundImage: `url(${l.photo})` } : {}, title: 'Click to add a photo', onclick: () => photo(l) }, l.photo ? '' : h('span', { class: 'row' }, icon('image'), 'Add photo')),
      h('div', { style: { padding: '14px' } }, fld(l, 'name', 'Name', { ph: 'e.g. RIVERSIDE CINEMA' }), fld(l, 'address', 'Address', { ph: 'Street, city' }),
        h('div', { class: 'row', style: { gap: '8px' } }, h('div', { class: 'grow' }, fld(l, 'contact', 'Contact')), h('div', { class: 'grow' }, fld(l, 'phone', 'Phone'))),
        h('div', { class: 'row', style: { gap: '8px' } }, h('div', { class: 'grow' }, h('label', { class: 'lbl' }, 'Permit'), h('select', { class: 'inp', onchange: e => vm.update(l.id, 'permit', e.target.value) }, vm.permits.map(o => h('option', { selected: o === l.permit }, o)))), h('div', { class: 'grow' }, fld(l, 'cost', 'Daily cost'))),
        h('div', { style: { height: '8px' } }), fld(l, 'notes', 'Notes', { area: true, ph: 'Parking, power, access, sound issues…' }),
        h('div', { class: 'row', style: { marginTop: '4px' } }, used.length ? h('span', { class: 'pill accent', 'data-key': 'used' }, 'Scenes ' + used.join(', ')) : h('span', { class: 'small muted', 'data-key': 'unused' }, 'Not used in any scene'), h('span', { class: 'grow' }),
          ibtn('trash', 'Delete location', () => remove(l), 'danger'))));
  }
  return bindView(vm, () => {
    const cards = vm.cards;
    morph(grid, cards.length ? cards.map(card) : h('div', { class: 'empty', 'data-key': 'empty', style: { gridColumn: '1/-1' } }, h('h3', {}, 'No locations yet'), h('p', {}, 'Track addresses, permits, contacts and photos for every place you shoot or stage.')));
  });
};
