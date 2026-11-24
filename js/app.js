'use strict';
/* ===================================================================
   App shell: router, dashboard, theme, shortcuts, project management
   =================================================================== */
const NAV = [
  { label: 'Project', items: [['overview', 'Overview', 'layout'], ['bible', 'Series bible', 'layers']] },
  { label: 'Write', items: [['script', 'Script', 'pen'], ['cards', 'Corkboard', 'cards']] },
  { label: 'Prepare', items: [['breakdown', 'Breakdown', 'tag'], ['shots', 'Shot list', 'camera'], ['board', 'Storyboard', 'image'], ['lookbook', 'Lookbook', 'palette'], ['props', 'Props & wardrobe', 'shirt'], ['pitch', 'Pitch deck', 'deck']] },
  { label: 'Produce', items: [['schedule', 'Schedule', 'calendar'], ['callsheet', 'Call sheets', 'clipboard'], ['people', 'Cast, crew & casting', 'users'], ['locations', 'Locations', 'pin'], ['budget', 'Budget', 'dollar'], ['tasks', 'Tasks', 'tasks'], ['reports', 'Reports', 'chart']] },
  { label: 'Direct', items: [['stage', 'Blocking & cues', 'stage'], ['takes', 'Script supervisor', 'list']] },
];
const MODE_LABEL = { screenplay: 'Screenplay', stage: 'Stage play', av: 'AV script', photo: 'Photo shoot', podcast: 'Podcast' };
const effectiveTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function toggleTheme() {
  const t = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; try { localStorage.setItem('sb-theme', t); } catch (e) { } syncThemeColor();
  const b = $('#themeBtn'); if (b) b.replaceChildren(icon(t === 'dark' ? 'sun' : 'moon'));
}
function syncThemeColor() { const m = document.getElementById('themeColor'); if (m) m.content = effectiveTheme() === 'dark' ? '#171b22' : '#ffffff'; }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);
const themeBtn = () => h('button', { class: 'icon-btn', id: 'themeBtn', title: 'Switch light / dark theme', 'aria-label': 'Toggle theme', onclick: toggleTheme }, icon(effectiveTheme() === 'dark' ? 'sun' : 'moon'));

function showShortcuts() {
  const row = (k, d) => [h('span', {}, ...k.map((x, i) => [i ? ' + ' : '', h('span', { class: 'kbd' }, x)])), h('span', {}, d)];
  modal({ title: 'Keyboard shortcuts', body: h('div', { class: 'help-grid' },
    h('h4', {}, 'Writing'), ...row(['Enter'], 'New line (type follows the flow of the script)'), ...row(['Tab'], 'Cycle element type forward (Shift+Tab: back)'),
    ...row(['Ctrl', '1…8'], 'Set element type directly'), ...row(['Ctrl', 'Enter'], 'Insert a blank line below'), ...row(['↑ ↓ ← →'], 'Move between elements at the edges'),
    ...row(['Ctrl', 'Z'], 'Undo (works in every section)'), ...row(['Ctrl', 'Y'], 'Redo'), ...row(['Ctrl', 'F'], 'Find & replace'), ...row(['Ctrl', 'S'], 'Save now (autosave is always on)'),
    ...row(['Ctrl', 'B / I / U'], 'Bold / italic / underline the selection'), ...row(['Ctrl', 'D'], 'Dual dialogue on a Character line'), ...row(['Ctrl', 'Alt', 'M'], 'Add a note to the current line'),
    h('h4', {}, 'Auto-formatting'), ...row(['INT.  EXT.'], 'Typing these converts an Action line to a Scene Heading'), ...row(['('], 'Starting a line with ( makes a Parenthetical'),
    ...row(['…TO:'], 'A line ending in TO: becomes a Transition'), ...row(['Tab / Enter'], 'Accept a suggested character, location or time'),
    h('h4', {}, 'Elsewhere'), ...row(['Ctrl', 'K'], 'Search everything in the project'), ...row(['Esc'], 'Close dialogs and presentations'), ...row(['Space'], 'Play / pause storyboard presentation'), ...row(['← →'], 'Previous / next storyboard frame')),
    buttons: [{ label: 'Close', primary: true }] });
}

/* ---------------- router ---------------- */
/* what the shell (rail, top bar, hub tabs) shows; when it is unchanged a refresh only redraws the content */
const shellSig = (P, view) => JSON.stringify([P.id, P.title, P.mode, P.settings.region, view, window.Collab && Collab.sess ? 1 : 0,
  buildNav(P).map(g => [g.label, g.items.map(it => [it[0], it[1], it[2], it[3] ? it[3].members.includes(view) : 0])])]);
/* scroll positions inside the content, so a redraw doesn't jump back to the top */
function scrollState(root) {
  const out = [[root, root.scrollTop, root.scrollLeft]];
  root.querySelectorAll('*').forEach(el => { if (el.scrollTop || el.scrollLeft) out.push([el.className && typeof el.className === 'string' ? el.className : el.tagName, el.scrollTop, el.scrollLeft]); });
  return out;
}
function restoreScroll(root, st) {
  const apply = () => { const used = new Set(); st.forEach(([k, t, l]) => {
    const el = k === root ? root : [...root.querySelectorAll('*')].find(x => !used.has(x) && (typeof x.className === 'string' && x.className ? x.className : x.tagName) === k);
    if (el) { used.add(el); el.scrollTop = t; el.scrollLeft = l; } }); };
  apply(); requestAnimationFrame(apply);
}
const Router = {
  cleanup: null, shell: null,
  /* redraw the current section in place: same project and menu → only the content is rebuilt, scroll kept */
  refresh() {
    const sh = Router.shell, P = Store.P;
    if (!sh || !P || P.id !== sh.pid || !document.body.contains(sh.main) || shellSig(P, sh.view) !== sh.sig) return Router.render();
    if (Router.cleanup) { try { Router.cleanup(); } catch (e) { console.error(e); } Router.cleanup = null; }
    closeMenu(); $$('.suggest, .palette').forEach(x => x.remove());
    const keep = scrollState(sh.main);
    applyTerms(P);
    const oldHub = $('#content > .hub-tabs'), hub = hubTabs(P, sh.view); if (oldHub) oldHub.replaceWith(hub || '');
    mountView(sh.main, sh.view, sh.arg);
    restoreScroll(sh.main, keep);
    if (window.Collab) Collab.decorate();
  },
  async render() {
    if (Router.cleanup) { try { Router.cleanup(); } catch (e) { console.error(e); } Router.cleanup = null; }
    closeMenu(); $$('.suggest, .palette').forEach(x => x.remove()); Router.shell = null;
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (window.Collab) Collab.flush();
    if (Store.P) await Store.flush();
    if (parts[0] !== 'p') Device.awake('view', false);
    if (parts[0] === 'budgets') { Store.P = null; renderBudgets(); document.title = 'Budgets — StudioBindahh'; return; }
    if (parts[0] === 'contacts') { Store.P = null; renderContacts(); document.title = 'Contacts — StudioBindahh'; return; }
    if (parts[0] === 'p' && Store.projects[parts[1]]) {
      Store.P = Store.projects[parts[1]]; applyTerms(Store.P);
      if (parts[2] === 'wardrobe') { UI.itemTab = 'wardrobe'; parts[2] = 'props'; }
      if (parts[2] === 'casting') { UI.peopleTab = 'casting'; parts[2] = 'people'; }
      if (parts[2] === 'dpr') { UI.repTab = 'dpr'; if (parts[3]) UI.dprDay = parts[3]; parts[2] = 'reports'; parts[3] = ''; }
      if (Store.P.mode === 'photo' && (parts[2] === 'script' || !parts[2] || parts[2] === 'cards')) parts[2] = 'setups';
      if (Store.P.mode === 'podcast' && !parts[2]) parts[2] = 'rundown';
      const view = Views[parts[2]] ? parts[2] : (Store.P.mode === 'photo' ? 'setups' : Store.P.mode === 'podcast' ? 'rundown' : 'script');
      renderShell(view, parts[3]);
    } else { Store.P = null; applyTerms(null); renderHome(); }
    document.title = (Store.P ? Store.P.title + ' — ' : '') + 'StudioBindahh'; Collab.setView(); Collab.decorate();
  },
};
/* navigating (including Android's back gesture) closes any open dialog or presentation first */
const closeOverlays = () => [...document.querySelectorAll('body > .overlay, body > .present')].reverse().forEach(o => o._close ? o._close() : o.remove());
addEventListener('hashchange', () => { closeOverlays(); Router.render(); });

function renderShell(view, arg) {
  const P = Store.P, app = $('#app'); app.innerHTML = ''; app.style.cssText = '';
  Device.awake('view', view === 'live');   // the on-set dashboard keeps the tablet's screen on
  const histOn = view !== 'script';
  if (histOn && (!Hist.active || Hist.pid !== P.id)) Hist.reset(P);
  Hist.active = histOn; Hist.pid = P.id;
  const hUndo = ibtn('undo', 'Undo (Ctrl+Z)', () => Hist.step(-1)), hRedo = ibtn('redo', 'Redo (Ctrl+Y)', () => Hist.step(1));
  Hist.onchange = () => { hUndo.disabled = !Hist.can(-1); hRedo.disabled = !Hist.can(1); hUndo.style.opacity = hUndo.disabled ? .35 : 1; hRedo.style.opacity = hRedo.disabled ? .35 : 1; };
  const rail = h('nav', { id: 'rail', 'aria-label': 'Project sections' },
    h('a', { class: 'logo', href: '#/', title: 'All projects' }, h('span', { class: 'mark' }, icon('film', 18)), h('span', { class: 't' }, 'StudioBindahh')));
  buildNav(P).forEach(g => {
    rail.append(h('div', { class: 'nav-label' }, g.label));
    g.items.forEach(it => { const [k, label, ic, fi] = it, inHub = fi && fi.members.includes(view); rail.append(h('a', { class: 'nav-a' + ((fi ? inHub : k === view) ? ' on' : ''), href: fi ? hubHref(P, it) : `#/p/${P.id}/${k}`, title: fi ? `${label}: ${fi.members.map(m => featureLabel(P, m)).join(', ')}` : label }, icon(ic, 19), h('span', { class: 't' }, label))); });
  });
  rail.append(h('div', { class: 'grow' }), h('div', { class: 'nav-sep' }),
    h('a', { class: 'nav-a', href: '#', onclick: e => { e.preventDefault(); openSettings(P); } }, icon('wand', 19), h('span', { class: 't' }, 'Customize tabs')),
    h('a', { class: 'nav-a', href: '#/' }, icon('home', 19), h('span', { class: 't' }, 'All projects')),
    h('a', { class: 'nav-a', href: '#', onclick: e => { e.preventDefault(); showShortcuts(); } }, icon('keyboard', 19), h('span', { class: 't' }, 'Shortcuts')),
    /* on a tablet the rail is icons only; this shows the section names when you want them */
    h('a', { class: 'nav-a rail-toggle', href: '#', title: 'Show or hide section names', onclick: e => { e.preventDefault(); const w = document.documentElement.dataset.rail === 'wide' ? '' : 'wide'; if (w) document.documentElement.dataset.rail = w; else delete document.documentElement.dataset.rail; try { localStorage.setItem('sb-rail', w); } catch (x) { } } }, icon('right', 19), h('span', { class: 't' }, 'Hide names')));
  const title = h('input', { class: 'ptitle', value: P.title, 'aria-label': 'Project title', oninput: e => { P.title = e.target.value; Store.touch(); document.title = P.title + ' — StudioBindahh'; } });
  const syncBtn = h('button', { class: 'icon-btn', id: 'syncBtn', title: 'Folder sync', 'aria-label': 'Folder sync', onclick: () => Sync.panel() }, icon('cloud'), h('i', { id: 'syncDot', class: 'syncdot', style: { position: 'absolute', margin: '10px 0 0 -6px' } }));
  const top = h('header', { id: 'topbar' }, title, h('span', { class: 'pill accent' }, MODE_LABEL[P.mode] || 'Screenplay'), regionChip(P), h('span', { class: 'grow' }),
    ibtn('search', 'Search the project (Ctrl+K)', () => openSearch()),
    histOn ? [hUndo, hRedo] : null,
    h('span', { id: 'savestate' }, h('i'), 'All changes saved'),
    syncBtn, Collab.button(),
    h('button', { class: 'btn sm', title: 'Backup, print & clean up', 'aria-label': 'Backup', onclick: e => { const o = orphanReport(P); menu(e.currentTarget, [
      { label: 'Download this project (.json)', icon: 'download', onClick: () => { download(slug(P.title) + '.studiobindahh.json', JSON.stringify(P), 'application/json'); toast('Backup downloaded'); } },
      { label: 'Download ALL projects (.json)', icon: 'download', onClick: backupAll },
      { label: 'Print script', icon: 'print', onClick: () => printNode(scriptPrintNode(P)) },
      { sep: true },
      { label: o.total ? `Clean up unused data (${o.total} items)` : 'No unused data to clean up', icon: 'trash', onClick: async () => {
        if (!o.total) return toast('Nothing to clean up.');
        if (await confirmBox(`Remove ${o.total} item${o.total > 1 ? 's' : ''} (${o.shots} shots, ${o.tags} tags, ${o.boards} storyboard frames, ${o.days} schedule entries, ${o.notes} scene notes, ${o.props} prop links, ${o.tasks} task links) that belong to scenes no longer in the script?`, 'Remove')) { purgeOrphans(P); toast('Cleaned up'); Router.refresh(); }
      } },
    ]); } }, icon('download', 15), 'Backup'),
    themeBtn());
  Hist.onchange();
  const main = h('main', { id: 'main' });
  app.append(rail, h('div', { id: 'content' }, ...[top, hubTabs(P, view), main].filter(Boolean)));
  Sync.paint();
  Router.shell = { pid: P.id, view, arg, main, sig: shellSig(P, view) };
  mountView(main, view, arg);
}
function mountView(main, view, arg) {
  const root = h('div', { class: 'view', style: { height: '100%' } });
  main.replaceChildren(root);
  try { Router.cleanup = Views[view](root, arg) || null; }
  catch (e) { console.error(e); root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'Something went wrong in this view'), h('p', {}, String(e.message || e))))); }
}

/* ---------------- dashboard ---------------- */
function renderHome() {
  const app = $('#app'); app.innerHTML = ''; app.style.display = 'block'; app.style.overflow = 'auto';
  const list = Object.values(Store.projects).sort((a, b) => b.updated - a.updated);
  const grid = h('div', { class: 'projects' });
  grid.append(h('button', { class: 'card pcard newcard', onclick: newProjectModal }, h('span', {}, icon('plus', 30)), h('span', {}, 'New project')));
  list.forEach(p => {
    const st = scriptStats(p);
    grid.append(h('div', { class: 'card pcard ' + p.mode, tabindex: 0, role: 'link', 'aria-label': `Open ${p.title || 'Untitled'}`, onclick: () => location.hash = `#/p/${p.id}`, onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) location.hash = `#/p/${p.id}`; } },
      h('div', { class: 'cover' }, p.title || 'Untitled'),
      h('div', { class: 'body' }, h('div', { class: 'row wrap' }, h('span', { class: 'pill accent' }, MODE_LABEL[p.mode] || 'Screenplay'), p.series ? h('span', { class: 'pill' }, `${p.series.name} · ${epCode(p.series)}`) : null, h('span', { class: 'small muted' }, `${st.scenes} ${({ av: 'segments', podcast: 'segments', photo: 'setups' })[p.mode] || 'scenes'} · ~${st.pages} pp`)),
        h('div', { class: 'small muted' }, 'Edited ' + new Date(p.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + (p.meta.author ? ' · ' + p.meta.author : '')),
        h('div', { class: 'acts' }, h('button', { class: 'btn sm ghost', onclick: e => { e.stopPropagation(); duplicateProject(p); } }, icon('copy', 14), 'Duplicate'),
          h('button', { class: 'btn sm ghost', onclick: e => { e.stopPropagation(); download(slug(p.title) + '.studiobindahh.json', JSON.stringify(p), 'application/json'); } }, icon('download', 14), 'Backup'),
          h('span', { class: 'grow' }), h('button', { class: 'icon-btn danger', title: 'Delete project', onclick: async e => { e.stopPropagation(); if (await confirmBox(`Delete “${p.title}” and everything in it? This can't be undone — consider downloading a backup first.`)) { await Store.remove(p.id); renderHome(); toast('Project deleted'); } } }, icon('trash', 16))))));
  });
  app.append(
    h('div', { class: 'home-top' }, h('span', { class: 'logo', style: { padding: 0 } }, h('span', { class: 'mark' }, icon('film', 18)), 'StudioBindahh'), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', id: 'syncBtn', onclick: () => Sync.panel() }, icon('cloud', 15), 'Folder sync', h('i', { id: 'syncDot', class: 'syncdot' })),
      h('button', { class: 'btn sm collab-btn' + (Collab.sess ? ' live' : ''), onclick: () => Collab.sess ? Collab.livePanel() : Collab.joinModal() }, icon('users', 15), Collab.sess ? 'Live session' : 'Join a session'),
      h('a', { class: 'btn sm', href: '#/budgets' }, icon('dollar', 15), 'Budgets'),
      h('a', { class: 'btn sm', href: '#/contacts' }, icon('users', 15), `Contacts${Contacts.list.length ? ' (' + Contacts.list.length + ')' : ''}`),
      h('button', { class: 'btn sm', onclick: () => openSettings(null) }, icon('wand', 15), 'Settings'),
      h('button', { class: 'btn sm', onclick: backupAll }, icon('download', 15), 'Back up all'),
      h('button', { class: 'btn sm', onclick: showShortcuts }, icon('keyboard', 15), 'Shortcuts'), themeBtn()),
    ...(location.protocol !== 'file:' ? [] : [h('div', { style: { background: 'var(--accent-soft)', color: 'var(--text)', padding: '10px 26px', fontSize: '14px', borderBottom: '1px solid var(--border)' } },
      h('b', {}, 'Heads up: '), 'you opened this from a file. Browsers keep file-based projects separate from the localhost version (Start StudioBindahh.bat). Always open it the same way — or use “Back up all” and Import to move projects between the two.')]),
    h('div', { class: 'hero' }, h('h1', {}, 'Write it. Plan it. Direct it.'),
      h('p', {}, 'One workspace for screenplays, stage plays, AV scripts and photo shoots — from the first draft or brief through breakdown, shot lists, scheduling, call sheets, gear, releases and selects. Everything is saved privately in this browser.'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: newProjectModal }, icon('plus', 16), 'New project'),
        h('button', { class: 'btn', onclick: importProjectModal }, icon('upload', 16), 'Import file'),
        h('button', { class: 'btn', onclick: () => createSample('screenplay') }, icon('film', 16), 'Try a sample screenplay'),
        h('button', { class: 'btn', onclick: () => createSample('stage') }, icon('stage', 16), 'Try a sample stage play'),
        h('button', { class: 'btn', onclick: () => createSample('av') }, icon('layout', 16), 'Try a sample AV script'),
        h('button', { class: 'btn', onclick: () => createSample('photo') }, icon('camera', 16), 'Try a sample photo shoot'),
        h('button', { class: 'btn', onclick: () => createSample('podcast') }, icon('cue', 16), 'Try a sample podcast'))),
    grid);
  if (!Store.persist) app.prepend(h('div', { style: { background: 'var(--warn)', color: '#000', padding: '8px 16px', fontSize: '14px' } }, 'Your browser is blocking local storage, so projects will be lost when you close this tab. Use the Backup button to save your work.'));
}

function newProjectModal() {
  const title = h('input', { class: 'inp', placeholder: 'Untitled project' });
  const radio = (v, t, d, on) => h('label', {}, h('input', { type: 'radio', name: 'mode', value: v, checked: on }), h('b', {}, t), h('span', { class: 'small muted' }, d));
  const regSel = h('select', { class: 'inp' }, Object.entries(REGIONS).map(([k, r]) => h('option', { value: k, selected: k === ((Prefs && Prefs.region) || 'US') }, `${r.short} — ${r.label} standards`)));
  const box = h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Title'), title), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Industry standards'), regSel),
    h('label', { class: 'lbl' }, 'Format'), h('div', { class: 'typepick' },
      radio('screenplay', 'Screenplay', 'Film & TV. Scene headings, action, dialogue, transitions, shots.', true),
      radio('stage', 'Stage play', 'Acts, scenes, centered dialogue, stage directions, light & sound cues.'),
      radio('av', 'Two-column AV script', 'Video on the left, audio on the right — commercials, corporate films, explainers, documentaries.'),
      radio('podcast', 'Podcast & Audio', 'Episode rundown & clock, guest prep, sponsor reads, audio drama scripts, SFX and show notes.'),
      radio('photo', 'Photo shoot', 'Brief, setups & looks, shot list, run of show, gear, releases and selects — for editorial, campaign and large-scale commercial shoots.')));
  modal({ title: 'New project', body: box, buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: async () => {
    const mode = $('input[name=mode]:checked', box).value, p = blankProject(mode, title.value.trim() || 'Untitled project'); if (regSel.value !== p.settings.region) applyRegion(p, regSel.value);
    p.blocks = [{ id: uid(), type: 'scene', text: '' }, { id: uid(), type: DEFAULT_TYPE[mode], text: '' }];
    if (mode === 'photo') p.settings.nav = { preset: 'photo', on: PRESETS.photo.on };
    if (mode === 'podcast') p.settings.nav = { preset: 'podcast', on: PRESETS.podcast.on };
    await Store.add(p); location.hash = `#/p/${p.id}/${mode === 'podcast' ? 'rundown' : 'script'}`;
  } }] });
}
async function createAVSample() {
  const p = blankProject('av', 'Ride the City — 60s Explainer'), B = (t, x) => ({ id: uid(), type: t, text: x });
  p.blocks = [B('scene', 'SEGMENT 1 — THE HOOK'), B('video', 'Drone shot rising over a misty harbour at dawn.'), B('audio', 'NARRATOR: Every morning, thousands of us make the same trip.'), B('super', 'LOWER THIRD: Maya Ortiz, daily commuter'), B('sfx', 'MUSIC: low strings in, building.'),
    B('video', 'CU of a bicycle chain turning; dew on the spokes.'), B('audio', 'MAYA (V.O.): I used to dread it.'),
    B('scene', 'SEGMENT 2 — THE CHANGE'), B('video', 'Tracking shot: Maya rides past a line of stationary cars.'), B('audio', 'NARRATOR: Then the city built something different.'), B('video', 'Wide: a protected bike lane stretches along the river.'), B('audio', 'MAYA (V.O.): Twenty minutes, door to door. No traffic.'),
    B('scene', 'SEGMENT 3 — CALL TO ACTION'), B('super', 'CityBikes.example — Start riding today'), B('audio', 'NARRATOR: Find your route.')];
  p.meta.author = 'Studio Team'; p.meta.credit = 'Prepared for Harbour City Council'; await Store.add(p); location.hash = `#/p/${p.id}/script`;
}
async function createSample(mode) {
  if (mode === 'av') return createAVSample();
  if (mode === 'photo') return createPhotoSample();
  if (mode === 'podcast') return createPodcastSample();
  const res = parseFountain(mode === 'stage' ? SAMPLE_STAGE : SAMPLE_SCREENPLAY, mode), p = blankProject(mode, res.meta.title || 'Sample');
  p.blocks = res.blocks; p.meta.author = res.meta.author || ''; p.meta.credit = res.meta.credit || 'Written by'; p.meta.draft = res.meta['draft date'] || '';
  const actors = ['Helen Okafor', 'Sam Whitfield', 'Marcus Bell', 'Priya Nair', 'Dana Ruiz'];
  [...allCharacters(p).keys()].forEach((c, i) => p.people.push({ id: uid(), type: 'cast', name: actors[i % actors.length], character: c, dept: '', role: '', phone: '', email: '', agent: '', notes: '' }));
  p.people.push({ id: uid(), type: 'crew', name: 'Jo Lindqvist', dept: mode === 'stage' ? 'Stage Management' : 'Direction', role: mode === 'stage' ? 'Stage Manager' : '1st AD', phone: '555-0101', email: '', agent: '', notes: '' },
    { id: uid(), type: 'crew', name: 'Tariq Haddad', dept: mode === 'stage' ? 'Lighting' : 'Camera', role: mode === 'stage' ? 'Lighting Designer' : 'Director of Photography', phone: '555-0102', email: '', agent: '', notes: '' });
  const sc = getScenes(p);
  if (mode === 'screenplay') {
    sc.forEach((s, i) => {
      p.shots.push(newShot(s.id, { size: 'WS', angle: 'Eye level', move: 'Static', lens: '24mm', equip: 'Tripod', desc: 'Master — establish the space and who is in it' }));
      p.shots.push(newShot(s.id, { size: i % 2 ? 'MCU' : 'CU', angle: 'Eye level', move: i % 2 ? 'Handheld' : 'Push in', lens: '50mm', equip: i % 2 ? 'Handheld rig' : 'Dolly', desc: 'Coverage on the key character reacting' }));
    });
    p.sceneMeta[sc[0].id] = { synopsis: 'Theo arrives at a failing cinema, asking for a film that nobody asks for.', dirNotes: 'Warm, nostalgic, a little eerie. Let silence do the work.' };
    p.sceneMeta[sc[1].id] = { synopsis: 'Margot reveals the reel — and that it belongs to Theo\'s grandfather.' };
    p.sceneMeta[sc[2].id] = { synopsis: 'A mysterious man watches the projection booth.' };
    sc.forEach(s => { sceneCast(p, s).forEach(c => p.tags.push({ id: uid(), sceneId: s.id, cat: 'cast', text: c })); });
    p.tags.push({ id: uid(), sceneId: sc[0].id, cat: 'props', text: 'mop' }, { id: uid(), sceneId: sc[0].id, cat: 'props', text: 'camera bag' }, { id: uid(), sceneId: sc[1].id, cat: 'props', text: 'FILM CAN' }, { id: uid(), sceneId: sc[2].id, cat: 'vehicles', text: 'SEDAN' });
    p.locations.push({ id: uid(), name: 'RIVERSIDE CINEMA', address: '14 Quay Street', contact: 'Margot K.', phone: '555-0140', permit: 'Approved', cost: '$800', notes: 'Booth is very hot — plan fan breaks.', photo: '' });
    const d1 = newDay(p, new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)); d1.sceneIds = sc.slice(0, 2).map(s => s.id);
    const d2 = newDay(p, addDays(d1.date, 1, true)); d2.sceneIds = sc.slice(2).map(s => s.id); p.days.push(d1, d2);
    [['Camera & grip', 'Camera package (2 days)', 2, 'Day', 650], ['Lighting', 'Lighting & grip truck', 2, 'Day', 480], ['Locations & travel', 'Riverside Cinema fee', 2, 'Day', 800], ['Cast', 'Lead actors', 2, 'Day', 600], ['Post-production', 'Edit & colour', 1, 'Flat', 2500]].forEach(([cat, desc, qty, unit, rate]) => p.budget.push({ id: uid(), cat, desc, qty, unit, rate }));
  } else {
    p.cues.push({ id: uid(), cue: 'LX 1', type: 'LX', sceneId: sc[0].id, at: 'Top of show', desc: 'Lights up slowly on the waiting room', note: 'Standby 30 sec before house is closed' });
    const plan = { id: uid(), name: 'Waiting room — opening', sceneId: sc[0].id, items: [], frames: [{ id: uid(), name: 'Opening picture', notes: 'Dorothy upright and still. Frank pacing a path across the carpet.', pos: {} }, { id: uid(), name: 'Frank stops', notes: 'On “It\'s been two hours.” Frank crosses downstage left.', pos: {} }], cur: 0, snap: true };
    const mk = (kind, label, color, a, b) => { const it = { id: uid(), kind, label, color }; plan.items.push(it); plan.frames[0].pos[it.id] = a; plan.frames[1].pos[it.id] = b || a; };
    [[250, 330], [450, 330], [650, 330], [850, 330]].forEach((pt, i) => mk('chair', '', '#8a8f98', { x: pt[0], y: pt[1], r: 0 }));
    mk('table', 'Coffee table', '#8a6d3b', { x: 500, y: 210, r: 0 }); mk('door', 'Street', '#8a6d3b', { x: 920, y: 500, r: 90 }); mk('door', 'Doctor', '#8a6d3b', { x: 150, y: 40, r: 0 });
    mk('actor', 'Dorothy', '#d6409f', { x: 450, y: 380, r: 0 }); mk('actor', 'Frank', '#2468d8', { x: 700, y: 260, r: 0 }, { x: 330, y: 470, r: 0 });
    p.stage.plans.push(plan);
  }
  // profile details, props, casting and tasks, so every section has something to explore
  p.people.filter(x => x.type === 'cast').forEach((x, i) => Object.assign(x, { pronouns: ['she/her', 'he/him', 'he/him', 'they/them', 'she/her'][i % 5], union: mode === 'stage' ? 'Equity' : 'SAG-AFTRA', rate: '350', rateUnit: 'Day', emName: 'Sam Doe', emRelation: 'Partner', emPhone: '555-0199', dietary: i === 0 ? 'Vegetarian' : '', docs: { contract: i < 2, eligibility: true, release: i < 1 } }));
  p.people.filter(x => x.type === 'crew').forEach(x => Object.assign(x, { rate: '450', rateUnit: 'Day', docs: { contract: true } }));
  const sc2 = getScenes(p), sid = i => (sc2[i] ? [sc2[i].id] : []);
  if (mode === 'screenplay') p.props.push(
    newProp('Reel 7 film can', { category: 'Hero prop', status: 'Acquired', source: 'Already owned', storage: 'Props truck, shelf A', qty: 2, cost: '40', desc: 'Battered 35mm steel can, label reads REEL 7 - DO NOT SCREEN. One hero, one duplicate.', sceneIds: sid(1) }),
    newProp('Mop', { category: 'Set dressing', status: 'Sourcing', source: 'Borrow', vendor: 'Riverside Cinema', sceneIds: sid(0) }),
    newProp('Camera bag', { category: 'Hand prop', status: 'Needed', source: 'Buy', cost: '85', sceneIds: sid(0) }),
    newProp('Black sedan', { category: 'Vehicle', status: 'Needed', source: 'Rent', vendor: 'City Car Hire', cost: '180', sceneIds: sid(2) }));
  else p.props.push(newProp('Four mismatched chairs', { category: 'Set dressing', qty: 4, status: 'Acquired', sceneIds: sc2.map(x => x.id) }), newProp('Stopped wall clock', { category: 'Hero prop', status: 'Prepped', desc: 'Stopped at 4:10.', sceneIds: sc2.map(x => x.id) }));
  p.casting.roles = [...allCharacters(p).keys()].slice(0, 3).map(c => { const r = newRole(c), per = p.people.find(x => x.type === 'cast' && normChar(x.character) === c); if (per) { const cd = newCandidate(); cd.name = per.name; cd.status = 'cast'; cd.rating = 5; r.candidates.push(cd); r.castId = cd.id; } return r; });
  if (mode === 'screenplay' && sc2.length > 1) {
    p.wardrobe.push(newWardrobe('Grey cardigan', { category: 'Top', characters: ['MARGOT'], look: 'Look 1 — the cinema', status: 'Acquired', source: 'Existing stock', qty: 2, size: 'M', care: 'Delicate wash; needs light ageing', sceneIds: sc2.slice(0, 2).map(x => x.id) }),
      newWardrobe('Soaked raincoat', { category: 'Outerwear', characters: ['THEO'], look: 'Look 1 — in the rain', status: 'Fitting', source: 'Buy', cost: '120', qty: 3, desc: 'Three identical coats: dry, wet and stunt.', sceneIds: sid(0) }),
      newWardrobe('Grey overcoat', { category: 'Outerwear', characters: ['MAN IN GREY COAT'], look: 'Look 1', status: 'Needed', source: 'Rent', sceneIds: sid(2) }));
    p.tags.push({ id: uid(), sceneId: sc2[0].id, cat: 'wardrobe', text: 'cardigan', who: ['MARGOT'] }, { id: uid(), sceneId: sc2[0].id, cat: 'wardrobe', text: 'raincoat', who: ['THEO'] });
  }
  const soon = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  p.tasks.push(Object.assign(newTask('Lock the main location', 'doing'), { dept: 'Production', priority: 'High', due: soon(2) }), Object.assign(newTask('Get insurance certificate', 'todo'), { dept: 'Production', due: soon(5) }), Object.assign(newTask('Source the hero prop', 'done'), { dept: 'Art' }), Object.assign(newTask('Cast the supporting roles', 'todo'), { dept: 'Direction', due: soon(-1) }));
  linkLegacyTags(p);
  await Store.add(p); location.hash = `#/p/${p.id}/script`;
}
async function duplicateProject(p) {
  const c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.title = p.title + ' (copy)'; c.created = c.updated = Date.now();
  if (c.series) c.series.ep = Math.max(0, ...episodesOf(c.series.id).filter(e => e.series.season === c.series.season).map(e => e.series.ep)) + 1;
  await Store.add(c); renderHome(); toast('Project duplicated');
}
function importProjectModal() {
  const info = h('p', { style: { marginTop: 0 }, class: 'muted' }, 'Choose a StudioBindahh backup (.json), or a script as a PDF, Fountain (.fountain, .txt), Highland (.highland) or Final Draft (.fdx).');
  const box = h('div', {}, info, h('label', { class: 'lbl' }, 'If importing a script, treat it as'), h('div', { class: 'typepick' },
    h('label', {}, h('input', { type: 'radio', name: 'imode', value: 'screenplay', checked: true }), h('b', {}, 'Screenplay')), h('label', {}, h('input', { type: 'radio', name: 'imode', value: 'stage' }), h('b', {}, 'Stage play'))));
  const m = modal({ title: 'Import', body: box, buttons: [{ label: 'Cancel' }, { label: 'Choose file…', primary: true, onClick: () => { const mode = $('input[name=imode]:checked', box).value; pickFile('.json,.fountain,.txt,.fdx,.md,.pdf,.highland,.zip').then(f => f && doImport(f, mode)); } }] });
}
async function doImport(f, mode) {
  if (/\.pdf$/i.test(f.name)) {
    await pdfImportFlow(f, { mode, apply: [{ label: 'Create project', run: async res => {
      const mt = res.meta || {}, p = blankProject(res.mode, mt.title || f.name.replace(/\.pdf$/i, ''));
      p.blocks = res.blocks; p.meta.author = mt.author || ''; p.meta.credit = mt.credit || 'Written by'; p.meta.source = mt.source || ''; p.meta.contact = mt.contact || ''; p.meta.draft = mt.draft || '';
      if (res.keepNumbers) p.settings.sceneNumLock = true;
      await Store.add(p); location.hash = `#/p/${p.id}/script`; toast(`Imported “${p.title}” — ${res.blocks.length} elements`);
    } }] });
    return;
  }
  try {
    const txt = await readScriptFile(f); let p;
    if (/\.json$/i.test(f.name)) { const j = JSON.parse(txt);
      if (j && Array.isArray(j.contacts)) { let n = 0; j.contacts.forEach(c => { if (c && c.name && !Contacts.list.some(x => x.id === c.id || (x.name === c.name && (x.email || '') === (c.email || '')))) { Contacts.list.push(c); n++; } }); await Contacts.save(); if (j.prefs && Array.isArray(j.prefs.on) && !Array.isArray(j.projects)) { } if (!Array.isArray(j.projects)) { toast(`Imported ${n} contact${n === 1 ? '' : 's'}`); renderHome(); return; } else toast(`Merged ${n} contact${n === 1 ? '' : 's'}`); }
      if (j && Array.isArray(j.projects)) { let n = 0; for (const x of j.projects) { if (!x || !Array.isArray(x.blocks)) continue; const q = migrate(x); if (Store.projects[q.id]) { q.id = uid(); q.title += ' (imported)'; } await Store.add(q); n++; } toast(`Restored ${n} project${n === 1 ? '' : 's'}`); renderHome(); return; }
      p = migrate(j); if (!Array.isArray(p.blocks)) throw new Error('Not a StudioBindahh project'); if (Store.projects[p.id]) { p.id = uid(); p.title += ' (imported)'; } }
    else {
      const res = /\.fdx$/i.test(f.name) ? parseFDX(txt) : parseFountain(txt, mode); if (!res.blocks.length) throw new Error('No script content found');
      p = blankProject(mode, res.meta.title || f.name.replace(/\.[^.]+$/, '')); p.blocks = res.blocks; p.meta.author = res.meta.author || res.meta.authors || ''; p.meta.credit = res.meta.credit || 'Written by'; p.meta.draft = res.meta['draft date'] || res.meta.date || ''; p.meta.contact = res.meta.contact || '';
    }
    await Store.add(p); location.hash = `#/p/${p.id}/script`; toast('Imported “' + p.title + '”');
  } catch (e) { toast('Import failed: ' + (e.message || e), true); }
}

function backupAll() {
  const all = Object.values(Store.projects); if (!all.length) return toast('There are no projects to back up yet.', true);
  download('studiobindahh-all-projects.json', JSON.stringify({ studiobindahh: 'bundle', version: 3, exported: Date.now(), projects: all, contacts: Contacts.list, prefs: { preset: Prefs.preset, on: Prefs.on } }), 'application/json');
  toast(`Backed up ${all.length} project${all.length === 1 ? '' : 's'}`);
}
/* Ctrl+K: search the whole project */
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && Store.P && !document.querySelector('.overlay')) { e.preventDefault(); openSearch(); } });
/* Ctrl+Z / Ctrl+Y outside the script editor */
document.addEventListener('keydown', e => {
  if (!Hist.active || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
  if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
  if (document.querySelector('.overlay')) return;
  e.preventDefault(); Hist.step(k === 'y' || e.shiftKey ? 1 : -1);
});

/* ---------------- boot ---------------- */
addEventListener('pagehide', () => Store.flush(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(true); });
(async function boot() {
  await Store.init(); await Contacts.load(); await loadPrefs(); applyTerms(null); Device.init();
  Router.render();
  Sync.init();
})();
