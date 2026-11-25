'use strict';
/* ===================================================================
   Locations — VIEW MODEL. The location cards. No DOM. See js/mvvm.js.
   =================================================================== */

class LocationsVM extends ViewModel {
  /** @param {object} [opts]  see ViewModel; plus opts.fx: scenes(P) → the app's scenes (default getScenes) */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ scenes: P => getScenes(P) }, opts.fx || {});
  }
  get permits() { return LocationsModel.PERMITS; }
  get scenes() { return this._fx.scenes(this.P); }
  /** each location with the scene numbers that use it */
  get cards() { const P = this.P, sc = this.scenes; return LocationsModel.list(P).map(l => ({ l, used: LocationsModel.usedIn(P, l, sc) })); }
  needsConfirm(l) { return LocationsModel.needsConfirm(l); }

  /* ---------- commands ---------- */
  /** → the new location */
  add() { return this.commit(P => LocationsModel.add(P)); }
  /** typing: { quiet: true } (the name re-counts the scenes it's used in, so it redraws) */
  update(id, k, v, o) { return this.commit(P => { const l = LocationsModel.find(P, id); return l ? LocationsModel.update(l, k, v) : false; }, o); }
  remove(id) { return this.commit(P => LocationsModel.remove(P, id)); }
  /** → how many were added */
  fromScript() { return this.commit(P => LocationsModel.fromScript(P, this.scenes)); }
}
