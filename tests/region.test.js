'use strict';
/* Regional standards — model and view-model tests */
const RGM = RegionModel;
const rgProject = (settings = {}, extra = {}) => fakeProject(Object.assign({ settings: Object.assign({ region: 'US', currency: '$' }, settings) }, extra));

test('region: options, switching and stage units', () => {
  eq([RGM.regionOf(null, 'UK'), RGM.regionOf(null, 'XX'), RGM.regionOf(rgProject({ region: 'XX' }), 'UK'), RGM.regionOf(rgProject(), 'UK')], ['UK', 'US', 'UK', 'US']);
  const P = rgProject({ clock: '24' }, { fin: { adds: [{ name: 'Sales tax' }, { name: 'Fringes & payroll' }, { name: 'Other' }] }, stage: { plans: [{ w: 30, d: 20, unit: 'ft' }, { w: 12, d: 8 }] } });
  eq([RGM.optOf(P, 'clock'), RGM.optOf(P, 'paper'), RGM.def(P).short], ['24', 'letter', 'US']);
  eq(RGM.switchRegion(P, 'XX'), false);
  eq(RGM.switchRegion(P, 'UK'), true);
  eq([P.settings.region, P.settings.clock, P.settings.currency, P.settings.dayHours, P.settings.mealHours, P.settings.turnaround], ['UK', undefined, '£', 11, 5, 11], 'its own clock goes; money and hours follow the region');
  eq(P.fin.adds.map(x => x.name), ['VAT', 'Employer on-costs (NI, holiday pay)', 'Other']);
  eq(P.stage.plans.map(p => [p.w, p.d, p.unit]), [[9.1, 6.1, 'm'], [12, 8, undefined]], 'stage plans follow the units (no unit = metres already)');
  P.settings.currency = '€'; P.settings.dayHours = 12; RGM.switchRegion(P, 'US'); eq([P.settings.currency, P.settings.dayHours, P.stage.plans[1].unit, P.stage.plans[1].w], ['€', 12, 'ft', 39.4], 'a currency or day length the user chose is kept');
  P.settings.paper = 'a4'; RGM.switchRegion(P, 'US', { keepCustom: true }); eq(P.settings.paper, 'a4');
  eq(RGM.summary('UK')[1], ['Dates & time', '1 December 2026 · 24-hour clock']); eq(RGM.summary('US')[6][1], 'SAG-AFTRA, Equity (AEA), IATSE, DGA…');
});

test('region: the dialog keeps a new region’s money and hours', () => {
  const P = rgProject({ dayHours: 10, mealHours: 6, turnaround: 10 }), start = RGM.draft(P);
  eq(start, { clock: '', paper: '', units: '', currency: '$', dayHours: 10, mealHours: 6, turnaround: 10 });
  RGM.applyDialog(P, 'UK', { ...start }, start); eq([P.settings.currency, P.settings.dayHours, P.settings.turnaround], ['£', 11, 11], 'unchanged fields are left to the switch (the old dialog kept $ and 10 h)');
  const s2 = RGM.draft(P); RGM.applyDialog(P, 'US', { ...s2, currency: 'CHF', turnaround: '9' }, s2); eq([P.settings.currency, P.settings.turnaround, P.settings.dayHours], ['CHF', 9, 10], 'what the user changed wins');
  const s3 = RGM.draft(P); RGM.applyDialog(P, 'US', { ...s3, clock: '24', mealHours: '' }, s3); eq([P.settings.clock, P.settings.mealHours], ['24', 6], 'same region: fine-tune only');
  const s4 = RGM.draft(P); RGM.applyDialog(P, 'US', { ...s4, clock: '' }, s4); eq('clock' in P.settings, false, 'back to the region default');
  const s5 = RGM.draft(P); P.settings.units = 'metric'; const s5b = RGM.draft(P); RGM.applyDialog(P, 'UK', { ...s5b }, s5b); eq(P.settings.units, undefined, 'a region change resets an untouched choice');
});

test('region: turnaround and the vm', () => {
  const P = rgProject({ turnaround: 10 }, { days: [{ date: '2026-05-01', cs: { wrap: '22:00' } }, { date: '2026-05-02', cs: { crew: '06:00' } }, { date: '2026-05-03', cs: { crew: '09:00' } }] });
  eq([RGM.turnaroundWarn(P, 2), RGM.turnaroundWarn(P, 3), RGM.turnaroundWarn(P, 1)], ['Only 8.0 h between wrap on Day 1 and the call on Day 2 (turnaround 10 h)', '', '']);
  const Q = rgProject(), store = fakeStore(Q); let terms = 0;
  const vm = new RegionVM({ project: () => Q, store, ui: {}, fx: { fallback: () => 'US', applyTerms: () => terms++ } }); let draws = 0; vm.subscribe(() => draws++);
  eq([vm.region, vm.current, vm.def.currency], ['US', 'US', '$']);
  vm.setRegion('UK'); vm.setRegion('XX'); eq([vm.region, vm.current, draws, vm.summary[0][1].startsWith('Costume')], ['UK', 'US', 1, true], 'only a draft until Apply');
  vm.set('turnaround', '12'); vm.set('nope', 1); eq([draws, vm.D.nope], [1, undefined], 'typing does not redraw');
  eq([vm.apply(), Q.settings.region, Q.settings.currency, Q.settings.turnaround, store.touches, terms], ['UK', 'UK', '£', 12, 1, 1]);
  eq([vm.switchTo('UK'), vm.switchTo('US'), Q.settings.region, store.touches, terms], [false, true, 'US', 2, 2]);
});
