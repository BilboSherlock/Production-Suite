'use strict';
/* Global contacts — model and view-model tests */
const CTM = ContactsModel;
const ctPerson = k => PeopleModel.newPerson(k);
function ctList() {
  return [
    CTM.normalize({ id: 'a', name: 'Zoe', type: 'cast', role: 'Lead', email: 'z@x', credits: [{ id: 'k1', production: 'Film A', role: 'Ann' }] }),
    CTM.normalize({ id: 'b', name: 'Bo', kinds: ['cast', 'crew'], positions: [{ kind: 'crew', dept: 'Camera', role: '' }, { kind: 'cast', dept: '', role: 'Extra' }], credits: [] }),
    CTM.normalize({ id: 'c', name: 'Al', type: 'crew', dept: 'Sound', role: 'Mixer', phone: '555' }),
  ];
}

test('contacts: normalizing, lines, cards and filters', () => {
  const L = ctList(), [z, b, a] = L;
  eq([z.kinds, z.positions.map(p => [p.kind, p.role]), a.positions[0].dept, b.positions.every(p => p.id)], [['cast'], [['cast', 'Lead']], 'Sound', true], 'old single-type contacts get kinds and positions; rows get ids');
  eq([CTM.kindsText(b), CTM.line(z), CTM.line(a), CTM.positionFor(z, 'crew')], ['Cast + Crew', 'Cast · Lead · z@x', 'Crew · Mixer · 555', { kind: 'crew', dept: '', role: '' }]);
  eq(CTM.card(b), { name: 'Bo', sub: 'Camera · Extra', reach: '', kinds: ['Cast', 'Crew'], credits: null });
  eq([CTM.card(z).credits, CTM.creditsLine(z), CTM.creditsLine(a)], [{ text: '1 credit', title: 'Film A — Ann' }, '1 credit: Film A', null]);
  eq([CTM.visible(L, 'all', '').map(c => c.name), CTM.visible(L, 'cast', '').map(c => c.id), CTM.visible(L, 'both', '').map(c => c.id), CTM.visible(L, 'all', 'film a').map(c => c.id)], [['Al', 'Bo', 'Zoe'], ['b', 'a'], ['b'], ['a']]);
  eq([CTM.pickable(L, 'crew', '').map(c => c.id), CTM.pickable(L, '', 'mixer').map(c => c.id)], [['c', 'b'], ['c']]);
  const n = CTM.blank('cast', ctPerson); eq([n.kinds, n.positions.length, n.type, !!n.id], [['cast'], 1, 'cast', true]);
  eq([CTM.remove(L, 'b'), CTM.remove(L, 'b'), L.length], [true, false, 2]);
});

test('contacts: import, export, and contacts in projects', () => {
  const L = ctList();
  eq(CTM.fromJson(L, { contacts: [{ id: 'a', name: 'Dup' }, { name: 'Zoe', email: 'z@x' }, { name: 'New', type: 'cast' }, { type: 'crew' }] }, ctPerson), 1, 'known ids, same name and email, and nameless are skipped');
  eq([L[3].name, L[3].kinds, !!L[3].id, CTM.fromJson(L, [{ name: 'Arr' }], ctPerson)], ['New', ['cast'], true, 1]);
  eq(CTM.fromCsv(L, [['Name', 'Type', 'Email', 'Department', 'Role'], ['Cy', 'cast & crew', 'c@y', 'Art', 'Painter'], ['', 'cast'], ['Di', 'cast', '', '', 'Lead']], ctPerson), 2);
  const cy = L.find(c => c.name === 'Cy'); eq([cy.kinds, cy.positions.map(p => [p.kind, p.dept, p.role]), cy.email], [['cast', 'crew'], [['cast', '', 'Painter'], ['crew', 'Art', 'Painter']], 'c@y']);
  eq(JSON.parse(CTM.exportJson([{ name: 'x' }])), { studiobindahh: 'contacts', contacts: [{ name: 'x' }] });
  const P = fakeProject({ id: 'p9', title: 'Show', people: [] });
  const p = CTM.personFrom(L[1], 'crew', {}); eq([p.contactId, p.type, p.dept, p.role, 'kinds' in p, p.id !== 'b'], ['b', 'crew', 'Camera', '', false, true]);
  eq(CTM.personFrom(L[1], 'cast', { role: 'Guard' }).role, 'Guard');
  P.people.push(p); eq([CTM.inProject(P, L[1], 'crew'), CTM.inProject(P, L[1], 'cast'), CTM.inProject(P, L[1])], [true, false, true]);
  const people = [{ id: 'q', type: 'cast', name: 'zoe', email: 'z@x', character: 'ANN', phone: '1', docs: {} }, { id: 'r', type: 'crew', name: 'Ed', dept: 'Grip', role: 'Key' }, { type: 'crew', name: ' ' }];
  const n0 = L.length; eq(CTM.saveFrom(L, people, P, 2026), { added: 1, updated: 1 });
  const zoe = L[0]; eq([zoe.phone, zoe.name, zoe.credits.map(c => [c.key, c.role, c.year]), people[0].contactId, 'character' in zoe], ['1', 'zoe', [[undefined, 'Ann', undefined], ['p9:cast', 'ANN', '2026']], 'a', false], 'matched by name (any case) and email; a credit for this production');
  const ed = L[n0]; eq([ed.kinds, ed.positions.map(x => [x.dept, x.role]), ed.credits[0].role], [['crew'], [['Grip', 'Key']], 'Grip — Key']);
  P.title = 'Show II'; CTM.saveFrom(L, people, P, 2027); eq([zoe.credits.length, zoe.credits[1].production], [2, 'Show II'], 'the same credit is updated');
});

test('contacts: roles and credits', () => {
  const c = ctList()[0];
  eq([CTM.setKind(c, 'cast', false), c.kinds], [false, ['cast']], 'the last kind stays');
  eq([CTM.setKind(c, 'crew', true), c.kinds, c.positions.map(p => p.kind), CTM.setKind(c, 'cast', false), c.kinds, c.type], [true, ['cast', 'crew'], ['cast', 'crew'], true, ['crew'], 'crew']);
  const p = CTM.addPosition(c), x = CTM.addCredit(c); eq([p.kind, x.kind, c.credits.length], ['crew', 'crew', 2]);
  eq([CTM.setRow(c, 'positions', p.id, 'role', 'Gaffer'), p.role, CTM.setRow(c, 'positions', p.id, 'kind', 'alien'), p.kind, CTM.setRow(c, 'credits', x.id, 'year', 2020), x.year, CTM.setRow(c, 'credits', x.id, 'dept', 'x'), CTM.setRow(c, 'nope', x.id, 'role', 'x')], [true, 'Gaffer', true, 'crew', true, '2020', false, false]);
  eq([CTM.removeRow(c, 'credits', x.id), CTM.removeRow(c, 'credits', x.id), c.credits.length], [true, false, 1]);
});

test('contacts vms: page, picker and roles', () => {
  const L = ctList(), ui = {}, store = fakeStore(null);
  const vm = new ContactsVM({ store, ui, fx: { list: () => L, newPerson: ctPerson, parseCSV: t => t.split('\n').map(r => r.split(',')) } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.tab, vm.countText], ['all', '3 of 3']); vm.setTab('crew'); eq([ui.ctTab, vm.rows.map(c => c.id)], ['crew', ['c', 'b']]); vm.setTab('zz'); eq(vm.tab, 'all');
  vm.setQuery('ZOE'); eq(vm.countText, '1 of 3'); vm.setQuery('');
  const c = vm.add('cast'); eq([L.length, store.touches, c.kinds], [4, 1, ['cast']]);
  c.positions = null; vm.edited(c.id); eq([Array.isArray(c.positions), store.touches], [true, 2], 'tidied and saved when the profile closes');
  eq(vm.remove(c.id), true);
  eq(vm.importFile('x.csv', 'name,type\nEve,cast'), 1); eq(L.some(x => x.name === 'Eve'), true);
  let err = ''; const t0 = store.touches; try { vm.importFile('x.json', '{bad'); } catch (e) { err = 'threw'; } eq([err, store.touches], ['threw', t0 + 1], 'still saved and redrawn');
  eq(JSON.parse(vm.exportJson()).contacts.length, L.length);

  const P = fakeProject({ people: [CTM.personFrom(L[1], 'crew')] }), ps = fakeStore(P);
  const pk = new ContactPickerVM({ project: () => P, store: ps, ui, type: 'crew', fx: { list: () => L } });
  eq(pk.rows.map(r => [r.c.id, r.pick.kind, r.have]), [['c', 'crew', false], ['b', 'crew', true]]);
  pk.setKind('b', 'cast'); eq([pk.rows[1].pick, pk.rows[1].have], [{ kind: 'cast', role: 'Extra' }, false]);
  eq(pk.importPicked(), 0); pk.toggle('b', true); pk.toggle('c', true); pk.setRole('c', 'Boom'); eq(pk.countText, '2 selected');
  pk.setKind('c', 'crew'); eq(pk.countText, '1 selected', 'changing the kind unticks'); pk.toggle('c', true); pk.setRole('c', 'Boom');
  eq([pk.importPicked(), P.people.map(p => [p.contactId, p.type, p.role]), ps.touches], [2, [['b', 'crew', ''], ['b', 'cast', 'Extra'], ['c', 'crew', 'Boom']], 1]);
  pk.setFilter(''); pk.setQuery('zoe'); eq(pk.rows.map(r => r.c.id), ['a']);

  const rv = new ContactRolesVM({ contact: L[0], ui }); let rd = 0; rv.subscribe(() => rd++);
  eq(rv.setKind('cast', false), false); rv.setKind('crew', true); eq([rv.kinds, rd], [['cast', 'crew'], 2]);
  const pos = rv.addPosition(); rv.setRow('positions', pos.id, 'role', 'Grip'); eq([pos.role, rd], ['Grip', 3], 'typing is quiet');
  rv.removeRow('positions', pos.id); eq(rv.positions.length, 2);
});
