'use strict';
/* ===================================================================
   Global contacts — MODEL. One address book shared by every
   production (Contacts.list). A contact can be cast, crew or both
   (kinds), hold several positions, and carry credits across
   productions. Filtering, adding, importing (JSON / CSV), copying a
   contact into a project and saving project people back.
   Pure: no DOM, no Store. See js/mvvm.js.
   =================================================================== */

const ContactsModel = (() => {
  const KINDS = ['cast', 'crew'];
  /** fields that belong to the production-specific entry, not to the person */
  const LOCAL_FIELDS = ['character', 'unavail', 'docs', 'contactId', 'type', 'role', 'dept', 'id', 'kinds', 'positions', 'credits'];
  const TABS = [['all', 'Everyone'], ['cast', 'Cast / talent'], ['crew', 'Crew'], ['both', 'Cast & crew']];
  const PICK_FILTERS = [['', 'Cast & crew'], ['cast', 'Cast / talent'], ['crew', 'Crew']];
  const kindLabel = k => k === 'cast' ? 'Cast' : 'Crew';
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const newPos = (kind, dept = '', role = '') => ({ id: newId(), kind, dept, role });

  /** older contacts had a single type; give every contact kinds, positions and credits */
  function normalize(c) {
    c.kinds = Array.isArray(c.kinds) && c.kinds.length ? c.kinds : [c.type || 'crew'];
    c.type = c.kinds.includes(c.type) ? c.type : c.kinds[0];
    if (!Array.isArray(c.positions)) c.positions = c.kinds.map(k => newPos(k, k === 'crew' ? (c.dept || '') : '', c.role || ''));
    if (!Array.isArray(c.credits)) c.credits = [];
    [...c.positions, ...c.credits].forEach(r => { if (r && !r.id) r.id = newId(); });   // rows are edited by id
    return c;
  }
  const kindsText = c => c.kinds.map(kindLabel).join(' + ');
  const positionFor = (c, kind) => (c.positions || []).find(p => p.kind === kind) || { kind, dept: '', role: '' };
  /** 'Cast + Crew · Gaffer · a@b · 555' */
  const line = c => [kindsText(c), c.positions.map(p => p.role || p.dept).filter(Boolean).join(' / '), c.email, c.phone].filter(Boolean).join(' · ');
  /** a contact card's lines → { name, sub, reach, kinds, credits: { text, title } | null } */
  const card = c => ({ name: c.name || '(no name)', sub: c.positions.map(p => p.role || p.dept).filter(Boolean).join(' · ') || kindsText(c), reach: [c.email, c.phone].filter(Boolean).join(' · '),
    kinds: c.kinds.map(kindLabel), credits: c.credits.length ? { text: `${c.credits.length} credit${c.credits.length > 1 ? 's' : ''}`, title: c.credits.map(x => `${x.production}${x.role ? ' — ' + x.role : ''}`).join('\n') } : null });
  /** the picker's credit line: '2 credits: A, B' (or null) */
  const creditsLine = c => c.credits.length ? `${c.credits.length} credit${c.credits.length > 1 ? 's' : ''}: ${c.credits.slice(-3).map(x => x.production).join(', ')}` : null;

  /* ---------- the list ---------- */
  const has = (c, q) => !q || JSON.stringify(Object.values(c)).toLowerCase().includes(q);
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  /** the Contacts page: tab 'all' | 'cast' | 'crew' | 'both' (cast and crew), q lower case → sorted */
  const visible = (list, tab, q) => list.filter(c => (tab === 'all' || (tab === 'both' ? c.kinds.length > 1 : c.kinds.includes(tab))) && has(c, q)).sort(byName);
  /** the import picker: filter '' | 'cast' | 'crew' → sorted */
  const pickable = (list, filter, q) => list.filter(c => (!filter || c.kinds.includes(filter)) && has(c, q)).sort(byName);

  /** a new contact of one kind, with one empty position (newPerson(kind) → a blank person) */
  function blank(kind, newPerson) {
    const c = normalize(Object.assign(newPerson(kind), { id: newId(), kinds: [kind], positions: [] }));
    c.positions = [newPos(kind)]; return c;
  }
  function remove(list, id) { const i = list.findIndex(c => c.id === id); if (i < 0) return false; list.splice(i, 1); return true; }
  const known = (list, c) => list.some(x => x.id === c.id || (x.name === c.name && (x.email || '') === (c.email || '')));

  /* ---------- import / export ---------- */
  /** contacts from a .json (an export, a full backup or a plain array) not already in the list → how many were added */
  function fromJson(list, d, newPerson) {
    const arr = d.contacts || (Array.isArray(d) ? d : []); let n = 0;
    arr.forEach(c => { if (c && c.name && !known(list, c)) { list.push(normalize(Object.assign(newPerson(c.type || 'crew'), c, { id: c.id || newId() }))); n++; } });
    return n;
  }
  /** contacts from CSV rows (first row: headers such as name, type, phone, email, department, role) → how many were added */
  function fromCsv(list, rows, newPerson) {
    const head = rows[0].map(x => x.trim().toLowerCase()), ix = k => head.indexOf(k); let n = 0;
    rows.slice(1).forEach(r => {
      const name = r[ix('name')] || ''; if (!name) return;
      const tp = (r[ix('type')] || '').toLowerCase(), kinds = /both|cast.*crew|crew.*cast/.test(tp) ? ['cast', 'crew'] : [tp === 'cast' ? 'cast' : 'crew'];
      const c = newPerson(kinds[0]);
      Object.assign(c, { id: newId(), name, phone: r[ix('phone')] || '', email: r[ix('email')] || '', agent: r[ix('agent')] || '', notes: r[ix('notes')] || '', kinds,
        positions: kinds.map(k => newPos(k, k === 'crew' ? (r[ix('department')] || r[ix('dept')] || '') : '', r[ix('role')] || r[ix('position')] || '')) });
      list.push(normalize(c)); n++;
    });
    return n;
  }
  const exportJson = list => JSON.stringify({ studiobindahh: 'contacts', contacts: list });

  /* ---------- contacts and projects ---------- */
  /** a project entry (cast or crew) built from a contact for the chosen kind and position */
  function personFrom(c, kind, over = {}) {
    normalize(c); const p = JSON.parse(JSON.stringify(c)), pos = positionFor(c, kind);
    ['kinds', 'positions', 'credits'].forEach(k => delete p[k]);
    Object.assign(p, { id: newId(), contactId: c.id, type: kind, docs: {}, character: '', unavail: '', dept: kind === 'crew' ? (over.dept ?? pos.dept ?? '') : '', role: over.role ?? pos.role ?? '' });
    return p;
  }
  const inProject = (P, c, kind) => P.people.some(p => p.contactId === c.id && (!kind || p.type === kind));
  /**
   * Add or update contacts from project people (matched by link, else by name and email); records the
   * production P (if given) as a credit, and links each person to their contact → { added, updated }
   */
  function saveFrom(list, people, P, year) {
    let added = 0, updated = 0;
    people.filter(p => (p.name || '').trim()).forEach(p => {
      let c = list.find(x => (p.contactId && x.id === p.contactId) || ((x.name || '').trim().toLowerCase() === p.name.trim().toLowerCase() && (x.email || '') === (p.email || '')));
      const isNew = !c; if (isNew) { c = { id: newId(), kinds: [], positions: [], credits: [], type: p.type }; list.push(c); }
      normalize(c);
      const shared = JSON.parse(JSON.stringify(p)); LOCAL_FIELDS.forEach(k => delete shared[k]); Object.assign(c, shared);
      if (!c.kinds.includes(p.type)) c.kinds.push(p.type);
      let pos = c.positions.find(x => x.kind === p.type); if (!pos) { pos = newPos(p.type); c.positions.push(pos); }
      if (p.type === 'crew') { if (p.dept) pos.dept = p.dept; } if (p.role) pos.role = p.role;
      if (P) {
        const key = P.id + ':' + p.type, role = p.type === 'cast' ? (p.character || p.role || '') : [p.dept, p.role].filter(Boolean).join(' — ');
        let cr = c.credits.find(x => x.key === key); if (!cr) { cr = { id: newId(), key, production: P.title, kind: p.type, role: '', year: String(year), notes: '' }; c.credits.push(cr); }
        cr.production = P.title; cr.role = role || cr.role;
      }
      p.contactId = c.id; isNew ? added++ : updated++;
    });
    return { added, updated };
  }

  /* ---------- roles & credits ---------- */
  /** turn cast or crew on or off → false when it would leave the contact with neither */
  function setKind(c, k, on) {
    normalize(c);
    if (on) { if (!c.kinds.includes(k)) c.kinds.push(k); if (!c.positions.some(p => p.kind === k)) c.positions.push(newPos(k)); }
    else if (c.kinds.length > 1) c.kinds = c.kinds.filter(x => x !== k);
    else if (c.kinds.includes(k)) return false;
    c.type = c.kinds.includes(c.type) ? c.type : c.kinds[0];
    return true;
  }
  const addPosition = c => { const p = newPos(c.kinds[0]); c.positions.push(p); return p; };
  const addCredit = c => { const x = { id: newId(), production: '', kind: c.kinds[0], role: '', year: '', notes: '' }; c.credits.push(x); return x; };
  /** change a position (kind, dept, role) or a credit (production, kind, role, year) */
  function setRow(c, list, id, k, v) {
    const ok = { positions: ['kind', 'dept', 'role'], credits: ['production', 'kind', 'role', 'year'] }[list];
    const x = ok && (c[list] || []).find(r => r.id === id); if (!x || !ok.includes(k)) return false;
    x[k] = k === 'kind' ? (KINDS.includes(v) ? v : x.kind) : String(v ?? ''); return true;
  }
  function removeRow(c, list, id) { const n = (c[list] || []).length; c[list] = (c[list] || []).filter(r => r.id !== id); return c[list].length < n; }

  return { KINDS, LOCAL_FIELDS, TABS, PICK_FILTERS, kindLabel, plural, normalize, kindsText, positionFor, line, card, creditsLine, visible, pickable, blank, remove,
    fromJson, fromCsv, exportJson, personFrom, inProject, saveFrom, setKind, addPosition, addCredit, setRow, removeRow };
})();
