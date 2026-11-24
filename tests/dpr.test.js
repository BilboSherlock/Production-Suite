'use strict';
/* Daily production report: model rules and view model */

const dpScenes = () => [{ id: 's1', num: '1', eighths: 8, label: 'INT. A', location: 'Lobby' }, { id: 's2', num: '2', eighths: 4, label: 'EXT. B', location: '' }];
const dpProject = () => {
  const P = fakeProject({ title: 'Reel', days: [], sceneMeta: {}, reports: {}, shots: [], takes: [] });
  const d1 = ScheduleModel.addDay(P, '2026-12-01'), d2 = ScheduleModel.addDay(P, '2026-12-02');
  d1.sceneIds = ['s1', 'gone']; d2.sceneIds = ['s2']; d1.cs = { crew: '07:00', shoot: '08:00' };
  return P;
};

/* ---------- model ---------- */
test('dpr: times and durations', () => {
  eq([DprModel.toMins('07:30'), DprModel.toMins(''), DprModel.toMins('soon')], [450, null, null]);
  eq([DprModel.fmtDur(605), DprModel.fmtDur(null), DprModel.fmtDur(-5)], ['10h 05m', '', '']);
});
test('dpr: hours worked = wrap − crew call (falls back to call sheet) − lunch', () => {
  const P = dpProject(), d = P.days[0], R = DprModel.create();
  eq(DprModel.hoursWorked(R, d), null, 'no wrap yet');
  R.t.wrap = '19:00'; eq(DprModel.hoursWorked(R, d), 720, 'call sheet crew call');
  Object.assign(R.t, { crew: '06:00', lunchOut: '12:00', lunchIn: '12:30' }); eq(DprModel.hoursWorked(R, d), 750);
});
test('dpr: reading never adds a report or scene rows', () => {
  const P = dpProject(), sc = dpScenes();
  DprModel.read(P, P.days[0].id); DprModel.rows(P, P.days[0], sc, s => s.location); DprModel.toDate(P, 1, sc);
  eq(P.reports, {}); eq(DprModel.has(P, P.days[0].id), false);
});
test('dpr: totals count shot pages by status, today and to date', () => {
  const P = dpProject(), sc = dpScenes(), [d1, d2] = P.days;
  DprModel.setScene(P, d1.id, 's1', 'status', 'Partial'); DprModel.setScene(P, d1.id, 's1', 'pgs', '5'); DprModel.setScene(P, d1.id, 's1', 'setups', '7');
  DprModel.setScene(P, d2.id, 's2', 'status', 'Not shot'); DprModel.setScene(P, d2.id, 's2', 'pgs', '4');
  eq(DprModel.dayTotals(P, d1, sc), { sched: 8, shot: 5, setups: 7 });
  eq(DprModel.toDate(P, 1, sc), { sched: 12, shot: 5, setups: 7, diff: -7 }, '"Not shot" pages do not count');
  eq(DprModel.setScene(P, d1.id, 's1', 'hack', 1), false); eq(DprModel.setField(P, d1.id, 'scenes', 1), false); eq(DprModel.setTime(P, d1.id, 'lunchOut', '12:00'), true);
});
test('dpr: a split scene schedules only its share of pages', () => {
  const P = dpProject(), sc = dpScenes(), [, p2] = ScheduleModel.setSplit(P, sc[0], [3, 5]);
  ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p2.id), P.days[1].id, 0);
  eq(DprModel.rows(P, P.days[0], sc, s => s.location).map(r => [r.num, r.part, r.sched]), [['1', 'pt 1/2', 3]]);
  eq(DprModel.dayTotals(P, P.days[1], sc).sched, 9);
  P.shots = [{ id: 'x', sceneId: 's1', done: true }];
  DprModel.autoFill(P, P.days[1], sc); eq(P.reports[P.days[1].id].scenes.s1, { setups: '1', status: 'Completed', pgs: '5' });
});
test('dpr: fill from shot list uses done shots and circled takes, and the call sheet crew call', () => {
  const P = dpProject(), sc = dpScenes(), d = P.days[0];
  P.shots = [{ id: 'a', sceneId: 's1', done: true }, { id: 'b', sceneId: 's1' }, { id: 'c', sceneId: 's1' }]; P.takes = [{ shotId: 'b', status: 'circle' }];
  eq(DprModel.autoFill(P, d, sc), 1);
  const R = P.reports[d.id]; eq([R.scenes.s1, R.t.crew], [{ setups: '2', status: 'Partial' }, '07:00']);
  eq(DprModel.autoFill(P, P.days[1], sc), 0); eq(P.reports[P.days[1].id].scenes, {}, 'no empty rows for scenes with nothing done');
});
test('dpr: heading names the kind of day', () => {
  eq(DprModel.heading({ kind: 'Shoot' }, 1, 3), 'DAILY PRODUCTION REPORT — Day 1 of 3');
  eq(DprModel.heading({ kind: 'Performance' }, 2, 3), 'PERFORMANCE REPORT — Day 2 of 3');
  eq(DprModel.heading({ kind: 'Rehearsal' }, 3, 3), 'REHEARSAL REPORT — Day 3 of 3');
});

/* ---------- view model ---------- */
const makeDprVM = (opts = {}) => {
  const P = dpProject(), store = fakeStore(P), ui = {};
  const mk = (o = {}) => new DprVM(Object.assign({ project: () => store.P, store, ui, scenes: () => dpScenes(), locOf: (P, s) => s.location, fmtEighths: n => n + '/8', fmtDateShort: d => 'd' + d }, o));
  const vm = mk(opts); let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, store, ui, mk, draws: () => draws };
};
test('dpr vm: opens the day in the address, else the last viewed, else the first; ✓ marks reported days', () => {
  const { vm, P, ui, mk } = makeDprVM();
  eq(vm.n, 1); eq(mk({ dayId: P.days[1].id }).n, 2); eq(ui.dprDay, P.days[1].id); eq(mk().n, 2);
  ui.dprDay = 'deleted'; eq(vm.n, 1);
  vm.setField('weather', 'Rain'); eq(vm.dayOptions.map(o => o.label), ['Day 1 — d2026-12-01 ✓', 'Day 2 — d2026-12-02']);
});
test('dpr vm: typing saves quietly; crew call and wrap redraw hours worked', () => {
  const { vm, P, store, draws } = makeDprVM(), id = P.days[0].id;
  vm.setField('weather', 'Fog'); vm.setScene('s1', 'pgs', '6'); vm.setPerf('att', '100'); vm.setTime('first', '08:10');
  eq([store.touches, draws()], [4, 0]);
  eq([P.reports[id].weather, P.reports[id].scenes.s1.pgs, P.reports[id].perf.att, P.reports[id].t.first], ['Fog', '6', '100', '08:10']);
  vm.setTime('wrap', '18:00'); eq([draws(), vm.hoursWorked], [1, '11h 00m']);
});
test('dpr vm: totals text, rows and csv', () => {
  const { vm } = makeDprVM();
  vm.setScene('s1', 'status', 'Completed'); vm.setScene('s1', 'pgs', '8');
  eq([vm.totals.day.shot, vm.totals.toDateText, vm.totals.behind], [8, '8/8 / 8/8 · on schedule', false]);
  vm.selectDay(vm.P.days[1].id); eq([vm.totals.toDateText, vm.totals.behind], ['8/8 / 12/8 · behind 4/8', true]);
  eq(vm.rows.map(r => r.place), ['EXT. B'], 'no location → scene heading');
  eq(vm.csv, { name: 'reel-dpr-day2.csv', rows: [['Scene', 'Description', 'Scheduled pgs', 'Status', 'Pgs shot (eighths)', 'Setups', 'Notes'], ['2', 'EXT. B', '4/8', '', '', '', '']] });
});
test('dpr vm: fill from shot list redraws', () => {
  const { vm, P, draws } = makeDprVM(); P.shots = [{ id: 'a', sceneId: 's1', done: true }];
  eq(vm.autoFill(), 1); eq(draws(), 1); eq(vm.report.scenes.s1.status, 'Completed');
});
