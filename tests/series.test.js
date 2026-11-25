'use strict';
/* Series bible — model and view-model tests */
const SRM = SeriesModel;
const srEsc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
function srEp(id, season, ep, o = {}) {
  return Object.assign(fakeProject({ id, title: 'Ep ' + id, mode: 'screenplay', created: 0, meta: { logline: '', author: 'Ann' }, settings: { currency: 'USD' }, blocks: [], people: [], locations: [], casting: { roles: [] } }),
    { series: { id: 'S', name: 'Show', season, ep, bible: Object.assign(SRM.blankBible(), o.bible || {}) } }, o.p || {});
}

test('series: codes, order and the newest bible', () => {
  eq([SRM.epCode({ season: 1, ep: 4 }), SRM.epCode({ season: 12, ep: 103 }), SRM.epCode(null)], ['S01E04', 'S12E103', '']);
  const a = srEp('a', 2, 1), b = srEp('b', 1, 2), c = srEp('c', 1, 1), x = fakeProject({ id: 'x' });
  eq(SRM.episodes([a, b, c, x], 'S').map(e => e.id), ['c', 'b', 'a']);
  a.series.bible = Object.assign(SRM.blankBible(), { premise: 'New', v: 5 }); a.series.name = 'Show 2'; b.series.bible.v = 3;
  eq([SRM.adopt(c, [a, b, c]), c.series.bible.premise, c.series.name, c.series.bible === a.series.bible], [true, 'New', 'Show 2', false], 'a copy, not the same object');
  eq(SRM.adopt(c, [a, b, c]), false, 'already newest');
  c.series.bible.tone = 'Dry'; const changed = SRM.share(c, [a, b, c], 9);
  eq([changed.map(e => e.id), c.series.bible.v, a.series.bible.tone, b.series.name, a.series.bible === c.series.bible], [['a', 'b'], 9, 'Dry', 'Show 2', false]);
});

test('series: joining, leaving, numbering and the next episode', () => {
  const P = fakeProject({ title: 'Pilot' });
  eq(SRM.start(P, '  ', 'x', 0, 'S1'), { id: 'S1', name: 'Pilot', season: 1, ep: 1, bible: SRM.blankBible() });
  SRM.setNumber(P.series, '2', '-4'); eq([P.series.season, P.series.ep], [2, 1]);
  eq([SRM.leave(P), P.series, SRM.leave(P)], [true, null, false]);
  const e1 = srEp('a', 1, 1, { p: { people: [{ id: 'p', type: 'cast', name: 'Bo', unavail: 'Mon' }], fin: { lines: [1], txns: [2], locked: true } } }), e2 = srEp('b', 1, 2), e3 = srEp('c', 2, 1);
  eq([SRM.nextEp([e1, e2, e3], 1), SRM.nextEp([e1, e2, e3], 2), SRM.nextEp([], 3)], [3, 2, 1]);
  const blank = () => fakeProject({ id: 'new', meta: {}, settings: {}, people: [], locations: [] });
  const n = SRM.fillEpisode(blank(), e1, [e1, e2, e3], true, () => 'action');
  eq([n.title, n.series.season, n.series.ep, n.blocks.map(b => b.type), n.meta.author, n.settings.currency], ['Show — Episode 2', 2, 2, ['scene', 'action'], 'Ann', 'USD'], 'after the last episode, in its season');
  eq([n.people[0].name, n.people[0].unavail, e1.people[0].unavail, n.fin.lines, n.fin.txns, n.fin.locked], ['Bo', '', 'Mon', [1], [], false]);
  eq(SRM.fillEpisode(blank(), e1, [e1], false, () => 'action').people, [], 'no carry-over');
});

test('series: characters and season arcs', () => {
  const S = { name: 'Show', bible: { premise: 'P', characters: [{ name: 'ann' }] } }, B = SRM.ensure(S);
  eq([B.tone, B.arcs, !!B.characters[0].id, B.characters[0].arc], ['', {}, true, '']);
  eq([SRM.setText(B, 'tone', 'Dry'), SRM.setText(B, 'v', 1), SRM.setText(B, 'characters', 'x')], [true, false, false]);
  eq([SRM.importCharacters(B, ['ANN', 'BO', 'BO ']), B.characters.map(c => c.name)], [1, ['ann', 'BO']]);
  const id = B.characters[1].id;
  eq([SRM.setCharacter(B, id, 'arc', 'Grows'), SRM.setCharacter(B, id, 'id', 'x'), SRM.setCharacter(B, 'zz', 'name', 'x')], [true, false, false]);
  eq(SRM.castMissing(B, [{ type: 'cast', character: 'Ann' }, { type: 'crew', character: 'BO' }]), ['BO']);
  eq(SRM.appearances([{ c: ['BO'] }, { c: [] }, { c: ['BO', 'ANN'] }], 'Bo ', e => new Set(e.c)), 2);
  eq([SRM.removeCharacter(B, id), SRM.removeCharacter(B, id), B.characters.length], [true, false, 1]);
  const eps = [{ series: { season: 1 } }, { series: { season: 3 } }];
  eq(SRM.seasons(eps, B), [1, 3]); eq([SRM.addSeason(B, eps), B.arcs[4], SRM.seasons(eps, B)], [4, ' ', [1, 3, 4]]);
  eq([SRM.setArc(B, '2', 'Turn'), SRM.setArc(B, 0, 'x'), B.arcs[2]], [true, false, 'Turn']);
});

test('series: printed bible and episode guide', () => {
  const S = { name: 'A&B', bible: SRM.ensure({ bible: { premise: 'Big <idea>', characters: [{ id: 'c', name: 'Ann', desc: 'Lead', arc: '' }], arcs: { 2: 'Two', 1: ' ' } } }) };
  const html = SRM.bibleHtml(S, srEsc);
  eq([html.startsWith('<h1>A&amp;B — Series bible</h1><h3>Premise</h3><p style="white-space:pre-wrap">Big &lt;idea></p>'), html.includes('<p><b>Ann</b> — Lead</p>'), html.includes('Season 1 arc'), html.includes('<h3>Season 2 arc</h3>'), html.includes('Tone')], [true, true, false, true, false]);
  const g = SRM.guideHtml(S, [srEp('a', 1, 1, { p: { meta: { logline: 'Hi' } } })], srEsc, () => 7);
  eq(g.includes('<tr><td>S01E01</td><td>Ep a</td><td>Hi</td><td>7</td></tr>'), true);
});

test('series vm: sharing, typing, characters and episodes', async () => {
  const a = srEp('a', 1, 1, { bible: { premise: 'Old', v: 1 }, p: { blocks: [{ type: 'character', text: 'ANN' }] } }), b = srEp('b', 1, 2, { bible: { premise: 'Newer', v: 2 } });
  const saved = [], added = []; let now = 100;
  const vm = new SeriesVM({ project: () => a, store: fakeStore(a), ui: { bibleTab: 'nope' }, fx: { projects: () => [a, b], persist: async e => saved.push(e.id), add: async p => added.push(p), blankProject: (m, t) => fakeProject({ id: 'n', mode: m, title: t, meta: {}, settings: {} }),
    defType: () => 'action', newPerson: t => ({ type: t, character: '' }), charsOf: P => new Set((P.blocks || []).filter(x => x.type === 'character').map(x => x.text)), pagesOf: () => 1, esc: srEsc, now: () => now, delay: 5 } });
  eq([a.series.bible.premise, vm.tab, vm.code, vm.episodes.length], ['Newer', 'bible', 'S01E01', 2], 'the newest bible is adopted on open');
  let draws = 0; vm.subscribe(() => draws++);
  vm.setText('tone', 'Dry'); eq([draws, b.series.bible.tone, saved], [0, '', []], 'typing waits');
  await new Promise(r => setTimeout(r, 30)); eq([b.series.bible.tone, saved, a.series.bible.v], ['Dry', ['b'], 100], 'then copies to the other episodes');
  now = 200; eq(vm.importCharacters(), 1); await new Promise(r => setTimeout(r, 0));
  eq([draws, b.series.bible.characters.map(c => c.name), vm.characters[0].seen], [1, ['ANN'], 1], 'structural changes copy at once');
  eq([vm.castFromBible(), a.people[0].character, vm.castFromBible()], [1, 'ANN', 0]);
  vm.addSeason(); eq(vm.seasons, [1, 2]);
  vm.setName('Show X'); await vm.flush(); eq([b.series.name, await vm.flush()], ['Show X', 0]);
  eq(await vm.renumber('b', 2, 5), true); eq([b.series.season, b.series.ep, saved.slice(-1)[0]], [2, 5, 'b']);
  const p = await vm.newEpisode(true); eq([p.series.season, p.series.ep, p.title, added.length], [2, 6, 'Show X — Episode 6', 1]);
  eq(vm.guide.map(e => e.code + (e.current ? '*' : '')), ['S01E01*', 'S02E05']);
  vm.setTab('guide'); eq(vm.tab, 'guide');
  vm.leave(); eq([a.series, vm.S], [null, null]);
});
