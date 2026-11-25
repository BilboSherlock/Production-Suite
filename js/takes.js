'use strict';
/* ===================================================================
   Script supervisor — take log, circle takes, camera & sound reports.
   VIEW. Rules: js/models/takes.model.js; screen state and commands:
   js/viewmodels/takes.vm.js. The lined script tab is js/lined.js.
   =================================================================== */
/* these names are kept for older callers */
const TAKE_STATUS = TakesModel.STATUS;
const takeStatusLabel = k => TakesModel.statusLabel(k);
const newTake = (shotId, n, o) => TakesModel.newTake(shotId, n, o);
const takesOfShot = (P, id) => TakesModel.ofShot(P, id);

Views.takes = function (root) {
  const vm = new TakesVM(), P = vm.P;
  if (!vm.scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes yet'), h('p', {}, 'Write scenes and plan shots first — the take log is kept shot by shot.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/script` }, 'Go to Script')))); return; }
  root.parentElement.classList.add('noscroll');
  const done = () => root.parentElement.classList.remove('noscroll');
  if (vm.tab === 'lined') { const off = mountLined(root); return () => { done(); if (off) off(); }; }

  const count = h('span', { class: 'small muted' });
  const left = h('div', { class: 'stage-side' }), main = h('div', { class: 'stage-main', style: { overflow: 'auto', alignItems: 'stretch' } });
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' },
    count, h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => { vm.setTab('lined'); Router.refresh(); } }, icon('pen', 15), 'Lined script'),
    h('button', { class: 'btn', onclick: () => report('camera') }, icon('print', 15), TERM.camReport), h('button', { class: 'btn', onclick: () => report('sound') }, icon('print', 15), TERM.soundReport), h('button', { class: 'btn', onclick: () => report('continuity') }, icon('print', 15), 'Continuity log'),
    h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-takes.csv', toCSV(vm.csvRows()), 'text/csv') }, icon('download', 15), 'CSV')),
    h('div', { class: 'stage-wrap' }, left, main)));

  function report(kind) {
    const r = vm.report(kind); if (!r) return toast('No takes logged yet.', true);
    printTable(kind === 'camera' ? TERM.camReport : kind === 'sound' ? TERM.soundReport : 'Continuity log', r.headers, r.rows);
  }
  function setStatus(t, v) { const shot = vm.setStatus(t.id, v); if (shot) toast(`Shot ${ShotsModel.label(vm.P, shot, vm.scenes)} marked as shot in the shot list`); }

  function drawLeft() {
    morph(left, [h('h3', { style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', marginBottom: '8px' } }, 'Scenes'),
      ...vm.sceneList.map(({ scene: s, on, text }) => h('div', { class: 'frame-i' + (on ? ' on' : ''), 'data-key': s.id, style: { marginBottom: '6px', flexDirection: 'column', alignItems: 'stretch', gap: '2px' }, onclick: () => vm.setScene(s.id) },
        h('b', {}, `${s.num}. ${s.label}`.slice(0, 40)), h('span', { class: 'small muted' }, text)))]);
  }
  const takeRow = t => h('tr', { class: t.status === 'ng' ? 'done' : '', 'data-key': t.id },
    h('td', { style: { width: '60px' } }, h('input', { class: 'cell', type: 'number', min: 1, value: t.n, style: { fontWeight: 700 }, onchange: e => vm.setTake(t.id, 'n', e.target.value) })),
    h('td', { style: { width: '140px' } }, h('select', { class: 'cell', onchange: e => setStatus(t, e.target.value) }, TakesModel.STATUS.map(([k, l]) => h('option', { value: k, selected: k === t.status }, l)))),
    ...['roll', 'sound', 'tc', 'len'].map((k, i) => h('td', { style: { width: ['110px', '110px', '100px', '80px'][i] } }, h('input', { class: 'cell', value: t[k], placeholder: ['A001', 'S01', '01:02:03', '0:45'][i], oninput: e => vm.setTake(t.id, k, e.target.value) }))),
    h('td', {}, h('input', { class: 'cell', value: t.notes, placeholder: 'Great energy / line flub / plane overhead…', oninput: e => vm.setTake(t.id, 'notes', e.target.value) })),
    h('td', { style: { width: '40px' } }, ibtn('trash', 'Delete take', () => vm.removeTake(t.id), 'danger')));
  function drawMain() {
    const s = vm.scene, shots = vm.shots;
    const head = h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h2', { style: { fontSize: '20px' } }, `Scene ${s.num} — ${s.label}`), h('span', { class: 'grow' }), h('a', { class: 'btn sm', href: `#/p/${P.id}/shots`, onclick: () => vm.showShots(s.id) }, icon('camera', 14), 'Shot list'));
    if (!shots.length) return morph(main, [head, h('div', { class: 'empty' }, h('h3', {}, 'No shots in this scene'), h('p', {}, 'Takes are logged against planned shots. Add them in the Shot List, or use the Shot list → More → master shot button.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/shots`, onclick: () => vm.showShots(s.id) }, 'Open shot list'))]);
    morph(main, [head, ...shots.map(({ shot: x, takes: ts, circled, slate }) => h('div', { class: 'card', 'data-key': x.id, style: { padding: '12px 14px', marginBottom: '12px', borderColor: circled ? 'var(--ok)' : 'var(--border)' } },
      h('div', { class: 'row', style: { marginBottom: '8px' } }, h('b', { style: { fontFamily: 'var(--head)', fontSize: '16px' } }, `Slate ${slate}`), h('span', { class: 'muted small clip', style: { flex: 1 } }, [x.size, x.lens, x.desc].filter(Boolean).join(' · ')), circled ? h('span', { class: 'pill', style: { background: 'var(--ok)', color: '#fff' } }, 'Circled') : null,
        h('button', { class: 'btn sm primary', onclick: () => vm.addTake(x.id) }, icon('plus', 13), 'Take')),
      ts.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Take', 'Status', 'Camera roll', 'Sound roll', 'TC in', 'Length', 'Notes — performance, continuity, problems', ''].map(c => h('th', {}, c)))),
        h('tbody', {}, ts.map(takeRow))) : h('div', { class: 'small muted' }, 'No takes yet — press “Take” on the clap.')))]);
  }
  const unbind = bindView(vm, () => { count.textContent = vm.totalsText; drawLeft(); drawMain(); });
  return () => { done(); unbind(); };
};
