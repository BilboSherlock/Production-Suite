'use strict';
/* Script editor — model and view-model tests */
const SCM = ScriptModel;
function scProject(lines, extra = {}) {
  const P = fakeProject(Object.assign({ mode: 'screenplay', settings: { zoom: 1 }, revisions: [], meta: {} }, extra));
  P.blocks = lines.map(([type, text], i) => ({ id: 'b' + i, type, text }));
  return P;
}
const shape = P => P.blocks.map(b => b.type + ':' + b.text);

test('script: typing rules — auto types, capitals, revision marks', () => {
  const P = scProject([['action', ''], ['dialogue', ''], ['character', '']]);
  SCM.type(P, P.blocks[0], 'INT.'); eq(P.blocks[0].type, 'scene', 'INT. turns an action line into a heading');
  SCM.type(P, P.blocks[0], 'int. pier'); eq(P.blocks[0].text, 'INT. PIER');
  SCM.type(P, P.blocks[1], '('); eq(P.blocks[1].type, 'paren');
  eq(SCM.autoType('podcast', { type: 'dialogue' }, '', 'SFX: door'), 'sfx'); eq(SCM.autoType('podcast', { type: 'dialogue' }, '', 'Segment 2'), 'scene');
  P.revisions.push({ id: 'r1', color: '#cfe3ff' }); P.settings.rev = 'r1';
  SCM.type(P, P.blocks[2], 'ann'); eq([P.blocks[2].text, P.blocks[2].rev, SCM.revColor(P, 'r1')], ['ANN', 'r1', '#cfe3ff']);
  eq(SCM.setType(P, P.blocks[1], 'paren'), false); eq(SCM.setType(P, P.blocks[1], 'transition'), true);
  eq([SCM.cycleType('screenplay', 'act', 1), SCM.cycleType('screenplay', 'scene', -1), SCM.cycleType('photo', 'action', 1)], ['scene', 'act', 'scene']);
  eq([SCM.finishParen('quietly'), SCM.finishParen('(beat)'), SCM.finishParen('  ')], ['(quietly)', '(beat)', '  ']);
});

test('script: Enter splits and picks the next type', () => {
  const P = scProject([['scene', 'INT. PIER - DAY'], ['character', 'ANN'], ['action', 'She runs. Fast']]);
  let r = SCM.split(P, P.blocks[0], 'INT. PIER - DAY', 15, 15); eq([P.blocks[1].type, r.id, r.caret], ['action', P.blocks[1].id, 0]);
  r = SCM.split(P, P.blocks[2], 'ANN', 3, 3); eq(P.blocks[3].type, 'dialogue');
  SCM.split(P, P.blocks[4], 'She runs. Fast', 9, 9); eq(shape(P).slice(4), ['action:She runs.', 'action:Fast']);
  const Q = scProject([['action', 'CUT TO:']]); SCM.split(Q, Q.blocks[0], 'CUT TO:', 7, 7); eq(shape(Q), ['transition:CUT TO:', 'scene:'], 'a TO: line becomes a transition');
  const E = scProject([['dialogue', '']]); r = SCM.split(E, E.blocks[0], '', 0, 0); eq([E.blocks[0].type, E.blocks.length, r.id], ['action', 1, 'b0'], 'Enter on an empty line resets its type');
  r = SCM.split(E, E.blocks[0], '', 0, 0); eq(E.blocks.length, 2);
  const F = scProject([['action', 'Hello']]); SCM.split(F, F.blocks[0], 'Hello', 0, 0); eq(shape(F), ['action:', 'action:Hello'], 'Enter at the start pushes the text down');
  const G = scProject([['paren', 'beat']]); SCM.split(G, G.blocks[0], 'beat', 2, 2); eq(shape(G), ['paren:(beat)', 'dialogue:'], 'brackets close first');
});

test('script: Backspace and Delete join lines', () => {
  let P = scProject([['action', 'One'], ['action', 'Two']]);
  let r = SCM.backspace(P, P.blocks[1], 'Two'); eq([shape(P), r.id, r.caret], [['action:OneTwo'], 'b0', 3]);
  P = scProject([['scene', 'INT. A'], ['action', '']]); r = SCM.backspace(P, P.blocks[1], ''); eq([shape(P), r.caret], [['scene:INT. A'], 'end']);
  P = scProject([['action', ' '], ['scene', 'INT. A']]); r = SCM.backspace(P, P.blocks[1], 'INT. A'); eq([shape(P), r.lost.id], [['scene:INT. A'], 'b0']);
  P = scProject([['action', 'Hi'], ['dialogue', 'Yo']]); r = SCM.backspace(P, P.blocks[1], 'Yo'); eq([P.blocks[1].type, r.retyped], ['action', 'dialogue']);
  P = scProject([['action', 'Hi'], ['scene', 'INT']]); eq(SCM.backspace(P, P.blocks[1], 'INT'), null, 'a heading stays');
  eq(SCM.backspace(P, P.blocks[0], 'Hi'), null, 'nothing above the first line');
  P = scProject([['action', 'A'], ['action', 'B'], ['dialogue', 'C']]);
  r = SCM.del(P, P.blocks[0], 'A'); eq([shape(P), r.caret], [['action:AB', 'dialogue:C'], 1]);
  eq(SCM.del(P, P.blocks[0], 'AB'), null, 'a different type with text stays');
  const Q = scProject([['action', '']]); eq(SCM.remove(Q, Q.blocks[0]), false, 'the last line is only emptied');
});

test('script: paste, marks, dual dialogue, notes and omitted scenes', () => {
  const P = scProject([['action', 'Before after']]);
  const r = SCM.paste(P, P.blocks[0], 'Before after', 7, 7, [{ id: 'x', type: 'character', text: 'ANN' }, { id: 'y', type: 'dialogue', text: 'Hi.' }]);
  eq([shape(P), r.id, r.count], [['action:Before ', 'character:ANN', 'dialogue:Hi.', 'action:after'], 'y', 2]);
  eq(SCM.toggleMark('a bold b', 2, 6, '**'), { value: 'a **bold** b', start: 2, end: 10 });
  eq(SCM.toggleMark('a **bold** b', 2, 10, '**'), { value: 'a bold b', start: 2, end: 6 });
  eq(SCM.toggleMark('a **bold** b', 4, 8, '**'), { value: 'a bold b', start: 2, end: 6 });
  eq(SCM.toggleMark('ab', 1, 1, '_'), { value: 'a__b', start: 2, end: 2 });
  const c = { type: 'character', text: 'BOB ' }; eq([SCM.toggleDual(P, c), c.text, SCM.toggleDual(P, c), c.text], [true, 'BOB ^', false, 'BOB']);
  eq(SCM.toggleDual(P, { type: 'action', text: '' }), null);
  const S = scProject([['act', 'ACT ONE'], ['scene', 'INT. A'], ['action', 'x'], ['scene', 'EXT. B']]);
  SCM.setNote(S.blocks[2], ' Fix '); eq(SCM.notes(S), [{ id: 'b2', note: 'Fix', text: 'x', scene: 'INT. A' }]);
  SCM.setNote(S.blocks[2], ''); eq('note' in S.blocks[2], false);
  eq([SCM.toggleOmit(S, 'b2'), SCM.omitted(S).map(b => b.id), SCM.toggleOmit(S, 'b0')], ['omitted', ['b1'], null]);
  eq(SCM.restoreScene(S, 'b1'), true); eq(SCM.omitted(S), []);
});

test('script: scene numbers, find & replace, suggestions', () => {
  const P = scProject([['scene', 'INT. A'], ['scene', 'INT. B'], ['action', 'cat Cat']]);
  SCM.lockNumbers(P); eq(P.blocks.slice(0, 2).map(b => b.num), ['1', '2']);
  P.blocks.splice(1, 0, { id: 'n', type: 'scene', text: 'X' }, { id: 'm', type: 'scene', text: 'Y' });
  eq(SCM.assignNumbers(P), true); eq(P.blocks.filter(b => b.type === 'scene').map(b => b.num), ['1', '1A', '1B', '2']);
  eq([SCM.nextLetters('Z'), SCM.nextLetters('AZ')], ['AA', 'BA']);
  SCM.unlockNumbers(P); eq([P.blocks[0].num, P.settings.sceneNumLock], [undefined, false]);
  eq(SCM.findAll(P, 'CAT'), [{ id: 'b2', at: 0 }, { id: 'b2', at: 4 }]);
  eq(SCM.replaceAll(P, 'cat', 'dog.'), 2); eq(P.blocks[4].text, 'dog. dog.');
  eq(SCM.replaceAll(P, 'int', 'ext'), 2); eq(P.blocks[0].text, 'EXT. A', 'headings stay in capitals');
  eq(SCM.suggest('screenplay', 'scene', 'e', 1), { items: ['EXT. '], from: 0, to: 1 });
  eq(SCM.suggest('screenplay', 'scene', 'INT. PI', 7, { locations: ['PIER', 'PIT', 'BAR'] }), { items: ['PIER - ', 'PIT - '], from: 5, to: 7 });
  eq(SCM.suggest('screenplay', 'scene', 'INT. PIER - N', 13).items, ['NIGHT']);
  eq(SCM.suggest('screenplay', 'character', 'MA', 2, { characters: ['MARGOT', 'MAX', 'MARGOT', 'BO'] }).items, ['MARGOT', 'MAX']);
  eq(SCM.suggest('screenplay', 'transition', 'SMA', 3).items, ['SMASH CUT TO:']);
  eq(SCM.acceptSuggestion('INT. PI', { from: 5, to: 7 }, 'PIER - '), { value: 'INT. PIER - ', caret: 12 });
});

test('script: revisions, snapshots, import, title page, table read', () => {
  const P = scProject([['scene', 'INT. A'], ['character', 'ANN'], ['paren', '(beat)'], ['dialogue', 'Hi.'], ['scene', 'EXT. B'], ['action', 'Gone']]);
  const r = SCM.startRevision(P, 'pink', '2026-01-02'); eq([r.name, P.settings.rev, SCM.nextRevColor(P).k], ['Pink Revision', r.id, 'white']);
  eq(SCM.startRevision(P, 'plaid'), null); eq(SCM.track(P, 'nope'), false); eq(SCM.track(P, ''), true);
  P.blocks[0].rev = r.id; SCM.clearMarks(P); eq([P.blocks[0].rev, P.revisions.length], [undefined, 0]);
  P.blocks[1].note = 'n'; P.blocks[4].om = true; const s = SCM.snap(P); P.blocks = []; SCM.restore(P, s); eq([P.blocks.length, P.blocks[1].note, P.blocks[4].om], [6, 'n', true]);
  eq(SCM.readQueue(P, 0).map(q => q.type + (q.speaker ? '/' + q.speaker : '')), ['scene', 'dialogue/ANN', 'scene'], 'omitted scenes read only their heading');
  eq(SCM.spokenHeading('INT. PIER - DAY'), 'Interior. PIER. DAY');
  eq(SCM.stats(P), { scenes: 2, words: 8 }); eq([SCM.runtime('podcast', 3, 10), SCM.runtime('stage', 4, 0), SCM.runtime('screenplay', 4, 0)], [1, 6, 4]);
  const Q = scProject([['action', 'Old'], ['action', '']]);
  eq(SCM.applyImport(Q, { blocks: [{ id: 'z', type: 'action', text: 'New' }] }, false), 1); eq(shape(Q), ['action:Old', 'action:New']);
  SCM.applyImport(Q, { meta: { title: 'Fresh', authors: 'Bo', 'draft date': 'May' }, blocks: [{ id: 'z', type: 'action', text: 'X' }], keepNumbers: true }, true);
  eq([Q.title, Q.meta.author, Q.meta.draft, Q.settings.sceneNumLock, Q.blocks.length], ['Fresh', 'Bo', 'May', true, 1]);
  eq([SCM.setMeta(Q, 'title', 'T2'), SCM.setMeta(Q, 'setting', 'x'), SCM.metaOf(Q, 'title')], [true, false, 'T2'], 'stage fields only in stage plays');
  eq(SCM.titleFields('stage').length, 11); eq([SCM.zoom(Q, 5), SCM.zoom(Q, -9)], [1.8, 0.5]);
});

function scVM(P) {
  const timers = [];
  const vm = new ScriptVM({ project: () => P, store: fakeStore(P), ui: {}, fx: { later: fn => { timers.push(fn); return timers.length; }, cancel: () => { }, scenes: () => [], sceneDataCount: () => 2, warn: m => vm.warned.push(m), characters: () => ['ANN'], locations: () => [] } });
  vm.warned = []; vm.timers = timers; return vm;
}

test('script vm: typing is one undo step after a pause; commands redraw', () => {
  const P = scProject([['action', 'Hi']]), vm = scVM(P);
  let draws = 0; vm.subscribe(() => draws++);
  vm.input('b0', 'Hi there'); vm.input('b0', 'Hi there!'); eq([draws, vm.canUndo], [0, false], 'typing is quiet and waits for a pause');
  vm.timers.pop()(); eq(vm.canUndo, true);
  const r = vm.split('b0', 'Hi there!', 9, 9); eq([P.blocks.length, r.id, draws], [2, P.blocks[1].id, 1]);
  eq(vm.undo(), 'b0'); eq(shape(P), ['action:Hi there!']); eq(vm.undo(), 'b0'); eq(shape(P), ['action:Hi']);
  eq(vm.redo(), 'b0'); eq(shape(P), ['action:Hi there!']); eq(vm.canRedo, true);
  vm.input('b0', 'X'); vm.setType('b0', 'character'); eq(shape(P), ['character:X']); eq(vm.canRedo, false, 'a new change drops the redo steps');
  vm.undo(); eq(shape(P), ['action:X'], 'pending typing was recorded before the type change');
});

test('script vm: losing a scene warns; outline, omit and suggestions', () => {
  const P = scProject([['scene', 'INT. A'], ['action', 'x'], ['character', 'A']]), vm = scVM(P);
  vm.setType('b0', 'action'); eq(vm.warned.length, 1, 'retyping a heading with linked data warns');
  vm.undo(); vm.backspace('b1', ''); eq(vm.warned.length, 1, 'removing an action line does not');
  vm.focus('b0'); eq([vm.current.id, vm.sceneAt(), vm._ui.scene], ['b0', 'b0', 'b0']);
  eq(vm.toggleOmit(), 'omitted'); eq(vm.omitted.length, 1); vm.restoreScene('b0'); eq(vm.omitted.length, 0);
  eq(vm.suggest('b2', 'A', 1).items, ['ANN']);
  eq(vm.toggleDual('b0'), null); eq(vm.toggleDual('b2'), true);
  vm.setNavMode('notes'); eq(vm.navMode, 'notes'); vm.setNavMode('bogus'); eq(vm.navMode, 'scenes');
  P.settings.sceneNumLock = true; eq(vm.renumber(), true); eq(P.blocks[0].num, 'A1');
});
