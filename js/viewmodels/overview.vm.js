'use strict';
/* ===================================================================
   Overview — VIEW MODEL. Gathers the facts other screens calculate
   (pages, conflicts, budget…) and hands the view one dashboard. No DOM.
   See js/mvvm.js.
   =================================================================== */

class OverviewVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   facts(P) → the facts OverviewModel needs (see its header);  sections(P) → [[view, label, icon]];
   *   live(P) → whether the Live dashboard is on;  modeLabel(mode);  series(P) → "Show S1E4" or ''
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      facts: P => {
        const scenes = getScenes(P), st = scriptStats(P), fc = finCalc(P);
        return {
          scenes, pages: st.pages, words: st.words, today: localISODate(),
          conflicts: sum(P.days, d => dayConflicts(P, d, scenes).length),
          untagged: untrackedItems(P, 'props').filter(u => needsLink(u, 'props')).length + untrackedItems(P, 'wardrobe').filter(u => needsLink(u, 'wardrobe')).length,
          orphans: orphanReport(P).total,
          fin: { total: fc.total, act: fc.act, status: fc.status, variance: fc.variance, spentPct: fc.spentPct, unassigned: fc.un.n },
          money: n => finMoney(P, n, false),
        };
      },
      sections: P => buildNav(P, { flat: true }).flatMap(g => g.items).filter(x => x[0] !== 'overview'),
      live: P => featureOn(P, 'live') && P.days.length > 0,
      modeLabel: m => MODE_LABEL[m] || 'Screenplay',
      series: P => P.series ? `${P.series.name} ${epCode(P.series)}` : '',
    }, opts.fx || {});
  }

  /** everything the dashboard shows */
  get board() {
    const P = this.P, f = this._fx.facts(P), m = P.meta || {}, nd = OverviewModel.nextDay(P.days, f.today);
    return {
      id: P.id, title: P.title, logline: m.logline || '', isPhoto: P.mode === 'photo', live: this._fx.live(P),
      subtitle: [this._fx.modeLabel(P.mode), this._fx.series(P), m.author && 'by ' + m.author, m.draft].filter(Boolean).join(' · '),
      tiles: OverviewModel.tiles(P, f), attention: OverviewModel.attention(P, f), upcoming: OverviewModel.upcoming(P.tasks),
      nextDay: nd && { id: nd.d.id, num: nd.i + 1, date: nd.d.date || '', scenes: nd.d.sceneIds.length, crewCall: (nd.d.cs || {}).crew || '' },
      sections: this._fx.sections(P), today: f.today,
    };
  }
}
