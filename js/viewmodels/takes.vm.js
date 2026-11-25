'use strict';
/* ===================================================================
   Script supervisor: take log — VIEW MODEL. Which tab (take log or
   lined script) and scene are shown, the scene list, each shot's
   takes, and every take command. Typing into a take is quiet. No DOM.
   See js/mvvm.js.
   =================================================================== */

class TakesVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):  scenes(P)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ scenes: P => getScenes(P) }, opts.fx || {});
  }

  /* ---------- what the view shows ---------- */
  get scenes() { return this._fx.scenes(this.P); }
  /** 'log' or 'lined' */
  get tab() { return this._ui.takeTab === 'lined' ? 'lined' : 'log'; }
  /** the scene shown (the remembered one, else the first) */
  get scene() { const sc = this.scenes; return sc.find(s => s.id === this._ui.takeScene) || sc[0] || null; }
  get totalsText() { return TakesModel.totalsText(this.P); }
  /** the scene list → [{ scene, on, text }] */
  get sceneList() { const cur = this.scene; return this.scenes.map(s => ({ scene: s, on: !!cur && s.id === cur.id, text: TakesModel.sceneText(this.P, s.id) })); }
  /** the shown scene's shots → [{ shot, takes, circled, slate }] */
  get shots() { const s = this.scene, sc = this.scenes; return s ? TakesModel.shotsOf(this.P, s.id).map(x => ({ ...x, slate: ShotsModel.label(this.P, x.shot, sc) })) : []; }
  csvRows() { return TakesModel.csvRows(this.P, this.scenes); }
  /** see TakesModel.report → { headers, rows } or null */
  report(kind) { return TakesModel.report(this.P, this.scenes, kind); }

  /* ---------- screen state (UI: remembered, not saved) ---------- */
  setScene(id) { this._ui.takeScene = id; this.notify(); }
  /** switch between the take log and the lined script (the view swaps screens, so no redraw) */
  setTab(t) { this._ui.takeTab = t === 'lined' ? 'lined' : 'log'; }
  /** the Shot list opens on this scene */
  showShots(sceneId) { this._ui.shotScene = sceneId; }

  /* ---------- takes ---------- */
  addTake(shotId) { return this.commit(P => TakesModel.add(P, shotId)); }
  /** the take number and text fields: quiet (the field already shows it) */
  setTake(id, k, v) { return this.commit(P => TakesModel.set(P, id, k, v), { quiet: true }); }
  /** → the shot newly marked as shot by circling a take, else null */
  setStatus(id, v) { return this.commit(P => TakesModel.setStatus(P, id, v)); }
  removeTake(id) { return this.commit(P => TakesModel.remove(P, id)); }
}
