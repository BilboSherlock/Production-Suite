'use strict';
/* ===================================================================
   Props & Wardrobe — VIEW MODEL
   The Props / Wardrobe tabs (cards, table, by character), filters,
   merging and the item profile. No DOM. See js/mvvm.js.
   =================================================================== */

class ItemsVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx:
   *   scenes(P) → [{ id, num, label }] (default getScenes);  sceneCast(P, scene) → [names]
   *   charNames(P) → every character name;  untracked(P, kind) → older tags with no item;  linkTags(P, kind)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      scenes: P => getScenes(P),
      sceneCast: (P, s) => [...sceneCast(P, s)],
      charNames: P => allCharNames(P),
      untracked: (P, kind) => untrackedItems(P, kind),
      linkTags: (P, kind) => importItems(P, kind),
    }, opts.fx || {});
    this.view = this.uiState('items', { view: 'cards', filters: {} });
    /** items ticked in the table, for merging (not kept between visits) */
    this.picked = new Set();
  }

  /* ---------- UI state ---------- */
  /** the open tab; other screens set UI.itemTab to jump here */
  get kind() { return ItemsModel.kind(this._ui.itemTab); }
  setKind(k) { this._ui.itemTab = ItemsModel.kind(k); this.picked.clear(); this.notify(); }
  get cfg() { return ItemsModel.KINDS[this.kind]; }
  get isWardrobe() { return this.kind === 'wardrobe'; }
  get views() { return this.isWardrobe ? [['cards', 'Cards'], ['table', 'Table'], ['char', 'By character']] : [['cards', 'Cards'], ['table', 'Table']]; }
  get mode() { return this.views.some(v => v[0] === this.view.view) ? this.view.view : 'cards'; }
  setMode(view) { this.setUi('items', { view }); }
  get filter() { const f = this.view.filters; return f[this.kind] = f[this.kind] || { q: '', status: '', cat: '', scene: '', char: '' }; }
  setFilter(patch) { Object.assign(this.filter, patch); this.notify(); }
  togglePick(id, on) { on ? this.picked.add(id) : this.picked.delete(id); }
  /** an item another screen asked to open (UI.openItem), taken once */
  takePendingOpen() { const o = this._ui.openItem; if (!o || o.kind !== this.kind) return null; this._ui.openItem = null; return this.item(o.id); }

  /* ---------- what to show ---------- */
  get kinds() { return Object.values(ItemsModel.KINDS).map(k => ({ key: k.key, label: k.label, count: (this.P[k.key] || []).length })); }
  get all() { return this.P[this.kind] || []; }
  get visible() { return ItemsModel.filter(this.all, this.filter); }
  get summary() { return ItemsModel.summary(this.kind, this.all); }
  get scenes() { return this._fx.scenes(this.P); }
  sceneNum(id) { return (this.scenes.find(s => s.id === id) || {}).num; }
  get numOf() { const m = new Map(this.scenes.map(s => [s.id, s.num])); return id => m.get(id); }
  get charNames() { return this._fx.charNames(this.P); }
  get untracked() { return this._fx.untracked(this.P, this.kind); }
  get byCharacter() { return ItemsModel.byCharacter(this.all, this.charNames); }
  castFor(ch) { return (this.P.people || []).find(p => p.type === 'cast' && typeof normChar === 'function' && normChar(p.character) === ch) || null; }
  get people() { return [...new Set((this.P.people || []).map(p => p.name).filter(Boolean))]; }
  item(id) { return ItemsModel.find(this.P, this.kind, id); }
  aka(x) { return ItemsModel.aka(x); }
  allChars(x) { return ItemsModel.allChars(x); }
  charsIn(x, sid) { return ItemsModel.charsIn(x, sid); }
  qtyIn(x, sid) { return ItemsModel.qtyIn(x, sid); }
  setupOf(x, sid) { return ItemsModel.setupOf(x, sid); }
  get setups() { return ItemsModel.SETUPS; }
  get isStage() { return this.P.mode === 'stage'; }
  cost(x) { return ItemsModel.cost(x); }
  scenesText(x, sep) { return ItemsModel.scenesText(x, this.numOf, sep); }
  /** the profile's scene list: every scene, whether the item is in it, and who could wear it there */
  useRows(x) { return this.scenes.map(s => ({ s, on: x.sceneIds.includes(s.id), cast: [...new Set([...this._fx.sceneCast(this.P, s), ...ItemsModel.charsIn(x, s.id)])] })); }
  csvRows() { return ItemsModel.csvRows(this.kind, this.visible, this.numOf); }
  printRows(money) { return ItemsModel.printRows(this.kind, this.visible, this.numOf, money); }

  /* ---------- commands ---------- */
  _item(id, fn, o) { return this.commit(P => { const x = ItemsModel.find(P, this.kind, id); return x ? fn(x, P) : false; }, o); }
  add() { return this.commit(P => ItemsModel.add(P, this.kind)); }
  /** typing: { quiet: true } */
  update(id, k, v, o) { return this._item(id, x => ItemsModel.update(this.kind, x, k, v), o); }
  addAlias(id, text) { return this._item(id, x => ItemsModel.addAlias(x, text)); }
  removeAlias(id, a) { this._item(id, x => ItemsModel.removeAlias(x, a)); }
  setScene(id, sid, on) { this._item(id, x => ItemsModel.setScene(x, sid, on)); }
  setSceneQty(id, sid, q) { this._item(id, x => ItemsModel.setSceneQty(x, sid, q)); }
  setSetup(id, sid, v) { return this._item(id, x => ItemsModel.setSetup(x, sid, v)); }
  toggleWearer(id, sid, name) { this._item(id, x => ItemsModel.toggleWearer(x, sid, name)); }
  assignChar(id, ch) { const x = this.item(id); if (!x || !x.sceneIds.length) return false; return this._item(id, y => ItemsModel.assignChar(y, ch)); }
  unassignChar(id, ch) { this._item(id, x => ItemsModel.unassignChar(x, ch)); }
  addPhotos(id, urls) { if (urls.length) this._item(id, x => ItemsModel.addPhotos(x, urls)); }
  makeMain(id, i) { this._item(id, x => ItemsModel.makeMain(x, i)); }
  removePhoto(id, i) { this._item(id, x => ItemsModel.removePhoto(x, i)); }
  finish(id, wasNew) { return this.commit(P => ItemsModel.finish(P, this.kind, id, wasNew)); }
  duplicate(id) { return this.commit(P => ItemsModel.duplicate(P, this.kind, id)); }
  remove(id) { this.picked.delete(id); return this.commit(P => ItemsModel.remove(P, this.kind, id)); }
  /** merge items into keepId (the ticked ones when ids is omitted) */
  merge(keepId, ids = [...this.picked]) { const r = this.commit(P => ItemsModel.merge(P, this.kind, keepId, ids)); this.picked.clear(); this.notify(); return r; }
  get pickedItems() { return this.all.filter(x => this.picked.has(x.id)); }
  /** returns the total put on the budget (0 = no costs yet) */
  toBudget() { const tot = ItemsModel.total(this.all); return tot ? this.commit(P => ItemsModel.toBudget(P, this.kind)) : 0; }
  linkTags() { return this.commit(P => this._fx.linkTags(P, this.kind)); }
}
