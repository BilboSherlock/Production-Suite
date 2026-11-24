'use strict';
/* ===================================================================
   Daily production reports — VIEW
   What was planned vs. what was shot. Rules live in DprModel
   (js/models/dpr.model.js), screen state in DprVM; this file draws.
   =================================================================== */
/** a blank report (the Live desk writes reports too) */
const newReport = () => DprModel.create();

/** Draw the daily report into `root`. Returns a function that disconnects it. */
function mountDPR(root, arg) {
  const vm = new DprVM({ dayId: arg });
  if (!vm.hasDays) {
    root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'Daily reports are written against your shooting schedule. Create a shoot day first.'), h('a', { class: 'btn primary', href: `#/p/${vm.P.id}/schedule` }, 'Go to Schedule'))));
    return () => vm.dispose();
  }
  const holder = h('div', { style: { maxWidth: '980px', margin: '16px auto 0' } }), sel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.selectDay(e.target.value) });
  root.append(h('div', { class: 'toolbar' }, sel,
    h('button', { class: 'btn', title: 'Pre-fill from the schedule and from shots marked done in the shot list', onclick: () => { const n = vm.autoFill(); toast(n ? `Filled ${n} scene${n > 1 ? 's' : ''} from the shot list` : 'No shots are marked done yet — tick them off in the Shot List.', !n); } }, icon('wand', 15), 'Fill from shot list'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => { const c = vm.csv; download(c.name, toCSV(c.rows), 'text/csv'); } }, icon('download', 15), 'CSV'),
    h('button', { class: 'btn primary', onclick: () => printNode(buildReport(vm, false)) }, icon('print', 15), 'Print / PDF')), holder);
  return bindView(vm, () => {
    sel.innerHTML = ''; sel.append(...vm.dayOptions.map(o => h('option', { value: o.id, selected: o.selected }, o.label)));
    holder.innerHTML = ''; holder.append(buildReport(vm, true));
  });
}

/** the report sheet: editable on screen, plain text for print */
function buildReport(vm, editable) {
  const P = vm.P, day = vm.day, R = vm.report;
  const cell = (k, el) => h('div', {}, h('span', { class: 'k' }, k), el);
  const th = (...a) => h('thead', {}, h('tr', {}, a.map(x => h('th', {}, x))));
  /* a field: `get` reads the saved value, `set` saves it quietly */
  const F = (value, set, o = {}) => editable
    ? h(o.area ? 'textarea' : 'input', { class: 'in', type: o.area ? undefined : (o.type || 'text'), placeholder: o.ph || '', value: value || '', oninput: e => { set(e.target.value); if (o.totals) refreshTotals(); } })
    : h('span', { style: { whiteSpace: 'pre-wrap' } }, o.type === 'time' ? fmtTime(value) : (value || ''));
  const field = (key, o) => F(R[key], v => vm.setField(key, v), o), time = key => F(R.t[key], v => vm.setTime(key, v), { type: 'time' });
  /* crew call and wrap change the hours worked, so they redraw when the field is left */
  const timeRedraw = (key, ph) => editable ? h('input', { class: 'in', type: 'time', value: R.t[key] || '', placeholder: ph || '', onchange: e => vm.setTime(key, e.target.value) }) : fmtTime(key === 'crew' ? vm.crewCall : R.t[key]);
  const totalsEl = () => { const t = vm.totals, e = fmtEighths;
    return h('div', { class: 'grid4', id: 'dprTotals' }, cell('Pages scheduled today', h('b', {}, e(t.day.sched))), cell('Pages shot today', h('b', {}, e(t.day.shot))), cell('Setups today', h('b', {}, String(t.day.setups))),
      cell('To date (shot / scheduled)', h('b', { style: { color: t.behind ? '#b4232f' : '#1d7a4b' } }, t.toDateText))); };
  let totalsBox = totalsEl();
  function refreshTotals() { const nn = totalsEl(); totalsBox.replaceWith(nn); totalsBox = nn; }
  const rows = vm.rows, perf = DprModel.perf(R), pf = (key, o = {}) => F(perf[key], v => vm.setPerf(key, v), o);
  return h('div', { class: 'cs' },
    h('div', { class: 'cs-top' },
      h('div', {}, h('h1', {}, P.title), h('div', { style: { fontSize: '18px', fontWeight: 700, marginTop: '4px' } }, vm.heading), h('div', { style: { color: '#444' } }, day.date ? fmtDate(day.date) : 'Date not set')),
      h('div', { class: 'cs-call' }, h('span', { class: 'k' }, 'Prepared by'), h('div', { style: { fontSize: '16px', fontWeight: 600 } }, field('by', { ph: 'Name / role' })))),
    h('div', { class: 'grid4', style: { borderTop: '1px solid #c8c8c8' } }, cell('Crew call', timeRedraw('crew', vm.crewCall)), cell('First shot', time('first')), cell('Lunch out', time('lunchOut')), cell('Lunch in', time('lunchIn'))),
    h('div', { class: 'grid4' }, cell('Wrap', timeRedraw('wrap')), cell('Hours worked', h('b', {}, vm.hoursWorked || '—')), cell('Weather', field('weather', { ph: 'Conditions / temp' })), cell('Scheduled call', fmtTime(day.cs && day.cs.shoot) || '—')),
    totalsBox,
    h('h4', {}, 'Scenes'),
    h('table', {}, th('Sc', 'Scene', 'Sched.', 'Status', 'Pgs shot (⅛)', 'Setups', 'Notes'),
      h('tbody', {}, rows.length ? rows.map(x => { const r = x.row, set = key => v => vm.setScene(x.id, key, v);
        return h('tr', {}, h('td', {}, h('b', {}, x.num), x.part ? h('div', { class: 'small' }, x.part) : null), h('td', {}, x.place), h('td', {}, fmtEighths(x.sched)),
          h('td', {}, editable ? h('select', { class: 'in', onchange: e => { vm.setScene(x.id, 'status', e.target.value); refreshTotals(); } }, DprModel.STATUS.map(o => h('option', { selected: o === (r.status || '') }, o))) : (r.status || '')),
          h('td', { style: { width: '90px' } }, editable ? h('input', { class: 'in', type: 'number', min: 0, value: r.pgs || '', oninput: e => { vm.setScene(x.id, 'pgs', e.target.value); refreshTotals(); } }) : (r.pgs ? fmtEighths(+r.pgs) : '')),
          h('td', { style: { width: '70px' } }, editable ? h('input', { class: 'in', type: 'number', min: 0, value: r.setups || '', oninput: e => { vm.setScene(x.id, 'setups', e.target.value); refreshTotals(); } }) : (r.setups || '')),
          h('td', {}, F(r.notes, set('notes'))));
      }) : h('tr', {}, h('td', { colspan: 7 }, 'No scenes scheduled for this day.')))),
    ...(vm.isPerformance ? [h('h4', {}, 'Performance'),
      h('div', { class: 'grid4' }, cell('House open', pf('house', { type: 'time' })), cell('Curtain up', pf('up', { type: 'time' })), cell(TERM.interval + ' in', pf('intIn', { type: 'time' })), cell(TERM.interval + ' out', pf('intOut', { type: 'time' }))),
      h('div', { class: 'grid4' }, cell('Curtain down', pf('down', { type: 'time' })), cell('Act 1 running', pf('run1', { ph: '52 min' })), cell('Act 2 running', pf('run2', { ph: '48 min' })), cell('Attendance', pf('att', { ph: '186 / 220' })))] : []),
    h('h4', {}, 'Production notes'),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #c8c8c8', borderTop: 0 } },
      ...DprModel.NOTES.map(([k, key, ph], i) => h('div', { style: { padding: '6px 9px', borderRight: i % 2 ? '0' : '1px solid #c8c8c8', borderTop: i > 1 ? '1px solid #c8c8c8' : '0' } }, h('span', { class: 'k' }, k), field(key, { area: true, ph })))),
    h('div', { style: { border: '1px solid #c8c8c8', borderTop: 0, padding: '6px 9px' } }, h('span', { class: 'k' }, 'General notes'), field('notes', { area: true, ph: 'Anything the producers should know…' })));
}
