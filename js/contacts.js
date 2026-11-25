'use strict';
/* ===================================================================
   Global contacts — one address book of people, shared by every
   production. A person can be cast, crew or both, hold several
   positions, and carry a history of credits across productions.
   VIEW (and where the list is stored). Rules: js/models/contacts.model.js;
   screen state and commands: js/viewmodels/contacts.vm.js.
   =================================================================== */
const Contacts = {
  list: [],
  async load() {
    try { const v = await DB.getMeta('contacts'); if (Array.isArray(v)) Contacts.list = v; } catch (e) { try { Contacts.list = JSON.parse(localStorage.getItem('sb-contacts') || '[]'); } catch (x) { } }
    Contacts.list.forEach(c => ContactsModel.normalize(c));
  },
  async save() { try { await DB.setMeta('contacts', Contacts.list); } catch (e) { try { localStorage.setItem('sb-contacts', JSON.stringify(Contacts.list)); } catch (x) { toast('Could not save contacts', true); } } },
};
/* these names are kept for older callers */
const contactNormalize = c => ContactsModel.normalize(c);
const kindsText = c => ContactsModel.kindsText(c);
const positionFor = (c, kind) => ContactsModel.positionFor(c, kind);
const LOCAL_FIELDS = ContactsModel.LOCAL_FIELDS;
const personFromContact = (c, kind, over) => ContactsModel.personFrom(c, kind, over);
const inProject = (P, c, kind) => ContactsModel.inProject(P, c, kind);
const contactLine = c => ContactsModel.line(c);

/* add or update contacts from project people; also records this production as a credit */
async function saveToContacts(people, P = Store.P) {
  const r = ContactsModel.saveFrom(Contacts.list, people, P, new Date().getFullYear());
  await Contacts.save(); return r;
}

/* pick contacts and copy them into the open project (choosing cast or crew, and the position) */
function importContactsModal(P, type, onDone) {
  const vm = new ContactPickerVM({ project: () => P, type });
  const list = h('div', { class: 'ct-list' }), count = h('span', { class: 'small muted' });
  const search = h('input', { class: 'inp', placeholder: 'Search contacts…', oninput: e => vm.setQuery(e.target.value) });
  const tabSel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => vm.setFilter(e.target.value) }, ContactsModel.PICK_FILTERS.map(([k, l]) => h('option', { value: k, selected: k === vm.filter }, l)));
  const row = ({ c, pick: pk, have, on }) => {
    const kindSel = c.kinds.length > 1 ? h('select', { class: 'cell', style: { width: '96px' }, onchange: e => vm.setKind(c.id, e.target.value) }, c.kinds.map(k => h('option', { value: k, selected: k === pk.kind }, k === 'cast' ? 'as Cast' : 'as Crew'))) : h('span', { class: 'pill' }, ContactsModel.kindLabel(pk.kind));
    return h('div', { class: 'ct-row' + (have ? ' dim' : ''), 'data-key': c.id }, h('input', { type: 'checkbox', disabled: have, checked: on, onchange: e => vm.toggle(c.id, e.target.checked) }),
      avatar(c, 34), h('div', { style: { flex: 1, minWidth: 0 } }, h('b', {}, c.name || '(no name)'), h('div', { class: 'small muted clip' }, ContactsModel.line(c)), ContactsModel.creditsLine(c) ? h('div', { class: 'small muted clip' }, ContactsModel.creditsLine(c)) : null),
      on ? h('input', { class: 'cell', placeholder: pk.kind === 'crew' ? 'Position' : 'Billing / type', value: pk.role, style: { width: '150px' }, oninput: e => vm.setRole(c.id, e.target.value) }) : null, kindSel, have ? h('span', { class: 'small muted' }, `in project as ${pk.kind}`) : null);
  };
  const unbind = bindView(vm, () => {
    morph(list, [!vm.list.length ? h('div', { class: 'empty' }, h('p', {}, 'Your contacts list is empty. Open Contacts from the home screen, or use “Save to contacts” on a project’s Cast & crew page.')) : null, ...vm.rows.map(row)]);
    count.textContent = vm.countText;
  });
  modal({ title: 'Import from contacts', wide: true, body: h('div', {}, h('div', { class: 'row', style: { marginBottom: '10px' } }, search, tabSel, h('span', { class: 'grow' }), count), list),
    onClose: unbind,
    buttons: [{ label: 'Cancel' }, { label: 'Import selected', primary: true, onClick: () => {
      const n = vm.importPicked(); if (!n) { toast('Select at least one contact.', true); return false; }
      toast(`Imported ${n} contact${n > 1 ? 's' : ''}`); onDone && onDone();
    } }] });
}

/* ---------- roles & credits editor (shown inside a contact's profile) ---------- */
/* edits update this section in place (no closing and reopening the dialog); onKinds is told when cast / crew changes */
function contactRolesSection(c, onKinds) {
  const vm = new ContactRolesVM({ contact: c }), wrap = h('div');
  const kindOpts = v => [['cast', 'Cast'], ['crew', 'Crew']].map(([k, l]) => h('option', { value: k, selected: k === v }, l));
  const kindBox = (k, l) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: vm.kinds.includes(k), onchange: e => {
    if (!vm.setKind(k, e.target.checked)) { e.target.checked = true; toast('A contact needs at least one of cast or crew.', true); return; }
    onKinds && onKinds(); } }), l);
  const cell = (list, x, k, o = {}) => h('input', { class: 'cell', list: o.list, value: x[k] || '', placeholder: o.ph, oninput: e => vm.setRow(list, x.id, k, e.target.value) });
  const draw = () => {
    const posRows = vm.positions.map(p => h('tr', { 'data-key': p.id }, h('td', { style: { width: '110px' } }, h('select', { class: 'cell', onchange: e => vm.setRow('positions', p.id, 'kind', e.target.value) }, kindOpts(p.kind))),
      h('td', {}, cell('positions', p, 'dept', { list: 'dl-dept', ph: 'Department (crew)' })), h('td', {}, cell('positions', p, 'role', { ph: 'Position / billing' })),
      h('td', { style: { width: '40px' } }, ibtn('trash', 'Remove position', () => vm.removeRow('positions', p.id), 'danger'))));
    const crRows = vm.credits.map(x => h('tr', { 'data-key': x.id }, h('td', {}, cell('credits', x, 'production', { ph: 'Production' })), h('td', { style: { width: '100px' } }, h('select', { class: 'cell', onchange: e => vm.setRow('credits', x.id, 'kind', e.target.value) }, kindOpts(x.kind))),
      h('td', {}, cell('credits', x, 'role', { ph: 'Role / character' })), h('td', { style: { width: '80px' } }, cell('credits', x, 'year', { ph: 'Year' })),
      h('td', { style: { width: '40px' } }, ibtn('trash', 'Remove credit', () => vm.removeRow('credits', x.id), 'danger'))));
    morph(wrap, [h('div', { class: 'pf-sec' }, h('h4', {}, 'Roles & credits'), h('div', { class: 'row', style: { gap: '18px', marginBottom: '8px' } }, h('span', { class: 'small muted' }, 'This person works as'), kindBox('cast', 'Cast / talent'), kindBox('crew', 'Crew')),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Works as', 'Department', 'Position / billing', ''].map(x => h('th', {}, x)))), h('tbody', {}, posRows)),
      h('button', { class: 'btn sm', style: { margin: '6px 0 14px' }, onclick: () => vm.addPosition() }, icon('plus', 13), 'Add another position'),
      h('div', { class: 'small muted', style: { margin: '6px 0' } }, 'Credits — productions this person has worked on, and in what role. Added automatically when you save a project’s people to contacts.'),
      vm.credits.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Production', 'As', 'Role / character', 'Year', ''].map(x => h('th', {}, x)))), h('tbody', {}, crRows)) : null,
      h('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: () => vm.addCredit() }, icon('plus', 13), 'Add credit'))]);
  };
  bindView(vm, draw);   // lives as long as the profile (the view model holds nothing else)
  return wrap;
}

/* ---------- the Contacts page (home level) ---------- */
function renderContacts() {
  const app = $('#app'); app.innerHTML = ''; app.style.display = 'block'; app.style.overflow = 'auto';
  const vm = new ContactsVM();
  const body = h('div'), count = h('span', { class: 'small muted' }), seg = h('div', { class: 'seg' });
  const search = h('input', { class: 'inp', placeholder: 'Search name, role, email, production…', style: { width: '280px' }, oninput: e => vm.setQuery(e.target.value) });
  const edit = c => { openProfile(c, () => vm.edited(c.id), { contact: true }); };
  const add = kind => edit(vm.add(kind));
  function card(c) {
    const k = ContactsModel.card(c);
    return h('div', { class: 'pcardp', 'data-key': c.id, tabindex: 0, onclick: () => edit(c), onkeydown: e => { if (e.key === 'Enter') edit(c); } },
      avatar(c, 56), h('div', { class: 'pc-name' }, k.name), h('div', { class: 'small muted' }, k.sub), h('div', { class: 'small muted clip' }, k.reach),
      h('div', { class: 'row', style: { marginTop: '6px', flexWrap: 'wrap', gap: '4px' } }, k.kinds.map(l => h('span', { class: 'pill' }, l)), k.credits ? h('span', { class: 'pill', title: k.credits.title }, k.credits.text) : null, h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn danger', title: 'Delete contact', onclick: async e => { e.stopPropagation(); if (await confirmBox(`Delete ${c.name || 'this contact'} from your contacts? Projects that already imported them keep their copy.`)) vm.remove(c.id); } }, icon('trash', 15))));
  }
  async function importFile() {
    const f = (await pickFiles('.json,.csv'))[0]; if (!f) return; const t = await readText(f);
    try { const n = vm.importFile(f.name, t); toast(`Imported ${n} contact${n === 1 ? '' : 's'}${/\.json$/i.test(f.name) ? '' : ' from CSV'}`); }
    catch (e) { toast('Could not read that file: ' + e.message, true); }
  }
  app.append(h('div', { class: 'home-top' }, h('a', { class: 'logo', href: '#/', style: { padding: 0 } }, h('span', { class: 'mark' }, icon('film', 18)), 'StudioBindahh'), h('span', { class: 'grow' }), h('a', { class: 'btn sm', href: '#/' }, icon('home', 15), 'All projects'), themeBtn()),
    h('div', { class: 'page', style: { maxWidth: '1200px' } }, h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, 'Contacts'), h('div', { class: 'muted small', style: { marginTop: '3px' } }, 'Your shared address book. A person can be cast, crew or both, with several positions and a history of credits. Import people into any project from its Cast & crew page.')), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: importFile }, icon('upload', 15), 'Import'),
      h('button', { class: 'btn', onclick: () => download('studiobindahh-contacts.json', vm.exportJson(), 'application/json') }, icon('download', 15), 'Export'),
      h('button', { class: 'btn', onclick: () => add('cast') }, icon('plus', 15), 'Add cast / talent'), h('button', { class: 'btn primary', onclick: () => add('crew') }, icon('plus', 15), 'Add crew')),
      h('div', { class: 'row', style: { marginBottom: '14px' } }, search, seg, h('span', { class: 'grow' }), count), body,
      h('datalist', { id: 'dl-dept' }, DEPTS.map(d => h('option', { value: d })))));
  /* redrawn in place, cards matched by id, so switching Everyone / Cast / Crew or searching never flashes */
  Router.cleanup = bindView(vm, () => {
    const rows = vm.rows, tab = vm.tab;
    morph(seg, ContactsModel.TABS.map(([k, l]) => h('button', { 'data-k': k, class: tab === k ? 'on' : '', onclick: () => vm.setTab(k) }, l)));
    count.textContent = vm.countText;
    morph(body, rows.length ? h('div', { class: 'people-grid' }, rows.map(card))
      : vm.list.length ? h('div', { class: 'empty' }, h('h3', {}, 'Nobody matches'), h('p', {}, 'Try another filter or search.'))
      : h('div', { class: 'empty' }, h('h3', {}, 'No contacts yet'), h('p', {}, 'Add the people you work with again and again, then import them into any project in one click.')));
  });
}
