'use strict';
/* ===================================================================
   Stripboard schedule + call sheets
   =================================================================== */
const stripCls = s => { if (!s.ioe) return 's-x'; const ext = /^(EXT|EST)/.test(s.ioe); return `s-${ext ? 'ext' : 'int'}-${s.night ? 'night' : 'day'}`; };
const DAY_KINDS = ['Shoot', 'Rehearsal', 'Tech', 'Dress', 'Performance'];
const newDay = (P, date = '') => ({ id: uid(), date, kind: P.mode === 'stage' ? 'Rehearsal' : 'Shoot', sceneIds: [], cs: { crew: '07:00', shoot: '08:00', lunch: '', wrap: '', sunrise: '', sunset: '', weather: '', temp: '', hospital: '', hospAddr: '', basecamp: '', office: '', notes: '', safety: '' }, calls: {} });
const dayScenes = (P, d, scenes) => d.sceneIds.map(id => scenes.find(s => s.id === id)).filter(Boolean);
const addDays = (iso, n, skipWeekend) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); if (skipWeekend) while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

Views.schedule = function (root) {
  const P = Store.P; let scenes = getScenes(P), dragging = null;
  if (!scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes to schedule yet'), h('p', {}, 'Write some scenes in the Script view, then drag them onto shoot days here.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/script` }, 'Go to Script')))); return; }
  root.parentElement.classList.add('noscroll');
  const pool = h('div', { class: 'sched-pool' }), daysEl = h('div', { class: 'sched-days' }), stats = h('span', { class: 'small muted' });
  UI.schedMode = UI.schedMode || 'board';
  const modeSeg = h('div', { class: 'seg' }, [['board', 'Stripboard'], ['calendar', 'Calendar']].map(([k, l]) => h('button', { 'data-k': k, class: UI.schedMode === k ? 'on' : '', onclick: () => { UI.schedMode = k; $$('button', modeSeg).forEach(b => b.classList.toggle('on', b.dataset.k === k)); draw(); } }, l)));
  const toolbar = h('div', { class: 'toolbar' }, modeSeg,
    h('button', { class: 'btn primary', onclick: () => { const last = P.days[P.days.length - 1]; P.days.push(newDay(P, last && last.date ? addDays(last.date, 1, true) : '')); Store.touch(); draw(); daysEl.scrollTop = daysEl.scrollHeight; } }, icon('plus', 15), P.mode === 'stage' ? 'Rehearsal / show day' : 'Shoot day'),
    h('button', { class: 'btn', onclick: autoSchedule }, icon('wand', 15), 'Auto-schedule…'),
    h('button', { class: 'btn', onclick: () => { P.days.sort((a, b) => (a.date || '9').localeCompare(b.date || '9')); Store.touch(); draw(); } }, icon('calendar', 15), 'Sort by date'),
    h('label', { class: 'row small', title: 'Length of a shooting day — days over this are flagged' }, 'Day', h('input', { class: 'inp', type: 'number', min: 1, max: 24, step: .5, value: P.settings.dayHours || 10, style: { width: '58px', padding: '3px 6px' }, onchange: e => { P.settings.dayHours = +e.target.value || 10; Store.touch(); draw(); } }), 'h'),
    h('label', { class: 'row small', title: 'Estimated shooting minutes per script page, used when a scene has no estimate of its own' }, h('input', { class: 'inp', type: 'number', min: 5, max: 600, value: P.settings.minsPerPage || 60, style: { width: '58px', padding: '3px 6px' }, onchange: e => { P.settings.minsPerPage = +e.target.value || 60; Store.touch(); draw(); } }), 'min/page'),
    stats, h('span', { class: 'grow' }),
    h('div', { class: 'legend' }, [['#fff', 'INT day'], ['#fff2a8', 'EXT day'], ['#b9d4f7', 'INT night'], ['#b5e6c2', 'EXT night']].map(([c, l]) => h('span', {}, h('i', { style: { background: c } }), l))),
    h('button', { class: 'btn', onclick: printSchedule }, icon('print', 15), 'Print schedule'));
  root.append(h('div', { class: 'script-wrap' }, toolbar, h('div', { class: 'sched' }, pool, daysEl)));

  const scheduled = () => new Set(P.days.flatMap(d => d.sceneIds));
  function strip(s) {
    const el = h('div', { class: 'strip ' + stripCls(s), draggable: true, title: 'Drag to a shoot day',
      ondragstart: e => { dragging = s.id; e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => el.classList.add('dragging'), 0); },
      ondragend: () => { dragging = null; el.classList.remove('dragging'); clearInd(); $$('.zone.over').forEach(z => z.classList.remove('over')); } },
      h('span', { class: 'sn' }, s.num), h('span', { class: 'ie' }, `${s.ioe || '—'}·${(s.tod || '').slice(0, 5) || '—'}`),
      h('div', { class: 'st' }, h('b', {}, locName(P, s) || s.label), h('span', {}, s.synopsis || [...sceneCast(P, s)].slice(0, 5).join(', ') || s.heading)),
      h('span', { class: 'pg', title: 'Estimated shooting time' }, fmtEighths(s.eighths) + ' pg · ' + fmtMin(sceneEst(P, s))));
    return el;
  }
  const clearInd = () => $$('.drop-ind').forEach(x => x.remove());
  function dropIndex(el, y) { let i = 0; for (const s of $$('.strip:not(.dragging)', el)) { const r = s.getBoundingClientRect(); if (y < r.top + r.height / 2) break; i++; } return i; }
  function zone(el, dayId) {
    el.addEventListener('dragover', e => { if (!dragging) return; e.preventDefault(); el.classList.add('over'); clearInd(); const st = $$('.strip:not(.dragging)', el), i = dropIndex(el, e.clientY), ind = h('div', { class: 'drop-ind' }); i < st.length ? st[i].before(ind) : el.append(ind); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) { el.classList.remove('over'); clearInd(); } });
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('over'); const i = dropIndex(el, e.clientY), id = dragging; clearInd(); if (!id) return;
      P.days.forEach(d => d.sceneIds = d.sceneIds.filter(x => x !== id));
      if (dayId) P.days.find(d => d.id === dayId).sceneIds.splice(i, 0, id);
      Store.touch(); draw();
    });
    return el;
  }
  function dayCard(d, n) {
    const list = dayScenes(P, d, scenes), e8 = sum(list, s => s.eighths);
    const locs = [...new Set(list.map(s => locName(P, s)).filter(Boolean))];
    return h('div', { class: 'card daycard' },
      h('div', { class: 'dayh' }, h('h3', {}, `Day ${n + 1}`), h('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px', fontWeight: 600 }, title: 'What kind of day is this?', onchange: e => { d.kind = e.target.value; Store.touch(); draw(); } }, (P.mode === 'stage' ? DAY_KINDS : ['Shoot', 'Prep', 'Pickup', 'Reshoot']).map(k => h('option', { selected: k === (d.kind || 'Shoot') }, k))),
        h('input', { class: 'inp', type: 'date', value: d.date, style: { width: '160px' }, title: 'Shoot date', onchange: e => { d.date = e.target.value; Store.touch(); draw(); } }),
        h('span', { class: 'small muted' }, d.date ? new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' }) : ''),
        h('span', { class: 'pill accent' }, `${list.length} scene${list.length === 1 ? '' : 's'} · ${fmtEighths(e8)} pgs`),
        (() => { const pl = dayPlan(P, d, scenes); return h('span', { class: pl.over ? 'warnpill' : 'pill', title: `Scenes ${fmtMin(pl.mins)} + ${pl.moves} company move${pl.moves === 1 ? '' : 's'} (30 min each) against a ${P.settings.dayHours || 10}-hour day` }, pl.over ? icon('alert', 12) : null, `~${fmtMin(pl.mins)}${pl.moves ? ` · ${pl.moves} move${pl.moves > 1 ? 's' : ''}` : ''}`); })(),
        (() => { const w = turnaroundWarn(P, n); return w ? h('span', { class: 'warnpill', title: w }, icon('alert', 12), 'Turnaround') : null; })(),
        locs.length ? h('span', { class: 'small muted', style: { maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, locs.join(' · ')) : null,
        (() => { const cf = dayConflicts(P, d, scenes); return cf.length ? h('span', { class: 'warnpill', title: cf.join('\n') }, icon('alert', 13), cf.length + (cf.length === 1 ? ' conflict' : ' conflicts')) : null; })(),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', title: 'Print the script pages for this day', onclick: () => printSides(P, d) }, icon('file', 14), 'Sides'),
        h('a', { class: 'btn sm', href: `#/p/${P.id}/callsheet/${d.id}` }, icon('clipboard', 14), 'Call sheet'),
        ibtn('trash', 'Delete day (scenes return to the unscheduled list)', async () => { if (await confirmBox(`Delete Day ${n + 1}? Its scenes go back to the unscheduled list.`)) { P.days = P.days.filter(x => x !== d); Store.touch(); draw(); } }, 'danger')),
      zone(h('div', { class: 'zone' }, list.map(strip), list.length ? null : h('div', { class: 'muted small', style: { padding: '12px', textAlign: 'center' } }, 'Drag scenes here')), d.id));
  }
  function drawCalendar() {
    daysEl.innerHTML = '';
    const dated = P.days.filter(d => d.date).map(d => d.date).sort();
    let ym = UI.calMonth || (dated[0] ? dated[0].slice(0, 7) : new Date().toISOString().slice(0, 7));
    UI.calMonth = ym; const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1), start = new Date(y, m - 1, 1 - first.getDay()), todayIso = new Date().toISOString().slice(0, 10);
    const shift = n => { const d = new Date(y, m - 1 + n, 1); UI.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; drawCalendar(); };
    const grid = h('div', { class: 'cal' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => h('div', { class: 'dow' }, x)));
    for (let k = 0; k < 42; k++) {
      const d = new Date(start); d.setDate(start.getDate() + k);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const here = P.days.filter(x => x.date === iso);
      grid.append(h('div', { class: 'cell' + (d.getMonth() !== m - 1 ? ' off' : '') + (iso === todayIso ? ' today' : '') },
        h('span', { class: 'dn' }, d.getDate()),
        h('button', { class: 'icon-btn add', style: { width: '24px', height: '24px' }, title: 'Add a shoot day on this date', onclick: () => { P.days.push(newDay(P, iso)); Store.touch(); draw(); } }, icon('plus', 14)),
        here.map(x => { const n = P.days.indexOf(x) + 1, cf = dayConflicts(P, x, scenes);
          return h('a', { class: 'dchip' + (cf.length ? ' warn' : ''), href: `#/p/${P.id}/callsheet/${x.id}`, title: (cf.length ? cf.join('\n') + '\n' : '') + 'Open call sheet' }, `Day ${n} · ${x.sceneIds.length} sc`); })));
    }
    const undated = P.days.filter(d => !d.date);
    daysEl.append(h('div', { class: 'row', style: { marginBottom: '12px' } }, ibtn('left', 'Previous month', () => shift(-1)), h('h3', { style: { minWidth: '170px', textAlign: 'center' } }, first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })), ibtn('right', 'Next month', () => shift(1)),
      h('button', { class: 'btn sm', onclick: () => { UI.calMonth = todayIso.slice(0, 7); drawCalendar(); } }, 'Today')), grid,
      ...(undated.length ? [h('p', { class: 'small muted', style: { marginTop: '14px' } }, `${undated.length} shoot day${undated.length > 1 ? 's have' : ' has'} no date yet — set dates in the Stripboard view.`)] : []));
  }
  function draw() {
    scenes = getScenes(P); const valid = new Set(scenes.map(s => s.id)); P.days.forEach(d => d.sceneIds = d.sceneIds.filter(id => valid.has(id)));
    const sch = scheduled(), un = scenes.filter(s => !sch.has(s.id));
    pool.classList.toggle('hidden', UI.schedMode === 'calendar');
    if (UI.schedMode === 'calendar') { drawCalendar(); stats.textContent = `${P.days.length} shoot day${P.days.length === 1 ? '' : 's'} · ${scenes.length - un.length}/${scenes.length} scenes scheduled`; return; }
    pool.innerHTML = '';
    pool.append(h('div', { style: { padding: '12px 14px 4px' } }, h('h3', { style: { fontSize: '15px' } }, `Unscheduled scenes `, h('span', { class: 'pill' }, un.length)), h('div', { class: 'small muted' }, 'Drag a strip onto a shoot day →')));
    const z = zone(h('div', { class: 'zone', style: { flex: 1, overflow: 'auto', margin: '6px' } }, un.length ? un.map(strip) : h('div', { class: 'empty', style: { padding: '30px 10px' } }, h('p', {}, '🎬 Every scene is scheduled.'))), null);
    pool.append(z);
    daysEl.innerHTML = '';
    if (!P.days.length) daysEl.append(h('div', { class: 'empty' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'Add a shoot day and drag scenes onto it — or let StudioBindahh group scenes by location automatically.'), h('button', { class: 'btn primary', onclick: autoSchedule }, icon('wand', 15), 'Auto-schedule')));
    P.days.forEach((d, i) => daysEl.append(dayCard(d, i)));
    const tot = sum(scenes, s => s.eighths);
    stats.textContent = `${scenes.length - un.length}/${scenes.length} scenes scheduled · ${P.days.length} day${P.days.length === 1 ? '' : 's'} · ${fmtEighths(tot)} total pages`;
  }
  function autoSchedule() {
    const sch = scheduled(), un = scenes.filter(s => !sch.has(s.id)); if (!un.length) return toast('Every scene is already scheduled.');
    const ppd = h('input', { class: 'inp', type: 'number', min: 0.5, step: 0.5, value: 4 }), start = h('input', { class: 'inp', type: 'date', value: (P.days[P.days.length - 1] || {}).date ? addDays(P.days[P.days.length - 1].date, 1, true) : new Date().toISOString().slice(0, 10) });
    const wk = h('input', { type: 'checkbox', checked: true }), grp = h('input', { type: 'checkbox', checked: true });
    modal({ title: 'Auto-schedule', body: h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, `Place ${un.length} unscheduled scene${un.length > 1 ? 's' : ''} onto new shoot days.`),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Target pages per day'), ppd), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'First shoot date'), start),
      h('label', { class: 'row', style: { marginBottom: '8px' } }, wk, 'Skip weekends'), h('label', { class: 'row' }, grp, 'Group scenes by location (fewer company moves)')),
      buttons: [{ label: 'Cancel' }, { label: 'Schedule', primary: true, onClick: () => {
        let order = un.slice();
        if (grp.checked) { const g = new Map(); un.forEach(s => { const k = (locName(P, s) || s.label).toUpperCase(); if (!g.has(k)) g.set(k, []); g.get(k).push(s); }); order = [...g.values()].flat(); }
        const cap = Math.max(1, Math.round((+ppd.value || 4) * 8)); let day = null, date = start.value;
        order.forEach(s => {
          if (!day || (sum(dayScenes(P, day, scenes), x => x.eighths) + s.eighths > cap && day.sceneIds.length)) {
            if (day && date) date = addDays(date, 1, wk.checked); else if (date && wk.checked) date = addDays(date, 0, true);
            day = newDay(P, date); P.days.push(day);
          }
          day.sceneIds.push(s.id);
        });
        Store.touch(); draw(); toast('Schedule created — drag strips to fine-tune it');
      } }] });
  }
  function printSchedule() {
    const rows = [];
    P.days.forEach((d, i) => {
      const l = dayScenes(P, d, scenes); rows.push({ grp: `Day ${i + 1}${d.date ? ' — ' + fmtDate(d.date) : ''} — ${l.length} scenes, ${fmtEighths(sum(l, s => s.eighths))} pages` });
      l.forEach(s => rows.push([s.num, s.ioe, s.tod, locName(P, s) || s.label, s.synopsis, [...sceneCast(P, s)].join(', '), fmtEighths(s.eighths)]));
    });
    const sch = scheduled(), un = scenes.filter(s => !sch.has(s.id));
    if (un.length) { rows.push({ grp: 'Unscheduled' }); un.forEach(s => rows.push([s.num, s.ioe, s.tod, locName(P, s) || s.label, s.synopsis, [...sceneCast(P, s)].join(', '), fmtEighths(s.eighths)])); }
    printTable('Shooting schedule', ['Sc', 'I/E', 'D/N', 'Location', 'Synopsis', 'Cast', 'Pgs'], rows);
  }
  draw();
  return () => root.parentElement.classList.remove('noscroll');
};

/* ===================================================================
   Call sheet
   =================================================================== */
Views.callsheet = function (root, arg) {
  const P = Store.P; const scenes = getScenes(P);
  if (!P.days.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'Call sheets are generated from your schedule. Create a shoot day first.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/schedule` }, 'Go to Schedule')))); return; }
  let day = P.days.find(d => d.id === (arg || UI.callDay)) || P.days[0]; UI.callDay = day.id;
  const holder = h('div', { class: 'page', style: { maxWidth: '980px' } });
  const sel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { day = P.days.find(d => d.id === e.target.value); UI.callDay = day.id; history.replaceState(null, '', `#/p/${P.id}/callsheet/${day.id}`); draw(); } },
    P.days.map((d, i) => h('option', { value: d.id, selected: d === day }, `Day ${i + 1}${d.date ? ' — ' + fmtDateShort(d.date) : ''}`)));
  function emailDay() {
    const n = P.days.indexOf(day), ds = dayScenes(P, day, scenes), c = day.cs;
    const chars = new Set(); ds.forEach(s => sceneCast(P, s).forEach(x => chars.add(x)));
    const people = [...P.people.filter(p => p.type === 'cast' && chars.has(normChar(p.character))), ...P.people.filter(p => p.type === 'crew')];
    const emails = [...new Set(people.map(p => (p.email || '').trim()).filter(Boolean))], missing = people.filter(p => !(p.email || '').trim() && p.name).map(p => p.name);
    const locs = [...new Set(ds.map(s => s.location).filter(Boolean))];
    const subj = h('input', { class: 'inp', value: `${P.title} — Call sheet — Day ${n + 1}${day.date ? ' (' + fmtDateShort(day.date) + ')' : ''}` });
    const body = h('textarea', { class: 'inp', rows: 12, value: [`Hi all,`, ``, `Call sheet for Day ${n + 1} of ${P.days.length}${day.date ? ' — ' + fmtDate(day.date) : ''}.`, ``,
      c.crew ? `${TERM.crewCall}: ${fmtTime(c.crew)}` : '', c.shoot ? `Shooting call: ${fmtTime(c.shoot)}` : '', c.wrap ? `Estimated wrap: ${fmtTime(c.wrap)}` : '', locs.length ? `Location: ${locs.join('; ')}` : '', c.basecamp ? `Basecamp / parking: ${c.basecamp}` : '',
      ``, ds.length ? 'Scenes: ' + ds.map(s => s.num).join(', ') : '', c.notes ? `\nNotes: ${c.notes}` : '', ``, `The full call sheet PDF is attached.`, ``, `Thanks!`].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n') });
    const send = () => { let url = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subj.value)}&body=${encodeURIComponent(body.value)}`; if (url.length > 1900) { toast('The message is long — your email app may cut it off. Use “Copy message” instead.', true); } const a = h('a', { href: url }); document.body.append(a); a.click(); a.remove(); };
    const copy = async (t, ok) => { try { await navigator.clipboard.writeText(t); toast(ok); } catch (e) { toast('Copy failed — select the text and copy it by hand.', true); } };
    modal({ title: `Email Day ${n + 1} call sheet`, wide: false, body: h('div', {},
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, `Recipients (${emails.length}) — added as BCC`), h('div', { class: 'small', style: { padding: '8px 10px', background: 'var(--surface2)', borderRadius: '2px', wordBreak: 'break-all' } }, emails.join(', ') || 'No email addresses yet — add them in Cast & Crew.')),
      missing.length ? h('p', { class: 'small muted', style: { marginTop: 0 } }, `No email on file for: ${missing.join(', ')}`) : null,
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Subject'), subj), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Message'), body),
      h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'Browsers can’t attach files to an email automatically: click Print / PDF, save the call sheet as a PDF, then attach it in your email app.')),
      buttons: [{ label: 'Copy addresses', onClick: () => { copy(emails.join(', '), 'Addresses copied'); return false; } }, { label: 'Copy message', onClick: () => { copy(body.value, 'Message copied'); return false; } }, { label: 'Open in email app', primary: true, onClick: send }] });
  }
  root.append(h('div', { class: 'toolbar' }, sel, h('span', { class: 'grow' }), h('a', { class: 'btn', href: `#/p/${P.id}/schedule` }, icon('calendar', 15), 'Schedule'),
    h('button', { class: 'btn', onclick: () => printSides(P, day) }, icon('file', 15), 'Sides'),
    h('button', { class: 'btn', onclick: emailDay }, icon('mail', 15), 'Email'),
    h('button', { class: 'btn primary', onclick: () => printNode(buildSheet(false)) }, icon('print', 15), 'Print / PDF')), holder);

  function buildSheet(editable) {
    const n = P.days.indexOf(day), ds = dayScenes(P, day, scenes), c = day.cs, crew = P.people.filter(p => p.type === 'crew'), cast = P.people.filter(p => p.type === 'cast');
    const F = (obj, key, o = {}) => editable
      ? h(o.area ? 'textarea' : 'input', { class: 'in', type: o.area ? undefined : (o.type || 'text'), placeholder: o.ph || '', value: obj[key] || '', oninput: e => { obj[key] = e.target.value; Store.touch(); } })
      : h('span', { style: { whiteSpace: 'pre-wrap' } }, o.type === 'time' ? fmtTime(obj[key]) : (obj[key] || ''));
    const cell = (k, el) => h('div', {}, h('span', { class: 'k' }, k), el);
    const locNames = [...new Set(ds.map(s => { const m = P.sceneMeta[s.id], L = m && m.locationId && P.locations.find(l => l.id === m.locationId); return L && L.name ? L.name : s.location; }).filter(Boolean))];
    const callOf = id => day.calls[id] = day.calls[id] || {};
    const castIds = cast.map(p => p.id);
    const chars = new Set(); ds.forEach(s => sceneCast(P, s).forEach(x => chars.add(x)));
    const castRows = [...chars].map(ch => ({ ch, person: cast.find(p => normChar(p.character) === ch) }));
    const nextDay = P.days[n + 1];
    const th = (...a) => h('thead', {}, h('tr', {}, a.map(x => h('th', {}, x))));
    const conf = editable ? dayConflicts(P, day, scenes) : [];
    return h('div', { class: 'cs' },
      conf.length ? h('div', { class: 'csalert' }, h('b', {}, 'Scheduling conflicts: '), conf.join(' · ')) : null,
      h('div', { class: 'cs-top' },
        h('div', {}, h('h1', {}, P.title), h('div', { style: { fontSize: '18px', fontWeight: 700, marginTop: '4px' } }, `${(day.kind && day.kind !== 'Shoot') ? day.kind.toUpperCase() + ' CALL' : 'CALL SHEET'} — Day ${n + 1} of ${P.days.length}`), h('div', { style: { color: '#444' } }, day.date ? fmtDate(day.date) : 'Date not set')),
        h('div', { class: 'cs-call' }, h('span', { class: 'k' }, TERM.crewCall), h('div', { class: 'big' }, editable ? F(c, 'crew', { type: 'time' }) : fmtTime(c.crew)))),
      h('div', { class: 'grid4', style: { borderTop: '1px solid #c8c8c8' } }, cell('Shooting call', F(c, 'shoot', { type: 'time' })), cell('Lunch', F(c, 'lunch', { type: 'time' })), cell('Est. wrap', F(c, 'wrap', { type: 'time' })), cell('Total pages', h('b', {}, fmtEighths(sum(ds, s => s.eighths))))),
      h('div', { class: 'grid4' }, cell('Sunrise', F(c, 'sunrise', { type: 'time' })), cell('Sunset', F(c, 'sunset', { type: 'time' })), cell('Weather', F(c, 'weather', { ph: 'Partly cloudy' })), cell('Temp', F(c, 'temp', { ph: '18° / 9°' }))),
      h('div', { class: 'grid4' }, cell('Nearest hospital', F(c, 'hospital')), cell('Hospital address', F(c, 'hospAddr')), cell('Basecamp / parking', F(c, 'basecamp')), cell('Production office', F(c, 'office'))),
      h('h4', {}, 'Locations'),
      h('table', {}, th('Location', 'Address / notes'), h('tbody', {}, locNames.length ? locNames.map(nm => { const L = P.locations.find(l => l.name && nm.toUpperCase().includes(l.name.toUpperCase())); return h('tr', {}, h('td', {}, h('b', {}, nm)), h('td', {}, L ? [L.address, L.notes].filter(Boolean).join(' — ') : '—')); }) : h('tr', {}, h('td', { colspan: 2 }, 'No scenes scheduled for this day.')))),
      h('h4', {}, 'Scenes'),
      h('table', {}, th('Sc', 'I/E', 'D/N', 'Scene', 'Description', 'Cast', 'Pgs'), h('tbody', {}, ds.map(s => h('tr', {}, h('td', {}, h('b', {}, s.num)), h('td', {}, s.ioe), h('td', {}, s.tod), h('td', {}, locName(P, s) || s.label), h('td', {}, s.synopsis || ''),
        h('td', {}, [...sceneCast(P, s)].map(ch => { const i = cast.findIndex(p => normChar(p.character) === ch); return i >= 0 ? i + 1 : ch; }).join(', ')), h('td', {}, fmtEighths(s.eighths)))))),
      ...(() => { const ids = new Set(ds.map(s => s.id)), pr = P.props.filter(x => x.sceneIds.some(i => ids.has(i))); if (!pr.length) return []; return [h('h4', {}, 'Props & set dressing'),
        h('table', {}, th('Prop', 'Category', 'Qty', 'Scenes', 'Status', 'Storage / notes'), h('tbody', {}, pr.map(x => h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, x.category), h('td', {}, String(x.qty)),
          h('td', {}, x.sceneIds.filter(i => ids.has(i)).map(i => (scenes.find(s => s.id === i) || {}).num).join(', ')), h('td', {}, x.status), h('td', {}, [x.storage, x.notes].filter(Boolean).join(' — '))))))]; })(),
      ...(() => { const ids = new Set(ds.map(s => s.id)), wd = P.wardrobe.filter(x => x.sceneIds.some(i => ids.has(i))); if (!wd.length) return []; return [h('h4', {}, 'Wardrobe & makeup'),
        h('table', {}, th('Item', 'Character(s)', 'Look', 'Qty', 'Scenes', 'Status', 'Fit / care'), h('tbody', {}, wd.map(x => h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, [...new Set(x.sceneIds.filter(i => ids.has(i)).flatMap(i => itemCharsIn(x, i)))].join(', ')), h('td', {}, x.look || ''), h('td', {}, String(x.qty)),
          h('td', {}, x.sceneIds.filter(i => ids.has(i)).map(i => (scenes.find(s => s.id === i) || {}).num).join(', ')), h('td', {}, x.status), h('td', {}, [x.size, x.care].filter(Boolean).join(' — '))))))]; })(),
      h('h4', {}, 'Cast'),
      h('table', {}, th('#', 'Cast', 'Character', 'Pickup', 'Makeup / wardrobe', 'Set call', 'Notes'),
        h('tbody', {}, castRows.length ? castRows.map(r => { const p = r.person, cl = p ? callOf(p.id) : {}; return h('tr', {}, h('td', {}, p ? castIds.indexOf(p.id) + 1 : '—'), h('td', {}, p ? p.name : h('i', {}, 'Unassigned')), h('td', {}, r.ch),
          p ? [F(cl, 'pickup', { type: 'time' }), F(cl, 'makeup', { type: 'time' }), F(cl, 'set', { type: 'time' }), F(cl, 'notes')].map(x => h('td', {}, x)) : h('td', { colspan: 4 }, h('span', { class: 'muted' }, 'Add this actor in Cast & Crew'))); })
          : h('tr', {}, h('td', { colspan: 7 }, 'No speaking or tagged cast in the scenes scheduled.')))),
      h('h4', {}, 'Crew'),
      h('table', {}, th('Department', 'Name', 'Position', 'Call', 'Phone'),
        h('tbody', {}, crew.length ? crew.map(p => { const cl = callOf(p.id); return h('tr', {}, h('td', {}, p.dept), h('td', {}, h('b', {}, p.name)), h('td', {}, p.role), h('td', {}, F(cl, 'set', { type: 'time' }), !editable && !cl.set ? fmtTime(c.crew) : null), h('td', {}, p.phone)); })
          : h('tr', {}, h('td', { colspan: 5 }, 'No crew added yet — add them in Cast & Crew.')))),
      h('h4', {}, 'Notes & safety'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid #c8c8c8', borderTop: 0 } },
        h('div', { style: { padding: '6px 9px', borderRight: '1px solid #c8c8c8' } }, h('span', { class: 'k' }, 'General notes'), F(c, 'notes', { area: true, ph: 'Parking, catering, special equipment…' })),
        h('div', { style: { padding: '6px 9px' } }, h('span', { class: 'k' }, 'Safety'), F(c, 'safety', { area: true, ph: 'Stunts, weather, location hazards…' }))),
      nextDay ? h('div', { style: { marginTop: '14px', color: '#444', fontSize: '12.5px' } }, h('b', {}, `Advance — Day ${n + 2}${nextDay.date ? ', ' + fmtDateShort(nextDay.date) : ''}: `), dayScenes(P, nextDay, scenes).map(s => `Sc ${s.num}`).join(', ') || 'no scenes yet') : null);
  }
  function draw() { holder.innerHTML = ''; holder.append(buildSheet(true)); }
  draw();
};
