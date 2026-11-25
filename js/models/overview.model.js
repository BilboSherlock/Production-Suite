'use strict';
/* ===================================================================
   Overview — MODEL
   Where a project stands: the progress tiles, what needs attention,
   the next shoot day and the tasks coming up. Read-only: it works out
   the dashboard from the project plus a few facts other screens
   calculate (`f`, gathered by the view model):
     f = { scenes: [{ id }], pages, words, conflicts, untagged, orphans,
           fin: { total, act, status, variance, spentPct, unassigned },
           money(n) → formatted, today: 'YYYY-MM-DD' }
   It reuses the rules of the converted sections (tasks, props &
   wardrobe, people, gear). Pure functions: no DOM, no Store, no UI
   state. See js/mvvm.js.
   =================================================================== */

const OverviewModel = (() => {
  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const PHOTO_DONE = ['Approved', 'Delivered'], REL_OPEN = ['Needed', 'Sent'];
  const itemDone = x => ItemsModel.DONE.has(x.status);
  const ready = gear => gear.filter(g => GearModel.READY.includes(g.status)).length;
  /** the podcast's gear list, when this is a podcast with one */
  const podGear = P => P.mode === 'podcast' && P.podcast && P.podcast.gear ? P.podcast.gear : null;

  /** the next shoot day on or after today (else the first): { d, i } or null */
  function nextDay(days, today) {
    const L = (days || []).map((d, i) => ({ d, i }));
    return L.filter(x => x.d.date && x.d.date >= today).sort((a, b) => a.d.date.localeCompare(b.d.date))[0] || L[0] || null;
  }
  /** open tasks with a due date, soonest first */
  const upcoming = (tasks, n = 5) => (tasks || []).filter(t => t.status !== 'done' && t.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, n);
  /** cast members with paperwork still to do */
  const paperwork = P => (P.people || []).filter(p => p.type === 'cast' && p.name && PeopleModel.docsDone(p) < PeopleModel.DOC_LIST.length).length;
  const scheduledIds = P => new Set((P.days || []).flatMap(d => d.sceneIds));

  /** what needs attention: [{ text, view, tone }] (tone 'danger' for the urgent ones) */
  function attention(P, f) {
    const out = [], add = (text, view, tone = '') => out.push({ text, view, tone });
    const overdue = (P.tasks || []).filter(t => TaskModel.isOverdue(t, f.today)).length;
    if (overdue) add(`${plural(overdue, 'overdue task')}`, 'tasks', 'danger');
    const sched = scheduledIds(P), unsched = f.scenes.filter(s => !sched.has(s.id)).length;
    if (unsched) add(`${plural(unsched, 'scene')} not yet scheduled`, 'schedule');
    if (f.conflicts) add(`${plural(f.conflicts, 'scheduling conflict')}`, 'schedule', 'danger');
    const open = ((P.casting || {}).roles || []).filter(r => !r.castId).length; if (open) add(`${plural(open, 'role')} still to cast`, 'casting');
    const needP = (P.props || []).filter(x => x.status === 'Needed').length; if (needP) add(`${plural(needP, 'prop')} still needed`, 'props');
    const needW = (P.wardrobe || []).filter(x => x.status === 'Needed').length; if (needW) add(`${plural(needW, 'wardrobe item')} still needed`, 'wardrobe');
    if (f.untagged) add(`${plural(f.untagged, 'breakdown item')} without a profile`, 'props');
    const paper = paperwork(P); if (paper) add(`${plural(paper, 'cast member')} with outstanding paperwork`, 'people');
    if (P.mode === 'photo' && P.photo) {
      const pd = P.photo, rel = pd.releases.filter(r => REL_OPEN.includes(r.status)).length;
      if (rel) add(`${plural(rel, 'release')} / permit${rel > 1 ? 's' : ''} outstanding`, 'compliance', 'danger');
      const noShots = f.scenes.filter(s => !pd.shots.some(x => x.sceneId === s.id)).length; if (noShots) add(`${plural(noShots, 'setup')} with no shots planned`, 'photoshots');
      const need = pd.gear.filter(g => g.status === 'Needed').length; if (need) add(`${plural(need, 'gear item')} still to reserve`, 'gear');
    }
    const pg = podGear(P); if (pg) { const need = pg.filter(g => g.status === 'Needed').length; if (need) add(`${plural(need, 'gear item')} still needed`, 'gear'); }
    const fin = f.fin;
    if (fin.status === 'over') add(`Budget forecast is ${f.money(-fin.variance)} over`, 'budget', 'danger'); else if (fin.status === 'risk') add('Budget is within 5% of the limit', 'budget');
    if (fin.unassigned) add(`${plural(fin.unassigned, 'expense')} not assigned to a budget line`, 'budget');
    if (f.orphans) add(`${plural(f.orphans, 'item')} linked to deleted scenes`, 'script', 'danger');
    return out;
  }

  /** the progress tiles: [{ label, value, sub, progress (0–100 or null), view, tone }] */
  function tiles(P, f) {
    const T = [], tile = (label, value, sub, progress, view, tone = '') => T.push({ label, value: String(value), sub, progress: progress == null ? null : progress, view, tone });
    const photo = P.mode === 'photo' && P.photo, pd = P.photo, n = f.scenes.length, sched = scheduledIds(P), days = (P.days || []).length;
    if (photo) tile('Setups', n, plural((P.locations || []).length, 'location'), null, 'setups');
    else tile('Script', `${f.pages} pp`, `${n} scenes · ${f.words.toLocaleString()} words`, null, 'script');
    tile('Scheduled', `${sched.size}/${n}`, plural(days, 'shoot day'), pct(sched.size, n), 'schedule');
    if (photo) {
      const S = pd.shots, going = S.filter(s => s.status !== 'Planned').length;
      tile('Shots', `${going}/${S.length}`, S.length ? `${S.filter(s => s.hero).length} hero · ${S.filter(s => PHOTO_DONE.includes(s.status)).length} approved` : 'No shots planned yet', pct(going, S.length), 'photoshots');
    } else {
      const S = P.shots || [], done = S.filter(s => s.done).length;
      tile('Shot', `${done}/${S.length}`, S.length ? `${pct(done, S.length)}% of the shot list` : 'No shots planned yet', pct(done, S.length), 'shots');
    }
    const roles = ((P.casting || {}).roles || []), open = roles.filter(r => !r.castId).length;
    tile('Cast', roles.length ? `${roles.length - open}/${roles.length}` : (P.people || []).filter(p => p.type === 'cast').length, roles.length ? `${plural(open, 'open role')}` : 'actors listed', roles.length ? pct(roles.length - open, roles.length) : null, 'people');
    const props = P.props || [], ward = P.wardrobe || [], pOk = props.filter(itemDone).length, wOk = ward.filter(itemDone).length;
    tile('Props', `${pOk}/${props.length}`, 'acquired or ready', pct(pOk, props.length), 'props');
    tile('Wardrobe', `${wOk}/${ward.length}`, 'acquired or ready', pct(wOk, ward.length), 'wardrobe');
    const tasks = P.tasks || [], tDone = tasks.filter(t => t.status === 'done').length, overdue = tasks.filter(t => TaskModel.isOverdue(t, f.today)).length;
    tile('Tasks', `${tDone}/${tasks.length}`, overdue ? `${overdue} overdue` : 'on track', pct(tDone, tasks.length), 'tasks', overdue ? 'danger' : '');
    if (photo) {
      const picks = pd.selects.filter(x => x.flag === 'pick').length, rel = pd.releases.filter(r => REL_OPEN.includes(r.status)).length, R = pd.releases.length;
      tile('Selects', `${picks}/${pd.selects.length}`, 'picked / imported', null, 'selects');
      tile('Releases', `${R - rel}/${R}`, rel ? `${rel} outstanding` : 'all signed', pct(R - rel, R), 'compliance', rel ? 'danger' : '');
      tile('Gear', `${ready(pd.gear)}/${pd.gear.length}`, 'items ready', pct(ready(pd.gear), pd.gear.length), 'gear');
    } else { const pg = podGear(P); if (pg && pg.length) tile('Gear', `${ready(pg)}/${pg.length}`, 'items ready', pct(ready(pg), pg.length), 'gear'); }
    const fin = f.fin;
    tile('Budget', fin.total ? f.money(fin.total) : '—', fin.total ? `${f.money(fin.act)} spent · ${fin.status === 'over' ? 'over budget' : fin.status === 'risk' ? 'at risk' : 'on track'}` : 'not started',
      fin.total ? Math.min(100, fin.spentPct) : null, 'budget', fin.status === 'over' ? 'danger' : '');
    return T;
  }

  return { pct, plural, nextDay, upcoming, paperwork, attention, tiles, podGear };
})();
