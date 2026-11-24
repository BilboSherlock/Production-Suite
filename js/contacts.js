'use strict';
/* ===================================================================
   Global contacts — one address book of people, shared by every
   production. A person can be cast, crew or both, hold several
   positions, and carry a history of credits across productions.
   =================================================================== */
const Contacts = {
  list: [],
  async load() {
    try { const v = await DB.getMeta('contacts'); if (Array.isArray(v)) Contacts.list = v; } catch (e) { try { Contacts.list = JSON.parse(localStorage.getItem('sb-contacts') || '[]'); } catch (x) { } }
    Contacts.list.forEach(contactNormalize);
  },
  async save() { try { await DB.setMeta('contacts', Contacts.list); } catch (e) { try { localStorage.setItem('sb-contacts', JSON.stringify(Contacts.list)); } catch (x) { toast('Could not save contacts', true); } } },
};
/* older contacts had a single type; give every contact kinds, positions and credits */
function contactNormalize(c) {
  c.kinds = Array.isArray(c.kinds) && c.kinds.length ? c.kinds : [c.type || 'crew'];
  c.type = c.kinds.includes(c.type) ? c.type : c.kinds[0];
  if (!Array.isArray(c.positions)) c.positions = c.kinds.map(k => ({ id: uid(), kind: k, dept: k === 'crew' ? (c.dept || '') : '', role: c.role || '' }));
  if (!Array.isArray(c.credits)) c.credits = [];
  return c;
}
const kindsText = c => c.kinds.map(k => k === 'cast' ? 'Cast' : 'Crew').join(' + ');
const positionFor = (c, kind) => (c.positions || []).find(p => p.kind === kind) || { kind, dept: '', role: '' };
/* fields that belong to the production-specific entry, not to the person */
const LOCAL_FIELDS = ['character', 'unavail', 'docs', 'contactId', 'type', 'role', 'dept', 'id', 'kinds', 'positions', 'credits'];

/* a project entry (cast or crew) built from a contact for the chosen kind and position */
function personFromContact(c, kind, over = {}) {
  contactNormalize(c); const p = JSON.parse(JSON.stringify(c)), pos = positionFor(c, kind);
  ['kinds', 'positions', 'credits'].forEach(k => delete p[k]);
  Object.assign(p, { id: uid(), contactId: c.id, type: kind, docs: {}, character: '', unavail: '', dept: kind === 'crew' ? (over.dept ?? pos.dept ?? '') : '', role: over.role ?? pos.role ?? '' });
  return p;
}
const inProject = (P, c, kind) => P.people.some(p => p.contactId === c.id && (!kind || p.type === kind));
/* add or update contacts from project people; also records this production as a credit */
async function saveToContacts(people, P = Store.P) {
  let added = 0, updated = 0; const year = new Date().getFullYear();
  people.filter(p => (p.name || '').trim()).forEach(p => {
    let c = Contacts.list.find(x => (p.contactId && x.id === p.contactId) || ((x.name || '').trim().toLowerCase() === p.name.trim().toLowerCase() && (x.email || '') === (p.email || '')));
    const isNew = !c; if (isNew) { c = { id: uid(), kinds: [], positions: [], credits: [], type: p.type }; Contacts.list.push(c); }
    contactNormalize(c);
    const shared = JSON.parse(JSON.stringify(p)); LOCAL_FIELDS.forEach(k => delete shared[k]); Object.assign(c, shared);
    if (!c.kinds.includes(p.type)) c.kinds.push(p.type);
    let pos = c.positions.find(x => x.kind === p.type); if (!pos) { pos = { id: uid(), kind: p.type, dept: '', role: '' }; c.positions.push(pos); }
    if (p.type === 'crew') { if (p.dept) pos.dept = p.dept; } if (p.role) pos.role = p.role;
    if (P) { const key = P.id + ':' + p.type, role = p.type === 'cast' ? (p.character || p.role || '') : [p.dept, p.role].filter(Boolean).join(' — ');
      let cr = c.credits.find(x => x.key === key); if (!cr) { cr = { id: uid(), key, production: P.title, kind: p.type, role: '', year: String(year), notes: '' }; c.credits.push(cr); } cr.production = P.title; cr.role = role || cr.role; }
    p.contactId = c.id; isNew ? added++ : updated++;
  });
  await Contacts.save(); return { added, updated };
}
const contactLine = c => [kindsText(c), c.positions.map(p => p.role || p.dept).filter(Boolean).join(' / '), c.email, c.phone].filter(Boolean).join(' · ');

/* pick contacts and copy them into the open project (choosing cast or crew, and the position) */
function importContactsModal(P, type, onDone) {
  const choice = new Map(), picked = new Set(); let q = '', filter = type || '';
  const list = h('div', { class: 'ct-list' }), count = h('span', { class: 'small muted' });
  const search = h('input', { class: 'inp', placeholder: 'Search contacts…', oninput: e => { q = e.target.value.toLowerCase(); draw(); } });
  const tabSel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { filter = e.target.value; draw(); } }, [['', 'Cast & crew'], ['cast', 'Cast / talent'], ['crew', 'Crew']].map(([k, l]) => h('option', { value: k, selected: k === filter }, l)));
  const pickOf = c => { let o = choice.get(c.id); if (!o) { const kind = filter && c.kinds.includes(filter) ? filter : c.kinds[0]; o = { kind, role: positionFor(c, kind).role || '' }; choice.set(c.id, o); } return o; };
  function draw() {
    list.replaceChildren();
    const rows = Contacts.list.filter(c => (!filter || c.kinds.includes(filter)) && (!q || JSON.stringify(Object.values(c)).toLowerCase().includes(q))).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!Contacts.list.length) list.append(h('div', { class: 'empty' }, h('p', {}, 'Your contacts list is empty. Open Contacts from the home screen, or use “Save to contacts” on a project’s Cast & crew page.')));
    rows.forEach(c => {
      const pk = pickOf(c), have = inProject(P, c, pk.kind), on = picked.has(c.id);
      const kindSel = c.kinds.length > 1 ? h('select', { class: 'cell', style: { width: '96px' }, onchange: e => { pk.kind = e.target.value; pk.role = positionFor(c, pk.kind).role || ''; picked.delete(c.id); draw(); } }, c.kinds.map(k => h('option', { value: k, selected: k === pk.kind }, k === 'cast' ? 'as Cast' : 'as Crew'))) : h('span', { class: 'pill' }, pk.kind === 'cast' ? 'Cast' : 'Crew');
      list.append(h('div', { class: 'ct-row' + (have ? ' dim' : '') }, h('input', { type: 'checkbox', disabled: have, checked: on, onchange: e => { e.target.checked ? picked.add(c.id) : picked.delete(c.id); count.textContent = `${picked.size} selected`; draw(); } }),
        avatar(c, 34), h('div', { style: { flex: 1, minWidth: 0 } }, h('b', {}, c.name || '(no name)'), h('div', { class: 'small muted clip' }, contactLine(c)), c.credits.length ? h('div', { class: 'small muted clip' }, `${c.credits.length} credit${c.credits.length > 1 ? 's' : ''}: ${c.credits.slice(-3).map(x => x.production).join(', ')}`) : null),
        on ? h('input', { class: 'cell', placeholder: pk.kind === 'crew' ? 'Position' : 'Billing / type', value: pk.role, style: { width: '150px' }, oninput: e => { pk.role = e.target.value; } }) : null, kindSel, have ? h('span', { class: 'small muted' }, `in project as ${pk.kind}`) : null));
    });
    count.textContent = `${picked.size} selected`;
  }
  modal({ title: 'Import from contacts', wide: true, body: h('div', {}, h('div', { class: 'row', style: { marginBottom: '10px' } }, search, tabSel, h('span', { class: 'grow' }), count), list),
    buttons: [{ label: 'Cancel' }, { label: 'Import selected', primary: true, onClick: () => {
      if (!picked.size) { toast('Select at least one contact.', true); return false; }
      picked.forEach(id => { const c = Contacts.list.find(x => x.id === id), pk = choice.get(id); if (c && pk) P.people.push(personFromContact(c, pk.kind, { role: pk.role })); });
      Store.touch(); toast(`Imported ${picked.size} contact${picked.size > 1 ? 's' : ''}`); onDone && onDone();
    } }] });
  draw();
}

/* ---------- roles & credits editor (shown inside a contact's profile) ---------- */
/* edits update this section in place (no closing and reopening the dialog); onKinds is told when cast / crew changes */
function contactRolesSection(c, onKinds) {
  const wrap = h('div');
  const redraw = () => wrap.replaceChildren(build());
  const kindsChanged = () => { redraw(); onKinds && onKinds(); };
  redraw();
  return wrap;
  function build() {
  contactNormalize(c);
  const kindBox = (k, l) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: c.kinds.includes(k), onchange: e => { if (e.target.checked) { if (!c.kinds.includes(k)) c.kinds.push(k); if (!c.positions.some(p => p.kind === k)) c.positions.push({ id: uid(), kind: k, dept: '', role: '' }); } else if (c.kinds.length > 1) c.kinds = c.kinds.filter(x => x !== k); else { e.target.checked = true; toast('A contact needs at least one of cast or crew.', true); } c.type = c.kinds.includes(c.type) ? c.type : c.kinds[0]; kindsChanged(); } }), l);
  const posRows = c.positions.map(p => h('tr', {}, h('td', { style: { width: '110px' } }, h('select', { class: 'cell', onchange: e => { p.kind = e.target.value; } }, [['cast', 'Cast'], ['crew', 'Crew']].map(([k, l]) => h('option', { value: k, selected: k === p.kind }, l)))),
    h('td', {}, h('input', { class: 'cell', list: 'dl-dept', value: p.dept || '', placeholder: 'Department (crew)', oninput: e => { p.dept = e.target.value; } })), h('td', {}, h('input', { class: 'cell', value: p.role || '', placeholder: 'Position / billing', oninput: e => { p.role = e.target.value; } })),
    h('td', { style: { width: '40px' } }, ibtn('trash', 'Remove position', () => { c.positions = c.positions.filter(x => x !== p); redraw(); }, 'danger'))));
  const crRows = c.credits.map(x => h('tr', {}, h('td', {}, h('input', { class: 'cell', value: x.production || '', placeholder: 'Production', oninput: e => { x.production = e.target.value; } })), h('td', { style: { width: '100px' } }, h('select', { class: 'cell', onchange: e => { x.kind = e.target.value; } }, [['cast', 'Cast'], ['crew', 'Crew']].map(([k, l]) => h('option', { value: k, selected: k === x.kind }, l)))),
    h('td', {}, h('input', { class: 'cell', value: x.role || '', placeholder: 'Role / character', oninput: e => { x.role = e.target.value; } })), h('td', { style: { width: '80px' } }, h('input', { class: 'cell', value: x.year || '', placeholder: 'Year', oninput: e => { x.year = e.target.value; } })),
    h('td', { style: { width: '40px' } }, ibtn('trash', 'Remove credit', () => { c.credits = c.credits.filter(z => z !== x); redraw(); }, 'danger'))));
  return h('div', { class: 'pf-sec' }, h('h4', {}, 'Roles & credits'), h('div', { class: 'row', style: { gap: '18px', marginBottom: '8px' } }, h('span', { class: 'small muted' }, 'This person works as'), kindBox('cast', 'Cast / talent'), kindBox('crew', 'Crew')),
    h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Works as', 'Department', 'Position / billing', ''].map(x => h('th', {}, x)))), h('tbody', {}, posRows)),
    h('button', { class: 'btn sm', style: { margin: '6px 0 14px' }, onclick: () => { c.positions.push({ id: uid(), kind: c.kinds[0], dept: '', role: '' }); redraw(); } }, icon('plus', 13), 'Add another position'),
    h('div', { class: 'small muted', style: { margin: '6px 0' } }, 'Credits — productions this person has worked on, and in what role. Added automatically when you save a project’s people to contacts.'),
    c.credits.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Production', 'As', 'Role / character', 'Year', ''].map(x => h('th', {}, x)))), h('tbody', {}, crRows)) : null,
    h('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: () => { c.credits.push({ id: uid(), production: '', kind: c.kinds[0], role: '', year: '', notes: '' }); redraw(); } }, icon('plus', 13), 'Add credit'));
  }
}

/* ---------- the Contacts page (home level) ---------- */
function renderContacts() {
  const app = $('#app'); app.innerHTML = ''; app.style.display = 'block'; app.style.overflow = 'auto';
  let tab = UI.ctTab || 'all', q = '';
  const body = h('div'), count = h('span', { class: 'small muted' });
  const search = h('input', { class: 'inp', placeholder: 'Search name, role, email, production…', style: { width: '280px' }, oninput: e => { q = e.target.value.toLowerCase(); draw(); } });
  const seg = h('div', { class: 'seg' }, [['all', 'Everyone'], ['cast', 'Cast / talent'], ['crew', 'Crew'], ['both', 'Cast & crew']].map(([k, l]) => h('button', { 'data-k': k, class: tab === k ? 'on' : '', onclick: () => { tab = UI.ctTab = k; [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); draw(); } }, l)));
  const edit = c => { openProfile(c, async () => { contactNormalize(c); await Contacts.save(); draw(); }, { contact: true }); };
  const add = kind => { const c = contactNormalize(Object.assign(newPerson(kind), { id: uid(), kinds: [kind], positions: [] })); c.positions = [{ id: uid(), kind, dept: '', role: '' }]; Contacts.list.push(c); Contacts.save(); draw(); edit(c); };
  const match = c => (tab === 'all' || (tab === 'both' ? c.kinds.length > 1 : c.kinds.includes(tab))) && (!q || JSON.stringify(Object.values(c)).toLowerCase().includes(q));
  /* redrawn in place, cards matched by id, so switching Everyone / Cast / Crew or searching never flashes */
  function draw() {
    const rows = Contacts.list.filter(match).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    count.textContent = `${rows.length} of ${Contacts.list.length}`;
    morph(body, rows.length ? h('div', { class: 'people-grid' }, rows.map(card))
      : Contacts.list.length ? h('div', { class: 'empty' }, h('h3', {}, 'Nobody matches'), h('p', {}, 'Try another filter or search.'))
      : h('div', { class: 'empty' }, h('h3', {}, 'No contacts yet'), h('p', {}, 'Add the people you work with again and again, then import them into any project in one click.')));
  }
  function card(c) {
    return h('div', { class: 'pcardp', 'data-key': c.id, tabindex: 0, onclick: () => edit(c), onkeydown: e => { if (e.key === 'Enter') edit(c); } },
      avatar(c, 56), h('div', { class: 'pc-name' }, c.name || '(no name)'), h('div', { class: 'small muted' }, c.positions.map(p => p.role || p.dept).filter(Boolean).join(' · ') || kindsText(c)), h('div', { class: 'small muted clip' }, [c.email, c.phone].filter(Boolean).join(' · ')),
      h('div', { class: 'row', style: { marginTop: '6px', flexWrap: 'wrap', gap: '4px' } }, c.kinds.map(k => h('span', { class: 'pill' }, k === 'cast' ? 'Cast' : 'Crew')), c.credits.length ? h('span', { class: 'pill', title: c.credits.map(x => `${x.production}${x.role ? ' — ' + x.role : ''}`).join('\n') }, `${c.credits.length} credit${c.credits.length > 1 ? 's' : ''}`) : null, h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn danger', title: 'Delete contact', onclick: async e => { e.stopPropagation(); if (await confirmBox(`Delete ${c.name || 'this contact'} from your contacts? Projects that already imported them keep their copy.`)) { Contacts.list = Contacts.list.filter(x => x !== c); await Contacts.save(); draw(); } } }, icon('trash', 15))));
  }
  async function importFile() {
    const f = (await pickFiles('.json,.csv'))[0]; if (!f) return; const t = await readText(f);
    try {
      if (/\.json$/i.test(f.name)) { const d = JSON.parse(t), arr = d.contacts || (Array.isArray(d) ? d : []); let n = 0; arr.forEach(c => { if (c && c.name && !Contacts.list.some(x => x.id === c.id || (x.name === c.name && (x.email || '') === (c.email || '')))) { Contacts.list.push(contactNormalize(Object.assign(newPerson(c.type || 'crew'), c, { id: c.id || uid() }))); n++; } }); toast(`Imported ${n} contact${n === 1 ? '' : 's'}`); }
      else { const rows = parseCSV(t), head = rows[0].map(x => x.trim().toLowerCase()), ix = k => head.indexOf(k); let n = 0;
        rows.slice(1).forEach(r => { const name = r[ix('name')] || ''; if (!name) return; const tp = (r[ix('type')] || '').toLowerCase(), kinds = /both|cast.*crew|crew.*cast/.test(tp) ? ['cast', 'crew'] : [tp === 'cast' ? 'cast' : 'crew']; const c = newPerson(kinds[0]); Object.assign(c, { id: uid(), name, phone: r[ix('phone')] || '', email: r[ix('email')] || '', agent: r[ix('agent')] || '', notes: r[ix('notes')] || '', kinds, positions: kinds.map(k => ({ id: uid(), kind: k, dept: k === 'crew' ? (r[ix('department')] || r[ix('dept')] || '') : '', role: r[ix('role')] || r[ix('position')] || '' })) }); Contacts.list.push(contactNormalize(c)); n++; });
        toast(`Imported ${n} contact${n === 1 ? '' : 's'} from CSV`); }
    } catch (e) { toast('Could not read that file: ' + e.message, true); }
    await Contacts.save(); draw();
  }
  app.append(h('div', { class: 'home-top' }, h('a', { class: 'logo', href: '#/', style: { padding: 0 } }, h('span', { class: 'mark' }, icon('film', 18)), 'StudioBindahh'), h('span', { class: 'grow' }), h('a', { class: 'btn sm', href: '#/' }, icon('home', 15), 'All projects'), themeBtn()),
    h('div', { class: 'page', style: { maxWidth: '1200px' } }, h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, 'Contacts'), h('div', { class: 'muted small', style: { marginTop: '3px' } }, 'Your shared address book. A person can be cast, crew or both, with several positions and a history of credits. Import people into any project from its Cast & crew page.')), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: importFile }, icon('upload', 15), 'Import'),
      h('button', { class: 'btn', onclick: () => download('studiobindahh-contacts.json', JSON.stringify({ studiobindahh: 'contacts', contacts: Contacts.list }), 'application/json') }, icon('download', 15), 'Export'),
      h('button', { class: 'btn', onclick: () => add('cast') }, icon('plus', 15), 'Add cast / talent'), h('button', { class: 'btn primary', onclick: () => add('crew') }, icon('plus', 15), 'Add crew')),
      h('div', { class: 'row', style: { marginBottom: '14px' } }, search, seg, h('span', { class: 'grow' }), count), body,
      h('datalist', { id: 'dl-dept' }, DEPTS.map(d => h('option', { value: d })))));
  draw();
}
