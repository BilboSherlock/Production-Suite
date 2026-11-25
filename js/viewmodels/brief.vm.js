'use strict';
/* ===================================================================
   Shoot brief — VIEW MODEL. The brief's fields, its deliverables and
   approvers tables, the shoot window and the printed brief. No DOM.
   See js/mvvm.js.
   =================================================================== */

class BriefVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   holder(P) → P.photo (made when missing);  fmtDate('YYYY-MM-DD') → '3 Mar';  esc(text) → HTML-safe text
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ holder: P => (P.photo = P.photo || blankPhoto()), fmtDate: d => fmtDateShort(d), esc: t => esc(t) }, opts.fx || {});
  }

  /* ---------- what the view shows ---------- */
  get B() { return BriefModel.ensure(this._fx.holder(this.P)); }
  rows(t) { return this.B[t] || []; }
  /** "3 days scheduled from 3 Mar", or a nudge to the schedule */
  get windowText() {
    const w = BriefModel.shootWindow(this.P.days);
    return w.days ? `${w.days} day${w.days > 1 ? 's' : ''} scheduled${w.from ? ' from ' + this._fx.fmtDate(w.from) : ''}` : 'No shoot days yet — add them in Schedule.';
  }
  printHtml() { return BriefModel.printHtml(this.P.title, this.B, this._fx.esc); }

  /* ---------- commands: typing is quiet; adding, removing and sign-off redraw ---------- */
  set(k, v) { return this.commit(() => BriefModel.set(this.B, k, v), { quiet: true }); }
  addRow(t) { return this.commit(() => BriefModel.addRow(this.B, t)); }
  setCell(t, id, k, v) { const col = (BriefModel.table(t) || { cols: [] }).cols.find(c => c[0] === k); return this.commit(() => BriefModel.setCell(this.B, t, id, k, v), { quiet: !(col && col[2] && col[2].select) }); }
  removeRow(t, id) { return this.commit(() => BriefModel.removeRow(this.B, t, id)); }
}
