'use strict';
/* Tasks: model rules and view-model behaviour */

/* ---------- model ---------- */
test('create: defaults, and unknown fields are ignored', () => {
  const t = TaskModel.create('Book crane', 'doing', { dept: 'Grip', bogus: 1 });
  eq([t.title, t.status, t.dept, t.priority, t.due], ['Book crane', 'doing', 'Grip', 'Normal', '']);
  assert(t.id, 'has an id'); assert(!('bogus' in t), 'bogus field dropped');
});
test('create / update: invalid status and priority fall back safely', () => {
  const P = fakeProject(); const t = TaskModel.add(P, 'x', 'nonsense');
  eq(t.status, 'todo');
  TaskModel.update(P, t.id, { priority: 'URGENT', status: 'blocked' });
  eq([t.priority, t.status], ['Normal', 'blocked']);
});
test('isOverdue: compares with the given day; done tasks are never overdue', () => {
  const t = TaskModel.create('x', 'todo', { due: '2026-03-10' });
  eq(TaskModel.isOverdue(t, '2026-03-10'), false, 'due today');
  eq(TaskModel.isOverdue(t, '2026-03-11'), true, 'due yesterday');
  t.status = 'done'; eq(TaskModel.isOverdue(t, '2026-03-11'), false, 'done');
  eq(TaskModel.isOverdue(TaskModel.create('no date'), '2030-01-01'), false, 'no due date');
});
test('localISODate uses the local calendar day, not UTC', () => {
  eq(localISODate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  eq(localISODate(new Date(2026, 11, 31, 0, 5)), '2026-12-31');
});
test('filter: department, person and text search combine', () => {
  const P = fakeProject();
  TaskModel.add(P, 'Rig lights', 'todo', { dept: 'Lighting', assignee: 'Sam' });
  TaskModel.add(P, 'Order gels', 'todo', { dept: 'Lighting', assignee: 'Ana', notes: 'CTO and CTB' });
  TaskModel.add(P, 'Call agent', 'todo', { dept: 'Production', assignee: 'Ana' });
  eq(TaskModel.filter(P.tasks, { dept: 'Lighting' }).length, 2);
  eq(TaskModel.filter(P.tasks, { who: 'Ana' }).length, 2);
  eq(TaskModel.filter(P.tasks, { dept: 'Lighting', who: 'Ana' }).map(t => t.title), ['Order gels']);
  eq(TaskModel.filter(P.tasks, { q: '  cto ' }).map(t => t.title), ['Order gels'], 'searches notes, trims, ignores case');
  eq(TaskModel.filter(P.tasks, {}).length, 3);
});
test('move: changes column and lands before the given task', () => {
  const P = fakeProject(); const a = TaskModel.add(P, 'a'), b = TaskModel.add(P, 'b', 'done'), c = TaskModel.add(P, 'c', 'done');
  TaskModel.move(P, a.id, 'done', c.id);
  eq(P.tasks.map(t => t.title), ['b', 'a', 'c']); eq(a.status, 'done');
  TaskModel.move(P, b.id, 'todo', null);
  eq(P.tasks.map(t => t.title), ['a', 'c', 'b'], 'no target → end');
  eq(TaskModel.move(P, 'missing', 'todo'), null);
});
test('remove and summary', () => {
  const P = fakeProject(); const a = TaskModel.add(P, 'a', 'done'); TaskModel.add(P, 'b', 'todo', { due: '2000-01-01' }); TaskModel.add(P, 'c');
  const s = TaskModel.summary(P.tasks, '2026-01-01');
  eq([s.total, s.done, s.overdue, Math.round(s.pct)], [3, 1, 1, 33]);
  eq(TaskModel.remove(P, a.id), true); eq(TaskModel.remove(P, a.id), false); eq(P.tasks.length, 2);
  eq(TaskModel.summary([]).pct, 0, 'empty list');
});
test('assignees and departments are unique and sorted', () => {
  const P = fakeProject({ people: [{ name: 'Zoe' }, { name: '' }, { name: 'Ana' }] });
  TaskModel.add(P, 'x', 'todo', { assignee: 'Ana', dept: 'Sound' }); TaskModel.add(P, 'y', 'todo', { assignee: 'Bo', dept: 'Art' });
  eq(TaskModel.assignees(P), ['Ana', 'Bo', 'Zoe']);
  eq(TaskModel.departments(P, ['Sound', 'Camera']), ['Art', 'Camera', 'Sound']);
});
test('table: CSV rows with status labels and scene numbers', () => {
  const P = fakeProject(); TaskModel.add(P, 'x', 'doing', { sceneId: 's1', notes: 'n' });
  eq(TaskModel.table(P.tasks, id => id === 's1' ? '4A' : ''), [['Task', 'Status', 'Department', 'Assignee', 'Due', 'Priority', 'Scene', 'Notes'], ['x', 'In progress', '', '', '', 'Normal', '4A', 'n']]);
  eq(TaskModel.table(P.tasks, undefined, { notes: false })[0].length, 7);
});

/* ---------- view model ---------- */
const makeVM = (P = fakeProject()) => {
  const store = fakeStore(P), ui = {};
  const vm = new TasksVM({ project: () => store.P, store, ui, departments: ['Camera'], scenes: () => [{ id: 's1', num: '12', label: 'INT. KITCHEN' }] });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, store, ui, P, draws: () => draws };
};
test('vm: add records a change, redraws, and inherits the active filter', () => {
  const { vm, store, draws } = makeVM();
  vm.setFilter({ dept: 'Camera', who: 'Ana' });
  const t = vm.add('  Clean lenses  ', 'doing');
  eq([t.title, t.status, t.dept, t.assignee], ['Clean lenses', 'doing', 'Camera', 'Ana']);
  eq(store.touches, 1, 'saved once'); eq(draws(), 2, 'filter + add redraws');
  eq(vm.add('   '), null, 'blank title ignored'); eq(store.touches, 1);
});
test('vm: quiet updates save without redrawing', () => {
  const { vm, store, draws } = makeVM(); const t = vm.add('x'); const before = draws();
  vm.update(t.id, { title: 'xy' }, { quiet: true });
  eq(t.title, 'xy'); eq(store.touches, 2); eq(draws(), before, 'no redraw while typing');
  vm.update(t.id, { status: 'done' }); eq(draws(), before + 1);
});
test('vm: filter and mode are UI state — remembered, but not saved to the project', () => {
  const { vm, store, ui } = makeVM();
  vm.setMode('list'); vm.setFilter({ q: 'gels' });
  eq(vm.mode, 'list'); eq(ui.tasks.q, 'gels'); eq(store.touches, 0, 'UI changes are not project changes');
  const again = new TasksVM({ project: () => store.P, store, ui });
  eq([again.mode, again.filter.q], ['list', 'gels'], 'a new visit restores them');
});
test('vm: dropAt uses positions among the visible tasks of that column', () => {
  const { vm, P } = makeVM();
  vm.setFilter({ dept: 'Camera' });
  const a = vm.add('a'); TaskModel.add(P, 'hidden', 'todo', { dept: 'Art' }); vm.add('b'); const c = vm.add('c', 'done');
  // To do shows [a, b]; "hidden" is filtered out. Dropping at position 1 means "before b", not "before hidden".
  vm.dropAt(c.id, 'todo', 1);
  eq(P.tasks.map(t => t.title), ['a', 'hidden', 'c', 'b']);
  eq(c.status, 'todo');
  vm.dropAt(a.id, 'blocked', 0);
  eq([a.status, P.tasks[P.tasks.length - 1].title], ['blocked', 'a'], 'empty column → end');
});
test('vm: reads the project fresh after it is swapped (undo / live sync)', () => {
  const { vm, store } = makeVM(); vm.add('old');
  store.P = fakeProject({ tasks: [TaskModel.create('restored')] });
  eq(vm.all.map(t => t.title), ['restored']);
});
test('vm: columns, summary and scene numbers', () => {
  const { vm } = makeVM(); vm.add('a'); const b = vm.add('b', 'done'); vm.update(b.id, { sceneId: 's1' });
  eq(vm.columns.map(c => [c.key, c.tasks.length]), [['todo', 1], ['doing', 0], ['blocked', 0], ['done', 1]]);
  eq(vm.summary.done, 1); eq(vm.sceneNum('s1'), '12'); eq(vm.sceneNum('nope'), '');
  eq(vm.csvRows()[2][6], '12');
});
test('vm: open request from search is consumed once', () => {
  const { vm, ui } = makeVM(); const t = vm.add('x'); ui.openTask = t.id;
  eq(vm.takeOpenRequest().id, t.id); eq(vm.takeOpenRequest(), null);
});
test('vm: dispose stops redraws', () => {
  const { vm, draws } = makeVM(); const n = draws(); vm.dispose(); vm.add('x'); eq(draws(), n);
});
