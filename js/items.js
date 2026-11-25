'use strict';
/* ===================================================================
   Props & Wardrobe — VIEW. The element manager: every item is a
   profile with photos, aliases (the words used in the script),
   per-scene quantity and — for wardrobe — who wears it in which scene.
   Rules: js/models/items.model.js; screen state and commands:
   js/viewmodels/items.vm.js.
   =================================================================== */
/* older global names, used by the Breakdown, search, region and sample projects */
const ITEM_KINDS = ItemsModel.KINDS;
const newItem = (kind, name, o) => ItemsModel.newItem(kind, name, o);
const newProp = (name, o) => newItem('props', name, o);
const newWardrobe = (name, o) => newItem('wardrobe', name, o);
const itemCost = x => ItemsModel.cost(x);
const statusClass = s => 'st st-' + String(s).toLowerCase().replace(/[^a-z]/g, '');
const allCharNames = P => [...new Set([...allCharacters(P).keys(), ...P.people.filter(p => p.type === 'cast' && p.character).map(p => normChar(p.character)), ...P.casting.roles.map(r => normChar(r.name))].filter(Boolean))];

/* breakdown tags that have no element yet (only older projects; new tags always link) */
const unlinkedTags = (P, kind) => P.tags.filter(t => ITEM_KINDS[kind].tagMap[t.cat] && !(t.itemId && itemById(P, t.itemId)));
function untrackedItems(P, kind) {
  const m = new Map(); unlinkedTags(P, kind).forEach(t => { const k = singularKey(t.text); if (!m.has(k)) m.set(k, { key: k, name: t.text, existing: null, scenes: new Set() }); m.get(k).scenes.add(t.sceneId); });
  return [...m.values()];
}
const needsLink = () => true;
function importItems(P, kind) {
  const before = P[kind].length, tags = unlinkedTags(P, kind);
  tags.forEach(t => tagElement(P, t.sceneId, t.cat, t.text));
  return { added: P[kind].length - before, linked: tags.length };
}

/* ---------- the Props & Wardrobe page ---------- */
Views.props = function (root) {
  const vm = new ItemsVM(), page = h('div', { class: 'page', style: { maxWidth: '1400px' } }); root.append(page);
  const mk = (opts, val, ph, on) => h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => on(e.target.value) }, h('option', { value: '' }, ph), opts.map(o => Array.isArray(o) ? h('option', { value: o[0], selected: o[0] === val }, o[1]) : h('option', { value: o, selected: o === val }, o)));

  function mergePicked() {
    const items = vm.pickedItems;
    if (items.length < 2) return toast('Switch to Table view, tick two or more items, then press Merge.', true);
    const keepSel = h('select', { class: 'inp' }, items.map(x => h('option', { value: x.id }, x.name || '(unnamed)')));
    modal({ title: `Merge ${items.length} items`, body: h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'They become one element. Scenes, photos, who wears it, notes and every phrase used in the script are combined. Which name should it keep?'), keepSel),
      buttons: [{ label: 'Cancel' }, { label: 'Merge', primary: true, onClick: () => { const keep = vm.merge(keepSel.value); if (keep) toast(`Merged into “${keep.name}”`); } }] });
  }
  function addToBudget() { const tot = vm.toBudget(); if (!tot) return toast('Enter costs on your items first.', true); toast(`Budget updated: ${vm.cfg.label.toLowerCase()} ${money(tot)}`); }
  function print() { const p = vm.printRows(money); printTable(vm.cfg.label + ' list', p.head, p.rows); }

  function byChar() {
    const { chars, loose } = vm.byCharacter, all = vm.all, num = vm.numOf;
    if (!chars.length) return h('div', { class: 'empty' }, h('p', {}, 'No characters yet — write dialogue or add cast first.'));
    return [...chars.map(({ ch, items }) => {
      const person = vm.castFor(ch), mine = new Set(items.map(i => i.x.id));
      const addSel = h('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px' }, onchange: e => { const id = e.target.value; e.target.value = ''; if (id && !vm.assignChar(id, ch)) toast('That item isn’t in any scene yet — add scenes in its profile first.', true); } },
        h('option', { value: '' }, '+ Assign an item to ' + ch.split(' ')[0]), all.filter(x => !mine.has(x.id)).map(x => h('option', { value: x.id }, x.name)));
      return h('div', { class: 'card', 'data-key': 'ch:' + ch, style: { padding: '14px 16px', marginBottom: '12px' } },
        h('div', { class: 'row', style: { marginBottom: '8px' } }, person ? avatar(person, 30) : null, h('b', { style: { fontFamily: 'var(--head)', fontSize: '16px' } }, ch), person && person.name ? h('span', { class: 'muted' }, '· ' + person.name) : null, h('span', { class: 'grow' }), addSel),
        items.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Item', 'Look', 'Scenes where they wear it', 'Status', ''].map(c => h('th', {}, c)))), h('tbody', {}, items.map(({ x, scenes }) =>
          h('tr', { 'data-key': x.id, style: { cursor: 'pointer' }, onclick: () => openItem(x.id) }, h('td', { class: 'c10', style: { fontWeight: 650 } }, x.name), h('td', { class: 'c10' }, x.look), h('td', { class: 'c10' }, scenes.map(num).filter(Boolean).join(', ') || '—'),
            h('td', { class: 'c10' }, h('span', { class: statusClass(x.status) }, x.status)), h('td', { class: 'c10', style: { width: '40px' } }, ibtn('x', `Unassign from ${ch}`, e => { e.stopPropagation(); vm.unassignChar(x.id, ch); }))))))
          : h('div', { class: 'small muted' }, 'Nothing assigned yet.'));
    }), loose.length ? h('div', { class: 'card', 'data-key': 'loose', style: { padding: '14px 16px' } }, h('b', {}, `Not assigned to anyone (${loose.length})`), h('div', { class: 'small muted', style: { margin: '2px 0 8px' } }, 'Open one and tick who wears it in each scene, or use the grid in the Breakdown.'),
      h('div', { class: 'row wrap' }, loose.map(x => h('button', { class: 'btn sm', onclick: () => openItem(x.id) }, x.name)))) : null];
  }

  function listView() {
    const all = vm.all, items = vm.visible, cfg = vm.cfg, W = vm.isWardrobe;
    if (!items.length) return h('div', { class: 'empty' }, h('h3', {}, all.length ? `No ${cfg.label.toLowerCase()} match` : `No ${cfg.label.toLowerCase()} yet`), h('p', {}, all.length ? 'Clear a filter to see more.' : 'Tag words in the Breakdown and they appear here automatically, or add items by hand.'));
    const chars = x => vm.allChars(x).join(', ');
    if (vm.mode === 'table') return h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['', '', 'Item', 'Category', ...(W ? ['Characters', 'Look'] : []), 'Scenes', 'Qty', 'Status', 'Source', 'Cost'].map(c => h('th', {}, c)))),
      h('tbody', {}, items.map(x => h('tr', { 'data-key': x.id, style: { cursor: 'pointer' }, onclick: () => openItem(x.id) },
        h('td', { style: { width: '34px' }, onclick: e => e.stopPropagation() }, h('input', { type: 'checkbox', checked: vm.picked.has(x.id), title: 'Select to merge', style: { width: '16px', height: '16px', margin: '10px' }, onchange: e => vm.togglePick(x.id, e.target.checked) })),
        h('td', { style: { width: '56px' } }, h('div', { class: 'thumb', style: { width: '44px', backgroundImage: x.photos[0] ? `url(${x.photos[0]})` : 'none', backgroundSize: 'cover' } })),
        h('td', { class: 'c10', style: { fontWeight: 650 } }, x.name || '(unnamed)', vm.aka(x).length ? h('div', { class: 'small muted', style: { fontWeight: 400 } }, 'also: ' + vm.aka(x).join(', ')) : null), h('td', { class: 'c10' }, x.category),
        ...(W ? [h('td', { class: 'c10' }, chars(x)), h('td', { class: 'c10' }, x.look)] : []),
        h('td', { class: 'c10' }, vm.scenesText(x, ', ')), h('td', { class: 'c10' }, x.qty), h('td', { class: 'c10' }, h('span', { class: statusClass(x.status) }, x.status)), h('td', { class: 'c10' }, x.source), h('td', { class: 'c10' }, x.cost ? money(vm.cost(x)) : '')))));
    const num = vm.numOf;
    return h('div', { class: 'prop-grid' }, items.map(x => h('div', { class: 'propcard', 'data-key': x.id, tabindex: 0, onclick: () => openItem(x.id), onkeydown: e => { if (e.key === 'Enter') openItem(x.id); } },
      h('div', { class: 'pic', style: x.photos[0] ? { backgroundImage: `url(${x.photos[0]})` } : {} }, x.photos[0] ? '' : icon(cfg.icon, 30)),
      h('div', { class: 'pbody' }, h('b', {}, x.name || '(unnamed)'), vm.aka(x).length ? h('div', { class: 'small muted' }, 'also: ' + vm.aka(x).slice(0, 3).join(', ')) : null, h('div', { class: 'small muted' }, x.category + (x.qty > 1 ? ` · ×${x.qty}` : '') + (W && x.look ? ` · ${x.look}` : '')),
        W && vm.allChars(x).length ? h('div', { class: 'small', style: { fontWeight: 600 } }, chars(x)) : null,
        h('div', { class: 'row', style: { marginTop: '6px', gap: '6px', flexWrap: 'wrap' } }, h('span', { class: statusClass(x.status) }, x.status), x.sceneIds.length ? h('span', { class: 'small muted' }, 'Sc ' + x.sceneIds.map(num).filter(Boolean).join(', ')) : null)))));
  }

  function draw() {
    const cfg = vm.cfg, F = vm.filter, W = vm.isWardrobe, sum = vm.summary, un = vm.untracked, mode = vm.mode;
    morph(page, [h('div', { class: 'page-h' }, h('h2', {}, 'Props & Wardrobe'), h('span', { class: 'small muted' }, 'The element manager — everything tagged in the Breakdown lives here')),
      h('div', { class: 'tabs' }, vm.kinds.map(k => h('button', { class: vm.kind === k.key ? 'on' : '', onclick: () => vm.setKind(k.key) }, `${k.label} (${k.count})`))),
      h('div', { class: 'row wrap', style: { marginBottom: '14px' } }, h('span', { class: 'grow' }),
        h('button', { class: 'btn primary', onclick: () => { const x = vm.add(); openItem(x.id, true); } }, icon('plus', 15), `Add ${cfg.one}`),
        h('button', { class: 'btn', onclick: mergePicked, title: 'Tick two or more items in the table, then merge them into one' }, icon('copy', 15), 'Merge…'),
        h('button', { class: 'btn', onclick: addToBudget, title: `Add the total ${cfg.label.toLowerCase()} cost to the Budget` }, icon('dollar', 15), 'Add to budget'),
        h('button', { class: 'btn', onclick: () => download(slug(vm.P.title) + `-${cfg.key}.csv`, toCSV(vm.csvRows()), 'text/csv') }, icon('download', 15), 'CSV'),
        h('button', { class: 'btn', onclick: print }, icon('print', 15), 'Print')),
      un.length ? h('div', { class: 'csalert info', 'data-key': 'untracked', style: { display: 'flex', alignItems: 'center', gap: '12px' } }, icon('tag', 16), h('span', { class: 'grow' }, h('b', {}, `${un.length} breakdown tag${un.length > 1 ? 's' : ''} `), 'from an older version are not linked to an element yet.'),
        h('button', { class: 'btn sm primary', onclick: () => { vm.linkTags(); toast('Linked'); } }, 'Link them')) : null,
      h('div', { class: 'sum', 'data-key': 'sum' }, h('div', {}, h('span', {}, 'Items'), h('b', {}, String(sum.count))), sum.statuses.map(([s, n]) => h('div', {}, h('span', {}, s), h('b', {}, String(n)))), h('div', {}, h('span', {}, 'Total cost'), h('b', {}, money(sum.cost)))),
      h('div', { class: 'row wrap', 'data-key': 'filters', style: { marginBottom: '14px' } }, h('input', { class: 'inp', placeholder: `Search ${cfg.label.toLowerCase()} (names, aliases, notes)…`, style: { width: '250px' }, value: F.q, oninput: e => vm.setFilter({ q: e.target.value }) }),
        mk(cfg.statuses, F.status, 'Any status', v => vm.setFilter({ status: v })), mk(cfg.cats, F.cat, 'Any category', v => vm.setFilter({ cat: v })),
        mk(vm.scenes.map(s => [s.id, `Sc ${s.num} — ${s.label}`.slice(0, 44)]), F.scene, 'Any scene', v => vm.setFilter({ scene: v })),
        W ? mk(vm.charNames, F.char, 'Any character', v => vm.setFilter({ char: v })) : null, h('span', { class: 'grow' }),
        h('div', { class: 'seg' }, vm.views.map(([k, l]) => h('button', { class: mode === k ? 'on' : '', onclick: () => vm.setMode(k) }, l)))),
      h('div', { 'data-key': 'list-' + vm.kind + '-' + mode }, mode === 'char' ? byChar() : listView())]);
  }

  /* ----- the profile dialog: redraws with the view model while open ----- */
  function openItem(id, wasNew = false) {
    const kind = vm.kind, cfg = vm.cfg, W = vm.isWardrobe, body = h('div', { class: 'pf pf-item' });
    const quiet = k => e => vm.update(id, k, e.target.value, { quiet: true });
    const f = (x, key, label, o = {}) => h('div', { class: 'field' + (o.full ? ' full' : ''), style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, label),
      o.select ? h('select', { class: 'inp', onchange: e => vm.update(id, key, e.target.value) }, o.select.map(v => h('option', { value: v, selected: v === x[key] }, v)))
        : h(o.area ? 'textarea' : 'input', { class: 'inp', rows: 3, type: o.area ? undefined : o.type, min: o.type === 'number' ? 0 : undefined, step: key === 'cost' ? '0.01' : undefined, list: o.list, value: x[key] ?? '', placeholder: o.ph || '', oninput: o.type === 'number' ? e => vm.update(id, key, e.target.value) : quiet(key) }));
    const sec = (t, ...kids) => h('div', { class: 'pf-sec' }, h('h4', {}, t), ...kids);
    async function addPhotos() { const fs = await pickFiles('image/*'), urls = []; for (const fl of fs) urls.push(await readImage(fl, 900)); vm.addPhotos(id, urls); }
    function draw() {
      const x = vm.item(id); if (!x) return;
      const aliasInp = h('input', { class: 'inp', 'data-key': 'alias-in', style: { width: '200px', padding: '3px 8px' }, placeholder: 'Add another name…', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { vm.addAlias(id, e.target.value); e.target.value = ''; } } });
      const gal = [h('div', { class: 'prop-main', style: x.photos[0] ? { backgroundImage: `url(${x.photos[0]})` } : {}, onclick: () => { if (!x.photos[0]) addPhotos(); } }, x.photos[0] ? '' : h('span', { class: 'row small' }, icon('image', 22), 'Add photos')),
        h('div', { class: 'thumbs' }, x.photos.slice(1).map((u, i) => h('div', { class: 'tn2' }, h('div', { class: 'thumb', style: { backgroundImage: `url(${u})`, backgroundSize: 'cover', cursor: 'pointer' }, title: 'Make this the main photo', onclick: () => vm.makeMain(id, i + 1) }),
          h('button', { class: 'icon-btn x', onclick: () => vm.removePhoto(id, i + 1) }, icon('x', 10)))),
          h('button', { class: 'btn sm', onclick: addPhotos }, icon('plus', 13), 'Photos'), x.photos[0] ? h('button', { class: 'btn sm', onclick: () => vm.removePhoto(id, 0) }, 'Remove main') : null)];
      const use = vm.useRows(x).map(({ s, on, cast }) => h('div', { class: 'use-row' + (on ? ' on' : ''), 'data-key': s.id },
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: on, onchange: e => vm.setScene(id, s.id, e.target.checked) }), h('b', {}, s.num), h('span', { class: 'clip' }, s.label)),
        on ? h('input', { class: 'el-qty', type: 'number', min: 1, title: 'Quantity needed in this scene', value: vm.qtyIn(x, s.id), onchange: e => vm.setSceneQty(id, s.id, e.target.value) }) : null,
        on && !W && vm.isStage ? h('select', { class: 'cell', style: { gridColumn: '1 / -1', fontSize: '12px' }, title: 'How does it get on stage in this scene?', onchange: e => vm.setSetup(id, s.id, e.target.value) }, vm.setups.map(([k, l]) => h('option', { value: k, selected: k === vm.setupOf(x, s.id) }, l))) : null,
        on && W ? h('div', { class: 'whorow', style: { gridColumn: '1 / -1' } }, cast.length ? cast.map(n => h('button', { class: 'whochip' + (vm.charsIn(x, s.id).includes(n) ? ' on' : ''), title: `${n} wears this in scene ${s.num}`, onclick: () => vm.toggleWearer(id, s.id, n) }, n)) : h('span', { class: 'small muted' }, 'No cast in this scene yet')) : null));
      morph(body, [h('div', { class: 'pf-side' }, h('div', {}, gal), sec(W ? 'Scenes · quantity · who wears it' : 'Scenes · quantity', h('div', { class: 'use-list' }, use))),
        h('div', { class: 'pf-main' }, h('input', { class: 'pf-title', value: x.name, placeholder: W ? 'e.g. Margot’s grey cardigan' : 'e.g. Reel 7 film can', oninput: quiet('name') }),
          sec('Also called in the script', h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Every phrase that means this same thing — “bright red sack”, “sack”. They all highlight and link here.'),
            h('div', { class: 'whorow' }, vm.aka(x).map(a => h('span', { class: 'chip', 'data-key': 'a:' + a, style: { '--c': '#687076' } }, a, h('button', { title: 'Remove', onclick: () => vm.removeAlias(id, a) }, icon('x', 11)))), aliasInp)),
          sec('Details', h('div', { class: 'pf-grid' }, f(x, 'category', 'Category', { select: cfg.cats }), f(x, 'status', 'Status', { select: cfg.statuses }), f(x, 'qty', W ? 'Total quantity (incl. doubles)' : 'Total quantity', { type: 'number' }),
            W ? f(x, 'look', 'Look / change #', { ph: 'e.g. Look 2 — after the rain' }) : f(x, 'owner', 'Responsible (props master)', { list: 'dl-ppl' }), f(x, 'desc', 'Description', { area: true, full: true, ph: W ? 'Colour, fabric, period, condition…' : 'Size, colour, period, condition…' }))),
          W ? sec('Fit & care', h('div', { class: 'pf-grid' }, f(x, 'size', 'Size / measurements', { ph: 'Chest 38, shoe 9…' }), f(x, 'fitting', 'Fitting date', { type: 'date' }), f(x, 'care', 'Care / cleaning', { area: true, full: true, ph: 'Dry-clean only, needs breakdown / ageing…' }))) : null,
          sec('Sourcing', h('div', { class: 'pf-grid' }, f(x, 'source', 'Get it by', { select: cfg.sources }), f(x, 'vendor', 'Vendor / lender', { ph: 'Shop, rental house, person' }), f(x, 'cost', 'Unit cost', { type: 'number' }),
            W ? f(x, 'owner', 'Responsible (costume designer)', { list: 'dl-ppl' }) : f(x, 'storage', 'Storage / location'), W ? f(x, 'storage', 'Storage / rail', { full: true }) : null)),
          sec('Continuity & notes', h('div', { class: 'pf-grid one' }, f(x, 'continuity', 'Continuity (condition, hero vs. duplicates, damage…)', { area: true }), f(x, 'notes', 'Notes', { area: true }))),
          h('datalist', { id: 'dl-ppl' }, vm.people.map(n => h('option', { value: n }))))]);
    }
    draw(); const off = vm.subscribe(draw);
    const mergeInto = () => {
      const others = vm.all.filter(o => o.id !== id); if (!others.length) { toast('There is nothing else to merge with yet.', true); return false; }
      const sel = h('select', { class: 'inp', size: Math.min(8, others.length + 1) }, others.map(o => h('option', { value: o.id }, o.name || '(unnamed)')));
      modal({ title: `Merge “${(vm.item(id) || {}).name || ''}” into…`, body: sel, buttons: [{ label: 'Cancel' }, { label: 'Merge', primary: true, onClick: () => { if (!sel.value) return false; const keep = vm.merge(sel.value, [id]); if (keep) toast(`Merged into “${keep.name}”`); } }] });
    };
    modal({ title: cfg.label.replace(/s$/, '') + ' profile', wide: true, body, onClose: () => { off(); if (vm.kind === kind) vm.finish(id, wasNew); },
      buttons: [{ label: 'Delete', danger: true, onClick: () => { vm.remove(id); } }, { label: 'Merge into…', onClick: mergeInto },
        { label: 'Duplicate', onClick: () => { vm.duplicate(id); toast('Duplicated — use copies for doubles or alternate looks'); } }, { label: 'Done', primary: true }] });
  }

  const off = bindView(vm, draw), pending = vm.takePendingOpen(); if (pending) openItem(pending.id);
  return off;
};
