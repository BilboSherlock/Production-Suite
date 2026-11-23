'use strict';
/* ===================================================================
   Cast & Crew — contact table / cards with full detailed profiles
   =================================================================== */
const UNIONS = ['', 'SAG-AFTRA', 'Equity', 'ACTRA', 'IATSE', 'DGA', 'WGA', 'Non-union', 'Other'];
const DOC_LIST = [['contract', 'Contract signed'], ['eligibility', 'ID / work eligibility'], ['release', 'Release / consent'], ['nda', 'NDA signed'], ['insurance', 'Insurance / medical']];
const newPerson = type => ({ id: uid(), type, name: '', character: '', dept: '', role: '', phone: '', email: '', agent: '', notes: '', unavail: '', photo: '', docs: {} });
const initialsOf = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
function avatar(p, size = 40) {
  return h('div', { class: 'avatar', style: Object.assign({ width: size + 'px', height: size + 'px', fontSize: Math.round(size * .38) + 'px' }, p.photo ? { backgroundImage: `url(${p.photo})` } : {}) }, p.photo ? '' : initialsOf(p.name || p.character));
}
const docsDone = p => DOC_LIST.filter(([k]) => (p.docs || {})[k]).length;

function profileSections(p, contact) {
  const cast = contact ? (p.kinds || [p.type]).includes('cast') : p.type === 'cast', crewToo = contact && (p.kinds || [p.type]).includes('crew');
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
  S.push(['Deal', [['rate', 'Rate'], ['rateUnit', 'Per', { select: ['Day', 'Week', 'Hour', 'Flat'] }], ['dealNotes', 'Deal notes', { area: true }]]]);
  if (!contact) S.push(['Availability', [['unavail', 'Unavailable dates (YYYY-MM-DD, ranges with ..)', { area: true }]]]);
  return S;
}

function openProfile(p, onClose, opts = {}) {
  const P = opts.contact ? null : Store.P; p.docs = p.docs || {};
  const field = (key, label, o = {}) => {
    const el = o.select ? h('select', { class: 'inp', onchange: e => { p[key] = e.target.value; Store.touch(); } }, o.select.map(x => h('option', { selected: x === (p[key] || o.select[0]) }, x)))
      : h(o.area ? 'textarea' : 'input', { class: 'inp', rows: 2, type: o.area ? undefined : o.type, list: o.list, value: p[key] || '', oninput: e => { p[key] = key === 'character' ? e.target.value.toUpperCase() : e.target.value; if (key === 'character') e.target.value = p[key]; Store.touch(); if (key === 'name') $('.pf-name', box.box).textContent = p.name || 'Unnamed'; } });
    return h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, label), el);
  };
  const scenes = P ? getScenes(P) : [];
  const sceneInfo = () => {
    if (!P || p.type !== 'cast' || !p.character) return null;
    const ch = normChar(p.character), mine = scenes.filter(s => sceneCast(P, s).has(ch)), days = P.days.map((d, i) => ({ d, i })).filter(x => mine.some(s => x.d.sceneIds.includes(s.id)));
    return h('div', { class: 'pf-sec' }, h('h4', {}, 'In this production'),
      h('div', { class: 'small' }, mine.length ? [h('b', {}, `${mine.length} scene${mine.length > 1 ? 's' : ''}: `), mine.map(s => s.num).join(', ')] : 'Not in any scene yet.'),
      days.length ? h('div', { class: 'small', style: { marginTop: '4px' } }, h('b', {}, `${days.length} shoot day${days.length > 1 ? 's' : ''}: `), days.map(x => `Day ${x.i + 1}${x.d.date ? ' (' + fmtDateShort(x.d.date) + ')' : ''}`).join(', ')) : null);
  };
  const wardrobeInfo = () => {
    if (!P || p.type !== 'cast' || !p.character) return null; const ch = normChar(p.character), items = P.wardrobe.filter(w => itemAllChars(w).includes(ch)); if (!items.length) return null;
    return h('div', { class: 'pf-sec' }, h('h4', {}, 'Wardrobe'), h('div', { class: 'small' }, items.map(w => h('div', {}, h('b', {}, w.name), w.look ? ' · ' + w.look : '', ' — ', w.status, h('span', { class: 'muted' }, ' · Sc ' + w.sceneIds.filter(id => itemCharsIn(w, id).includes(ch)).map(id => (scenes.find(s => s.id === id) || {}).num).filter(Boolean).join(', '))))));
  };
  const photoBox = h('div', { class: 'pf-photo' });
  const drawPhoto = () => { photoBox.innerHTML = ''; photoBox.append(h('div', { class: 'ph', style: p.photo ? { backgroundImage: `url(${p.photo})` } : {}, onclick: async () => { const f = await pickFile('image/*'); if (f) { p.photo = await readImage(f, 700); Store.touch(); drawPhoto(); } } }, p.photo ? '' : h('span', { class: 'row small' }, icon('user', 22), 'Add photo')),
    p.photo ? h('button', { class: 'btn sm', style: { marginTop: '6px', width: '100%' }, onclick: () => { p.photo = ''; Store.touch(); drawPhoto(); } }, 'Remove photo') : null); };
  drawPhoto();
  const docs = h('div', { class: 'pf-sec' }, h('h4', {}, 'Paperwork'), h('div', { class: 'docs' }, DOC_LIST.map(([k, l]) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!p.docs[k], onchange: e => { p.docs[k] = e.target.checked; Store.touch(); } }), l))));
  const secs = profileSections(p, opts.contact).map(([title, fields]) => h('div', { class: 'pf-sec' }, h('h4', {}, title), h('div', { class: 'pf-grid' }, fields.map(([k, l, o]) => field(k, l, o)))));
  const body = h('div', { class: 'pf' }, h('div', { class: 'pf-side' }, photoBox, h('div', { style: { marginTop: '12px', textAlign: 'center' } }, h('div', { class: 'pf-name', style: { fontFamily: 'var(--head)', fontWeight: 800, fontSize: '17px' } }, p.name || 'Unnamed'), h('div', { class: 'small muted' }, p.type === 'cast' ? (p.character || 'Cast') : [p.role, p.dept].filter(Boolean).join(' · ') || 'Crew')),
    h('div', { style: { marginTop: '14px' } }, sceneInfo(), wardrobeInfo()), opts.contact ? null : docs),
    h('div', { class: 'pf-main' }, opts.contact ? contactRolesSection(p, () => { box.close && box.close(); setTimeout(() => openProfile(p, onClose, opts), 0); }) : null, secs, h('div', { class: 'pf-sec' }, h('h4', {}, 'Notes'), h('textarea', { class: 'inp', rows: 4, value: p.notes || '', placeholder: 'Anything else the production should know…', oninput: e => { p.notes = e.target.value; Store.touch(); } })),
      h('datalist', { id: 'dl-union' }, UNIONS.filter(Boolean).map(u => h('option', { value: u })))));
  const box = modal({ title: opts.contact ? 'Contact profile' : p.type === 'cast' ? 'Cast profile' : 'Crew profile', wide: true, body, onClose,
    buttons: [opts.contact ? null : { label: 'Save to contacts', onClick: async () => { const r = await saveToContacts([p]); Store.touch(); toast(r.added ? 'Added to your contacts' : 'Contact updated'); return false; } }, p.type === 'cast' && p.character && !opts.contact ? { label: 'Rename character…', onClick: () => { setTimeout(() => openRenameCharacter(P, p.character, onClose), 0); } } : null, opts.contact ? null : { label: 'Print profile', onClick: () => { printProfile(p); return false; } }, { label: 'Done', primary: true }].filter(Boolean) });
  return box;
}
function printProfile(p) {
  const rows = []; profileSections(p).forEach(([t, fs]) => { rows.push({ grp: t }); fs.forEach(([k, l]) => { if (p[k]) rows.push([l, String(p[k])]); }); });
  rows.push({ grp: 'Paperwork' }); DOC_LIST.forEach(([k, l]) => rows.push([l, (p.docs || {})[k] ? '✓ Complete' : 'Outstanding']));
  if (p.notes) { rows.push({ grp: 'Notes' }); rows.push(['', p.notes]); }
  const node = h('div', { class: 'print-doc' }, h('h1', {}, p.name || 'Profile'), h('div', { class: 'sub' }, `${Store.P.title} · ${p.type === 'cast' ? 'Cast' : 'Crew'}${p.character ? ' · ' + p.character : ''}`),
    p.photo ? h('img', { src: p.photo, style: { width: '1.6in', float: 'right', marginLeft: '12pt' } }) : null,
    h('table', {}, h('tbody', {}, rows.map(r => r.grp ? h('tr', { class: 'grp' }, h('td', { colspan: 2 }, r.grp)) : h('tr', {}, h('td', { style: { width: '32%', fontWeight: 'bold' } }, r[0]), h('td', { style: { whiteSpace: 'pre-wrap' } }, r[1]))))));
  printNode(node);
}

function peopleTabs(P, tab) {
  return h('div', { class: 'tabs' }, [['cast', 'Cast'], ['crew', 'Crew'], ['casting', 'Casting']].map(([t, l]) => h('button', { class: t === tab ? 'on' : '', onclick: () => { UI.peopleTab = t; Router.refresh(); } },
    t === 'casting' ? `Casting (${P.casting.roles.filter(r => !r.castId).length} open)` : `${l} (${P.people.filter(p => p.type === t).length})`)));
}
Views.people = function (root) {
  const P = Store.P, tab = UI.peopleTab; let q = '';
  if (tab === 'casting') {
    const box = h('div', { class: 'cast-embed' });
    root.append(h('div', { class: 'page' }, h('div', { class: 'page-h' }, h('h2', {}, 'Cast & Crew')), peopleTabs(P, tab), box));
    mountCasting(box); return;
  } UI.peopleView = UI.peopleView || 'table';
  const COLS = {
    cast: [['name', 'Actor', 'Full name'], ['character', 'Character', 'CHARACTER'], ['phone', 'Phone', ''], ['email', 'Email', ''], ['agent', 'Agent / rep', '']],
    crew: [['name', 'Name', 'Full name'], ['dept', 'Department', ''], ['role', 'Position', 'e.g. Gaffer'], ['phone', 'Phone', ''], ['email', 'Email', '']],
  };
  const wrap = h('div', { class: 'page' }), body = h('div');
  const search = h('input', { class: 'inp', placeholder: 'Search…', style: { width: '200px' }, oninput: e => { q = e.target.value.toLowerCase(); fill(); } });
  const list = () => P.people.filter(p => p.type === tab);
  const dl = h('datalist', { id: 'dl-dept' }, DEPTS.map(d => h('option', { value: d })));
  const viewSeg = h('div', { class: 'seg' }, [['table', 'Table'], ['cards', 'Cards']].map(([k, l]) => h('button', { 'data-k': k, class: UI.peopleView === k ? 'on' : '', onclick: () => { UI.peopleView = k; $$('button', viewSeg).forEach(b => b.classList.toggle('on', b.dataset.k === k)); fill(); } }, l)));
  root.append(wrap, dl);
  wrap.append(h('div', { class: 'page-h' }, h('h2', {}, 'Cast & Crew'), h('span', { class: 'grow' }), search, viewSeg,
    ...(tab === 'cast' ? [h('button', { class: 'btn', onclick: importChars }, icon('wand', 15), 'Add characters from script'), h('button', { class: 'btn', onclick: () => openRenameCharacter(P, '', fill), title: 'Rename a character everywhere, or merge two characters' }, icon('edit', 15), 'Rename / merge')] : []),
    h('button', { class: 'btn', title: 'Copy people from your global contacts list into this project', onclick: () => importContactsModal(P, tab, fill) }, icon('users', 15), 'Import from contacts'),
    h('button', { class: 'btn', title: 'Add this project’s cast and crew to your global contacts', onclick: async () => { const r = await saveToContacts(P.people); Store.touch(); toast(`Contacts: ${r.added} added, ${r.updated} updated`); } }, icon('upload', 15), 'Save to contacts'),
    h('button', { class: 'btn primary', onclick: () => { const p = newPerson(tab); P.people.push(p); Store.touch(); fill(); openProfile(p, fill); } }, icon('plus', 15), tab === 'cast' ? 'Add actor' : 'Add crew'),
    h('button', { class: 'btn', onclick: () => download(slug(P.title) + `-${tab}.csv`, toCSV([[...COLS[tab].map(c => c[1]), 'Union', 'Rate', 'Address', 'Emergency contact', 'Dietary'], ...list().map(p => [...COLS[tab].map(c => p[c[0]]), p.union, p.rate ? `${p.rate}/${p.rateUnit || 'Day'}` : '', p.address, [p.emName, p.emPhone].filter(Boolean).join(' '), p.dietary])]), 'text/csv') }, icon('download', 15), 'CSV'),
    h('button', { class: 'btn', onclick: () => printTable(tab === 'cast' ? 'Cast list' : 'Crew list', COLS[tab].map(c => c[1]), list().map(p => COLS[tab].map(c => p[c[0]])), { landscape: true }) }, icon('print', 15), 'Print')),
    peopleTabs(P, tab), body);
  function importChars() {
    const have = new Set(P.people.filter(p => p.type === 'cast').map(p => normChar(p.character))); let n = 0;
    [...allCharacters(P)].sort((a, b) => b[1] - a[1]).forEach(([c]) => { if (!have.has(c)) { const p = newPerson('cast'); p.character = c; P.people.push(p); n++; } });
    Store.touch(); fill(); toast(n ? `Added ${n} character${n > 1 ? 's' : ''}` : 'All characters are already listed', !n);
  }
  async function remove(p) { if ((!p.name && !p.character) || await confirmBox(`Remove ${p.name || p.character}?`, 'Remove')) { P.people = P.people.filter(x => x !== p); Store.touch(); fill(); } }
  function fill() {
    body.innerHTML = '';
    const rows = list().filter(p => !q || JSON.stringify(Object.values(p)).toLowerCase().includes(q));
    if (!rows.length) { body.append(h('div', { class: 'empty' }, h('p', {}, tab === 'cast' ? 'No cast yet. Add actors, or import the characters from your script.' : 'No crew yet. Add your team to include them on call sheets.'))); return; }
    if (UI.peopleView === 'cards') {
      body.append(h('div', { class: 'people-grid' }, rows.map(p => h('div', { class: 'pcardp', tabindex: 0, onclick: () => openProfile(p, fill), onkeydown: e => { if (e.key === 'Enter') openProfile(p, fill); } },
        h('div', { class: 'pic', style: p.photo ? { backgroundImage: `url(${p.photo})` } : {} }, p.photo ? '' : initialsOf(p.name || p.character)),
        h('div', { class: 'pbody' }, h('b', {}, p.name || h('i', { class: 'muted' }, 'Unnamed')), h('div', { class: 'small muted' }, tab === 'cast' ? (p.character || 'Cast') : [p.role, p.dept].filter(Boolean).join(' · ') || 'Crew'),
          p.email ? h('div', { class: 'small', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, p.email) : null, p.phone ? h('div', { class: 'small' }, p.phone) : null,
          h('div', { class: 'row', style: { marginTop: '6px' } }, h('div', { class: 'progress', title: 'Paperwork complete' }, h('i', { style: { width: docsDone(p) / DOC_LIST.length * 100 + '%' } })), h('span', { class: 'small muted' }, `${docsDone(p)}/${DOC_LIST.length}`)))))));
      return;
    }
    body.append(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, ''), COLS[tab].map(c => h('th', {}, c[1])), h('th', {}, 'Paperwork'), h('th', {}, ''))),
      h('tbody', {}, rows.map(p => h('tr', {}, h('td', { style: { width: '54px', cursor: 'pointer' }, onclick: () => openProfile(p, fill) }, avatar(p, 34)),
        COLS[tab].map(([k, , ph]) => h('td', {}, h('input', { class: 'cell', value: p[k] || '', placeholder: ph, list: k === 'dept' ? 'dl-dept' : null,
          oninput: e => { p[k] = k === 'character' ? e.target.value.toUpperCase() : e.target.value; if (k === 'character') e.target.value = p[k]; Store.touch(); } }))),
        h('td', { style: { width: '110px' } }, h('div', { class: 'row', style: { gap: '6px', padding: '8px 4px' } }, h('div', { class: 'progress', style: { minWidth: '50px' } }, h('i', { style: { width: docsDone(p) / DOC_LIST.length * 100 + '%' } })), h('span', { class: 'small muted' }, `${docsDone(p)}/${DOC_LIST.length}`))),
        h('td', { style: { width: '84px', whiteSpace: 'nowrap' } }, ibtn('user', 'Open profile', () => openProfile(p, fill)), ibtn('trash', 'Remove', () => remove(p), 'danger')))))));
  }
  fill();
  if (UI.openPerson) { const pp = P.people.find(x => x.id === UI.openPerson); UI.openPerson = null; if (pp) openProfile(pp, fill); }
};
