'use strict';
/* ===================================================================
   Photo shoot suite — brief, setups & looks, photo shot list, run of
   show, gear & rentals, releases & permits, selects & approvals.
   A photo project reuses the script's scene blocks as SETUPS
   ("Name — Location — Time"), so schedule, call sheets, breakdown,
   budget, people, locations and reports all work unchanged.
   =================================================================== */
/* The photo shot list's rules live in js/models/photoshots.model.js; these names are kept for older callers. */
const { STATUS: SHOT_STATUS, TONE: SHOT_TONE, ORIENT, letterOf } = PhotoShotsModel;
const PH = P => P.photo;
const newPhotoShot = (sceneId, o) => PhotoShotsModel.newShot(sceneId, o);
const photoShotLabel = (P, s, scenes) => PhotoShotsModel.label(P.photo, s, scenes || getScenes(P));
async function thumbOf(file, max = 300, q = 0.62) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return { thumb: c.toDataURL('image/jpeg', q), w: img.width, h: img.height };
  } finally { URL.revokeObjectURL(url); }
}
const pageShell = (title, sub, ...right) => h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, title), sub ? h('div', { class: 'muted small', style: { marginTop: '3px' } }, sub) : null), h('span', { class: 'grow' }), h('div', { class: 'row', style: { flexWrap: 'wrap' } }, right));
const fld = (label, el, w) => h('div', { class: 'field', style: Object.assign({ marginBottom: 0 }, w ? { flex: w } : {}) }, h('label', { class: 'lbl' }, label), el);
const statusPill = s => h('span', { class: 'pill', style: { background: SHOT_TONE[s] || '#888', color: '#fff' } }, s);

/* ---------------------------------------------------------------
   Setups & looks — VIEW. Rules: js/models/setups.model.js; screen
   state and commands: js/viewmodels/setups.vm.js. These names are
   kept for older callers.
   --------------------------------------------------------------- */
const setupHeading = SetupsModel.heading, setupParts = SetupsModel.parts;
Views.setups = function (root) {
  const vm = new SetupsVM(), wrap = h('div', { class: 'page', style: { maxWidth: '1100px' } }), dl = h('datalist', { id: 'dl-locs' });
  root.append(wrap, dl);
  const remove = async c => {
    const n = vm.linked(c.id), label = c.name || 'this setup';
    const msg = n ? `Delete “${label}”? Its ${n} linked shots, tags and schedule entries stay in the project but become unattached (Backup → Clean up unused data removes them).` : `Delete “${label}”?`;
    if (await confirmBox(msg, 'Delete')) vm.remove(c.id);
  };
  function cardEl(c) {
    const P = vm.P, k = c.id;
    return h('div', { class: 'card setup-card', 'data-key': k, style: { borderLeft: `4px solid ${c.color || 'var(--border)'}` } },
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('div', { class: 'setup-n' }, String(c.num)), h('div', { style: { flex: 1 } }, h('b', { style: { fontFamily: 'var(--head)', fontSize: '17px' } }, c.name || 'Untitled setup')),
        c.day >= 0 ? h('span', { class: 'pill' }, `Day ${c.day + 1}`) : h('span', { class: 'pill muted' }, 'Not scheduled'), h('span', { class: 'pill' }, `${c.shots} shot${c.shots === 1 ? '' : 's'}${c.shots ? ` · ${c.done} done` : ''}`),
        ibtn('up', 'Move up', () => vm.move(k, -1)), ibtn('down', 'Move down', () => vm.move(k, 1)), ibtn('copy', 'Duplicate setup', () => vm.duplicate(k)), ibtn('trash', 'Delete setup', () => remove(c), 'danger')),
      h('div', { class: 'setup-grid' },
        fld('Setup / look name', h('input', { class: 'inp', 'data-key': 'name', value: c.name, oninput: e => vm.setPart(k, 'name', e.target.value) })),
        fld('Location', h('input', { class: 'inp', 'data-key': 'loc', list: 'dl-locs', value: c.loc, placeholder: 'Studio A, Rooftop…', oninput: e => vm.setPart(k, 'loc', e.target.value) })),
        fld('Slot / time of day', h('input', { class: 'inp', 'data-key': 'time', value: c.time, placeholder: 'Morning, Golden hour…', oninput: e => vm.setPart(k, 'time', e.target.value) })),
        fld('Est. time (min)', h('input', { class: 'inp', 'data-key': 'est', type: 'number', min: 0, step: 15, value: c.est, placeholder: '90', oninput: e => vm.setEst(k, e.target.value) })),
        fld('Concept / look', h('textarea', { class: 'inp', 'data-key': 'syn', rows: 2, placeholder: 'What is this setup trying to say?', value: c.synopsis, oninput: e => vm.setSynopsis(k, e.target.value) }), '2 1 100%'),
        fld('Notes (lighting, styling, product…)', h('textarea', { class: 'inp', 'data-key': 'notes', rows: 2, value: c.notes, placeholder: 'Anything the team needs. Select words in the Breakdown to tag props and wardrobe.', oninput: e => vm.setNotes(k, e.target.value) }), '2 1 100%')),
      h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('span', { class: 'small muted' }, 'Talent:'), ...c.cast.map(name => h('span', { class: 'castchip', 'data-key': 'cast:' + name }, name, h('button', { class: 'x', title: 'Remove', onclick: () => { if (!vm.removeTalent(k, name)) toast('This talent comes from the notes text, not a tag.', true); } }, '×'))),
        h('select', { class: 'inp', 'data-key': 'addcast', style: { width: 'auto', padding: '3px 8px' }, onchange: e => { const v = e.target.value; e.target.value = ''; vm.addTalent(k, v); } }, h('option', { value: '', selected: true }, '+ Add talent'), c.talentChoices.map(p => h('option', { value: p.value }, p.label))),
        h('span', { class: 'grow', 'data-key': 'grow' }), h('select', { class: 'inp', 'data-key': 'color', style: { width: 'auto', padding: '3px 8px' }, title: 'Colour label', onchange: e => vm.setColor(k, e.target.value) }, SetupsModel.COLORS.map(([v, l]) => h('option', { value: v, selected: v === c.color }, l))),
        h('a', { class: 'btn sm', 'data-key': 'shots', href: `#/p/${P.id}/photoshots`, onclick: () => vm.openIn('photoshots', k) }, icon('camera', 14), 'Shots'), h('a', { class: 'btn sm', 'data-key': 'bd', href: `#/p/${P.id}/breakdown`, onclick: () => vm.openIn('breakdown', k) }, icon('tag', 14), 'Breakdown')));
  }
  function draw() {
    const cards = vm.cards;
    morph(dl, vm.locations.map(n => h('option', { value: n })));
    morph(wrap, [pageShell('Setups & looks', `${cards.length} setup${cards.length === 1 ? '' : 's'} — each is a lighting set-up, look or scene you shoot. They drive the schedule, call sheets and breakdown.`,
      h('button', { class: 'btn', onclick: () => printTable('Setup list', ['#', 'Setup', 'Location', 'Slot', 'Est. min', 'Concept', 'Shots'], vm.printRows()) }, icon('print', 15), 'Print'),
      h('button', { class: 'btn primary', onclick: () => vm.add() }, icon('plus', 15), 'Add setup')),
      h('div', { class: 'setup-list', 'data-key': 'list' }, cards.length ? cards.map(cardEl) : [h('div', { class: 'empty' }, h('h3', {}, 'No setups yet'), h('p', {}, 'Add your first setup — for example “Hero beauty — Studio A — Morning”.'), h('button', { class: 'btn primary', onclick: () => vm.add() }, 'Add setup'))])]);
  }
  return bindView(vm, draw);
};

/* ---------------------------------------------------------------
   Shoot brief
   --------------------------------------------------------------- */
Views.brief = function (root) {
  /* Shoot brief — VIEW. Rules: js/models/brief.model.js; commands: js/viewmodels/brief.vm.js */
  const vm = new BriefVM(), wrap = h('div', { class: 'page brief-page', style: { maxWidth: '1000px' } }); root.append(wrap);
  const row = (...c) => h('div', { class: 'row', style: { gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '12px' } }, c.map(x => h('div', { style: { flex: '1 1 220px' } }, x)));
  const tin = (k, o = {}) => h(o.area ? 'textarea' : 'input', { class: 'inp', 'data-key': k, rows: o.rows || 3, placeholder: o.ph || '', value: vm.B[k] || '', oninput: e => vm.set(k, e.target.value) });
  const card = (key, ...kids) => h('div', { class: 'card', 'data-key': key, style: { padding: '18px', marginBottom: key === 'approvers' ? '' : '16px' } }, kids);
  function table(t) {
    const T = BriefModel.table(t), rows = vm.rows(t);
    return [h('div', { class: 'row', style: { marginBottom: '6px' } }, h('h3', { style: { fontSize: '15px' } }, T.title), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => vm.addRow(t) }, icon('plus', 14), 'Add')),
      rows.length ? h('table', { class: 'tbl', 'data-key': 'tbl' }, h('thead', {}, h('tr', {}, [...T.cols.map(c => c[1]), ''].map(x => h('th', {}, x)))), h('tbody', {}, rows.map(r => h('tr', { 'data-key': r.id }, ...T.cols.map(([k, , o = {}]) => h('td', {},
        o.select ? h('select', { class: 'inp', onchange: e => vm.setCell(t, r.id, k, e.target.value) }, o.select.map(x => h('option', { value: x, selected: x === r[k] }, x)))
          : h('input', { class: 'cell', type: o.type, value: r[k] || '', placeholder: o.ph || '', oninput: e => vm.setCell(t, r.id, k, e.target.value) }))),
        h('td', { style: { width: '40px' } }, ibtn('trash', 'Remove', () => vm.removeRow(t, r.id), 'danger'))))))
        : h('div', { class: 'small muted', 'data-key': 'hint' }, T.hint)];
  }
  function draw() {
    morph(wrap, [pageShell('Shoot brief', 'The creative and commercial brief everyone works from.', h('button', { class: 'btn', onclick: () => printNode(h('div', { class: 'print-doc', html: vm.printHtml() })) }, icon('print', 15), 'Print brief')),
      card('who', row(fld('Client / brand', tin('client')), fld('Campaign / title', tin('campaign')), fld('Lead photographer', tin('photographer'))), row(fld('Budget cap', tin('budgetCap', { ph: 'e.g. 85,000' })), fld('Shoot window', h('div', { class: 'small muted', style: { paddingTop: '8px' } }, vm.windowText)))),
      card('idea', fld('Concept', tin('concept', { area: true, rows: 4, ph: 'The big idea in a few sentences.' })), h('div', { style: { height: '12px' } }), row(fld('Mood, tone & references', tin('mood', { area: true, rows: 4 })), fld('Objectives', tin('objectives', { area: true, rows: 4 })), fld('Key messages', tin('messages', { area: true, rows: 4 })))),
      card('usage', h('h3', { style: { fontSize: '15px', marginBottom: '10px' } }, 'Usage & licensing'), row(fld('Usage (media)', tin('usage', { ph: 'Print, OOH, digital, social…' })), fld('Territory', tin('territory', { ph: 'Worldwide, EU…' })), fld('Term', tin('term', { ph: '2 years' })), fld('Exclusivity', tin('exclusivity', { ph: 'Category exclusive' })))),
      card('deliverables', h('div', {}, table('deliverables'))),
      card('approvers', h('div', {}, table('approvers')))]);
  }
  return bindView(vm, draw);
};

/* ---------------------------------------------------------------
   Photo shot list (list, board, print) — VIEW. Rules:
   js/models/photoshots.model.js; screen state and commands:
   js/viewmodels/photoshots.vm.js.
   --------------------------------------------------------------- */
Views.photoshots = function (root) {
  const vm = new PhotoShotsVM(), wrap = h('div', { class: 'page', style: { maxWidth: '1280px' } }), dl = h('datalist', { id: 'dl-models' });
  root.append(wrap, dl);
  const refresh = () => vm.refresh();
  let searchT = null;
  const refPick = async s => { const f = (await pickFiles('image/*'))[0]; if (!f) return; vm.set(s.id, 'ref', (await thumbOf(f, 520, 0.8)).thumb); };
  const removeShot = async s => { if (await confirmBox('Delete this shot?')) vm.remove(s.id); };
  const tin = (s, k, o = {}) => h(o.area ? 'textarea' : 'input', { class: 'inp', 'data-key': k, rows: o.rows || 3, list: o.list, placeholder: o.ph || '', value: s[k] || '', oninput: e => vm.set(s.id, k, e.target.value) });
  function shotCard(s) {
    const open = vm.open === s.id;
    return h('div', { class: 'ps-card' + (s.hero ? ' hero' : ''), 'data-id': s.id, 'data-key': s.id },
      h('div', { class: 'ps-ref', style: s.ref ? { backgroundImage: `url(${s.ref})` } : { backgroundImage: '' }, title: 'Reference image — click to set', onclick: () => refPick(s) }, s.ref ? '' : icon('image', 22)),
      h('div', { class: 'ps-main' },
        h('div', { class: 'row', style: { gap: '8px' } }, h('b', { class: 'ps-id' }, vm.label(s)), h('input', { class: 'cell ps-title', value: s.title, placeholder: 'Describe the frame…', oninput: e => vm.set(s.id, 'title', e.target.value) }),
          h('button', { class: 'icon-btn' + (s.hero ? ' on' : ''), title: s.hero ? 'Hero shot' : 'Mark as hero shot', style: { color: s.hero ? '#e8a40c' : 'var(--muted)' }, onclick: () => vm.set(s.id, 'hero', !s.hero) }, icon('star', 17)),
          h('select', { class: 'cell ps-status', style: { background: SHOT_TONE[s.status], color: '#fff' }, onchange: e => vm.set(s.id, 'status', e.target.value) }, SHOT_STATUS.map(x => h('option', { selected: x === s.status }, x)))),
        h('div', { style: { margin: '6px 0 2px' } }, tagChips(vm.P, s, refresh)),
        h('div', { class: 'ps-fields', 'data-key': 'f1' }, fld('Subject / talent', tin(s, 'subject', { list: 'dl-models' })), fld('Format', h('select', { class: 'inp', onchange: e => vm.set(s.id, 'orient', e.target.value) }, ORIENT.map(x => h('option', { value: x, selected: x === s.orient }, x)))),
          fld('Camera · lens', h('div', { class: 'row', style: { gap: '4px' } }, tin(s, 'camera', { ph: 'Body' }), tin(s, 'lens', { ph: '85mm' }))), fld('Lighting', tin(s, 'lighting', { ph: 'Key: 5ft octa left…' }))),
        open ? h('div', { class: 'ps-fields', 'data-key': 'f2' }, fld('Pose / direction', tin(s, 'pose', { area: true, rows: 2 })), fld('Wardrobe', tin(s, 'wardrobe', { area: true, rows: 2 })), fld('Props', tin(s, 'props', { area: true, rows: 2 })), fld('Hair & makeup', tin(s, 'hair', { area: true, rows: 2 })), fld('Notes', tin(s, 'notes', { area: true, rows: 2 }))) : null,
        h('div', { class: 'row', 'data-key': 'foot', style: { marginTop: '6px' } }, h('button', { class: 'btn sm ghost', onclick: () => vm.toggleOpen(s.id) }, open ? 'Fewer details' : 'More details'),
          h('label', { class: 'row small', title: 'Must-have shot (counts toward coverage)' }, h('input', { type: 'checkbox', checked: PhotoShotsModel.isMust(s), onchange: e => vm.set(s.id, 'must', e.target.checked) }), 'Must-have'), h('span', { class: 'grow' }),
          ibtn('copy', 'Duplicate', () => vm.duplicate(s.id)), ibtn('trash', 'Delete shot', () => removeShot(s), 'danger'))));
  }
  function listView() {
    return h('div', { 'data-key': 'list' }, vm.groups.map(({ scene: sc, count, shots }) => h('div', { class: 'ps-group', 'data-key': sc.id },
      h('div', { class: 'row', style: { margin: '18px 0 8px' } }, h('div', { class: 'setup-n' }, String(sc.num)), h('h3', { style: { fontSize: '17px' } }, sc.label), h('span', { class: 'small muted' }, `${count} shot${count === 1 ? '' : 's'}`), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: e => menu(e.currentTarget, [{ label: 'Add 5 shots', onClick: () => vm.add(sc.id, 5) }, { label: 'Set all to “Shot”', onClick: () => vm.setAll(sc.id, 'Shot') }, { label: 'Set all to “Approved”', onClick: () => vm.setAll(sc.id, 'Approved') }]) }, icon('more', 14)),
        h('button', { class: 'btn sm primary', onclick: () => vm.add(sc.id) }, icon('plus', 14), 'Add shot')),
      count ? h('div', { class: 'ps-grid', 'data-key': 'grid' }, shots.map(shotCard)) : h('div', { class: 'small muted', 'data-key': 'none' }, 'No shots planned for this setup yet.'))));
  }
  function boardView() {
    return h('div', { class: 'pk-board', 'data-key': 'board' }, vm.board.map(col => DnD.zone(h('div', { class: 'pk-col' },
      h('div', { class: 'pk-h', style: { borderTopColor: col.tone } }, h('b', {}, col.status), h('span', { class: 'pill' }, String(col.shots.length))),
      col.shots.map(s => DnD.source(h('div', { class: 'pk-card', onclick: () => vm.reveal(s.id) },
        s.ref ? h('div', { class: 'pk-img', style: { backgroundImage: `url(${s.ref})` } }) : null, h('div', { class: 'row', style: { gap: '6px' } }, h('b', {}, vm.label(s)), s.hero ? h('span', { style: { color: '#e8a40c' } }, '★') : null), h('div', { class: 'small' }, s.title || '—'), s.subject ? h('div', { class: 'small muted' }, s.subject) : null), 'phshot', s.id))),
      'phshot', id => vm.set(id, 'status', col.status))));
  }
  function draw() {
    const P = vm.P, scenes = vm.scenes;
    if (!scenes.length) return morph(wrap, [h('div', { class: 'empty', 'data-key': 'nosetups' }, h('h3', {}, 'Add a setup first'), h('p', {}, 'Shots belong to setups (looks). Create your setups, then plan the frames for each.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/${P.mode === 'photo' ? 'setups' : 'script'}` }, 'Go to setups'))]);
    const F = vm.filter, S = vm.stats, view = vm.view;
    morph(dl, vm.talent.map(n => h('option', { value: n })));
    morph(wrap, [pageShell('Photo shot list', 'Plan every frame, track it from capture to delivery.',
      h('div', { class: 'seg' }, [['list', 'List'], ['board', 'Status board']].map(([k, l]) => h('button', { class: view === k ? 'on' : '', onclick: () => vm.setView(k) }, l))),
      h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-photo-shots.csv', toCSV(vm.csvRows()), 'text/csv') }, icon('download', 15), 'CSV'),
      h('button', { class: 'btn', onclick: () => { const t = vm.printTable(); printTable('Photo shot list', t.head, t.rows); } }, icon('print', 15), 'Print')),
      h('div', { class: 'ps-stats', 'data-key': 'stats' }, h('div', { class: 'ps-bar' }, S.counts.filter(c => c[1]).map(([st, n]) => h('i', { style: { flex: n, background: SHOT_TONE[st] }, title: `${st}: ${n}` }))), h('div', { class: 'small muted' }, vm.statsText)),
      h('div', { 'data-key': 'tags' }, tagFilterBar(P, vm.tagFilter, refresh)),
      h('div', { class: 'row wrap', 'data-key': 'filters', style: { margin: '12px 0' } },
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setFilter('setup', e.target.value) }, h('option', { value: '' }, 'All setups'), scenes.map(s => h('option', { value: s.id, selected: s.id === F.setup }, `${s.num}. ${s.label}`.slice(0, 60)))),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setFilter('status', e.target.value) }, h('option', { value: '' }, 'Any status'), SHOT_STATUS.map(st => h('option', { selected: st === F.status }, st))),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: F.hero, onchange: e => vm.setFilter('hero', e.target.checked) }), 'Hero shots only'),
        h('input', { class: 'inp', placeholder: 'Search shots…', value: F.q, style: { width: '200px' }, oninput: e => { const v = e.target.value; clearTimeout(searchT); searchT = setTimeout(() => vm.setFilter('q', v), 250); } })),
      view === 'board' ? boardView() : listView()]);
  }
  const unbind = bindView(vm, draw);
  return () => { clearTimeout(searchT); unbind(); };
};
