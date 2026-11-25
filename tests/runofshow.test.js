'use strict';
/* Run of show — model and view-model tests */
const RSM = RunModel;
const rosRows = () => [RSM.row({ id: 'a', start: '08:00', dur: 30, kind: 'Hair & makeup' }), RSM.row({ id: 'b', start: '08:30', dur: 60, kind: 'Setup' }), RSM.row({ id: 'c', start: '09:30', dur: 15, kind: 'Break' })];

test('run of show: times, finish and rippling', () => {
  eq([RSM.toMin('7:05'), RSM.toMin('x'), RSM.fromMin(65), RSM.fromMin(1450), RSM.fromMin(-30)], [425, null, '01:05', '00:10', '23:30']);
  const R = rosRows();
  eq([RSM.finish(R, { wrap: '09:40' }), RSM.finish(R, { wrap: '18:00' }), RSM.finish(R), RSM.finish([], {})], [{ end: '09:45', late: true }, { end: '09:45', late: false }, { end: '09:45', late: false }, null]);
  RSM.update(R, 'a', 'dur', 45); eq(R.map(r => r.start), ['08:00', '08:45', '09:45'], 'a longer row pushes the rest down');
  RSM.update(R, 'b', 'start', '10:00'); eq(R.map(r => r.start), ['08:00', '10:00', '11:00']);
  eq([RSM.update(R, 'b', 'start', ''), RSM.update(R, 'b', 'kind', 'Nap'), RSM.update(R, 'b', 'id', 'z'), RSM.update(R, 'zz', 'title', 'x'), RSM.update(R, 'b', 'dur', -5), R[1].dur], [false, false, false, false, true, 0]);
  eq([RSM.isBreak(R[2]), RSM.isBreak(R[1])], [true, false]);
});

test('run of show: adding, moving up and deleting', () => {
  const R = rosRows();
  eq(RSM.add(R).start, '09:45', 'a new row starts when the last ends'); eq(RSM.add([]).start, '08:00');
  eq(RSM.moveUp(R, 'a'), false);
  RSM.moveUp(R, 'c'); eq(R.map(r => r.id + '@' + r.start), ['a@08:00', 'c@08:30', 'b@08:45', R[3].id + '@09:45'], 'the moved row takes the earlier slot');
  eq([RSM.remove(R, 'c'), RSM.remove(R, 'c'), R.map(r => r.start)], [true, false, ['08:00', '08:45', '09:45']], 'deleting leaves the times as they are');
  const H = { runs: { d1: [RSM.row({ sceneId: 's1' }), RSM.row({ sceneId: 'gone' })] } };
  eq([RSM.unlinkMissing(H, id => id === 's1'), H.runs.d1.map(r => r.sceneId)], [1, ['s1', '']]);
  eq(RSM.printRows(rosRows(), id => id, t => 't' + t)[1], ['t08:30', 60, '', 'Setup', '', '']);
});

test('run of show: building a day from the schedule', () => {
  const S = (id, loc, est, shots = 0) => ({ id, num: id.slice(1), name: 'Look ' + id, loc, est, shots });
  const R = RSM.build({ call: '07:00', mealHours: 6, setups: [S('s1', 'Pier', 90, 2), S('s2', 'Pier', 120, 1), S('s3', 'Barn', 60), S('s4', '', 120), S('s5', 'Barn', 120)] });
  eq(R.map(r => `${r.start} ${r.kind} ${r.title}`), ['07:00 Hair & makeup Talent in hair & makeup', '07:45 Setup 1. Look s1', '09:15 Setup 2. Look s2', '11:15 Move Move to Barn', '11:45 Break Break', '12:00 Setup 3. Look s3', '13:00 Lunch Lunch', '14:00 Setup 4. Look s4', '16:00 Setup 5. Look s5', '18:00 Wrap Wrap & gear check'], 'lunch before the setup that would run past the 13:00 meal deadline');
  eq(RSM.build({ call: '08:00', crew: '06:00', mealHours: 6, setups: [S('s1', '', 150), S('s2', '', 60)] }).map(r => r.start + ' ' + r.kind), ['08:00 Hair & makeup', '08:45 Setup', '11:15 Lunch', '12:15 Setup', '13:15 Wrap'], 'meal hours count from crew call');
  eq(RSM.build({ call: '08:00', mealHours: 6, setups: [S('s1', '', 30), S('s2', '', 400)] }).map(r => r.kind), ['Hair & makeup', 'Setup', 'Setup', 'Wrap'], 'no lunch in the first 2 hours');
  eq([R[0].notes, R[1].notes, R[2].notes, R[1].sceneId], ['First talent ready for set at 07:45', '2 shots', '1 shot', 's1']);
  eq(RSM.build({ call: '', setups: [S('s1', '', 0)] }).map(r => r.start + '/' + r.dur), ['08:00/45', '08:45/60', '09:45/30'], 'no call → 08:00; no estimate → an hour');
  eq(RSM.build({ setups: [] }), []);
  const L = RSM.build({ call: '06:00', mealHours: 12, setups: [S('a1', '', 160), S('a2', '', 30)] });
  eq(L.map(r => r.kind), ['Hair & makeup', 'Setup', 'Break', 'Setup', 'Wrap'], 'a break after 2½ hours when lunch is not due yet');
  const B = RSM.build({ call: '07:00', mealHours: 6, setups: [S('b1', '', 150), S('b2', '', 60), S('b3', '', 150), S('b4', '', 30)] });
  eq(B.map(r => r.kind), ['Hair & makeup', 'Setup', 'Break', 'Setup', 'Lunch', 'Setup', 'Break', 'Setup', 'Wrap'], 'lunch resets the break count; breaks carry on after it');
});

test('run of show vm: day, building and quiet typing', () => {
  const P = fakeProject({ days: [{ id: 'd1', date: '2026-03-01', sceneIds: ['s1'], cs: { crew: '07:00', wrap: '08:30' } }, { id: 'd2', sceneIds: [] }], settings: { mealHours: 6 }, sceneMeta: { s1: { est: 90 } }, photo: { shots: [{ sceneId: 's1' }], runs: {} } });
  const ui = { ros: { day: 'gone' } };
  const vm = new RunOfShowVM({ project: () => P, store: fakeStore(P), ui, fx: { holder: Q => Q.photo, scenes: () => [{ id: 's1', num: 1, label: 'Hero' }], setupName: (Q, s) => s.label, locOf: () => 'Pier', castOf: () => 'Ann', dayLabel: (d, i) => 'Day ' + (i + 1), time: t => t } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.day.id, vm.rows, vm.finish, vm.title], ['d1', [], null, 'Run of show — Day 1'], 'a missing day falls back to the first');
  eq(vm.dayOptions, [{ id: 'd1', label: 'Day 1 (1 setup)' }, { id: 'd2', label: 'Day 2 (0 setups)' }]);
  eq(vm.facts().setups, [{ id: 's1', num: 1, name: 'Hero', loc: 'Pier', est: 90, shots: 1 }]);
  eq([vm.build(), draws, vm.finish], [3, 1, { end: '09:45', late: true }]);
  eq(vm.printRows()[1], ['07:45', 90, '1. Hero', 'Setup', 'Ann', '1 shot']);
  const id = vm.rows[0].id; vm.set(id, 'title', 'Glam'); vm.set(id, 'notes', 'x'); eq([draws, vm.rows[0].title], [1, 'Glam'], 'typing is quiet');
  vm.set(id, 'dur', 60); eq([draws, vm.rows[1].start], [2, '08:00']);
  vm.setDay('d2'); eq([vm.day.id, ui.rosDay, vm.rows], ['d2', 'd2', []]); vm.setDay('nope'); eq(vm.day.id, 'd2');
  vm.add(); eq([P.photo.runs.d2.length, P.photo.runs.d2[0].start], [1, '08:00']);
  vm.moveUp(P.photo.runs.d2[0].id); vm.remove(P.photo.runs.d2[0].id); eq(P.photo.runs.d2, []);
});
