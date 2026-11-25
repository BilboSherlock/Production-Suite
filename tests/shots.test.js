'use strict';
/* Shot list — model and view-model tests */
const SM = ShotsModel;
const shScenes = [{ id: 's1', num: '1', label: 'INT. CINEMA' }, { id: 's2', num: '2', label: 'EXT. STREET' }, { id: 's3', num: '3', label: 'INT. BOOTH' }];
function shProject() {
  const P = fakeProject({ shots: [], takes: [{ id: 'k1', shotId: 'a' }, { id: 'k2', shotId: 'b' }], boards: [{ id: 'f1', shotId: 'a', img: 'data:board' }], sceneMeta: {}, shotTags: [{ id: 't1', name: 'VFX' }, { id: 't2', name: 'Drone' }] });
  P.shots.push(SM.newShot('s1', { id: 'a', size: 'WS', lens: '24mm', equip: 'Dolly', tags: ['t1'] }), SM.newShot('s2', { id: 'c', done: true }), SM.newShot('s1', { id: 'b', size: 'CU', lens: '50mm', equip: 'Tripod', tags: ['t1', 't2'], ref: 'data:ref' }));
  return P;
}

test('shots: labels, frames and tag filters', () => {
  const P = shProject();
  eq(P.shots.map(s => SM.label(P, s, shScenes)), ['1A', '2A', '1B']); eq(SM.label(P, SM.newShot('gone'), shScenes), '?');
  eq([SM.frame(P, P.shots[0]), SM.frame(P, P.shots[2]), SM.frame(P, P.shots[1])], [{ kind: 'board', src: 'data:board' }, { kind: 'ref', src: 'data:ref' }, null]);
  const F = (ids, all) => ({ ids: new Set(ids), all });
  eq(P.shots.filter(s => SM.passTags(s, F(['t2']))).map(s => s.id), ['b']); eq(P.shots.filter(s => SM.passTags(s, F(['t1', 't2'], true))).map(s => s.id), ['b']);
  eq(P.shots.filter(s => SM.passTags(s, F(['__none']))).map(s => s.id), ['c']); eq(SM.passTags(P.shots[0], null), true);
  eq(SM.tagNames(P, P.shots[2]), 'VFX, Drone');
});

test('shots: adding, editing, moving and duplicating', () => {
  const P = shProject();
  const n = SM.add(P, 's1'); eq([P.shots.indexOf(n), n.lens, n.equip], [3, '50mm', 'Tripod'], 'after the scene’s last shot, same lens and kit');
  const m = SM.add(P, 's3'); eq([P.shots.indexOf(m), m.lens], [4, '']);
  eq(SM.update(n, 'size', 'MCU'), true); eq(SM.update(n, 'done', 'yes'), false); SM.setDone(n, 1); eq(n.done, true);
  eq(SM.move(P, 'b', -1), true); eq(SM.ofScene(P, 's1').map(s => s.id), ['b', 'a', n.id]); eq(SM.move(P, 'b', -1), false);
  const c = SM.duplicate(P, 'a'); eq([P.shots[P.shots.indexOf(c) - 1].id, c.done, c.tags], ['a', false, ['t1']]); c.tags.push('t2'); eq(SM.find(P, 'a').tags, ['t1'], 'copy is deep');
  SM.setRef(P.shots[0], ''); eq('ref' in P.shots[0], false);
});

test('shots: deleting cleans up takes and frames; masters and reset', () => {
  const P = shProject();
  eq(SM.remove(P, 'a'), true); eq([P.takes.map(t => t.id), P.boards[0].shotId], [['k2'], '']); eq(SM.remove(P, 'a'), false);
  eq(SM.addMasters(P, shScenes), 1); eq(SM.ofScene(P, 's3')[0].size, 'Master');
  eq(SM.resetDone(P), 1); eq(P.shots.some(s => s.done), false);
  SM.setDirNotes(P, 's2', 'Handheld energy'); eq(P.sceneMeta.s2.dirNotes, 'Handheld energy');
});

test('shots: groups, progress, CSV and print', () => {
  const P = shProject(), F = { ids: new Set(['t1']), all: false };
  const g = SM.groups(P, shScenes, 'all', F); eq(g.map(x => [x.scene.id, x.shots.length, x.any]), [['s1', 2, 2], ['s2', 0, 1], ['s3', 0, 0]]);
  eq(SM.groups(P, shScenes, 's2', null)[0].progress, { done: 1, total: 1, pct: 100 });
  const csv = SM.csvRows(P, shScenes, null); eq(csv.length, 4); eq(csv[1].slice(0, 3), ['1', '1A', 'WS']); eq(csv[3][10], 'Yes');
  const pr = SM.printRows(P, shScenes, 'all', F); eq(pr.rows.map(r => r.grp || r[0]), ['Scene 1 — INT. CINEMA', '1A', '1B']); eq(pr.rows[2][7], 'VFX, Drone');
});

test('shots vm: scene filter, target, selection and commands', () => {
  const P = shProject(), ui = { shotScene: 'gone', scene: 's2', shotTagF: { all: true } };
  const vm = new ShotsVM({ project: () => P, store: fakeStore(P), ui, fx: { scenes: () => shScenes } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.sceneId, vm.target, vm.side, ui.shotTagF.ids instanceof Set], ['all', 's2', null, true]);
  vm.setScene('s1'); eq([vm.target, vm.side.scene.num, vm.groups.length], ['s1', '1', 1]);
  const d = draws; vm.update('a', 'desc', 'Wide on the lobby', { quiet: true }); vm.setDirNotes('Slow', { quiet: true }); eq([draws, P.sceneMeta.s1.dirNotes], [d, 'Slow']);
  const s = vm.add(); eq(s.sceneId, 's1');
  vm.setSelecting(true); vm.pickShown(); eq(vm.pickedShots.length, 3); vm.remove(s.id); eq(vm.picked.size, 2); vm.setSelecting(false); eq(vm.picked.size, 0);
  vm.setDone('a', true); eq([vm.progress.done, vm.progress.total, Math.round(vm.progress.pct)], [2, 3, 67]);
  eq(vm.addMasters(), 1); vm.resetDone(); eq(vm.progress.done, 0); eq(vm.label(P.shots[2]), '1B');
});
