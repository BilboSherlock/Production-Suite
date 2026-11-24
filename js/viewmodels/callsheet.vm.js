'use strict';
/* ===================================================================
   Call sheet — VIEW MODEL
   Which day is shown, everything on its sheet, the email to the unit,
   and the edits a user can make. No DOM. See js/mvvm.js.
   =================================================================== */

class CallSheetVM extends ViewModel {
  /**
   * @param {object} [opts] see ViewModel; plus
   * @param {string} [opts.dayId]  the day asked for in the address (#/p/…/callsheet/<dayId>)
   * and app helpers, replaceable in tests: scenes, castOf(P, s), conflicts(P, d, scenes),
   * charsIn(item, sceneId), fmtTime, fmtDate, fmtDateShort, terms() (US / UK wording)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = {
      scenes: opts.scenes || (P => getScenes(P)),
      castOf: opts.castOf || ((P, s) => sceneCast(P, s)),
      conflicts: opts.conflicts || ((P, d, sc) => dayConflicts(P, d, sc)),
      charsIn: opts.charsIn || ((x, sid) => itemCharsIn(x, sid)),
      fmtTime: opts.fmtTime || (t => fmtTime(t)),
      fmtDate: opts.fmtDate || (d => fmtDate(d)),
      fmtDateShort: opts.fmtDateShort || (d => fmtDateShort(d)),
      terms: opts.terms || (() => TERM),
    };
    this._sc = null;
    if (opts.dayId) this._ui.callDay = opts.dayId;
  }
  notify() { this._sc = null; super.notify(); }
  get scenes() { return this._sc || (this._sc = this._fx.scenes(this.P)); }
  _castOf() { const P = this.P; return s => this._fx.castOf(P, s); }
  _numOf() { const by = new Map(this.scenes.map(s => [s.id, s.num])); return id => by.get(id); }

  /* ---------- which day (UI state, shared with Search via UI.callDay) ---------- */
  get hasDays() { return this.P.days.length > 0; }
  get day() { const P = this.P; return P.days.find(d => d.id === this._ui.callDay) || P.days[0] || null; }
  get n() { return this.P.days.indexOf(this.day) + 1; }
  get total() { return this.P.days.length; }
  get dayOptions() { return this.P.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1}${d.date ? ' — ' + this._fx.fmtDateShort(d.date) : ''}`, selected: d === this.day })); }
  selectDay(id) { if (this.P.days.some(d => d.id === id)) { this._ui.callDay = id; this.notify(); } }
  /** the day's scenes that still exist */
  get dayScenes() { return ScheduleModel.dayScenes(this.P, this.day, this.scenes); }

  /* ---------- the sheet ---------- */
  get sheet() {
    const P = this.P, day = this.day, ds = this.dayScenes, castOf = this._castOf(), numOf = this._numOf(), n = this.n;
    const crewCall = day.cs && day.cs.crew;
    const next = P.days[n];
    return {
      heading: CallSheetModel.heading(day, n, this.total), date: day.date, cs: day.cs || {},
      conflicts: this._fx.conflicts(P, day, this.scenes),
      eighths: ScheduleModel.dayEighths(P, day, this.scenes),
      locations: CallSheetModel.locations(P, ds),
      /* a split scene shows only today's part: its pages, "pt 1/2", and what the part covers */
      scenes: ds.map(s => { const sh = ScheduleModel.share(P, day, s); return { id: s.id, num: s.num, part: sh.label, ioe: s.ioe, tod: s.tod, place: CallSheetModel.placeOf(P, s) || s.label,
        synopsis: [sh.part && sh.part.note, s.synopsis].filter(Boolean).join(' — '), cast: CallSheetModel.castNumbers(P, s, castOf).join(', '), eighths: sh.eighths }; }),
      props: CallSheetModel.props(P, ds, numOf),
      wardrobe: CallSheetModel.wardrobe(P, ds, numOf, this._fx.charsIn),
      cast: CallSheetModel.castRows(P, ds, castOf).map(r => ({ ch: r.ch, num: r.num, personId: r.person && r.person.id, name: r.person && r.person.name, call: r.person ? CallSheetModel.callFor(day, r.person.id) : null })),
      crew: CallSheetModel.crew(P).map(p => ({ personId: p.id, dept: p.dept, name: p.name, role: p.role, phone: p.phone, call: CallSheetModel.callFor(day, p.id), defaultCall: crewCall || '' })),
      advance: next ? { n: n + 1, date: next.date, scenes: ScheduleModel.slots(P, next, this.scenes).map(x => x.label ? `${x.scene.num} ${x.label}` : x.scene.num) } : null,
    };
  }

  /** the email to the unit: BCC list, people with no address, subject and message */
  get email() {
    const P = this.P, day = this.day, n = this.n, ds = this.dayScenes, c = day.cs || {}, f = this._fx, T = f.terms();
    const { emails, missing } = CallSheetModel.recipients(P, ds, this._castOf());
    const locs = [...new Set(ds.map(s => s.location).filter(Boolean))];
    const subject = `${P.title} — Call sheet — Day ${n}${day.date ? ' (' + f.fmtDateShort(day.date) + ')' : ''}`;
    const body = ['Hi all,', '', `Call sheet for Day ${n} of ${this.total}${day.date ? ' — ' + f.fmtDate(day.date) : ''}.`, '',
      c.crew ? `${T.crewCall}: ${f.fmtTime(c.crew)}` : '', c.shoot ? `Shooting call: ${f.fmtTime(c.shoot)}` : '', c.wrap ? `Estimated wrap: ${f.fmtTime(c.wrap)}` : '',
      locs.length ? `Location: ${locs.join('; ')}` : '', c.basecamp ? `Basecamp / parking: ${c.basecamp}` : '',
      '', ds.length ? 'Scenes: ' + ds.map(s => s.num).join(', ') : '', c.notes ? `\nNotes: ${c.notes}` : '', '', 'The full call sheet PDF is attached.', '', 'Thanks!']
      .filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
    return { emails, missing, subject, body, title: `Email Day ${n} call sheet` };
  }
  /** a mailto: link; long ones may be cut off by email apps */
  mailto(subject, body) {
    const url = `mailto:?bcc=${encodeURIComponent(this.email.emails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return { url, tooLong: url.length > 1900 };
  }

  /* ---------- commands (typing: saved without redrawing) ---------- */
  setField(key, value) { const day = this.day; return this.commit(() => CallSheetModel.setField(day, key, value), { quiet: true }); }
  setCall(personId, key, value) { const day = this.day; return this.commit(() => CallSheetModel.setCall(day, personId, key, value), { quiet: true }); }
}
