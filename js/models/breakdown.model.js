'use strict';
/* ===================================================================
   Script breakdown — MODEL
   A breakdown tag is a *mention* of something in a scene ("bright red
   sack"). Props, wardrobe and the like link each mention to one shared
   element ("Sack") that owns photos, status, scenes, quantities and who
   wears it. Different phrasings of one thing are aliases of one element.
   Pure functions: no DOM, no Store, no UI state. See js/mvvm.js.

   Tags:      { id, sceneId, cat, text, itemId? }
   Elements:  P.props / P.wardrobe (rules in js/models/items.model.js)
   Scenes:    the app's getScenes() objects ({ id, num, label, chars, … }),
              passed in, so the model never parses the script itself.
   =================================================================== */

const BreakdownModel = (() => {
  /* ---------- plural / singular matching ---------- */
  const IRREG = { bus: 'buses', gas: 'gases', man: 'men', woman: 'women', child: 'children', foot: 'feet', tooth: 'teeth', knife: 'knives', wife: 'wives', shelf: 'shelves', leaf: 'leaves', life: 'lives', thief: 'thieves', wolf: 'wolves', mouse: 'mice', person: 'people', glass: 'glasses', scarf: 'scarves', loaf: 'loaves', half: 'halves', jeans: 'jeans', pants: 'pants', trousers: 'trousers', scissors: 'scissors', glasses: 'glasses' };
  const IRREG_REV = Object.fromEntries(Object.entries(IRREG).map(([a, b]) => [b, a]));
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** regex source matching a phrase and its plural / singular form (last word only) */
  function plural(text) {
    const m = /^([\s\S]*?)([A-Za-z]+)$/.exec(text); if (!m) return reEsc(text);
    const pre = reEsc(m[1]), w = m[2], lw = w.toLowerCase(); let alt;
    const irr = IRREG[lw] ? lw : IRREG_REV[lw];
    if (irr && IRREG[irr] === irr) alt = reEsc(w);
    else if (irr) alt = `(?:${reEsc(irr)}|${reEsc(IRREG[irr])})`;
    else if (/ies$/.test(lw) && lw.length > 4) alt = reEsc(w.slice(0, -3)) + '(?:y|ies)';
    else if (/(?:ch|sh|x|z|s)es$/.test(lw)) alt = reEsc(w.slice(0, -2)) + '(?:es)?';
    else if (/(?:us|is|ss)$/.test(lw)) alt = reEsc(w) + '(?:es)?';
    else if (/[^s]s$/.test(lw)) alt = reEsc(w.slice(0, -1)) + 's?';
    else if (/[^aeiou]y$/.test(lw)) alt = reEsc(w.slice(0, -1)) + '(?:y|ies)';
    else if (/(?:s|x|z|ch|sh)$/.test(lw)) alt = reEsc(w) + '(?:es)?';
    else alt = reEsc(w) + '(?:e?s)?';
    return pre + alt;
  }
  /** canonical singular form, so "mop" / "mops" / "Mops" are one thing */
  function key(text) {
    const t = String(text || '').trim().toLowerCase().replace(/\s+/g, ' '), m = /^([\s\S]*?)([a-z]+)$/.exec(t); if (!m) return t; let w = m[2];
    if (IRREG_REV[w]) w = IRREG_REV[w];
    else if (/(?:us|is|ss)$/.test(w)) { /* already singular */ }
    else if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
    else if (/(?:ches|shes|xes|zes|sses)$/.test(w)) w = w.slice(0, -2);
    else if (/[^s]s$/.test(w)) w = w.slice(0, -1);
    return m[1] + w;
  }
  const clean = t => String(t || '').trim().replace(/\s+/g, ' ');
  const upper = t => String(t || '').toUpperCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\^/g, '').trim();

  /* ---------- elements ---------- */
  /** breakdown category → the list its elements live in (other categories are plain tags) */
  const ELEMENT_KIND = { props: 'props', setdress: 'props', vehicles: 'props', animals: 'props', sfx: 'props', wardrobe: 'wardrobe', makeup: 'wardrobe' };
  const kindOfCat = cat => ELEMENT_KIND[cat] || null;
  const keysOf = x => [x.name, ...(x.aliases || [])].map(key).filter(Boolean);
  /** is every word of `a` the end of `b`?  "sack" ends "bright red sack" */
  function isSuffixOf(a, b) { const A = a.split(' '), B = b.split(' '); return A.length <= B.length && A.every((w, i) => B[B.length - A.length + i] === w); }
  /** does a phrase (key k) belong to this element?
     - exact match with its name or any alias
     - k is a more generic form of one of its phrases:  "sack" → "bright red sack"
     - k is more specific than ALL its phrases:          "bright red sack" → element "Sack"
     but "blue sack" never joins "bright red sack" (different qualifier). */
  function matches(x, k) {
    const ks = keysOf(x); if (!ks.length) return false;
    if (ks.includes(k)) return true;
    if (ks.some(ik => isSuffixOf(k, ik))) return true;
    return ks.every(ik => isSuffixOf(ik, k));
  }
  /** → { item } for one match, { candidates } when several could be it, {} for none */
  function find(P, kind, text) {
    const k = key(text), items = P[kind] || [];
    const exact = items.filter(x => keysOf(x).includes(k)); if (exact.length) return { item: exact[0] };
    const rel = items.filter(x => matches(x, k));
    return rel.length === 1 ? { item: rel[0] } : rel.length > 1 ? { candidates: rel } : {};
  }
  const byId = (P, id) => (P.props || []).find(x => x.id === id) || (P.wardrobe || []).find(x => x.id === id) || null;
  const kindOf = (P, x) => (P.wardrobe || []).includes(x) ? 'wardrobe' : 'props';
  const addKey = (x, text) => { if (!keysOf(x).includes(key(text))) (x.aliases = x.aliases || [x.name]).push(text); };

  /** the element a phrase belongs to — found, given, or created */
  function resolve(P, cat, text, item) {
    const kind = kindOfCat(cat); if (!kind) return { item: null };
    let created = false, candidates = null;
    if (!item) { const f = find(P, kind, text); item = f.item || null; candidates = f.candidates || null; }
    if (!item) {
      const cfg = ItemsModel.KINDS[kind]; item = ItemsModel.newItem(kind, text, { category: cfg.tagMap[cat] || cfg.defCat, aliases: [text] }); if (kind === 'wardrobe') item.usage = {};
      (P[kind] = P[kind] || []).push(item); created = true;
    } else addKey(item, text);
    return { item, created, candidates };
  }
  /** tag a phrase in a scene: link (or create) its element and put the scene on it.
      → { tag, item, created, candidates } or null for empty text */
  function tag(P, sceneId, cat, text, o = {}) {
    text = clean(text); if (!text) return null;
    const r = resolve(P, cat, text, o.item || null), item = r.item;
    if (item && !item.sceneIds.includes(sceneId)) { item.sceneIds.push(sceneId); if (item.usage && !item.usage[sceneId]) item.usage[sceneId] = []; }
    P.tags = P.tags || [];
    let t = P.tags.find(t => t.sceneId === sceneId && t.cat === cat && key(t.text) === key(text) && (!item || t.itemId === item.id || !t.itemId));
    if (!t) { t = { id: newId(), sceneId, cat, text }; P.tags.push(t); }
    if (item) t.itemId = item.id;
    return { tag: t, item, created: r.created, candidates: r.candidates };
  }
  /** drop a mention; an element with no other mention in that scene leaves the scene */
  function untag(P, t) {
    const before = P.tags.length; P.tags = P.tags.filter(x => x.id !== t.id); if (P.tags.length === before) return false;
    const x = t.itemId && byId(P, t.itemId);
    if (x && !P.tags.some(o => o.itemId === x.id && o.sceneId === t.sceneId)) {
      x.sceneIds = x.sceneIds.filter(i => i !== t.sceneId);
      if (x.sceneQty) delete x.sceneQty[t.sceneId];
      if (x.usage) { delete x.usage[t.sceneId]; x.characters = [...new Set(Object.values(x.usage).flat())]; }
    }
    return true;
  }
  /** take an element out of one scene (all its mentions there) */
  function removeFromScene(P, x, sceneId) { P.tags.filter(t => t.itemId === x.id && t.sceneId === sceneId).forEach(t => untag(P, t)); x.sceneIds = x.sceneIds.filter(i => i !== sceneId); return true; }

  /** ids of the scenes whose text mentions the phrase (plural-aware). texts: [{ id, text }] */
  function mentioning(texts, text) {
    const re = new RegExp(`(?<![\\w])(?:${plural(clean(text))})(?![\\w])`, 'i');
    return texts.filter(s => re.test(s.text)).map(s => s.id);
  }
  /** tag every scene that mentions the phrase → { n, item } */
  function tagAll(P, cat, text, item, texts) {
    const r = resolve(P, cat, clean(text), item), ids = mentioning(texts, text);
    ids.forEach(id => tag(P, id, cat, text, { item: r.item }));
    return { n: ids.length, item: r.item };
  }
  /** tag every mention of every name an element goes by → number of scenes tagged */
  function tagAllAliases(P, cat, x, texts) { return (x.aliases && x.aliases.length ? x.aliases : [x.name]).reduce((n, a) => n + tagAll(P, cat, a, x, texts).n, 0); }

  /** rename an element; the old name stays one of the words it goes by */
  function rename(x, name) {
    name = clean(name); if (!name || name === x.name) return false;
    x.aliases = x.aliases || [x.name]; addKey(x, name); x.name = name; return true;
  }
  /** delete an element everywhere: its profile and all its mentions */
  function removeElement(P, x) { return ItemsModel.remove(P, kindOf(P, x), x.id); }

  /** tags written before elements existed: link them (never creates), and move old per-tag character lists into the scene */
  function linkLegacy(P) {
    (P.props || []).concat(P.wardrobe || []).forEach(x => { x.aliases = x.aliases || [x.name]; });
    (P.tags || []).forEach(t => {
      const kind = kindOfCat(t.cat); if (!kind) return;
      if (!t.itemId || !byId(P, t.itemId)) { const f = find(P, kind, t.text); if (f.item) { t.itemId = f.item.id; addKey(f.item, t.text); if (!f.item.sceneIds.includes(t.sceneId)) f.item.sceneIds.push(t.sceneId); } }
      const x = t.itemId && byId(P, t.itemId), who = Array.isArray(t.who) ? t.who : (t.who ? [t.who] : []);
      if (x && who.length && kind === 'wardrobe') { ItemsModel.setChars(x, t.sceneId, [...ItemsModel.charsIn(x, t.sceneId), ...who]); delete t.who; }
    });
  }

  /* ---------- one scene ---------- */
  const tagsIn = (P, sceneId) => (P.tags || []).filter(t => t.sceneId === sceneId);
  /** how many different things are tagged in a scene */
  const count = (P, sceneId) => new Set(tagsIn(P, sceneId).map(t => t.itemId || t.cat + key(t.text))).size;
  /** a scene's mentions in one category, one group per element (or per phrase for plain tags).
      → [{ key, item, name, tags, variants }]  variants: the mentions worth showing as written */
  function groups(P, sceneId, cat) {
    const m = new Map();
    tagsIn(P, sceneId).filter(t => t.cat === cat).forEach(t => {
      const x = t.itemId && byId(P, t.itemId), k = x ? x.id : cat + ':' + key(t.text);
      if (!m.has(k)) m.set(k, { key: k, item: x || null, tags: [] }); m.get(k).tags.push(t);
    });
    return [...m.values()].map(g => { const name = g.item ? g.item.name : g.tags[0].text; return { ...g, name, variants: g.tags.filter(t => key(t.text) !== key(name) || g.tags.length > 1) }; });
  }
  /** elements of this kind that could be added to the category but aren't in the scene yet */
  function addable(P, sceneId, cat) {
    const kind = kindOfCat(cat); if (!kind) return [];
    const inScene = new Set(groups(P, sceneId, cat).map(g => g.item && g.item.id));
    return (P[kind] || []).filter(x => !inScene.has(x.id) && (kind === 'wardrobe' ? (cat === 'makeup') === (x.category === 'Makeup & hair') : true));
  }
  /** a cast tag that adds a non-speaking character to the scene (the only cast you can remove here) */
  const castTag = (P, scene, name) => tagsIn(P, scene.id).find(t => t.cat === 'cast' && upper(t.text) === name && !scene.chars.has(name)) || null;
  /** "who wears it" grid for wardrobe / makeup: one row per element, one column per character */
  function wearGrid(P, sceneId, cat, cast) {
    const items = groups(P, sceneId, cat).filter(g => g.item).map(g => g.item);
    return { cast, rows: items.map(x => { const on = ItemsModel.charsIn(x, sceneId); return { item: x, on, unassigned: !on.length }; }) };
  }
  /** give every element in the list to a character in this scene */
  function giveAll(items, sceneId, name) { items.forEach(x => ItemsModel.setChars(x, sceneId, [...new Set([...ItemsModel.charsIn(x, sceneId), name])])); return items.length > 0; }
  function setWearer(x, sceneId, name, on) { const cur = ItemsModel.charsIn(x, sceneId); ItemsModel.setChars(x, sceneId, on ? [...new Set([...cur, name])] : cur.filter(z => z !== name)); return true; }

  /* ---------- scene notes ---------- */
  const META = ['synopsis', 'notes', 'storyDay', 'est', 'continuity'];
  const meta = (P, sceneId) => (P.sceneMeta = P.sceneMeta || {})[sceneId] = P.sceneMeta[sceneId] || {};
  /** est: shooting minutes; blank goes back to the page-length estimate */
  function setMeta(P, sceneId, k, v) {
    if (!META.includes(k)) return false; const m = meta(P, sceneId);
    if (k === 'est') { if (v === '' || v == null || !(+v > 0)) delete m.est; else m.est = +v; } else m[k] = String(v ?? '');
    return true;
  }
  function linkLocation(P, sceneId, locId) {
    if (locId && !(P.locations || []).some(l => l.id === locId)) return false;
    const m = meta(P, sceneId); if (locId) m.locationId = locId; else delete m.locationId; return true;
  }
  /** a new location profile from the scene heading, linked to the scene */
  function newLocation(P, sceneId, name) {
    const l = LocationsModel.add(P, { name: clean(name) || 'New location' }); meta(P, sceneId).locationId = l.id; return l;
  }
  /** shoot days (1-based) the scene is on, and its shot / frame counts */
  function sceneLinks(P, sceneId) {
    return { days: (P.days || []).map((d, i) => (d.sceneIds || []).includes(sceneId) ? i + 1 : 0).filter(Boolean),
      shots: (P.shots || []).filter(x => x.sceneId === sceneId).length, frames: (P.boards || []).filter(x => x.sceneId === sceneId).length };
  }

  /* ---------- highlighting the script ---------- */
  /** split text into plain runs and runs that are a tagged mention: [{ text, tag? }] */
  function highlight(tags, text) {
    if (!tags.length || !text) return [{ text }];
    const seen = new Map(); tags.forEach(t => { const k = key(t.text); if (k && !seen.has(k)) seen.set(k, t); });
    const list = [...seen.values()].sort((a, b) => b.text.length - a.text.length);
    const re = new RegExp(`(?<![\\w])(?:${list.map(t => '(' + plural(clean(t.text)) + ')').join('|')})(?![\\w])`, 'gi');
    const out = []; let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      out.push({ text: m[0], tag: list[m.findIndex((x, i) => i > 0 && x !== undefined) - 1] }); last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }

  /* ---------- element list (all scenes) ---------- */
  /** one row per element across the script. cats: [{ k, label, color }] in display order */
  function elementRows(P, scenes, cats) {
    const rows = [], byScene = new Map(scenes.map(s => [s.id, s]));
    cats.forEach(c => {
      const m = new Map();
      (P.tags || []).filter(t => t.cat === c.k).forEach(t => {
        const x = t.itemId && byId(P, t.itemId), k = x ? x.id : key(t.text);
        if (!m.has(k)) m.set(k, { cat: c, name: x ? x.name : t.text, item: x || null, variants: new Set(), scenes: new Map(), status: x ? x.status : '' });
        const e = m.get(k), sc = byScene.get(t.sceneId); e.variants.add(t.text); if (sc) e.scenes.set(sc.num, x ? ItemsModel.qtyIn(x, sc.id) : 1);
      });
      [...m.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach(e => rows.push({ ...e, variants: [...e.variants], scenes: [...e.scenes.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })) }));
    });
    return rows;
  }
  const LIST_HEAD = ['Category', 'Element', 'Also called', 'Scenes', 'Status'];
  /** the element list as table cells (screen, CSV and print share them) */
  const listCells = rows => rows.map(r => [r.cat.label, r.name, r.variants.filter(v => key(v) !== key(r.name)).join('; '), r.scenes.map(([n, q]) => n + (q > 1 ? ` ×${q}` : '')).join(', '), r.status || '']);

  return {
    plural, key, ELEMENT_KIND, kindOfCat, keysOf, isSuffixOf, matches, find, byId, kindOf,
    resolve, tag, untag, removeFromScene, mentioning, tagAll, tagAllAliases, rename, removeElement, linkLegacy,
    tagsIn, count, groups, addable, castTag, wearGrid, giveAll, setWearer,
    META, meta, setMeta, linkLocation, newLocation, sceneLinks,
    highlight, elementRows, LIST_HEAD, listCells,
  };
})();
