'use strict';
/* ===================================================================
   Setups & looks — VIEW MODEL (photo shoots). The setup cards, adding,
   moving, duplicating and deleting setups, their fields, talent and
   colour labels. No DOM. See js/mvvm.js.
   =================================================================== */

class SetupsVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   scenes(P) → the setups;  cast(P, scene) → Set of talent;  norm(text) → a talent's key;
   *   tag(P, sceneId, 'cast', text) / untag(P, tag) → breakdown tags;  linked(P, id) → shots, tags… a setup has
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      scenes: P => getScenes(P), cast: (P, s) => sceneCast(P, s), norm: t => normChar(t),
      tag: (P, id, cat, text) => BreakdownModel.tag(P, id, cat, text), untag: (P, t) => BreakdownModel.untag(P, t),
      linked: (P, id) => sceneDataCount(P, id),
    }, opts.fx || {});
    /* older projects may have setups without a notes line: add them once, quietly */
    if (this.P && SetupsModel.ensureNotes(this.P, this.scenes)) this._store.touch();
  }

  /* ---------- what the view shows ---------- */
  get scenes() { return this._fx.scenes(this.P); }
  scene(id) { return this.scenes.find(s => s.id === id) || null; }
  /** one entry per setup: the card fields plus its talent and who could be added */
  get cards() {
    const P = this.P;
    return this.scenes.map(s => { const cast = [...this._fx.cast(P, s)]; return Object.assign(SetupsModel.card(P, s), { cast, talentChoices: SetupsModel.talentChoices(P, cast, this._fx.norm) }); });
  }
  get locations() { return (this.P.locations || []).map(l => l.name).filter(Boolean); }
  printRows() { return SetupsModel.printRows(this.P, this.scenes); }
  /** how much other data points at a setup (for the delete warning) */
  linked(id) { return this._fx.linked(this.P, id); }
  /** remember which setup to open in Shots or the Breakdown */
  openIn(view, id) { if (view === 'photoshots') this._ui.phSetup = id; else if (view === 'breakdown') this._ui.scene = id; }

  /* ---------- commands ---------- */
  /** add a setup after the one with id `afterId` (default: the end) → the heading */
  add(afterId) { return this.commit(P => { const sc = this.scenes, i = sc.findIndex(s => s.id === afterId); return SetupsModel.add(P, sc, i < 0 ? null : i); }); }
  move(id, d) { const sc = this.scenes, i = sc.findIndex(s => s.id === id); return i < 0 ? false : this.commit(P => SetupsModel.move(P, sc, i, d)); }
  duplicate(id) { const s = this.scene(id); return s ? this.commit(P => SetupsModel.duplicate(P, s)) : null; }
  remove(id) { const s = this.scene(id); return s ? this.commit(P => SetupsModel.remove(P, s)) : false; }
  /** typing is quiet: name, location, time, estimate, concept and notes */
  setPart(id, k, v) { const s = this.scene(id); return s ? this.commit(P => SetupsModel.setPart(P, s, k, v), { quiet: true }) : false; }
  setEst(id, v) { return this.scene(id) ? this.commit(P => SetupsModel.setEst(P, id, v), { quiet: true }) : false; }
  setSynopsis(id, v) { return this.scene(id) ? this.commit(P => SetupsModel.setSynopsis(P, id, v), { quiet: true }) : false; }
  setNotes(id, v) { const s = this.scene(id); return s ? this.commit(P => SetupsModel.setNotes(P, s, v), { quiet: true }) : false; }
  setColor(id, c) { return this.scene(id) ? this.commit(P => SetupsModel.setColor(P, id, c)) : false; }
  addTalent(id, text) { return text && this.scene(id) ? this.commit(P => !!this._fx.tag(P, id, 'cast', text)) : false; }
  /** → false when the talent comes from the notes text rather than a tag (nothing to remove) */
  removeTalent(id, name) {
    const P = this.P, t = (P.tags || []).find(z => z.sceneId === id && z.cat === 'cast' && this._fx.norm(z.text) === name);
    return t ? this.commit(P => { this._fx.untag(P, t); return true; }) : false;
  }
}
