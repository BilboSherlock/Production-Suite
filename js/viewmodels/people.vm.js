'use strict';
/* ===================================================================
   Cast & Crew — VIEW MODEL
   The Cast / Crew tabs (table or cards), search, adding and removing
   people, and the project version of the person profile. The Casting
   tab is its own screen (js/casting.js). No DOM. See js/mvvm.js.
   =================================================================== */

class PeopleVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx:
   *   scenes(P) → the app's scenes (default getScenes);  sceneCast(P, scene) → [names]
   *   characters(P) → [[name, lineCount]] from the script (default allCharacters)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      scenes: P => getScenes(P),
      sceneCast: (P, s) => [...sceneCast(P, s)],
      characters: P => [...allCharacters(P)],
    }, opts.fx || {});
    /** the search box (not kept between visits) */
    this.q = '';
  }

  /* ---------- UI state ---------- */
  get tab() { const t = this._ui.peopleTab; return t === 'crew' || t === 'casting' ? t : 'cast'; }
  setTab(t) { this._ui.peopleTab = t; this.notify(); }
  get mode() { return this._ui.peopleView === 'cards' ? 'cards' : 'table'; }
  setMode(m) { this._ui.peopleView = m; this.notify(); }
  setQuery(q) { this.q = q; this.notify(); }
  /** a person another screen asked to open (UI.openPerson), taken once */
  takePendingOpen() { const id = this._ui.openPerson; if (!id) return null; this._ui.openPerson = null; return this.person(id); }

  /* ---------- what to show ---------- */
  get counts() { return PeopleModel.counts(this.P); }
  get tabs() { const c = this.counts; return [['cast', `Cast (${c.cast})`], ['crew', `Crew (${c.crew})`], ['casting', `Casting (${c.casting} open)`]]; }
  get cols() { return PeopleModel.COLS[this.tab] || PeopleModel.COLS.cast; }
  get all() { return PeopleModel.ofType(this.P, this.tab); }
  get rows() { return PeopleModel.filter(this.all, this.q); }
  get emptyText() { return this.tab === 'cast' ? 'No cast yet. Add actors, or import the characters from your script.' : 'No crew yet. Add your team to include them on call sheets.'; }
  person(id) { return PeopleModel.find(this.P, id); }
  docs(p) { return { done: PeopleModel.docsDone(p), of: PeopleModel.DOC_LIST.length }; }
  subtitle(p) { return PeopleModel.subtitle(p); }
  sections(p) { return PeopleModel.sections(p); }
  /** scenes and shoot days the actor's character is in (null for crew or no character) */
  appearances(p) { const P = this.P; return PeopleModel.appearances(P, p, this._fx.scenes(P), s => this._fx.sceneCast(P, s)); }
  wardrobe(p) { return PeopleModel.wardrobe(this.P, p, this._fx.scenes(this.P)); }
  csvRows() { return PeopleModel.csvRows(this.tab, this.all); }
  printRows() { return PeopleModel.printRows(this.tab, this.all); }
  profileRows(p) { return PeopleModel.profileRows(p); }

  /* ---------- commands ---------- */
  _person(id, fn, o) { return this.commit(P => { const p = PeopleModel.find(P, id); return p ? fn(p, P) : false; }, o); }
  /** a new person on the open tab */
  add() { return this.commit(P => PeopleModel.add(P, this.tab === 'crew' ? 'crew' : 'cast')); }
  /** typing: { quiet: true }. → the stored value (character names in capitals), or false */
  update(id, k, v, o) { return this._person(id, p => PeopleModel.update(p, k, v), o); }
  setDoc(id, k, on) { return this._person(id, p => PeopleModel.setDoc(p, k, on)); }
  setPhoto(id, url) { return this._person(id, p => PeopleModel.update(p, 'photo', url || '')); }
  needsConfirm(p) { return !PeopleModel.isBlank(p); }
  remove(id) { return this.commit(P => PeopleModel.remove(P, id)); }
  /** → how many characters were added */
  addCharacters() { return this.commit(P => PeopleModel.addCharacters(P, this._fx.characters(P))); }
}
