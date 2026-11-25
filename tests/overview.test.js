'use strict';
/* Overview — model and view-model tests */
const OVM = OverviewModel;
function ovProject(extra = {}) {
  return fakeProject(Object.assign({
    mode: 'screenplay', meta: { author: 'Ann', logline: 'A reel.' },
    days: [{ id: 'd1', date: '2026-01-01', sceneIds: ['s1'] }, { id: 'd2', date: '2026-03-01', sceneIds: ['s1', 's2'], cs: { crew: '07:00' } }],
    shots: [{ done: true }, { done: false }], casting: { roles: [{ castId: 'p1' }, {}] },
    people: [{ type: 'cast', name: 'Bo', docs: {} }, { type: 'cast', name: 'Cy', docs: { contract: 1, eligibility: 1, release: 1, nda: 1, insurance: 1 } }],
    props: [{ status: 'Needed' }, { status: 'Acquired' }], wardrobe: [{ status: 'Prepped' }],
    tasks: [{ title: 'Late', status: 'todo', due: '2026-01-10' }, { title: 'Soon', status: 'todo', due: '2026-02-20' }, { title: 'Done', status: 'done', due: '2026-01-01' }],
  }, extra));
}
const ovFacts = (o = {}) => Object.assign({ scenes: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], pages: 12, words: 3400, conflicts: 0, untagged: 0, orphans: 0, today: '2026-02-01',
  fin: { total: 1000, act: 250, status: 'ok', variance: 0, spentPct: 25, unassigned: 0 }, money: n => '$' + n }, o);

test('overview: next day, upcoming tasks and paperwork', () => {
  const P = ovProject();
  eq(OVM.nextDay(P.days, '2026-02-01').d.id, 'd2'); eq(OVM.nextDay(P.days, '2027-01-01').d.id, 'd1', 'all past → the first'); eq(OVM.nextDay([], 'x'), null);
  eq(OVM.upcoming(P.tasks).map(t => t.title), ['Late', 'Soon']); eq(OVM.paperwork(P), 1);
  eq([OVM.pct(1, 3), OVM.pct(1, 0), OVM.plural(1, 'scene'), OVM.plural(2, 'scene')], [33, 0, '1 scene', '2 scenes']);
});

test('overview: what needs attention', () => {
  const P = ovProject();
  eq(OVM.attention(P, ovFacts()).map(a => a.text + (a.tone ? '!' : '')), ['1 overdue task!', '1 scene not yet scheduled', '1 role still to cast', '1 prop still needed', '1 cast member with outstanding paperwork']);
  const A = OVM.attention(fakeProject({ tasks: [], people: [] }), ovFacts({ scenes: [], conflicts: 2, untagged: 3, orphans: 1, fin: { status: 'over', variance: -50, unassigned: 2 } }));
  eq(A.map(a => [a.text, a.view]), [['2 scheduling conflicts', 'schedule'], ['3 breakdown items without a profile', 'props'], ['Budget forecast is $50 over', 'budget'], ['2 expenses not assigned to a budget line', 'budget'], ['1 item linked to deleted scenes', 'script']]);
  const ph = fakeProject({ mode: 'photo', photo: { releases: [{ status: 'Sent' }, { status: 'Signed' }], shots: [{ sceneId: 's1' }], gear: [{ status: 'Needed' }], selects: [] } });
  eq(OVM.attention(ph, ovFacts({ scenes: [{ id: 's1' }, { id: 's2' }] })).map(a => a.view), ['schedule', 'compliance', 'photoshots', 'gear']);
  const pod = fakeProject({ mode: 'podcast', podcast: { gear: [{ status: 'Needed' }, { status: 'In Studio' }] } });
  eq(OVM.attention(pod, ovFacts({ scenes: [], fin: { status: 'risk' } })).map(a => a.text), ['1 gear item still needed', 'Budget is within 5% of the limit']);
});

test('overview: the tiles for a script, a photo shoot and a podcast', () => {
  const T = OVM.tiles(ovProject(), ovFacts());
  eq(T.map(t => t.label), ['Script', 'Scheduled', 'Shot', 'Cast', 'Props', 'Wardrobe', 'Tasks', 'Budget']);
  eq([T[0].value, T[0].sub, T[1].value, T[1].progress, T[2].sub, T[3].value, T[3].sub], ['12 pp', '3 scenes · 3,400 words', '2/3', 67, '50% of the shot list', '1/2', '1 open role']);
  eq([T[4].value, T[5].value, T[6].sub, T[6].tone, T[7].value, T[7].sub, T[7].progress], ['1/2', '1/1', '1 overdue', 'danger', '$1000', '$250 spent · on track', 25]);
  eq(OVM.tiles(fakeProject({ tasks: [] }), ovFacts({ fin: { total: 0 } })).slice(-1)[0], { label: 'Budget', value: '—', sub: 'not started', progress: null, view: 'budget', tone: '' });
  const ph = fakeProject({ mode: 'photo', locations: [{}], photo: { releases: [{ status: 'Needed' }], shots: [{ status: 'Approved', hero: true }, { status: 'Planned' }], gear: [{ status: 'On set' }, { status: 'Needed' }], selects: [{ flag: 'pick' }, {}] } });
  const PT = OVM.tiles(ph, ovFacts());
  eq(PT.map(t => t.label), ['Setups', 'Scheduled', 'Shots', 'Cast', 'Props', 'Wardrobe', 'Tasks', 'Selects', 'Releases', 'Gear', 'Budget']);
  eq([PT[0].sub, PT[2].sub, PT[8].tone, PT[9].value], ['1 location', '1 hero · 1 approved', 'danger', '1/2']);
  eq(OVM.tiles(fakeProject({ mode: 'podcast', podcast: { gear: [{ status: 'In Studio' }] } }), ovFacts()).find(t => t.label === 'Gear').value, '1/1');
});

test('overview vm: the dashboard', () => {
  const P = ovProject({ title: 'Reel', series: null });
  const vm = new OverviewVM({ project: () => P, store: fakeStore(P), ui: {}, fx: { facts: () => ovFacts(), sections: () => [['script', 'Script', 'pen']], live: () => true, modeLabel: () => 'Screenplay', series: () => 'Show S1E2' } });
  const B = vm.board;
  eq([B.title, B.subtitle, B.logline, B.live, B.isPhoto], ['Reel', 'Screenplay · Show S1E2 · by Ann', 'A reel.', true, false]);
  eq(B.nextDay, { id: 'd2', num: 2, date: '2026-03-01', scenes: 2, crewCall: '07:00' });
  eq([B.tiles.length, B.attention.length, B.upcoming.length, B.sections.length], [8, 5, 2, 1]);
});
