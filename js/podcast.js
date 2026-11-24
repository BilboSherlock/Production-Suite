'use strict';
/* ===================================================================
   Podcast Suite — episode planner (structured, freeflow or scripted shows;
   audio-only or filmed), live clock, guest interview prep, sponsor reads,
   cameras & set, gear and show notes; and the live recording desk.
   Works alongside the script editor for hybrid & audio drama shows.
   =================================================================== */

/* The plan's data and rules live in PodcastModel (js/models/podcast.model.js); these names are kept
   for the sample project and older code. */
const POD = P => PodcastModel.ensure(P);
const RUNDOWN_STATUS = PodcastModel.STATUS;
const RUNDOWN_TONE = PodcastModel.TONE;
const SPONSOR_SLOTS = PodcastModel.SLOTS;
const POD_TEMPLATES = PodcastModel.TEMPLATES;
const newSegment = (o = {}) => PodcastModel.segment(o);
const newGuest = (o = {}) => PodcastModel.guest(o);
const newSponsor = (o = {}) => PodcastModel.sponsor(o);
const applyTemplate = (key, P, pd) => PodcastModel.applyTemplate(pd || POD(P), key);

/* mm:ss and minutes from "5" / "4:30" — see PodLiveModel (js/models/podlive.model.js) */
const fmtTimeSec = s => PodLiveModel.fmtSec(s);
const parseDurMin = v => PodLiveModel.parseDur(v);

/* ---------------------------------------------------------------
   Studio Web Audio Synthesizer (Zero-dependency soundboard)
   --------------------------------------------------------------- */
const PodAudio = {
  ctx: null,
  getCtx() {
    if (typeof window === 'undefined') return null;
    if (!PodAudio.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) PodAudio.ctx = new AC();
    }
    if (PodAudio.ctx && PodAudio.ctx.state === 'suspended') {
      PodAudio.ctx.resume().catch(() => {});
    }
    return PodAudio.ctx;
  },
  playChime() {
    try {
      const ctx = PodAudio.getCtx(); if (!ctx) return;
      const notes = [523.25, 659.25, 783.99];
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + idx * 0.12); osc.stop(now + idx * 0.12 + 0.65);
      });
    } catch (e) {}
  },
  playSyncBeeps() {
    try {
      const ctx = PodAudio.getCtx(); if (!ctx) return;
      const now = ctx.currentTime, beeps = [440, 440, 440, 880];
      beeps.forEach((freq, i) => {
        const t = now + (i * 0.45);
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.setValueAtTime(0, t + 0.08);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.09);
      });
    } catch (e) {}
  },
  playBleep(dur = 0.7) {
    try {
      const ctx = PodAudio.getCtx(); if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.setValueAtTime(0, now + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + dur + 0.02);
    } catch (e) {}
  },
  playGong() {
    try {
      const ctx = PodAudio.getCtx(); if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 1.2);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 1.45);
    } catch (e) {}
  },
  playPing() {
    try {
      const ctx = PodAudio.getCtx(); if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.22);
    } catch (e) {}
  }
};

/* ---------------------------------------------------------------
   Studio Live Mic VU Meter (Web Audio Analyser)
   --------------------------------------------------------------- */
const PodMicMeter = {
  stream: null,
  analyser: null,
  animId: null,
  currentDb: -60,
  peakDb: -60,
  isClipping: false,
  clipTimer: null,
  active: false,
  async start(onUpdate) {
    if (PodMicMeter.active || typeof window === 'undefined') return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof toast === 'function') toast('Microphone access not supported in this browser', true);
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      PodMicMeter.stream = stream;
      const ctx = PodAudio.getCtx();
      if (!ctx) return false;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      PodMicMeter.analyser = analyser;
      PodMicMeter.active = true;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (!PodMicMeter.active) return;
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const db = rms > 0.00001 ? Math.max(-60, 20 * Math.log10(rms)) : -60;
        PodMicMeter.currentDb = db;
        if (db > PodMicMeter.peakDb) PodMicMeter.peakDb = db;
        if (db > -1.5) {
          PodMicMeter.isClipping = true;
          clearTimeout(PodMicMeter.clipTimer);
          PodMicMeter.clipTimer = setTimeout(() => { PodMicMeter.isClipping = false; }, 1500);
        }
        if (onUpdate) onUpdate(db, PodMicMeter.peakDb, PodMicMeter.isClipping);
        PodMicMeter.animId = requestAnimationFrame(loop);
      };
      PodMicMeter.animId = requestAnimationFrame(loop);
      return true;
    } catch (err) {
      if (typeof toast === 'function') toast('Microphone permission denied or unavailable', true);
      PodMicMeter.active = false;
      return false;
    }
  },
  stop() {
    PodMicMeter.active = false;
    if (PodMicMeter.animId) {
      cancelAnimationFrame(PodMicMeter.animId);
      PodMicMeter.animId = null;
    }
    if (PodMicMeter.stream) {
      PodMicMeter.stream.getTracks().forEach(t => t.stop());
      PodMicMeter.stream = null;
    }
    PodMicMeter.analyser = null;
    PodMicMeter.currentDb = -60;
  }
};

/* ---------------------------------------------------------------
   Live Recording Timer State (module singleton)
   --------------------------------------------------------------- */
const PodTimer = {
  running: false,
  startTime: 0,
  elapsedSec: 0,
  intervalId: null,
  activeSegIdx: 0,
  segStartSec: 0,
  markers: [],
  checkedBullets: new Set(),
  checkedQuestions: new Set(),
  preflight: { levels: false, backup: false, room: false, headphones: false, notify: false, water: false },
  scriptPrompter: false,
  soundboardOpen: true,
  autoLogSound: true,
  micMeterActive: false,
  autoScroll: false,
  scrollSpeed: 1,
  prompterFontSize: 16,
  talentStatus: {},
  listeners: new Set(),
  subscribe(fn) { PodTimer.listeners.add(fn); return () => PodTimer.listeners.delete(fn); },
  notify() { PodTimer.listeners.forEach(fn => fn()); },
  start() {
    if (PodTimer.running) return;
    PodTimer.running = true;
    PodTimer.startTime = Date.now() - (PodTimer.elapsedSec * 1000);
    PodTimer.intervalId = setInterval(() => {
      PodTimer.elapsedSec = Math.floor((Date.now() - PodTimer.startTime) / 1000);
      PodTimer.notify();
    }, 1000);
    PodTimer.notify();
  },
  pause() {
    if (!PodTimer.running) return;
    PodTimer.running = false;
    clearInterval(PodTimer.intervalId);
    PodTimer.intervalId = null;
    PodTimer.notify();
  },
  reset() {
    PodTimer.pause();
    PodTimer.elapsedSec = 0;
    PodTimer.activeSegIdx = 0;
    PodTimer.segStartSec = 0;
    PodTimer.markers.length = 0;
    PodTimer.checkedBullets.clear();
    PodTimer.checkedQuestions.clear();
    PodTimer.notify();
  },
  addMarker(label, kind = 'marker') {
    PodTimer.markers.unshift({ time: PodTimer.elapsedSec, label: label || `Marker ${PodTimer.markers.length + 1}`, kind });
    PodTimer.notify();
  },
};

/* ===============================================================
   Episode planner — VIEW. Rundown (or freeflow topics), cameras & set
   for a filmed show, guest prep, sponsor reads, gear, show notes.
   Rules: PodcastModel; screen state and actions: PodcastVM
   (js/models/podcast.model.js, js/viewmodels/podcast.vm.js). The clock
   strip drives the same recording session as the live desk (PodLiveVM).
   =============================================================== */
Views.rundown = function (root) {
  const vm = new PodcastVM(), rec = new PodLiveVM();
  const wrap = h('div', { class: 'page podcast-suite', style: { maxWidth: '1280px' } }); root.append(wrap);
  const f = PodLiveModel.fmtSec, M = PodcastModel;
  const copy = (txt, msg) => { navigator.clipboard.writeText(txt); toast(msg); };
  const TONE = { good: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', info: 'var(--accent)', muted: 'var(--muted)' };
  const lbl = (t, o = {}) => h('label', Object.assign({ class: 'lbl small muted' }, o), t);
  const field = (label, el, style = {}) => h('div', { style: Object.assign({ flex: 1, minWidth: '200px' }, style) }, lbl(label), el);
  const opts = (list, cur, fmt = x => x) => list.map(x => h('option', { value: x, selected: x === cur }, fmt(x)));

  function draw() {
    const P = vm.P, tab = vm.tab;
    const head = h('div', { class: 'page-h' },
      h('div', {}, h('h2', {}, P.title), h('div', { class: 'muted small', style: { marginTop: '4px' } }, `Podcast planner · ${vm.summary}`)),
      h('span', { class: 'grow' }),
      h('a', { class: 'btn', href: `#/p/${P.id}/live` }, icon('play', 15), 'Live desk'),
      h('a', { class: 'btn', href: `#/p/${P.id}/script` }, icon('pen', 15), vm.isVideo ? 'Open script' : 'Open audio script'));
    const tabs = h('div', { class: 'tabs rep-tabs', style: { marginBottom: '16px' } },
      vm.tabs.map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: () => vm.setTab(k) }, l)));
    const body = { rundown: rundownTab, video: videoTab, guests: guestsTab, sponsors: sponsorsTab, gear: gearTab, notes: notesTab }[tab]();
    morph(wrap, [head, showBar(), tabs, h('div', { class: 'pod-content', 'data-key': 'tab-' + tab }, body)]);
  }

  /* ---------- the show: format, medium, target length ---------- */
  function showBar() {
    const fmt = vm.formats.find(x => x[0] === vm.format);
    return h('div', { class: 'card pod-show', 'data-key': 'show', style: { padding: '10px 16px', marginBottom: '14px' } },
      h('div', { class: 'row wrap', style: { gap: '10px 14px', alignItems: 'center' } },
        h('span', { class: 'small muted', style: { fontWeight: 600 } }, 'Show format'),
        h('div', { class: 'seg sm' }, vm.formats.map(([k, l, d]) => h('button', { class: vm.format === k ? 'on' : '', title: d, onclick: () => vm.setFormat(k) }, l))),
        h('span', { class: 'small muted', style: { fontWeight: 600, marginLeft: '6px' } }, 'Recorded as'),
        h('div', { class: 'seg sm' }, vm.media.map(([k, l]) => h('button', { class: vm.medium === k ? 'on' : '', onclick: () => vm.setMedium(k) }, icon(k === 'video' ? 'camera' : 'cue', 13), l))),
        vm.isFree ? h('span', { class: 'row', style: { gap: '6px', alignItems: 'center', marginLeft: '6px' } },
          h('span', { class: 'small muted', style: { fontWeight: 600 } }, 'Target length'),
          h('input', { class: 'inp sm', type: 'number', min: 0, step: 5, style: { width: '72px' }, value: vm.target, onchange: e => vm.setTarget(e.target.value) }),
          h('span', { class: 'small muted' }, 'min')) : null),
      h('div', { class: 'small muted', style: { marginTop: '6px' } }, fmt ? fmt[2] : '', vm.isVideo ? ' Filmed: plan cameras, the set and on-screen graphics in “Cameras & set”; the live desk adds camera switching, clip and sync markers.' : ''));
  }

  /* ---------- the recording clock (same session as the live desk) ---------- */
  const paceText = () => { if (!rec.hasRundown) return ['Add a segment to start', 'muted']; const st = rec.state; return [`${st.free ? 'Time' : 'Pacing'}: ${st.pace[0]}`, st.pace[1]]; };
  function recStrip() {
    const live = rec.clock.running, begun = rec.clock.elapsedSec > 0, [pt, tone] = paceText();
    return h('div', { class: 'card pod-timer-bar', 'data-key': 'clock', style: { padding: '14px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', background: 'var(--surface2)', borderColor: live ? 'var(--accent)' : 'var(--border)' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        h('span', { class: 'pill', style: { background: live ? 'var(--ok)' : 'var(--muted)', color: '#fff', fontWeight: 700 } }, live ? 'LIVE RECORDING' : begun ? 'PAUSED' : 'CLOCK READY'),
        h('b', { id: 'podLiveClock', style: { fontFamily: 'var(--mono)', fontSize: '26px', letterSpacing: '0.04em' } }, f(rec.clock.elapsedSec))),
      h('div', { id: 'podAheadBehind', class: 'small', style: { fontWeight: 600, color: TONE[tone] } }, pt),
      rec.isVideo && rec.curCam ? h('span', { class: 'chip' }, icon('camera', 12), rec.curCam) : null,
      h('span', { class: 'grow' }),
      h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'btn primary sm', disabled: !rec.hasRundown, onclick: () => rec.record() }, icon(live ? 'pause' : 'play', 14), live ? 'Pause' : begun ? 'Resume' : 'Start recording'),
        h('button', { class: 'btn sm', title: 'Reset the clock to 00:00 for a fresh take', onclick: async () => { if (await confirmBox('Reset the recording clock to 00:00 and clear this session’s markers? Problems and the activity log are kept.', 'New session', 'Start a new session?')) rec.newSession(); } }, icon('rotate', 14), 'New session'),
        h('button', { class: 'btn sm', disabled: !rec.hasRundown, title: 'Log a time marker for the editor', onclick: async () => { const l = await promptBox('Editor marker', 'What happened at this moment? (retake intro, audio drop…)', ''); if (l) { rec.mark(l, 'custom'); toast(`Marker logged at ${f(rec.clock.elapsedSec)}`); } } }, icon('pin', 14), 'Drop marker'),
        h('a', { class: 'btn sm', href: `#/p/${vm.P.id}/live` }, icon('right', 14), 'Live desk')));
  }

  /* ---------- rundown / topics ---------- */
  function templateMenu(anchor) {
    menu(anchor, vm.templates.map(t => ({ label: t.label, desc: t.desc + (t.format === 'freeflow' ? ' (Freeflow)' : '') + (t.medium === 'video' ? ' (Filmed)' : ''),
      onClick: async () => {
        if (vm.rundown.length && !(await confirmBox(`Replace the current rundown with “${t.label}”?`, 'Replace', 'Apply template?'))) return;
        vm.useTemplate(t.key); toast(`Applied ${t.label}`);
      } })));
  }
  function rundownTab() {
    const free = vm.isFree, n = vm.rundown.length, word = free ? 'topic' : 'segment';
    const toolbar = h('div', { class: 'toolbar', style: { marginBottom: '14px' } },
      h('button', { class: 'btn primary', onclick: () => vm.addSegment() }, icon('plus', 15), `Add ${word}`),
      h('button', { class: 'btn', onclick: e => templateMenu(e.currentTarget) }, icon('grid', 15), 'Apply template…'),
      h('span', { class: 'small muted', style: { marginLeft: '8px' } }, free ? `Topics add up to ~${Math.round(vm.plannedMin)} min · aiming for ${vm.target || Math.round(vm.plannedMin)} min` : `Total Planned Run: ~${Math.round(vm.plannedMin)} minutes (${f(vm.plannedMin * 60)})`),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', onclick: () => download(slugOf(vm.P.title) + '-rundown.csv', toCSV(vm.rundownCsv), 'text/csv') }, icon('download', 14), 'Export CSV'),
      h('button', { class: 'btn sm ghost', onclick: () => copy(vm.rundownText, free ? 'Topics copied' : 'Rundown copied to clipboard') }, icon('copy', 14), 'Copy summary'));
    if (!n) return [recStrip(), toolbar, h('div', { class: 'empty' },
      h('h3', {}, free ? 'No topics yet' : 'No segments planned yet'),
      h('p', {}, free ? 'List what you want to talk about and mark the must-covers. On the day, follow the conversation — the live desk shows what’s left and how much time you have.' : 'Add your first segment or pick a ready-made podcast template to build your episode flow.'),
      h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } },
        h('button', { class: 'btn primary', onclick: () => vm.useTemplate(free ? 'conversation' : vm.isVideo ? 'videocast' : 'interview') }, free ? 'Load freeflow conversation template (60m)' : vm.isVideo ? 'Load filmed interview template (45m)' : 'Load standard interview template (45m)'),
        h('button', { class: 'btn', onclick: e => templateMenu(e.currentTarget) }, 'Other templates…')))];
    const notes = [];
    if (vm.format === 'scripted') notes.push(h('div', { class: 'card', style: { padding: '10px 16px', marginBottom: '12px', borderLeft: '4px solid var(--accent)' } },
      h('span', { class: 'small' }, 'Scripted show: the words live in the script. Use this rundown as the outline — it gives the live desk its segments and the show notes their chapters. '),
      h('a', { class: 'btn sm', href: `#/p/${vm.P.id}/script` }, 'Open the script')));
    if (free && vm.overBooked) notes.push(h('div', { class: 'card', style: { padding: '10px 16px', marginBottom: '12px', borderLeft: '4px solid var(--warn)' } },
      h('span', { class: 'small' }, `The must-cover topics alone run ${Math.round(vm.overBooked)} min over the ${vm.target} min target — move some to “Nice to have” or raise the target.`)));
    let list;
    if (free) list = vm.groups.filter(g => g.items.length || g.key === 'Must').map(g => h('div', { 'data-key': 'grp-' + g.key, style: { marginBottom: '16px' } },
      h('h3', { style: { fontSize: '13px', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.08em', color: M.PRIORITY_TONE[g.key] || 'var(--muted)' } },
        `${g.label} · ${g.items.length}${g.items.length ? ` · ~${Math.round(g.items.reduce((a, s) => a + M.dur(s.dur), 0))} min` : ''}`),
      g.items.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, g.items.map(s => segCard(s, vm.rundown.indexOf(s), null)))
        : h('p', { class: 'small muted' }, 'Mark the topics you can’t finish without as “Must cover”.')));
    else list = h('div', { class: 'pod-seg-list', style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, vm.rows.map(r => segCard(r.seg, r.idx, r.start, r.last)));
    return [recStrip(), toolbar, ...notes, list];
  }
  function segCard(seg, idx, start, last) {
    const free = vm.isFree, vid = vm.isVideo, isCut = seg.status === 'Cut', set = k => e => vm.setSeg(seg.id, k, e.target.value);
    const top = h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', marginBottom: '8px' } },
      free ? h('select', { class: 'inp sm', title: 'How much this topic matters', style: { width: 'auto', fontWeight: 700, color: M.PRIORITY_TONE[seg.priority || 'Nice'] }, onchange: set('priority') }, opts(M.PRIORITY, seg.priority || 'Nice', p => M.PRIORITY_LABEL[p]))
        : h('span', { class: 'pill', style: { fontFamily: 'var(--mono)', fontSize: '13px', background: 'var(--surface2)', color: 'var(--text)', fontWeight: 700 } }, f(start * 60)),
      free ? null : h('span', { class: 'small muted', style: { fontWeight: 600 } }, `#${idx + 1}`),
      h('input', { class: 'inp', style: { fontWeight: 700, fontSize: '15px', flex: 1 }, value: seg.title, placeholder: free ? 'Topic…' : 'Segment title / topic…', oninput: set('title') }),
      seg.parked ? h('span', { class: 'chip', title: 'Parked during a recording' }, '↪ parked') : null,
      h('div', { class: 'row', style: { gap: '4px', alignItems: 'center' } },
        h('input', { class: 'inp', type: 'number', step: '0.5', min: '0.5', style: { width: '65px', textAlign: 'right', fontWeight: 600 }, value: seg.dur, title: free ? 'Rough length in minutes' : 'Target duration in minutes', onchange: set('dur') }),
        h('span', { class: 'small muted' }, free ? 'min est.' : 'min')),
      h('select', { class: 'inp sm', style: { width: 'auto', fontWeight: 600 }, onchange: set('status') }, opts(M.STATUS, seg.status)),
      free ? null : h('button', { class: 'icon-btn', title: 'Move up', disabled: idx === 0, onclick: () => vm.moveSeg(idx, -1) }, icon('up', 14)),
      free ? null : h('button', { class: 'icon-btn', title: 'Move down', disabled: !!last, onclick: () => vm.moveSeg(idx, 1) }, icon('down', 14)),
      h('button', { class: 'icon-btn danger', title: `Delete ${free ? 'topic' : 'segment'}`, onclick: async () => { if (await confirmBox(`Delete “${seg.title}”?`)) vm.removeSeg(seg.id); } }, icon('trash', 14)));
    const side = h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div', {}, lbl('Audio cue / Stinger / Drop'), h('input', { class: 'inp sm', placeholder: 'e.g. Intro theme, sound bite, stinger', value: seg.cues || '', oninput: set('cues') })),
      vid ? h('div', {}, lbl('Camera / shot'), h('input', { class: 'inp sm', placeholder: 'e.g. Wide → guest single', value: seg.cam || '', oninput: set('cam') })) : null,
      h('div', {}, lbl('Attach Guest or Sponsor'), h('div', { class: 'row', style: { gap: '6px' } },
        h('select', { class: 'inp sm', style: { flex: 1 }, onchange: set('guestId') }, h('option', { value: '' }, '(No guest linked)'), vm.guests.map(g => h('option', { value: g.id, selected: g.id === seg.guestId }, 'Guest: ' + g.name))),
        h('select', { class: 'inp sm', style: { flex: 1 }, onchange: set('sponsorId') }, h('option', { value: '' }, '(No sponsor linked)'), vm.sponsors.map(sp => h('option', { value: sp.id, selected: sp.id === seg.sponsorId }, 'Ad: ' + sp.name))))));
    const main = h('div', { style: { flex: 2, display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div', {}, lbl(free ? 'Starter questions & angles (optional — it’s a conversation)' : 'Talking points & questions (one per line)'),
        h('textarea', { class: 'inp', rows: Math.max(2, (seg.bullets || '').split('\n').length), placeholder: free ? 'A question to get it going\nA story you want to tell' : '• Key points to hit\n• Questions to ask\n• Anecdotes or stats', value: seg.bullets || '', oninput: set('bullets') })),
      vid ? h('div', {}, lbl('On-screen graphics (one per line)'), h('textarea', { class: 'inp', rows: Math.max(1, (seg.gfx || '').split('\n').length), placeholder: 'Lower third: guest name & title\nB-roll / image / product shot', value: seg.gfx || '', oninput: set('gfx') })) : null);
    return h('div', { class: 'card pod-seg-card', 'data-key': seg.id, style: { padding: '12px 16px', borderColor: seg.status === 'Recording' ? 'var(--accent)' : 'var(--border)', opacity: isCut ? '0.6' : '1', borderLeft: `4px solid ${M.TONE[seg.status] || 'var(--border)'}` } },
      top, h('div', { class: 'row', style: { gap: '14px', alignItems: 'flex-start' } }, main, side));
  }

  /* ---------- cameras & set (filmed shows) ---------- */
  function videoTab() {
    const v = vm.video, cams = vm.cameras, sv = k => e => vm.setVideo(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    const frame = h('div', { class: 'card', style: { padding: '16px 20px' } },
      h('h3', { style: { margin: '0 0 12px', fontSize: '16px' } }, 'Frame & recording'),
      h('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-end' } },
        field('Main aspect ratio', h('select', { class: 'inp', onchange: sv('aspect') }, opts(M.ASPECTS, v.aspect)), { flex: '0 0 140px', minWidth: '120px' }),
        field('Resolution & frame rate', h('input', { class: 'inp', value: v.res || '', placeholder: '4K · 25p', oninput: sv('res') }), { flex: '0 0 180px', minWidth: '150px' }),
        field('Social clips', h('select', { class: 'inp', onchange: sv('clips') }, h('option', { value: '' }, 'No clips'), opts(M.ASPECTS, v.clips, a => `${a} clips`)), { flex: '0 0 150px', minWidth: '130px' }),
        h('label', { class: 'row small', style: { gap: '6px', fontWeight: 600, cursor: 'pointer', paddingBottom: '8px' } }, h('input', { type: 'checkbox', checked: !!v.iso, onchange: sv('iso') }), 'ISO-record every camera (separate files for the edit)')));
    const camCard = h('div', { class: 'card', style: { padding: '16px 20px' } },
      h('div', { class: 'row', style: { marginBottom: '10px', gap: '8px' } },
        h('h3', { style: { margin: 0, fontSize: '16px' } }, `Cameras · ${cams.length}`), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm primary', onclick: () => vm.addCamera() }, icon('plus', 13), 'Add camera'),
        h('button', { class: 'btn sm ghost', onclick: () => copy(vm.cameraText, 'Camera plan copied') }, icon('copy', 13), 'Copy camera plan')),
      cams.length ? h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl wide' },
        h('thead', {}, h('tr', {}, ['Camera', 'Shot', 'Operator', 'Lens', 'Card (min)', 'Notes', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, cams.map(c => { const sc = k => e => vm.setCamera(c.id, k, e.target.value);
          return h('tr', { 'data-key': c.id },
            h('td', {}, h('input', { class: 'cell', style: { width: '80px', fontWeight: 700 }, value: c.name, oninput: sc('name') })),
            h('td', {}, h('select', { class: 'cell', onchange: sc('shot') }, opts(M.SHOTS.includes(c.shot) ? M.SHOTS : [c.shot, ...M.SHOTS], c.shot))),
            h('td', {}, h('input', { class: 'cell', value: c.who || '', placeholder: 'Locked off / name', oninput: sc('who') })),
            h('td', {}, h('input', { class: 'cell', value: c.lens || '', placeholder: '24-70 @ 50mm', oninput: sc('lens') })),
            h('td', {}, h('input', { class: 'cell', type: 'number', min: 0, style: { width: '70px' }, value: c.cardMins || '', placeholder: '—', title: 'Minutes this camera’s card / battery lasts — the live desk warns before it runs out', oninput: sc('cardMins') })),
            h('td', {}, h('input', { class: 'cell', value: c.notes || '', placeholder: 'Framing, height, notes', oninput: sc('notes') })),
            h('td', {}, ibtn('trash', 'Remove camera', async () => { if (await confirmBox(`Remove ${c.name}?`)) vm.removeCamera(c.id); }, 'danger'))); }))))
        : h('p', { class: 'small muted' }, 'No cameras yet. A typical two-person show uses three: a wide and a single on each person.'));
    const ta = (k, label, ph, rows = 3) => field(label, h('textarea', { class: 'inp', rows, value: v[k] || '', placeholder: ph, oninput: sv(k) }), { minWidth: '260px' });
    const look = h('div', { class: 'card', style: { padding: '16px 20px' } },
      h('h3', { style: { margin: '0 0 12px', fontSize: '16px' } }, 'Set, lighting & on camera'),
      h('div', { class: 'row wrap', style: { gap: '12px' } },
        ta('set', 'Set & background', 'Bookshelf left of frame, neon sign behind host, plants, no visible clock…'),
        ta('lighting', 'Lighting', 'Key soft box camera-left at 45°, fill at 30%, warm practicals, hair light…')),
      h('div', { class: 'row wrap', style: { gap: '12px', marginTop: '12px' } },
        ta('wardrobe', 'Wardrobe & on-camera notes (hosts)', 'Solid colours, no thin stripes or logos; mics visible / hidden…', 2),
        field('Thumbnail idea', h('input', { class: 'inp', value: v.thumbnail || '', placeholder: 'Guest mid-laugh, big text: “WE WERE WRONG”', oninput: sv('thumbnail') }), { minWidth: '260px' })));
    const gfx = vm.graphics;
    const gCard = h('div', { class: 'card', style: { padding: '16px 20px' } },
      h('h3', { style: { margin: '0 0 10px', fontSize: '16px' } }, 'On-screen graphics'),
      gfx.length ? h('div', { class: 'ld-list' }, gfx.map(g => h('div', { style: { marginBottom: '8px' } }, h('b', { class: 'small' }, g.seg.title), ...g.items.map(x => h('div', { class: 'small' }, '• ' + x)))))
        : h('p', { class: 'small muted' }, 'Add lower thirds, titles and b-roll to each segment in the rundown (“On-screen graphics”).'));
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, frame, camCard, look, gCard);
  }

  /* ---------- guests ---------- */
  function guestsTab() {
    const gs = vm.guests, vid = vm.isVideo, free = vm.isFree;
    const bar = h('div', { class: 'toolbar', style: { marginBottom: '16px' } },
      h('button', { class: 'btn primary', onclick: () => vm.addGuest() }, icon('plus', 15), 'Add guest'),
      h('span', { class: 'small muted' }, `${gs.length} guest profile${gs.length === 1 ? '' : 's'} for this episode`), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', onclick: () => copy(vm.guestsDigest, 'Guest interview notes copied') }, icon('copy', 14), 'Copy all questions'));
    if (!gs.length) return [bar, h('div', { class: 'empty' }, h('h3', {}, 'No interview guests added yet'),
      h('p', {}, 'Plan guest bios, talking points, questions to ask, sensitive topics to avoid, and remote call links.'),
      h('button', { class: 'btn primary', onclick: () => vm.addGuest() }, 'Add first guest'))];
    return [bar, h('div', { class: 'pod-guest-grid', style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, gs.map(g => {
      const set = k => e => vm.setGuest(g.id, k, e.target.value), ta = (k, rows, ph, style = {}) => h('textarea', { class: 'inp', rows, value: g[k] || '', placeholder: ph, style, oninput: set(k) });
      return h('div', { class: 'card', 'data-key': g.id, style: { padding: '16px 20px' } },
        h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', marginBottom: '14px' } },
          h('span', { class: 'ico', style: { color: 'var(--accent)' } }, icon('user', 20)),
          h('input', { class: 'inp', style: { fontWeight: 700, fontSize: '17px', flex: 1 }, value: g.name, placeholder: 'Guest name…', oninput: set('name') }),
          h('input', { class: 'inp', style: { width: '100px' }, value: g.pronouns || '', placeholder: 'they/them', title: 'Pronouns', oninput: set('pronouns') }),
          h('select', { class: 'inp sm', style: { width: 'auto', fontWeight: 600 }, title: `Guest ${vid ? 'appearance (audio & video)' : 'appearance'} release status`, onchange: set('release') }, opts(M.RELEASE, g.release, r => `Release: ${r}`)),
          h('button', { class: 'icon-btn danger', title: 'Delete guest', onclick: async () => { if (await confirmBox(`Remove guest ${g.name}?`)) vm.removeGuest(g.id); } }, icon('trash', 14))),
        h('div', { class: 'row wrap', style: { gap: '12px', marginBottom: '12px' } },
          field('Title / Credentials / Organization', h('input', { class: 'inp', value: g.title || '', placeholder: 'e.g. Lead Astronomer, Author of Signal', oninput: set('title') }), { flex: 2, minWidth: '220px' }),
          field(`Remote Recording Link (${vid ? 'Riverside / StreamYard / Zoom' : 'Riverside / Squadcast / Zoom'})`, h('div', { class: 'row', style: { gap: '6px' } },
            h('input', { class: 'inp', value: g.link || '', placeholder: 'https://riverside.fm/studio/...', oninput: set('link') }),
            g.link ? h('a', { class: 'btn sm', href: /^https?:/.test(g.link) ? g.link : 'https://' + g.link, target: '_blank', rel: 'noreferrer' }, 'Open') : null), { flex: 2, minWidth: '220px' }),
          field('Time Zone / Location', h('input', { class: 'inp', value: g.timeZone || '', placeholder: 'EST (UTC-5)', oninput: set('timeZone') }), { minWidth: '130px' })),
        h('div', { class: 'row wrap', style: { gap: '12px', marginBottom: '12px' } },
          field('Short Bio & Context', ta('bio', 2, 'Brief background to read on air during introduction…'), { flex: 2, minWidth: '280px' }),
          field('Guest Plugs & Socials (Website, X, Book)', ta('plugs', 2, '@handle, website.com, new book title'))),
        vid ? h('div', { class: 'row wrap', style: { gap: '12px', marginBottom: '12px' } },
          field('On camera — wardrobe, framing, remote camera & lighting', ta('onCamera', 2, 'Solid colours, no stripes · laptop at eye level, window in front · send a webcam / lighting checklist…'), { minWidth: '280px' })) : null,
        h('div', { class: 'row wrap', style: { gap: '14px', alignItems: 'flex-start' } },
          field(free ? 'Conversation starters & angles' : 'Core Questions & Discussion Angles', ta('questions', 5, '1. First question…\n2. Follow-up angle…\n3. Practical advice…'), { flex: 2, minWidth: '300px' }),
          h('div', { style: { flex: 1, minWidth: '240px' } }, h('label', { class: 'lbl small', style: { color: 'var(--warn)', fontWeight: 600 } }, '⚠️ Sensitive / No-Go Topics (Do NOT ask)'),
            ta('nogo', 5, 'Topics the guest requested to avoid, legal non-disclosures, private topics…', { borderColor: g.nogo ? 'var(--warn)' : 'var(--border)', background: g.nogo ? 'color-mix(in srgb, var(--warn) 6%, transparent)' : 'transparent' }))));
    }))];
  }

  /* ---------- sponsors ---------- */
  function sponsorsTab() {
    const ss = vm.sponsors, vid = vm.isVideo;
    const bar = h('div', { class: 'toolbar', style: { marginBottom: '16px' } },
      h('button', { class: 'btn primary', onclick: () => vm.addSponsor() }, icon('plus', 15), 'Add sponsor read'),
      h('span', { class: 'small muted' }, `${ss.length} ad read campaign${ss.length === 1 ? '' : 's'}`), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', onclick: () => copy(vm.sponsorsText, 'All sponsor reads copied') }, icon('copy', 14), 'Copy all ad copy'));
    if (!ss.length) return [bar, h('div', { class: 'empty' }, h('h3', {}, 'No sponsor reads configured'),
      h('p', {}, 'Track sponsor campaigns, promo codes, mandatory talking points, and full host-read ad copy.'),
      h('button', { class: 'btn primary', onclick: () => vm.addSponsor() }, 'Add first sponsor read'))];
    return [bar, h('div', { class: 'pod-sponsor-grid', style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, ss.map(sp => {
      const set = k => e => vm.setSponsor(sp.id, k, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
      return h('div', { class: 'card', 'data-key': sp.id, style: { padding: '16px 20px', borderLeft: sp.recorded ? '4px solid var(--ok)' : '4px solid var(--accent)' } },
        h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', marginBottom: '12px' } },
          h('span', { class: 'ico', style: { color: 'var(--accent)' } }, icon('dollar', 18)),
          h('input', { class: 'inp', style: { fontWeight: 700, fontSize: '16px', flex: 2 }, value: sp.name, placeholder: 'Sponsor / Brand name…', oninput: set('name') }),
          h('select', { class: 'inp sm', style: { flex: 1 }, onchange: set('slot') }, opts(M.SLOTS, sp.slot)),
          h('select', { class: 'inp sm', style: { width: '80px' }, onchange: set('duration') }, opts(M.LENGTHS.includes(sp.duration) ? M.LENGTHS : [sp.duration, ...M.LENGTHS], sp.duration)),
          h('label', { class: 'row small', style: { gap: '6px', fontWeight: 600, cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: !!sp.recorded, onchange: set('recorded') }), 'Recorded'),
          h('button', { class: 'icon-btn danger', title: 'Delete sponsor', onclick: async () => { if (await confirmBox(`Remove sponsor read for ${sp.name}?`)) vm.removeSponsor(sp.id); } }, icon('trash', 14))),
        h('div', { class: 'row wrap', style: { gap: '12px', marginBottom: '12px' } },
          field('Promo Code', h('input', { class: 'inp', style: { fontFamily: 'var(--mono)', fontWeight: 700 }, value: sp.code || '', placeholder: 'e.g. PODCAST20', oninput: set('code') }), { minWidth: '180px' }),
          field('Vanity URL / Landing Page', h('input', { class: 'inp', value: sp.url || '', placeholder: 'e.g. brand.com/podcast', oninput: set('url') }), { flex: 2, minWidth: '240px' }),
          vid ? field('On screen during the read', h('input', { class: 'inp', value: sp.onScreen || '', placeholder: 'Logo bug + promo code, product b-roll', oninput: set('onScreen') }), { flex: 2, minWidth: '240px' }) : null),
        h('div', { class: 'row wrap', style: { gap: '14px', alignItems: 'flex-start' } },
          h('div', { style: { flex: 2, minWidth: '320px' } },
            h('div', { class: 'row', style: { marginBottom: '4px' } }, lbl('Host-Read Ad Copy'), h('span', { class: 'grow' }),
              h('button', { class: 'btn sm ghost', onclick: () => copy(sp.copy || '', 'Ad copy copied') }, icon('copy', 13), 'Copy copy')),
            h('textarea', { class: 'inp', rows: 5, style: { fontStyle: 'italic', lineHeight: '1.45' }, value: sp.copy || '', placeholder: 'Scripted host read text to read on mic…', oninput: set('copy') })),
          field('Mandatory Points & Claims', h('textarea', { class: 'inp', rows: 5, value: sp.points || '', placeholder: '• Must mention offer expires Dec 31\n• Mention free shipping…', oninput: set('points') }), { minWidth: '240px' })));
    }))];
  }

  /* ---------- gear ---------- */
  let gearTimer = null;
  function gearTab() {
    const st = vm.gearStats, gf = vm.gearFilter, cats = vm.gearCats, statuses = vm.gearStatuses, groups = vm.gearGroups, nd = vm.nDays;
    const kit = kind => { const n = vm.addKit(kind); toast(`Added ${n} item${n === 1 ? '' : 's'} — the ${kind === 'video' ? 'camera & lighting' : 'studio audio'} starter kit`); };
    const body = groups.map(g => h('div', { 'data-key': 'cat-' + g.cat },
      h('h3', { style: { fontSize: '14px', margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' } }, `${g.cat} · ${g.items.length}`),
      h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl wide gear-t' },
        h('thead', {}, h('tr', {}, ['Item', 'Qty', 'Source', 'Rate / day', 'Days', 'Total', 'Pick-up', 'Return', 'Status', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, g.items.map(it => {
          const tot = h('td', { class: 'gear-tot', style: { whiteSpace: 'nowrap', fontWeight: 600 } }, money(vm.gearCost(it)));
          const c = (k, o = {}) => h('input', { class: 'cell', type: o.type, list: o.list, min: o.type === 'number' ? 0 : undefined, value: it[k] || '', placeholder: o.ph || '', style: o.w ? { width: o.w } : {},
            oninput: e => { vm.setGear(it.id, k, e.target.value); const t = e.target.closest('tr').querySelector('.gear-tot'); if (t) t.textContent = money(vm.gearCost(it)); } });
          return h('tr', { 'data-key': it.id },
            h('td', {}, c('name', { ph: 'Item name / model' })), h('td', {}, c('qty', { type: 'number', w: '58px' })),
            h('td', {}, c('source', { list: 'dl-podgearsrc', ph: 'Owned / rental house' })), h('td', {}, c('rate', { type: 'number', w: '84px' })),
            h('td', {}, c('days', { type: 'number', w: '58px', ph: String(nd || 1) })), tot,
            h('td', {}, c('pickup', { type: 'date' })), h('td', {}, c('ret', { type: 'date' })),
            h('td', {}, h('select', { class: 'cell', onchange: e => vm.setGear(it.id, 'status', e.target.value) }, opts(statuses.includes(it.status) ? statuses : [it.status, ...statuses], it.status))),
            h('td', { style: { width: '70px' } }, ibtn('copy', 'Duplicate', () => vm.duplicateGear(it.id)), ibtn('trash', 'Delete', () => vm.removeGear(it.id), 'danger')));
        }))))));
    return [h('datalist', { id: 'dl-podgearsrc' }, vm.gearSources.map(x => h('option', { value: x }))),
      h('div', { class: 'sum', style: { marginBottom: '14px' } },
        h('div', {}, h('span', {}, vm.isVideo ? 'Audio & video items' : 'Audio items'), h('b', {}, String(st.count))),
        h('div', {}, h('span', {}, 'Studio ready'), h('b', {}, `${st.ready}/${st.count}`)),
        h('div', {}, h('span', {}, 'Gear & rental cost'), h('b', { style: { color: 'var(--accent)' } }, money(st.total)))),
      h('div', { class: 'toolbar', style: { marginBottom: '12px', flexWrap: 'wrap', gap: '8px' } },
        h('button', { class: 'btn primary', onclick: e => menu(e.currentTarget, cats.map(c => ({ label: c, onClick: () => vm.addGear(c) }))) }, icon('plus', 15), 'Add gear item'),
        h('button', { class: 'btn', title: 'Load a standard studio broadcast kit', onclick: () => kit('audio') }, icon('wand', 15), 'Add audio starter kit'),
        vm.isVideo ? h('button', { class: 'btn', title: 'Cameras, lenses, lights, switcher, cards and a slate', onclick: () => kit('video') }, icon('camera', 15), 'Add camera & lighting kit') : null,
        h('button', { class: 'btn', title: 'Create budget lines from items with a day rate', onclick: () => { const n = vm.toBudget(); toast(n ? `Budget updated with ${n} gear line${n > 1 ? 's' : ''}` : 'Add a day rate to gear items first.', !n); } }, icon('dollar', 15), 'Send to budget'),
        h('button', { class: 'btn', onclick: e => menu(e.currentTarget, [
          { label: 'Pack list (print)', icon: 'print', onClick: () => printTable('Podcast Gear Pack List', ['☐', 'Category', 'Item', 'Qty', 'Source', 'Status'], vm.packRows, { landscape: false }) },
          { label: 'Rental orders (print)', icon: 'print', onClick: () => { const r = vm.rentals; if (!r.length) return toast('No rental items — set Source to the rental house name.', true);
            printTable('Podcast Rental Orders', ['Item', 'Qty', 'Days', 'Pick-up', 'Return', 'Total'], r.flatMap(x => [{ grp: `${x.source} — ${money(x.total)}` }, ...x.items.map(g => [g.name, g.qty, vm.gearDays(g), g.pickup, g.ret, money(vm.gearCost(g))])]), { landscape: false }); } },
          { label: 'Export CSV', icon: 'download', onClick: () => download(slugOf(vm.P.title) + '-gear.csv', toCSV(vm.gearCsv), 'text/csv') }]) }, icon('print', 15), 'Reports'),
        h('span', { class: 'grow' }),
        h('input', { class: 'inp', 'data-k': 'podgsearch', value: gf.q, placeholder: vm.isVideo ? 'Search gear & cameras…' : 'Search mics & gear…', style: { width: '200px' },
          oninput: e => { const v = e.target.value; clearTimeout(gearTimer); gearTimer = setTimeout(() => vm.setGearFilter({ q: v }), 250); } }),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setGearFilter({ status: e.target.value }) }, h('option', { value: '' }, 'Any status'), opts(statuses, gf.status))),
      groups.length ? h('div', { 'data-key': 'gear-body' }, body) : h('div', { class: 'empty', 'data-key': 'gear-empty' },
        h('h3', {}, vm.gear.length ? 'No items match your filter' : 'No studio gear listed yet'),
        h('p', {}, vm.isVideo ? 'Track cameras, lenses, lights, microphones and recorders — with rental costs and printable pack lists.' : 'Track microphones, audio interfaces, boom arms, headphones, and field recorders — with rental costs and printable pack lists.'),
        vm.gear.length ? null : h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } },
          h('button', { class: 'btn primary', onclick: () => kit('audio') }, 'Load standard podcast studio kit'),
          vm.isVideo ? h('button', { class: 'btn', onclick: () => kit('video') }, 'Load camera & lighting kit') : null))];
  }

  /* ---------- show notes & chapters ---------- */
  function notesTab() {
    const ch = vm.chapters, n = vm.notes, vid = vm.isVideo, clips = vm.clips;
    const out = h('pre', { id: 'podNotesOutput', class: 'inp', style: { minHeight: '220px', maxHeight: '350px', overflow: 'auto', background: 'var(--surface)', padding: '12px 16px', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' } }, vm.showNotes);
    const set = k => e => { vm.setNote(k, e.target.value); const el = $('#podNotesOutput'); if (el) el.textContent = vm.showNotes; };
    const chCard = h('div', { class: 'card', style: { padding: '16px 20px' } },
      h('div', { class: 'row', style: { marginBottom: '10px' } },
        h('h3', { style: { margin: 0, fontSize: '16px' } }, 'Episode Chapters (YouTube / Apple / Spotify Timestamps)'), h('span', { class: 'grow' }),
        h('span', { class: 'pill', style: { marginRight: '8px' } }, ch.source === 'recorded' ? 'From the recording' : 'From the plan'),
        h('button', { class: 'btn sm primary', onclick: () => copy(vm.chapterText, 'Chapter timestamps copied') }, icon('copy', 14), 'Copy chapter timestamps')),
      h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, ch.source === 'recorded'
        ? 'Taken from when each segment actually started in the recording session. Adjust for edits made in post.'
        : (vm.isFree ? 'From your topics in order (freeflow shows rarely run to plan — record with the live desk and the chapters follow what actually happened).' : 'Generated from your episode rundown. Record with the live desk to get chapters from the real timings.')
          + (vid ? ' YouTube needs the first chapter at 00:00, at least three chapters, each 10 seconds or longer.' : '')),
      h('pre', { class: 'inp', style: { maxHeight: '180px', overflow: 'auto', background: 'var(--surface2)', padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: '13px' } },
        ch.list.length ? ch.list.map(c => `${M.stamp(c.sec)} - ${c.title}`).join('\n') : 'No active segments in rundown yet.'));
    const clipCard = vid || clips.length ? h('div', { class: 'card', style: { padding: '16px 20px' } },
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h3', { style: { margin: 0, fontSize: '16px' } }, `Clips for social${vid && vm.video.clips ? ` (${vm.video.clips})` : ''} · ${clips.length}`), h('span', { class: 'grow' }),
        clips.length ? h('button', { class: 'btn sm', onclick: () => copy(vm.clipText, 'Clip list copied') }, icon('copy', 14), 'Copy clip list') : null),
      clips.length ? h('pre', { class: 'inp', style: { maxHeight: '160px', overflow: 'auto', background: 'var(--surface2)', padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: '13px' } }, vm.clipText)
        : h('p', { class: 'small muted', style: { margin: 0 } }, 'Mark clips while recording on the live desk (“Clip in” / “Clip out”, or ⭐ for a highlight) and they’re listed here with in and out times.')) : null;
    const metaCard = h('div', { class: 'card', style: { padding: '16px 20px' } },
      h('h3', { style: { margin: '0 0 12px', fontSize: '16px' } }, 'Episode Description & Links'),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Episode Summary / Description'), h('textarea', { class: 'inp', rows: 4, value: n.summary || '', placeholder: 'In this episode, we dive into…', oninput: set('summary') })),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, vid ? 'Episode / Video Title Ideas (Ranked / A/B test)' : 'Episode Title Ideas (Ranked / A/B test)'), h('input', { class: 'inp', value: n.titleOptions || '', placeholder: '1. Shocking discovery… | 2. Inside the Arctic Base… | 3. The Signal', oninput: set('titleOptions') })),
      vid ? h('div', { class: 'row wrap', style: { gap: '12px' } },
        h('div', { class: 'field', style: { flex: 1, minWidth: '240px' } }, h('label', { class: 'lbl' }, 'Video link (YouTube / Spotify video)'), h('input', { class: 'inp', value: n.watch || '', placeholder: 'https://youtube.com/watch?v=…', oninput: set('watch') })),
        h('div', { class: 'field', style: { flex: 1, minWidth: '240px' } }, h('label', { class: 'lbl' }, 'Tags / keywords'), h('input', { class: 'inp', value: n.tags || '', placeholder: 'podcast, interview, acoustics', oninput: set('tags') }))) : null,
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Additional Links & Resources Mentioned'), h('textarea', { class: 'inp', rows: 3, value: n.links || '', placeholder: '• Study referenced: https://…\n• Recommended tool: https://…', oninput: set('links') })));
    const outCard = h('div', { class: 'card', style: { padding: '16px 20px', background: 'var(--surface2)' } },
      h('div', { class: 'row', style: { marginBottom: '10px', gap: '8px' } }, h('h3', { style: { margin: 0, fontSize: '16px' } }, 'Compiled Show Notes'), h('span', { class: 'grow' }),
        h('button', { class: 'btn primary', onclick: () => copy(vm.showNotes, 'Full show notes copied to clipboard') }, icon('copy', 15), 'Copy complete show notes'),
        h('button', { class: 'btn', onclick: () => download(slugOf(vm.P.title) + '-show-notes.md', vm.showNotes, 'text/markdown') }, icon('download', 15), 'Save .md')),
      out);
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } }, chCard, clipCard, metaCard, outCard);
  }

  /* the clock ticks without a redraw */
  const unsub = PodTimer.subscribe(() => {
    const c = $('#podLiveClock'); if (c) c.textContent = f(PodTimer.elapsedSec);
    const b = $('#podAheadBehind'); if (b) { const [t, tone] = paceText(); b.textContent = t; b.style.color = TONE[tone]; }
  });
  const offRec = rec.subscribe(draw);
  const unbind = bindView(vm, draw);
  return () => { unsub(); offRec(); rec.dispose(); clearTimeout(gearTimer); unbind(); };
};

/* ===============================================================
   Sample Podcast Project Generator
   =============================================================== */
async function createPodcastSample() {
  const p = blankProject('podcast', 'The Midnight Frequency — Ep 104: Signal in the Static');
  p.meta.author = 'Elena Rostova';
  p.meta.credit = 'A narrative investigative podcast produced by';
  p.meta.draft = 'Recording & broadcast draft';
  p.meta.logline = 'When an automated Arctic listening station detects an unmapped signal beneath the ice, Elena tracks down the acoustic analyst who vanished 25 years ago.';

  // Script blocks (hybrid format: audio drama cold open + interview)
  const res = parseFountain(SAMPLE_PODCAST, 'podcast');
  p.blocks = res.blocks;

  const pd = POD(p);

  // Unscripted Rundown
  pd.rundown = [
    newSegment({
      title: 'Cold Open: The 3:17 AM Anomaly',
      dur: 2.5,
      bullets: 'Tease the haunting audio spike from Svalbard Station 4.\nBrief Elena hook on mic.',
      cues: 'SFX: Radio static + Arctic wind bed',
      status: 'Covered'
    }),
    newSegment({
      title: 'Episode Intro & Series Hook',
      dur: 4,
      bullets: 'Welcome back listeners.\nRecap Episode 103 (The Drift Line).\nFrame the stakes: Why sub-surface signals shouldn’t exist.',
      cues: 'Theme music full, then duck under',
      status: 'Covered'
    }),
    newSegment({
      title: 'Sponsor Read: GroundWire Audio (Mid-roll 1)',
      dur: 1.5,
      bullets: 'Deliver 60s host read.\nMention code FREQUENCY for 20% off field mics.',
      cues: 'Ad transition chime',
      status: 'Planned'
    }),
    newSegment({
      title: 'Dr. Kai Vance Interview: The 1998 Sub Incident',
      dur: 22,
      bullets: 'Connect via remote line to Tromsø.\nAsk about original acoustic logs from submarine trench.\nPress on the redacted frequencies.\nWhy did Vance leave acoustic science?',
      cues: 'Phone connect tone; distant room tone filter',
      status: 'Planned'
    }),
    newSegment({
      title: 'Audio Forensics Breakdown',
      dur: 8,
      bullets: 'Solo Elena commentary.\nSpectral analysis of the five repeating tones.\nComparison with geological versus artificial acoustic signatures.',
      cues: 'Spectral chime audio clip playout',
      status: 'Planned'
    }),
    newSegment({
      title: 'Listener Tips & Voicemails',
      dur: 5,
      bullets: 'Play voicemail from naval radar technician in Kirkenes.\nReview incoming coordinates.',
      cues: 'Voicemail beep and telephone filter',
      status: 'Planned'
    }),
    newSegment({
      title: 'Outro, Teaser & Patreon Shoutouts',
      dur: 3,
      bullets: 'Next week: What lies beneath the pack ice.\nShow notes reminder.\nPatreon producer thank-yous.',
      cues: 'Outro theme swell',
      status: 'Planned'
    })
  ];

  // Guest Prep
  pd.guests = [
    newGuest({
      name: 'Dr. Kai Vance',
      pronouns: 'he/him',
      title: 'Former Chief Acoustic Analyst, Svalbard Trench Project',
      bio: 'Dr. Vance spent 18 years analyzing low-frequency oceanic acoustics for the Nordic Maritime Defense Institute before resigning abruptly in 1999.',
      questions: '1. What first caught your attention on the hydrophone arrays in the winter of 1998?\n2. Why were the depth readings classified as impossible?\n3. Can natural tectonic pressure create pure harmonic fifths?\n4. What did you hear on the final night before the listening post was decommissioned?',
      nogo: 'Do NOT ask about his settlement with the Maritime Defense Ministry or his former colleague Lt. Dahl.',
      link: 'https://riverside.fm/studio/midnight-frequency-vance',
      timeZone: 'CET (UTC+1, Norway)',
      plugs: 'New book: "Listening to the Abyss" (Norwegian Academic Press, 2024)',
      release: 'Signed'
    })
  ];

  // Sponsor Reads
  pd.sponsors = [
    newSponsor({
      name: 'GroundWire Audio',
      slot: 'Mid-roll 1',
      duration: '60s',
      code: 'FREQUENCY',
      url: 'groundwire.example/frequency',
      points: '• Built specifically for harsh outdoor field recording\n• 32-bit float audio prevents clipping in any wind conditions\n• 20% discount with promo code FREQUENCY',
      copy: 'Whether you are documenting howling Arctic winds or recording intimate studio interviews, you know that sound is only as good as your gear. GroundWire builds indestructible field recorders with pristine ultra-low noise preamps and 32-bit float recording. Never worry about clipping again. Head to groundwire.example/frequency and enter code FREQUENCY for 20% off your entire field kit.',
      recorded: false
    })
  ];

  // Show notes
  pd.notes = {
    titleOptions: '1. Signal in the Static | 2. What Vance Left Behind | 3. Five Tones Under the Arctic Ice',
    summary: 'At 3:17 AM on an automated listening station in Svalbard, five harmonic tones echoed from beneath twenty feet of polar ice. Host Elena Rostova tracks down retired acoustic analyst Dr. Kai Vance to uncover what happened the night the listening post went dark.',
    links: '• Arctic Listening Project Data: https://arctic-acoustics.example/svalbard\n• Spectral analysis breakdown: https://midnightfrequency.example/ep104\n• Support us on Patreon: https://patreon.example/midnightfrequency'
  };

  // Studio Gear & Audio Kit
  pd.gear = [
    { id: uid(), cat: 'Microphones', name: 'Shure SM7B Dynamic Vocal Mic', qty: 2, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'In Studio', notes: 'Main host and in-studio co-host' },
    { id: uid(), cat: 'Microphones', name: 'Cloud Microphones Cloudlifter CL-1', qty: 2, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'In Studio', notes: '+25dB clean gain boost' },
    { id: uid(), cat: 'Audio Interfaces & Mixers', name: 'Rodecaster Pro II Audio Production Studio', qty: 1, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'In Studio', notes: 'Multitrack USB to DAW + micro-SD backup' },
    { id: uid(), cat: 'Recorders & Preamps', name: 'Zoom F6 32-bit Float Field Recorder', qty: 1, source: 'Apex Sound Hire', rate: 45, days: 3, pickup: '2026-11-20', ret: '2026-11-23', status: 'Reserved', notes: 'Dual-path field recording backup' },
    { id: uid(), cat: 'Headphones & Monitoring', name: 'Audio-Technica ATH-M50x Headphones', qty: 2, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'In Studio', notes: 'Zero-latency host monitoring' },
    { id: uid(), cat: 'Stands, Arms & Shockmounts', name: 'Rode PSA1+ Professional Studio Boom Arm', qty: 2, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'In Studio', notes: 'Desk clamp silent suspension' },
    { id: uid(), cat: 'Cables, Adapters & Power', name: 'Mogami Gold Studio XLR Cables (10ft)', qty: 4, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'In Studio', notes: 'Neutrik gold connectors' },
    { id: uid(), cat: 'Acoustic Treatment & Shields', name: 'Aston Microphones Halo Portable Reflection Filter', qty: 1, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'In Studio', notes: 'Room ambience absorption' }
  ];

  // People / Voice Cast & Team
  p.people = [
    { id: uid(), type: 'cast', name: 'Elena Rostova', character: 'ELENA', dept: '', role: 'Host / Creator', phone: '555-0199', email: 'elena@midnightfrequency.example', agent: '', notes: 'Remote mic: Shure SM7B + Apollo Twin' },
    { id: uid(), type: 'cast', name: 'Stellan Møller (Voice Actor)', character: 'DR. VANCE', dept: '', role: 'Voice Talent', phone: '555-0144', email: 'stellan@voicecraft.example', agent: 'Nordic Voice Artists', notes: 'Swedish/Norwegian accent. Remote via Source-Connect.' },
    { id: uid(), type: 'crew', name: 'Marcus Sterling', dept: 'Audio Production', role: 'Sound Designer & Re-recording Mixer', phone: '555-0177', email: 'marcus@soundroom.example', agent: '', notes: 'DAW: Pro Tools / Reaper. Delivers stems at -16 LUFS.' },
    { id: uid(), type: 'crew', name: 'Anya Sharma', dept: 'Editorial', role: 'Fact Checker & Producer', phone: '555-0182', email: 'anya@midnightfrequency.example', agent: '', notes: 'Manages FOIA requests and source verification.' }
  ];

  // Budget
  [
    ['Host & Creators', 'Elena Rostova (Host / Producer)', 1, 'Episode', 1200],
    ['Voice Talent & Guests', 'Dr. Vance (Voice Actor session)', 1, 'Session', 450],
    ['Sound Design & Foley', 'Sound design & ambient mix (Marcus Sterling)', 1, 'Flat', 800],
    ['Original Music & Licensing', 'Episode theme & custom synth beds', 1, 'License', 300],
    ['Studio Hire & Remote Recording', 'Riverside.fm 4K Pro subscription & cloud storage', 1, 'Month', 45],
    ['Hosting, RSS & Distribution', 'Megaphone / Transistor hosting & CDN', 1, 'Month', 29],
    ['Post-Production & Editing', 'Dialogue editing & mastering to -16 LUFS', 1, 'Episode', 400]
  ].forEach(([cat, desc, qty, unit, rate]) => p.budget.push({ id: uid(), cat, desc, qty, unit, rate }));

  // Series integration
  p.series = {
    id: uid(),
    name: 'The Midnight Frequency',
    season: 1,
    ep: 4,
    bible: {
      premise: 'An investigative reporter unravels decades of suppressed acoustic anomalies recorded across cold war listening posts.',
      tone: 'Atmospheric, grounded, eerie, journalistic akin to Serial meets The Black Tapes.',
      rules: 'All audio evidence presented must feel technically plausible. Grounded in real physics and oceanography.',
      world: 'Modern day podcast investigation intertwining with late 20th-century maritime cold war surveillance history.',
      notes: 'Season 1 leads towards the deep sub-surface trench coordinates discovered in episode 8.',
      arcs: {},
      characters: [],
      v: Date.now()
    }
  };

  await Store.add(p);
  location.hash = `#/p/${p.id}/rundown`;
  toast('Created sample podcast “The Midnight Frequency”');
}

/* ===============================================================
   Live recording desk — VIEW. Built on the live desk (livedesk.js), so it
   reads and behaves like every other live dashboard. Everything that
   happens in a session (the recording clock, editor markers, problems,
   check-in, pre-flight) is saved with the project, so a reload or a
   sleeping tablet never loses a take. Rules: PodLiveModel; screen state
   and actions: PodLiveVM (js/models/podlive.model.js, js/viewmodels/podlive.vm.js).
   =============================================================== */
function renderPodcastLive(root, P0) {
  const vm = new PodLiveVM();
  const wrap = h('div', { class: 'live ld pod-live' + (UI.liveTV ? ' tv' : '') }); root.append(wrap);
  const f = PodLiveModel.fmtSec, dmin = PodLiveModel.parseDur;
  const askMarker = async (pre = '') => { const l = await promptBox('Editor marker', 'What happened at this moment?', pre); if (l) vm.mark(l, 'custom'); };
  const nextSeg = () => { if (!vm.next()) toast(vm.isFree ? 'No topics left — wrap when you’re done, or park a new one.' : 'That was the last segment — wrap the session when you’re done.'); };
  const askPark = async () => { const t = await promptBox('Park a tangent', 'A topic to come back to if there’s time', ''); if (t) { vm.park(t); toast('Parked for later'); } };
  const cx = { key: 'pod', itemWord: vm.itemWord, issueCats: vm.issueCats, quickIssues: vm.quickIssues, redraw: () => vm.refresh(), flash: () => vm.refresh(), edit: fn => vm.edit(fn), stamp: () => vm.stamp };
  async function wrapSession() {
    if (!(await confirmBox(`Wrap this session? ${f(vm.clock.elapsedSec)} recorded, ${vm.markers.length} markers. A hand-off sheet goes to the editor and the daily report.`, 'Wrap session', 'Wrap the recording?'))) return;
    const ho = vm.wrap(), stat = (l, v) => h('div', { class: 'ld-tile' }, h('span', { class: 'ld-l' }, l), h('b', { class: 'ld-v' }, v));
    modal({ title: 'Session wrapped', wide: true, body: h('div', {}, h('div', { class: 'ld-head' }, stat('Recorded', f(ho.recorded)), stat(`${vm.itemWord}s covered`, `${ho.covered}/${ho.total}`), stat('Markers', String(ho.markers)), ho.clips ? stat('Clips', String(ho.clips)) : null, stat('Problems', String(ho.problems))),
      h('label', { class: 'lbl' }, 'Hand-off sheet for the editor — also saved in the daily report'), h('textarea', { class: 'inp mono', rows: 12, readOnly: true, value: ho.text })),
      buttons: [{ label: 'Reports', onClick: () => { location.hash = `#/p/${vm.P.id}/reports`; } }, { label: 'Close' }, { label: 'Copy for the editor', primary: true, onClick: () => { navigator.clipboard.writeText(ho.text); toast('Hand-off sheet copied'); return false; } }] });
  }
  const micToggle = async () => { if (PodMicMeter.active) { PodMicMeter.stop(); PodTimer.micMeterActive = false; } else PodTimer.micMeterActive = await PodMicMeter.start(() => vuUpdate()); vm.refresh(); };

  function draw() {
    const P = vm.P, pd = vm.pd, rundown = vm.rundown, L = vm.L;
    if (!rundown.length) {
      morph(wrap, h('div', { class: 'ld-card empty ld-start' }, icon('cue', 32), h('h3', {}, 'No rundown for this episode yet'),
        h('p', { class: 'muted' }, 'The live desk runs your recording from the episode rundown: segments and timing, talking points, guest prep, sponsor reads and editor markers.'),
        h('div', { class: 'ld-btns' }, h('button', { class: 'btn primary', onclick: () => vm.useTemplate('interview') }, 'Use the interview template'), h('button', { class: 'btn', onclick: () => vm.useTemplate('conversation') }, 'Freeflow conversation'),
          h('a', { class: 'btn', href: `#/p/${P.id}/rundown` }, 'Open the rundown planner'))));
      return;
    }
    const st = vm.state, curIdx = st.idx, cur = st.cur, next = st.next, live = st.live, begun = st.begun, tm = st.timing;
    const openIss = vm.openIssues, pre = vm.preflightDone, guest = vm.guestOf(cur), sponsor = vm.sponsorOf(cur), unread = vm.unreadSponsors, free = st.free, video = vm.isVideo, W = vm.itemWord;

    /* header */
    const header = h('div', { class: 'ld-head' },
      h('div', { class: 'ld-tile ld-clock rec' + (live ? ' on' : '') }, h('b', { class: 'ld-v mono', id: 'podLiveClock' }, f(vm.clock.elapsedSec)), h('span', { class: 'ld-s', id: 'podLiveState' }, h('i', { class: 'rec-dot' }), live ? 'Recording' : begun ? 'Paused' : 'Studio ready')),
      free ? ldTile('Time', st.pace[0], `Target ${Math.round(st.totalMin)} min · ends ~${clockTxt(vm.endAt(st))}`, st.pace[1])
        : ldTile('Pacing', st.pace[0], `Runs ~${Math.round(st.totalMin)} min · ends ~${clockTxt(vm.endAt(st))}`, st.pace[1]),
      free ? ldTile('Topics', `${st.covered} of ${st.active}`, st.mustLeft.length ? `${st.mustLeft.length} must-cover left` : 'must-covers done', st.mustLeft.length && st.pace[1] !== 'good' && st.begun ? 'warn' : '', ldProgress(st.active ? st.covered / st.active * 100 : 0, 'good'))
        : ldTile('Segment', `${curIdx + 1} of ${rundown.length}`, `${st.covered}/${st.active} covered`, '', ldProgress(st.active ? st.covered / st.active * 100 : 0, 'good')),
      video ? ldTile('On camera', vm.curCam ? vm.curCam.split(' · ')[0] : '—', vm.curCam ? vm.curCam.split(' · ').slice(1).join(' · ') || 'live' : `${vm.cameras.length} camera${vm.cameras.length === 1 ? '' : 's'}`) : null,
      ldTile('Markers', String(vm.markers.length), 'for the editor'),
      ldTile('Problems', String(openIss.length), openIss.length ? 'open' : 'all clear', openIss.some(i => sevRank(i.sev) >= 2) ? 'bad' : openIss.length ? 'warn' : ''),
      h('div', { class: 'ld-actions' },
        h('button', { class: 'btn big ' + (live ? '' : 'primary rec-btn'), onclick: () => vm.record(), title: 'Record / pause (Space)' }, icon(live ? 'pause' : 'play', 16), live ? 'Pause' : begun ? 'Resume' : 'Record'),
        h('button', { class: 'btn', onclick: nextSeg, title: `Finish this ${W.toLowerCase()} and start the next (N)` }, icon('right', 15), 'Next'),
        h('button', { class: 'btn', onclick: wrapSession }, 'Wrap'),
        h('button', { class: 'icon-btn' + (PodMicMeter.active ? ' on' : ''), onclick: micToggle, title: PodMicMeter.active ? 'Stop the mic meter' : 'Mic level meter', 'aria-label': 'Mic level meter' }, icon('cue', 17)),
        h('button', { class: 'icon-btn', onclick: () => ldTV(wrap), title: 'Big-display mode (T)', 'aria-label': 'Big-display mode' }, icon('focus', 17))));

    /* alerts */
    const act = { addTime: () => vm.addTime(cur.id), sync: () => vm.sync(), showPreflight: () => { LD.setOpen('pod:preflight', true); draw(); } };
    const alerts = vm.alerts(st).map(([tone, msg, a]) => [tone, msg, a ? { label: a.label, fn: act[a.cmd] } : null]);

    /* on air */
    const bullets = (cur.bullets || '').split('\n').filter(Boolean), pr = vm.prompter;
    const onAir = h('div', { class: 'ld-card s-active' + (st.segOver > 0 ? ' over' : ''), 'data-key': 'onair' },
      h('div', { class: 'ld-card-h' }, h('span', { class: 'ld-l' }, free ? (live ? 'On air · topic' : 'Topic') : live ? `On air · segment ${curIdx + 1}` : `Segment ${curIdx + 1}`),
        free ? h('span', { class: 'pill', style: { background: PodcastModel.PRIORITY_TONE[cur.priority || 'Nice'], color: '#fff', marginLeft: '8px' } }, PodcastModel.PRIORITY_LABEL[cur.priority || 'Nice']) : null, h('span', { class: 'grow' }),
        h('span', { class: 'ld-big mono' + (st.segOver > 0 ? ' neg' : ''), id: 'podSegTime' }, free ? `${f(st.segEl)} · ~${f(st.segTarget)}` : `${f(st.segEl)} / ${f(st.segTarget)}`)),
      h('div', { class: 'ld-title' }, h('b', {}, cur.title)),
      ldProgress(free ? Math.min(100, st.segEl / st.segTarget * 100) : st.segEl / st.segTarget * 100, st.segOver > 0 ? 'bad' : free && st.segEl > st.segTarget ? 'warn' : 'info'),
      video && (cur.cam || cur.gfx) ? h('div', { class: 'ld-chips' }, cur.cam ? h('span', { class: 'chip' }, icon('camera', 12), cur.cam) : null, ...(cur.gfx || '').split('\n').filter(Boolean).map(g => h('span', { class: 'chip' }, icon('monitor', 12), g))) : null,
      cur.cues ? h('div', { class: 'ld-cue' }, icon('cue', 15), h('span', { class: 'grow' }, cur.cues), h('button', { class: 'btn sm primary', onclick: () => vm.fireCue() }, icon('play', 12), 'Fire cue')) : null,
      P.blocks && P.blocks.length > 2 ? h('div', { class: 'seg sm' }, [['bullets', 'Talking points'], ['script', 'Script']].map(([k, l]) => h('button', { class: (pr.on ? 'script' : 'bullets') === k ? 'on' : '', onclick: () => vm.setPrompter({ on: k === 'script' }) }, l))) : null,
      pr.on ? renderScriptPrompter(P, pr) : renderBulletsChecklist(cur, bullets),
      sponsor ? renderEmbeddedSponsorBox(sponsor) : null, guest ? renderEmbeddedGuestBox(guest) : null,
      h('div', { class: 'ld-btns' }, h('button', { class: 'btn primary big', onclick: nextSeg }, icon('check', 16), next ? `Done — next ${W.toLowerCase()}` : 'Done'),
        free ? h('button', { class: 'btn', onclick: askPark, title: 'Park a tangent to come back to (P)' }, '↪ Park a tangent') : h('button', { class: 'btn', onclick: () => vm.addTime(cur.id) }, '+2 min'),
        h('button', { class: 'btn', onclick: () => askMarker(`[${cur.title}] `) }, icon('flag', 14), 'Marker'),
        h('span', { class: 'grow' }), h('button', { class: 'btn ghost danger', onclick: () => { if (!vm.cut()) toast(free ? 'No topics left — wrap when you’re done.' : 'That was the last segment — wrap the session when you’re done.'); } }, free ? 'Skip topic' : 'Cut segment')));
    const upNext = next ? h('div', { class: 'ld-card s-next', 'data-key': 'next' },
      h('div', { class: 'ld-card-h' }, h('span', { class: 'ld-l' }, free ? `Suggested next · ${PodcastModel.PRIORITY_LABEL[next.priority || 'Nice'].toLowerCase()}` : `Up next · segment ${rundown.indexOf(next) + 1}`), h('span', { class: 'grow' }), h('span', { class: 'ld-meta' }, `${free ? '~' : ''}${dmin(next.dur)} min`)),
      h('div', { class: 'ld-title' }, h('b', {}, next.title)), next.bullets ? h('div', { class: 'ld-syn clip2' }, next.bullets.split('\n').filter(Boolean).slice(0, 2).join(' · ')) : null,
      h('div', { class: 'ld-chips' }, next.cues ? h('span', { class: 'chip' }, icon('cue', 12), next.cues) : null, next.guestId ? h('span', { class: 'chip' }, icon('user', 12), (vm.guestOf(next) || {}).name || 'Guest') : null, next.sponsorId ? h('span', { class: 'chip' }, icon('dollar', 12), (vm.sponsorOf(next) || {}).name || 'Sponsor') : null),
      h('div', { class: 'ld-btns' }, h('button', { class: 'btn', onclick: () => vm.goTo(rundown.indexOf(next)) }, free ? 'Talk about this' : 'Jump to it'))) : h('div', { class: 'ld-card empty' }, h('span', { class: 'ld-l' }, 'Up next'), h('p', { class: 'muted' }, free ? 'Every topic has been talked about.' : 'This is the last segment.'),
        free ? h('div', { class: 'ld-btns' }, h('button', { class: 'btn', onclick: askPark }, '↪ Park a new topic')) : null);

    /* running order */
    const roRow = (s, i) => h('div', { class: 'ld-ro-row s-' + s.status.toLowerCase() + (i === curIdx ? ' cur' : ''), 'data-key': s.id },
      free ? h('span', { class: 'ld-time', title: PodcastModel.PRIORITY_LABEL[s.priority || 'Nice'], style: { color: PodcastModel.PRIORITY_TONE[s.priority || 'Nice'], fontWeight: 700 } }, (s.priority || 'Nice') === 'If time' ? 'If' : s.priority || 'Nice')
        : h('span', { class: 'ld-time mono' }, `+${Math.floor(tm[i].start)}′`),
      h('button', { class: 'ld-ro-t', onclick: () => vm.goTo(i), title: free ? 'Talk about this now' : 'Go to this segment' }, free ? null : h('b', {}, `${i + 1}. `), s.title, s.parked ? ' ↪' : ''),
      h('span', { class: 'ld-meta' }, `${free ? '~' : ''}${dmin(s.dur)}m`),
      h('button', { class: 'pill st', style: { background: RUNDOWN_TONE[s.status] || '#888' }, title: 'Tap to change: planned → recording → covered → cut', onclick: () => vm.cycleStatus(s.id) }, s.status),
      free ? null : ibtn('up', 'Earlier', () => vm.move(i, -1)), free ? null : ibtn('down', 'Later', () => vm.move(i, 1)));
    /* freeflow: topics still to talk about first (must-covers on top), then the ones done */
    const rank = s => (s.status === 'Recording' ? 0 : s.status === 'Planned' ? 1 : s.status === 'Covered' ? 2 : 3) * 10 + PodcastModel.PRIORITY.indexOf(s.priority || 'Nice');
    const orderRows = free ? rundown.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]) : rundown.map((s, i) => [s, i]);
    const order = ldPanel('pod:order', { title: free ? 'Topics' : 'Running order', ico: 'list', count: `${st.covered}/${st.active}`, hint: free ? (st.mustLeft.length ? `${st.mustLeft.length} must-cover left` : `${st.topicsLeft} left`) : `~${Math.round(st.totalMin)} min`,
      tools: [h('button', { class: 'btn sm ghost', onclick: async () => { const t = await promptBox(free ? 'Add a topic' : 'Add a segment', 'Title of the new topic or segment', ''); if (t) vm.addSegment(t); } }, icon('plus', 13), W), free ? h('button', { class: 'btn sm ghost', onclick: askPark }, '↪ Park') : null, h('a', { class: 'btn sm ghost', href: `#/p/${P.id}/rundown` }, 'Planner')],
      body: () => h('div', { class: 'ld-list ld-ro' }, orderRows.map(([s, i]) => roRow(s, i))) }, draw);
    /* filmed: switch cameras, clip in / out, sync */
    const cams = video ? ldPanel('pod:cams', { title: 'Cameras', ico: 'camera', count: vm.cameras.length || '', hint: vm.curCam || 'tap to log a camera switch',
      tools: [h('a', { class: 'btn sm ghost', href: `#/p/${P.id}/rundown`, onclick: () => { UI.podTab = 'video'; } }, 'Plan')],
      body: () => [vm.cameras.length ? h('div', { class: 'ld-pad' }, vm.cameras.map((c, i) => h('button', { class: 'btn' + (vm.curCam.startsWith(c.name) ? ' primary' : ''), title: `${c.shot}${c.who ? ' · ' + c.who : ''} (${i + 1})`, onclick: () => vm.camSwitch(c.id) }, `${i < 9 ? i + 1 + ' · ' : ''}${c.name}`, h('small', { class: 'ld-meta', style: { marginLeft: '6px' } }, c.shot))))
          : h('p', { class: 'ld-empty' }, 'No cameras in the plan — add them under Cameras & set.'),
        h('div', { class: 'ld-pad' }, h('button', { class: 'btn', onclick: () => vm.mark('Clip in', 'clipIn'), title: 'Clip in (I)' }, '▶ Clip in'), h('button', { class: 'btn', onclick: () => vm.mark('Clip out', 'clipOut'), title: 'Clip out (O)' }, '■ Clip out'), h('button', { class: 'btn', onclick: () => vm.sync(), title: 'Sync clap / slate (S)' }, '👏 Sync clap')),
        vm.clips.length ? h('div', { class: 'ld-meta' }, `${vm.clips.length} clip${vm.clips.length === 1 ? '' : 's'} marked for social`) : null] }, draw) : null;

    /* side panels */
    const markers = ldPanel('pod:markers', { title: 'Editor markers', ico: 'flag', count: vm.markers.length || '', hint: vm.markers[0] ? vm.markers[0].label.slice(0, 32) : '',
      tools: [h('button', { class: 'btn sm ghost', onclick: () => { if (!vm.markers.length) return toast('No markers yet', true); navigator.clipboard.writeText(vm.markersText); toast('Markers copied for the editor'); } }, icon('copy', 13), 'Copy')],
      body: () => [h('div', { class: 'ld-pad' }, vm.marks.map(([k, l, msg]) => h('button', { class: 'btn', onclick: () => vm.mark(msg, k) }, l))),
        h('input', { class: 'inp ld-quick', placeholder: '+ Describe a marker, Enter', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value.trim(); e.target.value = ''; vm.mark(v, 'custom'); } } }),
        ldList('pod:markers', vm.markers, m => h('div', { class: 'ld-ev k-' + m.kind }, h('span', { class: 'ld-time mono' }, f(m.time)), h('span', { class: 'grow' }, m.label), ibtn('trash', 'Delete marker', () => vm.removeMarker(vm.markers.indexOf(m)), 'danger')), { limit: 6, empty: 'Tap a button above, or use the R / C / B / M keys.', cls: 'ld-list ld-log' }, draw)] }, draw);
    const sounds = [['Intro gong', () => PodAudio.playGong(), 'gong'], ['3-2-1 sync', () => PodAudio.playSyncBeeps(), 'sync'], ['Chime', () => PodAudio.playChime(), 'chime'], ['Bleep', () => PodAudio.playBleep(0.7), 'bleep'], ['Ping', () => PodAudio.playPing(), 'ping']];
    const board = ldPanel('pod:sound', { title: 'Soundboard', ico: 'cue', open: false, hint: 'gong, sync, chime, bleep',
      tools: [h('label', { class: 'ld-check small' }, h('input', { type: 'checkbox', checked: vm.autoLogSound, onchange: e => vm.setAutoLogSound(e.target.checked) }), 'Log as marker')],
      body: () => h('div', { class: 'ld-pad' }, sounds.map(([l, fn, k]) => h('button', { class: 'btn', onclick: () => { fn(); if (vm.autoLogSound) vm.logMarker(`[Sound] ${l}`, k); } }, l))) }, draw);
    const meter = PodMicMeter.active ? ldPanel('pod:mic', { title: 'Mic level', ico: 'cue', tools: [h('span', { id: 'podVuClip', class: 'ld-sev', style: { background: 'var(--danger)', display: 'none' } }, 'CLIP'), h('span', { id: 'podVuLabel', class: 'ld-meta mono' }, '— dB')],
      body: () => [h('div', { class: 'vu-meter' }, h('div', { id: 'podVuFill', class: 'vu-fill', style: { width: '0%' } })), h('div', { class: 'ld-row ld-meta', style: { justifyContent: 'space-between' } }, h('span', {}, '−48'), h('span', {}, '−18'), h('span', {}, '−12 target'), h('span', {}, '0 dB'))] }, draw) : null;
    const g = vm.panelGuest;
    const guestP = g ? ldPanel('pod:guest', { title: 'Guest', ico: 'user', hint: g.name,
      tools: pd.guests.length > 1 && !guest ? [h('select', { class: 'inp sm', onchange: e => vm.pickGuest(e.target.value) }, pd.guests.map((x, i) => h('option', { value: i, selected: x === g }, x.name)))] : null,
      body: () => { const qs = (g.questions || '').split('\n').filter(Boolean), asked = qs.filter((q, i) => vm.isAsked(`${g.id}-${i}`)).length;
        return [h('div', { class: 'ld-row' }, h('b', {}, g.name), g.pronouns ? h('span', { class: 'pill' }, g.pronouns) : null, h('span', { class: 'grow' }), g.link ? h('a', { class: 'btn sm', href: /^https?:/.test(g.link) ? g.link : 'https://' + g.link, target: '_blank', rel: 'noreferrer' }, 'Join studio') : null),
          g.title ? h('div', { class: 'ld-meta' }, g.title) : null, g.nogo ? h('div', { class: 'ld-warn' }, `Off limits: ${g.nogo}`) : null,
          qs.length ? h('div', { class: 'ld-ctx-l' }, 'Questions', h('em', {}, `${asked}/${qs.length}`)) : null,
          ldList('pod:q:' + g.id, qs.map((q, i) => [q, `${g.id}-${i}`]), ([q, k]) => h('label', { class: 'ld-check' + (vm.isAsked(k) ? ' done' : '') }, h('input', { type: 'checkbox', checked: vm.isAsked(k), onchange: e => vm.ask(k, e.target.checked) }), h('span', {}, q)), { limit: 6 }, draw)]; } }, draw) : null;
    const sp = vm.panelSponsor;
    const spons = sp ? ldPanel('pod:sponsor', { title: 'Sponsor reads', ico: 'dollar', count: `${pd.sponsors.filter(s => s.recorded).length}/${pd.sponsors.length}`, open: !!sponsor, hint: unread.length ? `${unread.length} to record` : 'all recorded',
      tools: pd.sponsors.length > 1 && !sponsor ? [h('select', { class: 'inp sm', onchange: e => vm.pickSponsor(e.target.value) }, pd.sponsors.map((x, i) => h('option', { value: i, selected: x === sp }, `${x.name} (${x.slot})`)))] : null,
      body: () => [h('div', { class: 'ld-row' }, h('b', {}, sp.name), h('span', { class: 'pill' }, sp.slot), h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => { navigator.clipboard.writeText(sp.copy || ''); toast('Ad copy copied'); } }, icon('copy', 12), 'Copy')),
        sp.url || sp.code ? h('div', { class: 'ld-chips' }, sp.url ? h('span', { class: 'chip' }, sp.url) : null, sp.code ? h('span', { class: 'chip on' }, sp.code) : null) : null,
        h('div', { class: 'ld-read' }, sp.copy || sp.points || 'No copy yet.'),
        h('label', { class: 'ld-check' }, h('input', { type: 'checkbox', checked: !!sp.recorded, onchange: e => vm.setSponsorRecorded(sp.id, e.target.checked) }), 'Recorded')] }, draw) : null;
    const PF = vm.preflightList, N = PF.length;
    const preflight = ldPanel('pod:preflight', { title: 'Pre-flight', ico: 'check', count: `${pre}/${N}`, tone: pre === N ? 'good' : begun ? 'warn' : '', open: !begun, hint: pre === N ? 'studio ready' : `${N - pre} to check`,
      body: () => h('div', { class: 'ld-list' }, PF.map(([k, l]) => h('label', { class: 'ld-check' + (L.preflight[k] ? ' done' : '') }, h('input', { type: 'checkbox', checked: !!L.preflight[k], onchange: e => vm.setPreflight(k, e.target.checked) }), h('span', {}, l)))) }, draw);
    const hotkeys = Device.form() === 'desktop' || !Device.touchOn() ? ldPanel('pod:keys', { title: 'Keyboard', ico: 'keyboard', open: false, hint: 'Space record · N next · R C B M markers',
      body: () => h('div', { class: 'ld-keys' }, [['Space', 'Record / pause'], ['N', `Next ${W.toLowerCase()}`], ['R', 'Retake marker'], ['C', 'Highlight marker'], ['B', 'Bleep'], ['M', 'Custom marker'], ['T', 'Big display'],
        ...(free ? [['P', 'Park a tangent']] : []), ...(video ? [['1–9', 'Switch camera'], ['I / O', 'Clip in / out'], ['S', 'Sync clap']] : [])].map(([k, l]) => h('span', {}, h('kbd', {}, k), l))) }, draw) : null;

    Object.assign(cx, { P, L, date: vm.date, items: vm.issueItems, groups: vm.groups, taskFilter: vm.taskFilter, itemWord: W, issueCats: vm.issueCats, quickIssues: vm.quickIssues });
    morph(wrap, [header, ldAlerts(alerts, draw), h('div', { class: 'ld-grid' },
      h('div', { class: 'ld-main' }, h('div', { class: 'ld-now-row' }, onAir, upNext), order, hotkeys),
      h('div', { class: 'ld-side' }, meter, cams, markers, ldProblems(cx), guestP, spons, preflight, ldCheckin(cx), board, ldTasks(cx), ldActivity(cx)))].filter(Boolean));
    vuUpdate();

    /* talking points: tick them off as you go (no redraw) */
    function renderBulletsChecklist(seg, bullets) {
      if (!bullets.length) return h('p', { class: 'ld-empty' }, 'No talking points for this segment — add them in the rundown planner.');
      return h('div', { class: 'ld-points' }, bullets.map((b, i) => { const key = `${seg.id}-${i}`, on = vm.isTicked(key);
        return h('label', { class: 'ld-check big' + (on ? ' done' : '') }, h('input', { type: 'checkbox', checked: on, onchange: e => { vm.tick(key, e.target.checked); e.target.closest('label').classList.toggle('done', e.target.checked); } }), h('span', {}, b.replace(/^[•\-*]\s*/, ''))); }));
    }
    /* the script as a teleprompter: a window that scrolls itself, with the scrollbar hidden */
    function renderScriptPrompter(P, pr) {
      return h('div', { class: 'ld-prompter' },
        h('div', { class: 'ld-row' }, h('button', { class: 'btn sm primary', onclick: () => vm.setPrompter({ auto: !pr.auto }) }, icon(pr.auto ? 'pause' : 'play', 13), pr.auto ? 'Stop scroll' : 'Auto-scroll'),
          h('div', { class: 'seg sm' }, [[1, '1×'], [1.5, '1.5×'], [2, '2×']].map(([s, l]) => h('button', { class: pr.speed === s ? 'on' : '', onclick: () => vm.setPrompter({ speed: s }) }, l))), h('span', { class: 'grow' }),
          h('button', { class: 'icon-btn', title: 'Smaller text', disabled: pr.size <= 12, onclick: () => vm.setPrompter({ size: pr.size - 2 }) }, 'A−'), h('button', { class: 'icon-btn', title: 'Larger text', disabled: pr.size >= 34, onclick: () => vm.setPrompter({ size: pr.size + 2 }) }, 'A+')),
        h('div', { id: 'podPrompterBox', class: 'prompter-box', style: { fontSize: pr.size + 'px' } }, P.blocks.map(b => h('div', { class: 'pb-' + b.type }, b.text))));
    }
    function renderEmbeddedSponsorBox(sp) {
      return h('div', { class: 'ld-inset sponsor' }, h('div', { class: 'ld-row' }, h('b', {}, `Sponsor read · ${sp.name}`), h('span', { class: 'pill' }, sp.slot), h('span', { class: 'grow' }), h('button', { class: 'btn sm ' + (sp.recorded ? '' : 'primary'), onclick: () => vm.setSponsorRecorded(sp.id, !sp.recorded) }, icon('check', 13), sp.recorded ? 'Recorded' : 'Mark recorded')),
        sp.url || sp.code ? h('div', { class: 'ld-chips' }, sp.url ? h('span', { class: 'chip' }, sp.url) : null, sp.code ? h('span', { class: 'chip on' }, `Code ${sp.code}`) : null) : null,
        h('div', { class: 'ld-read' }, sp.copy || sp.points || ''));
    }
    function renderEmbeddedGuestBox(g) {
      return h('div', { class: 'ld-inset guest' }, h('div', { class: 'ld-row' }, h('b', {}, `Guest · ${g.name}`), g.title ? h('span', { class: 'ld-meta' }, g.title) : null, h('span', { class: 'grow' }), g.link ? h('a', { class: 'btn sm', href: /^https?:/.test(g.link) ? g.link : 'https://' + g.link, target: '_blank', rel: 'noreferrer' }, 'Join studio') : null),
        g.nogo ? h('div', { class: 'ld-warn' }, `Off limits: ${g.nogo}`) : null);
    }
  }
  function vuUpdate() {
    const fill = $('#podVuFill'), label = $('#podVuLabel'), clip = $('#podVuClip'); if (!fill || !label) return;
    const db = PodMicMeter.currentDb; fill.style.width = Math.min(100, Math.max(0, (db + 48) / 48 * 100)) + '%'; label.textContent = `${db.toFixed(1)} dB`; if (clip) clip.style.display = PodMicMeter.isClipping ? '' : 'none';
  }
  /* the clocks tick without a redraw */
  const unsub = PodTimer.subscribe(() => {
    const c = $('#podLiveClock'); if (c) c.textContent = f(PodTimer.elapsedSec);
    const st = $('#podSegTime'); if (st && vm.hasRundown) { const s = vm.state; st.textContent = s.free ? `${f(s.segEl)} · ~${f(s.segTarget)}` : `${f(s.segEl)} / ${f(s.segTarget)}`; st.classList.toggle('neg', !s.free && s.segEl > s.segTarget); }
  });
  const onKeyDown = e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('body > .overlay') || !vm.hasRundown) return;
    const k = e.key.toLowerCase(), act = { ' ': () => vm.record(), n: nextSeg, arrowright: nextSeg,
      r: () => { vm.mark('Retake / line flub', 'retake'); toast('Retake marker'); }, c: () => { vm.mark('Highlight / golden quote', 'quote'); toast('Clip marker'); },
      b: () => { PodAudio.playBleep(0.7); vm.logMarker('Bleep / censor point', 'bleep'); }, m: () => askMarker(), t: () => ldTV(wrap),
      ...(vm.isFree ? { p: askPark } : {}),
      ...(vm.isVideo ? { i: () => { vm.mark('Clip in', 'clipIn'); toast('Clip in'); }, o: () => { vm.mark('Clip out', 'clipOut'); toast('Clip out'); }, s: () => { vm.sync(); toast('Sync clap marked'); } } : {}) }[k]
      || (vm.isVideo && /^[1-9]$/.test(k) && vm.cameras[+k - 1] ? () => vm.camSwitch(vm.cameras[+k - 1].id) : null);
    if (act) { e.preventDefault(); act(); }
  };
  window.addEventListener('keydown', onKeyDown);
  const scroll = setInterval(() => { if (PodTimer.autoScroll && PodTimer.scriptPrompter) { const box = $('#podPrompterBox'); if (box) box.scrollTop += PodTimer.scrollSpeed || 1; } }, 40);
  const unbind = bindView(vm, draw);
  const stop = ldTicker(wrap, { redraw: () => PodTimer.running && vm.refresh(), every: 5000 });
  return () => { stop(); clearInterval(scroll); unsub(); PodMicMeter.stop(); window.removeEventListener('keydown', onKeyDown); unbind(); };
}
