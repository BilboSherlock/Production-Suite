'use strict';
/* ===================================================================
   Search (Ctrl+K) — MODEL. Everything in a project that can be found,
   and ranking it against what was typed. Each entry says where it
   leads: { view, ui } — the section to open and the remembered screen
   state that picks the thing there (the scene, the person, the prop…).
   Pure: no DOM, no Store. See js/mvvm.js.
   =================================================================== */

const SearchModel = (() => {
  /** the sections offered as "Go to" */
  const GO_TO = [['overview', 'Overview', 'layout'], ['script', 'Script', 'pen'], ['cards', 'Corkboard', 'cards'], ['breakdown', 'Breakdown', 'tag'], ['shots', 'Shot list', 'camera'], ['board', 'Storyboard', 'image'], ['lookbook', 'Lookbook', 'palette'], ['props', 'Props & wardrobe', 'shirt'], ['people', 'Cast, crew & casting', 'users'],
    ['schedule', 'Schedule', 'calendar'], ['callsheet', 'Call sheets', 'clipboard'], ['locations', 'Locations', 'pin'], ['budget', 'Budget', 'dollar'], ['tasks', 'Tasks', 'tasks'], ['reports', 'Reports', 'chart'], ['pitch', 'Pitch deck', 'deck'], ['stage', 'Blocking & cues', 'stage'], ['takes', 'Script supervisor', 'list']];
  /** breakdown tags worth finding (the things you have to get) */
  const TAG_CATS = ['props', 'wardrobe', 'makeup', 'vehicles', 'setdress'];
  const MAX = 40, EMPTY = 8;

  /**
   * Everything findable → [{ kind, ic, title, sub, hid?, to: { view, ui } }]
   * fx: scenes(P);  chars(P) → character names;  date('2026-03-01') → 'Mar 1';  catLabel(cat) → 'Props'
   */
  function index(P, fx) {
    const items = [], scenes = fx.scenes(P), add = (kind, ic, title, sub, view, ui = {}, hid) => items.push(Object.assign({ kind, ic, title, sub, to: { view, ui } }, hid != null ? { hid } : {}));
    scenes.forEach(s => add('Scene', 'pen', `${s.num}. ${s.label}`, s.synopsis, 'script', { scene: s.id }));
    fx.chars(P).forEach(c => add('Character', 'user', c, 'in the script', 'people', { peopleTab: 'cast' }));
    (P.people || []).forEach(p => add(p.type === 'cast' ? 'Cast' : 'Crew', 'users', p.name || p.character || '(unnamed)', p.type === 'cast' ? p.character : [p.role, p.dept].filter(Boolean).join(' · '), 'people', { peopleTab: p.type, openPerson: p.id }));
    ((P.casting && P.casting.roles) || []).forEach(r => add('Role', 'star', r.name || '(role)', CastingModel.state(r).label, 'people', { peopleTab: 'casting', castRole: r.id }));
    (P.props || []).forEach(x => add('Prop', 'box', x.name || '(unnamed)', `${x.category} · ${x.status}`, 'props', { itemTab: 'props', openItem: { kind: 'props', id: x.id } }, (x.aliases || []).join(' ')));
    (P.wardrobe || []).forEach(x => add('Wardrobe', 'shirt', x.name || '(unnamed)', `${ItemsModel.allChars(x).join(', ')} · ${x.status}`, 'props', { itemTab: 'wardrobe', openItem: { kind: 'wardrobe', id: x.id } }, (x.aliases || []).join(' ')));
    (P.tasks || []).forEach(t => add('Task', 'tasks', t.title, `${(TaskModel.COLS.find(c => c[0] === t.status) || [0, t.status])[1]}${t.due ? ' · due ' + t.due : ''}`, 'tasks', { openTask: t.id }));
    (P.locations || []).forEach(l => add('Location', 'pin', l.name || '(unnamed)', l.address, 'locations'));
    (P.days || []).forEach((d, i) => add('Shoot day', 'calendar', `Day ${i + 1}${d.date ? ' — ' + fx.date(d.date) : ''}`, `${d.sceneIds.length} scenes`, 'callsheet/' + d.id, { callDay: d.id }));
    (P.tags || []).forEach(t => { if (!TAG_CATS.includes(t.cat)) return; const sc = scenes.find(s => s.id === t.sceneId); add('Tag', 'tag', t.text, `${fx.catLabel(t.cat)}${sc ? ' · Sc ' + sc.num : ''}`, 'breakdown', { scene: t.sceneId, bdMode: 'scene' }); });
    GO_TO.forEach(([v, l, ic]) => add('Go to', ic, l, '', v));
    return items;
  }

  /**
   * The best matches for what was typed (every word must appear, singular or plural): an exact title
   * first, then titles that start with it, then titles that contain it; "Go to" entries rank a little lower.
   * Nothing typed → the first "Go to" entries. key(word) → its singular form (BreakdownModel.key).
   */
  function rank(items, q, key = w => w) {
    q = String(q || '').toLowerCase().trim(); if (!q) return items.filter(i => i.kind === 'Go to').slice(0, EMPTY);
    const words = q.split(/\s+/);
    return items.map(i => {
      const hay = (i.title + ' ' + (i.sub || '') + ' ' + i.kind + ' ' + (i.hid || '')).toLowerCase(), t = i.title.toLowerCase();
      if (!words.every(w => hay.includes(w) || hay.includes(key(w)))) return null;
      return { i, s: (t === q ? 100 : t.startsWith(q) ? 60 : t.includes(q) ? 30 : 5) + (i.kind === 'Go to' ? -4 : 0) };
    }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, MAX).map(x => x.i);
  }

  return { GO_TO, TAG_CATS, index, rank };
})();
