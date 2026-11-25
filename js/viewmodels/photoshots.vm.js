'use strict';
/* ===================================================================
   Photo shot list — VIEW MODEL. List or status board, the filters
   (setup, status, hero, search, tags), which card is expanded, and
   every shot command. No DOM. See js/mvvm.js.
   =================================================================== */

class PhotoShotsVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   holder(P) → P.photo (made when missing);  scenes(P) → the setups;  tagNames(P, shot) → 'Hero, Detail'
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ holder: P => (P.photo = P.photo || blankPhoto()), scenes: P => getScenes(P), tagNames: (P, s) => ShotsModel.tagNames(P, s) }, opts.fx || {});
    this.f = this.uiState('phF', PhotoShotsModel.blankFilter());
    /* "Shots" on a setup card opens this list on that setup (asked once) */
    if (this._ui.phSetup) { this.f.setup = this._ui.phSetup; this._ui.phSetup = null; }
    /* the tag filter is shared with the film shot list: UI.shotTagF { ids: Set, all } */
    const T = this._ui.shotTagF; if (!T || !(T.ids instanceof Set)) this._ui.shotTagF = { ids: new Set(), all: !!(T && T.all) };
  }

  /* ---------- what the view shows ---------- */
  get H() { const H = this._fx.holder(this.P); H.shots = H.shots || []; return H; }
  get scenes() { return this._fx.scenes(this.P); }
  get view() { return this._ui.phView === 'board' ? 'board' : 'list'; }
  get filter() { return PhotoShotsModel.cleanFilter(this.f, this.scenes); }
  get tagFilter() { return this._ui.shotTagF; }
  get open() { return this._ui.phOpen || null; }
  _pass() { const T = this.tagFilter; return s => ShotsModel.passTags(s, T); }
  get visible() { return PhotoShotsModel.visible(this.H, this.filter, this._pass()); }
  get groups() { return PhotoShotsModel.groups(this.H, this.scenes, this.filter, this._pass()); }
  get board() { return PhotoShotsModel.board(this.H, this.filter, this._pass()); }
  get stats() { return PhotoShotsModel.stats(this.H, this.scenes); }
  get statsText() { return PhotoShotsModel.statsText(this.stats); }
  /** cast names to suggest for "Subject / talent" */
  get talent() { return (this.P.people || []).filter(p => p.type === 'cast').map(p => p.name || p.character).filter(Boolean); }
  label(s) { return PhotoShotsModel.label(this.H, s, this.scenes); }
  /** CSV: every column of the shots shown */
  csvRows() { return [PhotoShotsModel.HEAD, ...this._rows()]; }
  /** Print: without hair & makeup and notes */
  printTable() { return { head: PhotoShotsModel.forPrint(PhotoShotsModel.HEAD), rows: this._rows().map(PhotoShotsModel.forPrint) }; }
  _rows() { const P = this.P; return PhotoShotsModel.rows(this.H, this.scenes, this.visible, s => this._fx.tagNames(P, s)); }

  /* ---------- screen state (UI: remembered, not saved) ---------- */
  setView(v) { this._ui.phView = v === 'board' ? 'board' : 'list'; this.notify(); }
  setFilter(k, v) { if (!(k in this.f)) return; this.setUi('phF', { [k]: k === 'hero' ? !!v : String(v ?? '') }); }
  toggleOpen(id) { this._ui.phOpen = this.open === id ? null : id; this.notify(); }
  /** from a board card: the list, filtered to its setup, with the card expanded */
  reveal(id) { const s = PhotoShotsModel.find(this.H, id); if (!s) return; this._ui.phView = 'list'; this._ui.phOpen = id; this.setUi('phF', { setup: s.sceneId }); }

  /* ---------- commands ---------- */
  _shot(id, fn, o) { const s = PhotoShotsModel.find(this.H, id); return s ? this.commit(() => fn(s), o) : false; }
  add(sceneId, n = 1) { return this.scenes.some(s => s.id === sceneId) ? this.commit(() => PhotoShotsModel.add(this.H, sceneId, n)) : null; }
  /** typing is quiet; status, format, hero, must-have and the reference redraw */
  set(id, k, v) { return this._shot(id, s => PhotoShotsModel.update(s, k, v), { quiet: PhotoShotsModel.TEXT.includes(k) }); }
  setAll(sceneId, status) { return this.commit(() => PhotoShotsModel.setAll(this.H, sceneId, status)); }
  duplicate(id) { return this.commit(() => PhotoShotsModel.duplicate(this.H, id)); }
  remove(id) { if (this._ui.phOpen === id) this._ui.phOpen = null; return this.commit(() => PhotoShotsModel.remove(this.H, id)); }
}
