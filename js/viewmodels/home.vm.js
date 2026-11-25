'use strict';
/* ===================================================================
   Projects home — VIEW MODEL. The project cards and contact count,
   and the commands: new project, duplicate, delete, back up all and
   import (a .json backup, or a script's parsed text). Works across
   every project, so there is no open project. No DOM. See js/mvvm.js.
   =================================================================== */

class HomeVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   projects() → { id: project };  add(p) / remove(id) → store or delete a project (async);
   *   contacts() → the contact list;  saveContacts() (async);  prefs() → { preset, on };
   *   stats(p) → { scenes, pages };  epCode(series);  date(ms) → 'Mar 3, 2026';  now();
   *   blankProject(mode, title);  applyRegion(p, region);  region() → the default region;  defType(mode);  presets;
   *   episodes(seriesId) → the series' projects;  migrate(json) → a project;
   *   parseScript(text, fileName, mode) → { blocks, meta } (Fountain, Final Draft…)
   */
  constructor(opts = {}) {
    super(Object.assign({ project: () => null }, opts));
    this._fx = Object.assign({
      projects: () => Store.projects, add: p => Store.add(p), remove: id => Store.remove(id),
      contacts: () => Contacts.list, saveContacts: () => Contacts.save(), prefs: () => Prefs,
      stats: p => scriptStats(p), epCode: s => epCode(s), now: () => Date.now(),
      date: ms => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      blankProject: (m, t) => blankProject(m, t), applyRegion: (p, r) => applyRegion(p, r), region: () => (Prefs && Prefs.region) || 'US',
      defType: m => ScriptModel.defType(m), presets: typeof PRESETS === 'object' ? PRESETS : {},
      episodes: sid => episodesOf(sid), migrate: j => migrate(j),
      parseScript: (txt, name, mode) => /\.fdx$/i.test(name) ? parseFDX(txt) : parseFountain(txt, mode),
    }, opts.fx || {});
  }

  /* ---------- what the view shows ---------- */
  get cards() { const f = this._fx; return HomeModel.sorted(f.projects()).map(p => HomeModel.card(p, f.stats(p), f.epCode, f.date)); }
  get contactCount() { return this._fx.contacts().length; }
  get defaultRegion() { return this._fx.region(); }
  project(id) { return this._fx.projects()[id] || null; }
  /** a project's backup → { name, data, meta } (see backupFile) */
  backupOf(id, slug) { const p = this.project(id); return p ? { name: HomeModel.fileName(p, slug), data: p, meta: { kind: 'project', title: p.title, n: 1, exported: this._fx.now() } } : null; }
  /** every project and the contacts → { name, data, n, meta } or null */
  backupAll() { const f = this._fx; return HomeModel.bundle(f.projects(), f.contacts(), f.prefs(), f.now()); }
  /** a backup from backupOf / backupAll → its file's bytes, checked to read back exactly (throws otherwise) */
  async backupFile(b) { return SaveFile.write(b.data, b.meta); }

  /* ---------- projects ---------- */
  /** a new project → it (stored); o = { mode, title, region } */
  async create({ mode = 'screenplay', title = '', region } = {}) {
    const f = this._fx, p = f.blankProject(mode, String(title).trim() || 'Untitled project');
    if (region && region !== p.settings.region) f.applyRegion(p, region);
    HomeModel.setupNew(p, mode, { defType: f.defType, presets: f.presets });
    await f.add(p); return p;
  }
  async duplicate(id) {
    const f = this._fx, p = this.project(id); if (!p) return null;
    const c = HomeModel.copy(p, p.series ? f.episodes(p.series.id) : [], f.now());
    await f.add(c); this.notify(); return c;
  }
  async remove(id) { if (!this.project(id)) return false; await this._fx.remove(id); this.notify(); return true; }

  /* ---------- import ---------- */
  /**
   * A .json file's text → { contacts: n | null, restored: n | null, project: the new project | null }.
   * Throws when it is neither a backup nor contacts.
   */
  async importJson(text) { return this.importData(JSON.parse(text)); }
  /**
   * a backup file's bytes (.studiobindahh, or an older .json) → importData's result plus
   * { complete, problems }. A damaged or cut-off file gives back what could be read, its
   * project titled '(recovered)'; problems say what was left out. Throws when nothing is readable.
   */
  async importFile(bytes) {
    const r = await SaveFile.decode(bytes), d = r.data;
    if (!r.complete && d && !Array.isArray(d.projects) && !Array.isArray(d.contacts) && typeof d.title === 'string') d.title += ' (recovered)';
    return Object.assign(await this.importData(d), { complete: r.complete, problems: r.problems });
  }
  /** a backup's parsed contents → { contacts, restored, project } (see importJson) */
  async importData(json) {
    const f = this._fx, C = HomeModel.classify(json), out = { contacts: null, restored: null, project: null };
    if (C.contacts) { out.contacts = HomeModel.mergeContacts(f.contacts(), C.contacts); await f.saveContacts(); }
    if (C.projects) {
      let n = 0;
      for (const x of C.projects) { if (!x || !Array.isArray(x.blocks)) continue; await f.add(HomeModel.unclash(f.migrate(x), f.projects())); n++; }
      out.restored = n;
    } else if (C.project) {
      const p = f.migrate(C.project); if (!Array.isArray(p.blocks)) throw new Error('Not a StudioBindahh project');
      await f.add(HomeModel.unclash(p, f.projects())); out.project = p;
    }
    if (!out.project) this.notify();
    return out;
  }
  /** a script file's text → the new project (stored). Throws when there is no script in it. */
  async importScript(text, name, mode) {
    const f = this._fx, res = f.parseScript(text, name, mode); if (!res.blocks.length) throw new Error('No script content found');
    const m = res.meta || {}, p = f.blankProject(mode, m.title || name.replace(/\.[^.]+$/, ''));
    p.blocks = res.blocks; p.meta.author = m.author || m.authors || ''; p.meta.credit = m.credit || 'Written by'; p.meta.draft = m['draft date'] || m.date || ''; p.meta.contact = m.contact || '';
    await f.add(p); return p;
  }
  /** a PDF read by the PDF import (js/pdfimport.js) → the new project (stored) */
  async importPdf(res, name) {
    const f = this._fx, m = res.meta || {}, p = f.blankProject(res.mode, m.title || name.replace(/\.pdf$/i, ''));
    p.blocks = res.blocks; p.meta.author = m.author || ''; p.meta.credit = m.credit || 'Written by'; p.meta.source = m.source || ''; p.meta.contact = m.contact || ''; p.meta.draft = m.draft || '';
    if (res.keepNumbers) p.settings.sceneNumLock = true;
    await f.add(p); return p;
  }
}
