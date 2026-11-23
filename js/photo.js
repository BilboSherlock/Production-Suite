'use strict';
/* ===================================================================
   Photo shoot suite — brief, setups & looks, photo shot list, run of
   show, gear & rentals, releases & permits, selects & approvals.
   A photo project reuses the script's scene blocks as SETUPS
   ("Name — Location — Time"), so schedule, call sheets, breakdown,
   budget, people, locations and reports all work unchanged.
   =================================================================== */
const SHOT_STATUS = ['Planned', 'Shot', 'Selected', 'Retouching', 'Client review', 'Approved', 'Delivered'];
const SHOT_TONE = { Planned: '#8a8f98', Shot: '#2468d8', Selected: '#7a45c9', Retouching: '#e8830c', 'Client review': '#d6409f', Approved: '#1e8e54', Delivered: '#0a7a3d' };
const ORIENT = ['Portrait', 'Landscape', 'Square', 'Panoramic'];
const PH = P => P.photo;
const letterOf = i => i < 26 ? String.fromCharCode(65 + i) : '-' + (i + 1);
const newPhotoShot = (sceneId, o = {}) => Object.assign({ id: uid(), sceneId, title: '', subject: '', orient: 'Portrait', camera: '', lens: '', lighting: '', pose: '', wardrobe: '', props: '', hair: '', notes: '', ref: '', hero: false, status: 'Planned', must: true }, o);
function photoShotLabel(P, s, scenes) {
  const sc = (scenes || getScenes(P)).find(x => x.id === s.sceneId); if (!sc) return '?';
  const sib = P.photo.shots.filter(x => x.sceneId === s.sceneId); return sc.num + letterOf(sib.indexOf(s));
}
async function thumbOf(file, max = 300, q = 0.62) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return { thumb: c.toDataURL('image/jpeg', q), w: img.width, h: img.height };
  } finally { URL.revokeObjectURL(url); }
}
const pageShell = (title, sub, ...right) => h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, title), sub ? h('div', { class: 'muted small', style: { marginTop: '3px' } }, sub) : null), h('span', { class: 'grow' }), h('div', { class: 'row', style: { flexWrap: 'wrap' } }, right));
const fld = (label, el, w) => h('div', { class: 'field', style: Object.assign({ marginBottom: 0 }, w ? { flex: w } : {}) }, h('label', { class: 'lbl' }, label), el);
const tin = (obj, key, o = {}) => { const e = h(o.area ? 'textarea' : 'input', { class: 'inp', rows: o.rows || 3, type: o.type, list: o.list, placeholder: o.ph || '', value: obj[key] || '', oninput: ev => { obj[key] = ev.target.value; Store.touch(); o.after && o.after(); } }); return e; };
const sel = (obj, key, opts, after) => h('select', { class: 'inp', onchange: e => { obj[key] = e.target.value; Store.touch(); after && after(); } }, opts.map(x => h('option', { value: x, selected: x === obj[key] }, x)));
const statusPill = s => h('span', { class: 'pill', style: { background: SHOT_TONE[s] || '#888', color: '#fff' } }, s);

/* ---------------------------------------------------------------
   Setups & looks
   --------------------------------------------------------------- */
const setupHeading = (name, loc, time) => [name, loc, time].map(x => (x || '').replace(/\s+—\s+/g, ' - ').trim()).reduce((a, x, i, arr) => (i === 0 || x || arr.slice(i + 1).some(Boolean)) ? a.concat(x) : a, []).join(' — ');
function setupParts(b) { const pr = (b.text || '').split(/\s+—\s+/); return { name: pr[0] || '', loc: pr[1] || '', time: pr[2] || '' }; }
Views.setups = function (root) {
  const P = Store.P, wrap = h('div', { class: 'page', style: { maxWidth: '1100px' } }), list = h('div', { class: 'setup-list' });
  const dl = h('datalist', { id: 'dl-locs' }, P.locations.map(l => h('option', { value: l.name })));
  root.append(wrap, dl);
  const addSetup = (at) => {
    const sc = { id: uid(), type: 'scene', text: `Setup ${P.blocks.filter(b => b.type === 'scene').length + 1}` }, nt = { id: uid(), type: 'action', text: '' };
    const scenes = getScenes(P); let idx = P.blocks.length; if (at != null && scenes[at]) idx = scenes[at].end;
    P.blocks.splice(idx, 0, sc, nt); Store.touch(); draw();
  };
  const move = (i, d) => {
    const scenes = getScenes(P), a = scenes[i], b = scenes[i + d]; if (!a || !b) return;
    const first = d < 0 ? b : a, second = d < 0 ? a : b, chunk1 = P.blocks.slice(first.idx, first.end), chunk2 = P.blocks.slice(second.idx, second.end);
    P.blocks.splice(first.idx, chunk1.length + chunk2.length, ...chunk2, ...chunk1); Store.touch(); draw();
  };
  const remove = async s => {
    const n = sceneDataCount(P, s.id), msg = n ? `Delete “${s.label}”? Its ${n} linked shots, tags and schedule entries stay in the project but become unattached (Backup → Clean up unused data removes them).` : `Delete “${s.label}”?`;
    if (!(await confirmBox(msg, 'Delete'))) return;
    const b = P.blocks.findIndex(x => x.id === s.id); P.blocks.splice(b, s.end - s.idx); Store.touch(); draw();
  };
  function card(s, i) {
    const b = P.blocks[s.idx], parts = setupParts(b), meta = P.sceneMeta[s.id] = P.sceneMeta[s.id] || {}, scenes = getScenes(P);
    const notesBlk = P.blocks.slice(s.idx + 1, s.end).find(x => x.type === 'action') || (() => { const nb = { id: uid(), type: 'action', text: '' }; P.blocks.splice(s.idx + 1, 0, nb); return nb; })();
    const recompose = () => { b.text = setupHeading(parts.name, parts.loc, parts.time); const L = P.locations.find(l => l.name.toLowerCase() === (parts.loc || '').trim().toLowerCase()); if (L) meta.locationId = L.id; else if (meta.locationId && !P.locations.some(l => l.id === meta.locationId && l.name.toLowerCase() === parts.loc.trim().toLowerCase())) delete meta.locationId; Store.touch(); };
    const shots = P.photo.shots.filter(x => x.sceneId === s.id), done = shots.filter(x => ['Approved', 'Delivered'].includes(x.status)).length;
    const day = P.days.findIndex(d => d.sceneIds.includes(s.id));
    const cast = [...sceneCast(P, s)], people = P.people.filter(p => p.type === 'cast');
    return h('div', { class: 'card setup-card', style: { borderLeft: `4px solid ${meta.color || 'var(--border)'}` } },
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('div', { class: 'setup-n' }, s.num), h('div', { style: { flex: 1 } }, h('b', { style: { fontFamily: 'var(--head)', fontSize: '17px' } }, parts.name || 'Untitled setup')),
        day >= 0 ? h('span', { class: 'pill' }, `Day ${day + 1}`) : h('span', { class: 'pill muted' }, 'Not scheduled'), h('span', { class: 'pill' }, `${shots.length} shot${shots.length === 1 ? '' : 's'}${shots.length ? ` · ${done} done` : ''}`),
        ibtn('up', 'Move up', () => move(i, -1)), ibtn('down', 'Move down', () => move(i, 1)), ibtn('copy', 'Duplicate setup', () => { const chunk = P.blocks.slice(s.idx, s.end).map(x => ({ ...x, id: uid() })); chunk[0].text += ' (copy)'; P.blocks.splice(s.end, 0, ...chunk); Store.touch(); draw(); }), ibtn('trash', 'Delete setup', () => remove(s), 'danger')),
      h('div', { class: 'setup-grid' },
        fld('Setup / look name', h('input', { class: 'inp', value: parts.name, oninput: e => { parts.name = e.target.value; recompose(); } })),
        fld('Location', h('input', { class: 'inp', list: 'dl-locs', value: parts.loc, placeholder: 'Studio A, Rooftop…', oninput: e => { parts.loc = e.target.value; recompose(); } })),
        fld('Slot / time of day', h('input', { class: 'inp', value: parts.time, placeholder: 'Morning, Golden hour…', oninput: e => { parts.time = e.target.value; recompose(); } })),
        fld('Est. time (min)', h('input', { class: 'inp', type: 'number', min: 0, step: 15, value: meta.est || '', placeholder: '90', oninput: e => { meta.est = e.target.value; Store.touch(); } })),
        fld('Concept / look', h('textarea', { class: 'inp', rows: 2, placeholder: 'What is this setup trying to say?', value: meta.synopsis || '', oninput: e => { meta.synopsis = e.target.value; Store.touch(); } }), '2 1 100%'),
        fld('Notes (lighting, styling, product…)', h('textarea', { class: 'inp', rows: 2, value: notesBlk.text, placeholder: 'Anything the team needs. Select words in the Breakdown to tag props and wardrobe.', oninput: e => { notesBlk.text = e.target.value; Store.touch(); } }), '2 1 100%')),
      h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('span', { class: 'small muted' }, 'Talent:'), ...cast.map(c => h('span', { class: 'castchip' }, c, h('button', { class: 'x', title: 'Remove', onclick: () => { const t = P.tags.find(z => z.sceneId === s.id && z.cat === 'cast' && normChar(z.text) === c); if (t) removeTag(P, t); else toast('This talent comes from the notes text, not a tag.', true); draw(); } }, '×'))),
        h('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px' }, onchange: e => { if (e.target.value) { tagElement(P, s.id, 'cast', e.target.value); draw(); } } }, h('option', { value: '' }, '+ Add talent'), people.filter(p => (p.character || p.name) && !cast.includes(normChar(p.character || p.name))).map(p => h('option', { value: p.character || p.name }, p.name || p.character))),
        h('span', { class: 'grow' }), h('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px' }, title: 'Colour label', onchange: e => { meta.color = e.target.value; Store.touch(); draw(); } }, [['', 'No colour'], ['#e5484d', 'Red'], ['#e8830c', 'Orange'], ['#ca8a04', 'Yellow'], ['#1e8e54', 'Green'], ['#2468d8', 'Blue'], ['#7a45c9', 'Purple'], ['#d6409f', 'Pink']].map(([v, l]) => h('option', { value: v, selected: v === (meta.color || '') }, l))),
        h('a', { class: 'btn sm', href: `#/p/${P.id}/photoshots`, onclick: () => { UI.phSetup = s.id; } }, icon('camera', 14), 'Shots'), h('a', { class: 'btn sm', href: `#/p/${P.id}/breakdown`, onclick: () => { UI.scene = s.id; } }, icon('tag', 14), 'Breakdown')));
  }
  function draw() {
    const scenes = getScenes(P); wrap.replaceChildren(pageShell('Setups & looks', `${scenes.length} setup${scenes.length === 1 ? '' : 's'} — each is a lighting set-up, look or scene you shoot. They drive the schedule, call sheets and breakdown.`,
      h('button', { class: 'btn', onclick: () => printTable('Setup list', ['#', 'Setup', 'Location', 'Slot', 'Est. min', 'Concept', 'Shots'], scenes.map(s => { const pt = setupParts(P.blocks[s.idx]); return [s.num, pt.name, pt.loc, pt.time, (P.sceneMeta[s.id] || {}).est || '', s.synopsis, P.photo.shots.filter(x => x.sceneId === s.id).length]; })) }, icon('print', 15), 'Print'),
      h('button', { class: 'btn primary', onclick: () => addSetup() }, icon('plus', 15), 'Add setup')), list);
    list.replaceChildren(...(scenes.length ? scenes.map(card) : [h('div', { class: 'empty' }, h('h3', {}, 'No setups yet'), h('p', {}, 'Add your first setup — for example “Hero beauty — Studio A — Morning”.'), h('button', { class: 'btn primary', onclick: () => addSetup() }, 'Add setup'))]));
  }
  draw();
};

/* ---------------------------------------------------------------
   Shoot brief
   --------------------------------------------------------------- */
Views.brief = function (root) {
  const P = Store.P, B = P.photo.brief, wrap = h('div', { class: 'page', style: { maxWidth: '1000px' } }); root.append(wrap);
  const row = (...c) => h('div', { class: 'row', style: { gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '12px' } }, c.map(x => h('div', { style: { flex: '1 1 220px' } }, x)));
  const table = (title, arr, cols, blank, hint) => {
    const box = h('div'); const draw = () => { box.replaceChildren(h('div', { class: 'row', style: { marginBottom: '6px' } }, h('h3', { style: { fontSize: '15px' } }, title), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => { arr.push(blank()); Store.touch(); draw(); } }, icon('plus', 14), 'Add')),
      arr.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, [...cols.map(c => c[1]), ''].map(x => h('th', {}, x)))), h('tbody', {}, arr.map(r => h('tr', {}, ...cols.map(([k, , o]) => h('td', {}, o && o.select ? sel(r, k, o.select) : h('input', { class: 'cell', type: o && o.type, value: r[k] || '', placeholder: (o && o.ph) || '', oninput: e => { r[k] = e.target.value; Store.touch(); } }))), h('td', { style: { width: '40px' } }, ibtn('trash', 'Remove', () => { arr.splice(arr.indexOf(r), 1); Store.touch(); draw(); }, 'danger')))))) : h('div', { class: 'small muted' }, hint)); };
    draw(); return box;
  };
  const printBrief = () => {
    const sec = (t, x) => x && String(x).trim() ? `<h3>${esc(t)}</h3><p style="white-space:pre-wrap">${esc(x)}</p>` : '';
    printNode(h('div', { class: 'print-doc', html: `<h1>${esc(P.title)} — Shoot brief</h1><div class="sub">${esc([B.client, B.campaign, B.photographer && 'Photographer: ' + B.photographer].filter(Boolean).join(' · '))}</div>
      ${sec('Concept', B.concept)}${sec('Mood & references', B.mood)}${sec('Objectives', B.objectives)}${sec('Key messages', B.messages)}
      <h3>Usage & licensing</h3><p>${esc([B.usage, B.territory && 'Territory: ' + B.territory, B.term && 'Term: ' + B.term, B.exclusivity && 'Exclusivity: ' + B.exclusivity].filter(Boolean).join(' · ') || '—')}</p>
      ${B.deliverables.length ? '<h3>Deliverables</h3><table><thead><tr><th>Deliverable</th><th>Ratio / spec</th><th>Qty</th><th>Channel</th><th>Due</th></tr></thead><tbody>' + B.deliverables.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.spec)}</td><td>${esc(d.qty)}</td><td>${esc(d.channel)}</td><td>${esc(d.due)}</td></tr>`).join('') + '</tbody></table>' : ''}
      ${B.approvers.length ? '<h3>Approvals</h3><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Sign-off</th></tr></thead><tbody>' + B.approvers.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.role)}</td><td>${esc(d.email)}</td><td>${esc(d.status)}</td></tr>`).join('') + '</tbody></table>' : ''}` }));
  };
  wrap.append(pageShell('Shoot brief', 'The creative and commercial brief everyone works from.', h('button', { class: 'btn', onclick: printBrief }, icon('print', 15), 'Print brief')),
    h('div', { class: 'card', style: { padding: '18px', marginBottom: '16px' } }, row(fld('Client / brand', tin(B, 'client')), fld('Campaign / title', tin(B, 'campaign')), fld('Lead photographer', tin(B, 'photographer'))), row(fld('Budget cap', tin(B, 'budgetCap', { ph: 'e.g. 85,000' })), fld('Shoot window', h('div', { class: 'small muted', style: { paddingTop: '8px' } }, P.days.length ? `${P.days.length} day${P.days.length > 1 ? 's' : ''} scheduled${P.days[0].date ? ' from ' + fmtDateShort(P.days[0].date) : ''}` : 'No shoot days yet — add them in Schedule.')))),
    h('div', { class: 'card', style: { padding: '18px', marginBottom: '16px' } }, fld('Concept', tin(B, 'concept', { area: true, rows: 4, ph: 'The big idea in a few sentences.' })), h('div', { style: { height: '12px' } }), row(fld('Mood, tone & references', tin(B, 'mood', { area: true, rows: 4 })), fld('Objectives', tin(B, 'objectives', { area: true, rows: 4 })), fld('Key messages', tin(B, 'messages', { area: true, rows: 4 })))),
    h('div', { class: 'card', style: { padding: '18px', marginBottom: '16px' } }, h('h3', { style: { fontSize: '15px', marginBottom: '10px' } }, 'Usage & licensing'), row(fld('Usage (media)', tin(B, 'usage', { ph: 'Print, OOH, digital, social…' })), fld('Territory', tin(B, 'territory', { ph: 'Worldwide, EU…' })), fld('Term', tin(B, 'term', { ph: '2 years' })), fld('Exclusivity', tin(B, 'exclusivity', { ph: 'Category exclusive' })))),
    h('div', { class: 'card', style: { padding: '18px', marginBottom: '16px' } }, table('Deliverables', B.deliverables, [['name', 'Deliverable', { ph: 'Hero key visual' }], ['spec', 'Ratio / spec', { ph: '4:5 · 4000px' }], ['qty', 'Qty', { type: 'number' }], ['channel', 'Channel', { ph: 'Instagram' }], ['due', 'Due', { type: 'date' }]], () => ({ id: uid(), name: '', spec: '', qty: '', channel: '', due: '' }), 'List every final image or crop you must hand over. Shots in the Photo shot list can be checked against these.')),
    h('div', { class: 'card', style: { padding: '18px' } }, table('Approvals & stakeholders', B.approvers, [['name', 'Name'], ['role', 'Role', { ph: 'Art director' }], ['email', 'Email', { type: 'email' }], ['status', 'Sign-off', { select: ['Pending', 'Approved', 'Changes requested'] }]], () => ({ id: uid(), name: '', role: '', email: '', status: 'Pending' }), 'Who has to approve selects and finals?')));
};

/* ---------------------------------------------------------------
   Photo shot list (list, board, print)
   --------------------------------------------------------------- */
Views.photoshots = function (root) {
  const P = Store.P, ph = P.photo; let scenes = getScenes(P);
  if (!scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'Add a setup first'), h('p', {}, 'Shots belong to setups (looks). Create your setups, then plan the frames for each.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/${P.mode === 'photo' ? 'setups' : 'script'}` }, 'Go to setups')))); return; }
  UI.phView = UI.phView || 'list'; const F = UI.phF = UI.phF || { setup: UI.phSetup || '', status: '', hero: false, q: '' }; if (UI.phSetup) { F.setup = UI.phSetup; UI.phSetup = null; }
  const wrap = h('div', { class: 'page', style: { maxWidth: '1280px' } }), body = h('div'), stats = h('div', { class: 'ps-stats' }); root.append(wrap, h('datalist', { id: 'dl-models' }, P.people.filter(p => p.type === 'cast').map(p => h('option', { value: p.name || p.character }))));
  const TF = UI.shotTagF = UI.shotTagF || { ids: new Set(), all: false };
  const visible = () => ph.shots.filter(s => passTags(s, TF) && (!F.setup || s.sceneId === F.setup) && (!F.status || s.status === F.status) && (!F.hero || s.hero) && (!F.q || JSON.stringify(Object.values(s).filter(v => typeof v === 'string' && v.length < 400)).toLowerCase().includes(F.q.toLowerCase())));
  const rowsFor = list => list.map(s => [photoShotLabel(P, s, scenes), (scenes.find(x => x.id === s.sceneId) || {}).label || '', s.title, s.subject, s.orient, [s.camera, s.lens].filter(Boolean).join(' · '), s.lighting, s.wardrobe, s.props, s.hair, s.hero ? '★' : '', s.status, s.notes, shotTagNames(P, s)]);
  const HEAD = ['Shot', 'Setup', 'Description', 'Subject', 'Format', 'Camera / lens', 'Lighting', 'Wardrobe', 'Props', 'Hair / makeup', 'Hero', 'Status', 'Notes', 'Tags'];
  const setStatus = (s, v) => { s.status = v; Store.touch(); draw(); };
  const add = (sceneId, n = 1) => { for (let i = 0; i < n; i++) { const last = ph.shots.filter(x => x.sceneId === sceneId).pop(); ph.shots.push(newPhotoShot(sceneId, last ? { subject: last.subject, camera: last.camera, lens: last.lens, lighting: last.lighting, wardrobe: last.wardrobe, hair: last.hair, orient: last.orient } : {})); } Store.touch(); draw(); };
  const removeShot = async s => { if (await confirmBox('Delete this shot?')) { ph.shots = ph.shots.filter(x => x !== s); (ph.selects || []).forEach(x => { if (x.shotId === s.id) x.shotId = ''; }); Store.touch(); draw(); } };
  const refPick = async s => { const f = (await pickFiles('image/*'))[0]; if (!f) return; s.ref = (await thumbOf(f, 520, 0.8)).thumb; Store.touch(); draw(); };
  function shotCard(s) {
    const lab = photoShotLabel(P, s, scenes), open = UI.phOpen === s.id;
    return h('div', { class: 'ps-card' + (s.hero ? ' hero' : ''), 'data-id': s.id },
      h('div', { class: 'ps-ref', style: s.ref ? { backgroundImage: `url(${s.ref})` } : {}, title: 'Reference image — click to set', onclick: () => refPick(s) }, s.ref ? '' : icon('image', 22)),
      h('div', { class: 'ps-main' },
        h('div', { class: 'row', style: { gap: '8px' } }, h('b', { class: 'ps-id' }, lab), h('input', { class: 'cell ps-title', value: s.title, placeholder: 'Describe the frame…', oninput: e => { s.title = e.target.value; Store.touch(); } }),
          h('button', { class: 'icon-btn' + (s.hero ? ' on' : ''), title: s.hero ? 'Hero shot' : 'Mark as hero shot', style: { color: s.hero ? '#e8a40c' : 'var(--muted)' }, onclick: () => { s.hero = !s.hero; Store.touch(); draw(); } }, icon('star', 17)),
          h('select', { class: 'cell ps-status', style: { background: SHOT_TONE[s.status], color: '#fff' }, onchange: e => setStatus(s, e.target.value) }, SHOT_STATUS.map(x => h('option', { selected: x === s.status }, x)))),
        h('div', { style: { margin: '6px 0 2px' } }, tagChips(P, s, () => { })),
        h('div', { class: 'ps-fields' }, fld('Subject / talent', tin(s, 'subject', { list: 'dl-models' })), fld('Format', sel(s, 'orient', ORIENT)), fld('Camera · lens', h('div', { class: 'row', style: { gap: '4px' } }, tin(s, 'camera', { ph: 'Body' }), tin(s, 'lens', { ph: '85mm' }))), fld('Lighting', tin(s, 'lighting', { ph: 'Key: 5ft octa left…' }))),
        open ? h('div', { class: 'ps-fields' }, fld('Pose / direction', tin(s, 'pose', { area: true, rows: 2 })), fld('Wardrobe', tin(s, 'wardrobe', { area: true, rows: 2 })), fld('Props', tin(s, 'props', { area: true, rows: 2 })), fld('Hair & makeup', tin(s, 'hair', { area: true, rows: 2 })), fld('Notes', tin(s, 'notes', { area: true, rows: 2 }))) : null,
        h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm ghost', onclick: () => { UI.phOpen = open ? null : s.id; draw(); } }, open ? 'Fewer details' : 'More details'),
          h('label', { class: 'row small', title: 'Must-have shot (counts toward coverage)' }, h('input', { type: 'checkbox', checked: s.must !== false, onchange: e => { s.must = e.target.checked; Store.touch(); draw(); } }), 'Must-have'), h('span', { class: 'grow' }),
          ibtn('copy', 'Duplicate', () => { const c = { ...s, id: uid(), status: 'Planned', hero: false, tags: [...(s.tags || [])] }; ph.shots.splice(ph.shots.indexOf(s) + 1, 0, c); Store.touch(); draw(); }), ibtn('trash', 'Delete shot', () => removeShot(s), 'danger'))));
  }
  function listView() {
    const vis = new Set(visible()), box = h('div');
    scenes.filter(sc => !F.setup || sc.id === F.setup).forEach(sc => {
      const mine = ph.shots.filter(s => s.sceneId === sc.id), shown = mine.filter(s => vis.has(s));
      if (!shown.length && (F.status || F.hero || F.q)) return;
      box.append(h('div', { class: 'ps-group' }, h('div', { class: 'row', style: { margin: '18px 0 8px' } }, h('div', { class: 'setup-n' }, sc.num), h('h3', { style: { fontSize: '17px' } }, sc.label), h('span', { class: 'small muted' }, `${mine.length} shot${mine.length === 1 ? '' : 's'}`), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: e => menu(e.currentTarget, [{ label: 'Add 5 shots', onClick: () => add(sc.id, 5) }, { label: 'Set all to “Shot”', onClick: () => { mine.forEach(s => s.status = 'Shot'); Store.touch(); draw(); } }, { label: 'Set all to “Approved”', onClick: () => { mine.forEach(s => s.status = 'Approved'); Store.touch(); draw(); } }]) }, icon('more', 14)),
        h('button', { class: 'btn sm primary', onclick: () => add(sc.id) }, icon('plus', 14), 'Add shot')), mine.length ? h('div', { class: 'ps-grid' }, shown.map(shotCard)) : h('div', { class: 'small muted' }, 'No shots planned for this setup yet.')));
    });
    return box;
  }
  function boardView() {
    const dragSt = { id: null }, vis = visible();
    return h('div', { class: 'pk-board' }, SHOT_STATUS.map(st => { const col = vis.filter(s => s.status === st);
      return h('div', { class: 'pk-col', ondragover: e => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: e => e.currentTarget.classList.remove('over'), ondrop: e => { e.preventDefault(); const s = ph.shots.find(x => x.id === dragSt.id || x.id === e.dataTransfer.getData('text/plain')); if (s) setStatus(s, st); } },
        h('div', { class: 'pk-h', style: { borderTopColor: SHOT_TONE[st] } }, h('b', {}, st), h('span', { class: 'pill' }, col.length)),
        col.map(s => h('div', { class: 'pk-card', draggable: 'true', ondragstart: e => { dragSt.id = s.id; e.dataTransfer.setData('text/plain', s.id); }, onclick: () => { UI.phView = 'list'; F.setup = s.sceneId; UI.phOpen = s.id; draw(); } },
          s.ref ? h('div', { class: 'pk-img', style: { backgroundImage: `url(${s.ref})` } }) : null, h('div', { class: 'row', style: { gap: '6px' } }, h('b', {}, photoShotLabel(P, s, scenes)), s.hero ? h('span', { style: { color: '#e8a40c' } }, '★') : null), h('div', { class: 'small' }, s.title || '—'), s.subject ? h('div', { class: 'small muted' }, s.subject) : null))); }));
  }
  function draw() {
    scenes = getScenes(P); const all = ph.shots.filter(s => scenes.some(x => x.id === s.sceneId)), must = all.filter(s => s.must !== false), done = must.filter(s => ['Shot', 'Selected', 'Retouching', 'Client review', 'Approved', 'Delivered'].includes(s.status)).length;
    const counts = SHOT_STATUS.map(st => [st, all.filter(s => s.status === st).length]);
    stats.replaceChildren(h('div', { class: 'ps-bar' }, counts.filter(c => c[1]).map(([st, n]) => h('i', { style: { flex: n, background: SHOT_TONE[st] }, title: `${st}: ${n}` }))), h('div', { class: 'small muted' }, `${all.length} shots · ${all.filter(s => s.hero).length} hero · ${done}/${must.length} must-haves captured · ${counts.map(([st, n]) => n ? `${n} ${st.toLowerCase()}` : '').filter(Boolean).join(' · ')}`));
    wrap.replaceChildren(pageShell('Photo shot list', 'Plan every frame, track it from capture to delivery.',
      h('div', { class: 'seg' }, [['list', 'List'], ['board', 'Status board']].map(([k, l]) => h('button', { class: UI.phView === k ? 'on' : '', onclick: () => { UI.phView = k; draw(); } }, l))),
      h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-photo-shots.csv', toCSV([HEAD, ...rowsFor(visible())]), 'text/csv') }, icon('download', 15), 'CSV'),
      h('button', { class: 'btn', onclick: () => printTable('Photo shot list', HEAD.filter((_, i) => ![9, 12].includes(i)), rowsFor(visible()).map(r => r.filter((_, i) => ![9, 12].includes(i)))) }, icon('print', 15), 'Print')),
      stats, tagFilterBar(P, TF, draw), h('div', { class: 'row wrap', style: { margin: '12px 0' } },
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { F.setup = e.target.value; draw(); } }, h('option', { value: '' }, 'All setups'), scenes.map(s => h('option', { value: s.id, selected: s.id === F.setup }, `${s.num}. ${s.label}`.slice(0, 60)))),
        h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { F.status = e.target.value; draw(); } }, h('option', { value: '' }, 'Any status'), SHOT_STATUS.map(st => h('option', { selected: st === F.status }, st))),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: F.hero, onchange: e => { F.hero = e.target.checked; draw(); } }), 'Hero shots only'),
        h('input', { class: 'inp', placeholder: 'Search shots…', value: F.q, style: { width: '200px' }, oninput: e => { F.q = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(drawBody, 250); } })), body);
    drawBody();
  }
  function drawBody() { body.replaceChildren(UI.phView === 'board' ? boardView() : listView()); }
  draw();
};
