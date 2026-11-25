'use strict';
/* Photo shot list — model and view-model tests */
const PSM = PhotoShotsModel;
const psScenes = [{ id: 's1', num: 1, label: 'Hero' }, { id: 's2', num: 2, label: 'Lifestyle' }];
function psHolder() {
  return { shots: [PSM.newShot('s1', { id: 'a', title: 'Close-up', subject: 'Ann', camera: 'R5', lens: '85mm', hero: true, status: 'Approved', tags: ['t1'] }), PSM.newShot('s1', { id: 'b', title: 'Wide', status: 'Shot', must: false }),
    PSM.newShot('s2', { id: 'c', title: 'Laugh', notes: 'golden hour' }), PSM.newShot('gone', { id: 'd' })], selects: [{ id: 'x', shotId: 'b' }] };
}

test('photo shots: labels, filters and groups', () => {
  const H = psHolder();
  eq([PSM.label(H, H.shots[0], psScenes), PSM.label(H, H.shots[1], psScenes), PSM.label(H, H.shots[2], psScenes), PSM.label(H, H.shots[3], psScenes)], ['1A', '1B', '2A', '?']);
  eq([PSM.letterOf(25), PSM.letterOf(26)], ['Z', '-27']);
  const v = F => PSM.visible(H, Object.assign(PSM.blankFilter(), F)).map(s => s.id);
  eq([v({}), v({ setup: 's1' }), v({ status: 'Shot' }), v({ hero: true }), v({ q: 'GOLDEN' }), v({ q: '85' })], [['a', 'b', 'c', 'd'], ['a', 'b'], ['b'], ['a'], ['c'], ['a']]);
  eq(PSM.visible(H, PSM.blankFilter(), s => (s.tags || []).includes('t1')).map(s => s.id), ['a'], 'the tag filter');
  eq(PSM.cleanFilter({ setup: 'gone', status: 'Nope', hero: 1, q: 5 }, psScenes), { setup: '', status: '', hero: true, q: '' });
  const g = F => PSM.groups(H, psScenes, Object.assign(PSM.blankFilter(), F)).map(x => `${x.scene.id}:${x.count}:${x.shots.map(s => s.id).join('')}`);
  eq([g({}), g({ setup: 's2' }), g({ status: 'Shot' }), g({ q: 'zzz' })], [['s1:2:ab', 's2:1:c'], ['s2:1:c'], ['s1:2:b'], []], 'setups with nothing shown drop out only while narrowing');
  eq(PSM.board(H, PSM.blankFilter()).map(c => c.status + ':' + c.shots.length).slice(0, 2), ['Planned:2', 'Shot:1']);
});

test('photo shots: coverage', () => {
  const S = PSM.stats(psHolder(), psScenes);
  eq([S.total, S.hero, S.must, S.captured], [3, 1, 2, 1], 'shots of a deleted setup and optional shots are left out');
  eq(PSM.statsText(S), '3 shots · 1 hero · 1/2 must-haves captured · 1 planned · 1 shot · 1 approved');
  eq(PSM.statsText(PSM.stats({ shots: [] }, psScenes)), '0 shots · 0 hero · 0/0 must-haves captured');
});

test('photo shots: editing', () => {
  const H = psHolder();
  const n = PSM.add(H, 's1'); eq([n.subject, n.camera, n.lens, n.title, n.status, n.hero], ['', '', '', '', 'Planned', false], 'copies the look of the last shot (b had none)');
  H.shots.find(s => s.id === 'b').lighting = 'Octa'; const last = PSM.add(H, 's2', 3); eq([PSM.ofSetup(H, 's2').length, last.title, PSM.add(H, 's1').lighting], [4, '', '']);
  const Q = psHolder(); Q.shots.splice(2, 2); const c = PSM.add(Q, 's1'); eq([c.camera, c.subject], ['', ''], 'the last shot in s1 is b');
  Q.shots[0].orient = 'Square'; Q.shots.splice(1, 2); eq([PSM.add(Q, 's1').orient, PSM.add(Q, 's1').camera], ['Square', 'R5']);
  const s = H.shots[0];
  eq([PSM.update(s, 'title', 'X'), PSM.update(s, 'status', 'Nope'), PSM.update(s, 'status', 'Delivered'), PSM.update(s, 'orient', 'Round'), PSM.update(s, 'hero', 0), s.hero, PSM.update(s, 'id', 'z'), PSM.update(s, 'must', false), s.must], [true, false, true, false, true, false, false, true, false]);
  eq([PSM.setAll(H, 's1', 'Approved'), PSM.setAll(H, 's1', 'Approved'), PSM.setAll(H, 's1', 'Bad')], [4, 0, 0]);
  const d = PSM.duplicate(H, 'a'); eq([H.shots[1] === d, d.status, d.hero, d.title, d.tags !== H.shots[0].tags, d.tags], [true, 'Planned', false, 'X', true, ['t1']]);
  eq([PSM.remove(H, 'b'), PSM.remove(H, 'b'), H.selects[0].shotId], [true, false, ''], 'deleting unlinks selects');
  const H2 = psHolder(); eq(PSM.rows(H2, psScenes, H2.shots.slice(0, 1), () => 'Tag')[0], ['1A', 'Hero', 'Close-up', 'Ann', 'Portrait', 'R5 · 85mm', '', '', '', '', '★', 'Approved', '', 'Tag']);
  eq(PSM.forPrint(PSM.HEAD).length, 12);
});

test('photo shots vm: filters, views and quiet typing', () => {
  const P = fakeProject({ mode: 'photo', photo: psHolder(), people: [{ type: 'cast', name: 'Ann' }, { type: 'crew', name: 'Cy' }] }), ui = { phSetup: 's2', shotTagF: { all: true } };
  const vm = new PhotoShotsVM({ project: () => P, store: fakeStore(P), ui, fx: { scenes: () => psScenes, tagNames: () => '' } });
  eq([vm.filter.setup, ui.phSetup, ui.shotTagF.ids instanceof Set, ui.shotTagF.all, vm.view, vm.talent], ['s2', null, true, true, 'list', ['Ann']], 'opened on a setup from its card');
  let draws = 0; vm.subscribe(() => draws++);
  eq(vm.groups.map(g => g.scene.id), ['s2']); vm.setFilter('setup', ''); eq([draws, vm.groups.length], [1, 2]);
  vm.set('a', 'title', 'Tight'); vm.set('a', 'notes', 'n'); eq([draws, P.photo.shots[0].title], [1, 'Tight'], 'typing is quiet');
  vm.set('a', 'status', 'Delivered'); eq(draws, 2);
  vm.setView('board'); eq([vm.view, ui.phView, vm.board[6].shots.map(s => s.id)], ['board', 'board', ['a']]);
  vm.reveal('c'); eq([vm.view, vm.open, vm.filter.setup], ['list', 'c', 's2']);
  vm.toggleOpen('c'); eq(vm.open, null); vm.toggleOpen('a'); vm.remove('a'); eq([vm.open, P.photo.shots.length], [null, 3]);
  eq([vm.add('gone'), vm.add('s1', 2).sceneId, vm.duplicate('zz'), vm.setAll('s1', 'Shot')], [null, 's1', null, 2], 'b was already shot');
  vm.setFilter('q', 'laugh'); vm.setFilter('nope', 1); eq([vm.visible.map(s => s.id), vm.csvRows().length, vm.printTable().head.length], [['c'], 2, 12]);
});
