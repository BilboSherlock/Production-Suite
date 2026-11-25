'use strict';
/* ===================================================================
   Run of show — MODEL
   The minute-by-minute plan of a photo shoot day, kept per day in
   P.photo.runs[dayId]: rows { id, start 'HH:MM', dur (minutes), kind,
   title, sceneId, notes }. Building it from the schedule, rippling
   start times, and the finish time. Pure functions: no DOM, no Store,
   no UI state. See js/mvvm.js.
   =================================================================== */

const RunModel = (() => {
  const KINDS = ['Setup', 'Hair & makeup', 'Wardrobe', 'Break', 'Lunch', 'Move', 'Review', 'Wrap', 'Other'];
  /** where a day starts when it has no call time (08:00) */
  const DEFAULT_START = 480;
  const FIELDS = ['start', 'dur', 'kind', 'title', 'sceneId', 'notes'];

  /** 'HH:MM' → minutes after midnight (null when not a time) */
  const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  /** minutes → 'HH:MM', wrapping round midnight */
  const fromMin = n => { n = ((Math.round(n) % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };

  const row = (o = {}) => Object.assign({ id: newId(), start: '08:00', dur: 30, kind: 'Other', title: '', sceneId: '', notes: '' }, o);
  const rows = (H, dayId) => ((H && H.runs) || {})[dayId] || [];
  /** the day's rows, created when missing */
  function ensure(H, dayId) { H.runs = H.runs || {}; return H.runs[dayId] = H.runs[dayId] || []; }
  const isBreak = r => r.kind === 'Lunch' || r.kind === 'Break';
  /** minutes after midnight when the last row ends (null when empty or untimed) */
  function end(R) { const l = R[R.length - 1], t = l && toMin(l.start); return t === null || t === undefined ? null : t + (+l.dur || 0); }
  /** the finish time and whether it runs past the planned wrap */
  function finish(R, cs) { const e = end(R); if (e === null) return null; const w = cs ? toMin(cs.wrap) : null; return { end: fromMin(e), late: !!w && e > w }; }

  /** start times ripple down from row `from` (each row starts when the one before ends) */
  function reflow(R, from = 0) { let t = toMin(R[from] && R[from].start); if (t === null) return false; for (let i = from; i < R.length; i++) { R[i].start = fromMin(t); t += +R[i].dur || 0; } return true; }

  /**
   * build a day from the schedule → rows.
   * f: { call: 'HH:MM' | '' (when the day starts), crew: 'HH:MM' | '' (crew call: meal hours count
   *      from here, else from the start), mealHours (default 6), setups: [{ id, num, name, loc, est (minutes), shots }] }
   * Hair & makeup first; a move whenever the location changes; lunch before the first setup that
   * would run past the meal deadline (once at least 2 hours have gone by); otherwise a 15-minute
   * break after every 2½ hours of setups; wrap.
   */
  function build(f) {
    const out = []; let t = toMin(f.call) ?? DEFAULT_START, prevLoc = null, since = 0, lunched = false;
    const t0 = t, mealDue = (toMin(f.crew) ?? t0) + (+f.mealHours || 6) * 60;
    const push = (kind, title, dur, extra = {}) => { out.push(row(Object.assign({ start: fromMin(t), dur, kind, title }, extra))); t += dur; since += kind === 'Setup' ? dur : 0; };
    const list = f.setups || [];
    if (list.length) push('Hair & makeup', 'Talent in hair & makeup', 45, { notes: 'First talent ready for set at ' + fromMin(t + 45) });
    list.forEach(s => {
      const loc = s.loc || ''; if (prevLoc !== null && loc && prevLoc && loc !== prevLoc) push('Move', `Move to ${loc}`, 30); prevLoc = loc || prevLoc;
      const est = +s.est || 60;
      if (!lunched && t - t0 >= 120 && t + est > mealDue) { push('Lunch', 'Lunch', 60); lunched = true; since = 0; } else if (since >= 150) { push('Break', 'Break', 15); since = 0; }
      push('Setup', `${s.num}. ${s.name}`, est, { sceneId: s.id, notes: s.shots ? `${s.shots} shot${s.shots > 1 ? 's' : ''}` : '' });
    });
    if (list.length) push('Wrap', 'Wrap & gear check', 30);
    return out;
  }

  /* ---------- editing ---------- */
  const find = (R, id) => R.find(r => r.id === id) || null;
  /** a new row starting when the last one ends */
  function add(R) { const e = end(R); const r = row({ start: e === null ? '08:00' : fromMin(e) }); R.push(r); return r; }
  /** change a field; a new start or length ripples the times below */
  function update(R, id, k, v) {
    const i = R.findIndex(r => r.id === id); if (i < 0 || !FIELDS.includes(k)) return false;
    if (k === 'kind' && !KINDS.includes(v)) return false;
    if (k === 'start' && toMin(v) === null) return false;
    R[i][k] = k === 'dur' ? Math.max(0, +v || 0) : String(v ?? '');
    if (k === 'start' || k === 'dur') reflow(R, i);
    return true;
  }
  /** swap a row with the one above; it takes that row's start time and the times below ripple */
  function moveUp(R, id) {
    const i = R.findIndex(r => r.id === id); if (i < 1) return false;
    const t0 = R[i - 1].start; [R[i - 1], R[i]] = [R[i], R[i - 1]]; R[i - 1].start = t0; reflow(R, i - 1); return true;
  }
  /** delete a row (the times below stay where they are) */
  function remove(R, id) { const i = R.findIndex(r => r.id === id); if (i < 0) return false; R.splice(i, 1); return true; }
  /** clear links to setups that no longer exist (ok(sceneId) → still there) */
  function unlinkMissing(H, ok) { let n = 0; Object.values((H && H.runs) || {}).forEach(R => R.forEach(r => { if (r.sceneId && !ok(r.sceneId)) { r.sceneId = ''; n++; } })); return n; }

  /** printed table rows; castOf(sceneId) → 'Ann, Bo'; time(t) formats a time */
  const printRows = (R, castOf, time = t => t) => R.map(r => [time(r.start), r.dur, r.title, r.kind, r.sceneId ? castOf(r.sceneId) : '', r.notes]);

  return { KINDS, DEFAULT_START, FIELDS, toMin, fromMin, row, rows, ensure, isBreak, end, finish, reflow, build, find, add, update, moveUp, remove, unlinkMissing, printRows };
})();
