'use strict';
/* ===================================================================
   Pitch deck — VIEW MODEL. The slide list, the selected slide and its
   editor, the theme, and building a deck from the project. No DOM.
   See js/mvvm.js.
   =================================================================== */

class PitchVM extends ViewModel {
  /** @param {object} [opts]  see ViewModel; plus opts.fx: facts(P) → what the one-click deck is built from (see PitchModel.build) */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({ facts: P => PitchVM.facts(P) }, opts.fx || {});
  }
  /** what the one-click deck is built from, gathered from across the app */
  static facts(P) {
    const sc = getScenes(P), m = P.meta || {}, total = finCalc(P).total;
    return { title: P.title, credit: m.credit, author: m.author, logline: m.logline, contact: m.contact, synopses: sc.map(s => [s.num, s.synopsis]),
      roles: (P.casting || {}).roles || [], characters: [...allCharacters(P)], crew: (P.people || []).filter(p => p.type === 'crew'),
      budget: total ? money(total) : '', days: (P.days || []).length, pages: scriptStats(P).pages, scenes: sc.length };
  }

  /* ---------- UI state (UI.slideId: the selected slide) ---------- */
  get slides() { return PitchModel.slides(this.P); }
  get slide() { const l = this.slides; let s = l.find(x => x.id === this._ui.slideId); if (!s && l.length) { s = l[0]; this._ui.slideId = s.id; } return s || null; }
  get index() { const s = this.slide; return s ? this.slides.indexOf(s) : -1; }
  select(id) { this._ui.slideId = id; this.notify(); }
  get theme() { return PitchModel.theme(this.P); }
  get title() { return this.P.title || ''; }
  get types() { return PitchModel.TYPES; }
  get themes() { return PitchModel.THEMES; }
  labels(s) { return PitchModel.labels(s); }

  /* ---------- commands ---------- */
  _slide(fn, o) { const s = this.slide; return s ? this.commit(P => fn(s, P), o) : null; }
  setTheme(k) { return this.commit(P => PitchModel.setTheme(P, k)); }
  /** a new slide after the selected one, selected → the slide */
  add(type) { const after = (this.slide || {}).id; return this.commit(P => { const s = PitchModel.add(P, type, after, { title: type === 'cover' ? P.title : 'New slide' }); this._ui.slideId = s.id; return s; }); }
  /** replace the deck with one built from the project → the first slide */
  rebuild() { return this.commit(P => { const s = PitchModel.rebuild(P, this._fx.facts(P)); this._ui.slideId = s.id; return s; }); }
  update(k, v, o) { return this._slide(s => PitchModel.update(s, k, v), o); }
  setImage(url) { return this._slide(s => PitchModel.setImage(s, url)); }
  addImage(url) { return this._slide(s => PitchModel.addImage(s, url)); }
  removeImage(k) { return this._slide(s => PitchModel.removeImage(s, k)); }
  move(d) { return this._slide((s, P) => PitchModel.move(P, s.id, d)); }
  duplicate() { return this._slide((s, P) => { const c = PitchModel.duplicate(P, s.id); this._ui.slideId = c.id; return c; }); }
  remove() { return this._slide((s, P) => { this._ui.slideId = PitchModel.remove(P, s.id); return true; }); }
}
