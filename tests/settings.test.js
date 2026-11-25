'use strict';
/* Settings — model and view-model tests */
const SGM = SettingsModel;
const sgPrefs = () => ({ preset: 'all', on: [...SGM.FEATURE_KEYS], region: 'US', fold: { preset: 'balanced', hubs: null } });
const sgProject = (mode, settings = {}) => fakeProject({ mode, settings: Object.assign({ nav: null, fold: null }, settings) });

test('settings: sections per format and the side menu', () => {
  const pf = sgPrefs(), P = sgProject('stage');
  const on = SGM.featureSet(P, pf); eq([on.has('shots'), on.has('stage'), on.has('overview'), on.has('brief')], [false, true, true, false], 'a stage play has no shot list or photo sections');
  eq([...SGM.featureSet(sgProject('photo', { nav: { on: ['tasks'] } }), pf)].sort(), ['overview', 'setups', 'tasks'], 'its own choice, plus required entries');
  eq([...SGM.featureSet(sgProject('podcast', { nav: { on: [] } }), pf)].sort(), ['gear', 'overview', 'rundown']);
  eq([SGM.featureSet(null, { on: ['script'] }).size, SGM.featureLabel(sgProject('photo'), 'people'), SGM.featureLabel(P, 'people'), SGM.featureLabel(null, 'zz')], [2, 'Talent & crew', 'Cast, crew & casting', 'zz']);
  eq([SGM.hubOfKey(P, 'stage'), SGM.hubOfKey(sgProject('screenplay'), 'stage'), SGM.hubLabel(P, SGM.HUBS[2]), SGM.hubLabel(null, SGM.HUBS[2])], ['set', 'visual', 'Design', 'Visualize'], 'a stage play moves blocking to the show hub');
  eq([...SGM.foldedHubs(null, pf)], ['visual', 'elements', 'plan', 'people', 'set'], 'the preset when no hubs are listed');
  eq([...SGM.foldedHubs(sgProject('av', { fold: { hubs: ['money'] } }), pf)], ['money']);
  eq(SGM.hubMembers(P, SGM.HUBS.find(h => h.id === 'set'), pf), ['stage', 'live'], 'a section moved into a hub comes first (as before)');
  eq([SGM.foldedInfo(P, 'live', pf).members, SGM.foldedInfo(P, 'script', pf), SGM.foldedInfo(sgProject('stage', { nav: { on: ['live'] } }), 'live', pf)], [['stage', 'live'], null, null], 'a hub with one member is not folded');
  const nav = SGM.buildNav(P, pf);
  eq(nav.map(g => g.label + ':' + g.items.map(i => i[0]).join(',')), ['Project:overview', 'Write:script,cards', 'Prepare:hub:elements,hub:visual,pitch', 'Produce:hub:set,hub:plan,hub:people,budget,tasks,reports'], 'hubs sit where their first member sits; emptied groups go');
  eq(SGM.buildNav(P, pf, { flat: true }).find(g => g.label === 'Direct').items.map(i => i[0]), ['stage']);
  eq([SGM.presetForMode('photo'), SGM.presetForMode('av')], ['photo', '']);
});

test('settings: the dialog draft and saving it', () => {
  eq([SGM.matchPreset(new Set(SGM.PRESETS.writing.on)), SGM.matchPreset(new Set(['script'])), SGM.matchFold(new Set()), SGM.matchFold(new Set(['visual']))], ['writing', 'custom', 'none', 'custom']);
  const pf = sgPrefs(), P = sgProject('stage');
  const g = SGM.draft(P, pf, 'global'); eq([g.scope, g.on.size, g.preset, g.foldPreset], ['global', SGM.FEATURE_KEYS.length, 'all', 'balanced']);
  P.settings.nav = { preset: 'writing', on: SGM.PRESETS.writing.on }; P.settings.fold = { hubs: [] };
  const d = SGM.draft(P, pf, 'project'); eq([d.preset, d.foldPreset], ['writing', 'none']);
  d.on = new Set(['script']); d.preset = 'custom';
  eq([SGM.apply(d, P, pf), P.settings.nav, P.settings.fold, pf.preset], [{ project: true, prefs: false }, { preset: 'custom', on: ['script', 'overview'] }, { preset: 'none', hubs: [] }, 'all'], 'overview is always on');
  const d2 = SGM.draft(P, pf, 'global'); d2.on = new Set(SGM.PRESETS.film.on); d2.preset = 'film';
  eq([SGM.apply(d2, P, pf), P.settings.nav, pf.preset, pf.on.length, pf.fold.preset], [{ project: true, prefs: true }, null, 'film', SGM.PRESETS.film.on.length, 'balanced'], 'the global choice drops the project’s own');
  eq(SGM.apply(SGM.draft(null, pf, 'global'), null, pf), { project: false, prefs: true });
  P.settings.nav = { on: [] }; eq([SGM.useGlobal(P), SGM.useGlobal(P), P.settings.nav], [true, false, null]);
  const fc = SGM.foldChoices(P); eq([fc.find(c => c.hub.id === 'set').label, fc.find(c => c.hub.id === 'set').members, fc.find(c => c.hub.id === 'visual').members.includes('Blocking')], ['Rehearsal & show', 'Live dashboard · Script supervisor · Selects & approvals', false]);
  eq(SGM.foldChoices(null).find(c => c.hub.id === 'visual').members.includes('Blocking & cues'), true);
});

test('settings vm: scope, presets, folding and saving', async () => {
  const pf = sgPrefs(), P = sgProject('screenplay'); let saves = 0;
  const store = fakeStore(P), fx = { prefs: () => pf, savePrefs: async () => { saves++; } };
  const vm = new SettingsVM({ project: () => P, store, ui: {}, fx }); let draws = 0; vm.subscribe(() => draws++);
  eq([vm.scoped, vm.scope, vm.preset, vm.canUseGlobal], [true, 'global', 'all', false]);
  vm.toggle('budget', false); eq([vm.has('budget'), vm.preset, draws], [false, 'custom', 1]); vm.toggle('overview', false); eq(vm.has('overview'), true);
  vm.choosePreset('writing'); eq([vm.has('budget'), vm.preset], [false, 'writing']); vm.choosePreset('zz'); eq(vm.preset, 'writing');
  vm.chooseFold('compact'); eq([vm.folded('money'), vm.foldPreset], [true, 'compact']); vm.toggleFold('money', false); eq(vm.foldPreset, 'custom');
  vm.setScope('project'); eq([vm.scope, vm.preset, vm.foldPreset], ['project', 'all', 'balanced'], 'switching scope starts again from that choice');
  vm.choosePreset('film'); eq(await vm.save(), { project: true, prefs: false }); eq([P.settings.nav.preset, store.touches, saves], ['film', 1, 0]);
  const vm2 = new SettingsVM({ project: () => P, store, ui: {}, fx }); eq([vm2.scope, vm2.preset, vm2.canUseGlobal], ['project', 'film', true]);
  vm2.useGlobal(); eq([P.settings.nav, store.touches], [null, 2]);
  const gvm = new SettingsVM({ store: fakeStore(null), ui: {}, fx }); eq([gvm.scoped, gvm.region], [false, 'US']);
  gvm.setRegion('UK'); eq(pf.region, 'US', 'the region is only a draft until saved'); gvm.setScope('project'); eq(gvm.scope, 'global', 'no project, no project scope');
  await gvm.save(); eq([pf.region, saves], ['UK', 1]);
  let prof = 'auto', mode = 'auto';
  const dev = new DeviceVM({ store: fakeStore(null), ui: {}, devices: { auto: {}, desktop: {} }, device: { profile: () => prof, mode: () => mode, setProfile: k => { prof = k; }, setMode: k => { mode = k; }, form: () => 'tablet', touchOn: () => mode === 'on' } });
  let dd = 0; dev.subscribe(() => dd++); dev.setProfile('desktop'); dev.setMode('on'); eq([dev.profile, dev.mode, dd, dev.inUse(800, 600)], ['desktop', 'on', 2, 'In use now: tablet layout · 800 × 600 layout pixels · touch controls']);
});
