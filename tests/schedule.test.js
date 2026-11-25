'use strict';
/* Schedule: model rules and view-model behaviour */

const sc = (id, eighths = 8, extra = {}) => Object.assign({ id, num: id.replace(/\D/g, ''), eighths, label: 'INT. ' + id.toUpperCase(), ioe: 'INT', tod: 'DAY', location: '' }, extra);
const schedProject = (extra = {}) => fakeProject(Object.assign({ mode: 'screenplay', days: [], settings: {} }, extra));

/* ---------- model ---------- */
test('schedule: createDay defaults by format', () => {
  eq(ScheduleModel.createDay(schedProject(), '2026-05-01').kind, 'Shoot');
  const d = ScheduleModel.createDay(schedProject({ mode: 'stage' }));
  eq([d.kind, d.date, d.sceneIds, d.cs.crew], ['Rehearsal', '', [], '07:00']);
  eq(ScheduleModel.kindsFor(schedProject({ mode: 'stage' }))[4], 'Performance');
});
test('schedule: addDays skips weekends when asked', () => {
  eq(ScheduleModel.addDays('2026-11-27', 1, false), '2026-11-28', 'Fri → Sat');
  eq(ScheduleModel.addDays('2026-11-27', 1, true), '2026-11-30', 'Fri → Mon');
  eq(ScheduleModel.addDays('2026-11-28', 0, true), '2026-11-30', 'Sat, n=0 → Mon');
  eq(ScheduleModel.addDays('2026-12-31', 1), '2027-01-01', 'year rollover');
});
test('schedule: stripClass by INT/EXT and day/night', () => {
  eq(['INT', 'EXT', 'EST', ''].map(ioe => ScheduleModel.stripClass({ ioe, night: false })), ['s-int-day', 's-ext-day', 's-ext-day', 's-x']);
  eq(ScheduleModel.stripClass({ ioe: 'INT', night: true }), 's-int-night');
});
test('schedule: addDay picks the next weekday after the last day', () => {
  const P = schedProject();
  eq(ScheduleModel.addDay(P).date, '', 'first day is undated');
  P.days[0].date = '2026-11-27';
  eq(ScheduleModel.addDay(P).date, '2026-11-30');
  eq(ScheduleModel.addDay(P, '2027-01-04').date, '2027-01-04', 'explicit date');
});
test('schedule: moveScene books, reorders and unschedules', () => {
  const P = schedProject(), a = ScheduleModel.addDay(P), b = ScheduleModel.addDay(P);
  ScheduleModel.moveScene(P, 's1', a.id); ScheduleModel.moveScene(P, 's2', a.id); ScheduleModel.moveScene(P, 's3', a.id, 0);
  eq(a.sceneIds, ['s3', 's1', 's2']);
  ScheduleModel.moveScene(P, 's1', b.id, 0);
  eq([a.sceneIds, b.sceneIds], [['s3', 's2'], ['s1']], 'a scene is only ever on one day');
  ScheduleModel.moveScene(P, 's2', null);
  eq(a.sceneIds, ['s3']);
  eq(ScheduleModel.moveScene(P, 's3', 'no-such-day'), false); eq(a.sceneIds, ['s3'], 'bad target changes nothing');
});
test('schedule: moveScene positions among live scenes and keeps deleted-scene links', () => {
  const P = schedProject(), d = ScheduleModel.addDay(P);
  d.sceneIds = ['s1', 'gone', 's2'];
  ScheduleModel.moveScene(P, 's9', d.id, 1, new Set(['s1', 's2', 's9']));   // visible: s1, s2 → before s2
  eq(d.sceneIds, ['s1', 'gone', 's9', 's2']);
});
test('schedule: dayScenes, unscheduled and stats ignore deleted scenes without removing them', () => {
  const P = schedProject(), d = ScheduleModel.addDay(P), scenes = [sc('s1', 8), sc('s2', 4), sc('s3', 12)];
  d.sceneIds = ['s2', 'gone'];
  eq(ScheduleModel.dayScenes(P, d, scenes).map(s => s.id), ['s2']);
  eq(ScheduleModel.unscheduled(P, scenes).map(s => s.id), ['s1', 's3']);
  eq(ScheduleModel.stats(P, scenes), { scenes: 3, scheduled: 1, unscheduled: 2, days: 1, eighths: 24, split: 0 });
  eq(d.sceneIds, ['s2', 'gone'], 'link kept for undo / clean-up');
});
test('schedule: sortByDate puts undated days last and keeps their order', () => {
  const P = schedProject();
  ['2026-12-03', '', '2026-12-01', ''].forEach((date, i) => Object.assign(ScheduleModel.addDay(P, date), { tag: i }));
  ScheduleModel.sortByDate(P);
  eq(P.days.map(d => d.tag), [2, 0, 1, 3]);
});
test('schedule: updateDay validates the date', () => {
  const P = schedProject(), d = ScheduleModel.addDay(P);
  ScheduleModel.updateDay(P, d.id, { date: '2026-02-03', kind: 'Pickup' }); eq([d.date, d.kind], ['2026-02-03', 'Pickup']);
  ScheduleModel.updateDay(P, d.id, { date: 'garbage' }); eq(d.date, '');
});
test('schedule: day length and minutes per page are clamped', () => {
  const P = schedProject();
  ScheduleModel.setDayHours(P, 40); eq(P.settings.dayHours, 24);
  ScheduleModel.setDayHours(P, ''); eq(P.settings.dayHours, 10);
  ScheduleModel.setMinsPerPage(P, 1); eq(P.settings.minsPerPage, 5);
});
test('schedule: autoSchedule fills days to the page target, grouped by location', () => {
  const P = schedProject(), scenes = [sc('s1', 16, { location: 'HOUSE' }), sc('s2', 16, { location: 'PARK' }), sc('s3', 16, { location: 'HOUSE' }), sc('s4', 8, { location: 'PARK' })];
  const made = ScheduleModel.autoSchedule(P, scenes, { pagesPerDay: 4, start: '2026-11-27', skipWeekends: true }, s => s.location);
  eq(made.map(d => [d.date, d.sceneIds]), [['2026-11-27', ['s1', 's3']], ['2026-11-30', ['s2', 's4']]]);
  eq(ScheduleModel.autoSchedule(P, scenes, {}), [], 'nothing left to schedule');
});
test('schedule: autoSchedule without grouping, weekends allowed, oversized scenes get their own day', () => {
  const P = schedProject(), scenes = [sc('s1', 40), sc('s2', 8), sc('s3', 8)];
  const made = ScheduleModel.autoSchedule(P, scenes, { pagesPerDay: 2, start: '2026-11-27', skipWeekends: false, groupByLocation: false });
  eq(made.map(d => [d.date, d.sceneIds]), [['2026-11-27', ['s1']], ['2026-11-28', ['s2', 's3']]]);
});
test('schedule: autoSchedule moves a weekend start date to Monday; undated stays undated', () => {
  const P = schedProject();
  eq(ScheduleModel.autoSchedule(P, [sc('s1')], { start: '2026-11-28' })[0].date, '2026-11-30');
  eq(ScheduleModel.autoSchedule(P, [sc('s2')], { start: '' })[0].date, '');
});
test('schedule: calendar grid covers six weeks from the Sunday before the 1st', () => {
  const cells = ScheduleModel.calendarCells('2026-11');   // 1 Nov 2026 is a Sunday
  eq(cells.length, 42); eq([cells[0].iso, cells[0].inMonth], ['2026-11-01', true]);
  eq([cells[30].iso, cells[30].inMonth], ['2026-12-01', false]);
  eq(ScheduleModel.calendarCells('2026-12')[0].iso, '2026-11-29');
  eq([ScheduleModel.shiftMonth('2026-12', 1), ScheduleModel.shiftMonth('2026-01', -1)], ['2027-01', '2025-12']);
  const P = schedProject(); eq(ScheduleModel.firstMonth(P, '2026-11-24'), '2026-11');
  ScheduleModel.addDay(P, '2027-03-02'); ScheduleModel.addDay(P, '2027-02-10'); eq(ScheduleModel.firstMonth(P), '2027-02');
});

/* ---------- view model ---------- */
const makeSchedVM = (P = schedProject(), scenes = [sc('s1', 8, { location: 'HOUSE' }), sc('s2', 4, { location: 'PARK' }), sc('s3', 12, { location: 'HOUSE' })]) => {
  const store = fakeStore(P), ui = {}; let sceneCalls = 0;
  const vm = new ScheduleVM({ project: () => store.P, store, ui, today: () => '2026-11-24',
    scenes: () => { sceneCalls++; return scenes; }, locName: (P, s) => s.location, sceneCast: () => new Set(['ANA']), sceneEst: (P, s) => s.eighths * 7.5,
    dayPlan: (P, d, list) => ({ mins: 0, moves: 0, cap: 600, over: false }), conflicts: (P, d) => d.date === '2026-12-25' ? ['Holiday'] : [], turnaround: () => '' });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, store, ui, P, draws: () => draws, sceneCalls: () => sceneCalls };
};
test('schedule vm: dropping strips records a change and redraws', () => {
  const { vm, P, store, draws } = makeSchedVM(), d = vm.addDay();
  vm.dropScene('s3', d.id, 0); vm.dropScene('s1', d.id, 0);
  eq(P.days[0].sceneIds, ['s1', 's3']); eq(store.touches, 3); eq(draws(), 3);
  eq(vm.unscheduled.map(s => s.id), ['s2']);
  vm.dropScene('s1', null, 0); eq(vm.stats.scheduled, 1);
});
test('schedule vm: day cards carry totals, locations and warnings', () => {
  const { vm } = makeSchedVM(), d = vm.addDay('2026-12-25');
  vm.dropScene('s1', d.id, 0); vm.dropScene('s2', d.id, 1); vm.dropScene('s3', d.id, 2);
  const card = vm.days[0];
  eq([card.n, card.eighths, card.locations, card.conflicts, card.kind], [1, 24, ['HOUSE', 'PARK'], ['Holiday'], 'Shoot']);
  const expect = { id: 's1', sceneId: 's1', num: '1', part: null, label: '', cls: 's-int-day', ie: 'INT·DAY', title: 'HOUSE', sub: 'ANA', eighths: 8, mins: 60 };
  eq(vm.strip(card.slots[0]), expect, 'from a slot');
  eq(vm.strip(card.scenes[0]), expect, 'from a plain scene');
});
test('schedule vm: scenes are read from the script once per redraw', () => {
  const { vm, sceneCalls } = makeSchedVM();
  vm.days; vm.unscheduled; vm.stats; eq(sceneCalls(), 1, 'cached');
  vm.addDay(); vm.stats; eq(sceneCalls(), 2, 'refreshed after a change');
});
test('schedule vm: mode and month are UI state; month opens on the first dated day', () => {
  const P = schedProject(); ScheduleModel.addDay(P, '2027-02-10');
  const { vm, store, ui } = makeSchedVM(P);
  eq(vm.month, '2027-02'); vm.shiftMonth(-2); eq(vm.month, '2026-12'); vm.thisMonth(); eq(vm.month, '2026-11');
  vm.setMode('calendar'); eq([vm.mode, ui.schedule.mode], ['calendar', 'calendar']); eq(store.touches, 0, 'not project changes');
});
test('schedule vm: calendar cells list the days on each date', () => {
  const { vm } = makeSchedVM(), a = vm.addDay('2026-11-26'); vm.addDay('2026-12-25'); vm.addDay('');
  vm.dropScene('s1', a.id, 0); a.sceneIds.push('gone');
  const cal = vm.calendar, cell = iso => cal.cells.find(c => c.iso === iso);
  eq(cell('2026-11-26').days, [{ id: a.id, n: 1, count: 1, conflicts: [] }], 'deleted scenes not counted');
  eq(cell('2026-11-24').isToday, true); eq(cal.undated, 1);
});
test('schedule vm: autoSchedule uses the location helper and reports days made', () => {
  const { vm, P } = makeSchedVM();
  eq(vm.autoStart, '2026-11-24');
  eq(vm.autoSchedule({ pagesPerDay: 3, start: '2026-11-24' }), 1, '24 eighths fit one 3-page day');
  eq(P.days[0].sceneIds, ['s1', 's3', 's2'], 'HOUSE scenes grouped');
  eq(vm.autoSchedule({}), 0, 'nothing left');
  eq(vm.autoStart, '2026-11-25');
});
test('schedule vm: print groups by day then unscheduled', () => {
  const { vm } = makeSchedVM(), d = vm.addDay(); vm.dropScene('s2', d.id, 0);
  const g = vm.printGroups();
  eq(g.map(x => [x.day && x.day.n, x.rows.map(r => r[0])]), [[1, ['2']], [null, ['1', '3']]]);
  eq(g[0].rows[0], ['2', 'INT', 'DAY', 'PARK', undefined, 'ANA', 4]);
});

test('schedule: strip labels use standard abbreviations and never cut a word', () => {
  const L = s => ScheduleModel.stripLabel(s);
  eq([L({ ioe: 'INT', tod: 'DAY' }), L({ ioe: 'EXT', tod: 'MORNING' }), L({ ioe: 'INT/EXT', tod: 'CONTINUOUS' }), L({ ioe: 'INT', tod: 'Moments later' })], ['INT·DAY', 'EXT·MORN', 'INT/EXT·CONT', 'INT·LATER']);
  eq([L({ ioe: '', tod: 'LATER' }), L({}), L({ ioe: 'EXT', tod: 'Late afternoon' })], ['LATER', '—', 'EXT·LATE'], 'a stage scene has no INT/EXT; a long time of day keeps its first word');
});
