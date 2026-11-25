'use strict';
/* ===================================================================
   Regional standards — VIEW MODEL. The "Standards & formats" dialog
   (the chosen region and the fine-tune fields, a draft until Apply)
   and the top-bar switch. No DOM. See js/mvvm.js.
   =================================================================== */

class RegionVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   fallback() → the region new projects get;  applyTerms(P) → push the project's words into the app's labels
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ fallback: () => Prefs.region, applyTerms: P => applyTerms(P) }, opts.fx || {});
    const P = this.P;
    /** the region chosen in the dialog, and its fields ('' = the region's default); start = as the dialog opened */
    this.region = RegionModel.regionOf(P, this._fx.fallback());
    this.D = RegionModel.draft(P); this.start = { ...this.D };
  }
  /** the project's region now (not the dialog's choice) */
  get current() { return RegionModel.regionOf(this.P, this._fx.fallback()); }
  get def() { return RegionModel.REGIONS[this.region]; }
  get summary() { return RegionModel.summary(this.region); }

  /** pick US or UK in the dialog (redraws: the summary and placeholders follow) */
  setRegion(k) { if (!RegionModel.REGIONS[k]) return; this.region = k; this.notify(); }
  /** a fine-tune field (typing: no redraw) */
  set(k, v) { if (RegionModel.FIELDS.includes(k)) this.D[k] = v; }

  /** Apply the dialog → the region's short name */
  apply() { this.commit(P => RegionModel.applyDialog(P, this.region, this.D, this.start, this._fx.fallback())); this._fx.applyTerms(this.P); return this.def.short; }
  /** the top-bar switch → whether it changed anything */
  switchTo(k) {
    if (k === this.current || !RegionModel.REGIONS[k]) return false;
    this.commit(P => RegionModel.switchRegion(P, k, {}, this._fx.fallback())); this._fx.applyTerms(this.P); return true;
  }
}
