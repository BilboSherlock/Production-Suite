'use strict';
/* ===================================================================
   Elements — the single model behind the Breakdown, Props & Wardrobe.
   A breakdown tag is a *mention* ("bright red sack"); it links to an
   element profile ("Sack") that owns the photos, status, cost, scenes,
   per-scene quantity and — for wardrobe — which cast member wears it in
   which scene. Different phrasings of one thing are aliases of one element.
   =================================================================== */
const ELEMENT_KIND = { props: 'props', setdress: 'props', vehicles: 'props', animals: 'props', sfx: 'props', wardrobe: 'wardrobe', makeup: 'wardrobe' };
const kindOfCat = cat => ELEMENT_KIND[cat] || null;
const itemKeys = x => [x.name, ...(x.aliases || [])].map(singularKey).filter(Boolean);
/* is every word of `a` the end of `b`?  "sack" ends "bright red sack" */
function isSuffixOf(a, b) {
  const A = a.split(' '), B = b.split(' ');
  return A.length <= B.length && A.every((w, i) => B[B.length - A.length + i] === w);
}
/* does a new phrase (key k) belong to this element?
   - exact match with its name or any alias
   - k is a more generic form of one of its phrases:  "sack"  →  "bright red sack"
   - k is more specific than ALL its phrases:          "bright red sack"  →  element "Sack"
   but "blue sack" never joins "bright red sack" (different qualifier), even though both end in "sack". */
function matchesElement(x, k) {
  const ks = itemKeys(x); if (!ks.length) return false;
  if (ks.includes(k)) return true;
  if (ks.some(ik => isSuffixOf(k, ik))) return true;
  return ks.every(ik => isSuffixOf(ik, k));
}
function findElement(P, kind, text) {
  const k = singularKey(text), items = P[kind];
  const exact = items.filter(x => itemKeys(x).includes(k)); if (exact.length) return { item: exact[0] };
  const rel = items.filter(x => matchesElement(x, k));
  return rel.length === 1 ? { item: rel[0] } : rel.length > 1 ? { candidates: rel } : {};
}
const itemById = (P, id) => P.props.find(x => x.id === id) || P.wardrobe.find(x => x.id === id) || null;
const kindOfItem = (P, x) => P.wardrobe.includes(x) ? 'wardrobe' : 'props';

/* ---- who wears / uses it in which scene ---- */
const itemCharsIn = (x, sid) => x.usage ? (x.usage[sid] || []) : (x.characters || []);
const itemAllChars = x => [...new Set([...(x.characters || []), ...Object.values(x.usage || {}).flat()])];
function setItemChars(x, sid, chars) {
  if (!x.usage) { x.usage = {}; (x.sceneIds || []).forEach(id => { x.usage[id] = [...(x.characters || [])]; }); }
  x.usage[sid] = [...new Set(chars)]; x.characters = [...new Set(Object.values(x.usage).flat())];
}
const sceneQtyOf = (x, sid) => (x.sceneQty && x.sceneQty[sid]) || 1;
const itemLabel = (x, sid) => x.name + (sceneQtyOf(x, sid) > 1 ? ` ×${sceneQtyOf(x, sid)}` : '');

/* ---- tagging: create / link the element, add the mention, link the scene ---- */
function resolveElement(P, cat, text, item) {
  const kind = kindOfCat(cat); if (!kind) return { item: null };
  let created = false, candidates = null;
  if (!item) { const f = findElement(P, kind, text); item = f.item || null; candidates = f.candidates || null; }
  if (!item) {
    const cfg = ITEM_KINDS[kind]; item = newItem(kind, text, { category: cfg.tagMap[cat] || cfg.defCat, aliases: [text] }); if (kind === 'wardrobe') item.usage = {};
    P[kind].push(item); created = true;
  } else if (!itemKeys(item).includes(singularKey(text))) (item.aliases = item.aliases || [item.name]).push(text);
  return { item, created, candidates };
}
function tagElement(P, sceneId, cat, text, o = {}) {
  text = String(text || '').trim().replace(/\s+/g, ' '); if (!text) return null;
  const r = resolveElement(P, cat, text, o.item || null), item = r.item;
  if (item && !item.sceneIds.includes(sceneId)) { item.sceneIds.push(sceneId); if (item.usage && !item.usage[sceneId]) item.usage[sceneId] = []; }
  let tag = P.tags.find(t => t.sceneId === sceneId && t.cat === cat && singularKey(t.text) === singularKey(text) && (!item || t.itemId === item.id || !t.itemId));
  if (!tag) { tag = { id: uid(), sceneId, cat, text }; P.tags.push(tag); }
  if (item) tag.itemId = item.id;
  Store.touch();
  return { tag, item, created: r.created, candidates: r.candidates };
}
function removeTag(P, tag) {
  P.tags = P.tags.filter(t => t.id !== tag.id);
  const x = tag.itemId && itemById(P, tag.itemId);
  if (x && !P.tags.some(t => t.itemId === x.id && t.sceneId === tag.sceneId)) { x.sceneIds = x.sceneIds.filter(i => i !== tag.sceneId); if (x.usage) delete x.usage[tag.sceneId]; if (x.sceneQty) delete x.sceneQty[tag.sceneId]; if (x.usage) x.characters = [...new Set(Object.values(x.usage).flat())]; }
  Store.touch();
}
function removeElementFromScene(P, x, sceneId) { P.tags.filter(t => t.itemId === x.id && t.sceneId === sceneId).forEach(t => removeTag(P, t)); x.sceneIds = x.sceneIds.filter(i => i !== sceneId); Store.touch(); }

/* every scene whose text mentions the phrase (plural-aware) */
function scenesMentioning(P, text) {
  const re = new RegExp(`(?<![\\w])(?:${pluralPattern(text)})(?![\\w])`, 'i');
  return getScenes(P).filter(s => sceneBlocks(P, s).some(b => re.test(stripRich(b.text))));
}
function tagAllMentions(P, cat, text, item) {
  const r = resolveElement(P, cat, text, item); let n = 0;
  scenesMentioning(P, text).forEach(s => { tagElement(P, s.id, cat, text, { item: r.item }); n++; });
  return { n, item: r.item };
}

/* ---- merging ---- */
function mergeItems(P, keep, others) {
  const kind = kindOfItem(P, keep);
  others.forEach(o => {
    if (o === keep) return;
    keep.aliases = [...new Set([...(keep.aliases || [keep.name]), o.name, ...(o.aliases || [])])];
    o.sceneIds.forEach(id => { if (!keep.sceneIds.includes(id)) keep.sceneIds.push(id); });
    if (o.usage || keep.usage) { keep.usage = keep.usage || {}; (keep.sceneIds || []).forEach(id => { if (!keep.usage[id]) keep.usage[id] = keep.characters ? [] : []; });
      Object.entries(o.usage || {}).forEach(([id, ch]) => { keep.usage[id] = [...new Set([...(keep.usage[id] || []), ...ch])]; }); if (!o.usage) (o.characters || []).forEach(c => o.sceneIds.forEach(id => { keep.usage[id] = [...new Set([...(keep.usage[id] || []), c])]; })); keep.characters = [...new Set(Object.values(keep.usage).flat())]; }
    else keep.characters = [...new Set([...(keep.characters || []), ...(o.characters || [])])];
    Object.entries(o.sceneQty || {}).forEach(([id, q]) => { keep.sceneQty = keep.sceneQty || {}; keep.sceneQty[id] = Math.max(keep.sceneQty[id] || 0, q); });
    keep.photos = [...(keep.photos || []), ...(o.photos || [])];
    ['desc', 'continuity', 'notes'].forEach(f => { if (o[f] && !(keep[f] || '').includes(o[f])) keep[f] = [keep[f], o[f]].filter(Boolean).join('\n'); });
    ['vendor', 'owner', 'storage', 'source', 'cost', 'size', 'look', 'care'].forEach(f => { if (!keep[f] && o[f]) keep[f] = o[f]; });
    P.tags.forEach(t => { if (t.itemId === o.id) t.itemId = keep.id; });
    P[kind] = P[kind].filter(x => x !== o);
  });
  Store.touch(); return keep;
}

/* tags written before elements existed: link them (never creates), and carry old per-tag character lists into the scene assignment */
function linkLegacyTags(P) {
  P.props.concat(P.wardrobe).forEach(x => { x.aliases = x.aliases || [x.name]; });
  P.tags.forEach(t => {
    const kind = kindOfCat(t.cat); if (!kind) return;
    if (!t.itemId || !itemById(P, t.itemId)) { const f = findElement(P, kind, t.text); if (f.item) { t.itemId = f.item.id; if (!itemKeys(f.item).includes(singularKey(t.text))) f.item.aliases.push(t.text); if (!f.item.sceneIds.includes(t.sceneId)) f.item.sceneIds.push(t.sceneId); } }
    const x = t.itemId && itemById(P, t.itemId);
    if (x && whoOf(t).length && kind === 'wardrobe') { setItemChars(x, t.sceneId, [...itemCharsIn(x, t.sceneId), ...whoOf(t)]); delete t.who; }
  });
}
