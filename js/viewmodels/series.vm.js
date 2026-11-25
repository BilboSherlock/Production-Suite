'use strict';
/* ===================================================================
   Series bible — VIEW MODEL. Joining or leaving a series, the shared
   bible (text, characters, season arcs), the episode guide, and
   copying the bible to every other episode. No DOM. See js/mvvm.js.
   =================================================================== */

class SeriesVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   projects() → every project;  persist(project) → saves another episode (async);  add(project) → stores a new one (async);
   *   blankProject(mode, title);  defType(mode);  newPerson(type);  charsOf(P) → Set of speaking characters;
   *   pagesOf(P) → page count;  esc(text);  now() → ms;  delay → ms before typing is copied to other episodes
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      projects: () => Object.values(Store.projects),
      persist: async e => { if (Store.persist) { await DB.put(e); if (window.Sync) Sync.queuePush(e); } },
      add: p => Store.add(p), blankProject: (m, t) => blankProject(m, t), defType: m => ScriptModel.defType(m),
      newPerson: t => PeopleModel.newPerson(t), charsOf: P => new Set(allCharacters(P).keys()), pagesOf: P => scriptStats(P).pages,
      esc: t => esc(t), now: () => Date.now(), delay: 500,
    }, opts.fx || {});
    this._t = null; this._owner = null;
    /* the newest copy of the bible wins (copied in quietly, as before) */
    if (this.P && this.P.series) SeriesModel.adopt(this.P, this.episodes);
  }

  /* ---------- what the view shows ---------- */
  get S() { return this.P.series || null; }
  get B() { return this.S ? SeriesModel.ensure(this.S) : null; }
  get episodes() { return this.P.series ? SeriesModel.episodes(this._fx.projects(), this.P.series.id) : []; }
  get tab() { const t = this._ui.bibleTab; return ['bible', 'chars', 'arcs', 'guide'].includes(t) ? t : 'bible'; }
  get code() { return SeriesModel.epCode(this.S); }
  get seasons() { return SeriesModel.seasons(this.episodes, this.B); }
  /** the characters with how many episodes each speaks in ('' while unnamed) */
  get characters() {
    const eps = this.episodes;
    return this.B.characters.map(c => Object.assign({}, c, { seen: c.name.trim() ? SeriesModel.appearances(eps, c.name, this._fx.charsOf) : null }));
  }
  /** the episode guide rows */
  get guide() { const P = this.P; return this.episodes.map(e => ({ id: e.id, code: SeriesModel.epCode(e.series), title: e.title || 'Untitled', logline: e.meta.logline || '—', pages: this._fx.pagesOf(e), draft: e.meta.draft || '—', current: e === P })); }
  bibleHtml() { return SeriesModel.bibleHtml(this.S, this._fx.esc); }
  guideHtml() { return SeriesModel.guideHtml(this.S, this.episodes, this._fx.esc, this._fx.pagesOf); }
  setTab(t) { this._ui.bibleTab = t; this.notify(); }

  /* ---------- sharing the bible with the other episodes ---------- */
  /** copy now (stamps it newest, saves the other episodes) */
  async share() {
    clearTimeout(this._t); this._t = null;
    const P = this._owner || this.P; this._owner = null; if (!P || !P.series) return 0;
    const changed = SeriesModel.share(P, SeriesModel.episodes(this._fx.projects(), P.series.id), this._fx.now());
    P.updated = this._fx.now();
    for (const e of changed) { try { await this._fx.persist(e); } catch (x) { console.warn(x); } }
    if (P === this.P) this._store.touch();
    return changed.length;
  }
  /** a bible change: typing waits a moment before copying, anything else copies at once */
  _bible(fn, { typing = false } = {}) {
    if (!this.S) return false;
    const r = this.commit(fn, { quiet: typing }); this._owner = this.P;
    if (typing) { clearTimeout(this._t); this._t = setTimeout(() => this.share(), this._fx.delay); } else this.share();
    return r;
  }
  /** on leaving the screen: copy anything still waiting */
  flush() { if (this._t || this._owner) return this.share(); return Promise.resolve(0); }

  /* ---------- commands ---------- */
  startSeries(name, season, ep) { return this.commit(P => SeriesModel.start(P, name, season, ep)); }
  leave() { clearTimeout(this._t); this._t = null; this._owner = null; return this.commit(P => SeriesModel.leave(P)); }
  setName(v) { return this._bible(() => SeriesModel.setName(this.S, v), { typing: true }); }
  setText(k, v) { return this._bible(() => SeriesModel.setText(this.B, k, v), { typing: true }); }
  addCharacter() { return this._bible(() => SeriesModel.addCharacter(this.B)); }
  setCharacter(id, k, v) { return this._bible(() => SeriesModel.setCharacter(this.B, id, k, v), { typing: true }); }
  removeCharacter(id) { return this._bible(() => SeriesModel.removeCharacter(this.B, id)); }
  /** → how many characters were added from this episode's script */
  importCharacters() { return this._bible(P => SeriesModel.importCharacters(this.B, [...this._fx.charsOf(P)])); }
  /** add a cast member for each bible character nobody plays yet → how many */
  castFromBible() {
    return this.commit(P => { const names = SeriesModel.castMissing(this.B, P.people); P.people = P.people || []; names.forEach(n => { const x = this._fx.newPerson('cast'); x.character = n; P.people.push(x); }); return names.length; });
  }
  addSeason() { return this._bible(() => SeriesModel.addSeason(this.B, this.episodes)); }
  setArc(season, v) { return this._bible(() => SeriesModel.setArc(this.B, season, v), { typing: true }); }
  /** change an episode's season / number (any episode of the series) */
  async renumber(id, season, ep) {
    const e = this.episodes.find(x => x.id === id); if (!e) return false;
    SeriesModel.setNumber(e.series, season, ep); e.updated = this._fx.now();
    if (e === this.P) this._store.touch(); else await this._fx.persist(e);
    this.notify(); return true;
  }
  /** create the next episode as its own project → the new project */
  async newEpisode(carry) {
    const P = this.P; await this.flush();
    const p = SeriesModel.fillEpisode(this._fx.blankProject(P.mode, ''), P, this.episodes, carry, this._fx.defType);
    await this._fx.add(p); return p;
  }
}
