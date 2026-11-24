'use strict';
/* ===================================================================
   Podcast recorder — MODEL
   The live recording desk for a podcast episode: the rundown being
   recorded, pacing, editor markers, pre-flight, sponsor reads, and the
   editor's hand-off sheet. Pure functions — no DOM, no Store.
   Freeflow shows pace against the episode's target length and the
   must-cover topics left; filmed shows add camera switches, clip and
   sync markers, video pre-flight and card warnings (see PodcastModel
   for the plan itself).

   The recording clock is passed in (`clock`): the app's PodTimer, or a
   plain object in tests — { running, elapsedSec, startTime, activeSegIdx,
   segStartSec, markers, start(), pause() }.
   The session is saved with the project as a live-desk record
   (LiveModel) keyed 'podcast': { started, ended, issues, log, checkins,
     markers:[{time, label, kind}], preflight:{key: bool},
     rec:{running, startTime, elapsed, seg, segStart} }
   so a reload or a sleeping tablet never loses a take.
   =================================================================== */

const PodLiveModel = {
  SESSION: { id: 'podcast' },
  MARKS: [['retake', '🔖 Retake', 'Retake / line flub'], ['quote', '⭐ Clip', 'Highlight / golden quote'], ['cut', '✂ Cut', 'Cut point / dead air'], ['glitch', '⚠ Glitch', 'Audio glitch / mic pop']],
  PREFLIGHT: [['levels', 'Mic input levels checked (−12 dB peaks)'], ['backup', 'Backup / 32-bit float recording running'], ['room', 'HVAC, fans & room noise off'], ['headphones', 'Zero-latency headphone monitor'], ['notify', 'Phone & computer notifications off'], ['water', 'Water at hand']],
  ISSUE_CATS: ['Audio', 'Room', 'Connection', 'Guest', 'Equipment', 'Content', 'Other'],
  QUICK_ISSUES: [['Mic clipping', 'Audio', 'High'], ['Background noise', 'Room', 'Medium'], ['Guest connection drop', 'Connection', 'High']],
  /** tapping a segment's status moves it on */
  NEXT_STATUS: { Planned: 'Recording', Recording: 'Covered', Covered: 'Cut', Cut: 'Planned' },
  /* freeflow shows: a tangent worth keeping (or cutting) */
  FREE_MARKS: [['tangent', '↪ Tangent', 'Tangent — keep or cut']],
  /* filmed shows */
  VIDEO_MARKS: [['clipIn', '▶ Clip in', 'Clip in'], ['clipOut', '■ Clip out', 'Clip out'], ['sync', '👏 Sync clap', 'Sync clap / slate'], ['reframe', '🎥 Reframe', 'Camera reframe / focus pull']],
  PREFLIGHT_VIDEO: [['cams', 'Every camera rolling — ISO record on each'], ['cards', 'Card space & batteries for the whole session'], ['framing', 'Framing, focus & white balance locked'],
    ['lights', 'Lights on — no flicker on camera'], ['set', 'Set dressed — no clutter or stray logos in shot'], ['slate', 'Sync clap / slate after rolling']],
  ISSUE_CATS_VIDEO: ['Audio', 'Camera', 'Lighting', 'Room', 'Connection', 'Guest', 'Equipment', 'Content', 'Other'],
  QUICK_ISSUES_VIDEO: [['Camera stopped recording', 'Camera', 'Critical'], ['Out of focus', 'Camera', 'Medium'], ['Mic clipping', 'Audio', 'High'], ['Light flicker', 'Lighting', 'Medium']],

  isFree: pd => !!pd && pd.format === 'freeflow',
  isVideo: pd => !!pd && pd.medium === 'video',
  /** the checks, markers and problem types for this kind of show */
  preflightList: pd => PodLiveModel.isVideo(pd) ? [...PodLiveModel.PREFLIGHT, ...PodLiveModel.PREFLIGHT_VIDEO] : PodLiveModel.PREFLIGHT,
  marksFor: pd => [...PodLiveModel.MARKS, ...(PodLiveModel.isFree(pd) ? PodLiveModel.FREE_MARKS : []), ...(PodLiveModel.isVideo(pd) ? PodLiveModel.VIDEO_MARKS : [])],
  issueCats: pd => PodLiveModel.isVideo(pd) ? PodLiveModel.ISSUE_CATS_VIDEO : PodLiveModel.ISSUE_CATS,
  quickIssues: pd => PodLiveModel.isVideo(pd) ? PodLiveModel.QUICK_ISSUES_VIDEO : PodLiveModel.QUICK_ISSUES,

  /* ---------- formats ---------- */
  /** seconds → "mm:ss" */
  fmtSec(s) { const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; },
  /** "5", 5, "4:30" → minutes */
  parseDur(v) {
    if (typeof v === 'number') return v;
    const s = String(v || '').trim();
    if (s.includes(':')) { const p = s.split(':'); return Math.max(0, (+p[0] || 0) + (+p[1] || 0) / 60); }
    return Math.max(0, parseFloat(s) || 0);
  },

  /* ---------- the session record ---------- */
  /** the saved session, filled in with defaults (read only) */
  read(P) { const L = LiveModel.read(P, PodLiveModel.SESSION); return Object.assign(L, { markers: L.markers || [], preflight: L.preflight || {}, rec: L.rec || {} }); },
  ensure(P) { const L = LiveModel.ensure(P, PodLiveModel.SESSION); L.markers = L.markers || []; L.preflight = L.preflight || {}; L.rec = L.rec || {}; return L; },
  /** copy the clock into the saved session */
  saveRec(L, clock) { L.rec = { running: clock.running, startTime: clock.startTime, elapsed: clock.elapsedSec, seg: clock.activeSegIdx, segStart: clock.segStartSec }; L.markers = clock.markers; },
  /** set the clock from a saved session (after a reload or switching project); `now` in ms */
  restore(clock, rec, markers, now) {
    if (clock.running) clock.pause();
    clock.markers = markers; clock.activeSegIdx = rec.seg || 0; clock.segStartSec = rec.segStart || 0;
    clock.elapsedSec = rec.running && rec.startTime ? Math.floor((now - rec.startTime) / 1000) : (rec.elapsed || 0);
    if (rec.running) clock.start();
  },

  /* ---------- where the recording stands ---------- */
  /** each segment's planned start and length in minutes (cut segments take none) */
  timing(rundown) { let cum = 0; const rows = rundown.map(s => { const start = cum, dur = s.status === 'Cut' ? 0 : PodLiveModel.parseDur(s.dur); cum += dur; return { start, dur }; }); return { rows, total: cum }; },
  /** the segment being recorded (kept inside the rundown) */
  curIdx(rundown, clock) { return Math.max(0, Math.min(clock.activeSegIdx || 0, rundown.length - 1)); },
  /**
   * What comes after segment i. In running order; or, for a freeflow show (free = true),
   * the next topic not yet talked about — must-covers first, then nice-to-haves, then if-time.
   */
  nextOf(rundown, i, free = false) {
    if (!free) return rundown.slice(i + 1).find(s => s.status !== 'Cut') || null;
    for (const p of ['Must', 'Nice', 'If time']) { const s = rundown.find((x, j) => j !== i && x.status === 'Planned' && (x.priority || 'Nice') === p); if (s) return s; }
    return null;
  },
  /**
   * Pacing, segment time and what is left. With the plan (pd) of a freeflow show the pace is
   * measured against the episode's target length and the must-cover topics still to come.
   */
  state(rundown, clock, pd = null) {
    const f = PodLiveModel.fmtSec, free = PodLiveModel.isFree(pd), i = PodLiveModel.curIdx(rundown, clock), cur = rundown[i], tm = PodLiveModel.timing(rundown);
    const el = clock.elapsedSec, begun = el > 0, segEl = Math.max(0, el - clock.segStartSec), segTarget = Math.max(30, PodLiveModel.parseDur(cur.dur) * 60);
    const base = { idx: i, cur, next: PodLiveModel.nextOf(rundown, i, free), timing: tm.rows, live: !!clock.running, begun, elapsed: el, segEl, segTarget, free,
      covered: rundown.filter(s => s.status === 'Covered').length, active: rundown.filter(s => s.status !== 'Cut').length };
    if (free) {
      const target = (pd.target || tm.total) * 60, left = target - el, open = s => s.status === 'Planned' || s.status === 'Recording';
      const mustLeft = rundown.filter(s => (s.priority || 'Nice') === 'Must' && open(s));
      const mustSec = mustLeft.reduce((a, s) => a + PodLiveModel.parseDur(s.dur) * 60 - (s === cur && s.status === 'Recording' ? Math.min(segEl, PodLiveModel.parseDur(s.dur) * 60) : 0), 0);
      const pace = !begun ? ['Ready', 'muted'] : left < 0 ? [`Over ${f(-left)}`, 'bad'] : mustSec > left ? [`Tight · ${mustLeft.length} must left`, 'warn'] : [`${f(left)} left`, 'good'];
      return Object.assign(base, { totalMin: target / 60, segOver: 0, diff: -left, pace, remainMin: Math.max(0, left) / 60, left, mustLeft, mustSec,
        topicsLeft: rundown.filter(s => s.status === 'Planned').length });
    }
    const segOver = segEl - segTarget, plannedAt = tm.rows[i].start * 60 + Math.min(segEl, segTarget), diff = el - plannedAt;
    const pace = !begun ? ['Ready', 'muted'] : Math.abs(diff) < 30 ? ['On time', 'good'] : diff > 0 ? [`Behind ${f(diff)}`, diff > 180 ? 'bad' : 'warn'] : [`Ahead ${f(-diff)}`, 'info'];
    const remainMin = tm.rows.slice(i + 1).reduce((a, x) => a + x.dur, 0) + Math.max(0, segTarget - segEl) / 60;
    return Object.assign(base, { totalMin: tm.total, segOver, diff, pace, remainMin });
  },
  /** the camera on air: the latest camera-switch marker's label, or '' (markers newest first) */
  curCam(markers) { const m = markers.find(x => x.kind === 'cam'); return m ? m.label.replace(/^Cam: /, '') : ''; },
  /** filmed shows: each camera's card, by minutes recorded — [{ cam, left }] for cards within 10 minutes of full */
  cardsLow(pd, elapsedSec) { return ((pd.video && pd.video.cameras) || []).filter(c => +c.cardMins > 0).map(c => ({ cam: c, left: +c.cardMins - elapsedSec / 60 })).filter(x => x.left <= 10); },
  /** alerts: [tone, message, action?] — action = { label, cmd: 'addTime' | 'showPreflight' } */
  alerts(pd, L, st) {
    const out = [], f = PodLiveModel.fmtSec, cur = st.cur, guest = cur.guestId ? pd.guests.find(g => g.id === cur.guestId) : null, pre = PodLiveModel.preflightDone(L, PodLiveModel.preflightList(pd));
    L.issues.filter(i => i.status !== 'Resolved' && i.sev === 'Critical').forEach(i => out.push(['crit', `Critical: ${i.title}`]));
    if (guest && guest.nogo) out.push(['crit', `${guest.name} — off limits: ${guest.nogo}`]);
    if (PodLiveModel.isVideo(pd) && st.begun) PodLiveModel.cardsLow(pd, st.elapsed).forEach(({ cam, left }) => out.push(left <= 0 ? ['crit', `${cam.name}: card may be full — check it’s still recording`] : ['warn', `${cam.name}: card fills in ~${Math.ceil(left)} min — swap at the next break`]));
    if (st.free) {
      if (st.begun && st.left < 0) out.push(['warn', `Over the ${Math.round(st.totalMin)} min target by ${f(-st.left)}`]);
      else if (st.begun && st.mustLeft.length && (st.mustSec > st.left || st.left < 600)) out.push(['warn', `${st.mustLeft.length} must-cover topic${st.mustLeft.length > 1 ? 's' : ''} left with ${f(st.left)} to go: ${st.mustLeft.map(s => s.title).join(', ')}`]);
    } else if (st.segOver > 30) out.push(['warn', `“${cur.title}” is ${f(st.segOver)} over its ${PodLiveModel.parseDur(cur.dur)} min`, { label: '+2 min', cmd: 'addTime' }]);
    const list = PodLiveModel.preflightList(pd);
    if (!st.begun && pre < list.length) out.push(['warn', `Pre-flight: ${pre} of ${list.length} checks done`, { label: 'Show', cmd: 'showPreflight' }]);
    if (PodLiveModel.isVideo(pd) && st.begun && !(L.markers || []).some(m => m.kind === 'sync')) out.push(['tip', 'No sync clap yet — clap on camera so the editor can line up the cameras and audio', { label: 'Clap now', cmd: 'sync' }]);
    const unread = pd.sponsors.filter(s => !s.recorded), later = st.free ? pd.rundown.filter(s => s.status === 'Planned') : pd.rundown.slice(st.idx + 1);
    if (st.begun && unread.length && !later.some(s => s.sponsorId)) out.push(['tip', `${unread.length} sponsor read${unread.length > 1 ? 's' : ''} not recorded yet: ${unread.map(s => s.name).join(', ')}`]);
    return out;
  },
  /** how many of the pre-flight checks are done (list: the show's checks — see preflightList) */
  preflightDone(L, list = PodLiveModel.PREFLIGHT) { return list.filter(([k]) => L.preflight[k]).length; },
  /** check-in: hosts, guests and crew */
  groups(P, pd) {
    return [{ key: 'hosts', label: 'Hosts', people: P.people.filter(p => p.type === 'cast' && p.name).map(p => ({ p, sub: p.role || p.character || 'Host' })) },
      { key: 'guests', label: 'Guests', people: pd.guests.filter(x => x.name).map(x => ({ p: x, sub: x.title || 'Guest' })) },
      { key: 'crew', label: 'Crew', people: P.people.filter(p => p.type === 'crew' && p.name).map(p => ({ p, sub: [p.role, p.dept].filter(Boolean).join(' · ') })) }];
  },
  /** tasks shown during a recording: undated, due by today, blocked or in progress */
  taskFilter(date) { return t => !t.due || t.due <= date || t.status === 'blocked' || t.status === 'doing'; },

  /* ---------- recording (L = the saved session; at = ms) ---------- */
  addMarker(clock, label, kind = 'marker') { clock.markers.unshift({ time: clock.elapsedSec, label: label || `Marker ${clock.markers.length + 1}`, kind }); },
  removeMarker(clock, index) { if (index >= 0 && index < clock.markers.length) clock.markers.splice(index, 1); },
  /** record / pause */
  toggleRecord(pd, clock, L, at) {
    const f = PodLiveModel.fmtSec, cur = pd.rundown[PodLiveModel.curIdx(pd.rundown, clock)];
    if (clock.running) { clock.pause(); LiveModel.log(L, `Paused at ${f(clock.elapsedSec)}`, 'sys', at); return 'paused'; }
    const begun = clock.elapsedSec > 0;
    if (!L.started) L.started = at;
    clock.start(); if (cur && cur.status === 'Planned') cur.status = 'Recording';
    LiveModel.log(L, begun ? `Resumed at ${f(clock.elapsedSec)}` : 'Recording started', 'sys', at);
    return 'recording';
  },
  /**
   * Jump to a segment. The one being recorded is covered when going on — or, in a freeflow show,
   * whichever way you go (you talked about it) — and back to planned when going back.
   */
  goTo(pd, clock, L, i, at) {
    const rd = pd.rundown, ci = PodLiveModel.curIdx(rd, clock), cur = rd[ci]; if (!rd[i] || i === ci) return false;
    if (cur.status === 'Recording') cur.status = i > ci || PodLiveModel.isFree(pd) ? 'Covered' : 'Planned';
    clock.activeSegIdx = i; clock.segStartSec = clock.elapsedSec;
    if (clock.running && rd[i].status === 'Planned') rd[i].status = 'Recording';
    PodLiveModel.addMarker(clock, `Started: ${rd[i].title}`, 'segment'); LiveModel.log(L, `${PodLiveModel.isFree(pd) ? 'Topic' : `Segment ${i + 1}`}: ${rd[i].title}`, 'scene', at);
    return true;
  },
  /** finish this segment and start the next (freeflow: the next topic still to talk about); false when there is none */
  next(pd, clock, L, at) {
    const rd = pd.rundown, ci = PodLiveModel.curIdx(rd, clock);
    rd[ci].status = 'Covered';
    const n = PodLiveModel.nextOf(rd, ci, PodLiveModel.isFree(pd)); if (!n) return false;
    PodLiveModel.goTo(pd, clock, L, rd.indexOf(n), at); return true;
  },
  /** cut the current segment (freeflow: skip the topic) and move on */
  cut(pd, clock, L, at) {
    const rd = pd.rundown, ci = PodLiveModel.curIdx(rd, clock), cur = rd[ci], word = PodLiveModel.isFree(pd) ? 'Skipped topic' : 'Cut segment';
    PodLiveModel.addMarker(clock, `${word}: ${cur.title}`, 'warn'); LiveModel.log(L, `${word}: ${cur.title}`, 'warn', at);
    cur.status = 'Cut';
    const n = PodLiveModel.nextOf(rd, ci, PodLiveModel.isFree(pd)); if (!n) return false;
    PodLiveModel.goTo(pd, clock, L, rd.indexOf(n), at); return true;
  },
  /** freeflow: a tangent worth coming back to — parked at the end as an if-time topic, with a marker */
  park(pd, clock, L, seg, at) {
    Object.assign(seg, { priority: 'If time', status: 'Planned', parked: true }); pd.rundown.push(seg);
    PodLiveModel.addMarker(clock, `Parked: ${seg.title}`, 'tangent'); LiveModel.log(L, `Parked for later: ${seg.title}`, 'note', at);
    return seg;
  },
  /** filmed shows: the camera the director cut to, as a marker for the editor */
  camSwitch(clock, cam) { PodLiveModel.addMarker(clock, `Cam: ${cam.name}${cam.shot ? ' · ' + cam.shot : ''}`, 'cam'); },
  /** back to 00:00 for a fresh take: clock, markers and the saved recording state (problems and the log stay) */
  newSession(pd, clock, L, at) {
    clock.pause(); Object.assign(clock, { elapsedSec: 0, startTime: 0, activeSegIdx: 0, segStartSec: 0, markers: [] });
    if (clock.checkedBullets) clock.checkedBullets.clear(); if (clock.checkedQuestions) clock.checkedQuestions.clear();
    pd.rundown.forEach(s => { if (s.status === 'Recording') s.status = 'Planned'; });
    Object.assign(L, { started: null, ended: null, rec: {} }); LiveModel.log(L, 'New session — clock reset to 00:00', 'sys', at);
  },
  addTime(seg, mins = 2) { seg.dur = (parseFloat(seg.dur) || 1) + mins; },
  cycleStatus(seg) { seg.status = PodLiveModel.NEXT_STATUS[seg.status] || 'Planned'; },
  /** swap a segment with its neighbour, keeping the clock on the same segment */
  move(pd, clock, i, d) {
    const rd = pd.rundown, j = i + d; if (j < 0 || j >= rd.length) return false;
    [rd[i], rd[j]] = [rd[j], rd[i]];
    if (clock.activeSegIdx === i) clock.activeSegIdx = j; else if (clock.activeSegIdx === j) clock.activeSegIdx = i;
    return true;
  },
  /** a new segment straight after the current one */
  addSegment(pd, clock, seg) { pd.rundown.splice(PodLiveModel.curIdx(pd.rundown, clock) + 1, 0, seg); return seg; },
  setSponsorRecorded(clock, sp, on) { sp.recorded = !!on; if (sp.recorded) PodLiveModel.addMarker(clock, `Sponsor read: ${sp.name}`, 'cue'); },
  setPreflight(L, key, on) { if ([...PodLiveModel.PREFLIGHT, ...PodLiveModel.PREFLIGHT_VIDEO].some(([k]) => k === key)) L.preflight[key] = !!on; },
  /** wrap: stop the clock, cover the segment being recorded */
  wrap(pd, clock, L, at) {
    clock.pause(); const cur = pd.rundown[PodLiveModel.curIdx(pd.rundown, clock)]; if (cur && cur.status === 'Recording') cur.status = 'Covered';
    PodLiveModel.addMarker(clock, `Session wrapped (${PodLiveModel.fmtSec(clock.elapsedSec)})`, 'sys');
    L.ended = at; LiveModel.log(L, 'Session wrapped', 'sys', at);
  },

  /* ---------- the hand-off sheet ---------- */
  /**
   * The editor's hand-off: text and totals. o = { date (YYYY-MM-DD), clockTxt(min) }
   */
  handoff(P, pd, L, clock, o) {
    const f = PodLiveModel.fmtSec, rd = pd.rundown, rec = clock.elapsedSec, covered = rd.filter(s => s.status === 'Covered').length, cut = rd.filter(s => s.status === 'Cut').length, marks = [...clock.markers].reverse(), issues = L.issues;
    const free = PodLiveModel.isFree(pd), video = PodLiveModel.isVideo(pd), cams = (pd.video && pd.video.cameras) || [], ch = PodcastModel.recordedChapters(clock.markers, (rd.find(s => s.status === 'Covered') || {}).title || 'Intro');
    const clips = video || marks.some(m => m.kind === 'quote' || m.kind === 'clipIn') ? PodcastModel.clips(clock.markers) : [], sync = marks.find(m => m.kind === 'sync');
    const lines = [`EPISODE RECORDING — HAND-OFF`, `Show: ${P.title}`, `Episode: ${pd.epNumber || '1'}${pd.season ? ' (season ' + pd.season + ')' : ''}`, `Date: ${o.date}`, `Recorded: ${f(rec)}`, `${free ? 'Topics' : 'Segments'} covered: ${covered} of ${rd.length}${cut ? ` (${cut} ${free ? 'skipped' : 'cut'})` : ''}`,
      ...(free || video ? [`Format: ${PodcastModel.formatLabel(pd.format)} · ${PodcastModel.mediumLabel(pd.medium)}`] : []), '',
      free ? 'TOPICS' : 'RUNNING ORDER', ...rd.map((s, i) => `${i + 1}. [${s.status.toUpperCase()}] ${s.title} (${free ? `${s.priority || 'Nice'}, ~${s.dur} min${s.parked ? ', parked tangent' : ''}` : `${s.dur} min planned`})`), '',
      ...(video ? ['CAMERAS', ...(cams.length ? cams.map(c => `${c.name} — ${c.shot}${c.who ? ` (op: ${c.who})` : ''}`) : ['(no cameras listed in the plan)']),
        sync ? `Sync clap at ${f(sync.time)}` : 'No sync clap marked — sync by audio waveform', ''] : []),
      ...(ch.length > 1 ? ['CHAPTERS (from the recording)', ...ch.map(c => `${PodcastModel.stamp(c.sec)} ${c.title}`), ''] : []),
      ...(clips.length ? ['CLIPS FOR SOCIAL', ...clips.map((c, i) => `${i + 1}. ${f(c.in)}–${f(c.out)} ${c.label}`), ''] : []),
      ...(marks.length ? ['EDITOR MARKERS', ...marks.map(m => `[${f(m.time)}] ${m.kind && !['marker', 'cam'].includes(m.kind) ? ({ clipIn: 'CLIP IN', clipOut: 'CLIP OUT' }[m.kind] || m.kind.toUpperCase()) + ': ' : ''}${m.label}`), ''] : []),
      ...(pd.sponsors.length ? ['SPONSOR READS', ...pd.sponsors.map(s => `[${s.recorded ? 'RECORDED' : 'NOT RECORDED'}] ${s.name} (${s.slot})${s.code ? ' — code ' + s.code : ''}`), ''] : []),
      ...(issues.length ? ['PROBLEMS', ...issues.map(i => `[${i.tc != null ? f(i.tc) : o.clockTxt(LiveModel.msMin(i.at))}] [${i.sev}] ${i.cat}: ${i.title}${i.status === 'Resolved' ? ' (resolved)' : ''}`)] : [])];
    const media = video ? `Video + audio · ${f(rec)} recorded · ${cams.length} camera${cams.length === 1 ? '' : 's'}` : `Audio · ${f(rec)} recorded`;
    return { text: lines.join('\n'), recorded: rec, covered, total: rd.length, markers: marks.length, problems: issues.length, clips: clips.length, media };
  },
  /**
   * File the hand-off in the daily report of the recording day (the chosen day, else today's, else the first —
   * a day is created if there is none). Returns that day.
   */
  fileHandoff(P, L, clock, h, o) {
    if (!P.days.length) P.days.push(Object.assign(ScheduleModel.createDay(P, o.date), { title: 'Episode recording' }));
    const d = P.days.find(x => x.id === o.dayId) || P.days.find(x => x.date === o.date) || P.days[0];
    const R = DprModel.ensure(P, d.id), start = clock.startTime || (o.now - clock.elapsedSec * 1000), hm = ms => LiveModel.fromMin(Math.round(LiveModel.msMin(ms)));
    R.t.crew = R.t.crew || hm(start); R.t.wrap = hm(o.now);
    R.notes = [R.notes, h.text].filter(Boolean).join('\n\n');
    if (L.issues.length) R.incidents = L.issues.map(i => `[${i.sev}] ${i.cat}: ${i.title}`).join('\n');
    R.media = h.media || `Audio · ${PodLiveModel.fmtSec(clock.elapsedSec)} recorded`;
    return d;
  },
};
