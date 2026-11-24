'use strict';
/* ===================================================================
   Schedule — VIEW (stripboard + calendar)
   Builds the screen from ScheduleVM and sends every change through it;
   never edits project data directly.
   Model: js/models/schedule.model.js · View model: js/viewmodels/schedule.vm.js
   =================================================================== */
Views.schedule = function (root) {
  const vm = new ScheduleVM(), P = vm.P;
  if (!vm.hasScenes) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes to schedule yet'), h('p', {}, 'Write some scenes in the Script view, then drag them onto shoot days here.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/script` }, 'Go to Script')))); return; }
  root.parentElement.classList.add('noscroll');
  const pool = h('div', { class: 'sched-pool' }), daysEl = h('div', { class: 'sched-days' }), stats = h('span', { class: 'small muted' });
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

  /* the toolbar is built once; draw() redraws the pool and the days */
  const modeSeg = h('div', { class: 'seg' }, [['board', 'Stripboard'], ['calendar', 'Calendar']].map(([k, l]) => h('button', { 'data-k': k, onclick: () => vm.setMode(k) }, l)));
  const toolbar = h('div', { class: 'toolbar' }, modeSeg,
    h('button', { class: 'btn primary', onclick: () => { vm.addDay(); daysEl.scrollTop = daysEl.scrollHeight; } }, icon('plus', 15), vm.addLabel),
    h('button', { class: 'btn', onclick: autoSchedule }, icon('wand', 15), 'Auto-schedule…'),
    h('button', { class: 'btn', onclick: () => vm.sortByDate() }, icon('calendar', 15), 'Sort by date'),
    h('label', { class: 'row small', title: 'Length of a shooting day — days over this are flagged' }, 'Day', h('input', { class: 'inp', type: 'number', min: 1, max: 24, step: .5, value: vm.dayHours, style: { width: '58px', padding: '3px 6px' }, onchange: e => vm.setDayHours(e.target.value) }), 'h'),
    h('label', { class: 'row small', title: 'Estimated shooting minutes per script page, used when a scene has no estimate of its own' }, h('input', { class: 'inp', type: 'number', min: 5, max: 600, value: vm.minsPerPage, style: { width: '58px', padding: '3px 6px' }, onchange: e => vm.setMinsPerPage(e.target.value) }), 'min/page'),
    stats, h('span', { class: 'grow' }),
    h('div', { class: 'legend' }, [['#fff', 'INT day'], ['#fff2a8', 'EXT day'], ['#b9d4f7', 'INT night'], ['#b5e6c2', 'EXT night']].map(([c, l]) => h('span', {}, h('i', { style: { background: c } }), l))),
    h('button', { class: 'btn', onclick: printSchedule }, icon('print', 15), 'Print schedule'));
  root.append(h('div', { class: 'script-wrap' }, toolbar, h('div', { class: 'sched' }, pool, daysEl)));

  /* a strip: a whole scene, or one part of a split scene ("pt 1/2") */
  function strip(slot) {
    const v = vm.strip(slot);
    const more = h('button', { class: 'strip-more', title: v.part ? 'Split scene: change or merge' : 'Split this scene across days', 'aria-label': 'Scene options',
      onclick: e => { e.stopPropagation(); menu(e.currentTarget, v.part
        ? [{ head: `Scene ${v.num} — part ${v.part.n} of ${v.part.of}` }, { label: 'Change split…', icon: 'layers', onClick: () => splitDialog(v.sceneId) }, { label: 'Merge parts back into one', icon: 'cards', onClick: () => mergeScene(v.sceneId) }]
        : [{ head: `Scene ${v.num}` }, { label: 'Split across days…', icon: 'layers', onClick: () => splitDialog(v.sceneId) }]); } }, icon('more', 15));
    const el = h('div', { class: 'strip ' + v.cls + (v.part ? ' part' : ''), title: 'Drag to a shoot day' },
      h('span', { class: 'sn' }, v.num, v.part ? h('small', { class: 'ptag', title: `Part ${v.part.n} of ${v.part.of} of a split scene` }, `pt ${v.part.n}/${v.part.of}`) : null), h('span', { class: 'ie' }, v.ie),
      h('div', { class: 'st' }, h('b', {}, v.title), h('span', {}, v.sub)),
      h('span', { class: 'pg', title: 'Estimated shooting time' }, fmtEighths(v.eighths) + ' pg · ' + fmtMin(v.mins)), more);
    return DnD.source(el, 'strip', v.id);
  }
  /* a shoot day (or the unscheduled pool, dayId = null): drop a strip at any position */
  const zone = (el, dayId) => DnD.zone(el, 'strip', (id, i) => {
    if (vm.dropSlot(id, dayId, i) === false) toast('That day already has another part of this scene. A day holds one part of each scene: merge the parts if it is all shot together.', true);
  }, { items: '.strip' });

  /* split a scene into parts (sizes in eighths of a page), or change / undo a split */
  function splitDialog(sceneId) {
    const info = vm.splitInfo(sceneId); if (!info) return;
    const total = info.eighths, maxParts = Math.max(2, Math.min(8, total));
    let sizes = info.split ? info.parts.map(p => p.eighths) : ScheduleModel.evenSizes(total, 2);
    const notes = info.split ? info.parts.map(p => p.note) : [];
    const rows = h('div', {}), sumEl = h('p', { class: 'small', style: { margin: '8px 0 0' } });
    const count = h('select', { class: 'inp', style: { width: 'auto' }, onchange: () => { sizes = ScheduleModel.evenSizes(total, +count.value); drawRows(); } },
      Array.from({ length: maxParts - 1 }, (_, i) => i + 2).map(n => h('option', { value: n, selected: n === sizes.length }, `${n} parts`)));
    const where = i => { const p = info.parts[i]; return p ? (p.dayN ? `Day ${p.dayN}${p.date ? ' — ' + fmtDateShort(p.date) : ''}` : 'Unscheduled') : 'New — unscheduled'; };
    function check() {
      const sumE = sizes.reduce((a, x) => a + (+x || 0), 0), ok = sizes.every(x => x >= 1) && sumE === total;
      sumEl.className = 'small ' + (ok ? 'muted' : 'overdue');
      sumEl.textContent = ok ? `Parts add up to the whole scene (${fmtEighths(total)} pages).` : `Parts add up to ${fmtEighths(sumE)} of ${fmtEighths(total)} pages — make them match.`;
      return ok;
    }
    function drawRows() {
      rows.replaceChildren(...sizes.map((e, i) => {
        const out = h('span', { class: 'small muted', style: { minWidth: '60px' } }, fmtEighths(e) + ' pg');
        return h('div', { class: 'row', style: { gap: '10px', marginBottom: '8px', alignItems: 'center' } },
          h('b', { style: { minWidth: '52px' } }, `Part ${i + 1}`),
          h('input', { class: 'inp', type: 'number', min: 1, max: total, value: e, style: { width: '74px' }, title: 'Eighths of a page', oninput: ev => { sizes[i] = Math.round(+ev.target.value) || 0; out.textContent = fmtEighths(Math.max(0, sizes[i])) + ' pg'; check(); } }),
          h('span', { class: 'small muted' }, '/8'), out,
          h('input', { class: 'inp', placeholder: 'What this part covers (optional)', value: notes[i] || '', style: { flex: 1 }, oninput: ev => { notes[i] = ev.target.value; } }),
          h('span', { class: 'small muted', style: { minWidth: '110px' } }, where(i)));
      }));
      check();
    }
    drawRows();
    modal({ title: `${info.split ? 'Change split' : 'Split'} — scene ${info.num}`, body: h('div', {},
      h('p', { class: 'muted', style: { marginTop: 0 } }, `“${info.title}” is ${fmtEighths(total)} pages. Each part is its own strip you can put on a different day; cast and props stay with every part. Sizes are in eighths of a page.`),
      h('div', { class: 'row', style: { marginBottom: '12px' } }, 'Split into', count), rows, sumEl,
      info.split && sizes.length < info.parts.length ? h('p', { class: 'small muted' }, 'Fewer parts: the parts removed come off their days.') : null),
      buttons: [{ label: 'Cancel' }, ...(info.split ? [{ label: 'Merge back into one', onClick: () => mergeScene(sceneId) }] : []),
        { label: info.split ? 'Save split' : 'Split scene', primary: true, onClick: () => {
          if (!check()) { toast('The parts must add up to the whole scene.', true); return false; }
          const parts = vm.split(sceneId, sizes); if (!parts) { toast('Could not split: each part needs at least 1/8 page.', true); return false; }
          parts.forEach((p, i) => { if ((notes[i] || '') !== (p.note || '')) vm.setPartNote(sceneId, p.id, notes[i] || ''); });
          vm.refresh(); toast(`Scene ${info.num} is in ${parts.length} parts — drag each part to its day`);
        } }] });
  }
  function mergeScene(sceneId) {
    const info = vm.splitInfo(sceneId); if (!info || !info.split) return;
    const days = [...new Set(info.parts.filter(p => p.dayN).map(p => p.dayN))];
    vm.merge(sceneId);
    toast(days.length > 1 ? `Scene ${info.num} merged onto Day ${days[0]}` : `Scene ${info.num} is one strip again`);
  }

  function dayCard(d) {
    const pl = d.plan, cf = d.conflicts;
    return h('div', { class: 'card daycard' },
      h('div', { class: 'dayh' }, h('h3', {}, `Day ${d.n}`),
        h('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px', fontWeight: 600 }, title: 'What kind of day is this?', onchange: e => vm.setDayKind(d.id, e.target.value) }, vm.kinds.map(k => h('option', { selected: k === d.kind }, k))),
        h('input', { class: 'inp', type: 'date', value: d.date, style: { width: '160px' }, title: 'Shoot date', onchange: e => vm.setDayDate(d.id, e.target.value) }),
        h('span', { class: 'small muted' }, d.date ? new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' }) : ''),
        h('span', { class: 'pill accent' }, `${plural(d.scenes.length, 'scene')} · ${fmtEighths(d.eighths)} pgs`),
        h('span', { class: pl.over ? 'warnpill' : 'pill', title: `Scenes ${fmtMin(pl.mins)} + ${plural(pl.moves, 'company move')} (30 min each) against a ${vm.dayHours}-hour day` }, pl.over ? icon('alert', 12) : null, `~${fmtMin(pl.mins)}${pl.moves ? ` · ${plural(pl.moves, 'move')}` : ''}`),
        d.turnaround ? h('span', { class: 'warnpill', title: d.turnaround }, icon('alert', 12), 'Turnaround') : null,
        d.locations.length ? h('span', { class: 'small muted', style: { maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, d.locations.join(' · ')) : null,
        cf.length ? h('span', { class: 'warnpill', title: cf.join('\n') }, icon('alert', 13), plural(cf.length, 'conflict')) : null,
        h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', title: 'Print the script pages for this day', onclick: () => printSides(P, vm.P.days.find(x => x.id === d.id)) }, icon('file', 14), 'Sides'),
        h('a', { class: 'btn sm', href: `#/p/${P.id}/callsheet/${d.id}` }, icon('clipboard', 14), 'Call sheet'),
        ibtn('trash', 'Delete day (scenes return to the unscheduled list)', async () => { if (await confirmBox(`Delete Day ${d.n}? Its scenes go back to the unscheduled list.`)) vm.removeDay(d.id); }, 'danger')),
      zone(h('div', { class: 'zone' }, d.slots.map(strip), d.slots.length ? null : h('div', { class: 'muted small', style: { padding: '12px', textAlign: 'center' } }, 'Drag scenes here')), d.id));
  }
  function drawCalendar() {
    const cal = vm.calendar, title = new Date(cal.year, cal.month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const grid = h('div', { class: 'cal' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => h('div', { class: 'dow' }, x)));
    cal.cells.forEach(c => grid.append(h('div', { class: 'cell' + (c.inMonth ? '' : ' off') + (c.isToday ? ' today' : '') },
      h('span', { class: 'dn' }, c.date),
      h('button', { class: 'icon-btn add', style: { width: '24px', height: '24px' }, title: 'Add a shoot day on this date', onclick: () => vm.addDay(c.iso) }, icon('plus', 14)),
      c.days.map(x => h('a', { class: 'dchip' + (x.conflicts.length ? ' warn' : ''), href: `#/p/${P.id}/callsheet/${x.id}`, title: (x.conflicts.length ? x.conflicts.join('\n') + '\n' : '') + 'Open call sheet' }, `Day ${x.n} · ${x.count} sc`)))));
    daysEl.replaceChildren(h('div', { class: 'row', style: { marginBottom: '12px' } }, ibtn('left', 'Previous month', () => vm.shiftMonth(-1)), h('h3', { style: { minWidth: '170px', textAlign: 'center' } }, title), ibtn('right', 'Next month', () => vm.shiftMonth(1)),
      h('button', { class: 'btn sm', onclick: () => vm.thisMonth() }, 'Today')), grid,
      ...(cal.undated ? [h('p', { class: 'small muted', style: { marginTop: '14px' } }, `${cal.undated} shoot day${cal.undated > 1 ? 's have' : ' has'} no date yet — set dates in the Stripboard view.`)] : []));
  }
  function drawBoard() {
    const un = vm.pool, days = vm.days;
    pool.replaceChildren(h('div', { style: { padding: '12px 14px 4px' } }, h('h3', { style: { fontSize: '15px' } }, `Unscheduled scenes `, h('span', { class: 'pill' }, un.length)), h('div', { class: 'small muted' }, 'Drag a strip onto a shoot day →')),
      zone(h('div', { class: 'zone', style: { flex: 1, overflow: 'auto', margin: '6px' } }, un.length ? un.map(strip) : h('div', { class: 'empty', style: { padding: '30px 10px' } }, h('p', {}, '🎬 Every scene is scheduled.'))), null));
    daysEl.replaceChildren(...(days.length ? days.map(dayCard) : [h('div', { class: 'empty' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'Add a shoot day and drag scenes onto it — or let StudioBindahh group scenes by location automatically.'), h('button', { class: 'btn primary', onclick: autoSchedule }, icon('wand', 15), 'Auto-schedule'))]));
  }
  function draw() {
    const st = vm.stats, cal = vm.mode === 'calendar';
    $$('button', modeSeg).forEach(b => b.classList.toggle('on', b.dataset.k === vm.mode));
    pool.classList.toggle('hidden', cal);
    if (cal) { drawCalendar(); stats.textContent = `${plural(st.days, 'shoot day')} · ${st.scheduled}/${st.scenes} scenes scheduled`; return; }
    drawBoard();
    stats.textContent = `${st.scheduled}/${st.scenes} scenes scheduled · ${plural(st.days, 'day')} · ${fmtEighths(st.eighths)} total pages${st.split ? ` · ${plural(st.split, 'split scene')}` : ''}`;
  }
  function autoSchedule() {
    const n = vm.pool.length; if (!n) return toast('Every scene is already scheduled.');
    const ppd = h('input', { class: 'inp', type: 'number', min: 0.5, step: 0.5, value: 4 }), start = h('input', { class: 'inp', type: 'date', value: vm.autoStart });
    const wk = h('input', { type: 'checkbox', checked: true }), grp = h('input', { type: 'checkbox', checked: true });
    modal({ title: 'Auto-schedule', body: h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, `Place ${plural(n, 'unscheduled strip')} onto new shoot days. Parts of a split scene go on different days.`),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Target pages per day'), ppd), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'First shoot date'), start),
      h('label', { class: 'row', style: { marginBottom: '8px' } }, wk, 'Skip weekends'), h('label', { class: 'row' }, grp, 'Group scenes by location (fewer company moves)')),
      buttons: [{ label: 'Cancel' }, { label: 'Schedule', primary: true, onClick: () => {
        vm.autoSchedule({ pagesPerDay: +ppd.value || 4, start: start.value, skipWeekends: wk.checked, groupByLocation: grp.checked });
        toast('Schedule created — drag strips to fine-tune it');
      } }] });
  }
  function printSchedule() {
    const rows = [];
    vm.printGroups().forEach(g => {
      const d = g.day;
      rows.push({ grp: d ? `Day ${d.n}${d.date ? ' — ' + fmtDate(d.date) : ''} — ${g.rows.length} scenes, ${fmtEighths(d.eighths)} pages` : 'Unscheduled' });
      g.rows.forEach(r => rows.push(r.slice(0, 6).concat(fmtEighths(r[6]))));
    });
    printTable('Shooting schedule', ['Sc', 'I/E', 'D/N', 'Location', 'Synopsis', 'Cast', 'Pgs'], rows);
  }

  const unbind = bindView(vm, draw);
  return () => { unbind(); root.parentElement.classList.remove('noscroll'); };
};

/* ===================================================================
   Call sheet — VIEW
   Builds the sheet from CallSheetVM (editable on screen, plain for print)
   and sends every edit through it; never edits project data directly.
   Model: js/models/callsheet.model.js · View model: js/viewmodels/callsheet.vm.js
   =================================================================== */
Views.callsheet = function (root, arg) {
  const vm = new CallSheetVM({ dayId: arg }), P = vm.P;
  if (!vm.hasDays) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'Call sheets are generated from your schedule. Create a shoot day first.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/schedule` }, 'Go to Schedule')))); return; }
  const holder = h('div', { class: 'page', style: { maxWidth: '980px' } });
  const sel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { vm.selectDay(e.target.value); history.replaceState(null, '', `#/p/${P.id}/callsheet/${vm.day.id}`); } });

  function emailDay() {
    const e = vm.email, subj = h('input', { class: 'inp', value: e.subject }), body = h('textarea', { class: 'inp', rows: 12, value: e.body });
    const send = () => { const m = vm.mailto(subj.value, body.value); if (m.tooLong) toast('The message is long — your email app may cut it off. Use “Copy message” instead.', true); const a = h('a', { href: m.url }); document.body.append(a); a.click(); a.remove(); };
    const copy = async (t, ok) => { try { await navigator.clipboard.writeText(t); toast(ok); } catch (x) { toast('Copy failed — select the text and copy it by hand.', true); } };
    modal({ title: e.title, wide: false, body: h('div', {},
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, `Recipients (${e.emails.length}) — added as BCC`), h('div', { class: 'small', style: { padding: '8px 10px', background: 'var(--surface2)', borderRadius: '2px', wordBreak: 'break-all' } }, e.emails.join(', ') || 'No email addresses yet — add them in Cast & Crew.')),
      e.missing.length ? h('p', { class: 'small muted', style: { marginTop: 0 } }, `No email on file for: ${e.missing.join(', ')}`) : null,
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Subject'), subj), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Message'), body),
      h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'Browsers can’t attach files to an email automatically: click Print / PDF, save the call sheet as a PDF, then attach it in your email app.')),
      buttons: [{ label: 'Copy addresses', onClick: () => { copy(e.emails.join(', '), 'Addresses copied'); return false; } }, { label: 'Copy message', onClick: () => { copy(body.value, 'Message copied'); return false; } }, { label: 'Open in email app', primary: true, onClick: send }] });
  }
  root.append(h('div', { class: 'toolbar' }, sel, h('span', { class: 'grow' }), h('a', { class: 'btn', href: `#/p/${P.id}/schedule` }, icon('calendar', 15), 'Schedule'),
    h('button', { class: 'btn', onclick: () => printSides(P, vm.day) }, icon('file', 15), 'Sides'),
    h('button', { class: 'btn', onclick: emailDay }, icon('mail', 15), 'Email'),
    h('button', { class: 'btn primary', onclick: () => printNode(buildSheet(false)) }, icon('print', 15), 'Print / PDF')), holder);

  /* editable: inputs on screen; otherwise plain text for print */
  function buildSheet(editable) {
    const s = vm.sheet, c = s.cs;
    /* one field: value, how to save it, and options (type: 'time' | text, area, ph) */
    const F = (value, save, o = {}) => editable
      ? h(o.area ? 'textarea' : 'input', { class: 'in', type: o.area ? undefined : (o.type || 'text'), placeholder: o.ph || '', value: value || '', oninput: e => save(e.target.value) })
      : h('span', { style: { whiteSpace: 'pre-wrap' } }, o.type === 'time' ? fmtTime(value) : (value || ''));
    const cs = (key, o) => F(c[key], v => vm.setField(key, v), o);
    const call = (row, key, o) => F(row.call[key], v => vm.setCall(row.personId, key, v), o);
    const cell = (k, el) => h('div', {}, h('span', { class: 'k' }, k), el);
    const th = (...a) => h('thead', {}, h('tr', {}, a.map(x => h('th', {}, x))));
    return h('div', { class: 'cs' },
      editable && s.conflicts.length ? h('div', { class: 'csalert' }, h('b', {}, 'Scheduling conflicts: '), s.conflicts.join(' · ')) : null,
      h('div', { class: 'cs-top' },
        h('div', {}, h('h1', {}, P.title), h('div', { style: { fontSize: '18px', fontWeight: 700, marginTop: '4px' } }, s.heading), h('div', { style: { color: '#444' } }, s.date ? fmtDate(s.date) : 'Date not set')),
        h('div', { class: 'cs-call' }, h('span', { class: 'k' }, TERM.crewCall), h('div', { class: 'big' }, cs('crew', { type: 'time' })))),
      h('div', { class: 'grid4', style: { borderTop: '1px solid #c8c8c8' } }, cell('Shooting call', cs('shoot', { type: 'time' })), cell('Lunch', cs('lunch', { type: 'time' })), cell('Est. wrap', cs('wrap', { type: 'time' })), cell('Total pages', h('b', {}, fmtEighths(s.eighths)))),
      h('div', { class: 'grid4' }, cell('Sunrise', cs('sunrise', { type: 'time' })), cell('Sunset', cs('sunset', { type: 'time' })), cell('Weather', cs('weather', { ph: 'Partly cloudy' })), cell('Temp', cs('temp', { ph: '18° / 9°' }))),
      h('div', { class: 'grid4' }, cell('Nearest hospital', cs('hospital')), cell('Hospital address', cs('hospAddr')), cell('Basecamp / parking', cs('basecamp')), cell('Production office', cs('office'))),
      h('h4', {}, 'Locations'),
      h('table', {}, th('Location', 'Address / notes'), h('tbody', {}, s.locations.length ? s.locations.map(l => h('tr', {}, h('td', {}, h('b', {}, l.name)), h('td', {}, l.details || '—'))) : h('tr', {}, h('td', { colspan: 2 }, 'No scenes scheduled for this day.')))),
      h('h4', {}, 'Scenes'),
      h('table', {}, th('Sc', 'I/E', 'D/N', 'Scene', 'Description', 'Cast', 'Pgs'), h('tbody', {}, s.scenes.map(x => h('tr', {}, h('td', {}, h('b', {}, x.num), x.part ? h('div', { class: 'small' }, x.part) : null), h('td', {}, x.ioe), h('td', {}, x.tod), h('td', {}, x.place), h('td', {}, x.synopsis), h('td', {}, x.cast), h('td', {}, fmtEighths(x.eighths)))))),
      ...(s.props.length ? [h('h4', {}, 'Props & set dressing'),
        h('table', {}, th('Prop', 'Category', 'Qty', 'Scenes', 'Status', 'Storage / notes'), h('tbody', {}, s.props.map(x => h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, x.category), h('td', {}, String(x.qty)), h('td', {}, x.scenes.join(', ')), h('td', {}, x.status), h('td', {}, x.notes)))))] : []),
      ...(s.wardrobe.length ? [h('h4', {}, 'Wardrobe & makeup'),
        h('table', {}, th('Item', 'Character(s)', 'Look', 'Qty', 'Scenes', 'Status', 'Fit / care'), h('tbody', {}, s.wardrobe.map(x => h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, x.characters.join(', ')), h('td', {}, x.look), h('td', {}, String(x.qty)), h('td', {}, x.scenes.join(', ')), h('td', {}, x.status), h('td', {}, x.notes)))))] : []),
      h('h4', {}, 'Cast'),
      h('table', {}, th('#', 'Cast', 'Character', 'Pickup', 'Makeup / wardrobe', 'Set call', 'Notes'),
        h('tbody', {}, s.cast.length ? s.cast.map(r => h('tr', {}, h('td', {}, r.num || '—'), h('td', {}, r.personId ? r.name : h('i', {}, 'Unassigned')), h('td', {}, r.ch),
          r.personId ? [call(r, 'pickup', { type: 'time' }), call(r, 'makeup', { type: 'time' }), call(r, 'set', { type: 'time' }), call(r, 'notes')].map(x => h('td', {}, x)) : h('td', { colspan: 4 }, h('span', { class: 'muted' }, 'Add this actor in Cast & Crew'))))
          : h('tr', {}, h('td', { colspan: 7 }, 'No speaking or tagged cast in the scenes scheduled.')))),
      h('h4', {}, 'Crew'),
      h('table', {}, th('Department', 'Name', 'Position', 'Call', 'Phone'),
        h('tbody', {}, s.crew.length ? s.crew.map(r => h('tr', {}, h('td', {}, r.dept), h('td', {}, h('b', {}, r.name)), h('td', {}, r.role), h('td', {}, call(r, 'set', { type: 'time' }), !editable && !r.call.set ? fmtTime(r.defaultCall) : null), h('td', {}, r.phone)))
          : h('tr', {}, h('td', { colspan: 5 }, 'No crew added yet — add them in Cast & Crew.')))),
      h('h4', {}, 'Notes & safety'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid #c8c8c8', borderTop: 0 } },
        h('div', { style: { padding: '6px 9px', borderRight: '1px solid #c8c8c8' } }, h('span', { class: 'k' }, 'General notes'), cs('notes', { area: true, ph: 'Parking, catering, special equipment…' })),
        h('div', { style: { padding: '6px 9px' } }, h('span', { class: 'k' }, 'Safety'), cs('safety', { area: true, ph: 'Stunts, weather, location hazards…' }))),
      s.advance ? h('div', { style: { marginTop: '14px', color: '#444', fontSize: '12.5px' } }, h('b', {}, `Advance — Day ${s.advance.n}${s.advance.date ? ', ' + fmtDateShort(s.advance.date) : ''}: `), s.advance.scenes.map(n => `Sc ${n}`).join(', ') || 'no scenes yet') : null);
  }
  function draw() {
    sel.replaceChildren(...vm.dayOptions.map(o => h('option', { value: o.id, selected: o.selected }, o.label)));
    holder.replaceChildren(buildSheet(true));
  }
  const unbind = bindView(vm, draw);
  return unbind;
};
