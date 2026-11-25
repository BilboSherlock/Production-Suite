'use strict';
/* ===================================================================
   Settings — which sections (tabs) are shown, with presets per
   production type. Global default, optionally overridden per project.
   VIEW (and where the global choice, Prefs, is stored). Rules:
   js/models/settings.model.js; the dialog's draft and commands:
   js/viewmodels/settings.vm.js.
   =================================================================== */
/* the section lists, presets and folding rules live in the model; these names are kept for older callers
   (the same arrays and objects, so region.js can still rename labels in place) */
const { FEATURE_DEFS, FEATURE_KEYS, NAV_GROUPS, PRESETS, FORMAT_PHOTO, FORMAT_NA, NAV_LABELS, HUBS, FOLD_PRESETS, HUB_MOVE, HUB_LABEL } = SettingsModel;
const Prefs = { preset: 'all', on: [...FEATURE_KEYS], region: 'US', fold: { preset: 'balanced', hubs: null } };
async function loadPrefs() {
  let v = null;
  try { v = await DB.getMeta('prefs'); } catch (e) { }
  if (!v) { try { v = JSON.parse(localStorage.getItem('sb-prefs') || 'null'); } catch (e) { } }
  if (v && Array.isArray(v.on)) { Prefs.preset = v.preset || 'custom'; Prefs.on = v.on; } if (v && v.region) Prefs.region = v.region; if (v && v.fold) Prefs.fold = v.fold;
}
async function savePrefs() {
  try { await DB.setMeta('prefs', { preset: Prefs.preset, on: Prefs.on, region: Prefs.region, fold: Prefs.fold }); } catch (e) { }
  try { localStorage.setItem('sb-prefs', JSON.stringify({ preset: Prefs.preset, on: Prefs.on, region: Prefs.region, fold: Prefs.fold })); } catch (e) { }
}
/* the menu rules, with the global choice filled in */
const featureSet = P => SettingsModel.featureSet(P, Prefs);
const featureOn = (P, key) => featureSet(P).has(key);
const featureLabel = (P, key) => SettingsModel.featureLabel(P, key);
const hubOfKey = (P, key) => SettingsModel.hubOfKey(P, key);
const hubLabel = (P, hub) => SettingsModel.hubLabel(P, hub);
const foldedHubs = P => SettingsModel.foldedHubs(P, Prefs);
const hubMembers = (P, hub) => SettingsModel.hubMembers(P, hub, Prefs);
const foldedInfo = (P, key) => SettingsModel.foldedInfo(P, key, Prefs);
const buildNav = (P, o) => SettingsModel.buildNav(P, Prefs, o);
const presetForMode = mode => SettingsModel.presetForMode(mode);

/* the sub-tab bar shown above a folded section */
function hubTabs(P, view) {
  const fi = foldedInfo(P, view); if (!fi) return null; UI.hubLast = UI.hubLast || {}; UI.hubLast[fi.hub.id] = view;
  return h('div', { class: 'hub-tabs', role: 'tablist', 'aria-label': hubLabel(P, fi.hub) }, h('span', { class: 'hub-name' }, icon(fi.hub.icon, 15), hubLabel(P, fi.hub)), fi.members.map(k => h('a', { class: 'hub-tab' + (k === view ? ' on' : ''), role: 'tab', href: `#/p/${P.id}/${k}` }, featureLabel(P, k))));
}
function hubHref(P, item) { const fi = item[3]; UI.hubLast = UI.hubLast || {}; const last = UI.hubLast[fi.hub.id]; return `#/p/${P.id}/${fi.members.includes(last) ? last : fi.members[0]}`; }

/* the "Sections & features" dialog: P = the open project (its choice can apply to just this project), or null */
function openSettings(P) {
  const vm = new SettingsVM({ project: () => P || null }), box = h('div');
  const segBtns = (opts, val, set) => h('div', { class: 'seg' }, opts.map(([k, l]) => h('button', { class: val === k ? 'on' : '', onclick: () => set(k) }, l)));
  const device = vm.scoped ? null : deviceSection();
  if (device) device._own = true;   // its own view, redrawn by itself
  const draw = () => morph(box, [
    vm.scoped ? h('div', { class: 'row', style: { marginBottom: '14px' } }, h('span', { class: 'small muted' }, 'Apply to'), segBtns([['project', 'This project only'], ['global', 'All projects']], vm.scope, k => vm.setScope(k)))
      : h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Choose which sections appear in every project’s side menu. Hidden sections keep their data and can be turned back on at any time.'),
    vm.scoped ? null : h('div', { class: 'row', style: { marginBottom: '14px' } }, h('span', { class: 'small muted' }, 'Default standards for new projects'), segBtns(Object.entries(REGIONS).map(([k, r]) => [k, `${r.short} · ${r.label}`]), vm.region, k => vm.setRegion(k))),
    h('div', { class: 'preset-grid' }, Object.entries(PRESETS).map(([k, p]) => h('button', { class: 'preset' + (vm.preset === k ? ' on' : ''), onclick: () => vm.choosePreset(k) }, h('b', {}, p.label), h('span', { class: 'small muted' }, p.desc)))),
    h('div', { class: 'feat-cols' }, NAV_GROUPS.map(g => h('div', { class: 'feat-col' }, h('h4', {}, g), FEATURE_DEFS.filter(f => f[2] === g).map(f => h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: vm.has(f[0]), disabled: f[0] === 'overview', onchange: e => vm.toggle(f[0], e.target.checked) }), icon(f[3], 14), f[1]))))),
    vm.preset === 'custom' ? h('p', { class: 'small muted' }, 'Custom selection.') : null,
    device,
    h('h3', { style: { fontSize: '15px', margin: '22px 0 4px' } }, 'Fold related tabs together'),
    h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Folded sections share one menu entry with sub-tabs across the top — for example Storyboard, Shot list, Lookbook and Blocking under “Visualize”. What goes together adapts to the project’s format.'),
    h('div', { class: 'preset-grid' }, Object.entries(FOLD_PRESETS).map(([k, p]) => h('button', { class: 'preset' + (vm.foldPreset === k ? ' on' : ''), onclick: () => vm.chooseFold(k) }, h('b', {}, p.label), h('span', { class: 'small muted' }, p.desc)))),
    h('div', { class: 'feat-cols' }, vm.foldChoices.map(c => h('label', { class: 'fold-opt' }, h('input', { type: 'checkbox', checked: vm.folded(c.hub.id), onchange: e => vm.toggleFold(c.hub.id, e.target.checked) }), h('span', {}, h('b', {}, c.label), h('span', { class: 'small muted', style: { display: 'block' } }, c.members))))),
    vm.canUseGlobal ? h('button', { class: 'btn sm ghost', onclick: () => { vm.useGlobal(); m.close(); Router.refresh(); } }, 'Use the global setting for this project') : null]);
  const unbind = bindView(vm, draw);
  const m = modal({ title: 'Settings — sections & features', wide: true, body: box, onClose: () => { unbind(); if (device && device._unbind) device._unbind(); },
    buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => { await vm.save(); Router.refresh(); toast('Settings saved'); } }] });
}

/* the device this copy of the app is laid out for (stored per device, not per project) */
function deviceSection() {
  const vm = new DeviceVM(), box = h('div', { class: 'dev-sec' });
  const seg = (label, opts, val, set) => h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, h('span', { class: 'small muted' }, label), h('div', { class: 'seg' }, opts.map(([k, l]) => h('button', { class: val === k ? 'on' : '', onclick: () => set(k) }, l))));
  box._unbind = bindView(vm, () => {
    const cur = vm.profile;
    morph(box, [
      h('h3', { style: { fontSize: '15px', margin: '4px 0 4px' } }, 'Device'),
      h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Tailors the layout to the screen this copy of StudioBindahh runs on. Saved on this device only.'),
      h('div', { class: 'dev-grid' }, Object.entries(vm.devices).map(([k, d]) => h('button', { class: 'dev-card' + (cur === k ? ' on' : ''), 'aria-pressed': String(cur === k), onclick: () => vm.setProfile(k) },
        h('span', { class: 'dev-ico' }, icon(k === 'desktop' ? 'monitor' : k === 'ideatab' ? 'tablet' : 'wand', 22)), h('b', {}, d.label), h('span', { class: 'small muted' }, d.desc),
        d.specs ? h('ul', { class: 'dev-specs' }, d.specs.map(x => h('li', {}, x))) : null))),
      h('div', { class: 'small muted', style: { margin: '8px 0 4px' } }, vm.inUse(innerWidth, innerHeight)),
      seg('Touch targets', [['auto', 'Follow device'], ['on', 'Always large'], ['off', 'Always compact']], vm.mode, k => vm.setMode(k)),
      seg('Long tables & lists', [['scroll', 'Scroll'], ['page', 'Pages']], vm.lists, k => vm.setLists(k)),
      h('div', { class: 'small muted', style: { margin: '4px 0 0' } }, vm.lists === 'page' ? 'Long tables and lists show a screenful at a time, with ‹ › to turn pages.' : 'Long tables and lists scroll by touch or wheel inside the screen, with no scrollbar — their edges fade where there is more. Short ones still fit or page.')]);
  });
  return box;
}

/* how to run StudioBindahh on an Android tablet (for example the Lenovo Idea Tab Plus) */
function tabletHelp() {
  const origin = location.origin, secure = Device.secure(), local = /^(localhost|127\.)/.test(location.hostname);
  const step = (n, t, d) => h('li', { style: { margin: '8px 0' } }, h('b', {}, t), h('div', { class: 'small muted' }, d));
  modal({ title: 'Tablet setup — Android (Lenovo Idea Tab Plus and similar)', wide: true, body: h('div', {},
    h('p', { style: { marginTop: 0 } }, 'StudioBindahh runs in Chrome on the tablet, with a touch layout, pen support and offline use. Your projects live on the tablet itself.'),
    h('div', { class: 'card', style: { padding: '12px 14px', marginBottom: '12px' } }, h('b', {}, 'Status on this device'), h('div', { class: 'small', style: { marginTop: '4px' } }, [`Touch mode: ${Device.touchOn() ? 'on' : 'off'}`, `Installed as an app: ${Device.installed() ? 'yes' : 'no'}`, `Offline support: ${secure ? 'available' : 'needs a secure address (see step 3)'}`, `Storage: ${navigator.storage && navigator.storage.persist ? 'persistent storage requested' : 'standard'}`].join(' · ')),
      Device.installEvent ? h('button', { class: 'btn primary', style: { marginTop: '8px' }, onclick: async () => { if (await Device.install()) { } } }, icon('download', 15), 'Install StudioBindahh on this device') : null),
    h('ol', { style: { paddingLeft: '20px', margin: 0 } },
      step(1, 'Open the app', local ? 'On your PC, run “Start StudioBindahh.bat”. On the tablet (same Wi-Fi) open Chrome and go to the address the PC prints — for example http://192.168.x.x:5173.' : `You are using ${origin}. Keep this address for the tablet.`),
      step(2, 'Use it right away', 'Everything works in the browser: tap to select, long-press for menus, two fingers to pan and zoom the storyboard, and the pen for drawing. Joining a live session on the PC (Share → Join a session) works over the same Wi-Fi.'),
      step(3, 'Make it a real offline app (recommended)', 'Chrome only installs apps and caches them for offline use on secure addresses. A plain http://192.168… address is not secure, so on the tablet open chrome://flags, search “Insecure origins treated as secure”, add ' + origin + ' to the list, enable it and relaunch Chrome. Then open the app again and choose Chrome menu → “Install app” (or the Install button above).'),
      step(4, 'Back up your work', 'Projects are stored in Chrome on the tablet. Use Backup → Download all projects now and then, and keep the tablet’s Chrome data safe. Folder sync is for desktop Chrome and Edge only.'),
      step(5, 'Printing & PDFs', 'Print, then choose “Save as PDF” in Android’s print dialog. Importing a script PDF needs the PDF reader once online; after that it works offline.')),
    h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'Tip: add the keyboard cover or a stylus (such as the Lenovo Tab Pen) for the best writing and storyboarding experience — both are fully supported.')),
    buttons: [{ label: 'Close', primary: true }] });
}
