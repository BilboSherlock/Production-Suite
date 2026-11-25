'use strict';
/* ===================================================================
   Cast & Crew — MODEL
   People on the project (P.people): actors and crew, each with a full
   profile, paperwork checklist and deal. The same profile shape is used
   by the global Contacts list. Pure functions: no DOM, no Store, no UI
   state. See js/mvvm.js.
   =================================================================== */

const PeopleModel = (() => {
  const DEPTS = ['Direction', 'Production', 'Camera', 'Grip', 'Electric', 'Art', 'Wardrobe', 'Hair & Makeup', 'Sound', 'Stunts', 'Post', 'Stage Management', 'Lighting', 'Photography', 'Digital tech', 'Styling', 'Retouching', 'Studio', 'Client', 'Other'];
  const UNIONS = ['', 'SAG-AFTRA', 'Equity', 'ACTRA', 'IATSE', 'DGA', 'WGA', 'Non-union', 'Other'];
  const DOC_LIST = [['contract', 'Contract signed'], ['eligibility', 'ID / work eligibility'], ['release', 'Release / consent'], ['nda', 'NDA signed'], ['insurance', 'Insurance / medical']];
  const RATE_UNITS = ['Day', 'Week', 'Hour', 'Flat'];
  const TYPES = ['cast', 'crew'];
  /** the list columns per tab: [field, heading, placeholder] */
  const COLS = {
    cast: [['name', 'Actor', 'Full name'], ['character', 'Character', 'CHARACTER'], ['phone', 'Phone', ''], ['email', 'Email', ''], ['agent', 'Agent / rep', '']],
    crew: [['name', 'Name', 'Full name'], ['dept', 'Department', ''], ['role', 'Position', 'e.g. Gaffer'], ['phone', 'Phone', ''], ['email', 'Email', '']],
  };
  /** a character name as the script writes it: "Margot (V.O.)" → "MARGOT" */
  const charKey = t => String(t || '').toUpperCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\^/g, '').trim();

  const newPerson = (type, o = {}) => Object.assign({ id: newId(), type: TYPES.includes(type) ? type : 'crew', name: '', character: '', dept: '', role: '', phone: '', email: '', agent: '', notes: '', unavail: '', photo: '', docs: {} }, o);
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const docsDone = p => DOC_LIST.filter(([k]) => (p.docs || {})[k]).length;
  /** what a card shows under the name */
  const subtitle = p => p.type === 'cast' ? (p.character || 'Cast') : [p.role, p.dept].filter(Boolean).join(' · ') || 'Crew';
  const displayName = p => p.name || p.character || '';

  /** the profile's field groups: [title, [[field, label, { type, area, list, select }]]].
      contact: the global contacts version (cast and/or crew, no character or availability) */
  function sections(p, contact) {
    const kinds = p.kinds || [p.type], cast = contact ? kinds.includes('cast') : p.type === 'cast', crewToo = contact && kinds.includes('crew');
    const S = [];
    S.push(['Identity', [
      ['name', 'Full name'], ...(contact ? [] : [cast ? ['character', 'Character'] : ['dept', 'Department', { list: 'dl-dept' }], cast ? ['role', 'Type / billing'] : ['role', 'Position']]),
      ['pronouns', 'Pronouns'], ['dob', 'Date of birth', { type: 'date' }], ['union', 'Union / guild', { list: 'dl-union' }]]]);
    S.push(['Contact', [['email', 'Email', { type: 'email' }], ['phone', 'Phone', { type: 'tel' }], ['address', 'Address', { area: true }], ['website', 'Website / social']]]);
    S.push(['Representation', [['agent', 'Agent / rep'], ['agency', 'Agency'], ['agentPhone', 'Agent phone / email']]]);
    S.push(['Emergency contact', [['emName', 'Name'], ['emRelation', 'Relationship'], ['emPhone', 'Phone', { type: 'tel' }]]]);
    if (contact && cast && crewToo) S.push(['Skills & kit', [['skills', 'Skills & certifications', { area: true }], ['kit', 'Own equipment / kit', { area: true }]]]);
    S.push([cast ? 'Wardrobe & personal' : 'Skills & kit', cast
      ? [['height', 'Height'], ['sizes', 'Sizes (shirt, trousers, shoes…)', { area: true }], ['dietary', 'Dietary / allergies', { area: true }], ['skills', 'Special skills & languages', { area: true }]]
      : [['skills', 'Skills & certifications', { area: true }], ['kit', 'Own equipment / kit', { area: true }], ['dietary', 'Dietary / allergies', { area: true }]]]);
    S.push(['Deal', [['rate', 'Rate'], ['rateUnit', 'Per', { select: RATE_UNITS }], ['dealNotes', 'Deal notes', { area: true }]]]);
    if (!contact) S.push(['Availability', [['unavail', 'Unavailable dates (YYYY-MM-DD, ranges with ..)', { area: true }]]]);
    return S;
  }
  /** every field a profile can edit */
  const FIELDS = new Set(['notes', 'photo', ...sections({ type: 'cast' }).concat(sections({ type: 'crew' })).flatMap(([, fs]) => fs.map(f => f[0]))]);

  /* ---------- editing ---------- */
  /** set one field. Character names are kept in capitals, like the script. → the stored value, or false */
  function update(p, k, v) {
    if (!FIELDS.has(k)) return false;
    v = String(v ?? '');
    if (k === 'character') v = v.toUpperCase();
    if (k === 'rateUnit' && !RATE_UNITS.includes(v)) return false;
    p[k] = v; return v;
  }
  function setDoc(p, k, on) { if (!DOC_LIST.some(d => d[0] === k)) return false; (p.docs = p.docs || {})[k] = !!on; return true; }
  const find = (P, id) => (P.people || []).find(p => p.id === id) || null;
  function add(P, type, o) { const p = newPerson(type, o); (P.people = P.people || []).push(p); return p; }
  function remove(P, id) { const n = (P.people || []).length; P.people = (P.people || []).filter(p => p.id !== id); return P.people.length < n; }
  /** does removing need a confirmation? (not for a row nobody has filled in) */
  const isBlank = p => !p.name && !p.character;
  /** add a cast row for every script character not listed yet, most lines first.
      chars: [[name, lineCount]] → how many were added */
  function addCharacters(P, chars) {
    const have = new Set((P.people || []).filter(p => p.type === 'cast').map(p => charKey(p.character)));
    const add_ = [...chars].sort((a, b) => b[1] - a[1]).map(c => charKey(c[0])).filter(c => c && !have.has(c) && have.add(c));
    add_.forEach(c => add(P, 'cast', { character: c }));
    return add_.length;
  }

  /* ---------- lists ---------- */
  const ofType = (P, type) => (P.people || []).filter(p => p.type === type);
  /** search anywhere in the profile */
  function filter(list, q) { q = String(q || '').trim().toLowerCase(); return q ? list.filter(p => JSON.stringify(Object.values(p)).toLowerCase().includes(q)) : list; }
  /** tab labels: people per type and open casting roles */
  const counts = P => ({ cast: ofType(P, 'cast').length, crew: ofType(P, 'crew').length, casting: ((P.casting || {}).roles || []).filter(r => !r.castId).length });
  /** cast actor for a script character */
  const castFor = (P, ch) => (P.people || []).find(p => p.type === 'cast' && charKey(p.character) === charKey(ch)) || null;

  const CSV_EXTRA = ['Union', 'Rate', 'Address', 'Emergency contact', 'Dietary'];
  function csvRows(type, list) {
    const cols = COLS[type];
    return [[...cols.map(c => c[1]), ...CSV_EXTRA], ...list.map(p => [...cols.map(c => p[c[0]] || ''), p.union || '', p.rate ? `${p.rate}/${p.rateUnit || 'Day'}` : '', p.address || '', [p.emName, p.emPhone].filter(Boolean).join(' '), p.dietary || ''])];
  }
  const printRows = (type, list) => ({ title: type === 'cast' ? 'Cast list' : 'Crew list', head: COLS[type].map(c => c[1]), rows: list.map(p => COLS[type].map(c => p[c[0]] || '')) });
  /** a printable profile: [{ grp }] headings and [label, value] rows */
  function profileRows(p) {
    const rows = [];
    sections(p).forEach(([t, fs]) => { rows.push({ grp: t }); fs.forEach(([k, l]) => { if (p[k]) rows.push([l, String(p[k])]); }); });
    rows.push({ grp: 'Paperwork' }); DOC_LIST.forEach(([k, l]) => rows.push([l, (p.docs || {})[k] ? '✓ Complete' : 'Outstanding']));
    if (p.notes) { rows.push({ grp: 'Notes' }); rows.push(['', p.notes]); }
    return rows;
  }

  /* ---------- where an actor appears ---------- */
  /** the scenes and shoot days a cast member's character is in.
      scenes: the app's scenes; castOf(scene) → names in it */
  function appearances(P, p, scenes, castOf) {
    if (p.type !== 'cast' || !p.character) return null;
    const ch = charKey(p.character), mine = scenes.filter(s => castOf(s).includes(ch));
    const days = (P.days || []).map((d, i) => ({ d, n: i + 1 })).filter(x => mine.some(s => (x.d.sceneIds || []).includes(s.id))).map(x => ({ n: x.n, date: x.d.date || '' }));
    return { scenes: mine.map(s => s.num), days };
  }
  /** wardrobe the character wears, with the scenes they wear each piece in */
  function wardrobe(P, p, scenes) {
    if (p.type !== 'cast' || !p.character) return [];
    const ch = charKey(p.character), num = new Map(scenes.map(s => [s.id, s.num]));
    return (P.wardrobe || []).filter(w => ItemsModel.allChars(w).includes(ch))
      .map(w => ({ item: w, scenes: w.sceneIds.filter(id => ItemsModel.charsIn(w, id).includes(ch)).map(id => num.get(id)).filter(Boolean) }));
  }

  return {
    DEPTS, UNIONS, DOC_LIST, RATE_UNITS, TYPES, COLS, FIELDS, charKey,
    newPerson, initials, docsDone, subtitle, displayName, sections,
    update, setDoc, find, add, remove, isBlank, addCharacters,
    ofType, filter, counts, castFor, csvRows, printRows, profileRows, appearances, wardrobe,
  };
})();
