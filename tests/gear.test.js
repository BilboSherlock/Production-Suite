'use strict';
/* Gear & rentals — model and view-model tests (photo shoots and podcasts) */
const GRM = GearModel;

test('gear: kinds, starter kits, cost and stats', () => {
  eq([GRM.kind('photo').cats[0], GRM.kind('podcast').cats[0], GRM.kind('screenplay').title], ['Camera', 'Microphones', 'Gear & rentals']);
  const kit = GRM.starter('photo'); eq([kit.length, kit[0].status, kit[0].source, kit[0].id !== kit[1].id], [19, 'Needed', 'Owned', true]);
  eq(GRM.starter('podcast').length, 12);
  const a = GRM.item('Lenses', { qty: 2, rate: 50 }), b = GRM.item('Lighting', { qty: 1, rate: 100, days: 1, status: 'On set', source: 'Pixel Hire' });
  eq([GRM.days(a, 3), GRM.days(a, 0), GRM.cost(a, 3), GRM.cost(b, 3)], [3, 1, 300, 100]);
  const H = { gear: [a, b] }; eq(GRM.stats(H, 3), { count: 2, ready: 1, total: 400 }); eq(GRM.sources(H), ['Owned', 'Pixel Hire']);
  eq(GRM.stats({}, 1), { count: 0, ready: 0, total: 0 }, 'no list yet');
});

test('gear: editing, groups, budget and reports', () => {
  const H = {}; const a = GRM.add(H, 'Camera', { name: 'Body' }); const b = GRM.add(H, 'Lighting', { name: 'LED', rate: 40, source: 'Hire Co' });
  eq([GRM.update(a, 'qty', '2'), GRM.update(a, 'id', 'x'), a.qty], [true, false, '2']);
  const c = GRM.duplicate(H, a.id); eq([H.gear.indexOf(c), c.name], [1, 'Body']); eq(GRM.remove(H, c.id), true); eq(GRM.remove(H, 'nope'), false);
  eq(GRM.groups(H.gear, GRM.kind('photo').cats).map(g => g.cat), ['Camera', 'Lighting']);
  eq(GRM.groups(H.gear, GRM.kind('photo').cats, 'led').map(g => g.items[0].name), ['LED']);
  eq(GRM.groups(H.gear, GRM.kind('photo').cats, '', 'Returned'), []);
  const P = { budget: [] };
  eq(GRM.syncBudget(P, H, GRM.kind('photo').budget, 2), 1); eq(P.budget[0], { id: P.budget[0].id, auto: 'gear:' + b.id, cat: 'Lighting', desc: 'LED (Hire Co)', qty: 2, unit: 'Day', rate: 40 });
  b.rate = 60; GRM.syncBudget(P, H, {}, 2, 'Misc'); eq([P.budget.length, P.budget[0].rate, P.budget[0].cat], [1, 60, 'Misc'], 'kept in step, not duplicated');
  eq(GRM.packRows(H, ['Lighting', 'Camera']).map(r => r.grp || r[2]), ['Lighting', 'LED', 'Camera', 'Body']);
  eq(GRM.rentals(H, 2), [{ source: 'Hire Co', items: [b], total: 120 }]);
  eq(GRM.csv(H, 2)[2], ['Lighting', 'LED', 1, 'Hire Co', 60, 2, 120, '', '', 'Needed', '']);
  eq(PodcastModel.gearCost(b, 2), 120, 'the Podcast suite uses the same rules');
});

test('gear vm: photo and podcast lists, filters and commands', () => {
  const P = fakeProject({ mode: 'photo', photo: {}, budget: [] }), ui = {};
  const vm = new GearVM({ project: () => P, store: fakeStore(P), ui, fx: { holder: Q => Q.mode === 'podcast' ? (Q.podcast = Q.podcast || {}) : Q.photo, nDays: () => 2 } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.gear, vm.kind.title], [[], 'Gear & rentals']);
  eq(vm.add('Microphones'), null, 'not a photo category'); const g = vm.add('Camera');
  vm.set(g.id, 'name', 'Body'); vm.set(g.id, 'rate', '10'); const d = draws; eq(draws, d); eq(vm.cost(g), 20);
  eq(vm.set(g.id, 'status', 'In Studio'), false, 'a podcast status'); vm.set(g.id, 'status', 'On set'); eq([draws, vm.stats.ready], [d + 1, 1]);
  eq(vm.toBudget(), 1); eq(P.budget[0].cat, 'Camera & grip');
  vm.duplicate(g.id); eq(vm.gear.length, 2); vm.remove(vm.gear[1].id); eq(vm.gear.length, 1);
  vm.setSearch('zzz'); eq([vm.groups, ui.gear.q], [[], 'zzz']); vm.setSearch(''); vm.setStatusFilter('bogus'); eq(ui.gear.status, '');
  eq(vm.addStarter(), 19); eq(vm.gear.length, 20);
  P.mode = 'podcast'; eq([vm.gear, vm.kind.title], [[], 'Studio Gear & Mics']); eq(vm.addStarter(), 12); eq(P.podcast.gear.length, 12);
  P.podcast.gear[0].rate = 5; vm.toBudget(); eq(P.budget.slice(-1)[0].cat, 'Sound Design & Foley');
});
