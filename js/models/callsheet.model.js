'use strict';
/* ===================================================================
   Call sheet — MODEL
   A call sheet is generated from one shoot day (see schedule.model.js):
   day.cs holds the sheet's own details (times, weather, hospital, notes)
   and day.calls holds per-person call times by person id. Everything else
   (cast, crew, locations, props, wardrobe) is read from the project.
   Pure functions — no DOM, no Store. See js/mvvm.js.

   Helpers passed in, so this runs in Node tests with plain data:
     castOf(s)  → Set of a scene's characters (normalised names)
     numOf(id)  → a scene's number
     charsIn(item, sceneId) → characters wearing a wardrobe item in a scene
   =================================================================== */

const CallSheetModel = {
  /** the fields of day.cs a user may edit */
  FIELDS: ['crew', 'shoot', 'lunch', 'wrap', 'sunrise', 'sunset', 'weather', 'temp', 'hospital', 'hospAddr', 'basecamp', 'office', 'notes', 'safety'],
  /** the per-person call fields */
  CALL_FIELDS: ['pickup', 'makeup', 'set', 'notes'],
  /** a character name as the script uses it: "Theo (V.O.)" → "THEO" (same rule as core.js normChar) */
  norm(t) { return typeof normChar === 'function' ? normChar(t) : (t || '').toUpperCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\^/g, '').trim(); },

  /* ---------- people ---------- */
  cast(P) { return P.people.filter(p => p.type === 'cast'); },
  crew(P) { return P.people.filter(p => p.type === 'crew'); },
  /** every character in the day's scenes */
  characters(ds, castOf) { const out = new Set(); ds.forEach(s => castOf(s).forEach(c => out.add(c))); return out; },
  /** one row per character in the day: the actor playing them (or null) and their cast number */
  castRows(P, ds, castOf) {
    const cast = CallSheetModel.cast(P);
    return [...CallSheetModel.characters(ds, castOf)].map(ch => {
      const i = cast.findIndex(p => CallSheetModel.norm(p.character) === ch);
      return { ch, person: i >= 0 ? cast[i] : null, num: i >= 0 ? i + 1 : null };
    });
  },
  /** a scene's cast as cast numbers where known, otherwise the character name */
  castNumbers(P, s, castOf) {
    const cast = CallSheetModel.cast(P);
    return [...castOf(s)].map(ch => { const i = cast.findIndex(p => CallSheetModel.norm(p.character) === ch); return i >= 0 ? i + 1 : ch; });
  },
  /** who to email: cast working that day plus all crew; and who has no address */
  recipients(P, ds, castOf) {
    const chars = CallSheetModel.characters(ds, castOf);
    const people = [...CallSheetModel.cast(P).filter(p => chars.has(CallSheetModel.norm(p.character))), ...CallSheetModel.crew(P)];
    return { emails: [...new Set(people.map(p => (p.email || '').trim()).filter(Boolean))], missing: people.filter(p => !(p.email || '').trim() && p.name).map(p => p.name) };
  },

  /* ---------- places and things ---------- */
  /** a scene's place: its linked location's name, else the place in its heading */
  placeOf(P, s) { const m = P.sceneMeta[s.id], L = m && m.locationId && P.locations.find(l => l.id === m.locationId); return (L && L.name) || s.location || ''; },
  /** the day's locations with address / notes from the matching location card */
  locations(P, ds) {
    return [...new Set(ds.map(s => CallSheetModel.placeOf(P, s)).filter(Boolean))].map(name => {
      const L = P.locations.find(l => l.name && name.toUpperCase().includes(l.name.toUpperCase()));
      return { name, details: L ? [L.address, L.notes].filter(Boolean).join(' — ') : '' };
    });
  },
  props(P, ds, numOf) {
    const ids = new Set(ds.map(s => s.id));
    return P.props.filter(x => x.sceneIds.some(i => ids.has(i))).map(x => ({ id: x.id, name: x.name, category: x.category, qty: x.qty, status: x.status,
      scenes: x.sceneIds.filter(i => ids.has(i)).map(numOf), notes: [x.storage, x.notes].filter(Boolean).join(' — ') }));
  },
  wardrobe(P, ds, numOf, charsIn) {
    const ids = new Set(ds.map(s => s.id));
    return P.wardrobe.filter(x => x.sceneIds.some(i => ids.has(i))).map(x => { const here = x.sceneIds.filter(i => ids.has(i));
      return { id: x.id, name: x.name, characters: [...new Set(here.flatMap(i => charsIn(x, i)))], look: x.look || '', qty: x.qty, status: x.status,
        scenes: here.map(numOf), notes: [x.size, x.care].filter(Boolean).join(' — ') }; });
  },

  /* ---------- the day ---------- */
  /** "CALL SHEET — Day 2 of 5", or "REHEARSAL CALL — …" for other kinds of day */
  heading(day, n, total) { return `${(day.kind && day.kind !== 'Shoot') ? day.kind.toUpperCase() + ' CALL' : 'CALL SHEET'} — Day ${n} of ${total}`; },
  /** a person's call times (an empty object if none yet; reading never adds one) */
  callFor(day, personId) { return (day.calls && day.calls[personId]) || {}; },

  /* ---------- changes (mutate the day) ---------- */
  setField(day, key, value) { if (!CallSheetModel.FIELDS.includes(key)) return false; day.cs = day.cs || {}; day.cs[key] = value == null ? '' : String(value); return true; },
  setCall(day, personId, key, value) {
    if (!CallSheetModel.CALL_FIELDS.includes(key) || !personId) return false;
    day.calls = day.calls || {}; const c = day.calls[personId] = day.calls[personId] || {};
    c[key] = value == null ? '' : String(value); return true;
  },
};
