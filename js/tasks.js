'use strict';
/* ===================================================================
   Tasks — VIEW
   A production to-do board. Builds the screen from TasksVM and sends
   every change through it; never edits project data directly.
   Model: js/models/tasks.model.js · View model: js/viewmodels/tasks.vm.js
   =================================================================== */

Views.tasks = function (root) {
  const vm = new TasksVM();
  const board = h('div', { class: 'kanban' }), summary = h('div', { class: 'row small muted' });
  const mkSel = (opts, val, ph, on) => h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => on(e.target.value) }, h('option', { value: '' }, ph), opts.map(o => h('option', { value: o, selected: o === val }, o)));
  const F = vm.filter;

  /* the toolbar is built once, so typing in the search box never loses focus; draw() redraws below it */
  const modeSeg = h('div', { class: 'seg' }, [['board', 'Board'], ['list', 'List']].map(([k, l]) => h('button', { 'data-k': k, onclick: () => vm.setMode(k) }, l)));
  root.parentElement.classList.add('noscroll');
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' }, modeSeg,
    h('input', { class: 'inp', placeholder: 'Search tasks…', value: F.q, style: { width: '190px' }, oninput: e => vm.setFilter({ q: e.target.value }) }),
    mkSel(vm.departments, F.dept, 'All departments', v => vm.setFilter({ dept: v })), mkSel(vm.assignees, F.who, 'Everyone', v => vm.setFilter({ who: v })),
    summary, h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => download(slug(vm.P.title) + '-tasks.csv', toCSV(vm.csvRows()), 'text/csv') }, icon('download', 15), 'CSV'),
    h('button', { class: 'btn', onclick: () => { const [head, ...rows] = vm.printRows(); printTable('Task list', head.map(x => x === 'Department' ? 'Dept' : x), rows, { landscape: true }); } }, icon('print', 15), 'Print')),
    h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } }, board)));

  const field = (label, el, w) => h('div', { class: 'field', style: { flex: w || '1 1 180px', marginBottom: 0 } }, h('label', { class: 'lbl' }, label), el);
  /* typing saves quietly (no redraw); the board redraws when the dialog closes */
  const quiet = (id, k) => e => vm.update(id, { [k]: e.target.value }, { quiet: true });

  function editTask(t) {
    const id = t.id;
    modal({ title: 'Task', onClose: () => vm.refresh(), body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      field('Task', h('input', { class: 'inp', value: t.title, oninput: quiet(id, 'title') })),
      h('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-end' } },
        field('Status', h('select', { class: 'inp', onchange: quiet(id, 'status') }, vm.statuses.map(([k, l]) => h('option', { value: k, selected: k === t.status }, l)))),
        field('Priority', h('select', { class: 'inp', onchange: quiet(id, 'priority') }, vm.priorities.map(o => h('option', { selected: o === t.priority }, o)))),
        field('Due', h('input', { class: 'inp', type: 'date', value: t.due, onchange: quiet(id, 'due') }))),
      h('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-end' } },
        field('Department', h('input', { class: 'inp', list: 'dl-tdept', value: t.dept, oninput: quiet(id, 'dept') })),
        field('Assigned to', h('input', { class: 'inp', list: 'dl-twho', value: t.assignee, oninput: quiet(id, 'assignee') })),
        field('Scene', h('select', { class: 'inp', onchange: quiet(id, 'sceneId') }, h('option', { value: '' }, '—'), vm.scenes.map(s => h('option', { value: s.id, selected: s.id === t.sceneId }, `${s.num}. ${s.label}`.slice(0, 40)))))),
      field('Notes', h('textarea', { class: 'inp', rows: 4, value: t.notes, oninput: quiet(id, 'notes') })),
      h('datalist', { id: 'dl-tdept' }, vm.departments.map(o => h('option', { value: o }))), h('datalist', { id: 'dl-twho' }, vm.assignees.map(o => h('option', { value: o })))),
      buttons: [{ label: 'Delete task', danger: true, onClick: () => vm.remove(id) }, { label: 'Done', primary: true }] });
  }

  function card(t) {
    const sc = vm.sceneNum(t.sceneId), over = vm.isOverdue(t);
    const el = h('div', { class: 'tcard p-' + t.priority.toLowerCase() + (t.status === 'done' ? ' done' : ''), onclick: () => editTask(t) },
      h('div', { class: 'tt' }, t.title || '(untitled)'),
      h('div', { class: 'tm' }, t.dept ? h('span', { class: 'pill' }, t.dept) : null, t.assignee ? h('span', { class: 'small' }, icon('user', 12), ' ' + t.assignee) : null,
        sc ? h('span', { class: 'small muted' }, 'Sc ' + sc) : null, t.due ? h('span', { class: 'small' + (over ? ' overdue' : ' muted') }, (over ? '⚠ ' : '') + fmtDateShort(t.due)) : null));
    return DnD.source(el, 'task', t.id);
  }
  function drawBoard() {
    board.className = 'kanban'; board.innerHTML = '';
    vm.columns.forEach(({ key, label, tasks }) => {
      const col = h('div', { class: 'kcol', 'data-k': key });
      const add = h('input', { class: 'inp', placeholder: '+ Add a task, press Enter', onkeydown: e => {
        if (e.key === 'Enter' && vm.add(add.value, key)) setTimeout(() => $(`.kcol[data-k=${key}] input`, board)?.focus(), 20);
      } });
      /* drop anywhere in a column; the line shows where the card will land */
      DnD.zone(col, 'task', (id, at) => vm.dropAt(id, key, at), { items: '.tcard' });
      col.append(h('div', { class: 'khead' }, h('b', {}, label), h('span', { class: 'pill' }, tasks.length)), add, h('div', { class: 'kbody' }, tasks.map(card)));
      board.append(col);
    });
  }
  function drawList() {
    board.className = 'tlist'; board.innerHTML = '';
    const vis = vm.visible;
    board.append(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['', 'Task', 'Status', 'Dept', 'Assignee', 'Due', 'Priority', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, vis.length ? vis.map(t => h('tr', { class: t.status === 'done' ? 'done' : '' },
        h('td', { style: { width: '34px' } }, h('input', { type: 'checkbox', checked: t.status === 'done', style: { width: '17px', height: '17px', margin: '8px' }, onchange: e => vm.setDone(t.id, e.target.checked) })),
        h('td', {}, h('input', { class: 'cell', value: t.title, style: { fontWeight: 600 }, oninput: quiet(t.id, 'title') })),
        h('td', { style: { width: '130px' } }, h('select', { class: 'cell', onchange: e => vm.update(t.id, { status: e.target.value }) }, vm.statuses.map(([k, l]) => h('option', { value: k, selected: k === t.status }, l)))),
        h('td', { style: { width: '140px' } }, h('input', { class: 'cell', list: 'dl-tdept2', value: t.dept, oninput: quiet(t.id, 'dept') })),
        h('td', { style: { width: '150px' } }, h('input', { class: 'cell', value: t.assignee, oninput: quiet(t.id, 'assignee') })),
        h('td', { style: { width: '150px' } }, h('input', { class: 'cell' + (vm.isOverdue(t) ? ' overdue' : ''), type: 'date', value: t.due, onchange: e => vm.update(t.id, { due: e.target.value }) })),
        h('td', { style: { width: '110px' } }, h('select', { class: 'cell', onchange: quiet(t.id, 'priority') }, vm.priorities.map(o => h('option', { selected: o === t.priority }, o)))),
        h('td', { style: { width: '80px', whiteSpace: 'nowrap' } }, ibtn('edit', 'Details', () => editTask(t)), ibtn('trash', 'Delete', () => vm.remove(t.id), 'danger'))))
        : h('tr', {}, h('td', { colspan: 8 }, h('div', { class: 'empty', style: { padding: '30px' } }, 'No tasks match.'))))),
      h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => vm.add('New task') }, icon('plus', 15), 'Add task')), h('datalist', { id: 'dl-tdept2' }, vm.departments.map(o => h('option', { value: o }))));
  }
  function draw() {
    const s = vm.summary;
    $$('button', modeSeg).forEach(b => b.classList.toggle('on', b.dataset.k === vm.mode));
    summary.replaceChildren(h('div', { class: 'progress' }, h('i', { style: { width: s.pct + '%' } })), `${s.done}/${s.total} done`, s.overdue ? h('span', { class: 'warnpill' }, icon('alert', 12), s.overdue + ' overdue') : '');
    vm.mode === 'list' ? drawList() : drawBoard();
  }

  const unbind = bindView(vm, draw);
  const ot = vm.takeOpenRequest(); if (ot) editTask(ot);
  return () => { unbind(); root.parentElement.classList.remove('noscroll'); };
};
