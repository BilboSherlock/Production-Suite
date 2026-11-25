'use strict';
/* ===================================================================
   Blocking & cues — VIEW MODEL. Which tab and plan are shown, the
   selected item, every blocking, frame and cue command, and the
   calling script. Dragging moves an item without saving until it is
   dropped. No DOM. See js/mvvm.js.
   =================================================================== */

class StageVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   scenes(P);  charsOf(P) → names in the script;  plain(text) → text without formatting
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ scenes: P => getScenes(P), charsOf: P => [...allCharacters(P).keys()], plain: t => stripRich(t) }, opts.fx || {});
    /** the selected item on the plan (not kept between visits) */
    this.sel = null;
  }

  /* ---------- what the view shows ---------- */
  get isPhoto() { return this.P.mode === 'photo'; }
  /** 'blocking', 'cues' or 'calling' (a photo shoot only has diagrams) */
  get tab() { const t = this._ui.stageTab; return this.isPhoto || !['cues', 'calling'].includes(t) ? 'blocking' : t; }
  get scenes() { return this._fx.scenes(this.P); }
  get plans() { return StageModel.plans(this.P); }
  /** the plan shown (the remembered one, else the first) */
  get plan() { return StageModel.findPlan(this.P, this._ui.planId) || this.plans[0] || null; }
  get frame() { return this.plan ? StageModel.frame(this.plan) : null; }
  get item() { const p = this.plan; return (p && p.items.find(i => i.id === this.sel)) || null; }
  get kinds() { return StageModel.kindsFor(this.P.mode); }
  posOf(id) { return StageModel.posOf(this.plan, id); }
  posText(pos) { return StageModel.posText(this.plan, pos); }
  get cues() { return StageModel.cues(this.P); }
  get lead() { return Math.max(1, +this._ui.standbyLead || 3); }
  calling() { return StageModel.calling(this.P, this.scenes, this.lead, this._fx.plain); }
  pinChoices(id) { const c = this.cues.find(x => x.id === id); return c ? { cue: c, lines: StageModel.pinChoices(this.P, c, this.scenes), current: StageModel.anchor(this.P, c, this.scenes, this._fx.plain) } : null; }
  csvRows() { return StageModel.csvRows(this.P, this.scenes); }
  printRows() { return StageModel.printRows(this.P, this.scenes); }

  /* ---------- screen state (UI: remembered, not saved) ---------- */
  setTab(t) { this._ui.stageTab = t; this.notify(); }
  openPlan(id) { this._ui.planId = id; this.sel = null; this.notify(); }
  select(id) { this.sel = id; this.notify(); }
  setLead(n) { this._ui.standbyLead = +n || 3; this.notify(); }

  /* ---------- plans ---------- */
  _plan(fn, o) { const p = this.plan; return p ? this.commit(() => fn(p), o) : false; }
  addPlan() { const p = this.commit(P => StageModel.addPlan(P)); this._ui.planId = p.id; this.sel = null; this.notify(); return p; }
  removePlan() { const p = this.plan; if (!p) return false; this.sel = null; const r = this.commit(P => StageModel.removePlan(P, p.id)); const n = this.plans[0]; this._ui.planId = n && n.id; this.notify(); return r; }
  setPlan(k, v) { return this._plan(p => StageModel.setPlan(p, k, v)); }

  /* ---------- items ---------- */
  addItem(kind, label) { const it = this._plan(p => StageModel.addItem(p, kind, label)); if (it) { this.sel = it.id; this.notify(); } return it; }
  /** actors for the plan's scene (or the whole script) → how many were added */
  addActors() { const p = this.plan; if (!p) return 0; const sc = this.scenes.find(s => s.id === p.sceneId), names = sc ? [...sc.chars.keys()] : this._fx.charsOf(this.P); return this.commit(() => StageModel.addActors(p, names)); }
  setItem(id, k, v) { return this._plan(p => StageModel.setItem(p, id, k, v)); }
  removeItem(id) { if (this.sel === id) this.sel = null; return this._plan(p => StageModel.removeItem(p, id)); }
  rotate(id, deg) { return this._plan(p => StageModel.rotate(p, id, deg)); }
  /** while dragging: move without saving or redrawing → the position */
  dragTo(id, x, y) { return this.plan ? StageModel.moveItem(this.plan, id, x, y) : null; }
  /** the drop: save */
  drop() { this._store.touch(); }

  /* ---------- frames ---------- */
  addFrame() { return this._plan(p => StageModel.addFrame(p)); }
  removeFrame(i) { return this._plan(p => StageModel.removeFrame(p, i)); }
  /** move to a frame (remembered on the plan, as before, without counting as an edit) */
  goFrame(i) { const p = this.plan; if (!p) return 0; const r = StageModel.goFrame(p, i); this.notify(); return r; }
  /** the frame's name redraws the list; its notes are quiet */
  setFrame(k, v) { return this._plan(p => StageModel.setFrame(p, k, v), { quiet: k === 'notes' }); }

  /* ---------- cues ---------- */
  addCue() { return this.commit(P => StageModel.addCue(P, this.scenes)); }
  /** typing is quiet; the type and scene menus too (nothing else depends on them) */
  setCue(id, k, v) { return this.commit(P => StageModel.setCue(P, id, k, v), { quiet: true }); }
  moveCue(id, d) { return this.commit(P => StageModel.moveCue(P, id, d)); }
  removeCue(id) { return this.commit(P => StageModel.removeCue(P, id)); }
  importCues() { return this.commit(P => StageModel.importCues(P)); }
  pin(id, blockId) { return this.commit(P => StageModel.pin(P, id, blockId, this._fx.plain)); }
  unpin(id) { return this.commit(P => StageModel.unpin(P, id)); }
}
