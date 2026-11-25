'use strict';
/* ===================================================================
   Releases & permits — VIEW MODEL. The checklist, its filter and
   totals, and generating it from the cast and locations. No DOM.
   See js/mvvm.js.
   =================================================================== */

class ReleasesVM extends ViewModel {
  /** @param {object} [opts]  see ViewModel; plus opts.fx: holder(P) → P.photo (made when missing);  today() → 'YYYY-MM-DD' */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ holder: P => (P.photo = P.photo || blankPhoto()), today: () => localISODate() }, opts.fx || {});
    this.f = this.uiState('releases', { filter: '' });
  }

  /* ---------- what the view shows ---------- */
  get H() { const H = this._fx.holder(this.P); H.releases = H.releases || []; return H; }
  get today() { return this._fx.today(); }
  get filter() { return ReleasesModel.FILTERS.some(x => x[0] === this.f.filter) ? this.f.filter : ''; }
  get rows() { return ReleasesModel.filter(this.H.releases, this.filter, this.today); }
  get stats() { return ReleasesModel.stats(this.H, this.today); }
  get total() { return this.H.releases.length; }
  get who() { return ReleasesModel.whoSuggestions(this.P); }
  expired(r) { return ReleasesModel.isExpired(r, this.today); }
  printRows() { return ReleasesModel.printRows(this.H); }
  setFilter(v) { this.setUi('releases', { filter: ReleasesModel.FILTERS.some(x => x[0] === v) ? v : '' }); }

  /* ---------- commands ---------- */
  add() { return this.commit(() => ReleasesModel.add(this.H)); }
  /** typing (who, notes) is quiet; type, status and dates redraw (totals, colours, the filter) */
  set(id, k, v) { const r = ReleasesModel.find(this.H, id); return r ? this.commit(() => ReleasesModel.update(r, k, v, this.today), { quiet: k === 'who' || k === 'notes' }) : false; }
  remove(id) { return this.commit(() => ReleasesModel.remove(this.H, id)); }
  /** → how many checklist items were added */
  generate() { return this.commit(P => ReleasesModel.generate(P, this.H, this.today)); }
}
