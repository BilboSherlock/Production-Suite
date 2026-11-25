'use strict';
/* Search (Ctrl+K) — model and view-model tests */
const SRCH = SearchModel;
const srchFx = { scenes: () => [{ id: 'h1', num: 1, label: 'INT. KITCHEN - DAY', synopsis: 'Breakfast' }, { id: 'h2', num: 2, label: 'EXT. ROOF', synopsis: '' }], chars: () => ['ANN', 'BO'], date: d => 'D' + d, catLabel: c => c.toUpperCase(), key: w => w.replace(/s$/, '') };
function srchProject() {
  return fakeProject({
    people: [{ id: 'p1', type: 'cast', name: 'Helen', character: 'ANN' }, { id: 'p2', type: 'crew', name: '', role: 'Gaffer', dept: 'Lighting' }],
    casting: { roles: [{ id: 'r1', name: 'BO', candidates: [] }] },
    props: [{ id: 'x1', name: 'Kettle', category: 'Hand prop', status: 'Needed', aliases: ['teapot'] }],
    wardrobe: [{ id: 'w1', name: 'Apron', characters: ['ANN'], status: 'Fitting' }],
    tasks: [{ id: 't1', title: 'Book the roof', status: 'todo', due: '2026-05-01' }],
    locations: [{ id: 'l1', name: 'Roof', address: '1 High St' }],
    days: [{ id: 'd1', date: '2026-05-02', sceneIds: ['h1', 'h2'] }],
    tags: [{ id: 'g1', sceneId: 'h2', cat: 'vehicles', text: 'Van' }, { id: 'g2', sceneId: 'h1', cat: 'cast', text: 'ANN' }],
  });
}

test('search: the index and where each entry leads', () => {
  const I = SRCH.index(srchProject(), srchFx), of = k => I.filter(i => i.kind === k);
  eq([...new Set(I.map(i => i.kind))], ['Scene', 'Character', 'Cast', 'Crew', 'Role', 'Prop', 'Wardrobe', 'Task', 'Location', 'Shoot day', 'Tag', 'Go to']);
  eq(of('Scene')[0], { kind: 'Scene', ic: 'pen', title: '1. INT. KITCHEN - DAY', sub: 'Breakfast', to: { view: 'script', ui: { scene: 'h1' } } });
  eq([of('Crew')[0].title, of('Crew')[0].sub, of('Cast')[0].to], ['(unnamed)', 'Gaffer · Lighting', { view: 'people', ui: { peopleTab: 'cast', openPerson: 'p1' } }]);
  eq([of('Prop')[0].hid, of('Prop')[0].to.ui.openItem, of('Wardrobe')[0].sub], ['teapot', { kind: 'props', id: 'x1' }, 'ANN · Fitting']);
  eq([of('Task')[0].sub, of('Shoot day')[0].title, of('Shoot day')[0].to, of('Location')[0].to], ['To do · due 2026-05-01', 'Day 1 — D2026-05-02', { view: 'callsheet/d1', ui: { callDay: 'd1' } }, { view: 'locations', ui: {} }]);
  eq([of('Tag').map(t => [t.title, t.sub]), of('Go to').length, of('Role')[0].to.ui], [[['Van', 'VEHICLES · Sc 2']], SRCH.GO_TO.length, { peopleTab: 'casting', castRole: 'r1' }], 'only tags for things you have to get');
});

test('search: ranking', () => {
  const I = SRCH.index(srchProject(), srchFx), titles = (q, key) => SRCH.rank(I, q, key).map(i => i.kind + ':' + i.title);
  eq(titles('').length, 8, 'nothing typed: the first sections to go to'); eq(SRCH.rank(I, '   ')[0].kind, 'Go to');
  eq(titles('roof').slice(0, 3), ['Location:Roof', 'Scene:2. EXT. ROOF', 'Task:Book the roof'], 'exact title, then contains');
  eq(titles('teapot'), ['Prop:Kettle'], 'hidden aliases are searched');
  eq([titles('kettles'), titles('kettles', srchFx.key)], [[], ['Prop:Kettle']], 'plurals match when key() gives the singular');
  eq(titles('ann cast'), ['Cast:Helen'], 'every word must appear');
  eq(titles('script').slice(0, 2), ['Go to:Script', 'Go to:Script supervisor']);
  eq(titles('zzz'), []);
});

test('search vm: typing, moving and going', () => {
  const P = srchProject(), ui = {}, vm = new SearchVM({ project: () => P, store: fakeStore(P), ui, fx: srchFx });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.results.length, vm.sel], [8, 0]);
  vm.move(1); vm.move(1); eq([vm.sel, draws], [2, 2]); vm.select(99); eq(vm.sel, 7); vm.select(7); eq(draws, 3, 'no redraw when nothing changes'); vm.move(-20); eq(vm.sel, 0);
  vm.setQuery('kettle'); eq([vm.results.map(r => r.title), vm.sel], [['Kettle'], 0]);
  eq([vm.go(), ui.itemTab, ui.openItem], ['props', 'props', { kind: 'props', id: 'x1' }]);
  vm.setQuery('day 1'); eq([vm.go(), ui.callDay], ['callsheet/d1', 'd1']);
  vm.setQuery('nothing at all'); eq([vm.results.length, vm.go()], [0, null]);
});
