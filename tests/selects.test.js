'use strict';
/* Selects & approvals — model and view-model tests */
const SLM = SelectsModel;
const selSet = () => ({ shots: [{ id: 'k1', sceneId: 's1', status: 'Planned', title: 'Hero' }, { id: 'k2', sceneId: 'gone', status: 'Planned' }],
  selects: [SLM.item({ id: 'a', name: 'IMG_10.jpg', rating: 3, flag: 'pick', status: 'Selected' }), SLM.item({ id: 'b', name: 'IMG_9.jpg', rating: 5, color: 'red' }), SLM.item({ id: 'c', name: 'IMG_2.jpg', flag: 'reject', shotId: 'k1' })] });

test('selects: filtering and sorting', () => {
  const H = selSet(), L = H.selects, f = o => SLM.filter(L, o).map(x => x.id);
  eq(f({}), ['c', 'b', 'a'], 'names in number order');
  eq([f({ sort: 'rating' }), f({ sort: 'added' })], [['b', 'a', 'c'], ['a', 'b', 'c']]);
  eq([f({ rating: 4 }), f({ flag: 'none' }), f({ flag: 'pick' }), f({ status: 'Selected' }), f({ color: 'red' }), f({ shot: 'k1' })], [['b'], ['b'], ['a'], ['a'], ['b'], ['c']]);
  eq([f({ flag: 'bogus', color: 'mauve', status: 'Maybe', rating: 9, sort: 'size' })], [['c', 'b', 'a']], 'unknown filter values are ignored');
});

test('selects: stats, picks, CSV and captions', () => {
  const H = selSet();
  eq(SLM.statsText(H.selects), '3 images · 1 picked · 1 rejected · 4.0 avg rating · 2 to review · 1 selected');
  eq([SLM.statsText([]), SLM.picks(H.selects)], ['', ['IMG_10.jpg']]);
  eq(SLM.csvRows(H, s => '#' + s.id)[3], ['IMG_2.jpg', 0, 'reject', '', 'To review', '#k1', '']);
  eq([SLM.caption(H.selects[0]), SLM.caption(H.selects[2])], ['★★★☆☆  ⚑ · Selected', '☆☆☆☆☆  ✕']);
  eq(SLM.shotChoices(H, [{ id: 's1' }]).map(s => s.id), ['k1'], 'only shots whose setup still exists');
});

test('selects: rating, flags, colours, status and shot links', () => {
  const H = selSet(), x = H.selects[0];
  SLM.rate(x, 4); eq(x.rating, 4); SLM.rate(x, 4); eq(x.rating, 0, 'the same star again clears it');
  eq([SLM.setRating(x, 2), x.rating, SLM.setRating(x, 7), x.rating], [true, 2, false, 2]);
  SLM.toggleFlag(x, 'pick'); eq(x.flag, ''); SLM.toggleFlag(x, 'reject'); eq(x.flag, 'reject'); SLM.toggleFlag(x, 'pick'); eq(x.flag, 'pick');
  eq([SLM.setFlag(x, 'meh'), SLM.setColor(x, 'mauve'), SLM.setColor(x, 'blue'), x.color, SLM.setStatus(x, 'Maybe'), SLM.setStatus(x, 'Final'), x.status], [false, false, true, 'blue', false, true, 'Final']);
  SLM.linkShot(H, x, 'k1'); eq([x.shotId, H.shots[0].status], ['k1', 'Shot'], 'linking a planned shot marks it shot');
  H.shots[0].status = 'Approved'; SLM.linkShot(H, H.selects[1], 'k1'); eq(H.shots[0].status, 'Approved', 'later statuses are kept');
  H.shots.shift(); eq([SLM.unlinkMissing(H), x.shotId, SLM.unlinkMissing(H)], [3, '', 0], 'links to a deleted shot are cleared');
});

test('selects vm: filters, size, importing and quiet notes', () => {
  const P = fakeProject({ photo: selSet() }), ui = { selF: { shot: 'k2', color: 'mauve' }, selSize: 9999 };
  const vm = new SelectsVM({ project: () => P, store: fakeStore(P), ui, fx: { holder: Q => Q.photo, scenes: () => [{ id: 's1' }], shotLabel: (Q, s) => '1' + s.id } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.filter.shot, vm.filter.color, vm.rows.length, vm.size], ['', '', 3, 190], 'stale filters and size are reset');
  eq(vm.shots, [{ id: 'k1', label: '1k1 Hero' }]);
  vm.setFilter('rating', '3'); eq([ui.selF.rating, vm.rows.map(x => x.id), draws], [3, ['b', 'a'], 1]);
  vm.setFilter('nope', 1); eq(draws, 1);
  vm.setSize(250); eq([ui.selSize, draws], [250, 1], 'the slider does not redraw'); vm.setSize(5); eq(ui.selSize, 250);
  eq([vm.addImages([{ name: 'n.jpg', thumb: 'data:', w: 3, h: 2 }, { name: 'm.jpg', thumb: 'data:' }]), vm.all.length, draws], [2, 5, 2]);
  eq([vm.addImages([]), draws], [0, 2]);
  const d = draws; vm.setNote('a', 'Fix sky'); eq([draws, vm.find('a').note], [d, 'Fix sky'], 'typing is quiet');
  vm.rate('b', 5); eq([vm.find('b').rating, draws], [0, d + 1]);
  vm.linkShot('c', 'k1'); eq(P.photo.shots[0].status, 'Shot', 'choosing a planned shot marks it shot');
  eq([vm.setStatus('zz', 'Final'), vm.isBig(1), vm.isBig(1500)], [false, false, true]);
  vm.setFilter('rating', 0); vm.setFilter('flag', 'pick'); eq(vm.picks(), ['IMG_10.jpg']);
});
