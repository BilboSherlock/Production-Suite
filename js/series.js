'use strict';
/* ===================================================================
   Series & episodes — each episode is its own project; a series links
   them and shares one bible (premise, tone, rules, arcs, characters).
   VIEW. Rules: js/models/series.model.js; screen state and commands:
   js/viewmodels/series.vm.js. These names are kept for older callers.
   =================================================================== */
const blankBible = SeriesModel.blankBible, epCode = SeriesModel.epCode;
const episodesOf = sid => SeriesModel.episodes(Object.values(Store.projects), sid);

Views.bible = function (root) {
  const vm = new SeriesVM(), wrap = h('div', { class: 'page' }); root.append(wrap);
  const field = (label, el) => h('div', { class: 'field' }, h('label', { class: 'lbl' }, label), el);
  const ta = (key, label, ph, rows = 4) => field(label, h('textarea', { class: 'inp', 'data-key': key, rows, placeholder: ph, value: vm.B[key] || '', oninput: e => vm.setText(key, e.target.value) }));

  function startForm() {
    const name = h('input', { class: 'inp', value: vm.P.title }), season = h('input', { class: 'inp', type: 'number', min: 1, value: 1, style: { width: '90px' } }), ep = h('input', { class: 'inp', type: 'number', min: 1, value: 1, style: { width: '90px' } });
    return [h('div', { class: 'page-h', 'data-key': 'start-h' }, h('h2', {}, 'Series bible')),
      h('div', { class: 'card', 'data-key': 'start', style: { padding: '22px' } },
        h('p', { style: { marginTop: 0 } }, 'Turn this project into an episode of a series. Each episode stays its own project (script, schedule, budget…); the series shares one bible — premise, tone, rules, season arcs and characters — and an episode guide.'),
        field('Series name', name),
        h('div', { class: 'row' }, field('Season', season), field('This is episode', ep)),
        h('button', { class: 'btn primary', onclick: () => vm.startSeries(name.value, season.value, ep.value) }, 'Create series'))];
  }
  function bibleTab() {
    return [ta('premise', 'Premise', 'What is the show? Who is it about, and what is the engine that generates stories?', 5), ta('tone', 'Tone & style', 'Genre, humour, visual language, references…', 4), ta('rules', 'Rules of the world', 'What can and can’t happen? Continuity laws, tech, magic, timeline…', 5), ta('world', 'Setting & world', 'Key places, history, culture…', 4), ta('notes', 'Writers’ room notes', 'Running gags, things to avoid, open questions…', 4)];
  }
  function charsTab() {
    const list = vm.characters;
    return [h('div', { class: 'row wrap', 'data-key': 'char-tools', style: { marginBottom: '12px' } },
      h('button', { class: 'btn primary', onclick: () => vm.addCharacter() }, icon('plus', 15), 'Add character'),
      h('button', { class: 'btn', onclick: () => { const n = vm.importCharacters(); toast(n ? `Added ${n} character${n > 1 ? 's' : ''} from this episode` : 'Every character in this episode is already in the bible'); } }, 'Add characters from this script'),
      h('button', { class: 'btn', onclick: () => { const n = vm.castFromBible(); toast(n ? `Added ${n} to Cast & crew` : 'Everyone is already in Cast & crew'); } }, 'Add to this episode’s cast')),
      ...(list.length ? list.map(c => h('div', { class: 'card', 'data-key': c.id, style: { padding: '14px', marginBottom: '10px' } },
        h('div', { class: 'row' }, h('input', { class: 'inp', placeholder: 'Name', value: c.name, style: { fontWeight: 700, maxWidth: '280px' }, oninput: e => vm.setCharacter(c.id, 'name', e.target.value) }), h('span', { class: 'grow' }),
          h('span', { class: 'small muted' }, c.seen === null ? '' : `in ${c.seen} episode${c.seen === 1 ? '' : 's'}`),
          h('button', { class: 'icon-btn danger', title: 'Remove', onclick: () => vm.removeCharacter(c.id) }, icon('trash', 15))),
        h('textarea', { class: 'inp', 'data-key': 'desc', rows: 2, placeholder: 'Who they are, what they want…', value: c.desc, style: { marginTop: '8px' }, oninput: e => vm.setCharacter(c.id, 'desc', e.target.value) }),
        h('textarea', { class: 'inp', 'data-key': 'arc', rows: 2, placeholder: 'Arc across the series…', value: c.arc, style: { marginTop: '6px' }, oninput: e => vm.setCharacter(c.id, 'arc', e.target.value) })))
        : [h('div', { class: 'empty', 'data-key': 'none' }, h('p', {}, 'No characters yet.'))])];
  }
  function arcsTab() {
    const B = vm.B;
    return [...vm.seasons.map(sn => h('div', { class: 'field', 'data-key': 'arc' + sn }, h('label', { class: 'lbl' }, `Season ${sn} arc`), h('textarea', { class: 'inp', rows: 5, placeholder: 'Where does this season start, turn and end?', value: B.arcs[sn] || '', oninput: e => vm.setArc(sn, e.target.value) }))),
      h('button', { class: 'btn', 'data-key': 'addseason', onclick: () => vm.addSeason() }, icon('plus', 15), 'Add season')];
  }
  function guideTab() {
    return [h('div', { class: 'row wrap', 'data-key': 'guide-tools', style: { marginBottom: '12px' } },
      h('button', { class: 'btn primary', onclick: () => newEpisodeModal(vm) }, icon('plus', 15), 'New episode'),
      h('button', { class: 'btn', onclick: () => printNode(h('div', { class: 'print-doc', html: vm.guideHtml() })) }, icon('print', 15), 'Print episode guide')),
      h('table', { class: 'tbl', 'data-key': 'guide' }, h('thead', {}, h('tr', {}, ['Ep', 'Title', 'Logline', 'Pages', 'Draft', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, vm.guide.map(e => h('tr', { class: e.current ? 'cur' : '', 'data-key': e.id },
          h('td', { style: { whiteSpace: 'nowrap', fontWeight: 700 } }, e.code),
          h('td', {}, h('a', { href: `#/p/${e.id}/script` }, e.title), e.current ? h('span', { class: 'pill', style: { marginLeft: '8px' } }, 'this') : null),
          h('td', { class: 'muted' }, e.logline), h('td', {}, String(e.pages)), h('td', {}, e.draft),
          h('td', {}, h('button', { class: 'btn sm ghost', title: 'Season / episode number', onclick: () => renumberModal(vm, e.id) }, icon('edit', 14)))))))];
  }
  function draw() {
    if (!vm.S) { wrap.style.maxWidth = '720px'; return morph(wrap, startForm()); }
    wrap.style.maxWidth = '980px';
    const S = vm.S, n = vm.episodes.length, tab = vm.tab;
    morph(wrap, [h('div', { class: 'page-h', 'data-key': 'head' }, h('div', {}, h('input', { class: 'ptitle', value: S.name, style: { fontSize: '22px', fontWeight: 750, border: 0, background: 'transparent' }, oninput: e => vm.setName(e.target.value) }), h('div', { class: 'muted' }, `${vm.code} · ${n} episode${n === 1 ? '' : 's'}`)), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: () => printNode(h('div', { class: 'print-doc', html: vm.bibleHtml() })) }, icon('print', 15), 'Print bible'),
      h('button', { class: 'btn sm', onclick: () => renumberModal(vm, vm.P.id) }, 'Episode number'),
      h('button', { class: 'btn sm ghost', onclick: async () => { if (await confirmBox('Take this episode out of the series? Its script and data are kept.', 'Remove')) vm.leave(); } }, 'Leave series')),
      h('div', { class: 'tabs', 'data-key': 'tabs' }, [['bible', 'Bible'], ['chars', 'Characters'], ['arcs', 'Season arcs'], ['guide', 'Episode guide']].map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: () => vm.setTab(k) }, l))),
      h('div', { 'data-key': 'tab-' + tab }, tab === 'chars' ? charsTab() : tab === 'arcs' ? arcsTab() : tab === 'guide' ? guideTab() : bibleTab())]);
  }
  const unbind = bindView(vm, draw);
  return () => { vm.flush(); unbind(); };
};

function renumberModal(vm, id) {
  const e = vm.episodes.find(x => x.id === id); if (!e) return;
  const season = h('input', { class: 'inp', type: 'number', min: 1, value: e.series.season }), ep = h('input', { class: 'inp', type: 'number', min: 1, value: e.series.ep });
  modal({ title: 'Season & episode number', body: h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Season'), season), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Episode'), ep)),
    buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => vm.renumber(id, season.value, ep.value) }] });
}
function newEpisodeModal(vm) {
  const carry = h('input', { type: 'checkbox', checked: true });
  modal({ title: 'New episode', body: h('div', {}, h('p', { style: { marginTop: 0 } }, 'Creates the next episode as its own project, with the same bible.'),
    h('label', { class: 'row' }, carry, h('span', {}, 'Carry over cast & crew, casting roles and locations'))),
    buttons: [{ label: 'Cancel' }, { label: 'Create episode', primary: true, onClick: async () => { const p = await vm.newEpisode(carry.checked); location.hash = `#/p/${p.id}/script`; } }] });
}
