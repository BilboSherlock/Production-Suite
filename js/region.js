'use strict';
/* ===================================================================
   Regional standards — US or UK conventions as a project option.
   Terminology, date & time format, paper size, units, currency,
   payroll / tax wording and working-time defaults.
   VIEW (and pushing a region's words and page size into the app).
   Rules: js/models/region.model.js; the dialog's draft and commands:
   js/viewmodels/region.vm.js.
   =================================================================== */
/* these names are kept for older callers (the fallback region is the global choice, Prefs.region) */
const REGIONS = RegionModel.REGIONS;
const TERM = Object.assign({}, REGIONS.US.terms);
const fallbackRegion = () => (typeof Prefs !== 'undefined' ? Prefs.region : 'US');
const regionOf = P => RegionModel.regionOf(P === undefined ? Store.P : P, fallbackRegion());
const regionDef = P => REGIONS[regionOf(P)];
/* effective options: the project's own value, else the region default */
const optOf = (P, k) => RegionModel.optOf(P, k, fallbackRegion());
const clock24 = () => optOf(Store.P, 'clock') === '24';
const useMetric = P => optOf(P === undefined ? Store.P : P, 'units') === 'metric';
const paperOf = P => optOf(P === undefined ? Store.P : P, 'paper');
const lppOf = p => (LPP[p.mode] || 54) + (paperOf(p) === 'a4' ? 4 : 0);   // A4 is 0.69in taller than Letter ≈ 4 more lines
const syncStageUnits = P => RegionModel.syncStageUnits(P, fallbackRegion());
const turnaroundWarn = (P, n) => RegionModel.turnaroundWarn(P, n, fallbackRegion());

/* push the project's regional vocabulary into the shared labels the UI reads */
function applyTerms(P) {
  const r = regionDef(P); Object.assign(TERM, REGIONS.US.terms, r.terms);
  if (typeof CATS !== 'undefined') { const w = CATS.find(c => c.k === 'wardrobe'), m = CATS.find(c => c.k === 'makeup'); if (w) w.label = TERM.wardrobe; if (m) m.label = TERM.makeup; }
  if (typeof CATMAP !== 'undefined') { if (CATMAP.wardrobe) CATMAP.wardrobe.label = TERM.wardrobe; if (CATMAP.makeup) CATMAP.makeup.label = TERM.makeup; }
  if (typeof ITEM_KINDS !== 'undefined' && ITEM_KINDS.wardrobe) { ITEM_KINDS.wardrobe.label = TERM.wardrobe; ITEM_KINDS.wardrobe.one = TERM.wardrobeOne; }
  if (typeof UNIONS !== 'undefined') UNIONS.splice(0, UNIONS.length, ...r.unions);
  if (typeof DEPTS !== 'undefined') DEPTS.splice(0, DEPTS.length, ...r.depts);
  if (typeof FEATURE_DEFS !== 'undefined') FEATURE_DEFS.forEach(f => { if (f[0] === 'takes') f[1] = TERM.supervisor; if (f[0] === 'props') f[1] = `Props & ${TERM.wardrobe.toLowerCase()}`; });
  if (typeof NAV_LABELS !== 'undefined') NAV_LABELS.photo.props = `Props & ${TERM.wardrobe.toLowerCase()}`;
  applyPaperCss(P);
}
/* printed page size (the browser reads @page at print time) and the on-screen sheet */
function applyPaperCss(P) {
  let st = document.getElementById('paperCss'); if (!st) { st = document.createElement('style'); st.id = 'paperCss'; document.head.append(st); }
  const a4 = paperOf(P) === 'a4';
  st.textContent = a4 ? '@page { size: A4; margin: 0.6in; } @page script { size: A4; margin: 0; } @page land { size: A4 landscape; margin: 0.5in; } @media print { .print-script .sp { width: 8.27in !important; height: 11.69in !important; padding-right: .77in !important; } .print-lined .lp { width: 8.27in; height: 11.69in; } } .paper { width: 8.27in; min-height: 11.69in; padding-right: .77in; } .paper.stage { padding-right: 1.1in; }' : '';
}

/* switch a project between US and UK conventions (also used for new projects) */
function applyRegion(P, to, { keepCustom = false } = {}) {
  if (!RegionModel.switchRegion(P, to, { keepCustom }, fallbackRegion())) return;
  applyTerms(P); Store.touch();
}

/* ---------- the options dialog ---------- */
function openProjectOptions(P) {
  const vm = new RegionVM({ project: () => P }), box = h('div');
  const head = (text, top) => h('h4', { style: { margin: `${top} 0 8px`, fontSize: '12px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' } }, text);
  const num = (k, label) => h('label', { class: 'row small' }, label, h('input', { class: 'inp', type: 'number', min: 0, step: 0.5, value: vm.D[k] === '' ? '' : vm.D[k], placeholder: String(vm.def[k]), style: { width: '84px' }, oninput: e => vm.set(k, e.target.value) }));
  const sel = (k, label, opts) => h('label', { class: 'row small' }, label, h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.set(k, e.target.value) }, [['', `Region default`], ...opts].map(([v, l]) => h('option', { value: v, selected: v === vm.D[k] }, l))));
  const unbind = bindView(vm, () => morph(box, [
    h('div', { class: 'preset-grid', style: { gridTemplateColumns: '1fr 1fr' } }, Object.entries(REGIONS).map(([k, r]) => h('button', { class: 'preset' + (vm.region === k ? ' on' : ''), onclick: () => vm.setRegion(k) }, h('b', {}, `${r.short} · ${r.label}`), h('span', { class: 'small muted' }, r.blurb)))),
    head(`${vm.def.short} standards apply to`, '4px'), h('table', { class: 'tbl rep' }, h('tbody', {}, vm.summary.map(([k, v]) => h('tr', {}, h('td', { class: 'first' }, k), h('td', {}, v))))),
    head('Fine-tune', '18px'),
    h('div', { class: 'row wrap', style: { gap: '16px' } }, sel('clock', 'Clock', [['12', '12-hour'], ['24', '24-hour']]), sel('paper', 'Paper', [['letter', 'US Letter'], ['a4', 'A4']]), sel('units', 'Units', [['imperial', 'Feet & inches'], ['metric', 'Metric']]),
      h('label', { class: 'row small' }, 'Currency', h('input', { class: 'inp', value: vm.D.currency, placeholder: vm.def.currency, style: { width: '64px' }, oninput: e => vm.set('currency', e.target.value) }))),
    h('div', { class: 'row wrap', style: { gap: '16px', marginTop: '10px' } }, num('dayHours', 'Day length warning (h)'), num('mealHours', 'Meal break within (h)'), num('turnaround', 'Turnaround (h)')),
    h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'Working-time numbers are typical industry defaults, not legal advice — set them to match your agreements.')]));
  modal({ title: 'Standards & formats', wide: true, body: box, onClose: unbind, buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: () => {
    const r = vm.apply(); Router.refresh(); toast(`${r} standards applied`);
  } }] });
}
/* a quick chip in the top bar */
function regionChip(P) {
  const r = regionOf(P), sw = k => () => { if (new RegionVM({ project: () => P }).switchTo(k)) { Router.refresh(); toast(`${k} standards applied`); } };
  return h('button', { class: 'pill region-chip', title: 'Standards & formats (US / UK)', onclick: e => menu(e.currentTarget, [{ label: r === 'US' ? '✓ US standards' : 'Switch to US standards', onClick: sw('US') }, { label: r === 'UK' ? '✓ UK standards' : 'Switch to UK standards', onClick: sw('UK') }, { sep: true }, { label: 'Standards & formats…', icon: 'wand', onClick: () => openProjectOptions(P) }]) }, r);
}
