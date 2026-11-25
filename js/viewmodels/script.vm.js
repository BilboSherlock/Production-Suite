'use strict';
/* ===================================================================
   Script — VIEW MODEL. The editor's commands, its own undo / redo
   history (typing is grouped into one step after a pause), the line
   being written, the outline and the toolbar state. No DOM.
   Commands that move the cursor return where it goes: { id, caret }.
   See js/mvvm.js.
   =================================================================== */

class ScriptVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   later(fn, ms) / cancel(t)  timers for grouping typing into undo steps;
   *   scenes(P);  sceneDataCount(P, id) → linked shots, tags… a scene has;  moveScene(P, src, tgt, after);
   *   characters(P) → names, most used first;  locations(P);  snapshot(P, name, auto) → a saved draft;
   *   lockPages(P) / unlockPages(P);  warn(message)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      later: (fn, ms) => setTimeout(fn, ms), cancel: t => clearTimeout(t),
      scenes: P => getScenes(P), sceneDataCount: (P, id) => sceneDataCount(P, id), moveScene: (P, s, t, a) => moveSceneBlocks(P, s, t, a),
      characters: P => { const n = [...allCharacters(P)].sort((a, c) => c[1] - a[1]).map(x => x[0]); P.people.forEach(x => { if (x.type === 'cast' && x.character) n.push(x.character.toUpperCase()); }); return n; },
      locations: P => { const s = new Set(getScenes(P).map(x => x.location.toUpperCase()).filter(Boolean)); (P.locations || []).forEach(l => l.name && s.add(l.name.toUpperCase())); return [...s]; },
      snapshot: (P, name, auto) => takeSnapshot(P, name, auto), lockPages: P => lockPages(P), unlockPages: P => unlockPages(P),
      warn: m => toast(m, true),
    }, opts.fx || {});
    this.cur = null;             // the line being written
    this.navMode = 'scenes';     // the outline: 'scenes' or 'notes'
    this.hist = { s: [ScriptModel.snap(this.P)], i: 0 };
    this._pend = null;
    /** called when undo / redo availability changes (the view greys its buttons) */
    this.onHistory = null;
  }
  dispose() { this.flush(); super.dispose(); }

  /* ---------- what the view shows ---------- */
  get mode() { return this.P.mode; }
  get blocks() { return this.P.blocks; }
  get types() { return ScriptModel.typesOf(this.mode); }
  get defType() { return ScriptModel.defType(this.mode); }
  /** a line (null once the project has closed, e.g. a blur on the way to the home page) */
  block(id) { return this.P ? ScriptModel.find(this.P, id) : null; }
  index(id) { return ScriptModel.index(this.P, id); }
  get current() { return this.block(this.cur); }
  get canUndo() { return this.hist.i > 0; }
  get canRedo() { return this.hist.i < this.hist.s.length - 1; }
  get currentRev() { return ScriptModel.currentRev(this.P); }
  get revisions() { return this.P.revisions || []; }
  get numbersShown() { return ScriptModel.numbersShown(this.P); }
  get settings() { return this.P.settings; }
  get scenes() { return this._fx.scenes(this.P); }
  get omitted() { return ScriptModel.omitted(this.P); }
  get notes() { return ScriptModel.notes(this.P); }
  get stats() { return ScriptModel.stats(this.P); }
  get hasRevMarks() { return this.blocks.some(b => b.rev); }
  get nextRevColor() { return ScriptModel.nextRevColor(this.P); }
  /** the line now being written (no redraw) */
  focus(id) { this.cur = id; }
  /** the scene the cursor is in; remembered so other screens open on it */
  sceneAt(id = this.cur) { const h = ScriptModel.sceneOf(this.P, id); if (h) this._ui.scene = h.id; return h ? h.id : null; }
  setNavMode(k) { this.navMode = k === 'notes' ? 'notes' : 'scenes'; this.notify(); }
  suggest(id, v, pos) { const b = this.block(id); return b ? ScriptModel.suggest(this.mode, b.type, v, pos, b.type === 'character' ? { characters: this._fx.characters(this.P) } : b.type === 'scene' ? { locations: this._fx.locations(this.P) } : {}) : null; }
  acceptSuggestion(v, s, item) { return ScriptModel.acceptSuggestion(v, s, item); }
  markText(v, s, e, mark) { return ScriptModel.toggleMark(v, s, e, mark); }
  findAll(q) { return ScriptModel.findAll(this.P, q); }
  readQueue(fromId) { return ScriptModel.readQueue(this.P, Math.max(0, this.index(fromId))); }
  titleFields() { return ScriptModel.titleFields(this.mode); }
  meta(k) { return ScriptModel.metaOf(this.P, k); }

  /* ---------- undo history ---------- */
  _push() {
    this._pend = null;
    const s = ScriptModel.snap(this.P), H = this.hist; if (s === H.s[H.i]) return;
    H.s = H.s.slice(0, H.i + 1); H.s.push(s); if (H.s.length > 250) H.s.shift(); H.i = H.s.length - 1;
    if (this.onHistory) this.onHistory();
  }
  /** record a step now, or (typing) once the writer pauses */
  _record(now) { if (this._pend != null) this._fx.cancel(this._pend); this._pend = null; if (now) this._push(); else this._pend = this._fx.later(() => this._push(), 700); }
  /** record any typing still waiting for its pause */
  flush() { if (this._pend != null) { this._fx.cancel(this._pend); this._push(); } }
  /** a change that is its own undo step, and redraws */
  _step(fn) { this.flush(); const r = this.commit(fn); this._record(true); return r; }
  _go(id) { this.hist.s[this.hist.i] && ScriptModel.restore(this.P, this.hist.s[this.hist.i]); this._store.touch(); this.notify(); if (this.onHistory) this.onHistory(); return this.block(id) ? id : (this.blocks[0] || {}).id; }
  /** → the line to put the cursor in, or null */
  undo() { this.flush(); if (!this.canUndo) return null; this.hist.i--; return this._go(this.cur); }
  redo() { this.flush(); if (!this.canRedo) return null; this.hist.i++; return this._go(this.cur); }
  /** a line that went had linked scene data: say so */
  _lost(b) {
    if (!b || b.type !== 'scene') return;
    const n = this._fx.sceneDataCount(this.P, b.id);
    if (n) this._fx.warn(`That scene had ${n} linked item${n > 1 ? 's' : ''} (shots, tags, frames, schedule). Ctrl+Z restores it; otherwise clean up from the Backup menu.`);
  }

  /* ---------- writing ---------- */
  /** typing into a line (quiet: the field already shows it) → the line as stored (its type may have changed) */
  input(id, v) { const b = this.block(id); if (!b) return null; this.commit(P => ScriptModel.type(P, b, v), { quiet: true }); this._record(false); return b; }
  /** leaving a parenthetical closes its brackets → the new text, or null */
  finishParen(id, v) { const b = this.block(id); if (!b || b.type !== 'paren') return null; const f = ScriptModel.finishParen(v); if (f === v) return null; this.commit(() => { b.text = f; }, { quiet: true }); this._record(false); return f; }
  setType(id, t) { const b = this.block(id); if (!b || b.type === t) return false; if (b.type === 'scene') this._lost(b); return this._step(P => ScriptModel.setType(P, b, t)); }
  cycleType(id, dir) { const b = this.block(id); return b ? this.setType(id, ScriptModel.cycleType(this.mode, b.type, dir)) : false; }
  /** Enter, with the line's text and selection */
  split(id, v, s, e) { const b = this.block(id); if (!b) return null; if (!v.trim() && b.type === 'scene') this._lost(b); return this._step(P => ScriptModel.split(P, b, v, s, e)); }
  lineAfter(id) { const b = this.block(id); return b ? this._step(P => ScriptModel.lineAfter(P, b)) : null; }
  backspace(id, v) { const b = this.block(id); if (!b) return null; this.flush(); const r = this.commit(P => ScriptModel.backspace(P, b, v), { quiet: true }); if (r) { this._lost(r.lost || (r.retyped === 'scene' ? b : null)); this.notify(); } this._record(true); return r; }
  del(id, v) { const b = this.block(id); if (!b) return null; this.flush(); const r = this.commit(P => ScriptModel.del(P, b, v), { quiet: true }); if (r) { this._lost(r.lost); this.notify(); this._record(true); } return r; }
  addScene() { return this._step(P => ScriptModel.addScene(P)); }
  /** paste parsed lines at [s, e) of a line → { id, caret, count } */
  paste(id, v, s, e, parsed) { const b = this.block(id); return b && parsed.length ? this._step(P => ScriptModel.paste(P, b, v, s, e, parsed)) : null; }
  /** → true / false (now dual or not), or null when it is not a character line */
  toggleDual(id) { const b = this.block(id); if (!b || b.type !== 'character') return null; return this._step(P => ScriptModel.toggleDual(P, b)); }
  setNote(id, v) { const b = this.block(id); return b ? this._step(() => ScriptModel.setNote(b, v)) : false; }
  /** → 'omitted', 'restored', or null (the cursor is not in a scene) */
  toggleOmit(id = this.cur) { if (!ScriptModel.sceneOf(this.P, id)) return null; return this._step(P => ScriptModel.toggleOmit(P, id)); }
  restoreScene(id) { return this._step(P => ScriptModel.restoreScene(P, id)); }
  moveScene(src, tgt, after) { this.flush(); if (!this._fx.moveScene(this.P, src, tgt, after)) return false; this._store.touch(); this.notify(); this._record(true); return true; }
  /** → how many were replaced */
  replaceAll(q, r) { return q ? this._step(P => ScriptModel.replaceAll(P, q, r)) : 0; }

  /* ---------- settings, numbers, revisions ---------- */
  zoom(d) { return this.commit(P => ScriptModel.zoom(P, d), { quiet: true }); }
  toggleNumbers() { return this.commit(P => (P.settings.sceneNumbers = !P.settings.sceneNumbers)); }
  setMulticam(on) { return this.commit(P => (P.settings.multicam = !!on)); }
  /** title page typing: quiet */
  setMeta(k, v) { return this.commit(P => ScriptModel.setMeta(P, k, v), { quiet: true }); }
  lockNumbers() { return this._step(P => ScriptModel.lockNumbers(P)); }
  unlockNumbers() { return this._step(P => ScriptModel.unlockNumbers(P)); }
  /** locked numbers: number any new scenes (quiet; called while redrawing) → whether any were numbered */
  renumber() { return this.settings.sceneNumLock ? this.commit(P => ScriptModel.assignNumbers(P), { quiet: true }) : false; }
  startRevision(k, date) { return this.commit(P => ScriptModel.startRevision(P, k, date)); }
  track(id) { return this.commit(P => ScriptModel.track(P, id)); }
  stopTracking() { return this.track(''); }
  clearMarks() { return this._step(P => ScriptModel.clearMarks(P)); }
  lockPages() { this.flush(); this._fx.snapshot(this.P, 'Before locking pages', true); return this._step(P => this._fx.lockPages(P)); }
  unlockPages() { return this._step(P => this._fx.unlockPages(P)); }

  /* ---------- drafts and import ---------- */
  saveDraft(name) { this.flush(); return this.commit(P => { const sn = this._fx.snapshot(P, name, false); sn.auto = false; return sn; }); }
  deleteDraft(sn) { return this.commit(P => { P.snapshots = (P.snapshots || []).filter(x => x !== sn); return true; }); }
  restoreDraft(sn) { this.flush(); this._fx.snapshot(this.P, `Before restoring “${sn.name}”`, true); return this._step(P => { ScriptModel.restore(P, sn.data); return true; }); }
  /** res: { meta, blocks, keepNumbers } → how many lines came in */
  importScript(res, replace) { this.flush(); this._fx.snapshot(this.P, replace ? 'Before replacing with import' : 'Before adding import', true); return this._step(P => ScriptModel.applyImport(P, res, replace)); }
}
