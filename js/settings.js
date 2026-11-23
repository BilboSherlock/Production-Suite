'use strict';
/* ===================================================================
   Settings — which sections (tabs) are shown, with presets per
   production type. Global default, optionally overridden per project.
   =================================================================== */
const FEATURE_DEFS = [   // key, label, group, icon
  ['overview', 'Overview', 'Project', 'layout'], ['brief', 'Shoot brief', 'Project', 'file'], ['bible', 'Series bible', 'Project', 'layers'],
  ['script', 'Script', 'Write', 'pen'], ['rundown', 'Episode rundown', 'Write', 'cue'], ['setups', 'Setups & looks', 'Write', 'grid'], ['cards', 'Corkboard', 'Write', 'cards'],
  ['breakdown', 'Breakdown', 'Prepare', 'tag'], ['shots', 'Shot list', 'Prepare', 'camera'], ['photoshots', 'Photo shot list', 'Prepare', 'camera'], ['board', 'Storyboard', 'Prepare', 'image'],
  ['lookbook', 'Lookbook', 'Prepare', 'palette'], ['props', 'Props & wardrobe', 'Prepare', 'shirt'], ['pitch', 'Pitch deck', 'Prepare', 'deck'],
  ['live', 'Live dashboard', 'Produce', 'play'], ['schedule', 'Schedule', 'Produce', 'calendar'], ['runofshow', 'Run of show', 'Produce', 'cue'], ['callsheet', 'Call sheets', 'Produce', 'clipboard'], ['people', 'Cast, crew & casting', 'Produce', 'users'],
  ['locations', 'Locations', 'Produce', 'pin'], ['gear', 'Gear & rentals', 'Produce', 'box'], ['compliance', 'Releases & permits', 'Produce', 'lock'], ['budget', 'Budget', 'Produce', 'dollar'],
  ['tasks', 'Tasks', 'Produce', 'tasks'], ['reports', 'Reports', 'Produce', 'chart'],
  ['stage', 'Blocking & cues', 'Direct', 'stage'], ['takes', 'Script supervisor', 'Direct', 'list'], ['selects', 'Selects & approvals', 'Direct', 'star'],
];
const FEATURE_KEYS = FEATURE_DEFS.map(f => f[0]);
const NAV_GROUPS = ['Project', 'Write', 'Prepare', 'Produce', 'Direct'];
const PRESETS = {
  all: { label: 'Everything', desc: 'Every section.', on: FEATURE_KEYS },
  film: { label: 'Film & TV', desc: 'Script, breakdown, shots, schedule, call sheets, script supervisor.',
    on: ['overview', 'bible', 'script', 'cards', 'breakdown', 'shots', 'board', 'lookbook', 'props', 'pitch', 'live', 'schedule', 'callsheet', 'people', 'locations', 'budget', 'tasks', 'reports', 'stage', 'takes'] },
  stage: { label: 'Stage', desc: 'Script, blocking, cues, rehearsals, calling script.',
    on: ['overview', 'script', 'cards', 'breakdown', 'lookbook', 'props', 'pitch', 'live', 'schedule', 'callsheet', 'people', 'locations', 'budget', 'tasks', 'reports', 'stage'] },
  av: { label: 'Video / AV', desc: 'Two-column scripts, shots, storyboards, schedule.',
    on: ['overview', 'script', 'cards', 'breakdown', 'shots', 'board', 'lookbook', 'props', 'live', 'schedule', 'callsheet', 'people', 'locations', 'budget', 'tasks', 'reports'] },
  podcast: { label: 'Podcast & Audio', desc: 'Episode rundown & clock, guest prep, sponsor reads, audio drama scripts, sound design.',
    on: ['overview', 'rundown', 'script', 'cards', 'bible', 'breakdown', 'props', 'pitch', 'live', 'schedule', 'callsheet', 'people', 'locations', 'gear', 'budget', 'tasks', 'reports'] },
  photo: { label: 'Photography', desc: 'Brief, setups, photo shot list, run of show, gear, releases, selects.',
    on: ['overview', 'brief', 'setups', 'breakdown', 'photoshots', 'lookbook', 'props', 'live', 'schedule', 'runofshow', 'callsheet', 'people', 'locations', 'gear', 'compliance', 'selects', 'stage', 'budget', 'tasks', 'reports'] },
  writing: { label: 'Writing only', desc: 'Just the script, corkboard and cast.', on: ['overview', 'script', 'cards', 'people', 'pitch'] },
};
const Prefs = { preset: 'all', on: [...FEATURE_KEYS], region: 'US', fold: { preset: 'balanced', hubs: null } };
async function loadPrefs() {
  let v = null;
  try { v = await DB.getMeta('prefs'); } catch (e) { }
  if (!v) { try { v = JSON.parse(localStorage.getItem('sb-prefs') || 'null'); } catch (e) { } }
  if (v && Array.isArray(v.on)) { Prefs.preset = v.preset || 'custom'; Prefs.on = v.on; } if (v && v.region) Prefs.region = v.region; if (v && v.fold) Prefs.fold = v.fold;
}
async function savePrefs() {
  try { await DB.setMeta('prefs', { preset: Prefs.preset, on: Prefs.on, region: Prefs.region, fold: Prefs.fold }); } catch (e) { }
  try { localStorage.setItem('sb-prefs', JSON.stringify({ preset: Prefs.preset, on: Prefs.on, region: Prefs.region, fold: Prefs.fold })); } catch (e) { }
}
/* the set of enabled sections for a project (its own choice, or the global one) */
/* sections that make no sense for a format are left out of its menu */
const FORMAT_PHOTO = ['brief', 'setups', 'photoshots', 'runofshow', 'selects'];
const FORMAT_NA = {
  screenplay: [...FORMAT_PHOTO, 'rundown'], av: [...FORMAT_PHOTO, 'takes', 'rundown'], stage: [...FORMAT_PHOTO, 'shots', 'takes', 'bible', 'rundown'],
  photo: ['script', 'rundown', 'cards', 'shots', 'takes', 'bible'],
  podcast: [...FORMAT_PHOTO, 'shots', 'takes', 'stage', 'board'],
};
function featureSet(P) {
  const nav = P && P.settings && P.settings.nav, on = new Set(nav && Array.isArray(nav.on) ? nav.on : Prefs.on);
  on.add('overview');
  if (P) { (FORMAT_NA[P.mode] || []).forEach(k => on.delete(k)); if (P.mode === 'photo') on.add('setups'); if (P.mode === 'podcast') { on.add('rundown'); on.add('gear'); } }   // required entries
  return on;
}
const featureOn = (P, key) => featureSet(P).has(key);
const NAV_LABELS = {
  photo: { setups: 'Setups & looks', stage: 'Set & lighting', breakdown: 'Breakdown', props: 'Props & wardrobe', people: 'Talent & crew', lookbook: 'Mood boards' },
  podcast: { rundown: 'Episode rundown', script: 'Audio script', people: 'Voice cast & guests', props: 'Sound assets & Foley', gear: 'Studio gear & mics', schedule: 'Recording schedule', callsheet: 'Recording call sheet' },
};
const featureLabel = (P, key) => (P && NAV_LABELS[P.mode] && NAV_LABELS[P.mode][key]) || (FEATURE_DEFS.find(f => f[0] === key) || [0, key])[1];
/* ---------------------------------------------------------------
   Tab folding — related sections share one menu entry with sub-tabs
   --------------------------------------------------------------- */
const HUBS = [
  { id: 'project', label: 'Project', icon: 'layout', members: ['overview', 'brief', 'bible', 'pitch'] },
  { id: 'write', label: 'Write', icon: 'pen', members: ['script', 'rundown', 'setups', 'cards'] },
  { id: 'visual', label: 'Visualize', icon: 'image', members: ['board', 'shots', 'photoshots', 'lookbook', 'stage'] },
  { id: 'elements', label: 'Breakdown', icon: 'tag', members: ['breakdown', 'props', 'locations', 'gear'] },
  { id: 'plan', label: 'Schedule', icon: 'calendar', members: ['schedule', 'callsheet', 'runofshow'] },
  { id: 'people', label: 'People', icon: 'users', members: ['people', 'compliance'] },
  { id: 'money', label: 'Budget & tasks', icon: 'dollar', members: ['budget', 'tasks', 'reports'] },
  { id: 'set', label: 'On set', icon: 'play', members: ['live', 'takes', 'selects'] },
];
const FOLD_PRESETS = { none: { label: 'Off', desc: 'Every section has its own menu entry.', hubs: [] }, balanced: { label: 'Balanced', desc: 'Fold the closely related ones: visuals, breakdown, schedule, people, on set.', hubs: ['visual', 'elements', 'plan', 'people', 'set'] },
  compact: { label: 'Compact', desc: 'Fold everything into a handful of sections.', hubs: HUBS.map(h => h.id) } };
/* the format changes which hub a section belongs to and what the hub is called */
const HUB_MOVE = { stage: { stage: 'set' } };
const HUB_LABEL = {
  stage: { visual: 'Design', set: 'Rehearsal & show', elements: 'Breakdown', plan: 'Rehearsals & calls', write: 'Script' },
  photo: { write: 'Setups', visual: 'Look & lighting', elements: 'Looks & kit', plan: 'Schedule', set: 'Shoot day', people: 'Talent & crew' },
  av: { visual: 'Visualize', set: 'Production' },
  podcast: { write: 'Script & rundown', elements: 'Audio assets', plan: 'Recording schedule', people: 'Cast & guests' },
};
const hubOfKey = (P, key) => { const mv = P && HUB_MOVE[P.mode] && HUB_MOVE[P.mode][key]; return mv || (HUBS.find(h => h.members.includes(key)) || {}).id; };
const hubLabel = (P, hub) => (P && HUB_LABEL[P.mode] && HUB_LABEL[P.mode][hub.id]) || hub.label;
/* which hubs are folded for this project: its own choice, else the global one */
function foldedHubs(P) {
  const f = (P && P.settings && P.settings.fold) || Prefs.fold || { preset: 'balanced' };
  return new Set(Array.isArray(f.hubs) ? f.hubs : (FOLD_PRESETS[f.preset] || FOLD_PRESETS.balanced).hubs);
}
/* members of a hub for a project, in menu order, limited to enabled sections */
function hubMembers(P, hub) {
  const on = featureSet(P), order = FEATURE_DEFS.map(f => f[0]);
  const keys = [...new Set([...hub.members, ...Object.keys((HUB_MOVE[P && P.mode] || {})).filter(k => HUB_MOVE[P.mode][k] === hub.id)])].filter(k => hubOfKey(P, k) === hub.id && on.has(k));
  return keys.sort((a, b) => hub.members.indexOf(a) - hub.members.indexOf(b) || order.indexOf(a) - order.indexOf(b));
}
function foldedInfo(P, key) { const hub = HUBS.find(h => h.id === hubOfKey(P, key)); if (!hub || !foldedHubs(P).has(hub.id)) return null; const m = hubMembers(P, hub); return m.length > 1 ? { hub, members: m } : null; }
function buildNav(P, o = {}) {
  const on = featureSet(P), groups = NAV_GROUPS.map(g => ({ label: g, items: FEATURE_DEFS.filter(f => f[2] === g && on.has(f[0])).map(f => [f[0], featureLabel(P, f[0]), f[3]]) })).filter(g => g.items.length);
  if (o.flat) return groups;
  const done = new Set();
  groups.forEach(g => { g.items = g.items.map(it => { const fi = foldedInfo(P, it[0]); if (!fi) return it; if (done.has(fi.hub.id)) return null; done.add(fi.hub.id); return ['hub:' + fi.hub.id, hubLabel(P, fi.hub), fi.hub.icon, fi]; }).filter(Boolean); });
  /* a hub sits where its first member sits; drop the groups it emptied */
  return groups.filter(g => g.items.length);
}
/* the sub-tab bar shown above a folded section */
function hubTabs(P, view) {
  const fi = foldedInfo(P, view); if (!fi) return null; UI.hubLast = UI.hubLast || {}; UI.hubLast[fi.hub.id] = view;
  return h('div', { class: 'hub-tabs', role: 'tablist', 'aria-label': hubLabel(P, fi.hub) }, h('span', { class: 'hub-name' }, icon(fi.hub.icon, 15), hubLabel(P, fi.hub)), fi.members.map(k => h('a', { class: 'hub-tab' + (k === view ? ' on' : ''), role: 'tab', href: `#/p/${P.id}/${k}` }, featureLabel(P, k))));
}
function hubHref(P, item) { const fi = item[3]; UI.hubLast = UI.hubLast || {}; const last = UI.hubLast[fi.hub.id]; return `#/p/${P.id}/${fi.members.includes(last) ? last : fi.members[0]}`; }
const presetForMode = mode => mode === 'photo' ? 'photo' : '';

function openSettings(P) {
  const scoped = !!P;                       // opened from inside a project: can apply to just this project
  let scope = scoped && P.settings.nav ? 'project' : 'global';
  let cur = new Set(scope === 'project' ? P.settings.nav.on : Prefs.on), curPreset = scope === 'project' ? P.settings.nav.preset : Prefs.preset;
  const foldSrc = () => (scope === 'project' && P.settings.fold) ? P.settings.fold : Prefs.fold; let foldSet = new Set(foldedHubs(scope === 'project' ? P : null)), foldPreset = foldSrc().preset || 'balanced';
  const matchFold = () => { const k = Object.keys(FOLD_PRESETS).find(p => FOLD_PRESETS[p].hubs.length === foldSet.size && FOLD_PRESETS[p].hubs.every(x => foldSet.has(x))); foldPreset = k || 'custom'; };
  const box = h('div');
  const matchPreset = () => { const k = Object.keys(PRESETS).find(p => PRESETS[p].on.length === cur.size && PRESETS[p].on.every(x => cur.has(x))); curPreset = k || 'custom'; };
  function draw() {
    box.replaceChildren(...[
      scoped ? h('div', { class: 'row', style: { marginBottom: '14px' } }, h('span', { class: 'small muted' }, 'Apply to'), h('div', { class: 'seg' }, [['project', 'This project only'], ['global', 'All projects']].map(([k, l]) => h('button', { class: scope === k ? 'on' : '', onclick: () => { scope = k; cur = new Set(k === 'project' ? (P.settings.nav ? P.settings.nav.on : Prefs.on) : Prefs.on); matchPreset(); foldSet = new Set(foldedHubs(k === 'project' ? P : null)); matchFold(); draw(); } }, l)))) : h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Choose which sections appear in every project’s side menu. Hidden sections keep their data and can be turned back on at any time.'),
      scoped ? null : h('div', { class: 'row', style: { marginBottom: '14px' } }, h('span', { class: 'small muted' }, 'Default standards for new projects'), h('div', { class: 'seg' }, Object.entries(REGIONS).map(([k, r]) => h('button', { class: Prefs.region === k ? 'on' : '', onclick: e => { Prefs.region = k; [...e.currentTarget.parentNode.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, `${r.short} · ${r.label}`)))),
      h('div', { class: 'preset-grid' }, Object.entries(PRESETS).map(([k, p]) => h('button', { class: 'preset' + (curPreset === k ? ' on' : ''), onclick: () => { cur = new Set(p.on); curPreset = k; draw(); } }, h('b', {}, p.label), h('span', { class: 'small muted' }, p.desc)))),
      h('div', { class: 'feat-cols' }, NAV_GROUPS.map(g => h('div', { class: 'feat-col' }, h('h4', {}, g), FEATURE_DEFS.filter(f => f[2] === g).map(f => h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: cur.has(f[0]), disabled: f[0] === 'overview', onchange: e => { e.target.checked ? cur.add(f[0]) : cur.delete(f[0]); matchPreset(); draw(); } }), icon(f[3], 14), f[1]))))),
      curPreset === 'custom' ? h('p', { class: 'small muted' }, 'Custom selection.') : null,
      scoped ? null : h('div', { class: 'row', style: { margin: '6px 0 14px', flexWrap: 'wrap', gap: '10px' } }, h('span', { class: 'small muted' }, 'Touch mode (bigger targets for tablets)'), h('div', { class: 'seg' }, [['auto', 'Automatic'], ['on', 'On'], ['off', 'Off']].map(([k, l]) => h('button', { class: Device.mode() === k ? 'on' : '', onclick: e => { Device.setMode(k); [...e.currentTarget.parentNode.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, l))), h('button', { class: 'btn sm', onclick: () => tabletHelp() }, 'Tablet setup & install…')),
      h('h3', { style: { fontSize: '15px', margin: '22px 0 4px' } }, 'Fold related tabs together'),
      h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Folded sections share one menu entry with sub-tabs across the top — for example Storyboard, Shot list, Lookbook and Blocking under “Visualize”. What goes together adapts to the project’s format.'),
      h('div', { class: 'preset-grid' }, Object.entries(FOLD_PRESETS).map(([k, p]) => h('button', { class: 'preset' + (foldPreset === k ? ' on' : ''), onclick: () => { foldSet = new Set(p.hubs); foldPreset = k; draw(); } }, h('b', {}, p.label), h('span', { class: 'small muted' }, p.desc)))),
      h('div', { class: 'feat-cols' }, HUBS.map(hb => { const mem = hb.members.filter(k => !scoped || !P || hubOfKey(P, k) === hb.id).filter(k => FEATURE_DEFS.some(f => f[0] === k)); return h('label', { class: 'fold-opt' }, h('input', { type: 'checkbox', checked: foldSet.has(hb.id), onchange: e => { e.target.checked ? foldSet.add(hb.id) : foldSet.delete(hb.id); matchFold(); draw(); } }), h('span', {}, h('b', {}, scoped && P ? hubLabel(P, hb) : hb.label), h('span', { class: 'small muted', style: { display: 'block' } }, mem.map(k => featureLabel(scoped ? P : null, k)).join(' · ')))); })),
      scoped && scope === 'project' && P.settings.nav ? h('button', { class: 'btn sm ghost', onclick: () => { P.settings.nav = null; P.settings.fold = null; Store.touch(); m.close(); Router.refresh(); } }, 'Use the global setting for this project') : null].filter(Boolean));
  }
  const m = modal({ title: 'Settings — sections & features', wide: true, body: box, buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => {
    cur.add('overview');
    if (scoped && scope === 'project') { P.settings.nav = { preset: curPreset, on: [...cur] }; P.settings.fold = { preset: foldPreset, hubs: [...foldSet] }; Store.touch(); }
    else { Prefs.on = [...cur]; Prefs.preset = curPreset; Prefs.fold = { preset: foldPreset, hubs: [...foldSet] }; await savePrefs(); if (scoped && (P.settings.nav || P.settings.fold)) { P.settings.nav = null; P.settings.fold = null; Store.touch(); } }
    Router.refresh(); toast('Settings saved');
  } }] });
  matchPreset(); matchFold(); draw();
}

/* how to run StudioBindahh on an Android tablet (for example the Lenovo Idea Tab Plus) */
function tabletHelp() {
  const origin = location.origin, secure = Device.secure(), local = /^(localhost|127\.)/.test(location.hostname);
  const step = (n, t, d) => h('li', { style: { margin: '8px 0' } }, h('b', {}, t), h('div', { class: 'small muted' }, d));
  modal({ title: 'Tablet setup — Android (Lenovo Idea Tab Plus and similar)', wide: true, body: h('div', {},
    h('p', { style: { marginTop: 0 } }, 'StudioBindahh runs in Chrome on the tablet, with a touch layout, pen support and offline use. Your projects live on the tablet itself.'),
    h('div', { class: 'card', style: { padding: '12px 14px', marginBottom: '12px' } }, h('b', {}, 'Status on this device'), h('div', { class: 'small', style: { marginTop: '4px' } }, [`Touch mode: ${Device.touchOn() ? 'on' : 'off'}`, `Installed as an app: ${Device.installed() ? 'yes' : 'no'}`, `Offline support: ${secure ? 'available' : 'needs a secure address (see step 3)'}`, `Storage: ${navigator.storage && navigator.storage.persist ? 'persistent storage requested' : 'standard'}`].join(' · ')),
      Device.installEvent ? h('button', { class: 'btn primary', style: { marginTop: '8px' }, onclick: async () => { if (await Device.install()) { } } }, icon('download', 15), 'Install StudioBindahh on this device') : null),
    h('ol', { style: { paddingLeft: '20px', margin: 0 } },
      step(1, 'Open the app', local ? 'On your PC, run “Start StudioBindahh.bat”. On the tablet (same Wi-Fi) open Chrome and go to the address the PC prints — for example http://192.168.x.x:5173.' : `You are using ${origin}. Keep this address for the tablet.`),
      step(2, 'Use it right away', 'Everything works in the browser: tap to select, long-press for menus, two fingers to pan and zoom the storyboard, and the pen for drawing. Joining a live session on the PC (Share → Join a session) works over the same Wi-Fi.'),
      step(3, 'Make it a real offline app (recommended)', 'Chrome only installs apps and caches them for offline use on secure addresses. A plain http://192.168… address is not secure, so on the tablet open chrome://flags, search “Insecure origins treated as secure”, add ' + origin + ' to the list, enable it and relaunch Chrome. Then open the app again and choose Chrome menu → “Install app” (or the Install button above).'),
      step(4, 'Back up your work', 'Projects are stored in Chrome on the tablet. Use Backup → Download all projects now and then, and keep the tablet’s Chrome data safe. Folder sync is for desktop Chrome and Edge only.'),
      step(5, 'Printing & PDFs', 'Print, then choose “Save as PDF” in Android’s print dialog. Importing a script PDF needs the PDF reader once online; after that it works offline.')),
    h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'Tip: add the keyboard cover or a stylus (such as the Lenovo Tab Pen) for the best writing and storyboarding experience — both are fully supported.')),
    buttons: [{ label: 'Close', primary: true }] });
}
