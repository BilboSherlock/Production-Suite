'use strict';
/* ===================================================================
   Storyboard — VIEW MODEL
   The board's view (sequences / by scene / filmstrip), frames per row,
   the copied frame, and every board command. The drawing studio, the
   presenter and the video export stay in the view (they draw on canvas).
   No DOM. See js/mvvm.js.
   =================================================================== */

class BoardsVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx:
   *   scenes(P) → the app's scenes (default getScenes);  caption(P, scene) → a new frame's caption for a scene
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      scenes: P => getScenes(P),
      caption: (P, s) => { const blk = P.blocks.slice(s.idx + 1, s.end).find(x => x.type !== 'character' && x.type !== 'dialogue' && x.type !== 'paren' && x.text.trim()); return s.synopsis || (blk ? stripRich(blk.text).slice(0, 140) : s.label); },
    }, opts.fx || {});
    if (!this._ui.sbView) this._ui.sbView = BoardsModel.defaultView(this.P);
  }

  /* ---------- UI state (kept on UI: sbView, boardCols, sbFrame = the copied frame) ---------- */
  get view() { return ['seq', 'scene', 'strip'].includes(this._ui.sbView) ? this._ui.sbView : 'seq'; }
  setView(v) { this._ui.sbView = v; this.notify(); }
  get cols() { return +this._ui.boardCols || 3; }
  setCols(n) { this._ui.boardCols = Math.max(2, Math.min(6, +n || 3)); this.notify(); }
  get copied() { return this._ui.sbFrame || null; }
  copy(id) { const b = BoardsModel.find(this.P, id); if (!b) return false; this._ui.sbFrame = BoardsModel.clone(b); return true; }

  /* ---------- what to show ---------- */
  get scenes() { return this._fx.scenes(this.P); }
  get ar() { return BoardsModel.aspect(this.P); }
  get aspectKey() { return (this.P.settings || {}).aspect || '16:9'; }
  get aspects() { return Object.keys(BoardsModel.ASPECTS); }
  get frames() { return BoardsModel.frames(this.P); }
  get empty() { return !this.frames.length; }
  /** the groups for the sequence or scene view */
  get groups() { return this.view === 'scene' ? BoardsModel.sceneGroups(this.P, this.scenes) : BoardsModel.seqGroups(this.P); }
  get runtime() { return BoardsModel.runtime(this.frames); }
  frame(id) { return BoardsModel.find(this.P, id); }
  cornerLabel(b, i) { return BoardsModel.cornerLabel(this.P, b, i, this.scenes); }
  sceneOf(b) { return this.scenes.find(s => s.id === b.sceneId) || null; }
  seqOf(b) { return BoardsModel.seqs(this.P).find(s => s.id === b.seqId) || null; }
  shotLabelOf(b) { const sh = (this.P.shots || []).find(s => s.id === b.shotId); return sh ? ShotsModel.label(this.P, sh, this.scenes) : ''; }
  /** where a frame sits for drag & drop and paste: its sequence, or its scene in the scene view */
  groupOf(b) { return this.view === 'scene' ? { sceneId: b.sceneId || '' } : { seqId: b.seqId || '' }; }
  get printGroups() { return BoardsModel.printGroups(this.P, this.scenes, this.view); }

  /* ---------- commands ---------- */
  setAspect(k) { return this.commit(P => BoardsModel.setAspect(P, k)); }
  /** → the new frame */
  add(group) { return this.commit(P => BoardsModel.add(P, Object.assign({ dur: 3 }, group))); }
  addAfter(id) { return this.commit(P => { const b = BoardsModel.find(P, id); return b ? BoardsModel.addAfter(P, b) : null; }); }
  /** typing: { quiet: true } */
  setCaption(id, v, o) { return this.commit(P => { const b = BoardsModel.find(P, id); return b ? BoardsModel.setCaption(b, v) : false; }, o); }
  duplicate(id) { return this.commit(P => BoardsModel.duplicate(P, id)); }
  /** paste the copied frame after a frame (or at the end) → the pasted frame, or null with nothing copied */
  paste(afterId, group) { const src = this.copied; return src ? this.commit(P => BoardsModel.paste(P, src, afterId, group)) : null; }
  remove(id) { return this.commit(P => BoardsModel.remove(P, id)); }
  unlinkShot(id) { return this.commit(P => { const b = BoardsModel.find(P, id); return b ? BoardsModel.unlinkShot(b) : false; }); }
  freeFromScene(id) { return this.commit(P => { const b = BoardsModel.find(P, id); return b ? BoardsModel.freeFromScene(b) : false; }); }
  /** move earlier (-1) / later (+1) among the frames shown in its group */
  step(id, d, ids) { return this.commit(P => BoardsModel.step(P, id, d, ids)); }
  place(id, beforeId, group) { return this.commit(P => BoardsModel.place(P, id, beforeId, group)); }
  /** the drawing studio's result */
  save(id, out, makeShot) { return this.commit(P => BoardsModel.save(P, id, out, makeShot)); }
  shotFromFrame(id) { return this.commit(P => { const b = BoardsModel.find(P, id); return b ? BoardsModel.shotFromFrame(P, b) : null; }); }
  addSeq(name) { const s = this.commit(P => BoardsModel.addSeq(P, name), { quiet: true }); this.setView('seq'); return s; }
  updateSeq(id, k, v) { return this.commit(P => { const s = BoardsModel.seqs(P).find(x => x.id === id); return s ? BoardsModel.updateSeq(s, k, v) : false; }); }
  moveSeq(id, d) { return this.commit(P => BoardsModel.moveSeq(P, id, d)); }
  removeSeq(id) { return this.commit(P => BoardsModel.removeSeq(P, id)); }
  /** → how many frames were added */
  fromScript() { return this.commit(P => BoardsModel.fromScript(P, this.scenes, s => this._fx.caption(P, s))); }
  fromShots() { return this.commit(P => BoardsModel.fromShots(P)); }
  /** → { n, skipped } */
  shotsFromFrames() { return this.commit(P => BoardsModel.shotsFromFrames(P)); }
}
