'use strict';
/* ===================================================================
   Casting — VIEW. Roles, candidates, auditions, shortlist, and
   "cast this actor". Rules: js/models/casting.model.js; screen state
   and commands: js/viewmodels/casting.vm.js. Shown as the Casting tab
   of Cast & Crew.
   =================================================================== */
/* older global names, used by search and data loading */
const CAST_STATUS = CastingModel.STATUS;
const castStatusLabel = k => CastingModel.statusLabel(k);
const newRole = name => CastingModel.newRole(name);
const newCandidate = () => CastingModel.newCandidate();
const roleState = r => CastingModel.state(r);

/** builds the Casting tab into root → cleanup */
function mountCasting(root) {
  const vm = new CastingVM();
  const left = h('div', { class: 'stage-side' }), main = h('div', { class: 'stage-main', style: { overflow: 'auto' } });
  root.append(h('div', { class: 'script-wrap' },
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: addRole }, icon('plus', 15), 'Add role'),
      h('button', { class: 'btn', onclick: fromScript }, icon('wand', 15), 'Roles from script'), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => { const s = vm.sheet; printTable('Casting sheet', s.head, s.rows); } }, icon('print', 15), 'Casting sheet')),
    h('div', { class: 'stage-wrap' }, left, main)));
  const focusLast = sel => setTimeout(() => { const i = $$(sel, main).pop(); i && i.focus(); }, 30);

  function addRole() { vm.addRole(); focusLast('[data-f=name]'); }
  function fromScript() { const n = vm.rolesFromScript(); toast(n ? `Added ${n} role${n > 1 ? 's' : ''} from the script` : 'Every character already has a role', !n); }
  async function removeRole(r) { if (await confirmBox(`Delete the role “${r.name || 'unnamed'}” and its candidates?`)) vm.removeRole(); }
  function cast(c) { vm.cast(c.id); toast(`${c.name || 'Actor'} is cast as ${vm.role.name} and added to Cast & Crew`); }
  async function headshot(c) { const f = await pickFile('image/*'); if (f) vm.updateCandidate(c.id, 'photo', await readImage(f, 600)); }

  function drawLeft() {
    const pr = vm.progress;
    morph(left, [h('h3', { 'data-key': 'h', style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', marginBottom: '8px' } }, `Roles (${pr.total})`),
      pr.total ? h('div', { 'data-key': 'n', class: 'small muted', style: { marginBottom: '10px' } }, `${pr.done} of ${pr.total} cast`) : null,
      pr.total ? h('div', { 'data-key': 'bar', class: 'progress', style: { marginBottom: '12px' } }, h('i', { style: { width: pr.pct + '%' } })) : null,
      ...vm.roleList.map(({ r, on, state: st }) => h('div', { 'data-key': r.id, class: 'frame-i' + (on ? ' on' : ''), style: { marginBottom: '6px', flexDirection: 'column', alignItems: 'stretch', gap: '3px' }, onclick: () => vm.select(r.id) },
        h('b', {}, r.name || '(unnamed role)'), h('span', { class: 'small', style: { color: st.key === 'cast' ? 'var(--ok)' : 'var(--muted)', fontWeight: st.key === 'cast' ? 700 : 500 } }, st.label)))]);
  }
  function candCard(r, c) {
    const isCast = r.castId === c.id, set = k => e => vm.updateCandidate(c.id, k, e.target.value, { quiet: true });
    return h('div', { 'data-key': c.id, class: 'cand' + (isCast ? ' iscast' : '') + (c.status === 'passed' ? ' passed' : '') },
      h('div', { class: 'photo', style: c.photo ? { backgroundImage: `url(${c.photo})` } : {}, title: 'Click to add a headshot', onclick: () => headshot(c) }, c.photo ? '' : h('span', { class: 'row small' }, icon('user', 18), 'Headshot')),
      h('div', { class: 'cbody' },
        h('input', { class: 'cell cname', style: { fontWeight: 700 }, placeholder: 'Actor name', value: c.name, oninput: set('name') }),
        h('input', { class: 'cell', placeholder: 'Email / phone / agent', value: c.contact, oninput: set('contact') }),
        h('div', { class: 'stars', title: 'Rating' }, [1, 2, 3, 4, 5].map(n => h('button', { class: n <= c.rating ? 'on' : '', 'aria-label': n + ' stars', onclick: () => vm.rate(c.id, n) }, '★'))),
        h('div', { class: 'row', style: { gap: '6px' } }, h('select', { class: 'cell', onchange: e => vm.setStatus(c.id, e.target.value) }, vm.statusChoices(r, c).map(([k, l]) => h('option', { value: k, selected: k === c.status }, l))),
          h('input', { class: 'cell', type: 'date', title: 'Audition / callback date', value: c.date, onchange: e => vm.updateCandidate(c.id, 'date', e.target.value) })),
        h('textarea', { class: 'cell auto', rows: 2, placeholder: 'Audition notes…', value: c.notes, oninput: e => { autosize(e.target); vm.updateCandidate(c.id, 'notes', e.target.value, { quiet: true }); } }),
        h('div', { class: 'row' }, isCast ? h('span', { class: 'pill', 'data-key': 'cast', style: { background: 'var(--ok)', color: '#fff' } }, 'Cast') : h('button', { class: 'btn sm primary', 'data-key': 'castbtn', onclick: () => cast(c) }, 'Cast this actor'), h('span', { class: 'grow' }),
          ibtn('trash', 'Remove candidate', () => vm.removeCandidate(c.id), 'danger'))));
  }
  function drawMain() {
    const r = vm.role;
    if (!r) return morph(main, h('div', { class: 'empty', 'data-key': 'empty', style: { margin: 'auto' } }, h('h3', {}, 'Plan your casting'), h('p', { style: { maxWidth: '46ch' } }, 'Create a role for each part, shortlist actors with photos and ratings, track auditions and callbacks, then cast — the actor is added to Cast & Crew and your call sheets automatically.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: fromScript }, icon('wand', 15), 'Roles from script'), h('button', { class: 'btn', onclick: addRole }, 'Add a role'))));
    /* the role's own fields; the name also shows in the list, so typing it redraws */
    const fld = (label, key, o = {}) => h('div', { class: 'field', style: { marginBottom: 0, flex: o.flex || '1 1 200px' } }, h('label', { class: 'lbl' }, label),
      h(o.area ? 'textarea' : 'input', { class: 'inp' + (o.area ? ' auto' : ''), 'data-f': key, rows: 2, value: r[key] || '', placeholder: o.ph || '', oninput: e => { if (o.area) autosize(e.target); vm.updateRole(key, e.target.value, { quiet: key !== 'name' }); } }));
    const castC = vm.castOf(r);
    morph(main, h('div', { 'data-key': 'role:' + r.id },
      h('div', { class: 'row wrap', style: { alignItems: 'flex-end', gap: '12px' } }, fld('Role', 'name', { ph: 'e.g. MARGOT KELLER' }), fld('Age / type', 'age', { ph: '60s', flex: '0 1 150px' }), h('span', { class: 'grow' }),
        h('button', { class: 'btn danger', title: 'Delete role', onclick: () => removeRole(r) }, icon('trash', 15))),
      h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '12px' } }, fld('Description', 'desc', { area: true, ph: 'Who is this character? Look, voice, skills needed…', flex: '2 1 320px' }), fld('Casting notes', 'notes', { area: true, ph: 'Availability, rate, special requirements…' })),
      castC ? h('div', { class: 'csalert', 'data-key': 'castalert', style: { background: 'color-mix(in srgb, var(--ok) 14%, var(--surface))', borderColor: 'var(--ok)', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' } }, icon('check', 16), h('b', {}, 'Cast: ' + (castC.name || 'actor')), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: () => vm.reopen() }, 'Reopen role')) : null,
      h('div', { class: 'row', 'data-key': 'candh', style: { marginTop: '6px' } }, h('h3', { class: 'grow', style: { fontSize: '15px' } }, `Candidates (${r.candidates.length})`),
        h('button', { class: 'btn primary sm', onclick: () => { vm.addCandidate(); focusLast('.cand .cname'); } }, icon('plus', 14), 'Add candidate')),
      h('div', { class: 'cast-grid', 'data-key': 'grid' }, r.candidates.length ? r.candidates.map(c => candCard(r, c)) : h('div', { class: 'muted', 'data-key': 'none', style: { padding: '14px 0' } }, 'No candidates yet — add actors you are considering.'))));
    autosizeAll(main);
  }
  return bindView(vm, () => { drawLeft(); drawMain(); });
}
