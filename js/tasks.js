'use strict';
/* ===================================================================
   Tasks — a production to-do board
   =================================================================== */
const TASK_COLS = [['todo', 'To do'], ['doing', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];
const PRIORITIES = ['Low', 'Normal', 'High'];
const newTask = (title, status = 'todo') => ({ id: uid(), title, notes: '', status, dept: '', assignee: '', due: '', priority: 'Normal', sceneId: '' });
const taskOverdue = t => t.status !== 'done' && t.due && t.due < new Date().toISOString().slice(0, 10);

Views.tasks = function (root) {
  const P = Store.P; let dragId = null; UI.taskMode = UI.taskMode || 'board';
  const F = UI.taskFilter = UI.taskFilter || { dept: '', who: '', q: '' };
  const board = h('div', { class: 'kanban' }), summary = h('div', { class: 'row small muted' });
  const people = () => [...new Set(P.people.filter(p => p.name).map(p => p.name).concat(P.tasks.map(t => t.assignee).filter(Boolean)))].sort();
  const depts = () => [...new Set(DEPTS.concat(P.tasks.map(t => t.dept).filter(Boolean)))].sort();
  const mkSel = (opts, val, ph, on) => h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => on(e.target.value) }, h('option', { value: '' }, ph), opts.map(o => h('option', { value: o, selected: o === val }, o)));
  const modeSeg = h('div', { class: 'seg' }, [['board', 'Board'], ['list', 'List']].map(([k, l]) => h('button', { 'data-k': k, class: UI.taskMode === k ? 'on' : '', onclick: () => { UI.taskMode = k; $$('button', modeSeg).forEach(b => b.classList.toggle('on', b.dataset.k === k)); draw(); } }, l)));
  root.parentElement.classList.add('noscroll');
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' }, modeSeg,
    h('input', { class: 'inp', placeholder: 'Search tasks…', value: F.q, style: { width: '190px' }, oninput: e => { F.q = e.target.value; draw(); } }),
    mkSel(depts(), F.dept, 'All departments', v => { F.dept = v; draw(); }), mkSel(people(), F.who, 'Everyone', v => { F.who = v; draw(); }),
    summary, h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-tasks.csv', toCSV([['Task', 'Status', 'Department', 'Assignee', 'Due', 'Priority', 'Scene', 'Notes'], ...P.tasks.map(t => [t.title, statusLabel(t.status), t.dept, t.assignee, t.due, t.priority, sceneNum(t.sceneId), t.notes])]), 'text/csv') }, icon('download', 15), 'CSV'),
    h('button', { class: 'btn', onclick: () => printTable('Task list', ['Task', 'Status', 'Dept', 'Assignee', 'Due', 'Priority', 'Scene'], P.tasks.map(t => [t.title, statusLabel(t.status), t.dept, t.assignee, t.due, t.priority, sceneNum(t.sceneId)]), { landscape: true }) }, icon('print', 15), 'Print')),
    h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } }, board)));

  const statusLabel = k => (TASK_COLS.find(c => c[0] === k) || [0, k])[1];
  const sceneNum = id => { const s = getScenes(P).find(x => x.id === id); return s ? s.num : ''; };
  const visible = () => P.tasks.filter(t => (!F.dept || t.dept === F.dept) && (!F.who || t.assignee === F.who) && (!F.q || (t.title + ' ' + t.notes).toLowerCase().includes(F.q.toLowerCase())));

  function editTask(t) {
    const scenes = getScenes(P);
    const f = (label, el, w) => h('div', { class: 'field', style: { flex: w || '1 1 180px', marginBottom: 0 } }, h('label', { class: 'lbl' }, label), el);
    const title = h('input', { class: 'inp', value: t.title, oninput: e => { t.title = e.target.value; Store.touch(); } });
    modal({ title: 'Task', onClose: draw, body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      f('Task', title),
      h('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-end' } },
        f('Status', h('select', { class: 'inp', onchange: e => { t.status = e.target.value; Store.touch(); } }, TASK_COLS.map(([k, l]) => h('option', { value: k, selected: k === t.status }, l)))),
        f('Priority', h('select', { class: 'inp', onchange: e => { t.priority = e.target.value; Store.touch(); } }, PRIORITIES.map(o => h('option', { selected: o === t.priority }, o)))),
        f('Due', h('input', { class: 'inp', type: 'date', value: t.due, onchange: e => { t.due = e.target.value; Store.touch(); } }))),
      h('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-end' } },
        f('Department', h('input', { class: 'inp', list: 'dl-tdept', value: t.dept, oninput: e => { t.dept = e.target.value; Store.touch(); } })),
        f('Assigned to', h('input', { class: 'inp', list: 'dl-twho', value: t.assignee, oninput: e => { t.assignee = e.target.value; Store.touch(); } })),
        f('Scene', h('select', { class: 'inp', onchange: e => { t.sceneId = e.target.value; Store.touch(); } }, h('option', { value: '' }, '—'), scenes.map(s => h('option', { value: s.id, selected: s.id === t.sceneId }, `${s.num}. ${s.label}`.slice(0, 40)))))),
      f('Notes', h('textarea', { class: 'inp', rows: 4, value: t.notes, oninput: e => { t.notes = e.target.value; Store.touch(); } })),
      h('datalist', { id: 'dl-tdept' }, depts().map(o => h('option', { value: o }))), h('datalist', { id: 'dl-twho' }, people().map(o => h('option', { value: o })))),
      buttons: [{ label: 'Delete task', danger: true, onClick: () => { P.tasks = P.tasks.filter(x => x !== t); Store.touch(); } }, { label: 'Done', primary: true }] });
  }
  function moveTask(id, status, beforeId) {
    const t = P.tasks.find(x => x.id === id); if (!t) return;
    P.tasks = P.tasks.filter(x => x !== t); t.status = status;
    const bi = beforeId ? P.tasks.findIndex(x => x.id === beforeId) : -1;
    if (bi >= 0) P.tasks.splice(bi, 0, t); else P.tasks.push(t);
    Store.touch(); draw();
  }
  function card(t) {
    const el = h('div', { class: 'tcard p-' + t.priority.toLowerCase() + (t.status === 'done' ? ' done' : ''), draggable: true, onclick: () => editTask(t),
      ondragstart: e => { dragId = t.id; e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => el.classList.add('dragging'), 0); },
      ondragend: () => { dragId = null; el.classList.remove('dragging'); $$('.kcol.over').forEach(c => c.classList.remove('over')); $$('.drop-ind').forEach(x => x.remove()); } },
      h('div', { class: 'tt' }, t.title || '(untitled)'),
      h('div', { class: 'tm' }, t.dept ? h('span', { class: 'pill' }, t.dept) : null, t.assignee ? h('span', { class: 'small' }, icon('user', 12), ' ' + t.assignee) : null,
        t.sceneId && sceneNum(t.sceneId) ? h('span', { class: 'small muted' }, 'Sc ' + sceneNum(t.sceneId)) : null, t.due ? h('span', { class: 'small' + (taskOverdue(t) ? ' overdue' : ' muted') }, (taskOverdue(t) ? '⚠ ' : '') + fmtDateShort(t.due)) : null));
    return el;
  }
  function drawBoard() {
    board.className = 'kanban'; board.innerHTML = '';
    const vis = visible();
    TASK_COLS.forEach(([k, l]) => {
      const list = vis.filter(t => t.status === k);
      const col = h('div', { class: 'kcol', 'data-k': k });
      const add = h('input', { class: 'inp', placeholder: '+ Add a task, press Enter', onkeydown: e => { if (e.key === 'Enter' && add.value.trim()) { const t = newTask(add.value.trim(), k); if (F.dept) t.dept = F.dept; if (F.who) t.assignee = F.who; P.tasks.push(t); Store.touch(); draw(); setTimeout(() => $(`.kcol[data-k=${k}] input`, board)?.focus(), 20); } } });
      const body = h('div', { class: 'kbody' }, list.map(card));
      col.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); col.classList.add('over'); $$('.drop-ind', col).forEach(x => x.remove()); const cards = $$('.tcard:not(.dragging)', body); let i = 0; for (const c of cards) { const r = c.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) break; i++; } const ind = h('div', { class: 'drop-ind' }); i < cards.length ? cards[i].before(ind) : body.append(ind); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) { col.classList.remove('over'); $$('.drop-ind', col).forEach(x => x.remove()); } });
      col.addEventListener('drop', e => { e.preventDefault(); const cards = $$('.tcard:not(.dragging)', body); let i = 0; for (const c of cards) { const r = c.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) break; i++; } const ids = list.filter(t => t.id !== dragId).map(t => t.id); moveTask(dragId, k, ids[i] || null); });
      col.append(h('div', { class: 'khead' }, h('b', {}, l), h('span', { class: 'pill' }, list.length)), add, body);
      board.append(col);
    });
  }
  function drawList() {
    board.className = 'tlist'; board.innerHTML = '';
    const vis = visible();
    board.append(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['', 'Task', 'Status', 'Dept', 'Assignee', 'Due', 'Priority', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, vis.length ? vis.map(t => h('tr', { class: t.status === 'done' ? 'done' : '' },
        h('td', { style: { width: '34px' } }, h('input', { type: 'checkbox', checked: t.status === 'done', style: { width: '17px', height: '17px', margin: '8px' }, onchange: e => { t.status = e.target.checked ? 'done' : 'todo'; Store.touch(); draw(); } })),
        h('td', {}, h('input', { class: 'cell', value: t.title, style: { fontWeight: 600 }, oninput: e => { t.title = e.target.value; Store.touch(); } })),
        h('td', { style: { width: '130px' } }, h('select', { class: 'cell', onchange: e => { t.status = e.target.value; Store.touch(); draw(); } }, TASK_COLS.map(([k, l]) => h('option', { value: k, selected: k === t.status }, l)))),
        h('td', { style: { width: '140px' } }, h('input', { class: 'cell', list: 'dl-tdept2', value: t.dept, oninput: e => { t.dept = e.target.value; Store.touch(); } })),
        h('td', { style: { width: '150px' } }, h('input', { class: 'cell', value: t.assignee, oninput: e => { t.assignee = e.target.value; Store.touch(); } })),
        h('td', { style: { width: '150px' } }, h('input', { class: 'cell' + (taskOverdue(t) ? ' overdue' : ''), type: 'date', value: t.due, onchange: e => { t.due = e.target.value; Store.touch(); draw(); } })),
        h('td', { style: { width: '110px' } }, h('select', { class: 'cell', onchange: e => { t.priority = e.target.value; Store.touch(); } }, PRIORITIES.map(o => h('option', { selected: o === t.priority }, o)))),
        h('td', { style: { width: '80px', whiteSpace: 'nowrap' } }, ibtn('edit', 'Details', () => editTask(t)), ibtn('trash', 'Delete', () => { P.tasks = P.tasks.filter(x => x !== t); Store.touch(); draw(); }, 'danger'))))
        : h('tr', {}, h('td', { colspan: 8 }, h('div', { class: 'empty', style: { padding: '30px' } }, 'No tasks match.'))))),
      h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => { P.tasks.push(newTask('New task')); Store.touch(); draw(); } }, icon('plus', 15), 'Add task')), h('datalist', { id: 'dl-tdept2' }, depts().map(o => h('option', { value: o }))));
  }
  function draw() {
    const done = P.tasks.filter(t => t.status === 'done').length, over = P.tasks.filter(taskOverdue).length;
    summary.innerHTML = ''; summary.append(h('div', { class: 'progress' }, h('i', { style: { width: (P.tasks.length ? done / P.tasks.length * 100 : 0) + '%' } })), `${done}/${P.tasks.length} done`, over ? h('span', { class: 'warnpill' }, icon('alert', 12), over + ' overdue') : null);
    UI.taskMode === 'list' ? drawList() : drawBoard();
  }
  draw();
  if (UI.openTask) { const ot = P.tasks.find(x => x.id === UI.openTask); UI.openTask = null; if (ot) editTask(ot); }
  return () => root.parentElement.classList.remove('noscroll');
};
