'use strict';
/* Corkboard — model and view-model tests */
const CRM = CardsModel;
function crProject() {
  const P = fakeProject({ mode: 'screenplay', settings: {}, sceneMeta: {}, shots: [{ sceneId: 's1' }] });
  P.blocks = [{ id: 's1', type: 'scene', text: 'INT. A' }, { id: 'a1', type: 'action', text: 'x' }, { id: 's2', type: 'scene', text: 'EXT. B' }, { id: 'a2', type: 'action', text: 'y' }];
  return P;
}
/* a stand-in for getScenes: one scene per heading, with its block range */
const crScenes = P => { const out = []; P.blocks.forEach((b, i) => { if (b.type === 'scene') out.push({ id: b.id, idx: i, num: String(out.length + 1), label: b.text, color: (P.sceneMeta[b.id] || {}).color, act: (P.sceneMeta[b.id] || {}).act }); }); out.forEach((s, k) => { s.end = k < out.length - 1 ? out[k + 1].idx : P.blocks.length; }); return out; };

test('cards: headings, synopses, colours and structure', () => {
  const P = crProject();
  eq(CRM.setHeading(P, 's1', 'int. pier'), 'INT. PIER'); eq(CRM.setHeading(P, 'a1', 'x'), null, 'only scene headings');
  P.settings.rev = 'r1'; CRM.setHeading(P, 's2', 'ext. c'); eq(P.blocks[2].rev, 'r1', 'marked as revised');
  CRM.setSynopsis(P, 's1', 'They meet'); eq(P.sceneMeta.s1.synopsis, 'They meet');
  eq([CRM.setColor(P, 's1', '#30a46c'), CRM.setColor(P, 's1', 'red'), P.sceneMeta.s1.color], [true, false, '#30a46c']);
  CRM.setColor(P, 's1', ''); eq('color' in P.sceneMeta.s1, false);
  eq([CRM.setStructure(P, 'cat'), CRM.structure(P).label, CRM.setStructure(P, 'nope'), CRM.setStructure(P, '')], [true, 'Save the Cat (15 beats)', false, true]);
});

test('cards: adding and removing scenes', () => {
  const P = crProject();
  const h1 = CRM.addScene(P, 2); eq(P.blocks.map(b => b.type), ['scene', 'action', 'scene', 'action', 'scene', 'action']); eq(P.blocks[2], h1);
  P.settings.sceneNumLock = true; P.blocks.forEach(b => { if (b.type === 'scene' && b !== h1) b.num = '9'; }); P.blocks[0].num = '1'; P.blocks[4].num = '2';
  const h2 = CRM.addScene(P); eq([h2.num, P.blocks.length], ['2A', 8], 'locked numbers get a letter');
  CRM.removeScene(P, { idx: 0, end: 8 }); eq([P.blocks.length, P.blocks[0].type], [1, 'scene'], 'never left empty');
});

test('cards: pages, beats, the track and the rows', () => {
  const pg = [0, 0, 1, 2], s = { idx: 0, end: 2 }, t = { idx: 2, end: 4 };
  eq([CRM.span(pg, s), CRM.pages(CRM.span(pg, s)), CRM.pages(CRM.span(pg, t))], [{ a: 1, b: 1 }, 'p.1', 'pp.2–3']);
  const st = CRM.STRUCTURES.three;
  eq(CRM.beatsIn(st, 10, { a: 5, b: 6 }), ['Midpoint']); eq(CRM.beatsIn(null, 10, { a: 1, b: 9 }), []);
  const tr = CRM.track(st, 4, [Object.assign({ id: 'x', num: '1' }, s)], pg);
  eq([tr.segs[0].left, tr.segs[0].width, tr.marks.length, tr.marks[3]], [0, 25, 7, { name: 'Midpoint', page: 2, left: 50 }]);
  const rows = CRM.rows([{ id: 'a', act: 'ACT ONE', color: '#e5484d' }, { id: 'b', act: 'ACT ONE' }, { id: 'c', act: 'ACT TWO', color: '#e5484d' }], '');
  eq(rows.map(r => r.act || r.scene.id), ['ACT ONE', 'a', 'b', 'ACT TWO', 'c']);
  eq(CRM.rows([{ id: 'a', color: '#e5484d' }, { id: 'b' }], '#e5484d').map(r => r.scene.id), ['a']);
});

test('cards vm: board, filter, typing and moving', () => {
  const P = crProject(), ui = { cardColor: 'bogus' }; let moved = null;
  const vm = new CardsVM({ project: () => P, store: fakeStore(P), ui, fx: { scenes: crScenes, paginate: () => ({ count: 2, blockPage: [0, 0, 1, 1] }), sceneDataCount: () => 3, purge: () => { }, moveScene: (Q, a, b, after) => { moved = [a, b, after]; return true; } } });
  let draws = 0; vm.subscribe(() => draws++);
  const B = vm.board; eq([B.rows.length, B.rows[0].heading, B.rows[0].shots, B.rows[1].pages, B.track, B.empty], [2, 'INT. A', 1, 'p.2', null, false]);
  eq(vm.color, '', 'a stale filter is ignored'); vm.setColorFilter('nope'); eq(ui.cardColor, '');
  vm.setHeading('s1', 'int. z'); vm.setSynopsis('s1', 'Hi'); eq(draws, 1, 'typing is quiet');
  vm.setColor('s2', '#0091ff'); vm.setColorFilter('#0091ff'); eq(vm.board.rows.map(r => r.scene.id), ['s2']);
  vm.setStructure('three'); eq(vm.board.track.marks.length, 7);
  const h = vm.addScene('s1'); eq(P.blocks.indexOf(h), 2, 'added after scene 1');
  eq(vm.linkedCount('s1'), 3); vm.removeScene(h.id); eq(P.blocks.some(b => b.id === h.id), false);
  eq(vm.moveScene('s2', 's1', false), true); eq(moved, ['s2', 's1', false]);
});
