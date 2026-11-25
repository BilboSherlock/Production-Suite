'use strict';
/* Blocking & cues — model and view-model tests */
const STM = StageModel;
const stPlain = t => String(t || '').replace(/[*_]/g, '');
function stScript() {
  return [{ id: 'h1', type: 'scene', text: 'ACT ONE' }, { id: 'l1', type: 'action', text: 'Lights rise.' }, { id: 'l2', type: 'character', text: 'ANN' }, { id: 'l3', type: 'dialogue', text: 'The clock is *patient*.' },
    { id: 'q1', type: 'cue', text: 'LX 4 — Fade to black' }, { id: 'h2', type: 'scene', text: 'ACT TWO' }, { id: 'm1', type: 'action', text: 'Rain.' }, { id: 'q2', type: 'cue', text: 'BANG' }, { id: 'm2', type: 'action', text: 'Door slams.' }];
}
const stScenes = [{ id: 'h1', num: 1, label: 'One', idx: 0, end: 5, chars: new Map([['ANN', 1]]) }, { id: 'h2', num: 2, label: 'Two', idx: 5, end: 9, chars: new Map() }];

test('stage: the deck, positions and kinds', () => {
  const D = STM.deck({ w: 12, d: 8 });
  eq([Math.round(D.s * 100) / 100, D.step, D.x, D.y, D.unit], [67.5, 1, 95, 24, 'm']);
  eq([STM.deck({ w: 100, d: 40, unit: 'ft' }).step, STM.deck(null).wU], [5, 12]);
  eq(STM.posText({ w: 12, d: 8 }, { x: 500 - 67.5, y: 24 + 540 - 135 }), '1.0 m stage right of centre · 2.0 m upstage of the edge');
  eq([STM.place({ w: 12, d: 8, snap: true }, 503, 1000), STM.place({ w: 12, d: 8 }, 0, 50)], [{ x: 500, y: 560 }, { x: 101, y: 50 }]);
  eq([STM.kindsFor('photo').some(([k]) => k === 'door'), STM.kindsFor('photo').some(([k]) => k === 'softbox'), STM.kindsFor('stage').some(([k]) => k === 'door')], [false, true, true]);
  eq([STM.initials('mary ann smith'), STM.initials(''), STM.focal(40)], ['MA', '?', 49]);
});

test('stage: plans, items and frames', () => {
  const P = fakeProject({ stage: {} });
  const p = STM.addPlan(P); eq([p.name, p.frames.length, p.snap, STM.addPlan(P).name], ['Plan 1', 1, true, 'Plan 2']);
  eq([STM.setPlan(p, 'w', 'x'), p.w, STM.setPlan(p, 'd', 1), p.d, STM.setPlan(p, 'unit', 'cm'), STM.setPlan(p, 'unit', 'ft'), STM.setPlan(p, 'nope', 1)], [true, 12, true, 2, false, true, false]);
  const a = STM.addItem(p, 'actor', 'Ann'), b = STM.addItem(p, 'actor', 'Bo'), t = STM.addItem(p, 'table');
  eq([a.color, b.color, t.color, STM.addItem(p, 'spaceship'), p.frames[0].pos[a.id]], [STM.COLORS[0], STM.COLORS[1], STM.GREY, null, { x: 457, y: 293, r: 0 }]);
  eq([STM.addActors(p, ['ANN', 'CY', 'DEE']), p.items.filter(i => i.kind === 'actor').map(i => i.label)], [2, ['Ann', 'Bo', 'CY', 'DEE']], 'names already on the plan are skipped (any case)');
  eq([STM.setItem(p, a.id, 'fov', 500), a.fov, STM.setItem(p, a.id, 'color', '#000'), STM.setItem(p, a.id, 'color', STM.GREY), STM.setItem(p, 'zz', 'label', 'x')], [true, 120, false, true, false]);
  p.w = 12; p.d = 8; STM.moveItem(p, a.id, 2000, -5); eq(STM.posOf(p, a.id), { x: 900, y: 30, r: 0 }, 'kept on the deck, snapped to the grid');
  STM.rotate(p, a.id, -15); const f2 = STM.addFrame(p); eq([p.cur, f2.name, f2.pos[a.id].r, f2.pos === p.frames[0].pos], [1, 'Frame 2', -15, false], 'a new frame copies the positions');
  STM.moveItem(p, a.id, 500, 300); eq([p.frames[0].pos[a.id].x, p.frames[1].pos[a.id].x], [900, 500]);
  STM.setFrame(p, 'notes', 'Cross'); eq([p.frames[1].notes, STM.setFrame(p, 'pos', 1)], ['Cross', false]);
  eq([STM.goFrame(p, 9), STM.removeFrame(p, 0), p.cur, STM.removeFrame(p, 0)], [1, true, 0, false], 'the last frame stays');
  eq([STM.removeItem(p, a.id), a.id in p.frames[0].pos, STM.removeItem(p, a.id)], [true, false, false]);
  eq([STM.removePlan(P, p.id), STM.plans(P).length, STM.findPlan(P, p.id)], [true, 1, null]);
});

test('stage: cues, pins and the calling script', () => {
  const P = fakeProject({ blocks: stScript(), cues: [] });
  eq(STM.importCues(P), 2); eq(P.cues.map(c => [c.cue, c.type, c.sceneId, c.desc, c.src]), [['LX 4', 'LX', 'h1', 'Fade to black', 'q1'], ['BANG', 'OTHER', 'h2', '', 'q2']]); eq(STM.importCues(P), 0, 'nothing twice');
  const c = STM.addCue(P, stScenes); eq([c.sceneId, c.type], ['h2', 'LX']);
  eq([STM.setCue(P, c.id, 'at', '“the clock is patient”'), STM.setCue(P, c.id, 'type', 'ZAP'), STM.setCue(P, c.id, 'src', 'x')], [true, false, false]);
  c.sceneId = 'h1'; eq(STM.anchor(P, c, stScenes, stPlain), 'l3', 'the trigger text finds its line');
  c.sceneId = 'h2'; eq(STM.anchor(P, c, stScenes, stPlain), 'l3', 'falls back to the whole script');
  eq([STM.pin(P, c.id, 'm2', stPlain), c.anchor, c.at, STM.anchor(P, c, stScenes, stPlain)], [true, 'm2', '“the clock is patient”', 'm2']);
  const d = STM.addCue(P, stScenes); STM.pin(P, d.id, 'l1', stPlain); eq(d.at, 'Lights rise.', 'pinning fills an empty trigger');
  eq([STM.unpin(P, d.id), STM.unpin(P, d.id), STM.anchor(P, d, stScenes, stPlain)], [true, false, 'l1'], 'still found by its trigger');
  eq(STM.pinChoices(P, c, stScenes).map(b => b.id), ['h2', 'm1', 'q2', 'm2']);
  const C = STM.calling(P, stScenes, 3, stPlain);
  eq([[...C.go.keys()], [...C.standby.entries()].map(([k, v]) => k + ':' + v.map(x => x.cue).join('+')), C.unpinned], [['q1', 'q2', 'm2', 'l1'], ['l1:LX 4', 'h2:BANG+', 'h1:'], 0], 'standbys stay inside the scene');
  STM.addCue(P, stScenes); eq(STM.calling(P, stScenes, 3, stPlain).unpinned, 1);
  eq([STM.moveCue(P, P.cues[0].id, -1), STM.moveCue(P, P.cues[0].id, 1), P.cues[1].cue], [false, true, 'LX 4']);
  eq(STM.csvRows(P, stScenes)[2], ['LX 4', 'LX', 1, '', 'Fade to black', '']);
  eq([STM.removeCue(P, c.id), STM.removeCue(P, c.id), P.cues.length], [true, false, 4]);
});

test('stage vm: tabs, plans, dragging and cues', () => {
  const P = fakeProject({ mode: 'stage', blocks: stScript(), cues: [], stage: { plans: [] } }), ui = { stageTab: 'cues', planId: 'gone' };
  const store = fakeStore(P), vm = new StageVM({ project: () => P, store, ui, fx: { scenes: () => stScenes, charsOf: () => ['ANN', 'BO'], plain: stPlain } });
  let draws = 0; vm.subscribe(() => draws++);
  eq([vm.tab, vm.plan, vm.lead], ['cues', null, 3]);
  vm.setTab('nope'); eq(vm.tab, 'blocking');
  const p = vm.addPlan(); eq([ui.planId, vm.plan === p], [p.id, true]);
  const it = vm.addItem('actor', 'Ann'); eq([vm.sel, vm.item === it], [it.id, true], 'a new item is selected');
  vm.setPlan('sceneId', 'h1'); eq(vm.addActors(), 0, 'Ann is in scene 1 already'); vm.setPlan('sceneId', ''); eq(vm.addActors(), 1, 'BO from the whole script');
  const d0 = draws, pos = vm.dragTo(it.id, 600, 200); eq([draws, pos.x], [d0, 600], 'dragging does not redraw'); vm.drop();
  vm.addFrame(); eq([p.cur, vm.frame.name], [1, 'Frame 2']); vm.goFrame(0); eq(vm.frame.name, 'Opening');
  const d1 = draws; vm.setFrame('notes', 'x'); eq(draws, d1, 'notes are quiet'); vm.setFrame('name', 'Top'); eq(draws, d1 + 1);
  vm.removeItem(it.id); eq([vm.sel, vm.item], [null, null]);
  const p2 = vm.addPlan(); vm.openPlan(p.id); eq(vm.plan === p, true); vm.removePlan(); eq([vm.plan === p2, ui.planId], [true, p2.id]);
  const c = vm.addCue(); const d2 = draws; vm.setCue(c.id, 'desc', 'Snap'); eq(draws, d2, 'cue typing is quiet');
  eq([vm.importCues(), vm.cues.length, vm.pinChoices(c.id).lines.length, vm.pinChoices('zz')], [2, 3, 4, null]);
  vm.pin(c.id, 'm1'); eq(vm.calling().go.get('m1')[0], c); vm.setLead(0); eq(vm.lead, 3); vm.setLead(5); eq(vm.lead, 5);
  P.mode = 'photo'; ui.stageTab = 'calling'; eq(vm.tab, 'blocking', 'a photo shoot only has diagrams');
});
