'use strict';
/* ===================================================================
   Project overview — VIEW. Where everything stands, and what needs
   attention. Rules: js/models/overview.model.js; the facts it is built
   from: js/viewmodels/overview.vm.js.
   =================================================================== */
const DONE_ITEM = ItemsModel.DONE;

Views.overview = function (root) {
  const vm = new OverviewVM(), page = h('div', { class: 'page', style: { maxWidth: '1200px' } });
  root.append(page);
  function draw() {
    const B = vm.board, link = v => `#/p/${B.id}/${v}`, none = t => h('p', { class: 'muted', style: { margin: 0 } }, t), nd = B.nextDay;
    morph(page, [
      h('div', { class: 'page-h', 'data-key': 'head' }, h('div', {}, h('h2', {}, B.title), h('div', { class: 'muted', style: { marginTop: '4px' } }, B.subtitle)), h('span', { class: 'grow' }),
        B.live ? h('a', { class: 'btn', href: link('live'), style: { marginRight: '8px' } }, icon('play', 15), 'Live dashboard') : null,
        h('a', { class: 'btn primary', href: link(B.isPhoto ? 'setups' : 'script') }, icon('pen', 15), B.isPhoto ? 'Open setups' : 'Open script')),
      B.logline ? h('p', { 'data-key': 'logline', style: { fontSize: '17px', maxWidth: '75ch', margin: '0 0 22px' } }, B.logline) : null,
      h('div', { class: 'tiles', 'data-key': 'tiles' }, B.tiles.map(t => h('a', { class: 'tile', href: link(t.view) }, h('span', { class: 'tl' }, t.label), h('b', { class: t.tone }, t.value), h('span', { class: 'ts' }, t.sub),
        t.progress != null ? h('div', { class: 'progress' }, h('i', { style: { width: t.progress + '%' } })) : null))),
      h('div', { class: 'ov-cols', 'data-key': 'cols' },
        h('div', { class: 'card ov-card' }, h('h3', {}, 'Next shoot day'),
          nd ? h('div', {}, h('div', { style: { fontSize: '20px', fontWeight: 750, fontFamily: 'var(--head)' } }, `Day ${nd.num}${nd.date ? ' · ' + fmtDate(nd.date) : ''}`),
            h('div', { class: 'muted', style: { margin: '4px 0 10px' } }, `${nd.scenes} scene${nd.scenes === 1 ? '' : 's'}${nd.crewCall ? ' · crew call ' + fmtTime(nd.crewCall) : ''}`),
            h('div', { class: 'row wrap' }, h('a', { class: 'btn sm', href: link('callsheet/' + nd.id) }, icon('clipboard', 14), 'Call sheet'), h('a', { class: 'btn sm', href: link('schedule') }, icon('calendar', 14), 'Schedule')))
            : none('No shoot days yet. Create them in the Schedule.')),
        h('div', { class: 'card ov-card' }, h('h3', {}, 'Needs attention'),
          B.attention.length ? h('ul', { class: 'attn' }, B.attention.map(a => h('li', {}, h('a', { href: link(a.view), class: a.tone }, h('span', {}, a.text), icon('right', 14))))) : none('Nothing needs attention. 🎬')),
        h('div', { class: 'card ov-card' }, h('h3', {}, 'Coming up'),
          B.upcoming.length ? h('ul', { class: 'attn' }, B.upcoming.map(t => h('li', {}, h('a', { href: link('tasks') }, h('span', {}, t.title), h('span', { class: 'small' + (TaskModel.isOverdue(t, B.today) ? ' overdue' : ' muted') }, fmtDateShort(t.due)))))) : none('No tasks with due dates.'))),
      h('h3', { 'data-key': 'every', style: { margin: '28px 0 12px' } }, 'Everything'),
      h('div', { class: 'jump', 'data-key': 'jump' }, B.sections.map(([v, l, ic]) => h('a', { class: 'btn', href: link(v) }, icon(ic, 16), l)))]);
  }
  return bindView(vm, draw);
};
