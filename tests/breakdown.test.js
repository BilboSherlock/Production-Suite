'use strict';
/* Script breakdown — model and view-model tests */
const BDM = BreakdownModel;
function bdScene(id, num, chars = []) { return { id, num, label: 'INT. ROOM ' + num, ioe: 'INT', tod: 'DAY', eighths: 8, location: 'ROOM ' + num, chars: new Map(chars.map(c => [c, 1])) }; }
function bdProject() {
  const P = fakeProject({ mode: 'film', tags: [], props: [], wardrobe: [], sceneMeta: {}, locations: [], days: [{ sceneIds: ['s2'] }, { sceneIds: ['s2'] }], shots: [{ sceneId: 's1' }], boards: [] });
  P.props.push(ItemsModel.newItem('props', 'Sack', { id: 'k1', aliases: ['Sack'] }));
  return P;
}
const bdTexts = [{ id: 's1', text: 'She drags a bright red sack.' }, { id: 's2', text: 'Two sacks by the door.' }, { id: 's3', text: 'Nothing here.' }];

test('breakdown: plural-aware keys and patterns', () => {
  eq(['Mops', 'knives', 'Bright Red Sacks', 'glasses', 'bus', 'parties', 'boxes'].map(BDM.key), ['mop', 'knife', 'bright red sack', 'glasses', 'bus', 'party', 'box']);
  const re = new RegExp('^(?:' + BDM.plural('knife') + ')$', 'i'); eq(['knife', 'Knives', 'knifes'].map(t => re.test(t)), [true, true, false]);
});

test('breakdown: matching a phrase to an element', () => {
  const P = bdProject();
  eq(BDM.find(P, 'props', 'sacks').item.id, 'k1'); eq(BDM.find(P, 'props', 'bright red sack').item.id, 'k1', 'more specific joins');
  P.props[0].aliases.push('bright red sack');
  eq(BDM.find(P, 'props', 'blue sack').item, undefined, 'a different qualifier does not join');
  P.props.push(ItemsModel.newItem('props', 'Old sack', { id: 'k2', aliases: ['Old sack'] }));
  eq(BDM.find(P, 'props', 'old sack').item.id, 'k2');
  eq(BDM.find(P, 'props', 'lamp'), {});
});

test('breakdown: tagging links, creates and removes', () => {
  const P = bdProject();
  const a = BDM.tag(P, 's1', 'props', '  bright  red sack '); eq([a.item.id, a.created, a.tag.text], ['k1', false, 'bright red sack']);
  eq(P.props[0].aliases, ['Sack', 'bright red sack']); eq(P.props[0].sceneIds, ['s1']);
  eq(BDM.tag(P, 's1', 'props', 'bright red sacks').tag.id, a.tag.id, 'same mention is not tagged twice');
  const w = BDM.tag(P, 's1', 'makeup', 'Bruise'); eq([w.created, w.item.category, w.item.usage], [true, 'Makeup & hair', { s1: [] }]);
  const n = BDM.tag(P, 's1', 'sound', 'Thunder'); eq([n.item, n.tag.itemId], [null, undefined]);
  eq(BDM.tag(P, 's1', 'props', '  '), null);
  ItemsModel.setChars(w.item, 's1', ['ANA']);
  BDM.untag(P, w.tag); eq([w.item.sceneIds, w.item.usage, w.item.characters], [[], {}, []], 'last mention in a scene takes the element out of it');
  BDM.tag(P, 's2', 'props', 'sack'); BDM.removeFromScene(P, P.props[0], 's2'); eq(P.props[0].sceneIds, ['s1']); eq(P.tags.filter(t => t.sceneId === 's2').length, 0);
});

test('breakdown: tag every mention, rename, delete, legacy links', () => {
  const P = bdProject();
  eq(BDM.mentioning(bdTexts, 'sack'), ['s1', 's2']);
  const r = BDM.tagAll(P, 'props', 'sack', null, bdTexts); eq([r.n, r.item.id, P.props[0].sceneIds], [2, 'k1', ['s1', 's2']]);
  eq(BDM.rename(P.props[0], 'Hessian sack'), true); eq(P.props[0].aliases, ['Sack', 'Hessian sack']); eq(BDM.rename(P.props[0], ' '), false);
  eq(BDM.tagAllAliases(P, 'props', P.props[0], bdTexts), 2);
  eq(BDM.removeElement(P, P.props[0]), true); eq([P.props.length, P.tags.length], [0, 0]);
  const Q = bdProject(); Q.wardrobe.push(ItemsModel.newItem('wardrobe', 'Coat', { id: 'w1', usage: {} })); delete Q.props[0].aliases;
  Q.tags.push({ id: 't1', sceneId: 's1', cat: 'props', text: 'sacks' }, { id: 't2', sceneId: 's2', cat: 'wardrobe', text: 'coat', who: 'ANA' }, { id: 't3', sceneId: 's2', cat: 'props', text: 'lamp' });
  BDM.linkLegacy(Q);
  eq(Q.tags.map(t => t.itemId), ['k1', 'w1', undefined], 'links, never creates'); eq(Q.wardrobe[0].usage.s2, ['ANA']); eq(Q.tags[1].who, undefined);
});

test('breakdown: a scene’s groups, what can be added, cast and the wear grid', () => {
  const P = bdProject(), s1 = bdScene('s1', '1', ['ANA']);
  BDM.tag(P, 's1', 'props', 'sack'); BDM.tag(P, 's1', 'props', 'bright red sack'); BDM.tag(P, 's1', 'sound', 'Thunder'); BDM.tag(P, 's1', 'sound', 'thunders');
  const g = BDM.groups(P, 's1', 'props'); eq([g.length, g[0].name, g[0].variants.map(t => t.text)], [1, 'Sack', ['sack', 'bright red sack']]);
  eq(BDM.groups(P, 's1', 'sound').map(x => [x.key, x.tags.length]), [['sound:thunder', 1]]);
  eq(BDM.count(P, 's1'), 2);
  const coat = BDM.tag(P, 's2', 'wardrobe', 'Coat').item; BDM.tag(P, 's1', 'makeup', 'Scar');
  eq(BDM.addable(P, 's1', 'wardrobe').map(x => x.name), ['Coat'], 'makeup items are not offered as wardrobe'); eq(BDM.addable(P, 's1', 'sound'), []);
  BDM.tag(P, 's1', 'cast', 'Ben'); BDM.tag(P, 's1', 'cast', 'ana');
  eq([BDM.castTag(P, s1, 'BEN').text, BDM.castTag(P, s1, 'ANA')], ['Ben', null], 'speaking cast cannot be removed here');
  BDM.tag(P, 's1', 'wardrobe', 'coat');
  const grid = BDM.wearGrid(P, 's1', 'wardrobe', ['ANA', 'BEN']); eq(grid.rows.map(r => [r.item.name, r.unassigned]), [['Coat', true]]);
  BDM.giveAll([coat], 's1', 'BEN'); BDM.setWearer(coat, 's1', 'ANA', true); eq(ItemsModel.charsIn(coat, 's1'), ['BEN', 'ANA']);
  BDM.setWearer(coat, 's1', 'BEN', false); eq(ItemsModel.charsIn(coat, 's1'), ['ANA']);
});

test('breakdown: scene notes, location and links', () => {
  const P = bdProject();
  eq(BDM.setMeta(P, 's1', 'synopsis', 'She leaves'), true); eq(BDM.setMeta(P, 's1', 'color', 'red'), false);
  BDM.setMeta(P, 's1', 'est', '45'); eq(P.sceneMeta.s1.est, 45); BDM.setMeta(P, 's1', 'est', ''); eq('est' in P.sceneMeta.s1, false);
  const l = BDM.newLocation(P, 's1', 'ROOM 1'); eq([P.locations.length, P.sceneMeta.s1.locationId], [1, l.id]);
  eq(BDM.linkLocation(P, 's1', 'nope'), false); BDM.linkLocation(P, 's1', ''); eq(P.sceneMeta.s1.locationId, undefined);
  eq(BDM.sceneLinks(P, 's2'), { days: [1, 2], shots: 0, frames: 0 }); eq(BDM.sceneLinks(P, 's1').shots, 1);
});

test('breakdown: highlighting and the element list', () => {
  const P = bdProject(); BDM.tag(P, 's1', 'props', 'sack'); BDM.tag(P, 's2', 'props', 'sacks'); ItemsModel.setSceneQty(P.props[0], 's2', 2); BDM.tag(P, 's2', 'sound', 'Door');
  const runs = BDM.highlight(BDM.tagsIn(P, 's2'), 'Two Sacks by the door.');
  eq(runs.map(r => [r.text, !!r.tag]), [['Two ', false], ['Sacks', true], [' by the ', false], ['door', true], ['.', false]]);
  eq(BDM.highlight([], 'plain'), [{ text: 'plain' }]);
  const cats = [{ k: 'props', label: 'Props' }, { k: 'sound', label: 'Sound' }];
  const rows = BDM.elementRows(P, [bdScene('s1', '1'), bdScene('s2', '2')], cats);
  eq(rows.map(r => [r.name, r.scenes]), [['Sack', [['1', 1], ['2', 2]]], ['Door', [['2', 1]]]]);
  eq(BDM.listCells(rows)[0], ['Props', 'Sack', '', '1, 2 ×2', 'Needed']);
});

/* ---------- view model ---------- */
function bdVM(P = bdProject(), ui = {}) {
  const scenes = [bdScene('s1', '1', ['ANA']), bdScene('s2', '2')];
  const vm = new BreakdownVM({ project: () => P, store: fakeStore(P), ui, fx: {
    scenes: () => scenes, sceneCast: (P, s) => [...new Set([...s.chars.keys(), ...P.tags.filter(t => t.sceneId === s.id && t.cat === 'cast').map(t => t.text.toUpperCase())])],
    charNames: () => ['ANA', 'BEN'], sceneTexts: () => bdTexts, cats: () => [{ k: 'cast', label: 'Cast' }, { k: 'props', label: 'Props' }, { k: 'wardrobe', label: 'Wardrobe' }], minsPerPage: () => 60 } });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, ui, draws: () => draws };
}

test('breakdown vm: scene selection, modes and panels', () => {
  const { vm, ui } = bdVM(bdProject(), { scene: 'gone' });
  eq([vm.scene.id, ui.scene], ['s1', 's1'], 'a missing scene falls back to the first');
  vm.selectScene('s2'); eq(vm.sceneList.map(x => x.on), [false, true]);
  vm.setMode('report'); eq(vm.mode, 'report'); vm.setMode('nonsense'); eq(vm.mode, 'scene');
  vm.selectScene('s1'); eq(vm.castToAdd, ['BEN']); eq(vm.estGuess, 60);
  eq(vm.panels.map(p => [p.cat.k, p.open]), [['cast', false], ['props', false], ['wardrobe', false]]);
  vm.setOpen('props', true); eq(vm.panels[1].open, true);
  eq(vm.suggestions('sacks').map(s => s.x.id), ['k1']);
});

test('breakdown vm: tagging, cast, notes and the wear grid', () => {
  const { vm, P, draws } = bdVM();
  const d = draws(); vm.setMeta('synopsis', 'Hi', { quiet: true }); eq([draws(), vm.meta.synopsis], [d, 'Hi']);
  eq(vm.tag('props', 'red sack').item.id, 'k1'); eq(vm.panels[1].groups.length, 1);
  vm.addCast('ben'); eq(vm.castChips.map(c => [c.name, !!c.tag]), [['ANA', false], ['BEN', true]]);
  vm.untag(vm.castChips[1].tag); eq(vm.cast, ['ANA']);
  vm.autoCast(); eq(P.tags.filter(t => t.cat === 'cast').map(t => t.text), ['ANA']);
  const coat = vm.tag('wardrobe', 'Coat').item; const grid = vm.panels[2].grid; eq(grid.rows[0].unassigned, true);
  vm.giveAll([coat], 'ANA'); eq(vm.panels[2].grid.rows[0].on, ['ANA']); vm.setWearer(coat, 'ANA', false); eq(ItemsModel.charsIn(coat, 's1'), []);
  vm.setQty(P.props[0], '3'); eq(vm.qtyIn(P.props[0]), 3);
  const l = vm.newLocation(); eq([l.name, vm.meta.locationId], ['ROOM 1', l.id]);
});

test('breakdown vm: tag all, rename, merge, remove and the element list', () => {
  const { vm, P } = bdVM();
  eq(vm.tagAll('props', 'sack').n, 2);
  const lamp = vm.tag('props', 'Lamp').item; eq(vm.mergeTargets(lamp).map(x => x.id), ['k1']);
  eq(vm.merge(lamp, 'k1').id, 'k1'); eq(P.props.length, 1); eq(ItemsModel.aka(P.props[0]), ['Lamp']);
  vm.rename(P.props[0], 'Bag'); eq(P.props[0].name, 'Bag');
  vm.setFilter('props'); eq(vm.rows.map(r => r.name), ['Bag']); eq(vm.listCells()[0][3], '1, 2');
  vm.removeFromScene(P.props[0]); eq(P.props[0].sceneIds, ['s2']);
  vm.openItem(P.props[0]); eq(vm._ui.openItem, { kind: 'props', id: 'k1' });
  vm.removeElement(P.props[0]); eq([P.props.length, P.tags.length], [0, 0]);
});
