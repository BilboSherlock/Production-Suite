'use strict';
/* ===================================================================
   Budget part 2 — top sheet, cash flow & funding, versions, setup,
   print reports and the all-projects portfolio page.
   =================================================================== */
const pctTxt = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';

/* per-category totals of a saved version (for "vs approved") */
function baselineByCat(P) {
  const F = P.fin, v = F.baseline && F.versions.find(x => x.id === F.baseline); if (!v) return null; const m = new Map(); v.data.lines.forEach(l => m.set(l.cat, (m.get(l.cat) || 0) + lineEst(l))); return { v, m };
}
function topSheetRows(P, c) {
  const fm = n => finMoney(P, n), bl = baselineByCat(P), rows = [], head = ['', 'Budget', 'Actual', 'Committed', 'To complete', 'Forecast', 'Variance', 'Spent']; if (bl) head.splice(2, 0, 'Approved');
  const line = (name, o, strong, base) => { const r = [name, fm(o.est), o.act ? fm(o.act) : '', o.com ? fm(o.com) : '', o.etc ? fm(o.etc) : '', fm(o.eac), fm(o.est - o.eac), pctTxt(o.act, o.est)]; if (bl) r.splice(2, 0, base === undefined ? '' : fm(base)); r.strong = strong; return r; };
  rows.push({ grp: 'Above the line' }); c.cats.filter(x => x.cat.group === 'atl' && (x.count || x.act || x.com)).forEach(x => rows.push(line(x.cat.name, x, false, bl ? bl.m.get(x.cat.name) || 0 : undefined))); rows.push(line('Total above the line', c.atl, true));
  rows.push({ grp: 'Below the line' }); c.cats.filter(x => x.cat.group === 'btl' && (x.count || x.act || x.com)).forEach(x => rows.push(line(x.cat.name, x, false, bl ? bl.m.get(x.cat.name) || 0 : undefined))); rows.push(line('Total below the line', c.btl, true));
  if (c.un.n) rows.push(line('Unallocated expenses', c.un, false));
  rows.push({ grp: 'Totals' }); rows.push(line('Subtotal', c.sub, true, bl ? sum([...bl.m.values()], x => x) : undefined));
  c.adds.forEach(x => rows.push(line(`${x.add.name}${x.add.type === 'percent' ? ` (${finNum(x.add.value)}%)` : ''}`, { est: x.est, act: x.act, com: x.com, etc: Math.max(0, x.eac - x.used), eac: x.eac }, false)));
  rows.push(line('GRAND TOTAL', { est: c.total, act: c.act, com: c.com, etc: c.eac - c.act - c.com, eac: c.eac }, true, bl ? bl.v.total : undefined));
  return { head, rows };
}
function drawTop(ctx, c) {
  const { P, body } = ctx, t = topSheetRows(P, c);
  if (!P.budget.length) { body.append(h('div', { class: 'empty' }, h('p', {}, 'Nothing to summarise yet — add budget lines first.'))); return; }
  body.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => printTopSheet(P) }, icon('print', 15), 'Print top sheet')),
    h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl rep fin-top' }, h('thead', {}, h('tr', {}, t.head.map((x, i) => h('th', { class: i ? 'rt' : '' }, x)))),
      h('tbody', {}, t.rows.map(r => r.grp !== undefined && !Array.isArray(r) ? h('tr', { class: 'grp' }, h('td', { colspan: t.head.length }, r.grp)) : h('tr', { class: r.strong ? 'strong' : '' }, r.map((x, i) => h('td', { class: i ? 'rt' : '', style: i === 6 + (t.head.length - 8) && /^−/.test(x) ? { color: 'var(--danger)' } : {} }, x))))))));
  const bl = baselineByCat(P); if (bl) body.append(h('p', { class: 'small muted', style: { marginTop: '10px' } }, `“Approved” is the saved version “${bl.v.name}” (${bl.v.date}).`));
  body.append(h('p', { class: 'small muted', style: { marginTop: '6px' } }, 'Forecast = spent + committed + what is still to complete. Variance = budget − forecast (negative means over).'));
}
function printTopSheet(P) { const c = finCalc(P), t = topSheetRows(P, c); printTable('Budget top sheet', t.head, t.rows, { landscape: true, sub: `${finMoney(P, c.total)} total budget` }); }
function printDetailBudget(P) {
  const c = finCalc(P), fm = n => finMoney(P, n), rows = [];
  c.cats.filter(x => x.count).forEach(x => { rows.push({ grp: `${x.cat.name} — ${fm(x.est)}` }); x.lines.forEach(l => { const r = c.lines.get(l.id); rows.push([l.acct || '', l.desc, l.qty, l.unit, fm(finNum(l.rate)), fm(r.est), r.act ? fm(r.act) : '', r.com ? fm(r.com) : '', fm(r.rem)]); }); });
  rows.push({ grp: 'Totals' }); rows.push(['', 'Subtotal', '', '', '', fm(c.sub.est), fm(c.sub.act), fm(c.sub.com), fm(c.sub.est - c.sub.act - c.sub.com)]); c.adds.forEach(x => rows.push(['', x.add.name, '', '', '', fm(x.est), x.act ? fm(x.act) : '', x.com ? fm(x.com) : '', fm(x.rem)])); rows.push(['', 'TOTAL BUDGET', '', '', '', fm(c.total), fm(c.act), fm(c.com), fm(c.remaining)]);
  printTable('Detailed budget', ['Acct', 'Description', 'Qty', 'Unit', 'Rate', 'Estimate', 'Actual', 'Committed', 'Remaining'], rows);
}
function printCostReport(P) {
  const c = finCalc(P), fm = n => finMoney(P, n), rows = [];
  c.cats.filter(x => x.count || x.act || x.com).forEach(x => { rows.push({ grp: x.cat.name }); x.lines.forEach(l => { const r = c.lines.get(l.id); if (r.est || r.act || r.com) rows.push([l.acct || '', l.desc, fm(r.est), fm(r.act), fm(r.com), fm(r.etc), fm(r.eac), fm(r.est - r.eac)]); }); rows.push(['', `Total ${x.cat.name}`, fm(x.est), fm(x.act), fm(x.com), fm(x.etc), fm(x.eac), fm(x.est - x.eac)]); });
  rows.push({ grp: 'Grand total' }); rows.push(['', 'TOTAL (incl. additions)', fm(c.total), fm(c.act), fm(c.com), fm(c.eac - c.act - c.com), fm(c.eac), fm(c.variance)]);
  printTable('Cost report — budget vs actual', ['Acct', 'Description', 'Budget', 'Actual', 'Committed', 'To complete', 'Forecast', 'Variance'], rows);
}
function printLedger(P) {
  const F = P.fin, fm = n => finMoney(P, n); if (!F.txns.length) return toast('No expenses to print.', true);
  printTable('Expense ledger', ['Date', 'Vendor', 'Description', 'Account', 'Amount', 'Status', 'Ref'], [...F.txns].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(t => { const l = finLine(P, t.lineId); return [t.date, t.vendor, t.desc, l ? (l.acct ? l.acct + ' ' : '') + l.desc : 'Unallocated', fm(finNum(t.amount)), t.status, t.ref]; }));
}
function printCashflow(P) {
  const cf = finCashflow(P), fm = n => finMoney(P, n); if (!cf.rows.length) return toast('No cash flow to print yet.', true);
  printTable('Cash flow by month', ['Month', 'Spent', 'Committed', 'Forecast', 'Funding in', 'Cumulative spend', 'Balance'], cf.rows.map(r => [r.month, fm(r.actual), fm(r.committed), fm(r.forecast), fm(r.funding), fm(r.cumSpend), fm(r.balance)]), { landscape: false });
}

/* ---------------------------------------------------------------
   Cash flow & funding
   --------------------------------------------------------------- */
function drawCash(ctx, c) {
  const { P, F, body, fm } = ctx, cf = finCashflow(P), rows = cf.rows;
  const W = 900, H = 260, pad = { l: 56, r: 16, t: 14, b: 34 }, plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b, real = rows.filter(r => r.month !== 'undated');
  const maxBar = Math.max(1, ...real.map(r => r.actual + r.committed + r.forecast)), maxLine = Math.max(1, ...real.map(r => Math.max(r.cumSpend, r.cumFund))), top = Math.max(maxBar, maxLine);
  let chart = h('p', { class: 'muted' }, 'Add dates to expenses and due dates to budget lines (or funding drawdowns below) to see cash flow over time.');
  if (real.length) {
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fin-chart', role: 'img', 'aria-label': 'Cash flow chart' }), bw = Math.min(60, plotW / real.length * 0.6), x = i => pad.l + (i + .5) * (plotW / real.length), y = v => pad.t + plotH - v / top * plotH;
    for (let i = 0; i <= 4; i++) { const v = top * i / 4; svg.append(S('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: 'currentColor', 'stroke-opacity': .12 }), S('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'currentColor', 'fill-opacity': .6 }, finShort(P, v))); }
    real.forEach((r, i) => { let acc = 0; [['actual', '#2468d8'], ['committed', '#7a45c9'], ['forecast', '#c9ced6']].forEach(([k, col]) => { const v = r[k]; if (!v) return; svg.append(S('rect', { x: x(i) - bw / 2, y: y(acc + v), width: bw, height: Math.max(1, y(acc) - y(acc + v)), fill: col })); acc += v; }); svg.append(S('text', { x: x(i), y: H - 12, 'text-anchor': 'middle', 'font-size': 11, fill: 'currentColor', 'fill-opacity': .7 }, r.month)); });
    const path = (k, col, dash) => svg.append(S('path', { d: real.map((r, i) => `${i ? 'L' : 'M'}${x(i)} ${y(r[k])}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': dash || '' }));
    path('cumSpend', '#e5484d'); if (F.funding.length) path('cumFund', '#1e8e54', '6 4');
    chart = h('div', {}, svg, h('div', { class: 'fin-leg', style: { marginTop: '6px' } }, h('i', { class: 'a' }), 'Spent', h('i', { class: 'c' }), 'Committed', h('i', { class: 'f' }), 'Forecast', h('i', { style: { background: '#e5484d', height: '3px', alignSelf: 'center' } }), 'Cumulative spend', F.funding.length ? [h('i', { style: { background: '#1e8e54', height: '3px', alignSelf: 'center' } }), 'Cumulative funding'] : null));
  }
  const fundBox = h('div'), fundTotal = () => sum(F.funding, f => finNum(f.amount));
  const drawFund = () => fundBox.replaceChildren(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', { style: { fontSize: '15px' } }, 'Funding & drawdowns'), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, `${fm(fundTotal())} of ${fm(c.total)} budget (${pctTxt(fundTotal(), c.total)})`), h('button', { class: 'btn sm', onclick: () => { F.funding.push({ id: uid(), date: '', source: '', amount: '', notes: '' }); Store.touch(); drawFund(); } }, icon('plus', 13), 'Add')),
    F.funding.length ? h('table', { class: 'tbl wide' }, h('thead', {}, h('tr', {}, ['Date', 'Source', 'Amount', 'Notes', ''].map(x => h('th', {}, x)))), h('tbody', {}, F.funding.map(f => h('tr', {}, h('td', { style: { width: '150px' } }, h('input', { class: 'cell', type: 'date', value: f.date || '', oninput: e => { f.date = e.target.value; Store.touch(); } })), h('td', {}, h('input', { class: 'cell', value: f.source || '', placeholder: 'Investor, grant, client…', oninput: e => { f.source = e.target.value; Store.touch(); } })), h('td', { style: { width: '140px' } }, h('input', { class: 'cell num', type: 'number', value: f.amount || '', oninput: e => { f.amount = e.target.value; Store.touch(); } })), h('td', {}, h('input', { class: 'cell', value: f.notes || '', oninput: e => { f.notes = e.target.value; Store.touch(); } })), h('td', { style: { width: '44px' } }, ibtn('trash', 'Remove', () => { F.funding = F.funding.filter(x => x !== f); Store.touch(); drawFund(); ctx.draw(); }, 'danger')))))) : h('p', { class: 'small muted', style: { margin: 0 } }, 'Record investor tranches, grants or client payments to see whether cash covers the spend.'));
  drawFund();
  body.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => printCashflow(P) }, icon('print', 15), 'Print')), h('div', { class: 'card', style: { padding: '16px', marginBottom: '14px' } }, chart),
    rows.length ? h('div', { class: 'rep-wrap', style: { marginBottom: '16px' } }, h('table', { class: 'tbl rep' }, h('thead', {}, h('tr', {}, ['Month', 'Spent', 'Committed', 'Forecast', 'Funding in', 'Cumulative spend', 'Balance'].map((x, i) => h('th', { class: i ? 'rt' : '' }, x)))),
      h('tbody', {}, rows.map(r => h('tr', {}, h('td', { class: 'first' }, r.month === 'undated' ? 'No date' : r.month), ...[r.actual, r.committed, r.forecast, r.funding, r.cumSpend].map(v => h('td', { class: 'rt' }, v ? fm(v) : '—')), h('td', { class: 'rt', style: r.balance < 0 ? { color: 'var(--danger)', fontWeight: 700 } : {} }, F.funding.length ? fm(r.balance) : '—')))))) : null,
    h('div', { class: 'card', style: { padding: '16px' } }, fundBox), h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Forecast spend lands on each line’s “due” date (set it in the line’s details), otherwise on the month of the last shoot day.'));
}

/* ---------------------------------------------------------------
   Versions
   --------------------------------------------------------------- */
function drawVersions(ctx, c) {
  const { P, F, body, fm } = ctx;
  const save = () => { const name = h('input', { class: 'inp', placeholder: 'e.g. First draft, Approved by client', value: `Version ${F.versions.length + 1}` }), note = h('textarea', { class: 'inp', rows: 2, placeholder: 'What changed?' }), base = h('input', { type: 'checkbox', checked: !F.baseline });
    modal({ title: 'Save budget version', body: h('div', {}, h('p', { class: 'small muted', style: { marginTop: 0 } }, `Snapshots all ${P.budget.length} lines, categories and additions (${fm(c.total)}). Expenses are not versioned.`), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Name'), name), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Note'), note), h('label', { class: 'row small' }, base, 'Make this the approved baseline (shown as “vs approved”)')),
      buttons: [{ label: 'Cancel' }, { label: 'Save version', primary: true, onClick: () => { finSnapshot(P, name.value.trim(), note.value.trim(), base.checked); ctx.draw(); toast('Version saved'); } }] }); };
  const compare = v => {
    const d = finDiff(P, v), oldCat = new Map(), nowCat = new Map(); v.data.lines.forEach(l => oldCat.set(l.cat, (oldCat.get(l.cat) || 0) + lineEst(l))); P.budget.forEach(l => nowCat.set(l.cat, (nowCat.get(l.cat) || 0) + lineEst(l)));
    const cats = [...new Set([...oldCat.keys(), ...nowCat.keys()])], dl = (n) => h('span', { style: { color: n > 0 ? 'var(--danger)' : n < 0 ? 'var(--ok)' : '' } }, (n > 0 ? '+' : n < 0 ? '−' : '') + fm(Math.abs(n)));
    modal({ title: `Compare “${v.name}” with current`, wide: true, body: h('div', {}, h('table', { class: 'tbl rep' }, h('thead', {}, h('tr', {}, ['Category', v.name, 'Current', 'Change'].map((x, i) => h('th', { class: i ? 'rt' : '' }, x)))), h('tbody', {}, cats.map(k => h('tr', {}, h('td', { class: 'first' }, k), h('td', { class: 'rt' }, fm(oldCat.get(k) || 0)), h('td', { class: 'rt' }, fm(nowCat.get(k) || 0)), h('td', { class: 'rt' }, dl((nowCat.get(k) || 0) - (oldCat.get(k) || 0))))),
      h('tr', { class: 'strong' }, h('td', {}, 'Subtotal'), h('td', { class: 'rt' }, fm(sum([...oldCat.values()], x => x))), h('td', { class: 'rt' }, fm(sum([...nowCat.values()], x => x))), h('td', { class: 'rt' }, dl(sum([...nowCat.values()], x => x) - sum([...oldCat.values()], x => x)))))),
      h('div', { class: 'small', style: { marginTop: '12px' } }, `${d.added.length} added · ${d.removed.length} removed · ${d.changed.length} changed`),
      h('div', { class: 'fin-diff' }, d.added.map(l => h('div', {}, h('b', { style: { color: 'var(--ok)' } }, '+ '), `${l.desc || '(no description)'} — ${fm(lineEst(l))}`)), d.removed.map(l => h('div', {}, h('b', { style: { color: 'var(--danger)' } }, '− '), `${l.desc || '(no description)'} — ${fm(lineEst(l))}`)), d.changed.map(x => h('div', {}, h('b', {}, '≠ '), `${x.now.desc || '(no description)'}: ${fm(lineEst(x.was))} → ${fm(lineEst(x.now))}`)))), buttons: [{ label: 'Close', primary: true }] });
  };
  body.append(h('div', { class: 'row', style: { marginBottom: '12px' } }, h('p', { class: 'small muted', style: { margin: 0, flex: 1 } }, 'Save a version before big changes or when a budget is approved. Compare any version with today’s budget, restore it, or mark one as the approved baseline.'), h('button', { class: 'btn primary', onclick: save }, icon('plus', 15), 'Save version')),
    F.versions.length ? h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl rep' }, h('thead', {}, h('tr', {}, ['Version', 'Date', 'Total', 'vs current', 'Note', ''].map((x, i) => h('th', { class: i === 2 || i === 3 ? 'rt' : '' }, x)))), h('tbody', {}, [...F.versions].reverse().map(v => h('tr', {}, h('td', { class: 'first' }, v.name, F.baseline === v.id ? h('span', { class: 'pill', style: { marginLeft: '8px', background: 'var(--ok)', color: '#fff' } }, 'Approved') : null), h('td', {}, v.date), h('td', { class: 'rt' }, fm(v.total)), h('td', { class: 'rt', style: { color: c.total - v.total > 0 ? 'var(--danger)' : 'var(--ok)' } }, c.total === v.total ? '—' : (c.total > v.total ? '+' : '−') + fm(Math.abs(c.total - v.total))), h('td', { class: 'muted' }, v.note || ''),
      h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } }, h('button', { class: 'btn sm', onclick: () => compare(v) }, 'Compare'), ' ', h('button', { class: 'btn sm', onclick: () => { F.baseline = F.baseline === v.id ? '' : v.id; Store.touch(); ctx.draw(); } }, F.baseline === v.id ? 'Clear baseline' : 'Set approved'), ' ',
        h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox(`Restore “${v.name}”? Your current lines, categories and additions will be replaced (a safety copy is saved first).`, 'Restore')) { finSnapshot(P, 'Before restoring “' + v.name + '”', '', false); finRestore(P, v); ctx.draw(); toast('Budget restored'); } } }, 'Restore'), ' ',
        ibtn('trash', 'Delete version', async () => { if (await confirmBox(`Delete version “${v.name}”?`)) { F.versions = F.versions.filter(x => x !== v); if (F.baseline === v.id) F.baseline = ''; Store.touch(); ctx.draw(); } }, 'danger'))))))) : h('div', { class: 'empty' }, h('h3', {}, 'No versions yet'), h('p', {}, 'Save your first version to start tracking how the budget changes.')));
}

/* ---------------------------------------------------------------
   Setup — currency, additions, categories, templates
   --------------------------------------------------------------- */
function drawSetup(ctx, c) {
  const { P, F, body } = ctx, box = h('div');
  const card = (title, sub, ...kids) => h('div', { class: 'card', style: { padding: '18px', marginBottom: '16px' } }, h('h3', { style: { fontSize: '15px', marginBottom: sub ? '2px' : '10px' } }, title), sub ? h('p', { class: 'small muted', style: { margin: '0 0 12px' } }, sub) : null, ...kids);
  function draw() {
    box.replaceChildren(
      card('General', null, h('div', { class: 'row wrap', style: { gap: '18px' } }, h('label', { class: 'row small' }, 'Currency symbol', h('input', { class: 'inp', value: P.settings.currency, style: { width: '70px' }, onchange: e => { P.settings.currency = e.target.value || '$'; Store.touch(); ctx.draw(); } })),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: F.cents !== false, onchange: e => { F.cents = e.target.checked; Store.touch(); ctx.draw(); } }), 'Show cents'), h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!F.locked, onchange: e => { F.locked = e.target.checked; Store.touch(); ctx.draw(); } }), 'Lock estimates (approved budget)'))),
      card('Additions & rules', 'Percentages or fixed amounts added on top of the lines, applied in order — fringes, tax, insurance, agency / production fees, contingency. Mark one as contingency to track draw-downs.',
        F.adds.length ? h('table', { class: 'tbl wide' }, h('thead', {}, h('tr', {}, ['Name', 'Type', 'Value', 'Applies to', 'Contingency', 'Amount', ''].map(x => h('th', {}, x)))), h('tbody', {}, F.adds.map((a, i) => h('tr', {}, h('td', {}, h('input', { class: 'cell', value: a.name, oninput: e => { a.name = e.target.value; Store.touch(); } })),
          h('td', { style: { width: '120px' } }, h('select', { class: 'cell', onchange: e => { a.type = e.target.value; Store.touch(); ctx.draw(); } }, [['percent', 'Percent'], ['fixed', 'Fixed amount']].map(([k, l]) => h('option', { value: k, selected: k === a.type }, l)))), h('td', { style: { width: '110px' } }, h('input', { class: 'cell num', type: 'number', step: 'any', value: a.value, oninput: e => { a.value = e.target.value; Store.touch(); } })),
          h('td', { style: { width: '230px' } }, a.type === 'percent' ? h('select', { class: 'cell', onchange: e => { a.base = e.target.value; Store.touch(); ctx.draw(); } }, ADD_BASES.map(([k, l]) => h('option', { value: k, selected: k === a.base }, l))) : h('span', { class: 'muted small' }, '—')),
          h('td', { style: { width: '100px', textAlign: 'center' } }, h('input', { type: 'checkbox', checked: !!a.cont, onchange: e => { a.cont = e.target.checked; Store.touch(); ctx.draw(); } })), h('td', { class: 'rt' }, ctx.fm((c.adds[i] || {}).est)),
          h('td', { style: { width: '110px', whiteSpace: 'nowrap' } }, ibtn('up', 'Apply earlier', () => { if (i) { [F.adds[i - 1], F.adds[i]] = [F.adds[i], F.adds[i - 1]]; Store.touch(); ctx.draw(); } }), ibtn('down', 'Apply later', () => { if (i < F.adds.length - 1) { [F.adds[i + 1], F.adds[i]] = [F.adds[i], F.adds[i + 1]]; Store.touch(); ctx.draw(); } }), ibtn('trash', 'Delete', () => { F.adds.splice(i, 1); Store.touch(); ctx.draw(); }, 'danger')))))) : h('p', { class: 'muted small' }, 'No additions.'),
        h('div', { class: 'row', style: { marginTop: '10px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => { F.adds.push({ id: uid(), name: 'New addition', type: 'percent', value: 0, base: 'all', cont: false }); Store.touch(); ctx.draw(); } }, icon('plus', 13), 'Add rule'),
          ...[[TERM.tax, 'percent', 20, 'running'], ['Insurance', 'percent', 2, 'all'], ['Production / agency fee', 'percent', 15, 'all']].map(([n, t, v, b]) => h('button', { class: 'btn sm ghost', onclick: () => { F.adds.push({ id: uid(), name: n, type: t, value: v, base: b, cont: false }); Store.touch(); ctx.draw(); } }, '+ ' + n)))),
      card('Categories', 'Rename, regroup (above / below the line), choose which receive fringes, recolour or remove.',
        h('table', { class: 'tbl wide' }, h('thead', {}, h('tr', {}, ['', 'Category', 'Group', 'Fringes', 'Lines', 'Estimate', ''].map(x => h('th', {}, x)))), h('tbody', {}, c.cats.map((x, i) => h('tr', {}, h('td', { style: { width: '44px' } }, h('input', { type: 'color', class: 'colorpick', value: x.cat.color || '#687076', onchange: e => { x.cat.color = e.target.value; Store.touch(); } })),
          h('td', {}, h('input', { class: 'cell', value: x.cat.name, onchange: e => { const n = e.target.value.trim(); if (!n || (n !== x.cat.name && F.cats.some(z => z.name.toLowerCase() === n.toLowerCase()))) { toast('Category names must be unique.', true); e.target.value = x.cat.name; return; } P.budget.forEach(l => { if (l.cat === x.cat.name) l.cat = n; }); x.cat.name = n; Store.touch(); ctx.draw(); } })),
          h('td', { style: { width: '120px' } }, h('select', { class: 'cell', onchange: e => { x.cat.group = e.target.value; Store.touch(); ctx.draw(); } }, [['atl', 'Above the line'], ['btl', 'Below the line']].map(([k, l]) => h('option', { value: k, selected: k === x.cat.group }, l)))), h('td', { style: { width: '80px', textAlign: 'center' } }, h('input', { type: 'checkbox', checked: x.cat.fringe, onchange: e => { x.cat.fringe = e.target.checked; Store.touch(); ctx.draw(); } })),
          h('td', { style: { width: '70px' } }, String(x.count)), h('td', { class: 'rt' }, ctx.fm(x.est)),
          h('td', { style: { width: '110px', whiteSpace: 'nowrap' } }, ibtn('up', 'Move up', () => { if (i) { [F.cats[i - 1], F.cats[i]] = [F.cats[i], F.cats[i - 1]]; Store.touch(); ctx.draw(); } }), ibtn('down', 'Move down', () => { if (i < F.cats.length - 1) { [F.cats[i + 1], F.cats[i]] = [F.cats[i], F.cats[i + 1]]; Store.touch(); ctx.draw(); } }), ibtn('trash', 'Delete category', () => delCat(x), 'danger')))))),
        h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onclick: () => { F.cats.push({ id: uid(), name: 'New category ' + (F.cats.length + 1), group: 'btl', fringe: false, color: FIN_COLORS[F.cats.length % FIN_COLORS.length] }); Store.touch(); ctx.draw(); } }, icon('plus', 13), 'Add category'))),
      card('Templates', 'Load a category set for a production type. Your lines are kept — any line in a category the template lacks keeps its own category.',
        h('div', { class: 'row wrap' }, Object.entries(FIN_TEMPLATES).filter(([k]) => !['av', 'screenplay'].includes(k)).map(([k, t]) => h('button', { class: 'btn', onclick: async () => { if (!(await confirmBox(`Replace the category list with the “${t.label}” template? Lines stay where they are.`, 'Replace'))) return; const old = new Map(F.cats.map(x => [x.name, x])); F.cats = finCats(k).map(x => Object.assign(x, old.get(x.name) ? { color: old.get(x.name).color } : {})); finEnsure(P); Store.touch(); ctx.draw(); toast(`${t.label} categories loaded`); } }, t.label)))));
  }
  async function delCat(x) {
    if (x.count) { const sel = h('select', { class: 'inp' }, F.cats.filter(z => z !== x.cat).map(z => h('option', {}, z.name))); modal({ title: `Delete “${x.cat.name}”`, body: h('div', {}, h('p', { style: { marginTop: 0 } }, `${x.count} line${x.count > 1 ? 's' : ''} will move to:`), sel), buttons: [{ label: 'Cancel' }, { label: 'Move & delete', primary: true, onClick: () => { P.budget.forEach(l => { if (l.cat === x.cat.name) l.cat = sel.value; }); F.cats = F.cats.filter(z => z !== x.cat); Store.touch(); ctx.draw(); } }] }); }
    else { F.cats = F.cats.filter(z => z !== x.cat); Store.touch(); ctx.draw(); }
  }
  draw(); body.append(box);
}

/* ---------------------------------------------------------------
   Portfolio — every project's budget at a glance (home level)
   --------------------------------------------------------------- */
function renderBudgets() {
  const app = $('#app'); app.innerHTML = ''; app.style.display = 'block'; app.style.overflow = 'auto';
  const rows = finPortfolio().sort((a, b) => b.c.total - a.c.total), cur = [...new Set(rows.map(r => r.cur))];
  const fm = (r, n) => finMoney(r.p, n, false), st = { ok: ['On track', 'ok'], risk: ['At risk', 'warn'], over: ['Over budget', 'danger'], empty: ['No budget', ''] };
  const totalsFor = k => { const rs = rows.filter(r => r.cur === k), t = o => sum(rs, r => r.c[o]); return h('div', { class: 'card', style: { padding: '16px', minWidth: '260px' } }, h('div', { class: 'small muted' }, `${rs.length} project${rs.length === 1 ? '' : 's'} · ${k}`), h('div', { class: 'fin-kpis', style: { gridTemplateColumns: 'repeat(2, 1fr)', margin: '10px 0 0' } },
    [['Total budget', t('total')], ['Spent', t('act')], ['Committed', t('com')], ['Forecast', t('eac')]].map(([l, v]) => h('div', { class: 'fin-kpi' }, h('span', { class: 'fk-l' }, l), h('b', {}, k + Math.round(v).toLocaleString()))))); };
  app.append(h('div', { class: 'home-top' }, h('a', { class: 'logo', href: '#/', style: { padding: 0 } }, h('span', { class: 'mark' }, icon('film', 18)), 'StudioBindahh'), h('span', { class: 'grow' }), h('a', { class: 'btn sm', href: '#/' }, icon('home', 15), 'All projects'), themeBtn()),
    h('div', { class: 'page', style: { maxWidth: '1280px' } }, h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, 'Budgets'), h('div', { class: 'muted small', style: { marginTop: '3px' } }, 'Every production’s money in one place. Click a project to open its budget.')), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => download('studiobindahh-budgets.csv', toCSV([['Project', 'Type', 'Currency', 'Budget', 'Spent', 'Committed', 'Remaining', 'Forecast', 'Variance', 'Status'], ...rows.map(r => [r.p.title, MODE_LABEL[r.p.mode] || r.p.mode, r.cur, Math.round(r.c.total), Math.round(r.c.act), Math.round(r.c.com), Math.round(r.c.remaining), Math.round(r.c.eac), Math.round(r.c.variance), st[r.c.status][0]])]), 'text/csv') }, icon('download', 15), 'CSV')),
      h('div', { class: 'row wrap', style: { gap: '14px', marginBottom: '18px', alignItems: 'stretch' } }, cur.map(totalsFor)),
      rows.length ? h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl rep' }, h('thead', {}, h('tr', {}, ['Project', 'Type', 'Budget', 'Spent', 'Committed', 'Remaining', 'Forecast', 'Variance', 'Status'].map((x, i) => h('th', { class: i > 1 && i < 8 ? 'rt' : '' }, x)))),
        h('tbody', {}, rows.map(r => h('tr', { style: { cursor: 'pointer' }, onclick: () => { UI.bTab = 'dash'; location.hash = `#/p/${r.p.id}/budget`; } }, h('td', { class: 'first' }, r.p.series ? [r.p.title, h('div', { class: 'small muted' }, `${r.p.series.name} · ${epCode(r.p.series)}`)] : r.p.title), h('td', {}, MODE_LABEL[r.p.mode] || ''),
          h('td', { class: 'rt' }, fm(r, r.c.total)), h('td', { class: 'rt' }, h('div', {}, fm(r, r.c.act)), r.c.total ? h('div', { class: 'progress', style: { marginTop: '4px', minWidth: '70px' } }, h('i', { style: { width: Math.min(100, r.c.spentPct) + '%', background: r.c.spentPct > 100 ? 'var(--danger)' : '' } })) : null), h('td', { class: 'rt' }, fm(r, r.c.com)), h('td', { class: 'rt' + (r.c.remaining < 0 ? ' neg' : '') }, fm(r, r.c.remaining)), h('td', { class: 'rt' }, fm(r, r.c.eac)), h('td', { class: 'rt' + (r.c.variance < 0 ? ' neg' : '') }, fm(r, r.c.variance)), h('td', {}, h('span', { class: 'pill ' + st[r.c.status][1] }, st[r.c.status][0]))))))) : h('div', { class: 'empty' }, h('h3', {}, 'No projects yet')),
      cur.length > 1 ? h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Projects use different currencies, so they are totalled separately.') : null));
}
