'use strict';
/* ===================================================================
   Schedule — VIEW MODEL
   The stripboard and calendar: what they show and what the user can do.
   No DOM. See js/mvvm.js.
   =================================================================== */

class ScheduleVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus app helpers, replaceable in tests:
   * @param {(P) => object[]} [opts.scenes]                 getScenes
   * @param {(P, s) => string} [opts.locName]               a scene's location name
   * @param {(P, d, scenes) => {mins:number, moves:number, cap:number, over:boolean}} [opts.dayPlan]
   * @param {(P, d, scenes) => string[]} [opts.conflicts]   cast unavailable, double-booked date
   * @param {(P, n) => string} [opts.turnaround]            short rest before day n (1-based)
   * @param {(P, s) => number} [opts.sceneEst]              estimated minutes for a scene
   * @param {(P, s) => Set<string>} [opts.sceneCast]
   * @param {() => string} [opts.today]                     YYYY-MM-DD
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = {
      scenes: opts.scenes || (P => getScenes(P)),
      locName: opts.locName || ((P, s) => locName(P, s)),
      dayPlan: opts.dayPlan || ((P, d, sc) => dayPlan(P, d, sc)),
      conflicts: opts.conflicts || ((P, d, sc) => dayConflicts(P, d, sc)),
      turnaround: opts.turnaround || ((P, n) => turnaroundWarn(P, n)),
      sceneEst: opts.sceneEst || ((P, s) => sceneEst(P, s)),
      sceneCast: opts.sceneCast || ((P, s) => sceneCast(P, s)),
      today: opts.today || (() => localISODate()),
    };
    this.view = this.uiState('schedule', { mode: 'board', month: '' });
    this._sc = null;
  }
  /* scenes are worked out from the script once per redraw */
  notify() { this._sc = null; super.notify(); }
  get scenes() { return this._sc || (this._sc = this._fx.scenes(this.P)); }
  get liveIds() { return new Set(this.scenes.map(s => s.id)); }

  /* ---------- UI state ---------- */
  get mode() { return this.view.mode === 'calendar' ? 'calendar' : 'board'; }
  setMode(mode) { this.setUi('schedule', { mode }); }
  get month() { return this.view.month || (this.view.month = ScheduleModel.firstMonth(this.P, this._fx.today())); }
  shiftMonth(n) { this.setUi('schedule', { month: ScheduleModel.shiftMonth(this.month, n) }); }
  thisMonth() { this.setUi('schedule', { month: this._fx.today().slice(0, 7) }); }

  /* ---------- what to show ---------- */
  get hasScenes() { return this.scenes.length > 0; }
  get isStage() { return this.P.mode === 'stage'; }
  get addLabel() { return this.isStage ? 'Rehearsal / show day' : 'Shoot day'; }
  get kinds() { return ScheduleModel.kindsFor(this.P); }
  get dayHours() { return this.P.settings.dayHours || 10; }
  get minsPerPage() { return this.P.settings.minsPerPage || 60; }
  get stats() { return ScheduleModel.stats(this.P, this.scenes); }
  get unscheduled() { return ScheduleModel.unscheduled(this.P, this.scenes); }
  /** the unscheduled pool: whole scenes and parts of split scenes not on any day */
  get pool() { return ScheduleModel.unscheduledSlots(this.P, this.scenes); }
  /** one strip on the board, from a slot (a whole scene, or one part of a split scene) */
  strip(slot) {
    const P = this.P, isSlot = !!slot.scene, s = isSlot ? slot.scene : slot, part = (isSlot && slot.part) || null, frac = (isSlot && slot.frac) || 1;
    return { id: isSlot ? slot.key : s.id, sceneId: s.id, num: s.num, part: part ? { n: part.n, of: part.of, note: part.note || '' } : null, label: (isSlot && slot.label) || '',
      cls: ScheduleModel.stripClass(s), ie: ScheduleModel.stripLabel(s),
      title: this._fx.locName(P, s) || s.label, sub: (part && part.note) || s.synopsis || [...this._fx.sceneCast(P, s)].slice(0, 5).join(', ') || s.heading,
      eighths: isSlot ? slot.eighths : s.eighths, mins: this._fx.sceneEst(P, s) * frac };
  }
  /** every day with everything its card shows */
  get days() {
    const P = this.P, sc = this.scenes;
    return P.days.map((d, i) => {
      const slots = ScheduleModel.slots(P, d, sc), list = slots.map(x => x.scene);
      return { id: d.id, n: i + 1, date: d.date, kind: d.kind || 'Shoot', slots, scenes: list, eighths: slots.reduce((a, x) => a + x.eighths, 0),
        locations: [...new Set(list.map(s => this._fx.locName(P, s)).filter(Boolean))],
        plan: this._fx.dayPlan(P, d, sc), turnaround: this._fx.turnaround(P, i + 1), conflicts: this._fx.conflicts(P, d, sc) };
    });
  }
  /** the month grid: each cell with the days booked on it */
  get calendar() {
    const P = this.P, sc = this.scenes, today = this._fx.today(), live = this.liveIds;
    const cells = ScheduleModel.calendarCells(this.month).map(c => Object.assign(c, { isToday: c.iso === today,
      days: P.days.map((d, i) => [d, i]).filter(([d]) => d.date === c.iso).map(([d, i]) => ({ id: d.id, n: i + 1, count: d.sceneIds.filter(id => live.has(id)).length, conflicts: this._fx.conflicts(P, d, sc) })) }));
    const [y, m] = this.month.split('-').map(Number);
    return { year: y, month: m, cells, undated: P.days.filter(d => !d.date).length };
  }
  /** suggested first date for auto-schedule: the day after the last one, or today */
  get autoStart() { return ScheduleModel.nextDate(this.P) || this._fx.today(); }
  /** the printed schedule: [{ day (null = unscheduled), rows: [[sc, I/E, D/N, location, synopsis, cast, eighths]] }]; parts print as "12 pt 1/2" */
  printGroups() {
    const P = this.P;
    const row = x => { const s = x.scene; return [x.label ? `${s.num} ${x.label}` : s.num, s.ioe, s.tod, this._fx.locName(P, s) || s.label, (x.part && x.part.note) || s.synopsis, [...this._fx.sceneCast(P, s)].join(', '), x.eighths]; };
    const out = this.days.map(d => ({ day: d, rows: d.slots.map(row) }));
    const un = this.pool; if (un.length) out.push({ day: null, rows: un.map(row) });
    return out;
  }
  /** a split scene's parts for the split dialog: sizes, notes and where each is booked */
  splitInfo(sceneId) {
    const P = this.P, s = this.scenes.find(x => x.id === sceneId); if (!s) return null;
    const bookings = ScheduleModel.partBookings(P, s);
    return { sceneId, num: s.num, title: this._fx.locName(P, s) || s.label, eighths: s.eighths, split: bookings.length > 0,
      parts: bookings.map(b => { const i = P.days.findIndex(d => d.id === b.dayId); return { id: b.part.id, n: b.part.n, eighths: b.part.eighths, note: b.part.note, dayN: i >= 0 ? i + 1 : null, date: i >= 0 ? P.days[i].date : '' }; }) };
  }

  /* ---------- commands ---------- */
  addDay(date) { return this.commit(P => date === undefined ? ScheduleModel.addDay(P) : ScheduleModel.addDay(P, date)); }
  removeDay(id) { return this.commit(P => ScheduleModel.removeDay(P, id)); }
  sortByDate() { return this.commit(P => ScheduleModel.sortByDate(P)); }
  setDayKind(id, kind) { return this.commit(P => ScheduleModel.updateDay(P, id, { kind })); }
  setDayDate(id, date) { return this.commit(P => ScheduleModel.updateDay(P, id, { date })); }
  setDayHours(h) { return this.commit(P => ScheduleModel.setDayHours(P, h)); }
  setMinsPerPage(m) { return this.commit(P => ScheduleModel.setMinsPerPage(P, m)); }
  /**
   * a strip (slot key) dropped on a day (dayId) or back on the unscheduled pool (null) at a visible position.
   * Returns false, changing nothing, when that day already has another part of the same scene.
   */
  dropSlot(key, dayId, index) {
    const [sid, pid] = ScheduleModel.parseKey(key), t = dayId && ScheduleModel.findDay(this.P, dayId);
    if (pid && t && t.parts && t.parts[sid] && t.parts[sid] !== pid) return false;
    const live = this.liveIds; return this.commit(P => ScheduleModel.moveSlot(P, key, dayId, index, live));
  }
  dropScene(sceneId, dayId, index) { return this.dropSlot(sceneId, dayId, index); }
  /** split a scene into parts of these sizes (eighths), or change its split; null if sizes are invalid */
  split(sceneId, sizes) {
    const s = this.scenes.find(x => x.id === sceneId);
    if (!s || !Array.isArray(sizes) || sizes.length < 2 || sizes.some(x => !(Math.round(+x) >= 1))) return null;   // refuse before recording a change
    return this.commit(P => ScheduleModel.setSplit(P, s, sizes));
  }
  /** put a split scene back together (on the first day that had a part) */
  merge(sceneId) { return this.commit(P => ScheduleModel.merge(P, sceneId)); }
  setPartNote(sceneId, partId, note) { return this.commit(P => ScheduleModel.setPartNote(P, sceneId, partId, note), { quiet: true }); }
  /** returns the number of days created (0 = nothing to schedule) */
  autoSchedule(opts) { if (!this.pool.length) return 0; const sc = this.scenes; return this.commit(P => ScheduleModel.autoSchedule(P, sc, opts, s => this._fx.locName(P, s))).length; }
}
