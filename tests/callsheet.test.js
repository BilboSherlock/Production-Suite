'use strict';
/* Call sheet: model rules and view-model behaviour */

const csScene = (id, num, chars, extra = {}) => Object.assign({ id, num, eighths: 8, ioe: 'INT', tod: 'DAY', label: 'INT. ' + id, location: '', synopsis: '', chars }, extra);
const csProject = () => {
  const P = fakeProject({ title: 'Reel', mode: 'screenplay', days: [], settings: {}, sceneMeta: {}, locations: [], props: [], wardrobe: [],
    people: [
      { id: 'a1', type: 'cast', name: 'Ana Lee', character: 'MAYA', email: 'ana@example.test' },
      { id: 'a2', type: 'cast', name: 'Bo Park', character: 'Theo (V.O.)', email: '' },
      { id: 'a3', type: 'cast', name: 'Cy', character: 'GUARD', email: 'cy@example.test' },
      { id: 'c1', type: 'crew', name: 'Dee', dept: 'Camera', role: 'DP', phone: '555', email: 'dee@example.test' },
      { id: 'c2', type: 'crew', name: 'Eli', dept: 'Sound', role: 'Mixer', email: 'dee@example.test' }] });
  const d1 = ScheduleModel.addDay(P, '2026-12-01'), d2 = ScheduleModel.addDay(P, '2026-12-02');
  d1.sceneIds = ['s1', 's2', 'gone']; d2.sceneIds = ['s3'];
  return P;
};
const csScenes = [csScene('s1', '1', ['MAYA', 'THEO'], { location: 'CINEMA - LOBBY' }), csScene('s2', '2', ['MAYA', 'USHER'], { location: 'CINEMA - BOOTH' }), csScene('s3', '3', ['GUARD'], { location: 'ALLEY' })];
const castOfScene = s => new Set(s.chars);

/* ---------- model ---------- */
test('callsheet: cast rows match characters to actors and number them', () => {
  const P = csProject(), ds = csScenes.slice(0, 2);
  eq(CallSheetModel.castRows(P, ds, castOfScene).map(r => [r.ch, r.person && r.person.name, r.num]),
    [['MAYA', 'Ana Lee', 1], ['THEO', 'Bo Park', 2], ['USHER', null, null]], 'THEO matches "Theo (V.O.)"');
  eq(CallSheetModel.castNumbers(P, ds[1], castOfScene), [1, 'USHER']);
});
test('callsheet: recipients are that day\'s cast plus all crew, de-duplicated', () => {
  const P = csProject(), r = CallSheetModel.recipients(P, csScenes.slice(0, 2), castOfScene);
  eq(r.emails, ['ana@example.test', 'dee@example.test'], 'GUARD is not working; Dee and Eli share an address');
  eq(r.missing, ['Bo Park']);
});
test('callsheet: locations use the linked location card, else the heading', () => {
  const P = csProject();
  P.locations.push({ id: 'L1', name: 'Riverside Cinema', address: '1 River Rd', notes: 'Load in at back' }, { id: 'L2', name: 'Alley' });
  P.sceneMeta.s2 = { locationId: 'L1' };
  eq(CallSheetModel.locations(P, csScenes), [{ name: 'CINEMA - LOBBY', details: '' }, { name: 'Riverside Cinema', details: '1 River Rd — Load in at back' }, { name: 'ALLEY', details: '' }]);
});
test('callsheet: props and wardrobe list only what the day needs, with scene numbers', () => {
  const P = csProject(), numOf = id => ({ s1: '1', s2: '2', s3: '3' })[id];
  P.props.push({ id: 'p1', name: 'Reel can', category: 'Hand prop', qty: 2, status: 'Ready', sceneIds: ['s3', 's1'], storage: 'Box A', notes: '' }, { id: 'p2', name: 'Torch', sceneIds: ['s3'] });
  P.wardrobe.push({ id: 'w1', name: 'Usher coat', look: 'Look 1', qty: 1, status: 'Fitted', sceneIds: ['s2'], usage: { s2: ['USHER'] }, size: 'M', care: 'Steam' });
  eq(CallSheetModel.props(P, csScenes.slice(0, 2), numOf).map(x => [x.name, x.scenes, x.notes]), [['Reel can', ['1'], 'Box A']]);
  eq(CallSheetModel.wardrobe(P, csScenes.slice(0, 2), numOf, (x, sid) => x.usage[sid] || []).map(x => [x.name, x.characters, x.scenes, x.notes]), [['Usher coat', ['USHER'], ['2'], 'M — Steam']]);
});
test('callsheet: heading names the kind of day', () => {
  eq(CallSheetModel.heading({ kind: 'Shoot' }, 2, 5), 'CALL SHEET — Day 2 of 5');
  eq(CallSheetModel.heading({ kind: 'Rehearsal' }, 1, 3), 'REHEARSAL CALL — Day 1 of 3');
  eq(CallSheetModel.heading({}, 1, 1), 'CALL SHEET — Day 1 of 1');
});
test('callsheet: reading a call time never adds one; setting does', () => {
  const day = { cs: {}, calls: {} };
  eq(CallSheetModel.callFor(day, 'a1'), {}); eq(day.calls, {}, 'nothing added by reading');
  eq(CallSheetModel.setCall(day, 'a1', 'pickup', '06:15'), true); eq(day.calls, { a1: { pickup: '06:15' } });
  eq(CallSheetModel.setCall(day, 'a1', 'salary', '1'), false, 'unknown field refused');
  eq(CallSheetModel.setField(day, 'weather', 'Rain'), true); eq(CallSheetModel.setField(day, 'id', 'x'), false);
  eq(day.cs, { weather: 'Rain' });
});

/* ---------- view model ---------- */
const makeCsVM = (opts = {}) => {
  const P = csProject(), store = fakeStore(P), ui = {};
  const mk = (o = {}) => new CallSheetVM(Object.assign({ project: () => store.P, store, ui, scenes: () => csScenes, castOf: (P, s) => castOfScene(s),
    conflicts: (P, d) => d.date === '2026-12-02' ? ['Cy is unavailable'] : [], charsIn: () => [],
    fmtTime: t => 'T' + t, fmtDate: d => 'D' + d, fmtDateShort: d => 'd' + d, terms: () => ({ crewCall: 'Unit call' }) }, o));
  const vm = mk(opts); let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, store, ui, mk, draws: () => draws };
};
test('callsheet vm: opens the day in the address, else the last one viewed, else the first', () => {
  const { vm, P, ui, mk } = makeCsVM();
  eq(vm.n, 1, 'first by default');
  eq(mk({ dayId: P.days[1].id }).n, 2, 'from the address'); eq(ui.callDay, P.days[1].id);
  eq(mk().n, 2, 'remembered (Search sets UI.callDay too)');
  vm.selectDay('nope'); eq(vm.n, 2, 'unknown id ignored');
  ui.callDay = 'deleted'; eq(vm.n, 1, 'falls back if the day was deleted');
});
test('callsheet vm: day picker labels and switching redraws', () => {
  const { vm, P, draws } = makeCsVM();
  eq(vm.dayOptions.map(o => [o.label, o.selected]), [['Day 1 — d2026-12-01', true], ['Day 2 — d2026-12-02', false]]);
  vm.selectDay(P.days[1].id); eq(draws(), 1); eq(vm.dayOptions[1].selected, true);
});
test('callsheet vm: the sheet for a day', () => {
  const { vm, P } = makeCsVM(); P.days[0].calls = { c1: { set: '06:30' } };
  const s = vm.sheet;
  eq([s.heading, s.eighths, s.conflicts], ['CALL SHEET — Day 1 of 2', 16, []]);
  eq(s.scenes.map(x => [x.num, x.place, x.cast]), [['1', 'CINEMA - LOBBY', '1, 2'], ['2', 'CINEMA - BOOTH', '1, USHER']], 'deleted scene skipped');
  eq(s.cast.map(r => [r.ch, r.name, r.num]), [['MAYA', 'Ana Lee', 1], ['THEO', 'Bo Park', 2], ['USHER', null, null]]);
  eq(s.crew.map(r => [r.name, r.call.set || '', r.defaultCall]), [['Dee', '06:30', '07:00'], ['Eli', '', '07:00']]);
  eq(s.advance, { n: 2, date: '2026-12-02', scenes: ['3'] });
  vm.selectDay(P.days[1].id); eq([vm.sheet.advance, vm.sheet.conflicts], [null, ['Cy is unavailable']]);
});
test('callsheet vm: a split scene shows only today\'s part, and both days call its cast', () => {
  const { vm, P } = makeCsVM();
  const s1 = csScenes[0], [p1, p2] = ScheduleModel.setSplit(P, s1, [3, 5]);   // s1 is on day 1 → part 1 stays there
  ScheduleModel.setPartNote(P, 's1', p2.id, 'Reverses');
  ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p2.id), P.days[1].id, 0);
  const d1 = vm.sheet;
  eq([d1.eighths, d1.scenes[0].part, d1.scenes[0].eighths], [3 + 8, 'pt 1/2', 3], 'day 1: part 1 (3/8) + scene 2');
  eq(d1.advance.scenes, ['1 pt 2/2', '3']);
  vm.selectDay(P.days[1].id); const d2 = vm.sheet;
  eq([d2.scenes.map(x => [x.num, x.part, x.eighths, x.synopsis]), d2.eighths], [[['1', 'pt 2/2', 5, 'Reverses'], ['3', '', 8, '']], 13]);
  eq(d2.cast.map(r => r.ch), ['MAYA', 'THEO', 'GUARD'], 'cast for part 2 are called on day 2 too');
});
test('callsheet vm: typing saves quietly to the shown day', () => {
  const { vm, P, store, draws } = makeCsVM();
  vm.selectDay(P.days[1].id); const before = draws();
  vm.setField('weather', 'Fog'); vm.setCall('a3', 'makeup', '05:45');
  eq([P.days[1].cs.weather, P.days[1].calls.a3.makeup], ['Fog', '05:45']); eq(P.days[0].cs.weather, '', 'other day untouched');
  eq(store.touches, 2); eq(draws(), before, 'no redraw while typing');
});
test('callsheet vm: email lists recipients and builds the message', () => {
  const { vm, P } = makeCsVM(); Object.assign(P.days[0].cs, { wrap: '19:00', notes: 'Bring layers' });
  const e = vm.email;
  eq([e.emails, e.missing, e.subject], [['ana@example.test', 'dee@example.test'], ['Bo Park'], 'Reel — Call sheet — Day 1 (d2026-12-01)']);
  eq(e.body, ['Hi all,', '', 'Call sheet for Day 1 of 2 — D2026-12-01.', '', 'Unit call: T07:00', 'Shooting call: T08:00', 'Estimated wrap: T19:00',
    'Location: CINEMA - LOBBY; CINEMA - BOOTH', '', 'Scenes: 1, 2', '\nNotes: Bring layers', '', 'The full call sheet PDF is attached.', '', 'Thanks!'].join('\n'));
  const m = vm.mailto('Hi', 'x'); eq(m.url, 'mailto:?bcc=ana%40example.test%2Cdee%40example.test&subject=Hi&body=x'); eq(m.tooLong, false);
  eq(vm.mailto('s', 'y'.repeat(2000)).tooLong, true);
});
