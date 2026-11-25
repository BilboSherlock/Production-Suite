'use strict';
/* ===================================================================
   Search (Ctrl+K) — VIEW MODEL. What was typed, the results, the
   highlighted row, and going to a result. The index is built once
   when the search opens. No DOM. See js/mvvm.js.
   =================================================================== */

class SearchVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   scenes(P);  chars(P) → character names;  date(iso) → short date;  catLabel(cat);  key(word) → singular
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      scenes: P => getScenes(P), chars: P => allCharNames(P), date: d => fmtDateShort(d), catLabel: c => CATMAP[c].label, key: w => BreakdownModel.key(w),
    }, opts.fx || {});
    this.items = SearchModel.index(this.P, this._fx);
    this.q = ''; this.sel = 0;
    this._results = SearchModel.rank(this.items, '', this._fx.key);
  }
  /** the matches for what was typed */
  get results() { return this._results; }

  /** typing: new results, the first one highlighted */
  setQuery(q) { this.q = String(q || ''); this._results = SearchModel.rank(this.items, this.q, this._fx.key); this.sel = 0; this.notify(); }
  /** highlight a row (arrow keys: d = ±1; the mouse: n) */
  move(d) { this.select(this.sel + d); }
  select(n) { const s = Math.max(0, Math.min(this._results.length - 1, n)); if (s === this.sel) return; this.sel = s; this.notify(); }
  /**
   * Go to a result (default: the highlighted one): remembers what it picks in the screen state → the section
   * to open (e.g. 'people' or 'callsheet/<day>'), or null when there is no such result
   */
  go(n = this.sel) { const r = this._results[n]; if (!r) return null; Object.assign(this._ui, r.to.ui); return r.to.view; }
}
