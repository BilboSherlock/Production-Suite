'use strict';
/* ===================================================================
   Podcast recorder — VIEW MODEL
   Wraps the recording clock (PodTimer) and the saved session: what the
   desk shows right now and everything the host and producer can do.
   Talking points ticked, questions asked and the teleprompter settings
   are kept on the clock for this visit only (not saved). No DOM.
   =================================================================== */

class PodLiveVM extends ViewModel {
  /**
   * @param {object} [opts] see ViewModel; plus
   *   clock      the recording clock (default: PodTimer)
   *   fx         app helpers, replaceable in tests: pd(P) (the podcast plan, filled in for changes), read(P) (the plan for
   *              display, unchanged), now() (ms), today(), clockTxt(min),
   *              newSegment(o), template(key, P, pd), ping(), chime()
   */
  constructor(opts = {}) {
    super(opts);
    this.clock = opts.clock || PodTimer;
    this._fx = Object.assign({ pd: P => PodcastModel.ensure(P), read: null, now: () => Date.now(), today: () => localISODate(), clockTxt: m => fmtTime(LiveModel.fromMin(m)),
      newSegment: o => PodcastModel.segment(o), template: (key, P, pd) => PodcastModel.applyTemplate(pd, key), ping: () => PodAudio.playPing(), chime: () => PodAudio.playChime() }, opts.fx || {});
    this._restore();
  }
  /**
   * The saved session is the record; the clock keeps time between saves. On opening: a clock already
   * running for this project keeps going, but takes the saved markers (so undo brings markers back);
   * otherwise the clock is set from the session.
   */
  _restore() {
    const P = this.P, c = this.clock, saved = P.live && P.live.days && P.live.days.podcast, L = PodLiveModel.read(P);
    if (c.pid === P.id) { if (saved) c.markers = L.markers; return; }
    c.pid = P.id; PodLiveModel.restore(c, L.rec, L.markers, this._fx.now());
  }
  /** the plan, read only (commands change it through _do) */
  get pd() { return (this._fx.read || PodcastModel.read)(this.P); }
  get isFree() { return PodLiveModel.isFree(this.pd); }
  get isVideo() { return PodLiveModel.isVideo(this.pd); }
  /** "Segment" or, in a freeflow show, "Topic" */
  get itemWord() { return this.isFree ? 'Topic' : 'Segment'; }
  get rundown() { return this.pd.rundown; }
  get hasRundown() { return this.rundown.length > 0; }
  /** the saved session (read only — commands save it) */
  get L() { return Object.assign(PodLiveModel.read(this.P), { markers: this.clock.markers }); }

  /* ---------- what the desk shows ---------- */
  get state() { return PodLiveModel.state(this.rundown, this.clock, this.pd); }
  get markers() { return this.clock.markers; }
  /** when the recording should end, at the current pace (minutes since midnight) */
  endAt(st = this.state) { return LiveModel.msMin(this._fx.now()) + st.remainMin; }
  alerts(st = this.state) { return PodLiveModel.alerts(this.pd, this.L, st); }
  guestOf(seg) { return seg && seg.guestId ? this.pd.guests.find(g => g.id === seg.guestId) || null : null; }
  sponsorOf(seg) { return seg && seg.sponsorId ? this.pd.sponsors.find(s => s.id === seg.sponsorId) || null : null; }
  get preflightList() { return PodLiveModel.preflightList(this.pd); }
  get preflightDone() { return PodLiveModel.preflightDone(this.L, this.preflightList); }
  /** the marker buttons for this kind of show */
  get marks() { return PodLiveModel.marksFor(this.pd); }
  get issueCats() { return PodLiveModel.issueCats(this.pd); }
  get quickIssues() { return PodLiveModel.quickIssues(this.pd); }
  /* filmed shows */
  get cameras() { return this.pd.video.cameras; }
  get curCam() { return PodLiveModel.curCam(this.markers); }
  get clips() { return PodcastModel.clips(this.markers); }
  get openIssues() { return this.L.issues.filter(i => i.status !== 'Resolved'); }
  get unreadSponsors() { return this.pd.sponsors.filter(s => !s.recorded); }
  /** the guest panel: the current segment's guest, else the one picked */
  get panelGuest() { const pd = this.pd, i = Math.min(this._ui.podLiveGuestIdx || 0, Math.max(0, pd.guests.length - 1)); return this.guestOf(this.state.cur) || pd.guests[i] || null; }
  get panelSponsor() { const pd = this.pd, i = Math.min(this._ui.podLiveSponsorIdx || 0, Math.max(0, pd.sponsors.length - 1)); return this.sponsorOf(this.state.cur) || pd.sponsors[i] || null; }
  pickGuest(i) { this._ui.podLiveGuestIdx = +i; this.notify(); }
  pickSponsor(i) { this._ui.podLiveSponsorIdx = +i; this.notify(); }
  get issueItems() { return this.rundown.map((s, i) => ({ id: s.id, label: this.isFree ? s.title : `${i + 1}. ${s.title}` })); }
  get groups() { return PodLiveModel.groups(this.P, this.pd); }
  get date() { return this._fx.today(); }
  get taskFilter() { return PodLiveModel.taskFilter(this.date); }
  /** the editor's markers as text, oldest first */
  get markersText() { return [...this.markers].reverse().map(m => `[${PodLiveModel.fmtSec(m.time)}] ${m.label}`).join('\n'); }

  /* ---------- this visit only (not saved) ---------- */
  isTicked(key) { return this.clock.checkedBullets.has(key); }
  tick(key, on) { on ? this.clock.checkedBullets.add(key) : this.clock.checkedBullets.delete(key); }
  isAsked(key) { return this.clock.checkedQuestions.has(key); }
  ask(key, on) { on ? this.clock.checkedQuestions.add(key) : this.clock.checkedQuestions.delete(key); this.notify(); }
  get prompter() { const c = this.clock; return { on: !!c.scriptPrompter, auto: !!c.autoScroll, speed: c.scrollSpeed || 1, size: c.prompterFontSize || 18 }; }
  setPrompter(patch) { const c = this.clock; if ('on' in patch) c.scriptPrompter = !!patch.on; if ('auto' in patch) c.autoScroll = !!patch.auto; if ('speed' in patch) c.scrollSpeed = patch.speed; if ('size' in patch) c.prompterFontSize = Math.max(12, Math.min(34, patch.size)); this.notify(); }
  get autoLogSound() { return !!this.clock.autoLogSound; }
  setAutoLogSound(on) { this.clock.autoLogSound = !!on; }

  /* ---------- commands: each saves the session with the clock, records undo and redraws ---------- */
  _do(fn) {
    const at = this._fx.now(), c = this.clock;
    return this.commit(P => { const L = PodLiveModel.ensure(P), r = fn(P, this._fx.pd(P), L, at); PodLiveModel.saveRec(L, c); return r; });
  }
  /** an editor marker at the current time (with a ping) */
  mark(label, kind = 'marker') { this._fx.ping(); this._do(() => PodLiveModel.addMarker(this.clock, label, kind)); }
  /** a marker without the ping (soundboard, bleep) */
  logMarker(label, kind) { this._do(() => PodLiveModel.addMarker(this.clock, label, kind)); }
  removeMarker(index) { this._do(() => PodLiveModel.removeMarker(this.clock, index)); }
  record() { return this._do((P, pd, L, at) => PodLiveModel.toggleRecord(pd, this.clock, L, at)); }
  goTo(i) { this._fx.ping(); return this._do((P, pd, L, at) => PodLiveModel.goTo(pd, this.clock, L, i, at)); }
  /** false when that was the last segment */
  next() { const more = !!PodLiveModel.nextOf(this.rundown, this.state.idx, this.isFree); if (more) this._fx.ping(); return this._do((P, pd, L, at) => PodLiveModel.next(pd, this.clock, L, at)); }
  cut() { this._fx.ping(); return this._do((P, pd, L, at) => PodLiveModel.cut(pd, this.clock, L, at)); }
  fireCue() { const cur = this.state.cur; this._fx.chime(); this.mark(`Cue: ${cur.cues}`, 'cue'); }
  addTime(segId, mins = 2) { this._do((P, pd) => { const s = pd.rundown.find(x => x.id === segId); if (s) PodLiveModel.addTime(s, mins); }); }
  cycleStatus(segId) { this._do((P, pd) => { const s = pd.rundown.find(x => x.id === segId); if (s) PodLiveModel.cycleStatus(s); }); }
  move(i, d) { return this._do((P, pd) => PodLiveModel.move(pd, this.clock, i, d)); }
  addSegment(title) { return this._do((P, pd) => PodLiveModel.addSegment(pd, this.clock, this._fx.newSegment({ title, dur: 5 }))); }
  /** freeflow: park a tangent as an if-time topic for later */
  park(title) { this._fx.ping(); return this._do((P, pd, L, at) => PodLiveModel.park(pd, this.clock, L, this._fx.newSegment({ title, dur: 5 }), at)); }
  /** filmed: the director cut to a camera */
  camSwitch(id) { const c = this.cameras.find(x => x.id === id); if (!c) return; this._do(() => PodLiveModel.camSwitch(this.clock, c)); }
  /** filmed: the sync clap / slate */
  sync() { this.mark('Sync clap / slate', 'sync'); }
  /** back to 00:00 for a fresh take */
  newSession() { this._do((P, pd, L, at) => PodLiveModel.newSession(pd, this.clock, L, at)); }
  useTemplate(key) { this._do((P, pd) => this._fx.template(key, P, pd)); }
  setSponsorRecorded(id, on) { const sp = this.pd.sponsors.find(s => s.id === id); if (!sp) return; if (on) this._fx.ping(); this._do(() => PodLiveModel.setSponsorRecorded(this.clock, sp, on)); }
  setPreflight(key, on) { this._do((P, pd, L) => PodLiveModel.setPreflight(L, key, on)); }
  /** wrap the session and file the hand-off sheet in the daily report; returns the sheet */
  wrap() {
    return this._do((P, pd, L, at) => {
      PodLiveModel.wrap(pd, this.clock, L, at);
      const h = PodLiveModel.handoff(P, pd, L, this.clock, { date: this._fx.today(), clockTxt: m => this._fx.clockTxt(m) });
      const d = PodLiveModel.fileHandoff(P, L, this.clock, h, { date: this._fx.today(), dayId: this._ui.liveDay, now: at }); this._ui.liveDay = d.id;
      return h;
    });
  }
  /** change the session from a shared panel (problems, check-in, tasks, log): fn(L, P, at) */
  edit(fn) { return this._do((P, pd, L, at) => fn(L, P, at)); }
  /** a problem stamped with the recording time */
  get stamp() { return this.clock.elapsedSec; }
}
