'use strict';
/* ===================================================================
   Props & Wardrobe — MODEL
   Every item is a profile: photos, aliases (the words used in the
   script), per-scene quantity and — for wardrobe — who wears it in
   which scene. Items live in P.props and P.wardrobe; breakdown tags
   (P.tags) point at them with itemId. Pure functions — no DOM, no Store.
   =================================================================== */

const ItemsModel = {
  KINDS: {
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
  },
  /** how a prop gets on stage in a scene (stage productions) */
  SETUPS: [['', 'Not specified'], ['preset', 'Pre-set on stage'], ['actor', 'Actor carries on'], ['crew', 'Crew brings on'], ['flown', 'Flown / tracked in']],
  /** statuses that count as ready */
  DONE: new Set(['Acquired', 'Prepped', 'On set', 'Returned', 'Cleaned / returned']),
  kind: k => ItemsModel.KINDS[k] ? k : 'props',

  /** the matching key of a phrase: "Bright red sacks" → "bright red sack" (see BreakdownModel.key) */
  key: t => BreakdownModel.key(t),
  keys: x => [x.name, ...(x.aliases || [])].map(ItemsModel.key).filter(Boolean),

  newItem(kind, name = '', o = {}) {
    const c = ItemsModel.KINDS[kind];
    const base = { id: newId(), name, aliases: [name].filter(Boolean), category: c.defCat, desc: '', qty: 1, status: 'Needed', source: '', vendor: '', cost: '', owner: '', storage: '', continuity: '', notes: '', photos: [], sceneIds: [], sceneQty: {} };
    if (kind === 'wardrobe') Object.assign(base, { characters: [], size: '', look: '', care: '', fitting: '' });
    return Object.assign(base, o);
  },
  /** a blank item added by hand (wardrobe tracks who wears it per scene) */
  add(P, kind) { const x = ItemsModel.newItem(kind); if (kind === 'wardrobe') x.usage = {}; P[kind].push(x); return x; },
  find: (P, kind, id) => (P[kind] || []).find(x => x.id === id) || null,
  cost: x => (+x.cost || 0) * (+x.qty || 1),
  total: list => list.reduce((a, x) => a + ItemsModel.cost(x), 0),
  /** the other names, without the item's own name */
  aka: x => (x.aliases || []).filter(a => ItemsModel.key(a) !== ItemsModel.key(x.name)),

  /* ---------- who wears it in which scene ---------- */
  charsIn: (x, sid) => x.usage ? (x.usage[sid] || []) : (x.characters || []),
  allChars: x => [...new Set([...(x.characters || []), ...Object.values(x.usage || {}).flat()])],
  setChars(x, sid, chars) {
    if (!x.usage) { x.usage = {}; (x.sceneIds || []).forEach(id => { x.usage[id] = [...(x.characters || [])]; }); }
    x.usage[sid] = [...new Set(chars)]; x.characters = [...new Set(Object.values(x.usage).flat())];
  },
  toggleWearer(x, sid, name) { const cur = ItemsModel.charsIn(x, sid); ItemsModel.setChars(x, sid, cur.includes(name) ? cur.filter(z => z !== name) : [...cur, name]); },
  /** give a character the item in every scene it's in; false when it isn't in any scene yet */
  assignChar(x, ch) { if (!x.sceneIds.length) return false; x.sceneIds.forEach(id => ItemsModel.setChars(x, id, [...ItemsModel.charsIn(x, id), ch])); return true; },
  unassignChar(x, ch) { x.sceneIds.forEach(id => ItemsModel.setChars(x, id, ItemsModel.charsIn(x, id).filter(c => c !== ch))); },

  /* ---------- scenes ---------- */
  qtyIn: (x, sid) => (x.sceneQty && x.sceneQty[sid]) || 1,
  setScene(x, sid, on) {
    if (on) { if (!x.sceneIds.includes(sid)) x.sceneIds.push(sid); if (x.usage && !x.usage[sid]) x.usage[sid] = []; }
    else { x.sceneIds = x.sceneIds.filter(i => i !== sid); if (x.usage) { delete x.usage[sid]; x.characters = [...new Set(Object.values(x.usage).flat())]; } }
  },
  setSceneQty(x, sid, q) { x.sceneQty = x.sceneQty || {}; x.sceneQty[sid] = Math.max(1, Math.round(+q) || 1); },
  setSetup(x, sid, v) { if (!ItemsModel.SETUPS.some(s => s[0] === v)) return false; x.setup = x.setup || {}; x.setup[sid] = v; return true; },
  setupOf: (x, sid) => (x.setup || {})[sid] || '',
  /** "4 12×2 15" — scene numbers, with quantities over one */
  scenesText(x, num, sep = ' ') { return x.sceneIds.map(id => { const n = num(id); return n ? n + (ItemsModel.qtyIn(x, id) > 1 ? '×' + ItemsModel.qtyIn(x, id) : '') : ''; }).filter(Boolean).join(sep); },

  /* ---------- the profile ---------- */
  FIELDS: ['name', 'category', 'desc', 'qty', 'status', 'source', 'vendor', 'cost', 'owner', 'storage', 'continuity', 'notes', 'size', 'look', 'care', 'fitting'],
  update(kind, x, k, v) {
    if (!ItemsModel.FIELDS.includes(k)) return false;
    const c = ItemsModel.KINDS[kind];
    if (k === 'status' && !c.statuses.includes(v)) return false;
    if (k === 'category' && !c.cats.includes(v)) return false;
    if (k === 'source' && !c.sources.includes(v)) return false;
    x[k] = v; return true;
  },
  /** add a name used in the script; false when blank or already known */
  addAlias(x, text) { text = String(text || '').trim(); if (!text || ItemsModel.keys(x).includes(ItemsModel.key(text))) return false; (x.aliases = x.aliases || []).push(text); return true; },
  removeAlias(x, a) { x.aliases = (x.aliases || []).filter(z => z !== a); },
  addPhotos(x, urls) { x.photos = [...(x.photos || []), ...urls]; },
  makeMain(x, i) { if (i <= 0 || i >= x.photos.length) return false; const [u] = x.photos.splice(i, 1); x.photos.unshift(u); return true; },
  removePhoto(x, i) { if (i < 0 || i >= x.photos.length) return false; x.photos.splice(i, 1); return true; },
  /** when the profile closes: a new item left empty goes away; the name is kept among the aliases. Returns false if removed. */
  finish(P, kind, id, wasNew) {
    const x = ItemsModel.find(P, kind, id); if (!x) return false;
    if (wasNew && !String(x.name || '').trim() && !x.photos.length && !x.sceneIds.length) { P[kind] = P[kind].filter(i => i !== x); return false; }
    if (x.name && !(x.aliases || []).map(ItemsModel.key).includes(ItemsModel.key(x.name))) (x.aliases = x.aliases || []).push(x.name);
    return true;
  },
  /** a copy straight after the original (for doubles or alternate looks) */
  duplicate(P, kind, id) {
    const x = ItemsModel.find(P, kind, id); if (!x) return null;
    const c = JSON.parse(JSON.stringify(x)); c.id = newId(); c.name = (x.name || ItemsModel.KINDS[kind].one) + ' (copy)'; c.aliases = [c.name];
    P[kind].splice(P[kind].indexOf(x) + 1, 0, c); return c;
  },
  /** delete an item and its breakdown tags */
  remove(P, kind, id) { const n = P[kind].length; P.tags = (P.tags || []).filter(t => t.itemId !== id); P[kind] = P[kind].filter(x => x.id !== id); return P[kind].length < n; },
  /** fold other items into one: names, scenes, wearers, quantities, photos and notes combine; their tags move over */
  merge(P, kind, keepId, otherIds) {
    const M = ItemsModel, keep = M.find(P, kind, keepId); if (!keep) return null;
    otherIds.map(id => M.find(P, kind, id)).filter(o => o && o !== keep).forEach(o => {
      keep.aliases = [...new Set([...(keep.aliases || [keep.name]), o.name, ...(o.aliases || [])].filter(Boolean))];
      o.sceneIds.forEach(id => { if (!keep.sceneIds.includes(id)) keep.sceneIds.push(id); });
      if (o.usage || keep.usage) {
        keep.usage = keep.usage || {}; keep.sceneIds.forEach(id => { if (!keep.usage[id]) keep.usage[id] = []; });
        Object.entries(o.usage || {}).forEach(([id, ch]) => { keep.usage[id] = [...new Set([...(keep.usage[id] || []), ...ch])]; });
        if (!o.usage) (o.characters || []).forEach(c => o.sceneIds.forEach(id => { keep.usage[id] = [...new Set([...(keep.usage[id] || []), c])]; }));
        keep.characters = [...new Set(Object.values(keep.usage).flat())];
      } else if (o.characters || keep.characters) keep.characters = [...new Set([...(keep.characters || []), ...(o.characters || [])])];
      Object.entries(o.sceneQty || {}).forEach(([id, q]) => { keep.sceneQty = keep.sceneQty || {}; keep.sceneQty[id] = Math.max(keep.sceneQty[id] || 0, q); });
      keep.photos = [...(keep.photos || []), ...(o.photos || [])];
      ['desc', 'continuity', 'notes'].forEach(f => { if (o[f] && !(keep[f] || '').includes(o[f])) keep[f] = [keep[f], o[f]].filter(Boolean).join('\n'); });
      ['vendor', 'owner', 'storage', 'source', 'cost', 'size', 'look', 'care'].forEach(f => { if (!keep[f] && o[f]) keep[f] = o[f]; });
      (P.tags || []).forEach(t => { if (t.itemId === o.id) t.itemId = keep.id; });
      P[kind] = P[kind].filter(x => x !== o);
    });
    return keep;
  },

  /* ---------- lists ---------- */
  /** F = { q, status, cat, scene, char } */
  filter(list, F) {
    const q = (F.q || '').toLowerCase();
    return list.filter(x => (!F.status || x.status === F.status) && (!F.cat || x.category === F.cat) && (!F.scene || x.sceneIds.includes(F.scene)) && (!F.char || ItemsModel.allChars(x).includes(F.char))
      && (!q || JSON.stringify([x.name, x.aliases, x.desc, x.vendor, x.owner, x.notes, x.look, x.size]).toLowerCase().includes(q)));
  },
  /** { count, statuses:[[status, n]] (only those in use), cost } */
  summary(kind, list) { return { count: list.length, statuses: ItemsModel.KINDS[kind].statuses.map(s => [s, list.filter(x => x.status === s).length]).filter(([, n]) => n), cost: ItemsModel.total(list) }; },
  /** wardrobe by character: [{ ch, items:[{ x, scenes:[sid] }] }] plus the items nobody wears */
  byCharacter(list, names) {
    return { chars: names.map(ch => ({ ch, items: list.filter(x => ItemsModel.allChars(x).includes(ch)).map(x => ({ x, scenes: x.sceneIds.filter(id => ItemsModel.charsIn(x, id).includes(ch)) })) })),
      loose: list.filter(x => !ItemsModel.allChars(x).length) };
  },
  csvRows(kind, list, num, money = n => n) {
    const W = kind === 'wardrobe', M = ItemsModel;
    return [['Item', 'Also called', 'Category', ...(W ? ['Characters', 'Look / change', 'Size / fit'] : []), 'Description', 'Scenes', 'Qty', 'Status', 'Source', 'Vendor', 'Responsible', 'Storage', 'Unit cost', 'Total', 'Continuity', 'Notes'],
      ...list.map(x => [x.name, M.aka(x).join('; '), x.category, ...(W ? [M.allChars(x).join(', '), x.look, x.size] : []), x.desc, M.scenesText(x, num), x.qty, x.status, x.source, x.vendor, x.owner, x.storage, x.cost, M.cost(x), x.continuity, x.notes])];
  },
  printRows(kind, list, num, money) {
    const W = kind === 'wardrobe', M = ItemsModel;
    return { head: ['Item', 'Category', ...(W ? ['Characters', 'Look'] : []), 'Scenes', 'Qty', 'Status', 'Source', 'Vendor / owner', 'Storage', 'Cost'],
      rows: list.map(x => [x.name, x.category, ...(W ? [M.allChars(x).join(', '), x.look] : []), x.sceneIds.map(num).filter(Boolean).join(', '), x.qty, x.status, x.source, [x.vendor, x.owner].filter(Boolean).join(' / '), x.storage, x.cost ? money(M.cost(x)) : '']) };
  },
  /** put the list's total cost on its budget line (Art & wardrobe); returns the total (0 = nothing to add) */
  toBudget(P, kind) {
    const tot = ItemsModel.total(P[kind]); if (!tot) return 0; const desc = ItemsModel.KINDS[kind].budgetDesc;
    const line = (P.budget = P.budget || []).find(l => l.cat === 'Art & wardrobe' && l.desc === desc);
    if (line) Object.assign(line, { qty: 1, unit: 'Flat', rate: tot }); else P.budget.push({ id: newId(), cat: 'Art & wardrobe', desc, qty: 1, unit: 'Flat', rate: tot });
    return tot;
  },
};
