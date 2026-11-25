'use strict';
/* ===================================================================
   Regional standards — MODEL. US or UK conventions as a project
   option: terminology, date & time format, paper size, units,
   currency, payroll / tax wording and working-time defaults. Which
   region and options a project uses, switching it, the "Standards &
   formats" dialog's draft, and the turnaround check.
   `fallback` is the region new projects get (Prefs.region).
   Pure: no DOM, no Store. See js/mvvm.js.
   =================================================================== */

const RegionModel = (() => {
  const REGIONS = {
    US: {
      label: 'United States', short: 'US', currency: '$', clock: '12', paper: 'letter', units: 'imperial', dayHours: 10, mealHours: 6, turnaround: 10, locale: 'en-US',
      terms: { wardrobe: 'Wardrobe', wardrobeOne: 'wardrobe item', makeup: 'Makeup & Hair', supervisor: 'Script supervisor', dpr: 'Daily production report', crewCall: 'General crew call', fringes: 'Fringes & payroll', tax: 'Sales tax', calling: 'Calling script', interval: 'Intermission', loadIn: 'Load-in / load-out', perDiem: 'Per diem', color: 'Color', runner: 'Production assistant', camReport: 'Camera report', soundReport: 'Sound report', moveWord: 'Company move', rushes: 'Dailies' },
      unions: ['', 'SAG-AFTRA', 'Equity (AEA)', 'IATSE', 'DGA', 'WGA', 'Teamsters', 'Non-union', 'Other'],
      depts: ['Direction', 'Production', 'Camera', 'Grip', 'Electric', 'Art', 'Wardrobe', 'Hair & Makeup', 'Sound', 'Stunts', 'Post', 'Stage Management', 'Lighting', 'Photography', 'Digital tech', 'Styling', 'Retouching', 'Studio', 'Client', 'Other'],
      blurb: 'Letter, 12-hour clock, MM/DD dates, imperial, $, sales tax, wardrobe / script supervisor / PA terminology.',
    },
    UK: {
      label: 'United Kingdom', short: 'UK', currency: '£', clock: '24', paper: 'a4', units: 'metric', dayHours: 11, mealHours: 5, turnaround: 11, locale: 'en-GB',
      terms: { wardrobe: 'Costume', wardrobeOne: 'costume item', makeup: 'Make-up & Hair', supervisor: 'Continuity', dpr: 'Daily progress report', crewCall: 'Unit call', fringes: 'Employer on-costs (NI, holiday pay)', tax: 'VAT', calling: 'Prompt copy', interval: 'Interval', loadIn: 'Get-in / get-out', perDiem: 'Subsistence', color: 'Colour', runner: 'Runner', camReport: 'Camera sheets', soundReport: 'Sound sheets', moveWord: 'Unit move', rushes: 'Rushes' },
      unions: ['', 'Equity', 'BECTU / Prospect', 'Directors UK', 'Writers’ Guild of GB', 'Musicians’ Union', 'Non-union', 'Other'],
      depts: ['Direction', 'Production', 'Camera', 'Grip', 'Electrics', 'Art', 'Costume', 'Make-up & Hair', 'Sound', 'Stunts', 'Post', 'Stage Management', 'Lighting', 'Photography', 'Digital tech', 'Styling', 'Retouching', 'Studio', 'Client', 'Other'],
      blurb: 'A4, 24-hour clock, DD/MM dates, metric, £, VAT, costume / continuity / runner terminology.',
    },
  };
  /** the options a project can set for itself (else the region's default applies) */
  const CHOICES = ['clock', 'paper', 'units'], NUMBERS = ['dayHours', 'mealHours', 'turnaround'], FIELDS = [...CHOICES, 'currency', ...NUMBERS];

  /** the project's region (its own, else the fallback, else US) */
  const regionOf = (P, fallback) => (P && P.settings && REGIONS[P.settings.region] ? P.settings.region : (REGIONS[fallback] ? fallback : 'US'));
  const def = (P, fallback) => REGIONS[regionOf(P, fallback)];
  /** an option: the project's own value, else the region's default */
  const optOf = (P, k, fallback) => (P && P.settings && P.settings[k]) || def(P, fallback)[k];

  /** convert stage / set plans between metres and feet to match the project's units → how many changed */
  function syncStageUnits(P, fallback) {
    const want = optOf(P, 'units', fallback) === 'metric' ? 'm' : 'ft'; let n = 0;
    ((P.stage && P.stage.plans) || []).forEach(pl => { const have = pl.unit || 'm'; if (have === want) return; const k = want === 'm' ? 1 / 3.28084 : 3.28084; pl.w = Math.round((+pl.w || 12) * k * 10) / 10; pl.d = Math.round((+pl.d || 8) * k * 10) / 10; pl.unit = want; n++; });
    return n;
  }
  /**
   * Switch a project to US or UK conventions → whether it switched. Unless keepCustom, its own clock,
   * paper and units go back to the region's, and its currency and working hours follow the new region
   * (a currency or day length the user changed from the old region's is kept). Budget additions get the
   * new region's names, and stage plans its units.
   */
  function switchRegion(P, to, { keepCustom = false } = {}, fallback) {
    const from = regionOf(P, fallback); if (!REGIONS[to]) return false; const a = REGIONS[from], b = REGIONS[to], S = P.settings;
    S.region = to;
    if (!keepCustom) { CHOICES.forEach(k => delete S[k]); if (!S.currency || S.currency === a.currency) S.currency = b.currency; if (+S.dayHours === a.dayHours || !S.dayHours) S.dayHours = b.dayHours; S.mealHours = b.mealHours; S.turnaround = b.turnaround; }
    if (P.fin) P.fin.adds.forEach(x => { if (x.name === a.terms.fringes) x.name = b.terms.fringes; else if (x.name === a.terms.tax) x.name = b.terms.tax; });
    syncStageUnits(P, fallback);
    return true;
  }

  /* ---------- the "Standards & formats" dialog ---------- */
  /** what a region changes → [[topic, text]] */
  function summary(region) {
    const r = REGIONS[region];
    return [['Terminology', `${r.terms.wardrobe}, ${r.terms.supervisor}, ${r.terms.dpr}, ${r.terms.crewCall}, ${r.terms.interval}`], ['Dates & time', `${region === 'UK' ? '1 December 2026' : 'December 1, 2026'} · ${r.clock === '24' ? '24-hour clock' : '12-hour clock'}`],
      ['Paper', r.paper === 'a4' ? 'A4 — scripts paginate to A4' : 'US Letter'], ['Units', r.units === 'metric' ? 'Metres & centimetres' : 'Feet & inches'], ['Money', `${r.currency} · ${r.terms.fringes} · ${r.terms.tax}`],
      ['Working time', `${r.dayHours} h day warning · meal by ${r.mealHours} h · ${r.turnaround} h turnaround (typical defaults — editable below)`], ['Unions & departments', r.unions.filter(Boolean).slice(0, 4).join(', ') + '…']];
  }
  /** the dialog's fields as the project has them ('' = the region default) */
  const draft = P => Object.fromEntries(FIELDS.map(k => [k, P.settings[k] || '']));
  /**
   * Apply the dialog: switch to `region` (keeping the project's own options when it stays the same),
   * then set the fields the user changed in the dialog (`start` = the draft as it opened).
   * An unchanged field is left to the switch, so a new region's currency and hours are not overwritten by the old ones.
   */
  function applyDialog(P, region, D, start, fallback) {
    const S = P.settings, prev = regionOf(P, fallback), same = region === prev;
    switchRegion(P, region, { keepCustom: same }, fallback);
    const changed = k => String(D[k] ?? '') !== String(start[k] ?? '');
    CHOICES.forEach(k => { if (!same && !changed(k)) return; if (D[k]) S[k] = D[k]; else delete S[k]; });
    if (D.currency && (same || changed('currency'))) S.currency = D.currency;
    NUMBERS.forEach(k => { if (D[k] !== '' && D[k] != null && (same || changed(k))) S[k] = +D[k]; });
    syncStageUnits(P, fallback);
  }

  /** not enough rest between the wrap of day n-1 and the call of day n → the warning, or '' (n counts from 1) */
  function turnaroundWarn(P, n, fallback) {
    const d = P.days[n - 1], prev = P.days[n - 2]; if (!d || !prev || !prev.date || !d.date || !(prev.cs && prev.cs.wrap) || !(d.cs && d.cs.crew)) return '';
    const t = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; }, gap = ((new Date(d.date) - new Date(prev.date)) / 6e4) - t(prev.cs.wrap) + t(d.cs.crew), need = (+P.settings.turnaround || def(P, fallback).turnaround) * 60;
    return gap < need ? `Only ${(gap / 60).toFixed(1)} h between wrap on Day ${n - 1} and the call on Day ${n} (turnaround ${need / 60} h)` : '';
  }

  return { REGIONS, CHOICES, NUMBERS, FIELDS, regionOf, def, optOf, syncStageUnits, switchRegion, summary, draft, applyDialog, turnaroundWarn };
})();
