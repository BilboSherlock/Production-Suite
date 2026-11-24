'use strict';
/* ===================================================================
   Schedule — MODEL
   Shoot / rehearsal days (P.days, in schedule order) and which scenes
   are booked on each (day.sceneIds, in shooting order). Pure functions —
   no DOM, no Store. See js/mvvm.js.

   Scenes themselves come from the script (getScenes); functions that need
   them take the list as an argument so they can be tested with plain data.
   A day may still list a scene that has since been deleted from the script:
   that link is kept on purpose (Ctrl+Z in the script brings the scene back
   with its schedule) and only "Clean up unused data" removes it.

   SPLIT SCENES (a scene shot over several days)
   A split scene has parts: P.sceneMeta[sceneId].parts = [{ id, eighths, note }]
   (two or more, in script order). Each part is booked on at most one day, and
   a day holds at most one part of a scene: day.parts[sceneId] = partId. The
   scene's id is in day.sceneIds of every day holding one of its parts, so
   anything that asks "which scenes / which cast work today" stays right; only
   page and time totals need the part's share (ScheduleModel.share).
   On the board each thing you can drag is a "slot": a whole scene (key =
   scene id) or one part (key = "sceneId~partId").
   =================================================================== */

/**
 * @typedef {object} Day
 * @property {string} id
 * @property {string} date      YYYY-MM-DD, or '' while undated
 * @property {string} kind      Shoot, Prep, Pickup, Reshoot (film) · Rehearsal, Tech, Dress, Performance (stage)
 * @property {string[]} sceneIds
 * @property {object} cs        call-sheet details (times, weather, hospital…)
 * @property {object} calls     per-person call times, by person id
 * @property {Object<string,string>} [parts]  for split scenes: sceneId → the part booked on this day
 * @typedef {{ id: string, eighths: number, ioe?: string, night?: boolean, label?: string }} SceneLike
 */

const ScheduleModel = {
  STAGE_KINDS: ['Shoot', 'Rehearsal', 'Tech', 'Dress', 'Performance'],
  FILM_KINDS: ['Shoot', 'Prep', 'Pickup', 'Reshoot'],
  kindsFor(P) { return P.mode === 'stage' ? ScheduleModel.STAGE_KINDS : ScheduleModel.FILM_KINDS; },

  /** @returns {Day} */
  createDay(P, date = '') {
    return { id: newId(), date, kind: P.mode === 'stage' ? 'Rehearsal' : 'Shoot', sceneIds: [],
      cs: { crew: '07:00', shoot: '08:00', lunch: '', wrap: '', sunrise: '', sunset: '', weather: '', temp: '', hospital: '', hospAddr: '', basecamp: '', office: '', notes: '', safety: '' }, calls: {} };
  },
  /** a date n days on, optionally moved forward past a weekend (n = 0 just skips the weekend) */
  addDays(iso, n, skipWeekend = false) {
    const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
    if (skipWeekend) while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return localISODate(d);
  },
  /** the strip colour class: INT/EXT × day/night */
  stripClass(s) { if (!s.ioe) return 's-x'; const ext = /^(EXT|EST)/.test(s.ioe); return `s-${ext ? 'ext' : 'int'}-${s.night ? 'night' : 'day'}`; },

  /* ---------- queries ---------- */
  findDay(P, id) { return P.days.find(d => d.id === id) || null; },
  /** the day's scenes that still exist, in shooting order */
  dayScenes(P, d, scenes) { const by = new Map(scenes.map(s => [s.id, s])); return d.sceneIds.map(id => by.get(id)).filter(Boolean); },
  scheduledIds(P) { return new Set(P.days.flatMap(d => d.sceneIds)); },
  /** scenes with anything left to book (a whole scene, or any part of a split one) */
  unscheduled(P, scenes) { const left = new Set(ScheduleModel.unscheduledSlots(P, scenes).map(x => x.scene.id)); return scenes.filter(s => left.has(s.id)); },
  eighths(list) { return list.reduce((a, s) => a + (+s.eighths || 0), 0); },
  stats(P, scenes) {
    const un = ScheduleModel.unscheduled(P, scenes).length;
    return { scenes: scenes.length, scheduled: scenes.length - un, unscheduled: un, days: P.days.length, eighths: ScheduleModel.eighths(scenes),
      split: scenes.filter(s => ScheduleModel.isSplit(P, s.id)).length };
  },

  /* ---------- split scenes ---------- */
  /** the stored parts of a split scene ([] if it is not split) */
  rawParts(P, sceneId) { const m = P.sceneMeta && P.sceneMeta[sceneId], r = m && Array.isArray(m.parts) ? m.parts : []; return r.length >= 2 ? r : []; },
  isSplit(P, sceneId) { return ScheduleModel.rawParts(P, sceneId).length >= 2; },
  /**
   * The parts of a split scene, sized to fit the scene as it is now: the script may have grown or
   * shrunk since it was split, so the difference is taken up by the last parts (each keeps at least 1/8).
   * @returns {{ id: string, eighths: number, note: string, n: number, of: number }[]}
   */
  partsOf(P, s) {
    const raw = ScheduleModel.rawParts(P, s.id); if (!raw.length) return [];
    const out = raw.map(p => ({ id: p.id, note: p.note || '', eighths: Math.max(1, Math.round(+p.eighths || 1)) }));
    let diff = Math.max(out.length, +s.eighths || 0) - out.reduce((a, p) => a + p.eighths, 0);
    for (let i = out.length - 1; diff !== 0 && i >= 0; i--) { const d = diff > 0 ? diff : Math.max(diff, 1 - out[i].eighths); out[i].eighths += d; diff -= d; }
    return out.map((p, i) => Object.assign(p, { n: i + 1, of: out.length }));
  },
  /** split `total` eighths into `n` near-equal whole eighths, biggest first */
  evenSizes(total, n) { const base = Math.floor(total / n), extra = total - base * n; return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)); },
  /** what of scene `s` is shot on day `d`: its part (if split) and that share of its pages */
  share(P, d, s) {
    const pid = d.parts && d.parts[s.id], part = pid ? ScheduleModel.partsOf(P, s).find(p => p.id === pid) : null;
    if (!part) return { eighths: s.eighths, frac: 1, part: null, label: '' };
    return { eighths: part.eighths, frac: s.eighths ? part.eighths / s.eighths : 1 / part.of, part, label: `pt ${part.n}/${part.of}` };
  },
  slotKey(sceneId, partId) { return partId ? `${sceneId}~${partId}` : sceneId; },
  parseKey(key) { key = String(key); const i = key.indexOf('~'); return i < 0 ? [key, null] : [key.slice(0, i), key.slice(i + 1)]; },
  /** the day's strips, in shooting order */
  slots(P, d, scenes) {
    return ScheduleModel.dayScenes(P, d, scenes).map(s => { const sh = ScheduleModel.share(P, d, s); return Object.assign({ key: ScheduleModel.slotKey(s.id, sh.part && sh.part.id), scene: s }, sh); });
  },
  /** pages shot on a day (split scenes count only their part) */
  dayEighths(P, d, scenes) { return ScheduleModel.slots(P, d, scenes).reduce((a, x) => a + x.eighths, 0); },
  /** whole scenes not on any day, and parts not on any day, in script order */
  unscheduledSlots(P, scenes) {
    const sch = ScheduleModel.scheduledIds(P), out = [];
    scenes.forEach(s => {
      const parts = ScheduleModel.partsOf(P, s);
      if (!parts.length) { if (!sch.has(s.id)) out.push({ key: s.id, scene: s, eighths: s.eighths, frac: 1, part: null, label: '' }); return; }
      const booked = new Set(P.days.map(d => d.parts && d.parts[s.id]).filter(Boolean));
      parts.filter(p => !booked.has(p.id)).forEach(p => out.push({ key: ScheduleModel.slotKey(s.id, p.id), scene: s, eighths: p.eighths, frac: s.eighths ? p.eighths / s.eighths : 1 / p.of, part: p, label: `pt ${p.n}/${p.of}` }));
    });
    return out;
  },
  /** which day each part is on: [{ part, dayId | null }] */
  partBookings(P, s) { return ScheduleModel.partsOf(P, s).map(p => ({ part: p, dayId: (P.days.find(d => d.parts && d.parts[s.id] === p.id) || {}).id || null })); },
  /** the date a new day gets: the next weekday after the last day, or none */
  nextDate(P) { const last = P.days[P.days.length - 1]; return last && last.date ? ScheduleModel.addDays(last.date, 1, true) : ''; },

  /* ---------- changes (mutate the project) ---------- */
  addDay(P, date = ScheduleModel.nextDate(P)) { const d = ScheduleModel.createDay(P, date); P.days.push(d); return d; },
  removeDay(P, id) { const n = P.days.length; P.days = P.days.filter(d => d.id !== id); return P.days.length !== n; },
  /** undated days go last; otherwise the order is kept (stable sort) */
  sortByDate(P) { P.days.sort((a, b) => (a.date || '9').localeCompare(b.date || '9')); },
  updateDay(P, id, patch) {
    const d = ScheduleModel.findDay(P, id); if (!d) return null;
    if ('kind' in patch) d.kind = String(patch.kind || 'Shoot');
    if ('date' in patch) d.date = /^\d{4}-\d{2}-\d{2}$/.test(patch.date || '') ? patch.date : '';
    return d;
  },
  setDayHours(P, h) { P.settings.dayHours = Math.min(24, Math.max(1, +h || 10)); },
  setMinsPerPage(P, m) { P.settings.minsPerPage = Math.min(600, Math.max(5, +m || 60)); },
  /**
   * Book a scene on a day (or unschedule it: dayId = null). `index` is its position among the
   * day's *visible* strips (scenes that still exist, given by `liveIds`), as drag and drop reports it.
   */
  moveScene(P, sceneId, dayId, index = Infinity, liveIds = null) {
    const target = dayId ? ScheduleModel.findDay(P, dayId) : null;
    if (dayId && !target) return false;
    P.days.forEach(d => { d.sceneIds = d.sceneIds.filter(x => x !== sceneId); });
    if (!target) return true;
    const visible = liveIds ? target.sceneIds.filter(id => liveIds.has(id)) : target.sceneIds;
    const before = visible[index], at = before ? target.sceneIds.indexOf(before) : target.sceneIds.length;
    target.sceneIds.splice(at, 0, sceneId);
    return true;
  },
  /**
   * Split a scene into parts of the given sizes (eighths), or change an existing split.
   * A scene already on a day keeps its first part there. When a split shrinks, the parts
   * that go are taken off their days. sizes must be 2+ whole numbers >= 1.
   * @returns the stored parts, or null if sizes are invalid
   */
  setSplit(P, s, sizes) {
    sizes = (sizes || []).map(x => Math.round(+x)); if (sizes.length < 2 || sizes.some(x => !(x >= 1))) return null;
    P.sceneMeta = P.sceneMeta || {}; const m = P.sceneMeta[s.id] = P.sceneMeta[s.id] || {};
    const old = ScheduleModel.rawParts(P, s.id);
    const parts = sizes.map((e, i) => ({ id: old[i] ? old[i].id : newId(), eighths: e, note: old[i] ? old[i].note || '' : '' }));
    if (!old.length) {   // newly split: wherever the whole scene was booked now holds part 1
      P.days.filter(d => d.sceneIds.includes(s.id)).forEach((d, i) => { if (i === 0) { d.parts = d.parts || {}; d.parts[s.id] = parts[0].id; } else d.sceneIds = d.sceneIds.filter(x => x !== s.id); });
    } else {             // parts that no longer exist come off their days
      const keep = new Set(parts.map(p => p.id));
      P.days.forEach(d => { const pid = d.parts && d.parts[s.id]; if (pid && !keep.has(pid)) { delete d.parts[s.id]; d.sceneIds = d.sceneIds.filter(x => x !== s.id); } });
    }
    m.parts = parts; return parts;
  },
  setPartNote(P, sceneId, partId, note) { const p = ScheduleModel.rawParts(P, sceneId).find(x => x.id === partId); if (p) p.note = String(note || ''); return !!p; },
  /** put a split scene back together: it stays on the first day (in schedule order) that had a part */
  merge(P, sceneId) {
    if (!ScheduleModel.isSplit(P, sceneId)) return null;
    let kept = null;
    P.days.forEach(d => {
      if (d.parts) delete d.parts[sceneId];
      if (!d.sceneIds.includes(sceneId)) return;
      if (!kept) kept = d; else d.sceneIds = d.sceneIds.filter(x => x !== sceneId);
    });
    delete P.sceneMeta[sceneId].parts;
    return kept ? kept.id : '';
  },
  /**
   * Move a strip (a whole scene or one part, by slot key) to a day at a visible position,
   * or unschedule it (dayId = null). A day cannot hold two parts of one scene: returns false.
   */
  moveSlot(P, key, dayId, index = Infinity, liveIds = null) {
    const [sid, pid] = ScheduleModel.parseKey(key);
    if (!pid) return ScheduleModel.moveScene(P, sid, dayId, index, liveIds);
    if (!ScheduleModel.rawParts(P, sid).some(p => p.id === pid)) return false;
    const target = dayId ? ScheduleModel.findDay(P, dayId) : null; if (dayId && !target) return false;
    const from = P.days.find(d => d.parts && d.parts[sid] === pid);
    if (target && target !== from && target.parts && target.parts[sid]) return false;
    if (from) { delete from.parts[sid]; from.sceneIds = from.sceneIds.filter(x => x !== sid); }
    if (!target) return true;
    const visible = liveIds ? target.sceneIds.filter(id => liveIds.has(id)) : target.sceneIds;
    const before = visible[index], at = before ? target.sceneIds.indexOf(before) : target.sceneIds.length;
    target.sceneIds.splice(at, 0, sid); target.parts = target.parts || {}; target.parts[sid] = pid;
    return true;
  },
  /** the slot key of scene `sceneId` as booked on day `d` */
  keyOn(P, d, sceneId) { return ScheduleModel.slotKey(sceneId, d.parts && d.parts[sceneId]); },
  /**
   * Put every unscheduled scene onto new days, about `pagesPerDay` pages each.
   * groupByLocation keeps scenes at the same place together (fewer company moves);
   * locOf(scene) names a scene's location. Returns the days created.
   */
  autoSchedule(P, scenes, { pagesPerDay = 4, start = '', skipWeekends = true, groupByLocation = true } = {}, locOf = s => s.location || '') {
    const un = ScheduleModel.unscheduledSlots(P, scenes); if (!un.length) return [];
    let order = un;
    if (groupByLocation) {
      const g = new Map();
      un.forEach(x => { const k = (locOf(x.scene) || x.scene.label || '').toUpperCase(); if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
      order = [...g.values()].flat();
    }
    const cap = Math.max(1, Math.round((+pagesPerDay || 4) * 8)), made = [];
    let day = null, used = 0, date = start || '';
    order.forEach(x => {
      /* a new day when this one is full, or already has another part of the same scene */
      if (!day || (used + x.eighths > cap && day.sceneIds.length) || day.sceneIds.includes(x.scene.id)) {
        if (day && date) date = ScheduleModel.addDays(date, 1, skipWeekends); else if (date && skipWeekends) date = ScheduleModel.addDays(date, 0, true);
        day = ScheduleModel.createDay(P, date); P.days.push(day); made.push(day); used = 0;
      }
      day.sceneIds.push(x.scene.id); used += x.eighths;
      if (x.part) { day.parts = day.parts || {}; day.parts[x.scene.id] = x.part.id; }
    });
    return made;
  },

  /* ---------- calendar ---------- */
  /** 6 weeks × 7 days starting on the Sunday on or before the 1st of the month `ym` (YYYY-MM) */
  calendarCells(ym) {
    const [y, m] = ym.split('-').map(Number), first = new Date(y, m - 1, 1), start = new Date(y, m - 1, 1 - first.getDay()), out = [];
    for (let k = 0; k < 42; k++) { const d = new Date(start); d.setDate(start.getDate() + k); out.push({ iso: localISODate(d), date: d.getDate(), inMonth: d.getMonth() === m - 1 }); }
    return out;
  },
  shiftMonth(ym, n) { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return localISODate(d).slice(0, 7); },
  /** the month to open on: the first dated day, or this month */
  firstMonth(P, today = localISODate()) { const dated = P.days.map(d => d.date).filter(Boolean).sort(); return (dated[0] || today).slice(0, 7); },
};

/* names the rest of the app already uses (samples, live dashboard, daily report, call sheets) */
const DAY_KINDS = ScheduleModel.STAGE_KINDS;
const stripCls = s => ScheduleModel.stripClass(s);
const newDay = (P, date = '') => ScheduleModel.createDay(P, date);
const dayScenes = (P, d, scenes) => ScheduleModel.dayScenes(P, d, scenes);
const addDays = (iso, n, skipWeekend) => ScheduleModel.addDays(iso, n, skipWeekend);
