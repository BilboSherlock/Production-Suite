'use strict';
/* Storyboard — model and view-model tests */
const BM2 = BoardsModel;
const sbScenes = [{ id: 's1', num: '1', label: 'INT. CINEMA' }, { id: 's2', num: '2', label: 'EXT. STREET' }];
function sbProject() {
  const P = fakeProject({ settings: { aspect: '2.39:1' }, seqs: [], boards: [], shots: [ShotsModel.newShot('s1', { id: 'h1', lens: '35mm' })] });
  const q = BM2.addSeq(P, 'Opening'); q.id = 'q1';
  BM2.add(P, { id: 'f1', seqId: 'q1', sceneId: 's1', shotId: 'h1', dur: 2, caption: 'Lobby' });
  BM2.add(P, { id: 'f2', seqId: 'q1', dur: 4, cam: { a: {}, b: {} }, layers: [{ id: 'L1' }] });
  BM2.add(P, { id: 'f3', sceneId: 's2' });
  return P;
}

test('storyboard: aspect, runtime and the default view', () => {
  const P = sbProject();
  eq(BM2.aspect(P), 2.39); eq(BM2.setAspect(P, '5:4'), false); BM2.setAspect(P, '1:1'); eq(BM2.aspect(P), 1);
  eq([BM2.runtime(P.boards), BM2.hasMove(P.boards[1]), BM2.clock(75)], [9, true, '1:15']);
  eq(BM2.defaultView(P), 'seq'); eq(BM2.defaultView({ boards: [{ sceneId: 's1' }], seqs: [] }), 'scene');
});

test('storyboard: groups by sequence and by scene', () => {
  const P = sbProject();
  eq(BM2.seqGroups(P).map(g => [g.title, g.frames.map(b => b.id), g.secs]), [['Opening', ['f1', 'f2'], 6], ['Unsorted', ['f3'], undefined]]);
  eq(BM2.seqGroups({ boards: [], seqs: [] }).map(g => g.title), ['Frames']);
  eq(BM2.sceneGroups(P, sbScenes).map(g => [g.key, g.frames.length]), [['sc:s1', 1], ['sc:s2', 1], ['sc:', 1]]);
  eq(BM2.cornerLabel(P, P.boards[0], 0, sbScenes), 'Sc 1 · 1A · Frame 1');
  eq(BM2.printGroups(P, sbScenes, 'scene').map(g => g[0]), ['1. INT. CINEMA', '2. EXT. STREET']);
});

test('storyboard: copy, paste, duplicate, step, place and delete', () => {
  const P = sbProject();
  const d = BM2.duplicate(P, 'f2'); eq([P.boards.indexOf(d), d.shotId, d.layers[0].id !== 'L1', d.layers.length], [2, '', true, 1]);
  d.cam.b.x = 1; eq(P.boards[1].cam.b.x, undefined, 'copy is deep');
  const p = BM2.paste(P, P.boards[0], 'f3', { seqId: 'q1' }); eq([P.boards[P.boards.length - 1], p.seqId, p.shotId], [p, 'q1', '']);
  const e = BM2.paste(P, P.boards[0], null); eq(P.boards[P.boards.length - 1], e);
  eq(BM2.step(P, 'f1', 1, ['f1', 'f2']), true); eq(P.boards.slice(0, 2).map(b => b.id), ['f2', 'f1']); eq(BM2.step(P, 'f2', -1, ['f2', 'f1']), false);
  eq(BM2.place(P, 'f3', 'f2', { seqId: 'q1' }), true); eq([P.boards[0].id, P.boards[0].seqId], ['f3', 'q1']);
  BM2.place(P, 'f3', null, { seqId: '' }); eq(P.boards[P.boards.length - 1].id, 'f3');
  eq(BM2.addAfter(P, P.boards[0]).seqId, 'q1');
  eq(BM2.remove(P, 'f3'), true); eq(BM2.find(P, 'f3'), null);
});

test('storyboard: sequences', () => {
  const P = sbProject(), r = BM2.addSeq(P, '  '); eq([r.name, r.color], ['Sequence', BM2.SEQ_COLORS[1]]);
  BM2.updateSeq(r, 'name', 'Chase'); eq(BM2.updateSeq(r, 'id', 'x'), false);
  eq(BM2.moveSeq(P, r.id, -1), true); eq(P.seqs.map(s => s.name), ['Chase', 'Opening']); eq(BM2.moveSeq(P, r.id, -1), false);
  eq(BM2.removeSeq(P, 'q1'), true); eq(P.boards.filter(b => b.seqId).length, 0, 'frames stay, unsorted');
});

test('storyboard: frames from scenes and shots, and shots from frames', () => {
  const P = sbProject();
  eq(BM2.fromScript(P, sbScenes, s => 'Caption ' + s.num), 0, 'both scenes already have frames');
  P.boards = P.boards.filter(b => b.sceneId !== 's2'); eq(BM2.fromScript(P, sbScenes, s => 'Caption ' + s.num), 1); eq(P.boards[P.boards.length - 1].caption, 'Caption 2');
  P.shots.push(ShotsModel.newShot('s2', { id: 'h2', desc: 'Wide', size: 'WS' })); eq(BM2.fromShots(P), 1); eq(P.boards[P.boards.length - 1].size, 'WS');
  P.boards[1].sceneId = ''; const r = BM2.shotsFromFrames(P); eq(r, { n: 1, skipped: 1 });
  const made = P.shots.find(s => s.id === P.boards[2].shotId); eq([made.sceneId, made.desc], ['s2', 'Caption 2']);
});

test('storyboard: saving from the studio syncs the linked shot', () => {
  const P = sbProject();
  BM2.save(P, 'f1', { id: 'other', img: 'data:x', size: 'CU', lens: '', caption: 'Close on her' }, false);
  eq([P.boards[0].id, P.boards[0].img, P.shots[0].size, P.shots[0].lens, P.shots[0].desc], ['f1', 'data:x', 'CU', '35mm', 'Close on her']);
  BM2.save(P, 'f3', { caption: 'Street' }, true); eq(P.shots.length, 2); eq(P.boards[2].shotId, P.shots[1].id);
  BM2.save(P, 'f1', { size: 'ECU', sync: false }); eq(P.shots[0].size, 'CU', 'sync off');
});

test('storyboard vm: view, columns, clipboard and commands', () => {
  const P = sbProject(), ui = {};
  const vm = new BoardsVM({ project: () => P, store: fakeStore(P), ui, fx: { scenes: () => sbScenes, caption: (P, s) => s.label } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.view, vm.cols], ['seq', 3]); vm.setCols(9); eq(vm.cols, 6); vm.setView('scene'); eq(vm.groupOf(P.boards[0]), { sceneId: 's1' });
  eq(vm.paste(), null, 'nothing copied'); vm.copy('f1'); const p = vm.paste('f1', vm.groupOf(P.boards[0])); eq(P.boards[1], p);
  const d = draws; vm.setCaption('f1', 'Typed', { quiet: true }); eq([draws, P.boards[0].caption], [d, 'Typed']);
  const s = vm.addSeq('Act two'); eq([vm.view, P.seqs[1], s.name], ['seq', s, 'Act two']);
  eq(vm.shotLabelOf(P.boards[0]), '1A'); eq(vm.printGroups.length, 2);
  vm.shotFromFrame('f3'); eq(P.shots.length, 2); vm.unlinkShot('f3'); vm.freeFromScene('f1'); eq([P.boards[0].sceneId, P.boards[0].shotId], ['', '']);
});
