'use strict';
/* ===================================================================
   Script supervisor: lined script — VIEW MODEL. The slate and kind
   (on / off camera) new lines are drawn with, the script's pages, the
   coverage marks on each page, and the line commands. No DOM.
   The page layout is worked out once per visit: nothing on this screen
   changes the script, and undo or a live session redraw the whole
   screen anyway. See js/mvvm.js.
   =================================================================== */

class LinedVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   scenes(P);  paginate(P) → the script's pages (js/layout.js)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ scenes: P => getScenes(P), paginate: P => paginate(P) }, opts.fx || {});
    this._M = null;
  }

  /* ---------- what the view shows ---------- */
  get scenes() { return this._fx.scenes(this.P); }
  get hasShots() { return !!(this.P.shots || []).length; }
  /** the page layout (see LinedModel.layout) */
  get M() { return this._M || (this._M = LinedModel.layout(this.P, this._fx.paginate(this.P))); }
  get pageCount() { return this.M.pages.length; }
  /** the slate new lines are drawn for: the remembered one, else the first shot of the take log's scene, else the first shot */
  get shotId() {
    const shots = this.P.shots || [], ui = this._ui; if (shots.some(s => s.id === ui.lineShot)) return ui.lineShot;
    const sc = this.scenes, scene = sc.find(s => s.id === ui.takeScene) || sc[0], s = (scene && shots.find(x => x.sceneId === scene.id)) || shots[0];
    return s ? s.id : null;
  }
  /** 'on' (on camera, solid) or 'off' (off camera, squiggle) */
  get kind() { return this._ui.lineKind === 'off' ? 'off' : 'on'; }
  get shotChoices() { return LinedModel.shotChoices(this.P, this.scenes); }
  /** the lines that can be drawn, and their margin columns */
  get items() { return LinedModel.lines(this.P, this.M); }
  get countText() { const n = this.items.length; return `${n} coverage line${n === 1 ? '' : 's'}`; }
  /** the coverage marks on page k (see LinedModel.marks) */
  marks(k, items = this.items, cols = LinedModel.columns(items)) { return LinedModel.marks(this.P, this.M, k, items, cols, this.scenes); }
  /** the marks of every page → [[mark]] */
  allMarks() { const items = this.items, cols = LinedModel.columns(items); return this.M.pages.map((_, k) => this.marks(k, items, cols)); }
  blockAt(k, row) { return LinedModel.blockAt(this.M, k, row); }
  span(a, b, k) { return LinedModel.span(this.M, Math.min(a, b), Math.max(a, b), k); }
  /** the page a scene starts on → index or null */
  pageOfScene(id) { return LinedModel.pageOf(this.M, id); }

  /* ---------- screen state (UI: remembered, not saved) ---------- */
  setShot(id) { this._ui.lineShot = id; this.notify(); }
  setKind(k) { this._ui.lineKind = k === 'off' ? 'off' : 'on'; this.notify(); }
  /** new lines use the slate of this line */
  useSlate(lineId) { const l = LinedModel.find(this.P, lineId); if (l) this.setShot(l.shotId); }
  /** open the take log on this line's shot (the view swaps screens) */
  openTakes(lineId) { const l = LinedModel.find(this.P, lineId), s = l && (this.P.shots || []).find(x => x.id === l.shotId); if (s) this._ui.takeScene = s.sceneId; this._ui.takeTab = 'log'; }
  showLog() { this._ui.takeTab = 'log'; }

  /* ---------- lines ---------- */
  /** a line over script lines a…b (block indexes) with the current slate and kind */
  addLine(a, b) { const id = this.shotId; return id ? this.commit(P => LinedModel.add(P, id, a, b, this.kind)) : null; }
  toggleLine(id) { return this.commit(P => LinedModel.toggle(P, id)); }
  removeLine(id) { return this.commit(P => LinedModel.remove(P, id)); }
}
