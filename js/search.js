'use strict';
/* ===================================================================
   Ctrl+K — find and jump to anything in the project
   =================================================================== */
function goto(view) { const hash = `#/p/${Store.P.id}/${view}`; if (location.hash === hash) Router.refresh(); else location.hash = hash; }

function searchIndex(P) {
  const items = [], scenes = getScenes(P);
  scenes.forEach(s => items.push({ kind: 'Scene', ic: 'pen', title: `${s.num}. ${s.label}`, sub: s.synopsis, go: () => { UI.scene = s.id; goto('script'); } }));
  allCharNames(P).forEach(c => items.push({ kind: 'Character', ic: 'user', title: c, sub: 'in the script', go: () => { UI.peopleTab = 'cast'; goto('people'); } }));
  P.people.forEach(p => items.push({ kind: p.type === 'cast' ? 'Cast' : 'Crew', ic: 'users', title: p.name || p.character || '(unnamed)', sub: p.type === 'cast' ? p.character : [p.role, p.dept].filter(Boolean).join(' · '), go: () => { UI.peopleTab = p.type; UI.openPerson = p.id; goto('people'); } }));
  P.casting.roles.forEach(r => items.push({ kind: 'Role', ic: 'star', title: r.name || '(role)', sub: roleState(r).label, go: () => { UI.peopleTab = 'casting'; UI.castRole = r.id; goto('people'); } }));
  P.props.forEach(x => items.push({ kind: 'Prop', ic: 'box', title: x.name || '(unnamed)', sub: `${x.category} · ${x.status}`, hid: (x.aliases || []).join(' '), go: () => { UI.itemTab = 'props'; UI.openItem = { kind: 'props', id: x.id }; goto('props'); } }));
  P.wardrobe.forEach(x => items.push({ kind: 'Wardrobe', ic: 'shirt', title: x.name || '(unnamed)', sub: `${itemAllChars(x).join(', ')} · ${x.status}`, hid: (x.aliases || []).join(' '), go: () => { UI.itemTab = 'wardrobe'; UI.openItem = { kind: 'wardrobe', id: x.id }; goto('props'); } }));
  P.tasks.forEach(t => items.push({ kind: 'Task', ic: 'tasks', title: t.title, sub: `${(TASK_COLS.find(c => c[0] === t.status) || [0, t.status])[1]}${t.due ? ' · due ' + t.due : ''}`, go: () => { UI.openTask = t.id; goto('tasks'); } }));
  P.locations.forEach(l => items.push({ kind: 'Location', ic: 'pin', title: l.name || '(unnamed)', sub: l.address, go: () => goto('locations') }));
  P.days.forEach((d, i) => items.push({ kind: 'Shoot day', ic: 'calendar', title: `Day ${i + 1}${d.date ? ' — ' + fmtDateShort(d.date) : ''}`, sub: `${d.sceneIds.length} scenes`, go: () => { UI.callDay = d.id; goto('callsheet/' + d.id); } }));
  P.tags.forEach(t => { if (['props', 'wardrobe', 'makeup', 'vehicles', 'setdress'].includes(t.cat)) { const sc = scenes.find(s => s.id === t.sceneId); items.push({ kind: 'Tag', ic: 'tag', title: t.text, sub: `${CATMAP[t.cat].label}${sc ? ' · Sc ' + sc.num : ''}`, go: () => { UI.scene = t.sceneId; UI.bdMode = 'scene'; goto('breakdown'); } }); } });
  [['overview', 'Overview', 'layout'], ['script', 'Script', 'pen'], ['cards', 'Corkboard', 'cards'], ['breakdown', 'Breakdown', 'tag'], ['shots', 'Shot list', 'camera'], ['board', 'Storyboard', 'image'], ['lookbook', 'Lookbook', 'palette'], ['props', 'Props & wardrobe', 'shirt'], ['people', 'Cast, crew & casting', 'users'],
    ['schedule', 'Schedule', 'calendar'], ['callsheet', 'Call sheets', 'clipboard'], ['locations', 'Locations', 'pin'], ['budget', 'Budget', 'dollar'], ['tasks', 'Tasks', 'tasks'], ['reports', 'Reports', 'chart'], ['pitch', 'Pitch deck', 'deck'], ['stage', 'Blocking & cues', 'stage'], ['takes', 'Script supervisor', 'list']]
    .forEach(([v, l, ic]) => items.push({ kind: 'Go to', ic, title: l, sub: '', go: () => goto(v) }));
  return items;
}

function openSearch() {
  const P = Store.P; if (!P) return; if ($('.searchbox')) return;
  const index = searchIndex(P); let results = [], sel = 0;
  const list = h('div', { class: 'sr-list' });
  const input = h('input', { class: 'inp sr-in', placeholder: 'Search scenes, people, props, wardrobe, tasks, locations…', autocomplete: 'off', 'aria-label': 'Search the project' });
  const rank = q => {
    q = q.toLowerCase().trim(); if (!q) return index.filter(i => i.kind === 'Go to').slice(0, 8);
    const words = q.split(/\s+/);
    return index.map(i => { const hay = (i.title + ' ' + (i.sub || '') + ' ' + i.kind + ' ' + (i.hid || '')).toLowerCase(), t = i.title.toLowerCase(); if (!words.every(w => hay.includes(w) || hay.includes(singularKey(w)))) return null;
      return { i, s: (t === q ? 100 : t.startsWith(q) ? 60 : t.includes(q) ? 30 : 5) + (i.kind === 'Go to' ? -4 : 0) }; }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.i);
  };
  function draw() {
    list.innerHTML = ''; results = rank(input.value); sel = Math.min(sel, Math.max(0, results.length - 1));
    if (!results.length) list.append(h('div', { class: 'muted', style: { padding: '18px', textAlign: 'center' } }, 'Nothing found.'));
    results.forEach((r, n) => list.append(h('div', { class: 'sr-row' + (n === sel ? ' on' : ''), onmousemove: () => { sel = n; mark(); }, onclick: () => pick(n) },
      icon(r.ic, 16), h('div', { class: 'sr-t' }, h('b', {}, r.title), r.sub ? h('span', { class: 'small muted' }, r.sub) : null), h('span', { class: 'pill' }, r.kind))));
  }
  const mark = () => { [...list.children].forEach((c, n) => c.classList.toggle('on', n === sel)); const el = list.children[sel]; el && el.scrollIntoView({ block: 'nearest' }); };
  function pick(n) { const r = results[n]; if (!r) return; dlg.close(); r.go(); }
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  });
  const dlg = modal({ title: 'Search', body: h('div', { class: 'searchbox' }, input, list), buttons: [] });
  draw(); setTimeout(() => input.focus(), 30);
}
