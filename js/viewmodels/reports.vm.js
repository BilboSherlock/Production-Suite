'use strict';
/* ===================================================================
   Reports — VIEW MODEL
   Which report tab is open (UI.repTab, also set from the address) and
   the report built for it, ready to show, print or export. No DOM.
   The Daily production report tab has its own view model (DprVM).
   =================================================================== */

class ReportsVM extends ViewModel {
  /**
   * @param {object} [opts] see ViewModel; plus app helpers, replaceable in tests:
   *   scenes(P), terms(), and any of the report helpers listed in js/models/reports.model.js (fx)
   */
  constructor(opts = {}) {
    super(opts);
    const P = () => this.P, sc = () => this.scenes;
    this._scenes = opts.scenes || (P => getScenes(P));
    this._terms = opts.terms || (() => TERM);
    this._fx = Object.assign({
      castOf: s => sceneCast(P(), s),
      locOf: s => locName(P(), s),
      norm: n => normChar(n),
      charsIn: (x, sid) => itemCharsIn(x, sid),
      itemLabel: (x, sid) => itemLabel(x, sid),
      itemById: id => itemById(P(), id),
      whoOf: t => whoOf(t),
      conflicts: d => dayConflicts(P(), d, sc()),
      elementRows: () => elementRows(P(), sc()),
      shotTags: () => shotTagList(P()),
      allShots: () => allShotsOf(P()),
      shotLabel: s => P().photo.shots.includes(s) ? photoShotLabel(P(), s, sc()) : shotLabel(P(), s, sc()),
      singular: n => singularKey(n),
      charNames: () => allCharNames(P()),
      words: t => stripRich(t).trim().split(/\s+/).filter(Boolean).length,
      fmtEighths: n => fmtEighths(n),
      fmtDateShort: d => fmtDateShort(d),
      shotStatuses: typeof SHOT_STATUS !== 'undefined' ? SHOT_STATUS : [],
    }, opts.fx || {});
    this._sc = null; this._rep = null;
    if (!this._ui.repTab) this._ui.repTab = 'dood';
  }
  notify() { this._sc = null; this._rep = null; super.notify(); }
  get scenes() { return this._sc || (this._sc = this._scenes(this.P)); }

  /* ---------- tabs ---------- */
  get tabs() { return ReportsModel.tabs(this.P, this._terms()).map(([key, label]) => ({ key, label, on: key === this.tab })); }
  /** the open tab (an unknown one shows the continuity report, as it always has) */
  get tab() { return this._ui.repTab; }
  get isDaily() { return this.tab === 'dpr'; }
  selectTab(key) { if (key !== this._ui.repTab) { this._ui.repTab = key; this.notify(); } }
  get hasScenes() { return this.scenes.length > 0; }
  /** the line under the page title */
  get subtitle() { return [this.P.title, ReportsModel.INFO[this.tab]].filter(Boolean).join(' — '); }

  /* ---------- the report ---------- */
  get report() { return this._rep || (this._rep = ReportsModel.build(this.tab, this.P, this.scenes, this._fx)); }
  /** headers without the line break DOOD puts between day and date */
  flatHeaders(hs) { return hs.map(x => x.replace('\n', ' ')); }
  /** file name and rows for the CSV download */
  get csv() {
    const r = this.report, head = this.flatHeaders(r.csvHead || r.headers), rows = r.csvRows || r.rows.filter(x => Array.isArray(x));
    return { name: `${slugOf(this.P.title)}-${this.tab}.csv`, rows: [head, ...rows] };
  }
  /** what the Print button sends: title, headers and rows (group rows included) */
  get print() { const r = this.report; return { title: r.title, headers: this.flatHeaders(r.headers), rows: r.rows }; }
}
