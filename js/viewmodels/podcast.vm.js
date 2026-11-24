'use strict';
/* ===================================================================
   Podcast planner — VIEW MODEL
   The episode planner's tabs: rundown (or freeflow topics), cameras &
   set for a filmed show, guest prep, sponsor reads, studio gear, and
   show notes & chapters. What each tab shows, and every change the
   producer can make. No DOM.
   =================================================================== */

class PodcastVM extends ViewModel {
  /**
   * @param {object} [opts] see ViewModel; plus
   *   fx   app helpers, replaceable in tests: nDays(P), audioKit() (starter gear items), gearCats(), gearStatuses(),
   *        budgetCats() ({ gear category: budget category }), series(P) ("Show · S1E4" or ''), markers(P) (the saved recording's markers)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      nDays: P => (P.days || []).length,
      audioKit: () => starterPodcastGear(),
      gearCats: () => PODCAST_GEAR_CATS, gearStatuses: () => PODCAST_GEAR_STATUS, budgetCats: () => PODCAST_GEAR_BUDGET,
      series: P => P.series ? `${P.series.name} · ${epCode(P.series)}` : '',
      markers: P => PodLiveModel.read(P).markers,
    }, opts.fx || {});
    this.gearUi = this.uiState('podGear', { q: '', status: '' });
  }
  /** the plan, read only */
  get pd() { return PodcastModel.read(this.P); }
  /** change the plan: fn(pd, P); quiet = save without redrawing (typing) */
  _do(fn, quiet = false) { return this.commit(P => fn(PodcastModel.ensure(P), P), { quiet }); }

  /* ---------- the show ---------- */
  get isFree() { return PodcastModel.isFree(this.pd); }
  get isVideo() { return PodcastModel.isVideo(this.pd); }
  get format() { return this.pd.format; }
  get medium() { return this.pd.medium; }
  get target() { return this.pd.target; }
  get summary() { return PodcastModel.summary(this.pd); }
  get formats() { return PodcastModel.FORMATS; }
  get media() { return PodcastModel.MEDIA; }
  setFormat(k) { this._do(pd => PodcastModel.setFormat(pd, k)); }
  setMedium(k) { this._do(pd => { PodcastModel.setMedium(pd, k); if (k === 'video' && !pd.video.cameras.length) PodcastModel.starterCameras(pd); }); if (k !== 'video' && this.tab === 'video') this.setTab('rundown'); }
  setTarget(m) { this._do(pd => PodcastModel.setTarget(pd, m)); }

  /* ---------- tabs ---------- */
  get tabs() {
    const pd = this.pd;
    return [['rundown', this.isFree ? `Topics & clock (${PodcastModel.active(pd).length})` : 'Rundown & clock'], ...(this.isVideo ? [['video', `Cameras & set (${pd.video.cameras.length})`]] : []),
      ['guests', `Guest prep (${pd.guests.length})`], ['sponsors', `Sponsor reads (${pd.sponsors.length})`], ['gear', `Gear & ${this.isVideo ? 'cameras' : 'mics'} (${pd.gear.length})`], ['notes', 'Show notes & chapters']];
  }
  get tab() { const t = this._ui.podTab || 'rundown'; return this.tabs.some(([k]) => k === t) ? t : 'rundown'; }
  setTab(k) { this._ui.podTab = k; this.notify(); }

  /* ---------- rundown / topics ---------- */
  get rundown() { return this.pd.rundown; }
  /** each segment with its planned start (minutes) */
  get rows() { const tm = PodLiveModel.timing(this.rundown).rows; return this.rundown.map((s, i) => ({ seg: s, idx: i, start: tm[i].start, last: i === this.rundown.length - 1 })); }
  get plannedMin() { return PodcastModel.plannedMin(this.pd); }
  get runLength() { return PodcastModel.runLength(this.pd); }
  /** freeflow: topics grouped by priority */
  get groups() { return PodcastModel.byPriority(this.pd); }
  /** freeflow: minutes of must-cover topics beyond the target */
  get overBooked() { return PodcastModel.overBooked(this.pd); }
  get templates() { return PodcastModel.templates(); }
  get guests() { return this.pd.guests; }
  get sponsors() { return this.pd.sponsors; }
  addSegment(o) { return this._do(pd => PodcastModel.addSegment(pd, o)); }
  useTemplate(key) { return this._do(pd => PodcastModel.applyTemplate(pd, key)); }
  /** change a segment field; text fields are saved quietly, the rest redraw */
  setSeg(id, k, v) { const quiet = !['dur', 'status', 'priority', 'guestId', 'sponsorId'].includes(k); return this._do(pd => { const s = pd.rundown.find(x => x.id === id); return !!s && PodcastModel.updateSegment(s, k, v); }, quiet); }
  moveSeg(i, d) { return this._do(pd => PodcastModel.moveSegment(pd, i, d)); }
  removeSeg(id) { return this._do(pd => PodcastModel.removeSegment(pd, id)); }
  get rundownText() { return PodcastModel.rundownText(this.P, this.pd); }
  get rundownCsv() { return PodcastModel.rundownCsv(this.pd); }

  /* ---------- guests & sponsors ---------- */
  addGuest() { return this._do(pd => PodcastModel.addGuest(pd)); }
  setGuest(id, k, v) { return this._do(pd => { const g = pd.guests.find(x => x.id === id); return !!g && PodcastModel.updateGuest(g, k, v); }, k !== 'release'); }
  removeGuest(id) { this._do(pd => PodcastModel.removeGuest(pd, id)); }
  get guestsDigest() { return PodcastModel.guestsDigest(this.pd); }
  addSponsor() { return this._do(pd => PodcastModel.addSponsor(pd)); }
  setSponsor(id, k, v) { return this._do(pd => { const s = pd.sponsors.find(x => x.id === id); return !!s && PodcastModel.updateSponsor(s, k, v); }, !['recorded', 'slot', 'duration'].includes(k)); }
  removeSponsor(id) { this._do(pd => PodcastModel.removeSponsor(pd, id)); }
  get sponsorsText() { return PodcastModel.sponsorsText(this.pd); }

  /* ---------- cameras & set ---------- */
  get video() { return this.pd.video; }
  get cameras() { return this.pd.video.cameras; }
  addCamera() { return this._do(pd => PodcastModel.addCamera(pd)); }
  setCamera(id, k, v) { return this._do(pd => { const c = pd.video.cameras.find(x => x.id === id); return !!c && PodcastModel.updateCamera(c, k, v); }, k !== 'shot'); }
  removeCamera(id) { this._do(pd => PodcastModel.removeCamera(pd, id)); }
  setVideo(k, v) { return this._do(pd => PodcastModel.updateVideo(pd, k, v), !['aspect', 'iso', 'clips'].includes(k)); }
  get cameraText() { return PodcastModel.cameraText(this.P, this.pd); }
  /** segments with on-screen graphics (for the graphics list) */
  get graphics() { return this.rundown.filter(s => s.status !== 'Cut' && s.gfx).map(s => ({ seg: s, items: s.gfx.split('\n').filter(Boolean) })); }

  /* ---------- gear ---------- */
  get nDays() { return this._fx.nDays(this.P); }
  get gearCats() { return this._fx.gearCats(); }
  get gearStatuses() { return this._fx.gearStatuses(); }
  get gear() { return this.pd.gear; }
  get gearFilter() { return this.gearUi; }
  setGearFilter(patch) { this.setUi('podGear', patch); }
  /** the filtered gear, by category: [{ cat, items }] */
  get gearGroups() { const rows = PodcastModel.filterGear(this.gear, this.gearUi.q, this.gearUi.status); return this.gearCats.map(cat => ({ cat, items: rows.filter(g => g.cat === cat) })).filter(g => g.items.length); }
  get gearStats() { return PodcastModel.gearStats(this.pd, this.nDays); }
  gearCost(g) { return PodcastModel.gearCost(g, this.nDays); }
  gearDays(g) { return PodcastModel.gearDays(g, this.nDays); }
  get gearSources() { return ['Owned', ...new Set(this.gear.map(g => g.source).filter(x => x && x !== 'Owned'))]; }
  addGear(cat) { return this._do(pd => PodcastModel.addGear(pd, cat)); }
  /** typing in the gear table: saved quietly; the status redraws */
  setGear(id, k, v) { return this._do(pd => { const g = pd.gear.find(x => x.id === id); return !!g && PodcastModel.updateGear(g, k, v); }, k !== 'status'); }
  duplicateGear(id) { this._do(pd => PodcastModel.duplicateGear(pd, id)); }
  removeGear(id) { this._do(pd => PodcastModel.removeGear(pd, id)); }
  /** add the audio or the video starter kit; returns how many items */
  addKit(kind) { return this._do(pd => PodcastModel.addKit(pd, kind === 'video' ? PodcastModel.videoKit() : this._fx.audioKit())); }
  /** budget lines for rented gear; returns how many (0 = nothing with a day rate) */
  toBudget() { return this.gear.some(g => (+g.rate || 0) > 0) ? this._do((pd, P) => PodcastModel.syncBudget(P, pd, this._fx.budgetCats(), this.nDays)) : 0; }
  get packRows() { return PodcastModel.packRows(this.pd, this.gearCats); }
  get rentals() { return PodcastModel.rentals(this.pd, this.nDays); }
  get gearCsv() { return PodcastModel.gearCsv(this.pd, this.nDays); }

  /* ---------- show notes ---------- */
  get notes() { return this.pd.notes; }
  /** typing in the notes: saved quietly (the view refreshes the preview itself) */
  setNote(k, v) { if (!PodcastModel.NOTE_FIELDS.includes(k)) return false; this._do(pd => { pd.notes[k] = v; }, true); return true; }
  get markers() { return this._fx.markers(this.P) || []; }
  /** chapters: from the recording when it has segment markers, else from the plan — { source, list } */
  get chapters() { return PodcastModel.chapters(this.pd, this.markers); }
  get chapterText() { return PodcastModel.chapterText(this.chapters.list); }
  get clips() { return PodcastModel.clips(this.markers); }
  get clipText() { return PodcastModel.clipText(this.clips); }
  get showNotes() { return PodcastModel.showNotes(this.P, this.pd, this.chapters.list, { series: this._fx.series(this.P) }); }
}
