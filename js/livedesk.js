'use strict';
/* ===================================================================
   Live desk — the shared frame of every live dashboard (film, stage,
   AV, photo shoot and podcast recording).

   Design rules
   • Nothing scrolls inside the dashboard. Panels fold open and shut
     (remembered per device), and long lists show their first few rows
     with "Show all" — so every list is read top to bottom, never in a
     little scroll box, and a glance across the screen shows everything.
   • One look for every suite: clock and status tiles across the top,
     alerts under them, the running order and "now / next" in the main
     column, the shared panels down the side.
   • One set of shared panels and one session record per day (problems,
     check-in, tasks, activity) — so a problem logged on a podcast and
     on a shoot day are the same thing, can become a task, and feed the
     daily report.
   =================================================================== */

/* ---------- session data, shared by every suite ---------- */
const LIVE_ISSUE_CATS = ['Weather', 'Equipment', 'Camera', 'Lighting', 'Sound', 'Cast', 'Crew', 'Location', 'Safety', 'Schedule', 'Creative', 'Transport', 'Other'];
const LIVE_SEV = [['Low', '#8a8f98'], ['Medium', '#e8a40c'], ['High', '#e8830c'], ['Critical', '#e5484d']];
const CHECK_STAGES = ['Called', 'En route', 'Arrived', 'In makeup', 'On set', 'Wrapped', 'No show'];
const CHECK_HERE = ['Arrived', 'In makeup', 'On set'];
const DELAY_REASONS = ['Weather', 'Equipment', 'Cast late', 'Camera', 'Lighting', 'Location', 'Safety', 'Creative', 'Other'];
const sevColor = s => (LIVE_SEV.find(x => x[0] === s) || LIVE_SEV[1])[1];
const sevRank = s => LIVE_SEV.findIndex(x => x[0] === s);

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const msMin = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const clockTxt = m => fmtTime(fromMin(m));
const durTxt = m => { const a = Math.abs(Math.round(m)); return a >= 60 ? `${Math.floor(a / 60)}h ${String(a % 60).padStart(2, '0')}m` : `${a}m`; };
const todayISO = () => new Date().toISOString().slice(0, 10);

/* one record per live session: a shoot day (keyed by day id) or a recording session */
function liveOf(P, day) {
  P.live = P.live || { days: {} };
  const L = P.live.days[day.id] = P.live.days[day.id] || {};
  for (const [k, v] of Object.entries({ started: 0, ended: 0, items: {}, order: [], checkins: {}, issues: [], log: [], meal: { out: 0, in: 0 } })) if (L[k] === undefined) L[k] = v;
  return L;
}
const liveLog = (L, msg, kind = '') => { L.log.unshift({ at: Date.now(), msg, kind }); if (L.log.length > 300) L.log.length = 300; };
const dprOf = (P, day) => (P.reports[day.id] = P.reports[day.id] || newReport());

/* ---------- fold & "show all" state ---------- */
const LD = {
  _fold: null,
  folds() { if (!LD._fold) { try { LD._fold = JSON.parse(localStorage.getItem('sb-lv-fold') || '{}'); } catch (e) { LD._fold = {}; } } return LD._fold; },
  open(key, def = true) { const f = LD.folds()[key]; return f === undefined ? def : f; },
  setOpen(key, v) { LD.folds()[key] = v; try { localStorage.setItem('sb-lv-fold', JSON.stringify(LD._fold)); } catch (e) { } },
  more: new Set(),                           // lists showing every row, for this visit
  toggleMore(key) { LD.more.has(key) ? LD.more.delete(key) : LD.more.add(key); },
};

/* ---------- building blocks ---------- */
/* a panel that folds; `body` may be a function, so a folded panel costs nothing to draw */
function ldPanel(key, { title, ico, count, tone = '', tools, body, open = true, hint = '' }, redraw) {
  const on = LD.open(key, open);
  return h('section', { class: 'ld-panel' + (on ? ' open' : '') + (tone ? ' t-' + tone : ''), 'data-key': 'p-' + key },
    h('header', { class: 'ld-ph' },
      h('button', { class: 'ld-pt', 'aria-expanded': String(on), title: on ? 'Fold this panel' : 'Open this panel', onclick: () => { LD.setOpen(key, !on); redraw(); } },
        h('span', { class: 'ld-chev' }, icon('chev', 15)), ico ? icon(ico, 16) : null, h('h3', {}, title), count !== undefined && count !== null && count !== '' ? h('span', { class: 'ld-count' + (tone ? ' t-' + tone : '') }, String(count)) : null,
        !on && hint ? h('span', { class: 'ld-hint' }, hint) : null),
      on && tools ? h('div', { class: 'ld-tools' }, tools) : null),
    on ? h('div', { class: 'ld-pb' }, typeof body === 'function' ? body() : body) : null);
}
/* the first rows of a list, and a button for the rest — never a scroll box */
function ldList(key, items, render, { limit = 5, empty = '', cls = 'ld-list' } = {}, redraw) {
  if (!items.length) return empty ? h('p', { class: 'ld-empty' }, empty) : null;
  const all = LD.more.has(key) || items.length <= limit + 1, shown = all ? items : items.slice(0, limit);
  return h('div', { class: cls }, shown.map(render), items.length > limit + 1 ? h('button', { class: 'ld-more', onclick: () => { LD.toggleMore(key); redraw(); } }, all ? 'Show fewer' : `Show all ${items.length}`, h('span', { class: 'ld-chev' + (all ? ' up' : '') }, icon('chev', 13))) : null);
}
const ldTile = (label, value, sub = '', tone = '', extra = null, attrs = {}) => h('div', Object.assign({ class: 'ld-tile' + (tone ? ' t-' + tone : '') }, attrs), h('span', { class: 'ld-l' }, label), h('b', { class: 'ld-v' }, value), sub ? h('span', { class: 'ld-s' }, sub) : null, extra);
/* the clock ticks on its own every second (see ldTicker); ids let it update without a redraw */
const ldClock = (time, sub) => h('div', { class: 'ld-tile ld-clock' }, h('b', { class: 'ld-v', id: 'ldClock' }, time), h('span', { class: 'ld-s', id: 'ldClockSub' }, sub));
const ldProgress = (pct, tone = '') => h('div', { class: 'ld-prog' + (tone ? ' t-' + tone : '') }, h('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } }));

/* alerts, worst first; two show, the rest wait behind "n more" */
function ldAlerts(alerts, redraw) {
  if (!alerts.length) return null;
  const order = { crit: 0, warn: 1, tip: 2 }, list = [...alerts].sort((a, b) => order[a[0]] - order[b[0]]), all = LD.more.has('alerts'), shown = all ? list : list.slice(0, 2);
  return h('div', { class: 'ld-alerts', 'data-key': 'alerts' }, shown.map(([k, msg, act]) => h('div', { class: 'ld-alert t-' + k, role: k === 'crit' ? 'alert' : null }, icon(k === 'tip' ? 'wand' : 'alert', 16), h('span', {}, msg), act ? h('button', { class: 'btn sm', onclick: act.fn }, act.label) : null)),
    list.length > 2 ? h('button', { class: 'ld-more', onclick: () => { LD.toggleMore('alerts'); redraw(); } }, all ? 'Show fewer' : `${list.length - 2} more alert${list.length - 2 > 1 ? 's' : ''}`, h('span', { class: 'ld-chev' + (all ? ' up' : '') }, icon('chev', 13))) : null);
}

/* the running order on a time axis: outline = planned, solid = actual / forecast. It always fits
   the panel's width — the label column shrinks and the hours squeeze, nothing scrolls sideways. */
function ldTimeline(rows, { from, to, now, showNow, marks = [], onRow }) {
  const span = Math.max(60, to - from), pc = m => ((m - from) / span * 100) + '%', ticks = [];
  const step = span > 14 * 60 ? 120 : 60; for (let m = Math.ceil(from / step) * step; m <= to; m += step) ticks.push(m);
  return h('div', { class: 'ld-tl' },
    h('div', { class: 'ld-tl-row axis' }, h('div', { class: 'ld-tl-lab' }), h('div', { class: 'ld-tl-track' }, ticks.map(m => h('span', { class: 'ld-tick', style: { left: pc(m) } }, clockTxt(m))))),
    rows.map(r => h('div', { class: 'ld-tl-row k-' + r.kind + (r.onClick || onRow ? ' clickable' : ''), 'data-key': 'r-' + r.id, onclick: r.kind === 'scene' && onRow ? e => onRow(e, r) : null },
      h('div', { class: 'ld-tl-lab', title: r.label }, h('span', { class: 'ld-dot s-' + r.state }), h('span', { class: 'clip' }, r.label)),
      h('div', { class: 'ld-tl-track' }, ticks.map(m => h('i', { class: 'ld-gl', style: { left: pc(m) } })),
        r.state === 'dropped' ? h('span', { class: 'ld-dropped', style: { left: pc(r.start) } }, 'dropped') : [
          h('div', { class: 'ld-plan', style: { left: pc(r.start), width: (r.dur / span * 100) + '%' } }),
          h('div', { class: 'ld-bar s-' + r.state + (r.over ? ' over' : '') + (r.late ? ' late' : ''), style: { left: pc(r.fs), width: Math.max(.6, (r.fe - r.fs) / span * 100) + '%' }, title: `${clockTxt(r.fs)} – ${clockTxt(r.fe)}` }, r.extra ? h('span', { class: 'ld-extra' }, `+${r.extra}m`) : null)]))),
    h('div', { class: 'ld-tl-row ld-tl-over' }, h('div', { class: 'ld-tl-lab' }), h('div', { class: 'ld-tl-track' },
      showNow && now >= from && now <= to ? h('div', { class: 'ld-now', style: { left: pc(now) } }, h('span', {}, 'NOW')) : null,
      marks.filter(m => m.at != null && m.at >= from && m.at <= to).map(m => h('div', { class: 'ld-mark ' + (m.cls || ''), style: { left: pc(m.at) }, title: m.label }, h('span', {}, m.label))))));
}

/* ---------- shared panels ----------
   cx = { P, L, key, redraw, flash, date, items: [{ id, label }], itemWord, issueCats, quickIssues,
          groups: [{ key, label, people: [{ p, sub, call }] }], taskFilter, report: () => report | null } */
function ldIssueModal(cx, preset = {}) {
  const { P, L } = cx, people = P.people.filter(p => p.name), t = Object.assign({ title: '', cat: (cx.issueCats || LIVE_ISSUE_CATS)[0], sev: 'Medium', owner: '', sceneId: '', notes: '' }, preset);
  const f = (l, el, wide) => h('div', { class: 'field', style: { marginBottom: 0, gridColumn: wide ? '1 / -1' : null } }, h('label', { class: 'lbl' }, l), el);
  const body = h('div', { class: 'fx-grid' }, f('What is the problem?', h('input', { class: 'inp', value: t.title, placeholder: 'Camera A won’t power on', oninput: e => { t.title = e.target.value; } }), true),
    f('Category', h('select', { class: 'inp', onchange: e => { t.cat = e.target.value; } }, (cx.issueCats || LIVE_ISSUE_CATS).map(c => h('option', { selected: c === t.cat }, c)))),
    f('Severity', h('select', { class: 'inp', onchange: e => { t.sev = e.target.value; } }, LIVE_SEV.map(([s]) => h('option', { selected: s === t.sev }, s)))),
    f('Owner', h('select', { class: 'inp', onchange: e => { t.owner = e.target.value; } }, h('option', { value: '' }, 'Unassigned'), people.map(p => h('option', { value: p.name, selected: p.name === t.owner }, `${p.name}${p.role ? ' — ' + p.role : p.character ? ' — ' + p.character : ''}`)))),
    (cx.items || []).length ? f(cx.itemWord || 'Scene', h('select', { class: 'inp', onchange: e => { t.sceneId = e.target.value; } }, h('option', { value: '' }, '—'), cx.items.map(s => h('option', { value: s.id, selected: s.id === t.sceneId }, s.label.slice(0, 44))))) : null,
    f('Notes', h('textarea', { class: 'inp', rows: 2, value: t.notes, oninput: e => { t.notes = e.target.value; } }), true));
  modal({ title: preset.id ? 'Edit problem' : 'Log a problem', wide: true, body, buttons: [{ label: 'Cancel' }, { label: preset.id ? 'Save' : 'Log problem', primary: true, onClick: () => {
    if (!t.title.trim()) { toast('Describe the problem.', true); return false; }
    if (preset.id) { Object.assign(L.issues.find(x => x.id === preset.id) || {}, t, { title: t.title.trim() }); }
    else ldAddIssue(cx, t);
    cx.flash();
  } }] });
}
/* quick-logged problems pick a category from their wording ("generator noise" → Sound) */
const ISSUE_WORDS = [['Sound', /\b(sound|audio|mic|noise|hum|buzz|boom|wind|lav|feedback|clip)/i], ['Weather', /\b(rain|weather|storm|sun|cloud|snow|cold|heat|hot)/i],
  ['Camera', /\b(camera|lens|focus|card|battery|sensor|monitor|frame)/i], ['Lighting', /\b(light|lamp|flicker|bulb|gel|generator|genny|power)/i],
  ['Cast', /\b(actor|cast|talent|guest|host|lines|makeup|wardrobe)/i], ['Crew', /\b(crew|operator|grip|gaffer)/i], ['Safety', /\b(injur|hurt|safety|fire|medic|hazard)/i],
  ['Location', /\b(location|permit|neighbou?r|parking|venue|police)/i], ['Transport', /\b(van|truck|car|traffic|transport|driver)/i], ['Schedule', /\b(late|behind|delay|overtime|time)/i],
  ['Equipment', /\b(cable|stand|tripod|kit|broken|gear|equipment|laptop|interface|connection)/i]];
function ldGuessCat(text, cats) { const hit = ISSUE_WORDS.find(([c, re]) => cats.includes(c) && re.test(text)); return hit ? hit[0] : (cats.includes('Other') ? 'Other' : cats[cats.length - 1]); }
function ldAddIssue(cx, t) {
  const { L } = cx, iss = Object.assign({ id: uid(), at: Date.now(), cat: 'Other', sev: 'Medium', status: 'Open', owner: '', sceneId: '', notes: '', resolvedAt: 0 }, t, { title: t.title.trim() });
  if (cx.stamp) iss.tc = cx.stamp();          // e.g. the recording timecode on a podcast
  L.issues.unshift(iss); liveLog(L, `Problem logged (${iss.sev}): ${iss.title}`, iss.sev === 'Critical' || iss.sev === 'High' ? 'warn' : 'sys');
  return iss;
}
function ldProblems(cx) {
  const { P, L } = cx, open = L.issues.filter(i => i.status !== 'Resolved'), crit = open.filter(i => i.sev === 'Critical' || i.sev === 'High');
  const sorted = [...L.issues].sort((a, b) => ((a.status === 'Resolved') - (b.status === 'Resolved')) || (sevRank(b.sev) - sevRank(a.sev)) || (b.at - a.at));
  const quick = h('input', { class: 'inp ld-quick', placeholder: '+ What went wrong? Enter to log', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { ldAddIssue(cx, { title: e.target.value, cat: ldGuessCat(e.target.value, cx.issueCats || LIVE_ISSUE_CATS) }); e.target.value = ''; cx.flash(); } } });
  const card = iss => {
    const sc = (cx.items || []).find(x => x.id === iss.sceneId), isOpen = iss.status !== 'Resolved';
    return h('div', { class: 'ld-issue' + (isOpen ? '' : ' done'), 'data-key': iss.id, style: { borderLeftColor: sevColor(iss.sev) } },
      h('div', { class: 'ld-row' }, h('span', { class: 'ld-sev', style: { background: sevColor(iss.sev) } }, iss.sev), h('b', { class: 'grow clip2' }, iss.title), h('span', { class: 'ld-time' }, iss.tc != null ? fmtTimeSec(iss.tc) : clockTxt(msMin(iss.at)))),
      h('div', { class: 'ld-meta' }, [iss.cat, sc && sc.label, iss.owner && '@' + iss.owner, iss.status !== 'Open' && iss.status].filter(Boolean).join(' · ')), iss.notes ? h('div', { class: 'ld-note' }, iss.notes) : null,
      h('div', { class: 'ld-acts' },
        isOpen ? h('button', { class: 'btn sm', onclick: () => { iss.status = 'Resolved'; iss.resolvedAt = Date.now(); liveLog(L, `Resolved: ${iss.title}`, 'ok'); cx.flash(); } }, icon('check', 13), 'Resolve') : h('button', { class: 'btn sm ghost', onclick: () => { iss.status = 'Open'; iss.resolvedAt = 0; cx.flash(); } }, 'Reopen'),
        isOpen && iss.status !== 'Monitoring' ? h('button', { class: 'btn sm ghost', onclick: () => { iss.status = 'Monitoring'; cx.flash(); } }, 'Monitor') : null,
        !iss.taskId ? h('button', { class: 'btn sm ghost', title: 'Turn this problem into a task', onclick: () => { const t = newTask(iss.title, 'todo'); t.due = cx.date || todayISO(); t.priority = sevRank(iss.sev) >= 2 ? 'High' : 'Normal'; t.notes = iss.notes || ''; t.sceneId = iss.sceneId || ''; t.assignee = iss.owner || ''; P.tasks.push(t); iss.taskId = t.id; liveLog(L, `Task created: ${iss.title}`, 'sys'); cx.flash(); } }, icon('tasks', 13), 'Task') : h('span', { class: 'pill' }, 'task'),
        h('span', { class: 'grow' }), ibtn('edit', 'Edit', () => ldIssueModal(cx, iss)), ibtn('trash', 'Delete', () => { L.issues = L.issues.filter(x => x !== iss); cx.flash(); }, 'danger')));
  };
  return ldPanel(cx.key + ':problems', { title: 'Problems', ico: 'alert', count: open.length || '', tone: crit.length ? 'bad' : open.length ? 'warn' : '', hint: open.length ? `${open.length} open` : 'none open',
    tools: [h('button', { class: 'btn sm', onclick: () => ldIssueModal(cx) }, icon('plus', 13), 'Details')],
    body: () => [quick, cx.quickIssues ? h('div', { class: 'ld-chips' }, cx.quickIssues.map(([label, cat, sev]) => h('button', { class: 'chip', onclick: () => { ldAddIssue(cx, { title: label, cat, sev }); cx.flash(); } }, '+ ' + label))) : null,
      ldList(cx.key + ':problems', sorted, card, { limit: 4, empty: 'Nothing logged. When something goes wrong, log it here — it can become a task and goes into the daily report.' }, cx.redraw)] }, cx.redraw);
}
function ldTasks(cx) {
  const { P, L } = cx, list = P.tasks.filter(t => t.status !== 'done' && (cx.taskFilter ? cx.taskFilter(t) : true)).sort((a, b) => ((b.status === 'blocked') - (a.status === 'blocked')) || ((b.status === 'doing') - (a.status === 'doing')) || (a.due || '9').localeCompare(b.due || '9'));
  const quick = h('input', { class: 'inp ld-quick', placeholder: '+ Add a task for today, Enter', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { const t = newTask(e.target.value.trim(), 'todo'); t.due = cx.date || todayISO(); P.tasks.push(t); liveLog(L, `Task added: ${t.title}`, 'sys'); e.target.value = ''; cx.flash(); } } });
  const row = t => h('div', { class: 'ld-task' + (taskOverdue(t) ? ' overdue' : '') + (t.status === 'blocked' ? ' blocked' : ''), 'data-key': t.id },
    h('button', { class: 'ld-chk s-' + t.status, title: 'Tap to move on: to do → in progress → done', 'aria-label': 'Advance task', onclick: () => { t.status = t.status === 'todo' || t.status === 'blocked' ? 'doing' : 'done'; if (t.status === 'done') liveLog(L, `Task done: ${t.title}`, 'ok'); cx.flash(); } }, t.status === 'doing' ? '◐' : ''),
    h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'clip2' }, t.title), h('div', { class: 'ld-meta' }, [t.assignee, t.dept, t.due && (taskOverdue(t) ? 'overdue · ' : '') + fmtDateShort(t.due), t.status === 'blocked' && 'BLOCKED'].filter(Boolean).join(' · '))),
    t.status !== 'blocked' ? ibtn('alert', 'Mark blocked', () => { t.status = 'blocked'; cx.flash(); }) : ibtn('rotate', 'Unblock', () => { t.status = 'todo'; cx.flash(); }));
  const blocked = list.filter(t => t.status === 'blocked').length;
  return ldPanel(cx.key + ':tasks', { title: 'Tasks', ico: 'tasks', count: list.length || '', tone: blocked ? 'bad' : '', hint: blocked ? `${blocked} blocked` : list.length ? `${list.length} open` : 'all done',
    tools: [h('a', { class: 'btn sm ghost', href: `#/p/${P.id}/tasks` }, 'All tasks')],
    body: () => [quick, ldList(cx.key + ':tasks', list, row, { limit: 5, empty: 'No open tasks for today.' }, cx.redraw)] }, cx.redraw);
}
function ldCheckin(cx) {
  const { L } = cx, groups = (cx.groups || []).filter(g => g.people.length || g.always);
  if (!groups.length) return null;
  const wk = 'ldWho:' + cx.key; if (!groups.some(g => g.key === UI[wk])) UI[wk] = groups[0].key;
  const g = groups.find(x => x.key === UI[wk]), all = groups.flatMap(x => x.people), here = all.filter(x => CHECK_HERE.includes((L.checkins[x.p.id] || {}).status)).length;
  const row = ({ p, sub, call }) => {
    const c = L.checkins[p.id] || { status: 'Called' }, cl = call != null ? toMin(call) : null, late = cl != null && c.at && CHECK_HERE.includes(c.status) && msMin(c.at) > cl + 5;
    return h('div', { class: 'ld-person st-' + c.status.replace(/\s/g, ''), 'data-key': p.id }, avatar(p, 32),
      h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'clip', style: { fontWeight: 600 } }, p.name || p.character || 'Unnamed'), h('div', { class: 'ld-meta clip' }, [sub, cl != null && `call ${clockTxt(cl)}`, c.at && `${c.status} ${clockTxt(msMin(c.at))}`, late && 'LATE'].filter(Boolean).join(' · '))),
      h('select', { class: 'ld-st', 'aria-label': 'Status of ' + (p.name || 'person'), onchange: e => { L.checkins[p.id] = { status: e.target.value, at: Date.now() }; liveLog(L, `${p.name || p.character}: ${e.target.value}`, 'sys'); cx.flash(); } }, CHECK_STAGES.map(s => h('option', { selected: s === c.status }, s))));
  };
  return ldPanel(cx.key + ':checkin', { title: 'Check-in', ico: 'users', count: `${here}/${all.length}`, hint: `${here} of ${all.length} here`,
    tools: groups.length > 1 ? [h('div', { class: 'seg sm' }, groups.map(x => h('button', { class: x.key === g.key ? 'on' : '', onclick: () => { UI[wk] = x.key; cx.redraw(); } }, `${x.label} ${x.people.length}`)))] : null,
    body: () => ldList(cx.key + ':checkin:' + g.key, g.people, row, { limit: 6, empty: g.empty || 'Nobody listed.', cls: 'ld-list ld-people' }, cx.redraw) }, cx.redraw);
}
function ldActivity(cx) {
  const { L } = cx, note = h('input', { class: 'inp ld-quick', placeholder: '+ Note for the log, Enter', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { liveLog(L, e.target.value.trim(), 'note'); e.target.value = ''; cx.flash(); } } });
  const row = x => h('div', { class: 'ld-ev k-' + x.kind }, h('span', { class: 'ld-time' }, x.tc != null ? fmtTimeSec(x.tc) : clockTxt(msMin(x.at))), h('span', {}, x.msg));
  return ldPanel(cx.key + ':log', { title: 'Activity', ico: 'list', count: L.log.length || '', open: false, hint: L.log[0] ? L.log[0].msg.slice(0, 40) : '',
    tools: cx.report ? [h('button', { class: 'btn sm ghost', title: 'Copy the log into the daily report notes', onclick: () => { const R = cx.report(); if (!R) return; R.notes = [R.notes, ...[...L.log].reverse().map(x => `${clockTxt(msMin(x.at))} ${x.msg}`)].filter(Boolean).join('\n'); Store.touch(); toast('Activity log added to the daily report'); } }, 'To report')] : null,
    body: () => [note, ldList(cx.key + ':log', L.log, row, { limit: 8, cls: 'ld-list ld-log' }, cx.redraw)] }, cx.redraw);
}

/* ---------- the frame ---------- */
/* full-screen big-display mode, shared by every suite */
function ldTV(wrap) {
  UI.liveTV = !UI.liveTV; wrap.classList.toggle('tv', UI.liveTV);
  if (UI.liveTV && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { });
  else if (!UI.liveTV && document.fullscreenElement) document.exitFullscreen();
}
/* ticks every second for the clock; calls redraw at `every` ms while the page is idle (not while
   a dialog is open), so forecasts keep moving. Returns the cleanup for the view. */
function ldTicker(wrap, { tick, redraw, every = 20000 }) {
  let last = Date.now();
  const t = setInterval(() => {
    if (!wrap.isConnected) return clearInterval(t);
    if (document.hidden) return;
    const c = document.getElementById('ldClock'); if (c) c.textContent = clockTxt(nowMin());
    if (tick) tick();
    if (Date.now() - last > every && !document.querySelector('body > .overlay, .menu')) { last = Date.now(); redraw(); }
  }, 1000);
  const onFs = () => { if (!document.fullscreenElement && UI.liveTV) { UI.liveTV = false; wrap.classList.remove('tv'); } };
  document.addEventListener('fullscreenchange', onFs);
  return () => { clearInterval(t); document.removeEventListener('fullscreenchange', onFs); if (document.fullscreenElement) document.exitFullscreen(); };
}
