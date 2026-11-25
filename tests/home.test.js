'use strict';
/* Projects home — model and view-model tests */
const HMM = HomeModel;
function hmProjects() {
  return {
    a: { id: 'a', title: 'Alpha', mode: 'screenplay', updated: 100, meta: { author: 'Ann' }, settings: { region: 'US' }, blocks: [{ id: 'x', type: 'scene' }] },
    b: { id: 'b', title: '', mode: 'photo', updated: 300, meta: {}, settings: { region: 'US' }, blocks: [] },
    c: { id: 'c', title: 'Ep', mode: 'av', updated: 200, meta: {}, settings: {}, blocks: [], series: { id: 's1', name: 'Show', season: 1, ep: 2 } },
  };
}
const hmBlank = (mode, title) => ({ id: newId(), mode, title, settings: { region: 'US' }, meta: {}, blocks: [] });

test('home: cards, new and copied projects', () => {
  const P = hmProjects(), ep = s => `S${s.season}E${s.ep}`, date = ms => 'day ' + ms;
  eq(HMM.sorted(P).map(p => p.id), ['b', 'c', 'a'], 'most recently edited first');
  eq(HMM.card(P.a, { scenes: 3, pages: 2 }, ep, date), { id: 'a', title: 'Alpha', mode: 'screenplay', modeLabel: 'Screenplay', series: null, stats: '3 scenes · ~2 pp', edited: 'Edited day 100 · Ann' });
  eq([HMM.card(P.b, { scenes: 1, pages: 0 }, ep, date).title, HMM.card(P.b, { scenes: 1, pages: 0 }, ep, date).stats, HMM.card(P.c, { scenes: 0, pages: 1 }, ep, date).series, HMM.modeLabel('zz')], ['Untitled', '1 setups · ~0 pp', 'Show · S1E2', 'Screenplay']);
  const presets = { photo: { on: ['brief'] }, podcast: { on: ['rundown'] } }, defType = m => ({ screenplay: 'action', podcast: 'dialogue' })[m] || 'action';
  const p = HMM.setupNew(hmBlank('podcast', 'T'), 'podcast', { defType, presets }); eq([p.blocks.map(b => b.type), p.settings.nav], [['scene', 'dialogue'], { preset: 'podcast', on: ['rundown'] }]);
  eq([HMM.setupNew(hmBlank('screenplay', 'T'), 'screenplay', { defType, presets }).settings.nav, HMM.startView('podcast'), HMM.startView('av')], [undefined, 'rundown', 'script']);
  const eps = [{ series: { season: 1, ep: 2 } }, { series: { season: 1, ep: 5 } }, { series: { season: 2, ep: 9 } }];
  const c = HMM.copy(P.c, eps, 77); eq([c.id !== 'c', c.title, c.series.ep, c.created, c.updated, P.c.series.ep], [true, 'Ep (copy)', 6, 77, 77, 2], 'the next episode of its season');
  const q = { id: 'a', title: 'Alpha' }; HMM.unclash(q, P); eq([q.id !== 'a', q.title], [true, 'Alpha (imported)']); eq(HMM.unclash({ id: 'new', title: 'N' }, P).title, 'N');
  eq(HMM.fileName(P.a, t => t.toLowerCase()), 'alpha.studiobindahh.json');
});

test('home: backups and reading an import', () => {
  eq(HMM.bundle({}, [], {}, 1), null);
  const b = HMM.bundle(hmProjects(), [{ name: 'Zed' }], { preset: 'film', on: ['x'], other: 1 }, 5), j = JSON.parse(b.json);
  eq([b.name, b.n, j.studiobindahh, j.version, j.exported, j.projects.length, j.contacts, j.prefs], ['studiobindahh-all-projects.json', 3, 'bundle', 3, 5, 3, [{ name: 'Zed' }], { preset: 'film', on: ['x'] }]);
  eq([HMM.classify({ contacts: [] }), HMM.classify({ projects: [], contacts: [1] }).project, HMM.classify({ blocks: [] }).project], [{ contacts: [], projects: null, project: null }, null, { blocks: [] }]);
  const list = [{ id: '1', name: 'Ann', email: 'a@x' }];
  eq([HMM.mergeContacts(list, [{ id: '1', name: 'Other' }, { id: '2', name: 'Ann', email: 'a@x' }, { id: '3', name: 'Ann' }, { id: '4' }, null]), list.map(c => c.id)], [1, ['1', '3']], 'same id, or same name and email, is skipped');
  eq([HMM.plural(1, 'project'), HMM.plural(0, 'contact')], ['1 project', '0 contacts']);
});

test('home vm: cards, create, duplicate, delete and import', async () => {
  const P = hmProjects(), contacts = [], added = [], removed = []; let saved = 0;
  const vm = new HomeVM({ store: fakeStore(null), ui: {}, fx: {
    projects: () => P, add: async p => { P[p.id] = p; added.push(p.id); }, remove: async id => { delete P[id]; removed.push(id); },
    contacts: () => contacts, saveContacts: async () => { saved++; }, prefs: () => ({ preset: 'film', on: [] }),
    stats: p => ({ scenes: p.blocks.length, pages: 1 }), epCode: s => 'E' + s.ep, date: ms => String(ms), now: () => 999,
    blankProject: hmBlank, applyRegion: (p, r) => { p.settings.region = r; p.regionApplied = true; }, region: () => 'UK',
    defType: () => 'action', presets: {}, episodes: () => [P.c], migrate: j => Object.assign({ meta: {} }, j),
    parseScript: txt => ({ blocks: txt ? [{ id: 'l', type: 'action', text: txt }] : [], meta: { title: '', authors: 'Bo', 'draft date': 'Jan' } }) } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.cards.map(c => c.id), vm.contactCount, vm.defaultRegion, vm.project('zz')], [['b', 'c', 'a'], 0, 'UK', null]);
  const p = await vm.create({ mode: 'screenplay', title: '  ', region: 'UK' }); eq([p.title, p.regionApplied, p.blocks.length, P[p.id] === p], ['Untitled project', true, 2, true]);
  eq((await vm.create({ title: 'Same', region: 'US' })).regionApplied, undefined, 'the region is applied only when it differs');
  const d0 = draws, c = await vm.duplicate('c'); eq([c.title, c.series.ep, draws, await vm.duplicate('zz')], ['Ep (copy)', 3, d0 + 1, null]);
  eq([await vm.remove('a'), await vm.remove('a'), removed], [true, false, ['a']]);
  eq([vm.backupOf('b', t => 'f').name, vm.backupAll().n], ['f.studiobindahh.json', 5]);
  const r1 = await vm.importJson(JSON.stringify({ contacts: [{ id: 'k', name: 'Kay' }] })); eq([r1, contacts.length, saved], [{ contacts: 1, restored: null, project: null }, 1, 1]);
  const r2 = await vm.importJson(JSON.stringify({ projects: [{ id: 'b', title: 'Bee', blocks: [] }, { id: 'n' }, null] })); eq([r2.restored, Object.values(P).some(x => x.title === 'Bee (imported)')], [1, true]);
  const r3 = await vm.importJson(JSON.stringify({ id: 'q', title: 'Q', blocks: [] })); eq([r3.project.id, r3.contacts], ['q', null]);
  let err = ''; try { await vm.importJson(JSON.stringify({ id: 'z' })); } catch (e) { err = e.message; } eq(err, 'Not a StudioBindahh project');
  const s = await vm.importScript('Hello', 'My Film.fountain', 'stage'); eq([s.title, s.mode, s.meta.author, s.meta.draft, s.blocks.length], ['My Film', 'stage', 'Bo', 'Jan', 1]);
  err = ''; try { await vm.importScript('', 'x.txt', 'screenplay'); } catch (e) { err = e.message; } eq(err, 'No script content found');
  const pdf = await vm.importPdf({ mode: 'screenplay', blocks: [1], meta: { title: 'PDF' }, keepNumbers: true }, 'a.pdf'); eq([pdf.title, pdf.settings.sceneNumLock, pdf.meta.credit], ['PDF', true, 'Written by']);
});
