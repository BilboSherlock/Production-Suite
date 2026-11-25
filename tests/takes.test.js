'use strict';
/* Script supervisor (take log + lined script) — model and view-model tests */
const TKM = TakesModel, LNM = LinedModel;
const tkScenes = [{ id: 'h1', num: 1, label: 'Kitchen' }, { id: 'h2', num: 2, label: 'Street' }];
function tkProject() {
  return fakeProject({
    mode: 'screenplay', takes: [], lined: [],
    blocks: [{ id: 'h1', type: 'scene' }, { id: 'b1', type: 'action' }, { id: 'b2', type: 'dialogue' }, { id: 'h2', type: 'scene' }, { id: 'b3', type: 'action' }, { id: 'b4', type: 'action' }],
    shots: [{ id: 's1', sceneId: 'h1', size: 'WS', lens: '24', desc: 'Wide' }, { id: 's2', sceneId: 'h1', size: 'CU', desc: 'Ann' }, { id: 's3', sceneId: 'h2', size: 'MS' }],
  });
}
/* two pages: blocks 0–2 on page 1 (with a blank row), a dual column and blocks 3–5 on page 2 (block 4 runs on to page 3) */
const tkPages = { labels: ['1', '2', '3'], pages: [
  { lines: [{ kind: 'line', bi: 0 }, { kind: 'blank' }, { kind: 'line', bi: 1 }, { kind: 'line', bi: 2 }] },
  { lines: [{ kind: 'line', bi: 3 }, { kind: 'dual', h: 2, left: [{ bi: 3 }, { bi: 3 }], right: [{ bi: 4 }] }, { kind: 'line', bi: 4 }] },
  { lines: [{ kind: 'line', bi: 4 }, { kind: 'line', bi: 5 }] }] };

test('takes: adding, editing, circling and totals', () => {
  const P = tkProject();
  const a = TKM.add(P, 's1'); eq([a.n, a.roll, a.sound], [1, '', '']);
  TKM.set(P, a.id, 'roll', 'A001'); TKM.set(P, a.id, 'sound', 'S01');
  const b = TKM.add(P, 's1'), c = TKM.add(P, 's2'); eq([b.n, b.roll, c.n, c.roll, c.sound], [2, 'A001', 1, 'A001', 'S01'], 'numbered on, on the same rolls (else the last ones used)');
  eq([TKM.set(P, a.id, 'n', ''), a.n, TKM.set(P, a.id, 'n', '5'), a.n, TKM.set(P, a.id, 'status', 'x'), TKM.set(P, 'zz', 'notes', 'x')], [true, 1, true, 5, false, false]);
  eq(TKM.ofShot(P, 's1').map(t => t.n), [2, 5], 'in take order');
  const shot = TKM.setStatus(P, b.id, 'circle'); eq([shot && shot.id, P.shots[0].done, TKM.setStatus(P, a.id, 'circle'), TKM.setStatus(P, c.id, 'bogus'), c.status], ['s1', true, null, null, ''], 'only the first circle marks the shot');
  eq([TKM.totalsText(P), TKM.sceneText(P, 'h1'), TKM.sceneText(P, 'h2'), TKM.sceneText(P, 'zz')], ['3 takes logged · 2 circled', '1/2 shots circled · 3 takes', '0/1 shots circled · 0 takes', 'No shots planned']);
  eq(TKM.shotsOf(P, 'h1').map(x => [x.shot.id, x.takes.length, x.circled]), [['s1', 2, true], ['s2', 1, false]]);
  eq([TKM.remove(P, c.id), TKM.remove(P, c.id), P.takes.length], [true, false, 2]);
  eq(TKM.statusLabel('ng'), 'NG');
});

test('takes: reports and CSV', () => {
  const P = tkProject(); eq(TKM.report(P, tkScenes, 'camera'), null, 'nothing logged');
  const a = TKM.add(P, 's1'); TKM.set(P, a.id, 'roll', 'B002'); TKM.setStatus(P, a.id, 'circle');
  const b = TKM.add(P, 's3'); TKM.set(P, b.id, 'roll', 'A001'); TKM.set(P, b.id, 'sound', 'S9');
  P.takes.push(TKM.newTake('gone', 1));
  const cam = TKM.report(P, tkScenes, 'camera');
  eq(cam.rows.map(r => r.grp || r.slice(0, 4).join('|')), ['Camera roll / card (no roll) — 1 take, 0 circled', '|wild|1|—', 'Camera roll / card A001 — 1 take, 0 circled', '2|2A|1|—', 'Camera roll / card B002 — 1 take, 1 circled', '1|1A|1|Circle (print)'], 'by roll, sorted; a take without a shot is wild'); eq(cam.headers[6], 'Sound roll'); eq(TKM.report(P, tkScenes, 'sound').rows[0].grp, 'Sound roll (no roll) — 2 takes, 1 circled');
  eq(TKM.report(P, tkScenes, 'continuity').rows, [{ grp: 'Scene 1 — Kitchen' }, ['1A', 1, 'Circle (print)', 'WS', '24', 'Wide', ''], { grp: 'Scene 2 — Street' }, ['2A', 1, '—', 'MS', undefined, undefined, '']]);
  eq(TKM.csvRows(P, tkScenes)[1], [1, '1A', 1, 'Circle (print)', 'B002', '', '', '', '']);
});

test('lined: page layout, lines, columns and marks', () => {
  const P = tkProject(), M = LNM.layout(P, tkPages);
  eq([M.pages.map(p => p.n), M.seg.get(3), M.seg.get(4)], [[4, 4, 2], [{ page: 1, r0: 0, r1: 2 }], [{ page: 1, r0: 1, r1: 3 }, { page: 2, r0: 0, r1: 0 }]]);
  eq([LNM.blockAt(M, 0, 1), LNM.blockAt(M, 1, 2), LNM.blockAt(M, 1, 1), LNM.blockAt(M, 0, 9)], [0, 3, 3, 2], 'a blank row is the line above; dual rows read left then right');
  eq([LNM.span(M, 1, 4, 1), LNM.span(M, 0, 1, 2), LNM.pageOf(M, 'h2'), LNM.pageOf(M, 'zz')], [{ r0: 0, r1: 3 }, null, 1, null]);
  const l1 = LNM.add(P, 's1', 2, 1, 'on'), l2 = LNM.add(P, 's3', 3, 4, 'off'), l3 = LNM.add(P, 's2', 1, 1, 'weird');
  eq([l1.from, l1.to, l3.kind, LNM.add(P, 's1', 0, 99)], ['b1', 'b2', 'on', null]);
  P.lined.push({ id: 'x', shotId: 'gone', from: 'b1', to: 'b2', kind: 'on' });
  const items = LNM.lines(P, M); eq(items.map(i => [i.l.id === l1.id, i.a, i.b]), [[true, 1, 2], [false, 3, 4], [false, 1, 1]], 'lines to a deleted shot are dropped');
  const cols = LNM.columns(items); eq([cols.get(l1.id), cols.get(l3.id), cols.get(l2.id)], [0, 1, 0], 'overlapping lines get their own column');
  P.takes.push(TKM.newTake('s3', 2, { status: 'circle' }), TKM.newTake('s3', 4, { status: 'circle' }));
  const m1 = LNM.marks(P, M, 1, items, cols, tkScenes);
  eq(m1.map(m => [m.label, m.kind, m.circ, m.x, m.top, m.height, m.topCut, m.botCut]), [['2A · T2,4', 'off', true, 0, 0, 48, false, true]], 'runs on to the next page');
  eq(m1[0].title, 'Slate 2A · T2,4 — off camera · scene 2');
  eq(LNM.marks(P, M, 2, items, cols, tkScenes).map(m => [m.top, m.topCut, m.botCut]), [[0, true, false]]);
  eq(LNM.marks(P, M, 0, items, cols, tkScenes).map(m => [m.label, m.x, m.top, m.height]), [['1A', 0, 24, 24], ['1B', 11, 24, 12]]);
  eq([LNM.toggle(P, l1.id), l1.kind, LNM.toggle(P, 'zz'), LNM.remove(P, l1.id), LNM.remove(P, l1.id)], [true, 'off', false, true, false]);
  eq(LNM.shotChoices(P, tkScenes).map(c => c.label), ['1A — WS · Wide', '1B — CU · Ann', '2A — MS']);
});

test('script supervisor vms: tabs, scenes, takes and lines', () => {
  const P = tkProject(), ui = { takeScene: 'gone' }, store = fakeStore(P);
  const vm = new TakesVM({ project: () => P, store, ui, fx: { scenes: () => tkScenes } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.tab, vm.scene.id, vm.sceneList.map(s => s.on)], ['log', 'h1', [true, false]]);
  vm.setTab('lined'); eq([ui.takeTab, vm.tab, draws], ['lined', 'lined', 0], 'the view swaps screens');
  vm.setScene('h2'); eq([vm.scene.id, draws, vm.shots.map(x => x.slate)], ['h2', 1, ['2A']]);
  const t = vm.addTake('s3'); const d0 = draws; vm.setTake(t.id, 'notes', 'Plane'); vm.setTake(t.id, 'n', 3); eq([draws, t.notes, t.n, store.touches], [d0, 'Plane', 3, 3], 'typing is quiet');
  eq([vm.setStatus(t.id, 'circle').id, draws, vm.shots[0].circled], ['s3', d0 + 1, true]);
  eq([vm.report('camera').rows.length, vm.csvRows().length], [2, 2]);
  vm.showShots('h2'); eq(ui.shotScene, 'h2'); vm.removeTake(t.id); eq(P.takes.length, 0);

  const lvm = new LinedVM({ project: () => P, store, ui, fx: { scenes: () => tkScenes, paginate: () => tkPages } });
  eq([lvm.hasShots, lvm.pageCount, lvm.shotId, lvm.kind, lvm.countText], [true, 3, 's3', 'on', '0 coverage lines'], 'the slate follows the take log scene');
  lvm.setKind('off'); lvm.setShot('s1'); eq([ui.lineKind, ui.lineShot, lvm.shotId], ['off', 's1', 's1']);
  const l = lvm.addLine(2, 1); eq([l.shotId, l.kind, l.from, lvm.countText, lvm.allMarks().map(m => m.length)], ['s1', 'off', 'b1', '1 coverage line', [1, 0, 0]]);
  lvm.addLine(3, 4); lvm.setShot('s2'); lvm.useSlate(P.lined[1].id); eq(lvm.shotId, 's1');
  lvm.toggleLine(l.id); eq(l.kind, 'on');
  lvm.openTakes(P.lined[0].id); eq([ui.takeScene, ui.takeTab], ['h1', 'log']);
  eq([lvm.blockAt(1, 1), lvm.span(4, 1, 0), lvm.pageOfScene('h2')], [3, { r0: 2, r1: 3 }, 1]);
  lvm.removeLine(l.id); eq(lvm.countText, '1 coverage line');
  P.shots = []; eq(lvm.hasShots, false);
});
