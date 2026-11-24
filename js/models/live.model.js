'use strict';
/* ===================================================================
   Live desk — MODEL
   The record of a live session (a shoot day, or a podcast recording),
   the planned running order, the forecast, and every change made on the
   day. Pure functions — no DOM, no Store. Times are passed in (`at` =
   epoch ms, `now` = minutes since midnight) so the rules can be tested.

   P.live.days[dayId] = { started, ended (ms), meal:{out,in}, order:[sceneId],
     items:{ [sceneId]: {status: pending|active|done|dropped, start, end, extra (min), note} },
     checkins:{ [personId]: {status, at} }, issues:[…], log:[{at, msg, kind}] }
   Reading never adds a record; changes go through ensure().
   =================================================================== */

const LiveModel = {
  ISSUE_CATS: ['Weather', 'Equipment', 'Camera', 'Lighting', 'Sound', 'Cast', 'Crew', 'Location', 'Safety', 'Schedule', 'Creative', 'Transport', 'Other'],
  SEV: [['Low', '#8a8f98'], ['Medium', '#e8a40c'], ['High', '#e8830c'], ['Critical', '#e5484d']],
  CHECK_STAGES: ['Called', 'En route', 'Arrived', 'In makeup', 'On set', 'Wrapped', 'No show'],
  CHECK_HERE: ['Arrived', 'In makeup', 'On set'],
  DELAY_REASONS: ['Weather', 'Equipment', 'Cast late', 'Camera', 'Lighting', 'Location', 'Safety', 'Creative', 'Other'],
  /** quick-logged problems pick a category from their wording ("generator noise" → Sound) */
  ISSUE_WORDS: [['Sound', /\b(sound|audio|mic|noise|hum|buzz|boom|wind|lav|feedback|clip)/i], ['Weather', /\b(rain|weather|storm|sun|cloud|snow|cold|heat|hot)/i],
    ['Camera', /\b(camera|lens|focus|card|battery|sensor|monitor|frame)/i], ['Lighting', /\b(light|lamp|flicker|bulb|gel|generator|genny|power)/i],
    ['Cast', /\b(actor|cast|talent|guest|host|lines|makeup|wardrobe)/i], ['Crew', /\b(crew|operator|grip|gaffer)/i], ['Safety', /\b(injur|hurt|safety|fire|medic|hazard)/i],
    ['Location', /\b(location|permit|neighbou?r|parking|venue|police)/i], ['Transport', /\b(van|truck|car|traffic|transport|driver)/i], ['Schedule', /\b(late|behind|delay|overtime|time)/i],
    ['Equipment', /\b(cable|stand|tripod|kit|broken|gear|equipment|laptop|interface|connection)/i]],

  /* ---------- time ---------- */
  toMin(t) { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; },
  fromMin(n) { n = ((Math.round(n) % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); },
  /** an instant as minutes since local midnight */
  msMin(ms) { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; },
  durTxt(m) { const a = Math.abs(Math.round(m)); return a >= 60 ? `${Math.floor(a / 60)}h ${String(a % 60).padStart(2, '0')}m` : `${a}m`; },
  /** a time of day for log lines: W.clock (the app's 12/24-hour format) or HH:MM */
  clock(W, m) { return W && W.clock ? W.clock(m) : LiveModel.fromMin(m); },
  sevColor(s) { return (LiveModel.SEV.find(x => x[0] === s) || LiveModel.SEV[1])[1]; },
  sevRank(s) { return LiveModel.SEV.findIndex(x => x[0] === s); },

  /** the words a suite uses: scene / setup / segment, cast / talent */
  words(P) {
    return Object.assign({ item: 'Scene', items: 'scenes', Items: 'Scenes', crew: 'Crew', cast: 'Cast', day: 'shoot day' },
      P.mode === 'photo' ? { item: 'Setup', items: 'setups', Items: 'Setups', cast: 'Talent' } : P.mode === 'av' ? { item: 'Segment', items: 'segments', Items: 'Segments', cast: 'Talent' } : P.mode === 'stage' ? { day: 'rehearsal or show day' } : {});
  },

  /* ---------- the session record ---------- */
  blank() { return { started: 0, ended: 0, items: {}, order: [], checkins: {}, issues: [], log: [], meal: { out: 0, in: 0 } }; },
  /** the day's record, or a blank one that is not saved */
  read(P, day) { const L = P.live && P.live.days && P.live.days[day.id]; return L ? Object.assign(LiveModel.blank(), L) : LiveModel.blank(); },
  /** the day's record, created (and filled in) when first written to */
  ensure(P, day) {
    P.live = P.live || { days: {} }; P.live.days = P.live.days || {};
    const L = P.live.days[day.id] = P.live.days[day.id] || {};
    for (const [k, v] of Object.entries(LiveModel.blank())) if (L[k] === undefined) L[k] = v;
    return L;
  },
  log(L, msg, kind = '', at = Date.now()) { L.log.unshift({ at, msg, kind }); if (L.log.length > 300) L.log.length = 300; },
  item(L, id) { return L.items[id] || { status: 'pending' }; },
  itemFor(L, id) { return L.items[id] = L.items[id] || {}; },

  /* ---------- the plan ---------- */
  /** minutes a scene / setup takes: its estimate, or pages × minutes per page, scaled to the day's part of a split scene (photo: an hour) */
  est(P, s, d) {
    if (P.mode === 'photo') return +(P.sceneMeta[s.id] || {}).est || 60;
    const m = P.sceneMeta[s.id], base = (m && +m.est) ? +m.est : Math.round(s.eighths / 8 * (+(P.settings || {}).minsPerPage || 60));
    return base * (d ? ScheduleModel.share(P, d, s).frac : 1);
  },
  /** the scene order for the day: the order set on the day, then anything added since */
  order(day, L) { const ids = (L.order || []).filter(id => day.sceneIds.includes(id)); day.sceneIds.forEach(id => { if (!ids.includes(id)) ids.push(id); }); return ids; },
  /**
   * The planned running order: the photo run of show if there is one, else scenes in order with
   * company moves between locations and lunch. o = { scenes, locOf(s), moveWord, mealHours }
   */
  plan(P, day, L, o) {
    const run = P.mode === 'photo' && P.photo && P.photo.runs && P.photo.runs[day.id];
    if (run && run.length) return LiveModel.planFromRun(run, o.scenes);
    const by = new Map(o.scenes.map(s => [s.id, s])), cs = day.cs || {}, tm = LiveModel.toMin;
    const call = tm(cs.shoot) ?? tm(cs.crew) ?? 480, lunchAt = tm(cs.lunch) ?? (call + Math.round(((+o.mealHours || 6) - 1.5) * 60));
    const rows = []; let t = call, prevLoc = null, lunch = false;
    LiveModel.order(day, L).filter(id => by.has(id)).forEach(id => {
      const s = by.get(id), loc = (o.locOf(s) || '').toUpperCase();
      if (prevLoc !== null && loc && prevLoc && loc !== prevLoc) { rows.push({ kind: 'move', id: 'mv' + id, start: t, dur: 30, label: `${o.moveWord} → ${o.locOf(s)}`, scene: s }); t += 30; }
      if (!lunch && t >= lunchAt) { rows.push({ kind: 'lunch', id: 'lunch', start: t, dur: 60, label: 'Lunch' }); t += 60; lunch = true; }
      const dur = LiveModel.est(P, s, day); rows.push({ kind: 'scene', id, scene: s, start: t, dur }); t += dur; prevLoc = loc || prevLoc;
    });
    return { rows, call, end: t, lunchAt };
  },
  planFromRun(run, scenes) {
    const by = new Map(scenes.map(s => [s.id, s])), rows = [], tm = LiveModel.toMin; let t = tm(run[0].start) ?? 480;
    run.forEach(r => {
      const start = tm(r.start) ?? t, dur = Math.max(0, +r.dur || 0); t = start + dur;
      if (r.kind === 'Lunch') rows.push({ kind: 'lunch', id: 'lunch', start, dur, label: 'Lunch' });
      else if (r.sceneId && by.has(r.sceneId) && !rows.some(x => x.id === r.sceneId)) rows.push({ kind: 'scene', id: r.sceneId, scene: by.get(r.sceneId), start, dur });
      else rows.push({ kind: r.kind === 'Move' ? 'move' : 'block', id: 'ros' + r.id, start, dur, label: r.title || r.kind });
    });
    return { rows, call: rows.length ? rows[0].start : 480, end: t, lunchAt: (rows.find(r => r.kind === 'lunch') || {}).start, fromRun: true };
  },
  /** what is actually happening, and where the day is heading. `now` in minutes, `nowMs` for unfinished items */
  forecast(plan, L, now, nowMs = Date.now()) {
    const mm = LiveModel.msMin, out = []; let cursor = plan.call; const started = !!L.started, flow = r => { const fs = started ? Math.max(cursor, now) : Math.max(cursor, r.start); return [fs, fs + r.dur]; };
    plan.rows.forEach((r, i) => {
      const o = { ...r, fs: r.start, fe: r.start + r.dur, state: 'pending', extra: 0 };
      if (r.kind === 'scene') {
        const it = LiveModel.item(L, r.id); o.extra = +it.extra || 0; o.it = it; const dur = r.dur + o.extra;
        if (it.status === 'done') { o.state = 'done'; o.fs = mm(it.start || nowMs); o.fe = mm(it.end || nowMs); cursor = Math.max(cursor, o.fe); }
        else if (it.status === 'dropped') { o.state = 'dropped'; o.fs = o.fe = cursor; }
        else if (it.status === 'active') { o.state = 'active'; o.fs = mm(it.start); o.fe = Math.max(o.fs + dur, now + (now > o.fs + dur ? Math.max(5, dur * .1) : 0)); o.over = now > o.fs + dur; cursor = o.fe; }
        else { [o.fs] = flow(r); o.fe = o.fs + dur; cursor = o.fe; o.late = o.fs > r.start + 10; }
      } else if (r.kind === 'move') {
        const next = plan.rows.slice(i + 1).find(x => x.kind === 'scene'), ni = next && LiveModel.item(L, next.id).status;
        if (!plan.fromRun && (ni === 'done' || ni === 'dropped' || ni === 'active')) { o.state = 'skip'; o.fs = o.fe = cursor; } else { [o.fs, o.fe] = flow(r); cursor = o.fe; if (o.fe <= now && started) o.state = 'done'; }
      } else if (r.kind === 'lunch') {
        if (L.meal.in) { o.state = 'done'; o.fs = mm(L.meal.out); o.fe = mm(L.meal.in); cursor = Math.max(cursor, o.fe); }
        else if (L.meal.out) { o.state = 'active'; o.fs = mm(L.meal.out); o.fe = Math.max(o.fs + r.dur, now); cursor = o.fe; }
        else { [o.fs, o.fe] = flow(r); cursor = o.fe; }
      } else { [o.fs, o.fe] = flow(r); cursor = o.fe; if (o.fe <= now && started) o.state = 'done'; }
      out.push(o);
    });
    const live = out.filter(r => r.state !== 'skip' && r.state !== 'dropped'), wrap = live.length ? Math.max(...live.map(r => r.fe)) : plan.end;
    return { rows: out, wrap, delta: wrap - plan.end };
  },
  /** the schedule tile: [text, tone] */
  status(L, delta) {
    const d = LiveModel.durTxt;
    return L.ended ? ['Wrapped', 'muted'] : !L.started ? ['Not started', 'muted'] : delta > 20 ? [`Behind ${d(delta)}`, 'bad'] : delta > 5 ? [`Behind ${d(delta)}`, 'warn'] : delta < -10 ? [`Ahead ${d(-delta)}`, 'info'] : ['On time', 'good'];
  },
  /** the meal break is due this many hours after crew call */
  mealDue(day, plan, mealHours) { return (LiveModel.toMin((day.cs || {}).crew) ?? plan.call) + (+mealHours || 6) * 60; },

  /* ---------- running the day (each takes `at`, the moment it happened) ---------- */
  startDay(P, day, at) {
    const L = LiveModel.ensure(P, day); L.started = at; LiveModel.log(L, 'Day started', 'sys', at);
    const R = DprModel.ensure(P, day.id); if (!R.t.crew) R.t.crew = (day.cs || {}).crew || '';
  },
  /** ids of the day's scenes that are not done or dropped */
  openIds(P, day) { const L = LiveModel.read(P, day); return day.sceneIds.filter(id => !['done', 'dropped'].includes(LiveModel.item(L, id).status)); },
  /** wrap: unfinished scenes are dropped and marked Not shot in the daily report */
  wrapDay(P, day, at, W) {
    const L = LiveModel.ensure(P, day), R = DprModel.ensure(P, day.id), open = LiveModel.openIds(P, day);
    open.forEach(id => { Object.assign(LiveModel.itemFor(L, id), { status: 'dropped' }); R.scenes[id] = Object.assign(R.scenes[id] || {}, { status: 'Not shot' }); });
    L.ended = at; R.t.wrap = LiveModel.fromMin(Math.round(LiveModel.msMin(at))); LiveModel.log(L, `Day wrapped at ${LiveModel.clock(W, LiveModel.msMin(at))}`, 'sys', at);
    return open;
  },
  reopenDay(P, day) { LiveModel.ensure(P, day).ended = 0; },
  startScene(P, day, s, at, W) {
    const L = LiveModel.ensure(P, day), it = LiveModel.itemFor(L, s.id);
    if (!L.started) { L.started = at; LiveModel.log(L, 'Day started', 'sys', at); }
    it.status = 'active'; it.start = at; delete it.end; LiveModel.log(L, `Started ${W.item.toLowerCase()} ${s.num} — ${s.label}`, 'scene', at);
    const R = DprModel.ensure(P, day.id); if (!R.t.first) R.t.first = LiveModel.fromMin(Math.round(LiveModel.msMin(at)));
  },
  /** complete: the daily report gets the scene's pages (its share, if split) and its shot count as setups */
  completeScene(P, day, s, at, W) {
    const L = LiveModel.ensure(P, day), it = LiveModel.itemFor(L, s.id), est = LiveModel.est(P, s, day), d = LiveModel.durTxt;
    if (!it.start) it.start = at - est * 6e4;
    it.status = 'done'; it.end = at; LiveModel.log(L, `Completed ${W.item.toLowerCase()} ${s.num} (${d((it.end - it.start) / 6e4)} vs ${d(est)} planned)`, 'scene', at);
    const R = DprModel.ensure(P, day.id), shots = P.shots.filter(x => x.sceneId === s.id).length, prev = R.scenes[s.id] || {};
    R.scenes[s.id] = Object.assign(prev, { status: 'Completed', pgs: String(ScheduleModel.share(P, day, s).eighths), setups: prev.setups || (shots ? String(shots) : '') });
  },
  reopenScene(P, day, s, W, at) { const L = LiveModel.ensure(P, day), it = L.items[s.id]; if (it) { it.status = 'pending'; delete it.start; delete it.end; } LiveModel.log(L, `${W.item} ${s.num} reset to pending`, 'scene', at); },
  dropScene(P, day, s, why, W, at) {
    const L = LiveModel.ensure(P, day), R = DprModel.ensure(P, day.id);
    Object.assign(LiveModel.itemFor(L, s.id), { status: 'dropped', note: why });
    R.scenes[s.id] = Object.assign(R.scenes[s.id] || {}, { status: 'Not shot' });
    LiveModel.log(L, `Dropped ${W.item.toLowerCase()} ${s.num}${why ? ': ' + why : ''}`, 'warn', at);
  },
  /** swap a scene with its neighbour in the day's order; false at either end */
  moveScene(P, day, sceneIds, s, dir, W, at) {
    const ids = [...sceneIds], i = ids.indexOf(s.id), j = i + dir; if (i < 0 || j < 0 || j >= ids.length) return false;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const L = LiveModel.ensure(P, day); L.order = ids; LiveModel.log(L, `Reordered: ${W.item.toLowerCase()} ${s.num} moved ${dir < 0 ? 'earlier' : 'later'}`, 'sys', at);
    return true;
  },
  /** can the scene go to `next`? Not if that day already has a different part of it */
  canDeferTo(day, next, id) { return !(next && next.parts && next.parts[id] && next.parts[id] !== (day.parts || {})[id]); },
  /**
   * take a scene (or today's part of it) off the day: to the next day, a new day after this one, or unscheduled.
   * Returns false (changing nothing) when the next day already has another part of it.
   */
  deferScene(P, day, s, target, W, at) {
    const n = P.days.indexOf(day), next = P.days[n + 1], id = s.id;
    if (target === 'next' && (!next || !LiveModel.canDeferTo(day, next, id))) return false;
    const L = LiveModel.ensure(P, day), key = ScheduleModel.keyOn(P, day, id);
    ScheduleModel.moveSlot(P, key, null); L.order = L.order.filter(x => x !== id); delete L.items[id];
    if (target === 'next') ScheduleModel.moveSlot(P, key, next.id, 0);
    else if (target === 'new') { const nd = ScheduleModel.createDay(P, day.date ? ScheduleModel.addDays(day.date, 1, true) : ''); P.days.splice(n + 1, 0, nd); ScheduleModel.moveSlot(P, key, nd.id, 0); }
    LiveModel.log(L, `Moved ${W.item.toLowerCase()} ${s.num} off today (${{ next: 'to Day ' + (n + 2), new: 'to a new day', drop: 'unscheduled' }[target]})`, 'warn', at);
    if (P.reports && P.reports[day.id]) delete P.reports[day.id].scenes[id];
    return true;
  },
  /** lost time on a scene: pushes its forecast, logs a problem and a line in the report's incidents */
  addDelay(P, day, s, mins, why, note, W, at, id = newId()) {
    const L = LiveModel.ensure(P, day), m = Math.max(1, +mins || 0), it = LiveModel.itemFor(L, s.id), clock = LiveModel.clock(W, LiveModel.msMin(at));
    it.extra = (+it.extra || 0) + m; LiveModel.log(L, `Delay +${m}m on ${W.item.toLowerCase()} ${s.num}: ${why}${note ? ' — ' + note : ''}`, 'warn', at);
    L.issues.unshift({ id, at, title: `${why} delay (${m} min)`, cat: why === 'Cast late' ? 'Cast' : LiveModel.ISSUE_CATS.includes(why) ? why : 'Schedule', sev: m >= 30 ? 'High' : 'Medium', status: 'Open', owner: '', sceneId: s.id, notes: note, resolvedAt: 0, delay: m });
    const R = DprModel.ensure(P, day.id); R.incidents = [R.incidents, `${clock} — ${W.item} ${s.num}: ${why} delay, ${m} min${note ? ' (' + note + ')' : ''}`].filter(Boolean).join('\n');
    return m;
  },
  /** set actual start / finish (ms, 0 = none); a start and finish mark it done */
  setTimes(P, day, s, start, end, W, at) {
    const L = LiveModel.ensure(P, day), it = LiveModel.itemFor(L, s.id); it.start = start; it.end = end;
    if (start && end) it.status = 'done'; else if (start) it.status = 'active';
    LiveModel.log(L, `Times edited for ${W.item.toLowerCase()} ${s.num}`, 'sys', at);
  },
  /** "HH:MM" on the same date as `ref` (ms) → ms; '' → 0 */
  timeOn(t, ref) { if (!t) return 0; const d = new Date(ref || Date.now()), [H, M] = t.split(':').map(Number); d.setHours(H, M, 0, 0); return d.getTime(); },
  lunchOut(P, day, at) { const L = LiveModel.ensure(P, day); L.meal.out = at; DprModel.ensure(P, day.id).t.lunchOut = LiveModel.fromMin(Math.round(LiveModel.msMin(at))); LiveModel.log(L, 'Lunch out', 'sys', at); },
  lunchIn(P, day, at) { const L = LiveModel.ensure(P, day); L.meal.in = at; DprModel.ensure(P, day.id).t.lunchIn = LiveModel.fromMin(Math.round(LiveModel.msMin(at))); LiveModel.log(L, `Lunch in (${LiveModel.durTxt((L.meal.in - L.meal.out) / 6e4)})`, 'sys', at); },
  isHere(L, personId) { return LiveModel.CHECK_HERE.includes((L.checkins[personId] || {}).status); },
  checkIn(L, p, status, at) { L.checkins[p.id] = { status, at }; LiveModel.log(L, `${p.name || p.character}: ${status}`, 'sys', at); },

  /* ---------- problems ---------- */
  /** the same kind of problem under a podcast's names */
  CAT_ALIAS: { Sound: 'Audio', Location: 'Room' },
  guessCat(text, cats) {
    const name = c => cats.includes(c) ? c : cats.includes(LiveModel.CAT_ALIAS[c]) ? LiveModel.CAT_ALIAS[c] : null;
    const hit = LiveModel.ISSUE_WORDS.find(([c, re]) => name(c) && re.test(text));
    return hit ? name(hit[0]) : (cats.includes('Other') ? 'Other' : cats[cats.length - 1]);
  },
  addIssue(L, t, at, id = newId(), tc) {
    const iss = Object.assign({ id, at, cat: 'Other', sev: 'Medium', status: 'Open', owner: '', sceneId: '', notes: '', resolvedAt: 0 }, t, { title: String(t.title || '').trim() });
    if (tc != null) iss.tc = tc;          // e.g. the recording timecode on a podcast
    L.issues.unshift(iss); LiveModel.log(L, `Problem logged (${iss.sev}): ${iss.title}`, iss.sev === 'Critical' || iss.sev === 'High' ? 'warn' : 'sys', at);
    return iss;
  },
  updateIssue(L, id, patch) { const iss = L.issues.find(x => x.id === id); if (iss) Object.assign(iss, patch, patch.title != null ? { title: patch.title.trim() } : {}); return iss; },
  setIssueStatus(L, id, status, at) {
    const iss = L.issues.find(x => x.id === id); if (!iss) return null;
    iss.status = status; iss.resolvedAt = status === 'Resolved' ? at : 0;
    if (status === 'Resolved') LiveModel.log(L, `Resolved: ${iss.title}`, 'ok', at);
    return iss;
  },
  removeIssue(L, id) { L.issues = L.issues.filter(x => x.id !== id); },
  /** open first, worst first, newest first */
  sortIssues(list) { const r = LiveModel.sevRank; return [...list].sort((a, b) => ((a.status === 'Resolved') - (b.status === 'Resolved')) || (r(b.sev) - r(a.sev)) || (b.at - a.at)); },
  issueToTask(P, L, id, date, at) {
    const iss = L.issues.find(x => x.id === id); if (!iss || iss.taskId) return null;
    const t = TaskModel.add(P, iss.title, 'todo', { due: date, priority: LiveModel.sevRank(iss.sev) >= 2 ? 'High' : 'Normal', notes: iss.notes || '', sceneId: iss.sceneId || '', assignee: iss.owner || '' });
    iss.taskId = t.id; LiveModel.log(L, `Task created: ${iss.title}`, 'sys', at);
    return t;
  },

  /* ---------- tasks ---------- */
  /** blocked first, then in progress, then by due date */
  openTasks(P, filter) {
    return P.tasks.filter(t => t.status !== 'done' && (filter ? filter(t) : true))
      .sort((a, b) => ((b.status === 'blocked') - (a.status === 'blocked')) || ((b.status === 'doing') - (a.status === 'doing')) || (a.due || '9').localeCompare(b.due || '9'));
  },
  addTask(P, L, title, date, at) { const t = TaskModel.add(P, title.trim(), 'todo', { due: date }); LiveModel.log(L, `Task added: ${t.title}`, 'sys', at); return t; },
  /** tap to move on: to do / blocked → in progress → done */
  advanceTask(P, L, id, at) {
    const t = P.tasks.find(x => x.id === id); if (!t) return null;
    t.status = t.status === 'todo' || t.status === 'blocked' ? 'doing' : 'done'; if (t.status === 'done') LiveModel.log(L, `Task done: ${t.title}`, 'ok', at);
    return t;
  },
  setBlocked(P, id, on) { const t = P.tasks.find(x => x.id === id); if (t) t.status = on ? 'blocked' : 'todo'; return t; },

  /* ---------- log ---------- */
  /** copy the log, oldest first, into the report's general notes */
  logToReport(R, L, W) { R.notes = [R.notes, ...[...L.log].reverse().map(x => `${LiveModel.clock(W, LiveModel.msMin(x.at))} ${x.msg}`)].filter(Boolean).join('\n'); },
};
