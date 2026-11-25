'use strict';
/* ===================================================================
   Ctrl+K — find and jump to anything in the project.
   VIEW. Rules: js/models/search.model.js; screen state and commands:
   js/viewmodels/search.vm.js.
   =================================================================== */
/* open a section of the open project (redraws it when it is already open) */
function goto(view) { const hash = `#/p/${Store.P.id}/${view}`; if (location.hash === hash) Router.refresh(); else location.hash = hash; }

function openSearch() {
  if (!Store.P || $('.searchbox')) return;
  const vm = new SearchVM();
  const list = h('div', { class: 'sr-list' });
  const input = h('input', { class: 'inp sr-in', placeholder: 'Search scenes, people, props, wardrobe, tasks, locations…', autocomplete: 'off', 'aria-label': 'Search the project', oninput: e => vm.setQuery(e.target.value) });
  function pick(n) { const view = vm.go(n); if (view == null) return; dlg.close(); goto(view); }
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); vm.move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); vm.move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(vm.sel); }
  });
  const unbind = bindView(vm, () => {
    const res = vm.results, sel = vm.sel;
    morph(list, res.length ? res.map((r, n) => h('div', { class: 'sr-row' + (n === sel ? ' on' : ''), onmousemove: () => vm.select(n), onclick: () => pick(n) },
      icon(r.ic, 16), h('div', { class: 'sr-t' }, h('b', {}, r.title), r.sub ? h('span', { class: 'small muted' }, r.sub) : null), h('span', { class: 'pill' }, r.kind)))
      : h('div', { class: 'muted', style: { padding: '18px', textAlign: 'center' } }, 'Nothing found.'));
    const el = list.children[sel]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  });
  const dlg = modal({ title: 'Search', body: h('div', { class: 'searchbox' }, input, list), buttons: [], onClose: unbind });
  setTimeout(() => input.focus(), 30);
}
