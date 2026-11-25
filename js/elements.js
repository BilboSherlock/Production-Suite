'use strict';
/* ===================================================================
   Elements — the single model behind the Breakdown, Props & Wardrobe.
   A breakdown tag is a *mention* ("bright red sack"); it links to an
   element profile ("Sack") that owns the photos, status, cost, scenes,
   per-scene quantity and — for wardrobe — which cast member wears it in
   which scene. Different phrasings of one thing are aliases of one element.

   The rules live in js/models/breakdown.model.js (tagging, matching) and
   js/models/items.model.js (the elements themselves). These are the older
   global names other screens use; the ones that change the project also
   record the change (Store.touch) as they always did.
   =================================================================== */
const BM = BreakdownModel;
const ELEMENT_KIND = BM.ELEMENT_KIND;
const kindOfCat = cat => BM.kindOfCat(cat);
const itemKeys = x => BM.keysOf(x);
const findElement = (P, kind, text) => BM.find(P, kind, text);
const itemById = (P, id) => BM.byId(P, id);
const kindOfItem = (P, x) => BM.kindOf(P, x);

/* ---- who wears / uses it in which scene ---- */
const itemCharsIn = (x, sid) => ItemsModel.charsIn(x, sid);
const itemAllChars = x => ItemsModel.allChars(x);
const setItemChars = (x, sid, chars) => ItemsModel.setChars(x, sid, chars);
const sceneQtyOf = (x, sid) => ItemsModel.qtyIn(x, sid);
const itemLabel = (x, sid) => x.name + (sceneQtyOf(x, sid) > 1 ? ` ×${sceneQtyOf(x, sid)}` : '');

/* ---- tagging ---- */
function tagElement(P, sceneId, cat, text, o = {}) { const r = BM.tag(P, sceneId, cat, text, o); if (r) Store.touch(); return r; }
function removeTag(P, tag) { BM.untag(P, tag); Store.touch(); }
function removeElementFromScene(P, x, sceneId) { BM.removeFromScene(P, x, sceneId); Store.touch(); }
/* each scene's plain text, for finding mentions */
const sceneTexts = P => getScenes(P).map(s => ({ id: s.id, text: sceneBlocks(P, s).map(b => stripRich(b.text)).join('\n') }));
function tagAllMentions(P, cat, text, item) { const r = BM.tagAll(P, cat, text, item, sceneTexts(P)); Store.touch(); return r; }

/* ---- merging ---- */
function mergeItems(P, keep, others) { const r = ItemsModel.merge(P, kindOfItem(P, keep), keep.id, others.map(o => o.id)); Store.touch(); return r; }

/* tags written before elements existed: link them (never creates) */
const linkLegacyTags = P => BM.linkLegacy(P);
