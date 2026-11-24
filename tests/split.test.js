'use strict';
/* Split scenes: one scene shot over several days */

const spScene = (id, eighths, extra = {}) => Object.assign({ id, num: id.replace(/\D/g, ''), eighths, label: 'SC ' + id, location: '' }, extra);
const spProject = () => fakeProject({ mode: 'screenplay', days: [], settings: {}, sceneMeta: {} });
const keys = list => list.map(x => x.key);

test('split: evenSizes shares eighths out, bigger parts first', () => {
  eq(ScheduleModel.evenSizes(20, 2), [10, 10]); eq(ScheduleModel.evenSizes(21, 2), [11, 10]); eq(ScheduleModel.evenSizes(10, 3), [4, 3, 3]);
});
test('split: a scene on a day keeps its first part there; the rest wait to be booked', () => {
  const P = spProject(), s = spScene('s1', 20), d = ScheduleModel.addDay(P); d.sceneIds = ['s1'];
  const parts = ScheduleModel.setSplit(P, s, [12, 8]);
  eq(parts.map(p => p.eighths), [12, 8]); eq(ScheduleModel.isSplit(P, 's1'), true);
  eq(d.parts, { s1: parts[0].id });
  eq(ScheduleModel.unscheduledSlots(P, [s]).map(x => [x.label, x.eighths]), [['pt 2/2', 8]]);
  const sh = ScheduleModel.share(P, d, s);
  eq([sh.eighths, sh.frac, sh.part.id, sh.part.n, sh.part.of, sh.label], [12, 0.6, parts[0].id, 1, 2, 'pt 1/2']);
  eq(ScheduleModel.dayEighths(P, d, [s]), 12, 'the day counts only its part');
});
test('split: invalid sizes are refused', () => {
  const P = spProject(), s = spScene('s1', 8);
  eq(ScheduleModel.setSplit(P, s, [8]), null, 'one part'); eq(ScheduleModel.setSplit(P, s, [8, 0]), null, 'empty part'); eq(ScheduleModel.isSplit(P, 's1'), false);
});
test('split: parts follow the script when the scene grows or shrinks', () => {
  const P = spProject(); ScheduleModel.setSplit(P, spScene('s1', 16), [8, 8]);
  eq(ScheduleModel.partsOf(P, spScene('s1', 20)).map(p => p.eighths), [8, 12], 'grew: last part takes it');
  eq(ScheduleModel.partsOf(P, spScene('s1', 10)).map(p => p.eighths), [8, 2], 'shrank');
  eq(ScheduleModel.partsOf(P, spScene('s1', 3)).map(p => p.eighths), [2, 1], 'shrank a lot: each keeps 1/8');
  eq(ScheduleModel.partsOf(P, spScene('s1', 1)).map(p => p.eighths), [1, 1], 'never below 1/8 each');
});
test('split: parts move between days independently; one part per scene per day', () => {
  const P = spProject(), s = spScene('s1', 16), a = ScheduleModel.addDay(P), b = ScheduleModel.addDay(P);
  const [p1, p2] = ScheduleModel.setSplit(P, s, [8, 8]), k1 = ScheduleModel.slotKey('s1', p1.id), k2 = ScheduleModel.slotKey('s1', p2.id);
  eq(ScheduleModel.moveSlot(P, k1, a.id), true); eq(ScheduleModel.moveSlot(P, k2, b.id), true);
  eq([a.sceneIds, b.sceneIds, a.parts.s1, b.parts.s1], [['s1'], ['s1'], p1.id, p2.id], 'the scene is on both days');
  eq(ScheduleModel.moveSlot(P, k2, a.id), false, 'a already has part 1'); eq(b.parts.s1, p2.id, 'refused move changes nothing');
  ScheduleModel.moveSlot(P, k1, null);
  eq([a.sceneIds, a.parts], [[], {}], 'unscheduling a part frees the day');
  eq(keys(ScheduleModel.unscheduledSlots(P, [s])), [k1]);
  eq(ScheduleModel.moveSlot(P, 's1~nope', a.id), false, 'unknown part');
});
test('split: reordering a part within its day keeps it booked', () => {
  const P = spProject(), d = ScheduleModel.addDay(P), s = spScene('s1', 16);
  d.sceneIds = ['s0', 's1', 's2']; const [p1] = ScheduleModel.setSplit(P, s, [8, 8]);
  ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p1.id), d.id, 0);
  eq([d.sceneIds, d.parts.s1], [['s1', 's0', 's2'], p1.id]);
});
test('split: whole scenes still move as before through moveSlot', () => {
  const P = spProject(), a = ScheduleModel.addDay(P), b = ScheduleModel.addDay(P); a.sceneIds = ['s1'];
  ScheduleModel.moveSlot(P, 's1', b.id); eq([a.sceneIds, b.sceneIds], [[], ['s1']]);
});
test('split: changing the number of parts takes dropped parts off their days', () => {
  const P = spProject(), s = spScene('s1', 24), days = [ScheduleModel.addDay(P), ScheduleModel.addDay(P), ScheduleModel.addDay(P)];
  const parts = ScheduleModel.setSplit(P, s, [8, 8, 8]);
  parts.forEach((p, i) => ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p.id), days[i].id));
  ScheduleModel.setPartNote(P, 's1', parts[0].id, 'Wide coverage');
  const two = ScheduleModel.setSplit(P, s, [12, 12]);
  eq(two.map(p => p.id), [parts[0].id, parts[1].id], 'kept parts keep their ids (and bookings)');
  eq(two[0].note, 'Wide coverage');
  eq(days.map(d => d.sceneIds.length), [1, 1, 0], 'part 3 came off day 3');
  eq(ScheduleModel.partBookings(P, s).map(b => b.dayId), [days[0].id, days[1].id]);
});
test('split: merge puts the scene back on the first day that had a part', () => {
  const P = spProject(), s = spScene('s1', 16), a = ScheduleModel.addDay(P), b = ScheduleModel.addDay(P);
  const [p1, p2] = ScheduleModel.setSplit(P, s, [8, 8]);
  ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p2.id), a.id); ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p1.id), b.id);
  eq(ScheduleModel.merge(P, 's1'), a.id);
  eq([a.sceneIds, b.sceneIds, a.parts, b.parts, ScheduleModel.isSplit(P, 's1')], [['s1'], [], {}, {}, false]);
  eq(ScheduleModel.merge(P, 's1'), null, 'not split');
  const c = spScene('s2', 8); ScheduleModel.setSplit(P, c, [4, 4]); eq(ScheduleModel.merge(P, 's2'), '', 'unbooked parts: merged, still unscheduled');
  eq(keys(ScheduleModel.unscheduledSlots(P, [c])), ['s2']);
});
test('split: a scene counts as scheduled only when every part is booked', () => {
  const P = spProject(), s = spScene('s1', 16), d = ScheduleModel.addDay(P);
  const [p1, p2] = ScheduleModel.setSplit(P, s, [8, 8]);
  ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p1.id), d.id);
  eq([ScheduleModel.stats(P, [s]).scheduled, ScheduleModel.stats(P, [s]).split], [0, 1]);
  ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p2.id), ScheduleModel.addDay(P).id);
  eq(ScheduleModel.stats(P, [s]).scheduled, 1);
});
test('split: auto-schedule books parts on separate days', () => {
  const P = spProject(), s1 = spScene('s1', 16), s2 = spScene('s2', 8);
  ScheduleModel.setSplit(P, s1, [8, 8]);
  const made = ScheduleModel.autoSchedule(P, [s1, s2], { pagesPerDay: 4, start: '', groupByLocation: false });
  eq(made.map(d => [d.sceneIds, Object.keys(d.parts || {})]), [[['s1'], ['s1']], [['s1', 's2'], ['s1']]], 'part 2 cannot join part 1');
  eq(made[0].parts.s1 !== made[1].parts.s1, true);
  eq(ScheduleModel.unscheduledSlots(P, [s1, s2]), []);
});
/* ---------- view model ---------- */
test('split vm: split, drag parts, refuse a second part on one day, merge', () => {
  const P = spProject(), scenes = [spScene('s1', 20, { ioe: 'INT', tod: 'DAY' }), spScene('s2', 8)], store = fakeStore(P);
  const vm = new ScheduleVM({ project: () => store.P, store, ui: {}, today: () => '2026-11-24', scenes: () => scenes, locName: () => '', sceneCast: () => new Set(),
    sceneEst: (P, s) => s.eighths * 7.5, dayPlan: () => ({ mins: 0, moves: 0, cap: 600, over: false }), conflicts: () => [], turnaround: () => '' });
  const a = vm.addDay('2026-12-01'), b = vm.addDay('2026-12-02');
  vm.dropSlot('s1', a.id, 0);
  eq(vm.split('s1', [1]), null, 'invalid sizes refused'); eq(vm.split('s1', [12, 0]), null); eq(store.touches, 3, 'refusals record nothing');
  const parts = vm.split('s1', [12, 8]);
  const day1 = vm.days[0];
  eq([day1.eighths, day1.slots.map(x => x.label)], [12, ['pt 1/2']]);
  eq(vm.pool.map(x => x.key), ['s1~' + parts[1].id, 's2']);
  const st = vm.strip(vm.pool[0]);
  eq([st.id, st.label, st.eighths, st.mins, st.part], ['s1~' + parts[1].id, 'pt 2/2', 8, 60, { n: 2, of: 2, note: '' }]);
  eq(vm.dropSlot(st.id, a.id, 0), false, 'a already has part 1'); eq(vm.days[0].slots.length, 1);
  vm.dropSlot(st.id, b.id, 0);
  eq(vm.splitInfo('s1').parts.map(p => [p.n, p.eighths, p.dayN]), [[1, 12, 1], [2, 8, 2]]);
  eq(vm.stats.scheduled, 1, 's1 fully booked; s2 not');
  vm.setPartNote('s1', parts[1].id, 'Reverses'); eq(vm.strip(vm.days[1].slots[0]).sub, 'Reverses', 'part note shows on the strip');
  eq(vm.printGroups()[1].rows[0].slice(0, 1).concat(vm.printGroups()[1].rows[0][4], vm.printGroups()[1].rows[0][6]), ['1 pt 2/2', 'Reverses', 8]);
  vm.merge('s1');
  eq([vm.days.map(d => d.slots.map(x => x.key)), vm.splitInfo('s1').split], [[['s1'], []], false]);
});

test('split: share() of a whole scene, or a day without a part mapping, is the whole scene', () => {
  const P = spProject(), d = ScheduleModel.addDay(P);
  eq(ScheduleModel.share(P, d, spScene('s1', 12)), { eighths: 12, frac: 1, part: null, label: '' });
  eq([ScheduleModel.parseKey('s1'), ScheduleModel.parseKey('s1~p2'), ScheduleModel.keyOn(P, d, 's1')], [['s1', null], ['s1', 'p2'], 's1']);
});
