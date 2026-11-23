'use strict';
/* ===================================================================
   Daily production reports — what was planned vs. what was shot
   =================================================================== */
const DPR_STATUS = ['', 'Completed', 'Partial', 'Not shot', 'Added'];
const toMins = t => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [a, b] = t.split(':').map(Number); return a * 60 + b; };
const fmtDur = m => m == null || m < 0 ? '' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
const newReport = () => ({ t: { crew: '', first: '', lunchOut: '', lunchIn: '', wrap: '' }, weather: '', scenes: {}, meals: '', incidents: '', equipment: '', media: '', overtime: '', notes: '', by: '' });

function mountDPR(root, arg) {
  const P = Store.P, scenes = getScenes(P);
  if (!P.days.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'Daily reports are written against your shooting schedule. Create a shoot day first.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/schedule` }, 'Go to Schedule')))); return; }
  let day = P.days.find(d => d.id === (arg || UI.dprDay)) || P.days[0]; UI.dprDay = day.id;
  const holder = h('div', { style: { maxWidth: '980px', margin: '16px auto 0' } });
  const sel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { day = P.days.find(d => d.id === e.target.value); UI.dprDay = day.id; draw(); } },
    P.days.map((d, i) => h('option', { value: d.id, selected: d === day }, `Day ${i + 1}${d.date ? ' — ' + fmtDateShort(d.date) : ''}${P.reports[d.id] ? ' ✓' : ''}`)));
  root.append(h('div', { class: 'toolbar' }, sel, h('button', { class: 'btn', onclick: autoFill, title: 'Pre-fill from the schedule and from shots marked done in the shot list' }, icon('wand', 15), 'Fill from shot list'), h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => download(slug(P.title) + `-dpr-day${P.days.indexOf(day) + 1}.csv`, toCSV(csvRows()), 'text/csv') }, icon('download', 15), 'CSV'),
    h('button', { class: 'btn primary', onclick: () => printNode(buildReport(false)) }, icon('print', 15), 'Print / PDF')), holder);

  const rep = () => P.reports[day.id] = P.reports[day.id] || newReport();
  function autoFill() {
    const R = rep(); let n = 0;
    dayScenes(P, day, scenes).forEach(s => {
      const sh = P.shots.filter(x => x.sceneId === s.id), done = sh.filter(x => x.done || (P.takes || []).some(t => t.shotId === x.id && t.status === 'circle')).length, r = R.scenes[s.id] = R.scenes[s.id] || {};
      if (!done) return; n++; r.setups = String(done);
      if (done === sh.length) { r.status = 'Completed'; r.pgs = String(s.eighths); } else { r.status = r.status || 'Partial'; }
    });
    if (!R.t.crew && day.cs && day.cs.crew) R.t.crew = day.cs.crew;
    Store.touch(); draw(); toast(n ? `Filled ${n} scene${n > 1 ? 's' : ''} from the shot list` : 'No shots are marked done yet — tick them off in the Shot List.', !n);
  }
  function totals(upTo) {
    let sched = 0, shot = 0, setups = 0;
    P.days.slice(0, upTo + 1).forEach(d => { const R = P.reports[d.id]; dayScenes(P, d, scenes).forEach(s => { sched += s.eighths; const r = R && R.scenes[s.id]; if (r && (r.status === 'Completed' || r.status === 'Partial' || r.status === 'Added')) shot += +r.pgs || 0; if (r) setups += +r.setups || 0; }); });
    return { sched, shot, setups };
  }
  function csvRows() {
    const R = rep(), rows = [['Scene', 'Description', 'Scheduled pgs', 'Status', 'Pgs shot (eighths)', 'Setups', 'Notes']];
    dayScenes(P, day, scenes).forEach(s => { const r = R.scenes[s.id] || {}; rows.push([s.num, locName(P, s) || s.label, fmtEighths(s.eighths), r.status || '', r.pgs || '', r.setups || '', r.notes || '']); });
    return rows;
  }

  function buildReport(editable) {
    const n = P.days.indexOf(day), R = rep(), ds = dayScenes(P, day, scenes);
    const F = (obj, key, o = {}) => editable
      ? h(o.area ? 'textarea' : 'input', { class: 'in', type: o.area ? undefined : (o.type || 'text'), placeholder: o.ph || '', value: obj[key] || '', oninput: e => { obj[key] = e.target.value; Store.touch(); if (o.refresh) refreshTotals(); } })
      : h('span', { style: { whiteSpace: 'pre-wrap' } }, o.type === 'time' ? fmtTime(obj[key]) : (obj[key] || ''));
    const cell = (k, el) => h('div', {}, h('span', { class: 'k' }, k), el);
    const th = (...a) => h('thead', {}, h('tr', {}, a.map(x => h('th', {}, x))));
    const crewT = R.t.crew || (day.cs && day.cs.crew) || '';
    const worked = (toMins(R.t.wrap) != null && toMins(crewT) != null) ? toMins(R.t.wrap) - toMins(crewT) - ((toMins(R.t.lunchIn) != null && toMins(R.t.lunchOut) != null) ? toMins(R.t.lunchIn) - toMins(R.t.lunchOut) : 0) : null;
    const dayTot = ds.reduce((a, s) => { const r = R.scenes[s.id] || {}; return { sched: a.sched + s.eighths, shot: a.shot + (['Completed', 'Partial', 'Added'].includes(r.status) ? (+r.pgs || 0) : 0), setups: a.setups + (+r.setups || 0) }; }, { sched: 0, shot: 0, setups: 0 });
    const td = totals(n), diff = td.shot - td.sched;
    const refreshTotals = () => { const b = $('#dprTotals'); if (b) { const nn = buildTotals(); b.replaceWith(nn); } };
    function buildTotals() {
      const dt = ds.reduce((a, s) => { const r = R.scenes[s.id] || {}; return { sched: a.sched + s.eighths, shot: a.shot + (['Completed', 'Partial', 'Added'].includes(r.status) ? (+r.pgs || 0) : 0), setups: a.setups + (+r.setups || 0) }; }, { sched: 0, shot: 0, setups: 0 });
      const t2 = totals(n), d2 = t2.shot - t2.sched;
      return h('div', { class: 'grid4', id: 'dprTotals' }, cell('Pages scheduled today', h('b', {}, fmtEighths(dt.sched))), cell('Pages shot today', h('b', {}, fmtEighths(dt.shot))), cell('Setups today', h('b', {}, String(dt.setups))),
        cell('To date (shot / scheduled)', h('b', { style: { color: d2 < 0 ? '#b4232f' : '#1d7a4b' } }, `${fmtEighths(t2.shot)} / ${fmtEighths(t2.sched)}${d2 ? (d2 < 0 ? ` · behind ${fmtEighths(-d2)}` : ` · ahead ${fmtEighths(d2)}`) : ' · on schedule'}`)));
    }
    return h('div', { class: 'cs' },
      h('div', { class: 'cs-top' },
        h('div', {}, h('h1', {}, P.title), h('div', { style: { fontSize: '18px', fontWeight: 700, marginTop: '4px' } }, `${day.kind === 'Performance' ? 'PERFORMANCE REPORT' : (day.kind && !['Shoot', 'Prep', 'Pickup', 'Reshoot'].includes(day.kind)) ? day.kind.toUpperCase() + ' REPORT' : 'DAILY PRODUCTION REPORT'} — Day ${n + 1} of ${P.days.length}`), h('div', { style: { color: '#444' } }, day.date ? fmtDate(day.date) : 'Date not set')),
        h('div', { class: 'cs-call' }, h('span', { class: 'k' }, 'Prepared by'), h('div', { style: { fontSize: '16px', fontWeight: 600 } }, F(R, 'by', { ph: 'Name / role' })))),
      h('div', { class: 'grid4', style: { borderTop: '1px solid #c8c8c8' } }, cell('Crew call', editable ? h('input', { class: 'in', type: 'time', value: R.t.crew || '', placeholder: crewT, onchange: e => { R.t.crew = e.target.value; Store.touch(); draw(); } }) : fmtTime(crewT)),
        cell('First shot', F(R.t, 'first', { type: 'time' })), cell('Lunch out', F(R.t, 'lunchOut', { type: 'time' })), cell('Lunch in', F(R.t, 'lunchIn', { type: 'time' }))),
      h('div', { class: 'grid4' }, cell('Wrap', editable ? h('input', { class: 'in', type: 'time', value: R.t.wrap || '', onchange: e => { R.t.wrap = e.target.value; Store.touch(); draw(); } }) : fmtTime(R.t.wrap)),
        cell('Hours worked', h('b', {}, fmtDur(worked) || '—')), cell('Weather', F(R, 'weather', { ph: 'Conditions / temp' })), cell('Scheduled call', fmtTime(day.cs && day.cs.shoot) || '—')),
      buildTotals(),
      h('h4', {}, 'Scenes'),
      h('table', {}, th('Sc', 'Scene', 'Sched.', 'Status', 'Pgs shot (⅛)', 'Setups', 'Notes'),
        h('tbody', {}, ds.length ? ds.map(s => { const r = R.scenes[s.id] = R.scenes[s.id] || {};
          return h('tr', {}, h('td', {}, h('b', {}, s.num)), h('td', {}, locName(P, s) || s.label), h('td', {}, fmtEighths(s.eighths)),
            h('td', {}, editable ? h('select', { class: 'in', onchange: e => { r.status = e.target.value; Store.touch(); refreshTotals(); } }, DPR_STATUS.map(o => h('option', { selected: o === (r.status || '') }, o))) : (r.status || '')),
            h('td', { style: { width: '90px' } }, editable ? h('input', { class: 'in', type: 'number', min: 0, value: r.pgs || '', oninput: e => { r.pgs = e.target.value; Store.touch(); refreshTotals(); } }) : (r.pgs ? fmtEighths(+r.pgs) : '')),
            h('td', { style: { width: '70px' } }, editable ? h('input', { class: 'in', type: 'number', min: 0, value: r.setups || '', oninput: e => { r.setups = e.target.value; Store.touch(); refreshTotals(); } }) : (r.setups || '')),
            h('td', {}, F(r, 'notes')));
        }) : h('tr', {}, h('td', { colspan: 7 }, 'No scenes scheduled for this day.')))),
      ...(day.kind === 'Performance' ? (() => { const pf = R.perf = R.perf || {}; return [h('h4', {}, 'Performance'),
        h('div', { class: 'grid4' }, cell('House open', F(pf, 'house', { type: 'time' })), cell('Curtain up', F(pf, 'up', { type: 'time' })), cell(TERM.interval + ' in', F(pf, 'intIn', { type: 'time' })), cell(TERM.interval + ' out', F(pf, 'intOut', { type: 'time' }))),
        h('div', { class: 'grid4' }, cell('Curtain down', F(pf, 'down', { type: 'time' })), cell('Act 1 running', F(pf, 'run1', { ph: '52 min' })), cell('Act 2 running', F(pf, 'run2', { ph: '48 min' })), cell('Attendance', F(pf, 'att', { ph: '186 / 220' })))]; })() : []),
      h('h4', {}, 'Production notes'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #c8c8c8', borderTop: 0 } },
        ...[['Meals & overtime', 'meals', 'Meal times, penalties, overtime…'], ['Incidents & safety', 'incidents', 'Injuries, near misses, delays…'], ['Equipment & issues', 'equipment', 'Breakdowns, rentals added…'], ['Media / data', 'media', 'Cards or drives used, backups verified…']]
          .map(([k, key, ph], i) => h('div', { style: { padding: '6px 9px', borderRight: i % 2 ? '0' : '1px solid #c8c8c8', borderTop: i > 1 ? '1px solid #c8c8c8' : '0' } }, h('span', { class: 'k' }, k), F(R, key, { area: true, ph })))),
      h('div', { style: { border: '1px solid #c8c8c8', borderTop: 0, padding: '6px 9px' } }, h('span', { class: 'k' }, 'General notes'), F(R, 'notes', { area: true, ph: 'Anything the producers should know…' })));
  }
  function draw() { holder.innerHTML = ''; holder.append(buildReport(true)); }
  draw();
}
