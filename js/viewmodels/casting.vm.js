'use strict';
/* ===================================================================
   Casting — VIEW MODEL
   The role list, the selected role and its candidates. No DOM.
   See js/mvvm.js.
   =================================================================== */

class CastingVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx:
   *   characters(P) → [[name, lineCount]] from the script (default allCharacters)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ characters: P => [...allCharacters(P)] }, opts.fx || {});
  }

  /* ---------- UI state (UI.castRole: the selected role; search can set it) ---------- */
  get roles() { return CastingModel.roles(this.P); }
  /** the selected role (the first one when none or a deleted one is selected) */
  get role() { const l = this.roles; let r = l.find(x => x.id === this._ui.castRole); if (!r && l.length) { r = l[0]; this._ui.castRole = r.id; } return r || null; }
  select(id) { this._ui.castRole = id; this.notify(); }

  /* ---------- what to show ---------- */
  get progress() { return CastingModel.progress(this.P); }
  get roleList() { const cur = this.role; return this.roles.map(r => ({ r, on: r === cur, state: CastingModel.state(r) })); }
  castOf(r) { return CastingModel.castOf(r); }
  statusChoices(r, c) { return CastingModel.statusChoices(r, c); }
  get sheet() { return { head: CastingModel.SHEET_HEAD, rows: CastingModel.sheetRows(this.P) }; }

  /* ---------- commands ---------- */
  _role(fn, o) { const r = this.role; return r ? this.commit(P => fn(r, P), o) : null; }
  _cand(id, fn, o) { return this._role(r => { const c = CastingModel.findCand(r, id); return c ? fn(c, r) : false; }, o); }
  /** a new role, selected → the role */
  addRole() { const r = this.commit(P => CastingModel.addRole(P), { quiet: true }); this.select(r.id); return r; }
  /** → how many roles were added */
  rolesFromScript() { return this.commit(P => CastingModel.rolesFromScript(P, this._fx.characters(P))); }
  /** typing: { quiet: true } */
  updateRole(k, v, o) { return this._role(r => CastingModel.updateRole(r, k, v), o); }
  removeRole() { const r = this.role; if (!r) return false; this._ui.castRole = null; return this.commit(P => CastingModel.removeRole(P, r.id)); }
  /** → the new candidate */
  addCandidate() { return this._role(r => CastingModel.addCandidate(r)); }
  updateCandidate(id, k, v, o) { return this._cand(id, c => CastingModel.updateCandidate(c, k, v), o); }
  rate(id, n) { return this._cand(id, c => CastingModel.rate(c, n)); }
  setStatus(id, s) { return this._cand(id, (c, r) => CastingModel.setStatus(r, c, s)); }
  removeCandidate(id) { return this._role(r => CastingModel.removeCandidate(r, id)); }
  /** cast a candidate in the selected role → the Cast & Crew person */
  cast(id) { return this._cand(id, (c, r) => CastingModel.cast(this.P, r, c)); }
  reopen() { return this._role(r => CastingModel.reopen(r)); }
}
