'use strict';
/* ===================================================================
   Lookbook — VIEW MODEL. The board list, the selected board and its
   tiles. No DOM. See js/mvvm.js.
   =================================================================== */

class LookbookVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx:
   *   scenes(P);  charNames(P) → every character;  newSlide(kind, o) → a pitch-deck slide (default PitchModel.newSlide)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ scenes: P => getScenes(P), charNames: P => allCharNames(P), newSlide: (k, o) => PitchModel.newSlide(k, o) }, opts.fx || {});
  }

  /* ---------- UI state (UI.lbBoard: the selected board) ---------- */
  get boards() { return LookbookModel.boards(this.P); }
  get board() { const l = this.boards; let b = l.find(x => x.id === this._ui.lbBoard); if (!b && l.length) { b = l[0]; this._ui.lbBoard = b.id; } return b || null; }
  select(id) { this._ui.lbBoard = id; this.notify(); }
  get list() { const cur = this.board; return this.boards.map(b => ({ b, on: b === cur, cover: LookbookModel.cover(b), count: b.tiles.length })); }

  /* ---------- commands ---------- */
  _board(fn, o) { const b = this.board; return b ? this.commit(P => fn(b, P), o) : null; }
  /** the selected board, or a new "Look" board when there is none */
  _target(P) { return this.board || this._new(P, 'Look'); }
  _new(P, name) { const b = LookbookModel.addBoard(P, name); this._ui.lbBoard = b.id; return b; }
  /** → the new board, selected */
  addBoard(name) { return this.commit(P => this._new(P, name || LookbookModel.nextName(P))); }
  /** → how many boards were added */
  boardsForCharacters() { return this.commit(P => LookbookModel.addBoards(P, this._fx.charNames(P))); }
  boardsForLocations() { return this.commit(P => LookbookModel.addBoards(P, LookbookModel.locationNames(P, this._fx.scenes(P)))); }
  /** typing: { quiet: true } — the name also shows in the list, so it redraws */
  updateBoard(k, v, o) { return this._board(b => LookbookModel.updateBoard(b, k, v), o); }
  removeBoard() { const b = this.board; if (!b) return false; this._ui.lbBoard = null; return this.commit(P => LookbookModel.removeBoard(P, b.id)); }
  /** add a tile to the selected board (making one if needed) → the tile */
  addTile(kind, o) { return this.commit(P => LookbookModel.addTile(this._target(P), kind, o)); }
  /** image data URLs → how many added */
  addImages(urls) { return urls.length ? this.commit(P => { const b = this._target(P); urls.forEach(img => LookbookModel.addTile(b, 'image', { img })); return urls.length; }) : 0; }
  updateTile(id, k, v, o) { return this._board(b => { const t = LookbookModel.findTile(b, id); return t ? LookbookModel.updateTile(t, k, v) : false; }, o); }
  moveTile(id, d) { return this._board(b => LookbookModel.moveTile(b, id, d)); }
  removeTile(id) { return this._board(b => LookbookModel.removeTile(b, id)); }
  /** add the board's images to the pitch deck as a gallery slide → the gallery, or null when there are no images */
  toPitch() {
    const b = this.board, g = b && LookbookModel.pitchGallery(b); if (!g) return null;
    this.commit(P => { P.pitch = P.pitch || {}; (P.pitch.slides = P.pitch.slides || []).push(this._fx.newSlide('gallery', g)); }, { quiet: true });
    return g;
  }
}
