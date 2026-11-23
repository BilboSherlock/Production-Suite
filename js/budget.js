'use strict';
/* ===================================================================
   Budget — dashboard, budget sheet, expenses. (Top sheet, cash flow,
   versions and setup live in budget2.js; the maths is in fin.js.)
   =================================================================== */
const FIN_TABS = [['dash', 'Dashboard'], ['budget', 'Budget'], ['expenses', 'Expenses'], ['top', 'Top sheet'], ['cash', 'Cash flow'], ['versions', 'Versions'], ['setup', 'Setup']];
UI.bTab = UI.bTab || 'dash'; UI.bOpen = UI.bOpen || new Set(); UI.bCollapsed = UI.bCollapsed || new Set(); UI.bF = UI.bF || { q: '', over: false }; UI.eF = UI.eF || { q: '', status: '', cat: '', line: '', month: '' };
const PAY_METHODS = ['Card', 'Bank transfer', 'Cash', 'Cheque', 'Petty cash', 'Direct debit'];
const today = () => new Date().toISOString().slice(0, 10);

/* a <select> of every account line, grouped by category */
function acctSelect(P, value, onchange, extraCls = 'cell') {
  const F = P.fin, opts = [h('option', { value: '' }, '— Unallocated —')];
  F.cats.forEach(c => { const ls = P.budget.filter(l => l.cat === c.name); if (ls.length) opts.push(h('optgroup', { label: c.name }, ls.map(l => h('option', { value: l.id, selected: l.id === value }, `${l.acct ? l.acct + ' · ' : ''}${l.desc || '(no description)'}`.slice(0, 70))))); });
  if (F.adds.length) opts.push(h('optgroup', { label: 'Additions & contingency' }, F.adds.map(a => h('option', { value: 'add:' + a.id, selected: 'add:' + a.id === value }, a.cont ? `${a.name} (draw)` : a.name))));
  return h('select', { class: extraCls, onchange: e => onchange(e.target.value) }, opts);
}
function expenseModal(P, preset = {}, onDone) {
  const F = finEnsure(P), t = Object.assign({ id: uid(), date: today(), vendor: '', desc: '', lineId: '', amount: '', status: 'Paid', ref: '', method: '', notes: '', receipt: '' }, preset);
  const vendors = [...new Set([...F.txns.map(x => x.vendor), ...P.people.map(p => p.name), ...P.budget.map(l => l.vendor)].filter(Boolean))];
  const f = (label, el) => h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, label), el);
  const inp = (k, o = {}) => h('input', { class: 'inp', type: o.type, list: o.list, placeholder: o.ph || '', value: t[k] || '', oninput: e => { t[k] = e.target.value; } });
  const rc = h('div', { class: 'small muted' }, t.receipt ? 'Receipt attached' : 'No receipt');
  const body = h('div', {}, h('div', { class: 'fx-grid' }, f('Date', inp('date', { type: 'date' })), f('Amount', inp('amount', { type: 'number', ph: '0.00' })), f('Status', h('select', { class: 'inp', onchange: e => { t.status = e.target.value; } }, FIN_STATUS.map(s => h('option', { selected: s === t.status, title: FIN_STATUS_HELP[s] }, s)))),
    f('Vendor / payee', inp('vendor', { list: 'dl-vendors', ph: 'Who was paid' })), f('Description', inp('desc', { ph: 'What for' })), f('Account', acctSelect(P, t.lineId, v => { t.lineId = v; }, 'inp')),
    f('Invoice / PO / receipt #', inp('ref')), f('Method', inp('method', { list: 'dl-methods' })), f('Receipt', h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: async () => { const fl = (await pickFiles('image/*'))[0]; if (!fl) return; t.receipt = (await thumbOf(fl, 900, 0.7)).thumb; rc.textContent = 'Receipt attached'; } }, icon('image', 14), 'Attach photo'), rc))),
    h('div', { style: { height: '10px' } }), f('Notes', h('textarea', { class: 'inp', rows: 2, value: t.notes, oninput: e => { t.notes = e.target.value; } })),
    h('datalist', { id: 'dl-vendors' }, vendors.map(v => h('option', { value: v }))), h('datalist', { id: 'dl-methods' }, PAY_METHODS.map(v => h('option', { value: v }))));
  modal({ title: preset.id ? 'Edit expense' : 'Add expense', wide: true, body, buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => {
    if (!finNum(t.amount)) { toast('Enter an amount.', true); return false; }
    t.amount = finNum(t.amount); if (!F.txns.includes(t)) { const ex = F.txns.find(x => x.id === t.id); if (ex) Object.assign(ex, t); else F.txns.push(t); } Store.touch(); onDone && onDone(); toast('Expense saved');
  } }] });
}

Views.budget = function (root) {
  const P = Store.P; finEnsure(P); const F = P.fin;
  const wrap = h('div', { class: 'page fin', style: { maxWidth: '1360px' } }), kpis = h('div', { class: 'fin-kpis' }), body = h('div'); root.append(wrap);
  const ctx = { P, F, wrap, body, draw, upd, fm: n => finMoney(P, n), fs: n => finShort(P, n), tab: () => UI.bTab };
  const lockedMsg = () => F.locked ? h('div', { class: 'csalert info', style: { marginBottom: '12px' } }, icon('lock', 14), ' The budget is locked (approved). Estimates can’t be edited, but you can keep recording expenses. Unlock it in Setup or with the button above to change estimates.') : null;
  function kpiBlock(c) {
    const k = (label, value, sub, cls, bar) => h('div', { class: 'fin-kpi ' + (cls || '') }, h('span', { class: 'fk-l' }, label), h('b', {}, value), sub ? h('span', { class: 'fk-s' }, sub) : null, bar != null ? h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, bar) + '%', background: bar > 100 ? 'var(--danger)' : '' } })) : null);
    const st = { ok: ['On track', 'ok'], risk: ['At risk', 'warn'], over: ['Over budget', 'danger'], empty: ['No budget yet', ''] }[c.status];
    const vs = c.baseline != null ? c.total - c.baseline : null;
    return [k('Total budget', ctx.fm(c.total), vs ? `${vs > 0 ? '+' : '−'}${ctx.fm(Math.abs(vs))} vs approved` : c.addEst ? `incl. ${ctx.fm(c.addEst)} additions` : `${P.budget.length} lines`),
      k('Spent', ctx.fm(c.act), `${c.spentPct.toFixed(0)}% of budget`, '', c.spentPct), k('Committed', ctx.fm(c.com), 'open orders & bookings'),
      k('Remaining', ctx.fm(c.remaining), 'budget − spent − committed', c.remaining < 0 ? 'neg' : ''), k('Forecast', ctx.fm(c.eac), c.variance >= 0 ? `${ctx.fm(c.variance)} under budget` : `${ctx.fm(-c.variance)} over budget`, c.variance < 0 ? 'neg' : ''),
      h('div', { class: 'fin-kpi status ' + st[1] }, h('span', { class: 'fk-l' }, 'Status'), h('b', {}, st[0]), c.contEst ? h('span', { class: 'fk-s' }, `Contingency left ${ctx.fm(c.contEst - c.contUsed)}`) : null)];
  }
  function upd() {
    const c = finCalc(P); kpis.replaceChildren(...kpiBlock(c));
    if (UI.bTab === 'budget') updGrid(c);
    return c;
  }
  const printMenu = e => menu(e.currentTarget, [{ label: 'Top sheet', icon: 'print', onClick: () => printTopSheet(P) }, { label: 'Detailed budget', icon: 'print', onClick: () => printDetailBudget(P) }, { label: 'Cost report (budget vs actual)', icon: 'print', onClick: () => printCostReport(P) }, { label: 'Expense ledger', icon: 'print', onClick: () => printLedger(P) }, { label: 'Cash flow', icon: 'print', onClick: () => printCashflow(P) }]);
  const exportMenu = e => menu(e.currentTarget, [{ label: 'Budget (CSV)', icon: 'download', onClick: () => download(slug(P.title) + '-budget.csv', finLinesCSV(P), 'text/csv') }, { label: 'Expenses (CSV)', icon: 'download', onClick: () => download(slug(P.title) + '-expenses.csv', finTxnsCSV(P), 'text/csv') }, { sep: true },
    { label: 'Import budget lines (CSV)…', icon: 'upload', onClick: () => importLines() }, { label: 'Import bank / card statement (CSV)…', icon: 'upload', onClick: () => importStatement() }]);
  async function importLines() {
    const f = (await pickFiles('.csv,.txt'))[0]; if (!f) return; const ls = finParseLines(await readText(f)); if (!ls.length) return toast('No budget lines found. Expected columns like Account, Category, Description, Qty, Unit, Rate.', true);
    if (await confirmBox(`Add ${ls.length} budget line${ls.length > 1 ? 's' : ''} from “${f.name}”?`, 'Add lines')) { P.budget.push(...ls); finEnsure(P); Store.touch(); toast(`Added ${ls.length} lines`); draw(); }
  }
  async function importStatement() {
    const f = (await pickFiles('.csv,.txt'))[0]; if (!f) return; const ts = finParseTxns(await readText(f)); if (!ts.length) return toast('No transactions found. Expected Date, Description and Amount columns.', true);
    if (await confirmBox(`Import ${ts.length} transaction${ts.length > 1 ? 's' : ''} as unallocated expenses? You can assign each to an account afterwards.`, 'Import')) { F.txns.push(...ts); Store.touch(); UI.bTab = 'expenses'; toast(`Imported ${ts.length} expenses`); draw(); }
  }
  function draw() {
    const c = finCalc(P);
    kpis.replaceChildren(...kpiBlock(c));
    wrap.replaceChildren(...[h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, 'Budget'), h('div', { class: 'muted small', style: { marginTop: '3px' } }, 'Plan it, track every expense against it, and see where the money is going.')), h('span', { class: 'grow' }),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        h('button', { class: 'btn', title: F.locked ? 'Unlock estimates' : 'Lock the approved budget — estimates become read-only', onclick: () => { F.locked = !F.locked; Store.touch(); draw(); } }, icon('lock', 15), F.locked ? 'Locked' : 'Lock'),
        h('button', { class: 'btn', title: 'Cast, crew and location rates, props, wardrobe and gear', onclick: () => { const r = finSyncProduction(P); toast(`Updated from production: ${r.cast} cast, ${r.crew} crew, ${r.loc} locations${r.items ? ', ' + r.items + ' prop/wardrobe totals' : ''}${r.gear ? ', ' + r.gear + ' gear items' : ''}`); draw(); } }, icon('wand', 15), 'Sync from production'),
        h('button', { class: 'btn', onclick: exportMenu }, icon('download', 15), 'Import / export'), h('button', { class: 'btn', onclick: printMenu }, icon('print', 15), 'Print'),
        h('button', { class: 'btn primary', onclick: () => expenseModal(P, UI.eF.line ? { lineId: UI.eF.line } : {}, draw) }, icon('plus', 15), 'Add expense'))),
      kpis, h('div', { class: 'tabs fin-tabs' }, FIN_TABS.map(([k, l]) => h('button', { class: UI.bTab === k ? 'on' : '', onclick: () => { UI.bTab = k; draw(); } }, l, k === 'expenses' && c.un.n ? h('span', { class: 'pill warn', style: { marginLeft: '6px' }, title: 'Unallocated expenses' }, c.un.n) : null))), lockedMsg(), body].filter(Boolean));
    body.replaceChildren(); ({ dash: drawDash, budget: drawGrid, expenses: drawExpenses, top: drawTop, cash: drawCash, versions: drawVersions, setup: drawSetup }[UI.bTab] || drawDash)(ctx, c);
  }
  ctx.draw = draw; ctx.upd = upd; ctx.importLines = importLines;
  draw();
  /* grid updates live as you type, without rebuilding the table */
  function updGrid(c) {
    P.budget.forEach(l => { const r = c.lines.get(l.id); if (!r) return; const set = (k, v, neg) => { const e = wrap.querySelector(`[data-${k}="${l.id}"]`); if (e) { e.textContent = v; if (neg !== undefined) e.classList.toggle('neg', neg); } }; set('e', ctx.fm(r.est)); set('a', r.act ? ctx.fm(r.act) : '—'); set('c', r.com ? ctx.fm(r.com) : '—'); set('r', ctx.fm(r.rem), r.rem < 0 && (r.act || r.com) > 0); });
    c.cats.forEach(x => { const set = (k, v, neg) => { const e = wrap.querySelector(`[data-ct${k}="${x.cat.id}"]`); if (e) { e.textContent = v; if (neg !== undefined) e.classList.toggle('neg', neg); } }; set('e', x.count ? ctx.fm(x.est) : ''); set('a', x.act ? ctx.fm(x.act) : ''); set('c', x.com ? ctx.fm(x.com) : ''); set('r', x.count ? ctx.fm(x.rem) : '', x.rem < 0 && (x.act + x.com) > 0); });
  }
};

/* ---------------------------------------------------------------
   Dashboard
   --------------------------------------------------------------- */
function drawDash(ctx, c) {
  const { P, F, body, fm } = ctx;
  if (!P.budget.length && !F.txns.length) {
    body.append(h('div', { class: 'empty' }, h('h3', {}, 'Start your budget'), h('p', {}, 'Pull in costs from your cast, crew and locations, import a spreadsheet, or add lines by hand.'),
      h('div', { class: 'row', style: { justifyContent: 'center', flexWrap: 'wrap' } }, h('button', { class: 'btn primary', onclick: () => { finSyncProduction(P); UI.bTab = 'budget'; ctx.draw(); } }, icon('wand', 15), 'Build from production'), h('button', { class: 'btn', onclick: () => ctx.importLines() }, icon('upload', 15), 'Import CSV'), h('button', { class: 'btn', onclick: () => { UI.bTab = 'budget'; ctx.draw(); } }, icon('plus', 15), 'Add lines by hand'), h('button', { class: 'btn', onclick: () => { UI.bTab = 'setup'; ctx.draw(); } }, 'Choose a template'))));
    return;
  }
  const rowsC = c.cats.filter(x => x.count || x.act || x.com), max = Math.max(1, ...rowsC.map(x => Math.max(x.est, x.eac)));
  const chart = h('div', { class: 'card', style: { padding: '16px' } }, h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h3', { style: { fontSize: '15px' } }, 'Budget vs spend by category'), h('span', { class: 'grow' }),
    h('span', { class: 'fin-leg' }, h('i', { class: 'a' }), 'Spent', h('i', { class: 'c' }), 'Committed', h('i', { class: 'r' }), 'Remaining budget', h('i', { class: 'o' }), 'Over')),
    rowsC.length ? rowsC.map(x => { const spent = x.act, com = x.com, left = Math.max(0, x.est - spent - com), over = Math.max(0, spent + com - x.est), pct = v => (v / max * 100) + '%';
      return h('div', { class: 'fin-bar', onclick: () => { UI.bTab = 'budget'; UI.bCollapsed.delete(x.cat.id); ctx.draw(); } }, h('div', { class: 'fb-name' }, h('i', { style: { background: x.cat.color } }), x.cat.name), h('div', { class: 'fb-track' }, h('b', { class: 'a', style: { width: pct(Math.min(spent, x.est || spent)) } }), h('b', { class: 'c', style: { width: pct(Math.min(com, Math.max(0, x.est - spent) || com)) } }), h('b', { class: 'r', style: { width: pct(left) } }), over ? h('b', { class: 'o', style: { width: pct(over) } }) : null),
        h('div', { class: 'fb-n' }, h('b', {}, fm(x.est)), h('span', { class: 'small muted' }, x.act + x.com ? `${fm(x.act + x.com)} used` : 'no spend'))); }) : h('p', { class: 'muted' }, 'No categories with budget yet.'));
  /* alerts */
  const alerts = [], overLines = P.budget.map(l => ({ l, r: c.lines.get(l.id) })).filter(x => x.r && x.r.act + x.r.com > x.r.est + 0.005 && (x.r.act + x.r.com) > 0).sort((a, b) => (b.r.act + b.r.com - b.r.est) - (a.r.act + a.r.com - a.r.est));
  if (c.un.n) alerts.push(['warn', `${c.un.n} expense${c.un.n > 1 ? 's' : ''} (${fm(c.un.act + c.un.com)}) not assigned to an account`, 'expenses']);
  if (overLines.length) alerts.push(['danger', `${overLines.length} line${overLines.length > 1 ? 's' : ''} over budget`, 'budget']);
  if (c.status === 'over') alerts.push(['danger', `Forecast is ${fm(-c.variance)} over the total budget`, 'top']); else if (c.status === 'risk') alerts.push(['warn', 'Forecast is within 5% of the total budget', 'top']);
  if (c.funded && c.funded < c.eac) alerts.push(['warn', `Funding covers ${fm(c.funded)} of the ${fm(c.eac)} forecast`, 'cash']);
  const noEst = P.budget.filter(l => !lineEst(l)).length; if (noEst) alerts.push(['', `${noEst} line${noEst > 1 ? 's have' : ' has'} no estimate yet`, 'budget']);
  const owed = F.txns.filter(t => t.status === 'Invoiced'); if (owed.length) alerts.push(['', `${owed.length} invoice${owed.length > 1 ? 's' : ''} awaiting payment (${fm(sum(owed, t => finNum(t.amount)))})`, 'expenses']);
  const vendors = new Map(); F.txns.filter(t => t.status !== 'Committed').forEach(t => { const k = (t.vendor || '').trim() || '(no vendor)'; vendors.set(k, (vendors.get(k) || 0) + finNum(t.amount)); });
  const cf = finCashflow(P).rows.filter(r => r.month !== 'undated'), cmax = Math.max(1, ...cf.map(r => r.actual + r.committed + r.forecast));
  body.append(h('div', { class: 'fin-cols' }, h('div', {}, chart,
    h('div', { class: 'card', style: { padding: '16px', marginTop: '14px' } }, h('h3', { style: { fontSize: '15px', marginBottom: '10px' } }, 'Spend by month'),
      cf.length ? h('div', { class: 'fin-months' }, cf.map(r => h('div', { class: 'fm-col', title: `${r.month}: spent ${fm(r.actual)}, committed ${fm(r.committed)}, forecast ${fm(r.forecast)}` }, h('div', { class: 'fm-stack', style: { height: ((r.actual + r.committed + r.forecast) / cmax * 120) + 'px' } }, h('i', { class: 'f', style: { flex: r.forecast } }), h('i', { class: 'c', style: { flex: r.committed } }), h('i', { class: 'a', style: { flex: r.actual } })), h('span', { class: 'small muted' }, r.month.slice(2))))) : h('p', { class: 'muted small', style: { margin: 0 } }, 'Dates on expenses and line due-dates build this chart.'))),
    h('div', {}, h('div', { class: 'card', style: { padding: '16px' } }, h('h3', { style: { fontSize: '15px', marginBottom: '8px' } }, 'Needs attention'),
      alerts.length ? h('ul', { class: 'attn' }, alerts.map(([t, m, tab]) => h('li', {}, h('a', { href: '#', class: t, onclick: e => { e.preventDefault(); UI.bTab = tab; ctx.draw(); } }, h('span', {}, m), icon('right', 14))))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing needs attention. ✓')),
      overLines.length ? h('div', { class: 'card', style: { padding: '16px', marginTop: '14px' } }, h('h3', { style: { fontSize: '15px', marginBottom: '8px' } }, 'Biggest overruns'), overLines.slice(0, 5).map(x => h('div', { class: 'row', style: { justifyContent: 'space-between', padding: '4px 0' } }, h('span', { class: 'small' }, x.l.desc || '(no description)'), h('b', { class: 'neg small' }, '+' + fm(x.r.act + x.r.com - x.r.est))))) : null,
      vendors.size ? h('div', { class: 'card', style: { padding: '16px', marginTop: '14px' } }, h('h3', { style: { fontSize: '15px', marginBottom: '8px' } }, 'Top vendors'), [...vendors].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, n]) => h('div', { class: 'row', style: { justifyContent: 'space-between', padding: '4px 0' } }, h('span', { class: 'small' }, v), h('b', { class: 'small' }, fm(n))))) : null)));
}

/* ---------------------------------------------------------------
   Budget sheet
   --------------------------------------------------------------- */
function drawGrid(ctx, c) {
  const { P, F, body, fm } = ctx, locked = !!F.locked, B = UI.bF;
  const num = (l, k, w, step) => h('input', { class: 'cell num', type: 'number', min: 0, step: step || 'any', value: l[k] === undefined ? '' : l[k], disabled: locked, style: w ? { width: w } : {}, 'data-col': k, oninput: e => { l[k] = e.target.value; Store.touch(); ctx.upd(); } });
  const toolbar = h('div', { class: 'row wrap', style: { marginBottom: '12px' } },
    h('input', { class: 'inp', placeholder: 'Search lines…', value: B.q, style: { width: '220px' }, oninput: e => { B.q = e.target.value; clearTimeout(drawGrid.t); drawGrid.t = setTimeout(() => { ctx.draw(); const i = ctx.wrap.querySelector('input[placeholder="Search lines…"]'); if (i) { i.focus(); i.setSelectionRange(B.q.length, B.q.length); } }, 250); } }),
    h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: B.over, onchange: e => { B.over = e.target.checked; ctx.draw(); } }), 'Over budget only'), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', onclick: () => { c.cats.forEach(x => UI.bCollapsed.add(x.cat.id)); ctx.draw(); } }, 'Collapse all'), h('button', { class: 'btn sm', onclick: () => { UI.bCollapsed.clear(); ctx.draw(); } }, 'Expand all'),
    h('button', { class: 'btn sm', title: 'Give every line without one an account code', onclick: () => { F.cats.forEach((cat, ci) => P.budget.filter(l => l.cat === cat.name).forEach((l, i) => { if (!l.acct) l.acct = String((ci + 1) * 1000 + (i + 1) * 10); })); Store.touch(); toast('Account codes added'); ctx.draw(); } }, icon('hash', 13), 'Number accounts'));
  const match = l => { const r = c.lines.get(l.id); return (!B.q || (l.desc + ' ' + (l.acct || '') + ' ' + (l.vendor || '') + ' ' + (l.notes || '')).toLowerCase().includes(B.q.toLowerCase())) && (!B.over || (r && r.act + r.com > r.est + 0.005)); };
  const addLine = (cat, after) => { const l = { id: uid(), cat: cat.name, acct: '', desc: '', qty: 1, unit: 'Flat', rate: 0 }; const i = after ? P.budget.indexOf(after) : -1; if (i >= 0) P.budget.splice(i + 1, 0, l); else P.budget.push(l); UI.bCollapsed.delete(cat.id); Store.touch(); ctx.draw(); setTimeout(() => { const el = ctx.wrap.querySelector(`tr[data-line="${l.id}"] input[data-col=desc]`); el && el.focus(); }, 30); };
  const lineMenu = (e, l, cat) => menu(e.currentTarget, [
    { label: 'Add expense to this line', icon: 'dollar', onClick: () => expenseModal(P, { lineId: l.id }, ctx.draw) }, { label: 'View its expenses', icon: 'list', onClick: () => { UI.eF = { q: '', status: '', cat: '', line: l.id, month: '' }; UI.bTab = 'expenses'; ctx.draw(); } },
    { label: l.done ? 'Re-open line (forecast the rest)' : 'Mark complete (no more spend)', icon: 'check', onClick: () => { l.done = !l.done; Store.touch(); ctx.draw(); } }, { sep: true },
    { label: 'Insert line below', icon: 'plus', onClick: () => addLine(cat, l) }, { label: 'Duplicate', icon: 'copy', onClick: () => { const cp = { ...l, id: uid(), auto: undefined }; delete cp.auto; P.budget.splice(P.budget.indexOf(l) + 1, 0, cp); Store.touch(); ctx.draw(); } },
    { label: 'Move to another category…', icon: 'right', onClick: () => moveLine(l) }, { label: 'Move up', icon: 'up', onClick: () => shift(l, -1) }, { label: 'Move down', icon: 'down', onClick: () => shift(l, 1) }, { sep: true },
    { label: 'Delete line', icon: 'trash', danger: true, onClick: () => delLine(l) }]);
  function shift(l, d) { const same = P.budget.filter(x => x.cat === l.cat), i = same.indexOf(l), o = same[i + d]; if (!o) return; const a = P.budget.indexOf(l), b = P.budget.indexOf(o); P.budget[a] = o; P.budget[b] = l; Store.touch(); ctx.draw(); }
  function moveLine(l) { const sel = h('select', { class: 'inp' }, F.cats.map(x => h('option', { selected: x.name === l.cat }, x.name))); modal({ title: 'Move line', body: h('div', {}, h('p', { style: { marginTop: 0 } }, l.desc || '(no description)'), sel), buttons: [{ label: 'Cancel' }, { label: 'Move', primary: true, onClick: () => { l.cat = sel.value; Store.touch(); ctx.draw(); } }] }); }
  async function delLine(l) { const r = c.lines.get(l.id), n = r ? r.n : 0; if (await confirmBox(n ? `Delete “${l.desc || 'this line'}”? Its ${n} expense${n > 1 ? 's' : ''} stay in the ledger as unallocated.` : `Delete “${l.desc || 'this line'}”?`)) { P.budget = P.budget.filter(x => x !== l); Store.touch(); ctx.draw(); } }
  const key = (e, l, cat, col) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (e.key === 'Enter' && !e.shiftKey)) {
      const rows = [...ctx.wrap.querySelectorAll('tr[data-line]')], i = rows.findIndex(r => r.dataset.line === l.id), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (e.key === 'Enter' && j >= rows.length && col === 'rate' && !locked) { e.preventDefault(); return addLine(cat, l); }
      const t = rows[j] && rows[j].querySelector(`[data-col=${col}]`); if (t) { e.preventDefault(); t.focus(); t.select && t.select(); }
    }
  };
  const lineRows = (l, cat) => {
    const r = c.lines.get(l.id), open = UI.bOpen.has(l.id), neg = r.rem < 0 && (r.act || r.com) > 0, bind = (el, col) => { el.addEventListener('keydown', e => key(e, l, cat, col)); return el; };
    const tr = h('tr', { 'data-line': l.id, class: 'fin-line' + (l.done ? ' done' : '') + (open ? ' open' : '') },
      h('td', { class: 'fl-x' }, h('button', { class: 'chev' + (open ? ' on' : ''), title: 'Details', onclick: () => { open ? UI.bOpen.delete(l.id) : UI.bOpen.add(l.id); ctx.draw(); } }, '▸')),
      h('td', { style: { width: '78px' } }, bind(h('input', { class: 'cell mono', value: l.acct || '', placeholder: 'Acct', disabled: locked, 'data-col': 'acct', oninput: e => { l.acct = e.target.value; Store.touch(); } }), 'acct')),
      h('td', {}, bind(h('input', { class: 'cell', value: l.desc || '', placeholder: 'Description', disabled: locked, 'data-col': 'desc', oninput: e => { l.desc = e.target.value; Store.touch(); } }), 'desc'), l.auto ? h('span', { class: 'fl-auto', title: 'Created from production data — re-syncing updates it' }, 'auto') : null),
      h('td', { style: { width: '74px' } }, bind(num(l, 'qty'), 'qty')), h('td', { style: { width: '92px' } }, h('select', { class: 'cell', disabled: locked, onchange: e => { l.unit = e.target.value; Store.touch(); } }, FIN_UNITS.map(u => h('option', { selected: u === l.unit }, u)))),
      h('td', { style: { width: '108px' } }, bind(num(l, 'rate', null, '0.01'), 'rate')),
      h('td', { class: 'fl-n est', 'data-e': l.id }, fm(r.est)), h('td', { class: 'fl-n', 'data-a': l.id, title: 'Click to see expenses', style: { cursor: 'pointer' }, onclick: () => { UI.eF = { q: '', status: '', cat: '', line: l.id, month: '' }; UI.bTab = 'expenses'; ctx.draw(); } }, r.act ? fm(r.act) : '—'),
      h('td', { class: 'fl-n', 'data-c': l.id }, r.com ? fm(r.com) : '—'), h('td', { class: 'fl-n' + (neg ? ' neg' : ''), 'data-r': l.id }, fm(r.rem)),
      h('td', { style: { width: '40px' } }, ibtn('more', 'Line actions', e => lineMenu(e, l, cat))));
    if (!open) return [tr];
    const d = (label, el) => h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', { class: 'lbl' }, label), el);
    return [tr, h('tr', { class: 'fin-detail' }, h('td', { colspan: 11 }, h('div', { class: 'fx-grid' },
      d('Vendor / supplier', h('input', { class: 'inp', value: l.vendor || '', placeholder: 'Who supplies this', oninput: e => { l.vendor = e.target.value; Store.touch(); } })),
      d('Due / needed by', h('input', { class: 'inp', type: 'date', value: l.due || '', oninput: e => { l.due = e.target.value; Store.touch(); } })),
      d('Forecast to complete (override)', h('input', { class: 'inp', type: 'number', min: 0, step: 'any', value: l.etc === undefined ? '' : l.etc, placeholder: `auto: ${fm(Math.max(0, r.est - r.act - r.com))}`, oninput: e => { if (e.target.value === '') delete l.etc; else l.etc = e.target.value; Store.touch(); ctx.upd(); } })),
      d('Notes', h('input', { class: 'inp', value: l.notes || '', oninput: e => { l.notes = e.target.value; Store.touch(); } })),
      h('div', { class: 'row', style: { alignItems: 'flex-end', gap: '8px' } }, h('button', { class: 'btn sm', onclick: () => expenseModal(P, { lineId: l.id }, ctx.draw) }, icon('plus', 13), 'Add expense'), r.n ? h('span', { class: 'small muted' }, `${r.n} expense${r.n > 1 ? 's' : ''}`) : null)))) ];
  };
  const tbl = h('table', { class: 'tbl fin-grid' }, h('thead', {}, h('tr', {}, ['', 'Acct', 'Description', 'Qty', 'Unit', 'Rate', 'Estimate', 'Actual', 'Committed', 'Remaining', ''].map((x, i) => h('th', { class: i >= 6 && i <= 9 ? 'rt' : '' }, x)))));
  c.cats.forEach(x => {
    const ls = x.lines.filter(match), collapsed = UI.bCollapsed.has(x.cat.id) && !B.q && !B.over;
    if ((B.q || B.over) && !ls.length) return;
    const tb = h('tbody', { class: 'fin-cat' });
    tb.append(h('tr', { class: 'catrow' }, h('td', { colspan: 3 }, h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'chev' + (collapsed ? '' : ' on'), onclick: () => { collapsed ? UI.bCollapsed.delete(x.cat.id) : UI.bCollapsed.add(x.cat.id); ctx.draw(); } }, '▸'), h('i', { class: 'cdot', style: { background: x.cat.color } }), h('b', { class: 'cname' }, x.cat.name), h('span', { class: 'pill' }, x.cat.group === 'atl' ? 'ATL' : 'BTL'), x.cat.fringe ? h('span', { class: 'pill', title: 'Fringes apply to this category' }, 'fringe') : null, h('span', { class: 'small muted' }, `${x.count} line${x.count === 1 ? '' : 's'}`))),
      h('td', { colspan: 3 }), h('td', { class: 'fl-n', 'data-cte': x.cat.id }, x.count ? fm(x.est) : ''), h('td', { class: 'fl-n', 'data-cta': x.cat.id }, x.act ? fm(x.act) : ''), h('td', { class: 'fl-n', 'data-ctc': x.cat.id }, x.com ? fm(x.com) : ''), h('td', { class: 'fl-n' + (x.rem < 0 && (x.act + x.com) > 0 ? ' neg' : ''), 'data-ctr': x.cat.id }, x.count ? fm(x.rem) : ''),
      h('td', {}, ibtn('plus', 'Add a line to ' + x.cat.name, () => addLine(x.cat), 'sm'))));
    if (!collapsed) ls.forEach(l => lineRows(l, x.cat).forEach(r => tb.append(r)));
    if (!collapsed && !ls.length && !B.q) tb.append(h('tr', {}, h('td', { colspan: 11, class: 'small muted', style: { padding: '8px 14px' } }, 'No lines yet. ', h('a', { href: '#', onclick: e => { e.preventDefault(); addLine(x.cat); } }, 'Add one'))));
    tbl.append(tb);
  });
  if (c.un.n) tbl.append(h('tbody', {}, h('tr', { class: 'catrow' }, h('td', { colspan: 3 }, h('b', {}, 'Unallocated expenses'), h('span', { class: 'small muted', style: { marginLeft: '8px' } }, `${c.un.n} — assign them to accounts in Expenses`)), h('td', { colspan: 3 }), h('td', { class: 'fl-n' }), h('td', { class: 'fl-n' }, fm(c.un.act)), h('td', { class: 'fl-n' }, c.un.com ? fm(c.un.com) : ''), h('td', { class: 'fl-n neg' }, fm(-(c.un.act + c.un.com))), h('td'))));
  /* additions & totals */
  const foot = h('tfoot', {}, h('tr', { class: 'sumrow' }, h('td', { colspan: 6 }, 'Subtotal'), h('td', { class: 'fl-n' }, fm(c.sub.est)), h('td', { class: 'fl-n' }, fm(c.sub.act)), h('td', { class: 'fl-n' }, fm(c.sub.com)), h('td', { class: 'fl-n' }, fm(c.sub.est - c.sub.act - c.sub.com)), h('td')),
    ...c.adds.map(x => h('tr', { class: 'addrow' }, h('td', { colspan: 6 }, `${x.add.name}${x.add.type === 'percent' ? ` (${finNum(x.add.value)}% of ${(ADD_BASES.find(b => b[0] === x.add.base) || [0, ''])[1].toLowerCase()})` : ''}`), h('td', { class: 'fl-n' }, fm(x.est)), h('td', { class: 'fl-n' }, x.act ? fm(x.act) : ''), h('td', { class: 'fl-n' }, x.com ? fm(x.com) : ''), h('td', { class: 'fl-n' }, fm(x.rem)), h('td'))),
    h('tr', { class: 'grandrow' }, h('td', { colspan: 6 }, 'TOTAL BUDGET'), h('td', { class: 'fl-n' }, fm(c.total)), h('td', { class: 'fl-n' }, fm(c.act)), h('td', { class: 'fl-n' }, fm(c.com)), h('td', { class: 'fl-n' + (c.remaining < 0 ? ' neg' : '') }, fm(c.remaining)), h('td')));
  tbl.append(foot);
  body.append(toolbar, h('div', { class: 'rep-wrap fin-wrap' }, tbl), h('div', { class: 'row', style: { marginTop: '12px', flexWrap: 'wrap' } }, h('button', { class: 'btn', onclick: async () => { const n = await promptBox('New category', 'Category name', ''); if (!n) return; if (F.cats.some(x => x.name.toLowerCase() === n.toLowerCase())) return toast('That category exists.', true); F.cats.push({ id: uid(), name: n, group: 'btl', fringe: false, color: FIN_COLORS[F.cats.length % FIN_COLORS.length] }); Store.touch(); ctx.draw(); } }, icon('plus', 15), 'Add category'), h('span', { class: 'small muted' }, 'Tip: ↑ ↓ and Enter move between rows; Enter in the last Rate adds a new line.')));
}

/* ---------------------------------------------------------------
   Expenses ledger
   --------------------------------------------------------------- */
function drawExpenses(ctx, c) {
  const { P, F, body, fm } = ctx, E = UI.eF; UI.eShown = UI.eShown || 200; const sel = new Set();
  const catOf = t => { const l = finLine(P, t.lineId); return l ? l.cat : ''; };
  const rows = () => F.txns.filter(t => (!E.status || t.status === E.status) && (!E.line || t.lineId === E.line) && (!E.cat || catOf(t) === E.cat || (E.cat === '__un' && !catOf(t))) && (!E.month || (t.date || '').startsWith(E.month)) && (!E.q || (t.vendor + ' ' + t.desc + ' ' + t.ref + ' ' + t.notes).toLowerCase().includes(E.q.toLowerCase())))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const months = [...new Set(F.txns.map(t => (t.date || '').slice(0, 7)).filter(Boolean))].sort().reverse(), vendors = [...new Set(F.txns.map(t => t.vendor).filter(Boolean))];
  const bar = h('div', { class: 'row wrap', style: { marginBottom: '12px' } });
  const tbody = h('tbody'), foot = h('div', { class: 'small muted', style: { margin: '10px 2px' } }), bulk = h('div', { class: 'row', style: { marginBottom: '8px', display: 'none' } });
  function fill() {
    const list = rows(), shown = list.slice(0, UI.eShown); tbody.replaceChildren();
    shown.forEach(t => {
      const stat = h('select', { class: 'cell st-' + t.status, onchange: e => { t.status = e.target.value; Store.touch(); ctx.draw(); } }, FIN_STATUS.map(s => h('option', { selected: s === t.status }, s)));
      tbody.append(h('tr', {}, h('td', { style: { width: '30px' } }, h('input', { type: 'checkbox', onchange: e => { e.target.checked ? sel.add(t.id) : sel.delete(t.id); bulkBar(); } })),
        h('td', { style: { width: '132px' } }, h('input', { class: 'cell', type: 'date', value: t.date || '', oninput: e => { t.date = e.target.value; Store.touch(); } })), h('td', { style: { width: '170px' } }, h('input', { class: 'cell', list: 'dl-vendors2', value: t.vendor || '', placeholder: 'Vendor', oninput: e => { t.vendor = e.target.value; Store.touch(); } })),
        h('td', {}, h('input', { class: 'cell', value: t.desc || '', placeholder: 'Description', oninput: e => { t.desc = e.target.value; Store.touch(); } })), h('td', { style: { width: '230px' } }, acctSelect(P, t.lineId, v => { t.lineId = v; Store.touch(); ctx.draw(); })),
        h('td', { style: { width: '112px' } }, h('input', { class: 'cell num', type: 'number', step: '0.01', value: t.amount, oninput: e => { t.amount = e.target.value; Store.touch(); ctx.upd(); } })), h('td', { style: { width: '116px' } }, stat),
        h('td', { style: { width: '110px' } }, h('input', { class: 'cell', value: t.ref || '', placeholder: 'Ref #', oninput: e => { t.ref = e.target.value; Store.touch(); } })),
        h('td', { style: { width: '88px', whiteSpace: 'nowrap' } }, ibtn(t.receipt ? 'image' : 'file', t.receipt ? 'View receipt' : 'Edit details / attach receipt', () => t.receipt ? viewReceipt(t) : expenseModal(P, t, ctx.draw)), ibtn('copy', 'Duplicate', () => { F.txns.push({ ...t, id: uid() }); Store.touch(); ctx.draw(); }), ibtn('trash', 'Delete', () => { F.txns = F.txns.filter(x => x !== t); Store.touch(); ctx.draw(); }, 'danger'))));
    });
    if (!list.length) tbody.append(h('tr', {}, h('td', { colspan: 9 }, h('div', { class: 'empty', style: { padding: '24px' } }, h('p', {}, F.txns.length ? 'No expenses match these filters.' : 'No expenses yet. Record what you spend, owe or have committed — each one is tied to a budget line.')))));
    const tot = k => sum(list.filter(t => t.status === k), t => finNum(t.amount));
    foot.textContent = `${list.length} expense${list.length === 1 ? '' : 's'}${list.length > shown.length ? ` (showing ${shown.length})` : ''} · Paid ${fm(tot('Paid'))} · Invoiced ${fm(tot('Invoiced'))} · Committed ${fm(tot('Committed'))}`;
    if (list.length > shown.length) foot.append(' ', h('a', { href: '#', onclick: e => { e.preventDefault(); UI.eShown += 300; fill(); } }, 'Show more'));
  }
  function bulkBar() {
    bulk.style.display = sel.size ? 'flex' : 'none'; bulk.replaceChildren(h('b', {}, `${sel.size} selected`), acctSelect(P, '', v => { F.txns.filter(t => sel.has(t.id)).forEach(t => { t.lineId = v; }); Store.touch(); ctx.draw(); }, 'inp'),
      h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { if (!e.target.value) return; F.txns.filter(t => sel.has(t.id)).forEach(t => { t.status = e.target.value; }); Store.touch(); ctx.draw(); } }, h('option', { value: '' }, 'Set status…'), FIN_STATUS.map(s => h('option', {}, s))),
      h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox(`Delete ${sel.size} expense${sel.size > 1 ? 's' : ''}?`)) { F.txns = F.txns.filter(t => !sel.has(t.id)); Store.touch(); ctx.draw(); } } }, icon('trash', 13), 'Delete'));
    const first = bulk.querySelector('select.inp'); if (first) first.title = 'Assign selected expenses to an account';
  }
  bar.append(h('input', { class: 'inp', placeholder: 'Search vendor, description, ref…', value: E.q, style: { width: '240px' }, oninput: e => { E.q = e.target.value; UI.eShown = 200; clearTimeout(fill.t); fill.t = setTimeout(fill, 200); } }),
    h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { E.status = e.target.value; ctx.draw(); } }, h('option', { value: '' }, 'Any status'), FIN_STATUS.map(s => h('option', { selected: s === E.status }, s))),
    h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { E.cat = e.target.value; E.line = ''; ctx.draw(); } }, h('option', { value: '' }, 'Any category'), h('option', { value: '__un', selected: E.cat === '__un' }, 'Unallocated'), F.cats.map(x => h('option', { selected: x.name === E.cat }, x.name))),
    h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { E.month = e.target.value; ctx.draw(); } }, h('option', { value: '' }, 'Any month'), months.map(m => h('option', { selected: m === E.month }, m))),
    E.line ? h('button', { class: 'btn sm', onclick: () => { E.line = ''; ctx.draw(); } }, `Line: ${(finLine(P, E.line) || {}).desc || '…'} ✕`) : null, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => expenseModal(P, E.line ? { lineId: E.line } : {}, ctx.draw) }, icon('plus', 15), 'Add expense'));
  body.append(bar, bulk, h('div', { class: 'rep-wrap fin-wrap' }, h('table', { class: 'tbl wide fin-ledger' }, h('thead', {}, h('tr', {}, ['', 'Date', 'Vendor', 'Description', 'Account', 'Amount', 'Status', 'Ref', ''].map(x => h('th', {}, x)))), tbody)), foot, h('datalist', { id: 'dl-vendors2' }, vendors.map(v => h('option', { value: v }))));
  fill();
}
function viewReceipt(t) { modal({ title: `Receipt — ${t.vendor || t.desc || ''}`, wide: true, body: h('div', { style: { textAlign: 'center' } }, h('img', { src: t.receipt, style: { maxWidth: '100%', maxHeight: '70vh' } })), buttons: [{ label: 'Remove receipt', onClick: () => { t.receipt = ''; Store.touch(); Router.refresh(); } }, { label: 'Close', primary: true }] }); }
