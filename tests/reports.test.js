'use strict';
/* Reports: model builders and view model */

const rpScene = (id, num, chars, extra = {}) => Object.assign({ id, num, eighths: 8, ioe: 'INT', tod: 'DAY', label: 'INT. ' + id, location: '', synopsis: '', chars: new Set(chars) }, extra);
const rpScenes = () => [rpScene('s1', '1', ['MAYA', 'THEO']), rpScene('s2', '2', ['MAYA']), rpScene('s3', '3', ['THEO', 'GUARD']), rpScene('s4', '4', ['MAYA'])];
const rpProject = () => fakeProject({ title: 'Reel', mode: 'screenplay', days: [], sceneMeta: {}, tags: [], props: [], wardrobe: [], shots: [], blocks: [], photo: { shots: [] },
  people: [{ id: 'a1', type: 'cast', name: 'Ana', character: 'MAYA' }, { id: 'a2', type: 'cast', name: 'Bo', character: 'THEO' }] });
const rpFx = (extra = {}) => Object.assign({
  castOf: s => s.chars, locOf: s => s.location, norm: n => String(n || '').replace(/\s*\(.*\)$/, '').toUpperCase(),
  charsIn: (x, sid) => (x.usage || {})[sid] || [], itemLabel: x => x.name, itemById: () => null, whoOf: t => t.who || [], conflicts: () => [],
  elementRows: () => [], shotTags: () => [], allShots: () => [], shotLabel: s => s.id, singular: n => n.toLowerCase().replace(/s$/, ''),
  charNames: () => ['MAYA', 'THEO', 'GUARD'], words: t => t.split(/\s+/).filter(Boolean).length,
  fmtEighths: n => n + '/8', fmtDateShort: d => 'd' + d, shotStatuses: ['Planned', 'Shot', 'Approved', 'Delivered'] }, extra);
const rpDays = (P, ...lists) => lists.forEach((ids, i) => { const d = ScheduleModel.addDay(P, `2026-12-0${i + 1}`); d.sceneIds = ids; });

/* ---------- model ---------- */
test('reports: day out of days marks start, work, hold, finish and single days', () => {
  const P = rpProject(); rpDays(P, ['s1'], ['s3'], ['s2', 's4']);
  const r = ReportsModel.build('dood', P, rpScenes(), rpFx());
  eq(r.headers, ['Cast', 'Day 1\nd2026-12-01', 'Day 2\nd2026-12-02', 'Day 3\nd2026-12-03', 'Days']);
  eq(r.rows, [['Ana (MAYA)', 'SW', 'H', 'WF', '2'], ['Bo (THEO)', 'SW', 'WF', '', '2'], ['GUARD', '', 'SWF', '', '1']], 'cast order first, then the rest');
});
test('reports: day out of days without shoot days counts scenes instead', () => {
  const P = rpProject(), r = ReportsModel.build('dood', P, rpScenes(), rpFx());
  eq([r.headers, r.rows[0], r.meta.hasDays], [['Cast', 'Scenes in script', 'Shoot days'], ['Ana (MAYA)', '3', '—'], false]);
});
test('reports: day out of days lists each day\'s conflicts', () => {
  const P = rpProject(); rpDays(P, ['s1'], ['s2']);
  eq(ReportsModel.dood(P, rpScenes(), rpFx({ conflicts: d => d.sceneIds.includes('s2') ? ['Ana is away'] : [] })).meta.conflicts, ['Day 2: Ana is away']);
});
test('reports: one-liner numbers the cast, names every day of a split scene, drops empty synopsis', () => {
  const P = rpProject(), sc = rpScenes(); rpDays(P, ['s1'], []);
  const [, p2] = ScheduleModel.setSplit(P, sc[0], [4, 4]); ScheduleModel.moveSlot(P, ScheduleModel.slotKey('s1', p2.id), P.days[1].id, 0);
  const r = ReportsModel.build('oneliner', P, sc, rpFx());
  eq(r.headers, ['Sc', 'I/E', 'D/N', 'Location', 'Cast', 'Pgs', 'Shoot day']); eq(r.hidden, ['synopsis']);
  eq(r.rows[0], ['1', 'INT', 'DAY', 'INT. s1', '1, 2', '8/8', 'Days 1, 2']);
  eq(r.rows[2].slice(4), ['2, GUARD', '8/8', '—']);
  eq(r.meta.castKey, ['1 MAYA (Ana)', '2 THEO (Bo)']);
  sc[1].synopsis = 'Booth'; eq(ReportsModel.build('oneliner', P, sc, rpFx()).hidden, [], 'shown once anyone writes one');
});
test('reports: character report counts lines and words from the script', () => {
  const P = rpProject();
  P.blocks = [{ type: 'scene', id: 's1' }, { type: 'character', text: 'MAYA' }, { type: 'dialogue', text: 'Hi there' }, { type: 'character', text: 'THEO (V.O.)' }, { type: 'dialogue', text: 'Hello' },
    { type: 'scene', id: 's2' }, { type: 'character', text: 'MAYA' }, { type: 'dialogue', text: 'One two three' }];
  eq(ReportsModel.build('characters', P, rpScenes(), rpFx()).rows, [['MAYA', 'Ana', 2, 5, 2, '1', '1, 2'], ['THEO', 'Bo', 1, 1, 1, '1', '1']]);
});
test('reports: continuity groups wardrobe by who wears it and builds a costume plot', () => {
  const P = rpProject();
  P.tags = [{ sceneId: 's1', cat: 'wardrobe', text: 'Red coat', who: ['MAYA'] }, { sceneId: 's1', cat: 'makeup', text: 'Scar' }, { sceneId: 's1', cat: 'props', text: 'Ticket' }, { sceneId: 's1', cat: 'props', text: 'Ticket' }];
  P.sceneMeta.s1 = { storyDay: 'D1' };
  const r = ReportsModel.build('continuity', P, rpScenes(), rpFx());
  eq(r.headers, ['Sc', 'Story day', 'I/E · D/N', 'Location', 'Wardrobe & makeup', 'Props'], 'empty notes column left out'); eq(r.hidden, ['continuity notes']);
  eq(r.rows[0], ['1', 'D1', 'INT · DAY', 'INT. s1', 'MAYA: Red coat\nGeneral: Scar', 'Ticket']);
  eq(r.meta.plot, [['MAYA', ['Sc 1: Red coat']]]);
  eq(ReportsModel.build('nonsense', P, rpScenes(), rpFx()).tab, 'continuity', 'unknown tab falls back');
});
test('reports: element list groups by category, with aliases and quantities', () => {
  const er = [{ cat: { label: 'Props' }, name: 'Gun', variants: ['Gun', 'Guns', 'Pistol'], scenes: [['1', 1], ['3', 2]], status: 'Ready' }, { cat: { label: 'Vehicles' }, name: 'Van', variants: ['Van'], scenes: [['2', 1]] }];
  const r = ReportsModel.build('elements', rpProject(), rpScenes(), rpFx({ elementRows: () => er }));
  eq(r.rows, [{ grp: 'Props · 1' }, ['Gun', 'Pistol', '1, 3 ×2', 'Ready'], { grp: 'Vehicles · 1' }, ['Van', '', '2', '']]);
  eq(r.csvRows[0], ['Props', 'Gun', 'Pistol', '1, 3 ×2', 'Ready']); eq(r.csvHead[0], 'Category');
});
test('reports: shots by tag counts done shots and lists untagged', () => {
  const shots = [{ id: 'a', sceneId: 's1', tags: ['t1'], done: true }, { id: 'b', sceneId: 's3', tags: ['t1'], status: 'Approved' }, { id: 'c', sceneId: 's1', tags: [] }];
  const r = ReportsModel.build('shottags', rpProject(), rpScenes(), rpFx({ allShots: () => shots, shotTags: () => [{ id: 't1', name: 'VFX', dept: 'Post' }] }));
  eq(r.rows, [['VFX', 'Post', 2, 2, '1, 3', 'a, b'], ['Untagged', '', 1, 0, '', '']]);
});
test('reports: photo shot status per setup with a total', () => {
  const P = rpProject(); P.photo.shots = [{ sceneId: 's1', status: 'Approved', hero: true }, { sceneId: 's1', status: 'Planned' }];
  const r = ReportsModel.build('shotstatus', P, rpScenes().slice(0, 2), rpFx());
  eq(r.rows, [['1', 'INT. s1', 2, 1, 1, '', 1, '', '50%'], ['2', 'INT. s2', 0, '', '', '', '', '', '—'], ['', 'TOTAL', 2, 1, 1, '', 1, '', '50%']]);
});
test('reports: chart marks speaking, silent, entrances and exits', () => {
  const sc = rpScenes(); sc[1].chars = new Set(); sc[3].chars = new Set();   // speaks in 1 only; present in 1, 2 and 4
  const castOf = s => ({ s1: new Set(['MAYA']), s2: new Set(['MAYA']), s3: new Set(['THEO', 'GUARD']), s4: new Set(['MAYA']) })[s.id];
  const r = ReportsModel.build('chart', rpProject(), sc, rpFx({ castOf }));
  eq(r.rows[0], ['MAYA', '▸●', '○◂', '', '▸○◂', 3, 0]);
});
test('reports: costume changes flag back-to-back and quick changes', () => {
  const P = rpProject(); P.wardrobe = [{ name: 'Coat', sceneIds: ['s1'], usage: { s1: ['MAYA'] } }, { name: 'Gown', sceneIds: ['s2', 's4'], usage: { s2: ['MAYA'], s4: ['MAYA'] } }];
  const r = ReportsModel.build('changes', P, rpScenes(), rpFx());
  eq(r.rows, [['MAYA', '1', '2', 0, 'Back-to-back scenes', 'Coat', 'Gown']], 'scene 2 → 4 keeps the gown');
  P.mode = 'stage'; eq(ReportsModel.build('changes', P, rpScenes(), rpFx()).rows[0][4], 'ON-STAGE / immediate change');
});
test('reports: pre-set & strike and props by scene', () => {
  const P = rpProject();
  P.props = [{ name: 'Chair', sceneIds: ['s1'], setup: { s1: 'preset' }, status: 'Prepped' }, { name: 'Cup', sceneIds: ['s1', 's2'], setup: { s2: 'actor' } }, { name: 'Lamp', sceneIds: ['s2'], setup: { s2: 'flown' } }];
  P.wardrobe = [{ name: 'Coat', sceneIds: ['s1'], usage: { s1: ['MAYA'] }, status: 'Needed' }, { name: 'Hat', sceneIds: ['s1'] }];
  const ps = ReportsModel.build('preset', P, rpScenes(), rpFx()).rows;
  eq(ps[0].slice(2), ['Chair', '', '', '']); eq(ps[1].slice(2), ['', 'Cup', 'flown: Lamp', 'Chair']);
  const pr = ReportsModel.build('props', P, rpScenes(), rpFx()).rows[0];
  eq(pr.slice(2), ['Chair, Cup', 'MAYA: Coat\nUNASSIGNED: Hat', 'NEEDED: 3 items']);
});
test('reports: building a report never changes the project', () => {
  const P = rpProject(); rpDays(P, ['s1', 's2']); const before = JSON.stringify(P);
  ['dood', 'oneliner', 'characters', 'continuity', 'elements', 'shottags', 'shotstatus', 'chart', 'changes', 'preset', 'props'].forEach(t => ReportsModel.build(t, P, rpScenes(), rpFx()));
  eq(JSON.stringify(P), before);
});

/* ---------- view model ---------- */
const makeRepVM = () => {
  const P = rpProject(), store = fakeStore(P), ui = {}; rpDays(P, ['s1'], ['s2']);
  const vm = new ReportsVM({ project: () => store.P, store, ui, scenes: () => rpScenes(), terms: () => ({ wardrobe: 'Costume', dpr: 'Daily report' }), fx: rpFx() });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, ui, store, draws: () => draws };
};
test('reports vm: tabs, switching and the photo-only tab', () => {
  const { vm, P, ui, draws } = makeRepVM();
  eq([vm.tab, vm.tabs.length, vm.tabs[6].label, vm.tabs[0].on], ['dood', 11, 'Props & costume', true]);
  vm.selectTab('chart'); eq([ui.repTab, draws(), vm.report.title], ['chart', 1, 'Character / scene chart']);
  vm.selectTab('chart'); eq(draws(), 1, 'same tab: no redraw');
  P.mode = 'photo'; eq(vm.tabs.map(t => t.key).includes('shotstatus'), true);
  vm.selectTab('dpr'); eq(vm.isDaily, true);
});
test('reports vm: csv and print use flat headers; csv skips group rows', () => {
  const { vm } = makeRepVM();
  eq(vm.csv.name, 'reel-dood.csv'); eq(vm.csv.rows[0], ['Cast', 'Day 1 d2026-12-01', 'Day 2 d2026-12-02', 'Days']);
  eq(vm.print.headers[1], 'Day 1 d2026-12-01');
  vm._fx.elementRows = () => [{ cat: { label: 'Props' }, name: 'Gun', variants: [], scenes: [['1', 1]] }];
  vm.selectTab('elements'); eq(vm.csv.rows, [['Category', 'Element', 'Also called', 'Scenes', 'Status'], ['Props', 'Gun', '', '1', '']]);
  eq(vm.print.rows.length, 2, 'print keeps the group heading');
  eq(vm.subtitle.startsWith('Reel — Every breakdown element'), true);
});
