'use strict';
/* ===================================================================
   Photo suite, part 2 — selects & approvals, gear & rentals,
   releases & permits, run of show, sample project
   =================================================================== */

/* ---------------------------------------------------------------
   Selects & approvals — VIEW. Rules: js/models/selects.model.js;
   screen state and commands: js/viewmodels/selects.vm.js. These
   names are kept for older callers.
   --------------------------------------------------------------- */
const SEL_STATUS = SelectsModel.STATUS, SEL_COLORS = SelectsModel.COLORS;
Views.selects = function (root) {
  const vm = new SelectsVM(), P = () => vm.P, wrap = h('div', { class: 'page', style: { maxWidth: '1500px' } });
  let progress = '';
  root.append(wrap);
  async function importImages() {
    const files = (await pickFiles('image/*')).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name)); if (!files.length) return;
    if (vm.isBig(files.length) && !(await confirmBox(`That brings the project to ${vm.all.length + files.length} images. Thumbnails are stored in this browser, so very large sets slow saving. Continue?`, 'Continue'))) return;
    const got = []; let bad = 0;
    for (const f of files) {
      try { const t = await thumbOf(f, 300, 0.6); got.push({ name: f.name, thumb: t.thumb, w: t.w, h: t.h }); } catch (e) { bad++; }
      progress = `Importing ${got.length + bad}/${files.length}…`; draw(); if (got.length % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }
    progress = ''; const n = vm.addImages(got); if (!n) draw();
    toast(`Added ${n} image${n === 1 ? '' : 's'}${bad ? `, ${bad} could not be read` : ''}`, !!bad && !n);
  }
  const stars = (x, size = 13) => h('span', { class: 'stars' }, [1, 2, 3, 4, 5].map(i => h('i', { class: i <= x.rating ? 'on' : '', style: { fontSize: size + 'px' }, onclick: e => { e.stopPropagation(); vm.rate(x.id, i); } }, '★')));
  function cell(x, list) {
    const S = vm.size;
    return h('div', { 'data-key': x.id, class: 'sel-cell' + (x.flag ? ' ' + x.flag : ''), style: { width: S + 'px' }, onclick: () => lightbox(list.map(y => y.id), list.indexOf(x)) },
      h('div', { class: 'sel-img', style: { height: Math.round(S * .78) + 'px', backgroundImage: `url(${x.thumb})` } }, x.flag === 'pick' ? h('span', { class: 'sel-flag pick' }, '⚑') : x.flag === 'reject' ? h('span', { class: 'sel-flag rej' }, '✕') : null, x.color ? h('span', { class: 'sel-col', style: { background: SEL_COLORS[x.color] } }) : null),
      h('div', { class: 'sel-meta' }, h('div', { class: 'clip small', title: x.name }, x.name), stars(x), h('div', { class: 'small', style: { color: 'var(--muted)' } }, x.status)));
  }
  /** the viewer browses the frames that were in view when it opened (by id), and redraws on every change */
  function lightbox(ids, i) {
    if (!ids.length) return;
    const box = h('div', { class: 'lightbox' }), ov = h('div', { class: 'overlay lb-overlay' }, box);
    const cur = () => vm.find(ids[i]);
    const render = () => {
      const x = cur(); if (!x) return close();
      morph(box, [h('div', { class: 'lb-stage', 'data-key': 'stage' }, h('img', { src: x.thumb, alt: x.name }), ibtn('left', 'Previous (←)', () => go(-1), 'lb-nav l'), ibtn('right', 'Next (→)', () => go(1), 'lb-nav r')),
        h('div', { class: 'lb-side', 'data-key': 'side:' + x.id }, h('b', { style: { wordBreak: 'break-all' } }, x.name), h('div', { class: 'small muted' }, `${i + 1} of ${ids.length}${x.w ? ` · ${x.w}×${x.h}` : ''}`), h('div', { style: { margin: '10px 0' } }, stars(x, 22)),
          h('div', { class: 'row', style: { marginBottom: '8px' } }, [['pick', '⚑ Pick'], ['reject', '✕ Reject'], ['', 'Clear']].map(([k, l]) => h('button', { class: 'btn sm' + (x.flag === k ? ' primary' : ''), onclick: () => vm.setFlag(x.id, k) }, l))),
          h('div', { class: 'row', style: { marginBottom: '10px', gap: '6px' } }, [...Object.entries(SEL_COLORS), ['', '#999']].map(([k, c]) => h('button', { class: 'sel-dot' + (x.color === k ? ' on' : ''), title: k || 'No colour', style: { background: c }, onclick: () => vm.setColor(x.id, k) }))),
          fld('Status', h('select', { class: 'inp', onchange: e => vm.setStatus(x.id, e.target.value) }, SEL_STATUS.map(s => h('option', { selected: s === x.status }, s)))), h('div', { style: { height: '8px' } }),
          fld('Linked shot', h('select', { class: 'inp', onchange: e => vm.linkShot(x.id, e.target.value) }, h('option', { value: '', selected: !x.shotId }, 'No shot'), vm.shots.map(s => h('option', { value: s.id, selected: s.id === x.shotId }, s.label)))), h('div', { style: { height: '8px' } }),
          fld('Note', h('textarea', { class: 'inp', rows: 3, value: x.note || '', placeholder: 'Retouching or client note…', oninput: e => vm.setNote(x.id, e.target.value) })),
          h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Keys: ← → browse · 1–5 rating · 0 clear · P pick · X reject · U unflag · Esc close'))]);
    };
    const go = d => { i = (i + d + ids.length) % ids.length; render(); };
    const off = vm.subscribe(render);
    let closed = false;
    function close() { if (closed) return; closed = true; off(); document.removeEventListener('keydown', key, true); ov.remove(); }
    const key = e => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) { if (e.key === 'Escape') close(); return; }
      const id = ids[i];
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
      else if (/^[0-5]$/.test(e.key)) vm.setRating(id, +e.key); else if (/^p$/i.test(e.key)) vm.toggleFlag(id, 'pick'); else if (/^x$/i.test(e.key)) vm.toggleFlag(id, 'reject'); else if (/^u$/i.test(e.key)) vm.setFlag(id, ''); else return;
      e.preventDefault(); e.stopPropagation();
    };
    document.body.append(ov); ov.addEventListener('click', e => { if (e.target === ov) close(); }); document.addEventListener('keydown', key, true); render();
    closeLightbox = close;
  }
  let closeLightbox = () => {};
  const contactSheet = () => {
    const list = vm.rows; if (!list.length) return toast('Nothing to print with these filters.', true);
    printNode(h('div', { class: 'print-doc' }, h('h1', {}, `${P().title} — Contact sheet`), h('div', { class: 'sub' }, `${list.length} images · ${new Date().toLocaleDateString()}`), h('div', { class: 'cs-print' }, list.map(x => h('div', { class: 'cs-item' }, h('img', { src: x.thumb }), h('div', {}, x.name), h('div', {}, SelectsModel.caption(x)))))));
  };
  const copyPicks = () => { const n = vm.picks(); if (!n.length) return toast('No picked images in this view.', true); copyText(n.join('\n')).then(ok => toast(ok ? `Copied ${n.length} picked filenames` : 'Could not copy', !ok)); };
  const sel = (k, opts) => h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setFilter(k, e.target.value) }, opts);
  function draw() {
    const list = vm.rows, F = vm.filter, total = vm.all.length;
    morph(wrap, [pageShell('Selects & approvals', 'Import frames as thumbnails, rate and pick them, and track approvals. Full-size files stay on your drive — only small previews are stored here.',
      h('button', { class: 'btn', onclick: copyPicks }, icon('copy', 15), 'Copy picks'),
      h('button', { class: 'btn', onclick: () => download(slug(P().title) + '-selects.csv', toCSV(vm.csvRows()), 'text/csv') }, icon('download', 15), 'CSV'),
      h('button', { class: 'btn', onclick: contactSheet }, icon('print', 15), 'Contact sheet'),
      h('button', { class: 'btn primary', onclick: importImages }, icon('upload', 15), 'Import images')),
      h('span', { class: 'small muted', 'data-key': 'prog' }, progress),
      h('div', { class: 'small muted', 'data-key': 'stats', style: { margin: '6px 0 12px' } }, vm.statsText),
      h('div', { class: 'row wrap', 'data-key': 'filters', style: { marginBottom: '12px' } },
        sel('rating', [0, 1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: n === F.rating }, n ? `${n}★ and up` : 'Any rating'))),
        sel('flag', SelectsModel.FLAG_FILTERS.map(([k, l]) => h('option', { value: k, selected: k === F.flag }, l))),
        sel('status', [h('option', { value: '' }, 'Any status'), ...SEL_STATUS.map(s => h('option', { selected: s === F.status }, s))]),
        sel('color', [h('option', { value: '' }, 'Any colour'), ...Object.keys(SEL_COLORS).map(c => h('option', { selected: c === F.color }, c))]),
        sel('shot', [h('option', { value: '' }, 'Any shot'), ...vm.shots.map(s => h('option', { value: s.id, selected: s.id === F.shot }, s.label))]),
        sel('sort', SelectsModel.SORTS.map(([k, l]) => h('option', { value: k, selected: k === F.sort }, l))),
        h('span', { class: 'grow' }), h('label', { class: 'row small' }, 'Size', h('input', { type: 'range', min: 110, max: 360, value: vm.size, oninput: e => { vm.setSize(e.target.value); $$('.sel-cell', wrap).forEach(c => { c.style.width = vm.size + 'px'; c.firstChild.style.height = Math.round(vm.size * .78) + 'px'; }); } }))),
      h('div', { class: 'sel-grid', 'data-key': 'grid' }, list.length ? list.map(x => cell(x, list)) : [h('div', { class: 'empty', style: { width: '100%' } }, h('h3', {}, total ? 'No images match these filters' : 'No images yet'), h('p', {}, total ? 'Loosen the filters above.' : 'Import a folder of frames (JPG, PNG, WebP). Rate with the keyboard in the viewer: 1–5, P to pick, X to reject.'))])]);
  }
  const unbind = bindView(vm, draw);
  return () => { closeLightbox(); unbind(); };
};

/* ---------------------------------------------------------------
   Gear & rentals (Photo & Podcast)
   --------------------------------------------------------------- */
/* the rules live in js/models/gear.model.js; these names are kept for older callers */
const { cats: GEAR_CATS, statuses: GEAR_STATUS, budget: GEAR_BUDGET } = GearModel.KINDS.photo;
const { cats: PODCAST_GEAR_CATS, statuses: PODCAST_GEAR_STATUS, budget: PODCAST_GEAR_BUDGET } = GearModel.KINDS.podcast;
const starterGear = () => GearModel.starter('photo'), starterPodcastGear = () => GearModel.starter('podcast');

/* Gear & rentals — VIEW (photo shoots and podcasts). Rules: js/models/gear.model.js;
   screen state and commands: js/viewmodels/gear.vm.js. */
Views.gear = function (root) {
  const vm = new GearVM(), P = () => vm.P;
  const wrap = h('div', { class: 'page', style: { maxWidth: '1250px' } }), dl = h('datalist', { id: 'dl-gearsrc' });
  root.append(wrap, dl);
  function reports(e) {
    const K = vm.kind;
    menu(e.currentTarget, [
      { label: 'Pack list (print)', icon: 'print', onClick: () => printTable(K.packTitle, ['☐', 'Category', 'Item', 'Qty', 'Source', 'Status'], vm.packRows(), { landscape: false }) },
      { label: 'Rental order by source (print)', icon: 'print', onClick: () => { const R = vm.rentals(); if (!R.length) return toast('No rental items — set Source to the rental house name.', true); printTable('Rental orders', ['Item', 'Qty', 'Days', 'Pick-up', 'Return', 'Total'], R.flatMap(r => [{ grp: `${r.source} — ${money(r.total)}` }, ...r.items.map(g => [g.name, g.qty, GearModel.days(g, vm.nDays), g.pickup, g.ret, money(vm.cost(g))])]), { landscape: false }); } },
      { label: 'CSV', icon: 'download', onClick: () => download(slug(P().title) + '-gear.csv', toCSV(vm.csv()), 'text/csv') }]);
  }
  function toBudget() { const n = vm.toBudget(); toast(n ? `Budget updated with ${n} gear line${n > 1 ? 's' : ''}` : 'Add a day rate to gear items first.', !n); }
  function rowEl(g) {
    const tot = h('td', { style: { whiteSpace: 'nowrap', fontWeight: 600 } }, money(vm.cost(g)));
    const f = (k, o = {}) => h('input', { class: 'cell', type: o.type, list: o.list, min: o.type === 'number' ? 0 : undefined, value: g[k] || '', placeholder: o.ph || '', style: o.w ? { width: o.w } : {},
      oninput: e => { vm.set(g.id, k, e.target.value); tot.textContent = money(vm.cost(g)); } });
    return h('tr', { 'data-key': g.id }, h('td', {}, f('name', { ph: 'Item' })), h('td', {}, f('qty', { type: 'number', w: '58px' })), h('td', {}, f('source', { list: 'dl-gearsrc', ph: 'Owned / rental house' })), h('td', {}, f('rate', { type: 'number', w: '84px' })), h('td', {}, f('days', { type: 'number', w: '58px', ph: String(vm.nDays || 1) })), tot,
      h('td', {}, f('pickup', { type: 'date' })), h('td', {}, f('ret', { type: 'date' })),
      h('td', {}, h('select', { class: 'cell', onchange: e => vm.set(g.id, 'status', e.target.value) }, vm.kind.statuses.map(s => h('option', { selected: s === g.status }, s)))),
      h('td', { style: { width: '70px' } }, ibtn('copy', 'Duplicate', () => vm.duplicate(g.id)), ibtn('trash', 'Delete', () => vm.remove(g.id), 'danger')));
  }
  function draw() {
    const K = vm.kind, G = vm.groups, S = vm.stats, f = vm.f, n = vm.gear.length;
    morph(dl, vm.sources.map(x => h('option', { value: x })));
    morph(wrap, [pageShell(K.title, K.sub,
      h('button', { class: 'btn', onclick: reports }, icon('print', 15), 'Reports'),
      h('button', { class: 'btn', title: 'Create budget lines from items with a day rate', onclick: toBudget }, icon('dollar', 15), 'Send to budget'),
      h('button', { class: 'btn primary', onclick: e => menu(e.currentTarget, K.cats.map(c => ({ label: c, onClick: () => vm.add(c) }))) }, icon('plus', 15), 'Add item')),
      h('div', { class: 'sum', 'data-key': 'sum', style: { marginBottom: '14px' } }, h('div', {}, h('span', {}, 'Items'), h('b', {}, String(S.count))), h('div', {}, h('span', {}, 'Ready'), h('b', {}, `${S.ready}/${S.count}`)), h('div', {}, h('span', {}, 'Rental & gear cost'), h('b', { style: { color: 'var(--accent)' } }, money(S.total)))),
      h('div', { class: 'row wrap', 'data-key': 'filters', style: { marginBottom: '8px' } },
        h('input', { class: 'inp', value: f.q, placeholder: K.search, style: { width: '220px' }, oninput: e => vm.setSearch(e.target.value) }),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setStatusFilter(e.target.value) }, h('option', { value: '', selected: !f.status }, 'Any status'), K.statuses.map(s => h('option', { selected: s === f.status }, s))),
        n ? null : h('button', { class: 'btn', 'data-key': 'starter', onclick: () => vm.addStarter() }, icon('wand', 15), K.starterLabel)),
      G.length ? h('div', { 'data-key': 'list' }, G.map(({ cat, items }) => [
        h('h3', { 'data-key': 'h:' + cat, style: { fontSize: '14px', margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' } }, `${cat} · ${items.length}`),
        h('div', { class: 'rep-wrap', 'data-key': 't:' + cat }, h('table', { class: 'tbl wide gear-t' }, h('thead', {}, h('tr', {}, ['Item', 'Qty', 'Source', 'Rate / day', 'Days', 'Total', 'Pick-up', 'Return', 'Status', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, items.map(rowEl))))]))
        : h('div', { class: 'empty', 'data-key': 'empty' }, h('h3', {}, n ? 'Nothing matches' : 'No gear yet'), h('p', {}, K.empty))]);
  }
  return bindView(vm, draw);
};

/* ---------------------------------------------------------------
   Releases & permits
   --------------------------------------------------------------- */
/* Releases & permits — VIEW. Rules: js/models/releases.model.js; screen state and
   commands: js/viewmodels/releases.vm.js. These names are kept for older callers. */
const REL_KINDS = ReleasesModel.KINDS, REL_STATUS = ReleasesModel.STATUS;
const ageOf = dob => ReleasesModel.ageOn(dob, localISODate());
Views.compliance = function (root) {
  const vm = new ReleasesVM(), wrap = h('div', { class: 'page', style: { maxWidth: '1200px' } }), dl = h('datalist', { id: 'dl-relwho' });
  root.append(wrap, dl);
  function generate() { const n = vm.generate(); toast(n ? `Added ${n} checklist item${n > 1 ? 's' : ''}` : 'Checklist is already up to date', !n); }
  function rowEl(r) {
    const cell = (k, o = {}) => h('input', Object.assign({ class: 'cell', value: r[k] || '', oninput: e => vm.set(r.id, k, e.target.value) }, o));
    return h('tr', { 'data-key': r.id, class: ReleasesModel.isDone(r) ? 'done' : '' },
      h('td', {}, h('select', { class: 'cell', onchange: e => vm.set(r.id, 'kind', e.target.value) }, REL_KINDS.map(k => h('option', { selected: k === r.kind }, k)))),
      h('td', {}, cell('who', { list: 'dl-relwho' })),
      h('td', {}, h('select', { class: 'cell', style: { fontWeight: 700, color: r.status === 'Signed' ? 'var(--ok)' : r.status === 'Needed' ? 'var(--danger)' : 'inherit' }, onchange: e => vm.set(r.id, 'status', e.target.value) }, REL_STATUS.map(s => h('option', { selected: s === r.status }, s)))),
      h('td', {}, cell('date', { type: 'date' })), h('td', {}, cell('expires', { type: 'date', style: vm.expired(r) ? { color: 'var(--danger)', fontWeight: 700 } : {} })),
      h('td', {}, cell('notes')), h('td', { style: { width: '44px' } }, ibtn('trash', 'Delete', () => vm.remove(r.id), 'danger')));
  }
  function draw() {
    const rows = vm.rows, S = vm.stats, f = vm.filter;
    morph(dl, vm.who.map(x => h('option', { value: x })));
    morph(wrap, [pageShell('Releases & permits', 'Model and minor consent, property releases, permits, insurance and usage paperwork — nothing shoots until it is signed.',
      h('button', { class: 'btn', onclick: () => printTable('Releases & permits', ['Type', 'Who / what', 'Status', 'Date', 'Expires', 'Notes'], vm.printRows()) }, icon('print', 15), 'Print'),
      h('button', { class: 'btn', onclick: generate, title: 'Create a checklist from your cast, minors (by date of birth) and locations' }, icon('wand', 15), 'Generate from cast & locations'),
      h('button', { class: 'btn primary', onclick: () => vm.add() }, icon('plus', 15), 'Add')),
      h('div', { class: 'sum', 'data-key': 'sum', style: { marginBottom: '14px' } }, h('div', {}, h('span', {}, 'Complete'), h('b', {}, `${S.done}/${S.total}`)), h('div', {}, h('span', {}, 'Outstanding'), h('b', { style: { color: S.open ? 'var(--danger)' : 'var(--ok)' } }, String(S.open))), h('div', {}, h('span', {}, 'Expired'), h('b', { style: { color: S.expired ? 'var(--danger)' : 'inherit' } }, String(S.expired)))),
      h('div', { class: 'row', 'data-key': 'filter', style: { marginBottom: '10px' } }, h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setFilter(e.target.value) }, ReleasesModel.FILTERS.map(([k, l]) => h('option', { value: k, selected: k === f }, l)))),
      rows.length ? h('div', { class: 'rep-wrap', 'data-key': 'tbl' }, h('table', { class: 'tbl wide rel-t' }, h('thead', {}, h('tr', {}, ['Type', 'Who / what', 'Status', 'Date', 'Expires', 'Notes', ''].map(x => h('th', {}, x)))), h('tbody', {}, rows.map(rowEl))))
        : h('div', { class: 'empty', 'data-key': 'empty' }, h('h3', {}, 'Nothing here yet'), h('p', {}, 'Use “Generate from cast & locations” to build the checklist automatically — it adds minor consent for anyone under 18 (from their date of birth).'))]);
  }
  return bindView(vm, draw);
};

/* ---------------------------------------------------------------
   Run of show — VIEW. Rules: js/models/runofshow.model.js; screen
   state and commands: js/viewmodels/runofshow.vm.js. These names
   are kept for older callers.
   --------------------------------------------------------------- */
const ROS_KINDS = RunModel.KINDS, toMin = RunModel.toMin, fromMin = RunModel.fromMin;
Views.runofshow = function (root) {
  const vm = new RunOfShowVM(), wrap = h('div', { class: 'page', style: { maxWidth: '1100px' } }); root.append(wrap);
  const print = () => { if (!vm.rows.length) return toast('Nothing to print.', true); printTable(vm.title, ['Time', 'Min', 'Activity', 'Type', 'Talent', 'Notes'], vm.printRows(), { landscape: false }); };
  const rebuild = async () => { if (vm.rows.length && !(await confirmBox('Replace this day’s run of show with one built from the schedule?', 'Rebuild'))) return; vm.build(); };
  function rowEl(r, scenes) {
    return h('tr', { 'data-key': r.id, class: RunModel.isBreak(r) ? 'ros-break' : '' },
      h('td', { style: { width: '110px' } }, h('input', { class: 'cell', type: 'time', value: r.start, onchange: e => vm.set(r.id, 'start', e.target.value) })),
      h('td', { style: { width: '70px' } }, h('input', { class: 'cell', type: 'number', min: 0, step: 5, value: r.dur, onchange: e => vm.set(r.id, 'dur', e.target.value) })),
      h('td', {}, h('input', { class: 'cell', value: r.title, placeholder: 'Activity', oninput: e => vm.set(r.id, 'title', e.target.value) })),
      h('td', { style: { width: '140px' } }, h('select', { class: 'cell', onchange: e => vm.set(r.id, 'kind', e.target.value) }, ROS_KINDS.map(k => h('option', { selected: k === r.kind }, k)))),
      h('td', { style: { width: '170px' } }, h('select', { class: 'cell', onchange: e => vm.set(r.id, 'sceneId', e.target.value) }, h('option', { value: '', selected: !r.sceneId }, '—'), scenes.map(s => h('option', { value: s.id, selected: s.id === r.sceneId }, `${s.num}. ${s.label}`.slice(0, 30))))),
      h('td', {}, h('input', { class: 'cell', value: r.notes || '', oninput: e => vm.set(r.id, 'notes', e.target.value) })),
      h('td', { style: { width: '84px' } }, ibtn('up', 'Move up', () => vm.moveUp(r.id)), ibtn('trash', 'Delete', () => vm.remove(r.id), 'danger')));
  }
  function draw() {
    const P = vm.P, d = vm.day;
    if (!d) return morph(wrap, [h('div', { class: 'empty', 'data-key': 'nodays' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'The run of show is the hour-by-hour plan for a shoot day. Create a day and schedule your setups first.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/schedule` }, 'Go to Schedule'))]);
    const rows = vm.rows, fin = vm.finish, scenes = vm.scenes;
    morph(wrap, [pageShell('Run of show', 'Minute-by-minute plan for the day: hair & makeup, each setup, moves, lunch and wrap.',
      h('button', { class: 'btn', onclick: print }, icon('print', 15), 'Print'),
      h('button', { class: 'btn', onclick: rebuild }, icon('wand', 15), 'Build from schedule'),
      h('button', { class: 'btn primary', onclick: () => vm.add() }, icon('plus', 15), 'Add row')),
      h('div', { class: 'row', 'data-key': 'day', style: { marginBottom: '12px' } },
        h('select', { class: 'inp', style: { width: 'auto', fontWeight: 600 }, onchange: e => vm.setDay(e.target.value) }, vm.dayOptions.map(o => h('option', { value: o.id, selected: o.id === d.id }, o.label))),
        d.cs ? h('span', { class: 'small muted', 'data-key': 'calls' }, `Crew call ${fmtTime(d.cs.crew)} · shooting call ${fmtTime(d.cs.shoot)} · wrap ${fmtTime(d.cs.wrap)}`) : null,
        h('span', { class: 'grow', 'data-key': 'grow' }),
        fin ? h('span', { class: 'pill' + (fin.late ? ' danger' : ''), 'data-key': 'fin' }, `Finishes ${fmtTime(fin.end)}${fin.late ? ' — after planned wrap' : ''}`) : null),
      rows.length ? h('div', { class: 'rep-wrap', 'data-key': 'tbl' }, h('table', { class: 'tbl wide ros-t' }, h('thead', {}, h('tr', {}, ['Start', 'Min', 'Activity', 'Type', 'Setup', 'Notes', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, rows.map(r => rowEl(r, scenes)))))
        : h('div', { class: 'empty', 'data-key': 'empty' }, h('h3', {}, 'No run of show for this day'), h('p', {}, 'Build one automatically from the day’s scheduled setups (uses each setup’s estimated time), then adjust.'), h('button', { class: 'btn primary', onclick: () => vm.build() }, 'Build from schedule'))]);
  }
  return bindView(vm, draw);
};

/* ---------------------------------------------------------------
   Sample photo shoot
   --------------------------------------------------------------- */
async function createPhotoSample() {
  const p = blankProject('photo', 'AURORA — Spring Campaign'), B = (t, x) => ({ id: uid(), type: t, text: x });
  p.blocks = [B('scene', 'Hero beauty — Studio A — Morning'), B('action', 'Clean white seamless, tight beauty crops. Dewy skin, soft pink lip. Use the 150cm octa as key, strip lights for rim.'),
    B('scene', 'Lifestyle — Rooftop terrace — Golden hour'), B('action', 'Natural light and reflectors. Models mid-laugh with the AURORA bottle. Linen wardrobe, bare feet.'),
    B('scene', 'Product still life — Studio B — Afternoon'), B('action', 'Bottle on wet slate with glass shards and petals. Macro and 45° hero angles.'),
    B('scene', 'Editorial — Old greenhouse — Afternoon'), B('action', 'Moody greens, haze machine, model in oversized trench coat. Film-like grading reference.')];
  p.settings.nav = { preset: 'photo', on: PRESETS.photo.on }; p.meta.author = 'Studio Lumen'; p.meta.logline = 'A fresh, sunlit spring campaign for AURORA skincare.';
  const sc = p.blocks.filter(b => b.type === 'scene').map(b => b.id);
  p.locations = [['Studio A', 'Unit 4, Mill Lane'], ['Rooftop terrace', 'Hotel Meridian, 9th floor'], ['Studio B', 'Unit 5, Mill Lane'], ['Old greenhouse', 'Kew Rd Nursery']].map(([name, address]) => ({ id: uid(), name, address, contact: '', phone: '', permit: name === 'Rooftop terrace' ? 'Applied' : 'Not needed', cost: name.startsWith('Studio') ? '$900' : '$600', notes: '', photo: '' }));
  sc.forEach((id, i) => { p.sceneMeta[id] = { locationId: p.locations[i].id, est: [150, 120, 90, 120][i], synopsis: ['Close, glowing beauty — the key visual.', 'Joyful, unposed, sun-drenched.', 'Premium, tactile, sensory.', 'A darker, editorial counterpoint.'][i] }; });
  const person = (type, name, o) => Object.assign(newPerson(type), { id: uid(), name }, o);
  p.people = [person('cast', 'Maya Okafor', { character: 'MAYA', dob: '1999-04-12', agent: 'Elite Talent', phone: '555-0101' }), person('cast', 'Jonas Weber', { character: 'JONAS', dob: '1996-09-30' }), person('cast', 'Ava Lindqvist', { character: 'AVA', dob: '2009-02-03', notes: 'Minor — guardian on set.' }),
    person('crew', 'Priya Nair', { dept: 'Photography', role: 'Lead photographer' }), person('crew', 'Tom Hale', { dept: 'Digital tech', role: 'Digital tech / tether' }), person('crew', 'Lena Cho', { dept: 'Styling', role: 'Lead stylist' }), person('crew', 'Marco Rossi', { dept: 'Hair & Makeup', role: 'Makeup artist' }), person('crew', 'Sam Brook', { dept: 'Lighting', role: 'Gaffer' })];
  p.days = [newDay(p), newDay(p)]; p.days[0].sceneIds = sc.slice(0, 3); p.days[1].sceneIds = sc.slice(3); Object.assign(p.days[0].cs, { crew: '07:00', shoot: '08:00', wrap: '18:00' }); Object.assign(p.days[1].cs, { crew: '09:00', shoot: '10:00', wrap: '17:00' });
  const ph = p.photo, S = (i, o) => newPhotoShot(sc[i], o);
  ph.brief = Object.assign(ph.brief, { client: 'AURORA Skincare', campaign: 'Spring “First Light”', photographer: 'Priya Nair', concept: 'Skin that looks like morning. Four looks that move from clean and intimate to wild and cinematic.', mood: 'Soft daylight, dewy skin, linen, glass, green. References: Tyler Mitchell, Petra Collins.', objectives: 'Hero KV for OOH and web; 12 social crops; PDP imagery.', messages: 'Fresh · Honest · Radiant', usage: 'Print, OOH, digital, social', territory: 'Worldwide', term: '2 years', exclusivity: 'Skincare category', budgetCap: '85,000',
    deliverables: [{ id: uid(), name: 'Hero key visual', spec: '4:5 · 6000px', qty: 3, channel: 'OOH / print', due: '' }, { id: uid(), name: 'Social crops', spec: '1:1 and 9:16', qty: 12, channel: 'Instagram', due: '' }], approvers: [{ id: uid(), name: 'Elise Park', role: 'Creative director', email: 'elise@aurora.example', status: 'Pending' }] });
  ph.shots = [S(0, { title: 'Tight beauty, eyes to camera', subject: 'Maya Okafor', camera: 'Body A', lens: '100mm', lighting: 'Key: 150cm octa left; rim: 2 strips', hero: true, status: 'Selected' }), S(0, { title: 'Profile with bottle at cheek', subject: 'Maya Okafor', lens: '85mm', lighting: 'Same, add white fill card', status: 'Shot' }), S(0, { title: 'Hands applying serum', subject: 'Maya Okafor', orient: 'Landscape', lens: '100mm macro' }),
    S(1, { title: 'Laughing, bottle in hand', subject: 'Jonas Weber, Ava Lindqvist', orient: 'Landscape', lens: '35mm', lighting: 'Natural + 5-in-1 reflector', hero: true }), S(1, { title: 'Walking along terrace edge', subject: 'Maya Okafor', lens: '70–200mm' }),
    S(2, { title: 'Bottle on wet slate, hero angle', orient: 'Square', camera: 'Body B', lens: '100mm macro', lighting: 'Strip overhead + black flags', hero: true }), S(2, { title: 'Petals and shards, 45°', orient: 'Square' }),
    S(3, { title: 'Model in trench among ferns', subject: 'Maya Okafor', orient: 'Landscape', lens: '50mm', lighting: 'Window light + haze', hero: true })];
  ph.gear = starterGear().slice(0, 10).map((g, i) => Object.assign(g, i < 6 ? { source: 'Pixel Hire', rate: [180, 180, 90, 90, 110, 60][i], days: 2, status: 'Reserved' } : {}));
  ph.releases = [{ id: uid(), kind: 'Model release', who: 'Maya Okafor', status: 'Signed', date: '', expires: '', notes: '' }, { id: uid(), kind: 'Model release', who: 'Jonas Weber', status: 'Sent', date: '', expires: '', notes: '' }, { id: uid(), kind: 'Minor consent', who: 'Ava Lindqvist', status: 'Needed', date: '', expires: '', notes: 'Parent / guardian signature and chaperone.' }, { id: uid(), kind: 'Location permit', who: 'Rooftop terrace', status: 'Sent', date: '', expires: '', notes: '' }];
  tagElement(p, sc[0], 'wardrobe', 'silk robe', { }); const robe = p.wardrobe[0]; if (robe) setItemChars(robe, sc[0], ['MAYA']); tagElement(p, sc[2], 'props', 'slate'); tagElement(p, sc[2], 'props', 'bottle'); tagElement(p, sc[1], 'props', 'bottle'); tagElement(p, sc[3], 'wardrobe', 'trench coat'); if (p.wardrobe[1]) setItemChars(p.wardrobe[1], sc[3], ['MAYA']); tagElement(p, sc[3], 'sfx', 'haze machine');
  tagElement(p, sc[0], 'cast', 'MAYA'); tagElement(p, sc[1], 'cast', 'JONAS'); tagElement(p, sc[1], 'cast', 'AVA'); tagElement(p, sc[3], 'cast', 'MAYA');
  await Store.add(p); location.hash = `#/p/${p.id}/overview`;
}
