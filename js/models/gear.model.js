'use strict';
/* ===================================================================
   Gear & rentals — MODEL
   A kit list lives on a holder object: P.photo.gear for a photo shoot,
   P.podcast.gear for a podcast. Items: { id, cat, name, qty, source,
   rate, days, pickup, ret, status, notes }. Each kind of production has
   its own categories, statuses, budget mapping and starter kit (KINDS).
   The Podcast suite's gear tab uses these same rules (PodcastModel's
   gear functions call this file). Pure functions: no DOM, no Store, no
   UI state. See js/mvvm.js.
   =================================================================== */

const GearModel = (() => {
  const KINDS = {
    photo: {
      cats: ['Camera', 'Lenses', 'Lighting', 'Modifiers', 'Grip & support', 'Power & cable', 'Tethering & digital', 'Backdrops & surfaces', 'Media & storage', 'Other'],
      statuses: ['Needed', 'Reserved', 'Picked up', 'On set', 'Returned'],
      budget: { Camera: 'Camera & grip', Lenses: 'Camera & grip', 'Grip & support': 'Camera & grip', 'Tethering & digital': 'Camera & grip', 'Media & storage': 'Camera & grip', Lighting: 'Lighting', Modifiers: 'Lighting', 'Power & cable': 'Lighting', 'Backdrops & surfaces': 'Art & wardrobe', Other: 'Miscellaneous' },
      fallback: 'Miscellaneous',
      starter: [['Camera', 'Camera body (primary)', 1], ['Camera', 'Camera body (backup)', 1], ['Lenses', '24–70mm f/2.8', 1], ['Lenses', '85mm f/1.4', 1], ['Lenses', '70–200mm f/2.8', 1], ['Lighting', 'Strobe head 600Ws', 4], ['Lighting', 'Continuous LED panel', 2], ['Modifiers', 'Large octabox 150cm', 2], ['Modifiers', 'Strip softbox', 2], ['Modifiers', 'Reflector 5-in-1', 2],
        ['Grip & support', 'C-stand', 6], ['Grip & support', 'Light stand', 6], ['Grip & support', 'V-flat (white/black)', 4], ['Grip & support', 'Sandbags', 12], ['Power & cable', 'Pack / battery + extension reels', 1], ['Tethering & digital', 'Laptop + tether cable', 1], ['Tethering & digital', 'Card reader + backup drive', 2], ['Media & storage', 'Memory cards', 6], ['Backdrops & surfaces', 'Seamless paper 2.7m', 3]],
      title: 'Gear & rentals', sub: 'Cameras, lenses, lighting, grip and everything that has to be on set — with rental costs and a pack list.',
      search: 'Search gear…', starterLabel: 'Add a starter kit', packTitle: 'Pack list', empty: 'Add items one at a time, or start from a typical studio kit.',
    },
    podcast: {
      cats: ['Microphones', 'Audio Interfaces & Mixers', 'Recorders & Preamps', 'Headphones & Monitoring', 'Stands, Arms & Shockmounts', 'Cables, Adapters & Power', 'Acoustic Treatment & Shields', 'Cameras & Video (Vodcast)', 'Storage & Media', 'Other / Field Kit'],
      statuses: ['Needed', 'Reserved', 'Picked up', 'In Studio', 'Returned'],
      budget: { 'Microphones': 'Sound Design & Foley', 'Audio Interfaces & Mixers': 'Audio Engineering', 'Recorders & Preamps': 'Audio Engineering', 'Headphones & Monitoring': 'Sound Design & Foley', 'Stands, Arms & Shockmounts': 'Studio Hire', 'Cables, Adapters & Power': 'Audio Engineering', 'Acoustic Treatment & Shields': 'Studio Hire', 'Cameras & Video (Vodcast)': 'Post-Production', 'Storage & Media': 'Post-Production', 'Other / Field Kit': 'Audio Engineering' },
      fallback: 'Audio Engineering',
      starter: [['Microphones', 'Dynamic Broadcast Vocal Mic (e.g. Shure SM7B / PodMic)', 2], ['Microphones', 'Condenser Studio Mic (e.g. Rode NT1)', 1], ['Audio Interfaces & Mixers', 'Podcast Audio Production Studio / Mixer', 1], ['Recorders & Preamps', '32-bit Float Field Recorder (Backup)', 1],
        ['Headphones & Monitoring', 'Closed-back Studio Monitor Headphones', 2], ['Stands, Arms & Shockmounts', 'Adjustable Studio Boom Arm', 2], ['Stands, Arms & Shockmounts', 'Shock Mount & Dual Pop Filter', 2], ['Cables, Adapters & Power', 'Balanced Studio XLR Cables (10ft)', 4],
        ['Cables, Adapters & Power', 'Headphone Extension Cables', 2], ['Acoustic Treatment & Shields', 'Reflection Filter / Sound Shield', 2], ['Storage & Media', 'High-speed SD Card (128GB)', 2], ['Storage & Media', 'External Backup SSD (1TB)', 1]],
      title: 'Studio Gear & Mics', sub: 'Microphones, audio interfaces, recorders, headphones, boom arms and field kits — with rental costs and pack list.',
      search: 'Search mics & gear…', starterLabel: 'Add audio studio kit', packTitle: 'Audio Pack List', empty: 'Add microphones and studio kit, or start from a broadcast package.',
    },
  };
  /** statuses that count as ready (any kind) */
  const READY = ['Picked up', 'In Studio', 'On set', 'Returned'];
  const FIELDS = ['cat', 'name', 'qty', 'source', 'rate', 'days', 'pickup', 'ret', 'status', 'notes'];
  const kind = mode => mode === 'podcast' ? KINDS.podcast : KINDS.photo;

  const item = (cat, o = {}) => Object.assign({ id: newId(), cat, name: '', qty: 1, source: 'Owned', rate: '', days: '', pickup: '', ret: '', status: 'Needed', notes: '' }, o);
  const starter = mode => kind(mode).starter.map(([cat, name, qty]) => item(cat, { name, qty }));
  const list = H => (H && H.gear) || [];

  /* ---------- cost ---------- */
  /** an item's own days, else the shoot's days, else 1 */
  const days = (g, nDays) => +g.days || nDays || 1;
  const cost = (g, nDays) => (+g.qty || 0) * (+g.rate || 0) * days(g, nDays);
  const stats = (H, nDays) => ({ count: list(H).length, ready: list(H).filter(g => READY.includes(g.status)).length, total: list(H).reduce((a, g) => a + cost(g, nDays), 0) });
  const sources = H => ['Owned', ...new Set(list(H).map(g => g.source).filter(x => x && x !== 'Owned'))];

  /* ---------- the list ---------- */
  function filter(gear, q = '', status = '') { q = String(q).toLowerCase(); return gear.filter(g => (!status || g.status === status) && (!q || JSON.stringify(Object.values(g)).toLowerCase().includes(q))); }
  /** filtered items by category, in the category order: [{ cat, items }] */
  const groups = (gear, cats, q, status) => { const rows = filter(gear, q, status); return cats.map(cat => ({ cat, items: rows.filter(g => g.cat === cat) })).filter(x => x.items.length); };
  const find = (H, id) => list(H).find(g => g.id === id) || null;
  function add(H, cat, o) { const g = item(cat, o); (H.gear = H.gear || []).push(g); return g; }
  function update(g, k, v) { if (!FIELDS.includes(k)) return false; g[k] = v; return true; }
  function duplicate(H, id) { const i = list(H).findIndex(g => g.id === id); if (i < 0) return null; const c = Object.assign({}, H.gear[i], { id: newId() }); H.gear.splice(i + 1, 0, c); return c; }
  function remove(H, id) { const n = list(H).length; H.gear = list(H).filter(g => g.id !== id); return H.gear.length < n; }
  function addKit(H, items) { H.gear = H.gear || []; items.forEach(g => H.gear.push(g)); return items.length; }

  /* ---------- budget and reports ---------- */
  /** budget lines for items with a day rate, kept in step by `auto: 'gear:<id>'` → how many */
  function syncBudget(P, H, catMap, nDays, fallback = 'Miscellaneous') {
    let n = 0; P.budget = P.budget || [];
    list(H).filter(g => (+g.rate || 0) > 0).forEach(g => {
      const key = 'gear:' + g.id; let l = P.budget.find(x => x.auto === key);
      if (!l) { l = { id: newId(), auto: key }; P.budget.push(l); }
      Object.assign(l, { cat: (catMap && catMap[g.cat]) || fallback, desc: `${g.name}${g.source && g.source !== 'Owned' ? ' (' + g.source + ')' : ''}`, qty: (+g.qty || 1) * days(g, nDays), unit: 'Day', rate: +g.rate || 0 });
      n++;
    });
    return n;
  }
  /** printable pack list: a group row per category, then ☐ rows */
  const packRows = (H, cats) => cats.flatMap(c => { const ls = list(H).filter(g => g.cat === c); return ls.length ? [{ grp: c }, ...ls.map(g => ['☐', g.cat, g.name, g.qty, g.source, g.status])] : []; });
  /** rental items grouped by rental house: [{ source, items, total }] */
  function rentals(H, nDays) {
    const by = new Map();
    list(H).filter(g => g.source && g.source !== 'Owned').forEach(g => { if (!by.has(g.source)) by.set(g.source, []); by.get(g.source).push(g); });
    return [...by].map(([source, items]) => ({ source, items, total: items.reduce((a, g) => a + cost(g, nDays), 0) }));
  }
  const csv = (H, nDays) => [['Category', 'Item', 'Qty', 'Source', 'Rate/day', 'Days', 'Total', 'Pick-up', 'Return', 'Status', 'Notes'], ...list(H).map(g => [g.cat, g.name, g.qty, g.source, g.rate, days(g, nDays), cost(g, nDays), g.pickup, g.ret, g.status, g.notes])];

  return { KINDS, READY, FIELDS, kind, item, starter, list, days, cost, stats, sources, filter, groups, find, add, update, duplicate, remove, addKit, syncBudget, packRows, rentals, csv };
})();
