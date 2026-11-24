'use strict';
/* ===================================================================
   Reports — VIEW
   Day out of Days, one-liner, characters, continuity & costume plot,
   elements, shots, props, chart, costume changes, pre-set & strike.
   Reports are built by ReportsModel (js/models/reports.model.js) through
   ReportsVM; this file only draws them. The Daily report tab is mountDPR.
   =================================================================== */
UI.repTab = UI.repTab || 'dood';

Views.reports = function (root) {
  const vm = new ReportsVM();
  let unDaily = null;                                   // the Daily report screen, while its tab is open
  const closeDaily = () => { if (unDaily) { unDaily(); unDaily = null; } };
  const unbind = bindView(vm, () => {
    closeDaily(); root.innerHTML = '';
    if (!vm.isDaily) { root.append(reportPage(vm)); return; }
    const box = h('div');
    root.append(h('div', { class: 'page', style: { maxWidth: '1100px' } }, h('div', { class: 'page-h' }, h('h2', {}, 'Reports')), repTabs(vm), box));
    unDaily = mountDPR(box, UI.dprDay);
  });
  return () => { closeDaily(); unbind(); };
};

function repTabs(vm) {
  return h('div', { class: 'tabs rep-tabs' }, vm.tabs.map(t => h('button', { class: t.on ? 'on' : '', onclick: () => vm.selectTab(t.key) }, t.label)));
}

function reportPage(vm) {
  const P = vm.P;
  if (!vm.hasScenes) return h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes yet'), h('p', {}, 'Reports are built from your script, breakdown and schedule.')));
  const r = vm.report, tab = r.tab, isGrid = !!r.grid, DASH = h('span', { class: 'rdash' }, '—');
  const cellNode = (c, i) => {
    const txt = String(c ?? '');
    if (!txt.trim()) return DASH.cloneNode(true);
    if (r.marks && i > 0 && ReportsModel.MARKS.includes(txt)) return h('span', { class: 'mk ' + txt }, txt);
    if (i === 0 && tab !== 'oneliner' && !txt.includes('\n')) return h('b', {}, txt);
    if (txt.includes('\n') || /^[A-Z][A-Z0-9' /.&-]*: /.test(txt)) return h('div', { class: 'rlines' }, txt.split('\n').map(l => { const m = l.match(/^([A-Z][A-Z0-9' /.&-]*): (.*)$/); return h('div', {}, m ? [h('b', { class: 'rwho' }, m[1]), ' ', m[2]] : l); }));
    return txt;
  };
  const tbl = h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl rep' + (isGrid ? ' dood' : '') + ' rep-' + vm.tab },
    h('thead', {}, h('tr', {}, r.headers.map((x, i) => h('th', { class: isGrid && i > 0 ? 'dcol' : '', style: { whiteSpace: 'pre-line' } }, x)))),
    h('tbody', {}, r.rows.length ? r.rows.map(row => !Array.isArray(row) ? h('tr', { class: 'grp' }, h('td', { colspan: r.headers.length }, row.grp))
      : h('tr', {}, row.map((c, i) => h('td', { class: (isGrid && i > 0 ? 'dcol ' : '') + (i === 0 && !isGrid ? 'first' : '') }, cellNode(c, i)))))
      : h('tr', {}, h('td', { colspan: r.headers.length }, 'Nothing to report yet.')))));
  let extra = reportNotes(P, r);
  if (r.hidden.length) extra = h('div', {}, extra, h('p', { class: 'small muted', style: { marginTop: '8px' } }, `Add ${r.hidden.join(' and ')} for each scene in the Breakdown and ${r.hidden.length > 1 ? 'they' : 'it'} will appear here.`));
  return h('div', { class: 'page', style: { maxWidth: '1300px' } },
    h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, 'Reports'), h('div', { class: 'muted small', style: { marginTop: '3px' } }, vm.subtitle)), h('span', { class: 'grow' }),
      h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('button', { class: 'btn', onclick: () => { const c = vm.csv; download(c.name, toCSV(c.rows), 'text/csv'); } }, icon('download', 15), 'CSV'),
        h('button', { class: 'btn', onclick: () => { const p = vm.print; printTable(p.title, p.headers, p.rows); } }, icon('print', 15), 'Print'))),
    repTabs(vm), tbl, extra);
}

/** the notes and keys under each report */
function reportNotes(P, r) {
  const note = (txt, mt = '10px') => h('p', { class: 'small muted', style: { marginTop: mt } }, txt);
  switch (r.tab) {
    case 'dood': {
      const el = h('div', { class: 'small muted', style: { margin: '10px 0' } }, 'SW = start work · W = work · WF = work finish · SWF = single day · H = hold (between work days). ',
        r.meta.hasDays ? '' : h('a', { href: `#/p/${P.id}/schedule`, style: { fontWeight: 600 } }, 'Create shoot days in the Schedule to fill in the day-by-day chart.'));
      if (r.meta.conflicts.length) el.append(h('div', { class: 'csalert', style: { marginTop: '10px' } }, h('b', {}, 'Scheduling conflicts'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, r.meta.conflicts.map(c => h('li', {}, c)))));
      return el;
    }
    case 'oneliner': return r.meta.castKey.length ? h('p', { class: 'small muted', style: { marginTop: '12px' } }, h('b', {}, 'Cast key: '), r.meta.castKey.join('  ·  ')) : null;
    case 'shottags': return note('Tag shots in the Shot list (or Photo shot list). Use Select shots to tag many at once.');
    case 'chart': return note('● speaks · ○ present, silent · ▸ enters (absent in the scene before) · ◂ exits (absent in the next scene). Sorted by scenes.');
    case 'changes': return note(r.rows.length ? 'Built from the wardrobe you assigned per scene. Quick and on-stage changes are the ones to rehearse and rig.' : 'Assign wardrobe to characters scene by scene in the Breakdown to see where costume changes fall.');
    case 'preset': return r.meta.stage ? note('Set “how it gets on stage” for each prop in its profile (scene list). Pre-set items are on stage at the top of the scene.') : null;
    case 'props': return r.meta.hasItems ? null : h('p', { class: 'muted', style: { marginTop: '14px' } }, 'No profiles yet — add them in Props & Wardrobe.');
    case 'continuity':
      if (r.meta.plot.length) return h('div', { style: { marginTop: '26px' } }, h('h3', { style: { marginBottom: '10px' } }, 'Costume plot by character'),
        h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Character'), h('th', {}, 'Wardrobe & makeup by scene'))),
          h('tbody', {}, r.meta.plot.map(([k, v]) => h('tr', {}, h('td', {}, h('b', {}, k)), h('td', {}, v.join('   ·   ')))))));
      return h('p', { class: 'muted', style: { marginTop: '16px' } }, 'Tip: in the Breakdown, assign Wardrobe and Makeup items to a character to build the costume plot. Add a story day and continuity notes for each scene there too.');
    default: return null;
  }
}
