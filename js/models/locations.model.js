'use strict';
/* ===================================================================
   Locations — MODEL
   Location profiles (P.locations): address, contact, permit, cost,
   notes and a photo. A scene uses a location when the Breakdown links
   it (P.sceneMeta[id].locationId) or, when unlinked, when its heading
   names it. Pure functions: no DOM, no Store, no UI state. See js/mvvm.js.
   =================================================================== */

const LocationsModel = (() => {
  const PERMITS = ['Not needed', 'Needed', 'Applied', 'Approved'];
  const FIELDS = ['name', 'address', 'contact', 'phone', 'permit', 'cost', 'notes', 'photo'];
  const up = t => String(t || '').trim().toUpperCase();

  const newLocation = (o = {}) => Object.assign({ id: newId(), name: '', address: '', contact: '', phone: '', permit: 'Not needed', cost: '', notes: '', photo: '' }, o);
  const list = P => P.locations || [];
  const find = (P, id) => list(P).find(l => l.id === id) || null;
  function add(P, o) { const l = newLocation(o); (P.locations = P.locations || []).push(l); return l; }
  function update(l, k, v) {
    if (!FIELDS.includes(k)) return false; v = String(v ?? '');
    if (k === 'permit' && !PERMITS.includes(v)) return false;
    l[k] = v; return true;
  }
  /** delete a location; scenes linked to it fall back to their heading */
  function remove(P, id) {
    const n = list(P).length; P.locations = list(P).filter(l => l.id !== id);
    Object.values(P.sceneMeta || {}).forEach(m => { if (m && m.locationId === id) delete m.locationId; });
    return P.locations.length < n;
  }
  /** a deletion needs confirming unless the location was never named */
  const needsConfirm = l => !!String(l.name || '').trim();
  /** a location for every place named in a scene heading that has none → how many added */
  function fromScript(P, scenes) {
    const have = new Set(list(P).map(l => up(l.name))); let n = 0;
    scenes.forEach(s => { const k = up(s.location); if (k && !have.has(k)) { have.add(k); add(P, { name: s.location.trim() }); n++; } });
    return n;
  }
  /** the location a scene is linked to, if any */
  const linked = (P, s) => { const m = (P.sceneMeta || {})[s.id]; return (m && m.locationId && find(P, m.locationId)) || null; };
  /** where a scene is shot: the linked location's name, otherwise its heading's place */
  const placeOf = (P, s) => { const L = linked(P, s); return (L && L.name) || s.location || ''; };
  /** scene numbers that use a location (linked, or unlinked with the name in their heading) */
  function usedIn(P, l, scenes) {
    const name = up(l.name);
    return scenes.filter(s => { const m = (P.sceneMeta || {})[s.id] || {}; return m.locationId ? m.locationId === l.id : !!(name && up(s.location).includes(name)); }).map(s => s.num);
  }

  return { PERMITS, FIELDS, newLocation, list, find, add, update, remove, needsConfirm, fromScript, linked, placeOf, usedIn };
})();
