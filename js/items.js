'use strict';
/* ===================================================================
   Props & Wardrobe — the element manager. Every item is a profile:
   photos, aliases (the words used in the script), per-scene quantity and
   — for wardrobe — who wears it in which scene. One component, two tabs.
   =================================================================== */
const ITEM_KINDS = {
  props: {
    key: 'props', label: 'Props', one: 'prop', icon: 'box', defCat: 'Hand prop', budgetDesc: 'Props (from Props list)',
    statuses: ['Needed', 'Sourcing', 'Acquired', 'Prepped', 'On set', 'Returned'],
    cats: ['Hero prop', 'Hand prop', 'Set dressing', 'Vehicle', 'Weapon', 'Food & drink', 'Document / graphic', 'Special effects', 'Animal', 'Other'],
    sources: ['', 'Buy', 'Rent', 'Borrow', 'Build / make', 'Already owned'],
    tagMap: { props: 'Hand prop', setdress: 'Set dressing', vehicles: 'Vehicle', animals: 'Animal', sfx: 'Special effects' },
  },
  wardrobe: {
    key: 'wardrobe', label: 'Wardrobe', one: 'wardrobe item', icon: 'shirt', defCat: 'Costume', budgetDesc: 'Wardrobe (from Wardrobe list)',
    statuses: ['Needed', 'Sourcing', 'Fitting', 'Acquired', 'Prepped', 'On set', 'Cleaned / returned'],
    cats: ['Costume', 'Top', 'Bottom', 'Outerwear', 'Footwear', 'Accessory', 'Jewellery', 'Headwear', 'Undergarments', 'Makeup & hair', 'Prosthetic', 'Other'],
    sources: ['', 'Buy', 'Rent', 'Borrow', 'Make / build', 'Actor’s own', 'Existing stock'],
    tagMap: { wardrobe: 'Costume', makeup: 'Makeup & hair' },
  },
};
function newItem(kind, name = '', o = {}) {
  const c = ITEM_KINDS[kind];
  const base = { id: uid(), name, aliases: [name].filter(Boolean), category: c.defCat, desc: '', qty: 1, status: 'Needed', source: '', vendor: '', cost: '', owner: '', storage: '', continuity: '', notes: '', photos: [], sceneIds: [], sceneQty: {} };
  if (kind === 'wardrobe') Object.assign(base, { characters: [], size: '', look: '', care: '', fitting: '' });
  return Object.assign(base, o);
}
const newProp = (name, o) => newItem('props', name, o);
const newWardrobe = (name, o) => newItem('wardrobe', name, o);
const itemCost = x => (+x.cost || 0) * (+x.qty || 1);
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
  const before = P[ITEM_KINDS[kind].key].length; const tags = unlinkedTags(P, kind);
  tags.forEach(t => tagElement(P, t.sceneId, t.cat, t.text)); Store.touch();
  return { added: P[ITEM_KINDS[kind].key].length - before, linked: tags.length };
}

/* ---------- the Props & Wardrobe page ---------- */
Views.props = function (root) {
  const P = Store.P; UI.itemTab = UI.itemTab || 'props';
  const box = h('div');
  root.append(h('div', { class: 'page', style: { maxWidth: '1400px' } }, h('div', { class: 'page-h' }, h('h2', {}, 'Props & Wardrobe'), h('span', { class: 'small muted' }, 'The element manager — everything tagged in the Breakdown lives here')),
    h('div', { class: 'tabs' }, Object.values(ITEM_KINDS).map(k => h('button', { class: UI.itemTab === k.key ? 'on' : '', onclick: () => { UI.itemTab = k.key; Router.refresh(); } }, `${k.label} (${P[k.key].length})`))), box));
  mountItems(box, UI.itemTab);
};

function mountItems(root, kind) {
  const P = Store.P, cfg = ITEM_KINDS[kind], isW = kind === 'wardrobe';
  UI.itemFilter = UI.itemFilter || {}; const F = UI.itemFilter[kind] = UI.itemFilter[kind] || { q: '', status: '', cat: '', scene: '', char: '' };
  UI.itemView = UI.itemView || 'cards'; if (!isW && UI.itemView === 'char') UI.itemView = 'cards';
  const scenes = getScenes(P), sNum = id => (scenes.find(s => s.id === id) || {}).num;
  const list = () => P[cfg.key];
  const grid = h('div'), banner = h('div'), summary = h('div', { class: 'sum' });
  const mk = (opts, val, ph, on) => h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => on(e.target.value) }, h('option', { value: '' }, ph), opts.map(o => Array.isArray(o) ? h('option', { value: o[0], selected: o[0] === val }, o[1]) : h('option', { selected: o === val }, o)));
  const views = isW ? [['cards', 'Cards'], ['table', 'Table'], ['char', 'By character']] : [['cards', 'Cards'], ['table', 'Table']];
  const viewSeg = h('div', { class: 'seg' }, views.map(([k, l]) => h('button', { 'data-k': k, class: UI.itemView === k ? 'on' : '', onclick: () => { UI.itemView = k; $$('button', viewSeg).forEach(b => b.classList.toggle('on', b.dataset.k === k)); draw(); } }, l)));
  const filtered = () => list().filter(x => (!F.status || x.status === F.status) && (!F.cat || x.category === F.cat) && (!F.scene || x.sceneIds.includes(F.scene)) && (!F.char || itemAllChars(x).includes(F.char))
    && (!F.q || JSON.stringify([x.name, x.aliases, x.desc, x.vendor, x.owner, x.notes, x.look, x.size]).toLowerCase().includes(F.q.toLowerCase())));
  const charsOf = x => itemAllChars(x).join(', ');
  const csvRows = () => [['Item', 'Also called', 'Category', ...(isW ? ['Characters', 'Look / change', 'Size / fit'] : []), 'Description', 'Scenes', 'Qty', 'Status', 'Source', 'Vendor', 'Responsible', 'Storage', 'Unit cost', 'Total', 'Continuity', 'Notes'],
    ...filtered().map(x => [x.name, (x.aliases || []).filter(a => singularKey(a) !== singularKey(x.name)).join('; '), x.category, ...(isW ? [charsOf(x), x.look, x.size] : []), x.desc, x.sceneIds.map(id => sNum(id) + (sceneQtyOf(x, id) > 1 ? '×' + sceneQtyOf(x, id) : '')).filter(Boolean).join(' '), x.qty, x.status, x.source, x.vendor, x.owner, x.storage, x.cost, itemCost(x), x.continuity, x.notes])];
  function addToBudget() {
    const tot = sum(list(), itemCost); if (!tot) return toast('Enter costs on your items first.', true);
    const line = P.budget.find(l => l.cat === 'Art & wardrobe' && l.desc === cfg.budgetDesc);
    if (line) { line.qty = 1; line.unit = 'Flat'; line.rate = tot; } else P.budget.push({ id: uid(), cat: 'Art & wardrobe', desc: cfg.budgetDesc, qty: 1, unit: 'Flat', rate: tot });
    Store.touch(); toast(`Budget updated: ${cfg.label.toLowerCase()} ${money(tot)}`);
  }
  root.append(h('div', { class: 'row wrap', style: { marginBottom: '14px' } }, h('span', { class: 'grow' }),
    h('button', { class: 'btn primary', onclick: () => { const x = newItem(kind); if (isW) x.usage = {}; list().push(x); Store.touch(); draw(); openItem(x); } }, icon('plus', 15), `Add ${cfg.one}`),
    h('button', { class: 'btn', onclick: mergeSelected, title: 'Tick two or more items in the table, then merge them into one' }, icon('copy', 15), 'Merge…'),
    h('button', { class: 'btn', onclick: addToBudget, title: `Add the total ${cfg.label.toLowerCase()} cost to the Budget` }, icon('dollar', 15), 'Add to budget'),
    h('button', { class: 'btn', onclick: () => download(slug(P.title) + `-${cfg.key}.csv`, toCSV(csvRows()), 'text/csv') }, icon('download', 15), 'CSV'),
    h('button', { class: 'btn', onclick: () => printTable(cfg.label + ' list', ['Item', 'Category', ...(isW ? ['Characters', 'Look'] : []), 'Scenes', 'Qty', 'Status', 'Source', 'Vendor / owner', 'Storage', 'Cost'],
      filtered().map(x => [x.name, x.category, ...(isW ? [charsOf(x), x.look] : []), x.sceneIds.map(sNum).filter(Boolean).join(', '), x.qty, x.status, x.source, [x.vendor, x.owner].filter(Boolean).join(' / '), x.storage, x.cost ? money(itemCost(x)) : ''])) }, icon('print', 15), 'Print')),
    banner, summary,
    h('div', { class: 'row wrap', style: { marginBottom: '14px' } }, h('input', { class: 'inp', placeholder: `Search ${cfg.label.toLowerCase()} (names, aliases, notes)…`, style: { width: '250px' }, value: F.q, oninput: e => { F.q = e.target.value; draw(); } }),
      mk(cfg.statuses, F.status, 'Any status', v => { F.status = v; draw(); }), mk(cfg.cats, F.cat, 'Any category', v => { F.cat = v; draw(); }),
      mk(scenes.map(s => [s.id, `Sc ${s.num} — ${s.label}`.slice(0, 44)]), F.scene, 'Any scene', v => { F.scene = v; draw(); }),
      isW ? mk(allCharNames(P), F.char, 'Any character', v => { F.char = v; draw(); }) : null, h('span', { class: 'grow' }), viewSeg), grid);

  const picked = new Set();
  function mergeSelected() {
    const items = list().filter(x => picked.has(x.id));
    if (items.length < 2) return toast('Switch to Table view, tick two or more items, then press Merge.', true);
    const keepSel = h('select', { class: 'inp' }, items.map(x => h('option', { value: x.id }, x.name)));
    modal({ title: `Merge ${items.length} items`, body: h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'They become one element. Scenes, photos, who wears it, notes and every phrase used in the script are combined. Which name should it keep?'), keepSel),
      buttons: [{ label: 'Cancel' }, { label: 'Merge', primary: true, onClick: () => { const keep = items.find(x => x.id === keepSel.value); mergeItems(P, keep, items.filter(x => x !== keep)); picked.clear(); toast(`Merged into “${keep.name}”`); Router.refresh(); } }] });
  }

  /* ----- the profile dialog ----- */
  function openItem(x) {
    const wasNew = !x.name && !x.desc;
    x.aliases = x.aliases || [x.name].filter(Boolean); x.sceneQty = x.sceneQty || {};
    const aliasBox = h('div', { class: 'whorow' });
    const drawAliases = () => { aliasBox.innerHTML = ''; const als = x.aliases.filter(a => singularKey(a) !== singularKey(x.name));
      als.forEach(a => aliasBox.append(h('span', { class: 'chip', style: { '--c': '#687076' } }, a, h('button', { title: 'Remove', onclick: () => { x.aliases = x.aliases.filter(z => z !== a); Store.touch(); drawAliases(); } }, icon('x', 11)))));
      const inp = h('input', { class: 'inp', style: { width: '200px', padding: '3px 8px' }, placeholder: 'Add another name…', onkeydown: e => { if (e.key === 'Enter' && inp.value.trim()) { if (!itemKeys(x).includes(singularKey(inp.value))) x.aliases.push(inp.value.trim()); Store.touch(); drawAliases(); } } });
      aliasBox.append(inp); };
    drawAliases();
    const useBox = h('div', { class: 'use-list' });
    const SETUPS = [['', 'Not specified'], ['preset', 'Pre-set on stage'], ['actor', 'Actor carries on'], ['crew', 'Crew brings on'], ['flown', 'Flown / tracked in']];
    const setupSel = s => h('select', { class: 'cell', style: { gridColumn: '1 / -1', fontSize: '12px' }, title: 'How does it get on stage in this scene?', onchange: e => { x.setup = x.setup || {}; x.setup[s.id] = e.target.value; Store.touch(); } }, SETUPS.map(([k, l]) => h('option', { value: k, selected: k === ((x.setup || {})[s.id] || '') }, l)));
    const drawUse = () => { useBox.innerHTML = '';
      scenes.forEach(s => { const on = x.sceneIds.includes(s.id), cast = [...new Set([...sceneCast(P, s), ...itemCharsIn(x, s.id)])];
        useBox.append(h('div', { class: 'use-row' + (on ? ' on' : '') },
          h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: on, onchange: e => { if (e.target.checked) { x.sceneIds.push(s.id); if (x.usage && !x.usage[s.id]) x.usage[s.id] = []; } else { x.sceneIds = x.sceneIds.filter(i => i !== s.id); if (x.usage) delete x.usage[s.id]; } Store.touch(); drawUse(); } }), h('b', {}, s.num), h('span', { class: 'clip' }, s.label)),
          on ? h('input', { class: 'el-qty', type: 'number', min: 1, title: 'Quantity needed in this scene', value: sceneQtyOf(x, s.id), onchange: e => { x.sceneQty[s.id] = Math.max(1, +e.target.value || 1); Store.touch(); } }) : null,
          on && !isW && P.mode === 'stage' ? setupSel(s) : null,
          on && isW ? h('div', { class: 'whorow', style: { gridColumn: '1 / -1' } }, cast.length ? cast.map(n => h('button', { class: 'whochip' + (itemCharsIn(x, s.id).includes(n) ? ' on' : ''), title: `${n} wears this in scene ${s.num}`, onclick: () => { const cur = itemCharsIn(x, s.id); setItemChars(x, s.id, cur.includes(n) ? cur.filter(z => z !== n) : [...cur, n]); Store.touch(); drawUse(); } }, n)) : h('span', { class: 'small muted' }, 'No cast in this scene yet')) : null)); }); };
    drawUse();
    const gal = h('div');
    async function addPhotos() { const fs = await pickFiles('image/*'); for (const f of fs) x.photos.push(await readImage(f, 900)); if (fs.length) { Store.touch(); drawGal(); } }
    function drawGal() {
      gal.innerHTML = '';
      gal.append(h('div', { class: 'prop-main', style: x.photos[0] ? { backgroundImage: `url(${x.photos[0]})` } : {}, onclick: () => { if (!x.photos[0]) addPhotos(); } }, x.photos[0] ? '' : h('span', { class: 'row small' }, icon('image', 22), 'Add photos')),
        h('div', { class: 'thumbs' }, x.photos.slice(1).map((u, i) => h('div', { class: 'tn2' }, h('div', { class: 'thumb', style: { backgroundImage: `url(${u})`, backgroundSize: 'cover', cursor: 'pointer' }, title: 'Make this the main photo', onclick: () => { x.photos.splice(i + 1, 1); x.photos.unshift(u); Store.touch(); drawGal(); } }),
          h('button', { class: 'icon-btn x', onclick: () => { x.photos.splice(i + 1, 1); Store.touch(); drawGal(); } }, icon('x', 10)))),
          h('button', { class: 'btn sm', onclick: addPhotos }, icon('plus', 13), 'Photos'), x.photos[0] ? h('button', { class: 'btn sm', onclick: () => { x.photos.shift(); Store.touch(); drawGal(); } }, 'Remove main') : null));
    }
    drawGal();
    const f = (key, label, o = {}) => h('div', { class: 'field' + (o.full ? ' full' : ''), style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, label),
      o.select ? h('select', { class: 'inp', onchange: e => { x[key] = e.target.value; Store.touch(); } }, o.select.map(v => h('option', { selected: v === x[key] }, v)))
        : h(o.area ? 'textarea' : 'input', { class: 'inp', rows: 3, type: o.area ? undefined : o.type, min: o.type === 'number' ? 0 : undefined, step: key === 'cost' ? '0.01' : undefined, list: o.list, value: x[key] ?? '', placeholder: o.ph || '', oninput: e => { x[key] = e.target.value; Store.touch(); } }));
    const people = [...new Set(P.people.map(p => p.name).filter(Boolean))];
    const title = h('input', { class: 'pf-title', value: x.name, placeholder: isW ? 'e.g. Margot’s grey cardigan' : 'e.g. Reel 7 film can', oninput: e => { x.name = e.target.value; Store.touch(); } });
    const sec = (t, ...kids) => h('div', { class: 'pf-sec' }, h('h4', {}, t), ...kids);
    const bodyEl = h('div', { class: 'pf pf-item' },
      h('div', { class: 'pf-side' }, gal, sec(isW ? 'Scenes · quantity · who wears it' : 'Scenes · quantity', useBox)),
      h('div', { class: 'pf-main' }, title,
        sec('Also called in the script', h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Every phrase that means this same thing — “bright red sack”, “sack”. They all highlight and link here.'), aliasBox),
        sec('Details', h('div', { class: 'pf-grid' }, f('category', 'Category', { select: cfg.cats }), f('status', 'Status', { select: cfg.statuses }), f('qty', isW ? 'Total quantity (incl. doubles)' : 'Total quantity', { type: 'number' }),
          isW ? f('look', 'Look / change #', { ph: 'e.g. Look 2 — after the rain' }) : f('owner', 'Responsible (props master)', { list: 'dl-ppl' }), f('desc', 'Description', { area: true, full: true, ph: isW ? 'Colour, fabric, period, condition…' : 'Size, colour, period, condition…' }))),
        isW ? sec('Fit & care', h('div', { class: 'pf-grid' }, f('size', 'Size / measurements', { ph: 'Chest 38, shoe 9…' }), f('fitting', 'Fitting date', { type: 'date' }), f('care', 'Care / cleaning', { area: true, full: true, ph: 'Dry-clean only, needs breakdown / ageing…' }))) : null,
        sec('Sourcing', h('div', { class: 'pf-grid' }, f('source', 'Get it by', { select: cfg.sources }), f('vendor', 'Vendor / lender', { ph: 'Shop, rental house, person' }), f('cost', 'Unit cost', { type: 'number' }), isW ? f('owner', 'Responsible (costume designer)', { list: 'dl-ppl' }) : f('storage', 'Storage / location'), isW ? f('storage', 'Storage / rail', { full: true }) : null)),
        sec('Continuity & notes', h('div', { class: 'pf-grid one' }, f('continuity', 'Continuity (condition, hero vs. duplicates, damage…)', { area: true }), f('notes', 'Notes', { area: true }))),
        h('datalist', { id: 'dl-ppl' }, people.map(n => h('option', { value: n })))));
    const dlg = modal({ title: cfg.label.replace(/s$/, '') + ' profile', wide: true, body: bodyEl, onClose: () => { if (!x.name.trim() && wasNew && !x.photos.length && !x.sceneIds.length) list().splice(list().indexOf(x), 1); if (x.name && !itemKeys(x).includes(singularKey(x.name))) x.aliases.push(x.name); Store.touch(); draw(); },
      buttons: [{ label: 'Delete', danger: true, onClick: () => { P.tags = P.tags.filter(t => t.itemId !== x.id); P[cfg.key] = list().filter(p => p !== x); Store.touch(); } },
        { label: 'Merge into…', onClick: () => { const others = list().filter(o => o !== x); if (!others.length) { toast('There is nothing else to merge with yet.', true); return false; }
          const sel = h('select', { class: 'inp', size: Math.min(8, others.length + 1) }, others.map(o => h('option', { value: o.id }, o.name)));
          modal({ title: `Merge “${x.name}” into…`, body: sel, buttons: [{ label: 'Cancel' }, { label: 'Merge', primary: true, onClick: () => { const keep = others.find(o => o.id === sel.value); if (!keep) return false; mergeItems(P, keep, [x]); toast(`Merged into “${keep.name}”`); Router.refresh(); } }] });
          return true; } },
        { label: 'Duplicate', onClick: () => { const c = JSON.parse(JSON.stringify(x)); c.id = uid(); c.name = (x.name || cfg.one) + ' (copy)'; c.aliases = [c.name]; list().splice(list().indexOf(x) + 1, 0, c); Store.touch(); toast('Duplicated — use copies for doubles or alternate looks'); } },
        { label: 'Done', primary: true }] });
  }

  /* ----- wardrobe by character ----- */
  function drawByChar() {
    const names = allCharNames(P), items = list();
    if (!names.length) { grid.append(h('div', { class: 'empty' }, h('p', {}, 'No characters yet — write dialogue or add cast first.'))); return; }
    names.forEach(ch => {
      const mine = items.filter(x => itemAllChars(x).includes(ch)), person = P.people.find(p => p.type === 'cast' && normChar(p.character) === ch);
      const addSel = h('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px' }, onchange: e => { const x = items.find(i => i.id === e.target.value); if (!x) return; if (!x.sceneIds.length) return toast('That item isn’t in any scene yet — add scenes in its profile first.', true); x.sceneIds.forEach(id => setItemChars(x, id, [...itemCharsIn(x, id), ch])); Store.touch(); draw(); } },
        h('option', { value: '' }, '+ Assign an item to ' + ch.split(' ')[0]), items.filter(x => !mine.includes(x)).map(x => h('option', { value: x.id }, x.name)));
      grid.append(h('div', { class: 'card', style: { padding: '14px 16px', marginBottom: '12px' } },
        h('div', { class: 'row', style: { marginBottom: '8px' } }, person ? avatar(person, 30) : null, h('b', { style: { fontFamily: 'var(--head)', fontSize: '16px' } }, ch), person && person.name ? h('span', { class: 'muted' }, '· ' + person.name) : null, h('span', { class: 'grow' }), addSel),
        mine.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Item', 'Look', 'Scenes where they wear it', 'Status', ''].map(c => h('th', {}, c)))), h('tbody', {}, mine.map(x => { const scs = x.sceneIds.filter(id => itemCharsIn(x, id).includes(ch));
          return h('tr', { style: { cursor: 'pointer' }, onclick: () => openItem(x) }, h('td', { class: 'c10', style: { fontWeight: 650 } }, x.name), h('td', { class: 'c10' }, x.look), h('td', { class: 'c10' }, scs.map(sNum).filter(Boolean).join(', ') || '—'), h('td', { class: 'c10' }, h('span', { class: statusClass(x.status) }, x.status)),
            h('td', { class: 'c10', style: { width: '40px' } }, ibtn('x', `Unassign from ${ch}`, e => { e.stopPropagation(); x.sceneIds.forEach(id => setItemChars(x, id, itemCharsIn(x, id).filter(c => c !== ch))); Store.touch(); draw(); }))); })))
          : h('div', { class: 'small muted' }, 'Nothing assigned yet.')));
    });
    const loose = items.filter(x => !itemAllChars(x).length);
    if (loose.length) grid.append(h('div', { class: 'card', style: { padding: '14px 16px' } }, h('b', {}, `Not assigned to anyone (${loose.length})`), h('div', { class: 'small muted', style: { margin: '2px 0 8px' } }, 'Open one and tick who wears it in each scene, or use the grid in the Breakdown.'), h('div', { class: 'row wrap' }, loose.map(x => h('button', { class: 'btn sm', onclick: () => openItem(x) }, x.name)))));
  }

  function draw() {
    const all = list(), items = filtered(), un = untrackedItems(P, kind);
    banner.innerHTML = '';
    if (un.length) banner.append(h('div', { class: 'csalert info', style: { display: 'flex', alignItems: 'center', gap: '12px' } }, icon('tag', 16), h('span', { class: 'grow' }, h('b', {}, `${un.length} breakdown tag${un.length > 1 ? 's' : ''} `), 'from an older version are not linked to an element yet.'),
      h('button', { class: 'btn sm primary', onclick: () => { importItems(P, kind); toast('Linked'); Router.refresh(); } }, 'Link them')));
    summary.innerHTML = '';
    summary.append(h('div', {}, h('span', {}, 'Items'), h('b', {}, String(all.length))), ...cfg.statuses.filter(s => all.some(x => x.status === s)).map(s => h('div', {}, h('span', {}, s), h('b', {}, String(all.filter(x => x.status === s).length)))), h('div', {}, h('span', {}, 'Total cost'), h('b', {}, money(sum(all, itemCost)))));
    grid.innerHTML = '';
    if (UI.itemView === 'char' && isW) return drawByChar();
    if (!items.length) { grid.append(h('div', { class: 'empty' }, h('h3', {}, all.length ? `No ${cfg.label.toLowerCase()} match` : `No ${cfg.label.toLowerCase()} yet`), h('p', {}, all.length ? 'Clear a filter to see more.' : 'Tag words in the Breakdown and they appear here automatically, or add items by hand.'))); return; }
    const aka = x => (x.aliases || []).filter(a => singularKey(a) !== singularKey(x.name));
    if (UI.itemView === 'table') {
      grid.append(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['', '', 'Item', 'Category', ...(isW ? ['Characters', 'Look'] : []), 'Scenes', 'Qty', 'Status', 'Source', 'Cost'].map(c => h('th', {}, c)))),
        h('tbody', {}, items.map(x => h('tr', { style: { cursor: 'pointer' }, onclick: () => openItem(x) }, h('td', { style: { width: '34px' }, onclick: e => e.stopPropagation() }, h('input', { type: 'checkbox', checked: picked.has(x.id), title: 'Select to merge', style: { width: '16px', height: '16px', margin: '10px' }, onchange: e => { e.target.checked ? picked.add(x.id) : picked.delete(x.id); } })),
          h('td', { style: { width: '56px' } }, h('div', { class: 'thumb', style: { width: '44px', backgroundImage: x.photos[0] ? `url(${x.photos[0]})` : 'none', backgroundSize: 'cover' } })),
          h('td', { class: 'c10', style: { fontWeight: 650 } }, x.name || '(unnamed)', aka(x).length ? h('div', { class: 'small muted', style: { fontWeight: 400 } }, 'also: ' + aka(x).join(', ')) : null), h('td', { class: 'c10' }, x.category), ...(isW ? [h('td', { class: 'c10' }, charsOf(x)), h('td', { class: 'c10' }, x.look)] : []),
          h('td', { class: 'c10' }, x.sceneIds.map(id => sNum(id) + (sceneQtyOf(x, id) > 1 ? '×' + sceneQtyOf(x, id) : '')).filter(Boolean).join(', ')), h('td', { class: 'c10' }, x.qty), h('td', { class: 'c10' }, h('span', { class: statusClass(x.status) }, x.status)), h('td', { class: 'c10' }, x.source), h('td', { class: 'c10' }, x.cost ? money(itemCost(x)) : ''))))));
      return;
    }
    grid.append(h('div', { class: 'prop-grid' }, items.map(x => h('div', { class: 'propcard', tabindex: 0, onclick: () => openItem(x), onkeydown: e => { if (e.key === 'Enter') openItem(x); } },
      h('div', { class: 'pic', style: x.photos[0] ? { backgroundImage: `url(${x.photos[0]})` } : {} }, x.photos[0] ? '' : icon(cfg.icon, 30)),
      h('div', { class: 'pbody' }, h('b', {}, x.name || '(unnamed)'), aka(x).length ? h('div', { class: 'small muted' }, 'also: ' + aka(x).slice(0, 3).join(', ')) : null, h('div', { class: 'small muted' }, x.category + (x.qty > 1 ? ` · ×${x.qty}` : '') + (isW && x.look ? ` · ${x.look}` : '')),
        isW && itemAllChars(x).length ? h('div', { class: 'small', style: { fontWeight: 600 } }, charsOf(x)) : null,
        h('div', { class: 'row', style: { marginTop: '6px', gap: '6px', flexWrap: 'wrap' } }, h('span', { class: statusClass(x.status) }, x.status), x.sceneIds.length ? h('span', { class: 'small muted' }, 'Sc ' + x.sceneIds.map(sNum).filter(Boolean).join(', ')) : null))))));
  }
  draw();
  if (UI.openItem && UI.openItem.kind === kind) { const x = list().find(i => i.id === UI.openItem.id); UI.openItem = null; if (x) openItem(x); }
}
