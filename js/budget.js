'use strict';
/* ===================================================================
   Budget — VIEW: header, KPIs and tabs (dashboard, budget sheet,
   expenses). Top sheet, cash flow, versions, setup, printing and the
   portfolio page are in budget2.js. Rules: js/models/budget.model.js;
   screen state and commands: js/viewmodels/budget.vm.js.
   =================================================================== */

/* a <select> of every account line, grouped by category */
function budgetAcctSelect(vm, value, onchange, cls = 'cell') {
  return h('select', { class: cls, onchange: e => onchange(e.target.value) }, h('option', { value: '' }, '— Unallocated —'),
    vm.accountGroups.map(g => h('optgroup', { label: g.label }, g.options.map(o => h('option', { value: o.value, selected: o.value === value }, o.label)))));
}
/* add or edit an expense; edits a draft, saved on Save */
function budgetExpenseModal(vm, preset = {}) {
  const t = preset.id ? Object.assign({}, preset) : vm.newExpense(preset);
  const f = (label, el) => h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, label), el);
  const inp = (k, o = {}) => h('input', { class: 'inp', type: o.type, list: o.list, placeholder: o.ph || '', value: t[k] || '', oninput: e => { t[k] = e.target.value; } });
  const rc = h('div', { class: 'small muted' }, t.receipt ? 'Receipt attached' : 'No receipt');
  const body = h('div', {}, h('div', { class: 'fx-grid' }, f('Date', inp('date', { type: 'date' })), f('Amount', inp('amount', { type: 'number', ph: '0.00' })),
    f('Status', h('select', { class: 'inp', onchange: e => { t.status = e.target.value; } }, vm.statuses.map(s => h('option', { selected: s === t.status, title: vm.statusHelp[s] }, s)))),
    f('Vendor / payee', inp('vendor', { list: 'dl-vendors', ph: 'Who was paid' })), f('Description', inp('desc', { ph: 'What for' })), f('Account', budgetAcctSelect(vm, t.lineId, v => { t.lineId = v; }, 'inp')),
    f('Invoice / PO / receipt #', inp('ref')), f('Method', inp('method', { list: 'dl-methods' })),
    f('Receipt', h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: async () => { const fl = (await pickFiles('image/*'))[0]; if (!fl) return; t.receipt = (await thumbOf(fl, 900, 0.7)).thumb; rc.textContent = 'Receipt attached'; } }, icon('image', 14), 'Attach photo'), rc))),
    h('div', { style: { height: '10px' } }), f('Notes', h('textarea', { class: 'inp', rows: 2, value: t.notes || '', oninput: e => { t.notes = e.target.value; } })),
    h('datalist', { id: 'dl-vendors' }, vm.vendors.map(v => h('option', { value: v }))), h('datalist', { id: 'dl-methods' }, vm.payMethods.map(v => h('option', { value: v }))));
  modal({ title: preset.id ? 'Edit expense' : 'Add expense', wide: true, body, buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => {
    if (!vm.saveExpense(t)) { toast('Enter an amount.', true); return false; } toast('Expense saved');
  } }] });
}
function budgetReceipt(vm, t) {
  modal({ title: `Receipt — ${t.vendor || t.desc || ''}`, wide: true, body: h('div', { style: { textAlign: 'center' } }, h('img', { src: t.receipt, style: { maxWidth: '100%', maxHeight: '70vh' } })),
    buttons: [{ label: 'Remove receipt', onClick: () => { vm.updateExpense(t.id, 'receipt', ''); } }, { label: 'Close', primary: true }] });
}

Views.budget = function (root) {
  const vm = new BudgetVM(), wrap = h('div', { class: 'page fin', style: { maxWidth: '1360px' } }); root.append(wrap);
  const sel = new Set();                                         // expenses ticked for bulk edits
  const v = { vm, sel, fm: n => vm.fm(n), fs: n => vm.fs(n) };
  const TABS = { dash: budgetDash, budget: budgetSheet, expenses: budgetExpenses, top: budgetTop, cash: budgetCash, versions: budgetVersions, setup: budgetSetup };

  function kpis(c) {
    const fm = v.fm, k = (label, value, sub, cls, bar) => h('div', { class: 'fin-kpi ' + (cls || '') }, h('span', { class: 'fk-l' }, label), h('b', {}, value), sub ? h('span', { class: 'fk-s' }, sub) : null, bar != null ? h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, bar) + '%', background: bar > 100 ? 'var(--danger)' : '' } })) : null);
    const st = c.status === 'empty' ? ['No budget yet', ''] : vm.statusLabel(c), vs = c.baseline != null ? c.total - c.baseline : null;
    return h('div', { class: 'fin-kpis' }, k('Total budget', fm(c.total), vs ? `${vs > 0 ? '+' : '−'}${fm(Math.abs(vs))} vs approved` : c.addEst ? `incl. ${fm(c.addEst)} additions` : `${vm.P.budget.length} lines`),
      k('Spent', fm(c.act), `${c.spentPct.toFixed(0)}% of budget`, '', c.spentPct), k('Committed', fm(c.com), 'open orders & bookings'),
      k('Remaining', fm(c.remaining), 'budget − spent − committed', c.remaining < 0 ? 'neg' : ''), k('Forecast', fm(c.eac), c.variance >= 0 ? `${fm(c.variance)} under budget` : `${fm(-c.variance)} over budget`, c.variance < 0 ? 'neg' : ''),
      h('div', { class: 'fin-kpi status ' + st[1] }, h('span', { class: 'fk-l' }, 'Status'), h('b', {}, st[0]), c.contEst ? h('span', { class: 'fk-s' }, `Contingency left ${fm(c.contEst - c.contUsed)}`) : null));
  }
  const printMenu = e => menu(e.currentTarget, [['top', 'Top sheet'], ['detail', 'Detailed budget'], ['cost', 'Cost report (budget vs actual)'], ['ledger', 'Expense ledger'], ['cash', 'Cash flow']].map(([k, label]) => ({ label, icon: 'print', onClick: () => budgetPrint(vm, k) })));
  const exportMenu = e => menu(e.currentTarget, [{ label: 'Budget (CSV)', icon: 'download', onClick: () => download(slug(vm.P.title) + '-budget.csv', toCSV(vm.linesCsv()), 'text/csv') }, { label: 'Expenses (CSV)', icon: 'download', onClick: () => download(slug(vm.P.title) + '-expenses.csv', toCSV(vm.txnsCsv()), 'text/csv') }, { sep: true },
    { label: 'Import budget lines (CSV)…', icon: 'upload', onClick: () => v.importLines() }, { label: 'Import bank / card statement (CSV)…', icon: 'upload', onClick: () => importStatement() }]);
  v.importLines = async () => {
    const f = (await pickFiles('.csv,.txt'))[0]; if (!f) return; const ls = vm.parseLines(parseCSV(await readText(f)));
    if (!ls.length) return toast('No budget lines found. Expected columns like Account, Category, Description, Qty, Unit, Rate.', true);
    if (await confirmBox(`Add ${ls.length} budget line${ls.length > 1 ? 's' : ''} from “${f.name}”?`, 'Add lines')) { vm.addLines(ls); toast(`Added ${ls.length} lines`); }
  };
  async function importStatement() {
    const f = (await pickFiles('.csv,.txt'))[0]; if (!f) return; const ts = vm.parseTxns(parseCSV(await readText(f)));
    if (!ts.length) return toast('No transactions found. Expected Date, Description and Amount columns.', true);
    if (await confirmBox(`Import ${ts.length} transaction${ts.length > 1 ? 's' : ''} as unallocated expenses? You can assign each to an account afterwards.`, 'Import')) { vm.addTxns(ts); toast(`Imported ${ts.length} expenses`); }
  }
  v.sync = () => { const r = vm.syncProduction(); toast(`Updated from production: ${r.cast} cast, ${r.crew} crew, ${r.loc} locations${r.items ? ', ' + r.items + ' prop/wardrobe totals' : ''}${r.gear ? ', ' + r.gear + ' gear items' : ''}`); return r; };

  function draw() {
    const c = vm.calc, tab = vm.tab, F = c.F;
    morph(wrap, [h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, 'Budget'), h('div', { class: 'muted small', style: { marginTop: '3px' } }, 'Plan it, track every expense against it, and see where the money is going.')), h('span', { class: 'grow' }),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        h('button', { class: 'btn', title: F.locked ? 'Unlock estimates' : 'Lock the approved budget — estimates become read-only', onclick: () => vm.toggleLock() }, icon('lock', 15), F.locked ? 'Locked' : 'Lock'),
        h('button', { class: 'btn', title: 'Cast, crew and location rates, props, wardrobe and gear', onclick: () => v.sync() }, icon('wand', 15), 'Sync from production'),
        h('button', { class: 'btn', onclick: exportMenu }, icon('download', 15), 'Import / export'), h('button', { class: 'btn', onclick: printMenu }, icon('print', 15), 'Print'),
        h('button', { class: 'btn primary', onclick: () => budgetExpenseModal(vm, vm.expFilter.line ? { lineId: vm.expFilter.line } : {}) }, icon('plus', 15), 'Add expense'))),
      kpis(c),
      h('div', { class: 'tabs fin-tabs' }, vm.tabs.map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => vm.setTab(k) }, l, k === 'expenses' && c.un.n ? h('span', { class: 'pill warn', style: { marginLeft: '6px' }, title: 'Unallocated expenses' }, c.un.n) : null))),
      F.locked ? h('div', { class: 'csalert info', 'data-key': 'locked', style: { marginBottom: '12px' } }, icon('lock', 14), ' The budget is locked (approved). Estimates can’t be edited, but you can keep recording expenses. Unlock it in Setup or with the button above to change estimates.') : null,
      h('div', { 'data-key': 'tab-' + tab }, TABS[tab](v, c))]);
  }
  v.draw = draw;
  return bindView(vm, draw);
};

/* ---------------------------------------------------------------
   Dashboard
   --------------------------------------------------------------- */
function budgetDash(v, c) {
  const { vm, fm } = v;
  if (vm.isEmpty) {
    return h('div', { class: 'empty' }, h('h3', {}, 'Start your budget'), h('p', {}, 'Pull in costs from your cast, crew and locations, import a spreadsheet, or add lines by hand.'),
      h('div', { class: 'row', style: { justifyContent: 'center', flexWrap: 'wrap' } }, h('button', { class: 'btn primary', onclick: () => { v.sync(); vm.setTab('budget'); } }, icon('wand', 15), 'Build from production'),
        h('button', { class: 'btn', onclick: () => v.importLines() }, icon('upload', 15), 'Import CSV'), h('button', { class: 'btn', onclick: () => vm.setTab('budget') }, icon('plus', 15), 'Add lines by hand'), h('button', { class: 'btn', onclick: () => vm.setTab('setup') }, 'Choose a template')));
  }
  const rowsC = vm.chartRows(c), max = Math.max(1, ...rowsC.map(x => Math.max(x.est, x.eac))), pct = n => (n / max * 100) + '%';
  const chart = h('div', { class: 'card', style: { padding: '16px' } }, h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h3', { style: { fontSize: '15px' } }, 'Budget vs spend by category'), h('span', { class: 'grow' }),
    h('span', { class: 'fin-leg' }, h('i', { class: 'a' }), 'Spent', h('i', { class: 'c' }), 'Committed', h('i', { class: 'r' }), 'Remaining budget', h('i', { class: 'o' }), 'Over')),
    rowsC.length ? rowsC.map(x => h('div', { class: 'fin-bar', 'data-key': x.cat.id, onclick: () => { vm.expand(x.cat.id); vm.setTab('budget'); } }, h('div', { class: 'fb-name' }, h('i', { style: { background: x.cat.color } }), x.cat.name),
      h('div', { class: 'fb-track' }, h('b', { class: 'a', style: { width: pct(Math.min(x.spent, x.est || x.spent)) } }), h('b', { class: 'c', style: { width: pct(Math.min(x.com, Math.max(0, x.est - x.spent) || x.com)) } }), h('b', { class: 'r', style: { width: pct(x.left) } }), x.over ? h('b', { class: 'o', style: { width: pct(x.over) } }) : null),
      h('div', { class: 'fb-n' }, h('b', {}, fm(x.est)), h('span', { class: 'small muted' }, x.spent + x.com ? `${fm(x.spent + x.com)} used` : 'no spend')))) : h('p', { class: 'muted' }, 'No categories with budget yet.'));
  const alerts = vm.alerts(c), over = vm.overLines(c), vendors = vm.topVendors();
  const cf = vm.cashflow(c).rows.filter(r => r.month !== 'undated'), cmax = Math.max(1, ...cf.map(r => r.actual + r.committed + r.forecast));
  const card = (title, ...kids) => h('div', { class: 'card', style: { padding: '16px', marginTop: '14px' } }, h('h3', { style: { fontSize: '15px', marginBottom: '8px' } }, title), ...kids);
  const pair = (a, b, cls) => h('div', { class: 'row', style: { justifyContent: 'space-between', padding: '4px 0' } }, h('span', { class: 'small' }, a), h('b', { class: 'small ' + (cls || '') }, b));
  return h('div', { class: 'fin-cols' }, h('div', {}, chart,
    card('Spend by month', cf.length ? h('div', { class: 'fin-months' }, cf.map(r => h('div', { class: 'fm-col', title: `${r.month}: spent ${fm(r.actual)}, committed ${fm(r.committed)}, forecast ${fm(r.forecast)}` },
      h('div', { class: 'fm-stack', style: { height: ((r.actual + r.committed + r.forecast) / cmax * 120) + 'px' } }, h('i', { class: 'f', style: { flex: r.forecast } }), h('i', { class: 'c', style: { flex: r.committed } }), h('i', { class: 'a', style: { flex: r.actual } })), h('span', { class: 'small muted' }, r.month.slice(2)))))
      : h('p', { class: 'muted small', style: { margin: 0 } }, 'Dates on expenses and line due-dates build this chart.'))),
    h('div', {}, h('div', { class: 'card', style: { padding: '16px' } }, h('h3', { style: { fontSize: '15px', marginBottom: '8px' } }, 'Needs attention'),
      alerts.length ? h('ul', { class: 'attn' }, alerts.map(([t, m, tab]) => h('li', {}, h('a', { href: '#', class: t, onclick: e => { e.preventDefault(); vm.setTab(tab); } }, h('span', {}, m), icon('right', 14))))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing needs attention. ✓')),
      over.length ? card('Biggest overruns', over.slice(0, 5).map(x => pair(x.l.desc || '(no description)', '+' + fm(x.by), 'neg'))) : null,
      vendors.length ? card('Top vendors', vendors.map(([name, n]) => pair(name, fm(n)))) : null));
}

/* ---------------------------------------------------------------
   Budget sheet
   --------------------------------------------------------------- */
function budgetSheet(v, c) {
  const { vm, fm } = v, locked = vm.locked, B = vm.lineFilter;
  const num = (l, k, step) => h('input', { class: 'cell num', type: 'number', min: 0, step: step || 'any', value: l[k] === undefined ? '' : l[k], disabled: locked, 'data-col': k, oninput: e => vm.updateLine(l.id, k, e.target.value), onkeydown: e => key(e, l, k) });
  const text = (l, k, ph, cls) => h('input', { class: 'cell' + (cls ? ' ' + cls : ''), value: l[k] || '', placeholder: ph, disabled: locked, 'data-col': k, oninput: e => vm.updateLine(l.id, k, e.target.value, { quiet: true }), onkeydown: e => key(e, l, k) });
  const focusDesc = id => setTimeout(() => { const el = document.querySelector(`tr[data-line="${id}"] input[data-col=desc]`); el && el.focus(); }, 30);
  const addLine = (cat, afterId) => { const l = vm.addLine(cat, afterId); focusDesc(l.id); };
  /* ↑ ↓ and Enter move between rows; Enter in the last Rate adds a line */
  function key(e, l, col) {
    if (!(e.key === 'ArrowDown' || e.key === 'ArrowUp' || (e.key === 'Enter' && !e.shiftKey))) return;
    const rows = [...document.querySelectorAll('tr[data-line]')], i = rows.findIndex(r => r.dataset.line === l.id), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (e.key === 'Enter' && j >= rows.length && col === 'rate' && !locked) { e.preventDefault(); return addLine(l.cat, l.id); }
    const t = rows[j] && rows[j].querySelector(`[data-col=${col}]`); if (t) { e.preventDefault(); t.focus(); t.select && t.select(); }
  }
  const moveLine = l => { const s = h('select', { class: 'inp' }, vm.F.cats.map(x => h('option', { selected: x.name === l.cat }, x.name))); modal({ title: 'Move line', body: h('div', {}, h('p', { style: { marginTop: 0 } }, l.desc || '(no description)'), s), buttons: [{ label: 'Cancel' }, { label: 'Move', primary: true, onClick: () => { vm.moveLine(l.id, s.value); } }] }); };
  const delLine = async l => { const n = (c.lines.get(l.id) || {}).n || 0; if (await confirmBox(n ? `Delete “${l.desc || 'this line'}”? Its ${n} expense${n > 1 ? 's' : ''} stay in the ledger as unallocated.` : `Delete “${l.desc || 'this line'}”?`)) vm.removeLine(l.id); };
  const lineMenu = (e, l) => menu(e.currentTarget, [
    { label: 'Add expense to this line', icon: 'dollar', onClick: () => budgetExpenseModal(vm, { lineId: l.id }) }, { label: 'View its expenses', icon: 'list', onClick: () => vm.showLineExpenses(l.id) },
    { label: l.done ? 'Re-open line (forecast the rest)' : 'Mark complete (no more spend)', icon: 'check', onClick: () => vm.toggleDone(l.id) }, { sep: true },
    { label: 'Insert line below', icon: 'plus', onClick: () => addLine(l.cat, l.id) }, { label: 'Duplicate', icon: 'copy', onClick: () => vm.duplicateLine(l.id) },
    { label: 'Move to another category…', icon: 'right', onClick: () => moveLine(l) }, { label: 'Move up', icon: 'up', onClick: () => vm.shiftLine(l.id, -1) }, { label: 'Move down', icon: 'down', onClick: () => vm.shiftLine(l.id, 1) }, { sep: true },
    { label: 'Delete line', icon: 'trash', danger: true, onClick: () => delLine(l) }]);
  const lineRows = l => {
    const r = c.lines.get(l.id), open = vm.isOpen(l.id), neg = r.rem < 0 && (r.act || r.com) > 0;
    const tr = h('tr', { 'data-key': 'l:' + l.id, 'data-line': l.id, class: 'fin-line' + (l.done ? ' done' : '') + (open ? ' open' : '') },
      h('td', { class: 'fl-x' }, h('button', { class: 'chev' + (open ? ' on' : ''), title: 'Details', onclick: () => vm.toggleOpen(l.id) }, '▸')),
      h('td', { style: { width: '78px' } }, text(l, 'acct', 'Acct', 'mono')),
      h('td', {}, text(l, 'desc', 'Description'), l.auto ? h('span', { class: 'fl-auto', title: 'Created from production data — re-syncing updates it' }, 'auto') : null),
      h('td', { style: { width: '74px' } }, num(l, 'qty')), h('td', { style: { width: '92px' } }, h('select', { class: 'cell', disabled: locked, onchange: e => vm.updateLine(l.id, 'unit', e.target.value) }, vm.units.map(u => h('option', { selected: u === l.unit }, u)))),
      h('td', { style: { width: '108px' } }, num(l, 'rate', '0.01')),
      h('td', { class: 'fl-n est' }, fm(r.est)), h('td', { class: 'fl-n', title: 'Click to see expenses', style: { cursor: 'pointer' }, onclick: () => vm.showLineExpenses(l.id) }, r.act ? fm(r.act) : '—'),
      h('td', { class: 'fl-n' }, r.com ? fm(r.com) : '—'), h('td', { class: 'fl-n' + (neg ? ' neg' : '') }, fm(r.rem)),
      h('td', { style: { width: '40px' } }, ibtn('more', 'Line actions', e => lineMenu(e, l))));
    if (!open) return [tr];
    const d = (label, el) => h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, label), el);
    const quiet = k => e => vm.updateLine(l.id, k, e.target.value, { quiet: true });
    return [tr, h('tr', { 'data-key': 'd:' + l.id, class: 'fin-detail' }, h('td', { colspan: 11 }, h('div', { class: 'fx-grid' },
      d('Vendor / supplier', h('input', { class: 'inp', value: l.vendor || '', placeholder: 'Who supplies this', oninput: quiet('vendor') })),
      d('Due / needed by', h('input', { class: 'inp', type: 'date', value: l.due || '', oninput: e => vm.updateLine(l.id, 'due', e.target.value) })),
      d('Forecast to complete (override)', h('input', { class: 'inp', type: 'number', min: 0, step: 'any', value: l.etc === undefined ? '' : l.etc, placeholder: `auto: ${fm(Math.max(0, r.est - r.act - r.com))}`, oninput: e => vm.updateLine(l.id, 'etc', e.target.value) })),
      d('Notes', h('input', { class: 'inp', value: l.notes || '', oninput: quiet('notes') })),
      h('div', { class: 'row', style: { alignItems: 'flex-end', gap: '8px' } }, h('button', { class: 'btn sm', onclick: () => budgetExpenseModal(vm, { lineId: l.id }) }, icon('plus', 13), 'Add expense'), r.n ? h('span', { class: 'small muted' }, `${r.n} expense${r.n > 1 ? 's' : ''}`) : null))))];
  };
  const cell = (val, neg) => h('td', { class: 'fl-n' + (neg ? ' neg' : '') }, val);
  const bodies = vm.sheet(c).map(({ x, lines, collapsed, filtered }) => h('tbody', { class: 'fin-cat', 'data-key': 'c:' + x.cat.id },
    h('tr', { class: 'catrow' }, h('td', { colspan: 3 }, h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'chev' + (collapsed ? '' : ' on'), onclick: () => vm.toggleCollapsed(x.cat.id) }, '▸'), h('i', { class: 'cdot', style: { background: x.cat.color } }), h('b', { class: 'cname' }, x.cat.name),
      h('span', { class: 'pill' }, x.cat.group === 'atl' ? 'ATL' : 'BTL'), x.cat.fringe ? h('span', { class: 'pill', title: 'Fringes apply to this category' }, 'fringe') : null, h('span', { class: 'small muted' }, `${x.count} line${x.count === 1 ? '' : 's'}`))),
      h('td', { colspan: 3 }), cell(x.count ? fm(x.est) : ''), cell(x.act ? fm(x.act) : ''), cell(x.com ? fm(x.com) : ''), cell(x.count ? fm(x.rem) : '', x.rem < 0 && (x.act + x.com) > 0),
      h('td', {}, ibtn('plus', 'Add a line to ' + x.cat.name, () => addLine(x.cat.name), 'sm'))),
    collapsed ? null : lines.map(lineRows),
    !collapsed && !lines.length && !filtered ? h('tr', {}, h('td', { colspan: 11, class: 'small muted', style: { padding: '8px 14px' } }, 'No lines yet. ', h('a', { href: '#', onclick: e => { e.preventDefault(); addLine(x.cat.name); } }, 'Add one'))) : null));
  const un = c.un.n ? h('tbody', { 'data-key': 'unalloc' }, h('tr', { class: 'catrow' }, h('td', { colspan: 3 }, h('b', {}, 'Unallocated expenses'), h('span', { class: 'small muted', style: { marginLeft: '8px' } }, `${c.un.n} — assign them to accounts in Expenses`)), h('td', { colspan: 3 }), cell(''), cell(fm(c.un.act)), cell(c.un.com ? fm(c.un.com) : ''), cell(fm(-(c.un.act + c.un.com)), true), h('td'))) : null;
  const foot = h('tfoot', { 'data-key': 'foot' }, h('tr', { class: 'sumrow' }, h('td', { colspan: 6 }, 'Subtotal'), cell(fm(c.sub.est)), cell(fm(c.sub.act)), cell(fm(c.sub.com)), cell(fm(c.sub.est - c.sub.act - c.sub.com)), h('td')),
    c.adds.map(x => h('tr', { class: 'addrow' }, h('td', { colspan: 6 }, vm.addLabel(x.add)), cell(fm(x.est)), cell(x.act ? fm(x.act) : ''), cell(x.com ? fm(x.com) : ''), cell(fm(x.rem)), h('td'))),
    h('tr', { class: 'grandrow' }, h('td', { colspan: 6 }, 'TOTAL BUDGET'), cell(fm(c.total)), cell(fm(c.act)), cell(fm(c.com)), cell(fm(c.remaining), c.remaining < 0), h('td')));
  const addCat = async () => { const n = await promptBox('New category', 'Category name', ''); if (!n) return; if (!vm.addCategory(n)) toast('That category exists.', true); };
  return h('div', {}, h('div', { class: 'row wrap', style: { marginBottom: '12px' } },
    h('input', { class: 'inp', placeholder: 'Search lines…', value: B.q, style: { width: '220px' }, oninput: e => vm.setLineFilter({ q: e.target.value }) }),
    h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: B.over, onchange: e => vm.setLineFilter({ over: e.target.checked }) }), 'Over budget only'), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', onclick: () => vm.collapseAll() }, 'Collapse all'), h('button', { class: 'btn sm', onclick: () => vm.expandAll() }, 'Expand all'),
    h('button', { class: 'btn sm', title: 'Give every line without one an account code', onclick: () => { const n = vm.numberAccounts(); toast(n ? 'Account codes added' : 'Every line already has an account code'); } }, icon('hash', 13), 'Number accounts')),
    h('div', { class: 'rep-wrap fin-wrap' }, h('table', { class: 'tbl fin-grid' }, h('thead', { 'data-key': 'head' }, h('tr', {}, ['', 'Acct', 'Description', 'Qty', 'Unit', 'Rate', 'Estimate', 'Actual', 'Committed', 'Remaining', ''].map((x, i) => h('th', { class: i >= 6 && i <= 9 ? 'rt' : '' }, x)))), bodies, un, foot)),
    h('div', { class: 'row', style: { marginTop: '12px', flexWrap: 'wrap' } }, h('button', { class: 'btn', onclick: addCat }, icon('plus', 15), 'Add category'), h('span', { class: 'small muted' }, 'Tip: ↑ ↓ and Enter move between rows; Enter in the last Rate adds a new line.')));
}

/* ---------------------------------------------------------------
   Expenses ledger
   --------------------------------------------------------------- */
function budgetExpenses(v, c) {
  const { vm, fm, sel } = v, E = vm.expFilter, F = c.F, { list, shown, totals } = vm.expenses;
  const ids = new Set(F.txns.map(t => t.id)); [...sel].forEach(id => { if (!ids.has(id)) sel.delete(id); });
  const quiet = (t, k) => e => vm.updateExpense(t.id, k, e.target.value, { quiet: true });
  const rows = shown.map(t => h('tr', { 'data-key': t.id }, h('td', { style: { width: '30px' } }, h('input', { type: 'checkbox', checked: sel.has(t.id), onchange: e => { e.target.checked ? sel.add(t.id) : sel.delete(t.id); v.draw(); } })),
    h('td', { style: { width: '132px' } }, h('input', { class: 'cell', type: 'date', value: t.date || '', oninput: quiet(t, 'date') })), h('td', { style: { width: '170px' } }, h('input', { class: 'cell', list: 'dl-vendors2', value: t.vendor || '', placeholder: 'Vendor', oninput: quiet(t, 'vendor') })),
    h('td', {}, h('input', { class: 'cell', value: t.desc || '', placeholder: 'Description', oninput: quiet(t, 'desc') })), h('td', { style: { width: '230px' } }, budgetAcctSelect(vm, t.lineId, val => vm.updateExpense(t.id, 'lineId', val))),
    h('td', { style: { width: '112px' } }, h('input', { class: 'cell num', type: 'number', step: '0.01', value: t.amount, oninput: e => vm.updateExpense(t.id, 'amount', e.target.value) })),
    h('td', { style: { width: '116px' } }, h('select', { class: 'cell st-' + t.status, onchange: e => vm.updateExpense(t.id, 'status', e.target.value) }, vm.statuses.map(s => h('option', { selected: s === t.status }, s)))),
    h('td', { style: { width: '110px' } }, h('input', { class: 'cell', value: t.ref || '', placeholder: 'Ref #', oninput: quiet(t, 'ref') })),
    h('td', { style: { width: '88px', whiteSpace: 'nowrap' } }, ibtn(t.receipt ? 'image' : 'file', t.receipt ? 'View receipt' : 'Edit details / attach receipt', () => t.receipt ? budgetReceipt(vm, t) : budgetExpenseModal(vm, t)), ibtn('copy', 'Duplicate', () => vm.duplicateExpense(t.id)), ibtn('trash', 'Delete', () => vm.removeExpenses([t.id]), 'danger'))));
  if (!list.length) rows.push(h('tr', { 'data-key': 'none' }, h('td', { colspan: 9 }, h('div', { class: 'empty', style: { padding: '24px' } }, h('p', {}, F.txns.length ? 'No expenses match these filters.' : 'No expenses yet. Record what you spend, owe or have committed — each one is tied to a budget line.')))));
  const picked = [...sel];
  const bulk = picked.length ? h('div', { class: 'row', 'data-key': 'bulk', style: { marginBottom: '8px' } }, h('b', {}, `${picked.length} selected`),
    Object.assign(budgetAcctSelect(vm, '', val => vm.assignExpenses(picked, val), 'inp'), { title: 'Assign selected expenses to an account' }),
    h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { if (e.target.value) vm.setExpenseStatus(picked, e.target.value); } }, h('option', { value: '' }, 'Set status…'), vm.statuses.map(s => h('option', {}, s))),
    h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox(`Delete ${picked.length} expense${picked.length > 1 ? 's' : ''}?`)) { vm.removeExpenses(picked); sel.clear(); v.draw(); } } }, icon('trash', 13), 'Delete'),
    h('button', { class: 'btn sm ghost', onclick: () => { sel.clear(); v.draw(); } }, 'Clear')) : null;
  const filterSel = (val, ph, opts, on) => h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => on(e.target.value) }, h('option', { value: '' }, ph), opts.map(([k, l]) => h('option', { value: k, selected: k === val }, l)));
  return h('div', {}, h('div', { class: 'row wrap', 'data-key': 'bar', style: { marginBottom: '12px' } },
    h('input', { class: 'inp', placeholder: 'Search vendor, description, ref…', value: E.q, style: { width: '240px' }, oninput: e => vm.setExpFilter({ q: e.target.value }) }),
    filterSel(E.status, 'Any status', vm.statuses.map(s => [s, s]), val => vm.setExpFilter({ status: val })),
    filterSel(E.cat, 'Any category', [['__un', 'Unallocated'], ...F.cats.map(x => [x.name, x.name])], val => vm.setExpFilter({ cat: val })),
    filterSel(E.month, 'Any month', vm.months.map(m => [m, m]), val => vm.setExpFilter({ month: val })),
    E.line ? h('button', { class: 'btn sm', onclick: () => vm.setExpFilter({ line: '' }) }, `Line: ${(vm.line(E.line) || {}).desc || '…'} ✕`) : null, h('span', { class: 'grow' }),
    h('button', { class: 'btn primary', onclick: () => budgetExpenseModal(vm, E.line ? { lineId: E.line } : {}) }, icon('plus', 15), 'Add expense')),
    bulk, h('div', { class: 'rep-wrap fin-wrap', 'data-key': 'ledger' }, h('table', { class: 'tbl wide fin-ledger' }, h('thead', {}, h('tr', {}, ['', 'Date', 'Vendor', 'Description', 'Account', 'Amount', 'Status', 'Ref', ''].map(x => h('th', {}, x)))), h('tbody', {}, rows))),
    h('div', { class: 'small muted', 'data-key': 'foot', style: { margin: '10px 2px' } }, `${list.length} expense${list.length === 1 ? '' : 's'}${list.length > shown.length ? ` (showing ${shown.length})` : ''} · Paid ${fm(totals.Paid)} · Invoiced ${fm(totals.Invoiced)} · Committed ${fm(totals.Committed)}`,
      list.length > shown.length ? [' ', h('a', { href: '#', onclick: e => { e.preventDefault(); vm.showMore(); } }, 'Show more')] : null),
    h('datalist', { id: 'dl-vendors2' }, vm.vendors.map(x => h('option', { value: x }))));
}
