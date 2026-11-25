'use strict';
/* Setups & looks (photo) — model and view-model tests */
const SUM = SetupsModel;
/** a small stand-in for getScenes: each scene block runs to the next */
function suScenes(P) {
  const out = []; let n = 0;
  P.blocks.forEach((b, i) => { if (b.type === 'scene') out.push({ id: b.id, num: ++n, idx: i, end: i + 1, chars: new Map() }); else if (out.length) out[out.length - 1].end = i + 1; });
  return out;
}
function suProject() {
  return fakeProject({ mode: 'photo', settings: {},
    blocks: [{ id: 'a', type: 'scene', text: 'Hero — Studio A — Morning' }, { id: 'an', type: 'action', text: 'Soft light' }, { id: 'b', type: 'scene', text: 'Rooftop' }, { id: 'c', type: 'scene', text: 'Still life — Studio B' }, { id: 'cn', type: 'action', text: '' }],
    sceneMeta: { a: { est: '90', color: '#e5484d', synopsis: 'Bold' } }, locations: [{ id: 'L1', name: 'Studio A' }, { id: 'L2', name: 'Rooftop terrace' }],
    days: [{ id: 'd1', sceneIds: ['c'] }], photo: { shots: [{ sceneId: 'a', status: 'Approved' }, { sceneId: 'a', status: 'Planned' }] },
    people: [{ type: 'cast', name: 'Ann', character: '' }, { type: 'cast', name: 'Bo', character: 'MODEL' }, { type: 'crew', name: 'Cy' }], tags: [] });
}

test('setups: headings and parts', () => {
  eq([SUM.heading('Hero', 'Studio A', 'Morning'), SUM.heading('Hero', '', 'Dusk'), SUM.heading('Hero', '', ''), SUM.heading('A — B', ' Pier ', '')], ['Hero — Studio A — Morning', 'Hero —  — Dusk', 'Hero', 'A - B — Pier']);
  eq([SUM.parts({ text: 'Hero — Studio A — Morning' }), SUM.parts({ text: '' }), SUM.parts(null)], [{ name: 'Hero', loc: 'Studio A', time: 'Morning' }, { name: '', loc: '', time: '' }, { name: '', loc: '', time: '' }]);
});

test('setups: cards, notes lines and printing', () => {
  const P = suProject(), sc = suScenes(P);
  eq(SUM.card(P, sc[0]), { id: 'a', num: 1, name: 'Hero', loc: 'Studio A', time: 'Morning', est: '90', synopsis: 'Bold', color: '#e5484d', notes: 'Soft light', shots: 2, done: 1, day: -1 });
  eq([SUM.card(P, sc[1]).notes, SUM.card(P, sc[2]).day], ['', 0]);
  eq([SUM.ensureNotes(P, sc), P.blocks.map(b => b.type).join(','), SUM.ensureNotes(P, suScenes(P))], [1, 'scene,action,scene,action,scene,action', 0]);
  eq(SUM.printRows(P, suScenes(P))[0], [1, 'Hero', 'Studio A', 'Morning', '90', 'Bold', 2]);
});

test('setups: adding, moving, duplicating and deleting', () => {
  const P = suProject();
  const h1 = SUM.add(P, suScenes(P)); eq([h1.text, P.blocks.slice(-1)[0].type], ['Setup 4', 'action']);
  const h2 = SUM.add(P, suScenes(P), 0); eq(P.blocks.slice(2, 4).map(b => b.id === h2.id ? 'new' : b.type), ['new', 'action'], 'after the first setup');
  const Q = suProject(); eq(SUM.move(Q, suScenes(Q), 0, 1), true); eq(Q.blocks.map(b => b.id).join(' '), 'b a an c cn');
  eq([SUM.move(Q, suScenes(Q), 0, -1), SUM.move(Q, suScenes(Q), 2, 1)], [false, false]);
  SUM.move(Q, suScenes(Q), 2, -1); eq(Q.blocks.map(b => b.id).join(' '), 'b c cn a an');
  const R = suProject(), d = SUM.duplicate(R, suScenes(R)[0]);
  eq([d.text, R.blocks[2].text, R.blocks[3].text, R.sceneMeta[d.id], R.blocks[2].id === 'a'], ['Hero (copy) — Studio A — Morning', 'Hero (copy) — Studio A — Morning', 'Soft light', { est: '90', color: '#e5484d', synopsis: 'Bold' }, false]);
  R.sceneMeta[d.id].est = '5'; eq(R.sceneMeta.a.est, '90', 'the copy has its own fields');
  SUM.remove(R, suScenes(R)[0]); eq(R.blocks[0].id, d.id);
});

test('setups: fields and the location link', () => {
  const P = suProject(), sc = suScenes(P);
  SUM.setPart(P, sc[1], 'loc', 'rooftop terrace'); eq([P.blocks[2].text, P.sceneMeta.b.locationId], ['Rooftop — rooftop terrace', 'L2']);
  SUM.setPart(P, sc[1], 'loc', 'Roof'); eq([P.blocks[2].text, 'locationId' in P.sceneMeta.b], ['Rooftop — Roof', false]);
  SUM.setPart(P, sc[1], 'time', 'Dusk'); SUM.setPart(P, sc[1], 'name', 'Top'); eq(P.blocks[2].text, 'Top — Roof — Dusk');
  eq(SUM.setPart(P, sc[1], 'text', 'x'), false);
  SUM.setEst(P, 'b', '45'); SUM.setEst(P, 'c', -3); SUM.setEst(P, 'a', ''); eq([P.sceneMeta.b.est, P.sceneMeta.c.est, P.sceneMeta.a.est], ['45', '0', '']);
  eq([SUM.setColor(P, 'a', '#000'), SUM.setColor(P, 'a', ''), 'color' in P.sceneMeta.a, SUM.setColor(P, 'b', '#2468d8'), P.sceneMeta.b.color], [false, true, false, true, '#2468d8']);
  SUM.setNotes(P, sc[1], 'Wind'); eq(P.blocks.slice(2, 4).map(b => b.type + ':' + b.text), ['scene:Top — Roof — Dusk', 'action:Wind'], 'a missing notes line is made');
  eq(SUM.talentChoices(P, ['MODEL'], t => t.toUpperCase()), [{ value: 'Ann', label: 'Ann' }]);
});

test('setups vm: cards, quiet typing, talent and commands', () => {
  const P = suProject(), ui = {};
  const vm = new SetupsVM({ project: () => P, store: fakeStore(P), ui, fx: { scenes: suScenes, cast: (Q, s) => new Set(Q.tags.filter(t => t.sceneId === s.id).map(t => t.text.toUpperCase())), norm: t => (t || '').toUpperCase(),
    tag: (Q, id, cat, text) => { const t = { sceneId: id, cat, text }; Q.tags.push(t); return t; }, untag: (Q, t) => { Q.tags = Q.tags.filter(x => x !== t); }, linked: (Q, id) => id === 'a' ? 3 : 0 } });
  eq(P.blocks.filter(b => b.type === 'action').length, 3, 'notes lines are added on open');
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.cards.length, vm.cards[0].talentChoices.length, vm.locations, vm.linked('a')], [3, 2, ['Studio A', 'Rooftop terrace'], 3]);
  vm.setPart('a', 'name', 'Hero 2'); vm.setEst('a', 60); vm.setSynopsis('a', 'x'); vm.setNotes('a', 'y'); eq([draws, vm.cards[0].name, vm.cards[0].notes], [0, 'Hero 2', 'y'], 'typing is quiet');
  vm.setColor('a', '#1e8e54'); eq(draws, 1);
  eq([vm.addTalent('b', 'Bo'), vm.cards[1].cast, vm.addTalent('b', '')], [true, ['BO'], false]);
  eq([vm.removeTalent('b', 'NOBODY'), vm.removeTalent('b', 'BO'), vm.cards[1].cast], [false, true, []]);
  vm.add('a'); eq(suScenes(P)[1].id === 'b', false, 'added after the first'); vm.move('c', -1);
  const n = suScenes(P).length; vm.duplicate('a'); vm.remove('a'); eq(suScenes(P).length, n);
  vm.openIn('photoshots', 'b'); vm.openIn('breakdown', 'c'); eq([ui.phSetup, ui.scene], ['b', 'c']);
  eq([vm.move('zz', 1), vm.remove('zz'), vm.setColor('zz', '')], [false, false, false]);
});
