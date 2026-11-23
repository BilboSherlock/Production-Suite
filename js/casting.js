'use strict';
/* ===================================================================
   Casting — roles, candidates, auditions, shortlist, and "cast this actor"
   =================================================================== */
const CAST_STATUS = [['considering', 'Considering'], ['audition', 'Audition'], ['callback', 'Callback'], ['offered', 'Offered'], ['cast', 'Cast'], ['passed', 'Passed']];
const castStatusLabel = k => (CAST_STATUS.find(s => s[0] === k) || [0, k])[1];
const newRole = (name = '') => ({ id: uid(), name, age: '', desc: '', notes: '', castId: '', candidates: [] });
const newCandidate = () => ({ id: uid(), name: '', contact: '', photo: '', rating: 0, status: 'considering', date: '', notes: '' });
function roleState(r) {
  if (r.castId) { const c = r.candidates.find(x => x.id === r.castId); return { key: 'cast', label: c && c.name ? 'Cast: ' + c.name : 'Cast' }; }
  for (const k of ['offered', 'callback', 'audition']) if (r.candidates.some(c => c.status === k)) return { key: k, label: castStatusLabel(k) };
  return r.candidates.length ? { key: 'considering', label: r.candidates.length + ' considered' } : { key: 'open', label: 'Open' };
}

function mountCasting(root) {
  const P = Store.P, C = P.casting; C.roles = C.roles || [];
  let sel = C.roles.find(r => r.id === UI.castRole) ? UI.castRole : (C.roles[0] && C.roles[0].id);
  const left = h('div', { class: 'stage-side' }), main = h('div', { class: 'stage-main', style: { overflow: 'auto' } });
  root.append(h('div', { class: 'script-wrap' },
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: addRole }, icon('plus', 15), 'Add role'),
      h('button', { class: 'btn', onclick: fromScript }, icon('wand', 15), 'Roles from script'), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: printSheet }, icon('print', 15), 'Casting sheet')),
    h('div', { class: 'stage-wrap' }, left, main)));

  const role = () => C.roles.find(r => r.id === sel);
  function addRole() { const r = newRole(); C.roles.push(r); sel = UI.castRole = r.id; Store.touch(); draw(); setTimeout(() => { const i = $('[data-f=name]', main); i && i.focus(); }, 30); }
  function fromScript() {
    const have = new Set(C.roles.map(r => normChar(r.name))); let n = 0;
    [...allCharacters(P)].sort((a, b) => b[1] - a[1]).forEach(([c]) => { if (!have.has(c)) { C.roles.push(newRole(c)); n++; } });
    if (!sel && C.roles[0]) sel = C.roles[0].id;
    Store.touch(); draw(); toast(n ? `Added ${n} role${n > 1 ? 's' : ''} from the script` : 'Every character already has a role', !n);
  }
  function printSheet() {
    printTable('Casting sheet', ['Role', 'Age', 'Description', 'Status', 'Cast', 'Shortlist'], C.roles.map(r => {
      const c = r.candidates.find(x => x.id === r.castId);
      return [r.name, r.age, r.desc, roleState(r).label, c ? c.name : '', r.candidates.filter(x => x.id !== r.castId && x.status !== 'passed').map(x => `${x.name} (${castStatusLabel(x.status)}${x.rating ? ', ' + '★'.repeat(x.rating) : ''})`).join('; ')];
    }));
  }
  function castActor(r, c) {
    r.castId = c.id; c.status = 'cast';
    let person = P.people.find(p => p.type === 'cast' && normChar(p.character) === normChar(r.name));
    if (!person) { person = { id: uid(), type: 'cast', name: '', character: r.name.toUpperCase(), dept: '', role: '', phone: '', email: '', agent: '', notes: '' }; P.people.push(person); }
    person.name = c.name; if (c.photo && !person.photo) person.photo = c.photo;
    if (/@/.test(c.contact)) person.email = c.contact; else if (/\d{5,}/.test(c.contact)) person.phone = c.contact;
    Store.touch(); draw(); toast(`${c.name || 'Actor'} is cast as ${r.name} and added to Cast & Crew`);
  }

  function drawLeft() {
    left.innerHTML = '';
    left.append(h('h3', { style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', marginBottom: '8px' } }, `Roles (${C.roles.length})`));
    const open = C.roles.filter(r => !r.castId).length;
    if (C.roles.length) left.append(h('div', { class: 'small muted', style: { marginBottom: '10px' } }, `${C.roles.length - open} of ${C.roles.length} cast`), h('div', { class: 'progress', style: { marginBottom: '12px' } }, h('i', { style: { width: (C.roles.length ? (C.roles.length - open) / C.roles.length * 100 : 0) + '%' } })));
    C.roles.forEach(r => { const st = roleState(r);
      left.append(h('div', { class: 'frame-i' + (r.id === sel ? ' on' : ''), style: { marginBottom: '6px', flexDirection: 'column', alignItems: 'stretch', gap: '3px' }, onclick: () => { sel = UI.castRole = r.id; draw(); } },
        h('b', {}, r.name || '(unnamed role)'), h('span', { class: 'small', style: { color: st.key === 'cast' ? 'var(--ok)' : 'var(--muted)', fontWeight: st.key === 'cast' ? 700 : 500 } }, st.label))); });
  }
  function drawMain() {
    main.innerHTML = '';
    const r = role();
    if (!r) { main.append(h('div', { class: 'empty', style: { margin: 'auto' } }, h('h3', {}, 'Plan your casting'), h('p', { style: { maxWidth: '46ch' } }, 'Create a role for each part, shortlist actors with photos and ratings, track auditions and callbacks, then cast — the actor is added to Cast & Crew and your call sheets automatically.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: fromScript }, icon('wand', 15), 'Roles from script'), h('button', { class: 'btn', onclick: addRole }, 'Add a role')))); return; }
    const fld = (label, key, o = {}) => h('div', { class: 'field', style: { marginBottom: 0, flex: o.flex || '1 1 200px' } }, h('label', { class: 'lbl' }, label),
      h(o.area ? 'textarea' : 'input', { class: 'inp', 'data-f': key, rows: 2, value: r[key] || '', placeholder: o.ph || '', oninput: e => { r[key] = e.target.value; Store.touch(); if (key === 'name') drawLeftSoft(); } }));
    const castC = r.candidates.find(x => x.id === r.castId);
    main.append(h('div', { class: 'row wrap', style: { alignItems: 'flex-end', gap: '12px' } }, fld('Role', 'name', { ph: 'e.g. MARGOT KELLER' }), fld('Age / type', 'age', { ph: '60s', flex: '0 1 150px' }), h('span', { class: 'grow' }),
      h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(`Delete the role “${r.name || 'unnamed'}” and its candidates?`)) { C.roles = C.roles.filter(x => x !== r); sel = UI.castRole = C.roles[0] && C.roles[0].id; Store.touch(); draw(); } } }, icon('trash', 15))),
      h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '12px' } }, fld('Description', 'desc', { area: true, ph: 'Who is this character? Look, voice, skills needed…', flex: '2 1 320px' }), fld('Casting notes', 'notes', { area: true, ph: 'Availability, rate, special requirements…' })),
      castC ? h('div', { class: 'csalert', style: { background: 'color-mix(in srgb, var(--ok) 14%, var(--surface))', borderColor: 'var(--ok)', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' } }, icon('check', 16), h('b', {}, 'Cast: ' + (castC.name || 'actor')), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: () => { r.castId = ''; Store.touch(); draw(); } }, 'Reopen role')) : null,
      h('div', { class: 'row', style: { marginTop: '6px' } }, h('h3', { class: 'grow', style: { fontSize: '15px' } }, `Candidates (${r.candidates.length})`),
        h('button', { class: 'btn primary sm', onclick: () => { r.candidates.push(newCandidate()); Store.touch(); draw(); setTimeout(() => { const i = $$('.cand .cname', main).pop(); i && i.focus(); }, 30); } }, icon('plus', 14), 'Add candidate')),
      h('div', { class: 'cast-grid' }, r.candidates.length ? r.candidates.map(c => candCard(r, c)) : h('div', { class: 'muted', style: { padding: '14px 0' } }, 'No candidates yet — add actors you are considering.')));
    autosizeAll(main);
  }
  function drawLeftSoft() { const els = $$('.frame-i b', left); C.roles.forEach((x, i) => { if (els[i]) els[i].textContent = x.name || '(unnamed role)'; }); }
  function candCard(r, c) {
    const isCast = r.castId === c.id;
    return h('div', { class: 'cand' + (isCast ? ' iscast' : '') + (c.status === 'passed' ? ' passed' : '') },
      h('div', { class: 'photo', style: c.photo ? { backgroundImage: `url(${c.photo})` } : {}, title: 'Click to add a headshot', onclick: async () => { const f = await pickFile('image/*'); if (f) { c.photo = await readImage(f, 600); Store.touch(); draw(); } } }, c.photo ? '' : h('span', { class: 'row small' }, icon('user', 18), 'Headshot')),
      h('div', { class: 'cbody' },
        h('input', { class: 'cell cname', style: { fontWeight: 700 }, placeholder: 'Actor name', value: c.name, oninput: e => { c.name = e.target.value; Store.touch(); } }),
        h('input', { class: 'cell', placeholder: 'Email / phone / agent', value: c.contact, oninput: e => { c.contact = e.target.value; Store.touch(); } }),
        h('div', { class: 'stars', title: 'Rating' }, [1, 2, 3, 4, 5].map(n => h('button', { class: n <= c.rating ? 'on' : '', 'aria-label': n + ' stars', onclick: () => { c.rating = c.rating === n ? 0 : n; Store.touch(); draw(); } }, '★'))),
        h('div', { class: 'row', style: { gap: '6px' } }, h('select', { class: 'cell', onchange: e => { c.status = e.target.value; Store.touch(); draw(); } }, CAST_STATUS.filter(s => s[0] !== 'cast' || isCast).map(([k, l]) => h('option', { value: k, selected: k === c.status }, l))),
          h('input', { class: 'cell', type: 'date', title: 'Audition / callback date', value: c.date, onchange: e => { c.date = e.target.value; Store.touch(); } })),
        h('textarea', { class: 'cell auto', rows: 2, placeholder: 'Audition notes…', value: c.notes, oninput: e => { c.notes = e.target.value; autosize(e.target); Store.touch(); } }),
        h('div', { class: 'row' }, isCast ? h('span', { class: 'pill', style: { background: 'var(--ok)', color: '#fff' } }, 'Cast') : h('button', { class: 'btn sm primary', onclick: () => castActor(r, c) }, 'Cast this actor'), h('span', { class: 'grow' }),
          ibtn('trash', 'Remove candidate', () => { r.candidates = r.candidates.filter(x => x !== c); if (r.castId === c.id) r.castId = ''; Store.touch(); draw(); }, 'danger'))));
  }
  function draw() { drawLeft(); drawMain(); }
  draw();
}
