'use strict';
/* Lookbook — model and view-model tests */
const LBM = LookbookModel;
function lbProject() {
  const P = fakeProject({ lookbook: { boards: [] }, locations: [{ name: 'Pier' }, { name: '' }], pitch: { slides: [] } });
  const b = LBM.addBoard(P, 'Overall look'); b.id = 'b1';
  LBM.addTile(b, 'note', { id: 't1', text: 'Warm' }); LBM.addTile(b, 'image', { id: 't2', img: 'data:a' }); LBM.addTile(b, 'color', { id: 't3' });
  return P;
}

test('lookbook: boards and bulk boards', () => {
  const P = lbProject();
  eq([LBM.nextName(P), LBM.cover(P.lookbook.boards[0]), LBM.newTile('bogus').kind], ['Board 2', 'data:a', 'note']);
  eq(LBM.addBoards(P, ['MARGOT', 'margot', ' ', 'overall look', 'THEO']), 2); eq(LBM.boards(P).map(b => b.name), ['Overall look', 'MARGOT', 'THEO']);
  eq(LBM.addBoards(P, Array.from({ length: 30 }, (_, i) => 'X' + i)), 20, 'at most 20 at once');
  eq(LBM.locationNames(P, [{ location: 'ALLEY' }, { location: '' }]), ['Pier', 'ALLEY']);
  eq(LBM.updateBoard(P.lookbook.boards[0], 'about', 'Dusty'), true); eq(LBM.updateBoard(P.lookbook.boards[0], 'tiles', []), false);
  eq(LBM.removeBoard(P, 'b1'), true); const Q = fakeProject(); LBM.addBoard(Q); eq(Q.lookbook.boards.length, 1, 'created when missing');
});

test('lookbook: tiles, colours and the pitch gallery', () => {
  const P = lbProject(), b = P.lookbook.boards[0];
  eq(LBM.updateTile(b.tiles[2], 'color', '#ABCDEF'), true); eq(b.tiles[2].color, '#abcdef'); eq(LBM.updateTile(b.tiles[2], 'color', 'red'), false);
  eq(LBM.updateTile(b.tiles[0], 'img', 'x'), false); LBM.updateTile(b.tiles[0], 'caption', 'Mood');
  eq(LBM.moveTile(b, 't1', 1), true); eq(b.tiles.map(t => t.id), ['t2', 't1', 't3']); eq(LBM.moveTile(b, 't3', 1), false);
  eq(LBM.removeTile(b, 't2'), true); eq(LBM.pitchGallery(b), null);
  for (let i = 0; i < 8; i++) LBM.addTile(b, 'image', { img: 'i' + i });
  eq(LBM.pitchGallery(b), { title: 'Overall look', images: ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'] });
});

test('lookbook vm: selecting, adding and the pitch deck', () => {
  const P = lbProject(), ui = { lbBoard: 'gone' };
  const vm = new LookbookVM({ project: () => P, store: fakeStore(P), ui, fx: { scenes: () => [{ location: 'ALLEY' }], charNames: () => ['MARGOT'], newSlide: (kind, o) => Object.assign({ kind }, o) } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.board.id, ui.lbBoard, vm.list[0].count], ['b1', 'b1', 3]);
  const d = draws; vm.updateTile('t1', 'text', 'Cold', { quiet: true }); vm.updateBoard('about', 'x', { quiet: true }); eq(draws, d);
  eq(vm.toPitch(), { title: 'Overall look', images: ['data:a'] }); eq(P.pitch.slides[0].kind, 'gallery');
  const b = vm.addBoard(); eq([b.name, vm.board], ['Board 2', b]); eq(vm.toPitch(), null, 'no images yet');
  eq(vm.addImages(['u1', 'u2']), 2); eq(vm.board.tiles.length, 2);
  vm.removeBoard(); eq(vm.board.id, 'b1');
  eq([vm.boardsForCharacters(), vm.boardsForLocations()], [1, 2]);
  P.lookbook.boards = []; vm.addTile('color'); eq([vm.board.name, vm.board.tiles[0].kind], ['Look', 'color'], 'a tile with no board makes one');
});
