'use strict';
/* ===================================================================
   Run of show — VIEW MODEL. The chosen shoot day, its timed rows,
   the finish time, building from the schedule and editing. No DOM.
   See js/mvvm.js.
   =================================================================== */

class RunOfShowVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   holder(P) → P.photo (made when missing);  scenes(P) → the setups;
   *   setupName(P, scene) → its name;  locOf(P, scene) → its location;  castOf(P, scene) → 'Ann, Bo';
   *   dayLabel(day, i) → 'Day 1 · 3 Mar';  time('HH:MM') → how a time is printed
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      holder: P => (P.photo = P.photo || blankPhoto()),
      scenes: P => getScenes(P),
      setupName: (P, s) => setupParts(P.blocks[s.idx] || {}).name || s.label,
      locOf: (P, s) => locName(P, s),
      castOf: (P, s) => [...sceneCast(P, s)].join(', '),
      time: t => fmtTime(t),
      dayLabel: (d, i) => `Day ${i + 1}${d.date ? ' · ' + fmtDateShort(d.date) : ''}`,
    }, opts.fx || {});
    this.u = this.uiState('ros', { day: this._ui.rosDay || '' });
  }

  /* ---------- what the view shows ---------- */
  get H() { return this._fx.holder(this.P); }
  get days() { return this.P.days || []; }
  /** the chosen day (the first when the remembered one is gone) */
  get day() { return this.days.find(d => d.id === this.u.day) || this.days[0] || null; }
  get dayIndex() { return this.days.indexOf(this.day); }
  get rows() { const d = this.day; return d ? RunModel.rows(this.H, d.id) : []; }
  get finish() { const d = this.day; return d ? RunModel.finish(this.rows, d.cs) : null; }
  get scenes() { return this._fx.scenes(this.P); }
  /** the day menu: [{ id, label }] */
  get dayOptions() { return this.days.map((d, i) => ({ id: d.id, label: `${this._fx.dayLabel(d, i)} (${d.sceneIds.length} setup${d.sceneIds.length === 1 ? '' : 's'})` })); }
  get title() { const d = this.day; return d ? `Run of show — ${this._fx.dayLabel(d, this.dayIndex)}` : 'Run of show'; }
  /** what the schedule says about the day, for building */
  facts(d = this.day) {
    const P = this.P, sc = this.scenes, H = this.H;
    return {
      call: (d.cs && (d.cs.shoot || d.cs.crew)) || '', crew: (d.cs && d.cs.crew) || '', mealHours: (P.settings || {}).mealHours,
      setups: d.sceneIds.map(id => sc.find(s => s.id === id)).filter(Boolean).map(s => ({ id: s.id, num: s.num, name: this._fx.setupName(P, s), loc: this._fx.locOf(P, s) || '', est: +((P.sceneMeta || {})[s.id] || {}).est || 60, shots: (H.shots || []).filter(x => x.sceneId === s.id).length })),
    };
  }
  printRows() { const P = this.P, sc = this.scenes; return RunModel.printRows(this.rows, id => { const s = sc.find(x => x.id === id); return s ? this._fx.castOf(P, s) : ''; }, this._fx.time); }

  /* ---------- the day (UI state: remembered, not saved) ---------- */
  setDay(id) { if (this.days.some(d => d.id === id)) { this._ui.rosDay = id; this.setUi('ros', { day: id }); } }

  /* ---------- commands ---------- */
  _rows() { return RunModel.ensure(this.H, this.day.id); }
  /** replace the day's rows with ones built from the schedule → how many rows */
  build() { const d = this.day; if (!d) return 0; return this.commit(() => { this.H.runs = this.H.runs || {}; this.H.runs[d.id] = RunModel.build(this.facts(d)); return this.H.runs[d.id].length; }); }
  add() { return this.day ? this.commit(() => RunModel.add(this._rows())) : null; }
  /** typing (title, notes) is quiet; times, type and setup redraw */
  set(id, k, v) { return this.day ? this.commit(() => RunModel.update(this._rows(), id, k, v), { quiet: k === 'title' || k === 'notes' }) : false; }
  moveUp(id) { return this.day ? this.commit(() => RunModel.moveUp(this._rows(), id)) : false; }
  remove(id) { return this.day ? this.commit(() => RunModel.remove(this._rows(), id)) : false; }
}
