'use strict';
/* ===================================================================
   Script breakdown — tag mentions in a scene; each links to a shared
   element (with profile, status, quantity, and who wears it).
   =================================================================== */
function tagHighlighter(tags, P) {
  if (!tags.length) return t => esc(t);
  const seen = new Map(); tags.forEach(t => { const k = singularKey(t.text); if (!seen.has(k)) seen.set(k, t); });
  const list = [...seen.values()].sort((a, b) => b.text.length - a.text.length);
  const re = new RegExp(`(?<![\\w])(?:${list.map(t => '(' + pluralPattern(t.text) + ')').join('|')})(?![\\w])`, 'gi');
  return text => {
    let out = '', last = 0;
    for (const m of text.matchAll(re)) {
      const gi = m.findIndex((x, i) => i > 0 && x !== undefined) - 1, t = list[gi], c = CATMAP[t.cat], x = P && t.itemId && itemById(P, t.itemId);
      out += esc(text.slice(last, m.index)) + `<mark class="tag" style="--c:${c.color}" title="${esc(c.label + (x ? ' · ' + x.name : ''))}">${esc(m[0])}</mark>`;
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  };
}

Views.breakdown = function (root) {
  const P = Store.P;
  let scenes = getScenes(P);
  if (!scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes yet'), h('p', {}, 'Write some scenes in the Script view first — the breakdown is built from your scene headings.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/script` }, 'Go to Script')))); return; }
  if (!scenes.find(s => s.id === UI.scene)) UI.scene = scenes[0].id;
  root.parentElement.classList.add('noscroll');
  const left = h('div', { class: 'bd-scenes' }), center = h('div', { class: 'bd-center' }), right = h('div', { class: 'bd-right' });
  const top = h('div', { class: 'toolbar' },
    h('div', { class: 'seg' }, h('button', { class: UI.bdMode === 'scene' ? 'on' : '', onclick: () => { UI.bdMode = 'scene'; draw(); } }, 'Scene breakdown'),
      h('button', { class: UI.bdMode === 'report' ? 'on' : '', onclick: () => { UI.bdMode = 'report'; draw(); } }, 'Element list')),
    h('span', { class: 'grow' }), h('span', { class: 'small muted' }, 'Select words in the script to tag them · each tag links to one shared element'),
    h('a', { class: 'btn sm', href: `#/p/${P.id}/props` }, icon('box', 14), 'Element manager'));
  root.append(h('div', { class: 'script-wrap' }, top, h('div', { class: 'bd' }, left, center, right)));
  let palette = null;

  const tagsOf = id => P.tags.filter(t => t.sceneId === id);
  const closePalette = () => { palette && palette.remove(); palette = null; };
  const sel = () => scenes.find(x => x.id === UI.scene);
  /* tag, and tell the user when something got linked or merged automatically */
  function addMention(sceneId, cat, text, o = {}) {
    const r = tagElement(P, sceneId, cat, text, o); if (!r) return null;
    if (r.item && !r.created && singularKey(r.item.name) !== singularKey(text)) toast(`“${text}” is the same as your existing “${r.item.name}” — linked`);
    else if (r.created && r.candidates) toast(`Created “${text}”. Several similar elements exist — use ⋮ → Merge if they are the same.`);
    return r;
  }
  const personFor = ch => P.people.find(p => p.type === 'cast' && normChar(p.character) === ch);

  /* ---------- left: scenes ---------- */
  function drawLeft() {
    left.innerHTML = '';
    const ul = h('ul', { class: 'navlist' });
    scenes.forEach(s => {
      const n = new Set(tagsOf(s.id).map(t => t.itemId || t.cat + singularKey(t.text))).size;
      ul.append(h('li', { class: s.id === UI.scene ? 'on' : '', onclick: () => { UI.scene = s.id; draw(); } },
        h('span', { class: 'num' }, s.num),
        h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'nh' }, s.label), h('div', { class: 'ns' }, `${s.ioe || '—'} · ${s.tod || '—'}`)),
        h('span', { class: 'np' }, n ? n + ' el.' : '')));
    });
    left.append(ul);
  }

  /* ---------- centre: scene strip + script ---------- */
  function drawScene() {
    const s = sel(), meta = P.sceneMeta[s.id] = P.sceneMeta[s.id] || {};
    center.innerHTML = '';
    const syn = h('textarea', { class: 'inp auto', rows: 2, placeholder: 'Scene synopsis — shows in the corkboard, stripboard and call sheets', value: meta.synopsis || '', oninput: e => { meta.synopsis = e.target.value; Store.touch(); autosize(e.target); } });
    const notes = h('textarea', { class: 'inp auto', rows: 2, placeholder: 'Production notes for this scene', value: meta.notes || '', oninput: e => { meta.notes = e.target.value; Store.touch(); autosize(e.target); } });
    const day = P.days.findIndex(d => d.sceneIds.includes(s.id)), nShots = P.shots.filter(x => x.sceneId === s.id).length, nFrames = P.boards.filter(x => x.sceneId === s.id).length;
    const locSel = h('select', { class: 'inp', onchange: e => {
      if (e.target.value === '__new') { const l = { id: uid(), name: s.location || s.label, address: '', contact: '', phone: '', permit: 'Not needed', cost: '', notes: '', photo: '' }; P.locations.push(l); meta.locationId = l.id; toast(`Created location “${l.name}”`); }
      else meta.locationId = e.target.value; Store.touch(); drawScene(); } },
      h('option', { value: '' }, '— not linked —'), P.locations.map(l => h('option', { value: l.id, selected: l.id === meta.locationId }, l.name || '(unnamed)')), h('option', { value: '__new' }, '+ New location from this heading'));
    const cast = [...sceneCast(P, s)], castTags = tagsOf(s.id).filter(t => t.cat === 'cast');
    const addCast = h('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px' }, onchange: async e => {
      let v = e.target.value; if (!v) return; if (v === '__new') { v = await promptBox('New character', 'Character name'); if (!v) return; v = v.toUpperCase(); }
      tagElement(P, s.id, 'cast', v); draw(); } }, h('option', { value: '' }, '+ Add cast (non-speaking)'), allCharNames(P).filter(c => !cast.includes(c)).map(c => h('option', { value: c }, c)), h('option', { value: '__new' }, 'New character…'));
    center.append(h('div', { class: 'strip-card' },
      h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, s.ioe ? h('span', { class: 'pill accent' }, s.ioe) : null, s.tod ? h('span', { class: 'pill accent' }, s.tod) : null, h('span', { class: 'pill' }, fmtEighths(s.eighths) + ' pgs'),
        day >= 0 ? h('a', { class: 'pill', href: `#/p/${P.id}/schedule`, title: 'Open the schedule' }, `Shoot day ${day + 1}`) : h('span', { class: 'pill', style: { opacity: .6 } }, 'Not scheduled'),
        h('a', { class: 'pill', href: `#/p/${P.id}/shots`, onclick: () => { UI.shotScene = s.id; } }, `${nShots} shot${nShots === 1 ? '' : 's'}`), h('a', { class: 'pill', href: `#/p/${P.id}/board` }, `${nFrames} frame${nFrames === 1 ? '' : 's'}`)),
      h('h2', {}, `${s.num}. ${s.label}`),
      h('div', { class: 'strip-grid' },
        h('div', {}, h('label', { class: 'lbl' }, 'Location'), locSel),
        h('div', {}, h('label', { class: 'lbl' }, 'Cast in this scene'), h('div', { class: 'whorow' },
          cast.map(n => { const p = personFor(n), tg = castTags.find(t => normChar(t.text) === n && !s.chars.has(n));
            return h('span', { class: 'castchip', title: p ? `${p.name || 'Actor'} — open profile` : 'No actor assigned yet' }, h('span', { onclick: () => { if (p) { UI.peopleTab = 'cast'; UI.openPerson = p.id; goto('people'); } else toast('Add this character in Cast & Crew to give them a profile.'); }, style: { cursor: 'pointer' } }, n, p && p.name ? h('i', {}, ' · ' + p.name) : null),
              tg ? h('button', { title: 'Remove from this scene', onclick: () => { removeTag(P, tg); draw(); } }, icon('x', 11)) : null); }),
          addCast))),
      h('div', { class: 'row', style: { gap: '14px', alignItems: 'flex-start', marginTop: '12px', flexWrap: 'wrap' } },
        h('div', { class: 'grow', style: { minWidth: '220px' } }, h('label', { class: 'lbl' }, 'Synopsis'), syn), h('div', { class: 'grow', style: { minWidth: '220px' } }, h('label', { class: 'lbl' }, 'Notes'), notes),
        h('div', { style: { width: '150px' } }, h('label', { class: 'lbl' }, 'Story day'), h('input', { class: 'inp', placeholder: 'e.g. Day 3', value: meta.storyDay || '', oninput: e => { meta.storyDay = e.target.value; Store.touch(); } })),
        h('div', { style: { width: '150px' } }, h('label', { class: 'lbl' }, 'Shoot time (min)'), h('input', { class: 'inp', type: 'number', min: 5, placeholder: '~' + Math.round(s.eighths / 8 * (+P.settings.minsPerPage || 60)), title: 'Your estimate for shooting this scene; leave blank to estimate from page length', value: meta.est || '', oninput: e => { if (e.target.value) meta.est = +e.target.value; else delete meta.est; Store.touch(); } })),
        h('div', { class: 'grow', style: { minWidth: '220px' } }, h('label', { class: 'lbl' }, 'Continuity notes'), h('textarea', { class: 'inp auto', rows: 2, placeholder: 'Injuries, weather, time of day, state of the set…', value: meta.continuity || '', oninput: e => { meta.continuity = e.target.value; Store.touch(); autosize(e.target); } })))));
    const mini = miniScene(P, s, tagHighlighter(tagsOf(s.id), P));
    mini.addEventListener('mouseup', () => {
      setTimeout(() => {
        closePalette();
        const sl = getSelection(), txt = sl.toString().trim().replace(/\s+/g, ' ');
        if (!txt || txt.length > 80 || !mini.contains(sl.anchorNode)) return;
        const r = sl.getRangeAt(0).getBoundingClientRect();
        const sugg = [];
        [['props', 'props'], ['wardrobe', 'wardrobe']].forEach(([kind, cat]) => { const f = findElement(P, kind, txt); (f.item ? [f.item] : f.candidates || []).forEach(x => sugg.push({ x, cat })); });
        const go = (cat, item) => {
          const allBox = $('.allbox', palette);
          if (allBox && allBox.checked) { const res = tagAllMentions(P, cat, txt, item || null); toast(`Tagged ${res.n} scene${res.n === 1 ? '' : 's'} that mention “${txt}”`); }
          else addMention(s.id, cat, txt, item ? { item } : {});
          sl.removeAllRanges(); closePalette(); draw();
        };
        palette = h('div', { class: 'palette wide' },
          sugg.length ? h('div', { class: 'psug' }, h('div', { class: 'small muted' }, 'Same as an existing element?'), h('div', { class: 'whorow' }, sugg.map(({ x, cat }) => h('button', { class: 'whochip', onmousedown: e => e.preventDefault(), onclick: () => go(cat, x) }, icon(kindOfItem(P, x) === 'wardrobe' ? 'shirt' : 'box', 12), ' ' + x.name)))) : null,
          h('div', { class: 'pgrid' }, CATS.map(c => h('button', { style: { '--c': c.color }, onmousedown: ev => ev.preventDefault(), onclick: () => go(c.k) }, h('i', { class: 'dot' }), c.label))),
          h('label', { class: 'row small', style: { padding: '6px 4px 0' } }, h('input', { type: 'checkbox', class: 'allbox' }), 'Tag all mentions in the script'));
        document.body.append(palette);
        palette.style.left = clamp(r.left + r.width / 2 - 160, 8, innerWidth - 340) + 'px';
        const ph = palette.offsetHeight;
        palette.style.top = (r.bottom + 8 + ph <= innerHeight - 8 ? r.bottom + 8 : r.top - ph - 8 >= 8 ? r.top - ph - 8 : Math.max(8, innerHeight - ph - 8)) + 'px';
      }, 10);
    });
    center.append(mini);
    autosizeAll(center);
  }

  /* ---------- right: elements ---------- */
  function mergePicker(x) {
    const kind = kindOfItem(P, x), others = P[kind].filter(o => o !== x);
    if (!others.length) return toast('There is nothing else to merge with yet.', true);
    const selEl = h('select', { class: 'inp', size: Math.min(8, others.length + 1) }, others.map(o => h('option', { value: o.id }, `${o.name}${o.aliases && o.aliases.length > 1 ? '  (also: ' + o.aliases.filter(a => singularKey(a) !== singularKey(o.name)).join(', ') + ')' : ''}`)));
    modal({ title: `Merge “${x.name}” into…`, body: h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Everything — scenes, photos, who wears it, notes and the words used in the script — moves into the element you pick. This cannot be split again.'), selEl),
      buttons: [{ label: 'Cancel' }, { label: 'Merge', primary: true, onClick: () => { const keep = others.find(o => o.id === selEl.value); if (!keep) return false; mergeItems(P, keep, [x]); toast(`Merged into “${keep.name}”`); draw(); } }] });
  }
  function elementMenu(btn, x, g, c, kind) {
    const it = [];
    if (x) {
      it.push({ label: 'Open profile', icon: 'user', onClick: () => { UI.itemTab = kind; UI.openItem = { kind, id: x.id }; goto('props'); } },
        { label: 'Rename…', icon: 'edit', onClick: async () => { const v = await promptBox('Rename element', 'Name', x.name); if (v) { x.aliases = x.aliases || [x.name]; if (!itemKeys(x).includes(singularKey(v))) x.aliases.push(v); x.name = v; Store.touch(); draw(); } } },
        { label: 'Merge into another element…', icon: 'copy', onClick: () => mergePicker(x) },
        { label: 'Tag all mentions in script', icon: 'search', onClick: () => { let n = 0; (x.aliases || [x.name]).forEach(a => { n += tagAllMentions(P, c.k, a, x).n; }); toast(`Linked ${n} mention${n === 1 ? '' : 's'} across the script`); draw(); } },
        { sep: true },
        { label: 'Remove from this scene', icon: 'x', onClick: () => { removeElementFromScene(P, x, UI.scene); draw(); } },
        { label: 'Delete element everywhere…', icon: 'trash', onClick: async () => { if (await confirmBox(`Delete “${x.name}”, its profile and all its mentions in the script breakdown?`)) { P.tags = P.tags.filter(t => t.itemId !== x.id); P[kind] = P[kind].filter(o => o !== x); Store.touch(); draw(); } } });
    } else it.push({ label: 'Remove', icon: 'x', onClick: () => { g.tags.forEach(t => removeTag(P, t)); draw(); } });
    menu(btn, it);
  }
  function drawRight() {
    const s = sel(); right.innerHTML = '';
    right.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h3', { class: 'grow', style: { fontSize: '15px' } }, 'Scene elements'),
      h('button', { class: 'btn sm', title: 'Add every speaking character as a Cast tag', onclick: () => { s.chars.forEach((_, c) => tagElement(P, s.id, 'cast', c)); draw(); toast('Cast detected from dialogue'); } }, icon('wand', 14), 'Auto-detect cast')));
    const cast = [...sceneCast(P, s)];
    CATS.forEach(c => {
      const kind = kindOfCat(c.k), groups = new Map();
      tagsOf(s.id).filter(t => t.cat === c.k).forEach(t => { const x = t.itemId && itemById(P, t.itemId), key = x ? x.id : c.k + ':' + singularKey(t.text); if (!groups.has(key)) groups.set(key, { item: x, tags: [] }); groups.get(key).tags.push(t); });
      const list = [...groups.values()], needsWho = c.k === 'wardrobe' || c.k === 'makeup';
      const dlId = 'dl-el-' + c.k, existing = kind ? P[kind].filter(x => !list.some(g => g.item === x) && (kind === 'wardrobe' ? (c.k === 'makeup') === (x.category === 'Makeup & hair') : true)) : [];
      const inp = h('input', { class: 'inp', list: kind ? dlId : null, placeholder: kind ? `Add ${c.label.toLowerCase()} — pick an existing one or type…` : `Add ${c.label.toLowerCase()}…`,
        onkeydown: e => { if (e.key === 'Enter' && inp.value.trim()) { const v = inp.value, ex = kind && P[kind].find(x => x.name === v); addMention(s.id, c.k, v, ex ? { item: ex } : {}); draw(); setTimeout(() => $(`[data-cat="${c.k}"] input`, right)?.focus(), 0); } } });
      const rows = list.map(g => {
        const x = g.item, name = x ? x.name : g.tags[0].text, variants = g.tags.filter(t => singularKey(t.text) !== singularKey(name) || g.tags.length > 1);
        return h('div', { class: 'el-row' },
          x ? h('div', { class: 'el-th', style: x.photos && x.photos[0] ? { backgroundImage: `url(${x.photos[0]})` } : {} }, x.photos && x.photos[0] ? '' : icon(kind === 'wardrobe' ? 'shirt' : 'box', 14)) : h('i', { class: 'dot', style: { '--c': c.color, marginTop: '4px' } }),
          h('div', { class: 'el-main' },
            h('div', { class: 'el-name' }, x ? h('a', { href: '#', title: 'Open profile', onclick: e => { e.preventDefault(); UI.itemTab = kind; UI.openItem = { kind, id: x.id }; goto('props'); } }, name) : name,
              x ? h('span', { class: statusClass(x.status) }, x.status) : null),
            variants.length ? h('div', { class: 'el-vars' }, 'as written: ', variants.map(t => h('span', { class: 'chip', style: { '--c': c.color } }, t.text, h('button', { title: 'Remove this mention', onclick: () => { removeTag(P, t); draw(); } }, icon('x', 11))))) : null),
          x ? h('input', { class: 'el-qty', type: 'number', min: 1, title: 'Quantity needed in this scene', value: sceneQtyOf(x, s.id), onchange: e => { x.sceneQty = x.sceneQty || {}; x.sceneQty[s.id] = Math.max(1, +e.target.value || 1); Store.touch(); } }) : null,
          h('button', { class: 'icon-btn', style: { width: '26px', height: '26px' }, 'aria-label': 'More', onclick: e => elementMenu(e.currentTarget, x, g, c, kind) }, icon('more', 15)));
      });
      let matrix = null;
      if (needsWho && list.some(g => g.item)) {
        const items = list.filter(g => g.item).map(g => g.item);
        matrix = h('div', { class: 'wmx' }, h('div', { class: 'small', style: { fontWeight: 650, margin: '8px 0 4px' } }, 'Who wears it in this scene'),
          cast.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), cast.map(n => h('th', { title: `Click to give everything here to ${n}`, style: { cursor: 'pointer' }, onclick: () => { items.forEach(x => setItemChars(x, s.id, [...new Set([...itemCharsIn(x, s.id), n])])); Store.touch(); drawRight(); } }, n.split(' ')[0])))),
            h('tbody', {}, items.map(x => h('tr', { class: itemCharsIn(x, s.id).length ? '' : 'unassigned' }, h('td', { title: itemCharsIn(x, s.id).length ? '' : 'Not assigned to anyone yet' }, x.name, itemCharsIn(x, s.id).length ? null : h('span', { class: 'warnpill', style: { marginLeft: '6px', padding: '0 6px' } }, '!')),
              cast.map(n => h('td', {}, h('input', { type: 'checkbox', checked: itemCharsIn(x, s.id).includes(n), 'aria-label': `${n} wears ${x.name}`, onchange: e => { const cur = itemCharsIn(x, s.id); setItemChars(x, s.id, e.target.checked ? [...cur, n] : cur.filter(z => z !== n)); Store.touch(); drawRight(); } }))))))) : h('div', { class: 'small muted' }, 'Add cast to this scene (above) to assign who wears what.'));
      }
      right.append(h('details', { class: 'cat', 'data-cat': c.k, open: list.length > 0 || (UI.bdOpen || {})[c.k], style: { '--c': c.color }, ontoggle: e => { UI.bdOpen = UI.bdOpen || {}; UI.bdOpen[c.k] = e.target.open; } },
        h('summary', {}, h('i', { class: 'dot' }), h('span', { class: 'grow' }, c.label), h('span', { class: 'pill' }, list.length)),
        h('div', { class: 'cb' }, ...rows, matrix, inp, kind ? h('datalist', { id: dlId }, existing.map(x => h('option', { value: x.name }))) : null)));
    });
  }

  /* ---------- element list (all scenes) ---------- */
  function drawReport() {
    left.classList.add('hidden'); right.classList.add('hidden'); center.innerHTML = '';
    const rows = elementRows(P, scenes), filter = UI.bdFilter || 'all', shown = rows.filter(r => filter === 'all' || r.cat.k === filter);
    const fSel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { UI.bdFilter = e.target.value; draw(); } }, h('option', { value: 'all' }, 'All categories'), CATS.map(c => h('option', { value: c.k, selected: c.k === filter }, c.label)));
    const data = shown.map(r => [r.cat.label, r.name, r.variants.filter(v => singularKey(v) !== singularKey(r.name)).join('; '), r.scenes.map(([n, q]) => n + (q > 1 ? ` ×${q}` : '')).join(', '), r.status || '']);
    center.append(h('div', { class: 'page', style: { padding: 0, maxWidth: '1100px' } },
      h('div', { class: 'page-h' }, h('h2', {}, 'Element list'), h('span', { class: 'grow' }), fSel,
        h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-elements.csv', toCSV([['Category', 'Element', 'Also called', 'Scenes', 'Status'], ...data]), 'text/csv') }, icon('download', 15), 'CSV'),
        h('button', { class: 'btn', onclick: () => printTable('Element list', ['Category', 'Element', 'Also called', 'Scenes', 'Status'], data, { landscape: false }) }, icon('print', 15), 'Print')),
      shown.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Category', 'Element', 'Also called', 'Scenes', 'Status'].map(x => h('th', {}, x)))),
        h('tbody', {}, shown.map((r, i) => h('tr', {}, h('td', { style: { '--c': r.cat.color } }, h('span', { class: 'row' }, h('i', { class: 'dot' }), r.cat.label)), h('td', {}, h('b', {}, r.name)), h('td', { class: 'muted' }, data[i][2]), h('td', {}, data[i][3]), h('td', {}, r.status ? h('span', { class: statusClass(r.status) }, r.status) : '')))))
        : h('div', { class: 'empty' }, h('h3', {}, 'Nothing tagged yet'), h('p', {}, 'Switch to Scene breakdown and select words in your script to tag props, wardrobe, vehicles and more.'))));
  }

  function draw() {
    closePalette(); scenes = getScenes(P);
    $$('.seg button', top).forEach((b, i) => b.classList.toggle('on', (i === 0) === (UI.bdMode === 'scene')));
    if (UI.bdMode === 'report') return drawReport();
    left.classList.remove('hidden'); right.classList.remove('hidden');
    drawLeft(); drawScene(); drawRight();
  }
  draw();
  const away = e => { if (palette && !palette.contains(e.target) && !e.target.closest('.mini')) closePalette(); };
  document.addEventListener('mousedown', away);
  return () => { closePalette(); document.removeEventListener('mousedown', away); root.parentElement.classList.remove('noscroll'); };
};

/* one row per element across the whole script, grouped by shared element */
function elementRows(P, scenes) {
  const rows = [];
  CATS.forEach(c => {
    const m = new Map();
    P.tags.filter(t => t.cat === c.k).forEach(t => {
      const x = t.itemId && itemById(P, t.itemId), key = x ? x.id : singularKey(t.text);
      if (!m.has(key)) m.set(key, { cat: c, name: x ? x.name : t.text, item: x, variants: new Set(), scenes: new Map(), status: x ? x.status : '' });
      const e = m.get(key); e.variants.add(t.text); const sc = scenes.find(s => s.id === t.sceneId); if (sc) e.scenes.set(sc.num, x ? sceneQtyOf(x, sc.id) : 1);
    });
    [...m.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach(e => rows.push({ ...e, variants: [...e.variants], scenes: [...e.scenes.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })) }));
  });
  return rows;
}
