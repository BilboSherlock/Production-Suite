'use strict';
/* ===================================================================
   Shot list — plan coverage per scene, track progress on set
   =================================================================== */
const SHOT_OPTS = {
  size: ['ECU', 'BCU', 'CU', 'MCU', 'MS', 'MWS', 'WS', 'EWS', 'Master', 'Insert', 'OTS', 'Two-shot', 'POV', 'Cutaway'],
  angle: ['Eye level', 'High angle', 'Low angle', "Bird's eye", "Worm's eye", 'Dutch tilt', 'Overhead'],
  move: ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Track', 'Handheld', 'Steadicam', 'Crane', 'Zoom', 'Whip pan', 'Push in', 'Pull out', 'Rack focus', 'Drone'],
  lens: ['14mm', '18mm', '24mm', '28mm', '35mm', '50mm', '85mm', '100mm', '135mm', '24-70mm', '70-200mm'],
  equip: ['Tripod', 'Dolly', 'Slider', 'Gimbal', 'Jib', 'Crane', 'Handheld rig', 'Steadicam', 'Drone', 'Car mount'],
};
const newShot = (sceneId, o = {}) => Object.assign({ id: uid(), sceneId, size: '', angle: '', move: '', lens: '', equip: '', desc: '', notes: '', done: false }, o);
const shotLabel = (P, s, scenes) => {
  const sc = (scenes || getScenes(P)).find(x => x.id === s.sceneId); if (!sc) return '?';
  const sib = P.shots.filter(x => x.sceneId === s.sceneId), i = sib.indexOf(s);
  return sc.num + (i < 26 ? String.fromCharCode(65 + i) : '-' + (i + 1));
};

Views.shots = function (root) {
  const P = Store.P; let scenes = getScenes(P);
  if (!scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes to cover yet'), h('p', {}, 'Write scenes in the Script view and they will appear here, ready for a shot list.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/script` }, 'Go to Script')))); return; }
  root.parentElement.classList.add('noscroll');
  if (UI.shotScene !== 'all' && !scenes.find(s => s.id === UI.shotScene)) UI.shotScene = 'all';
  const dls = Object.entries(SHOT_OPTS).map(([k, v]) => h('datalist', { id: 'dl-' + k }, v.map(o => h('option', { value: o }))));
  const main = h('div', { class: 'shots-main' }), side = h('div', { class: 'shots-side' });
  const progress = h('div', { class: 'row small muted' });
  const filter = h('select', { class: 'inp', style: { width: '260px' }, onchange: e => { UI.shotScene = e.target.value; draw(); } },
    h('option', { value: 'all' }, 'All scenes'), scenes.map(s => h('option', { value: s.id, selected: s.id === UI.shotScene }, `${s.num}. ${s.label}`.slice(0, 60))));
  const TF = UI.shotTagF = UI.shotTagF || { ids: new Set(), all: false }; if (!(TF.ids instanceof Set)) UI.shotTagF = TF.ids = new Set(); let selectMode = false; const sel = new Set(); const tagBar = h('div');
  const target = () => UI.shotScene !== 'all' ? UI.shotScene : (scenes.find(s => s.id === UI.scene) || scenes[0]).id;

  const toolbar = h('div', { class: 'toolbar' }, filter,
    h('button', { class: 'btn primary', onclick: () => addShot(target()) }, icon('plus', 15), 'Add shot'), progress, h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: e => menu(e.currentTarget, [
      { label: 'Add a master shot to scenes without coverage', icon: 'wand', onClick: () => { let n = 0; scenes.forEach(s => { if (!P.shots.some(x => x.sceneId === s.id)) { P.shots.push(newShot(s.id, { size: 'Master', angle: 'Eye level', move: 'Static', desc: 'Master — full coverage of the scene' })); n++; } }); Store.touch(); draw(); toast(n ? `Added ${n} master shot${n > 1 ? 's' : ''}` : 'Every scene already has shots'); } },
      { label: selectMode ? 'Stop selecting shots' : 'Select shots to tag in bulk', icon: 'tag', onClick: () => { selectMode = !selectMode; sel.clear(); draw(); } },
      { label: 'Manage shot tags…', icon: 'tag', onClick: () => openTagManager(P, draw) },
      { label: 'Mark all shots not done', icon: 'rotate', onClick: () => { P.shots.forEach(s => s.done = false); Store.touch(); draw(); } },
    ]) }, icon('more', 15), 'More'),
    h('button', { class: 'btn', onclick: exportCSV }, icon('download', 15), 'CSV'),
    h('button', { class: 'btn', onclick: printIt }, icon('print', 15), 'Print'));
  root.append(h('div', { class: 'script-wrap' }, toolbar, tagBar, h('div', { class: 'shots-wrap' }, main, side), ...dls));

  function rowsFor(list) { return list.map(s => [shotLabel(P, s, scenes), s.size, s.angle, s.move, s.lens, s.equip, s.desc, shotTagNames(P, s), s.notes, s.done ? '✓' : '']); }
  const shotsOf = sc => P.shots.filter(s => s.sceneId === sc.id && passTags(s, TF));
  function exportCSV() {
    const rows = [['Scene', 'Shot', 'Size', 'Angle', 'Movement', 'Lens', 'Equipment', 'Description', 'Tags', 'Notes', 'Done']];
    scenes.forEach(sc => shotsOf(sc).forEach(s => rows.push([sc.num, shotLabel(P, s, scenes), s.size, s.angle, s.move, s.lens, s.equip, s.desc, shotTagNames(P, s), s.notes, s.done ? 'Yes' : ''])));
    download(slug(P.title) + '-shotlist.csv', toCSV(rows), 'text/csv');
  }
  function printIt() {
    const rows = [];
    scenes.filter(s => UI.shotScene === 'all' || s.id === UI.shotScene).forEach(sc => {
      const list = shotsOf(sc); if (!list.length) return;
      rows.push({ grp: `Scene ${sc.num} — ${sc.label}` }); rows.push(...rowsFor(list));
    });
    printTable('Shot list', ['Shot', 'Size', 'Angle', 'Movement', 'Lens', 'Equipment', 'Description', 'Tags', 'Notes', 'Done'], rows);
  }
  function addShot(sceneId) {
    const sib = P.shots.filter(x => x.sceneId === sceneId), last = sib[sib.length - 1];
    const s = newShot(sceneId, last ? { lens: last.lens, equip: last.equip } : {});
    const at = last ? P.shots.indexOf(last) + 1 : P.shots.length; P.shots.splice(at, 0, s); Store.touch(); draw();
    setTimeout(() => { const t = $(`[data-shot="${s.id}"] textarea`, main); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } }, 30);
  }
  function move(s, d) {
    const sib = P.shots.filter(x => x.sceneId === s.sceneId), j = sib.indexOf(s) + d; if (j < 0 || j >= sib.length) return;
    const a = P.shots.indexOf(s), b = P.shots.indexOf(sib[j]); [P.shots[a], P.shots[b]] = [P.shots[b], P.shots[a]]; Store.touch(); draw();
  }
  const cellIn = (s, key) => h('input', { class: 'cell', value: s[key] || '', list: 'dl-' + key, oninput: e => { s[key] = e.target.value; Store.touch(); } });
  const refUpload = async s => { const f = await pickFile('image/*'); if (f) { s.ref = await readImage(f, 600); Store.touch(); draw(); } };
  const boardImg = s => {
    const b = P.boards.find(x => x.shotId === s.id && x.img); if (b) return h('img', { class: 'thumb', src: b.img, title: 'Storyboard frame' });
    if (s.ref) return h('img', { class: 'thumb', src: s.ref, style: { cursor: 'pointer' }, title: 'Reference image — click to replace, Shift+click to remove', onclick: e => { if (e.shiftKey) { delete s.ref; Store.touch(); draw(); } else refUpload(s); } });
    return h('button', { class: 'thumb muted small', style: { display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px dashed var(--border)' }, title: 'Add a reference image (or draw a storyboard frame)', onclick: () => refUpload(s) }, '+ Ref');
  };

  function draw() {
    scenes = getScenes(P);
    const shown = scenes.filter(s => UI.shotScene === 'all' || s.id === UI.shotScene);
    const total = P.shots.length, done = P.shots.filter(s => s.done).length;
    progress.innerHTML = ''; progress.append(h('div', { class: 'progress' }, h('i', { style: { width: (total ? done / total * 100 : 0) + '%' } })), `${done}/${total} shot`);
    const tb = h('tbody'); const cols = selectMode ? 13 : 12;
    tagBar.replaceChildren(tagFilterBar(P, TF, draw), ...(selectMode ? [h('div', { class: 'tag-bar' }, h('b', { class: 'small' }, `${sel.size} selected`), h('button', { class: 'btn sm', disabled: !sel.size, onclick: e => tagPopover(e.currentTarget, P, P.shots.filter(s => sel.has(s.id)), draw) }, icon('tag', 13), 'Tag selected'), h('button', { class: 'btn sm ghost', onclick: () => { P.shots.filter(s => passTags(s, TF) && (UI.shotScene === 'all' || s.sceneId === UI.shotScene)).forEach(s => sel.add(s.id)); draw(); } }, 'Select all shown'), h('button', { class: 'btn sm ghost', onclick: () => { sel.clear(); draw(); } }, 'Clear'), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => { selectMode = false; sel.clear(); draw(); } }, 'Done selecting'))] : []));
    shown.forEach(sc => {
      const all = P.shots.filter(s => s.sceneId === sc.id), list = shotsOf(sc), d = list.filter(s => s.done).length;
      tb.append(h('tr', { class: 'grp' }, h('td', { colspan: cols }, h('div', { class: 'row' }, h('span', { style: { color: 'var(--accent)' } }, sc.num), h('span', { class: 'grow' }, sc.label),
        list.length ? h('span', { class: 'small muted', style: { fontWeight: 500 } }, `${d}/${list.length} done`) : null,
        h('button', { class: 'btn sm', onclick: () => addShot(sc.id) }, icon('plus', 13), 'Shot')))));
      if (!list.length) tb.append(h('tr', {}, h('td', { colspan: cols, class: 'muted', style: { padding: '12px 16px' } }, all.length ? 'No shots match the tag filter.' : 'No shots planned for this scene yet.')));
      list.forEach(s => tb.append(h('tr', { class: (s.done ? 'done' : '') + (sel.has(s.id) ? ' sel' : ''), 'data-shot': s.id },
        selectMode ? h('td', { style: { width: '30px' } }, h('input', { type: 'checkbox', checked: sel.has(s.id), onchange: e => { e.target.checked ? sel.add(s.id) : sel.delete(s.id); draw(); } })) : null,
        h('td', {}, h('input', { type: 'checkbox', checked: s.done, title: 'Mark as shot', style: { width: '18px', height: '18px', margin: '8px 6px' }, onchange: e => { s.done = e.target.checked; Store.touch(); draw(); } })),
        h('td', { style: { fontWeight: 700, padding: '10px 8px', whiteSpace: 'nowrap' } }, shotLabel(P, s, scenes)),
        h('td', {}, boardImg(s)), h('td', { style: { width: '90px' } }, cellIn(s, 'size')), h('td', { style: { width: '120px' } }, cellIn(s, 'angle')),
        h('td', { style: { width: '120px' } }, cellIn(s, 'move')), h('td', { style: { width: '84px' } }, cellIn(s, 'lens')), h('td', { style: { width: '120px' } }, cellIn(s, 'equip')),
        h('td', { style: { minWidth: '240px' } }, h('textarea', { class: 'cell auto', rows: 1, placeholder: 'What happens in this shot…', value: s.desc, oninput: e => { s.desc = e.target.value; autosize(e.target); Store.touch(); } })),
        h('td', { style: { minWidth: '150px' } }, tagChips(P, s, () => { })),
        h('td', { style: { minWidth: '150px' } }, h('textarea', { class: 'cell auto', rows: 1, placeholder: 'Notes', value: s.notes, oninput: e => { s.notes = e.target.value; autosize(e.target); Store.touch(); } })),
        h('td', { style: { whiteSpace: 'nowrap' } }, ibtn('up', 'Move up', () => move(s, -1)), ibtn('down', 'Move down', () => move(s, 1)),
          ibtn('copy', 'Duplicate', () => { P.shots.splice(P.shots.indexOf(s) + 1, 0, { ...s, id: uid(), done: false, tags: [...(s.tags || [])] }); Store.touch(); draw(); }),
          ibtn('trash', 'Delete shot', async () => { P.shots = P.shots.filter(x => x !== s); P.takes = (P.takes || []).filter(t => t.shotId !== s.id); P.boards.forEach(b => { if (b.shotId === s.id) b.shotId = ''; }); Store.touch(); draw(); }, 'danger')))));
    });
    main.innerHTML = '';
    main.append(h('table', { class: 'tbl', style: { minWidth: '1330px' } }, h('thead', {}, h('tr', {}, [...(selectMode ? [''] : []), '', 'Shot', 'Frame', 'Size', 'Angle', 'Movement', 'Lens', 'Equipment', 'Description', 'Tags', 'Notes', ''].map(x => h('th', {}, x)))), tb));
    autosizeAll(main);
    // side panel: script + director's notes for the chosen scene
    side.innerHTML = '';
    const sc = UI.shotScene !== 'all' ? scenes.find(s => s.id === UI.shotScene) : null;
    side.classList.toggle('hidden', !sc);
    if (sc) {
      const meta = P.sceneMeta[sc.id] = P.sceneMeta[sc.id] || {};
      side.append(h('h3', { style: { marginBottom: '10px' } }, `Scene ${sc.num}`),
        h('label', { class: 'lbl' }, "Director's notes"),
        h('textarea', { class: 'inp auto', rows: 4, placeholder: 'Intent, tone, performance, visual approach, references…', value: meta.dirNotes || '', oninput: e => { meta.dirNotes = e.target.value; autosize(e.target); Store.touch(); } }),
        h('label', { class: 'lbl', style: { marginTop: '16px' } }, 'Script'), miniScene(P, sc));
      autosizeAll(side);
    }
  }
  draw();
  return () => root.parentElement.classList.remove('noscroll');
};
