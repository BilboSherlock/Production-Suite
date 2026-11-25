'use strict';
/* ===================================================================
   Script breakdown — VIEW MODEL
   Scene list, the selected scene's details and tagged elements, the
   "who wears it" grid, and the element list across the script. No DOM.
   See js/mvvm.js.
   =================================================================== */

class BreakdownVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx:
   *   scenes(P) → the app's scenes (default getScenes);  sceneCast(P, scene) → [names]
   *   charNames(P) → every character name;  sceneTexts(P) → [{ id, text }] for finding mentions
   *   cats() → [{ k, label, color }] breakdown categories (default CATS);  minsPerPage(P)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      scenes: P => getScenes(P),
      sceneCast: (P, s) => [...sceneCast(P, s)],
      charNames: P => allCharNames(P),
      sceneTexts: P => sceneTexts(P),
      cats: () => CATS,
      minsPerPage: P => +(P.settings || {}).minsPerPage || 60,
    }, opts.fx || {});
  }

  /* ---------- UI state (kept on UI as before: bdMode, scene, bdFilter, bdOpen) ---------- */
  get mode() { return this._ui.bdMode === 'report' ? 'report' : 'scene'; }
  setMode(m) { this._ui.bdMode = m === 'report' ? 'report' : 'scene'; this.notify(); }
  get scenes() { return this._fx.scenes(this.P); }
  /** the selected scene (the first one when none or a deleted one is selected) */
  get scene() { const l = this.scenes; let s = l.find(x => x.id === this._ui.scene); if (!s && l.length) { s = l[0]; this._ui.scene = s.id; } return s || null; }
  selectScene(id) { this._ui.scene = id; this.notify(); }
  get cats() { return this._fx.cats(); }
  /** is a category's panel open? (open whenever it has something in it) */
  isOpen(cat, n) { return n > 0 || !!(this._ui.bdOpen || {})[cat]; }
  setOpen(cat, open) { (this._ui.bdOpen = this._ui.bdOpen || {})[cat] = open; }
  get filter() { return this._ui.bdFilter || 'all'; }
  setFilter(f) { this._ui.bdFilter = f; this.notify(); }

  /* ---------- what to show ---------- */
  /** the scene list with how many things are tagged in each */
  get sceneList() { const P = this.P, cur = this.scene; return this.scenes.map(s => ({ s, on: !!cur && s.id === cur.id, count: BreakdownModel.count(P, s.id) })); }
  get meta() { const s = this.scene; return s ? Object.assign({}, (this.P.sceneMeta || {})[s.id]) : {}; }
  get links() { return BreakdownModel.sceneLinks(this.P, this.scene.id); }
  get locations() { return this.P.locations || []; }
  /** the page-length guess shown when no shooting time is entered */
  get estGuess() { return Math.round(this.scene.eighths / 8 * this._fx.minsPerPage(this.P)); }
  get cast() { return this._fx.sceneCast(this.P, this.scene); }
  /** cast chips: the character, their actor, and the tag to remove when they were added by hand */
  get castChips() { const P = this.P, s = this.scene; return this.cast.map(name => ({ name, person: this.personFor(name), tag: BreakdownModel.castTag(P, s, name) })); }
  /** characters that could be added to this scene as non-speaking cast */
  get castToAdd() { const c = new Set(this.cast); return this._fx.charNames(this.P).filter(n => !c.has(n)); }
  personFor(name) { return (this.P.people || []).find(p => p.type === 'cast' && typeof normChar === 'function' && normChar(p.character) === name) || null; }
  get tags() { return BreakdownModel.tagsIn(this.P, this.scene.id); }
  /** script text split into plain and tagged runs */
  highlight(text) { return BreakdownModel.highlight(this.tags, text); }
  /** every category for the right-hand panel: its groups, what could be added, and the who-wears-it grid */
  get panels() {
    const P = this.P, s = this.scene, cast = this.cast;
    return this.cats.map(c => {
      const kind = BreakdownModel.kindOfCat(c.k), groups = BreakdownModel.groups(P, s.id, c.k), worn = c.k === 'wardrobe' || c.k === 'makeup';
      return { cat: c, kind, groups, open: this.isOpen(c.k, groups.length), addable: BreakdownModel.addable(P, s.id, c.k),
        grid: worn && groups.some(g => g.item) ? BreakdownModel.wearGrid(P, s.id, c.k, cast) : null };
    });
  }
  qtyIn(x) { return ItemsModel.qtyIn(x, this.scene.id); }
  /** elements of the same kind an element could be merged into */
  mergeTargets(x) { const P = this.P; return (P[BreakdownModel.kindOf(P, x)] || []).filter(o => o !== x); }
  /** matches for a selected phrase among existing props and wardrobe: [{ x, cat }] */
  suggestions(text) {
    const P = this.P, out = [];
    ['props', 'wardrobe'].forEach(kind => { const f = BreakdownModel.find(P, kind, text); (f.item ? [f.item] : f.candidates || []).forEach(x => out.push({ x, cat: kind })); });
    return out;
  }
  kindOf(x) { return BreakdownModel.kindOf(this.P, x); }
  get rows() { const f = this.filter, rows = BreakdownModel.elementRows(this.P, this.scenes, this.cats); return f === 'all' ? rows : rows.filter(r => r.cat.k === f); }
  get listHead() { return BreakdownModel.LIST_HEAD; }
  listCells(rows = this.rows) { return BreakdownModel.listCells(rows); }

  /** ask another screen to open (sets what that screen reads; the view navigates) */
  openItem(x) { const kind = this.kindOf(x); this._ui.itemTab = kind; this._ui.openItem = { kind, id: x.id }; }
  openPerson(p) { this._ui.peopleTab = 'cast'; this._ui.openPerson = p.id; }

  /* ---------- commands ---------- */
  _scene(fn, o) { const s = this.scene; return s ? this.commit(P => fn(P, s), o) : null; }
  /** typing: { quiet: true } */
  setMeta(k, v, o) { return this._scene((P, s) => BreakdownModel.setMeta(P, s.id, k, v), o); }
  linkLocation(id) { return this._scene((P, s) => BreakdownModel.linkLocation(P, s.id, id)); }
  /** → the new location */
  newLocation() { return this._scene((P, s) => BreakdownModel.newLocation(P, s.id, s.location || s.label)); }
  /** tag a phrase in this scene → { tag, item, created, candidates } */
  tag(cat, text, item) { return this._scene((P, s) => BreakdownModel.tag(P, s.id, cat, text, item ? { item } : {})); }
  /** tag a phrase in every scene that mentions it → { n, item } */
  tagAll(cat, text, item) { return this.commit(P => BreakdownModel.tagAll(P, cat, text, item || null, this._fx.sceneTexts(P))); }
  /** tag every mention of all the names an element goes by → scenes tagged */
  tagAllAliases(x, cat) { return this.commit(P => BreakdownModel.tagAllAliases(P, cat, x, this._fx.sceneTexts(P))); }
  addCast(name) { return this.tag('cast', String(name || '').toUpperCase()); }
  /** tag every speaking character as cast */
  autoCast() { return this._scene((P, s) => [...s.chars.keys()].map(c => BreakdownModel.tag(P, s.id, 'cast', c)).length); }
  untag(t) { return this.commit(P => BreakdownModel.untag(P, t)); }
  untagAll(tags) { return this.commit(P => tags.map(t => BreakdownModel.untag(P, t)).length); }
  removeFromScene(x) { return this._scene((P, s) => BreakdownModel.removeFromScene(P, x, s.id)); }
  removeElement(x) { return this.commit(P => BreakdownModel.removeElement(P, x)); }
  rename(x, name) { return this.commit(() => BreakdownModel.rename(x, name)); }
  /** merge x into keepId → the element kept */
  merge(x, keepId) { return this.commit(P => ItemsModel.merge(P, BreakdownModel.kindOf(P, x), keepId, [x.id])); }
  setQty(x, q) { return this._scene((P, s) => ItemsModel.setSceneQty(x, s.id, q)); }
  setWearer(x, name, on) { return this._scene((P, s) => BreakdownModel.setWearer(x, s.id, name, on)); }
  giveAll(items, name) { return this._scene((P, s) => BreakdownModel.giveAll(items, s.id, name)); }
}
