'use strict';
/* ===================================================================
   Live desk — VIEW MODEL (film, TV, stage, AV and photo shoots)
   Which day is running (UI.liveDay), everything the dashboard shows
   for it at this moment, and every action taken on the day. No DOM.
   The podcast recorder has its own screen (podcast.js) and shares the
   problems / check-in / tasks / log rules in LiveModel.
   =================================================================== */

class LiveVM extends ViewModel {
  /**
   * @param {object} [opts] see ViewModel; plus app helpers, replaceable in tests:
   *   scenes(P), locOf(P, s), castOf(P, s) (Set of characters), norm(name), clock() (ms now),
   *   today() (YYYY-MM-DD), fmtDateShort(date), clockTxt(min), moveWord, mealHours(P), turnaround(P), has(view),
   *   catOrder(cat), catInfo(cat), shotLabel(P, shot, scenes), photoShotLabel(P, shot, scenes), shotStatuses, isOverdue(task)
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      scenes: P => getScenes(P), locOf: (P, s) => locName(P, s), castOf: (P, s) => sceneCast(P, s), norm: n => normChar(n),
      clock: () => Date.now(), today: () => localISODate(), fmtDateShort: d => fmtDateShort(d), clockTxt: m => fmtTime(LiveModel.fromMin(m)),
      moveWord: () => TERM.moveWord, mealHours: P => +optOf(P, 'mealHours') || 6, turnaround: P => +optOf(P, 'turnaround') || 10,
      has: (P, v) => typeof Views[v] === 'function' && featureOn(P, v),
      catOrder: c => CATS.findIndex(x => x.k === c), catInfo: c => CATMAP[c] || {},
      shotLabel: (P, x) => shotLabel(P, x), photoShotLabel: (P, x, sc) => photoShotLabel(P, x, sc),
      shotStatuses: () => SHOT_STATUS, isOverdue: t => TaskModel.isOverdue(t),
    }, opts.fx || {});
    this._c = null;
  }
  notify() { this._c = null; super.notify(); }
  /** computed once per redraw */
  _cache(k, fn) { const c = this._c || (this._c = {}); return k in c ? c[k] : (c[k] = fn()); }

  /* ---------- words, time ---------- */
  get W() { return this._cache('W', () => Object.assign(LiveModel.words(this.P), { clock: m => this._fx.clockTxt(m) })); }
  get scenes() { return this._cache('scenes', () => this._fx.scenes(this.P)); }
  /** this moment: ms and minutes since midnight (fixed for one redraw) */
  get nowMs() { return this._cache('nowMs', () => this._fx.clock()); }
  get now() { return LiveModel.msMin(this.nowMs); }
  clockTxt(m) { return this._fx.clockTxt(m); }

  /* ---------- which day ---------- */
  get hasDays() { return this.P.days.length > 0; }
  /** the day picked, else today's, else the first not yet wrapped, else the first */
  get day() {
    const P = this.P, today = this._fx.today(), ended = d => !!LiveModel.read(P, d).ended;
    return P.days.find(d => d.id === this._ui.liveDay) || P.days.find(d => d.date === today) || P.days.find(d => !ended(d)) || P.days[0] || null;
  }
  get n() { return this.P.days.indexOf(this.day) + 1; }
  get dayOptions() { const cur = this.day, today = this._fx.today(); return this.P.days.map((x, i) => ({ id: x.id, selected: x === cur, label: `Day ${i + 1}${x.date ? ' · ' + this._fx.fmtDateShort(x.date) : ''}${x.date === today ? ' (today)' : ''}` })); }
  selectDay(id) { if (this.P.days.some(d => d.id === id)) { this._ui.liveDay = id; this.notify(); } }
  /** the day's record (read only — actions save it) */
  get L() { return this._cache('L', () => LiveModel.read(this.P, this.day)); }
  sceneOf(id) { return this.scenes.find(s => s.id === id); }

  /* ---------- the plan and forecast ---------- */
  get plan() { return this._cache('plan', () => { const P = this.P; return LiveModel.plan(P, this.day, this.L, { scenes: this.scenes, locOf: s => this._fx.locOf(P, s), moveWord: this._fx.moveWord(), mealHours: this._fx.mealHours(P) }); }); }
  get forecast() { return this._cache('fc', () => LiveModel.forecast(this.plan, this.L, this.now, this.nowMs)); }
  /** everything the dashboard shows, worked out once per redraw */
  get board() { return this._cache('board', () => this._board()); }
  _board() {
    const P = this.P, d = this.day, L = this.L, W = this.W, now = this.now, plan = this.plan, fc = this.forecast, cs = d.cs || {}, tm = LiveModel.toMin, dur = LiveModel.durTxt, ck = m => this.clockTxt(m);
    const rows = fc.rows, sceneRows = rows.filter(r => r.kind === 'scene'), by = st => sceneRows.filter(r => r.state === st);
    const active = by('active'), pending = by('pending'), doneN = by('done').length, dropN = by('dropped').length, totalN = sceneRows.length - dropN;
    const pgs = rs => rs.reduce((a, r) => a + ScheduleModel.share(P, d, r.scene).eighths, 0);
    const photo = P.mode === 'photo', daySet = new Set(d.sceneIds), ST = this._fx.shotStatuses();
    const shotsAll = (photo ? P.photo.shots : P.shots).filter(s => daySet.has(s.sceneId));
    const shotsDone = photo ? shotsAll.filter(s => ST.indexOf(s.status) >= 1).length : shotsAll.filter(s => s.done || (P.takes || []).some(t => t.shotId === s.id && t.status === 'circle')).length;
    const openIssues = L.issues.filter(i => i.status !== 'Resolved'), crit = openIssues.filter(i => i.sev === 'Critical');
    const started = !!L.started, ended = !!L.ended, delta = started ? fc.delta : 0, limitWrap = tm(cs.wrap), sun = tm(cs.sunset);
    const mealCap = LiveModel.mealDue(d, plan, this._fx.mealHours(P)), mealPending = started && !ended && !L.meal.out && plan.lunchAt != null;

    /* the next thing with a deadline */
    const marks = [];
    if (mealPending) marks.push([mealCap, 'Meal due', mealCap - now < 30 ? 'warn' : '']);
    if (sun && !ended) marks.push([sun, 'Sunset', sun - now < 60 ? 'warn' : '']);
    if (limitWrap != null && !ended) marks.push([limitWrap, 'Call-sheet wrap', fc.wrap > limitWrap ? 'bad' : '']);
    const nm = marks.filter(m => m[0] > now).sort((a, b) => a[0] - b[0])[0], nextMark = nm ? { at: nm[0], label: nm[1], tone: nm[2] } : null;

    /* alerts: [tone, message, action?] — action = { label, cmd: 'lunchOut' | 'defer', id } */
    const alerts = [];
    crit.forEach(i => alerts.push(['crit', `Critical: ${i.title}`]));
    if (started && !ended) {
      if (mealPending && now > mealCap) alerts.push(['crit', `Meal break overdue — due by ${ck(mealCap)} (${dur(now - mealCap)} late). Penalties may apply.`]);
      else if (mealPending && now > mealCap - 30) alerts.push(['warn', `Meal break due by ${ck(mealCap)} (${dur(mealCap - now)} left)`, { label: 'Lunch out', cmd: 'lunchOut' }]);
      if (limitWrap != null && fc.wrap > limitWrap + 5) alerts.push([fc.wrap > limitWrap + 30 ? 'crit' : 'warn', `Forecast wrap ${ck(fc.wrap)} is ${dur(fc.wrap - limitWrap)} after the call-sheet wrap (${ck(limitWrap)})`]);
      const hours = +(P.settings || {}).dayHours || 10, cap = (tm(cs.crew) ?? plan.call) + hours * 60; if (fc.wrap > cap) alerts.push(['warn', `The day would run past the ${hours}-hour limit (${ck(cap)})`]);
      const nd = P.days[this.n];
      if (nd && nd.cs && nd.cs.crew && nd.date && d.date) {
        const gap = ((new Date(nd.date) - new Date(d.date)) / 6e4) - fc.wrap + (tm(nd.cs.crew) || 0), need = this._fx.turnaround(P) * 60;
        if (gap < need) alerts.push(['warn', `Forecast wrap leaves only ${(gap / 60).toFixed(1)} h turnaround before Day ${this.n + 1} call (${need / 60} h needed)`]);
      }
      if (sun) { const late = sceneRows.filter(r => ['pending', 'active'].includes(r.state) && /EXT/i.test(r.scene.ioe || '') && !/NIGHT/i.test(r.scene.tod || '') && r.fe > sun); if (late.length) alerts.push(['warn', `Exterior ${late.length > 1 ? W.items : W.item.toLowerCase()} ${late.map(r => r.scene.num).join(', ')} forecast to finish after sunset (${ck(sun)})`]); }
      const nextR = pending[0];
      if (nextR && nextR.fs - now < 45) this.castFor(nextR.scene).forEach(({ ch, p, here }) => { if (p && !here) alerts.push(['warn', `${p.name || ch}${!photo ? ` (${ch})` : ''} not on site yet — ${W.item.toLowerCase()} ${nextR.scene.num} starts ${nextR.fs <= now ? 'now' : 'in ' + dur(nextR.fs - now)}`]); });
      if (fc.delta > 25 && pending.length) {
        const need = fc.delta, cand = [...pending].reverse().map(r => ({ r, m: r.dur + r.extra })).sort((a, b) => Math.abs(a.m - need) - Math.abs(b.m - need))[0];
        if (cand) alerts.push(['tip', `To recover ${dur(need)}, consider moving ${W.item.toLowerCase()} ${cand.r.scene.num} (${dur(cand.m)}) to another day.`, { label: `Move ${W.item.toLowerCase()}…`, cmd: 'defer', id: cand.r.id }]);
      }
    }

    /* the running order on its time axis */
    const shown = rows.filter(r => r.state !== 'skip').map(r => Object.assign(r, { label: r.kind === 'scene' ? `${r.scene.num}. ${r.scene.label}`.replace(/^(\S+)\. (INT|EXT)\.? ?/, '$1. ') : r.label }));
    const from = Math.floor((Math.min(plan.call, ...shown.map(r => Math.min(r.start, r.fs))) - 15) / 30) * 30, to = Math.ceil((Math.max(fc.wrap, plan.end, limitWrap || 0, sun || 0) + 15) / 30) * 30;

    return { plan, fc, rows, sceneRows, active, pending, doneN, dropN, totalN, pgDone: pgs(by('done')), pgAll: pgs(sceneRows.filter(r => r.state !== 'dropped')),
      photo, shotsAll: shotsAll.length, shotsDone, openIssues: openIssues.length, crit: crit.length, started, ended, delta, status: LiveModel.status(L, delta),
      running: started ? `${ended ? 'Day length' : 'Running'} ${dur(((L.ended || this.nowMs) - L.started) / 6e4)}` : `Day ${this.n} not started`,
      limitWrap, sun, mealCap, nextMark, alerts, timeline: { rows: shown, from, to },
      lunch: !started || ended || plan.lunchAt == null ? null : !L.meal.out ? 'out' : !L.meal.in ? 'in' : dur((L.meal.in - L.meal.out) / 6e4) };
  }
  /** the running clock under the time ("Running 2h 05m") — updated every second without a redraw */
  runningText(ms) { const L = this.L; return L.started ? `${L.ended ? 'Day length' : 'Running'} ${LiveModel.durTxt(((L.ended || ms) - L.started) / 6e4)}` : ''; }

  /* ---------- everything connected to a scene / setup ---------- */
  /** who the scene needs, matched to cast members, and whether they are here */
  castFor(s) {
    const P = this.P, L = this.L, f = this._fx;
    return [...f.castOf(P, s)].map(ch => { const p = P.people.find(x => x.type === 'cast' && f.norm(x.character) === ch), st = p ? (L.checkins[p.id] || { status: 'Called' }).status : '';
      return { ch, p, status: st, here: !!p && LiveModel.isHere(L, p.id) }; });
  }
  /** shots to tick off, cast, department needs, storyboard frames, notes and links */
  context(s) {
    const P = this.P, f = this._fx, ST = f.shotStatuses(), out = {};
    if (P.mode === 'photo') {
      const shots = P.photo.shots.filter(x => x.sceneId === s.id);
      out.shots = shots.map(x => ({ id: x.id, on: ST.indexOf(x.status) >= 1, hero: !!x.hero, status: x.status, label: f.photoShotLabel(P, x, this.scenes), title: x.title || '' }));
    } else {
      out.shots = P.shots.filter(x => x.sceneId === s.id).map(x => { const tk = (P.takes || []).filter(t => t.shotId === x.id);
        return { id: x.id, on: !!x.done, label: f.shotLabel(P, x), size: x.size || '', desc: [x.size, x.angle, x.move, x.desc].filter(Boolean).join(' · '), takes: tk.length, circled: tk.filter(t => t.status === 'circle').length }; });
    }
    out.shotsDone = out.shots.filter(x => x.on).length;
    out.cast = this.castFor(s);
    const seen = new Set();
    out.needs = P.tags.filter(t => t.sceneId === s.id && !['cast', 'notes'].includes(t.cat)).filter(t => { const k = t.cat + ':' + (t.itemId || t.text.toLowerCase()); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => f.catOrder(a.cat) - f.catOrder(b.cat)).map(t => ({ text: t.text, cat: t.cat, color: f.catInfo(t.cat).color, label: f.catInfo(t.cat).label }));
    out.frames = (P.boards || []).filter(b => b.sceneId === s.id && b.img);
    const meta = P.sceneMeta[s.id] || {}; out.notes = [meta.notes, meta.synopsis && meta.synopsis !== s.synopsis ? meta.synopsis : ''].filter(Boolean)[0] || '';
    out.links = this.links();
    return out;
  }
  /** jump links to the scene's other pages: [label, icon, view] */
  links() { const P = this.P; return [['Script', 'pen', 'script'], ['Breakdown', 'tag', 'breakdown'], ['Shot list', 'camera', P.mode === 'photo' ? 'photoshots' : 'shots'], ['Storyboard', 'image', 'board'], ['Take log', 'clipboard', 'takes']].filter(([, , v]) => this._fx.has(P, v)); }
  has(view) { return this._fx.has(this.P, view); }
  /** what the ⋮ menu offers for a scene in a given state */
  menuFor(r) {
    const st = (r.it || {}).status, idle = st !== 'active' && st !== 'done' && st !== 'dropped', open = st !== 'done' && st !== 'dropped';
    return { start: idle, complete: st === 'active', delay: open, reorder: open && !this.plan.fromRun, defer: open, drop: open, editTimes: !idle, reset: !idle };
  }

  /* ---------- the shared panels (problems, check-in, tasks, log) ---------- */
  get issueItems() { const W = this.W; return this.board.sceneRows.map(r => ({ id: r.id, label: `${W.item} ${r.scene.num}. ${r.scene.label}` })); }
  /** check-in groups: the cast the day needs (photo: all named talent), and the crew */
  get groups() {
    const P = this.P, d = this.day, W = this.W, photo = P.mode === 'photo', f = this._fx, need = new Set();
    this.board.sceneRows.forEach(r => { if (r.state !== 'dropped') f.castOf(P, r.scene).forEach(ch => need.add(ch)); });
    const callOf = p => { const c = (d.calls && d.calls[p.id]) || {}; return c.call || c.time || (d.cs || {}).crew || null; };
    return [{ key: 'cast', label: W.cast, empty: `No ${W.cast.toLowerCase()} needed today.`, people: P.people.filter(p => p.type === 'cast' && (photo ? p.name : need.has(f.norm(p.character)))).map(p => ({ p, sub: photo ? p.role || p.character : p.character, call: callOf(p) })) },
      { key: 'crew', label: W.crew, empty: 'No crew listed — add them in Cast & crew.', people: P.people.filter(p => p.type === 'crew' && p.name).map(p => ({ p, sub: [p.role, p.dept].filter(Boolean).join(' · '), call: callOf(p) })) }];
  }
  get date() { return this.day.date || this._fx.today(); }
  /** today's tasks: overdue, due by today, for today's scenes, blocked or in progress */
  taskFilter() { const date = this.date, set = new Set(this.day.sceneIds); return t => this._fx.isOverdue(t) || (t.due && t.due <= date) || (t.sceneId && set.has(t.sceneId)) || t.status === 'blocked' || t.status === 'doing'; }

  /* ---------- commands (each saves, records undo and redraws) ---------- */
  _do(fn) { const day = this.day, at = this._fx.clock(); return this.commit(P => fn(P, day, at, this.W)); }
  _scene(id, fn) { const s = this.sceneOf(id); return s ? this._do((P, d, at, W) => fn(P, d, s, at, W)) : false; }
  startDay() { this._do((P, d, at) => LiveModel.startDay(P, d, at)); }
  /** ids not finished yet (the view asks before wrapping if there are any) */
  get openIds() { return LiveModel.openIds(this.P, this.day); }
  wrapDay() { return this._do((P, d, at, W) => LiveModel.wrapDay(P, d, at, W)); }
  reopenDay() { this._do((P, d) => LiveModel.reopenDay(P, d)); }
  startScene(id) { this._scene(id, (P, d, s, at, W) => LiveModel.startScene(P, d, s, at, W)); }
  completeScene(id) { this._scene(id, (P, d, s, at, W) => LiveModel.completeScene(P, d, s, at, W)); }
  reopenScene(id) { this._scene(id, (P, d, s, at, W) => LiveModel.reopenScene(P, d, s, W, at)); }
  dropScene(id, why = '') { this._scene(id, (P, d, s, at, W) => LiveModel.dropScene(P, d, s, why, W, at)); }
  moveScene(id, dir) { const ids = this.plan.rows.filter(r => r.kind === 'scene').map(r => r.id); return this._scene(id, (P, d, s, at, W) => LiveModel.moveScene(P, d, ids, s, dir, W, at)); }
  /** where a scene can go: { next: {n, date} | null, nextHasOtherPart } */
  deferOptions(id) { const P = this.P, d = this.day, next = P.days[this.n]; return { next: next ? { n: this.n + 1, date: next.date } : null, blocked: !!next && !LiveModel.canDeferTo(d, next, id) }; }
  /** target: 'next' | 'new' | 'drop'; false (nothing changed) if the next day has another part of it */
  deferScene(id, target) {
    const d = this.day, next = this.P.days[this.n];
    if (target === 'next' && (!next || !LiveModel.canDeferTo(d, next, id))) return false;
    return this._scene(id, (P, day, s, at, W) => LiveModel.deferScene(P, day, s, target, W, at));
  }
  addDelay(id, mins, why, note = '') { return this._scene(id, (P, d, s, at, W) => LiveModel.addDelay(P, d, s, mins, why, note, W, at)); }
  /** actual times as "HH:MM" ('' = none), on the date the scene started (else today) */
  setTimes(id, a, b) {
    const it = LiveModel.item(this.L, id), start = LiveModel.timeOn(a, it.start || this.nowMs), end = LiveModel.timeOn(b, start || this.nowMs);
    this._scene(id, (P, d, s, at, W) => LiveModel.setTimes(P, d, s, start, end, W, at));
  }
  /** the actual times of a scene as "HH:MM" for the edit dialog */
  timesOf(id) { const it = LiveModel.item(this.L, id), hm = ms => ms ? LiveModel.fromMin(Math.round(LiveModel.msMin(ms))) : ''; return { start: hm(it.start), end: hm(it.end) }; }
  lunchOut() { this._do((P, d, at) => LiveModel.lunchOut(P, d, at)); }
  lunchIn() { this._do((P, d, at) => LiveModel.lunchIn(P, d, at)); }
  checkIn(personId, status) { const p = this.P.people.find(x => x.id === personId); if (p) this._do((P, d, at) => LiveModel.checkIn(LiveModel.ensure(P, d), p, status, at)); }
  /** tap a shot: ticked / unticked (photo: shot / back to planned) */
  toggleShot(shotId) {
    const P = this.P, photo = P.mode === 'photo', ST = this._fx.shotStatuses(), x = (photo ? P.photo.shots : P.shots).find(s => s.id === shotId); if (!x) return;
    this._do((P, d, at) => {
      const L = LiveModel.ensure(P, d);
      if (photo) { x.status = ST.indexOf(x.status) >= 1 ? 'Planned' : 'Shot'; LiveModel.log(L, `Shot ${this._fx.photoShotLabel(P, x, this.scenes)} ${x.status === 'Shot' ? 'shot' : 'back to planned'}`, 'ok', at); }
      else { x.done = !x.done; LiveModel.log(L, `Shot ${this._fx.shotLabel(P, x)} ${x.done ? 'done' : 'reopened'}`, x.done ? 'ok' : 'sys', at); }
    });
  }
  /** change the day's record from a shared panel: fn(L, P, at) */
  edit(fn) { return this._do((P, d, at) => fn(LiveModel.ensure(P, d), P, at)); }
  logToReport() { this._do((P, d) => LiveModel.logToReport(DprModel.ensure(P, d.id), LiveModel.ensure(P, d), this.W)); }
}
