'use strict';
/* ===================================================================
   Shot list — VIEW MODEL
   Which scene is shown, the tag filter, bulk selection for tagging,
   and every shot command. No DOM. See js/mvvm.js.
   =================================================================== */

class ShotsVM extends ViewModel {
  /** @param {object} [opts]  see ViewModel; plus opts.fx: scenes(P) → the app's scenes (default getScenes) */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ scenes: P => getScenes(P) }, opts.fx || {});
    /* the tag filter is kept on UI.shotTagF between visits: { ids: Set, all } */
    const F = this._ui.shotTagF; if (!F || !(F.ids instanceof Set)) this._ui.shotTagF = { ids: new Set(), all: !!(F && F.all) };
    /** bulk selection for tagging (not kept between visits) */
    this.selecting = false; this.picked = new Set();
  }

  /* ---------- UI state ---------- */
  get scenes() { return this._fx.scenes(this.P); }
  /** 'all' or a scene id (a deleted scene falls back to 'all') */
  get sceneId() { const id = this._ui.shotScene; return id && id !== 'all' && this.scenes.some(s => s.id === id) ? id : 'all'; }
  setScene(id) { this._ui.shotScene = id; this.notify(); }
  get filter() { return this._ui.shotTagF; }
  /** where "Add shot" goes: the scene shown, else the Breakdown's scene, else the first */
  get target() { const l = this.scenes, id = this.sceneId !== 'all' ? this.sceneId : this._ui.scene; return (l.find(s => s.id === id) || l[0] || {}).id; }
  setSelecting(on) { this.selecting = !!on; this.picked.clear(); this.notify(); }
  togglePick(id, on) { on ? this.picked.add(id) : this.picked.delete(id); this.notify(); }
  pickShown() { this.groups.forEach(g => g.shots.forEach(s => this.picked.add(s.id))); this.notify(); }
  clearPicks() { this.picked.clear(); this.notify(); }
  get pickedShots() { return ShotsModel.all(this.P).filter(s => this.picked.has(s.id)); }

  /* ---------- what to show ---------- */
  get opts() { return ShotsModel.OPTS; }
  get progress() { return ShotsModel.progress(ShotsModel.all(this.P)); }
  get groups() { return ShotsModel.groups(this.P, this.scenes, this.sceneId, this.filter); }
  /** the scene shown in the side panel with its director's notes (null when showing all) */
  get side() { const id = this.sceneId; if (id === 'all') return null; const sc = this.scenes.find(s => s.id === id); return { scene: sc, dirNotes: ((this.P.sceneMeta || {})[id] || {}).dirNotes || '' }; }
  label(s) { return ShotsModel.label(this.P, s, this.scenes); }
  frame(s) { return ShotsModel.frame(this.P, s); }
  csvRows() { return ShotsModel.csvRows(this.P, this.scenes, this.filter); }
  printRows() { return ShotsModel.printRows(this.P, this.scenes, this.sceneId, this.filter); }

  /* ---------- commands ---------- */
  _shot(id, fn, o) { return this.commit(P => { const s = ShotsModel.find(P, id); return s ? fn(s, P) : false; }, o); }
  /** → the new shot */
  add(sceneId = this.target) { return sceneId ? this.commit(P => ShotsModel.add(P, sceneId)) : null; }
  /** typing: { quiet: true } */
  update(id, k, v, o) { return this._shot(id, s => ShotsModel.update(s, k, v), o); }
  setDone(id, on) { return this._shot(id, s => ShotsModel.setDone(s, on)); }
  setRef(id, url) { return this._shot(id, s => ShotsModel.setRef(s, url)); }
  move(id, d) { return this.commit(P => ShotsModel.move(P, id, d)); }
  duplicate(id) { return this.commit(P => ShotsModel.duplicate(P, id)); }
  remove(id) { this.picked.delete(id); return this.commit(P => ShotsModel.remove(P, id)); }
  /** → how many were added */
  addMasters() { return this.commit(P => ShotsModel.addMasters(P, this.scenes)); }
  resetDone() { return this.commit(P => ShotsModel.resetDone(P)); }
  setDirNotes(v, o) { const id = this.sceneId; return id === 'all' ? false : this.commit(P => ShotsModel.setDirNotes(P, id, v), o); }
}
