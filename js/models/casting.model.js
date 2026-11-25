'use strict';
/* ===================================================================
   Casting — MODEL
   Roles (P.casting.roles), each with candidates who move through
   considering → audition → callback → offered → cast (or passed).
   Casting an actor fills the role and puts them in Cast & Crew.
   Pure functions: no DOM, no Store, no UI state. See js/mvvm.js.
   =================================================================== */

const CastingModel = (() => {
  const STATUS = [['considering', 'Considering'], ['audition', 'Audition'], ['callback', 'Callback'], ['offered', 'Offered'], ['cast', 'Cast'], ['passed', 'Passed']];
  const statusLabel = k => (STATUS.find(s => s[0] === k) || [0, k])[1];
  const charKey = t => PeopleModel.charKey(t);

  const newRole = (name = '') => ({ id: newId(), name, age: '', desc: '', notes: '', castId: '', candidates: [] });
  const newCandidate = (o = {}) => Object.assign({ id: newId(), name: '', contact: '', photo: '', rating: 0, status: 'considering', date: '', notes: '' }, o);
  /** the casting record, created when missing */
  const ensure = P => { P.casting = P.casting || {}; P.casting.roles = P.casting.roles || []; return P.casting; };
  const roles = P => ((P.casting || {}).roles) || [];
  const role = (P, id) => roles(P).find(r => r.id === id) || null;
  const castOf = r => r.candidates.find(c => c.id === r.castId) || null;

  /** how far a role has got: { key, label } (key: cast, offered, callback, audition, considering, open) */
  function state(r) {
    if (r.castId) { const c = castOf(r); return { key: 'cast', label: c && c.name ? 'Cast: ' + c.name : 'Cast' }; }
    for (const k of ['offered', 'callback', 'audition']) if (r.candidates.some(c => c.status === k)) return { key: k, label: statusLabel(k) };
    return r.candidates.length ? { key: 'considering', label: r.candidates.length + ' considered' } : { key: 'open', label: 'Open' };
  }
  const progress = P => { const l = roles(P), done = l.filter(r => r.castId).length; return { done, total: l.length, open: l.length - done, pct: l.length ? done / l.length * 100 : 0 }; };
  /** statuses a candidate's menu offers ("Cast" only for the one cast) */
  const statusChoices = (r, c) => STATUS.filter(s => s[0] !== 'cast' || r.castId === c.id);

  /* ---------- roles ---------- */
  function addRole(P, name) { const r = newRole(name); ensure(P).roles.push(r); return r; }
  const ROLE_FIELDS = ['name', 'age', 'desc', 'notes'];
  function updateRole(r, k, v) { if (!ROLE_FIELDS.includes(k)) return false; r[k] = String(v ?? ''); return true; }
  function removeRole(P, id) { const C = ensure(P), n = C.roles.length; C.roles = C.roles.filter(r => r.id !== id); return C.roles.length < n; }
  /** a role for every script character that has none, most lines first. chars: [[name, lines]] → how many added */
  function rolesFromScript(P, chars) {
    const have = new Set(roles(P).map(r => charKey(r.name)));
    const add = [...chars].sort((a, b) => b[1] - a[1]).map(c => charKey(c[0])).filter(c => c && !have.has(c) && have.add(c));
    add.forEach(c => addRole(P, c));
    return add.length;
  }

  /* ---------- candidates ---------- */
  function addCandidate(r, o) { const c = newCandidate(o); r.candidates.push(c); return c; }
  const findCand = (r, id) => r.candidates.find(c => c.id === id) || null;
  const CAND_FIELDS = ['name', 'contact', 'date', 'notes', 'photo'];
  function updateCandidate(c, k, v) {
    if (k === 'rating') { c.rating = Math.max(0, Math.min(5, Math.round(+v) || 0)); return true; }
    if (!CAND_FIELDS.includes(k)) return false; c[k] = String(v ?? ''); return true;
  }
  /** star rating: clicking the current rating clears it */
  function rate(c, n) { c.rating = c.rating === n ? 0 : Math.max(0, Math.min(5, n)); return true; }
  /** change status; "cast" only through cast() */
  function setStatus(r, c, s) { if (!STATUS.some(x => x[0] === s) || (s === 'cast' && r.castId !== c.id)) return false; if (r.castId === c.id && s !== 'cast') r.castId = ''; c.status = s; return true; }
  function removeCandidate(r, id) { const n = r.candidates.length; r.candidates = r.candidates.filter(c => c.id !== id); if (r.castId === id) r.castId = ''; return r.candidates.length < n; }

  /** cast an actor: fill the role, and put them in Cast & Crew as the character (created when missing).
      An actor cast before them goes back to "offered". → the cast person */
  function cast(P, r, c) {
    const prev = castOf(r); if (prev && prev !== c) prev.status = 'offered';
    r.castId = c.id; c.status = 'cast';
    const ch = charKey(r.name);
    let person = (P.people || []).find(p => p.type === 'cast' && ch && charKey(p.character) === ch);
    if (!person) person = PeopleModel.add(P, 'cast', { character: String(r.name || '').toUpperCase() });
    person.name = c.name; if (c.photo && !person.photo) person.photo = c.photo;
    if (/@/.test(c.contact)) person.email = c.contact; else if (/\d{5,}/.test(c.contact)) person.phone = c.contact;
    return person;
  }
  /** reopen a cast role; the actor goes back to "offered" */
  function reopen(r) { const c = castOf(r); if (!r.castId) return false; r.castId = ''; if (c) c.status = 'offered'; return true; }

  /* ---------- the casting sheet ---------- */
  const SHEET_HEAD = ['Role', 'Age', 'Description', 'Status', 'Cast', 'Shortlist'];
  const sheetRows = P => roles(P).map(r => {
    const c = castOf(r);
    return [r.name, r.age, r.desc, state(r).label, c ? c.name : '', r.candidates.filter(x => x.id !== r.castId && x.status !== 'passed').map(x => `${x.name} (${statusLabel(x.status)}${x.rating ? ', ' + '★'.repeat(x.rating) : ''})`).join('; ')];
  });

  return {
    STATUS, statusLabel, newRole, newCandidate, ensure, roles, role, castOf, state, progress, statusChoices,
    addRole, ROLE_FIELDS, updateRole, removeRole, rolesFromScript,
    addCandidate, findCand, CAND_FIELDS, updateCandidate, rate, setStatus, removeCandidate, cast, reopen,
    SHEET_HEAD, sheetRows,
  };
})();
