'use strict';
/* ===================================================================
   Budget — VIEW, part 2: top sheet, cash flow & funding, versions,
   setup, printing and the all-projects portfolio page.
   =================================================================== */

function budgetPrint(vm, kind) {
  const p = vm.printable(kind);
  if (!p) return toast(kind === 'ledger' ? 'No expenses to print.' : 'No cash flow to print yet.', true);
  printTable(p.title, p.head, p.rows, p.opts);
}

/* ---------------------------------------------------------------
   Top sheet
   --------------------------------------------------------------- */
function budgetTop(v, c) {
  const { vm } = v;
  if (!vm.P.budget.length) return h('div', { class: 'empty' }, h('p', {}, 'Nothing to summarise yet — add budget lines first.'));
  const t = vm.topSheet(c), varCol = t.head.indexOf('Variance');
  return h('div', {}, h('div', { class: 'row', style: { marginBottom: '10px' } }, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => budgetPrint(vm, 'top') }, icon('print', 15), 'Print top sheet')),
    h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl rep fin-top' }, h('thead', {}, h('tr', {}, t.head.map((x, i) => h('th', { class: i ? 'rt' : '' }, x)))),
      h('tbody', {}, t.rows.map(r => !Array.isArray(r) ? h('tr', { class: 'grp' }, h('td', { colspan: t.head.length }, r.grp))
        : h('tr', { class: r.strong ? 'strong' : '' }, r.map((x, i) => h('td', { class: i ? 'rt' : '', style: i === varCol && /^−|^-/.test(x) ? { color: 'var(--danger)' } : {} }, x))))))),
    t.baseline ? h('p', { 'data-key': 'approved', class: 'small muted', style: { marginTop: '10px' } }, `“Approved” is the saved version “${t.baseline.name}” (${t.baseline.date}).`) : null,
    h('p', { class: 'small muted', style: { marginTop: '6px' } }, 'Forecast = spent + committed + what is still to complete. Variance = budget − forecast (negative means over).'));
}

/* ---------------------------------------------------------------
   Cash flow & funding
   --------------------------------------------------------------- */
function budgetCash(v, c) {
  const { vm, fm } = v, F = c.F, rows = vm.cashflow(c).rows, real = rows.filter(r => r.month !== 'undated');
  let chart = h('p', { class: 'muted' }, 'Add dates to expenses and due dates to budget lines (or funding drawdowns below) to see cash flow over time.');
  if (real.length) {
    const W = 900, H = 260, pad = { l: 56, r: 16, t: 14, b: 34 }, plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    const top = Math.max(1, ...real.map(r => r.actual + r.committed + r.forecast), ...real.map(r => Math.max(r.cumSpend, r.cumFund)));
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fin-chart', role: 'img', 'aria-label': 'Cash flow chart' }), bw = Math.min(60, plotW / real.length * 0.6), x = i => pad.l + (i + .5) * (plotW / real.length), y = n => pad.t + plotH - n / top * plotH;
    svg._own = true;                                             // redrawn whole, not morphed
    for (let i = 0; i <= 4; i++) { const n = top * i / 4; svg.append(S('line', { x1: pad.l, x2: W - pad.r, y1: y(n), y2: y(n), stroke: 'currentColor', 'stroke-opacity': .12 }), S('text', { x: pad.l - 6, y: y(n) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'currentColor', 'fill-opacity': .6 }, v.fs(n))); }
    real.forEach((r, i) => { let acc = 0; [['actual', '#2468d8'], ['committed', '#7a45c9'], ['forecast', '#c9ced6']].forEach(([k, col]) => { const n = r[k]; if (!n) return; svg.append(S('rect', { x: x(i) - bw / 2, y: y(acc + n), width: bw, height: Math.max(1, y(acc) - y(acc + n)), fill: col })); acc += n; }); svg.append(S('text', { x: x(i), y: H - 12, 'text-anchor': 'middle', 'font-size': 11, fill: 'currentColor', 'fill-opacity': .7 }, r.month)); });
    const path = (k, col, dash) => svg.append(S('path', { d: real.map((r, i) => `${i ? 'L' : 'M'}${x(i)} ${y(r[k])}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': dash || '' }));
    path('cumSpend', '#e5484d'); if (F.funding.length) path('cumFund', '#1e8e54', '6 4');
    chart = h('div', {}, svg, h('div', { class: 'fin-leg', style: { marginTop: '6px' } }, h('i', { class: 'a' }), 'Spent', h('i', { class: 'c' }), 'Committed', h('i', { class: 'f' }), 'Forecast', h('i', { style: { background: '#e5484d', height: '3px', alignSelf: 'center' } }), 'Cumulative spend',
      F.funding.length ? [h('i', { style: { background: '#1e8e54', height: '3px', alignSelf: 'center' } }), 'Cumulative funding'] : null));
  }
  const quiet = (f, k) => e => vm.updateFunding(f.id, k, e.target.value, { quiet: true });
  const fund = h('div', {}, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', { style: { fontSize: '15px' } }, 'Funding & drawdowns'), h('span', { class: 'grow' }),
    h('span', { class: 'small muted' }, `${fm(c.funded)} of ${fm(c.total)} budget (${BudgetModel.pct(c.funded, c.total)})`), h('button', { class: 'btn sm', onclick: () => vm.addFunding() }, icon('plus', 13), 'Add')),
    F.funding.length ? h('table', { class: 'tbl wide' }, h('thead', {}, h('tr', {}, ['Date', 'Source', 'Amount', 'Notes', ''].map(x => h('th', {}, x)))), h('tbody', {}, F.funding.map(f => h('tr', { 'data-key': f.id },
      h('td', { style: { width: '150px' } }, h('input', { class: 'cell', type: 'date', value: f.date || '', oninput: e => vm.updateFunding(f.id, 'date', e.target.value) })),
      h('td', {}, h('input', { class: 'cell', value: f.source || '', placeholder: 'Investor, grant, client…', oninput: quiet(f, 'source') })),
      h('td', { style: { width: '140px' } }, h('input', { class: 'cell num', type: 'number', value: f.amount || '', oninput: e => vm.updateFunding(f.id, 'amount', e.target.value) })),
      h('td', {}, h('input', { class: 'cell', value: f.notes || '', oninput: quiet(f, 'notes') })), h('td', { style: { width: '44px' } }, ibtn('trash', 'Remove', () => vm.removeFunding(f.id), 'danger'))))))
      : h('p', { class: 'small muted', style: { margin: 0 } }, 'Record investor tranches, grants or client payments to see whether cash covers the spend.'));
  return h('div', {}, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => budgetPrint(vm, 'cash') }, icon('print', 15), 'Print')), h('div', { class: 'card', 'data-key': 'chart', style: { padding: '16px', marginBottom: '14px' } }, chart),
    rows.length ? h('div', { class: 'rep-wrap', 'data-key': 'months', style: { marginBottom: '16px' } }, h('table', { class: 'tbl rep' }, h('thead', {}, h('tr', {}, ['Month', 'Spent', 'Committed', 'Forecast', 'Funding in', 'Cumulative spend', 'Balance'].map((x, i) => h('th', { class: i ? 'rt' : '' }, x)))),
      h('tbody', {}, rows.map(r => h('tr', { 'data-key': r.month }, h('td', { class: 'first' }, r.month === 'undated' ? 'No date' : r.month), ...[r.actual, r.committed, r.forecast, r.funding, r.cumSpend].map(n => h('td', { class: 'rt' }, n ? fm(n) : '—')),
        h('td', { class: 'rt', style: r.balance < 0 ? { color: 'var(--danger)', fontWeight: 700 } : {} }, F.funding.length ? fm(r.balance) : '—')))))) : null,
    h('div', { class: 'card', 'data-key': 'funding', style: { padding: '16px' } }, fund), h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Forecast spend lands on each line’s “due” date (set it in the line’s details), otherwise on the month of the last shoot day.'));
}

/* ---------------------------------------------------------------
   Versions
   --------------------------------------------------------------- */
function budgetVersions(v, c) {
  const { vm, fm } = v, F = c.F;
  const save = () => {
    const name = h('input', { class: 'inp', placeholder: 'e.g. First draft, Approved by client', value: `Version ${F.versions.length + 1}` }), note = h('textarea', { class: 'inp', rows: 2, placeholder: 'What changed?' }), base = h('input', { type: 'checkbox', checked: !F.baseline });
    modal({ title: 'Save budget version', body: h('div', {}, h('p', { class: 'small muted', style: { marginTop: 0 } }, `Snapshots all ${vm.P.budget.length} lines, categories and additions (${fm(c.total)}). Expenses are not versioned.`), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Name'), name), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Note'), note), h('label', { class: 'row small' }, base, 'Make this the approved baseline (shown as “vs approved”)')),
      buttons: [{ label: 'Cancel' }, { label: 'Save version', primary: true, onClick: () => { vm.saveVersion({ name: name.value.trim(), note: note.value.trim(), baseline: base.checked }); toast('Version saved'); } }] });
  };
  const compare = id => {
    const k = vm.compare(id); if (!k) return; const d = k.diff, est = BudgetModel.lineEst, dl = n => h('span', { style: { color: n > 0 ? 'var(--danger)' : n < 0 ? 'var(--ok)' : '' } }, (n > 0 ? '+' : n < 0 ? '−' : '') + fm(Math.abs(n)));
    modal({ title: `Compare “${k.v.name}” with current`, wide: true, body: h('div', {}, h('table', { class: 'tbl rep' }, h('thead', {}, h('tr', {}, ['Category', k.v.name, 'Current', 'Change'].map((x, i) => h('th', { class: i ? 'rt' : '' }, x)))),
      h('tbody', {}, k.rows.map(r => h('tr', {}, h('td', { class: 'first' }, r.cat), h('td', { class: 'rt' }, fm(r.was)), h('td', { class: 'rt' }, fm(r.now)), h('td', { class: 'rt' }, dl(r.change)))),
        h('tr', { class: 'strong' }, h('td', {}, 'Subtotal'), h('td', { class: 'rt' }, fm(k.was)), h('td', { class: 'rt' }, fm(k.now)), h('td', { class: 'rt' }, dl(k.change))))),
      h('div', { class: 'small', style: { marginTop: '12px' } }, `${d.added.length} added · ${d.removed.length} removed · ${d.changed.length} changed`),
      h('div', { class: 'fin-diff' }, d.added.map(l => h('div', {}, h('b', { style: { color: 'var(--ok)' } }, '+ '), `${l.desc || '(no description)'} — ${fm(est(l))}`)), d.removed.map(l => h('div', {}, h('b', { style: { color: 'var(--danger)' } }, '− '), `${l.desc || '(no description)'} — ${fm(est(l))}`)),
        d.changed.map(x => h('div', {}, h('b', {}, '≠ '), `${x.now.desc || '(no description)'}: ${fm(est(x.was))} → ${fm(est(x.now))}`)))), buttons: [{ label: 'Close', primary: true }] });
  };
  const restore = async ver => { if (await confirmBox(`Restore “${ver.name}”? Your current lines, categories and additions will be replaced (a safety copy is saved first).`, 'Restore')) { vm.restoreVersion(ver.id); toast('Budget restored'); } };
  const remove = async ver => { if (await confirmBox(`Delete version “${ver.name}”?`)) vm.removeVersion(ver.id); };
  return h('div', {}, h('div', { class: 'row', style: { marginBottom: '12px' } }, h('p', { class: 'small muted', style: { margin: 0, flex: 1 } }, 'Save a version before big changes or when a budget is approved. Compare any version with today’s budget, restore it, or mark one as the approved baseline.'), h('button', { class: 'btn primary', onclick: save }, icon('plus', 15), 'Save version')),
    F.versions.length ? h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl rep' }, h('thead', {}, h('tr', {}, ['Version', 'Date', 'Total', 'vs current', 'Note', ''].map((x, i) => h('th', { class: i === 2 || i === 3 ? 'rt' : '' }, x)))),
      h('tbody', {}, [...F.versions].reverse().map(ver => h('tr', { 'data-key': ver.id }, h('td', { class: 'first' }, ver.name, F.baseline === ver.id ? h('span', { class: 'pill', style: { marginLeft: '8px', background: 'var(--ok)', color: '#fff' } }, 'Approved') : null), h('td', {}, ver.date),
        h('td', { class: 'rt' }, fm(ver.total)), h('td', { class: 'rt', style: { color: c.total - ver.total > 0 ? 'var(--danger)' : 'var(--ok)' } }, c.total === ver.total ? '—' : (c.total > ver.total ? '+' : '−') + fm(Math.abs(c.total - ver.total))), h('td', { class: 'muted' }, ver.note || ''),
        h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } }, h('button', { class: 'btn sm', onclick: () => compare(ver.id) }, 'Compare'), ' ', h('button', { class: 'btn sm', onclick: () => vm.toggleBaseline(ver.id) }, F.baseline === ver.id ? 'Clear baseline' : 'Set approved'), ' ',
          h('button', { class: 'btn sm', onclick: () => restore(ver) }, 'Restore'), ' ', ibtn('trash', 'Delete version', () => remove(ver), 'danger'))))))) : h('div', { class: 'empty' }, h('h3', {}, 'No versions yet'), h('p', {}, 'Save your first version to start tracking how the budget changes.')));
}

/* ---------------------------------------------------------------
   Setup — currency, additions, categories, templates
   --------------------------------------------------------------- */
function budgetSetup(v, c) {
  const { vm, fm } = v, F = c.F;
  const card = (title, sub, ...kids) => h('div', { class: 'card', style: { padding: '18px', marginBottom: '16px' } }, h('h3', { style: { fontSize: '15px', marginBottom: sub ? '2px' : '10px' } }, title), sub ? h('p', { class: 'small muted', style: { margin: '0 0 12px' } }, sub) : null, ...kids);
  const delCat = x => {
    if (!x.count) return vm.removeCategory(x.cat.id);
    const s = h('select', { class: 'inp' }, F.cats.filter(z => z !== x.cat).map(z => h('option', {}, z.name)));
    modal({ title: `Delete “${x.cat.name}”`, body: h('div', {}, h('p', { style: { marginTop: 0 } }, `${x.count} line${x.count > 1 ? 's' : ''} will move to:`), s), buttons: [{ label: 'Cancel' }, { label: 'Move & delete', primary: true, onClick: () => { vm.removeCategory(x.cat.id, s.value); } }] });
  };
  const useTemplate = async t => { if (!(await confirmBox(`Replace the category list with the “${t.label}” template? Lines stay where they are.`, 'Replace'))) return; vm.applyTemplate(t.key); toast(`${t.label} categories loaded`); };
  return h('div', {},
    card('General', null, h('div', { class: 'row wrap', style: { gap: '18px' } }, h('label', { class: 'row small' }, 'Currency symbol', h('input', { class: 'inp', value: vm.currency, style: { width: '70px' }, onchange: e => vm.setCurrency(e.target.value) })),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: F.cents !== false, onchange: e => vm.setCents(e.target.checked) }), 'Show cents'),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!F.locked, onchange: e => vm.setLocked(e.target.checked) }), 'Lock estimates (approved budget)'))),
    card('Additions & rules', 'Percentages or fixed amounts added on top of the lines, applied in order — fringes, tax, insurance, agency / production fees, contingency. Mark one as contingency to track draw-downs.',
      F.adds.length ? h('table', { class: 'tbl wide' }, h('thead', {}, h('tr', {}, ['Name', 'Type', 'Value', 'Applies to', 'Contingency', 'Amount', ''].map(x => h('th', {}, x)))), h('tbody', {}, F.adds.map((a, i) => h('tr', { 'data-key': a.id },
        h('td', {}, h('input', { class: 'cell', value: a.name, oninput: e => vm.updateAddition(a.id, 'name', e.target.value, { quiet: true }) })),
        h('td', { style: { width: '120px' } }, h('select', { class: 'cell', onchange: e => vm.updateAddition(a.id, 'type', e.target.value) }, [['percent', 'Percent'], ['fixed', 'Fixed amount']].map(([k, l]) => h('option', { value: k, selected: k === a.type }, l)))),
        h('td', { style: { width: '110px' } }, h('input', { class: 'cell num', type: 'number', step: 'any', value: a.value, oninput: e => vm.updateAddition(a.id, 'value', e.target.value) })),
        h('td', { style: { width: '230px' } }, a.type === 'percent' ? h('select', { class: 'cell', onchange: e => vm.updateAddition(a.id, 'base', e.target.value) }, vm.addBases.map(([k, l]) => h('option', { value: k, selected: k === a.base }, l))) : h('span', { class: 'muted small' }, '—')),
        h('td', { style: { width: '100px', textAlign: 'center' } }, h('input', { type: 'checkbox', checked: !!a.cont, onchange: e => vm.updateAddition(a.id, 'cont', e.target.checked) })), h('td', { class: 'rt' }, fm((c.adds[i] || {}).est)),
        h('td', { style: { width: '110px', whiteSpace: 'nowrap' } }, ibtn('up', 'Apply earlier', () => vm.moveAddition(a.id, -1)), ibtn('down', 'Apply later', () => vm.moveAddition(a.id, 1)), ibtn('trash', 'Delete', () => vm.removeAddition(a.id), 'danger')))))) : h('p', { class: 'muted small' }, 'No additions.'),
      h('div', { class: 'row', style: { marginTop: '10px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => vm.addAddition() }, icon('plus', 13), 'Add rule'),
        ...vm.presetAdds.map(([name, type, value, base]) => h('button', { class: 'btn sm ghost', onclick: () => vm.addAddition({ name, type, value, base }) }, '+ ' + name)))),
    card('Categories', 'Rename, regroup (above / below the line), choose which receive fringes, recolour or remove.',
      h('table', { class: 'tbl wide' }, h('thead', {}, h('tr', {}, ['', 'Category', 'Group', 'Fringes', 'Lines', 'Estimate', ''].map(x => h('th', {}, x)))), h('tbody', {}, c.cats.map(x => h('tr', { 'data-key': x.cat.id },
        h('td', { style: { width: '44px' } }, h('input', { type: 'color', class: 'colorpick', value: x.cat.color || '#687076', onchange: e => vm.updateCategory(x.cat.id, 'color', e.target.value) })),
        h('td', {}, h('input', { class: 'cell', value: x.cat.name, onchange: e => { if (!vm.renameCategory(x.cat.id, e.target.value)) { toast('Category names must be unique.', true); e.target.value = x.cat.name; } } })),
        h('td', { style: { width: '120px' } }, h('select', { class: 'cell', onchange: e => vm.updateCategory(x.cat.id, 'group', e.target.value) }, [['atl', 'Above the line'], ['btl', 'Below the line']].map(([k, l]) => h('option', { value: k, selected: k === x.cat.group }, l)))),
        h('td', { style: { width: '80px', textAlign: 'center' } }, h('input', { type: 'checkbox', checked: x.cat.fringe, onchange: e => vm.updateCategory(x.cat.id, 'fringe', e.target.checked) })),
        h('td', { style: { width: '70px' } }, String(x.count)), h('td', { class: 'rt' }, fm(x.est)),
        h('td', { style: { width: '110px', whiteSpace: 'nowrap' } }, ibtn('up', 'Move up', () => vm.moveCategory(x.cat.id, -1)), ibtn('down', 'Move down', () => vm.moveCategory(x.cat.id, 1)), ibtn('trash', 'Delete category', () => delCat(x), 'danger')))))),
      h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onclick: () => vm.addCategory() }, icon('plus', 13), 'Add category'))),
    card('Templates', 'Load a category set for a production type. Your lines are kept — any line in a category the template lacks keeps its own category.',
      h('div', { class: 'row wrap' }, vm.templates.map(t => h('button', { class: 'btn', onclick: () => useTemplate(t) }, t.label)))));
}

/* ---------------------------------------------------------------
   Portfolio — every project's budget at a glance (home level)
   --------------------------------------------------------------- */
function renderBudgets() {
  const app = $('#app'); app.innerHTML = ''; app.style.display = 'block'; app.style.overflow = 'auto';
  const rows = finPortfolio(), totals = BudgetModel.portfolioTotals(rows);
  const fm = (r, n) => finMoney(r.p, n, false), st = s => BudgetModel.STATUS_LABEL[s];
  const totalCard = t => h('div', { class: 'card', style: { padding: '16px', minWidth: '260px' } }, h('div', { class: 'small muted' }, `${t.n} project${t.n === 1 ? '' : 's'} · ${t.cur}`), h('div', { class: 'fin-kpis', style: { gridTemplateColumns: 'repeat(2, 1fr)', margin: '10px 0 0' } },
    [['Total budget', t.total], ['Spent', t.act], ['Committed', t.com], ['Forecast', t.eac]].map(([l, n]) => h('div', { class: 'fin-kpi' }, h('span', { class: 'fk-l' }, l), h('b', {}, t.cur + Math.round(n).toLocaleString())))));
  const csv = () => download('studiobindahh-budgets.csv', toCSV([['Project', 'Type', 'Currency', 'Budget', 'Spent', 'Committed', 'Remaining', 'Forecast', 'Variance', 'Status'], ...rows.map(r => [r.p.title, MODE_LABEL[r.p.mode] || r.p.mode, r.cur, Math.round(r.c.total), Math.round(r.c.act), Math.round(r.c.com), Math.round(r.c.remaining), Math.round(r.c.eac), Math.round(r.c.variance), st(r.c.status)[0]])]), 'text/csv');
  app.append(h('div', { class: 'home-top' }, h('a', { class: 'logo', href: '#/', style: { padding: 0 } }, h('span', { class: 'mark' }, icon('film', 18)), 'StudioBindahh'), h('span', { class: 'grow' }), h('a', { class: 'btn sm', href: '#/' }, icon('home', 15), 'All projects'), themeBtn()),
    h('div', { class: 'page', style: { maxWidth: '1280px' } }, h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, 'Budgets'), h('div', { class: 'muted small', style: { marginTop: '3px' } }, 'Every production’s money in one place. Click a project to open its budget.')), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: csv }, icon('download', 15), 'CSV')),
      h('div', { class: 'row wrap', style: { gap: '14px', marginBottom: '18px', alignItems: 'stretch' } }, totals.map(totalCard)),
      rows.length ? h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl rep' }, h('thead', {}, h('tr', {}, ['Project', 'Type', 'Budget', 'Spent', 'Committed', 'Remaining', 'Forecast', 'Variance', 'Status'].map((x, i) => h('th', { class: i > 1 && i < 8 ? 'rt' : '' }, x)))),
        h('tbody', {}, rows.map(r => h('tr', { style: { cursor: 'pointer' }, onclick: () => { (UI.budget = UI.budget || {}).tab = 'dash'; location.hash = `#/p/${r.p.id}/budget`; } }, h('td', { class: 'first' }, r.p.series ? [r.p.title, h('div', { class: 'small muted' }, `${r.p.series.name} · ${epCode(r.p.series)}`)] : r.p.title), h('td', {}, MODE_LABEL[r.p.mode] || ''),
          h('td', { class: 'rt' }, fm(r, r.c.total)), h('td', { class: 'rt' }, h('div', {}, fm(r, r.c.act)), r.c.total ? h('div', { class: 'progress', style: { marginTop: '4px', minWidth: '70px' } }, h('i', { style: { width: Math.min(100, r.c.spentPct) + '%', background: r.c.spentPct > 100 ? 'var(--danger)' : '' } })) : null),
          h('td', { class: 'rt' }, fm(r, r.c.com)), h('td', { class: 'rt' + (r.c.remaining < 0 ? ' neg' : '') }, fm(r, r.c.remaining)), h('td', { class: 'rt' }, fm(r, r.c.eac)), h('td', { class: 'rt' + (r.c.variance < 0 ? ' neg' : '') }, fm(r, r.c.variance)), h('td', {}, h('span', { class: 'pill ' + st(r.c.status)[1] }, st(r.c.status)[0]))))))) : h('div', { class: 'empty' }, h('h3', {}, 'No projects yet')),
      totals.length > 1 ? h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Projects use different currencies, so they are totalled separately.') : null));
}
