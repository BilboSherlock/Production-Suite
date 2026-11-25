'use strict';
/* ===================================================================
   Shot list — VIEW. Plan coverage per scene, track progress on set.
   Rules: js/models/shots.model.js; screen state and commands:
   js/viewmodels/shots.vm.js. Shot tags: js/tags.js.
   =================================================================== */
/* older global names, used by storyboards, takes, the lined script, reports, live desk and samples */
const SHOT_OPTS = ShotsModel.OPTS;
const newShot = (sceneId, o) => ShotsModel.newShot(sceneId, o);
const shotLabel = (P, s, scenes) => ShotsModel.label(P, s, scenes || getScenes(P));

Views.shots = function (root) {
  const vm = new ShotsVM(), P = Store.P;
  if (!vm.scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes to cover yet'), h('p', {}, 'Write scenes in the Script view and they will appear here, ready for a shot list.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/script` }, 'Go to Script')))); return; }
  root.parentElement.classList.add('noscroll');
  const toolbar = h('div', { class: 'toolbar' }), tagBar = h('div'), main = h('div', { class: 'shots-main' }), side = h('div', { class: 'shots-side' });
  const dls = Object.entries(vm.opts).map(([k, v]) => h('datalist', { id: 'dl-' + k }, v.map(o => h('option', { value: o }))));
  root.append(h('div', { class: 'script-wrap' }, toolbar, tagBar, h('div', { class: 'shots-wrap' }, main, side), ...dls));
  const refresh = () => vm.refresh();

  function add(sceneId) {
    const s = vm.add(sceneId); if (!s) return;
    setTimeout(() => { const t = $(`[data-shot="${s.id}"] textarea`, main); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } }, 30);
  }
  function more(btn) {
    menu(btn, [
      { label: 'Add a master shot to scenes without coverage', icon: 'wand', onClick: () => { const n = vm.addMasters(); toast(n ? `Added ${n} master shot${n > 1 ? 's' : ''}` : 'Every scene already has shots'); } },
      { label: vm.selecting ? 'Stop selecting shots' : 'Select shots to tag in bulk', icon: 'tag', onClick: () => vm.setSelecting(!vm.selecting) },
      { label: 'Manage shot tags…', icon: 'tag', onClick: () => openTagManager(P, refresh) },
      { label: 'Mark all shots not done', icon: 'rotate', onClick: () => vm.resetDone() },
    ]);
  }
  const csv = () => download(slug(P.title) + '-shotlist.csv', toCSV(vm.csvRows()), 'text/csv');
  const print = () => { const r = vm.printRows(); printTable('Shot list', r.head, r.rows); };
  const refUpload = async s => { const f = await pickFile('image/*'); if (f) vm.setRef(s.id, await readImage(f, 600)); };

  function drawToolbar() {
    const pr = vm.progress;
    morph(toolbar, [
      h('select', { class: 'inp', style: { width: '260px' }, onchange: e => vm.setScene(e.target.value) },
        h('option', { value: 'all' }, 'All scenes'), vm.scenes.map(s => h('option', { value: s.id, selected: s.id === vm.sceneId }, `${s.num}. ${s.label}`.slice(0, 60)))),
      h('button', { class: 'btn primary', onclick: () => add() }, icon('plus', 15), 'Add shot'),
      h('div', { class: 'row small muted' }, h('div', { class: 'progress' }, h('i', { style: { width: pr.pct + '%' } })), `${pr.done}/${pr.total} shot`), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: e => more(e.currentTarget) }, icon('more', 15), 'More'),
      h('button', { class: 'btn', onclick: csv }, icon('download', 15), 'CSV'),
      h('button', { class: 'btn', onclick: print }, icon('print', 15), 'Print')]);
  }
  function drawTagBar() {
    const n = vm.picked.size;
    morph(tagBar, [tagFilterBar(P, vm.filter, refresh), vm.selecting ? h('div', { class: 'tag-bar', 'data-key': 'sel' }, h('b', { class: 'small' }, `${n} selected`),
      h('button', { class: 'btn sm', disabled: !n, onclick: e => tagPopover(e.currentTarget, P, vm.pickedShots, refresh) }, icon('tag', 13), 'Tag selected'),
      h('button', { class: 'btn sm ghost', onclick: () => vm.pickShown() }, 'Select all shown'), h('button', { class: 'btn sm ghost', onclick: () => vm.clearPicks() }, 'Clear'), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: () => vm.setSelecting(false) }, 'Done selecting')) : null]);
  }
  const cellIn = (s, k) => h('input', { class: 'cell', value: s[k] || '', list: 'dl-' + k, oninput: e => vm.update(s.id, k, e.target.value, { quiet: true }) });
  const area = (s, k, ph) => h('textarea', { class: 'cell auto', rows: 1, placeholder: ph, value: s[k] || '', oninput: e => { autosize(e.target); vm.update(s.id, k, e.target.value, { quiet: true }); } });
  function frameCell(s) {
    const f = vm.frame(s);
    if (f && f.kind === 'board') return h('img', { class: 'thumb', src: f.src, title: 'Storyboard frame' });
    if (f) return h('img', { class: 'thumb', src: f.src, style: { cursor: 'pointer' }, title: 'Reference image — click to replace, Shift+click to remove', onclick: e => { if (e.shiftKey) vm.setRef(s.id, ''); else refUpload(s); } });
    return h('button', { class: 'thumb muted small', style: { display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px dashed var(--border)' }, title: 'Add a reference image (or draw a storyboard frame)', onclick: () => refUpload(s) }, '+ Ref');
  }
  function shotRow(s) {
    return h('tr', { class: (s.done ? 'done' : '') + (vm.picked.has(s.id) ? ' sel' : ''), 'data-shot': s.id, 'data-key': s.id },
      vm.selecting ? h('td', { style: { width: '30px' } }, h('input', { type: 'checkbox', checked: vm.picked.has(s.id), onchange: e => vm.togglePick(s.id, e.target.checked) })) : null,
      h('td', {}, h('input', { type: 'checkbox', checked: !!s.done, title: 'Mark as shot', style: { width: '18px', height: '18px', margin: '8px 6px' }, onchange: e => vm.setDone(s.id, e.target.checked) })),
      h('td', { style: { fontWeight: 700, padding: '10px 8px', whiteSpace: 'nowrap' } }, vm.label(s)),
      h('td', {}, frameCell(s)), h('td', { style: { width: '90px' } }, cellIn(s, 'size')), h('td', { style: { width: '120px' } }, cellIn(s, 'angle')),
      h('td', { style: { width: '120px' } }, cellIn(s, 'move')), h('td', { style: { width: '84px' } }, cellIn(s, 'lens')), h('td', { style: { width: '120px' } }, cellIn(s, 'equip')),
      h('td', { style: { minWidth: '240px' } }, area(s, 'desc', 'What happens in this shot…')),
      h('td', { style: { minWidth: '150px' } }, tagChips(P, s, refresh)),
      h('td', { style: { minWidth: '150px' } }, area(s, 'notes', 'Notes')),
      h('td', { style: { whiteSpace: 'nowrap' } }, ibtn('up', 'Move up', () => vm.move(s.id, -1)), ibtn('down', 'Move down', () => vm.move(s.id, 1)),
        ibtn('copy', 'Duplicate', () => vm.duplicate(s.id)), ibtn('trash', 'Delete shot', () => vm.remove(s.id), 'danger')));
  }
  function drawTable() {
    const cols = vm.selecting ? 13 : 12, rows = [];
    vm.groups.forEach(({ scene: sc, shots, any, progress: pr }) => {
      rows.push(h('tr', { class: 'grp', 'data-key': 'g:' + sc.id }, h('td', { colspan: cols }, h('div', { class: 'row' }, h('span', { style: { color: 'var(--accent)' } }, sc.num), h('span', { class: 'grow' }, sc.label),
        shots.length ? h('span', { class: 'small muted', style: { fontWeight: 500 } }, `${pr.done}/${pr.total} done`) : null,
        h('button', { class: 'btn sm', onclick: () => add(sc.id) }, icon('plus', 13), 'Shot')))));
      if (!shots.length) rows.push(h('tr', { 'data-key': 'none:' + sc.id }, h('td', { colspan: cols, class: 'muted', style: { padding: '12px 16px' } }, any ? 'No shots match the tag filter.' : 'No shots planned for this scene yet.')));
      shots.forEach(s => rows.push(shotRow(s)));
    });
    morph(main, h('table', { class: 'tbl', style: { minWidth: '1330px' } }, h('thead', {}, h('tr', {}, [...(vm.selecting ? [''] : []), '', 'Shot', 'Frame', 'Size', 'Angle', 'Movement', 'Lens', 'Equipment', 'Description', 'Tags', 'Notes', ''].map(x => h('th', {}, x)))), h('tbody', {}, rows)));
    autosizeAll(main);
  }
  /* side panel: the chosen scene's script and the director's notes */
  function drawSide() {
    const sd = vm.side; side.classList.toggle('hidden', !sd);
    if (!sd) return morph(side, []);
    const mini = miniScene(P, sd.scene); mini.dataset.key = 'mini:' + sd.scene.id;
    morph(side, [h('h3', { style: { marginBottom: '10px' } }, `Scene ${sd.scene.num}`), h('label', { class: 'lbl' }, "Director's notes"),
      h('textarea', { class: 'inp auto', rows: 4, placeholder: 'Intent, tone, performance, visual approach, references…', value: sd.dirNotes, oninput: e => { autosize(e.target); vm.setDirNotes(e.target.value, { quiet: true }); } }),
      h('label', { class: 'lbl', style: { marginTop: '16px' } }, 'Script'), mini]);
    autosizeAll(side);
  }
  const unbind = bindView(vm, () => { drawToolbar(); drawTagBar(); drawTable(); drawSide(); });
  return () => { unbind(); root.parentElement.classList.remove('noscroll'); };
};
