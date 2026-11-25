'use strict';
/* ===================================================================
   Shot tags — coloured labels on shots (VFX, Stunt, Drone, Hero…).
   Tag shots one by one or in bulk, filter the shot list by tag, and
   see every tagged shot in a report.
   =================================================================== */
const TAG_COLORS = ['#e5484d', '#e8830c', '#e8a40c', '#1e8e54', '#12a594', '#2468d8', '#6e56cf', '#d6409f', '#8a6d3b', '#687076'];
const TAG_PRESETS = [['Hero', '#e8a40c'], ['VFX', '#6e56cf'], ['Stunt', '#e5484d'], ['Drone', '#2468d8'], ['Insert', '#12a594'], ['Cutaway', '#8a6d3b'], ['Pickup', '#e8830c'], ['Green screen', '#1e8e54'], ['SFX', '#d6409f'], ['Night', '#3e63dd'], ['Water', '#00a2c7'], ['Crane / jib', '#7c6f64'], ['2nd unit', '#687076'], ['Handheld', '#ca8a04']];
const shotTagList = P => (P.shotTags = P.shotTags || []);
const tagById = (P, id) => shotTagList(P).find(t => t.id === id);
const shotTagIds = s => s.tags || (s.tags = []);
const allShotsOf = P => [...P.shots, ...((P.photo && P.photo.shots) || [])];
const tagCount = (P, id) => allShotsOf(P).filter(s => (s.tags || []).includes(id)).length;
const textOn = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff'; };
const tagPill = (t, extra = {}) => h('span', Object.assign({ class: 'stag', style: { background: t.color, color: textOn(t.color) }, title: t.dept ? `${t.name} — ${t.dept}` : t.name }, extra), t.name);
function newShotTag(P, name, color) {
  name = (name || '').trim(); if (!name) return null; const ex = shotTagList(P).find(t => t.name.toLowerCase() === name.toLowerCase()); if (ex) return ex;
  const t = { id: uid(), name, color: color || (TAG_PRESETS.find(p => p[0].toLowerCase() === name.toLowerCase()) || [0, TAG_COLORS[shotTagList(P).length % TAG_COLORS.length]])[1], dept: '' }; P.shotTags.push(t); return t;
}
const tagAdd = (s, id) => { if (!(s.tags || []).includes(id)) s.tags = [...(s.tags || []), id]; };
const tagDel = (s, id) => { s.tags = (s.tags || []).filter(x => x !== id); };
/* does a shot pass the tag filter? ids = Set; all = must carry every tag */
const passTags = (s, F) => ShotsModel.passTags(s, F);   // (js/models/shots.model.js)

/* the chips shown on a shot, with a + button */
function tagChips(P, shot, onChange) {
  const box = h('div', { class: 'stags' });
  const draw = () => { box.replaceChildren(...(shot.tags || []).map(id => tagById(P, id)).filter(Boolean).map(t => tagPill(t)), h('button', { class: 'stag add', title: 'Tag this shot', onclick: e => tagPopover(e.currentTarget, P, [shot], () => { draw(); onChange && onChange(); }) }, '+ tag')); };
  draw(); return box;
}
/* a popover with every tag as a checkbox; works for one shot or a selection (tri-state) */
function tagPopover(anchor, P, shots, onChange) {
  document.querySelectorAll('.tag-pop').forEach(x => x.remove());
  const pop = h('div', { class: 'tag-pop' }), r = anchor.getBoundingClientRect();
  const state = t => { const n = shots.filter(s => (s.tags || []).includes(t.id)).length; return n === 0 ? 0 : n === shots.length ? 2 : 1; };
  let q = '';
  const draw = () => {
    const list = shotTagList(P).filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()));
    pop.replaceChildren(h('input', { class: 'inp', placeholder: 'Find or create a tag…', value: q, autofocus: true, oninput: e => { q = e.target.value; draw(); const i = pop.querySelector('input'); i.focus(); i.setSelectionRange(q.length, q.length); }, onkeydown: e => { if (e.key === 'Enter' && q.trim()) { const t = newShotTag(P, q); shots.forEach(s => tagAdd(s, t.id)); q = ''; Store.touch(); onChange && onChange(); draw(); } else if (e.key === 'Escape') pop.remove(); } }),
      h('div', { class: 'tag-list' }, list.map(t => { const st = state(t); const cb = h('input', { type: 'checkbox', checked: st === 2, onchange: e => { shots.forEach(s => e.target.checked ? tagAdd(s, t.id) : tagDel(s, t.id)); Store.touch(); onChange && onChange(); draw(); } }); cb.indeterminate = st === 1; return h('label', { class: 'tag-opt' }, cb, tagPill(t), h('span', { class: 'small muted' }, String(tagCount(P, t.id)))); }),
        !list.length ? h('div', { class: 'small muted', style: { padding: '6px 4px' } }, q ? `Press Enter to create “${q}”` : 'No tags yet.') : null),
      h('div', { class: 'row', style: { marginTop: '6px', gap: '6px' } }, !shotTagList(P).length ? h('button', { class: 'btn sm', onclick: () => { TAG_PRESETS.forEach(([n, c]) => newShotTag(P, n, c)); Store.touch(); draw(); } }, 'Add common tags') : null, h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => { pop.remove(); openTagManager(P, onChange); } }, 'Manage…')));
  };
  document.body.append(pop); draw();
  const top = Math.min(r.bottom + 4, innerHeight - 340), left = Math.min(Math.max(8, r.left), innerWidth - 270); pop.style.top = Math.max(8, top) + 'px'; pop.style.left = left + 'px';
  const off = e => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener('mousedown', off, true); } }; setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  setTimeout(() => { const i = pop.querySelector('input'); i && i.focus(); }, 30);
}
/* rename, recolour, assign a department, merge or delete tags */
function openTagManager(P, onDone) {
  const box = h('div');
  const draw = () => {
    const tags = shotTagList(P);
    box.replaceChildren(h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Tags label shots so you can filter the shot list, brief a department or schedule by need — for example everything tagged VFX or Drone.'),
      tags.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Colour', 'Tag', 'Department', 'Shots', ''].map(x => h('th', {}, x)))), h('tbody', {}, tags.map(t => h('tr', {},
        h('td', { style: { width: '70px' } }, h('input', { type: 'color', class: 'colorpick', value: t.color, onchange: e => { t.color = e.target.value; Store.touch(); } })),
        h('td', {}, h('input', { class: 'cell', value: t.name, onchange: e => { const n = e.target.value.trim(); if (!n || tags.some(x => x !== t && x.name.toLowerCase() === n.toLowerCase())) { toast('Tag names must be unique.', true); e.target.value = t.name; return; } t.name = n; Store.touch(); } })),
        h('td', { style: { width: '170px' } }, h('input', { class: 'cell', list: 'dl-dept', value: t.dept || '', placeholder: 'e.g. Camera', oninput: e => { t.dept = e.target.value; Store.touch(); } })), h('td', { style: { width: '60px' } }, String(tagCount(P, t.id))),
        h('td', { style: { width: '120px', whiteSpace: 'nowrap' } }, h('button', { class: 'btn sm ghost', title: 'Merge into another tag', onclick: () => mergeTag(t) }, 'Merge'), ibtn('trash', 'Delete tag', async () => { if (await confirmBox(`Delete the tag “${t.name}”${tagCount(P, t.id) ? ` and remove it from ${tagCount(P, t.id)} shot${tagCount(P, t.id) > 1 ? 's' : ''}` : ''}?`)) { allShotsOf(P).forEach(s => tagDel(s, t.id)); P.shotTags = P.shotTags.filter(x => x !== t); Store.touch(); draw(); } }, 'danger'))))))
        : h('p', { class: 'muted' }, 'No tags yet.'),
      h('div', { class: 'row wrap', style: { marginTop: '12px', gap: '6px' } }, h('button', { class: 'btn sm', onclick: async () => { const n = await promptBox('New tag', 'Tag name', ''); if (n) { newShotTag(P, n); Store.touch(); draw(); } } }, icon('plus', 13), 'New tag'), h('span', { class: 'small muted' }, 'Suggestions:'),
        TAG_PRESETS.filter(([n]) => !tags.some(t => t.name.toLowerCase() === n.toLowerCase())).map(([n, c]) => h('button', { class: 'stag add', onclick: () => { newShotTag(P, n, c); Store.touch(); draw(); } }, '+ ' + n))));
  };
  function mergeTag(t) {
    const others = shotTagList(P).filter(x => x !== t); if (!others.length) return toast('Create another tag to merge into.', true);
    const sel = h('select', { class: 'inp' }, others.map(o => h('option', { value: o.id }, o.name)));
    modal({ title: `Merge “${t.name}”`, body: h('div', {}, h('p', { style: { marginTop: 0 } }, 'Every shot with this tag gets the tag below instead.'), sel), buttons: [{ label: 'Cancel' }, { label: 'Merge', primary: true, onClick: () => { allShotsOf(P).forEach(s => { if ((s.tags || []).includes(t.id)) { tagAdd(s, sel.value); tagDel(s, t.id); } }); P.shotTags = P.shotTags.filter(x => x !== t); Store.touch(); draw(); } }] });
  }
  draw(); modal({ title: 'Shot tags', wide: true, body: box, onClose: onDone, buttons: [{ label: 'Done', primary: true }] });
}
/* a filter bar: click tags to filter, choose any / all */
function tagFilterBar(P, F, onChange) {
  const tags = shotTagList(P); if (!tags.length) return h('div', { class: 'tag-bar' }, h('span', { class: 'small muted' }, 'Shot tags:'), h('button', { class: 'stag add', onclick: e => tagPopover(e.currentTarget, P, [], onChange) }, '+ Create tags'));
  return h('div', { class: 'tag-bar' }, h('span', { class: 'small muted' }, 'Filter by tag:'),
    tags.map(t => h('button', { class: 'stag fil' + (F.ids.has(t.id) ? ' on' : ''), style: F.ids.has(t.id) ? { background: t.color, color: textOn(t.color) } : { borderColor: t.color, color: 'var(--text)' }, onclick: () => { F.ids.has(t.id) ? F.ids.delete(t.id) : F.ids.add(t.id); onChange(); } }, t.name, h('span', { class: 'n' }, String(tagCount(P, t.id))))),
    h('button', { class: 'stag fil' + (F.ids.has('__none') ? ' on' : ''), onclick: () => { F.ids.has('__none') ? F.ids.delete('__none') : F.ids.add('__none'); onChange(); } }, 'Untagged'),
    F.ids.size > 1 ? h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: F.all, onchange: e => { F.all = e.target.checked; onChange(); } }), 'match all') : null,
    F.ids.size ? h('button', { class: 'btn sm ghost', onclick: () => { F.ids.clear(); onChange(); } }, 'Clear') : null, h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => openTagManager(P, onChange) }, 'Manage tags'));
}
const shotTagNames = (P, s) => ShotsModel.tagNames(P, s);
