'use strict';
/* Pitch deck — model and view-model tests */
const PTM = PitchModel;
function pitchProject() {
  const P = fakeProject({ title: 'Reel', pitch: { theme: 'ink', slides: [] } });
  ['a', 'b', 'c'].forEach(id => PTM.add(P, 'text', null, { id, title: id.toUpperCase() }));
  return P;
}

test('pitch: slides, editing and order', () => {
  const P = pitchProject();
  eq([PTM.newSlide('bogus').type, PTM.theme(P), PTM.slides(P).map(s => s.id)], ['text', 'ink', ['a', 'b', 'c']]);
  const s = PTM.add(P, 'list', 'a'); eq(PTM.index(P, s.id), 1, 'added after a');
  eq(PTM.update(s, 'type', 'gallery'), true); eq(PTM.update(s, 'type', 'nope'), false); eq(PTM.update(s, 'id', 'x'), false);
  eq(PTM.update(s, 'title', 5), true); eq(s.title, '5');
  eq(PTM.move(P, 'a', -1), false); eq(PTM.move(P, 'a', 1), true); eq(PTM.slides(P)[1].id, 'a');
  const c = PTM.duplicate(P, 'b'); eq([c.title, c.id !== 'b', PTM.index(P, c.id)], ['B', true, PTM.index(P, 'b') + 1]);
  eq(PTM.remove(P, 'c'), c.id, 'the last slide → the one before'); eq(PTM.remove(P, 'a'), 'b', 'otherwise the one after');
  eq(PTM.setTheme(P, 'bold'), true); eq(PTM.setTheme(P, 'neon'), false); eq(P.pitch.theme, 'bold');
  const Q = fakeProject(); PTM.add(Q, 'cover'); eq([Q.pitch.theme, Q.pitch.slides.length], ['ink', 1], 'created when missing');
});

test('pitch: images, lists and labels', () => {
  const s = PTM.newSlide('gallery');
  for (let i = 0; i < 8; i++) PTM.addImage(s, 'i' + i);
  eq(s.images.length, 6); eq(PTM.addImage(s, ''), false); eq(PTM.removeImage(s, 9), false); eq(PTM.removeImage(s, 0), true); eq(s.images[0], 'i1');
  eq(PTM.listItems('ANNA — lead, 30s\nBOB\n\nCARL - grip'), [{ name: 'ANNA', detail: 'lead, 30s' }, { name: 'BOB', detail: '' }, { name: 'CARL', detail: 'grip' }]);
  eq(PTM.paras('one\n\ntwo\n  \n'), ['one', 'two']);
  eq([PTM.labels(s).hasBody, PTM.labels(PTM.newSlide('cover')).title, PTM.labels(PTM.newSlide('split')).hasImage], [false, 'Title', true]);
});

test('pitch: the one-click deck', () => {
  const d = PTM.build({ title: 'Reel', credit: 'Written by', author: 'Ann', synopses: [[1, 'Start'], [2, '']], roles: [], characters: [['BOB', 3], ['ANNA', 9]],
    crew: [{ name: 'Cy', dept: 'Camera' }, { name: '' }], budget: '£1,000', days: 0, pages: 4, scenes: 2 });
  eq(d.map(s => s.type), ['cover', 'text', 'text', 'list', 'gallery', 'list', 'text', 'text']);
  eq([d[0].body, d[2].body, d[3].body, d[5].body], ['Written by Ann', '1. Start', 'ANNA — add a one-line description\nBOB — add a one-line description', 'Cy — Camera']);
  eq(d[6].body, 'Budget: £1,000\nShoot days: TBC\nScript: 4 pages, 2 scenes');
  eq(PTM.build({ roles: [{ name: 'Mo', age: '40' }] })[3].body, 'Mo — 40');
});

test('pitch vm: selecting and editing', () => {
  const P = pitchProject(), ui = { slideId: 'gone' };
  const vm = new PitchVM({ project: () => P, store: fakeStore(P), ui, fx: { facts: () => ({ title: 'Reel' }) } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.slide.id, ui.slideId, vm.index], ['a', 'a', 0]);
  const s = vm.add('cover'); eq([s.title, ui.slideId, vm.index], ['Reel', s.id, 1]);
  vm.update('title', 'Hi'); eq(vm.slide.title, 'Hi');
  const c = vm.duplicate(); eq([vm.slide, c.title], [c, 'Hi']);
  vm.remove(); eq(vm.slide.id, 'b', 'the next slide is selected');
  eq(vm.move(-1), true); eq(vm.index, 1);
  vm.setImage('u'); eq(vm.slide.image, 'u');
  const d = draws; vm.select('c'); eq([draws, vm.slide.id], [d + 1, 'c']);
  vm.rebuild(); eq([vm.slides.length, vm.slide.type, vm.slide.title], [8, 'cover', 'Reel']);
  P.pitch.slides = []; eq([vm.slide, vm.remove()], [null, null]);
});
