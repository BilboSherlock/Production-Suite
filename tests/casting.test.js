'use strict';
/* Casting — model and view-model tests */
const CM = CastingModel;
function cstProject() {
  const P = fakeProject({ casting: { roles: [] } });
  const r = CM.addRole(P, 'MARGOT'); r.id = 'r1';
  CM.addCandidate(r, { id: 'c1', name: 'Ana Ruiz', contact: 'ana@example.test', rating: 4, status: 'callback' });
  CM.addCandidate(r, { id: 'c2', name: 'Bea Cole', contact: '555 01234', status: 'passed' });
  P.people.push(PeopleModel.newPerson('cast', { id: 'a2', character: 'THEO' }));
  return P;
}

test('casting: role state, progress and the sheet', () => {
  const P = cstProject(), r = P.casting.roles[0];
  eq(CM.state(r), { key: 'callback', label: 'Callback' }); eq(CM.state(CM.newRole()), { key: 'open', label: 'Open' });
  r.candidates[0].status = 'considering'; eq(CM.state(r).label, '2 considered');
  eq(CM.progress(P), { done: 0, total: 1, open: 1, pct: 0 }); eq(CM.progress(fakeProject()).total, 0);
  eq(CM.statusChoices(r, r.candidates[0]).map(s => s[0]).includes('cast'), false);
  r.candidates[0].status = 'callback';
  eq(CM.sheetRows(P)[0], ['MARGOT', '', '', 'Callback', '', 'Ana Ruiz (Callback, ★★★★)']);
});

test('casting: roles from the script, editing and deleting', () => {
  const P = cstProject();
  eq(CM.rolesFromScript(P, [['THEO', 2], ['margot', 9], ['OLD MAN (V.O.)', 4], ['old man', 1]]), 2);
  eq(CM.roles(P).map(r => r.name), ['MARGOT', 'OLD MAN', 'THEO']);
  const r = CM.roles(P)[1]; eq(CM.updateRole(r, 'desc', 'Grumpy'), true); eq(CM.updateRole(r, 'castId', 'x'), false);
  eq(CM.removeRole(P, r.id), true); eq(CM.roles(P).length, 2);
  const Q = fakeProject(); CM.addRole(Q, 'X'); eq(Q.casting.roles.length, 1, 'casting record is created when missing');
});

test('casting: candidates, ratings and status', () => {
  const P = cstProject(), r = P.casting.roles[0], c = r.candidates[0];
  eq(CM.rate(c, 4), true); eq(c.rating, 0, 'clicking the same star clears it'); CM.rate(c, 9); eq(c.rating, 5);
  eq(CM.updateCandidate(c, 'rating', '2.6'), true); eq(c.rating, 3); eq(CM.updateCandidate(c, 'id', 'z'), false);
  eq(CM.setStatus(r, c, 'cast'), false, 'only by casting'); eq(CM.setStatus(r, c, 'nope'), false); eq(CM.setStatus(r, c, 'offered'), true);
  eq(CM.removeCandidate(r, 'c2'), true); eq(r.candidates.length, 1);
});

test('casting: casting an actor fills the role and Cast & Crew', () => {
  const P = cstProject(), r = P.casting.roles[0], [a, b] = r.candidates;
  const p = CM.cast(P, r, a); eq([r.castId, a.status, p.type, p.character, p.name, p.email], ['c1', 'cast', 'cast', 'MARGOT', 'Ana Ruiz', 'ana@example.test']);
  eq(CM.state(r).label, 'Cast: Ana Ruiz'); eq(Array.isArray(p.docs) || typeof p.docs, 'object', 'a full person record');
  const p2 = CM.cast(P, r, b); eq([p2.id, p2.name, p2.phone, a.status], [p.id, 'Bea Cole', '555 01234', 'offered'], 'recasting reuses the person; the first actor goes back to offered');
  eq(CM.statusChoices(r, b).some(s => s[0] === 'cast'), true);
  eq(CM.setStatus(r, b, 'passed'), true); eq(r.castId, '', 'moving the cast actor on reopens the role');
  CM.cast(P, r, b); eq(CM.reopen(r), true); eq([r.castId, b.status], ['', 'offered']); eq(CM.reopen(r), false);
  const t = CM.addRole(P, 'Theo'); CM.cast(P, t, CM.addCandidate(t, { name: 'Cy' })); eq(P.people.find(x => x.id === 'a2').name, 'Cy', 'matches an existing character');
});

/* ---------- view model ---------- */
function cstVM(P = cstProject(), ui = {}) {
  const vm = new CastingVM({ project: () => P, store: fakeStore(P), ui, fx: { characters: () => [['MARGOT', 3], ['ZED', 1]] } });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, ui, draws: () => draws };
}

test('casting vm: selecting, adding and removing roles', () => {
  const { vm, P, ui } = cstVM(cstProject(), { castRole: 'gone' });
  eq([vm.role.id, ui.castRole], ['r1', 'r1']);
  const r = vm.addRole(); eq([vm.role, vm.roleList.map(x => x.on)], [r, [false, true]]);
  const d = vm.progress; eq([d.total, d.done], [2, 0]);
  vm.removeRole(); eq([P.casting.roles.length, vm.role.id], [1, 'r1']);
  eq(vm.rolesFromScript(), 1); eq(vm.sheet.rows.length, 2);
});

test('casting vm: candidates, quiet typing and casting', () => {
  const { vm, P, draws } = cstVM();
  const d = draws(); vm.updateCandidate('c1', 'notes', 'Great read', { quiet: true }); eq(draws(), d);
  vm.updateRole('name', 'MARGOT KELLER'); eq(draws(), d + 1, 'the role name shows in the list');
  const c = vm.addCandidate(); eq(vm.role.candidates.length, 3); vm.updateCandidate(c.id, 'name', 'Cy');
  vm.rate(c.id, 3); vm.setStatus(c.id, 'audition'); eq([c.rating, c.status], [3, 'audition']);
  const p = vm.cast('c1'); eq([p.character, vm.castOf(vm.role).id], ['MARGOT KELLER', 'c1']);
  vm.reopen(); eq(vm.role.castId, ''); vm.removeCandidate(c.id); eq(vm.role.candidates.length, 2);
  eq(P.people.length, 2);
});
