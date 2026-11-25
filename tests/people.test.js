'use strict';
/* Cast & crew — model and view-model tests */
const PM = PeopleModel;
function pplProject() {
  const P = fakeProject({ casting: { roles: [{ id: 'r1', castId: '' }, { id: 'r2', castId: 'c9' }] }, wardrobe: [], days: [{ sceneIds: ['s2'], date: '2026-05-01' }, { sceneIds: ['s3'] }] });
  P.people.push(PM.newPerson('cast', { id: 'a1', name: 'Ana Ruiz', character: 'MARGOT', email: 'ana@example.test', docs: { contract: true, nda: true } }),
    PM.newPerson('crew', { id: 'c1', name: 'Bo Li', dept: 'Camera', role: 'Gaffer', rate: '400' }), PM.newPerson('cast', { id: 'a2', character: 'THEO' }));
  return P;
}
const pplScenes = [{ id: 's1', num: '1' }, { id: 's2', num: '2' }, { id: 's3', num: '3' }];
const pplCast = { s1: ['MARGOT', 'THEO'], s2: ['MARGOT'], s3: ['THEO'] };

test('people: new people, initials, paperwork and subtitles', () => {
  const p = PM.newPerson('nonsense'); eq([p.type, p.docs, typeof p.id], ['crew', {}, 'string']);
  eq([PM.initials('ana maria ruiz'), PM.initials(''), PM.initials('  ')], ['AM', '?', '']);
  const P = pplProject(); eq(PM.docsDone(P.people[0]), 2);
  eq(P.people.map(PM.subtitle), ['MARGOT', 'Gaffer · Camera', 'THEO']); eq(PM.subtitle(PM.newPerson('crew')), 'Crew');
});

test('people: profile sections follow cast, crew and contacts', () => {
  const titles = s => s.map(x => x[0]);
  eq(titles(PM.sections({ type: 'cast' })), ['Identity', 'Contact', 'Representation', 'Emergency contact', 'Wardrobe & personal', 'Deal', 'Availability']);
  eq(PM.sections({ type: 'crew' })[0][1].map(f => f[0]), ['name', 'dept', 'role', 'pronouns', 'dob', 'union']);
  const both = PM.sections({ type: 'cast', kinds: ['cast', 'crew'] }, true); eq(titles(both).includes('Availability'), false); eq(titles(both).filter(t => t === 'Skills & kit').length, 1);
  eq(PM.FIELDS.has('kit') && PM.FIELDS.has('unavail') && !PM.FIELDS.has('id'), true);
});

test('people: editing fields and paperwork', () => {
  const p = PM.newPerson('cast');
  eq(PM.update(p, 'character', 'margot (v.o.)'), 'MARGOT (V.O.)'); eq(PM.update(p, 'id', 'x'), false); eq(PM.update(p, 'rateUnit', 'Fortnight'), false);
  eq(PM.update(p, 'rateUnit', 'Week'), 'Week'); eq(PM.update(p, 'notes', null), '');
  eq(PM.setDoc(p, 'release', 1), true); eq(p.docs.release, true); eq(PM.setDoc(p, 'visa', true), false);
});

test('people: add, remove and characters from the script', () => {
  const P = pplProject();
  eq(PM.isBlank(P.people[2]), false); eq(PM.isBlank(PM.newPerson('cast')), true);
  eq(PM.addCharacters(P, [['THEO', 3], ['ZED', 1], ['margot', 9], ['OLD MAN (V.O.)', 5], ['old man', 2]]), 2);
  eq(PM.ofType(P, 'cast').map(p => p.character), ['MARGOT', 'THEO', 'OLD MAN', 'ZED'], 'most lines first, each once');
  eq(PM.remove(P, 'c1'), true); eq(PM.remove(P, 'c1'), false); eq(PM.counts(P), { cast: 4, crew: 0, casting: 1 });
  eq(PM.castFor(P, 'Margot').id, 'a1');
});

test('people: search, CSV, print and profile rows', () => {
  const P = pplProject();
  eq(PM.filter(P.people, 'camera').map(p => p.id), ['c1']); eq(PM.filter(P.people, ' ').length, 3);
  const csv = PM.csvRows('crew', PM.ofType(P, 'crew')); eq(csv[0].length, 10); eq(csv[1], ['Bo Li', 'Camera', 'Gaffer', '', '', '', '400/Day', '', '', '']);
  eq(PM.printRows('cast', PM.ofType(P, 'cast')), { title: 'Cast list', head: ['Actor', 'Character', 'Phone', 'Email', 'Agent / rep'], rows: [['Ana Ruiz', 'MARGOT', '', 'ana@example.test', ''], ['', 'THEO', '', '', '']] });
  const r = PM.profileRows(P.people[0]); eq(r[0], { grp: 'Identity' }); eq(r[1], ['Full name', 'Ana Ruiz']);
  eq(r.filter(x => x[1] === '✓ Complete').length, 2);
});

test('people: where an actor appears and what they wear', () => {
  const P = pplProject();
  const a = PM.appearances(P, P.people[0], pplScenes, s => pplCast[s.id]); eq(a, { scenes: ['1', '2'], days: [{ n: 1, date: '2026-05-01' }] });
  eq(PM.appearances(P, P.people[1], pplScenes, s => pplCast[s.id]), null, 'crew');
  P.wardrobe.push(ItemsModel.newItem('wardrobe', 'Coat', { usage: { s1: ['MARGOT'], s2: ['THEO'] }, characters: ['MARGOT', 'THEO'], sceneIds: ['s1', 's2'] }));
  eq(PM.wardrobe(P, P.people[0], pplScenes).map(w => [w.item.name, w.scenes]), [['Coat', ['1']]]);
});

/* ---------- view model ---------- */
function pplVM(P = pplProject(), ui = {}) {
  const vm = new PeopleVM({ project: () => P, store: fakeStore(P), ui, fx: { scenes: () => pplScenes, sceneCast: (P, s) => pplCast[s.id], characters: () => [['MARGOT', 4], ['NEW GIRL', 2]] } });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, ui, draws: () => draws };
}

test('people vm: tabs, views, search and a pending profile', () => {
  const { vm, ui } = pplVM(pplProject(), { peopleTab: 'bogus' });
  eq([vm.tab, vm.mode], ['cast', 'table']); eq(vm.tabs.map(t => t[1]), ['Cast (2)', 'Crew (1)', 'Casting (1 open)']);
  vm.setQuery('theo'); eq(vm.rows.map(p => p.id), ['a2']);
  vm.setTab('crew'); vm.setMode('cards'); eq([vm.cols[1][0], vm.mode, ui.peopleView], ['dept', 'cards', 'cards']);
  ui.openPerson = 'a1'; eq(vm.takePendingOpen().name, 'Ana Ruiz'); eq(ui.openPerson, null); eq(vm.takePendingOpen(), null);
});

test('people vm: add, edit quietly, paperwork, photo, remove', () => {
  const { vm, P, draws } = pplVM();
  const p = vm.add(); eq([p.type, P.people.length], ['cast', 4]);
  const d = draws(); eq(vm.update(p.id, 'character', 'zed', { quiet: true }), 'ZED'); eq(draws(), d);
  vm.setDoc(p.id, 'contract', true); eq(vm.docs(p), { done: 1, of: 5 });
  vm.setPhoto(p.id, 'data:x'); eq(p.photo, 'data:x'); vm.setPhoto(p.id, null); eq(p.photo, '');
  eq(vm.needsConfirm(p), true); vm.remove(p.id); eq(P.people.length, 3);
  eq(vm.addCharacters(), 1); eq(P.people[3].character, 'NEW GIRL');
  eq(vm.appearances(P.people[0]).scenes, ['1', '2']); eq(vm.csvRows().length, 4);
});
