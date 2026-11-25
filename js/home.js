'use strict';
/* ===================================================================
   Projects home — the dashboard of every project, new project and
   import. VIEW. Rules: js/models/home.model.js; commands:
   js/viewmodels/home.vm.js. (The sample projects are built in js/app.js.)
   =================================================================== */

function renderHome() {
  const app = $('#app'); app.innerHTML = ''; app.style.display = 'block'; app.style.overflow = 'auto';
  const vm = new HomeVM();
  const projectCard = c => h('div', { class: 'card pcard ' + c.mode, 'data-key': c.id, tabindex: 0, role: 'link', 'aria-label': `Open ${c.title}`, onclick: () => location.hash = `#/p/${c.id}`, onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) location.hash = `#/p/${c.id}`; } },
    h('div', { class: 'cover' }, c.title),
    h('div', { class: 'body' }, h('div', { class: 'row wrap' }, h('span', { class: 'pill accent' }, c.modeLabel), c.series ? h('span', { class: 'pill' }, c.series) : null, h('span', { class: 'small muted' }, c.stats)),
      h('div', { class: 'small muted' }, c.edited),
      h('div', { class: 'acts' }, h('button', { class: 'btn sm ghost', onclick: async e => { e.stopPropagation(); await vm.duplicate(c.id); toast('Project duplicated'); } }, icon('copy', 14), 'Duplicate'),
        h('button', { class: 'btn sm ghost', onclick: async e => { e.stopPropagation(); if (await downloadBackup(vm.backupOf(c.id, slug))) toast('Backup downloaded'); } }, icon('download', 14), 'Backup'),
        h('span', { class: 'grow' }), h('button', { class: 'icon-btn danger', title: 'Delete project', onclick: async e => { e.stopPropagation(); const p = vm.project(c.id); if (p && await confirmBox(`Delete “${p.title}” and everything in it? This can't be undone — consider downloading a backup first.`)) { await vm.remove(c.id); toast('Project deleted'); } } }, icon('trash', 16)))));
  const draw = () => morph(app, [
    !Store.persist ? h('div', { style: { background: 'var(--warn)', color: '#000', padding: '8px 16px', fontSize: '14px' } }, 'Your browser is blocking local storage, so projects will be lost when you close this tab. Use the Backup button to save your work.') : null,
    h('div', { class: 'home-top' }, h('span', { class: 'logo', style: { padding: 0 } }, h('span', { class: 'mark' }, icon('film', 18)), 'StudioBindahh'), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', id: 'syncBtn', onclick: () => Sync.panel() }, icon('cloud', 15), 'Sync', h('i', { id: 'syncDot', class: 'syncdot' })),
      h('button', { class: 'btn sm collab-btn' + (Collab.sess ? ' live' : ''), onclick: () => Collab.sess ? Collab.livePanel() : Collab.joinModal() }, icon('users', 15), Collab.sess ? 'Live session' : 'Join a session'),
      h('a', { class: 'btn sm', href: '#/budgets' }, icon('dollar', 15), 'Budgets'),
      h('a', { class: 'btn sm', href: '#/contacts' }, icon('users', 15), `Contacts${vm.contactCount ? ' (' + vm.contactCount + ')' : ''}`),
      h('button', { class: 'btn sm', onclick: () => openSettings(null) }, icon('wand', 15), 'Settings'),
      h('button', { class: 'btn sm', onclick: backupAll }, icon('download', 15), 'Back up all'),
      h('button', { class: 'btn sm', onclick: showShortcuts }, icon('keyboard', 15), 'Shortcuts'), themeBtn()),
    location.protocol !== 'file:' ? null : h('div', { style: { background: 'var(--accent-soft)', color: 'var(--text)', padding: '10px 26px', fontSize: '14px', borderBottom: '1px solid var(--border)' } },
      h('b', {}, 'Heads up: '), 'you opened this from a file. Browsers keep file-based projects separate from the localhost version (Start StudioBindahh.bat). Always open it the same way — or use “Back up all” and Import to move projects between the two.'),
    h('div', { class: 'hero' }, h('h1', {}, 'Write it. Plan it. Direct it.'),
      h('p', {}, 'One workspace for screenplays, stage plays, AV scripts and photo shoots — from the first draft or brief through breakdown, shot lists, scheduling, call sheets, gear, releases and selects. Everything is saved privately in this browser.'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: () => newProjectModal(vm) }, icon('plus', 16), 'New project'),
        h('button', { class: 'btn', onclick: () => importProjectModal(vm) }, icon('upload', 16), 'Import file'),
        h('button', { class: 'btn', onclick: () => createSample('screenplay') }, icon('film', 16), 'Try a sample screenplay'),
        h('button', { class: 'btn', onclick: () => createSample('stage') }, icon('stage', 16), 'Try a sample stage play'),
        h('button', { class: 'btn', onclick: () => createSample('av') }, icon('layout', 16), 'Try a sample AV script'),
        h('button', { class: 'btn', onclick: () => createSample('photo') }, icon('camera', 16), 'Try a sample photo shoot'),
        h('button', { class: 'btn', onclick: () => createSample('podcast') }, icon('cue', 16), 'Try a sample podcast'))),
    h('div', { class: 'projects' }, h('button', { class: 'card pcard newcard', onclick: () => newProjectModal(vm) }, h('span', {}, icon('plus', 30)), h('span', {}, 'New project')), ...vm.cards.map(projectCard))]);
  Router.cleanup = bindView(vm, () => { draw(); if (window.Sync && Sync.paint) Sync.paint(); });
}

function newProjectModal(vm = new HomeVM()) {
  const title = h('input', { class: 'inp', placeholder: 'Untitled project' });
  const radio = (v, t, d, on) => h('label', {}, h('input', { type: 'radio', name: 'mode', value: v, checked: on }), h('b', {}, t), h('span', { class: 'small muted' }, d));
  const regSel = h('select', { class: 'inp' }, Object.entries(REGIONS).map(([k, r]) => h('option', { value: k, selected: k === vm.defaultRegion }, `${r.short} — ${r.label} standards`)));
  const box = h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Title'), title), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Industry standards'), regSel),
    h('label', { class: 'lbl' }, 'Format'), h('div', { class: 'typepick' },
      radio('screenplay', 'Screenplay', 'Film & TV. Scene headings, action, dialogue, transitions, shots.', true),
      radio('stage', 'Stage play', 'Acts, scenes, centered dialogue, stage directions, light & sound cues.'),
      radio('av', 'Two-column AV script', 'Video on the left, audio on the right — commercials, corporate films, explainers, documentaries.'),
      radio('podcast', 'Podcast & Audio', 'Episode rundown & clock, guest prep, sponsor reads, audio drama scripts, SFX and show notes.'),
      radio('photo', 'Photo shoot', 'Brief, setups & looks, shot list, run of show, gear, releases and selects — for editorial, campaign and large-scale commercial shoots.')));
  modal({ title: 'New project', body: box, buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: async () => {
    const mode = $('input[name=mode]:checked', box).value, p = await vm.create({ mode, title: title.value, region: regSel.value });
    location.hash = `#/p/${p.id}/${HomeModel.startView(mode)}`;
  } }] });
}

function importProjectModal(vm = new HomeVM()) {
  const info = h('p', { style: { marginTop: 0 }, class: 'muted' }, 'Choose a StudioBindahh backup (.studiobindahh, or an older .json), or a script as a PDF, Fountain (.fountain, .txt), Highland (.highland) or Final Draft (.fdx).');
  const box = h('div', {}, info, h('label', { class: 'lbl' }, 'If importing a script, treat it as'), h('div', { class: 'typepick' },
    h('label', {}, h('input', { type: 'radio', name: 'imode', value: 'screenplay', checked: true }), h('b', {}, 'Screenplay')), h('label', {}, h('input', { type: 'radio', name: 'imode', value: 'stage' }), h('b', {}, 'Stage play'))));
  modal({ title: 'Import', body: box, buttons: [{ label: 'Cancel' }, { label: 'Choose file…', primary: true, onClick: () => { const mode = $('input[name=imode]:checked', box).value; pickFile('.studiobindahh,.json,.fountain,.txt,.fdx,.md,.pdf,.highland,.zip,application/octet-stream').then(f => f && doImport(vm, f, mode)); } }] });
}
async function doImport(vm, f, mode) {
  const open = p => { location.hash = `#/p/${p.id}/script`; };
  if (/\.pdf$/i.test(f.name)) {
    await pdfImportFlow(f, { mode, apply: [{ label: 'Create project', run: async res => { const p = await vm.importPdf(res, f.name); open(p); toast(`Imported “${p.title}” — ${res.blocks.length} elements`); } }] });
    return;
  }
  try {
    const plural = HomeModel.plural;
    const magic = String.fromCharCode(...new Uint8Array(await f.slice(0, 4).arrayBuffer()));   // a tablet may rename an unfamiliar file (….bin)
    if (SaveFile.isBackup(f.name) || magic === 'SBX1') {
      const r = await vm.importFile(new Uint8Array(await f.arrayBuffer()));
      if (!r.complete) setTimeout(() => modal({ title: 'Recovered from a damaged backup', body: h('div', {}, ...r.problems.map(t => h('p', { style: { marginTop: 0 } }, t)),
        h('p', { class: 'muted small' }, 'What could be read was imported as a new project, marked “(recovered)”. If the device that made the backup still has the project, download a fresh backup from it.')), buttons: [{ label: 'OK', primary: true }] }), 400);
      if (r.contacts != null) toast(r.restored == null && !r.project ? `Imported ${plural(r.contacts, 'contact')}` : `Merged ${plural(r.contacts, 'contact')}`);
      if (r.restored != null) toast(`Restored ${plural(r.restored, 'project')}`);
      if (r.project) { open(r.project); toast('Imported “' + r.project.title + '”'); }
      return;
    }
    const p = await vm.importScript(await readScriptFile(f), f.name, mode); open(p); toast('Imported “' + p.title + '”');
  } catch (e) { toast('Import failed: ' + (e.message || e), true); }
}

/* every project and the contacts in one file (also on the project Backup menu) */
async function backupAll() {
  const b = new HomeVM().backupAll(); if (!b) return toast('There are no projects to back up yet.', true);
  if (!(await downloadBackup(b))) return;
  toast(`Backed up ${HomeModel.plural(b.n, 'project')}`);
}
