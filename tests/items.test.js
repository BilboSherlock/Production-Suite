'use strict';
/* Props & wardrobe — model and view-model tests */
const IM = ItemsModel;
function itemsProject() {
  const P = fakeProject({ mode: 'film', budget: [], tags: [], props: [], wardrobe: [] });
  P.props.push(IM.newItem('props', 'Film can', { id: 'p1', cost: '40', qty: 2, status: 'Acquired', sceneIds: ['s1', 's2'], sceneQty: { s2: 3 } }), IM.newItem('props', 'Mop', { id: 'p2', category: 'Set dressing', sceneIds: ['s1'] }));
  P.wardrobe.push(IM.newItem('wardrobe', 'Cardigan', { id: 'w1', usage: { s1: ['MARGOT'], s2: [] }, characters: ['MARGOT'], sceneIds: ['s1', 's2'], cost: '30' }));
  P.tags.push({ id: 't1', sceneId: 's1', cat: 'props', text: 'film can', itemId: 'p1' }, { id: 't2', sceneId: 's1', cat: 'props', text: 'mop', itemId: 'p2' });
  return P;
}
const num = id => ({ s1: '1', s2: '2' })[id];

test('items: new items, cost, aliases', () => {
  const x = IM.newItem('wardrobe', 'Coat'); eq([x.aliases, x.category, x.characters], [['Coat'], 'Costume', []]);
  eq(IM.cost({ cost: '12.5', qty: '2' }), 25); eq(IM.cost({ cost: '', qty: 3 }), 0);
  eq(IM.addAlias(x, 'coats'), false, 'plural of the name is already known'); eq(IM.addAlias(x, ' '), false);
  eq(IM.addAlias(x, 'long grey coat'), true); eq(IM.aka(x), ['long grey coat']);
  IM.removeAlias(x, 'long grey coat'); eq(IM.aka(x), []);
});

test('items: field updates are checked against the kind', () => {
  const P = itemsProject(), x = P.props[0];
  eq(IM.update('props', x, 'status', 'Fitting'), false, 'wardrobe-only status'); eq(IM.update('props', x, 'status', 'Prepped'), true);
  eq(IM.update('props', x, 'category', 'Nope'), false); eq(IM.update('props', x, 'id', 'z'), false);
  eq(IM.update('wardrobe', P.wardrobe[0], 'source', 'Actor’s own'), true);
});

test('items: scenes, quantities, stage setup and wearers', () => {
  const P = itemsProject(), x = P.wardrobe[0];
  eq(IM.scenesText(P.props[0], num), '1 2×3');
  IM.setSceneQty(P.props[0], 's1', '0'); eq(IM.qtyIn(P.props[0], 's1'), 1);
  eq(IM.setSetup(P.props[0], 's1', 'flown'), true); eq(IM.setupOf(P.props[0], 's1'), 'flown'); eq(IM.setSetup(P.props[0], 's1', 'teleport'), false);
  IM.toggleWearer(x, 's2', 'THEO'); eq(IM.allChars(x), ['MARGOT', 'THEO']);
  IM.setScene(x, 's2', false); eq([x.sceneIds, x.characters], [['s1'], ['MARGOT']], 'dropping a scene drops who wore it there');
  IM.setScene(x, 's3', true); eq(x.usage.s3, []);
  IM.unassignChar(x, 'MARGOT'); eq(IM.allChars(x), []);
  eq(IM.assignChar(IM.newItem('wardrobe', 'Hat'), 'THEO'), false, 'needs a scene first');
  eq(IM.assignChar(x, 'THEO'), true); eq(x.usage, { s1: ['THEO'], s3: ['THEO'] });
});

test('items: photos', () => {
  const x = IM.newItem('props', 'Lamp'); IM.addPhotos(x, ['a', 'b', 'c']);
  eq(IM.makeMain(x, 2), true); eq(x.photos, ['c', 'a', 'b']); eq(IM.makeMain(x, 0), false);
  IM.removePhoto(x, 0); eq(x.photos, ['a', 'b']);
});

test('items: finishing a profile drops an empty new item and keeps the name as an alias', () => {
  const P = itemsProject(), x = IM.add(P, 'wardrobe'); eq(x.usage, {});
  eq(IM.finish(P, 'wardrobe', x.id, true), false); eq(P.wardrobe.length, 1);
  const y = IM.add(P, 'props'); y.name = 'Lantern'; y.aliases = [];
  eq(IM.finish(P, 'props', y.id, true), true); eq(y.aliases, ['Lantern']);
});

test('items: duplicate, remove (with tags) and merge', () => {
  const P = itemsProject();
  const c = IM.duplicate(P, 'props', 'p1'); eq([P.props[1].id, c.name, c.aliases], [c.id, 'Film can (copy)', ['Film can (copy)']]);
  c.photos.push('x');
  eq(P.props[0].photos.length, 0, 'copy is deep');
  IM.merge(P, 'props', 'p1', ['p2', c.id]);
  eq(P.props.map(x => x.id), ['p1']); eq(P.tags.map(t => t.itemId), ['p1', 'p1']);
  eq(IM.aka(P.props[0]), ['Mop', 'Film can (copy)']); eq(P.props[0].photos, ['x']);
  eq(P.props[0].sceneQty.s2, 3);
  eq(IM.remove(P, 'props', 'p1'), true); eq([P.props.length, P.tags.length], [0, 0]);
});

test('items: merge wardrobe joins who wears it per scene', () => {
  const P = itemsProject(); P.wardrobe.push(IM.newItem('wardrobe', 'Grey cardigan', { id: 'w2', characters: ['THEO'], sceneIds: ['s2', 's4'] }));
  IM.merge(P, 'wardrobe', 'w1', ['w2']); const w = P.wardrobe[0];
  eq(w.usage, { s1: ['MARGOT'], s2: ['THEO'], s4: ['THEO'] }); eq(w.characters, ['MARGOT', 'THEO']);
});

test('items: filter, summary, by character, CSV and print rows', () => {
  const P = itemsProject();
  eq(IM.filter(P.props, { q: 'MOP' }).map(x => x.id), ['p2']); eq(IM.filter(P.props, { scene: 's2' }).map(x => x.id), ['p1']);
  eq(IM.filter(P.wardrobe, { char: 'MARGOT' }).length, 1);
  eq(IM.summary('props', P.props), { count: 2, statuses: [['Needed', 1], ['Acquired', 1]], cost: 80 });
  const bc = IM.byCharacter(P.wardrobe, ['MARGOT', 'THEO']); eq(bc.chars.map(c => c.items.length), [1, 0]); eq(bc.chars[0].items[0].scenes, ['s1']); eq(bc.loose.length, 0);
  const csv = IM.csvRows('wardrobe', P.wardrobe, num); eq(csv[0].length, 18); eq(csv[1].slice(0, 4), ['Cardigan', '', 'Costume', 'MARGOT']);
  const pr = IM.printRows('props', P.props, num, n => '$' + n); eq(pr.rows[0], ['Film can', 'Hand prop', '1, 2', 2, 'Acquired', '', '', '', '$80']);
});

test('items: total cost goes to one budget line', () => {
  const P = itemsProject();
  eq(IM.toBudget(P, 'props'), 80); P.props[1].cost = 5; IM.toBudget(P, 'props');
  eq(P.budget.length, 1); eq(P.budget[0].rate, 85);
  P.wardrobe[0].cost = ''; eq(IM.toBudget(P, 'wardrobe'), 0); eq(P.budget.length, 1);
});

/* ---------- view model ---------- */
function itemsVM(P = itemsProject(), ui = {}) {
  const store = fakeStore(P), vm = new ItemsVM({ project: () => P, store, ui, fx: {
    scenes: () => [{ id: 's1', num: '1', label: 'INT. CINEMA' }, { id: 's2', num: '2', label: 'EXT. STREET' }],
    sceneCast: (P, s) => s.id === 's1' ? ['MARGOT', 'THEO'] : ['THEO'], charNames: () => ['MARGOT', 'THEO'],
    untracked: () => [], linkTags: () => ({ added: 0, linked: 0 }) } });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, store, ui, draws: () => draws };
}

test('items vm: tabs, views and filters per kind', () => {
  const { vm, ui } = itemsVM();
  eq(vm.kind, 'props'); eq(vm.kinds.map(k => k.count), [2, 1]);
  vm.setMode('char'); eq(vm.mode, 'cards', 'by character is wardrobe only');
  vm.setFilter({ q: 'mop' }); eq(vm.visible.length, 1);
  vm.setKind('wardrobe'); eq([ui.itemTab, vm.mode, vm.filter.q], ['wardrobe', 'char', '']);
  vm.setKind('props'); eq(vm.filter.q, 'mop', 'each tab keeps its own filters');
  ui.openItem = { kind: 'props', id: 'p2' }; eq(vm.takePendingOpen().name, 'Mop'); eq(ui.openItem, null);
});

test('items vm: profile edits, scenes and who wears it', () => {
  const { vm, P, draws } = itemsVM(itemsProject(), { itemTab: 'wardrobe' });
  const d = draws(); vm.update('w1', 'look', 'Look 2', { quiet: true }); eq(draws(), d); eq(P.wardrobe[0].look, 'Look 2');
  eq(vm.update('w1', 'status', 'Bogus'), false);
  const rows = vm.useRows(P.wardrobe[0]); eq(rows.map(r => [r.on, r.cast]), [[true, ['MARGOT', 'THEO']], [true, ['THEO']]]);
  vm.toggleWearer('w1', 's2', 'THEO'); eq(vm.allChars(P.wardrobe[0]), ['MARGOT', 'THEO']);
  vm.setSceneQty('w1', 's1', 2); eq(vm.scenesText(P.wardrobe[0]), '1×2 2');
  eq(vm.addAlias('w1', 'grey cardigan'), true); vm.removeAlias('w1', 'grey cardigan');
  vm.addPhotos('w1', ['a', 'b']); vm.makeMain('w1', 1); eq(P.wardrobe[0].photos, ['b', 'a']);
  const bc = vm.byCharacter; eq(bc.chars[1].items[0].scenes, ['s2']);
  vm.unassignChar('w1', 'THEO'); eq(vm.assignChar('w1', 'THEO'), true);
});

test('items vm: add, finish, duplicate, merge ticked, delete, budget', () => {
  const { vm, P } = itemsVM();
  const x = vm.add(); eq(vm.finish(x.id, true), false); eq(P.props.length, 2);
  vm.duplicate('p2'); eq(P.props.length, 3);
  vm.togglePick('p1', true); vm.togglePick(P.props[2].id, true); eq(vm.pickedItems.length, 2);
  vm.merge('p1'); eq(P.props.length, 2); eq(vm.picked.size, 0);
  eq(vm.toBudget(), 80); eq(P.budget[0].desc, 'Props (from Props list)');
  vm.remove('p2'); eq(P.tags.map(t => t.id), ['t1']);
  eq(vm.csvRows().length, 2); eq(vm.printRows(n => n).rows[0][2], '1, 2');
});
