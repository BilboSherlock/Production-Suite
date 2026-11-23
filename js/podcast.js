'use strict';
/* ===================================================================
   Podcast & Audio Suite — Unscripted show planner, episode rundown,
   live clock, guest interview prep, sponsor reads & show notes generator.
   Works alongside the audio script editor for hybrid & audio drama shows.
   =================================================================== */

const POD = P => {
  if (!P.podcast) P.podcast = {};
  const pd = P.podcast;
  pd.rundown = pd.rundown || [];
  pd.guests = pd.guests || [];
  pd.sponsors = pd.sponsors || [];
  pd.gear = pd.gear || [];
  pd.notes = pd.notes || { titleOptions: '', summary: '', links: '', audioCues: [] };
  return pd;
};

const RUNDOWN_STATUS = ['Planned', 'Recording', 'Covered', 'Cut'];
const RUNDOWN_TONE = { Planned: '#8a8f98', Recording: '#e8830c', Covered: '#1e8e54', Cut: '#d6409f' };
const SPONSOR_SLOTS = ['Pre-roll', 'Mid-roll 1', 'Mid-roll 2', 'Mid-roll 3', 'Post-roll'];

const fmtTimeSec = s => {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const parseDurMin = v => {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim();
  if (s.includes(':')) {
    const parts = s.split(':');
    return Math.max(0, (+parts[0] || 0) + (+parts[1] || 0) / 60);
  }
  return Math.max(0, parseFloat(s) || 0);
};

const newSegment = (o = {}) => Object.assign({
  id: uid(),
  title: 'Segment topic',
  dur: 5,            // minutes
  bullets: '',       // talking points / questions
  cues: '',          // audio cue / stinger note
  guestId: '',       // linked guest
  sponsorId: '',     // linked sponsor read
  status: 'Planned', // Planned | Recording | Covered | Cut
  notes: '',
}, o);

const newGuest = (o = {}) => Object.assign({
  id: uid(),
  name: 'Guest Name',
  pronouns: '',
  title: 'Title / Affiliation',
  bio: '',
  questions: '1. What inspired your recent project?\n2. What is the biggest misconception about your field?\n3. What comes next?',
  nogo: '',          // sensitive or off-limits topics
  link: '',          // remote recording link (Zoom / Riverside / Meet)
  timeZone: '',
  plugs: '',         // Twitter/X, Website, Book link
  release: 'Needed', // Needed | Sent | Signed
}, o);

const newSponsor = (o = {}) => Object.assign({
  id: uid(),
  name: 'Sponsor Name',
  slot: 'Mid-roll 1',
  duration: '60s',
  code: '',
  url: '',
  points: '• Mention 30-day money-back guarantee\n• Emphasize ease of setup\n• Must state vanity URL clearly twice',
  copy: 'This episode is brought to you by… Visit [URL] and use promo code [CODE] for 20% off.',
  recorded: false,
}, o);

/* ---------------------------------------------------------------
   Templates for rapid unscripted episode planning
   --------------------------------------------------------------- */
const POD_TEMPLATES = {
  interview: {
    label: 'Standard Interview (45m)',
    desc: 'Cold open, banter, topic intro, in-depth guest interview, sponsor, listener Q&A, outro.',
    segments: [
      { title: 'Cold Open & Hook', dur: 2, bullets: 'Tease the most provocative quote or revelation from today’s guest.\nSoundbite from interview.', cues: 'Theme stinger' },
      { title: 'Show Intro & Co-host Catch-up', dur: 4, bullets: 'Welcome listeners, quick life update or weekly anecdote.\nIntroduce episode theme.', cues: 'Theme music full, then duck under voice' },
      { title: 'Topic Primer / Background Story', dur: 6, bullets: 'Set the stage: why this topic matters right now.\nKey news facts or recent developments.', cues: 'Ambient background bed' },
      { title: 'Sponsor Read: Mid-Roll 1', dur: 1.5, bullets: 'Deliver sponsor talking points.\nMention promo code and vanity URL.', cues: 'Ad transition stinger' },
      { title: 'Guest Interview & Deep Dive', dur: 22, bullets: 'Welcome guest. Career background.\nCore questions and discussion.\nAudience relevance and practical takeaways.', cues: '' },
      { title: 'Audience Mailbag / Q&A', dur: 6, bullets: 'Read 1-2 listener questions from Discord or email.\nGuest and host reactions.', cues: '' },
      { title: 'Outro, Guest Plugs & Credits', dur: 3.5, bullets: 'Where listeners can find the guest.\nNext week’s teaser.\nRate and review reminder, Patreon/community plugs.', cues: 'Outro music swell' },
    ]
  },
  panel: {
    label: 'Panel / Co-hosted News & Banter (60m)',
    desc: '3-4 topic roundtables with co-hosts, ad breaks, hot takes and weekly picks.',
    segments: [
      { title: 'Intro & Banter: Icebreaker of the Week', dur: 6, bullets: 'Fun question or weekend recap among co-hosts.', cues: 'Intro theme' },
      { title: 'Story 1: The Big Headline', dur: 16, bullets: 'Facts of the story.\nPanel reactions & debate.\nLong-term industry implications.', cues: '' },
      { title: 'Sponsor Read: Mid-Roll 1', dur: 1.5, bullets: 'Sponsor read 1.', cues: 'Stinger' },
      { title: 'Story 2: Deep Dive / Tech or Trend', dur: 15, bullets: 'Detailed breakdown.\nContrarian viewpoints.', cues: '' },
      { title: 'Sponsor Read: Mid-Roll 2', dur: 1.5, bullets: 'Sponsor read 2.', cues: 'Stinger' },
      { title: 'Story 3: Wildcard / Rapid Fire', dur: 12, bullets: '3 quick headlines, 60 seconds each host.', cues: '' },
      { title: 'Picks of the Week & Wrap', dur: 8, bullets: 'Book, show, gadget, or life hack recommendations.\nSign-off.', cues: 'Outro theme' },
    ]
  },
  solo: {
    label: 'Solo Commentary / Deep Dive (25m)',
    desc: 'Tight, focused solo episode with structured thoughts, research breakdown and takeaway.',
    segments: [
      { title: 'The Hook & Thesis', dur: 3, bullets: 'The central question or contrarian insight.', cues: 'Theme sting' },
      { title: 'Part 1: How We Got Here (History/Context)', dur: 7, bullets: 'The origins and historical context.\nWhat everyone gets wrong.', cues: 'Subtle music bed' },
      { title: 'Mid-roll Sponsor & Pause', dur: 1.5, bullets: 'Sponsor copy.', cues: 'Ad tone' },
      { title: 'Part 2: The Real Consequence', dur: 9, bullets: 'The hidden angle or data breakdown.\nReal-world case study.', cues: 'Shift in bed music' },
      { title: 'Conclusion & Practical Takeaway', dur: 4.5, bullets: 'What you can do with this information.\nClosing thought.', cues: 'Theme return' },
    ]
  }
};

/* ---------------------------------------------------------------
   Safe Time & Duration Helpers
   --------------------------------------------------------------- */
const podMsMin = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const podFromMin = n => { n = ((Math.round(n) % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };

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
  issues: [],
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
    PodTimer.markers = [];
    PodTimer.issues = [];
    PodTimer.checkedBullets.clear();
    PodTimer.checkedQuestions.clear();
    PodTimer.notify();
  },
  addMarker(label, kind = 'marker') {
    PodTimer.markers.unshift({ time: PodTimer.elapsedSec, label: label || `Marker ${PodTimer.markers.length + 1}`, kind });
    PodTimer.notify();
  },
  addIssue(msg, cat = 'Audio', sev = 'Medium') {
    PodTimer.issues.unshift({ time: PodTimer.elapsedSec, msg, cat, sev, resolved: false });
    PodTimer.addMarker(`[${sev}] ${cat}: ${msg}`, 'issue');
    PodTimer.notify();
  }
};

/* ===============================================================
   Main View: Rundown & Show Planner
   =============================================================== */
Views.rundown = function (root) {
  const P = Store.P;
  const pd = POD(P);
  UI.podTab = UI.podTab || 'rundown';
  const tab = UI.podTab;

  const holder = h('div', { class: 'page podcast-suite', style: { maxWidth: '1280px' } });

  const TABS = [
    ['rundown', 'Rundown & clock'],
    ['guests', `Guest prep (${pd.guests.length})`],
    ['sponsors', `Sponsor reads (${pd.sponsors.length})`],
    ['gear', `Gear & mics (${(pd.gear || []).length})`],
    ['notes', 'Show notes & chapters'],
  ];

  const tabsEl = h('div', { class: 'tabs rep-tabs', style: { marginBottom: '16px' } },
    TABS.map(([k, l]) => h('button', {
      class: k === tab ? 'on' : '',
      onclick: () => { UI.podTab = k; Router.refresh(); }
    }, l)));

  holder.append(
    h('div', { class: 'page-h' },
      h('div', {},
        h('h2', {}, P.title),
        h('div', { class: 'muted small', style: { marginTop: '4px' } },
          `Podcast & Audio Planner · ${pd.rundown.filter(s => s.status !== 'Cut').length} active segments · ${Math.round(pd.rundown.reduce((a, c) => c.status === 'Cut' ? a : a + parseDurMin(c.dur), 0))} min target`)),
      h('span', { class: 'grow' }),
      h('a', { class: 'btn', href: `#/p/${P.id}/script` }, icon('pen', 15), 'Open audio script')),
    tabsEl);

  const content = h('div', { class: 'pod-content' });
  holder.append(content);
  root.append(holder);

  if (tab === 'rundown') renderRundownTab(content, P, pd);
  else if (tab === 'guests') renderGuestsTab(content, P, pd);
  else if (tab === 'sponsors') renderSponsorsTab(content, P, pd);
  else if (tab === 'gear') renderPodGearTab(content, P, pd);
  else if (tab === 'notes') renderNotesTab(content, P, pd);

  const unsub = PodTimer.subscribe(() => {
    const clockEl = $('#podLiveClock');
    if (clockEl) clockEl.textContent = fmtTimeSec(PodTimer.elapsedSec);
    const badge = $('#podAheadBehind');
    if (badge && P.podcast && P.podcast.rundown) {
      updateTimerPacing(badge, P.podcast.rundown);
    }
  });

  return () => {
    unsub();
  };
};

/* ---------------------------------------------------------------
   Sub-tab 1: Episode Rundown & Live Clock
   --------------------------------------------------------------- */
function renderRundownTab(root, P, pd) {
  root.innerHTML = '';

  // Calculate cumulative times (in minutes) for each segment
  let cumMin = 0;
  const segTimings = pd.rundown.map(s => {
    const start = cumMin;
    const dur = s.status === 'Cut' ? 0 : parseDurMin(s.dur);
    cumMin += dur;
    return { start, dur, end: cumMin };
  });

  const totalMin = cumMin;

  // Live Timer Bar
  const timerBar = h('div', { class: 'card pod-timer-bar', style: { padding: '14px 18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', background: 'var(--surface2)', borderColor: PodTimer.running ? 'var(--accent)' : 'var(--border)' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      h('span', { class: 'pill', style: { background: PodTimer.running ? 'var(--ok)' : 'var(--muted)', color: '#fff', fontWeight: 700 } }, PodTimer.running ? 'LIVE RECORDING' : 'CLOCK READY'),
      h('b', { id: 'podLiveClock', style: { fontFamily: 'var(--mono)', fontSize: '26px', letterSpacing: '0.04em' } }, fmtTimeSec(PodTimer.elapsedSec))),
    h('div', { id: 'podAheadBehind', class: 'small muted', style: { fontWeight: 600 } }, 'Pacing: On schedule'),
    h('span', { class: 'grow' }),
    h('div', { class: 'row', style: { gap: '8px' } },
      h('button', {
        class: 'btn primary sm',
        onclick: () => { PodTimer.running ? PodTimer.pause() : PodTimer.start(); Router.refresh(); }
      }, icon(PodTimer.running ? 'pause' : 'play', 14), PodTimer.running ? 'Pause' : 'Start recording'),
      h('button', {
        class: 'btn sm',
        onclick: () => { if (confirm('Reset recording clock to 00:00?')) { PodTimer.reset(); Router.refresh(); } }
      }, icon('rotate', 14), 'Reset'),
      h('button', {
        class: 'btn sm',
        title: 'Log time marker for editing note',
        onclick: () => {
          const l = prompt('Marker description (e.g., retake intro, audio drop):');
          if (l) { PodTimer.addMarker(l); toast(`Marker logged at ${fmtTimeSec(PodTimer.elapsedSec)}`); }
        }
      }, icon('pin', 14), 'Drop marker')));

  // Toolbar
  const toolbar = h('div', { class: 'toolbar', style: { marginBottom: '14px' } },
    h('button', {
      class: 'btn primary',
      onclick: () => {
        pd.rundown.push(newSegment({ title: `Segment ${pd.rundown.length + 1}` }));
        Store.touch();
        Router.refresh();
      }
    }, icon('plus', 15), 'Add segment'),
    h('button', {
      class: 'btn',
      onclick: e => openTemplateMenu(e.currentTarget, P, pd)
    }, icon('grid', 15), 'Apply template…'),
    h('span', { class: 'small muted', style: { marginLeft: '8px' } }, `Total Planned Run: ~${Math.round(totalMin)} minutes (${fmtTimeSec(totalMin * 60)})`),
    h('span', { class: 'grow' }),
    h('button', {
      class: 'btn sm ghost',
      onclick: () => download(slug(P.title) + '-rundown.csv', exportRundownCSV(P, pd, segTimings), 'text/csv')
    }, icon('download', 14), 'Export CSV'),
    h('button', {
      class: 'btn sm ghost',
      onclick: () => copyRundownText(P, pd, segTimings)
    }, icon('copy', 14), 'Copy summary'));

  // Rundown Items List
  const list = h('div', { class: 'pod-seg-list', style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

  if (!pd.rundown.length) {
    list.append(h('div', { class: 'empty' },
      h('h3', {}, 'No segments planned yet'),
      h('p', {}, 'Add your first segment or pick a ready-made podcast template to build your episode flow.'),
      h('button', { class: 'btn primary', onclick: () => { applyTemplate('interview', P, pd); Router.refresh(); } }, 'Load standard interview template (45m)')));
  } else {
    pd.rundown.forEach((seg, idx) => {
      const timing = segTimings[idx];
      const isCut = seg.status === 'Cut';

      const row = h('div', {
        class: 'card pod-seg-card' + (isCut ? ' muted-seg' : ''),
        style: {
          padding: '12px 16px',
          borderColor: seg.status === 'Recording' ? 'var(--accent)' : 'var(--border)',
          opacity: isCut ? '0.6' : '1',
          borderLeft: `4px solid ${RUNDOWN_TONE[seg.status] || 'var(--border)'}`
        }
      });

      // Top Header: Timing, Title, Status, Controls
      const topRow = h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', marginBottom: '8px' } },
        h('span', {
          class: 'pill',
          style: { fontFamily: 'var(--mono)', fontSize: '13px', background: 'var(--surface2)', color: 'var(--text)', fontWeight: 700 }
        }, `${fmtTimeSec(timing.start * 60)}`),
        h('span', { class: 'small muted', style: { fontWeight: 600 } }, `#${idx + 1}`),
        h('input', {
          class: 'inp',
          style: { fontWeight: 700, fontSize: '15px', flex: 1 },
          value: seg.title,
          placeholder: 'Segment title / topic…',
          oninput: e => { seg.title = e.target.value; Store.touch(); }
        }),
        h('div', { class: 'row', style: { gap: '4px', alignItems: 'center' } },
          h('input', {
            class: 'inp',
            type: 'number',
            step: '0.5',
            min: '0.5',
            style: { width: '65px', textAlign: 'right', fontWeight: 600 },
            value: seg.dur,
            title: 'Target duration in minutes',
            onchange: e => { seg.dur = Math.max(0.5, parseFloat(e.target.value) || 1); Store.touch(); Router.refresh(); }
          }),
          h('span', { class: 'small muted' }, 'min')),
        h('select', {
          class: 'inp sm',
          style: { width: 'auto', fontWeight: 600 },
          onchange: e => { seg.status = e.target.value; Store.touch(); Router.refresh(); }
        }, RUNDOWN_STATUS.map(st => h('option', { value: st, selected: st === seg.status }, st))),
        h('button', {
          class: 'icon-btn',
          title: 'Move up',
          disabled: idx === 0,
          onclick: () => { const s = pd.rundown.splice(idx, 1)[0]; pd.rundown.splice(idx - 1, 0, s); Store.touch(); Router.refresh(); }
        }, icon('up', 14)),
        h('button', {
          class: 'icon-btn',
          title: 'Move down',
          disabled: idx === pd.rundown.length - 1,
          onclick: () => { const s = pd.rundown.splice(idx, 1)[0]; pd.rundown.splice(idx + 1, 0, s); Store.touch(); Router.refresh(); }
        }, icon('down', 14)),
        h('button', {
          class: 'icon-btn danger',
          title: 'Delete segment',
          onclick: () => { if (confirm(`Delete segment “${seg.title}”?`)) { pd.rundown.splice(idx, 1); Store.touch(); Router.refresh(); } }
        }, icon('trash', 14)));

      // Body: Talking Points, Cues, Links
      const bodyRow = h('div', { class: 'row', style: { gap: '14px', alignItems: 'flex-start' } },
        h('div', { style: { flex: 2 } },
          h('label', { class: 'lbl small muted' }, 'Talking points & questions (one per line)'),
          h('textarea', {
            class: 'inp',
            rows: Math.max(2, (seg.bullets || '').split('\n').length),
            placeholder: '• Key points to hit\n• Questions to ask\n• Anecdotes or stats',
            value: seg.bullets || '',
            oninput: e => { seg.bullets = e.target.value; Store.touch(); }
          })),
        h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('div', {},
            h('label', { class: 'lbl small muted' }, 'Audio cue / Stinger / Drop'),
            h('input', {
              class: 'inp sm',
              placeholder: 'e.g. Intro theme, sound bite, stinger',
              value: seg.cues || '',
              oninput: e => { seg.cues = e.target.value; Store.touch(); }
            })),
          h('div', {},
            h('label', { class: 'lbl small muted' }, 'Attach Guest or Sponsor'),
            h('div', { class: 'row', style: { gap: '6px' } },
              h('select', {
                class: 'inp sm',
                style: { flex: 1 },
                onchange: e => { seg.guestId = e.target.value; Store.touch(); }
              }, h('option', { value: '' }, '(No guest linked)'),
                pd.guests.map(g => h('option', { value: g.id, selected: g.id === seg.guestId }, 'Guest: ' + g.name))),
              h('select', {
                class: 'inp sm',
                style: { flex: 1 },
                onchange: e => { seg.sponsorId = e.target.value; Store.touch(); }
              }, h('option', { value: '' }, '(No sponsor linked)'),
                pd.sponsors.map(sp => h('option', { value: sp.id, selected: sp.id === seg.sponsorId }, 'Ad: ' + sp.name)))))));

      row.append(topRow, bodyRow);
      list.append(row);
    });
  }

  root.append(timerBar, toolbar, list);
}

function updateTimerPacing(badge, rundown) {
  let plannedElapsed = 0;
  for (let i = 0; i < rundown.length; i++) {
    const s = rundown[i];
    if (s.status === 'Covered') plannedElapsed += parseDurMin(s.dur) * 60;
    else if (s.status === 'Recording') { plannedElapsed += (parseDurMin(s.dur) * 60) / 2; break; }
  }
  const diffSec = PodTimer.elapsedSec - plannedElapsed;
  if (Math.abs(diffSec) < 30) {
    badge.className = 'small muted';
    badge.textContent = 'Pacing: On schedule';
  } else if (diffSec > 0) {
    badge.className = 'small';
    badge.style.color = 'var(--warn)';
    badge.textContent = `Pacing: +${fmtTimeSec(diffSec)} behind schedule`;
  } else {
    badge.className = 'small';
    badge.style.color = 'var(--ok)';
    badge.textContent = `Pacing: -${fmtTimeSec(Math.abs(diffSec))} ahead of schedule`;
  }
}

function openTemplateMenu(anchor, P, pd) {
  menu(anchor, Object.entries(POD_TEMPLATES).map(([k, t]) => ({
    label: t.label,
    desc: t.desc,
    onClick: () => {
      if (pd.rundown.length && !confirm(`Replace current rundown with "${t.label}"?`)) return;
      applyTemplate(k, P, pd);
      Router.refresh();
      toast(`Applied ${t.label}`);
    }
  })));
}

function applyTemplate(key, P, pd) {
  const tpl = POD_TEMPLATES[key];
  if (!tpl) return;
  pd.rundown = tpl.segments.map(s => newSegment(s));
  Store.touch();
}

function exportRundownCSV(P, pd, timings) {
  const rows = [['Segment #', 'Start Time', 'Target (min)', 'Title', 'Talking Points', 'Audio Cues', 'Status']];
  pd.rundown.forEach((s, i) => {
    const tm = timings[i];
    rows.push([
      i + 1,
      fmtTimeSec(tm.start * 60),
      s.dur,
      s.title,
      (s.bullets || '').replace(/\n/g, ' | '),
      s.cues || '',
      s.status
    ]);
  });
  return toCSV(rows);
}

function copyRundownText(P, pd, timings) {
  const lines = [`${P.title.toUpperCase()} — EPISODE RUNDOWN`, '='.repeat(40), ''];
  pd.rundown.forEach((s, i) => {
    const tm = timings[i];
    lines.push(`[${fmtTimeSec(tm.start * 60)}] #${i + 1}: ${s.title.toUpperCase()} (${s.dur} min)${s.status === 'Cut' ? ' [CUT]' : ''}`);
    if (s.cues) lines.push(`   AUDIO CUE: ${s.cues}`);
    if (s.bullets) {
      s.bullets.split('\n').filter(Boolean).forEach(b => lines.push(`   • ${b.replace(/^[•\-*]\s*/, '')}`));
    }
    lines.push('');
  });
  navigator.clipboard.writeText(lines.join('\n'));
  toast('Rundown copied to clipboard');
}

/* ---------------------------------------------------------------
   Sub-tab 2: Guest Interview Prep
   --------------------------------------------------------------- */
function renderGuestsTab(root, P, pd) {
  root.innerHTML = '';

  const bar = h('div', { class: 'toolbar', style: { marginBottom: '16px' } },
    h('button', {
      class: 'btn primary',
      onclick: () => {
        pd.guests.push(newGuest());
        Store.touch();
        Router.refresh();
      }
    }, icon('plus', 15), 'Add guest'),
    h('span', { class: 'small muted' }, `${pd.guests.length} guest profile${pd.guests.length === 1 ? '' : 's'} for this episode`),
    h('span', { class: 'grow' }),
    h('button', {
      class: 'btn sm ghost',
      onclick: () => copyGuestsDigest(pd)
    }, icon('copy', 14), 'Copy all questions'));

  const grid = h('div', { class: 'pod-guest-grid', style: { display: 'flex', flexDirection: 'column', gap: '16px' } });

  if (!pd.guests.length) {
    grid.append(h('div', { class: 'empty' },
      h('h3', {}, 'No interview guests added yet'),
      h('p', {}, 'Plan guest bios, talking points, questions to ask, sensitive topics to avoid, and remote call links.'),
      h('button', { class: 'btn primary', onclick: () => { pd.guests.push(newGuest()); Store.touch(); Router.refresh(); } }, 'Add first guest')));
  } else {
    pd.guests.forEach((g, idx) => {
      const card = h('div', { class: 'card', style: { padding: '16px 20px' } });

      // Header row
      const head = h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', marginBottom: '14px' } },
        h('span', { class: 'ico', style: { color: 'var(--accent)' } }, icon('user', 20)),
        h('input', {
          class: 'inp',
          style: { fontWeight: 700, fontSize: '17px', flex: 1 },
          value: g.name,
          placeholder: 'Guest name…',
          oninput: e => { g.name = e.target.value; Store.touch(); }
        }),
        h('input', {
          class: 'inp',
          style: { width: '100px' },
          value: g.pronouns || '',
          placeholder: 'they/them',
          title: 'Pronouns',
          oninput: e => { g.pronouns = e.target.value; Store.touch(); }
        }),
        h('select', {
          class: 'inp sm',
          style: { width: 'auto', fontWeight: 600 },
          title: 'Guest appearance release status',
          onchange: e => { g.release = e.target.value; Store.touch(); }
        }, ['Needed', 'Sent', 'Signed'].map(r => h('option', { value: r, selected: r === g.release }, `Release: ${r}`))),
        h('button', {
          class: 'icon-btn danger',
          title: 'Delete guest',
          onclick: () => { if (confirm(`Remove guest ${g.name}?`)) { pd.guests.splice(idx, 1); Store.touch(); Router.refresh(); } }
        }, icon('trash', 14)));

      // Info row: Title, Remote Link, Timezone
      const infoRow = h('div', { class: 'row wrap', style: { gap: '12px', marginBottom: '12px' } },
        h('div', { style: { flex: 2, minWidth: '220px' } },
          h('label', { class: 'lbl small muted' }, 'Title / Credentials / Organization'),
          h('input', {
            class: 'inp',
            value: g.title || '',
            placeholder: 'e.g. Lead Astronomer, Author of Signal',
            oninput: e => { g.title = e.target.value; Store.touch(); }
          })),
        h('div', { style: { flex: 2, minWidth: '220px' } },
          h('label', { class: 'lbl small muted' }, 'Remote Recording Link (Riverside / Squadcast / Zoom)'),
          h('div', { class: 'row', style: { gap: '6px' } },
            h('input', {
              class: 'inp',
              value: g.link || '',
              placeholder: 'https://riverside.fm/studio/...',
              oninput: e => { g.link = e.target.value; Store.touch(); }
            }),
            g.link ? h('a', {
              class: 'btn sm',
              href: g.link.startsWith('http') ? g.link : 'https://' + g.link,
              target: '_blank',
              rel: 'noreferrer'
            }, 'Open') : null)),
        h('div', { style: { flex: 1, minWidth: '130px' } },
          h('label', { class: 'lbl small muted' }, 'Time Zone / Location'),
          h('input', {
            class: 'inp',
            value: g.timeZone || '',
            placeholder: 'EST (UTC-5)',
            oninput: e => { g.timeZone = e.target.value; Store.touch(); }
          })));

      // Bio & Plugs
      const bioRow = h('div', { class: 'row wrap', style: { gap: '12px', marginBottom: '12px' } },
        h('div', { style: { flex: 2, minWidth: '280px' } },
          h('label', { class: 'lbl small muted' }, 'Short Bio & Context'),
          h('textarea', {
            class: 'inp',
            rows: 2,
            value: g.bio || '',
            placeholder: 'Brief background to read on air during introduction…',
            oninput: e => { g.bio = e.target.value; Store.touch(); }
          })),
        h('div', { style: { flex: 1, minWidth: '200px' } },
          h('label', { class: 'lbl small muted' }, 'Guest Plugs & Socials (Website, X, Book)'),
          h('textarea', {
            class: 'inp',
            rows: 2,
            value: g.plugs || '',
            placeholder: '@handle, website.com, new book title',
            oninput: e => { g.plugs = e.target.value; Store.touch(); }
          })));

      // Interview Questions Checklist & Sensitive Topics
      const qRow = h('div', { class: 'row wrap', style: { gap: '14px', alignItems: 'flex-start' } },
        h('div', { style: { flex: 2, minWidth: '300px' } },
          h('label', { class: 'lbl small muted' }, 'Core Questions & Discussion Angles'),
          h('textarea', {
            class: 'inp',
            rows: 5,
            value: g.questions || '',
            placeholder: '1. First question…\n2. Follow-up angle…\n3. Practical advice…',
            oninput: e => { g.questions = e.target.value; Store.touch(); }
          })),
        h('div', { style: { flex: 1, minWidth: '240px' } },
          h('label', { class: 'lbl small', style: { color: 'var(--warn)', fontWeight: 600 } }, '⚠️ Sensitive / No-Go Topics (Do NOT ask)'),
          h('textarea', {
            class: 'inp',
            rows: 5,
            style: { borderColor: g.nogo ? 'var(--warn)' : 'var(--border)', background: g.nogo ? 'color-mix(in srgb, var(--warn) 6%, transparent)' : 'transparent' },
            value: g.nogo || '',
            placeholder: 'Topics the guest requested to avoid, legal non-disclosures, private topics…',
            oninput: e => { g.nogo = e.target.value; Store.touch(); }
          })));

      card.append(head, infoRow, bioRow, qRow);
      grid.append(card);
    });
  }

  root.append(bar, grid);
}

function copyGuestsDigest(pd) {
  const lines = ['GUEST INTERVIEW PREPARATION', '='.repeat(35), ''];
  pd.guests.forEach(g => {
    lines.push(`GUEST: ${g.name} (${g.pronouns || 'N/A'})`);
    if (g.title) lines.push(`TITLE: ${g.title}`);
    if (g.link) lines.push(`RECORDING LINK: ${g.link}`);
    if (g.bio) lines.push(`BIO: ${g.bio}`);
    if (g.nogo) lines.push(`⚠️ DO NOT DISCUSS: ${g.nogo}`);
    lines.push('QUESTIONS:');
    (g.questions || '').split('\n').filter(Boolean).forEach(q => lines.push(`  ${q}`));
    lines.push('');
  });
  navigator.clipboard.writeText(lines.join('\n'));
  toast('Guest interview notes copied');
}

/* ---------------------------------------------------------------
   Sub-tab 3: Sponsor Reads & Ad Copy
   --------------------------------------------------------------- */
function renderSponsorsTab(root, P, pd) {
  root.innerHTML = '';

  const bar = h('div', { class: 'toolbar', style: { marginBottom: '16px' } },
    h('button', {
      class: 'btn primary',
      onclick: () => {
        pd.sponsors.push(newSponsor());
        Store.touch();
        Router.refresh();
      }
    }, icon('plus', 15), 'Add sponsor read'),
    h('span', { class: 'small muted' }, `${pd.sponsors.length} ad read campaign${pd.sponsors.length === 1 ? '' : 's'}`),
    h('span', { class: 'grow' }),
    h('button', {
      class: 'btn sm ghost',
      onclick: () => copyAllSponsorsText(pd)
    }, icon('copy', 14), 'Copy all ad copy'));

  const grid = h('div', { class: 'pod-sponsor-grid', style: { display: 'flex', flexDirection: 'column', gap: '16px' } });

  if (!pd.sponsors.length) {
    grid.append(h('div', { class: 'empty' },
      h('h3', {}, 'No sponsor reads configured'),
      h('p', {}, 'Track sponsor campaigns, promo codes, mandatory talking points, and full host-read ad copy.'),
      h('button', { class: 'btn primary', onclick: () => { pd.sponsors.push(newSponsor()); Store.touch(); Router.refresh(); } }, 'Add first sponsor read')));
  } else {
    pd.sponsors.forEach((sp, idx) => {
      const card = h('div', { class: 'card', style: { padding: '16px 20px', borderLeft: sp.recorded ? '4px solid var(--ok)' : '4px solid var(--accent)' } });

      const topRow = h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', marginBottom: '12px' } },
        h('span', { class: 'ico', style: { color: 'var(--accent)' } }, icon('dollar', 18)),
        h('input', {
          class: 'inp',
          style: { fontWeight: 700, fontSize: '16px', flex: 2 },
          value: sp.name,
          placeholder: 'Sponsor / Brand name…',
          oninput: e => { sp.name = e.target.value; Store.touch(); }
        }),
        h('select', {
          class: 'inp sm',
          style: { flex: 1 },
          onchange: e => { sp.slot = e.target.value; Store.touch(); }
        }, SPONSOR_SLOTS.map(sl => h('option', { value: sl, selected: sl === sp.slot }, sl))),
        h('select', {
          class: 'inp sm',
          style: { width: '80px' },
          onchange: e => { sp.duration = e.target.value; Store.touch(); }
        }, ['30s', '60s', '90s'].map(d => h('option', { value: d, selected: d === sp.duration }, d))),
        h('label', { class: 'row small', style: { gap: '6px', fontWeight: 600, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: !!sp.recorded,
            onchange: e => { sp.recorded = e.target.checked; Store.touch(); Router.refresh(); }
          }),
          'Recorded'),
        h('button', {
          class: 'icon-btn danger',
          title: 'Delete sponsor',
          onclick: () => { if (confirm(`Remove sponsor read for ${sp.name}?`)) { pd.sponsors.splice(idx, 1); Store.touch(); Router.refresh(); } }
        }, icon('trash', 14)));

      const metaRow = h('div', { class: 'row wrap', style: { gap: '12px', marginBottom: '12px' } },
        h('div', { style: { flex: 1, minWidth: '180px' } },
          h('label', { class: 'lbl small muted' }, 'Promo Code'),
          h('input', {
            class: 'inp',
            style: { fontFamily: 'var(--mono)', fontWeight: 700 },
            value: sp.code || '',
            placeholder: 'e.g. PODCAST20',
            oninput: e => { sp.code = e.target.value; Store.touch(); }
          })),
        h('div', { style: { flex: 2, minWidth: '240px' } },
          h('label', { class: 'lbl small muted' }, 'Vanity URL / Landing Page'),
          h('input', {
            class: 'inp',
            value: sp.url || '',
            placeholder: 'e.g. brand.com/podcast',
            oninput: e => { sp.url = e.target.value; Store.touch(); }
          })));

      const copyRow = h('div', { class: 'row wrap', style: { gap: '14px', alignItems: 'flex-start' } },
        h('div', { style: { flex: 2, minWidth: '320px' } },
          h('div', { class: 'row', style: { marginBottom: '4px' } },
            h('label', { class: 'lbl small muted' }, 'Host-Read Ad Copy'),
            h('span', { class: 'grow' }),
            h('button', {
              class: 'btn sm ghost',
              onclick: () => { navigator.clipboard.writeText(sp.copy || ''); toast('Ad copy copied'); }
            }, icon('copy', 13), 'Copy copy')),
          h('textarea', {
            class: 'inp',
            rows: 5,
            style: { fontStyle: 'italic', lineHeight: '1.45' },
            value: sp.copy || '',
            placeholder: 'Scripted host read text to read on mic…',
            oninput: e => { sp.copy = e.target.value; Store.touch(); }
          })),
        h('div', { style: { flex: 1, minWidth: '240px' } },
          h('label', { class: 'lbl small muted' }, 'Mandatory Points & Claims'),
          h('textarea', {
            class: 'inp',
            rows: 5,
            value: sp.points || '',
            placeholder: '• Must mention offer expires Dec 31\n• Mention free shipping…',
            oninput: e => { sp.points = e.target.value; Store.touch(); }
          })));

      card.append(topRow, metaRow, copyRow);
      grid.append(card);
    });
  }

  root.append(bar, grid);
}

function copyAllSponsorsText(pd) {
  const lines = ['EPISODE SPONSOR READS', '='.repeat(30), ''];
  pd.sponsors.forEach(s => {
    lines.push(`SPONSOR: ${s.name} (${s.slot} - ${s.duration})`);
    if (s.code) lines.push(`CODE: ${s.code}`);
    if (s.url) lines.push(`URL: ${s.url}`);
    if (s.points) lines.push(`MANDATORY POINTS:\n${s.points}`);
    if (s.copy) lines.push(`SCRIPT:\n${s.copy}`);
    lines.push('\n----------------------------------------\n');
  });
  navigator.clipboard.writeText(lines.join('\n'));
  toast('All sponsor reads copied');
}

/* ---------------------------------------------------------------
   Sub-tab 4: Studio Gear & Mics Manager
   --------------------------------------------------------------- */
function renderPodGearTab(root, P, pd) {
  root.innerHTML = '';
  pd.gear = pd.gear || [];
  let q = '', st = '';

  const wrap = h('div');
  root.append(wrap, h('datalist', { id: 'dl-podgearsrc' }, ['Owned', ...new Set(pd.gear.map(g => g.source).filter(x => x && x !== 'Owned'))].map(x => h('option', { value: x }))));

  const days = g => +g.days || P.days.length || 1;
  const cost = g => (+g.qty || 0) * (+g.rate || 0) * days(g);
  const csvRows = () => [['Category', 'Item', 'Qty', 'Source', 'Rate/day', 'Days', 'Total', 'Pick-up', 'Return', 'Status', 'Notes'], ...pd.gear.map(g => [g.cat, g.name, g.qty, g.source, g.rate, days(g), cost(g), g.pickup, g.ret, g.status, g.notes])];

  function toBudget() {
    let n = 0;
    pd.gear.filter(g => (+g.rate || 0) > 0).forEach(g => {
      const key = 'gear:' + g.id;
      let l = P.budget.find(x => x.auto === key);
      if (!l) { l = { id: uid(), auto: key }; P.budget.push(l); }
      const cat = (typeof PODCAST_GEAR_BUDGET !== 'undefined' && PODCAST_GEAR_BUDGET[g.cat]) || 'Audio Engineering';
      Object.assign(l, {
        cat,
        desc: `${g.name}${g.source && g.source !== 'Owned' ? ' (' + g.source + ')' : ''}`,
        qty: (+g.qty || 1) * days(g),
        unit: 'Day',
        rate: +g.rate || 0
      });
      n++;
    });
    Store.touch();
    toast(n ? `Budget updated with ${n} gear line${n > 1 ? 's' : ''}` : 'Add a day rate to gear items first.', !n);
  }

  function draw() {
    const cats = typeof PODCAST_GEAR_CATS !== 'undefined' ? PODCAST_GEAR_CATS : [
      'Microphones', 'Audio Interfaces & Mixers', 'Recorders & Preamps',
      'Headphones & Monitoring', 'Stands, Arms & Shockmounts', 'Cables, Adapters & Power',
      'Acoustic Treatment & Shields', 'Cameras & Video (Vodcast)', 'Storage & Media', 'Other / Field Kit'
    ];
    const statuses = typeof PODCAST_GEAR_STATUS !== 'undefined' ? PODCAST_GEAR_STATUS : ['Needed', 'Reserved', 'Picked up', 'In Studio', 'Returned'];

    const rows = pd.gear.filter(g => (!st || g.status === st) && (!q || JSON.stringify(Object.values(g)).toLowerCase().includes(q)));
    const total = sum(pd.gear, cost);
    const done = pd.gear.filter(g => ['Picked up', 'In Studio', 'On set', 'Returned'].includes(g.status)).length;

    const body = h('div');
    cats.forEach(c => {
      const ls = rows.filter(g => g.cat === c);
      if (!ls.length) return;
      body.append(
        h('h3', { style: { fontSize: '14px', margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' } }, `${c} · ${ls.length}`),
        h('div', { class: 'rep-wrap' },
          h('table', { class: 'tbl wide gear-t' },
            h('thead', {}, h('tr', {}, ['Item', 'Qty', 'Source', 'Rate / day', 'Days', 'Total', 'Pick-up', 'Return', 'Status', ''].map(x => h('th', {}, x)))),
            h('tbody', {}, ls.map(g => {
              const tot = h('td', { style: { whiteSpace: 'nowrap', fontWeight: 600 } }, money(cost(g)));
              const f = (k, o = {}) => h('input', {
                class: 'cell',
                type: o.type,
                list: o.list,
                min: o.type === 'number' ? 0 : undefined,
                value: g[k] || '',
                placeholder: o.ph || '',
                style: o.w ? { width: o.w } : {},
                oninput: e => { g[k] = e.target.value; tot.textContent = money(cost(g)); Store.touch(); }
              });
              return h('tr', {},
                h('td', {}, f('name', { ph: 'Item name / model' })),
                h('td', {}, f('qty', { type: 'number', w: '58px' })),
                h('td', {}, f('source', { list: 'dl-podgearsrc', ph: 'Owned / rental house' })),
                h('td', {}, f('rate', { type: 'number', w: '84px' })),
                h('td', {}, f('days', { type: 'number', w: '58px', ph: String(P.days.length || 1) })),
                tot,
                h('td', {}, f('pickup', { type: 'date' })),
                h('td', {}, f('ret', { type: 'date' })),
                h('td', {}, h('select', {
                  class: 'cell',
                  onchange: e => { g.status = e.target.value; Store.touch(); draw(); }
                }, statuses.map(s => h('option', { selected: s === g.status }, s)))),
                h('td', { style: { width: '70px' } },
                  ibtn('copy', 'Duplicate', () => { pd.gear.splice(pd.gear.indexOf(g) + 1, 0, { ...g, id: uid() }); Store.touch(); draw(); }),
                  ibtn('trash', 'Delete', () => { pd.gear = pd.gear.filter(x => x !== g); Store.touch(); draw(); }, 'danger')));
            })))));
    });

    wrap.replaceChildren(
      // Summary & Metrics Bar
      h('div', { class: 'sum', style: { marginBottom: '14px' } },
        h('div', {}, h('span', {}, 'Audio items'), h('b', {}, String(pd.gear.length))),
        h('div', {}, h('span', {}, 'Studio ready'), h('b', {}, `${done}/${pd.gear.length}`)),
        h('div', {}, h('span', {}, 'Gear & rental cost'), h('b', { style: { color: 'var(--accent)' } }, money(total)))),

      // Toolbar
      h('div', { class: 'toolbar', style: { marginBottom: '12px', flexWrap: 'wrap', gap: '8px' } },
        h('button', {
          class: 'btn primary',
          onclick: e => menu(e.currentTarget, cats.map(c => ({
            label: c,
            onClick: () => {
              pd.gear.push({ id: uid(), cat: c, name: '', qty: 1, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'Needed', notes: '' });
              Store.touch();
              draw();
            }
          })))
        }, icon('plus', 15), 'Add gear item'),
        h('button', {
          class: 'btn',
          title: 'Load standard studio broadcast kit',
          onclick: () => {
            const starter = typeof starterPodcastGear === 'function' ? starterPodcastGear() : [];
            starter.forEach(g => pd.gear.push(g));
            Store.touch();
            toast('Loaded studio podcast starter kit');
            draw();
          }
        }, icon('wand', 15), 'Add audio starter kit'),
        h('button', {
          class: 'btn',
          title: 'Create budget lines from items with a day rate',
          onclick: toBudget
        }, icon('dollar', 15), 'Send to budget'),
        h('button', {
          class: 'btn',
          onclick: e => menu(e.currentTarget, [
            {
              label: 'Pack list (print)',
              icon: 'print',
              onClick: () => printTable('Podcast Gear Pack List', ['☐', 'Category', 'Item', 'Qty', 'Source', 'Status'], cats.flatMap(c => {
                const ls = pd.gear.filter(g => g.cat === c);
                return ls.length ? [{ grp: c }, ...ls.map(g => ['☐', g.cat, g.name, g.qty, g.source, g.status])] : [];
              }), { landscape: false })
            },
            {
              label: 'Rental orders (print)',
              icon: 'print',
              onClick: () => {
                const by = new Map();
                pd.gear.filter(g => g.source && g.source !== 'Owned').forEach(g => {
                  if (!by.has(g.source)) by.set(g.source, []);
                  by.get(g.source).push(g);
                });
                if (!by.size) return toast('No rental items — set Source to the rental house name.', true);
                printTable('Podcast Rental Orders', ['Item', 'Qty', 'Days', 'Pick-up', 'Return', 'Total'], [...by].flatMap(([s, ls]) => [
                  { grp: `${s} — ${money(sum(ls, cost))}` },
                  ...ls.map(g => [g.name, g.qty, days(g), g.pickup, g.ret, money(cost(g))])
                ]), { landscape: false });
              }
            },
            {
              label: 'Export CSV',
              icon: 'download',
              onClick: () => download(slug(P.title) + '-gear.csv', toCSV(csvRows()), 'text/csv')
            }
          ])
        }, icon('print', 15), 'Reports'),
        h('span', { class: 'grow' }),
        h('input', {
          class: 'inp',
          'data-k': 'podgsearch',
          value: q,
          placeholder: 'Search mics & gear…',
          style: { width: '200px' },
          oninput: e => {
            q = e.target.value.toLowerCase();
            clearTimeout(draw.t);
            draw.t = setTimeout(() => { draw(); }, 250);
          }
        }),
        h('select', {
          class: 'inp',
          style: { width: 'auto' },
          onchange: e => { st = e.target.value; draw(); }
        },
        h('option', { value: '' }, 'Any status'),
        statuses.map(s => h('option', { selected: s === st }, s)))),

      // Table or Empty state
      rows.length ? body : h('div', { class: 'empty' },
        h('h3', {}, pd.gear.length ? 'No items match your filter' : 'No studio gear listed yet'),
        h('p', {}, 'Track microphones, audio interfaces, boom arms, headphones, and field recorders — with rental costs and printable pack lists.'),
        h('button', {
          class: 'btn primary',
          onclick: () => {
            const starter = typeof starterPodcastGear === 'function' ? starterPodcastGear() : [];
            starter.forEach(g => pd.gear.push(g));
            Store.touch();
            draw();
          }
        }, 'Load standard podcast studio kit'))
    );

    if (q) {
      const i = wrap.querySelector('[data-k=podgsearch]');
      if (i) { i.focus(); i.setSelectionRange(q.length, q.length); }
    }
  }

  draw();
}

/* ---------------------------------------------------------------
   Sub-tab 5: Show Notes & Chapter Markers Generator
   --------------------------------------------------------------- */
function renderNotesTab(root, P, pd) {
  root.innerHTML = '';

  // Generate chapter markers automatically from Rundown
  let cumSec = 0;
  const chapters = [];
  pd.rundown.forEach((seg, i) => {
    if (seg.status === 'Cut') return;
    chapters.push({
      time: fmtTimeSec(cumSec),
      title: seg.title
    });
    cumSec += parseDurMin(seg.dur) * 60;
  });

  const fullNotes = generateFullShowNotes(P, pd, chapters);

  const container = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } });

  // Chapter markers preview card
  const chCard = h('div', { class: 'card', style: { padding: '16px 20px' } },
    h('div', { class: 'row', style: { marginBottom: '10px' } },
      h('h3', { style: { margin: 0, fontSize: '16px' } }, 'Episode Chapters (YouTube / Apple / Spotify Timestamps)'),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'btn sm primary',
        onclick: () => {
          const txt = chapters.map(c => `${c.time} ${c.title}`).join('\n');
          navigator.clipboard.writeText(txt);
          toast('Chapter timestamps copied');
        }
      }, icon('copy', 14), 'Copy chapter timestamps')),
    h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Generated automatically from your episode rundown. Paste directly into your YouTube description or podcast RSS show notes.'),
    h('pre', {
      class: 'inp',
      style: { maxHeight: '180px', overflow: 'auto', background: 'var(--surface2)', padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: '13px' }
    }, chapters.length ? chapters.map(c => `${c.time} - ${c.title}`).join('\n') : 'No active segments in rundown yet.'));

  // Episode metadata inputs
  const metaCard = h('div', { class: 'card', style: { padding: '16px 20px' } },
    h('h3', { style: { margin: '0 0 12px', fontSize: '16px' } }, 'Episode Description & Links'),
    h('div', { class: 'field' },
      h('label', { class: 'lbl' }, 'Episode Summary / Description'),
      h('textarea', {
        class: 'inp',
        rows: 4,
        value: pd.notes.summary || '',
        placeholder: 'In this episode, we dive into…',
        oninput: e => { pd.notes.summary = e.target.value; Store.touch(); refreshOutput(); }
      })),
    h('div', { class: 'field' },
      h('label', { class: 'lbl' }, 'Episode Title Ideas (Ranked / A/B test)'),
      h('input', {
        class: 'inp',
        value: pd.notes.titleOptions || '',
        placeholder: '1. Shocking discovery… | 2. Inside the Arctic Base… | 3. The Signal',
        oninput: e => { pd.notes.titleOptions = e.target.value; Store.touch(); }
      })),
    h('div', { class: 'field' },
      h('label', { class: 'lbl' }, 'Additional Links & Resources Mentioned'),
      h('textarea', {
        class: 'inp',
        rows: 3,
        value: pd.notes.links || '',
        placeholder: '• Study referenced: https://…\n• Recommended tool: https://…',
        oninput: e => { pd.notes.links = e.target.value; Store.touch(); refreshOutput(); }
      })));

  // Output Box with One-Click Copy
  const outputCard = h('div', { class: 'card', style: { padding: '16px 20px', background: 'var(--surface2)' } },
    h('div', { class: 'row', style: { marginBottom: '10px' } },
      h('h3', { style: { margin: 0, fontSize: '16px' } }, 'Compiled Show Notes'),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          navigator.clipboard.writeText(fullNotes);
          toast('Full show notes copied to clipboard');
        }
      }, icon('copy', 15), 'Copy complete show notes'),
      h('button', {
        class: 'btn',
        onclick: () => download(slug(P.title) + '-show-notes.md', fullNotes, 'text/markdown')
      }, icon('download', 15), 'Save .md')),
    h('pre', {
      id: 'podNotesOutput',
      class: 'inp',
      style: { minHeight: '220px', maxHeight: '350px', overflow: 'auto', background: 'var(--surface)', padding: '12px 16px', fontSize: '13px', lineHeight: '1.5' }
    }, fullNotes));

  function refreshOutput() {
    const el = $('#podNotesOutput');
    if (el) el.textContent = generateFullShowNotes(P, pd, chapters);
  }

  container.append(chCard, metaCard, outputCard);
  root.append(container);
}

function generateFullShowNotes(P, pd, chapters) {
  const parts = [];
  parts.push(P.title);
  if (P.series) parts.push(`${P.series.name} · ${epCode(P.series)}`);
  parts.push('='.repeat(40), '');

  if (pd.notes.summary) {
    parts.push(pd.notes.summary, '');
  }

  if (chapters && chapters.length) {
    parts.push('TIMESTAMPS / CHAPTERS:', '-'.repeat(25));
    chapters.forEach(c => parts.push(`${c.time} - ${c.title}`));
    parts.push('');
  }

  if (pd.guests && pd.guests.length) {
    parts.push('FEATURED GUESTS:', '-'.repeat(25));
    pd.guests.forEach(g => {
      parts.push(`• ${g.name}${g.title ? ' (' + g.title + ')' : ''}`);
      if (g.plugs) parts.push(`  Links: ${g.plugs.replace(/\n/g, ' · ')}`);
    });
    parts.push('');
  }

  if (pd.sponsors && pd.sponsors.length) {
    parts.push('SPONSOR DISCOUNTS & OFFERS:', '-'.repeat(25));
    pd.sponsors.forEach(s => {
      parts.push(`• ${s.name}: ${s.url ? s.url : ''} ${s.code ? '(Use code: ' + s.code + ')' : ''}`);
    });
    parts.push('');
  }

  if (pd.notes.links) {
    parts.push('RESOURCES & LINKS MENTIONED:', '-'.repeat(25));
    parts.push(pd.notes.links, '');
  }

  return parts.join('\n');
}

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
   Live Podcast Studio Dashboard (Views.live adapter for Podcasts)
   Full-screen on-air prompter, live pacing clock, interactive
   talking points, guest interview assistant, sponsor ad prompter,
   instant audio editor markers, studio soundboard & VU meter.
   =============================================================== */
function renderPodcastLive(root, P) {
  const pd = POD(P);
  root.innerHTML = '';

  const wrap = h('div', { class: 'live pod-live' + (UI.liveTV ? ' tv' : '') });
  root.append(wrap);

  let timer = null;
  let scrollInterval = null;
  const flash = () => { Store.touch(); draw(); };

  function draw() {
    if (!pd.rundown.length) {
      wrap.innerHTML = '';
      wrap.append(h('div', { class: 'page', style: { maxWidth: '700px', margin: '40px auto' } },
        h('div', { class: 'card', style: { padding: '28px', textAlign: 'center' } },
          h('span', { class: 'ico', style: { color: 'var(--accent)', marginBottom: '12px' } }, icon('cue', 36)),
          h('h3', {}, 'No Rundown Planned for this Episode'),
          h('p', { class: 'muted' }, 'The Live Podcast Dashboard guides your recording session using your episode rundown, guest prep, sponsor copy, and talking points.'),
          h('div', { class: 'row', style: { justifyContent: 'center', gap: '10px', marginTop: '16px' } },
            h('button', { class: 'btn primary', onclick: () => { applyTemplate('interview', P, pd); draw(); } }, 'Load standard interview template'),
            h('a', { class: 'btn', href: `#/p/${P.id}/rundown` }, 'Open rundown planner')))));
      return;
    }

    const rundown = pd.rundown;
    const curIdx = Math.min(PodTimer.activeSegIdx, rundown.length - 1);
    PodTimer.activeSegIdx = curIdx;
    const curSeg = rundown[curIdx] || rundown[0];
    const nextSeg = rundown[curIdx + 1] || null;

    // Calculate timings in minutes and seconds
    let cumMin = 0;
    const segTimings = rundown.map(s => {
      const start = cumMin;
      const dur = s.status === 'Cut' ? 0 : parseDurMin(s.dur);
      cumMin += dur;
      return { start, dur, end: cumMin };
    });
    const totalMin = cumMin;
    const totalSec = totalMin * 60;

    // Active segment elapsed
    const segElapsedSec = Math.max(0, PodTimer.elapsedSec - PodTimer.segStartSec);
    const segTargetSec = Math.max(30, parseDurMin(curSeg.dur) * 60);
    const segOverSec = segElapsedSec - segTargetSec;
    const segProgressPct = Math.min(100, (segElapsedSec / segTargetSec) * 100);

    // Cumulative pacing
    let plannedElapsedSec = 0;
    for (let i = 0; i < curIdx; i++) {
      if (rundown[i].status !== 'Cut') plannedElapsedSec += parseDurMin(rundown[i].dur) * 60;
    }
    plannedElapsedSec += (segTargetSec / 2);
    const diffSec = PodTimer.elapsedSec - plannedElapsedSec;

    let paceLabel = 'On schedule';
    let paceClass = 'ok';
    if (Math.abs(diffSec) < 30) {
      paceLabel = 'On schedule';
      paceClass = 'ok';
    } else if (diffSec > 0) {
      paceLabel = `Behind +${fmtTimeSec(diffSec)}`;
      paceClass = 'warn';
    } else {
      paceLabel = `Ahead -${fmtTimeSec(Math.abs(diffSec))}`;
      paceClass = 'ahead';
    }

    const isLive = PodTimer.running;
    const hasStarted = PodTimer.elapsedSec > 0;

    function nextSegment() {
      if (curSeg) curSeg.status = 'Covered';
      if (curIdx < rundown.length - 1) {
        PodTimer.activeSegIdx = curIdx + 1;
        PodTimer.segStartSec = PodTimer.elapsedSec;
        rundown[PodTimer.activeSegIdx].status = 'Recording';
        PodTimer.addMarker(`Started: ${rundown[PodTimer.activeSegIdx].title}`, 'segment');
        PodAudio.playPing();
      } else {
        toast('Reached final episode segment!');
      }
      flash();
    }

    function add2Min() {
      curSeg.dur = (parseFloat(curSeg.dur) || 1) + 2;
      toast(`Added +2 min to "${curSeg.title}"`);
      flash();
    }

    function skipSegment() {
      if (curSeg) curSeg.status = 'Cut';
      PodTimer.addMarker(`Cut segment: ${curSeg.title}`, 'warn');
      if (curIdx < rundown.length - 1) {
        PodTimer.activeSegIdx = curIdx + 1;
        PodTimer.segStartSec = PodTimer.elapsedSec;
        rundown[PodTimer.activeSegIdx].status = 'Recording';
      }
      flash();
    }

    function wrapSession() {
      if (!confirm(`Wrap this recording session? (${fmtTimeSec(PodTimer.elapsedSec)} recorded, ${PodTimer.markers.length} markers logged)`)) return;
      PodTimer.pause();
      if (curSeg && curSeg.status === 'Recording') curSeg.status = 'Covered';
      PodTimer.addMarker(`Session wrapped (Total run: ${fmtTimeSec(PodTimer.elapsedSec)})`, 'sys');
      openSessionWrapModal(P, pd, rundown);
      flash();
    }

    // Top Header
    const header = h('div', { class: 'lv-head pod-live-head' },
      h('div', { class: 'lv-clock' },
        h('b', { id: 'podLiveClock', style: { fontFamily: 'var(--mono)', fontSize: '28px', letterSpacing: '.04em' } }, fmtTimeSec(PodTimer.elapsedSec)),
        h('span', { class: 'small muted', id: 'podLiveState', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: isLive ? '#e5484d' : hasStarted ? '#e8a40c' : 'var(--muted)', display: 'inline-block', boxShadow: isLive ? '0 0 6px #e5484d' : 'none' } }),
          isLive ? 'ON AIR · RECORDING' : hasStarted ? 'SESSION PAUSED' : 'STUDIO READY')),
      h('div', { class: `lv-stat ${paceClass}` },
        h('span', { class: 'lv-l' }, 'Pacing & Wrap'),
        h('b', { id: 'podPaceLabel' }, paceLabel),
        h('span', { class: 'small' }, `Planned: ~${Math.round(totalMin)}m (${fmtTimeSec(totalSec)})`)),
      h('div', { class: 'lv-stat' },
        h('span', { class: 'lv-l' }, 'Segment Flow'),
        h('b', {}, `${curIdx + 1} of ${rundown.filter(s => s.status !== 'Cut').length}`),
        h('span', { class: 'small clip' }, curSeg.title.slice(0, 22)),
        h('div', { class: 'progress' }, h('i', { style: { width: `${((curIdx + 1) / rundown.length) * 100}%` } }))),
      h('div', { class: 'lv-stat' },
        h('span', { class: 'lv-l' }, 'Markers Logged'),
        h('b', {}, String(PodTimer.markers.length)),
        h('span', { class: 'small' }, 'for audio editor')),
      h('div', { class: 'lv-actions' },
        !isLive ? h('button', { class: 'btn primary', onclick: () => { PodTimer.start(); if (curSeg.status === 'Planned') curSeg.status = 'Recording'; flash(); } }, icon('play', 15), hasStarted ? 'Resume' : 'Start recording')
                : h('button', { class: 'btn', onclick: () => { PodTimer.pause(); flash(); } }, icon('pause', 15), 'Pause'),
        h('button', { class: 'btn primary sm', onclick: nextSegment, title: 'Complete segment and move to next (Hotkey: N)' }, icon('check', 14), 'Next segment'),
        h('button', { class: 'btn sm', onclick: wrapSession, title: 'Wrap recording and create editor hand-off sheet' }, 'Wrap session'),
        h('button', {
          class: 'btn sm',
          title: 'Toggle live mic level VU meter',
          onclick: async () => {
            if (PodMicMeter.active) {
              PodMicMeter.stop();
              PodTimer.micMeterActive = false;
              flash();
            } else {
              const ok = await PodMicMeter.start(() => updateVuMeterDom());
              PodTimer.micMeterActive = ok;
              flash();
            }
          }
        }, icon('mic', 15), PodMicMeter.active ? 'Stop Mic Meter' : 'Mic Meter'),
        h('button', {
          class: 'btn sm',
          title: 'Full-screen studio display mode (Hotkey: T)',
          onclick: () => {
            UI.liveTV = !UI.liveTV;
            wrap.classList.toggle('tv', UI.liveTV);
            if (UI.liveTV && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
            else if (!UI.liveTV && document.fullscreenElement) document.exitFullscreen();
          }
        }, icon('focus', 15), 'TV mode')));

    // Dynamic Alerts
    const alerts = [];
    if (segOverSec > 30) {
      alerts.push(['warn', `Segment overtime: "${curSeg.title}" is ${fmtTimeSec(segOverSec)} over target (${parseDurMin(curSeg.dur)}m). Wrap or add +2m.`]);
    }
    if (curSeg.guestId) {
      const g = pd.guests.find(x => x.id === curSeg.guestId);
      if (g && g.nogo) {
        alerts.push(['crit', `⚠️ GUEST OFF-LIMITS REMINDER (${g.name}): Do not discuss "${g.nogo}"`]);
      }
    }
    const alertBox = alerts.length ? h('div', { class: 'lv-alerts' }, alerts.map(([k, msg]) => h('div', { class: `lv-alert ${k}` }, icon('alert', 15), h('span', {}, msg)))) : null;

    // ACTIVE SEGMENT PROMPTER
    const isOver = segOverSec > 0;
    const bulletsList = (curSeg.bullets || '').split('\n').filter(Boolean);
    const linkedSponsor = curSeg.sponsorId ? pd.sponsors.find(s => s.id === curSeg.sponsorId) : null;
    const linkedGuest = curSeg.guestId ? pd.guests.find(g => g.id === curSeg.guestId) : null;

    const activeCard = h('div', { class: `lv-card active ${isOver ? 'over' : ''}`, style: { padding: '20px 24px', marginBottom: '16px' } },
      h('div', { class: 'row', style: { alignItems: 'flex-start', marginBottom: '8px' } },
        h('div', { style: { flex: 1 } },
          h('span', { class: 'pill', style: { background: 'var(--accent)', color: '#fff', fontWeight: 700, marginBottom: '6px' } }, `ON AIR · SEGMENT ${curIdx + 1}`),
          h('h2', { style: { fontSize: '22px', margin: '4px 0 2px' } }, curSeg.title)),
        h('div', { style: { textAlign: 'right' } },
          h('div', { style: { fontFamily: 'var(--mono)', fontSize: '24px', fontWeight: 700, color: isOver ? 'var(--warn)' : 'var(--text)' } },
            `${fmtTimeSec(segElapsedSec)} / ${fmtTimeSec(segTargetSec)}`),
          h('span', { class: 'small muted' }, isOver ? `+${fmtTimeSec(segOverSec)} overtime` : `${fmtTimeSec(segTargetSec - segElapsedSec)} remaining`))),
      h('div', { class: 'progress lv-prog', style: { height: '6px', margin: '8px 0 14px' } },
        h('i', { style: { width: `${segProgressPct}%`, background: isOver ? 'var(--warn)' : 'var(--accent)' } })),

      // Audio cue banner with 1-click trigger
      curSeg.cues ? h('div', {
        class: 'row',
        style: { alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: '4px', marginBottom: '14px', fontWeight: 600, color: 'var(--accent)' }
      },
      icon('cue', 16),
      h('span', { style: { flex: 1 } }, `Audio Cue: ${curSeg.cues}`),
      h('button', {
        class: 'btn sm primary',
        title: 'Play chime & log cue trigger',
        onclick: () => {
          PodAudio.playChime();
          PodTimer.addMarker(`Cue Triggered: ${curSeg.cues}`, 'cue');
          toast(`Triggered audio cue: ${curSeg.cues}`);
          flash();
        }
      }, icon('play', 12), 'Trigger cue')) : null,

      // Prompter view switcher (Bullets vs Script)
      P.blocks && P.blocks.length > 2 ? h('div', { class: 'row', style: { marginBottom: '12px' } },
        h('span', { class: 'small muted', style: { fontWeight: 600 } }, 'Prompter view:'),
        h('div', { class: 'seg', style: { marginLeft: '8px' } },
          [['bullets', 'Talking points'], ['script', 'Script prompter']].map(([k, l]) => h('button', {
            class: (PodTimer.scriptPrompter ? 'script' : 'bullets') === k ? 'on' : '',
            onclick: () => { PodTimer.scriptPrompter = k === 'script'; flash(); }
          }, l)))) : null,

      // Prompter Content
      PodTimer.scriptPrompter ? renderScriptPrompter(P, flash) : renderBulletsChecklist(curSeg, bulletsList),

      // Linked Sponsor in active segment
      linkedSponsor ? renderEmbeddedSponsorBox(linkedSponsor, flash) : null,

      // Linked Guest in active segment
      linkedGuest ? renderEmbeddedGuestBox(linkedGuest, flash) : null,

      // Actions Footer
      h('div', { class: 'row wrap', style: { gap: '10px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' } },
        h('button', { class: 'btn primary', onclick: nextSegment }, icon('check', 15), 'Complete & Next segment'),
        h('button', { class: 'btn sm', onclick: add2Min }, icon('plus', 13), '+2 Min'),
        h('button', { class: 'btn sm ghost danger', onclick: skipSegment }, icon('trash', 13), 'Cut segment'),
        h('span', { class: 'grow' }),
        h('button', {
          class: 'btn sm ghost',
          onclick: () => {
            const l = prompt(`Marker note on "${curSeg.title}":`);
            if (l) { PodTimer.addMarker(`[${curSeg.title}] ${l}`); flash(); }
          }
        }, icon('edit', 14), 'Add marker to this segment')));

    // UP NEXT CARD
    const upNextCard = nextSeg ? h('div', { class: 'lv-card pending', style: { padding: '14px 18px', marginBottom: '16px' } },
      h('div', { class: 'row', style: { marginBottom: '4px' } },
        h('span', { class: 'lv-l' }, `UP NEXT · SEGMENT ${curIdx + 2}`),
        h('span', { class: 'grow' }),
        h('span', { class: 'small muted', style: { fontWeight: 600 } }, `Planned: ${nextSeg.dur} min`)),
      h('div', { style: { fontSize: '17px', fontWeight: 700, margin: '4px 0 6px' } }, nextSeg.title),
      nextSeg.bullets ? h('div', { class: 'small muted clip', style: { maxHeight: '36px' } }, nextSeg.bullets.split('\n')[0]) : null,
      h('div', { class: 'row', style: { marginTop: '8px' } },
        nextSeg.cues ? h('span', { class: 'pill', style: { fontSize: '11px', background: 'var(--surface2)' } }, `Cue: ${nextSeg.cues}`) : null,
        h('span', { class: 'grow' }),
        h('button', { class: 'btn sm primary', onclick: () => { PodTimer.activeSegIdx = curIdx + 1; PodTimer.segStartSec = PodTimer.elapsedSec; flash(); } }, 'Jump to this segment')))
      : h('div', { class: 'lv-card empty', style: { padding: '14px 18px', marginBottom: '16px' } }, h('span', { class: 'lv-l' }, 'UP NEXT'), h('div', { class: 'muted' }, 'Final segment reached.'));

    // TIMELINE LIST WITH REORDERING & ON-THE-FLY EDITS
    const timelineCard = h('div', { class: 'lv-panel' },
      h('div', { class: 'row', style: { marginBottom: '10px' } },
        h('h3', {}, 'Episode Rundown Track'),
        h('span', { class: 'small muted', style: { marginLeft: '8px' } }, 'Click to jump focus · Re-order on the fly'),
        h('span', { class: 'grow' }),
        h('button', {
          class: 'btn sm ghost',
          onclick: () => {
            const t = prompt('New topic or unplanned segment title:');
            if (t) {
              rundown.push(newSegment({ title: t, dur: 5 }));
              Store.touch();
              toast(`Added segment "${t}"`);
              flash();
            }
          }
        }, icon('plus', 13), 'Quick topic')),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        rundown.map((s, idx) => {
          const isActive = idx === curIdx;
          const isDone = s.status === 'Covered';
          const isCut = s.status === 'Cut';
          const tm = segTimings[idx];
          return h('div', {
            class: `lv-row ${isActive ? 'active' : isDone ? 'done' : isCut ? 'dropped' : 'pending'}`,
            style: {
              padding: '6px 10px',
              borderRadius: '3px',
              border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: isCut ? '0.5' : '1'
            }
          },
          h('span', { class: 'pill', style: { fontFamily: 'var(--mono)', fontSize: '11px', flex: 'none', cursor: 'pointer' }, onclick: () => { PodTimer.activeSegIdx = idx; PodTimer.segStartSec = PodTimer.elapsedSec; flash(); } }, fmtTimeSec(tm.start * 60)),
          h('b', { style: { flex: 1, fontSize: '13px', cursor: 'pointer' }, onclick: () => { PodTimer.activeSegIdx = idx; PodTimer.segStartSec = PodTimer.elapsedSec; flash(); } }, `#${idx + 1}: ${s.title}`),
          h('span', { class: 'small muted' }, `${s.dur}m`),
          // Reordering buttons
          h('div', { class: 'row', style: { gap: '2px' } },
            h('button', {
              class: 'icon-btn',
              disabled: idx === 0,
              title: 'Move segment earlier',
              onclick: e => {
                e.stopPropagation();
                [rundown[idx - 1], rundown[idx]] = [rundown[idx], rundown[idx - 1]];
                if (PodTimer.activeSegIdx === idx) PodTimer.activeSegIdx = idx - 1;
                else if (PodTimer.activeSegIdx === idx - 1) PodTimer.activeSegIdx = idx;
                Store.touch();
                flash();
              }
            }, '▲'),
            h('button', {
              class: 'icon-btn',
              disabled: idx === rundown.length - 1,
              title: 'Move segment later',
              onclick: e => {
                e.stopPropagation();
                [rundown[idx], rundown[idx + 1]] = [rundown[idx + 1], rundown[idx]];
                if (PodTimer.activeSegIdx === idx) PodTimer.activeSegIdx = idx + 1;
                else if (PodTimer.activeSegIdx === idx + 1) PodTimer.activeSegIdx = idx;
                Store.touch();
                flash();
              }
            }, '▼')),
          // Status cycle pill
          h('button', {
            class: 'pill',
            style: { background: RUNDOWN_TONE[s.status] || '#888', color: '#fff', fontSize: '10px', cursor: 'pointer', border: 'none' },
            title: 'Click to cycle status',
            onclick: e => {
              e.stopPropagation();
              const nextSt = { Planned: 'Recording', Recording: 'Covered', Covered: 'Cut', Cut: 'Planned' }[s.status] || 'Planned';
              s.status = nextSt;
              Store.touch();
              flash();
            }
          }, s.status));
        })));

    // Keyboard Shortcuts Footer Bar
    const shortcutsBar = h('div', { class: 'shortcuts-bar' },
      h('span', { style: { fontWeight: 700 } }, 'Studio Hotkeys:'),
      h('span', {}, h('kbd', {}, 'Space'), ' Record / Pause'),
      h('span', {}, h('kbd', {}, 'N'), ' Next Segment'),
      h('span', {}, h('kbd', {}, 'R'), ' Retake Marker'),
      h('span', {}, h('kbd', {}, 'C'), ' Clip Marker'),
      h('span', {}, h('kbd', {}, 'B'), ' Censor Bleep'),
      h('span', {}, h('kbd', {}, 'M'), ' Custom Marker'),
      h('span', {}, h('kbd', {}, 'T'), ' Fullscreen TV'));

    // SIDEBAR PANELS
    const micMeterPanel = PodMicMeter.active ? renderLiveMicMeter(flash) : null;
    const soundboardPanel = renderLiveSoundboardPanel(flash);
    const markersPanel = renderLiveMarkersPanel(flash, P);
    const issuesPanel = renderLiveIssuesPanel(flash);
    const guestPanel = renderLiveGuestPanel(pd, flash);
    const sponsorPanel = renderLiveSponsorPanel(pd, flash);
    const preflightPanel = renderLivePreflightPanel(flash);
    const talentPanel = renderLiveTalentPanel(P, pd, flash);
    const tasksPanel = renderLiveTasksPanel(P, flash);

    wrap.replaceChildren(
      header,
      alertBox,
      h('div', { class: 'lv-grid' },
        h('div', { class: 'lv-main' }, activeCard, upNextCard, timelineCard, shortcutsBar),
        h('div', { class: 'lv-side' }, micMeterPanel, soundboardPanel, markersPanel, issuesPanel, guestPanel, sponsorPanel, preflightPanel, talentPanel, tasksPanel)
      )
    );
  }

  draw();

  function updateVuMeterDom() {
    const fill = $('#podVuFill');
    const label = $('#podVuLabel');
    const clipEl = $('#podVuClip');
    if (!fill || !label) return;
    const db = PodMicMeter.currentDb;
    const pct = Math.min(100, Math.max(0, ((db + 48) / 48) * 100));
    fill.style.width = `${pct}%`;
    label.textContent = `${db.toFixed(1)} dB`;
    if (clipEl) {
      clipEl.style.display = PodMicMeter.isClipping ? 'inline-block' : 'none';
    }
  }

  const unsub = PodTimer.subscribe(() => {
    const clock = $('#podLiveClock');
    if (clock) clock.textContent = fmtTimeSec(PodTimer.elapsedSec);
    const stateEl = $('#podLiveState');
    if (stateEl) {
      stateEl.innerHTML = '';
      stateEl.append(
        h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: PodTimer.running ? '#e5484d' : PodTimer.elapsedSec > 0 ? '#e8a40c' : 'var(--muted)', display: 'inline-block', boxShadow: PodTimer.running ? '0 0 6px #e5484d' : 'none' } }),
        PodTimer.running ? 'ON AIR · RECORDING' : PodTimer.elapsedSec > 0 ? 'SESSION PAUSED' : 'STUDIO READY'
      );
    }
  });

  // Global Studio Hotkey Listener
  const onKeyDown = e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
    if (e.code === 'Space') {
      e.preventDefault();
      PodTimer.running ? PodTimer.pause() : PodTimer.start();
      flash();
    } else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') {
      e.preventDefault();
      const rundown = pd.rundown;
      const curIdx = PodTimer.activeSegIdx;
      if (curIdx < rundown.length - 1) {
        rundown[curIdx].status = 'Covered';
        PodTimer.activeSegIdx = curIdx + 1;
        PodTimer.segStartSec = PodTimer.elapsedSec;
        rundown[PodTimer.activeSegIdx].status = 'Recording';
        PodTimer.addMarker(`Started: ${rundown[PodTimer.activeSegIdx].title}`, 'segment');
        PodAudio.playPing();
        flash();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      PodTimer.addMarker('Retake / Line flub', 'retake');
      PodAudio.playPing();
      toast('Logged retake marker [R]');
      flash();
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      PodTimer.addMarker('Highlight / Golden quote', 'quote');
      PodAudio.playPing();
      toast('Logged highlight marker [C]');
      flash();
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      PodAudio.playBleep(0.7);
      PodTimer.addMarker('Bleep / Censor point', 'bleep');
      toast('Bleeped & logged marker [B]');
      flash();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      const l = prompt('Marker description:');
      if (l) {
        PodTimer.addMarker(l);
        PodAudio.playPing();
        flash();
      }
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      UI.liveTV = !UI.liveTV;
      wrap.classList.toggle('tv', UI.liveTV);
      if (UI.liveTV && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!UI.liveTV && document.fullscreenElement) document.exitFullscreen();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  // Auto-scroll loop for teleprompter mode
  scrollInterval = setInterval(() => {
    if (PodTimer.autoScroll && PodTimer.scriptPrompter) {
      const box = $('#podPrompterBox');
      if (box) {
        box.scrollTop += PodTimer.scrollSpeed || 1;
      }
    }
  }, 40);

  timer = setInterval(() => {
    if (PodTimer.running) draw();
  }, 4000);

  const onFs = () => { if (!document.fullscreenElement && UI.liveTV) { UI.liveTV = false; wrap.classList.remove('tv'); } };
  document.addEventListener('fullscreenchange', onFs);

  return () => {
    clearInterval(timer);
    clearInterval(scrollInterval);
    unsub();
    PodMicMeter.stop();
    window.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('fullscreenchange', onFs);
    if (document.fullscreenElement) document.exitFullscreen();
  };
}

/* ---------------------------------------------------------------
   Live Dashboard Sub-components
   --------------------------------------------------------------- */
function renderLiveMicMeter(flash) {
  return h('div', { class: 'lv-panel' },
    h('div', { class: 'row', style: { marginBottom: '6px' } },
      h('h3', {}, 'Live Mic VU Meter'),
      h('span', { id: 'podVuClip', class: 'pill', style: { background: 'var(--danger)', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'none' } }, 'CLIP!'),
      h('span', { class: 'grow' }),
      h('span', { id: 'podVuLabel', class: 'small mono muted' }, `${PodMicMeter.currentDb.toFixed(1)} dB`),
      h('button', {
        class: 'icon-btn',
        title: 'Close mic meter',
        onclick: () => { PodMicMeter.stop(); PodTimer.micMeterActive = false; flash(); }
      }, icon('close', 14))),
    h('div', { class: 'vu-meter', style: { margin: '4px 0' } },
      h('div', { id: 'podVuFill', class: 'vu-fill', style: { width: '0%' } })),
    h('div', { class: 'row small muted', style: { justifyContent: 'space-between', fontSize: '10px' } },
      h('span', {}, '-48 dB'),
      h('span', {}, '-18 dB'),
      h('span', {}, '-12 dB (Target)'),
      h('span', {}, '0 dB')));
}

function renderLiveSoundboardPanel(flash) {
  const sounds = [
    ['Intro Gong', () => PodAudio.playGong(), 'gong', 'Theme stinger / gong'],
    ['3-2-1 Sync', () => PodAudio.playSyncBeeps(), 'sync', 'Sync clap beeps'],
    ['Chime', () => PodAudio.playChime(), 'chime', 'Transition chime'],
    ['Bleep', () => PodAudio.playBleep(0.7), 'bleep', 'Censor bleep (1kHz)'],
    ['Marker Ping', () => PodAudio.playPing(), 'ping', 'Audio bookmark'],
  ];

  return h('div', { class: 'lv-panel' },
    h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('h3', {}, 'Studio Soundboard & Cartwall'),
      h('span', { class: 'grow' }),
      h('label', { class: 'row small muted', style: { gap: '4px', cursor: 'pointer', fontSize: '11px' } },
        h('input', {
          type: 'checkbox',
          checked: PodTimer.autoLogSound,
          onchange: e => { PodTimer.autoLogSound = e.target.checked; }
        }),
        'Auto-marker')),
    h('div', { class: 'soundboard-grid' },
      sounds.map(([label, playFn, kind, desc]) => h('button', {
        class: 'sb-btn',
        title: desc,
        onclick: () => {
          playFn();
          if (PodTimer.autoLogSound) {
            PodTimer.addMarker(`[Sound] ${label}`, kind);
          }
          toast(`Played: ${label}`);
          flash();
        }
      },
      h('span', { style: { fontSize: '16px' } }, kind === 'gong' ? '📢' : kind === 'sync' ? '⏱️' : kind === 'chime' ? '🔔' : kind === 'bleep' ? '🤬' : '⭐'),
      h('span', {}, label)))));
}

function renderBulletsChecklist(seg, bullets) {
  if (!bullets.length) {
    return h('p', { class: 'small muted', style: { fontStyle: 'italic', margin: '10px 0' } }, 'No bullet points set for this segment. Add them in the Rundown planner.');
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' } },
    bullets.map((b, i) => {
      const key = `${seg.id}-${i}`;
      const isChecked = PodTimer.checkedBullets.has(key);
      return h('label', {
        class: 'row small',
        style: {
          gap: '10px',
          cursor: 'pointer',
          padding: '8px 12px',
          background: isChecked ? 'var(--surface2)' : 'var(--surface)',
          borderRadius: '3px',
          textDecoration: isChecked ? 'line-through' : 'none',
          color: isChecked ? 'var(--muted)' : 'var(--text)',
          fontSize: '15px',
          lineHeight: '1.45',
          border: '1px solid var(--border)'
        }
      },
      h('input', {
        type: 'checkbox',
        checked: isChecked,
        onchange: e => {
          e.target.checked ? PodTimer.checkedBullets.add(key) : PodTimer.checkedBullets.delete(key);
          PodTimer.notify();
        }
      }),
      h('span', {}, b.replace(/^[•\-*]\s*/, '')));
    }));
}

function renderScriptPrompter(P, flash) {
  const fs = PodTimer.prompterFontSize || 16;
  const isAuto = !!PodTimer.autoScroll;
  const spd = PodTimer.scrollSpeed || 1;

  return h('div', {},
    // Teleprompter Controls Bar
    h('div', { class: 'row', style: { gap: '8px', padding: '6px 10px', background: 'var(--surface2)', borderRadius: '4px', marginBottom: '8px' } },
      h('button', {
        class: 'btn sm primary',
        onclick: () => { PodTimer.autoScroll = !PodTimer.autoScroll; flash(); }
      }, icon(isAuto ? 'pause' : 'play', 13), isAuto ? 'Pause scroll' : 'Auto-scroll'),
      h('div', { class: 'seg' },
        [[1, '1x'], [1.5, '1.5x'], [2, '2x']].map(([s, label]) => h('button', {
          class: spd === s ? 'on' : '',
          onclick: () => { PodTimer.scrollSpeed = s; flash(); }
        }, label))),
      h('span', { class: 'grow' }),
      h('span', { class: 'small muted', style: { fontWeight: 600 } }, 'Font:'),
      h('button', {
        class: 'icon-btn',
        title: 'Decrease prompter font size',
        disabled: fs <= 12,
        onclick: () => { PodTimer.prompterFontSize = Math.max(12, fs - 2); flash(); }
      }, 'A-'),
      h('button', {
        class: 'icon-btn',
        title: 'Increase prompter font size',
        disabled: fs >= 28,
        onclick: () => { PodTimer.prompterFontSize = Math.min(28, fs + 2); flash(); }
      }, 'A+')),
    // Prompter Script Box
    h('div', {
      id: 'podPrompterBox',
      class: 'prompter-box',
      style: {
        padding: '18px 24px',
        maxHeight: '380px',
        overflow: 'auto',
        fontSize: `${fs}px`,
        lineHeight: '1.55',
        fontFamily: 'var(--mono)'
      }
    },
    P.blocks.map(b => {
      const isChar = b.type === 'character';
      const isSfx = b.type === 'sfx';
      const isMusic = b.type === 'music';
      const isScene = b.type === 'scene';
      return h('div', {
        style: {
          marginBottom: isChar || isScene ? '10px' : '4px',
          paddingLeft: isChar ? '20%' : b.type === 'dialogue' ? '12%' : '0',
          fontWeight: isChar || isScene || isSfx ? 700 : 'normal',
          fontStyle: b.type === 'paren' || isMusic ? 'italic' : 'normal',
          color: isSfx ? 'var(--accent)' : isMusic ? '#a371f7' : b.type === 'sponsor' ? '#d97706' : 'inherit'
        }
      }, b.text);
    })));
}

function renderEmbeddedSponsorBox(sp, flash) {
  return h('div', {
    class: 'card',
    style: {
      padding: '14px 18px',
      margin: '12px 0',
      background: 'color-mix(in srgb, var(--accent) 7%, transparent)',
      borderLeft: '4px solid var(--accent)'
    }
  },
  h('div', { class: 'row', style: { marginBottom: '6px' } },
    h('b', { style: { color: 'var(--accent)', fontSize: '14px' } }, `SPONSOR AD READ: ${sp.name} (${sp.slot})`),
    h('span', { class: 'grow' }),
    h('button', {
      class: 'btn sm primary',
      onclick: () => { sp.recorded = true; toast(`Marked ${sp.name} as recorded`); flash(); }
    }, icon('check', 13), sp.recorded ? 'Recorded ✓' : 'Mark recorded')),
  sp.code || sp.url ? h('div', { class: 'row', style: { gap: '10px', marginBottom: '8px' } },
    sp.url ? h('span', { class: 'pill' }, `URL: ${sp.url}`) : null,
    sp.code ? h('span', { class: 'pill', style: { fontWeight: 700 } }, `CODE: ${sp.code}`) : null,
    h('button', {
      class: 'btn sm ghost',
      onclick: () => {
        navigator.clipboard.writeText(`${sp.url || ''} promo code: ${sp.code || ''}`.trim());
        toast('Copied URL & Code');
      }
    }, icon('copy', 12), 'Copy URL/Code')) : null,
  h('div', { style: { fontStyle: 'italic', fontSize: '14px', lineHeight: '1.45', margin: '6px 0' } }, sp.copy || sp.points));
}

function renderEmbeddedGuestBox(g, flash) {
  return h('div', {
    class: 'card',
    style: {
      padding: '14px 18px',
      margin: '12px 0',
      background: 'var(--surface2)',
      borderLeft: '4px solid var(--ok)'
    }
  },
  h('div', { class: 'row', style: { marginBottom: '6px' } },
    h('b', { style: { fontSize: '15px' } }, `GUEST: ${g.name}`),
    h('span', { class: 'small muted', style: { marginLeft: '6px' } }, g.title || ''),
    h('span', { class: 'grow' }),
    g.link ? h('a', {
      class: 'btn sm primary',
      href: g.link.startsWith('http') ? g.link : 'https://' + g.link,
      target: '_blank',
      rel: 'noreferrer'
    }, 'Open Studio') : null),
  g.nogo ? h('div', {
    class: 'small',
    style: { color: 'var(--warn)', fontWeight: 600, margin: '6px 0' }
  }, `⚠️ Do not discuss: ${g.nogo}`) : null);
}

function renderLiveMarkersPanel(flash, P) {
  const quickPad = h('div', { class: 'row', style: { gap: '6px', marginBottom: '10px', flexWrap: 'wrap' } },
    h('button', {
      class: 'btn sm',
      style: { flex: 1, minWidth: '85px' },
      onclick: () => { PodTimer.addMarker('Retake / Line flub', 'retake'); PodAudio.playPing(); toast('Logged retake marker'); flash(); }
    }, '🔖 Retake'),
    h('button', {
      class: 'btn sm',
      style: { flex: 1, minWidth: '85px' },
      onclick: () => { PodTimer.addMarker('Highlight / Golden quote', 'quote'); PodAudio.playPing(); toast('Logged highlight marker'); flash(); }
    }, '⭐ Clip'),
    h('button', {
      class: 'btn sm',
      style: { flex: 1, minWidth: '85px' },
      onclick: () => { PodTimer.addMarker('Cut point / Dead air', 'cut'); PodAudio.playPing(); toast('Logged cut marker'); flash(); }
    }, '✂️ Cut'),
    h('button', {
      class: 'btn sm',
      style: { flex: 1, minWidth: '85px' },
      onclick: () => { PodTimer.addMarker('Audio glitch / Mic pop', 'glitch'); PodAudio.playPing(); toast('Logged glitch marker'); flash(); }
    }, '⚠️ Glitch'));

  const quickInp = h('input', {
    class: 'inp sm',
    placeholder: '+ Type marker description, press Enter',
    onkeydown: e => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        PodTimer.addMarker(e.target.value.trim(), 'custom');
        PodAudio.playPing();
        e.target.value = '';
        toast('Marker logged');
        flash();
      }
    }
  });

  const markerList = h('div', {
    class: 'lv-log',
    style: { maxHeight: '200px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }
  },
  PodTimer.markers.length ? PodTimer.markers.map((m, i) => h('div', {
    class: 'lv-ev',
    style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', fontSize: '12.5px' }
  },
  h('span', { class: 'pill', style: { fontFamily: 'var(--mono)', fontSize: '11px', flex: 'none' } }, fmtTimeSec(m.time)),
  h('span', { style: { flex: 1 } }, m.label),
  h('button', {
    class: 'icon-btn danger',
    title: 'Delete marker',
    onclick: () => { PodTimer.markers.splice(i, 1); flash(); }
  }, icon('trash', 12)))) : h('div', { class: 'small muted', style: { margin: '6px 0' } }, 'No markers logged yet. Click a quick button or type above.'));

  return h('div', { class: 'lv-panel' },
    h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('h3', {}, 'Editor Markers Pad'),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'btn sm ghost',
        onclick: () => {
          if (!PodTimer.markers.length) return toast('No markers to copy', true);
          const lines = PodTimer.markers.map(m => `[${fmtTimeSec(m.time)}] ${m.label}`).join('\n');
          navigator.clipboard.writeText(lines);
          toast('Copied markers for audio editor');
        }
      }, icon('copy', 13), 'Copy for editor')),
    quickPad,
    quickInp,
    markerList);
}

function renderLiveIssuesPanel(flash) {
  const issues = PodTimer.issues || [];
  const quick = h('input', {
    class: 'inp sm',
    placeholder: '+ Log issue (e.g. mic distortion, dog barking), Enter',
    onkeydown: e => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        PodTimer.addIssue(e.target.value.trim(), 'Audio', 'Medium');
        e.target.value = '';
        toast('Logged technical issue');
        flash();
      }
    }
  });

  return h('div', { class: 'lv-panel' },
    h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('h3', {}, 'Studio Issues Log'),
      h('span', { class: 'grow' }),
      h('div', { class: 'row', style: { gap: '4px' } },
        h('button', { class: 'btn sm ghost', onclick: () => { PodTimer.addIssue('Mic clipping / distortion', 'Audio', 'High'); flash(); } }, 'Mic clip'),
        h('button', { class: 'btn sm ghost', onclick: () => { PodTimer.addIssue('Background noise / siren', 'Room', 'Medium'); flash(); } }, 'Noise'))),
    quick,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', maxHeight: '160px', overflow: 'auto' } },
      issues.length ? issues.map((iss, idx) => h('div', {
        class: 'lv-issue',
        style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', fontSize: '12px' }
      },
      h('span', { class: 'pill', style: { fontFamily: 'var(--mono)', fontSize: '10px' } }, fmtTimeSec(iss.time)),
      h('span', { class: `lv-sev`, style: { background: iss.sev === 'Critical' ? 'var(--danger)' : iss.sev === 'High' ? 'var(--warn)' : 'var(--muted)' } }, iss.sev),
      h('span', { class: 'clip', style: { flex: 1 } }, iss.msg),
      h('button', {
        class: 'icon-btn danger',
        onclick: () => { issues.splice(idx, 1); flash(); }
      }, icon('trash', 11)))) : h('div', { class: 'small muted', style: { margin: '6px 0' } }, 'No studio issues logged.')));
}

function renderLiveGuestPanel(pd, flash) {
  if (!pd.guests.length) {
    return h('div', { class: 'lv-panel' },
      h('h3', { style: { marginBottom: '6px' } }, 'Guest Interview Assistant'),
      h('p', { class: 'small muted', style: { margin: 0 } }, 'No interview guests added. Add them in Guest prep.'));
  }

  UI.podLiveGuestIdx = UI.podLiveGuestIdx || 0;
  const g = pd.guests[UI.podLiveGuestIdx] || pd.guests[0];
  const qList = (g.questions || '').split('\n').filter(Boolean);

  return h('div', { class: 'lv-panel' },
    h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('h3', {}, 'Guest Assistant'),
      h('span', { class: 'grow' }),
      pd.guests.length > 1 ? h('select', {
        class: 'inp sm',
        style: { width: 'auto' },
        onchange: e => { UI.podLiveGuestIdx = +e.target.value; flash(); }
      }, pd.guests.map((x, i) => h('option', { value: i, selected: i === UI.podLiveGuestIdx }, x.name))) : null),
    h('div', { class: 'row', style: { gap: '8px', marginBottom: '8px' } },
      h('b', { style: { fontSize: '15px' } }, g.name),
      g.pronouns ? h('span', { class: 'pill', style: { fontSize: '11px' } }, g.pronouns) : null,
      h('span', { class: 'grow' }),
      g.link ? h('a', {
        class: 'btn sm primary',
        href: g.link.startsWith('http') ? g.link : 'https://' + g.link,
        target: '_blank',
        rel: 'noreferrer'
      }, 'Join Studio') : null),
    g.title ? h('div', { class: 'small muted', style: { marginBottom: '6px' } }, g.title) : null,
    g.nogo ? h('div', {
      style: { padding: '6px 10px', background: 'color-mix(in srgb, var(--warn) 10%, transparent)', borderLeft: '3px solid var(--warn)', borderRadius: '2px', marginBottom: '8px', fontSize: '12px', color: 'var(--warn)', fontWeight: 600 }
    }, `⚠️ Off-Limits: ${g.nogo}`) : null,
    qList.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' } },
      h('label', { class: 'lbl small muted' }, 'Questions checklist:'),
      qList.map((q, idx) => {
        const key = `${g.id}-${idx}`;
        const isChecked = PodTimer.checkedQuestions.has(key);
        return h('label', {
          class: 'row small',
          style: {
            gap: '8px',
            cursor: 'pointer',
            padding: '4px 6px',
            fontSize: '13px',
            textDecoration: isChecked ? 'line-through' : 'none',
            color: isChecked ? 'var(--muted)' : 'var(--text)'
          }
        },
        h('input', {
          type: 'checkbox',
          checked: isChecked,
          onchange: e => {
            e.target.checked ? PodTimer.checkedQuestions.add(key) : PodTimer.checkedQuestions.delete(key);
            PodTimer.notify();
          }
        }),
        h('span', {}, q));
      })) : null);
}

function renderLiveSponsorPanel(pd, flash) {
  if (!pd.sponsors.length) {
    return h('div', { class: 'lv-panel' },
      h('h3', { style: { marginBottom: '6px' } }, 'Sponsor Reads Prompter'),
      h('p', { class: 'small muted', style: { margin: 0 } }, 'No sponsor reads configured for this episode.'));
  }

  UI.podLiveSponsorIdx = UI.podLiveSponsorIdx || 0;
  const sp = pd.sponsors[UI.podLiveSponsorIdx] || pd.sponsors[0];

  return h('div', { class: 'lv-panel' },
    h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('h3', {}, 'Sponsor Reads'),
      h('span', { class: 'grow' }),
      pd.sponsors.length > 1 ? h('select', {
        class: 'inp sm',
        style: { width: 'auto' },
        onchange: e => { UI.podLiveSponsorIdx = +e.target.value; flash(); }
      }, pd.sponsors.map((x, i) => h('option', { value: i, selected: i === UI.podLiveSponsorIdx }, `${x.name} (${x.slot})`))) : null),
    h('div', { class: 'row', style: { gap: '6px', marginBottom: '8px' } },
      h('b', { style: { fontSize: '14px' } }, sp.name),
      h('span', { class: 'pill', style: { fontSize: '11px' } }, sp.slot),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'btn sm ghost',
        onclick: () => { navigator.clipboard.writeText(sp.copy || ''); toast('Ad copy copied'); }
      }, icon('copy', 12), 'Copy')),
    sp.url || sp.code ? h('div', { class: 'row', style: { gap: '6px', marginBottom: '6px' } },
      sp.url ? h('span', { class: 'pill', style: { fontSize: '11px' } }, sp.url) : null,
      sp.code ? h('span', { class: 'pill', style: { fontSize: '11px', fontWeight: 700 } }, sp.code) : null) : null,
    h('div', {
      style: { padding: '8px 10px', background: 'var(--surface2)', borderRadius: '3px', fontStyle: 'italic', fontSize: '13px', lineHeight: '1.45', maxHeight: '140px', overflow: 'auto' }
    }, sp.copy || sp.points),
    h('div', { class: 'row', style: { marginTop: '8px' } },
      h('label', { class: 'row small', style: { gap: '6px', cursor: 'pointer', fontWeight: 600 } },
        h('input', {
          type: 'checkbox',
          checked: !!sp.recorded,
          onchange: e => { sp.recorded = e.target.checked; Store.touch(); flash(); }
        }),
        'Marked as recorded')));
}

function renderLivePreflightPanel(flash) {
  const checks = [
    ['levels', 'Mic input levels verified (-12 dB peak)'],
    ['backup', '32-bit float / local backup recording active'],
    ['room', 'HVAC, fans & room noise silenced'],
    ['headphones', 'Zero-latency headphone monitor confirmed'],
    ['notify', 'Phone & computer notifications silenced'],
    ['water', 'Hydration / water at hand'],
  ];

  const doneCount = checks.filter(([k]) => !!PodTimer.preflight[k]).length;

  return h('div', { class: 'lv-panel' },
    h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('h3', {}, 'Pre-Flight Audio Check'),
      h('span', { class: 'grow' }),
      h('span', { class: 'pill', style: { fontSize: '11px', background: doneCount === checks.length ? 'var(--ok)' : 'var(--surface2)', color: doneCount === checks.length ? '#fff' : 'inherit' } },
        doneCount === checks.length ? 'Studio Ready ✓' : `${doneCount}/${checks.length} Ready`)),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      checks.map(([k, label]) => {
        const isChecked = !!PodTimer.preflight[k];
        return h('label', {
          class: 'row small',
          style: { gap: '8px', cursor: 'pointer', padding: '3px 0' }
        },
        h('input', {
          type: 'checkbox',
          checked: isChecked,
          onchange: e => {
            PodTimer.preflight[k] = e.target.checked;
            PodTimer.notify();
          }
        }),
        h('span', { style: { color: isChecked ? 'var(--ok)' : 'var(--text)' } }, label));
      })));
}

function renderLiveTalentPanel(P, pd, flash) {
  const talentList = [];
  if (P.cast && P.cast.length) {
    P.cast.forEach(c => talentList.push({ id: c.id, name: c.name || c.role, role: 'Host / Talent' }));
  } else {
    talentList.push({ id: 'host-1', name: 'Host', role: 'Main Host' });
  }
  pd.guests.forEach(g => {
    talentList.push({ id: g.id, name: g.name, role: 'Guest', link: g.link });
  });

  const STATUSES = ['In Studio', 'Green Room', 'Levels Checked', 'Live on Mic', 'Wrapped'];

  return h('div', { class: 'lv-panel' },
    h('h3', { style: { marginBottom: '8px' } }, 'Talent & Guest Check-In'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      talentList.map(t => {
        const curSt = PodTimer.talentStatus[t.id] || (t.role.includes('Host') ? 'Live on Mic' : 'In Studio');
        return h('div', {
          class: 'row',
          style: { padding: '5px 8px', background: 'var(--surface2)', borderRadius: '3px', fontSize: '12.5px', alignItems: 'center' }
        },
        h('b', { style: { flex: 1 } }, t.name),
        h('span', { class: 'small muted', style: { marginRight: '6px' } }, t.role),
        h('button', {
          class: 'pill',
          style: {
            fontSize: '10.5px',
            cursor: 'pointer',
            border: 'none',
            background: curSt === 'Live on Mic' ? '#e5484d' : curSt === 'Levels Checked' ? '#1e8e54' : 'var(--surface)',
            color: curSt === 'Live on Mic' || curSt === 'Levels Checked' ? '#fff' : 'inherit'
          },
          title: 'Click to cycle status',
          onclick: () => {
            const nextIdx = (STATUSES.indexOf(curSt) + 1) % STATUSES.length;
            PodTimer.talentStatus[t.id] = STATUSES[nextIdx];
            flash();
          }
        }, curSt));
      })));
}

function renderLiveTasksPanel(P, flash) {
  const taskList = (P.tasks || []).filter(t => t.status !== 'done');
  const quick = h('input', {
    class: 'inp sm',
    placeholder: '+ Add task for this episode, press Enter',
    onkeydown: e => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        const t = newTask(e.target.value.trim(), 'todo');
        P.tasks.push(t);
        Store.touch();
        e.target.value = '';
        toast('Task added');
        flash();
      }
    }
  });

  return h('div', { class: 'lv-panel' },
    h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('h3', {}, 'Episode Tasks'),
      h('span', { class: 'grow' }),
      h('a', { class: 'btn sm ghost', href: `#/p/${P.id}/tasks` }, 'All tasks')),
    quick,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' } },
      taskList.length ? taskList.slice(0, 6).map(t => h('div', {
        class: 'lv-task',
        style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', fontSize: '12.5px' }
      },
      h('button', {
        class: 'lv-chk ' + t.status,
        onclick: () => {
          t.status = t.status === 'todo' ? 'doing' : 'done';
          Store.touch();
          flash();
        }
      }, t.status === 'doing' ? '◐' : ''),
      h('span', { class: 'clip', style: { flex: 1 } }, t.title))) : h('div', { class: 'small muted', style: { margin: '6px 0' } }, 'No open tasks for this episode.')));
}

/* ---------------------------------------------------------------
   Episode Recording Session Wrap & Editor Hand-off Modal
   --------------------------------------------------------------- */
function openSessionWrapModal(P, pd, rundown) {
  // Ensure a shoot day exists in P.days so DPR can store the report
  if (!P.days || !P.days.length) {
    const today = new Date().toISOString().slice(0, 10);
    P.days = P.days || [];
    P.days.push({
      id: uid(),
      date: today,
      num: 1,
      cs: { shoot: '10:00', crew: '09:30', lunch: '13:00' },
      sceneIds: [],
      title: `Episode Recording`
    });
  }
  const d = P.days.find(x => x.id === UI.liveDay) || P.days[0];
  UI.liveDay = d.id;
  P.reports = P.reports || {};
  const R = P.reports[d.id] = P.reports[d.id] || (typeof newReport === 'function' ? newReport() : { t: {}, scenes: {}, notes: '' });

  const startMs = PodTimer.startTime || (Date.now() - PodTimer.elapsedSec * 1000);
  const endMs = Date.now();
  R.t.crew = R.t.crew || podFromMin(Math.round(podMsMin(startMs)));
  R.t.wrap = podFromMin(Math.round(podMsMin(endMs)));

  // Build the complete hand-off summary
  const coveredCount = rundown.filter(s => s.status === 'Covered').length;
  const cutCount = rundown.filter(s => s.status === 'Cut').length;
  const totalRecSec = PodTimer.elapsedSec;
  const markersList = PodTimer.markers.slice().reverse(); // chronological order

  let summaryText = `========================================\n`;
  summaryText += `EPISODE RECORDING SESSION WRAP REPORT\n`;
  summaryText += `Show: ${P.title}\n`;
  summaryText += `Episode: ${pd.epNumber || '1'}${pd.season ? ' (Season ' + pd.season + ')' : ''}\n`;
  summaryText += `Date: ${new Date().toISOString().slice(0, 10)}\n`;
  summaryText += `Total Recorded Time: ${fmtTimeSec(totalRecSec)}\n`;
  summaryText += `Segments Covered: ${coveredCount} / ${rundown.length} (${cutCount} cut)\n`;
  summaryText += `Markers Logged: ${markersList.length}\n`;
  summaryText += `========================================\n\n`;

  summaryText += `--- SEGMENTS RUNNING ORDER ---\n`;
  rundown.forEach((s, idx) => {
    summaryText += `#${idx + 1} [${s.status.toUpperCase()}] ${s.title} (${s.dur}m planned)\n`;
  });
  summaryText += `\n`;

  if (markersList.length) {
    summaryText += `--- AUDIO EDITOR MARKERS (TIMECODES) ---\n`;
    markersList.forEach(m => {
      summaryText += `[${fmtTimeSec(m.time)}] ${m.kind ? m.kind.toUpperCase() + ': ' : ''}${m.label}\n`;
    });
    summaryText += `\n`;
  }

  if (pd.sponsors.length) {
    summaryText += `--- SPONSOR READS STATUS ---\n`;
    pd.sponsors.forEach(sp => {
      summaryText += `[${sp.recorded ? 'RECORDED ✓' : 'NOT RECORDED'}] ${sp.name} (${sp.slot}) - Code: ${sp.code || 'N/A'}\n`;
    });
    summaryText += `\n`;
  }

  if (PodTimer.issues && PodTimer.issues.length) {
    summaryText += `--- TECHNICAL & STUDIO ISSUES LOG ---\n`;
    PodTimer.issues.forEach(iss => {
      summaryText += `[${fmtTimeSec(iss.time)}] [${iss.sev}] ${iss.cat}: ${iss.msg}\n`;
    });
    summaryText += `\n`;
  }

  // Store into DPR notes and incidents
  R.notes = [R.notes, summaryText].filter(Boolean).join('\n\n');
  if (PodTimer.issues && PodTimer.issues.length) {
    R.incidents = PodTimer.issues.map(iss => `[${iss.sev}] ${iss.cat}: ${iss.msg}`).join('\n');
  }
  R.media = `Audio: WAV 48kHz / 24-bit · Duration: ${fmtTimeSec(totalRecSec)}`;
  Store.touch();

  // Create modal dialog
  const overlay = h('div', { class: 'modal-ov' });
  const modal = h('div', { class: 'modal', style: { maxWidth: '720px', width: '92%' } },
    h('div', { class: 'modal-h' },
      h('h3', {}, 'Recording Session Wrapped!'),
      h('button', { class: 'icon-btn', onclick: () => overlay.remove() }, icon('close', 16))),
    h('div', { class: 'modal-b', style: { maxHeight: '70vh', overflow: 'auto' } },
      h('div', { class: 'row', style: { gap: '12px', marginBottom: '16px' } },
        h('div', { class: 'card', style: { flex: 1, padding: '12px', textAlign: 'center' } },
          h('div', { class: 'small muted' }, 'Total Recorded'),
          h('b', { style: { fontSize: '20px', fontFamily: 'var(--mono)', color: 'var(--accent)' } }, fmtTimeSec(totalRecSec))),
        h('div', { class: 'card', style: { flex: 1, padding: '12px', textAlign: 'center' } },
          h('div', { class: 'small muted' }, 'Segments Covered'),
          h('b', { style: { fontSize: '20px' } }, `${coveredCount} / ${rundown.length}`)),
        h('div', { class: 'card', style: { flex: 1, padding: '12px', textAlign: 'center' } },
          h('div', { class: 'small muted' }, 'Editor Markers'),
          h('b', { style: { fontSize: '20px', color: 'var(--ok)' } }, String(markersList.length)))),
      h('label', { class: 'lbl' }, 'Audio Editor Hand-Off Sheet (Auto-saved to DPR):'),
      h('textarea', {
        class: 'inp',
        rows: 12,
        readonly: true,
        style: { fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: '1.4', background: 'var(--surface2)' }
      }, summaryText)),
    h('div', { class: 'modal-f', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', {
        class: 'btn primary',
        onclick: () => {
          navigator.clipboard.writeText(summaryText);
          toast('Copied hand-off sheet to clipboard!');
        }
      }, icon('copy', 14), 'Copy for Audio Editor'),
      h('a', {
        class: 'btn',
        href: `#/p/${P.id}/dpr`,
        onclick: () => overlay.remove()
      }, icon('reports', 14), 'View Full DPR'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Close')));
  overlay.append(modal);
  document.body.append(overlay);
}

