'use strict';
/* Live desk: plan, forecast, the day's actions and the shared panels */

const at = (H, M = 0) => new Date(2026, 11, 1, H, M).getTime();          // local time on the shoot day
const lvScenes = () => [
  { id: 's1', num: '1', eighths: 8, label: 'INT. LOBBY', ioe: 'INT', tod: 'DAY', chars: ['MAYA'] },
  { id: 's2', num: '2', eighths: 4, label: 'INT. LOBBY', ioe: 'INT', tod: 'DAY', chars: ['MAYA', 'THEO'] },
  { id: 's3', num: '3', eighths: 8, label: 'EXT. ALLEY', ioe: 'EXT', tod: 'DAY', chars: ['THEO'] }];
const lvLoc = s => s.label.replace(/^(INT|EXT)\. /, '');
const lvProject = () => {
  const P = fakeProject({ title: 'Reel', mode: 'screenplay', days: [], sceneMeta: {}, settings: { minsPerPage: 60 }, reports: {}, shots: [], takes: [], tags: [], boards: [],
    people: [{ id: 'a1', type: 'cast', name: 'Ana', character: 'MAYA' }, { id: 'a2', type: 'cast', name: 'Bo', character: 'THEO' }, { id: 'c1', type: 'crew', name: 'Dee', role: 'DP' }] });
  const d1 = ScheduleModel.addDay(P, '2026-12-01'), d2 = ScheduleModel.addDay(P, '2026-12-02');
  d1.sceneIds = ['s1', 's2', 's3']; d1.cs = { crew: '07:00', shoot: '08:00', wrap: '19:00' }; d2.cs = {};
  return P;
};
const W0 = LiveModel.words({ mode: 'screenplay' });
const planOf = (P, L) => LiveModel.plan(P, P.days[0], L || LiveModel.read(P, P.days[0]), { scenes: lvScenes(), locOf: lvLoc, moveWord: 'Company move', mealHours: 6 });

/* ---------- model ---------- */
test('live: times and words', () => {
  eq([LiveModel.toMin('07:30'), LiveModel.toMin(''), LiveModel.fromMin(-30), LiveModel.fromMin(1445)], [450, null, '23:30', '00:05']);
  eq([LiveModel.durTxt(45), LiveModel.durTxt(-125)], ['45m', '2h 05m']);
  eq([LiveModel.words({ mode: 'photo' }).item, LiveModel.words({ mode: 'av' }).cast, LiveModel.words({ mode: 'stage' }).day], ['Setup', 'Talent', 'rehearsal or show day']);
});
test('live: the plan runs from shooting call with moves between locations and lunch', () => {
  const p = planOf(lvProject());
  eq(p.rows.map(r => [r.kind, r.id, r.start, r.dur]), [['scene', 's1', 480, 60], ['scene', 's2', 540, 30], ['move', 'mvs3', 570, 30], ['scene', 's3', 600, 60]]);
  eq([p.call, p.end, p.lunchAt], [480, 660, 750], 'lunch planned 4½ h after call; the day ends before it');
  eq(p.rows[2].label, 'Company move → ALLEY');
});
test('live: the plan follows the order set on the day, and splits take their share of time', () => {
  const P = lvProject(), sc = lvScenes(), L = LiveModel.ensure(P, P.days[0]); L.order = ['s3', 's1'];
  eq(planOf(P, L).rows.filter(r => r.kind === 'scene').map(r => r.id), ['s3', 's1', 's2'], 'scenes not in the order go last');
  ScheduleModel.setSplit(P, sc[0], [2, 6]);
  eq(LiveModel.est(P, sc[0], P.days[0]), 15, 'part 1 is 2/8 of a 60-minute scene');
});
test('live: the photo run of show is the plan when there is one', () => {
  const P = lvProject(); P.mode = 'photo'; P.photo = { runs: { [P.days[0].id]: [{ id: 'r1', start: '09:00', dur: 45, sceneId: 's1' }, { id: 'r2', kind: 'Lunch', dur: 30 }, { id: 'r3', kind: 'Move', title: 'To roof', dur: 15 }] } };
  const p = planOf(P);
  eq(p.rows.map(r => [r.kind, r.start, r.dur]), [['scene', 540, 45], ['lunch', 585, 30], ['move', 615, 15]]); eq([p.fromRun, p.end, p.lunchAt], [true, 630, 585]);
});
test('live: forecast before the day starts is the plan', () => {
  const P = lvProject(), L = LiveModel.read(P, P.days[0]), fc = LiveModel.forecast(planOf(P), L, 400, at(6, 40));
  eq([fc.wrap, fc.delta, fc.rows.every(r => r.state === 'pending')], [660, 0, true]);
});
test('live: running late pushes the forecast; done, active and dropped scenes count as they are', () => {
  const P = lvProject(), d = P.days[0], sc = lvScenes();
  LiveModel.startScene(P, d, sc[0], at(8, 30), W0);                       // 30 min late
  let L = LiveModel.read(P, d), fc = LiveModel.forecast(planOf(P, L), L, 9 * 60, at(9));
  eq([fc.rows[0].state, fc.rows[0].fs, fc.rows[0].fe, fc.rows[1].fs, fc.rows[1].late], ['active', 510, 570, 570, true]);
  eq(fc.delta, 30);
  LiveModel.completeScene(P, d, sc[0], at(9, 50), W0); LiveModel.dropScene(P, d, sc[1], 'Rain', W0, at(9, 51));
  L = LiveModel.read(P, d); fc = LiveModel.forecast(planOf(P, L), L, 600, at(10));
  eq(fc.rows.map(r => r.state), ['done', 'dropped', 'pending', 'pending'], 'the move still happens');
  eq([fc.rows[0].fe, fc.wrap], [590, 600 + 30 + 60]);
  LiveModel.startScene(P, d, sc[2], at(10, 5), W0); L = LiveModel.read(P, d);
  eq(LiveModel.forecast(planOf(P, L), L, 610, at(10, 10)).rows[2].state, 'skip', 'move skipped once the next scene starts');
});
test('live: an over-running scene keeps extending past now', () => {
  const P = lvProject(), d = P.days[0]; LiveModel.startScene(P, d, lvScenes()[1], at(8), W0);
  const L = LiveModel.read(P, d), r = LiveModel.forecast(planOf(P, L), L, 9 * 60, at(9)).rows.find(x => x.id === 's2');
  eq([r.over, r.fe], [true, 545], '30-min scene, 60 min in: ends 5 min from now');
});
test('live: status tile', () => {
  eq(LiveModel.status({ started: 0 }, 0), ['Not started', 'muted']); eq(LiveModel.status({ started: 1, ended: 2 }, 50), ['Wrapped', 'muted']);
  eq(LiveModel.status({ started: 1 }, 25), ['Behind 25m', 'bad']); eq(LiveModel.status({ started: 1 }, 10), ['Behind 10m', 'warn']);
  eq(LiveModel.status({ started: 1 }, -15), ['Ahead 15m', 'info']); eq(LiveModel.status({ started: 1 }, 3), ['On time', 'good']);
});
test('live: start, complete and wrap feed the daily report', () => {
  const P = lvProject(), d = P.days[0], sc = lvScenes(); P.shots = [{ id: 'x', sceneId: 's1' }, { id: 'y', sceneId: 's1' }];
  LiveModel.startDay(P, d, at(7, 2));
  const R = P.reports[d.id]; eq(R.t.crew, '07:00', 'crew call from the call sheet');
  LiveModel.startScene(P, d, sc[0], at(8, 5), W0); eq(R.t.first, '08:05');
  LiveModel.completeScene(P, d, sc[0], at(9), W0); eq(R.scenes.s1, { status: 'Completed', pgs: '8', setups: '2' });
  eq(P.live.days[d.id].log[0].msg, 'Completed scene 1 (55m vs 1h 00m planned)');
  eq(LiveModel.openIds(P, d), ['s2', 's3']);
  eq(LiveModel.wrapDay(P, d, at(18, 30), W0), ['s2', 's3']);
  eq([R.scenes.s2.status, R.t.wrap, P.live.days[d.id].items.s3.status, P.live.days[d.id].log[0].msg], ['Not shot', '18:30', 'dropped', 'Day wrapped at 18:30']);
  LiveModel.reopenDay(P, d); eq(P.live.days[d.id].ended, 0);
});
test('live: completing a part of a split scene reports only its pages', () => {
  const P = lvProject(), d = P.days[0], sc = lvScenes(); ScheduleModel.setSplit(P, sc[0], [3, 5]);
  LiveModel.completeScene(P, d, sc[0], at(9), W0); eq(P.reports[d.id].scenes.s1.pgs, '3');
});
test('live: reordering, delays and edited times', () => {
  const P = lvProject(), d = P.days[0], sc = lvScenes();
  eq(LiveModel.moveScene(P, d, ['s1', 's2', 's3'], sc[0], -1, W0, at(8)), false, 'already first');
  eq(LiveModel.moveScene(P, d, ['s1', 's2', 's3'], sc[0], 1, W0, at(8)), true); eq(P.live.days[d.id].order, ['s2', 's1', 's3']);
  LiveModel.addDelay(P, d, sc[2], 35, 'Cast late', 'Traffic', W0, at(10, 15), 'i1');
  const L = P.live.days[d.id]; eq([L.items.s3.extra, L.issues[0].cat, L.issues[0].sev, L.issues[0].sceneId], [35, 'Cast', 'High', 's3']);
  eq(P.reports[d.id].incidents, '10:15 — Scene 3: Cast late delay, 35 min (Traffic)');
  LiveModel.setTimes(P, d, sc[1], at(8), 0, W0, at(9)); eq(L.items.s2.status, 'active');
  LiveModel.setTimes(P, d, sc[1], at(8), at(8, 40), W0, at(9)); eq(L.items.s2.status, 'done');
  eq(LiveModel.timeOn('14:30', at(8)), at(14, 30)); eq(LiveModel.timeOn('', at(8)), 0);
});
test('live: moving a scene to another day', () => {
  const P = lvProject(), [d1, d2] = P.days, sc = lvScenes(); DprModel.setScene(P, d1.id, 's2', 'notes', 'x');
  eq(LiveModel.deferScene(P, d1, sc[1], 'next', W0, at(9)), true);
  eq([d1.sceneIds, d2.sceneIds, P.reports[d1.id].scenes.s2], [['s1', 's3'], ['s2'], undefined]);
  eq(LiveModel.deferScene(P, d1, sc[2], 'new', W0, at(9)), true);
  eq([P.days.length, P.days[1].date, P.days[1].sceneIds], [3, '2026-12-02', ['s3']], 'new day inserted after today');
  eq(LiveModel.deferScene(P, d1, sc[0], 'drop', W0, at(9)), true); eq(d1.sceneIds, []);
});
test('live: a split part cannot join another part of itself on the next day', () => {
  const P = lvProject(), [d1, d2] = P.days, sc = lvScenes(), [, p2] = ScheduleModel.setSplit(P, sc[0], [4, 4]);
  ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p2.id), d2.id, 0);
  eq(LiveModel.canDeferTo(d1, d2, 's1'), false); eq(LiveModel.deferScene(P, d1, sc[0], 'next', W0, at(9)), false);
  eq(d1.sceneIds.includes('s1'), true, 'nothing changed');
});
test('live: meal break and check-in', () => {
  const P = lvProject(), d = P.days[0];
  LiveModel.lunchOut(P, d, at(13)); LiveModel.lunchIn(P, d, at(13, 45));
  const L = P.live.days[d.id]; eq([P.reports[d.id].t.lunchOut, P.reports[d.id].t.lunchIn, L.log[0].msg], ['13:00', '13:45', 'Lunch in (45m)']);
  LiveModel.checkIn(L, P.people[0], 'On set', at(7)); eq([LiveModel.isHere(L, 'a1'), LiveModel.isHere(L, 'a2')], [true, false]);
  eq(LiveModel.mealDue(d, { call: 480 }, 6), 420 + 360);
});
test('live: problems — quick log guesses the category; resolve, task, remove', () => {
  eq([LiveModel.guessCat('Generator hum on mic', LiveModel.ISSUE_CATS), LiveModel.guessCat('???', LiveModel.ISSUE_CATS), LiveModel.guessCat('noise', ['Audio', 'Room']), LiveModel.guessCat('???', ['Audio', 'Room'])], ['Sound', 'Other', 'Audio', 'Room']);
  const P = lvProject(), L = LiveModel.ensure(P, P.days[0]);
  LiveModel.addIssue(L, { title: '  Lens fogged ', cat: 'Camera', sev: 'High' }, at(9), 'i1'); LiveModel.addIssue(L, { title: 'Late lunch', sev: 'Low' }, at(10), 'i2', 125);
  eq([L.issues[1].title, L.issues[0].tc, L.log[1].kind], ['Lens fogged', 125, 'warn']);
  eq(LiveModel.sortIssues(L.issues).map(i => i.id), ['i1', 'i2']);
  LiveModel.setIssueStatus(L, 'i1', 'Resolved', at(11)); eq([L.issues[1].resolvedAt, LiveModel.sortIssues(L.issues)[0].id], [at(11), 'i2']);
  const t = LiveModel.issueToTask(P, L, 'i1', '2026-12-01', at(12)); eq([t.title, t.priority, t.due, L.issues[1].taskId === t.id], ['Lens fogged', 'High', '2026-12-01', true]);
  eq(LiveModel.issueToTask(P, L, 'i1', '', 0), null, 'only once');
  LiveModel.updateIssue(L, 'i2', { title: ' Lunch 20 min late ', owner: 'Dee' }); eq([L.issues[0].title, L.issues[0].owner], ['Lunch 20 min late', 'Dee']);
  LiveModel.removeIssue(L, 'i2'); eq(L.issues.map(i => i.id), ['i1']);
});
test('live: tasks — add, advance, block; open list order', () => {
  const P = lvProject(), L = LiveModel.ensure(P, P.days[0]);
  const a = LiveModel.addTask(P, L, ' Call van ', '2026-12-01', at(9)), b = LiveModel.addTask(P, L, 'Gels', '2026-11-30', at(9));
  LiveModel.setBlocked(P, a.id, true); eq(LiveModel.openTasks(P).map(t => t.title), ['Call van', 'Gels'], 'blocked first');
  LiveModel.advanceTask(P, L, a.id, at(10)); eq(a.status, 'doing'); LiveModel.advanceTask(P, L, a.id, at(10)); eq([a.status, L.log[0].msg], ['done', 'Task done: Call van']);
  eq(LiveModel.openTasks(P, t => t.due < '2026-12-01').map(t => t.id), [b.id]);
});
test('live: reading never creates a record; the log copies into the report', () => {
  const P = lvProject(); LiveModel.read(P, P.days[0]); eq(P.live, undefined);
  const L = LiveModel.ensure(P, P.days[0]); LiveModel.log(L, 'Day started', 'sys', at(7)); LiveModel.log(L, 'Lunch out', 'sys', at(13));
  const R = DprModel.create(); R.notes = 'Hot day'; LiveModel.logToReport(R, L, W0); eq(R.notes, 'Hot day\n07:00 Day started\n13:00 Lunch out');
});

/* ---------- view model ---------- */
const makeLiveVM = (o = {}) => {
  const P = lvProject(), store = fakeStore(P), ui = {}; let clock = at(6, 30);
  const vm = new LiveVM({ project: () => store.P, store, ui, fx: Object.assign({ scenes: () => lvScenes(), locOf: (P, s) => lvLoc(s), castOf: (P, s) => new Set(s.chars), norm: n => n,
    clock: () => clock, today: () => '2026-12-01', fmtDateShort: d => 'd' + d, clockTxt: m => LiveModel.fromMin(m), moveWord: () => 'Move', mealHours: () => 6, turnaround: () => 10,
    has: (P, v) => v !== 'takes', catOrder: () => 0, catInfo: () => ({}), shotLabel: (P, x) => x.id, photoShotLabel: (P, x) => x.id, shotStatuses: () => ['Planned', 'Shot'], isOverdue: () => false }, o) });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, store, ui, setClock: (H, M) => { clock = at(H, M); vm.refresh(); }, draws: () => draws };
};
test('live vm: picks today, else the first day not wrapped', () => {
  const { vm, P, ui } = makeLiveVM();
  eq(vm.n, 1); eq(vm.dayOptions[0].label, 'Day 1 · d2026-12-01 (today)');
  ui.liveDay = P.days[1].id; eq(vm.n, 2); vm.selectDay('nope'); eq(vm.n, 2);
  const v2 = makeLiveVM({ today: () => '2027-01-01' }); v2.P.live = { days: { [v2.P.days[0].id]: { ended: 1 } } }; eq(v2.vm.n, 2);
  eq(P.live, undefined, 'looking never creates a record');
});
test('live vm: the board before and during the day', () => {
  const { vm, setClock } = makeLiveVM();
  let b = vm.board; eq([b.status, b.doneN, b.totalN, b.pgAll, b.nextMark.label, b.alerts.length, b.lunch], [['Not started', 'muted'], 0, 3, 20, 'Call-sheet wrap', 0, null]);
  eq([b.timeline.from, b.timeline.to], [450, 1170]);
  setClock(8, 40); vm.startScene('s1'); setClock(9, 0);
  b = vm.board; eq([b.active.map(r => r.id), b.pending[0].id, b.status[0], b.running], [['s1'], 's2', 'Behind 40m', 'Running 20m']);
  eq(b.alerts.map(a => a[0]), ['warn', 'warn', 'tip'], 'Ana and Bo are not here for scene 2; a tip to move a scene');
  eq(b.alerts[2][2], { label: 'Move scene…', cmd: 'defer', id: 's2' });
  vm.checkIn('a1', 'On set'); vm.checkIn('a2', 'Arrived'); eq(vm.board.alerts.map(a => a[0]), ['tip']);
});
test('live vm: meal alerts and lunch buttons', () => {
  const { vm, P, setClock } = makeLiveVM(); P.days[0].cs.lunch = '12:00';
  setClock(7); vm.startDay(); setClock(12, 45);
  eq([vm.board.alerts[0][0], vm.board.alerts[0][2], vm.board.lunch], ['warn', { label: 'Lunch out', cmd: 'lunchOut' }, 'out']);
  setClock(13, 5); eq(vm.board.alerts[0][0], 'crit', 'overdue');
  vm.lunchOut(); eq(vm.board.lunch, 'in'); setClock(13, 50); vm.lunchIn(); eq(vm.board.lunch, '45m');
});
test('live vm: scene context and menu', () => {
  const { vm, P } = makeLiveVM();
  P.shots = [{ id: 'A', sceneId: 's2', done: true, size: 'WS' }, { id: 'B', sceneId: 's2' }]; P.takes = [{ shotId: 'A', status: 'circle' }, { shotId: 'A' }];
  P.tags = [{ sceneId: 's2', cat: 'props', text: 'Cup' }, { sceneId: 's2', cat: 'props', text: 'cup' }, { sceneId: 's2', cat: 'cast', text: 'MAYA' }];
  const c = vm.context(vm.sceneOf('s2'));
  eq([c.shotsDone, c.shots[0].takes, c.shots[0].circled, c.cast.map(x => [x.ch, x.p.name, x.here]), c.needs.map(n => n.text)], [1, 2, 1, [['MAYA', 'Ana', false], ['THEO', 'Bo', false]], ['Cup']]);
  eq(c.links.map(l => l[0]), ['Script', 'Breakdown', 'Shot list', 'Storyboard']);
  vm.toggleShot('B'); eq(P.shots[1].done, true);
  eq(vm.menuFor({ it: { status: 'active' } }), { start: false, complete: true, delay: true, reorder: true, defer: true, drop: true, editTimes: true, reset: true });
  eq(vm.menuFor({ it: { status: 'done' } }).delay, false);
});
test('live vm: actions save, record undo and redraw', () => {
  const { vm, P, store, draws, setClock } = makeLiveVM(); const id = P.days[0].id;
  setClock(8, 0); const d0 = draws(); vm.startScene('s1'); eq([store.touches, draws() - d0], [1, 1]);
  vm.addDelay('s1', 20, 'Weather'); eq(vm.board.active[0].extra, 20);
  setClock(9, 30); vm.completeScene('s1'); eq(P.reports[id].scenes.s1.status, 'Completed');
  vm.moveScene('s3', -1); eq(P.live.days[id].order, ['s1', 's3', 's2']);
  eq(vm.deferOptions('s2'), { next: { n: 2, date: '2026-12-02' }, blocked: false });
  eq(vm.deferScene('s2', 'next'), true); eq(P.days[1].sceneIds, ['s2']);
  vm.setTimes('s3', '10:00', ''); eq([P.live.days[id].items.s3.status, vm.timesOf('s3')], ['active', { start: '10:00', end: '' }]);
  eq(vm.openIds, ['s3']); vm.wrapDay(); eq(vm.board.status[0], 'Wrapped'); vm.reopenDay(); eq(vm.board.ended, false);
  vm.edit((L, P, t) => LiveModel.addIssue(L, { title: 'Cable' }, t, 'q')); eq(vm.L.issues[0].title, 'Cable');
});
test('live vm: check-in groups and the task filter', () => {
  const { vm, P } = makeLiveVM(); P.days[0].calls = { a1: { call: '06:30' } };
  const g = vm.groups; eq(g.map(x => [x.key, x.people.map(p => [p.p.name, p.call])]), [['cast', [['Ana', '06:30'], ['Bo', '07:00']]], ['crew', [['Dee', '07:00']]]]);
  const f = vm.taskFilter(); eq([f({ due: '2026-12-01' }), f({ due: '2026-12-09' }), f({ sceneId: 's3' }), f({ status: 'doing' })], [true, false, true, true]);
  eq(vm.issueItems[0], { id: 's1', label: 'Scene 1. INT. LOBBY' });
});
