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
   Live recording desk — built on the live desk (livedesk.js), so it
   reads and behaves like every other live dashboard. Everything that
   happens in a session (the recording clock, editor markers, problems,
   check-in, pre-flight) is saved with the project, so a reload or a
   sleeping tablet never loses a take.
   =============================================================== */
const POD_SESSION = { id: 'podcast' };
const POD_MARKS = [['retake', '🔖 Retake', 'Retake / line flub'], ['quote', '⭐ Clip', 'Highlight / golden quote'], ['cut', '✂ Cut', 'Cut point / dead air'], ['glitch', '⚠ Glitch', 'Audio glitch / mic pop']];
const POD_PREFLIGHT = [['levels', 'Mic input levels checked (−12 dB peaks)'], ['backup', 'Backup / 32-bit float recording running'], ['room', 'HVAC, fans & room noise off'], ['headphones', 'Zero-latency headphone monitor'], ['notify', 'Phone & computer notifications off'], ['water', 'Water at hand']];

/* bring the recording clock back from the saved session (after a reload or another project) */
function podHydrate(P, L) {
  L.markers = L.markers || []; L.preflight = L.preflight || {}; L.rec = L.rec || {};
  if (PodTimer.pid === P.id) { PodTimer.markers = L.markers; return; }
  PodTimer.pause(); PodTimer.pid = P.id; PodTimer.markers = L.markers; PodTimer.preflight = L.preflight;
  const r = L.rec; PodTimer.activeSegIdx = r.seg || 0; PodTimer.segStartSec = r.segStart || 0;
  PodTimer.elapsedSec = r.running && r.startTime ? Math.floor((Date.now() - r.startTime) / 1000) : (r.elapsed || 0);
  if (r.running) PodTimer.start();
}
const podSave = L => { L.rec = { running: PodTimer.running, startTime: PodTimer.startTime, elapsed: PodTimer.elapsedSec, seg: PodTimer.activeSegIdx, segStart: PodTimer.segStartSec }; };

function renderPodcastLive(root, P) {
  const pd = POD(P), L = liveOf(P, POD_SESSION); podHydrate(P, L);
  const wrap = h('div', { class: 'live ld pod-live' + (UI.liveTV ? ' tv' : '') }); root.append(wrap);
  const flash = () => { podSave(L); Store.touch(); draw(); };
  const mark = (label, kind = 'marker') => { PodTimer.addMarker(label, kind); PodAudio.playPing(); };
  const askMarker = async (pre = '') => { const l = await promptBox('Editor marker', 'What happened at this moment?', pre); if (l) { mark(l, 'custom'); flash(); } };
  const cx = { P, L, key: 'pod', flash, redraw: () => draw(), date: todayISO(), itemWord: 'Segment', issueCats: ['Audio', 'Room', 'Connection', 'Guest', 'Equipment', 'Content', 'Other'],
    quickIssues: [['Mic clipping', 'Audio', 'High'], ['Background noise', 'Room', 'Medium'], ['Guest connection drop', 'Connection', 'High']], stamp: () => PodTimer.elapsedSec };

  const acts = {};   // the current segment's actions, for the keyboard
  function draw() {
    const rundown = pd.rundown;
    if (!rundown.length) {
      morph(wrap, h('div', { class: 'ld-card empty ld-start' }, icon('cue', 32), h('h3', {}, 'No rundown for this episode yet'),
        h('p', { class: 'muted' }, 'The live desk runs your recording from the episode rundown: segments and timing, talking points, guest prep, sponsor reads and editor markers.'),
        h('div', { class: 'ld-btns' }, h('button', { class: 'btn primary', onclick: () => { applyTemplate('interview', P, pd); flash(); } }, 'Use the interview template'), h('a', { class: 'btn', href: `#/p/${P.id}/rundown` }, 'Open the rundown planner'))));
      return;
    }
    const curIdx = PodTimer.activeSegIdx = Math.min(PodTimer.activeSegIdx, rundown.length - 1), cur = rundown[curIdx], next = rundown.slice(curIdx + 1).find(s => s.status !== 'Cut') || null;
    let cum = 0; const tm = rundown.map(s => { const start = cum, dur = s.status === 'Cut' ? 0 : parseDurMin(s.dur); cum += dur; return { start, dur }; }), totalMin = cum;
    const live = PodTimer.running, begun = PodTimer.elapsedSec > 0;
    const segEl = Math.max(0, PodTimer.elapsedSec - PodTimer.segStartSec), segTarget = Math.max(30, parseDurMin(cur.dur) * 60), segOver = segEl - segTarget;
    const plannedAt = tm[curIdx].start * 60 + Math.min(segEl, segTarget), diff = PodTimer.elapsedSec - plannedAt;
    const pace = !begun ? ['Ready', 'muted'] : Math.abs(diff) < 30 ? ['On time', 'good'] : diff > 0 ? [`Behind ${fmtTimeSec(diff)}`, diff > 180 ? 'bad' : 'warn'] : [`Ahead ${fmtTimeSec(-diff)}`, 'info'];
    const remainMin = tm.slice(curIdx + 1).reduce((a, x) => a + x.dur, 0) + Math.max(0, segTarget - segEl) / 60, endAt = nowMin() + remainMin;
    const covered = rundown.filter(s => s.status === 'Covered').length, active = rundown.filter(s => s.status !== 'Cut').length;
    const openIss = L.issues.filter(i => i.status !== 'Resolved'), pre = POD_PREFLIGHT.filter(([k]) => L.preflight[k]).length;
    const guest = cur.guestId ? pd.guests.find(g => g.id === cur.guestId) : null, sponsor = cur.sponsorId ? pd.sponsors.find(s => s.id === cur.sponsorId) : null;

    /* actions */
    const goTo = i => { if (cur.status === 'Recording') cur.status = i > curIdx ? 'Covered' : 'Planned'; PodTimer.activeSegIdx = i; PodTimer.segStartSec = PodTimer.elapsedSec; if (live && rundown[i].status === 'Planned') rundown[i].status = 'Recording'; mark(`Started: ${rundown[i].title}`, 'segment'); liveLog(L, `Segment ${i + 1}: ${rundown[i].title}`, 'scene'); flash(); };
    const nextSeg = () => { const i = rundown.findIndex((s, j) => j > curIdx && s.status !== 'Cut'); if (i < 0) { cur.status = 'Covered'; toast('That was the last segment — wrap the session when you’re done.'); flash(); return; } cur.status = 'Covered'; goTo(i); };
    const record = () => { if (live) { PodTimer.pause(); liveLog(L, `Paused at ${fmtTimeSec(PodTimer.elapsedSec)}`, 'sys'); } else { if (!L.started) L.started = Date.now(); PodTimer.start(); if (cur.status === 'Planned') cur.status = 'Recording'; liveLog(L, begun ? `Resumed at ${fmtTimeSec(PodTimer.elapsedSec)}` : 'Recording started', 'sys'); } flash(); };
    const wrapSession = async () => { if (!(await confirmBox(`Wrap this session? ${fmtTimeSec(PodTimer.elapsedSec)} recorded, ${PodTimer.markers.length} markers. A hand-off sheet goes to the editor and the daily report.`, 'Wrap session', 'Wrap the recording?'))) return; PodTimer.pause(); if (cur.status === 'Recording') cur.status = 'Covered'; mark(`Session wrapped (${fmtTimeSec(PodTimer.elapsedSec)})`, 'sys'); L.ended = Date.now(); liveLog(L, 'Session wrapped', 'sys'); podSave(L); openSessionWrapModal(P, pd, rundown, L); flash(); };
    acts.record = record; acts.next = nextSeg;
    const micToggle = async () => { if (PodMicMeter.active) { PodMicMeter.stop(); PodTimer.micMeterActive = false; } else PodTimer.micMeterActive = await PodMicMeter.start(() => vuUpdate()); flash(); };

    /* header */
    const header = h('div', { class: 'ld-head' },
      h('div', { class: 'ld-tile ld-clock rec' + (live ? ' on' : '') }, h('b', { class: 'ld-v mono', id: 'podLiveClock' }, fmtTimeSec(PodTimer.elapsedSec)), h('span', { class: 'ld-s', id: 'podLiveState' }, h('i', { class: 'rec-dot' }), live ? 'Recording' : begun ? 'Paused' : 'Studio ready')),
      ldTile('Pacing', pace[0], `Runs ~${Math.round(totalMin)} min · ends ~${clockTxt(endAt)}`, pace[1]),
      ldTile('Segment', `${curIdx + 1} of ${rundown.length}`, `${covered}/${active} covered`, '', ldProgress(active ? covered / active * 100 : 0, 'good')),
      ldTile('Markers', String(PodTimer.markers.length), 'for the editor'),
      ldTile('Problems', String(openIss.length), openIss.length ? 'open' : 'all clear', openIss.some(i => sevRank(i.sev) >= 2) ? 'bad' : openIss.length ? 'warn' : ''),
      h('div', { class: 'ld-actions' },
        h('button', { class: 'btn big ' + (live ? '' : 'primary rec-btn'), onclick: record, title: 'Record / pause (Space)' }, icon(live ? 'pause' : 'play', 16), live ? 'Pause' : begun ? 'Resume' : 'Record'),
        h('button', { class: 'btn', onclick: nextSeg, title: 'Finish this segment and start the next (N)' }, icon('right', 15), 'Next'),
        h('button', { class: 'btn', onclick: wrapSession }, 'Wrap'),
        h('button', { class: 'icon-btn' + (PodMicMeter.active ? ' on' : ''), onclick: micToggle, title: PodMicMeter.active ? 'Stop the mic meter' : 'Mic level meter', 'aria-label': 'Mic level meter' }, icon('cue', 17)),
        h('button', { class: 'icon-btn', onclick: () => ldTV(wrap), title: 'Big-display mode (T)', 'aria-label': 'Big-display mode' }, icon('focus', 17))));

    /* alerts */
    const alerts = [];
    openIss.filter(i => i.sev === 'Critical').forEach(i => alerts.push(['crit', `Critical: ${i.title}`]));
    if (guest && guest.nogo) alerts.push(['crit', `${guest.name} — off limits: ${guest.nogo}`]);
    if (segOver > 30) alerts.push(['warn', `“${cur.title}” is ${fmtTimeSec(segOver)} over its ${parseDurMin(cur.dur)} min`, { label: '+2 min', fn: () => { cur.dur = (parseFloat(cur.dur) || 1) + 2; flash(); } }]);
    if (!begun && pre < POD_PREFLIGHT.length) alerts.push(['warn', `Pre-flight: ${pre} of ${POD_PREFLIGHT.length} checks done`, { label: 'Show', fn: () => { LD.setOpen('pod:preflight', true); draw(); } }]);
    const unread = pd.sponsors.filter(s => !s.recorded); if (begun && unread.length && !rundown.slice(curIdx + 1).some(s => s.sponsorId)) alerts.push(['tip', `${unread.length} sponsor read${unread.length > 1 ? 's' : ''} not recorded yet: ${unread.map(s => s.name).join(', ')}`]);

    /* on air */
    const bullets = (cur.bullets || '').split('\n').filter(Boolean);
    const onAir = h('div', { class: 'ld-card s-active' + (segOver > 0 ? ' over' : ''), 'data-key': 'onair' },
      h('div', { class: 'ld-card-h' }, h('span', { class: 'ld-l' }, live ? `On air · segment ${curIdx + 1}` : `Segment ${curIdx + 1}`), h('span', { class: 'grow' }),
        h('span', { class: 'ld-big mono' + (segOver > 0 ? ' neg' : ''), id: 'podSegTime' }, `${fmtTimeSec(segEl)} / ${fmtTimeSec(segTarget)}`)),
      h('div', { class: 'ld-title' }, h('b', {}, cur.title)),
      ldProgress(segEl / segTarget * 100, segOver > 0 ? 'bad' : 'info'),
      cur.cues ? h('div', { class: 'ld-cue' }, icon('cue', 15), h('span', { class: 'grow' }, cur.cues), h('button', { class: 'btn sm primary', onclick: () => { PodAudio.playChime(); mark(`Cue: ${cur.cues}`, 'cue'); flash(); } }, icon('play', 12), 'Fire cue')) : null,
      P.blocks && P.blocks.length > 2 ? h('div', { class: 'seg sm' }, [['bullets', 'Talking points'], ['script', 'Script']].map(([k, l]) => h('button', { class: (PodTimer.scriptPrompter ? 'script' : 'bullets') === k ? 'on' : '', onclick: () => { PodTimer.scriptPrompter = k === 'script'; draw(); } }, l))) : null,
      PodTimer.scriptPrompter ? renderScriptPrompter(P, () => draw()) : renderBulletsChecklist(cur, bullets),
      sponsor ? renderEmbeddedSponsorBox(sponsor, flash) : null, guest ? renderEmbeddedGuestBox(guest, flash) : null,
      h('div', { class: 'ld-btns' }, h('button', { class: 'btn primary big', onclick: nextSeg }, icon('check', 16), next ? 'Done — next segment' : 'Done'),
        h('button', { class: 'btn', onclick: () => { cur.dur = (parseFloat(cur.dur) || 1) + 2; flash(); } }, '+2 min'),
        h('button', { class: 'btn', onclick: () => askMarker(`[${cur.title}] `) }, icon('flag', 14), 'Marker'),
        h('span', { class: 'grow' }), h('button', { class: 'btn ghost danger', onclick: () => { cur.status = 'Cut'; mark(`Cut segment: ${cur.title}`, 'warn'); liveLog(L, `Cut segment: ${cur.title}`, 'warn'); nextSeg(); } }, 'Cut segment')));
    const upNext = next ? h('div', { class: 'ld-card s-next', 'data-key': 'next' },
      h('div', { class: 'ld-card-h' }, h('span', { class: 'ld-l' }, `Up next · segment ${rundown.indexOf(next) + 1}`), h('span', { class: 'grow' }), h('span', { class: 'ld-meta' }, `${parseDurMin(next.dur)} min`)),
      h('div', { class: 'ld-title' }, h('b', {}, next.title)), next.bullets ? h('div', { class: 'ld-syn clip2' }, next.bullets.split('\n').filter(Boolean).slice(0, 2).join(' · ')) : null,
      h('div', { class: 'ld-chips' }, next.cues ? h('span', { class: 'chip' }, icon('cue', 12), next.cues) : null, next.guestId ? h('span', { class: 'chip' }, icon('user', 12), (pd.guests.find(g => g.id === next.guestId) || {}).name || 'Guest') : null, next.sponsorId ? h('span', { class: 'chip' }, icon('dollar', 12), (pd.sponsors.find(s => s.id === next.sponsorId) || {}).name || 'Sponsor') : null),
      h('div', { class: 'ld-btns' }, h('button', { class: 'btn', onclick: () => goTo(rundown.indexOf(next)) }, 'Jump to it'))) : h('div', { class: 'ld-card empty' }, h('span', { class: 'ld-l' }, 'Up next'), h('p', { class: 'muted' }, 'This is the last segment.'));

    /* running order */
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= rundown.length) return; [rundown[i], rundown[j]] = [rundown[j], rundown[i]]; if (PodTimer.activeSegIdx === i) PodTimer.activeSegIdx = j; else if (PodTimer.activeSegIdx === j) PodTimer.activeSegIdx = i; flash(); };
    const order = ldPanel('pod:order', { title: 'Running order', ico: 'list', count: `${covered}/${active}`, hint: `~${Math.round(totalMin)} min`,
      tools: [h('button', { class: 'btn sm ghost', onclick: async () => { const t = await promptBox('Add a segment', 'Title of the new topic or segment', ''); if (t) { rundown.splice(curIdx + 1, 0, newSegment({ title: t, dur: 5 })); flash(); } } }, icon('plus', 13), 'Segment'), h('a', { class: 'btn sm ghost', href: `#/p/${P.id}/rundown` }, 'Planner')],
      body: () => h('div', { class: 'ld-list ld-ro' }, rundown.map((s, i) => h('div', { class: 'ld-ro-row s-' + s.status.toLowerCase() + (i === curIdx ? ' cur' : ''), 'data-key': s.id },
        h('span', { class: 'ld-time mono' }, `+${Math.floor(tm[i].start)}′`), h('button', { class: 'ld-ro-t', onclick: () => goTo(i), title: 'Go to this segment' }, h('b', {}, `${i + 1}. `), s.title),
        h('span', { class: 'ld-meta' }, `${parseDurMin(s.dur)}m`),
        h('button', { class: 'pill st', style: { background: RUNDOWN_TONE[s.status] || '#888' }, title: 'Tap to change: planned → recording → covered → cut', onclick: () => { s.status = { Planned: 'Recording', Recording: 'Covered', Covered: 'Cut', Cut: 'Planned' }[s.status] || 'Planned'; flash(); } }, s.status),
        ibtn('up', 'Earlier', () => move(i, -1)), ibtn('down', 'Later', () => move(i, 1))))) }, draw);

    /* side panels */
    const markers = ldPanel('pod:markers', { title: 'Editor markers', ico: 'flag', count: PodTimer.markers.length || '', hint: PodTimer.markers[0] ? PodTimer.markers[0].label.slice(0, 32) : '',
      tools: [h('button', { class: 'btn sm ghost', onclick: () => { if (!PodTimer.markers.length) return toast('No markers yet', true); navigator.clipboard.writeText([...PodTimer.markers].reverse().map(m => `[${fmtTimeSec(m.time)}] ${m.label}`).join('\n')); toast('Markers copied for the editor'); } }, icon('copy', 13), 'Copy')],
      body: () => [h('div', { class: 'ld-pad' }, POD_MARKS.map(([k, l, msg]) => h('button', { class: 'btn', onclick: () => { mark(msg, k); flash(); } }, l))),
        h('input', { class: 'inp ld-quick', placeholder: '+ Describe a marker, Enter', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { mark(e.target.value.trim(), 'custom'); e.target.value = ''; flash(); } } }),
        ldList('pod:markers', PodTimer.markers, m => h('div', { class: 'ld-ev k-' + m.kind }, h('span', { class: 'ld-time mono' }, fmtTimeSec(m.time)), h('span', { class: 'grow' }, m.label), ibtn('trash', 'Delete marker', () => { const i = PodTimer.markers.indexOf(m); if (i >= 0) PodTimer.markers.splice(i, 1); flash(); }, 'danger')), { limit: 6, empty: 'Tap a button above, or use the R / C / B / M keys.', cls: 'ld-list ld-log' }, draw)] }, draw);
    const sounds = [['Intro gong', () => PodAudio.playGong(), 'gong'], ['3-2-1 sync', () => PodAudio.playSyncBeeps(), 'sync'], ['Chime', () => PodAudio.playChime(), 'chime'], ['Bleep', () => PodAudio.playBleep(0.7), 'bleep'], ['Ping', () => PodAudio.playPing(), 'ping']];
    const board = ldPanel('pod:sound', { title: 'Soundboard', ico: 'cue', open: false, hint: 'gong, sync, chime, bleep',
      tools: [h('label', { class: 'ld-check small' }, h('input', { type: 'checkbox', checked: PodTimer.autoLogSound, onchange: e => { PodTimer.autoLogSound = e.target.checked; } }), 'Log as marker')],
      body: () => h('div', { class: 'ld-pad' }, sounds.map(([l, fn, k]) => h('button', { class: 'btn', onclick: () => { fn(); if (PodTimer.autoLogSound) { PodTimer.addMarker(`[Sound] ${l}`, k); flash(); } } }, l))) }, draw);
    const meter = PodMicMeter.active ? ldPanel('pod:mic', { title: 'Mic level', ico: 'cue', tools: [h('span', { id: 'podVuClip', class: 'ld-sev', style: { background: 'var(--danger)', display: 'none' } }, 'CLIP'), h('span', { id: 'podVuLabel', class: 'ld-meta mono' }, '— dB')],
      body: () => [h('div', { class: 'vu-meter' }, h('div', { id: 'podVuFill', class: 'vu-fill', style: { width: '0%' } })), h('div', { class: 'ld-row ld-meta', style: { justifyContent: 'space-between' } }, h('span', {}, '−48'), h('span', {}, '−18'), h('span', {}, '−12 target'), h('span', {}, '0 dB'))] }, draw) : null;
    UI.podLiveGuestIdx = Math.min(UI.podLiveGuestIdx || 0, Math.max(0, pd.guests.length - 1)); const g = guest || pd.guests[UI.podLiveGuestIdx];
    const guestP = pd.guests.length ? ldPanel('pod:guest', { title: 'Guest', ico: 'user', hint: g ? g.name : '',
      tools: pd.guests.length > 1 && !guest ? [h('select', { class: 'inp sm', onchange: e => { UI.podLiveGuestIdx = +e.target.value; draw(); } }, pd.guests.map((x, i) => h('option', { value: i, selected: x === g }, x.name)))] : null,
      body: () => { const qs = (g.questions || '').split('\n').filter(Boolean), asked = qs.filter((q, i) => PodTimer.checkedQuestions.has(`${g.id}-${i}`)).length;
        return [h('div', { class: 'ld-row' }, h('b', {}, g.name), g.pronouns ? h('span', { class: 'pill' }, g.pronouns) : null, h('span', { class: 'grow' }), g.link ? h('a', { class: 'btn sm', href: /^https?:/.test(g.link) ? g.link : 'https://' + g.link, target: '_blank', rel: 'noreferrer' }, 'Join studio') : null),
          g.title ? h('div', { class: 'ld-meta' }, g.title) : null, g.nogo ? h('div', { class: 'ld-warn' }, `Off limits: ${g.nogo}`) : null,
          qs.length ? h('div', { class: 'ld-ctx-l' }, 'Questions', h('em', {}, `${asked}/${qs.length}`)) : null,
          ldList('pod:q:' + g.id, qs.map((q, i) => [q, `${g.id}-${i}`]), ([q, k]) => h('label', { class: 'ld-check' + (PodTimer.checkedQuestions.has(k) ? ' done' : '') }, h('input', { type: 'checkbox', checked: PodTimer.checkedQuestions.has(k), onchange: e => { e.target.checked ? PodTimer.checkedQuestions.add(k) : PodTimer.checkedQuestions.delete(k); draw(); } }), h('span', {}, q)), { limit: 6 }, draw)]; } }, draw) : null;
    UI.podLiveSponsorIdx = Math.min(UI.podLiveSponsorIdx || 0, Math.max(0, pd.sponsors.length - 1)); const sp = sponsor || pd.sponsors[UI.podLiveSponsorIdx];
    const spons = pd.sponsors.length ? ldPanel('pod:sponsor', { title: 'Sponsor reads', ico: 'dollar', count: `${pd.sponsors.filter(s => s.recorded).length}/${pd.sponsors.length}`, open: !!sponsor, hint: unread.length ? `${unread.length} to record` : 'all recorded',
      tools: pd.sponsors.length > 1 && !sponsor ? [h('select', { class: 'inp sm', onchange: e => { UI.podLiveSponsorIdx = +e.target.value; draw(); } }, pd.sponsors.map((x, i) => h('option', { value: i, selected: x === sp }, `${x.name} (${x.slot})`)))] : null,
      body: () => [h('div', { class: 'ld-row' }, h('b', {}, sp.name), h('span', { class: 'pill' }, sp.slot), h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => { navigator.clipboard.writeText(sp.copy || ''); toast('Ad copy copied'); } }, icon('copy', 12), 'Copy')),
        sp.url || sp.code ? h('div', { class: 'ld-chips' }, sp.url ? h('span', { class: 'chip' }, sp.url) : null, sp.code ? h('span', { class: 'chip on' }, sp.code) : null) : null,
        h('div', { class: 'ld-read' }, sp.copy || sp.points || 'No copy yet.'),
        h('label', { class: 'ld-check' }, h('input', { type: 'checkbox', checked: !!sp.recorded, onchange: e => { sp.recorded = e.target.checked; if (sp.recorded) mark(`Sponsor read: ${sp.name}`, 'cue'); flash(); } }), 'Recorded')] }, draw) : null;
    const preflight = ldPanel('pod:preflight', { title: 'Pre-flight', ico: 'check', count: `${pre}/${POD_PREFLIGHT.length}`, tone: pre === POD_PREFLIGHT.length ? 'good' : begun ? 'warn' : '', open: !begun, hint: pre === POD_PREFLIGHT.length ? 'studio ready' : `${POD_PREFLIGHT.length - pre} to check`,
      body: () => h('div', { class: 'ld-list' }, POD_PREFLIGHT.map(([k, l]) => h('label', { class: 'ld-check' + (L.preflight[k] ? ' done' : '') }, h('input', { type: 'checkbox', checked: !!L.preflight[k], onchange: e => { L.preflight[k] = e.target.checked; flash(); } }), h('span', {}, l)))) }, draw);
    const hotkeys = Device.form() === 'desktop' || !Device.touchOn() ? ldPanel('pod:keys', { title: 'Keyboard', ico: 'keyboard', open: false, hint: 'Space record · N next · R C B M markers',
      body: () => h('div', { class: 'ld-keys' }, [['Space', 'Record / pause'], ['N', 'Next segment'], ['R', 'Retake marker'], ['C', 'Clip marker'], ['B', 'Bleep'], ['M', 'Custom marker'], ['T', 'Big display']].map(([k, l]) => h('span', {}, h('kbd', {}, k), l))) }, draw) : null;

    cx.items = rundown.map((s, i) => ({ id: s.id, label: `${i + 1}. ${s.title}` }));
    cx.groups = [{ key: 'hosts', label: 'Hosts', people: P.people.filter(p => p.type === 'cast' && p.name).map(p => ({ p, sub: p.role || p.character || 'Host' })) },
      { key: 'guests', label: 'Guests', people: pd.guests.filter(x => x.name).map(x => ({ p: x, sub: x.title || 'Guest' })) },
      { key: 'crew', label: 'Crew', people: P.people.filter(p => p.type === 'crew' && p.name).map(p => ({ p, sub: [p.role, p.dept].filter(Boolean).join(' · ') })) }];
    cx.taskFilter = t => !t.due || t.due <= cx.date || t.status === 'blocked' || t.status === 'doing';

    morph(wrap, [header, ldAlerts(alerts, draw), h('div', { class: 'ld-grid' },
      h('div', { class: 'ld-main' }, h('div', { class: 'ld-now-row' }, onAir, upNext), order, hotkeys),
      h('div', { class: 'ld-side' }, meter, markers, ldProblems(cx), guestP, spons, preflight, ldCheckin(cx), board, ldTasks(cx), ldActivity(cx)))].filter(Boolean));
    vuUpdate();
  }
  function vuUpdate() {
    const fill = $('#podVuFill'), label = $('#podVuLabel'), clip = $('#podVuClip'); if (!fill || !label) return;
    const db = PodMicMeter.currentDb; fill.style.width = Math.min(100, Math.max(0, (db + 48) / 48 * 100)) + '%'; label.textContent = `${db.toFixed(1)} dB`; if (clip) clip.style.display = PodMicMeter.isClipping ? '' : 'none';
  }
  /* the clocks tick without a redraw */
  const unsub = PodTimer.subscribe(() => {
    const c = $('#podLiveClock'); if (c) c.textContent = fmtTimeSec(PodTimer.elapsedSec);
    const cur = pd.rundown[PodTimer.activeSegIdx], st = $('#podSegTime'); if (st && cur) { const el = Math.max(0, PodTimer.elapsedSec - PodTimer.segStartSec), tg = Math.max(30, parseDurMin(cur.dur) * 60); st.textContent = `${fmtTimeSec(el)} / ${fmtTimeSec(tg)}`; st.classList.toggle('neg', el > tg); }
  });
  const onKeyDown = e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('body > .overlay')) return;
    const k = e.key.toLowerCase(), act = { ' ': () => acts.record && acts.record(), n: () => acts.next && acts.next(), arrowright: () => acts.next && acts.next(),
      r: () => { mark('Retake / line flub', 'retake'); toast('Retake marker'); flash(); }, c: () => { mark('Highlight / golden quote', 'quote'); toast('Clip marker'); flash(); },
      b: () => { PodAudio.playBleep(0.7); PodTimer.addMarker('Bleep / censor point', 'bleep'); flash(); }, m: () => askMarker(), t: () => ldTV(wrap) }[k];
    if (act) { e.preventDefault(); act(); }
  };
  window.addEventListener('keydown', onKeyDown);
  const scroll = setInterval(() => { if (PodTimer.autoScroll && PodTimer.scriptPrompter) { const box = $('#podPrompterBox'); if (box) box.scrollTop += PodTimer.scrollSpeed || 1; } }, 40);
  draw();
  const stop = ldTicker(wrap, { redraw: () => PodTimer.running && draw(), every: 5000 });
  return () => { stop(); clearInterval(scroll); unsub(); PodMicMeter.stop(); window.removeEventListener('keydown', onKeyDown); };
}

/* talking points: tick them off as you go */
function renderBulletsChecklist(seg, bullets) {
  if (!bullets.length) return h('p', { class: 'ld-empty' }, 'No talking points for this segment — add them in the rundown planner.');
  return h('div', { class: 'ld-points' }, bullets.map((b, i) => { const key = `${seg.id}-${i}`, on = PodTimer.checkedBullets.has(key);
    return h('label', { class: 'ld-check big' + (on ? ' done' : '') }, h('input', { type: 'checkbox', checked: on, onchange: e => { e.target.checked ? PodTimer.checkedBullets.add(key) : PodTimer.checkedBullets.delete(key); e.target.closest('label').classList.toggle('done', e.target.checked); } }), h('span', {}, b.replace(/^[•\-*]\s*/, ''))); }));
}
/* the script as a teleprompter: a window that scrolls itself, with the scrollbar hidden */
function renderScriptPrompter(P, redraw) {
  const fs = PodTimer.prompterFontSize || 18, auto = !!PodTimer.autoScroll, spd = PodTimer.scrollSpeed || 1;
  return h('div', { class: 'ld-prompter' },
    h('div', { class: 'ld-row' }, h('button', { class: 'btn sm primary', onclick: () => { PodTimer.autoScroll = !auto; redraw(); } }, icon(auto ? 'pause' : 'play', 13), auto ? 'Stop scroll' : 'Auto-scroll'),
      h('div', { class: 'seg sm' }, [[1, '1×'], [1.5, '1.5×'], [2, '2×']].map(([s, l]) => h('button', { class: spd === s ? 'on' : '', onclick: () => { PodTimer.scrollSpeed = s; redraw(); } }, l))), h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', title: 'Smaller text', disabled: fs <= 12, onclick: () => { PodTimer.prompterFontSize = Math.max(12, fs - 2); redraw(); } }, 'A−'), h('button', { class: 'icon-btn', title: 'Larger text', disabled: fs >= 34, onclick: () => { PodTimer.prompterFontSize = Math.min(34, fs + 2); redraw(); } }, 'A+')),
    h('div', { id: 'podPrompterBox', class: 'prompter-box', style: { fontSize: fs + 'px' } }, P.blocks.map(b => h('div', { class: 'pb-' + b.type }, b.text))));
}
function renderEmbeddedSponsorBox(sp, flash) {
  return h('div', { class: 'ld-inset sponsor' }, h('div', { class: 'ld-row' }, h('b', {}, `Sponsor read · ${sp.name}`), h('span', { class: 'pill' }, sp.slot), h('span', { class: 'grow' }), h('button', { class: 'btn sm ' + (sp.recorded ? '' : 'primary'), onclick: () => { sp.recorded = !sp.recorded; flash(); } }, icon('check', 13), sp.recorded ? 'Recorded' : 'Mark recorded')),
    sp.url || sp.code ? h('div', { class: 'ld-chips' }, sp.url ? h('span', { class: 'chip' }, sp.url) : null, sp.code ? h('span', { class: 'chip on' }, `Code ${sp.code}`) : null) : null,
    h('div', { class: 'ld-read' }, sp.copy || sp.points || ''));
}
function renderEmbeddedGuestBox(g) {
  return h('div', { class: 'ld-inset guest' }, h('div', { class: 'ld-row' }, h('b', {}, `Guest · ${g.name}`), g.title ? h('span', { class: 'ld-meta' }, g.title) : null, h('span', { class: 'grow' }), g.link ? h('a', { class: 'btn sm', href: /^https?:/.test(g.link) ? g.link : 'https://' + g.link, target: '_blank', rel: 'noreferrer' }, 'Join studio') : null),
    g.nogo ? h('div', { class: 'ld-warn' }, `Off limits: ${g.nogo}`) : null);
}

/* ---------------------------------------------------------------
   Session wrap: the editor's hand-off sheet, also saved to the daily report
   --------------------------------------------------------------- */
function openSessionWrapModal(P, pd, rundown, L) {
  if (!P.days.length) P.days.push(Object.assign(newDay(P, todayISO()), { title: 'Episode recording' }));
  const d = P.days.find(x => x.id === UI.liveDay) || P.days.find(x => x.date === todayISO()) || P.days[0]; UI.liveDay = d.id;
  const R = dprOf(P, d), start = PodTimer.startTime || (Date.now() - PodTimer.elapsedSec * 1000), rec = PodTimer.elapsedSec;
  R.t.crew = R.t.crew || fromMin(Math.round(msMin(start))); R.t.wrap = fromMin(Math.round(msMin(Date.now())));
  const covered = rundown.filter(s => s.status === 'Covered').length, cut = rundown.filter(s => s.status === 'Cut').length, marks = [...PodTimer.markers].reverse(), issues = L.issues;
  const lines = [`EPISODE RECORDING — HAND-OFF`, `Show: ${P.title}`, `Episode: ${pd.epNumber || '1'}${pd.season ? ' (season ' + pd.season + ')' : ''}`, `Date: ${todayISO()}`, `Recorded: ${fmtTimeSec(rec)}`, `Segments covered: ${covered} of ${rundown.length}${cut ? ` (${cut} cut)` : ''}`, '',
    'RUNNING ORDER', ...rundown.map((s, i) => `${i + 1}. [${s.status.toUpperCase()}] ${s.title} (${s.dur} min planned)`), '',
    ...(marks.length ? ['EDITOR MARKERS', ...marks.map(m => `[${fmtTimeSec(m.time)}] ${m.kind && m.kind !== 'marker' ? m.kind.toUpperCase() + ': ' : ''}${m.label}`), ''] : []),
    ...(pd.sponsors.length ? ['SPONSOR READS', ...pd.sponsors.map(s => `[${s.recorded ? 'RECORDED' : 'NOT RECORDED'}] ${s.name} (${s.slot})${s.code ? ' — code ' + s.code : ''}`), ''] : []),
    ...(issues.length ? ['PROBLEMS', ...issues.map(i => `[${i.tc != null ? fmtTimeSec(i.tc) : clockTxt(msMin(i.at))}] [${i.sev}] ${i.cat}: ${i.title}${i.status === 'Resolved' ? ' (resolved)' : ''}`)] : [])];
  const text = lines.join('\n');
  R.notes = [R.notes, text].filter(Boolean).join('\n\n'); if (issues.length) R.incidents = issues.map(i => `[${i.sev}] ${i.cat}: ${i.title}`).join('\n'); R.media = `Audio · ${fmtTimeSec(rec)} recorded`; Store.touch();
  const stat = (l, v) => h('div', { class: 'ld-tile' }, h('span', { class: 'ld-l' }, l), h('b', { class: 'ld-v' }, v));
  modal({ title: 'Session wrapped', wide: true, body: h('div', {}, h('div', { class: 'ld-head' }, stat('Recorded', fmtTimeSec(rec)), stat('Segments covered', `${covered}/${rundown.length}`), stat('Markers', String(marks.length)), stat('Problems', String(issues.length))),
    h('label', { class: 'lbl' }, 'Hand-off sheet for the editor — also saved in the daily report'), h('textarea', { class: 'inp mono', rows: 12, readOnly: true, value: text })),
    buttons: [{ label: 'Reports', onClick: () => { location.hash = `#/p/${P.id}/reports`; } }, { label: 'Close' }, { label: 'Copy for the editor', primary: true, onClick: () => { navigator.clipboard.writeText(text); toast('Hand-off sheet copied'); return false; } }] });
}

