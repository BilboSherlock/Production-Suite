'use strict';
/* ===================================================================
   Daily production report — VIEW MODEL
   Which day's report is open (UI.dprDay, also set from the address),
   everything on it, and the edits a user can make. No DOM.
   =================================================================== */

class DprVM extends ViewModel {
  /**
   * @param {object} [opts] see ViewModel; plus
   * @param {string} [opts.dayId] the day asked for in the address (#/p/…/dpr/<dayId>)
   * and app helpers, replaceable in tests: scenes(P), locOf(P, s), fmtEighths, fmtDateShort
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = {
      scenes: opts.scenes || (P => getScenes(P)),
      locOf: opts.locOf || ((P, s) => locName(P, s)),
      fmtEighths: opts.fmtEighths || (n => fmtEighths(n)),
      fmtDateShort: opts.fmtDateShort || (d => fmtDateShort(d)),
    };
    this._sc = null;
    if (opts.dayId) this._ui.dprDay = opts.dayId;
  }
  notify() { this._sc = null; super.notify(); }
  get scenes() { return this._sc || (this._sc = this._fx.scenes(this.P)); }

  /* ---------- which day ---------- */
  get hasDays() { return this.P.days.length > 0; }
  get day() { const P = this.P; return P.days.find(d => d.id === this._ui.dprDay) || P.days[0] || null; }
  get n() { return this.P.days.indexOf(this.day) + 1; }
  /** ✓ marks days that already have a report */
  get dayOptions() { const P = this.P, cur = this.day;
    return P.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1}${d.date ? ' — ' + this._fx.fmtDateShort(d.date) : ''}${DprModel.has(P, d.id) ? ' ✓' : ''}`, selected: d === cur })); }
  selectDay(id) { if (this.P.days.some(d => d.id === id)) { this._ui.dprDay = id; this.notify(); } }

  /* ---------- the report (reading never creates one) ---------- */
  get report() { return DprModel.read(this.P, this.day.id); }
  get heading() { return DprModel.heading(this.day, this.n, this.P.days.length); }
  get crewCall() { return DprModel.crewCall(this.report, this.day); }
  get hoursWorked() { return DprModel.fmtDur(DprModel.hoursWorked(this.report, this.day)); }
  get isPerformance() { return this.day.kind === 'Performance'; }
  get rows() { const P = this.P; return DprModel.rows(P, this.day, this.scenes, s => this._fx.locOf(P, s)); }
  /** today's and to-date totals, as shown in the four boxes */
  get totals() {
    const P = this.P, e = this._fx.fmtEighths, d = DprModel.dayTotals(P, this.day, this.scenes), t = DprModel.toDate(P, this.n - 1, this.scenes);
    return { day: d, toDate: t, behind: t.diff < 0,
      toDateText: `${e(t.shot)} / ${e(t.sched)}${t.diff ? (t.diff < 0 ? ` · behind ${e(-t.diff)}` : ` · ahead ${e(t.diff)}`) : ' · on schedule'}` };
  }
  get csv() {
    const P = this.P, e = this._fx.fmtEighths;
    return { name: `${slugOf(P.title)}-dpr-day${this.n}.csv`,
      rows: [['Scene', 'Description', 'Scheduled pgs', 'Status', 'Pgs shot (eighths)', 'Setups', 'Notes'], ...this.rows.map(r => [r.num, r.place, e(r.sched), r.row.status || '', r.row.pgs || '', r.row.setups || '', r.row.notes || ''])] };
  }

  /* ---------- commands ---------- */
  /** typing: saved without redrawing */
  setField(key, v) { const id = this.day.id; return this.commit(P => DprModel.setField(P, id, key, v), { quiet: true }); }
  setPerf(key, v) { const id = this.day.id; return this.commit(P => DprModel.setPerf(P, id, key, v), { quiet: true }); }
  setScene(sid, key, v) { const id = this.day.id; return this.commit(P => DprModel.setScene(P, id, sid, key, v), { quiet: true }); }
  /** times: crew call and wrap change the hours worked, so those redraw */
  setTime(key, v) { const id = this.day.id; return this.commit(P => DprModel.setTime(P, id, key, v), { quiet: !['crew', 'wrap'].includes(key) }); }
  /** fill from the shot list; returns how many scenes were filled */
  autoFill() { const day = this.day, sc = this.scenes; return this.commit(P => DprModel.autoFill(P, day, sc)); }
}
