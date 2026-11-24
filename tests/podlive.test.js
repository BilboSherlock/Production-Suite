'use strict';
/* Podcast recorder: pacing, segments, markers, the hand-off sheet, and the view model */

/* a recording clock that only moves when told to */
const fakeClock = (o = {}) => Object.assign({ running: false, startTime: 0, elapsedSec: 0, activeSegIdx: 0, segStartSec: 0, markers: [],
  checkedBullets: new Set(), checkedQuestions: new Set(), start() { this.running = true; this.startTime = 1; }, pause() { this.running = false; } }, o);
const seg = (id, title, dur, extra = {}) => Object.assign({ id, title, dur, bullets: '', cues: '', guestId: '', sponsorId: '', status: 'Planned' }, extra);
const pdOf = () => ({ rundown: [seg('a', 'Intro', 2), seg('b', 'Interview', 20, { guestId: 'g1' }), seg('c', 'Ad', 1, { sponsorId: 'sp1' }), seg('d', 'Outro', '1:30')],
  guests: [{ id: 'g1', name: 'Rae', questions: 'Q1\nQ2', nogo: '' }], sponsors: [{ id: 'sp1', name: 'Mugs', slot: 'Mid-roll 1', code: 'POD' }], epNumber: '12', season: '2' });
const plProject = () => Object.assign(fakeProject({ title: 'Talk', mode: 'podcast', days: [], reports: {}, tasks: [] }), { podcast: pdOf() });
const pt = (H, M = 0) => new Date(2026, 11, 1, H, M).getTime();

/* ---------- model ---------- */
test('podcast: formats and durations', () => {
  eq([PodLiveModel.fmtSec(0), PodLiveModel.fmtSec(125.9), PodLiveModel.fmtSec(3600)], ['00:00', '02:05', '60:00']);
  eq([PodLiveModel.parseDur(5), PodLiveModel.parseDur('4:30'), PodLiveModel.parseDur('x'), PodLiveModel.parseDur('7.5')], [5, 4.5, 0, 7.5]);
});
test('podcast: timing skips cut segments', () => {
  const pd = pdOf(); pd.rundown[2].status = 'Cut';
  const t = PodLiveModel.timing(pd.rundown); eq([t.rows.map(r => r.start), t.total], [[0, 2, 22, 22], 23.5]);
});
test('podcast: pacing — ready, on time, behind, ahead, over', () => {
  const pd = pdOf(), c = fakeClock();
  let s = PodLiveModel.state(pd.rundown, c); eq([s.pace, s.idx, s.next.id, s.totalMin, s.covered, s.active], [['Ready', 'muted'], 0, 'b', 24.5, 0, 4]);
  c.elapsedSec = 100; s = PodLiveModel.state(pd.rundown, c); eq([s.pace, s.segEl, s.segTarget], [['On time', 'good'], 100, 120]);
  c.elapsedSec = 400; s = PodLiveModel.state(pd.rundown, c); eq([s.segOver, s.pace], [280, ['Behind 04:40', 'bad']]);
  Object.assign(c, { activeSegIdx: 1, segStartSec: 60, elapsedSec: 90 }); s = PodLiveModel.state(pd.rundown, c); eq(s.pace, ['Ahead 01:00', 'info']);
  c.activeSegIdx = 9; eq(PodLiveModel.state(pd.rundown, c).idx, 3, 'kept inside the rundown');
});
test('podcast: record, next, jump back and cut', () => {
  const pd = pdOf(), c = fakeClock(), L = LiveModel.blank(); L.markers = c.markers;
  eq(PodLiveModel.toggleRecord(pd, c, L, pt(10)), 'recording'); eq([c.running, L.started, pd.rundown[0].status, L.log[0].msg], [true, pt(10), 'Recording', 'Recording started']);
  c.elapsedSec = 130; eq(PodLiveModel.next(pd, c, L, pt(10, 3)), true);
  eq([pd.rundown[0].status, pd.rundown[1].status, c.activeSegIdx, c.segStartSec, c.markers[0].label], ['Covered', 'Recording', 1, 130, 'Started: Interview']);
  PodLiveModel.goTo(pd, c, L, 0, pt(10, 4)); eq([pd.rundown[1].status, pd.rundown[0].status], ['Planned', 'Covered'], 'going back: current goes back to planned');
  c.activeSegIdx = 2; pd.rundown[2].status = 'Recording';
  eq(PodLiveModel.cut(pd, c, L, pt(10, 5)), true); eq([pd.rundown[2].status, pd.rundown[3].status, c.activeSegIdx], ['Cut', 'Recording', 3], 'a cut segment stays cut');
  eq(PodLiveModel.next(pd, c, L, pt(10, 6)), false); eq(pd.rundown[3].status, 'Covered', 'last segment covered');
  eq(PodLiveModel.toggleRecord(pd, c, L, pt(10, 7)), 'paused'); eq(L.log[0].msg, 'Paused at 02:10');
});
test('podcast: reorder keeps the clock on its segment; add time, status, segments', () => {
  const pd = pdOf(), c = fakeClock({ activeSegIdx: 1 });
  eq(PodLiveModel.move(pd, c, 1, -1), true); eq([pd.rundown.map(s => s.id), c.activeSegIdx], [['b', 'a', 'c', 'd'], 0]);
  eq(PodLiveModel.move(pd, c, 0, -1), false);
  PodLiveModel.addTime(pd.rundown[0]); eq(pd.rundown[0].dur, 22);
  PodLiveModel.cycleStatus(pd.rundown[1]); eq(pd.rundown[1].status, 'Recording'); pd.rundown[1].status = 'Cut'; PodLiveModel.cycleStatus(pd.rundown[1]); eq(pd.rundown[1].status, 'Planned');
  PodLiveModel.addSegment(pd, c, seg('n', 'News', 5)); eq(pd.rundown[1].id, 'n', 'after the current segment');
});
test('podcast: markers, sponsor reads and pre-flight', () => {
  const pd = pdOf(), c = fakeClock({ elapsedSec: 61 }), L = LiveModel.blank(); L.preflight = {};
  PodLiveModel.addMarker(c, 'Laugh', 'quote'); PodLiveModel.addMarker(c, '');
  eq(c.markers, [{ time: 61, label: 'Marker 2', kind: 'marker' }, { time: 61, label: 'Laugh', kind: 'quote' }]);
  PodLiveModel.removeMarker(c, 0); eq(c.markers.length, 1);
  PodLiveModel.setSponsorRecorded(c, pd.sponsors[0], true); eq([pd.sponsors[0].recorded, c.markers[0].label], [true, 'Sponsor read: Mugs']);
  PodLiveModel.setPreflight(L, 'levels', true); PodLiveModel.setPreflight(L, 'hack', true); eq([L.preflight, PodLiveModel.preflightDone(L)], [{ levels: true }, 1]);
});
test('podcast: alerts', () => {
  const pd = pdOf(), c = fakeClock(), L = LiveModel.blank(); L.preflight = { levels: true };
  eq(PodLiveModel.alerts(pd, L, PodLiveModel.state(pd.rundown, c)).map(a => [a[0], a[2] && a[2].cmd]), [['warn', 'showPreflight']]);
  Object.assign(c, { activeSegIdx: 1, segStartSec: 0, elapsedSec: 20 * 60 + 45 }); pd.guests[0].nogo = 'Divorce';
  L.issues.push({ title: 'Power cut', sev: 'Critical', status: 'Open' });
  eq(PodLiveModel.alerts(pd, L, PodLiveModel.state(pd.rundown, c)).map(a => [a[0], a[1].slice(0, 16), a[2] && a[2].cmd]), [['crit', 'Critical: Power ', undefined], ['crit', 'Rae — off limits', undefined], ['warn', '“Interview” is 0', 'addTime']]);
  c.activeSegIdx = 3; eq(PodLiveModel.alerts(pd, L, PodLiveModel.state(pd.rundown, c)).pop()[0], 'tip', 'no sponsor slot left and Mugs not read');
});
test('podcast: restoring the clock from a saved session', () => {
  const c = fakeClock({ running: true }), m = [{ time: 5, label: 'x' }];
  PodLiveModel.restore(c, { running: false, elapsed: 300, seg: 2, segStart: 240 }, m, pt(11));
  eq([c.running, c.elapsedSec, c.activeSegIdx, c.segStartSec, c.markers === m], [false, 300, 2, 240, true]);
  PodLiveModel.restore(c, { running: true, startTime: pt(10) }, [], pt(10, 30)); eq([c.running, c.elapsedSec], [true, 1800]);
  const L = LiveModel.blank(); PodLiveModel.saveRec(L, c); eq([L.rec.running, L.rec.elapsed, L.markers === c.markers], [true, 1800, true]);
});
test('podcast: hand-off sheet and the daily report', () => {
  const P = plProject(), pd = P.podcast, c = fakeClock({ elapsedSec: 1500, startTime: pt(10) }), L = LiveModel.blank();
  pd.rundown[0].status = 'Covered'; pd.rundown[2].status = 'Cut'; PodLiveModel.addMarker(c, 'Laugh', 'quote');
  LiveModel.addIssue(L, { title: 'Hum', cat: 'Audio', sev: 'High' }, pt(10, 5), 'i1', 42);
  const h = PodLiveModel.handoff(P, pd, L, c, { date: '2026-12-01', clockTxt: m => LiveModel.fromMin(m) });
  eq([h.covered, h.total, h.markers, h.problems], [1, 4, 1, 1]);
  const lines = h.text.split('\n');
  eq(lines.slice(0, 6), ['EPISODE RECORDING — HAND-OFF', 'Show: Talk', 'Episode: 12 (season 2)', 'Date: 2026-12-01', 'Recorded: 25:00', 'Segments covered: 1 of 4 (1 cut)']);
  eq([lines.includes('[25:00] QUOTE: Laugh'), lines.includes('[NOT RECORDED] Mugs (Mid-roll 1) — code POD'), lines.pop()], [true, true, '[00:42] [High] Audio: Hum']);
  const d = PodLiveModel.fileHandoff(P, L, c, h, { date: '2026-12-01', now: pt(10, 30) });
  const R = P.reports[d.id];
  eq([P.days.length, d.title, R.t.crew, R.t.wrap, R.media, R.incidents, R.notes === h.text], [1, 'Episode recording', '10:00', '10:30', 'Audio · 25:00 recorded', '[High] Audio: Hum', true]);
});

test('podcast: quick-logged problems use the podcast categories', () => {
  eq([LiveModel.guessCat('Mic popping', PodLiveModel.ISSUE_CATS), LiveModel.guessCat('Neighbour drilling, venue noise', PodLiveModel.ISSUE_CATS), LiveModel.guessCat('Laptop crashed', PodLiveModel.ISSUE_CATS)], ['Audio', 'Audio', 'Equipment']);
});

/* ---------- view model ---------- */
const makePodVM = () => {
  const P = plProject(), store = fakeStore(P), ui = {}, c = fakeClock(); let now = pt(10), pings = 0;
  const mk = () => new PodLiveVM({ project: () => store.P, store, ui, clock: c, fx: { pd: P => P.podcast, now: () => now, today: () => '2026-12-01', clockTxt: m => LiveModel.fromMin(m),
    newSegment: o => seg('new', o.title, o.dur), template: (k, P, pd) => pd.rundown.push(seg('t', 'From template', 5)), ping: () => pings++, chime: () => {} } });
  const vm = mk(); let draws = 0; vm.subscribe(() => draws++);
  return { vm, mk, P, store, ui, c, setNow: t => { now = t; }, pings: () => pings, draws: () => draws };
};
test('podcast vm: opening never saves; the first action saves the session with the clock', () => {
  const { vm, P, store, c } = makePodVM();
  eq([vm.hasRundown, vm.state.pace[0], P.live, c.pid], [true, 'Ready', undefined, 'p1']);
  vm.record(); eq([store.touches, c.running, P.live.days.podcast.rec.running, P.podcast.rundown[0].status], [1, true, true, 'Recording']);
});
test('podcast vm: markers save with the session and come back after undo', () => {
  const { vm, mk, P, c, pings } = makePodVM();
  vm.mark('Laugh', 'quote'); eq([pings(), P.live.days.podcast.markers[0].label, c.markers === P.live.days.podcast.markers], [1, 'Laugh', true]);
  const saved = JSON.parse(JSON.stringify(P.live)); vm.mark('Second');
  P.live = saved; mk(); eq(c.markers.map(m => m.label), ['Laugh'], 'reopening after undo takes the saved markers');
  eq(vm.markersText, '[00:00] Laugh');
});
test('podcast vm: segments — next, cut, add time, move, add', () => {
  const { vm, P, c } = makePodVM();
  vm.record(); c.elapsedSec = 100; eq(vm.next(), true); eq(vm.state.idx, 1);
  vm.addTime('b'); eq(P.podcast.rundown[1].dur, 22);
  vm.cut(); eq([P.podcast.rundown[1].status, vm.state.idx], ['Cut', 2]);
  vm.addSegment('News'); eq(P.podcast.rundown[3].title, 'News');
  vm.move(3, 1); eq(P.podcast.rundown[4].title, 'News');
  vm.cycleStatus('a'); eq(P.podcast.rundown[0].status, 'Cut');
});
test('podcast vm: panels, preflight, sponsor, wrap', () => {
  const { vm, P, c, ui } = makePodVM();
  eq([vm.panelGuest.name, vm.panelSponsor.name, vm.groups.map(g => g.people.length), vm.issueItems[1].label], ['Rae', 'Mugs', [0, 1, 0], '2. Interview']);
  vm.setPreflight('levels', true); eq(vm.preflightDone, 1);
  vm.setSponsorRecorded('sp1', true); eq([vm.unreadSponsors.length, c.markers[0].label], [0, 'Sponsor read: Mugs']);
  vm.record(); c.elapsedSec = 600;
  const h = vm.wrap(); eq([c.running, h.recorded, !!P.live.days.podcast.ended, P.days.length, ui.liveDay === P.days[0].id], [false, 600, true, 1, true]);
  eq(P.reports[P.days[0].id].media, 'Audio · 10:00 recorded');
});
test('podcast vm: this-visit settings are not saved', () => {
  const { vm, store, draws } = makePodVM();
  vm.tick('a-0', true); vm.ask('g1-0', true); vm.setPrompter({ on: true, size: 50 });
  eq([vm.isTicked('a-0'), vm.isAsked('g1-0'), vm.prompter.on, vm.prompter.size, store.touches], [true, true, true, 34, 0]);
  eq(draws(), 2, 'asking a question and changing the prompter redraw; ticking a point does not');
});
test('podcast vm: an empty rundown can start from a template', () => {
  const { vm, P } = makePodVM(); P.podcast.rundown = [];
  eq(vm.hasRundown, false); vm.useTemplate('interview'); eq(vm.hasRundown, true);
});
