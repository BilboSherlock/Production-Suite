'use strict';
/* ===================================================================
   Global contacts — VIEW MODELS. No DOM. See js/mvvm.js.
   - ContactsVM:      the Contacts page (filter, search, add, delete, import, export)
   - ContactPickerVM: "Import from contacts" into a project's Cast & crew
   - ContactRolesVM:  the "Roles & credits" section of a contact's profile
   The contacts are not part of any project: a change is saved with
   Contacts.save() (the "store" these view models are given).
   =================================================================== */

/** what saves the contacts list */
const contactsStore = () => ({ touch() { Contacts.save(); } });

class ContactsVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel (store defaults to saving the contacts); plus opts.fx:
   *   list() → the contacts;  newPerson(kind) → a blank person;  parseCSV(text) → rows
   */
  constructor(opts = {}) {
    super(Object.assign({ project: () => null, store: contactsStore() }, opts));
    this._fx = Object.assign({ list: () => Contacts.list, newPerson: k => PeopleModel.newPerson(k), parseCSV: t => parseCSV(t) }, opts.fx || {});
    /** the search (not kept between visits) */
    this.q = '';
  }
  get list() { return this._fx.list(); }
  /** 'all' | 'cast' | 'crew' | 'both' */
  get tab() { const t = this._ui.ctTab; return ContactsModel.TABS.some(([k]) => k === t) ? t : 'all'; }
  get rows() { return ContactsModel.visible(this.list, this.tab, this.q); }
  get countText() { return `${this.rows.length} of ${this.list.length}`; }
  contact(id) { return this.list.find(c => c.id === id) || null; }
  exportJson() { return ContactsModel.exportJson(this.list); }

  setTab(t) { this._ui.ctTab = t; this.notify(); }
  setQuery(q) { this.q = String(q || '').toLowerCase(); this.notify(); }

  /** a new contact (saved) → it */
  add(kind) { return this.commit(() => { const c = ContactsModel.blank(kind, this._fx.newPerson); this.list.push(c); return c; }); }
  remove(id) { return this.commit(() => ContactsModel.remove(this.list, id)); }
  /** after the profile closes: tidy and save the edits made in it */
  edited(id) { const c = this.contact(id); this.commit(() => c && ContactsModel.normalize(c)); }
  /** a file's text → how many were added (throws on a file it cannot read) */
  importFile(name, text) {
    const f = this._fx;
    try { return /\.json$/i.test(name) ? ContactsModel.fromJson(this.list, JSON.parse(text), f.newPerson) : ContactsModel.fromCsv(this.list, f.parseCSV(text), f.newPerson); }
    finally { this._store.touch(); this.notify(); }   // anything read before a problem is kept
  }
}

class ContactPickerVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel (the project receives the imported people); plus opts.type
   *   ('cast' | 'crew' | '' — the first filter) and opts.fx: list() → the contacts
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ list: () => Contacts.list }, opts.fx || {});
    this.q = ''; this.filter = opts.type === 'cast' || opts.type === 'crew' ? opts.type : '';
    /** per contact: { kind, role } as chosen; and which are ticked */
    this.choice = new Map(); this.picked = new Set();
  }
  get list() { return this._fx.list(); }
  /** how a contact would come in: the chosen kind (the filter's, else their first) and position */
  pickOf(c) {
    let o = this.choice.get(c.id);
    if (!o) { const kind = this.filter && c.kinds.includes(this.filter) ? this.filter : c.kinds[0]; o = { kind, role: ContactsModel.positionFor(c, kind).role || '' }; this.choice.set(c.id, o); }
    return o;
  }
  /** the rows → [{ c, pick, have (already in the project as that kind), on }] */
  get rows() { return ContactsModel.pickable(this.list, this.filter, this.q).map(c => { const pick = this.pickOf(c); return { c, pick, have: ContactsModel.inProject(this.P, c, pick.kind), on: this.picked.has(c.id) }; }); }
  get countText() { return `${this.picked.size} selected`; }

  setQuery(q) { this.q = String(q || '').toLowerCase(); this.notify(); }
  setFilter(f) { this.filter = f; this.notify(); }
  toggle(id, on) { on ? this.picked.add(id) : this.picked.delete(id); this.notify(); }
  /** bring them in as cast or crew (unticks them, and takes that kind's position) */
  setKind(id, kind) { const c = this.list.find(x => x.id === id); if (!c) return; const o = this.pickOf(c); o.kind = kind; o.role = ContactsModel.positionFor(c, kind).role || ''; this.picked.delete(id); this.notify(); }
  /** typing the position: no redraw */
  setRole(id, v) { const c = this.list.find(x => x.id === id); if (c) this.pickOf(c).role = v; }
  /** copy the ticked contacts into the project → how many (0 when none are ticked) */
  importPicked() {
    if (!this.picked.size) return 0;
    return this.commit(P => { this.picked.forEach(id => { const c = this.list.find(x => x.id === id), pk = this.choice.get(id); if (c && pk) P.people.push(ContactsModel.personFrom(c, pk.kind, { role: pk.role })); }); return this.picked.size; });
  }
}

class ContactRolesVM extends ViewModel {
  /**
   * @param {object} opts  opts.contact — the contact being edited. Its edits are saved when the
   *   profile closes (the Contacts page does that), so the default store does nothing.
   */
  constructor(opts = {}) {
    super(Object.assign({ project: () => null, store: { touch() { } } }, opts));
    this.c = ContactsModel.normalize(opts.contact);
  }
  get kinds() { return this.c.kinds; }
  get positions() { return this.c.positions; }
  get credits() { return this.c.credits; }
  /** → false when it would leave neither cast nor crew */
  setKind(k, on) { return this.commit(() => ContactsModel.setKind(this.c, k, on)); }
  addPosition() { return this.commit(() => ContactsModel.addPosition(this.c)); }
  addCredit() { return this.commit(() => ContactsModel.addCredit(this.c)); }
  /** list 'positions' or 'credits'; typing and menus are quiet */
  setRow(list, id, k, v) { return this.commit(() => ContactsModel.setRow(this.c, list, id, k, v), { quiet: true }); }
  removeRow(list, id) { return this.commit(() => ContactsModel.removeRow(this.c, list, id)); }
}
