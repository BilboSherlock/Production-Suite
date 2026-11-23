'use strict';
/* ===================================================================
   Project overview — where everything stands, and what needs attention
   =================================================================== */
const DONE_ITEM = new Set(['Acquired', 'Prepped', 'On set', 'Returned', 'Cleaned / returned']);

Views.overview = function (root) {
  const P = Store.P, scenes = getScenes(P), st = scriptStats(P), today = new Date().toISOString().slice(0, 10);
  const link = v => `#/p/${P.id}/${v}`;
  const isPhoto = P.mode === 'photo', pd = P.photo, pShots = pd.shots, pDone = pShots.filter(s => ['Approved', 'Delivered'].includes(s.status)).length, relOpen = pd.releases.filter(r => ['Needed', 'Sent'].includes(r.status)).length, picks = pd.selects.filter(x => x.flag === 'pick').length;
  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
  const scheduled = new Set(P.days.flatMap(d => d.sceneIds)), shotsDone = P.shots.filter(s => s.done).length;
  const openRoles = P.casting.roles.filter(r => !r.castId).length, castRoles = P.casting.roles.length;
  const propsOk = P.props.filter(x => DONE_ITEM.has(x.status)).length, wardOk = P.wardrobe.filter(x => DONE_ITEM.has(x.status)).length;
  const tasksDone = P.tasks.filter(t => t.status === 'done').length, overdue = P.tasks.filter(taskOverdue);
  const fc = finCalc(P), budget = fc.total;
  const tile = (label, value, sub, progress, href, tone) => h('a', { class: 'tile', href: link(href) }, h('span', { class: 'tl' }, label), h('b', { class: tone || '' }, value), h('span', { class: 'ts' }, sub),
    progress != null ? h('div', { class: 'progress' }, h('i', { style: { width: progress + '%' } })) : null);

  const nextDay = P.days.map((d, i) => ({ d, i })).filter(x => x.d.date && x.d.date >= today).sort((a, b) => a.d.date.localeCompare(b.d.date))[0] || (P.days[0] ? { d: P.days[0], i: 0 } : null);
  const attention = [];
  if (overdue.length) attention.push([`${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`, 'tasks', 'danger']);
  const unsched = scenes.filter(s => !scheduled.has(s.id)).length; if (unsched && scenes.length) attention.push([`${unsched} scene${unsched > 1 ? 's' : ''} not yet scheduled`, 'schedule']);
  const conflicts = sum(P.days, d => dayConflicts(P, d, scenes).length); if (conflicts) attention.push([`${conflicts} scheduling conflict${conflicts > 1 ? 's' : ''}`, 'schedule', 'danger']);
  if (openRoles) attention.push([`${openRoles} role${openRoles > 1 ? 's' : ''} still to cast`, 'casting']);
  const needP = P.props.filter(x => x.status === 'Needed').length; if (needP) attention.push([`${needP} prop${needP > 1 ? 's' : ''} still needed`, 'props']);
  const needW = P.wardrobe.filter(x => x.status === 'Needed').length; if (needW) attention.push([`${needW} wardrobe item${needW > 1 ? 's' : ''} still needed`, 'wardrobe']);
  const untagged = untrackedItems(P, 'props').filter(u => needsLink(u, 'props')).length + untrackedItems(P, 'wardrobe').filter(u => needsLink(u, 'wardrobe')).length; if (untagged) attention.push([`${untagged} breakdown item${untagged > 1 ? 's' : ''} without a profile`, 'props']);
  const paper = P.people.filter(p => p.name && (p.docs ? DOC_LIST.filter(([k]) => !p.docs[k]).length : DOC_LIST.length) > 0 && p.type === 'cast').length; if (paper) attention.push([`${paper} cast member${paper > 1 ? 's' : ''} with outstanding paperwork`, 'people']);
  if (isPhoto) { if (relOpen) attention.push([`${relOpen} release${relOpen > 1 ? 's' : ''} / permit${relOpen > 1 ? 's' : ''} outstanding`, 'compliance', 'danger']); const noShots = scenes.filter(s => !pShots.some(x => x.sceneId === s.id)).length; if (noShots) attention.push([`${noShots} setup${noShots > 1 ? 's' : ''} with no shots planned`, 'photoshots']); const need = pd.gear.filter(g => g.status === 'Needed').length; if (need) attention.push([`${need} gear item${need > 1 ? 's' : ''} still to reserve`, 'gear']); }
  const podGear = (P.mode === 'podcast' && P.podcast && P.podcast.gear) ? P.podcast.gear : null;
  if (podGear) { const need = podGear.filter(g => g.status === 'Needed').length; if (need) attention.push([`${need} gear item${need > 1 ? 's' : ''} still needed`, 'gear']); }
  if (fc.status === 'over') attention.push([`Budget forecast is ${finMoney(P, -fc.variance, false)} over`, 'budget', 'danger']); else if (fc.status === 'risk') attention.push(['Budget is within 5% of the limit', 'budget']); if (fc.un.n) attention.push([`${fc.un.n} expense${fc.un.n > 1 ? 's' : ''} not assigned to a budget line`, 'budget']);
  const orph = orphanReport(P).total; if (orph) attention.push([`${orph} item${orph > 1 ? 's' : ''} linked to deleted scenes`, 'script', 'danger']);
  const upcoming = P.tasks.filter(t => t.status !== 'done' && t.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);

  const sections = buildNav(P, { flat: true }).flatMap(g => g.items).filter(x => x[0] !== 'overview');
  const _oldSections = [['script', 'Script', 'pen'], ['cards', 'Corkboard', 'cards'], ['breakdown', 'Breakdown', 'tag'], ['shots', 'Shot list', 'camera'], ['board', 'Storyboard', 'image'], ['lookbook', 'Lookbook', 'palette'], ['props', 'Props & wardrobe', 'shirt'], ['people', 'Cast, crew & casting', 'users'],
    ['schedule', 'Schedule', 'calendar'], ['callsheet', 'Call sheets', 'clipboard'], ['locations', 'Locations', 'pin'], ['budget', 'Budget', 'dollar'], ['tasks', 'Tasks', 'tasks'], ['reports', 'Reports', 'chart'], ['pitch', 'Pitch deck', 'deck'], ['stage', 'Blocking & cues', 'stage'], ['takes', 'Script supervisor', 'list']];

  root.append(h('div', { class: 'page', style: { maxWidth: '1200px' } },
    h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, P.title), h('div', { class: 'muted', style: { marginTop: '4px' } }, [MODE_LABEL[P.mode] || 'Screenplay', P.series && `${P.series.name} ${epCode(P.series)}`, P.meta.author && 'by ' + P.meta.author, P.meta.draft].filter(Boolean).join(' · '))), h('span', { class: 'grow' }),
      featureOn(P, 'live') && P.days.length ? h('a', { class: 'btn', href: link('live'), style: { marginRight: '8px' } }, icon('play', 15), 'Live dashboard') : null,
      h('a', { class: 'btn primary', href: link(isPhoto ? 'setups' : 'script') }, icon('pen', 15), isPhoto ? 'Open setups' : 'Open script')),
    P.meta.logline ? h('p', { style: { fontSize: '17px', maxWidth: '75ch', margin: '0 0 22px' } }, P.meta.logline) : null,
    h('div', { class: 'tiles' },
      isPhoto ? tile('Setups', String(scenes.length), `${P.locations.length} location${P.locations.length === 1 ? '' : 's'}`, null, 'setups') : tile('Script', `${st.pages} pp`, `${scenes.length} scenes · ${st.words.toLocaleString()} words`, null, 'script'),
      tile('Scheduled', `${scheduled.size}/${scenes.length}`, `${P.days.length} shoot day${P.days.length === 1 ? '' : 's'}`, pct(scheduled.size, scenes.length), 'schedule'),
      isPhoto ? tile('Shots', `${pShots.filter(s => s.status !== 'Planned').length}/${pShots.length}`, pShots.length ? `${pShots.filter(s => s.hero).length} hero · ${pDone} approved` : 'No shots planned yet', pct(pShots.filter(s => s.status !== 'Planned').length, pShots.length), 'photoshots') : tile('Shot', `${shotsDone}/${P.shots.length}`, P.shots.length ? `${pct(shotsDone, P.shots.length)}% of the shot list` : 'No shots planned yet', pct(shotsDone, P.shots.length), 'shots'),
      tile('Cast', castRoles ? `${castRoles - openRoles}/${castRoles}` : `${P.people.filter(p => p.type === 'cast').length}`, castRoles ? `${openRoles} open role${openRoles === 1 ? '' : 's'}` : 'actors listed', castRoles ? pct(castRoles - openRoles, castRoles) : null, 'people'),
      tile('Props', `${propsOk}/${P.props.length}`, 'acquired or ready', pct(propsOk, P.props.length), 'props'),
      tile('Wardrobe', `${wardOk}/${P.wardrobe.length}`, 'acquired or ready', pct(wardOk, P.wardrobe.length), 'wardrobe'),
      tile('Tasks', `${tasksDone}/${P.tasks.length}`, overdue.length ? `${overdue.length} overdue` : 'on track', pct(tasksDone, P.tasks.length), 'tasks', overdue.length ? 'danger' : ''),
      ...(isPhoto ? [tile('Selects', `${picks}/${pd.selects.length}`, 'picked / imported', null, 'selects'), tile('Releases', `${pd.releases.length - relOpen}/${pd.releases.length}`, relOpen ? `${relOpen} outstanding` : 'all signed', pct(pd.releases.length - relOpen, pd.releases.length), 'compliance', relOpen ? 'danger' : ''), tile('Gear', `${pd.gear.filter(g => ['Picked up', 'On set', 'Returned'].includes(g.status)).length}/${pd.gear.length}`, 'items ready', pct(pd.gear.filter(g => ['Picked up', 'On set', 'Returned'].includes(g.status)).length, pd.gear.length), 'gear')] : (podGear && podGear.length ? [tile('Gear', `${podGear.filter(g => ['Picked up', 'In Studio', 'On set', 'Returned'].includes(g.status)).length}/${podGear.length}`, 'items ready', pct(podGear.filter(g => ['Picked up', 'In Studio', 'On set', 'Returned'].includes(g.status)).length, podGear.length), 'gear')] : [])),
      tile('Budget', budget ? finMoney(P, budget, false) : '—', budget ? `${finMoney(P, fc.act, false)} spent · ${fc.status === 'over' ? 'over budget' : fc.status === 'risk' ? 'at risk' : 'on track'}` : 'not started', budget ? Math.min(100, fc.spentPct) : null, 'budget', fc.status === 'over' ? 'danger' : '')),
    h('div', { class: 'ov-cols' },
      h('div', { class: 'card ov-card' }, h('h3', {}, 'Next shoot day'),
        nextDay ? h('div', {}, h('div', { style: { fontSize: '20px', fontWeight: 750, fontFamily: 'var(--head)' } }, `Day ${nextDay.i + 1}${nextDay.d.date ? ' · ' + fmtDate(nextDay.d.date) : ''}`),
          h('div', { class: 'muted', style: { margin: '4px 0 10px' } }, `${nextDay.d.sceneIds.length} scene${nextDay.d.sceneIds.length === 1 ? '' : 's'}${nextDay.d.cs && nextDay.d.cs.crew ? ' · crew call ' + fmtTime(nextDay.d.cs.crew) : ''}`),
          h('div', { class: 'row wrap' }, h('a', { class: 'btn sm', href: link('callsheet/' + nextDay.d.id) }, icon('clipboard', 14), 'Call sheet'), h('a', { class: 'btn sm', href: link('schedule') }, icon('calendar', 14), 'Schedule')))
          : h('p', { class: 'muted', style: { margin: 0 } }, 'No shoot days yet. Create them in the Schedule.')),
      h('div', { class: 'card ov-card' }, h('h3', {}, 'Needs attention'),
        attention.length ? h('ul', { class: 'attn' }, attention.map(([t, v, tone]) => h('li', {}, h('a', { href: link(v), class: tone || '' }, h('span', {}, t), icon('right', 14))))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing needs attention. 🎬')),
      h('div', { class: 'card ov-card' }, h('h3', {}, 'Coming up'),
        upcoming.length ? h('ul', { class: 'attn' }, upcoming.map(t => h('li', {}, h('a', { href: link('tasks') }, h('span', {}, t.title), h('span', { class: 'small' + (taskOverdue(t) ? ' overdue' : ' muted') }, fmtDateShort(t.due)))))) : h('p', { class: 'muted', style: { margin: 0 } }, 'No tasks with due dates.'))),
    h('h3', { style: { margin: '28px 0 12px' } }, 'Everything'),
    h('div', { class: 'jump' }, sections.map(([v, l, ic]) => h('a', { class: 'btn', href: link(v) }, icon(ic, 16), l)))));
};
