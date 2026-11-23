'use strict';
/* ===================================================================
   Live production dashboard — run the shoot day: live schedule with
   forecast wrap, now & next, problems log, tasks, cast check-in, alerts
   and one-tap schedule changes. Feeds the daily production report.
   =================================================================== */
const LIVE_ISSUE_CATS = ['Weather', 'Equipment', 'Camera', 'Lighting', 'Sound', 'Cast', 'Crew', 'Location', 'Safety', 'Schedule', 'Creative', 'Transport', 'Other'];
const LIVE_SEV = [['Low', '#8a8f98'], ['Medium', '#e8a40c'], ['High', '#e8830c'], ['Critical', '#e5484d']];
const CHECK_STAGES = ['Called', 'En route', 'Arrived', 'In makeup', 'On set', 'Wrapped', 'No show'];
const DELAY_REASONS = ['Weather', 'Equipment', 'Cast late', 'Camera', 'Lighting', 'Location', 'Safety', 'Creative', 'Other'];
const sevColor = s => (LIVE_SEV.find(x => x[0] === s) || LIVE_SEV[1])[1];

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const msMin = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const clockTxt = m => fmtTime(fromMin(m));
const durTxt = m => { const a = Math.abs(Math.round(m)); return a >= 60 ? `${Math.floor(a / 60)}h ${String(a % 60).padStart(2, '0')}m` : `${a}m`; };
function liveOf(P, day) {
  P.live = P.live || { days: {} };
  const L = P.live.days[day.id] = P.live.days[day.id] || { started: 0, ended: 0, items: {}, order: [], checkins: {}, issues: [], log: [], meal: { out: 0, in: 0 } };
  L.items = L.items || {}; L.order = L.order || []; L.checkins = L.checkins || {}; L.issues = L.issues || []; L.log = L.log || []; L.meal = L.meal || { out: 0, in: 0 };
  return L;
}
const liveLog = (L, msg, kind = '') => { L.log.unshift({ at: Date.now(), msg, kind }); if (L.log.length > 300) L.log.length = 300; };
const dprOf = (P, day) => (P.reports[day.id] = P.reports[day.id] || newReport());

/* the planned running order: scenes in sequence with company moves and lunch */
function livePlan(P, day, L) {
  const scenes = getScenes(P), by = new Map(scenes.map(s => [s.id, s]));
  const ids = (L.order || []).filter(id => day.sceneIds.includes(id)); day.sceneIds.forEach(id => { if (!ids.includes(id)) ids.push(id); });
  const call = toMin(day.cs.shoot) ?? toMin(day.cs.crew) ?? 480, meal = +optOf(P, 'mealHours') || 6, lunchAt = toMin(day.cs.lunch) ?? (call + Math.round((meal - 1.5) * 60));
  const rows = []; let t = call, prevLoc = null, lunch = false;
  ids.filter(id => by.has(id)).forEach(id => {
    const s = by.get(id), loc = (locName(P, s) || '').toUpperCase();
    if (prevLoc !== null && loc && prevLoc && loc !== prevLoc) { rows.push({ kind: 'move', id: 'mv' + id, start: t, dur: 30, label: `${TERM.moveWord} → ${locName(P, s)}`, scene: s }); t += 30; }
    if (!lunch && t >= lunchAt) { rows.push({ kind: 'lunch', id: 'lunch', start: t, dur: 60, label: 'Lunch' }); t += 60; lunch = true; }
    const dur = sceneEst(P, s); rows.push({ kind: 'scene', id, scene: s, start: t, dur }); t += dur; prevLoc = loc || prevLoc;
  });
  return { rows, call, end: t, lunchAt };
}
/* what is actually happening, and where the day is heading */
function liveForecast(P, day, L, plan, now) {
  const out = []; let cursor = plan.call; const started = !!L.started;
  plan.rows.forEach((r, i) => {
    const o = { ...r, fs: r.start, fe: r.start + r.dur, state: 'pending', extra: 0 };
    if (r.kind === 'scene') {
      const it = L.items[r.id] || { status: 'pending' }; o.extra = +it.extra || 0; o.it = it; const dur = r.dur + o.extra;
      if (it.status === 'done') { o.state = 'done'; o.fs = msMin(it.start || Date.now()); o.fe = msMin(it.end || Date.now()); cursor = Math.max(cursor, o.fe); }
      else if (it.status === 'dropped') { o.state = 'dropped'; o.fs = o.fe = cursor; }
      else if (it.status === 'active') { o.state = 'active'; o.fs = msMin(it.start); o.fe = Math.max(o.fs + dur, now + (now > o.fs + dur ? Math.max(5, dur * .1) : 0)); o.over = now > o.fs + dur; cursor = o.fe; }
      else { o.fs = started ? Math.max(cursor, now) : Math.max(cursor, r.start); o.fe = o.fs + dur; cursor = o.fe; }
    } else if (r.kind === 'move') {
      const next = plan.rows.slice(i + 1).find(x => x.kind === 'scene'), ni = next && (L.items[next.id] || {}).status;
      if (ni === 'done' || ni === 'dropped' || ni === 'active') { o.state = 'skip'; o.fs = o.fe = cursor; } else { o.fs = started ? Math.max(cursor, now) : Math.max(cursor, r.start); o.fe = o.fs + r.dur; cursor = o.fe; }
    } else if (r.kind === 'lunch') {
      if (L.meal.in) { o.state = 'done'; o.fs = msMin(L.meal.out); o.fe = msMin(L.meal.in); cursor = Math.max(cursor, o.fe); }
      else if (L.meal.out) { o.state = 'active'; o.fs = msMin(L.meal.out); o.fe = Math.max(o.fs + 60, now); cursor = o.fe; }
      else { o.fs = started ? Math.max(cursor, now) : Math.max(cursor, r.start); o.fe = o.fs + r.dur; cursor = o.fe; }
    }
    out.push(o);
  });
  const live = out.filter(r => r.state !== 'skip' && r.state !== 'dropped'), fWrap = live.length ? Math.max(...live.map(r => r.fe)) : plan.end;
  return { rows: out, wrap: fWrap, delta: fWrap - plan.end };
}

Views.live = function (root) {
  const P = Store.P;
  if (P.mode === 'podcast' && typeof renderPodcastLive === 'function') {
    return renderPodcastLive(root, P);
  }
  if (!P.days.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'The live dashboard runs a shoot day from your schedule. Create a day and schedule its scenes first.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/schedule` }, 'Go to Schedule')))); return; }
  const today = new Date().toISOString().slice(0, 10);
  if (!P.days.find(d => d.id === UI.liveDay)) UI.liveDay = (P.days.find(d => d.date === today) || P.days.find(d => !(P.live && P.live.days[d.id] && P.live.days[d.id].ended)) || P.days[0]).id;
  const wrap = h('div', { class: 'live' + (UI.liveTV ? ' tv' : '') }); root.append(wrap);
  const day = () => P.days.find(d => d.id === UI.liveDay), dayN = () => P.days.indexOf(day()) + 1;
  let timer = null, st = null;
  const flash = () => { Store.touch(); draw(); };

  /* ---------- actions ---------- */
  function startDay() { const L = liveOf(P, day()); L.started = Date.now(); liveLog(L, 'Day started', 'sys'); const R = dprOf(P, day()); if (!R.t.crew) R.t.crew = day().cs.crew || ''; flash(); }
  async function wrapDay() {
    const d = day(), L = liveOf(P, d), open = d.sceneIds.filter(id => !['done', 'dropped'].includes((L.items[id] || {}).status));
    if (open.length && !(await confirmBox(`${open.length} scene${open.length > 1 ? 's are' : ' is'} not finished. Wrap the day anyway? Unfinished scenes are marked Not shot.`, 'Wrap day', 'Wrap the day?'))) return;
    const R = dprOf(P, d); open.forEach(id => { L.items[id] = Object.assign(L.items[id] || {}, { status: 'dropped' }); R.scenes[id] = Object.assign(R.scenes[id] || {}, { status: 'Not shot' }); });
    L.ended = Date.now(); R.t.wrap = fromMin(Math.round(msMin(L.ended))); liveLog(L, `Day wrapped at ${clockTxt(msMin(L.ended))}`, 'sys'); flash();
  }
  function startScene(id) { const d = day(), L = liveOf(P, d), it = L.items[id] = L.items[id] || {}; if (!L.started) { L.started = Date.now(); liveLog(L, 'Day started', 'sys'); } it.status = 'active'; it.start = Date.now(); delete it.end; const s = getScenes(P).find(x => x.id === id); liveLog(L, `Started scene ${s.num} — ${s.label}`, 'scene'); const R = dprOf(P, d); if (!R.t.first) R.t.first = fromMin(Math.round(msMin(it.start))); flash(); }
  function completeScene(id) {
    const d = day(), L = liveOf(P, d), it = L.items[id] = L.items[id] || {}; const s = getScenes(P).find(x => x.id === id); if (!it.start) it.start = Date.now() - sceneEst(P, s) * 6e4;
    it.status = 'done'; it.end = Date.now(); liveLog(L, `Completed scene ${s.num} (${durTxt((it.end - it.start) / 6e4)} vs ${durTxt(sceneEst(P, s))} planned)`, 'scene');
    const R = dprOf(P, d), shots = P.shots.filter(x => x.sceneId === id).length; R.scenes[id] = Object.assign(R.scenes[id] || {}, { status: 'Completed', pgs: String(s.eighths), setups: R.scenes[id] && R.scenes[id].setups || (shots ? String(shots) : '') }); flash();
  }
  function reopen(id) { const L = liveOf(P, day()), it = L.items[id]; if (it) { it.status = 'pending'; delete it.start; delete it.end; } const s = getScenes(P).find(x => x.id === id); liveLog(L, `Scene ${s.num} reset to pending`, 'scene'); flash(); }
  async function dropScene(id) {
    const s = getScenes(P).find(x => x.id === id), why = await promptBox(`Drop scene ${s.num}`, 'Reason (optional) — the scene is marked Not shot', ''); if (why === null) return;
    const L = liveOf(P, day()); L.items[id] = Object.assign(L.items[id] || {}, { status: 'dropped', note: why }); dprOf(P, day()).scenes[id] = Object.assign(dprOf(P, day()).scenes[id] || {}, { status: 'Not shot' }); liveLog(L, `Dropped scene ${s.num}${why ? ': ' + why : ''}`, 'warn'); flash();
  }
  function moveScene(id, dir) { const d = day(), L = liveOf(P, d), plan = livePlan(P, d, L), ids = plan.rows.filter(r => r.kind === 'scene').map(r => r.id), i = ids.indexOf(id), j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; L.order = ids; liveLog(L, `Reordered: scene ${getScenes(P).find(x => x.id === id).num} moved ${dir < 0 ? 'earlier' : 'later'}`, 'sys'); flash(); }
  function deferScene(id) {
    const d = day(), n = dayN(), next = P.days[n], s = getScenes(P).find(x => x.id === id);
    const opts = [h('option', { value: 'next', disabled: !next }, next ? `Day ${n + 1}${next.date ? ' (' + fmtDateShort(next.date) + ')' : ''}` : 'No next day'), h('option', { value: 'new' }, 'A new shoot day'), h('option', { value: 'drop' }, 'Unschedule (back to the unscheduled pile)')], sel = h('select', { class: 'inp' }, opts);
    if (!next) sel.value = 'new';
    modal({ title: `Move scene ${s.num} to another day`, body: h('div', {}, h('p', { style: { marginTop: 0 } }, `“${s.label}” will be removed from today’s plan.`), sel), buttons: [{ label: 'Cancel' }, { label: 'Move scene', primary: true, onClick: () => {
      const L = liveOf(P, d); d.sceneIds = d.sceneIds.filter(x => x !== id); L.order = L.order.filter(x => x !== id); delete L.items[id];
      if (sel.value === 'next' && next) next.sceneIds.unshift(id); else if (sel.value === 'new') { const nd = newDay(P, d.date ? addDays(d.date, 1, true) : ''); nd.sceneIds = [id]; P.days.splice(n, 0, nd); }
      liveLog(L, `Moved scene ${s.num} off today (${{ next: 'to Day ' + (n + 1), new: 'to a new day', drop: 'unscheduled' }[sel.value]})`, 'warn'); const R = dprOf(P, d); delete R.scenes[id]; flash();
    } }] });
  }
  function addDelay(id) {
    const L = liveOf(P, day()), s = getScenes(P).find(x => x.id === id), min = h('input', { class: 'inp', type: 'number', min: 1, value: 15, style: { width: '90px' } }), why = h('select', { class: 'inp' }, DELAY_REASONS.map(r => h('option', {}, r))), note = h('input', { class: 'inp', placeholder: 'Details (optional)' });
    modal({ title: `Delay — scene ${s.num}`, body: h('div', { class: 'fx-grid' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Minutes lost'), min), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Reason'), why), h('div', { class: 'field', style: { gridColumn: '1 / -1' } }, h('label', { class: 'lbl' }, 'Notes'), note)), buttons: [{ label: 'Cancel' }, { label: 'Log delay', primary: true, onClick: () => {
      const m = Math.max(1, +min.value || 0), it = L.items[id] = L.items[id] || {}; it.extra = (+it.extra || 0) + m; liveLog(L, `Delay +${m}m on scene ${s.num}: ${why.value}${note.value ? ' — ' + note.value : ''}`, 'warn');
      L.issues.unshift({ id: uid(), at: Date.now(), title: `${why.value} delay (${m} min)`, cat: why.value === 'Cast late' ? 'Cast' : DELAY_REASONS.includes(why.value) && LIVE_ISSUE_CATS.includes(why.value) ? why.value : 'Schedule', sev: m >= 30 ? 'High' : 'Medium', status: 'Open', owner: '', sceneId: id, notes: note.value, resolvedAt: 0, delay: m });
      const R = dprOf(P, day()); R.incidents = [R.incidents, `${clockTxt(nowMin())} — Scene ${s.num}: ${why.value} delay, ${m} min${note.value ? ' (' + note.value + ')' : ''}`].filter(Boolean).join('\n'); flash();
    } }] });
  }
  function sceneMenu(e, r) {
    const it = r.it || {}, items = [];
    if (it.status !== 'active' && it.status !== 'done' && it.status !== 'dropped') items.push({ label: 'Start now', icon: 'play', onClick: () => startScene(r.id) });
    if (it.status === 'active') items.push({ label: 'Complete', icon: 'check', onClick: () => completeScene(r.id) });
    if (it.status !== 'done' && it.status !== 'dropped') items.push({ label: 'Log a delay…', icon: 'alert', onClick: () => addDelay(r.id) }, { label: 'Move earlier', icon: 'up', onClick: () => moveScene(r.id, -1) }, { label: 'Move later', icon: 'down', onClick: () => moveScene(r.id, 1) }, { label: 'Move to another day…', icon: 'right', onClick: () => deferScene(r.id) }, { label: 'Drop scene…', icon: 'trash', danger: true, onClick: () => dropScene(r.id) });
    if (it.status === 'done' || it.status === 'dropped' || it.status === 'active') items.push({ sep: true }, { label: 'Edit times…', icon: 'edit', onClick: () => editTimes(r) }, { label: 'Reset to pending', icon: 'rotate', onClick: () => reopen(r.id) });
    items.push({ sep: true }, { label: 'Open scene in breakdown', icon: 'tag', onClick: () => { UI.scene = r.id; location.hash = `#/p/${P.id}/breakdown`; } });
    menu(e.currentTarget, items);
  }
  function editTimes(r) {
    const it = (liveOf(P, day()).items[r.id] = liveOf(P, day()).items[r.id] || {}), hm = ms => ms ? fromMin(Math.round(msMin(ms))) : '', a = h('input', { class: 'inp', type: 'time', value: hm(it.start) }), b = h('input', { class: 'inp', type: 'time', value: hm(it.end) });
    const on = (t, ref) => { if (!t) return 0; const d = new Date(ref || Date.now()); const [H, M] = t.split(':').map(Number); d.setHours(H, M, 0, 0); return d.getTime(); };
    modal({ title: `Actual times — scene ${r.scene.num}`, body: h('div', { class: 'fx-grid' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Started'), a), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Finished'), b)), buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { it.start = on(a.value, it.start); it.end = on(b.value, it.start); if (it.start && it.end) it.status = 'done'; else if (it.start) it.status = 'active'; liveLog(liveOf(P, day()), `Times edited for scene ${r.scene.num}`, 'sys'); flash(); } }] });
  }
  function issueModal(preset = {}) {
    const d = day(), scenes = getScenes(P), people = P.people.filter(p => p.name), t = Object.assign({ title: '', cat: 'Equipment', sev: 'Medium', owner: '', sceneId: '', notes: '' }, preset);
    const f = (l, el) => h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, l), el);
    const body = h('div', { class: 'fx-grid' }, f('What is the problem?', h('input', { class: 'inp', value: t.title, placeholder: 'Camera A won’t power on', oninput: e => { t.title = e.target.value; } })), f('Category', h('select', { class: 'inp', onchange: e => { t.cat = e.target.value; } }, LIVE_ISSUE_CATS.map(c => h('option', { selected: c === t.cat }, c)))), f('Severity', h('select', { class: 'inp', onchange: e => { t.sev = e.target.value; } }, LIVE_SEV.map(([s]) => h('option', { selected: s === t.sev }, s)))),
      f('Owner', h('select', { class: 'inp', onchange: e => { t.owner = e.target.value; } }, h('option', { value: '' }, 'Unassigned'), people.map(p => h('option', { value: p.name }, `${p.name}${p.role ? ' — ' + p.role : p.character ? ' — ' + p.character : ''}`)))), f('Scene', h('select', { class: 'inp', onchange: e => { t.sceneId = e.target.value; } }, h('option', { value: '' }, '—'), d.sceneIds.map(id => scenes.find(s => s.id === id)).filter(Boolean).map(s => h('option', { value: s.id }, `${s.num}. ${s.label}`.slice(0, 40))))),
      h('div', { style: { gridColumn: '1 / -1' } }, f('Notes', h('textarea', { class: 'inp', rows: 2, oninput: e => { t.notes = e.target.value; } }))));
    modal({ title: 'Log a problem', wide: true, body, buttons: [{ label: 'Cancel' }, { label: 'Log problem', primary: true, onClick: () => { if (!t.title.trim()) { toast('Describe the problem.', true); return false; } const L = liveOf(P, d); L.issues.unshift({ id: uid(), at: Date.now(), title: t.title.trim(), cat: t.cat, sev: t.sev, status: 'Open', owner: t.owner, sceneId: t.sceneId, notes: t.notes, resolvedAt: 0 }); liveLog(L, `Problem logged (${t.sev}): ${t.title.trim()}`, t.sev === 'Critical' || t.sev === 'High' ? 'warn' : 'sys'); flash(); } }] });
  }
  function issueCard(L, iss) {
    const d = day(), sc = getScenes(P).find(x => x.id === iss.sceneId), open = iss.status !== 'Resolved';
    return h('div', { class: 'lv-issue' + (open ? '' : ' done'), style: { borderLeftColor: sevColor(iss.sev) } },
      h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'lv-sev', style: { background: sevColor(iss.sev) } }, iss.sev), h('b', { style: { flex: 1 } }, iss.title), h('span', { class: 'small muted' }, clockTxt(msMin(iss.at)))),
      h('div', { class: 'small muted' }, [iss.cat, sc && `Scene ${sc.num}`, iss.owner && '@' + iss.owner, iss.status !== 'Open' && iss.status].filter(Boolean).join(' · ')), iss.notes ? h('div', { class: 'small' }, iss.notes) : null,
      h('div', { class: 'row', style: { gap: '4px', marginTop: '6px', flexWrap: 'wrap' } },
        open ? h('button', { class: 'btn sm', onclick: () => { iss.status = 'Resolved'; iss.resolvedAt = Date.now(); liveLog(L, `Resolved: ${iss.title}`, 'ok'); flash(); } }, icon('check', 12), 'Resolve') : h('button', { class: 'btn sm', onclick: () => { iss.status = 'Open'; iss.resolvedAt = 0; flash(); } }, 'Reopen'),
        open && iss.status !== 'Monitoring' ? h('button', { class: 'btn sm ghost', onclick: () => { iss.status = 'Monitoring'; flash(); } }, 'Monitor') : null,
        !iss.taskId ? h('button', { class: 'btn sm ghost', title: 'Create a task for this problem', onclick: () => { const t = newTask(iss.title, 'todo'); t.due = d.date || new Date().toISOString().slice(0, 10); t.priority = iss.sev === 'Critical' || iss.sev === 'High' ? 'High' : 'Normal'; t.notes = iss.notes || ''; t.sceneId = iss.sceneId || ''; t.assignee = iss.owner || ''; P.tasks.push(t); iss.taskId = t.id; liveLog(L, `Task created: ${iss.title}`, 'sys'); flash(); } }, icon('tasks', 12), 'Task') : h('span', { class: 'pill' }, 'task'),
        ibtn('trash', 'Delete', () => { L.issues = L.issues.filter(x => x !== iss); flash(); }, 'danger')));
  }

  /* ---------- the picture ---------- */
  function draw() {
    const d = day(), L = liveOf(P, d), scenes = getScenes(P), now = nowMin(), plan = livePlan(P, d, L), fc = liveForecast(P, d, L, plan, now), rows = fc.rows, sceneRows = rows.filter(r => r.kind === 'scene');
    const active = sceneRows.filter(r => r.state === 'active'), nextR = sceneRows.find(r => r.state === 'pending'), doneN = sceneRows.filter(r => r.state === 'done').length, dropN = sceneRows.filter(r => r.state === 'dropped').length, totalN = sceneRows.length;
    const pgs = rs => sum(rs, r => r.scene.eighths), pgDone = pgs(sceneRows.filter(r => r.state === 'done')), pgAll = pgs(sceneRows.filter(r => r.state !== 'dropped'));
    const dayShots = P.shots.filter(s => d.sceneIds.includes(s.sceneId)), circled = dayShots.filter(s => s.done || (P.takes || []).some(t => t.shotId === s.id && t.status === 'circle')).length;
    const openIss = L.issues.filter(i => i.status !== 'Resolved'), crit = openIss.filter(i => i.sev === 'Critical');
    const started = !!L.started, ended = !!L.ended, plannedWrap = plan.end, limitWrap = toMin(d.cs.wrap), delta = started ? fc.delta : 0;
    const status = ended ? ['WRAPPED', 'done'] : !started ? ['NOT STARTED', 'idle'] : delta > 20 ? [`BEHIND ${durTxt(delta)}`, 'late'] : delta > 5 ? [`SLIGHTLY BEHIND ${durTxt(delta)}`, 'warn'] : delta < -10 ? [`AHEAD ${durTxt(-delta)}`, 'ahead'] : ['ON TIME', 'ok'];
    /* alerts */
    const alerts = [];
    crit.forEach(i => alerts.push(['crit', `CRITICAL: ${i.title}`]));
    if (started && !ended) {
      const mealCap = (toMin(d.cs.crew) ?? plan.call) + (+optOf(P, 'mealHours') || 6) * 60, mealDone = L.meal.out;
      if (!mealDone && now > mealCap) alerts.push(['crit', `Meal break overdue — due by ${clockTxt(mealCap)} (${durTxt(now - mealCap)} late). Penalties may apply.`]); else if (!mealDone && now > mealCap - 30) alerts.push(['warn', `Meal break due by ${clockTxt(mealCap)} (${durTxt(mealCap - now)} left)`]);
      if (limitWrap != null && fc.wrap > limitWrap + 5) alerts.push([fc.wrap > limitWrap + 30 ? 'crit' : 'warn', `Forecast wrap ${clockTxt(fc.wrap)} is ${durTxt(fc.wrap - limitWrap)} after the call-sheet wrap (${clockTxt(limitWrap)})`]);
      const cap = (toMin(d.cs.crew) ?? plan.call) + (+P.settings.dayHours || 10) * 60; if (fc.wrap > cap) alerts.push(['warn', `Day would run past the ${P.settings.dayHours || 10}-hour limit (${clockTxt(cap)})`]);
      const nd = P.days[dayN()]; if (nd && nd.cs && nd.cs.crew && nd.date && d.date) { const gap = ((new Date(nd.date) - new Date(d.date)) / 6e4) - fc.wrap + (toMin(nd.cs.crew) || 0), need = (+optOf(P, 'turnaround') || 10) * 60; if (gap < need) alerts.push(['warn', `Forecast wrap leaves only ${(gap / 60).toFixed(1)} h turnaround before Day ${dayN() + 1} call (${need / 60} h needed)`]); }
      const sun = toMin(d.cs.sunset); if (sun) { const late = sceneRows.filter(r => ['pending', 'active'].includes(r.state) && /EXT/i.test(r.scene.ioe || '') && !r.scene.night && r.fe > sun); if (late.length) alerts.push(['warn', `Exterior scene${late.length > 1 ? 's' : ''} ${late.map(r => r.scene.num).join(', ')} forecast to finish after sunset (${clockTxt(sun)})`]); }
      if (nextR && !ended) { const cast = [...sceneCast(P, nextR.scene)], soon = nextR.fs - now < 45; if (soon) cast.forEach(ch => { const p = P.people.find(x => x.type === 'cast' && normChar(x.character) === ch); if (p && !['Arrived', 'In makeup', 'On set'].includes((L.checkins[p.id] || {}).status)) alerts.push(['warn', `${p.name || ch} (${ch}) not yet on site — scene ${nextR.scene.num} starts ${nextR.fs <= now ? 'now' : 'in ' + durTxt(nextR.fs - now)}`]); }); }
      if (fc.delta > 25 && nextR) { const need = fc.delta, cand = [...sceneRows].reverse().filter(r => r.state === 'pending').map(r => ({ r, m: r.dur + r.extra })).sort((a, b) => Math.abs(a.m - need) - Math.abs(b.m - need))[0]; if (cand) alerts.push(['tip', `To recover ${durTxt(need)}, consider moving scene ${cand.r.scene.num} (${durTxt(cand.m)}) to another day.`, cand.r.id]); }
    }
    /* header */
    const header = h('div', { class: 'lv-head' },
      h('div', { class: 'lv-clock' }, h('b', { id: 'lvClock' }, clockTxt(now)), h('span', { id: 'lvElapsed', class: 'small muted' }, started ? `${ended ? 'Day length' : 'Day running'} ${durTxt(((ended || Date.now()) - L.started) / 6e4)}` : 'Day not started')),
      h('div', { class: 'lv-stat ' + status[1] }, h('span', { class: 'lv-l' }, 'Schedule'), h('b', {}, status[0]), h('span', { class: 'small' }, started ? `Forecast wrap ${clockTxt(fc.wrap)} · planned ${clockTxt(plannedWrap)}` : `Planned wrap ${clockTxt(plannedWrap)}`)),
      h('div', { class: 'lv-stat' }, h('span', { class: 'lv-l' }, 'Scenes'), h('b', {}, `${doneN}/${totalN - dropN}`), h('span', { class: 'small' }, `${fmtEighths(pgDone)} of ${fmtEighths(pgAll)} pp${dropN ? ` · ${dropN} dropped` : ''}`), h('div', { class: 'progress' }, h('i', { style: { width: (totalN - dropN ? doneN / (totalN - dropN) * 100 : 0) + '%' } }))),
      h('div', { class: 'lv-stat' }, h('span', { class: 'lv-l' }, 'Shots'), h('b', {}, dayShots.length ? `${circled}/${dayShots.length}` : '—'), h('span', { class: 'small' }, dayShots.length ? 'circled / planned' : 'none planned')),
      h('div', { class: 'lv-stat ' + (crit.length ? 'late' : openIss.length ? 'warn' : '') }, h('span', { class: 'lv-l' }, 'Problems'), h('b', {}, String(openIss.length)), h('span', { class: 'small' }, crit.length ? `${crit.length} critical` : 'open')),
      (() => { const sun = toMin(d.cs.sunset); return sun ? h('div', { class: 'lv-stat' }, h('span', { class: 'lv-l' }, 'Daylight'), h('b', {}, now < sun ? durTxt(sun - now) : 'Dark'), h('span', { class: 'small' }, `sunset ${clockTxt(sun)}`)) : null; })(),
      h('div', { class: 'lv-actions' }, h('select', { class: 'inp', style: { width: 'auto', fontWeight: 600 }, onchange: e => { UI.liveDay = e.target.value; draw(); } }, P.days.map((x, i) => h('option', { value: x.id, selected: x.id === d.id }, `Day ${i + 1}${x.date ? ' · ' + fmtDateShort(x.date) : ''}${x.date === today ? ' (today)' : ''}`))),
        !started ? h('button', { class: 'btn primary', onclick: startDay }, icon('play', 15), 'Start day') : !ended ? h('button', { class: 'btn', onclick: wrapDay }, icon('check', 15), 'Wrap day') : h('button', { class: 'btn', onclick: () => { L.ended = 0; flash(); } }, 'Reopen day'),
        h('button', { class: 'btn', onclick: () => issueModal() }, icon('alert', 15), 'Log problem'),
        h('button', { class: 'btn', title: 'Full-screen big-display mode', onclick: () => { UI.liveTV = !UI.liveTV; wrap.classList.toggle('tv', UI.liveTV); if (UI.liveTV && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { }); else if (!UI.liveTV && document.fullscreenElement) document.exitFullscreen(); } }, icon('focus', 15), 'TV mode')));
    /* now & next */
    const bigCard = (title, r, kind) => {
      if (!r) return h('div', { class: 'lv-card empty' }, h('span', { class: 'lv-l' }, title), h('div', { class: 'muted' }, kind === 'now' ? (started ? 'Nothing shooting right now' : 'Start the day to begin') : 'No more scenes'));
      const it = r.it || {}, est = r.dur + r.extra, el = r.state === 'active' ? now - r.fs : 0, pct = r.state === 'active' ? Math.min(100, el / est * 100) : 0, s = r.scene, cast = [...sceneCast(P, s)].join(', ');
      return h('div', { class: 'lv-card ' + r.state + (r.over ? ' over' : '') }, h('span', { class: 'lv-l' }, title), h('div', { class: 'lv-title' }, h('b', {}, `Sc ${s.num}`), ' ', s.label),
        h('div', { class: 'small muted' }, [locName(P, s), cast && `Cast: ${cast}`, `${fmtEighths(s.eighths)} pp`].filter(Boolean).join(' · ')),
        h('div', { class: 'lv-times' }, r.state === 'active' ? [h('span', {}, `Started ${clockTxt(r.fs)}`), h('b', { class: r.over ? 'neg' : '' }, `${durTxt(el)} / ${durTxt(est)}`), h('span', {}, `ends ~${clockTxt(r.fe)}`)] : [h('span', {}, `Planned ${clockTxt(r.start)}`), h('b', {}, `Forecast ${clockTxt(r.fs)}`), h('span', {}, durTxt(est))]),
        r.state === 'active' ? h('div', { class: 'progress lv-prog' }, h('i', { style: { width: pct + '%', background: r.over ? 'var(--danger)' : '' } })) : null, s.synopsis ? h('div', { class: 'small', style: { margin: '6px 0' } }, s.synopsis) : null,
        h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', marginTop: '8px' } }, r.state === 'active' ? [h('button', { class: 'btn primary', onclick: () => completeScene(r.id) }, icon('check', 15), 'Complete'), h('button', { class: 'btn', onclick: () => addDelay(r.id) }, icon('alert', 14), 'Delay')] : [h('button', { class: 'btn primary', onclick: () => startScene(r.id) }, icon('play', 15), kind === 'next' ? 'Start now' : 'Start'), h('button', { class: 'btn', onclick: () => deferScene(r.id) }, 'Move to another day')], h('button', { class: 'icon-btn', onclick: e => sceneMenu(e, r) }, icon('more', 16))));
    };
    const nowCards = active.length ? active.map(r => bigCard(active.length > 1 ? 'Shooting now (2nd unit)' : 'Shooting now', r, 'now')) : [bigCard('Shooting now', null, 'now')];
    /* timeline */
    const live = rows.filter(r => r.state !== 'skip'), tmin = Math.floor((Math.min(plan.call, ...live.map(r => Math.min(r.start, r.fs))) - 15) / 30) * 30, tmax = Math.ceil((Math.max(fc.wrap, plan.end, limitWrap || 0, toMin(d.cs.sunset) || 0) + 20) / 30) * 30, span = Math.max(60, tmax - tmin), pc = m => ((m - tmin) / span * 100) + '%';
    const ticks = []; for (let m = Math.ceil(tmin / 60) * 60; m <= tmax; m += 60) ticks.push(m);
    const tl = h('div', { class: 'lv-tl' }, h('div', { class: 'lv-axis' }, h('div', { class: 'lv-lab' }), h('div', { class: 'lv-track axis' }, ticks.map(m => h('span', { style: { left: pc(m) } }, clockTxt(m))))),
      rows.filter(r => r.state !== 'skip').map(r => {
        const isS = r.kind === 'scene', lab = isS ? `${r.scene.num}. ${r.scene.label}`.replace(/^(\d+)\. (INT|EXT)\.? ?/, '$1. ') : r.label, cls = r.state + (r.over ? ' over' : '') + (isS && r.state === 'pending' && r.fs > r.start + 10 ? ' late' : '');
        return h('div', { class: 'lv-row ' + r.kind, onclick: e => isS && sceneMenu(e, r) }, h('div', { class: 'lv-lab', title: lab }, h('span', { class: 'lv-dot ' + r.state }), lab.slice(0, 42)),
          h('div', { class: 'lv-track' }, ticks.map(m => h('i', { class: 'grid', style: { left: pc(m) } })), r.state === 'dropped' ? h('span', { class: 'lv-dropped', style: { left: pc(r.start) } }, 'dropped') : [h('div', { class: 'lv-plan', style: { left: pc(r.start), width: (r.dur / span * 100) + '%' } }), h('div', { class: 'lv-bar ' + cls, style: { left: pc(r.fs), width: Math.max(.6, (r.fe - r.fs) / span * 100) + '%' }, title: `${clockTxt(r.fs)} – ${clockTxt(r.fe)}` }, r.extra ? h('span', { class: 'lv-extra' }, `+${r.extra}m`) : null)]));
      }),
      h('div', { class: 'lv-overlay' }, h('div', { class: 'lv-lab' }), h('div', { class: 'lv-track' }, started && !ended ? h('div', { class: 'lv-now', style: { left: pc(now) }, id: 'lvNow' }, h('span', {}, 'NOW')) : null, toMin(d.cs.sunset) ? h('div', { class: 'lv-mark sun', style: { left: pc(toMin(d.cs.sunset)) }, title: 'Sunset' }, h('span', {}, '☀ sunset')) : null, limitWrap != null ? h('div', { class: 'lv-mark wrap', style: { left: pc(limitWrap) }, title: 'Call-sheet wrap' }, h('span', {}, 'wrap')) : null)));
    /* panels */
    const alertBox = alerts.length ? h('div', { class: 'lv-alerts' }, alerts.map(([k, m, id]) => h('div', { class: 'lv-alert ' + k }, icon(k === 'tip' ? 'wand' : 'alert', 15), h('span', {}, m), id ? h('button', { class: 'btn sm', onclick: () => deferScene(id) }, 'Move scene…') : null))) : null;
    const issuesPanel = h('div', { class: 'lv-panel' }, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', {}, 'Problems'), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => issueModal() }, icon('plus', 13), 'Log')),
      L.issues.length ? [...L.issues].sort((a, b) => ((a.status === 'Resolved') - (b.status === 'Resolved')) || (LIVE_SEV.findIndex(s => s[0] === b.sev) - LIVE_SEV.findIndex(s => s[0] === a.sev)) || (b.at - a.at)).map(i => issueCard(L, i)) : h('p', { class: 'muted small', style: { margin: 0 } }, 'Nothing logged. When something goes wrong, log it — it can become a task and feeds the daily report.'));
    const dayScenesSet = new Set(d.sceneIds), dueD = d.date || today, taskList = P.tasks.filter(t => t.status !== 'done' && (taskOverdue(t) || (t.due && t.due <= dueD) || (t.sceneId && dayScenesSet.has(t.sceneId)) || t.status === 'blocked' || t.status === 'doing')).sort((a, b) => (a.status === 'blocked' ? -1 : 0) - (b.status === 'blocked' ? -1 : 0) || (a.due || '9').localeCompare(b.due || '9'));
    const quick = h('input', { class: 'inp', placeholder: '+ Add a task for today, press Enter', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { const t = newTask(e.target.value.trim(), 'todo'); t.due = dueD; P.tasks.push(t); liveLog(L, `Task added: ${t.title}`, 'sys'); flash(); } } });
    const tasksPanel = h('div', { class: 'lv-panel' }, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', {}, 'Tasks'), h('span', { class: 'grow' }), h('a', { class: 'btn sm ghost', href: `#/p/${P.id}/tasks` }, 'All tasks')), quick,
      taskList.length ? taskList.slice(0, 12).map(t => h('div', { class: 'lv-task' + (taskOverdue(t) ? ' overdue' : '') + (t.status === 'blocked' ? ' blocked' : '') }, h('button', { class: 'lv-chk ' + t.status, title: 'Click to advance: to do → in progress → done', onclick: () => { t.status = t.status === 'todo' || t.status === 'blocked' ? 'doing' : 'done'; if (t.status === 'done') liveLog(L, `Task done: ${t.title}`, 'ok'); flash(); } }, t.status === 'doing' ? '◐' : ''), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'clip' }, t.title), h('div', { class: 'small muted' }, [t.assignee, t.dept, t.due && (taskOverdue(t) ? 'overdue · ' : '') + fmtDateShort(t.due), t.status === 'blocked' && 'BLOCKED'].filter(Boolean).join(' · '))),
        t.status !== 'blocked' ? ibtn('alert', 'Mark blocked', () => { t.status = 'blocked'; flash(); }) : ibtn('rotate', 'Unblock', () => { t.status = 'todo'; flash(); }))) : h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, 'No open tasks for today.'));
    const castIds = new Set(); sceneRows.forEach(r => { if (r.state !== 'dropped') sceneCast(P, r.scene).forEach(ch => castIds.add(ch)); });
    const castP = P.people.filter(p => p.type === 'cast' && castIds.has(normChar(p.character))), crewP = P.people.filter(p => p.type === 'crew' && p.name); UI.liveWho = UI.liveWho || 'cast';
    const ppl = UI.liveWho === 'cast' ? castP : crewP, callOf = p => { const c = (d.calls && d.calls[p.id]) || {}; return c.call || c.time || d.cs.crew || ''; };
    const checkPanel = h('div', { class: 'lv-panel' }, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', {}, 'Check-in'), h('span', { class: 'grow' }), h('div', { class: 'seg' }, [['cast', `Cast ${castP.length}`], ['crew', `Crew ${crewP.length}`]].map(([k, l]) => h('button', { class: UI.liveWho === k ? 'on' : '', onclick: () => { UI.liveWho = k; draw(); } }, l)))),
      ppl.length ? h('div', { class: 'lv-people' }, ppl.map(p => { const c = L.checkins[p.id] || { status: 'Called' }, cl = toMin(callOf(p)), late = cl != null && c.at && ['Arrived', 'In makeup', 'On set'].includes(c.status) && msMin(c.at) > cl + 5;
        return h('div', { class: 'lv-person st-' + c.status.replace(/\s/g, '') }, avatar(p, 30), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'clip', style: { fontWeight: 600 } }, p.name || p.character), h('div', { class: 'small muted clip' }, [p.type === 'cast' ? p.character : p.role || p.dept, cl != null && `call ${clockTxt(cl)}`, c.at && `${c.status} ${clockTxt(msMin(c.at))}`, late && 'LATE'].filter(Boolean).join(' · '))),
          h('select', { class: 'lv-st', onchange: e => { L.checkins[p.id] = { status: e.target.value, at: Date.now() }; liveLog(L, `${p.name || p.character}: ${e.target.value}`, 'sys'); flash(); } }, CHECK_STAGES.map(s => h('option', { selected: s === c.status }, s)))); })) : h('p', { class: 'muted small', style: { margin: 0 } }, UI.liveWho === 'cast' ? 'No cast scheduled today.' : 'No crew listed — add them in Cast & crew.'));
    const note = h('input', { class: 'inp', placeholder: 'Add a note to the log, press Enter', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { liveLog(L, e.target.value.trim(), 'note'); flash(); } } });
    const logPanel = h('div', { class: 'lv-panel' }, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', {}, 'Activity'), h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => { const R = dprOf(P, d); R.notes = [R.notes, ...[...L.log].reverse().map(x => `${clockTxt(msMin(x.at))} ${x.msg}`)].filter(Boolean).join('\n'); Store.touch(); toast('Activity log added to the daily report notes'); } }, 'To report')), note,
      h('div', { class: 'lv-log' }, L.log.slice(0, 40).map(x => h('div', { class: 'lv-ev ' + x.kind }, h('span', { class: 'small muted' }, clockTxt(msMin(x.at))), h('span', {}, x.msg)))));
    const mealBtn = !L.meal.out ? h('button', { class: 'btn sm', onclick: () => { L.meal.out = Date.now(); const R = dprOf(P, d); R.t.lunchOut = fromMin(Math.round(msMin(L.meal.out))); liveLog(L, 'Lunch out', 'sys'); flash(); } }, 'Lunch out') : !L.meal.in ? h('button', { class: 'btn sm primary', onclick: () => { L.meal.in = Date.now(); const R = dprOf(P, d); R.t.lunchIn = fromMin(Math.round(msMin(L.meal.in))); liveLog(L, `Lunch in (${durTxt((L.meal.in - L.meal.out) / 6e4)})`, 'sys'); flash(); } }, 'Lunch in') : h('span', { class: 'pill' }, `Lunch ${durTxt((L.meal.in - L.meal.out) / 6e4)}`);
    wrap.replaceChildren(...[header, alertBox, h('div', { class: 'lv-grid' },
      h('div', { class: 'lv-main' }, h('div', { class: 'lv-now-row' }, ...nowCards, bigCard('Up next', nextR && !active.includes(nextR) ? nextR : sceneRows.filter(r => r.state === 'pending')[active.length ? 0 : 1] || null, 'next')),
        h('div', { class: 'lv-panel' }, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', {}, 'Live schedule'), h('span', { class: 'small muted' }, 'outline = planned · solid = actual / forecast · click a scene for actions'), h('span', { class: 'grow' }), started && !ended ? mealBtn : null), tl)),
      h('div', { class: 'lv-side' }, issuesPanel, tasksPanel, checkPanel, logPanel))].filter(Boolean));
  }
  /* the clock ticks every second; the picture refreshes every 20 s so forecasts keep moving */
  function tick() {
    if (!wrap.isConnected || !day()) { clearInterval(timer); return; }
    const c = document.getElementById('lvClock'); if (c) c.textContent = clockTxt(nowMin()); const L = liveOf(P, day()), e = document.getElementById('lvElapsed'); if (e && L.started) e.textContent = `${L.ended ? 'Day length' : 'Day running'} ${durTxt(((L.ended || Date.now()) - L.started) / 6e4)}`;
    if (!document.querySelector('.overlay') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && (Date.now() - (tick.last || 0)) > 20000) { tick.last = Date.now(); draw(); }
  }
  tick.last = Date.now(); draw(); timer = setInterval(tick, 1000);
  const onFs = () => { if (!document.fullscreenElement && UI.liveTV) { UI.liveTV = false; wrap.classList.remove('tv'); } }; document.addEventListener('fullscreenchange', onFs);
  return () => { clearInterval(timer); document.removeEventListener('fullscreenchange', onFs); if (document.fullscreenElement) document.exitFullscreen(); };
};
