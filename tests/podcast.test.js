'use strict';
/* Podcast planner: formats, rundown, guests, sponsors, cameras, gear, chapters and notes; and
   the recorder for freeflow and filmed shows */

const pcSeg = (id, title, dur, extra = {}) => PodcastModel.segment(Object.assign({ id, title, dur }, extra));
const pcProject = (pd = {}) => Object.assign(fakeProject({ title: 'Talk', mode: 'podcast', days: [], reports: {}, budget: [] }), { podcast: Object.assign(PodcastModel.blank(), pd) });
const pcClock = (o = {}) => Object.assign({ running: false, startTime: 0, elapsedSec: 0, activeSegIdx: 0, segStartSec: 0, markers: [],
  checkedBullets: new Set(), checkedQuestions: new Set(), start() { this.running = true; this.startTime = 1; }, pause() { this.running = false; } }, o);
const freePd = () => Object.assign(PodcastModel.blank(), { format: 'freeflow', target: 30, rundown: [
  pcSeg('a', 'Catch-up', 5, { priority: 'Nice' }), pcSeg('b', 'Big topic', 15, { priority: 'Must' }), pcSeg('c', 'Game', 5, { priority: 'If time' }), pcSeg('d', 'Sign-off', 2, { priority: 'Must' })] });

/* ---------- the plan ---------- */
test('podcast plan: reading fills defaults without changing the project; ensure fills it in', () => {
  const P = fakeProject({ podcast: { rundown: [pcSeg('a', 'A', 5)], format: 'nonsense' } });
  const pd = PodcastModel.read(P);
  eq([pd.format, pd.medium, pd.video.aspect, pd.notes.watch, pd.rundown === P.podcast.rundown, 'video' in P.podcast, P.podcast.format], ['structured', 'audio', '16:9', '', true, false, 'nonsense']);
  eq(PodcastModel.read(fakeProject()).rundown, []);
  const Q = fakeProject(); const e = PodcastModel.ensure(Q); eq([e === Q.podcast, e.video.cameras, e.format], [true, [], 'structured']);
});
test('podcast plan: formats, medium and the target length', () => {
  const pd = PodcastModel.blank(); pd.rundown = [pcSeg('a', 'A', 20), pcSeg('b', 'B', 12.5)];
  eq(PodcastModel.setFormat(pd, 'freeflow'), true); eq(pd.target, 33, 'a freeflow show starts with the planned length as its target');
  eq([PodcastModel.setFormat(pd, 'x'), PodcastModel.setMedium(pd, 'video'), PodcastModel.setMedium(pd, 'tv'), pd.medium], [false, true, false, 'video']);
  PodcastModel.setTarget(pd, '45.4'); eq(pd.target, 45);
  eq(PodcastModel.summary(pd), 'Freeflow · 2 topics · 0 must-cover · 45 min target · filmed');
  pd.format = 'structured'; eq([PodcastModel.runLength(pd), PodcastModel.summary(pd)], [32.5, 'Structured rundown · 2 active segments · 33 min target · filmed']);
});
test('podcast plan: templates set the rundown, format, target and medium', () => {
  const pd = PodcastModel.blank();
  eq(PodcastModel.applyTemplate(pd, 'conversation'), true); eq([pd.format, pd.target, pd.rundown.length, pd.rundown[0].priority, pd.medium], ['freeflow', 60, 6, 'Must', 'audio']);
  PodcastModel.applyTemplate(pd, 'videocast'); eq([pd.format, pd.medium, !!pd.rundown[1].gfx], ['structured', 'video', true]);
  eq([PodcastModel.applyTemplate(pd, 'nope'), PodcastModel.templates().find(t => t.key === 'roundtable').format], [false, 'freeflow']);
});
test('podcast plan: rundown — add, update with checks, move, remove', () => {
  const pd = PodcastModel.blank(); const s = PodcastModel.addSegment(pd); eq(s.title, 'Segment 1');
  pd.format = 'freeflow'; eq(PodcastModel.addSegment(pd).title, 'Topic 2');
  eq([PodcastModel.updateSegment(s, 'dur', '0.1'), s.dur, PodcastModel.updateSegment(s, 'dur', 'x'), s.dur], [true, 0.5, true, 1]);
  eq([PodcastModel.updateSegment(s, 'status', 'Gone'), PodcastModel.updateSegment(s, 'priority', 'Must'), PodcastModel.updateSegment(s, 'id', 'z'), s.priority], [false, true, false, 'Must']);
  eq([PodcastModel.moveSegment(pd, 0, 1), pd.rundown[1] === s, PodcastModel.moveSegment(pd, 1, 1)], [true, true, false]);
  eq([PodcastModel.removeSegment(pd, s.id), pd.rundown.length, PodcastModel.removeSegment(pd, 'no')], [true, 1, false]);
});
test('podcast plan: freeflow topics by priority and overbooking', () => {
  const pd = freePd(); pd.rundown[2].status = 'Cut';
  eq(PodcastModel.byPriority(pd).map(g => [g.key, g.items.map(s => s.id)]), [['Must', ['b', 'd']], ['Nice', ['a']], ['If time', []], ['Cut', ['c']]]);
  eq(PodcastModel.overBooked(pd), 0); pd.target = 10; eq(PodcastModel.overBooked(pd), 7);
});
test('podcast plan: removing a guest or sponsor unlinks them from the rundown', () => {
  const pd = PodcastModel.blank(), g = PodcastModel.addGuest(pd, { name: 'Rae' }), sp = PodcastModel.addSponsor(pd);
  pd.rundown = [pcSeg('a', 'A', 5, { guestId: g.id, sponsorId: sp.id })];
  eq([PodcastModel.updateGuest(g, 'release', 'Signed'), PodcastModel.updateGuest(g, 'release', 'Maybe'), PodcastModel.updateSponsor(sp, 'recorded', 1), sp.recorded], [true, false, true, true]);
  PodcastModel.removeGuest(pd, g.id); PodcastModel.removeSponsor(pd, sp.id);
  eq([pd.guests.length, pd.sponsors.length, pd.rundown[0].guestId, pd.rundown[0].sponsorId], [0, 0, '', '']);
});
test('podcast plan: cameras and the camera plan', () => {
  const P = pcProject({ medium: 'video' }), pd = P.podcast;
  PodcastModel.starterCameras(pd); eq(pd.video.cameras.map(c => [c.name, c.shot]), [['Cam A', 'Wide / master'], ['Cam B', 'Host single'], ['Cam C', 'Guest single']]);
  PodcastModel.removeCamera(pd, pd.video.cameras[1].id); eq(PodcastModel.addCamera(pd).name, 'Cam B', 'reuses the free letter');
  PodcastModel.updateCamera(pd.video.cameras[0], 'cardMins', '90'); PodcastModel.updateVideo(pd, 'set', 'Bookshelf'); PodcastModel.updateVideo(pd, 'iso', 0);
  pd.rundown = [pcSeg('a', 'Intro', 3, { gfx: 'Lower third: host\nTitle card' })];
  const t = PodcastModel.cameraText(P, pd).split('\n');
  eq([t[2], t[4], t.includes('SET'), t.slice(-2)], ['Frame: 16:9 · 4K · 25p · social clips 9:16', 'Cam A — Wide / master · card ~90 min\n   Locked off'.split('\n')[0], true, ['• [Intro] Lower third: host', '• [Intro] Title card']]);
});
test('podcast plan: gear — cost, stats, filter, kits, budget, rentals', () => {
  const P = pcProject(), pd = P.podcast;
  const a = PodcastModel.addGear(pd, 'Microphones'); Object.assign(a, { name: 'SM7B', qty: 2, rate: 10, days: '', status: 'In Studio' });
  const b = PodcastModel.addGear(pd, 'Cameras & Video (Vodcast)'); Object.assign(b, { name: 'FX30', qty: 1, rate: 50, days: 2, source: 'Apex' });
  eq([PodcastModel.gearCost(a, 3), PodcastModel.gearCost(b, 3), PodcastModel.gearStats(pd, 3)], [60, 100, { count: 2, ready: 1, total: 160 }]);
  eq([PodcastModel.filterGear(pd.gear, 'fx').length, PodcastModel.filterGear(pd.gear, '', 'In Studio')[0].name], [1, 'SM7B']);
  eq(PodcastModel.duplicateGear(pd, a.id).name, 'SM7B'); eq(pd.gear[1].name, 'SM7B'); PodcastModel.removeGear(pd, pd.gear[1].id);
  eq(PodcastModel.syncBudget(P, pd, { Microphones: 'Sound' }, 3), 2);
  eq(P.budget.map(l => [l.cat, l.desc, l.qty, l.rate]), [['Sound', 'SM7B', 6, 10], ['Audio Engineering', 'FX30 (Apex)', 2, 50]]);
  PodcastModel.syncBudget(P, pd, {}, 3); eq(P.budget.length, 2, 'kept in step, not duplicated');
  eq(PodcastModel.rentals(pd, 3).map(r => [r.source, r.items.length, r.total]), [['Apex', 1, 100]]);
  eq(PodcastModel.packRows(pd, ['Microphones'])[1], ['☐', 'Microphones', 'SM7B', 2, 'Owned', 'In Studio']);
  eq([PodcastModel.videoKit().length > 5, PodcastModel.gearCsv(pd, 3)[2][6]], [true, 100]);
});
test('podcast plan: chapters from the plan and from the recording', () => {
  const pd = PodcastModel.blank(); pd.rundown = [pcSeg('a', 'Intro', 2), pcSeg('b', 'Cut me', 4, { status: 'Cut' }), pcSeg('c', 'Talk', 61)];
  eq(PodcastModel.plannedChapters(pd), [{ sec: 0, title: 'Intro' }, { sec: 120, title: 'Talk' }]);
  eq([PodcastModel.stamp(65), PodcastModel.stamp(3725)], ['01:05', '1:02:05']);
  const markers = [{ time: 900, label: 'Started: Talk', kind: 'segment' }, { time: 400, label: 'Laugh', kind: 'quote' }, { time: 300, label: 'Started: Extra', kind: 'segment' }];
  eq(PodcastModel.chapters(pd, markers), { source: 'recorded', list: [{ sec: 0, title: 'Intro' }, { sec: 300, title: 'Extra' }, { sec: 900, title: 'Talk' }] });
  eq(PodcastModel.chapters(pd, []).source, 'planned');
  eq(PodcastModel.chapterText([{ sec: 0, title: 'A' }, { sec: 75, title: 'B' }]), '00:00 A\n01:15 B');
});
test('podcast plan: clips from clip in/out pairs and highlight markers', () => {
  const m = [{ time: 500, label: 'Clip in', kind: 'clipIn' }, { time: 100, label: 'Great line', kind: 'quote' }, { time: 530, label: 'Clip out', kind: 'clipOut' }, { time: 900, label: 'Clip in', kind: 'clipIn' }];
  eq(PodcastModel.clips(m), [{ in: 80, out: 140, label: 'Great line' }, { in: 500, out: 530, label: 'Clip in' }, { in: 900, out: 960, label: 'Clip in' }]);
  eq(PodcastModel.clipText(PodcastModel.clips(m)).split('\n')[1], '2. 08:20–08:50 (30s) Clip in');
});
test('podcast plan: show notes, rundown text and CSV', () => {
  const P = pcProject({ medium: 'video', notes: Object.assign(PodcastModel.blank().notes, { summary: 'We talk.', watch: 'yt.example/ep1', tags: 'talk, show' }) }), pd = P.podcast;
  pd.guests = [PodcastModel.guest({ name: 'Rae', title: 'Author', plugs: '@rae\nrae.example', onCamera: 'No stripes' })]; pd.sponsors = [PodcastModel.sponsor({ name: 'Mugs', url: 'mugs.example', code: 'POD', onScreen: 'Logo' })];
  pd.rundown = [pcSeg('a', 'Intro', 2, { cam: 'Wide', gfx: 'Title' }), pcSeg('b', 'Talk', 10, { bullets: '• one\ntwo' })];
  const n = PodcastModel.showNotes(P, pd, PodcastModel.plannedChapters(pd), { series: 'Show · S1E1' }).split('\n');
  eq(n.slice(0, 6), ['Talk', 'Show · S1E1', '='.repeat(40), '', 'We talk.', '']);
  eq([n.includes('Watch the full episode: yt.example/ep1'), n.includes('02:00 - Talk'), n.includes('  Links: @rae · rae.example'), n.includes('• Mugs: mugs.example (Use code: POD)'), n.includes('Tags: talk, show')], [true, true, true, true, true]);
  const t = PodcastModel.rundownText(P, pd).split('\n');
  eq([t[2], t.includes('   CAMERA: Wide'), t.includes('   ON SCREEN: Title'), t.includes('   • one'), t.includes('   • two')], ['Structured rundown · Filmed (video + audio) · ~12 min', true, true, true, true]);
  eq(PodcastModel.rundownCsv(pd)[0].slice(-2), ['Camera', 'On screen']);
  eq([PodcastModel.guestsDigest(pd).includes('ON CAMERA: No stripes'), PodcastModel.sponsorsText(pd).includes('ON SCREEN: Logo')], [true, true]);
  pd.format = 'freeflow'; const f = PodcastModel.rundownText(P, pd).split('\n'); eq([f[0], f.includes('NICE TO HAVE'), f.includes(' ☐ Talk (~10 min)')], ['TALK — TOPICS', true, true]);
});

/* ---------- the recorder: freeflow ---------- */
test('podcast recorder: freeflow picks the next topic by priority, in any order', () => {
  const rd = freePd().rundown;
  eq([PodLiveModel.nextOf(rd, 0, true).id, PodLiveModel.nextOf(rd, 1, true).id, PodLiveModel.nextOf(rd, 0).id], ['b', 'd', 'b']);
  rd[1].status = 'Covered'; rd[3].status = 'Covered'; eq(PodLiveModel.nextOf(rd, 0, true).id, 'c', 'then if-time topics');
  rd[2].status = 'Cut'; eq(PodLiveModel.nextOf(rd, 0, true), null);
});
test('podcast recorder: freeflow pacing runs against the target and the must-covers left', () => {
  const pd = freePd(), c = pcClock();
  let s = PodLiveModel.state(pd.rundown, c, pd); eq([s.free, s.pace, s.totalMin, s.mustLeft.map(x => x.id), s.next.id], [true, ['Ready', 'muted'], 30, ['b', 'd'], 'b']);
  c.elapsedSec = 600; s = PodLiveModel.state(pd.rundown, c, pd); eq([s.pace, s.left, s.segOver], [['20:00 left', 'good'], 1200, 0]);
  c.elapsedSec = 1500; s = PodLiveModel.state(pd.rundown, c, pd); eq(s.pace, ['Tight · 2 must left', 'warn']);
  eq(PodLiveModel.alerts(pd, Object.assign(LiveModel.blank(), { preflight: {} }), s).map(a => a[1].slice(0, 30)), ['2 must-cover topics left with ']);
  c.elapsedSec = 1900; s = PodLiveModel.state(pd.rundown, c, pd); eq([s.pace, s.remainMin], [['Over 01:40', 'bad'], 0]);
  eq(PodLiveModel.alerts(pd, Object.assign(LiveModel.blank(), { preflight: {} }), s)[0][1], 'Over the 30 min target by 01:40');
});
test('podcast recorder: freeflow jumps cover the topic, next follows priority, skip and park', () => {
  const pd = freePd(), c = pcClock(), L = LiveModel.blank();
  PodLiveModel.toggleRecord(pd, c, L, 1); c.elapsedSec = 60;
  eq(PodLiveModel.goTo(pd, c, L, 3, 2), true); eq([pd.rundown[0].status, pd.rundown[3].status, L.log[0].msg], ['Covered', 'Recording', 'Topic: Sign-off']);
  PodLiveModel.goTo(pd, c, L, 2, 3); eq(pd.rundown[3].status, 'Covered', 'going back still covers it — you talked about it');
  eq(PodLiveModel.goTo(pd, c, L, 2, 3), false, 'already there');
  eq(PodLiveModel.next(pd, c, L, 4), true); eq([pd.rundown[2].status, c.activeSegIdx], ['Covered', 1], 'the must-cover topic comes next');
  eq(PodLiveModel.cut(pd, c, L, 5), false); eq([pd.rundown[1].status, c.markers[0].label], ['Cut', 'Skipped topic: Big topic']);
  const p = PodLiveModel.park(pd, c, L, pcSeg('t', 'That story about the dog', 5), 6);
  eq([pd.rundown[4] === p, p.priority, p.status, c.markers[0].kind, PodLiveModel.nextOf(pd.rundown, 1, true).id], [true, 'If time', 'Planned', 'tangent', 't']);
});

/* ---------- the recorder: filmed ---------- */
test('podcast recorder: filmed shows add checks, markers, problem types and card alerts', () => {
  const pd = PodcastModel.blank(); pd.medium = 'video'; pd.rundown = [pcSeg('a', 'Intro', 60)]; pd.video.cameras = [PodcastModel.camera({ name: 'Cam A', cardMins: 40 })];
  eq([PodLiveModel.preflightList(pd).length, PodLiveModel.marksFor(pd).map(m => m[0]).includes('clipIn'), PodLiveModel.issueCats(pd).includes('Camera')], [12, true, true]);
  eq([PodLiveModel.preflightList({}).length, PodLiveModel.marksFor({ format: 'freeflow' }).pop()[0]], [6, 'tangent']);
  const L = Object.assign(LiveModel.blank(), { preflight: {}, markers: [] }), c = pcClock({ elapsedSec: 35 * 60 });
  PodLiveModel.setPreflight(L, 'cams', true); eq(PodLiveModel.preflightDone(L, PodLiveModel.preflightList(pd)), 1);
  const al = PodLiveModel.alerts(pd, L, PodLiveModel.state(pd.rundown, c, pd)).map(a => [a[0], a[1].slice(0, 24), a[2] && a[2].cmd]);
  eq(al, [['warn', 'Cam A: card fills in ~5 ', undefined], ['tip', 'No sync clap yet — clap ', 'sync']]);
  c.elapsedSec = 41 * 60; L.markers = [{ time: 5, label: 'Sync', kind: 'sync' }];
  eq(PodLiveModel.alerts(pd, L, PodLiveModel.state(pd.rundown, c, pd)).map(a => a[0]), ['crit']);
  PodLiveModel.camSwitch(c, pd.video.cameras[0]); eq([c.markers[0].label, PodLiveModel.curCam(c.markers)], ['Cam: Cam A · Wide / master', 'Cam A · Wide / master']);
});
test('podcast recorder: the filmed hand-off lists cameras, sync, chapters and clips', () => {
  const P = pcProject({ medium: 'video', format: 'freeflow', target: 30 }), pd = P.podcast, c = pcClock({ elapsedSec: 1200, startTime: new Date(2026, 11, 1, 10).getTime() }), L = LiveModel.blank();
  pd.rundown = [pcSeg('a', 'Catch-up', 5, { status: 'Covered', priority: 'Nice' }), pcSeg('b', 'Big', 15, { status: 'Covered', priority: 'Must' })];
  pd.video.cameras = [PodcastModel.camera({ name: 'Cam A', who: 'Jo' })];
  c.markers = [{ time: 700, label: 'Clip out', kind: 'clipOut' }, { time: 650, label: 'Clip in', kind: 'clipIn' }, { time: 300, label: 'Started: Big', kind: 'segment' }, { time: 4, label: 'Sync clap / slate', kind: 'sync' }];
  const h = PodLiveModel.handoff(P, pd, L, c, { date: '2026-12-01', clockTxt: m => LiveModel.fromMin(m) }), t = h.text.split('\n');
  eq([t[5], t[6], t.includes('TOPICS'), t.includes('2. [COVERED] Big (Must, ~15 min)'), t.includes('Cam A — Wide / master (op: Jo)'), t.includes('Sync clap at 00:04')], ['Topics covered: 2 of 2', 'Format: Freeflow conversation · Filmed (video + audio)', true, true, true, true]);
  eq([t.includes('05:00 Big'), t.includes('1. 10:50–11:40 Clip in'), h.clips, h.media], [true, true, 1, 'Video + audio · 20:00 recorded · 1 camera']);
  const d = PodLiveModel.fileHandoff(P, L, c, h, { date: '2026-12-01', now: new Date(2026, 11, 1, 10, 30).getTime() }); eq(P.reports[d.id].media, h.media);
});
test('podcast recorder: a new session resets the clock and markers, not the problems', () => {
  const pd = freePd(), c = pcClock({ elapsedSec: 99, activeSegIdx: 2, running: true }), L = LiveModel.blank(); L.started = 5; L.issues.push({ title: 'x' }); pd.rundown[2].status = 'Recording';
  const old = c.markers; c.markers.push({ time: 1 });
  PodLiveModel.newSession(pd, c, L, 7);
  eq([c.running, c.elapsedSec, c.activeSegIdx, c.markers.length, old.length, pd.rundown[2].status, L.started, L.issues.length, L.log[0].msg.slice(0, 11)], [false, 0, 0, 0, 1, 'Planned', null, 1, 'New session']);
});

/* ---------- planner view model ---------- */
const makePcVM = (pd = {}) => {
  const P = pcProject(pd), store = fakeStore(P), ui = {}; let markers = [];
  const vm = new PodcastVM({ project: () => store.P, store, ui, fx: { nDays: () => 2, audioKit: () => [PodcastModel.gearItem('Microphones', { name: 'Mic' })], gearCats: () => ['Microphones', 'Cameras & Video (Vodcast)'],
    gearStatuses: () => ['Needed', 'In Studio'], budgetCats: () => ({}), series: () => '', markers: () => markers } });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, store, ui, draws: () => draws, setMarkers: m => { markers = m; } };
};
test('podcast vm: tabs follow the medium; the tab is kept on the UI', () => {
  const { vm, ui } = makePcVM();
  eq(vm.tabs.map(t => t[0]), ['rundown', 'guests', 'sponsors', 'gear', 'notes']);
  vm.setTab('video'); eq(vm.tab, 'rundown', 'no cameras tab for an audio show');
  vm.setMedium('video'); eq([vm.tabs[1][0], vm.cameras.length], ['video', 3], 'going filmed adds the cameras tab and three cameras');
  vm.setTab('video'); eq([vm.tab, ui.podTab], ['video', 'video']);
  vm.setMedium('audio'); eq(vm.tab, 'rundown');
});
test('podcast vm: rundown edits — typing is quiet, structure redraws', () => {
  const { vm, P, store, draws } = makePcVM();
  vm.useTemplate('interview'); const id = P.podcast.rundown[0].id, d0 = draws();
  vm.setSeg(id, 'title', 'Hello'); eq([P.podcast.rundown[0].title, draws(), store.touches], ['Hello', d0, 2]);
  vm.setSeg(id, 'dur', '9'); eq([vm.rows[1].start, draws()], [9, d0 + 1]);
  vm.moveSeg(0, 1); vm.removeSeg(id); eq([vm.rundown.length, vm.rundown.some(s => s.id === id)], [6, false]);
  vm.setFormat('freeflow'); eq([vm.isFree, vm.target, vm.groups[0].key, vm.tabs[0][1]], [true, 43, 'Must', 'Topics & clock (6)']);
  vm.setTarget(3); eq(vm.overBooked, 0); vm.setSeg(vm.rundown[0].id, 'priority', 'Must'); eq(vm.overBooked > 0, true);
});
test('podcast vm: guests, sponsors, cameras, gear', () => {
  const { vm, P } = makePcVM({ medium: 'video' });
  const g = vm.addGuest(); vm.setGuest(g.id, 'onCamera', 'Blue shirt'); eq(P.podcast.guests[0].onCamera, 'Blue shirt');
  const s = vm.addSponsor(); vm.setSponsor(s.id, 'recorded', true); eq(P.podcast.sponsors[0].recorded, true);
  vm.removeGuest(g.id); vm.removeSponsor(s.id); eq([vm.guests.length, vm.sponsors.length], [0, 0]);
  const c = vm.addCamera(); vm.setCamera(c.id, 'who', 'Sam'); vm.setVideo('lighting', 'Key left'); eq([vm.cameras[0].who, vm.video.lighting], ['Sam', 'Key left']);
  eq([vm.addKit('audio'), vm.addKit('video') > 5, vm.gearGroups.map(x => x.cat)], [1, true, ['Microphones', 'Cameras & Video (Vodcast)']]);
  vm.setGearFilter({ q: 'mic' }); eq(vm.gearGroups.map(x => x.items.length), [1]);
  eq(vm.toBudget(), 0, 'nothing with a day rate');
  vm.setGear(vm.gear[0].id, 'rate', '15'); eq([vm.toBudget(), P.budget[0].qty, vm.gearCost(vm.gear[0])], [1, 2, 30]);
});
test('podcast vm: chapters and clips come from the saved recording when there is one', () => {
  const { vm, setMarkers } = makePcVM();
  vm.useTemplate('solo'); eq([vm.chapters.source, vm.chapterText.split('\n')[1]], ['planned', '03:00 Part 1: How We Got Here (History/Context)']);
  setMarkers([{ time: 400, label: 'Started: Part 2: The Real Consequence', kind: 'segment' }, { time: 200, label: 'Gold', kind: 'quote' }]);
  eq([vm.chapters.source, vm.chapterText, vm.clips.length], ['recorded', '00:00 The Hook & Thesis\n06:40 Part 2: The Real Consequence', 1]);
  eq([vm.setNote('summary', 'Hi'), vm.setNote('evil', 1), vm.showNotes.split('\n')[3]], [true, false, 'Hi']);
});
