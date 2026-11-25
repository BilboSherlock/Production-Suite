'use strict';
/* ===================================================================
   Script breakdown — VIEW. Tag mentions in a scene; each links to a
   shared element (with profile, status, quantity, and who wears it).
   Rules: js/models/breakdown.model.js; screen state and commands:
   js/viewmodels/breakdown.vm.js.
   =================================================================== */
/* one row per element across the whole script (also used by Reports) */
const elementRows = (P, scenes) => BreakdownModel.elementRows(P, scenes, CATS);

Views.breakdown = function (root) {
  const vm = new BreakdownVM(), P = Store.P;
  if (!vm.scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes yet'), h('p', {}, 'Write some scenes in the Script view first — the breakdown is built from your scene headings.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/script` }, 'Go to Script')))); return; }
  root.parentElement.classList.add('noscroll');
  const top = h('div', { class: 'toolbar' }), left = h('div', { class: 'bd-scenes' }), center = h('div', { class: 'bd-center' }), right = h('div', { class: 'bd-right' });
  root.append(h('div', { class: 'script-wrap' }, top, h('div', { class: 'bd' }, left, center, right)));
  let palette = null;
  const closePalette = () => { palette && palette.remove(); palette = null; };
  const openItem = x => { vm.openItem(x); goto('props'); };

  /* tag, and tell the user when something got linked or merged automatically */
  function tagged(r, text) {
    if (!r) return;
    if (r.item && !r.created && singularKey(r.item.name) !== singularKey(text)) toast(`“${text}” is the same as your existing “${r.item.name}” — linked`);
    else if (r.created && r.candidates) toast(`Created “${text}”. Several similar elements exist — use ⋮ → Merge if they are the same.`);
  }
  /* script text with tagged mentions marked */
  const marked = text => vm.highlight(text).map(r => {
    if (!r.tag) return esc(r.text);
    const c = CATMAP[r.tag.cat], x = r.tag.itemId && itemById(P, r.tag.itemId);
    return `<mark class="tag" style="--c:${c.color}" title="${esc(c.label + (x ? ' · ' + x.name : ''))}">${esc(r.text)}</mark>`;
  }).join('');

  /* ---------- toolbar ---------- */
  const drawTop = () => morph(top, [
    h('div', { class: 'seg' }, h('button', { class: vm.mode === 'scene' ? 'on' : '', onclick: () => vm.setMode('scene') }, 'Scene breakdown'),
      h('button', { class: vm.mode === 'report' ? 'on' : '', onclick: () => vm.setMode('report') }, 'Element list')),
    h('span', { class: 'grow' }), h('span', { class: 'small muted' }, 'Select words in the script to tag them · each tag links to one shared element'),
    h('a', { class: 'btn sm', href: `#/p/${P.id}/props` }, icon('box', 14), 'Element manager')]);

  /* ---------- left: scenes ---------- */
  const drawLeft = () => morph(left, h('ul', { class: 'navlist' }, vm.sceneList.map(({ s, on, count }) =>
    h('li', { 'data-key': s.id, class: on ? 'on' : '', onclick: () => vm.selectScene(s.id) },
      h('span', { class: 'num' }, s.num),
      h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'nh' }, s.label), h('div', { class: 'ns' }, `${s.ioe || '—'} · ${s.tod || '—'}`)),
      h('span', { class: 'np' }, count ? count + ' el.' : '')))));

  /* ---------- centre: scene strip + script ---------- */
  function sceneCard() {
    const s = vm.scene, meta = vm.meta, L = vm.links;
    const area = (k, ph) => h('textarea', { class: 'inp auto', rows: 2, placeholder: ph, value: meta[k] || '', oninput: e => { vm.setMeta(k, e.target.value, { quiet: true }); autosize(e.target); } });
    const locSel = h('select', { class: 'inp', onchange: e => {
      if (e.target.value === '__new') { const l = vm.newLocation(); if (l) toast(`Created location “${l.name}”`); } else vm.linkLocation(e.target.value); } },
      h('option', { value: '' }, '— not linked —'), vm.locations.map(l => h('option', { value: l.id, selected: l.id === meta.locationId }, l.name || '(unnamed)')), h('option', { value: '__new' }, '+ New location from this heading'));
    const addCast = h('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px' }, onchange: async e => {
      let v = e.target.value; e.target.value = ''; if (!v) return;
      if (v === '__new') { v = await promptBox('New character', 'Character name'); if (!v) return; }
      vm.addCast(v); } }, h('option', { value: '' }, '+ Add cast (non-speaking)'), vm.castToAdd.map(c => h('option', { value: c }, c)), h('option', { value: '__new' }, 'New character…'));
    const day = L.days.length ? L.days[0] : 0;
    return h('div', { class: 'strip-card', 'data-key': 'card' },
      h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, s.ioe ? h('span', { class: 'pill accent', 'data-key': 'ioe' }, s.ioe) : null, s.tod ? h('span', { class: 'pill accent', 'data-key': 'tod' }, s.tod) : null, h('span', { class: 'pill', 'data-key': 'pgs' }, fmtEighths(s.eighths) + ' pgs'),
        day ? h('a', { class: 'pill', 'data-key': 'day', href: `#/p/${P.id}/schedule`, title: L.days.length > 1 ? 'Split over several days — open the schedule' : 'Open the schedule' }, L.days.length > 1 ? `Shoot days ${L.days.join(', ')}` : `Shoot day ${day}`) : h('span', { class: 'pill', 'data-key': 'day0', style: { opacity: .6 } }, 'Not scheduled'),
        h('a', { class: 'pill', 'data-key': 'shots', href: `#/p/${P.id}/shots`, onclick: () => { UI.shotScene = s.id; } }, `${L.shots} shot${L.shots === 1 ? '' : 's'}`), h('a', { class: 'pill', 'data-key': 'frames', href: `#/p/${P.id}/board` }, `${L.frames} frame${L.frames === 1 ? '' : 's'}`)),
      h('h2', {}, `${s.num}. ${s.label}`),
      h('div', { class: 'strip-grid' },
        h('div', {}, h('label', { class: 'lbl' }, 'Location'), locSel),
        h('div', {}, h('label', { class: 'lbl' }, 'Cast in this scene'), h('div', { class: 'whorow' },
          vm.castChips.map(({ name, person: p, tag }) => h('span', { class: 'castchip', 'data-key': name, title: p ? `${p.name || 'Actor'} — open profile` : 'No actor assigned yet' },
            h('span', { style: { cursor: 'pointer' }, onclick: () => { if (p) { vm.openPerson(p); goto('people'); } else toast('Add this character in Cast & Crew to give them a profile.'); } }, name, p && p.name ? h('i', {}, ' · ' + p.name) : null),
            tag ? h('button', { title: 'Remove from this scene', onclick: () => vm.untag(tag) }, icon('x', 11)) : null)),
          h('span', { 'data-key': 'add', style: { display: 'contents' } }, addCast)))),
      h('div', { class: 'row', style: { gap: '14px', alignItems: 'flex-start', marginTop: '12px', flexWrap: 'wrap' } },
        h('div', { class: 'grow', style: { minWidth: '220px' } }, h('label', { class: 'lbl' }, 'Synopsis'), area('synopsis', 'Scene synopsis — shows in the corkboard, stripboard and call sheets')),
        h('div', { class: 'grow', style: { minWidth: '220px' } }, h('label', { class: 'lbl' }, 'Notes'), area('notes', 'Production notes for this scene')),
        h('div', { style: { width: '150px' } }, h('label', { class: 'lbl' }, 'Story day'), h('input', { class: 'inp', placeholder: 'e.g. Day 3', value: meta.storyDay || '', oninput: e => vm.setMeta('storyDay', e.target.value, { quiet: true }) })),
        h('div', { style: { width: '150px' } }, h('label', { class: 'lbl' }, 'Shoot time (min)'), h('input', { class: 'inp', type: 'number', min: 5, placeholder: '~' + vm.estGuess, title: 'Your estimate for shooting this scene; leave blank to estimate from page length', value: meta.est || '', oninput: e => vm.setMeta('est', e.target.value, { quiet: true }) })),
        h('div', { class: 'grow', style: { minWidth: '220px' } }, h('label', { class: 'lbl' }, 'Continuity notes'), area('continuity', 'Injuries, weather, time of day, state of the set…'))));
  }
  /* selecting words in the script opens the tag palette */
  function onSelect(e) {
    const mini = e.currentTarget;
    setTimeout(() => {
      closePalette();
      const sl = getSelection(), txt = sl.toString().trim().replace(/\s+/g, ' ');
      if (!txt || txt.length > 80 || !mini.contains(sl.anchorNode)) return;
      const r = sl.getRangeAt(0).getBoundingClientRect(), sugg = vm.suggestions(txt);
      const go = (cat, item) => {
        const all = $('.allbox', palette); sl.removeAllRanges(); closePalette();
        if (all && all.checked) { const res = vm.tagAll(cat, txt, item); toast(`Tagged ${res.n} scene${res.n === 1 ? '' : 's'} that mention “${txt}”`); }
        else tagged(vm.tag(cat, txt, item), txt);
      };
      palette = h('div', { class: 'palette wide' },
        sugg.length ? h('div', { class: 'psug' }, h('div', { class: 'small muted' }, 'Same as an existing element?'), h('div', { class: 'whorow' }, sugg.map(({ x, cat }) => h('button', { class: 'whochip', onmousedown: ev => ev.preventDefault(), onclick: () => go(cat, x) }, icon(cat === 'wardrobe' ? 'shirt' : 'box', 12), ' ' + x.name)))) : null,
        h('div', { class: 'pgrid' }, CATS.map(c => h('button', { style: { '--c': c.color }, onmousedown: ev => ev.preventDefault(), onclick: () => go(c.k) }, h('i', { class: 'dot' }), c.label))),
        h('label', { class: 'row small', style: { padding: '6px 4px 0' } }, h('input', { type: 'checkbox', class: 'allbox' }), 'Tag all mentions in the script'));
      document.body.append(palette);
      palette.style.left = clamp(r.left + r.width / 2 - 160, 8, innerWidth - 340) + 'px';
      const ph = palette.offsetHeight;
      palette.style.top = (r.bottom + 8 + ph <= innerHeight - 8 ? r.bottom + 8 : r.top - ph - 8 >= 8 ? r.top - ph - 8 : Math.max(8, innerHeight - ph - 8)) + 'px';
    }, 10);
  }
  function drawScene() {
    const mini = miniScene(P, vm.scene, marked); mini.dataset.key = 'mini:' + vm.scene.id; mini._on = { mouseup: onSelect }; mini.addEventListener('mouseup', hDispatch);
    morph(center, [sceneCard(), mini]);
    autosizeAll(center);
  }

  /* ---------- right: elements ---------- */
  function mergePicker(x) {
    const others = vm.mergeTargets(x);
    if (!others.length) return toast('There is nothing else to merge with yet.', true);
    const selEl = h('select', { class: 'inp', size: Math.min(8, others.length + 1) }, others.map(o => { const aka = ItemsModel.aka(o); return h('option', { value: o.id }, o.name + (aka.length ? '  (also: ' + aka.join(', ') + ')' : '')); }));
    modal({ title: `Merge “${x.name}” into…`, body: h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Everything — scenes, photos, who wears it, notes and the words used in the script — moves into the element you pick. This cannot be split again.'), selEl),
      buttons: [{ label: 'Cancel' }, { label: 'Merge', primary: true, onClick: () => { if (!selEl.value) return false; const keep = vm.merge(x, selEl.value); if (keep) toast(`Merged into “${keep.name}”`); } }] });
  }
  function elementMenu(btn, g, c) {
    const x = g.item;
    menu(btn, x ? [
      { label: 'Open profile', icon: 'user', onClick: () => openItem(x) },
      { label: 'Rename…', icon: 'edit', onClick: async () => { const v = await promptBox('Rename element', 'Name', x.name); if (v) vm.rename(x, v); } },
      { label: 'Merge into another element…', icon: 'copy', onClick: () => mergePicker(x) },
      { label: 'Tag all mentions in script', icon: 'search', onClick: () => { const n = vm.tagAllAliases(x, c.k); toast(`Linked ${n} mention${n === 1 ? '' : 's'} across the script`); } },
      { sep: true },
      { label: 'Remove from this scene', icon: 'x', onClick: () => vm.removeFromScene(x) },
      { label: 'Delete element everywhere…', icon: 'trash', onClick: async () => { if (await confirmBox(`Delete “${x.name}”, its profile and all its mentions in the script breakdown?`)) vm.removeElement(x); } },
    ] : [{ label: 'Remove', icon: 'x', onClick: () => vm.untagAll(g.tags) }]);
  }
  function elementRow(g, c, kind) {
    const x = g.item, pic = x && x.photos && x.photos[0];
    return h('div', { class: 'el-row', 'data-key': g.key },
      x ? h('div', { class: 'el-th', style: pic ? { backgroundImage: `url(${pic})` } : {} }, pic ? '' : icon(kind === 'wardrobe' ? 'shirt' : 'box', 14)) : h('i', { class: 'dot', style: { '--c': c.color, marginTop: '4px' } }),
      h('div', { class: 'el-main' },
        h('div', { class: 'el-name' }, x ? h('a', { href: '#', title: 'Open profile', onclick: e => { e.preventDefault(); openItem(x); } }, g.name) : g.name,
          x ? h('span', { class: statusClass(x.status) }, x.status) : null),
        g.variants.length ? h('div', { class: 'el-vars' }, 'as written: ', g.variants.map(t => h('span', { class: 'chip', 'data-key': t.id, style: { '--c': c.color } }, t.text, h('button', { title: 'Remove this mention', onclick: () => vm.untag(t) }, icon('x', 11))))) : null),
      x ? h('input', { class: 'el-qty', type: 'number', min: 1, title: 'Quantity needed in this scene', value: vm.qtyIn(x), onchange: e => vm.setQty(x, e.target.value) }) : null,
      h('button', { class: 'icon-btn', style: { width: '26px', height: '26px' }, 'aria-label': 'More', onclick: e => elementMenu(e.currentTarget, g, c) }, icon('more', 15)));
  }
  function wearGrid(grid) {
    const items = grid.rows.map(r => r.item);
    return h('div', { class: 'wmx', 'data-key': 'grid' }, h('div', { class: 'small', style: { fontWeight: 650, margin: '8px 0 4px' } }, 'Who wears it in this scene'),
      grid.cast.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), grid.cast.map(n => h('th', { title: `Click to give everything here to ${n}`, style: { cursor: 'pointer' }, onclick: () => vm.giveAll(items, n) }, n.split(' ')[0])))),
        h('tbody', {}, grid.rows.map(({ item: x, on, unassigned }) => h('tr', { 'data-key': x.id, class: unassigned ? 'unassigned' : '' },
          h('td', { title: unassigned ? 'Not assigned to anyone yet' : '' }, x.name, unassigned ? h('span', { class: 'warnpill', style: { marginLeft: '6px', padding: '0 6px' } }, '!') : null),
          grid.cast.map(n => h('td', {}, h('input', { type: 'checkbox', checked: on.includes(n), 'aria-label': `${n} wears ${x.name}`, onchange: e => vm.setWearer(x, n, e.target.checked) })))))))
        : h('div', { class: 'small muted' }, 'Add cast to this scene (above) to assign who wears what.'));
  }
  function drawRight() {
    morph(right, [h('div', { class: 'row', 'data-key': 'head', style: { marginBottom: '10px' } }, h('h3', { class: 'grow', style: { fontSize: '15px' } }, 'Scene elements'),
      h('button', { class: 'btn sm', title: 'Add every speaking character as a Cast tag', onclick: () => { vm.autoCast(); toast('Cast detected from dialogue'); } }, icon('wand', 14), 'Auto-detect cast')),
    ...vm.panels.map(({ cat: c, kind, groups, open, addable, grid }) => {
      const dlId = 'dl-el-' + c.k;
      const inp = h('input', { class: 'inp', 'data-key': 'add', list: kind ? dlId : null, placeholder: kind ? `Add ${c.label.toLowerCase()} — pick an existing one or type…` : `Add ${c.label.toLowerCase()}…`,
        onkeydown: e => { const v = e.target.value.trim(); if (e.key !== 'Enter' || !v) return; e.target.value = ''; const ex = kind && (P[kind] || []).find(x => x.name === v); tagged(vm.tag(c.k, v, ex || null), v); } });
      return h('details', { class: 'cat', 'data-key': c.k, 'data-cat': c.k, open, style: { '--c': c.color }, ontoggle: e => vm.setOpen(c.k, e.target.open) },
        h('summary', {}, h('i', { class: 'dot' }), h('span', { class: 'grow' }, c.label), h('span', { class: 'pill' }, groups.length)),
        h('div', { class: 'cb' }, groups.map(g => elementRow(g, c, kind)), grid ? wearGrid(grid) : null, inp, kind ? h('datalist', { id: dlId, 'data-key': 'dl' }, addable.map(x => h('option', { value: x.name }))) : null));
    })]);
  }

  /* ---------- element list (all scenes) ---------- */
  function drawReport() {
    const rows = vm.rows, cells = vm.listCells(rows), head = vm.listHead;
    const fSel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setFilter(e.target.value) }, h('option', { value: 'all' }, 'All categories'), CATS.map(c => h('option', { value: c.k, selected: c.k === vm.filter }, c.label)));
    morph(center, h('div', { class: 'page', 'data-key': 'report', style: { padding: 0, maxWidth: '1100px' } },
      h('div', { class: 'page-h' }, h('h2', {}, 'Element list'), h('span', { class: 'grow' }), fSel,
        h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-elements.csv', toCSV([head, ...vm.listCells()]), 'text/csv') }, icon('download', 15), 'CSV'),
        h('button', { class: 'btn', onclick: () => printTable('Element list', head, vm.listCells(), { landscape: false }) }, icon('print', 15), 'Print')),
      rows.length ? h('table', { class: 'tbl', 'data-key': 'tbl' }, h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))),
        h('tbody', {}, rows.map((r, i) => h('tr', { 'data-key': r.cat.k + ':' + (r.item ? r.item.id : r.name) }, h('td', { style: { '--c': r.cat.color } }, h('span', { class: 'row' }, h('i', { class: 'dot' }), r.cat.label)), h('td', {}, h('b', {}, r.name)), h('td', { class: 'muted' }, cells[i][2]), h('td', {}, cells[i][3]), h('td', {}, r.status ? h('span', { class: statusClass(r.status) }, r.status) : '')))))
        : h('div', { class: 'empty', 'data-key': 'empty' }, h('h3', {}, 'Nothing tagged yet'), h('p', {}, 'Switch to Scene breakdown and select words in your script to tag props, wardrobe, vehicles and more.'))));
  }

  function draw() {
    closePalette(); drawTop();
    const report = vm.mode === 'report';
    left.classList.toggle('hidden', report); right.classList.toggle('hidden', report);
    if (report) return drawReport();
    if (!vm.scene) return;
    drawLeft(); drawScene(); drawRight();
  }
  const unbind = bindView(vm, draw);
  const away = e => { if (palette && !palette.contains(e.target) && !e.target.closest('.mini')) closePalette(); };
  document.addEventListener('mousedown', away);
  return () => { unbind(); closePalette(); document.removeEventListener('mousedown', away); root.parentElement.classList.remove('noscroll'); };
};
