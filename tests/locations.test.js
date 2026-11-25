'use strict';
/* Locations — model and view-model tests */
const LM = LocationsModel;
const locScenes = [{ id: 's1', num: '1', location: 'RIVERSIDE CINEMA - LOBBY' }, { id: 's2', num: '2', location: 'Riverside Cinema - Booth' }, { id: 's3', num: '3', location: 'ALLEY' }, { id: 's4', num: '4', location: '' }];
function locProject() {
  const P = fakeProject({ locations: [], sceneMeta: {} });
  LM.add(P, { id: 'l1', name: 'Riverside Cinema' }); LM.add(P, { id: 'l2', name: 'Studio' });
  P.sceneMeta.s2 = { locationId: 'l2' };
  return P;
}

test('locations: new, edit and the permit list', () => {
  const l = LM.newLocation({ name: 'Pier' }); eq([l.permit, l.name, typeof l.id], ['Not needed', 'Pier', 'string']);
  eq(LM.update(l, 'permit', 'Approved'), true); eq(LM.update(l, 'permit', 'Maybe'), false); eq(l.permit, 'Approved');
  eq(LM.update(l, 'id', 'x'), false); eq(LM.update(l, 'cost', null), true); eq(l.cost, '');
  eq([LM.needsConfirm(l), LM.needsConfirm(LM.newLocation({ name: '  ' }))], [true, false]);
});

test('locations: which scenes use a location', () => {
  const P = locProject();
  eq(LM.usedIn(P, P.locations[0], locScenes), ['1'], 'scene 2 is linked to the studio instead');
  eq(LM.usedIn(P, P.locations[1], locScenes), ['2']); eq(LM.usedIn(P, LM.newLocation(), locScenes), [], 'an unnamed location matches nothing');
  eq(locScenes.map(s => LM.placeOf(P, s)), ['RIVERSIDE CINEMA - LOBBY', 'Studio', 'ALLEY', '']);
});

test('locations: from the script and deleting', () => {
  const P = locProject();
  eq(LM.fromScript(P, locScenes.concat({ id: 's5', location: 'alley ' })), 3); eq(LM.list(P).map(l => l.name).slice(2), ['RIVERSIDE CINEMA - LOBBY', 'Riverside Cinema - Booth', 'ALLEY']);
  eq(LM.fromScript(P, locScenes), 0);
  eq(LM.remove(P, 'l2'), true); eq(P.sceneMeta.s2, {}, 'linked scenes fall back to their heading'); eq(LM.remove(P, 'l2'), false);
});

test('locations vm: cards, quiet edits, add and remove', () => {
  const P = locProject(), vm = new LocationsVM({ project: () => P, store: fakeStore(P), ui: {}, fx: { scenes: () => locScenes } });
  let draws = 0; vm.subscribe(() => draws++);
  eq(vm.cards.map(c => c.used), [['1'], ['2']]);
  vm.update('l1', 'notes', 'Parking out back', { quiet: true }); eq([draws, P.locations[0].notes], [0, 'Parking out back']);
  vm.update('l1', 'name', 'Alley'); eq([draws, vm.cards[0].used], [1, ['3']]);
  const l = vm.add(); eq(P.locations.length, 3); vm.remove(l.id); eq(P.locations.length, 2);
  eq(vm.fromScript(), 2);
});
