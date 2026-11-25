'use strict';
/* ===================================================================
   Cast & Crew — VIEW. Contact table / cards with full profiles.
   Rules: js/models/people.model.js; screen state and commands:
   js/viewmodels/people.vm.js. The profile dialog is shared with the
   global Contacts page (opts.contact).
   =================================================================== */
/* older global names, used by contacts, region, overview, series and the photo suite */
const UNIONS = PeopleModel.UNIONS;
const DOC_LIST = PeopleModel.DOC_LIST;
const newPerson = type => PeopleModel.newPerson(type);
const initialsOf = n => PeopleModel.initials(n);
const docsDone = p => PeopleModel.docsDone(p);
const profileSections = (p, contact) => PeopleModel.sections(p, contact);
function avatar(p, size = 40) {
  return h('div', { class: 'avatar', style: Object.assign({ width: size + 'px', height: size + 'px', fontSize: Math.round(size * .38) + 'px' }, p.photo ? { backgroundImage: `url(${p.photo})` } : {}) }, p.photo ? '' : initialsOf(p.name || p.character));
}
const docsBar = (p, minWidth) => h('div', { class: 'row', style: { gap: '6px', ...(minWidth ? { padding: '8px 4px' } : { marginTop: '6px' }) } },
  h('div', { class: 'progress', title: 'Paperwork complete', style: minWidth ? { minWidth } : {} }, h('i', { style: { width: docsDone(p) / DOC_LIST.length * 100 + '%' } })), h('span', { class: 'small muted' }, `${docsDone(p)}/${DOC_LIST.length}`));

/**
 * The person profile dialog.
 * Project people: pass opts.vm (a PeopleVM) — edits go through it and the dialog follows undo and live changes.
 * Contacts: opts.contact — edits the contact directly (the Contacts page saves on close).
 */
function openProfile(p, onClose, opts = {}) {
  const vm = opts.contact ? null : (opts.vm || new PeopleVM()), id = p.id;
  const cur = () => vm ? vm.person(id) : p;
  /* edits: through the view model for project people, straight onto the contact otherwise */
  const ed = vm ? {
    set: (k, v) => vm.update(id, k, v, { quiet: true }), doc: (k, on) => vm.setDoc(id, k, on), photo: url => vm.setPhoto(id, url),
  } : {
    set: (k, v) => { const r = PeopleModel.update(p, k, v); Store.touch(); return r; }, doc: (k, on) => { PeopleModel.setDoc(p, k, on); Store.touch(); }, photo: url => { PeopleModel.update(p, 'photo', url || ''); Store.touch(); draw(); },
  };
  const body = h('div', { class: 'pf' });
  const field = (x, key, label, o = {}) => {
    const el = o.select ? h('select', { class: 'inp', onchange: e => ed.set(key, e.target.value) }, o.select.map(v => h('option', { selected: v === (x[key] || o.select[0]) }, v)))
      : h(o.area ? 'textarea' : 'input', { class: 'inp', rows: 2, type: o.area ? undefined : o.type, list: o.list, value: x[key] || '', oninput: e => {
        const v = ed.set(key, e.target.value); if (v !== false && v !== e.target.value) e.target.value = v;
        if (key === 'name') $('.pf-name', body).textContent = e.target.value || 'Unnamed'; } });
    return h('div', { class: 'field', 'data-key': key, style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, label), el);
  };
  function inProduction(x) {
    if (!vm) return null;
    const a = vm.appearances(x), w = vm.wardrobe(x);
    return [a ? h('div', { class: 'pf-sec', 'data-key': 'scenes' }, h('h4', {}, 'In this production'),
      h('div', { class: 'small' }, a.scenes.length ? [h('b', {}, `${a.scenes.length} scene${a.scenes.length > 1 ? 's' : ''}: `), a.scenes.join(', ')] : 'Not in any scene yet.'),
      a.days.length ? h('div', { class: 'small', style: { marginTop: '4px' } }, h('b', {}, `${a.days.length} shoot day${a.days.length > 1 ? 's' : ''}: `), a.days.map(d => `Day ${d.n}${d.date ? ' (' + fmtDateShort(d.date) + ')' : ''}`).join(', ')) : null) : null,
    w.length ? h('div', { class: 'pf-sec', 'data-key': 'wardrobe' }, h('h4', {}, 'Wardrobe'), h('div', { class: 'small' }, w.map(({ item, scenes }) => h('div', {}, h('b', {}, item.name), item.look ? ' · ' + item.look : '', ' — ', item.status, h('span', { class: 'muted' }, ' · Sc ' + scenes.join(', ')))))) : null];
  }
  const pickPhoto = async () => { const f = await pickFile('image/*'); if (f) ed.photo(await readImage(f, 700)); };
  /* the contact's cast / crew roles: their own section, rebuilt by contacts.js, which changes the field groups */
  const roles = opts.contact ? contactRolesSection(p, () => draw()) : null;
  if (roles) roles._own = true;
  function draw() {
    const x = cur(); if (!x) return;
    x.docs = x.docs || {};
    morph(body, [
      h('div', { class: 'pf-side', 'data-key': 'side' },
        h('div', { class: 'pf-photo' }, h('div', { class: 'ph', style: x.photo ? { backgroundImage: `url(${x.photo})` } : {}, onclick: pickPhoto }, x.photo ? '' : h('span', { class: 'row small' }, icon('user', 22), 'Add photo')),
          x.photo ? h('button', { class: 'btn sm', style: { marginTop: '6px', width: '100%' }, onclick: () => ed.photo('') }, 'Remove photo') : null),
        h('div', { style: { marginTop: '12px', textAlign: 'center' } }, h('div', { class: 'pf-name', style: { fontFamily: 'var(--head)', fontWeight: 800, fontSize: '17px' } }, x.name || 'Unnamed'), h('div', { class: 'small muted' }, PeopleModel.subtitle(x))),
        h('div', { style: { marginTop: '14px' } }, inProduction(x)),
        opts.contact ? null : h('div', { class: 'pf-sec' }, h('h4', {}, 'Paperwork'), h('div', { class: 'docs' }, DOC_LIST.map(([k, l]) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!x.docs[k], onchange: e => ed.doc(k, e.target.checked) }), l))))),
      h('div', { class: 'pf-main', 'data-key': 'main' }, roles,
        PeopleModel.sections(x, opts.contact).map(([title, fields]) => h('div', { class: 'pf-sec', 'data-key': 'sec:' + title }, h('h4', {}, title), h('div', { class: 'pf-grid' }, fields.map(([k, l, o]) => field(x, k, l, o))))),
        h('div', { class: 'pf-sec', 'data-key': 'notes' }, h('h4', {}, 'Notes'), h('textarea', { class: 'inp', rows: 4, value: x.notes || '', placeholder: 'Anything else the production should know…', oninput: e => ed.set('notes', e.target.value) })),
        h('datalist', { id: 'dl-union', 'data-key': 'dl' }, UNIONS.filter(Boolean).map(u => h('option', { value: u }))))]);
  }
  draw();
  const off = vm ? vm.subscribe(draw) : null;
  const P = vm ? vm.P : null;
  return modal({ title: opts.contact ? 'Contact profile' : p.type === 'cast' ? 'Cast profile' : 'Crew profile', wide: true, body, onClose: () => { off && off(); onClose && onClose(); },
    buttons: [
      opts.contact ? null : { label: 'Save to contacts', onClick: async () => { const r = await saveToContacts([cur()]); Store.touch(); toast(r.added ? 'Added to your contacts' : 'Contact updated'); return false; } },
      p.type === 'cast' && p.character && !opts.contact ? { label: 'Rename character…', onClick: () => { setTimeout(() => openRenameCharacter(P, cur().character, onClose), 0); } } : null,
      opts.contact ? null : { label: 'Print profile', onClick: () => { printProfile(cur()); return false; } },
      { label: 'Done', primary: true }].filter(Boolean) });
}
function printProfile(p) {
  const rows = PeopleModel.profileRows(p);
  const node = h('div', { class: 'print-doc' }, h('h1', {}, p.name || 'Profile'), h('div', { class: 'sub' }, `${Store.P.title} · ${p.type === 'cast' ? 'Cast' : 'Crew'}${p.character ? ' · ' + p.character : ''}`),
    p.photo ? h('img', { src: p.photo, style: { width: '1.6in', float: 'right', marginLeft: '12pt' } }) : null,
    h('table', {}, h('tbody', {}, rows.map(r => r.grp ? h('tr', { class: 'grp' }, h('td', { colspan: 2 }, r.grp)) : h('tr', {}, h('td', { style: { width: '32%', fontWeight: 'bold' } }, r[0]), h('td', { style: { whiteSpace: 'pre-wrap' } }, r[1]))))));
  printNode(node);
}

/* ---------- the Cast & Crew page ---------- */
Views.people = function (root) {
  const vm = new PeopleVM(), P = Store.P;
  const tabs = () => h('div', { class: 'tabs' }, vm.tabs.map(([t, l]) => h('button', { class: t === vm.tab ? 'on' : '', onclick: () => { vm.setTab(t); Router.refresh(); } }, l)));
  if (vm.tab === 'casting') {
    const box = h('div', { class: 'cast-embed' });
    root.append(h('div', { class: 'page' }, h('div', { class: 'page-h' }, h('h2', {}, 'Cast & Crew')), tabs(), box));
    return mountCasting(box);
  }
  const page = h('div', { class: 'page' });
  root.append(page, h('datalist', { id: 'dl-dept' }, DEPTS.map(d => h('option', { value: d }))));
  const open = p => openProfile(p, () => vm.refresh(), { vm });

  async function remove(p) { if (!vm.needsConfirm(p) || await confirmBox(`Remove ${p.name || p.character}?`, 'Remove')) vm.remove(p.id); }
  function addCharacters() { const n = vm.addCharacters(); toast(n ? `Added ${n} character${n > 1 ? 's' : ''}` : 'All characters are already listed', !n); }
  async function saveAll() { const r = await saveToContacts(P.people); Store.touch(); toast(`Contacts: ${r.added} added, ${r.updated} updated`); }
  function add() { const p = vm.add(); open(p); }
  const csv = () => download(slug(P.title) + `-${vm.tab}.csv`, toCSV(vm.csvRows()), 'text/csv');
  const print = () => { const r = vm.printRows(); printTable(r.title, r.head, r.rows, { landscape: true }); };

  function header() {
    const cast = vm.tab === 'cast';
    return h('div', { class: 'page-h', 'data-key': 'head' }, h('h2', {}, 'Cast & Crew'), h('span', { class: 'grow' }),
      h('input', { class: 'inp', type: 'search', placeholder: 'Search…', style: { width: '200px' }, value: vm.q, oninput: e => vm.setQuery(e.target.value) }),
      h('div', { class: 'seg' }, [['table', 'Table'], ['cards', 'Cards']].map(([k, l]) => h('button', { class: vm.mode === k ? 'on' : '', onclick: () => vm.setMode(k) }, l))),
      cast ? h('button', { class: 'btn', 'data-key': 'chars', onclick: addCharacters }, icon('wand', 15), 'Add characters from script') : null,
      cast ? h('button', { class: 'btn', 'data-key': 'rename', onclick: () => openRenameCharacter(P, '', () => vm.refresh()), title: 'Rename a character everywhere, or merge two characters' }, icon('edit', 15), 'Rename / merge') : null,
      h('button', { class: 'btn', 'data-key': 'import', title: 'Copy people from your global contacts list into this project', onclick: () => importContactsModal(P, vm.tab, () => vm.refresh()) }, icon('users', 15), 'Import from contacts'),
      h('button', { class: 'btn', 'data-key': 'save', title: 'Add this project’s cast and crew to your global contacts', onclick: saveAll }, icon('upload', 15), 'Save to contacts'),
      h('button', { class: 'btn primary', 'data-key': 'add', onclick: add }, icon('plus', 15), cast ? 'Add actor' : 'Add crew'),
      h('button', { class: 'btn', 'data-key': 'csv', onclick: csv }, icon('download', 15), 'CSV'),
      h('button', { class: 'btn', 'data-key': 'print', onclick: print }, icon('print', 15), 'Print'));
  }
  function list() {
    const rows = vm.rows;
    if (!rows.length) return h('div', { class: 'empty', 'data-key': 'empty' }, h('p', {}, vm.q && vm.all.length ? 'Nobody matches your search.' : vm.emptyText));
    if (vm.mode === 'cards') return h('div', { class: 'people-grid', 'data-key': 'cards' }, rows.map(p => h('div', { class: 'pcardp', 'data-key': p.id, tabindex: 0, onclick: () => open(p), onkeydown: e => { if (e.key === 'Enter') open(p); } },
      h('div', { class: 'pic', style: p.photo ? { backgroundImage: `url(${p.photo})` } : {} }, p.photo ? '' : initialsOf(p.name || p.character)),
      h('div', { class: 'pbody' }, h('b', {}, p.name || h('i', { class: 'muted' }, 'Unnamed')), h('div', { class: 'small muted' }, vm.subtitle(p)),
        p.email ? h('div', { class: 'small', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, p.email) : null, p.phone ? h('div', { class: 'small' }, p.phone) : null, docsBar(p)))));
    return h('table', { class: 'tbl', 'data-key': 'table' }, h('thead', {}, h('tr', {}, h('th', {}, ''), vm.cols.map(c => h('th', {}, c[1])), h('th', {}, 'Paperwork'), h('th', {}, ''))),
      h('tbody', {}, rows.map(p => h('tr', { 'data-key': p.id }, h('td', { style: { width: '54px', cursor: 'pointer' }, onclick: () => open(p) }, avatar(p, 34)),
        vm.cols.map(([k, , ph]) => h('td', {}, h('input', { class: 'cell', value: p[k] || '', placeholder: ph, list: k === 'dept' ? 'dl-dept' : null,
          oninput: e => { const v = vm.update(p.id, k, e.target.value, { quiet: true }); if (v !== false && v !== e.target.value) e.target.value = v; } }))),
        h('td', { style: { width: '110px' } }, docsBar(p, '50px')),
        h('td', { style: { width: '84px', whiteSpace: 'nowrap' } }, ibtn('user', 'Open profile', () => open(p)), ibtn('trash', 'Remove', () => remove(p), 'danger'))))));
  }
  const draw = () => morph(page, [header(), h('div', { 'data-key': 'tabs', style: { display: 'contents' } }, tabs()), list()]);
  const unbind = bindView(vm, draw);
  const pending = vm.takePendingOpen(); if (pending) open(pending);
  return unbind;
};
