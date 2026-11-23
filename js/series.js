'use strict';
/* ===================================================================
   Series & episodes — each episode is its own project; a series links
   them and shares one bible (premise, tone, rules, arcs, characters).
   =================================================================== */
const blankBible = () => ({ premise: '', tone: '', rules: '', world: '', notes: '', arcs: {}, characters: [], v: 0 });
const epCode = s => s ? `S${String(s.season || 1).padStart(2, '0')}E${String(s.ep || 1).padStart(2, '0')}` : '';
const episodesOf = sid => Object.values(Store.projects).filter(p => p.series && p.series.id === sid)
  .sort((a, b) => (a.series.season - b.series.season) || (a.series.ep - b.series.ep) || (a.created - b.created));

/* the newest copy of the bible wins; every episode then carries the same one */
function adoptBible(P) {
  if (!P.series) return;
  const eps = episodesOf(P.series.id); let best = P.series.bible || blankBible(), name = P.series.name;
  eps.forEach(e => { if (((e.series.bible || {}).v || 0) > (best.v || 0)) { best = e.series.bible; name = e.series.name; } });
  P.series.bible = JSON.parse(JSON.stringify(best)); P.series.name = name;
}
async function saveBible(P) {
  if (!P.series) return;
  P.series.bible.v = Date.now(); P.updated = Date.now();
  for (const e of episodesOf(P.series.id)) {
    if (e === P) continue;
    e.series.bible = JSON.parse(JSON.stringify(P.series.bible)); e.series.name = P.series.name;
    if (Store.persist) { try { await DB.put(e); if (window.Sync) Sync.queuePush(e); } catch (x) { console.warn(x); } }
  }
  Store.touch();
}
function startSeries(P, name, season, ep) {
  P.series = { id: uid(), name: name || P.title, season: +season || 1, ep: +ep || 1, bible: blankBible() };
  Store.touch();
}
async function newEpisode(P, carry) {
  const eps = episodesOf(P.series.id), last = eps[eps.length - 1] || P, season = last.series.season;
  const n = Math.max(0, ...eps.filter(e => e.series.season === season).map(e => e.series.ep)) + 1;
  const p = blankProject(P.mode, `${P.series.name} — Episode ${n}`);
  p.series = { id: P.series.id, name: P.series.name, season, ep: n, bible: JSON.parse(JSON.stringify(P.series.bible)) };
  p.blocks = [{ id: uid(), type: 'scene', text: '' }, { id: uid(), type: DEFAULT_TYPE[P.mode], text: '' }];
  Object.assign(p.meta, { author: P.meta.author, credit: P.meta.credit, contact: P.meta.contact, copyright: P.meta.copyright });
  if (P.fin) { p.fin = JSON.parse(JSON.stringify(P.fin)); Object.assign(p.fin, { txns: [], versions: [], funding: [], baseline: '', locked: false }); }
  Object.assign(p.settings, { multicam: P.settings.multicam, currency: P.settings.currency, contingency: P.settings.contingency, aspect: P.settings.aspect });
  if (carry) {
    p.people = JSON.parse(JSON.stringify(P.people)); p.locations = JSON.parse(JSON.stringify(P.locations));
    p.casting = JSON.parse(JSON.stringify(P.casting));
    p.people.forEach(x => { x.unavail = ''; });
  }
  await Store.add(p); return p;
}

Views.bible = function (root) {
  const P = Store.P;
  if (!P.series) {
    const name = h('input', { class: 'inp', value: P.title }), season = h('input', { class: 'inp', type: 'number', min: 1, value: 1, style: { width: '90px' } }), ep = h('input', { class: 'inp', type: 'number', min: 1, value: 1, style: { width: '90px' } });
    root.append(h('div', { class: 'page', style: { maxWidth: '720px' } }, h('div', { class: 'page-h' }, h('h2', {}, 'Series bible')),
      h('div', { class: 'card', style: { padding: '22px' } },
        h('p', { style: { marginTop: 0 } }, 'Turn this project into an episode of a series. Each episode stays its own project (script, schedule, budget…); the series shares one bible — premise, tone, rules, season arcs and characters — and an episode guide.'),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Series name'), name),
        h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Season'), season), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'This is episode'), ep)),
        h('button', { class: 'btn primary', onclick: () => { startSeries(P, name.value.trim(), season.value, ep.value); Router.refresh(); } }, 'Create series'))));
    return;
  }
  adoptBible(P);
  const S = P.series, B = S.bible; let tab = UI.bibleTab || 'bible';
  const save = () => saveBible(P);
  let t; const later = () => { clearTimeout(t); t = setTimeout(save, 500); };
  const ta = (key, label, ph, rows = 4) => h('div', { class: 'field' }, h('label', { class: 'lbl' }, label), h('textarea', { class: 'inp', rows, placeholder: ph, value: B[key] || '', oninput: e => { B[key] = e.target.value; later(); } }));
  const body = h('div');
  const draw = () => {
    body.replaceChildren();
    if (tab === 'bible') body.append(ta('premise', 'Premise', 'What is the show? Who is it about, and what is the engine that generates stories?', 5), ta('tone', 'Tone & style', 'Genre, humour, visual language, references…', 4), ta('rules', 'Rules of the world', 'What can and can’t happen? Continuity laws, tech, magic, timeline…', 5), ta('world', 'Setting & world', 'Key places, history, culture…', 4), ta('notes', 'Writers’ room notes', 'Running gags, things to avoid, open questions…', 4));
    if (tab === 'chars') {
      const have = new Set(B.characters.map(c => c.name.trim().toUpperCase()));
      body.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } },
        h('button', { class: 'btn primary', onclick: () => { B.characters.push({ id: uid(), name: '', desc: '', arc: '' }); save(); draw(); } }, icon('plus', 15), 'Add character'),
        h('button', { class: 'btn', onclick: () => { let n = 0; allCharacters(P).forEach((_, c) => { if (!have.has(c)) { B.characters.push({ id: uid(), name: c, desc: '', arc: '' }); n++; } }); save(); draw(); toast(n ? `Added ${n} character${n > 1 ? 's' : ''} from this episode` : 'Every character in this episode is already in the bible'); } }, 'Add characters from this script'),
        h('button', { class: 'btn', onclick: () => { let n = 0; const names = new Set(P.people.filter(x => x.type === 'cast').map(x => (x.character || '').trim().toUpperCase())); B.characters.forEach(c => { const k = c.name.trim().toUpperCase(); if (k && !names.has(k)) { const x = newPerson('cast'); x.character = c.name.trim().toUpperCase(); P.people.push(x); n++; } }); Store.touch(); toast(n ? `Added ${n} to Cast & crew` : 'Everyone is already in Cast & crew'); } }, 'Add to this episode’s cast')));
      if (!B.characters.length) body.append(h('div', { class: 'empty' }, h('p', {}, 'No characters yet.')));
      B.characters.forEach(c => body.append(h('div', { class: 'card', style: { padding: '14px', marginBottom: '10px' } },
        h('div', { class: 'row' }, h('input', { class: 'inp', placeholder: 'Name', value: c.name, style: { fontWeight: 700, maxWidth: '280px' }, oninput: e => { c.name = e.target.value; later(); } }), h('span', { class: 'grow' }),
          h('span', { class: 'small muted' }, (() => { const n = episodesOf(S.id).filter(e => [...allCharacters(e).keys()].includes(c.name.trim().toUpperCase())).length; return c.name.trim() ? `in ${n} episode${n === 1 ? '' : 's'}` : ''; })()),
          h('button', { class: 'icon-btn danger', title: 'Remove', onclick: () => { B.characters = B.characters.filter(x => x !== c); save(); draw(); } }, icon('trash', 15))),
        h('textarea', { class: 'inp', rows: 2, placeholder: 'Who they are, what they want…', value: c.desc, style: { marginTop: '8px' }, oninput: e => { c.desc = e.target.value; later(); } }),
        h('textarea', { class: 'inp', rows: 2, placeholder: 'Arc across the series…', value: c.arc, style: { marginTop: '6px' }, oninput: e => { c.arc = e.target.value; later(); } }))));
    }
    if (tab === 'arcs') {
      const seasons = [...new Set([...episodesOf(S.id).map(e => e.series.season), ...Object.keys(B.arcs).map(Number)])].sort((a, b) => a - b);
      seasons.forEach(sn => body.append(h('div', { class: 'field' }, h('label', { class: 'lbl' }, `Season ${sn} arc`), h('textarea', { class: 'inp', rows: 5, placeholder: 'Where does this season start, turn and end?', value: B.arcs[sn] || '', oninput: e => { B.arcs[sn] = e.target.value; later(); } }))));
      body.append(h('button', { class: 'btn', onclick: () => { const n = Math.max(0, ...seasons) + 1; B.arcs[n] = B.arcs[n] || ' '; save(); draw(); } }, icon('plus', 15), 'Add season'));
    }
    if (tab === 'guide') {
      const eps = episodesOf(S.id);
      body.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } },
        h('button', { class: 'btn primary', onclick: () => newEpisodeModal(P) }, icon('plus', 15), 'New episode'),
        h('button', { class: 'btn', onclick: () => printNode(guideNode(S, eps)) }, icon('print', 15), 'Print episode guide')),
        h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Ep', 'Title', 'Logline', 'Pages', 'Draft', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, eps.map(e => h('tr', { class: e === P ? 'cur' : '' },
            h('td', { style: { whiteSpace: 'nowrap', fontWeight: 700 } }, epCode(e.series)),
            h('td', {}, h('a', { href: `#/p/${e.id}/script` }, e.title || 'Untitled'), e === P ? h('span', { class: 'pill', style: { marginLeft: '8px' } }, 'this') : null),
            h('td', { class: 'muted' }, e.meta.logline || '—'), h('td', {}, scriptStats(e).pages), h('td', {}, e.meta.draft || '—'),
            h('td', {}, h('button', { class: 'btn sm ghost', title: 'Season / episode number', onclick: () => renumberModal(e) }, icon('edit', 14))))))));
    }
  };
  const tabs = h('div', { class: 'tabs' }, [['bible', 'Bible'], ['chars', 'Characters'], ['arcs', 'Season arcs'], ['guide', 'Episode guide']].map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: e => { tab = UI.bibleTab = k; [...tabs.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); draw(); } }, l)));
  const name = h('input', { class: 'ptitle', value: S.name, style: { fontSize: '22px', fontWeight: 750, border: 0, background: 'transparent' }, oninput: e => { S.name = e.target.value; later(); } });
  root.append(h('div', { class: 'page', style: { maxWidth: '980px' } }, h('div', { class: 'page-h' }, h('div', {}, name, h('div', { class: 'muted' }, `${epCode(S)} · ${episodesOf(S.id).length} episode${episodesOf(S.id).length === 1 ? '' : 's'}`)), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', onclick: () => printNode(bibleNode(S)) }, icon('print', 15), 'Print bible'),
    h('button', { class: 'btn sm', onclick: () => renumberModal(P) }, 'Episode number'),
    h('button', { class: 'btn sm ghost', onclick: async () => { if (await confirmBox('Take this episode out of the series? Its script and data are kept.', 'Remove')) { P.series = null; Store.touch(); Router.refresh(); } } }, 'Leave series')),
    tabs, body));
  draw();
  return () => { clearTimeout(t); if (P.series) saveBible(P); };
};

function renumberModal(e) {
  const season = h('input', { class: 'inp', type: 'number', min: 1, value: e.series.season }), ep = h('input', { class: 'inp', type: 'number', min: 1, value: e.series.ep });
  modal({ title: 'Season & episode number', body: h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Season'), season), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Episode'), ep)),
    buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => { e.series.season = Math.max(1, +season.value || 1); e.series.ep = Math.max(1, +ep.value || 1); e.updated = Date.now(); if (Store.persist) await DB.put(e); if (e === Store.P) Store.touch(); Router.refresh(); } }] });
}
function newEpisodeModal(P) {
  const carry = h('input', { type: 'checkbox', checked: true });
  modal({ title: 'New episode', body: h('div', {}, h('p', { style: { marginTop: 0 } }, 'Creates the next episode as its own project, with the same bible.'),
    h('label', { class: 'row' }, carry, h('span', {}, 'Carry over cast & crew, casting roles and locations'))),
    buttons: [{ label: 'Cancel' }, { label: 'Create episode', primary: true, onClick: async () => { const p = await newEpisode(P, carry.checked); location.hash = `#/p/${p.id}/script`; } }] });
}
function bibleNode(S) {
  const B = S.bible, sec = (t, x) => x && x.trim() ? `<h3>${esc(t)}</h3><p style="white-space:pre-wrap">${esc(x)}</p>` : '';
  return h('div', { class: 'print-doc', html: `<h1>${esc(S.name)} — Series bible</h1>${sec('Premise', B.premise)}${sec('Tone & style', B.tone)}${sec('Rules of the world', B.rules)}${sec('Setting & world', B.world)}${sec('Notes', B.notes)}
    ${B.characters.length ? '<h3>Characters</h3>' + B.characters.map(c => `<p><b>${esc(c.name)}</b>${c.desc ? ' — ' + esc(c.desc) : ''}${c.arc ? '<br><i>Arc:</i> ' + esc(c.arc) : ''}</p>`).join('') : ''}
    ${Object.keys(B.arcs).sort((a, b) => a - b).filter(k => (B.arcs[k] || '').trim()).map(k => `<h3>Season ${esc(k)} arc</h3><p style="white-space:pre-wrap">${esc(B.arcs[k])}</p>`).join('')}` });
}
function guideNode(S, eps) {
  return h('div', { class: 'print-doc', html: `<h1>${esc(S.name)} — Episode guide</h1><table><thead><tr><th>Ep</th><th>Title</th><th>Logline</th><th>Pages</th></tr></thead><tbody>${eps.map(e => `<tr><td>${epCode(e.series)}</td><td>${esc(e.title)}</td><td>${esc(e.meta.logline || '')}</td><td>${scriptStats(e).pages}</td></tr>`).join('')}</tbody></table>` });
}
