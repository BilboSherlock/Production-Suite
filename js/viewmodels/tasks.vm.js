'use strict';
/* ===================================================================
   Tasks — VIEW MODEL
   What the Tasks screen shows and what the user can do there.
   No DOM. See js/mvvm.js.
   =================================================================== */

class TasksVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus
   * @param {string[]} [opts.departments] standard department names (default: DEPTS)
   * @param {(P:object) => {id:string,num:string,label:string}[]} [opts.scenes] (default: getScenes)
   */
  constructor(opts = {}) {
    super(opts);
    this._depts = opts.departments || (typeof DEPTS !== 'undefined' ? DEPTS : []);
    this._scenes = opts.scenes || (P => getScenes(P));
    this.view = this.uiState('tasks', { mode: 'board', dept: '', who: '', q: '' });
  }

  /* ---------- UI state ---------- */
  get mode() { return this.view.mode === 'list' ? 'list' : 'board'; }
  setMode(mode) { this.setUi('tasks', { mode }); }
  get filter() { return { dept: this.view.dept, who: this.view.who, q: this.view.q }; }
  setFilter(patch) { this.setUi('tasks', patch); }

  /* ---------- what to show ---------- */
  get all() { return this.P.tasks; }
  get visible() { return TaskModel.filter(this.P.tasks, this.filter); }
  /** board columns: [{ key, label, tasks }] of the visible tasks */
  get columns() { const vis = this.visible; return TaskModel.COLS.map(([key, label]) => ({ key, label, tasks: TaskModel.byStatus(vis, key) })); }
  get summary() { return TaskModel.summary(this.P.tasks); }
  get assignees() { return TaskModel.assignees(this.P); }
  get departments() { return TaskModel.departments(this.P, this._depts); }
  get scenes() { return this._scenes(this.P); }
  get statuses() { return TaskModel.COLS; }
  get priorities() { return TaskModel.PRIORITIES; }
  find(id) { return TaskModel.find(this.P, id); }
  isOverdue(t) { return TaskModel.isOverdue(t); }
  statusLabel(k) { return TaskModel.statusLabel(k); }
  sceneNum(id) { if (!id) return ''; const s = this.scenes.find(x => x.id === id); return s ? s.num : ''; }

  /* ---------- commands ---------- */
  /** a new task in a column; it picks up the current department / person filter so it stays visible */
  add(title, status = 'todo') {
    title = (title || '').trim(); if (!title) return null;
    const f = this.filter;
    return this.commit(P => TaskModel.add(P, title, status, { dept: f.dept, assignee: f.who }));
  }
  /** change fields; quiet = save without redrawing (typing in a field) */
  update(id, patch, { quiet = false } = {}) { return this.commit(P => TaskModel.update(P, id, patch), { quiet }); }
  remove(id) { return this.commit(P => TaskModel.remove(P, id)); }
  setDone(id, done) { return this.commit(P => TaskModel.setDone(P, id, done)); }
  /**
   * drop a task into a column at a position among that column's *visible* tasks
   * (as the drag-and-drop zone reports it)
   */
  dropAt(id, status, index) {
    const ids = TaskModel.byStatus(this.visible, status).filter(t => t.id !== id).map(t => t.id);
    return this.commit(P => TaskModel.move(P, id, status, ids[index] || null));
  }

  /* ---------- export ---------- */
  csvRows() { return TaskModel.table(this.P.tasks, id => this.sceneNum(id)); }
  printRows() { return TaskModel.table(this.P.tasks, id => this.sceneNum(id), { notes: false }); }
  /** a task id another screen asked to open (search results), consumed once */
  takeOpenRequest() { const id = this._ui.openTask; this._ui.openTask = null; return id ? this.find(id) : null; }
}
