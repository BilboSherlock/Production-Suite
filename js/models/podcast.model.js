'use strict';
/* ===================================================================
   Podcast planner — MODEL
   The episode plan saved in P.podcast: the rundown (timed segments, or
   loose topics for a freeflow show), guests, sponsor reads, studio gear,
   the camera plan for a filmed show, and show notes. Pure functions —
   no DOM, no Store.

   P.podcast = {
     format: 'structured' | 'freeflow' | 'scripted',
     medium: 'audio' | 'video',          video = a filmed show (video + audio)
     target: minutes                     the episode length a freeflow show aims for (0 = sum of topics)
     rundown: [segment], guests: [guest], sponsors: [sponsor], gear: [item],
     video: { cameras:[camera], aspect, res, iso, clips, set, lighting, wardrobe, thumbnail },
     notes: { titleOptions, summary, links, audioCues, watch, tags }
   }
   The recording itself (clock, markers, pre-flight) lives in the live
   session — see PodLiveModel.
   =================================================================== */

const PodcastModel = {
  FORMATS: [['structured', 'Structured rundown', 'Timed segments in order — interviews, news shows, panels.'],
    ['freeflow', 'Freeflow conversation', 'Topics to get to in any order, with a target length — chat shows, co-host banter, long conversations.'],
    ['scripted', 'Scripted', 'Written word for word in the audio script; the rundown is the outline — narrative, audio drama, solo essays.']],
  MEDIA: [['audio', 'Audio only'], ['video', 'Filmed (video + audio)']],
  STATUS: ['Planned', 'Recording', 'Covered', 'Cut'],
  TONE: { Planned: '#8a8f98', Recording: '#e8830c', Covered: '#1e8e54', Cut: '#d6409f' },
  /** how much a freeflow topic matters */
  PRIORITY: ['Must', 'Nice', 'If time'],
  PRIORITY_LABEL: { Must: 'Must cover', Nice: 'Nice to have', 'If time': 'If there’s time' },
  PRIORITY_TONE: { Must: '#d6409f', Nice: '#3b7dd8', 'If time': '#8a8f98' },
  SLOTS: ['Pre-roll', 'Mid-roll 1', 'Mid-roll 2', 'Mid-roll 3', 'Post-roll'],
  LENGTHS: ['15s', '30s', '60s', '90s', '120s'],
  RELEASE: ['Needed', 'Sent', 'Signed'],
  /* filmed shows */
  SHOTS: ['Wide / master', 'Host single', 'Guest single', 'Two-shot', 'Over-the-shoulder', 'Close-up / detail', 'Overhead / product', 'Roaming / handheld', 'Screen capture'],
  ASPECTS: ['16:9', '9:16', '1:1', '4:5'],
  GEAR_READY: ['Picked up', 'In Studio', 'On set', 'Returned'],

  SEG_FIELDS: ['title', 'dur', 'bullets', 'cues', 'guestId', 'sponsorId', 'status', 'notes', 'priority', 'gfx', 'cam'],
  GUEST_FIELDS: ['name', 'pronouns', 'title', 'bio', 'questions', 'nogo', 'link', 'timeZone', 'plugs', 'release', 'onCamera'],
  SPONSOR_FIELDS: ['name', 'slot', 'duration', 'code', 'url', 'points', 'copy', 'recorded', 'onScreen'],
  GEAR_FIELDS: ['cat', 'name', 'qty', 'source', 'rate', 'days', 'pickup', 'ret', 'status', 'notes'],
  CAMERA_FIELDS: ['name', 'shot', 'who', 'lens', 'cardMins', 'notes'],
  VIDEO_FIELDS: ['aspect', 'res', 'iso', 'clips', 'set', 'lighting', 'wardrobe', 'thumbnail'],
  NOTE_FIELDS: ['titleOptions', 'summary', 'links', 'watch', 'tags'],

  /* ---------- the plan ---------- */
  videoDefaults: () => ({ cameras: [], aspect: '16:9', res: '4K · 25p', iso: true, clips: '9:16', set: '', lighting: '', wardrobe: '', thumbnail: '' }),
  blank() {
    return { format: 'structured', medium: 'audio', target: 0, rundown: [], guests: [], sponsors: [], gear: [], video: PodcastModel.videoDefaults(),
      notes: { titleOptions: '', summary: '', links: '', audioCues: [], watch: '', tags: '' } };
  },
  /** the plan with defaults filled in, without changing the project (lists are the project's own) */
  read(P) {
    const src = P.podcast || {}, b = PodcastModel.blank(), pd = Object.assign(b, src);
    pd.notes = Object.assign(PodcastModel.blank().notes, src.notes || {});
    pd.video = Object.assign(PodcastModel.videoDefaults(), src.video || {});
    if (!PodcastModel.FORMATS.some(([k]) => k === pd.format)) pd.format = 'structured';
    if (pd.medium !== 'video') pd.medium = 'audio';
    return pd;
  },
  /** the plan, filled in on the project itself — for changes */
  ensure(P) {
    const pd = P.podcast = P.podcast || {}, b = PodcastModel.blank();
    Object.keys(b).forEach(k => { if (pd[k] == null) pd[k] = b[k]; });
    pd.notes = Object.assign(b.notes, pd.notes); pd.video = Object.assign(PodcastModel.videoDefaults(), pd.video); pd.video.cameras = pd.video.cameras || [];
    return pd;
  },
  isFree: pd => pd.format === 'freeflow',
  isVideo: pd => pd.medium === 'video',
  formatLabel: k => (PodcastModel.FORMATS.find(f => f[0] === k) || PodcastModel.FORMATS[0])[1],
  mediumLabel: k => (PodcastModel.MEDIA.find(f => f[0] === k) || PodcastModel.MEDIA[0])[1],
  setFormat(pd, k) { if (!PodcastModel.FORMATS.some(f => f[0] === k)) return false; pd.format = k; if (k === 'freeflow' && !pd.target) pd.target = Math.round(PodcastModel.plannedMin(pd)) || 60; return true; },
  setMedium(pd, k) { if (!PodcastModel.MEDIA.some(f => f[0] === k)) return false; pd.medium = k; return true; },
  setTarget(pd, mins) { pd.target = Math.max(0, Math.round(parseFloat(mins) || 0)); },

  /* ---------- new records ---------- */
  segment: (o = {}) => Object.assign({ id: newId(), title: 'Segment topic', dur: 5, bullets: '', cues: '', guestId: '', sponsorId: '', status: 'Planned', notes: '', priority: 'Nice', gfx: '', cam: '' }, o),
  guest: (o = {}) => Object.assign({ id: newId(), name: 'Guest Name', pronouns: '', title: 'Title / Affiliation', bio: '',
    questions: '1. What inspired your recent project?\n2. What is the biggest misconception about your field?\n3. What comes next?',
    nogo: '', link: '', timeZone: '', plugs: '', release: 'Needed', onCamera: '' }, o),
  sponsor: (o = {}) => Object.assign({ id: newId(), name: 'Sponsor Name', slot: 'Mid-roll 1', duration: '60s', code: '', url: '',
    points: '• Mention 30-day money-back guarantee\n• Emphasize ease of setup\n• Must state vanity URL clearly twice',
    copy: 'This episode is brought to you by… Visit [URL] and use promo code [CODE] for 20% off.', recorded: false, onScreen: '' }, o),
  gearItem: (cat, o = {}) => Object.assign({ id: newId(), cat, name: '', qty: 1, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'Needed', notes: '' }, o),
  camera: (o = {}) => Object.assign({ id: newId(), name: 'Cam A', shot: 'Wide / master', who: '', lens: '', cardMins: '', notes: '' }, o),

  /* ---------- templates ---------- */
  TEMPLATES: {
    interview: { label: 'Standard Interview (45m)', format: 'structured', desc: 'Cold open, banter, topic intro, in-depth guest interview, sponsor, listener Q&A, outro.', segments: [
      { title: 'Cold Open & Hook', dur: 2, bullets: 'Tease the most provocative quote or revelation from today’s guest.\nSoundbite from interview.', cues: 'Theme stinger' },
      { title: 'Show Intro & Co-host Catch-up', dur: 4, bullets: 'Welcome listeners, quick life update or weekly anecdote.\nIntroduce episode theme.', cues: 'Theme music full, then duck under voice' },
      { title: 'Topic Primer / Background Story', dur: 6, bullets: 'Set the stage: why this topic matters right now.\nKey news facts or recent developments.', cues: 'Ambient background bed' },
      { title: 'Sponsor Read: Mid-Roll 1', dur: 1.5, bullets: 'Deliver sponsor talking points.\nMention promo code and vanity URL.', cues: 'Ad transition stinger' },
      { title: 'Guest Interview & Deep Dive', dur: 22, bullets: 'Welcome guest. Career background.\nCore questions and discussion.\nAudience relevance and practical takeaways.', cues: '' },
      { title: 'Audience Mailbag / Q&A', dur: 6, bullets: 'Read 1-2 listener questions from Discord or email.\nGuest and host reactions.', cues: '' },
      { title: 'Outro, Guest Plugs & Credits', dur: 3.5, bullets: 'Where listeners can find the guest.\nNext week’s teaser.\nRate and review reminder, Patreon/community plugs.', cues: 'Outro music swell' }] },
    panel: { label: 'Panel / Co-hosted News & Banter (60m)', format: 'structured', desc: '3-4 topic roundtables with co-hosts, ad breaks, hot takes and weekly picks.', segments: [
      { title: 'Intro & Banter: Icebreaker of the Week', dur: 6, bullets: 'Fun question or weekend recap among co-hosts.', cues: 'Intro theme' },
      { title: 'Story 1: The Big Headline', dur: 16, bullets: 'Facts of the story.\nPanel reactions & debate.\nLong-term industry implications.', cues: '' },
      { title: 'Sponsor Read: Mid-Roll 1', dur: 1.5, bullets: 'Sponsor read 1.', cues: 'Stinger' },
      { title: 'Story 2: Deep Dive / Tech or Trend', dur: 15, bullets: 'Detailed breakdown.\nContrarian viewpoints.', cues: '' },
      { title: 'Sponsor Read: Mid-Roll 2', dur: 1.5, bullets: 'Sponsor read 2.', cues: 'Stinger' },
      { title: 'Story 3: Wildcard / Rapid Fire', dur: 12, bullets: '3 quick headlines, 60 seconds each host.', cues: '' },
      { title: 'Picks of the Week & Wrap', dur: 8, bullets: 'Book, show, gadget, or life hack recommendations.\nSign-off.', cues: 'Outro theme' }] },
    solo: { label: 'Solo Commentary / Deep Dive (25m)', format: 'structured', desc: 'Tight, focused solo episode with structured thoughts, research breakdown and takeaway.', segments: [
      { title: 'The Hook & Thesis', dur: 3, bullets: 'The central question or contrarian insight.', cues: 'Theme sting' },
      { title: 'Part 1: How We Got Here (History/Context)', dur: 7, bullets: 'The origins and historical context.\nWhat everyone gets wrong.', cues: 'Subtle music bed' },
      { title: 'Mid-roll Sponsor & Pause', dur: 1.5, bullets: 'Sponsor copy.', cues: 'Ad tone' },
      { title: 'Part 2: The Real Consequence', dur: 9, bullets: 'The hidden angle or data breakdown.\nReal-world case study.', cues: 'Shift in bed music' },
      { title: 'Conclusion & Practical Takeaway', dur: 4.5, bullets: 'What you can do with this information.\nClosing thought.', cues: 'Theme return' }] },
    conversation: { label: 'Freeflow Conversation (60m)', format: 'freeflow', target: 60, desc: 'No running order — a list of topics to get to, must-covers first. Follow the conversation; the desk tells you what’s left.', segments: [
      { title: 'Catch-up — what’s been on our minds', dur: 8, priority: 'Must', bullets: 'No agenda. Let it run if it’s good.', cues: 'Theme in' },
      { title: 'The big conversation', dur: 25, priority: 'Must', bullets: 'Opening question: …\nWhere do we disagree?\nA story only you can tell.' },
      { title: 'Listener question or comment', dur: 8, priority: 'Nice', bullets: 'Pick one from the inbox before recording.' },
      { title: 'Side story from the week', dur: 10, priority: 'Nice', bullets: '' },
      { title: 'Rapid-fire / game', dur: 6, priority: 'If time', bullets: 'This-or-that, hot takes, would-you-rather.' },
      { title: 'Sign-off & plugs', dur: 3, priority: 'Must', bullets: 'Where to find us.\nNext episode tease.', cues: 'Outro theme' }] },
    roundtable: { label: 'Freeflow Roundtable (90m)', format: 'freeflow', target: 90, desc: 'Three or four voices, a pile of topics and room for tangents. Park the good ones for later.', segments: [
      { title: 'Intros & round the table', dur: 6, priority: 'Must', bullets: 'Everyone: one line on their week.', cues: 'Theme in' },
      { title: 'Topic 1 — the headline', dur: 20, priority: 'Must', bullets: '' },
      { title: 'Topic 2', dur: 15, priority: 'Must', bullets: '' },
      { title: 'Sponsor read', dur: 1.5, priority: 'Must', bullets: 'Read it where it fits — after a natural break.' },
      { title: 'Topic 3', dur: 15, priority: 'Nice', bullets: '' },
      { title: 'Topic 4', dur: 12, priority: 'If time', bullets: '' },
      { title: 'Picks & wrap', dur: 8, priority: 'Must', bullets: 'One recommendation each.', cues: 'Outro theme' }] },
    videocast: { label: 'Filmed Interview (45m, multi-cam)', format: 'structured', medium: 'video', desc: 'A video podcast: cold open for clips, two-camera interview, on-screen graphics and a call to subscribe.', segments: [
      { title: 'Cold Open — best moment', dur: 1, bullets: 'Edited in post from the strongest clip.', cam: 'Guest single', gfx: 'Show title card' },
      { title: 'Welcome & guest intro', dur: 3, bullets: 'Introduce the guest to camera.', cam: 'Wide → host single', gfx: 'Lower third: host name\nLower third: guest name & title', cues: 'Theme' },
      { title: 'Interview — part 1', dur: 15, bullets: 'Background and the big question.', cam: 'Cut between singles; wide for reactions' },
      { title: 'Sponsor read', dur: 1.5, bullets: 'Host to camera.', cam: 'Host single', gfx: 'Sponsor logo + promo code on screen' },
      { title: 'Interview — part 2', dur: 18, bullets: 'Practical takeaways.\nRapid-fire questions.', cam: 'Two-shot for rapid-fire' },
      { title: 'Outro & subscribe', dur: 2.5, bullets: 'Where to find the guest.\nSubscribe / like reminder.', cam: 'Wide', gfx: 'Guest links\nEnd screen (20s)', cues: 'Outro theme' }] },
  },
  templates() { return Object.entries(PodcastModel.TEMPLATES).map(([key, t]) => ({ key, label: t.label, desc: t.desc, format: t.format, medium: t.medium || '' })); },
  /** replace the rundown with a template (and take its format, target length and medium) */
  applyTemplate(pd, key) {
    const t = PodcastModel.TEMPLATES[key]; if (!t) return false;
    pd.rundown = t.segments.map(s => PodcastModel.segment(Object.assign({}, s)));
    if (t.format) pd.format = t.format;
    if (t.target) pd.target = t.target;
    if (t.medium) pd.medium = t.medium;
    return true;
  },

  /* ---------- the rundown ---------- */
  dur: v => PodLiveModel.parseDur(v),
  active: pd => pd.rundown.filter(s => s.status !== 'Cut'),
  /** minutes of the segments still in the show */
  plannedMin: pd => PodcastModel.active(pd).reduce((a, s) => a + PodcastModel.dur(s.dur), 0),
  /** how long the episode should run: a freeflow show's target, else the planned segments */
  runLength: pd => PodcastModel.isFree(pd) && pd.target ? pd.target : PodcastModel.plannedMin(pd),
  /** one line under the title */
  summary(pd) {
    const n = PodcastModel.active(pd).length, len = Math.round(PodcastModel.runLength(pd)), med = PodcastModel.isVideo(pd) ? ' · filmed' : '';
    if (PodcastModel.isFree(pd)) { const must = PodcastModel.active(pd).filter(s => s.priority === 'Must').length; return `Freeflow · ${n} topic${n === 1 ? '' : 's'} · ${must} must-cover · ${len} min target${med}`; }
    return `${PodcastModel.formatLabel(pd.format)} · ${n} active segment${n === 1 ? '' : 's'} · ${len} min target${med}`;
  },
  /** a freeflow show's topics by priority (cut ones last, on their own) */
  byPriority(pd) {
    const g = PodcastModel.PRIORITY.map(p => ({ key: p, label: PodcastModel.PRIORITY_LABEL[p], items: pd.rundown.filter(s => s.status !== 'Cut' && (s.priority || 'Nice') === p) }));
    const cut = pd.rundown.filter(s => s.status === 'Cut'); if (cut.length) g.push({ key: 'Cut', label: 'Cut', items: cut });
    return g;
  },
  /** freeflow: are the must-cover topics more than the target length? */
  overBooked(pd) { if (!PodcastModel.isFree(pd) || !pd.target) return 0; const must = PodcastModel.active(pd).filter(s => s.priority === 'Must').reduce((a, s) => a + PodcastModel.dur(s.dur), 0); return Math.max(0, must - pd.target); },
  addSegment(pd, o = {}) { const free = PodcastModel.isFree(pd), s = PodcastModel.segment(Object.assign({ title: `${free ? 'Topic' : 'Segment'} ${pd.rundown.length + 1}` }, o)); pd.rundown.push(s); return s; },
  /** set one field; false for unknown fields or values */
  setField(obj, fields, k, v) {
    if (!fields.includes(k)) return false;
    obj[k] = v; return true;
  },
  updateSegment(seg, k, v) {
    if (k === 'dur') v = Math.max(0.5, parseFloat(v) || 1);
    if (k === 'status' && !PodcastModel.STATUS.includes(v)) return false;
    if (k === 'priority' && !PodcastModel.PRIORITY.includes(v)) return false;
    return PodcastModel.setField(seg, PodcastModel.SEG_FIELDS, k, v);
  },
  moveSegment(pd, i, d) { const rd = pd.rundown, j = i + d; if (i < 0 || j < 0 || i >= rd.length || j >= rd.length) return false; [rd[i], rd[j]] = [rd[j], rd[i]]; return true; },
  removeSegment(pd, id) { const n = pd.rundown.length; pd.rundown = pd.rundown.filter(s => s.id !== id); return pd.rundown.length < n; },

  /* ---------- guests & sponsors ---------- */
  addGuest(pd, o) { const g = PodcastModel.guest(o); pd.guests.push(g); return g; },
  updateGuest(g, k, v) { if (k === 'release' && !PodcastModel.RELEASE.includes(v)) return false; return PodcastModel.setField(g, PodcastModel.GUEST_FIELDS, k, v); },
  /** remove a guest and unlink them from the rundown */
  removeGuest(pd, id) { pd.guests = pd.guests.filter(g => g.id !== id); pd.rundown.forEach(s => { if (s.guestId === id) s.guestId = ''; }); },
  addSponsor(pd, o) { const s = PodcastModel.sponsor(o); pd.sponsors.push(s); return s; },
  updateSponsor(sp, k, v) { if (k === 'recorded') v = !!v; return PodcastModel.setField(sp, PodcastModel.SPONSOR_FIELDS, k, v); },
  removeSponsor(pd, id) { pd.sponsors = pd.sponsors.filter(s => s.id !== id); pd.rundown.forEach(s => { if (s.sponsorId === id) s.sponsorId = ''; }); },

  /* ---------- cameras & set (filmed shows) ---------- */
  addCamera(pd, o = {}) {
    const used = new Set(pd.video.cameras.map(c => c.name)), letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !used.has(`Cam ${l}`)) || String(pd.video.cameras.length + 1);
    const shots = ['Wide / master', 'Host single', 'Guest single', 'Two-shot'], c = PodcastModel.camera(Object.assign({ name: `Cam ${letter}`, shot: shots[pd.video.cameras.length] || 'Close-up / detail' }, o));
    pd.video.cameras.push(c); return c;
  },
  updateCamera(c, k, v) { return PodcastModel.setField(c, PodcastModel.CAMERA_FIELDS, k, v); },
  removeCamera(pd, id) { pd.video.cameras = pd.video.cameras.filter(c => c.id !== id); },
  updateVideo(pd, k, v) { if (k === 'iso') v = !!v; return PodcastModel.setField(pd.video, PodcastModel.VIDEO_FIELDS, k, v); },
  /** three cameras covering a host and a guest */
  starterCameras(pd) { [['Wide / master', 'Locked off'], ['Host single', ''], ['Guest single', '']].forEach(([shot, notes]) => PodcastModel.addCamera(pd, { shot, notes })); },
  /** the camera plan as text for the crew */
  cameraText(P, pd) {
    const v = pd.video, lines = [`${P.title.toUpperCase()} — CAMERA PLAN`, '='.repeat(40), `Frame: ${v.aspect} · ${v.res}${v.iso ? ' · ISO record every camera' : ''}${v.clips ? ` · social clips ${v.clips}` : ''}`, ''];
    v.cameras.forEach(c => lines.push(`${c.name} — ${c.shot}${c.who ? ` (op: ${c.who})` : ''}${c.lens ? ` · ${c.lens}` : ''}${+c.cardMins ? ` · card ~${c.cardMins} min` : ''}${c.notes ? `\n   ${c.notes}` : ''}`));
    if (v.set) lines.push('', 'SET', v.set); if (v.lighting) lines.push('', 'LIGHTING', v.lighting); if (v.wardrobe) lines.push('', 'WARDROBE & ON CAMERA', v.wardrobe);
    const gfx = pd.rundown.filter(s => s.status !== 'Cut' && s.gfx);
    if (gfx.length) { lines.push('', 'ON-SCREEN GRAPHICS'); gfx.forEach(s => s.gfx.split('\n').filter(Boolean).forEach(g => lines.push(`• [${s.title}] ${g}`))); }
    return lines.join('\n');
  },

  /* ---------- gear ---------- */
  gearDays: (g, nDays) => +g.days || nDays || 1,
  gearCost: (g, nDays) => (+g.qty || 0) * (+g.rate || 0) * PodcastModel.gearDays(g, nDays),
  gearStats(pd, nDays) { return { count: pd.gear.length, ready: pd.gear.filter(g => PodcastModel.GEAR_READY.includes(g.status)).length, total: pd.gear.reduce((a, g) => a + PodcastModel.gearCost(g, nDays), 0) }; },
  filterGear(gear, q = '', status = '') { q = q.toLowerCase(); return gear.filter(g => (!status || g.status === status) && (!q || JSON.stringify(Object.values(g)).toLowerCase().includes(q))); },
  addGear(pd, cat) { const g = PodcastModel.gearItem(cat); pd.gear.push(g); return g; },
  updateGear(g, k, v) { return PodcastModel.setField(g, PodcastModel.GEAR_FIELDS, k, v); },
  duplicateGear(pd, id) { const i = pd.gear.findIndex(g => g.id === id); if (i < 0) return null; const c = Object.assign({}, pd.gear[i], { id: newId() }); pd.gear.splice(i + 1, 0, c); return c; },
  removeGear(pd, id) { pd.gear = pd.gear.filter(g => g.id !== id); },
  /** add a starter kit (a list of items) */
  addKit(pd, items) { items.forEach(g => pd.gear.push(g)); return items.length; },
  VIDEO_KIT: [['Cameras & Video (Vodcast)', 'Camera body — Cam A wide (e.g. mirrorless with clean HDMI)', 1], ['Cameras & Video (Vodcast)', 'Camera body — Cam B / C singles', 2],
    ['Cameras & Video (Vodcast)', 'Standard zoom lens (24-70mm f/2.8 or similar)', 3], ['Cameras & Video (Vodcast)', 'Tripods with fluid heads', 3],
    ['Cameras & Video (Vodcast)', 'Key + fill LED panels with softboxes', 2], ['Cameras & Video (Vodcast)', 'Back / hair light', 1],
    ['Cameras & Video (Vodcast)', 'Multi-camera switcher / ISO recorder', 1], ['Cameras & Video (Vodcast)', 'Field monitor', 1],
    ['Cables, Adapters & Power', 'HDMI / SDI cables (long runs)', 4], ['Cables, Adapters & Power', 'Dummy batteries / mains power for cameras', 3],
    ['Storage & Media', 'Fast camera cards (V90 SD / CFexpress, 256GB)', 4], ['Other / Field Kit', 'Clapper slate for sync', 1]],
  videoKit() { return PodcastModel.VIDEO_KIT.map(([cat, name, qty]) => PodcastModel.gearItem(cat, { name, qty })); },
  /** budget lines for gear with a day rate (kept in step by `auto`); returns how many */
  syncBudget(P, pd, catMap, nDays) {
    let n = 0; P.budget = P.budget || [];
    pd.gear.filter(g => (+g.rate || 0) > 0).forEach(g => {
      const key = 'gear:' + g.id; let l = P.budget.find(x => x.auto === key);
      if (!l) { l = { id: newId(), auto: key }; P.budget.push(l); }
      Object.assign(l, { cat: (catMap && catMap[g.cat]) || 'Audio Engineering', desc: `${g.name}${g.source && g.source !== 'Owned' ? ' (' + g.source + ')' : ''}`, qty: (+g.qty || 1) * PodcastModel.gearDays(g, nDays), unit: 'Day', rate: +g.rate || 0 });
      n++;
    });
    return n;
  },
  /** printable pack list: a group row per category, then ☐ rows */
  packRows(pd, cats) { return cats.flatMap(c => { const ls = pd.gear.filter(g => g.cat === c); return ls.length ? [{ grp: c }, ...ls.map(g => ['☐', g.cat, g.name, g.qty, g.source, g.status])] : []; }); },
  /** rental items grouped by rental house: [{ source, items, total }] */
  rentals(pd, nDays) {
    const by = new Map();
    pd.gear.filter(g => g.source && g.source !== 'Owned').forEach(g => { if (!by.has(g.source)) by.set(g.source, []); by.get(g.source).push(g); });
    return [...by].map(([source, items]) => ({ source, items, total: items.reduce((a, g) => a + PodcastModel.gearCost(g, nDays), 0) }));
  },
  gearCsv(pd, nDays) { return [['Category', 'Item', 'Qty', 'Source', 'Rate/day', 'Days', 'Total', 'Pick-up', 'Return', 'Status', 'Notes'], ...pd.gear.map(g => [g.cat, g.name, g.qty, g.source, g.rate, PodcastModel.gearDays(g, nDays), PodcastModel.gearCost(g, nDays), g.pickup, g.ret, g.status, g.notes])]; },

  /* ---------- chapters, clips & text ---------- */
  /** "m:ss" or "h:mm:ss" (what YouTube and podcast apps read) */
  stamp(sec) { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60, p = n => String(n).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`; },
  /** chapters from the plan: [{ sec, title }] */
  plannedChapters(pd) { let t = 0; return PodcastModel.active(pd).map(s => { const c = { sec: t, title: s.title }; t += PodcastModel.dur(s.dur) * 60; return c; }); },
  /** chapters from a recording's "Started: …" markers (markers newest first); the first starts at 0:00 */
  recordedChapters(markers, firstTitle = 'Intro') {
    const out = [];
    [...markers].filter(m => m.kind === 'segment' && /^Started: /.test(m.label)).sort((a, b) => a.time - b.time)
      .forEach(m => { const title = m.label.replace(/^Started: /, ''), last = out[out.length - 1]; if (last && last.sec === m.time) last.title = title; else if (!last || last.title !== title) out.push({ sec: m.time, title }); });
    if (!out.length) return out;
    if (out[0].sec > 0) out.unshift({ sec: 0, title: firstTitle });
    return out;
  },
  /** the recording's chapters when there are any, else the plan's */
  chapters(pd, markers = []) {
    const first = pd.rundown.find(s => s.status === 'Covered') || PodcastModel.active(pd)[0], rec = PodcastModel.recordedChapters(markers, first ? first.title : 'Intro');
    return rec.length ? { source: 'recorded', list: rec } : { source: 'planned', list: PodcastModel.plannedChapters(pd) };
  },
  chapterText: list => list.map(c => `${PodcastModel.stamp(c.sec)} ${c.title}`).join('\n'),
  /** clips for social: clip in/out pairs, and a minute around each highlight marker; oldest first */
  clips(markers) {
    const ms = [...markers].sort((a, b) => a.time - b.time), out = []; let open = null;
    ms.forEach(m => {
      if (m.kind === 'clipIn') { if (open) out.push({ in: open.time, out: open.time + 60, label: open.label }); open = m; }
      else if (m.kind === 'clipOut' && open) { out.push({ in: open.time, out: Math.max(m.time, open.time + 1), label: open.label }); open = null; }
      else if (m.kind === 'quote') out.push({ in: Math.max(0, m.time - 20), out: m.time + 40, label: m.label });
    });
    if (open) out.push({ in: open.time, out: open.time + 60, label: open.label });
    return out.sort((a, b) => a.in - b.in);
  },
  clipText: clips => clips.map((c, i) => `${i + 1}. ${PodcastModel.stamp(c.in)}–${PodcastModel.stamp(c.out)} (${Math.round(c.out - c.in)}s) ${c.label}`).join('\n'),
  /** the compiled show notes. o = { series: 'Show · S1E4' } */
  showNotes(P, pd, chapters, o = {}) {
    const parts = [P.title]; const n = pd.notes;
    if (o.series) parts.push(o.series);
    parts.push('='.repeat(40), '');
    if (n.summary) parts.push(n.summary, '');
    if (PodcastModel.isVideo(pd) && n.watch) parts.push(`Watch the full episode: ${n.watch}`, '');
    if (chapters && chapters.length) { parts.push('TIMESTAMPS / CHAPTERS:', '-'.repeat(25)); chapters.forEach(c => parts.push(`${PodcastModel.stamp(c.sec)} - ${c.title}`)); parts.push(''); }
    if (pd.guests.length) { parts.push('FEATURED GUESTS:', '-'.repeat(25)); pd.guests.forEach(g => { parts.push(`• ${g.name}${g.title ? ' (' + g.title + ')' : ''}`); if (g.plugs) parts.push(`  Links: ${g.plugs.replace(/\n/g, ' · ')}`); }); parts.push(''); }
    if (pd.sponsors.length) { parts.push('SPONSOR DISCOUNTS & OFFERS:', '-'.repeat(25)); pd.sponsors.forEach(s => parts.push(`• ${s.name}:${s.url ? ' ' + s.url : ''}${s.code ? ' (Use code: ' + s.code + ')' : ''}`)); parts.push(''); }
    if (n.links) parts.push('RESOURCES & LINKS MENTIONED:', '-'.repeat(25), n.links, '');
    if (PodcastModel.isVideo(pd) && n.tags) parts.push(`Tags: ${n.tags}`, '');
    return parts.join('\n');
  },
  /** the rundown as text for hosts and crew */
  rundownText(P, pd) {
    const free = PodcastModel.isFree(pd), vid = PodcastModel.isVideo(pd), lines = [`${P.title.toUpperCase()} — ${free ? 'TOPICS' : 'EPISODE RUNDOWN'}`, '='.repeat(40)];
    lines.push(`${PodcastModel.formatLabel(pd.format)} · ${PodcastModel.mediumLabel(pd.medium)} · ~${Math.round(PodcastModel.runLength(pd))} min`, '');
    if (vid && pd.video.cameras.length) lines.push('CAMERAS: ' + pd.video.cameras.map(c => `${c.name} ${c.shot}`).join(' · '), '');
    const point = s => (s.bullets || '').split('\n').filter(Boolean).forEach(b => lines.push(`   • ${b.replace(/^[•\-*]\s*/, '')}`));
    const extra = s => { if (s.cues) lines.push(`   AUDIO CUE: ${s.cues}`); if (vid && s.cam) lines.push(`   CAMERA: ${s.cam}`); if (vid && s.gfx) lines.push(`   ON SCREEN: ${s.gfx.replace(/\n/g, ' · ')}`); };
    if (free) PodcastModel.byPriority(pd).forEach(g => { if (!g.items.length) return; lines.push(g.label.toUpperCase()); g.items.forEach(s => { lines.push(` ☐ ${s.title} (~${s.dur} min)`); extra(s); point(s); }); lines.push(''); });
    else { let t = 0; pd.rundown.forEach((s, i) => { const cut = s.status === 'Cut'; lines.push(`[${PodcastModel.stamp(t * 60)}] #${i + 1}: ${s.title.toUpperCase()} (${s.dur} min)${cut ? ' [CUT]' : ''}`); extra(s); point(s); lines.push(''); if (!cut) t += PodcastModel.dur(s.dur); }); }
    return lines.join('\n');
  },
  rundownCsv(pd) {
    const vid = PodcastModel.isVideo(pd), free = PodcastModel.isFree(pd), rows = [['Segment #', 'Start Time', 'Target (min)', 'Title', 'Talking Points', 'Audio Cues', 'Status', ...(free ? ['Priority'] : []), ...(vid ? ['Camera', 'On screen'] : [])]];
    let t = 0;
    pd.rundown.forEach((s, i) => { rows.push([i + 1, PodcastModel.stamp(t * 60), s.dur, s.title, (s.bullets || '').replace(/\n/g, ' | '), s.cues || '', s.status, ...(free ? [s.priority || 'Nice'] : []), ...(vid ? [s.cam || '', (s.gfx || '').replace(/\n/g, ' | ')] : [])]); if (s.status !== 'Cut') t += PodcastModel.dur(s.dur); });
    return rows;
  },
  guestsDigest(pd) {
    const lines = ['GUEST INTERVIEW PREPARATION', '='.repeat(35), ''];
    pd.guests.forEach(g => {
      lines.push(`GUEST: ${g.name} (${g.pronouns || 'N/A'})`);
      if (g.title) lines.push(`TITLE: ${g.title}`); if (g.link) lines.push(`RECORDING LINK: ${g.link}`); if (g.bio) lines.push(`BIO: ${g.bio}`);
      if (PodcastModel.isVideo(pd) && g.onCamera) lines.push(`ON CAMERA: ${g.onCamera}`);
      if (g.nogo) lines.push(`⚠️ DO NOT DISCUSS: ${g.nogo}`);
      lines.push('QUESTIONS:'); (g.questions || '').split('\n').filter(Boolean).forEach(q => lines.push(`  ${q}`)); lines.push('');
    });
    return lines.join('\n');
  },
  sponsorsText(pd) {
    const lines = ['EPISODE SPONSOR READS', '='.repeat(30), ''];
    pd.sponsors.forEach(s => {
      lines.push(`SPONSOR: ${s.name} (${s.slot} - ${s.duration})`);
      if (s.code) lines.push(`CODE: ${s.code}`); if (s.url) lines.push(`URL: ${s.url}`);
      if (PodcastModel.isVideo(pd) && s.onScreen) lines.push(`ON SCREEN: ${s.onScreen}`);
      if (s.points) lines.push(`MANDATORY POINTS:\n${s.points}`); if (s.copy) lines.push(`SCRIPT:\n${s.copy}`);
      lines.push('\n----------------------------------------\n');
    });
    return lines.join('\n');
  },
};
