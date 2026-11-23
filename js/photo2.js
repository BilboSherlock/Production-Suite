'use strict';
/* ===================================================================
   Photo suite, part 2 — selects & approvals, gear & rentals,
   releases & permits, run of show, sample project
   =================================================================== */

/* ---------------------------------------------------------------
   Selects & approvals
   --------------------------------------------------------------- */
const SEL_STATUS = ['To review', 'Selected', 'Retouch', 'Client review', 'Approved', 'Final'];
const SEL_COLORS = { red: '#e5484d', orange: '#e8830c', yellow: '#ca8a04', green: '#1e8e54', blue: '#2468d8', purple: '#7a45c9' };
Views.selects = function (root) {
  const P = Store.P, ph = P.photo, all = () => ph.selects; const scenes = getScenes(P);
  const F = UI.selF = UI.selF || { rating: 0, flag: '', status: '', shot: '', color: '', sort: 'name' }; UI.selSize = UI.selSize || 190;
  const wrap = h('div', { class: 'page', style: { maxWidth: '1500px' } }), grid = h('div', { class: 'sel-grid' }), stats = h('div', { class: 'small muted', style: { margin: '6px 0 12px' } }), prog = h('span', { class: 'small muted' });
  root.append(wrap);
  const view = () => {
    let r = all().filter(x => x.rating >= F.rating && (!F.flag || (F.flag === 'none' ? !x.flag : x.flag === F.flag)) && (!F.status || x.status === F.status) && (!F.shot || x.shotId === F.shot) && (!F.color || x.color === F.color));
    r = [...r].sort((a, b) => F.sort === 'rating' ? (b.rating - a.rating) || a.name.localeCompare(b.name, undefined, { numeric: true }) : F.sort === 'added' ? 0 : a.name.localeCompare(b.name, undefined, { numeric: true }));
    return r;
  };
  async function importImages() {
    const files = (await pickFiles('image/*')).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name)); if (!files.length) return;
    if (all().length + files.length > 1500 && !(await confirmBox(`That brings the project to ${all().length + files.length} images. Thumbnails are stored in this browser, so very large sets slow saving. Continue?`, 'Continue'))) return;
    let n = 0, bad = 0;
    for (const f of files) { try { const t = await thumbOf(f, 300, 0.6); all().push({ id: uid(), name: f.name, thumb: t.thumb, w: t.w, h: t.h, rating: 0, flag: '', color: '', status: 'To review', shotId: '', note: '' }); n++; } catch (e) { bad++; } prog.textContent = `Importing ${n + bad}/${files.length}…`; if (n % 10 === 0) await new Promise(r => setTimeout(r, 0)); }
    prog.textContent = ''; Store.touch(); toast(`Added ${n} image${n === 1 ? '' : 's'}${bad ? `, ${bad} could not be read` : ''}`, !!bad && !n); draw();
  }
  const shotOpts = () => [h('option', { value: '' }, 'No shot'), ...ph.shots.filter(s => scenes.some(x => x.id === s.sceneId)).map(s => h('option', { value: s.id }, `${photoShotLabel(P, s, scenes)} ${s.title || ''}`.slice(0, 40)))];
  const stars = (x, size = 13) => h('span', { class: 'stars' }, [1, 2, 3, 4, 5].map(i => h('i', { class: i <= x.rating ? 'on' : '', style: { fontSize: size + 'px' }, onclick: e => { e.stopPropagation(); x.rating = x.rating === i ? 0 : i; Store.touch(); draw(); } }, '★')));
  function cell(x, list) {
    return h('div', { class: 'sel-cell' + (x.flag ? ' ' + x.flag : ''), style: { width: UI.selSize + 'px' }, onclick: () => lightbox(list, list.indexOf(x)) },
      h('div', { class: 'sel-img', style: { height: Math.round(UI.selSize * .78) + 'px', backgroundImage: `url(${x.thumb})` } }, x.flag === 'pick' ? h('span', { class: 'sel-flag pick' }, '⚑') : x.flag === 'reject' ? h('span', { class: 'sel-flag rej' }, '✕') : null, x.color ? h('span', { class: 'sel-col', style: { background: SEL_COLORS[x.color] } }) : null),
      h('div', { class: 'sel-meta' }, h('div', { class: 'clip small', title: x.name }, x.name), stars(x), h('div', { class: 'small', style: { color: 'var(--muted)' } }, x.status)));
  }
  function lightbox(list, i) {
    if (!list.length) return; let box;
    const render = () => {
      const x = list[i]; if (!x) return;
      box.replaceChildren(h('div', { class: 'lb-stage' }, h('img', { src: x.thumb, alt: x.name }), ibtn('left', 'Previous (←)', () => go(-1), 'lb-nav l'), ibtn('right', 'Next (→)', () => go(1), 'lb-nav r')),
        h('div', { class: 'lb-side' }, h('b', { style: { wordBreak: 'break-all' } }, x.name), h('div', { class: 'small muted' }, `${i + 1} of ${list.length}${x.w ? ` · ${x.w}×${x.h}` : ''}`), h('div', { style: { margin: '10px 0' } }, stars(x, 22)),
          h('div', { class: 'row', style: { marginBottom: '8px' } }, [['pick', '⚑ Pick'], ['reject', '✕ Reject'], ['', 'Clear']].map(([k, l]) => h('button', { class: 'btn sm' + (x.flag === k ? ' primary' : ''), onclick: () => { x.flag = k; Store.touch(); render(); } }, l))),
          h('div', { class: 'row', style: { marginBottom: '10px', gap: '6px' } }, [...Object.entries(SEL_COLORS), ['', '#999']].map(([k, c]) => h('button', { class: 'sel-dot' + (x.color === k ? ' on' : ''), title: k || 'No colour', style: { background: c }, onclick: () => { x.color = k; Store.touch(); render(); } }))),
          fld('Status', h('select', { class: 'inp', onchange: e => { x.status = e.target.value; Store.touch(); } }, SEL_STATUS.map(s => h('option', { selected: s === x.status }, s)))), h('div', { style: { height: '8px' } }),
          fld('Linked shot', h('select', { class: 'inp', onchange: e => { x.shotId = e.target.value; const s = ph.shots.find(z => z.id === x.shotId); if (s && ['Planned'].includes(s.status)) { s.status = 'Shot'; } Store.touch(); } }, shotOpts().map(o => { if (o.value === x.shotId) o.selected = true; return o; }))), h('div', { style: { height: '8px' } }),
          fld('Note', h('textarea', { class: 'inp', rows: 3, value: x.note || '', placeholder: 'Retouching or client note…', oninput: e => { x.note = e.target.value; Store.touch(); } })),
          h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Keys: ← → browse · 1–5 rating · 0 clear · P pick · X reject · U unflag · Esc close')));
    };
    const go = d => { i = (i + d + list.length) % list.length; render(); };
    box = h('div', { class: 'lightbox' }); const ov = h('div', { class: 'overlay lb-overlay' }, box); document.body.append(ov);
    const close = () => { document.removeEventListener('keydown', key, true); ov.remove(); draw(); };
    const key = e => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) { if (e.key === 'Escape') close(); return; }
      const x = list[i];
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
      else if (/^[0-5]$/.test(e.key)) { x.rating = +e.key; Store.touch(); render(); } else if (/^p$/i.test(e.key)) { x.flag = x.flag === 'pick' ? '' : 'pick'; Store.touch(); render(); } else if (/^x$/i.test(e.key)) { x.flag = x.flag === 'reject' ? '' : 'reject'; Store.touch(); render(); } else if (/^u$/i.test(e.key)) { x.flag = ''; Store.touch(); render(); } else return;
      e.preventDefault(); e.stopPropagation();
    };
    ov.addEventListener('click', e => { if (e.target === ov) close(); }); document.addEventListener('keydown', key, true); render();
  }
  const contactSheet = () => {
    const list = view(); if (!list.length) return toast('Nothing to print with these filters.', true);
    printNode(h('div', { class: 'print-doc' }, h('h1', {}, `${P.title} — Contact sheet`), h('div', { class: 'sub' }, `${list.length} images · ${new Date().toLocaleDateString()}`), h('div', { class: 'cs-print' }, list.map(x => h('div', { class: 'cs-item' }, h('img', { src: x.thumb }), h('div', {}, x.name), h('div', {}, '★'.repeat(x.rating) + '☆'.repeat(5 - x.rating) + (x.flag === 'pick' ? '  ⚑' : x.flag === 'reject' ? '  ✕' : ''), x.status !== 'To review' ? ' · ' + x.status : ''))))));
  };
  function draw() {
    const list = view(), a = all(), picks = a.filter(x => x.flag === 'pick').length, rej = a.filter(x => x.flag === 'reject').length, rated = a.filter(x => x.rating);
    stats.textContent = a.length ? `${a.length} images · ${picks} picked · ${rej} rejected · ${rated.length ? (sum(rated, x => x.rating) / rated.length).toFixed(1) : '–'} avg rating · ${SEL_STATUS.map(s => { const n = a.filter(x => x.status === s).length; return n ? n + ' ' + s.toLowerCase() : ''; }).filter(Boolean).join(' · ')}` : '';
    wrap.replaceChildren(pageShell('Selects & approvals', 'Import frames as thumbnails, rate and pick them, and track approvals. Full-size files stay on your drive — only small previews are stored here.',
      h('button', { class: 'btn', onclick: () => { const n = list.filter(x => x.flag === 'pick').map(x => x.name); if (!n.length) return toast('No picked images in this view.', true); copyText(n.join('\n')).then(ok => toast(ok ? `Copied ${n.length} picked filenames` : 'Could not copy', !ok)); } }, icon('copy', 15), 'Copy picks'),
      h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-selects.csv', toCSV([['File', 'Rating', 'Flag', 'Colour', 'Status', 'Shot', 'Note'], ...a.map(x => { const s = ph.shots.find(z => z.id === x.shotId); return [x.name, x.rating, x.flag, x.color, x.status, s ? photoShotLabel(P, s, scenes) : '', x.note || '']; })]), 'text/csv') }, icon('download', 15), 'CSV'),
      h('button', { class: 'btn', onclick: contactSheet }, icon('print', 15), 'Contact sheet'),
      h('button', { class: 'btn primary', onclick: importImages }, icon('upload', 15), 'Import images')), prog, stats,
      h('div', { class: 'row wrap', style: { marginBottom: '12px' } },
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { F.rating = +e.target.value; draw(); } }, [0, 1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: n === F.rating }, n ? `${n}★ and up` : 'Any rating'))),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { F.flag = e.target.value; draw(); } }, [['', 'Any flag'], ['pick', 'Picked'], ['reject', 'Rejected'], ['none', 'Unflagged']].map(([k, l]) => h('option', { value: k, selected: k === F.flag }, l))),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { F.status = e.target.value; draw(); } }, h('option', { value: '' }, 'Any status'), SEL_STATUS.map(s => h('option', { selected: s === F.status }, s))),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { F.color = e.target.value; draw(); } }, h('option', { value: '' }, 'Any colour'), Object.keys(SEL_COLORS).map(c => h('option', { selected: c === F.color }, c))),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { F.shot = e.target.value; draw(); } }, h('option', { value: '' }, 'Any shot'), ph.shots.filter(s => scenes.some(x => x.id === s.sceneId)).map(s => h('option', { value: s.id, selected: s.id === F.shot }, `${photoShotLabel(P, s, scenes)} ${s.title || ''}`.slice(0, 40)))),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { F.sort = e.target.value; draw(); } }, [['name', 'Sort: name'], ['rating', 'Sort: rating'], ['added', 'Sort: import order']].map(([k, l]) => h('option', { value: k, selected: k === F.sort }, l))),
        h('span', { class: 'grow' }), h('label', { class: 'row small' }, 'Size', h('input', { type: 'range', min: 110, max: 360, value: UI.selSize, oninput: e => { UI.selSize = +e.target.value; $$('.sel-cell', grid).forEach(c => { c.style.width = UI.selSize + 'px'; c.firstChild.style.height = Math.round(UI.selSize * .78) + 'px'; }); } }))),
      grid);
    grid.replaceChildren(...(list.length ? list.map(x => cell(x, list)) : [h('div', { class: 'empty', style: { width: '100%' } }, h('h3', {}, a.length ? 'No images match these filters' : 'No images yet'), h('p', {}, a.length ? 'Loosen the filters above.' : 'Import a folder of frames (JPG, PNG, WebP). Rate with the keyboard in the viewer: 1–5, P to pick, X to reject.'))]));
  }
  draw();
};

/* ---------------------------------------------------------------
   Gear & rentals (Photo & Podcast)
   --------------------------------------------------------------- */
const GEAR_CATS = ['Camera', 'Lenses', 'Lighting', 'Modifiers', 'Grip & support', 'Power & cable', 'Tethering & digital', 'Backdrops & surfaces', 'Media & storage', 'Other'];
const GEAR_STATUS = ['Needed', 'Reserved', 'Picked up', 'On set', 'Returned'];
const GEAR_BUDGET = { Camera: 'Camera & grip', Lenses: 'Camera & grip', 'Grip & support': 'Camera & grip', 'Tethering & digital': 'Camera & grip', 'Media & storage': 'Camera & grip', Lighting: 'Lighting', Modifiers: 'Lighting', 'Power & cable': 'Lighting', 'Backdrops & surfaces': 'Art & wardrobe', Other: 'Miscellaneous' };

const PODCAST_GEAR_CATS = [
  'Microphones',
  'Audio Interfaces & Mixers',
  'Recorders & Preamps',
  'Headphones & Monitoring',
  'Stands, Arms & Shockmounts',
  'Cables, Adapters & Power',
  'Acoustic Treatment & Shields',
  'Cameras & Video (Vodcast)',
  'Storage & Media',
  'Other / Field Kit'
];
const PODCAST_GEAR_STATUS = ['Needed', 'Reserved', 'Picked up', 'In Studio', 'Returned'];
const PODCAST_GEAR_BUDGET = {
  'Microphones': 'Sound Design & Foley',
  'Audio Interfaces & Mixers': 'Audio Engineering',
  'Recorders & Preamps': 'Audio Engineering',
  'Headphones & Monitoring': 'Sound Design & Foley',
  'Stands, Arms & Shockmounts': 'Studio Hire',
  'Cables, Adapters & Power': 'Audio Engineering',
  'Acoustic Treatment & Shields': 'Studio Hire',
  'Cameras & Video (Vodcast)': 'Post-Production',
  'Storage & Media': 'Post-Production',
  'Other / Field Kit': 'Audio Engineering'
};
const starterPodcastGear = () => [
  ['Microphones', 'Dynamic Broadcast Vocal Mic (e.g. Shure SM7B / PodMic)', 2],
  ['Microphones', 'Condenser Studio Mic (e.g. Rode NT1)', 1],
  ['Audio Interfaces & Mixers', 'Podcast Audio Production Studio / Mixer', 1],
  ['Recorders & Preamps', '32-bit Float Field Recorder (Backup)', 1],
  ['Headphones & Monitoring', 'Closed-back Studio Monitor Headphones', 2],
  ['Stands, Arms & Shockmounts', 'Adjustable Studio Boom Arm', 2],
  ['Stands, Arms & Shockmounts', 'Shock Mount & Dual Pop Filter', 2],
  ['Cables, Adapters & Power', 'Balanced Studio XLR Cables (10ft)', 4],
  ['Cables, Adapters & Power', 'Headphone Extension Cables', 2],
  ['Acoustic Treatment & Shields', 'Reflection Filter / Sound Shield', 2],
  ['Storage & Media', 'High-speed SD Card (128GB)', 2],
  ['Storage & Media', 'External Backup SSD (1TB)', 1],
].map(([cat, name, qty]) => ({ id: uid(), cat, name, qty, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'Needed', notes: '' }));

Views.gear = function (root) {
  const P = Store.P;
  const isPod = P.mode === 'podcast';
  const targetObj = isPod ? (P.podcast = P.podcast || {}) : (P.photo = P.photo || blankPhoto());
  targetObj.gear = targetObj.gear || [];
  const gearCats = isPod ? PODCAST_GEAR_CATS : GEAR_CATS;
  const gearStatus = isPod ? PODCAST_GEAR_STATUS : GEAR_STATUS;
  const gearBudget = isPod ? PODCAST_GEAR_BUDGET : GEAR_BUDGET;
  const starterFn = isPod ? starterPodcastGear : starterGear;

  const wrap = h('div', { class: 'page', style: { maxWidth: '1250px' } }); let q = '', st = '';
  root.append(wrap, h('datalist', { id: 'dl-gearsrc' }, ['Owned', ...new Set(targetObj.gear.map(g => g.source).filter(x => x && x !== 'Owned'))].map(x => h('option', { value: x }))));
  const days = g => +g.days || P.days.length || 1, cost = g => (+g.qty || 0) * (+g.rate || 0) * days(g);
  const csvRows = () => [['Category', 'Item', 'Qty', 'Source', 'Rate/day', 'Days', 'Total', 'Pick-up', 'Return', 'Status', 'Notes'], ...targetObj.gear.map(g => [g.cat, g.name, g.qty, g.source, g.rate, days(g), cost(g), g.pickup, g.ret, g.status, g.notes])];
  function toBudget() {
    let n = 0; targetObj.gear.filter(g => (+g.rate || 0) > 0).forEach(g => { const key = 'gear:' + g.id; let l = P.budget.find(x => x.auto === key); if (!l) { l = { id: uid(), auto: key }; P.budget.push(l); } Object.assign(l, { cat: gearBudget[g.cat] || 'Miscellaneous', desc: `${g.name}${g.source && g.source !== 'Owned' ? ' (' + g.source + ')' : ''}`, qty: (+g.qty || 1) * days(g), unit: 'Day', rate: +g.rate || 0 }); n++; });
    Store.touch(); toast(n ? `Budget updated with ${n} gear line${n > 1 ? 's' : ''}` : 'Add a day rate to gear items first.', !n);
  }
  function draw() {
    const rows = targetObj.gear.filter(g => (!st || g.status === st) && (!q || JSON.stringify(Object.values(g)).toLowerCase().includes(q))), total = sum(targetObj.gear, cost);
    const done = targetObj.gear.filter(g => ['Picked up', 'In Studio', 'On set', 'Returned'].includes(g.status)).length;
    const body = h('div');
    gearCats.forEach(c => {
      const ls = rows.filter(g => g.cat === c); if (!ls.length) return;
      body.append(h('h3', { style: { fontSize: '14px', margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' } }, `${c} · ${ls.length}`),
        h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl wide gear-t' }, h('thead', {}, h('tr', {}, ['Item', 'Qty', 'Source', 'Rate / day', 'Days', 'Total', 'Pick-up', 'Return', 'Status', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, ls.map(g => { const tot = h('td', { style: { whiteSpace: 'nowrap', fontWeight: 600 } }, money(cost(g)));
            const f = (k, o = {}) => h('input', { class: 'cell', type: o.type, list: o.list, min: o.type === 'number' ? 0 : undefined, value: g[k] || '', placeholder: o.ph || '', style: o.w ? { width: o.w } : {}, oninput: e => { g[k] = e.target.value; tot.textContent = money(cost(g)); Store.touch(); } });
            return h('tr', {}, h('td', {}, f('name', { ph: 'Item' })), h('td', {}, f('qty', { type: 'number', w: '58px' })), h('td', {}, f('source', { list: 'dl-gearsrc', ph: 'Owned / rental house' })), h('td', {}, f('rate', { type: 'number', w: '84px' })), h('td', {}, f('days', { type: 'number', w: '58px', ph: String(P.days.length || 1) })), tot,
              h('td', {}, f('pickup', { type: 'date' })), h('td', {}, f('ret', { type: 'date' })), h('td', {}, h('select', { class: 'cell', onchange: e => { g.status = e.target.value; Store.touch(); draw(); } }, gearStatus.map(s => h('option', { selected: s === g.status }, s)))), h('td', { style: { width: '70px' } }, ibtn('copy', 'Duplicate', () => { targetObj.gear.splice(targetObj.gear.indexOf(g) + 1, 0, { ...g, id: uid() }); Store.touch(); draw(); }), ibtn('trash', 'Delete', () => { targetObj.gear = targetObj.gear.filter(x => x !== g); Store.touch(); draw(); }, 'danger'))); })))));
    });
    const pageTitle = isPod ? 'Studio Gear & Mics' : 'Gear & rentals';
    const pageSub = isPod ? 'Microphones, audio interfaces, recorders, headphones, boom arms and field kits — with rental costs and pack list.' : 'Cameras, lenses, lighting, grip and everything that has to be on set — with rental costs and a pack list.';
    wrap.replaceChildren(pageShell(pageTitle, pageSub,
      h('button', { class: 'btn', onclick: e => menu(e.currentTarget, [{ label: 'Pack list (print)', icon: 'print', onClick: () => printTable(isPod ? 'Audio Pack List' : 'Pack list', ['☐', 'Category', 'Item', 'Qty', 'Source', 'Status'], gearCats.flatMap(c => { const ls = targetObj.gear.filter(g => g.cat === c); return ls.length ? [{ grp: c }, ...ls.map(g => ['☐', g.cat, g.name, g.qty, g.source, g.status])] : []; }), { landscape: false }) }, { label: 'Rental order by source (print)', icon: 'print', onClick: () => { const by = new Map(); targetObj.gear.filter(g => g.source && g.source !== 'Owned').forEach(g => { if (!by.has(g.source)) by.set(g.source, []); by.get(g.source).push(g); }); if (!by.size) return toast('No rental items — set Source to the rental house name.', true); printTable('Rental orders', ['Item', 'Qty', 'Days', 'Pick-up', 'Return', 'Total'], [...by].flatMap(([s, ls]) => [{ grp: `${s} — ${money(sum(ls, cost))}` }, ...ls.map(g => [g.name, g.qty, days(g), g.pickup, g.ret, money(cost(g))])]), { landscape: false }); } }, { label: 'CSV', icon: 'download', onClick: () => download(slug(P.title) + '-gear.csv', toCSV(csvRows()), 'text/csv') }]) }, icon('print', 15), 'Reports'),
      h('button', { class: 'btn', title: 'Create budget lines from items with a day rate', onclick: toBudget }, icon('dollar', 15), 'Send to budget'),
      h('button', { class: 'btn primary', onclick: e => menu(e.currentTarget, gearCats.map(c => ({ label: c, onClick: () => { targetObj.gear.push({ id: uid(), cat: c, name: '', qty: 1, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'Needed', notes: '' }); Store.touch(); draw(); } }))) }, icon('plus', 15), 'Add item')),
      h('div', { class: 'sum', style: { marginBottom: '14px' } }, h('div', {}, h('span', {}, 'Items'), h('b', {}, String(targetObj.gear.length))), h('div', {}, h('span', {}, 'Ready'), h('b', {}, `${done}/${targetObj.gear.length}`)), h('div', {}, h('span', {}, 'Rental & gear cost'), h('b', { style: { color: 'var(--accent)' } }, money(total)))),
      h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, h('input', { class: 'inp', 'data-k': 'gsearch', value: q, placeholder: isPod ? 'Search mics & gear…' : 'Search gear…', style: { width: '220px' }, oninput: e => { q = e.target.value.toLowerCase(); clearTimeout(draw.t); draw.t = setTimeout(() => { const keep = e.target; draw(); }, 250); } }), h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { st = e.target.value; draw(); } }, h('option', { value: '' }, 'Any status'), gearStatus.map(s => h('option', { selected: s === st }, s))),
        targetObj.gear.length ? null : h('button', { class: 'btn', onclick: () => { starterFn().forEach(g => targetObj.gear.push(g)); Store.touch(); draw(); } }, icon('wand', 15), isPod ? 'Add audio studio kit' : 'Add a starter kit')),
      rows.length ? body : h('div', { class: 'empty' }, h('h3', {}, targetObj.gear.length ? 'Nothing matches' : 'No gear yet'), h('p', {}, isPod ? 'Add microphones and studio kit, or start from a broadcast package.' : 'Add items one at a time, or start from a typical studio kit.')));
    if (q) { const i = wrap.querySelector('[data-k=gsearch]'); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } }
  }
  draw();
};
const starterGear = () => [['Camera', 'Camera body (primary)', 1], ['Camera', 'Camera body (backup)', 1], ['Lenses', '24–70mm f/2.8', 1], ['Lenses', '85mm f/1.4', 1], ['Lenses', '70–200mm f/2.8', 1], ['Lighting', 'Strobe head 600Ws', 4], ['Lighting', 'Continuous LED panel', 2], ['Modifiers', 'Large octabox 150cm', 2], ['Modifiers', 'Strip softbox', 2], ['Modifiers', 'Reflector 5-in-1', 2],
  ['Grip & support', 'C-stand', 6], ['Grip & support', 'Light stand', 6], ['Grip & support', 'V-flat (white/black)', 4], ['Grip & support', 'Sandbags', 12], ['Power & cable', 'Pack / battery + extension reels', 1], ['Tethering & digital', 'Laptop + tether cable', 1], ['Tethering & digital', 'Card reader + backup drive', 2], ['Media & storage', 'Memory cards', 6], ['Backdrops & surfaces', 'Seamless paper 2.7m', 3]]
  .map(([cat, name, qty]) => ({ id: uid(), cat, name, qty, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'Needed', notes: '' }));

/* ---------------------------------------------------------------
   Releases & permits
   --------------------------------------------------------------- */
const REL_KINDS = ['Model release', 'Minor consent', 'Property release', 'Location permit', 'Usage agreement', 'Insurance certificate', 'Trademark clearance', 'Music / audio licence', 'Other'];
const REL_STATUS = ['Needed', 'Sent', 'Signed', 'N/A'];
const ageOf = dob => { if (!dob) return null; const d = new Date(dob); if (isNaN(d)) return null; return (Date.now() - d) / 31557600000; };
Views.compliance = function (root) {
  const P = Store.P, ph = P.photo, wrap = h('div', { class: 'page', style: { maxWidth: '1200px' } }); let f = '';
  root.append(wrap, h('datalist', { id: 'dl-relwho' }, [...P.people.map(p => p.name).filter(Boolean), ...P.locations.map(l => l.name).filter(Boolean)].map(x => h('option', { value: x }))));
  const today = new Date().toISOString().slice(0, 10), expired = r => r.expires && r.expires < today && r.status === 'Signed';
  function generate() {
    let n = 0; const has = (kind, who) => ph.releases.some(r => r.kind === kind && (r.who || '').toLowerCase() === who.toLowerCase());
    const add = (kind, who, extra = {}) => { if (!who || has(kind, who)) return; ph.releases.push(Object.assign({ id: uid(), kind, who, status: 'Needed', date: '', expires: '', notes: '' }, extra)); n++; };
    P.people.filter(p => p.type === 'cast' && p.name).forEach(p => { add('Model release', p.name, { personId: p.id }); const a = ageOf(p.dob); if (a !== null && a < 18) add('Minor consent', p.name, { personId: p.id, notes: 'Parent / guardian signature, chaperone and working-hours limits.' }); if ((p.docs || {}).release) { const r = ph.releases.find(x => x.kind === 'Model release' && x.who === p.name); if (r && r.status === 'Needed') r.status = 'Signed'; } });
    P.locations.filter(l => l.name).forEach(l => { add('Property release', l.name, { locationId: l.id }); if (l.permit === 'Needed' || l.permit === 'Applied' || l.permit === 'Approved') add('Location permit', l.name, { locationId: l.id, status: l.permit === 'Approved' ? 'Signed' : l.permit === 'Applied' ? 'Sent' : 'Needed' }); });
    add('Insurance certificate', 'Production liability'); add('Usage agreement', 'Client usage terms'); Store.touch(); toast(n ? `Added ${n} checklist item${n > 1 ? 's' : ''}` : 'Checklist is already up to date', !n); draw();
  }
  function draw() {
    const rows = ph.releases.filter(r => !f || (f === 'open' ? ['Needed', 'Sent'].includes(r.status) : f === 'expired' ? expired(r) : r.kind === f)), open = ph.releases.filter(r => ['Needed', 'Sent'].includes(r.status)).length, done = ph.releases.filter(r => r.status === 'Signed' || r.status === 'N/A').length, exp = ph.releases.filter(expired).length;
    wrap.replaceChildren(pageShell('Releases & permits', 'Model and minor consent, property releases, permits, insurance and usage paperwork — nothing shoots until it is signed.',
      h('button', { class: 'btn', onclick: () => printTable('Releases & permits', ['Type', 'Who / what', 'Status', 'Date', 'Expires', 'Notes'], ph.releases.map(r => [r.kind, r.who, r.status, r.date, r.expires, r.notes])) }, icon('print', 15), 'Print'),
      h('button', { class: 'btn', onclick: generate, title: 'Create a checklist from your cast, minors (by date of birth) and locations' }, icon('wand', 15), 'Generate from cast & locations'),
      h('button', { class: 'btn primary', onclick: () => { ph.releases.push({ id: uid(), kind: 'Model release', who: '', status: 'Needed', date: '', expires: '', notes: '' }); Store.touch(); draw(); } }, icon('plus', 15), 'Add')),
      h('div', { class: 'sum', style: { marginBottom: '14px' } }, h('div', {}, h('span', {}, 'Complete'), h('b', {}, `${done}/${ph.releases.length}`)), h('div', {}, h('span', {}, 'Outstanding'), h('b', { style: { color: open ? 'var(--danger)' : 'var(--ok)' } }, String(open))), h('div', {}, h('span', {}, 'Expired'), h('b', { style: { color: exp ? 'var(--danger)' : 'inherit' } }, String(exp)))),
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { f = e.target.value; draw(); } }, [['', 'Everything'], ['open', 'Outstanding only'], ['expired', 'Expired'], ...REL_KINDS.map(k => [k, k])].map(([k, l]) => h('option', { value: k, selected: k === f }, l)))),
      rows.length ? h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl wide rel-t' }, h('thead', {}, h('tr', {}, ['Type', 'Who / what', 'Status', 'Date', 'Expires', 'Notes', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, rows.map(r => h('tr', { class: r.status === 'Signed' || r.status === 'N/A' ? 'done' : '' },
          h('td', {}, h('select', { class: 'cell', onchange: e => { r.kind = e.target.value; Store.touch(); } }, REL_KINDS.map(k => h('option', { selected: k === r.kind }, k)))), h('td', {}, h('input', { class: 'cell', list: 'dl-relwho', value: r.who || '', oninput: e => { r.who = e.target.value; Store.touch(); } })),
          h('td', {}, h('select', { class: 'cell', style: { fontWeight: 700, color: r.status === 'Signed' ? 'var(--ok)' : r.status === 'Needed' ? 'var(--danger)' : 'inherit' }, onchange: e => { r.status = e.target.value; if (r.status === 'Signed' && !r.date) r.date = today; Store.touch(); draw(); } }, REL_STATUS.map(s => h('option', { selected: s === r.status }, s)))),
          h('td', {}, h('input', { class: 'cell', type: 'date', value: r.date || '', oninput: e => { r.date = e.target.value; Store.touch(); } })), h('td', {}, h('input', { class: 'cell', type: 'date', value: r.expires || '', style: expired(r) ? { color: 'var(--danger)', fontWeight: 700 } : {}, oninput: e => { r.expires = e.target.value; Store.touch(); } })),
          h('td', {}, h('input', { class: 'cell', value: r.notes || '', oninput: e => { r.notes = e.target.value; Store.touch(); } })), h('td', { style: { width: '44px' } }, ibtn('trash', 'Delete', () => { ph.releases = ph.releases.filter(x => x !== r); Store.touch(); draw(); }, 'danger'))))))) : h('div', { class: 'empty' }, h('h3', {}, 'Nothing here yet'), h('p', {}, 'Use “Generate from cast & locations” to build the checklist automatically — it adds minor consent for anyone under 18 (from their date of birth).')));
  }
  draw();
};

/* ---------------------------------------------------------------
   Run of show — a timed plan for each shoot day
   --------------------------------------------------------------- */
const ROS_KINDS = ['Setup', 'Hair & makeup', 'Wardrobe', 'Break', 'Lunch', 'Move', 'Review', 'Wrap', 'Other'];
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const fromMin = n => { n = ((Math.round(n) % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
Views.runofshow = function (root) {
  const P = Store.P, ph = P.photo, wrap = h('div', { class: 'page', style: { maxWidth: '1100px' } }); root.append(wrap);
  if (!P.days.length) { wrap.append(h('div', { class: 'empty' }, h('h3', {}, 'No shoot days yet'), h('p', {}, 'The run of show is the hour-by-hour plan for a shoot day. Create a day and schedule your setups first.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/schedule` }, 'Go to Schedule'))); return; }
  if (!P.days.find(d => d.id === UI.rosDay)) UI.rosDay = P.days[0].id;
  const day = () => P.days.find(d => d.id === UI.rosDay), runOf = d => ph.runs[d.id] = ph.runs[d.id] || [];
  function build(d) {
    const scenes = getScenes(P), list = d.sceneIds.map(id => scenes.find(s => s.id === id)).filter(Boolean), rows = []; let t = toMin(d.cs && (d.cs.shoot || d.cs.crew)) ?? 480, prevLoc = null, sinceBreak = 0, lunched = false;
    const push = (kind, title, dur, extra = {}) => { rows.push(Object.assign({ id: uid(), start: fromMin(t), dur, kind, title, sceneId: '', notes: '' }, extra)); t += dur; sinceBreak += kind === 'Setup' ? dur : 0; };
    if (list.length) push('Hair & makeup', 'Talent in hair & makeup', 45, { notes: 'First talent ready for set at ' + fromMin(t + 45) });
    list.forEach(s => {
      const loc = locName(P, s); if (prevLoc !== null && loc && prevLoc && loc !== prevLoc) push('Move', `Move to ${loc}`, 30); prevLoc = loc || prevLoc;
      if (!lunched && sinceBreak >= Math.max(120, ((+P.settings.mealHours || 6) - 1.5) * 60)) { push('Lunch', 'Lunch', 60); lunched = true; sinceBreak = 0; } else if (sinceBreak >= 150) { push('Break', 'Break', 15); sinceBreak = 0; }
      const est = +(P.sceneMeta[s.id] || {}).est || 60, shots = ph.shots.filter(x => x.sceneId === s.id).length;
      push('Setup', `${s.num}. ${setupParts(P.blocks[s.idx]).name || s.label}`, est, { sceneId: s.id, notes: shots ? `${shots} shot${shots > 1 ? 's' : ''}` : '' });
    });
    if (list.length) push('Wrap', 'Wrap & gear check', 30);
    return rows;
  }
  const reflow = (rows, from = 0) => { let t = toMin(rows[from] && rows[from].start); if (t === null) return; for (let i = from; i < rows.length; i++) { rows[i].start = fromMin(t); t += +rows[i].dur || 0; } };
  function draw() {
    const d = day(), rows = runOf(d), scenes = getScenes(P), end = rows.length ? (toMin(rows[rows.length - 1].start) + (+rows[rows.length - 1].dur || 0)) : null;
    wrap.replaceChildren(pageShell('Run of show', 'Minute-by-minute plan for the day: hair & makeup, each setup, moves, lunch and wrap.',
      h('button', { class: 'btn', onclick: () => { if (!rows.length) return toast('Nothing to print.', true); printTable(`Run of show — Day ${P.days.indexOf(d) + 1}${d.date ? ' · ' + fmtDateShort(d.date) : ''}`, ['Time', 'Min', 'Activity', 'Type', 'Talent', 'Notes'], rows.map(r => { const s = scenes.find(x => x.id === r.sceneId); return [fmtTime(r.start), r.dur, r.title, r.kind, s ? [...sceneCast(P, s)].join(', ') : '', r.notes]; }), { landscape: false }); } }, icon('print', 15), 'Print'),
      h('button', { class: 'btn', onclick: async () => { if (rows.length && !(await confirmBox('Replace this day’s run of show with one built from the schedule?', 'Rebuild'))) return; ph.runs[d.id] = build(d); Store.touch(); draw(); } }, icon('wand', 15), 'Build from schedule'),
      h('button', { class: 'btn primary', onclick: () => { const last = rows[rows.length - 1]; rows.push({ id: uid(), start: last ? fromMin(toMin(last.start) + (+last.dur || 0)) : '08:00', dur: 30, kind: 'Other', title: '', sceneId: '', notes: '' }); Store.touch(); draw(); } }, icon('plus', 15), 'Add row')),
      h('div', { class: 'row', style: { marginBottom: '12px' } }, h('select', { class: 'inp', style: { width: 'auto', fontWeight: 600 }, onchange: e => { UI.rosDay = e.target.value; draw(); } }, P.days.map((x, i) => h('option', { value: x.id, selected: x.id === d.id }, `Day ${i + 1}${x.date ? ' · ' + fmtDateShort(x.date) : ''} (${x.sceneIds.length} setup${x.sceneIds.length === 1 ? '' : 's'})`))),
        d.cs ? h('span', { class: 'small muted' }, `Crew call ${fmtTime(d.cs.crew)} · shooting call ${fmtTime(d.cs.shoot)} · wrap ${fmtTime(d.cs.wrap)}`) : null, h('span', { class: 'grow' }), end !== null ? h('span', { class: 'pill' + (d.cs && toMin(d.cs.wrap) && end > toMin(d.cs.wrap) ? ' danger' : '') }, `Finishes ${fmtTime(fromMin(end))}${d.cs && toMin(d.cs.wrap) && end > toMin(d.cs.wrap) ? ' — after planned wrap' : ''}`) : null),
      rows.length ? h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl wide ros-t' }, h('thead', {}, h('tr', {}, ['Start', 'Min', 'Activity', 'Type', 'Setup', 'Notes', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, rows.map((r, i) => h('tr', { class: r.kind === 'Lunch' || r.kind === 'Break' ? 'ros-break' : '' },
          h('td', { style: { width: '110px' } }, h('input', { class: 'cell', type: 'time', value: r.start, onchange: e => { r.start = e.target.value; reflow(rows, i); Store.touch(); draw(); } })), h('td', { style: { width: '70px' } }, h('input', { class: 'cell', type: 'number', min: 0, step: 5, value: r.dur, onchange: e => { r.dur = +e.target.value || 0; reflow(rows, i); Store.touch(); draw(); } })),
          h('td', {}, h('input', { class: 'cell', value: r.title, placeholder: 'Activity', oninput: e => { r.title = e.target.value; Store.touch(); } })),
          h('td', { style: { width: '140px' } }, h('select', { class: 'cell', onchange: e => { r.kind = e.target.value; Store.touch(); draw(); } }, ROS_KINDS.map(k => h('option', { selected: k === r.kind }, k)))),
          h('td', { style: { width: '170px' } }, h('select', { class: 'cell', onchange: e => { r.sceneId = e.target.value; Store.touch(); } }, h('option', { value: '' }, '—'), scenes.map(s => h('option', { value: s.id, selected: s.id === r.sceneId }, `${s.num}. ${s.label}`.slice(0, 30))))),
          h('td', {}, h('input', { class: 'cell', value: r.notes || '', oninput: e => { r.notes = e.target.value; Store.touch(); } })),
          h('td', { style: { width: '84px' } }, ibtn('up', 'Move up', () => { if (i) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; const t0 = rows[i - 1].start; rows[i - 1].start = t0; reflow(rows, Math.max(0, i - 1)); Store.touch(); draw(); } }), ibtn('trash', 'Delete', () => { rows.splice(i, 1); Store.touch(); draw(); }, 'danger'))))))) : h('div', { class: 'empty' }, h('h3', {}, 'No run of show for this day'), h('p', {}, 'Build one automatically from the day’s scheduled setups (uses each setup’s estimated time), then adjust.'), h('button', { class: 'btn primary', onclick: () => { ph.runs[d.id] = build(d); Store.touch(); draw(); } }, 'Build from schedule')));
  }
  draw();
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
