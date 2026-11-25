'use strict';
/* ===================================================================
   Corkboard — VIEW MODEL. The cards, the colour filter, the structure
   overlay, and adding, deleting and reordering scenes. No DOM.
   See js/mvvm.js.
   =================================================================== */

class CardsVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   scenes(P);  paginate(P) → { count, blockPage };  shotCount(P, sceneId);  sceneDataCount(P, id);
   *   moveScene(P, src, tgt, after) → whether it moved;  purge(P) → clears data left by deleted scenes
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      scenes: P => getScenes(P), paginate: P => paginate(P), shotCount: (P, id) => P.shots.filter(x => x.sceneId === id).length,
      sceneDataCount: (P, id) => sceneDataCount(P, id), moveScene: (P, s, t, a) => moveSceneBlocks(P, s, t, a), purge: P => purgeOrphans(P),
    }, opts.fx || {});
  }

  /* ---------- UI state (UI.cardColor: the colour filter, '' for all) ---------- */
  get color() { const c = this._ui.cardColor; return CardsModel.COLORS.includes(c) ? c : ''; }
  setColorFilter(c) { this._ui.cardColor = CardsModel.COLORS.includes(c) ? c : ''; this.notify(); }
  get colors() { return CardsModel.COLORS; }
  get structures() { return CardsModel.STRUCTURES; }
  get structureKey() { return (this.P.settings || {}).structure || ''; }
  get scenes() { return this._fx.scenes(this.P); }
  scene(id) { return this.scenes.find(s => s.id === id) || null; }

  /** everything the board shows, worked out once per redraw */
  get board() {
    const P = this.P, scenes = this.scenes, pg = this._fx.paginate(P), total = pg.count, struct = CardsModel.structure(P);
    const rows = CardsModel.rows(scenes, this.color).map(r => {
      if (!r.scene) return r;
      const s = r.scene, sp = CardsModel.span(pg.blockPage, s), b = ScriptModel.find(P, s.id);
      return { scene: s, heading: b ? b.text : '', synopsis: (P.sceneMeta && P.sceneMeta[s.id] || {}).synopsis || '', pages: CardsModel.pages(sp), beats: CardsModel.beatsIn(struct, total, sp), shots: this._fx.shotCount(P, s.id) };
    });
    return { total, struct, track: CardsModel.track(struct, total, scenes, pg.blockPage), rows, empty: !scenes.length };
  }

  /* ---------- commands ---------- */
  setStructure(k) { return this.commit(P => CardsModel.setStructure(P, k)); }
  /** typing: quiet → the heading as stored (capitals) */
  setHeading(id, v) { return this.commit(P => CardsModel.setHeading(P, id, v), { quiet: true }); }
  setSynopsis(id, v) { return this.commit(P => CardsModel.setSynopsis(P, id, v), { quiet: true }); }
  setColor(id, c) { return this.commit(P => CardsModel.setColor(P, id, c)); }
  /** a new scene after scene `afterId` (or at the end) → the new heading line */
  addScene(afterId) { const s = afterId && this.scene(afterId); return this.commit(P => CardsModel.addScene(P, s ? s.end : null)); }
  /** linked shots, tags… a deletion would remove */
  linkedCount(id) { return this._fx.sceneDataCount(this.P, id); }
  removeScene(id) { const s = this.scene(id); if (!s) return false; return this.commit(P => { CardsModel.removeScene(P, s); this._fx.purge(P); return true; }); }
  /** drag a card: put scene `src` before / after scene `tgt` → whether it moved */
  moveScene(src, tgt, after) { if (!this._fx.moveScene(this.P, src, tgt, after)) return false; this._store.touch(); this.notify(); return true; }
}
