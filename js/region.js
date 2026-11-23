'use strict';
/* ===================================================================
   Regional standards — US or UK conventions as a project option.
   Terminology, date & time format, paper size, units, currency,
   payroll / tax wording and working-time defaults.
   =================================================================== */
const REGIONS = {
  US: {
    label: 'United States', short: 'US', currency: '$', clock: '12', paper: 'letter', units: 'imperial', dayHours: 10, mealHours: 6, turnaround: 10, locale: 'en-US',
    terms: { wardrobe: 'Wardrobe', wardrobeOne: 'wardrobe item', makeup: 'Makeup & Hair', supervisor: 'Script supervisor', dpr: 'Daily production report', crewCall: 'General crew call', fringes: 'Fringes & payroll', tax: 'Sales tax', calling: 'Calling script', interval: 'Intermission', loadIn: 'Load-in / load-out', perDiem: 'Per diem', color: 'Color', runner: 'Production assistant', camReport: 'Camera report', soundReport: 'Sound report', moveWord: 'Company move', rushes: 'Dailies' },
    unions: ['', 'SAG-AFTRA', 'Equity (AEA)', 'IATSE', 'DGA', 'WGA', 'Teamsters', 'Non-union', 'Other'],
    depts: ['Direction', 'Production', 'Camera', 'Grip', 'Electric', 'Art', 'Wardrobe', 'Hair & Makeup', 'Sound', 'Stunts', 'Post', 'Stage Management', 'Lighting', 'Photography', 'Digital tech', 'Styling', 'Retouching', 'Studio', 'Client', 'Other'],
  },
  UK: {
    label: 'United Kingdom', short: 'UK', currency: '£', clock: '24', paper: 'a4', units: 'metric', dayHours: 11, mealHours: 5, turnaround: 11, locale: 'en-GB',
    terms: { wardrobe: 'Costume', wardrobeOne: 'costume item', makeup: 'Make-up & Hair', supervisor: 'Continuity', dpr: 'Daily progress report', crewCall: 'Unit call', fringes: 'Employer on-costs (NI, holiday pay)', tax: 'VAT', calling: 'Prompt copy', interval: 'Interval', loadIn: 'Get-in / get-out', perDiem: 'Subsistence', color: 'Colour', runner: 'Runner', camReport: 'Camera sheets', soundReport: 'Sound sheets', moveWord: 'Unit move', rushes: 'Rushes' },
    unions: ['', 'Equity', 'BECTU / Prospect', 'Directors UK', 'Writers’ Guild of GB', 'Musicians’ Union', 'Non-union', 'Other'],
    depts: ['Direction', 'Production', 'Camera', 'Grip', 'Electrics', 'Art', 'Costume', 'Make-up & Hair', 'Sound', 'Stunts', 'Post', 'Stage Management', 'Lighting', 'Photography', 'Digital tech', 'Styling', 'Retouching', 'Studio', 'Client', 'Other'],
  },
};
const TERM = Object.assign({}, REGIONS.US.terms);
const regionOf = P => { P = P === undefined ? Store.P : P; return (P && P.settings && REGIONS[P.settings.region] ? P.settings.region : (typeof Prefs !== 'undefined' && REGIONS[Prefs.region] ? Prefs.region : 'US')); };
const regionDef = P => REGIONS[regionOf(P)];
/* effective options: the project's own value, else the region default */
const optOf = (P, k) => (P && P.settings && P.settings[k]) || regionDef(P)[k];
const clock24 = () => optOf(Store.P, 'clock') === '24';
const useMetric = P => optOf(P === undefined ? Store.P : P, 'units') === 'metric';
const paperOf = P => optOf(P === undefined ? Store.P : P, 'paper');
const lppOf = p => (LPP[p.mode] || 54) + (paperOf(p) === 'a4' ? 4 : 0);   // A4 is 0.69in taller than Letter ≈ 4 more lines

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

/* switch a project between US and UK conventions */
function applyRegion(P, to, { keepCustom = false } = {}) {
  const from = regionOf(P); if (!REGIONS[to]) return; const a = REGIONS[from], b = REGIONS[to], S = P.settings;
  S.region = to;
  if (!keepCustom) { ['clock', 'paper', 'units'].forEach(k => delete S[k]); if (!S.currency || S.currency === a.currency) S.currency = b.currency; if (+S.dayHours === a.dayHours || !S.dayHours) S.dayHours = b.dayHours; S.mealHours = b.mealHours; S.turnaround = b.turnaround; }
  /* budget additions carry regional names */
  if (P.fin) P.fin.adds.forEach(x => { if (x.name === a.terms.fringes) x.name = b.terms.fringes; else if (x.name === a.terms.tax) x.name = b.terms.tax; });
  syncStageUnits(P);
  applyTerms(P); Store.touch();
}
/* convert stage / set plans between metres and feet when the unit system changes */
function syncStageUnits(P) {
  const metric = useMetric(P), want = metric ? 'm' : 'ft';
  ((P.stage && P.stage.plans) || []).forEach(pl => { const have = pl.unit || 'm'; if (have === want) return; const k = want === 'm' ? 1 / 3.28084 : 3.28084; pl.w = Math.round((+pl.w || 12) * k * 10) / 10; pl.d = Math.round((+pl.d || 8) * k * 10) / 10; pl.unit = want; });
}

/* ---------- the options dialog ---------- */
function openProjectOptions(P) {
  const S = P.settings; let region = regionOf(P); const draft = { clock: S.clock || '', paper: S.paper || '', units: S.units || '', currency: S.currency || '', dayHours: S.dayHours || '', mealHours: S.mealHours || '', turnaround: S.turnaround || '' };
  const box = h('div');
  const rows = () => {
    const r = REGIONS[region], changes = [['Terminology', `${r.terms.wardrobe}, ${r.terms.supervisor}, ${r.terms.dpr}, ${r.terms.crewCall}, ${r.terms.interval}`], ['Dates & time', `${region === 'UK' ? '1 December 2026' : 'December 1, 2026'} · ${r.clock === '24' ? '24-hour clock' : '12-hour clock'}`], ['Paper', r.paper === 'a4' ? 'A4 — scripts paginate to A4' : 'US Letter'], ['Units', r.units === 'metric' ? 'Metres & centimetres' : 'Feet & inches'], ['Money', `${r.currency} · ${r.terms.fringes} · ${r.terms.tax}`], ['Working time', `${r.dayHours} h day warning · meal by ${r.mealHours} h · ${r.turnaround} h turnaround (typical defaults — editable below)`], ['Unions & departments', r.unions.filter(Boolean).slice(0, 4).join(', ') + '…']];
    return h('table', { class: 'tbl rep' }, h('tbody', {}, changes.map(([k, v]) => h('tr', {}, h('td', { class: 'first' }, k), h('td', {}, v)))));
  };
  const num = (k, label, step) => h('label', { class: 'row small' }, label, h('input', { class: 'inp', type: 'number', min: 0, step: step || 0.5, value: draft[k] === '' ? '' : draft[k], placeholder: String(REGIONS[region][k]), style: { width: '84px' }, oninput: e => { draft[k] = e.target.value; } }));
  const sel = (k, label, opts) => h('label', { class: 'row small' }, label, h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { draft[k] = e.target.value; } }, [['', `Region default`], ...opts].map(([v, l]) => h('option', { value: v, selected: v === draft[k] }, l))));
  function draw() {
    box.replaceChildren(h('div', { class: 'preset-grid', style: { gridTemplateColumns: '1fr 1fr' } }, Object.entries(REGIONS).map(([k, r]) => h('button', { class: 'preset' + (region === k ? ' on' : ''), onclick: () => { region = k; draw(); } }, h('b', {}, `${r.short} · ${r.label}`), h('span', { class: 'small muted' }, k === 'UK' ? 'A4, 24-hour clock, DD/MM dates, metric, £, VAT, costume / continuity / runner terminology.' : 'Letter, 12-hour clock, MM/DD dates, imperial, $, sales tax, wardrobe / script supervisor / PA terminology.')))),
      h('h4', { style: { margin: '4px 0 8px', fontSize: '12px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' } }, `${REGIONS[region].short} standards apply to`), rows(),
      h('h4', { style: { margin: '18px 0 8px', fontSize: '12px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' } }, 'Fine-tune'),
      h('div', { class: 'row wrap', style: { gap: '16px' } }, sel('clock', 'Clock', [['12', '12-hour'], ['24', '24-hour']]), sel('paper', 'Paper', [['letter', 'US Letter'], ['a4', 'A4']]), sel('units', 'Units', [['imperial', 'Feet & inches'], ['metric', 'Metric']]),
        h('label', { class: 'row small' }, 'Currency', h('input', { class: 'inp', value: draft.currency, placeholder: REGIONS[region].currency, style: { width: '64px' }, oninput: e => { draft.currency = e.target.value; } }))),
      h('div', { class: 'row wrap', style: { gap: '16px', marginTop: '10px' } }, num('dayHours', 'Day length warning (h)'), num('mealHours', 'Meal break within (h)'), num('turnaround', 'Turnaround (h)')),
      h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'Working-time numbers are typical industry defaults, not legal advice — set them to match your agreements.'));
  }
  const m = modal({ title: 'Standards & formats', wide: true, body: box, buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: () => {
    const prev = regionOf(P); applyRegion(P, region, { keepCustom: region === prev });
    ['clock', 'paper', 'units'].forEach(k => { if (draft[k]) S[k] = draft[k]; else if (region === prev) delete S[k]; });
    if (draft.currency) S.currency = draft.currency; ['dayHours', 'mealHours', 'turnaround'].forEach(k => { if (draft[k] !== '' && draft[k] != null) S[k] = +draft[k]; });
    syncStageUnits(P); applyTerms(P); Store.touch(); Router.refresh(); toast(`${REGIONS[region].short} standards applied`);
  } }] });
  draw();
}
/* a quick chip in the top bar */
function regionChip(P) {
  const r = regionOf(P);
  return h('button', { class: 'pill region-chip', title: 'Standards & formats (US / UK)', onclick: e => menu(e.currentTarget, [{ label: r === 'US' ? '✓ US standards' : 'Switch to US standards', onClick: () => { if (r !== 'US') { applyRegion(P, 'US'); Router.refresh(); toast('US standards applied'); } } }, { label: r === 'UK' ? '✓ UK standards' : 'Switch to UK standards', onClick: () => { if (r !== 'UK') { applyRegion(P, 'UK'); Router.refresh(); toast('UK standards applied'); } } }, { sep: true }, { label: 'Standards & formats…', icon: 'wand', onClick: () => openProjectOptions(P) }]) }, r);
}

/* is there enough rest between the end of one shoot day and the next call? */
function turnaroundWarn(P, n) {
  const d = P.days[n - 1], prev = P.days[n - 2]; if (!d || !prev || !prev.date || !d.date || !(prev.cs && prev.cs.wrap) || !(d.cs && d.cs.crew)) return '';
  const t = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; }, gap = ((new Date(d.date) - new Date(prev.date)) / 6e4) - t(prev.cs.wrap) + t(d.cs.crew), need = (+P.settings.turnaround || regionDef(P).turnaround) * 60;
  return gap < need ? `Only ${(gap / 60).toFixed(1)} h between wrap on Day ${n - 1} and the call on Day ${n} (turnaround ${need / 60} h)` : '';
}
