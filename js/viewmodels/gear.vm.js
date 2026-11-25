'use strict';
/* ===================================================================
   Gear & rentals — VIEW MODEL (photo shoots and podcasts). The kit list
   by category, its search and status filter, costs, reports and the
   budget link. No DOM. See js/mvvm.js.
   =================================================================== */

class GearVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   holder(P) → the object whose .gear is the list (P.photo or P.podcast, created when missing);  nDays(P) → shoot days
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      holder: P => P.mode === 'podcast' ? (P.podcast = P.podcast || {}) : (P.photo = P.photo || blankPhoto()),
      nDays: P => (P.days || []).length,
    }, opts.fx || {});
    this.f = this.uiState('gear', { q: '', status: '' });
  }

  /* ---------- what the view shows ---------- */
  get H() { const H = this._fx.holder(this.P); H.gear = H.gear || []; return H; }
  get kind() { return GearModel.kind(this.P.mode); }
  get gear() { return this.H.gear; }
  get nDays() { return this._fx.nDays(this.P); }
  get groups() { return GearModel.groups(this.gear, this.kind.cats, this.f.q, this.f.status); }
  get stats() { return GearModel.stats(this.H, this.nDays); }
  get sources() { return GearModel.sources(this.H); }
  cost(g) { return GearModel.cost(g, this.nDays); }
  packRows() { return GearModel.packRows(this.H, this.kind.cats); }
  rentals() { return GearModel.rentals(this.H, this.nDays); }
  csv() { return GearModel.csv(this.H, this.nDays); }

  /* ---------- filters (UI.gear: remembered, not saved) ---------- */
  setSearch(q) { this.setUi('gear', { q: String(q || '') }); }
  setStatusFilter(s) { this.setUi('gear', { status: this.kind.statuses.includes(s) ? s : '' }); }

  /* ---------- commands ---------- */
  add(cat) { return this.kind.cats.includes(cat) ? this.commit(() => GearModel.add(this.H, cat)) : null; }
  /** typing in the table is quiet; a new status redraws */
  set(id, k, v) { const g = GearModel.find(this.H, id); if (!g || (k === 'status' && !this.kind.statuses.includes(v))) return false; return this.commit(() => GearModel.update(g, k, v), { quiet: k !== 'status' }); }
  duplicate(id) { return this.commit(() => GearModel.duplicate(this.H, id)); }
  remove(id) { return this.commit(() => GearModel.remove(this.H, id)); }
  addStarter() { return this.commit(P => GearModel.addKit(this.H, GearModel.starter(P.mode))); }
  /** budget lines for items with a day rate → how many (0: nothing has a rate) */
  toBudget() { return this.gear.some(g => (+g.rate || 0) > 0) ? this.commit(P => GearModel.syncBudget(P, this.H, this.kind.budget, this.nDays, this.kind.fallback)) : 0; }
}
