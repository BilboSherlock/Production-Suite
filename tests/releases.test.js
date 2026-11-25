'use strict';
/* Releases & permits — model and view-model tests */
const RLM = ReleasesModel;
const T0 = '2026-06-15';

test('releases: ages, expiry, filters and totals', () => {
  eq([RLM.ageOn('2008-06-15', T0), RLM.ageOn('2008-06-16', T0), RLM.ageOn('', T0), RLM.ageOn('soon', T0)], [18, 17, null, null], 'birthday-exact, in the user’s own dates');
  const H = { releases: [RLM.item('Model release', { status: 'Signed', expires: '2026-01-01' }), RLM.item('Location permit', { status: 'Sent' }), RLM.item('Other', { status: 'N/A' }), RLM.item('Other', { status: 'Signed', expires: '2027-01-01' })] };
  eq([RLM.isExpired(H.releases[0], T0), RLM.isExpired(H.releases[3], T0), RLM.isExpired(RLM.item('x', { expires: '2020-01-01' }), T0)], [true, false, false], 'only signed items expire');
  eq(RLM.stats(H, T0), { total: 4, open: 1, done: 3, expired: 1 });
  eq([RLM.filter(H.releases, 'open', T0).length, RLM.filter(H.releases, 'expired', T0).length, RLM.filter(H.releases, 'Other', T0).length, RLM.filter(H.releases, '', T0).length], [1, 1, 2, 4]);
  eq(RLM.printRows(H)[1], ['Location permit', '', 'Sent', '', '', '']);
});

test('releases: editing — signing stamps the date', () => {
  const H = {}, r = RLM.add(H, 'Property release', { who: 'Pier' });
  eq([RLM.update(r, 'status', 'Signed', T0), r.date], [true, T0]);
  r.date = '2026-01-02'; RLM.update(r, 'status', 'Sent', T0); RLM.update(r, 'status', 'Signed', T0); eq(r.date, '2026-01-02', 'an existing date is kept');
  eq([RLM.update(r, 'status', 'Maybe'), RLM.update(r, 'kind', 'Nope'), RLM.update(r, 'id', 'x'), RLM.update(r, 'notes', 'Ok')], [false, false, false, true]);
  eq([RLM.remove(H, r.id), RLM.remove(H, r.id), H.releases.length], [true, false, 0]);
});

test('releases: generating the checklist from cast and locations', () => {
  const P = fakeProject({ people: [{ id: 'a', type: 'cast', name: 'Ann', dob: '2010-01-01' }, { id: 'b', type: 'cast', name: 'Bo', docs: { release: true } }, { type: 'crew', name: 'Cy' }, { type: 'cast', name: '' }],
    locations: [{ id: 'l1', name: 'Pier', permit: 'Applied' }, { id: 'l2', name: 'Barn', permit: 'Not needed' }, { name: '' }] });
  const H = { releases: [RLM.item('Model release', { who: 'ann' })] };
  eq(RLM.generate(P, H, T0), 7);
  eq(H.releases.map(r => `${r.kind}:${r.who}:${r.status}`), ['Model release:ann:Needed', 'Minor consent:Ann:Needed', 'Model release:Bo:Signed', 'Property release:Pier:Needed', 'Location permit:Pier:Sent', 'Property release:Barn:Needed', 'Insurance certificate:Production liability:Needed', 'Usage agreement:Client usage terms:Needed']);
  eq([H.releases[1].personId, H.releases[4].locationId], ['a', 'l1']);
  eq(RLM.generate(P, H, T0), 0, 'nothing twice'); eq(RLM.whoSuggestions(P), ['Ann', 'Bo', 'Cy', 'Pier', 'Barn']);
});

test('releases vm: filter, quiet typing and commands', () => {
  const P = fakeProject({ photo: {}, people: [], locations: [] }), ui = { releases: { filter: 'bogus' } };
  const vm = new ReleasesVM({ project: () => P, store: fakeStore(P), ui, fx: { holder: Q => Q.photo, today: () => T0 } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.filter, vm.total], ['', 0], 'a stale filter is ignored');
  const r = vm.add(); const d = draws; vm.set(r.id, 'who', 'Ann'); vm.set(r.id, 'notes', 'x'); eq(draws, d, 'typing is quiet');
  vm.set(r.id, 'status', 'Signed'); eq([draws, r.date, vm.stats.done], [d + 1, T0, 1]);
  vm.set(r.id, 'expires', '2026-01-01'); eq([vm.stats.expired, vm.expired(r)], [1, true]);
  vm.setFilter('open'); eq(vm.rows, []); vm.setFilter('expired'); eq(vm.rows.length, 1);
  eq(vm.generate(), 2); vm.remove(r.id); eq(vm.total, 2);
});
