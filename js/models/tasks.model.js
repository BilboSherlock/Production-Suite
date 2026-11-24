'use strict';
/* ===================================================================
   Tasks — MODEL
   The production to-do list: P.tasks, an array of task objects in board
   order. Pure functions — no DOM, no Store. See js/mvvm.js.
   =================================================================== */

/**
 * @typedef {'todo'|'doing'|'blocked'|'done'} TaskStatus
 * @typedef {'Low'|'Normal'|'High'} TaskPriority
 * @typedef {object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} notes
 * @property {TaskStatus} status
 * @property {string} dept
 * @property {string} assignee
 * @property {string} due        YYYY-MM-DD, or ''
 * @property {TaskPriority} priority
 * @property {string} sceneId    the linked scene, or ''
 */

const TaskModel = {
  /** [key, label] in board order */
  COLS: [['todo', 'To do'], ['doing', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']],
  PRIORITIES: ['Low', 'Normal', 'High'],
  /** fields a user may change through update() */
  FIELDS: ['title', 'notes', 'status', 'dept', 'assignee', 'due', 'priority', 'sceneId'],

  /** @returns {Task} */
  create(title = '', status = 'todo', extra = {}) {
    const t = { id: newId(), title, notes: '', status: TaskModel.validStatus(status), dept: '', assignee: '', due: '', priority: 'Normal', sceneId: '' };
    return Object.assign(t, TaskModel.clean(extra));
  },
  validStatus(s) { return TaskModel.COLS.some(c => c[0] === s) ? s : 'todo'; },
  validPriority(p) { return TaskModel.PRIORITIES.includes(p) ? p : 'Normal'; },
  /** keeps only known fields, with valid status / priority and string values */
  clean(patch) {
    const out = {};
    for (const k of TaskModel.FIELDS) if (patch && k in patch) out[k] = patch[k] == null ? '' : String(patch[k]);
    if ('status' in out) out.status = TaskModel.validStatus(out.status);
    if ('priority' in out) out.priority = TaskModel.validPriority(out.priority);
    return out;
  },
  statusLabel(k) { return (TaskModel.COLS.find(c => c[0] === k) || [0, k])[1]; },
  /** not done and due before today (local date) */
  isOverdue(t, today = localISODate()) { return t.status !== 'done' && !!t.due && t.due < today; },

  /* ---------- queries ---------- */
  find(P, id) { return P.tasks.find(t => t.id === id) || null; },
  /** filter = { dept, who, q }; empty values match everything */
  filter(tasks, f = {}) {
    const q = (f.q || '').trim().toLowerCase();
    return tasks.filter(t => (!f.dept || t.dept === f.dept) && (!f.who || t.assignee === f.who) && (!q || (t.title + ' ' + t.notes).toLowerCase().includes(q)));
  },
  byStatus(tasks, status) { return tasks.filter(t => t.status === status); },
  summary(tasks, today = localISODate()) {
    const total = tasks.length, done = tasks.filter(t => t.status === 'done').length, overdue = tasks.filter(t => TaskModel.isOverdue(t, today)).length;
    return { total, done, overdue, pct: total ? done / total * 100 : 0 };
  },
  /** everyone who could be assigned: named people in the project plus anyone already assigned */
  assignees(P) { return [...new Set(P.people.filter(p => p.name).map(p => p.name).concat(P.tasks.map(t => t.assignee).filter(Boolean)))].sort(); },
  departments(P, base = []) { return [...new Set(base.concat(P.tasks.map(t => t.dept).filter(Boolean)))].sort(); },

  /* ---------- changes (mutate the project, return what changed) ---------- */
  add(P, title, status = 'todo', extra = {}) { const t = TaskModel.create(title, status, extra); P.tasks.push(t); return t; },
  update(P, id, patch) { const t = TaskModel.find(P, id); if (t) Object.assign(t, TaskModel.clean(patch)); return t; },
  remove(P, id) { const n = P.tasks.length; P.tasks = P.tasks.filter(t => t.id !== id); return P.tasks.length !== n; },
  setDone(P, id, done) { return TaskModel.update(P, id, { status: done ? 'done' : 'todo' }); },
  /** move a task to a column, placed before `beforeId` (or at the end) */
  move(P, id, status, beforeId = null) {
    const t = TaskModel.find(P, id); if (!t) return null;
    P.tasks = P.tasks.filter(x => x !== t); t.status = TaskModel.validStatus(status);
    const bi = beforeId ? P.tasks.findIndex(x => x.id === beforeId) : -1;
    if (bi >= 0) P.tasks.splice(bi, 0, t); else P.tasks.push(t);
    return t;
  },

  /* ---------- export ---------- */
  /** rows for CSV / print; sceneNum(id) turns a scene id into its number */
  table(tasks, sceneNum = () => '', { notes = true } = {}) {
    const head = ['Task', 'Status', 'Department', 'Assignee', 'Due', 'Priority', 'Scene'].concat(notes ? ['Notes'] : []);
    return [head, ...tasks.map(t => [t.title, TaskModel.statusLabel(t.status), t.dept, t.assignee, t.due, t.priority, sceneNum(t.sceneId)].concat(notes ? [t.notes] : []))];
  },
};

/* names the rest of the app already uses (overview, live desk, search, samples) */
const TASK_COLS = TaskModel.COLS;
const PRIORITIES = TaskModel.PRIORITIES;
const newTask = (title, status = 'todo') => TaskModel.create(title, status);
const taskOverdue = t => TaskModel.isOverdue(t);
