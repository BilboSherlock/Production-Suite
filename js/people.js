'use strict';
/* ===================================================================
   Cast & Crew, Locations, Budget
   =================================================================== */
const DEPTS = ['Direction', 'Production', 'Camera', 'Grip', 'Electric', 'Art', 'Wardrobe', 'Hair & Makeup', 'Sound', 'Stunts', 'Post', 'Stage Management', 'Lighting', 'Photography', 'Digital tech', 'Styling', 'Retouching', 'Studio', 'Client', 'Other'];

/* ---------- Locations ---------- */
Views.locations = function (root) {
  const P = Store.P; const scenes = getScenes(P); const wrap = h('div', { class: 'page' }), grid = h('div', { class: 'grid-cards' });
  root.append(wrap);
  wrap.append(h('div', { class: 'page-h' }, h('h2', {}, 'Locations'), h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: fromScript }, icon('wand', 15), 'Add locations from script'),
    h('button', { class: 'btn primary', onclick: () => { P.locations.push({ id: uid(), name: '', address: '', contact: '', phone: '', permit: 'Not needed', cost: '', notes: '', photo: '' }); Store.touch(); draw(); } }, icon('plus', 15), 'Add location')), grid);
  function fromScript() {
    const have = new Set(P.locations.map(l => l.name.toUpperCase())); let n = 0;
    scenes.forEach(s => { if (s.location && !have.has(s.location.toUpperCase())) { have.add(s.location.toUpperCase()); P.locations.push({ id: uid(), name: s.location, address: '', contact: '', phone: '', permit: 'Not needed', cost: '', notes: '', photo: '' }); n++; } });
    Store.touch(); draw(); toast(n ? `Added ${n} location${n > 1 ? 's' : ''}` : 'No new locations in the script', !n);
  }
  const fld = (l, k, label, o = {}) => h('div', { class: 'field', style: { marginBottom: '8px' } }, h('label', { class: 'lbl' }, label), h(o.area ? 'textarea' : 'input', { class: 'inp', rows: 2, value: l[k] || '', placeholder: o.ph || '', oninput: e => { l[k] = e.target.value; Store.touch(); } }));
  function draw() {
    grid.innerHTML = '';
    if (!P.locations.length) grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, h('h3', {}, 'No locations yet'), h('p', {}, 'Track addresses, permits, contacts and photos for every place you shoot or stage.')));
    P.locations.forEach(l => {
      const used = scenes.filter(s => (P.sceneMeta[s.id] || {}).locationId === l.id || (l.name && s.location && s.location.toUpperCase().includes(l.name.toUpperCase()) && !(P.sceneMeta[s.id] || {}).locationId)).map(s => s.num);
      grid.append(h('div', { class: 'card', style: { overflow: 'hidden' } },
        h('div', { class: 'loc-photo', style: l.photo ? { backgroundImage: `url(${l.photo})` } : {}, title: 'Click to add a photo', onclick: async () => { const f = await pickFile('image/*'); if (f) { l.photo = await readImage(f, 800); Store.touch(); draw(); } } }, l.photo ? '' : h('span', { class: 'row' }, icon('image'), 'Add photo')),
        h('div', { style: { padding: '14px' } }, fld(l, 'name', 'Name', { ph: 'e.g. RIVERSIDE CINEMA' }), fld(l, 'address', 'Address', { ph: 'Street, city' }),
          h('div', { class: 'row', style: { gap: '8px' } }, h('div', { class: 'grow' }, fld(l, 'contact', 'Contact')), h('div', { class: 'grow' }, fld(l, 'phone', 'Phone'))),
          h('div', { class: 'row', style: { gap: '8px' } }, h('div', { class: 'grow' }, h('label', { class: 'lbl' }, 'Permit'), h('select', { class: 'inp', onchange: e => { l.permit = e.target.value; Store.touch(); } }, ['Not needed', 'Needed', 'Applied', 'Approved'].map(o => h('option', { selected: o === l.permit }, o)))), h('div', { class: 'grow' }, fld(l, 'cost', 'Daily cost'))),
          h('div', { style: { height: '8px' } }), fld(l, 'notes', 'Notes', { area: true, ph: 'Parking, power, access, sound issues…' }),
          h('div', { class: 'row', style: { marginTop: '4px' } }, used.length ? h('span', { class: 'pill accent' }, 'Scenes ' + used.join(', ')) : h('span', { class: 'small muted' }, 'Not used in any scene'), h('span', { class: 'grow' }),
            ibtn('trash', 'Delete location', async () => { if (!l.name || await confirmBox(`Delete “${l.name}”?`)) { P.locations = P.locations.filter(x => x !== l); Store.touch(); draw(); } }, 'danger')))));
    });
  }
  draw();
};
