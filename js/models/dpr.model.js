'use strict';
/* ===================================================================
   Daily production report — MODEL
   What was planned vs. what was shot, per shoot day.
   P.reports[dayId] = { t:{crew,first,lunchOut,lunchIn,wrap}, weather, by,
     scenes:{ [sceneId]: {status, pgs, setups, notes} }, perf:{…},
     meals, incidents, equipment, media, overtime, notes }
   Pages use the day's share of a split scene (ScheduleModel.share).
   Reading never adds a report or a scene row; only changes do.
   Pure functions — no DOM, no Store. See js/mvvm.js.
   =================================================================== */

const DprModel = {
  STATUS: ['', 'Completed', 'Partial', 'Not shot', 'Added'],
  /** statuses whose pages count as shot */
  SHOT: ['Completed', 'Partial', 'Added'],
  TIME_KEYS: ['crew', 'first', 'lunchOut', 'lunchIn', 'wrap'],
  TEXT_KEYS: ['by', 'weather', 'meals', 'incidents', 'equipment', 'media', 'overtime', 'notes'],
  SCENE_KEYS: ['status', 'pgs', 'setups', 'notes'],
  PERF_KEYS: ['house', 'up', 'intIn', 'intOut', 'down', 'run1', 'run2', 'att'],
  NOTES: [['Meals & overtime', 'meals', 'Meal times, penalties, overtime…'], ['Incidents & safety', 'incidents', 'Injuries, near misses, delays…'],
    ['Equipment & issues', 'equipment', 'Breakdowns, rentals added…'], ['Media / data', 'media', 'Cards or drives used, backups verified…']],

  create() { return { t: { crew: '', first: '', lunchOut: '', lunchIn: '', wrap: '' }, weather: '', scenes: {}, meals: '', incidents: '', equipment: '', media: '', overtime: '', notes: '', by: '' }; },
  /** "07:30" → 450 minutes; anything else → null */
  toMins(t) { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [a, b] = t.split(':').map(Number); return a * 60 + b; },
  fmtDur(m) { return m == null || m < 0 ? '' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; },

  /* ---------- reading (never changes the project) ---------- */
  has(P, dayId) { return !!(P.reports && P.reports[dayId]); },
  /** the day's report, or a blank one that is not saved */
  read(P, dayId) { return (P.reports && P.reports[dayId]) || DprModel.create(); },
  row(R, sid) { return (R.scenes && R.scenes[sid]) || {}; },
  perf(R) { return R.perf || {}; },
  /** crew call: the report's own, else the call sheet's */
  crewCall(R, day) { return R.t.crew || (day.cs && day.cs.crew) || ''; },
  /** wrap − crew call − lunch, in minutes (null until both ends are set) */
  hoursWorked(R, day) {
    const m = DprModel.toMins, call = m(DprModel.crewCall(R, day)), wrap = m(R.t.wrap);
    if (call == null || wrap == null) return null;
    const out = m(R.t.lunchOut), back = m(R.t.lunchIn);
    return wrap - call - (out != null && back != null ? back - out : 0);
  },
  /** the day's pages scheduled / shot and setups */
  dayTotals(P, day, scenes) {
    const R = DprModel.read(P, day.id);
    return ScheduleModel.dayScenes(P, day, scenes).reduce((a, s) => {
      const r = DprModel.row(R, s.id);
      return { sched: a.sched + ScheduleModel.share(P, day, s).eighths, shot: a.shot + (DprModel.SHOT.includes(r.status) ? (+r.pgs || 0) : 0), setups: a.setups + (+r.setups || 0) };
    }, { sched: 0, shot: 0, setups: 0 });
  },
  /** totals over days 1..n+1, with how far ahead (+) or behind (−) */
  toDate(P, n, scenes) {
    const t = P.days.slice(0, n + 1).reduce((a, d) => { const x = DprModel.dayTotals(P, d, scenes); return { sched: a.sched + x.sched, shot: a.shot + x.shot, setups: a.setups + x.setups }; }, { sched: 0, shot: 0, setups: 0 });
    t.diff = t.shot - t.sched; return t;
  },
  /** the report's title line */
  heading(day, n, total) {
    const k = day.kind, name = k === 'Performance' ? 'PERFORMANCE REPORT' : (k && !['Shoot', 'Prep', 'Pickup', 'Reshoot'].includes(k)) ? k.toUpperCase() + ' REPORT' : 'DAILY PRODUCTION REPORT';
    return `${name} — Day ${n} of ${total}`;
  },
  /** one line per scheduled scene (for the screen, print and CSV) */
  rows(P, day, scenes, locOf) {
    const R = DprModel.read(P, day.id);
    return ScheduleModel.dayScenes(P, day, scenes).map(s => { const sh = ScheduleModel.share(P, day, s);
      return { id: s.id, num: s.num, part: sh.label, place: locOf(s) || s.label, sched: sh.eighths, row: DprModel.row(R, s.id) }; });
  },

  /* ---------- changing ---------- */
  /** the day's report, created when first written to */
  ensure(P, dayId) { P.reports = P.reports || {}; return P.reports[dayId] = P.reports[dayId] || DprModel.create(); },
  setTime(P, dayId, key, v) { if (!DprModel.TIME_KEYS.includes(key)) return false; DprModel.ensure(P, dayId).t[key] = v; return true; },
  setField(P, dayId, key, v) { if (!DprModel.TEXT_KEYS.includes(key)) return false; DprModel.ensure(P, dayId)[key] = v; return true; },
  setScene(P, dayId, sid, key, v) { if (!DprModel.SCENE_KEYS.includes(key)) return false; const R = DprModel.ensure(P, dayId); (R.scenes[sid] = R.scenes[sid] || {})[key] = v; return true; },
  setPerf(P, dayId, key, v) { if (!DprModel.PERF_KEYS.includes(key)) return false; const R = DprModel.ensure(P, dayId); (R.perf = R.perf || {})[key] = v; return true; },
  /** pre-fill from shots marked done (or with a circled take); returns how many scenes were filled */
  autoFill(P, day, scenes) {
    const R = DprModel.ensure(P, day.id); let n = 0;
    ScheduleModel.dayScenes(P, day, scenes).forEach(s => {
      const sh = P.shots.filter(x => x.sceneId === s.id), done = sh.filter(x => x.done || (P.takes || []).some(t => t.shotId === x.id && t.status === 'circle')).length;
      if (!done) return; n++;
      const r = R.scenes[s.id] = R.scenes[s.id] || {}; r.setups = String(done);
      if (done === sh.length) { r.status = 'Completed'; r.pgs = String(ScheduleModel.share(P, day, s).eighths); } else r.status = r.status || 'Partial';
    });
    if (!R.t.crew && day.cs && day.cs.crew) R.t.crew = day.cs.crew;
    return n;
  },
};
