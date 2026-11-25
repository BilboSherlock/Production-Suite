'use strict';
/* ===================================================================
   Settings — MODEL. Which sections (tabs) exist, the presets per kind
   of production, which sections a format leaves out, folding related
   sections into one menu entry (hubs), building the side menu, and the
   settings dialog's draft and how it is saved. The global choice lives
   in Prefs (passed in as `prefs`); a project may override it in
   P.settings.nav / P.settings.fold. Pure: no DOM, no Store. See js/mvvm.js.
   =================================================================== */

const SettingsModel = (() => {
  /** [key, label, menu group, icon]. region.js renames a few labels in place to suit the region's terms. */
  const FEATURE_DEFS = [
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
  /** sections that make no sense for a format are left out of its menu */
  const FORMAT_PHOTO = ['brief', 'setups', 'photoshots', 'runofshow', 'selects'];
  const FORMAT_NA = {
    screenplay: [...FORMAT_PHOTO, 'rundown'], av: [...FORMAT_PHOTO, 'takes', 'rundown'], stage: [...FORMAT_PHOTO, 'shots', 'takes', 'bible', 'rundown'],
    photo: ['script', 'rundown', 'cards', 'shots', 'takes', 'bible'],
    podcast: [...FORMAT_PHOTO, 'shots', 'takes', 'stage', 'board'],
  };
  /** what a section is called in a format (region.js adjusts one of these too) */
  const NAV_LABELS = {
    photo: { setups: 'Setups & looks', stage: 'Set & lighting', breakdown: 'Breakdown', props: 'Props & wardrobe', people: 'Talent & crew', lookbook: 'Mood boards' },
    podcast: { rundown: 'Episode rundown', script: 'Audio script', people: 'Voice cast & guests', props: 'Sound assets & Foley', gear: 'Studio gear & mics', schedule: 'Recording schedule', callsheet: 'Recording call sheet' },
  };
  /* ---------- tab folding: related sections share one menu entry with sub-tabs ---------- */
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
  /** the format changes which hub a section belongs to and what the hub is called */
  const HUB_MOVE = { stage: { stage: 'set' } };
  const HUB_LABEL = {
    stage: { visual: 'Design', set: 'Rehearsal & show', elements: 'Breakdown', plan: 'Rehearsals & calls', write: 'Script' },
    photo: { write: 'Setups', visual: 'Look & lighting', elements: 'Looks & kit', plan: 'Schedule', set: 'Shoot day', people: 'Talent & crew' },
    av: { visual: 'Visualize', set: 'Production' },
    podcast: { write: 'Script & rundown', elements: 'Audio assets', plan: 'Recording schedule', people: 'Cast & guests' },
  };

  /** the enabled sections for a project (its own choice, else the global one), less what its format leaves out */
  function featureSet(P, prefs) {
    const nav = P && P.settings && P.settings.nav, on = new Set(nav && Array.isArray(nav.on) ? nav.on : prefs.on);
    on.add('overview');
    if (P) { (FORMAT_NA[P.mode] || []).forEach(k => on.delete(k)); if (P.mode === 'photo') on.add('setups'); if (P.mode === 'podcast') { on.add('rundown'); on.add('gear'); } }   // required entries
    return on;
  }
  const featureLabel = (P, key) => (P && NAV_LABELS[P.mode] && NAV_LABELS[P.mode][key]) || (FEATURE_DEFS.find(f => f[0] === key) || [0, key])[1];
  const hubOfKey = (P, key) => { const mv = P && HUB_MOVE[P.mode] && HUB_MOVE[P.mode][key]; return mv || (HUBS.find(h => h.members.includes(key)) || {}).id; };
  const hubLabel = (P, hub) => (P && HUB_LABEL[P.mode] && HUB_LABEL[P.mode][hub.id]) || hub.label;
  /** which hubs are folded for this project: its own choice, else the global one */
  function foldedHubs(P, prefs) {
    const f = (P && P.settings && P.settings.fold) || prefs.fold || { preset: 'balanced' };
    return new Set(Array.isArray(f.hubs) ? f.hubs : (FOLD_PRESETS[f.preset] || FOLD_PRESETS.balanced).hubs);
  }
  /** members of a hub for a project, in menu order, limited to enabled sections */
  function hubMembers(P, hub, prefs) {
    const on = featureSet(P, prefs), mv = HUB_MOVE[P && P.mode] || {};
    const keys = [...new Set([...hub.members, ...Object.keys(mv).filter(k => mv[k] === hub.id)])].filter(k => hubOfKey(P, k) === hub.id && on.has(k));
    return keys.sort((a, b) => hub.members.indexOf(a) - hub.members.indexOf(b) || FEATURE_KEYS.indexOf(a) - FEATURE_KEYS.indexOf(b));
  }
  /** a section's folded hub → { hub, members } (when folded and it has more than one member), else null */
  function foldedInfo(P, key, prefs) {
    const hub = HUBS.find(h => h.id === hubOfKey(P, key)); if (!hub || !foldedHubs(P, prefs).has(hub.id)) return null;
    const m = hubMembers(P, hub, prefs); return m.length > 1 ? { hub, members: m } : null;
  }
  /**
   * The side menu → [{ label: group, items: [[key, label, icon]] }]; a folded hub is one item
   * ['hub:<id>', label, icon, { hub, members }] where its first member sits. o.flat: no folding.
   */
  function buildNav(P, prefs, o = {}) {
    const on = featureSet(P, prefs), groups = NAV_GROUPS.map(g => ({ label: g, items: FEATURE_DEFS.filter(f => f[2] === g && on.has(f[0])).map(f => [f[0], featureLabel(P, f[0]), f[3]]) })).filter(g => g.items.length);
    if (o.flat) return groups;
    const done = new Set();
    groups.forEach(g => { g.items = g.items.map(it => { const fi = foldedInfo(P, it[0], prefs); if (!fi) return it; if (done.has(fi.hub.id)) return null; done.add(fi.hub.id); return ['hub:' + fi.hub.id, hubLabel(P, fi.hub), fi.hub.icon, fi]; }).filter(Boolean); });
    return groups.filter(g => g.items.length);
  }
  const presetForMode = mode => mode === 'photo' ? 'photo' : '';

  /* ---------- the settings dialog ---------- */
  const sameSet = (list, set) => list.length === set.size && list.every(x => set.has(x));
  /** the preset a selection matches, else 'custom' */
  const matchPreset = on => Object.keys(PRESETS).find(p => sameSet(PRESETS[p].on, on)) || 'custom';
  const matchFold = hubs => Object.keys(FOLD_PRESETS).find(p => sameSet(FOLD_PRESETS[p].hubs, hubs)) || 'custom';
  /**
   * The dialog's working copy for 'project' (P's own choice, else the global one) or 'global'
   * → { scope, on: Set, preset, fold: Set, foldPreset }
   */
  function draft(P, prefs, scope) {
    const own = scope === 'project' && P && P.settings.nav, on = new Set(own ? P.settings.nav.on : prefs.on), fold = foldedHubs(scope === 'project' ? P : null, prefs);
    return { scope, on, preset: matchPreset(on), fold, foldPreset: matchFold(fold) };
  }
  /** the fold choices in the dialog → [{ hub, label, members: 'A · B' }] (P: in a project, as its format arranges them) */
  const foldChoices = P => HUBS.map(hb => ({ hub: hb, label: P ? hubLabel(P, hb) : hb.label,
    members: hb.members.filter(k => !P || hubOfKey(P, k) === hb.id).filter(k => FEATURE_KEYS.includes(k)).map(k => featureLabel(P, k)).join(' · ') }));
  /**
   * Save a draft → { project: P changed, prefs: prefs changed (to be stored) }.
   * 'project' gives P its own choice; 'global' changes prefs and drops P's own choice (if any).
   */
  function apply(D, P, prefs) {
    const on = [...new Set([...D.on, 'overview'])], fold = { preset: D.foldPreset, hubs: [...D.fold] };
    if (P && D.scope === 'project') { P.settings.nav = { preset: D.preset, on }; P.settings.fold = fold; return { project: true, prefs: false }; }
    prefs.on = on; prefs.preset = D.preset; prefs.fold = fold;
    if (P && (P.settings.nav || P.settings.fold)) { P.settings.nav = null; P.settings.fold = null; return { project: true, prefs: true }; }
    return { project: false, prefs: true };
  }
  /** a project goes back to the global choice → whether it had its own */
  function useGlobal(P) { const had = !!(P.settings.nav || P.settings.fold); P.settings.nav = null; P.settings.fold = null; return had; }

  return { FEATURE_DEFS, FEATURE_KEYS, NAV_GROUPS, PRESETS, FORMAT_PHOTO, FORMAT_NA, NAV_LABELS, HUBS, FOLD_PRESETS, HUB_MOVE, HUB_LABEL,
    featureSet, featureLabel, hubOfKey, hubLabel, foldedHubs, hubMembers, foldedInfo, buildNav, presetForMode,
    matchPreset, matchFold, draft, foldChoices, apply, useGlobal };
})();
