'use strict';
/* Budget — model tests */
const B = BudgetModel;
function budgetProject(extra = {}) {
  const P = fakeProject(Object.assign({ mode: 'film', settings: { currency: '$', contingency: 10 }, days: [], budget: [
    { id: 'l1', cat: 'Cast', desc: 'Lead', qty: 5, unit: 'Day', rate: 1000 },
    { id: 'l2', cat: 'Camera & grip', desc: 'Camera package', qty: 1, unit: 'Flat', rate: 2000 },
  ] }, extra));
  B.ensure(P); return P;
}
const fm0 = n => String(Math.round(n));

test('budget: ensure migrates old actuals into expenses and adds unknown categories', () => {
  const P = fakeProject({ mode: 'stage', settings: {}, budget: [{ id: 'a', cat: 'Puppets', desc: 'x', qty: 1, rate: 10, actual: '40' }] });
  const F = B.ensure(P);
  eq(F.v, 2); eq(F.txns.length, 1); eq(F.txns[0].amount, 40); eq(P.budget[0].actual, undefined);
  assert(F.cats.some(c => c.name === 'Puppets'), 'unknown category added');
  eq(F.cats[0].name, 'Creative team', 'stage template'); eq(F.adds.map(a => a.value), [0, 10]);
});

test('budget: view and calc read without changing the project', () => {
  const P = fakeProject({ settings: {}, budget: [{ id: 'a', cat: 'Odd', qty: 2, rate: 5 }] });
  const c = B.calc(P);
  eq(P.fin, undefined, 'no record created'); eq(c.total, 10); eq(c.cats.map(x => x.cat.name), ['Odd']);
});

test('budget: estimates, actuals, commitments and forecast', () => {
  const P = budgetProject(); const F = P.fin;
  F.txns.push(B.newTxn({ lineId: 'l1', amount: 3000, status: 'Paid' }), B.newTxn({ lineId: 'l1', amount: 1000, status: 'Invoiced' }), B.newTxn({ lineId: 'l2', amount: 2500, status: 'Committed' }), B.newTxn({ amount: 50 }));
  const c = B.calc(P), r1 = c.lines.get('l1'), r2 = c.lines.get('l2');
  eq([r1.est, r1.act, r1.paid, r1.owed, r1.etc, r1.eac], [5000, 4000, 3000, 1000, 1000, 5000]);
  eq([r2.com, r2.etc, r2.eac, r2.rem], [2500, 0, 2500, -500]);
  eq(c.un.act, 50); eq(c.sub.est, 7000);
  eq(c.adds[1].est, 700, 'contingency 10% of running'); eq(c.total, 7700);
  eq(c.adds[1].eac, 0, 'unused contingency not forecast');
  eq(c.eac, 7550); eq(c.status, 'risk');
  eq(B.overLines(P, c).map(x => x.l.id), ['l2']);
});

test('budget: forecast override and done lines', () => {
  const P = budgetProject(); B.updateLine(P.budget[0], 'etc', '200');
  eq(B.calc(P).lines.get('l1').etc, 200);
  B.updateLine(P.budget[0], 'etc', ''); eq(P.budget[0].etc, undefined, 'blank goes back to automatic');
  B.toggleDone(P.budget[0]); eq(B.calc(P).lines.get('l1').eac, 0);
  eq(B.updateLine(P.budget[0], 'id', 'x'), false); eq(B.updateLine(P.budget[0], 'unit', 'Fortnight'), false);
});

test('budget: fixed additions, bases and running totals', () => {
  const P = budgetProject(); const F = P.fin;
  F.adds[0].value = 10;                              // fringes on fringeable (Cast) 5000
  const fee = B.addAdd(F, { name: 'Fee', type: 'fixed', value: 300 });
  const c = B.calc(P);
  eq(c.adds.map(x => x.est), [500, 750, 300]);        // contingency is 10% of 7000 + 500
  eq(B.updateAdd(fee, 'base', 'nope'), false); eq(B.updateAdd(fee, 'cont', 1), true); eq(fee.cont, true);
  eq(B.addLabel(F.adds[1]), 'Contingency (10% of everything above (running total))');
  B.swap(F.adds, 2, -1); eq(F.adds[1].name, 'Fee'); eq(B.swap(F.adds, 0, -1), false);
});

test('budget: lines — add after, duplicate, shift, move, remove, number', () => {
  const P = budgetProject();
  const n = B.addLine(P, 'Cast', 'l1'); eq(P.budget[1].id, n.id); eq(n.cat, 'Cast');
  P.budget[0].auto = 'gear:x'; const d = B.duplicateLine(P, 'l1'); eq(d.auto, undefined); eq(P.budget[1].id, d.id);
  eq(B.shiftLine(P, 'l1', -1), false); eq(B.shiftLine(P, 'l1', 1), true); eq(P.budget[1].id, 'l1');
  B.moveLine(P, 'l2', 'Cast'); eq(B.line(P, 'l2').cat, 'Cast');
  eq(B.numberAccounts(P, P.fin), 4); eq(P.budget.map(l => l.acct), ['2010', '2020', '2030', '2040']);
  eq(B.removeLine(P, 'l2'), true); eq(P.budget.length, 3);
});

test('budget: expenses — save, filter, bulk edits, totals', () => {
  const P = budgetProject(); const F = P.fin;
  eq(B.saveTxn(F, B.newTxn({ amount: '' })), false, 'needs an amount');
  const t = B.newTxn({ vendor: 'Acme', amount: '1,200', lineId: 'l2', date: '2026-03-02' }); B.saveTxn(F, t);
  eq(F.txns[0].amount, 1200);
  B.saveTxn(F, Object.assign({}, F.txns[0], { amount: 900 })); eq(F.txns.length, 1); eq(F.txns[0].amount, 900);
  B.saveTxn(F, B.newTxn({ vendor: 'Zed', amount: 10, date: '2026-04-01', status: 'Invoiced' }));
  eq(B.filterTxns(P, {}).map(x => x.vendor), ['Zed', 'Acme'], 'newest first');
  eq(B.filterTxns(P, { cat: '__un' }).map(x => x.vendor), ['Zed']);
  eq(B.filterTxns(P, { cat: 'Camera & grip', q: 'acm' }).length, 1);
  eq(B.filterTxns(P, { month: '2026-03' }).length, 1);
  eq(B.txnTotals(F.txns), { Paid: 900, Invoiced: 10, Committed: 0 });
  eq(B.txnMonths(F), ['2026-04', '2026-03']);
  const ids = F.txns.map(x => x.id); B.assignTxns(F, ids, 'l1'); assert(F.txns.every(x => x.lineId === 'l1'));
  eq(B.setTxnStatus(F, ids, 'Bogus'), false); B.setTxnStatus(F, [ids[0]], 'Committed'); eq(F.txns[0].status, 'Committed');
  B.duplicateTxn(F, ids[0]); eq(B.removeTxns(F, ids), 2); eq(F.txns.length, 1);
  eq(B.acctLabel(P, 'l2'), 'Camera package'); eq(B.acctLabel(P, 'add:' + F.adds[1].id), 'Contingency (addition)');
});

test('budget: categories — add, rename cascades, remove moves lines, template keeps colours', () => {
  const P = budgetProject(); const F = P.fin;
  eq(B.addCat(F, 'cast'), null, 'names are unique, any case');
  const c = B.addCat(F, 'Drones'); eq(c.group, 'btl');
  const cast = F.cats.find(x => x.name === 'Cast');
  eq(B.renameCat(P, F, cast.id, 'Crew'), false); eq(B.renameCat(P, F, cast.id, 'Performers'), true); eq(P.budget[0].cat, 'Performers');
  eq(B.removeCat(P, F, cast.id), false, 'lines need somewhere to go');
  eq(B.removeCat(P, F, cast.id, 'Drones'), true); eq(P.budget[0].cat, 'Drones');
  const color = F.cats.find(x => x.name === 'Camera & grip').color = '#000';
  B.applyTemplate(P, F, 'film'); eq(F.cats.find(x => x.name === 'Camera & grip').color, color);
  assert(F.cats.some(x => x.name === 'Drones'), 'categories with lines come back');
});

test('budget: versions — snapshot, compare, restore with safety copy, baseline', () => {
  const P = budgetProject(); const F = P.fin;
  const v = B.snapshot(P, F, { name: 'Draft', date: '2026-01-01', baseline: true });
  eq([v.total, F.baseline, v.date], [7700, v.id, '2026-01-01']);
  P.budget[1].rate = 3000; B.addLine(P, 'Sound').rate = 100;
  const cmp = B.compare(P, v); eq(cmp.change, 1100); eq(cmp.diff.added.length, 1); eq(cmp.diff.changed.length, 1);
  eq(B.baselineByCat(P).m.get('Cast'), 5000); eq(B.calc(P).baseline, 7700);
  B.restore(P, F, v.id, { date: '2026-02-02' });
  eq(P.budget.length, 2); eq(P.budget[1].rate, 2000); eq(F.versions.length, 2); eq(F.versions[1].name, 'Before restoring “Draft”');
  B.toggleBaseline(F, v.id); eq(F.baseline, '');
  B.toggleBaseline(F, v.id); B.removeVersion(F, v.id); eq(F.baseline, ''); eq(F.versions.length, 1);
});

test('budget: cash flow by month with funding and fallback month', () => {
  const P = budgetProject({ days: [{ date: '2026-05-10' }] }); const F = P.fin;
  P.budget[1].due = '2026-06-01';
  F.txns.push(B.newTxn({ lineId: 'l1', amount: 1000, date: '2026-04-03' }));
  F.funding.push({ id: 'f', date: '2026-03-01', amount: 6000 });
  const cf = B.cashflow(P, '2026-01');
  eq(cf.rows.map(r => r.month), ['2026-03', '2026-04', '2026-05', '2026-06']);
  eq(cf.rows[2].forecast, 4000, 'remaining lands on the last shoot day');
  eq(cf.rows[3].forecast, 2000); eq(cf.rows[3].balance, -1000); eq(cf.dated, 1);
});

test('budget: alerts, vendors and top sheet', () => {
  const P = budgetProject(); const F = P.fin;
  F.txns.push(B.newTxn({ vendor: 'Rental Co', lineId: 'l2', amount: 2500, status: 'Invoiced' }), B.newTxn({ amount: 20 }));
  F.funding.push({ id: 'f', amount: 100 });
  const c = B.calc(P), al = B.alerts(P, c, fm0);
  eq(al.map(a => a[2]), ['expenses', 'budget', 'top', 'cash', 'expenses']);
  eq(B.topVendors(F), [['Rental Co', 2500], ['(no vendor)', 20]]);
  const ts = B.topSheet(P, c, fm0);
  eq(ts.head.length, 8); eq(ts.rows[ts.rows.length - 1][0], 'GRAND TOTAL'); eq(ts.rows[ts.rows.length - 1][1], '7700');
});

test('budget: CSV out and in', () => {
  const P = budgetProject(); const rows = B.linesCsv(P);
  eq(rows[1].slice(0, 7), ['', 'Cast', 'Lead', 5, 'Day', 1000, 5000]);
  const lines = B.parseLines([['Code', 'Section', 'Item', 'Qty', 'Unit', 'Total'], ['100', 'Crew', 'Gaffer', '', 'Week', '$1,500'], ['', '', '', '', '', '']]);
  eq(lines.length, 1); eq([lines[0].acct, lines[0].cat, lines[0].qty, lines[0].unit, lines[0].rate], ['100', 'Crew', 1, 'Week', 1500]);
  const tx = B.parseTxns([['Date', 'Payee', 'Amount'], ['3/4/26', 'Shop', '-42.10'], ['2026-05-01', 'Zero', '0']]);
  eq(tx.length, 1); eq([tx[0].date, tx[0].desc, tx[0].amount], ['2026-04-03', 'Shop', 42.1]);
});

test('budget: sync from production updates automatic lines without duplicating', () => {
  const P = budgetProject({ props: [{ cost: '30' }, { cost: 20 }], wardrobe: [], podcast: { gear: [{ id: 'g', name: 'Mic', cat: 'Mics', rate: 15, qty: 2, source: 'Hire Co' }] }, days: [{}, {}] });
  const o = { fromRates: () => ({ cast: 1, crew: 2, loc: 0 }), gearCats: { Mics: 'Sound' } };
  const r = B.syncProduction(P, o); B.syncProduction(P, o);
  eq([r.cast, r.items, r.gear], [1, 1, 1]);
  const gear = P.budget.filter(l => l.auto === 'gear:g'); eq(gear.length, 1); eq([gear[0].cat, gear[0].qty, gear[0].desc], ['Sound', 4, 'Mic (Hire Co)']);
  eq(P.budget.filter(l => l.desc === 'Props (from Props list)')[0].rate, 50);
});

test('budget: portfolio totals per currency', () => {
  const a = budgetProject(), b = budgetProject({ settings: { currency: '£' } }); b.budget = [];
  const rows = B.portfolio([b, a]); eq(rows[0].p, a);
  eq(B.portfolioTotals(rows).map(x => [x.cur, x.n, x.total]), [['$', 1, 7700], ['£', 1, 0]]);
});

/* ---------- view model ---------- */
function budgetVM(P = budgetProject(), fx = {}) {
  const store = fakeStore(P), vm = new BudgetVM({ project: () => P, store, ui: {}, fx: Object.assign({ today: () => '2026-11-24', fringeName: () => 'Fringes', taxName: 'VAT', fromRates: () => ({ cast: 0, crew: 0, loc: 0 }), gearCats: () => ({}) }, fx) });
  let draws = 0; vm.subscribe(() => draws++);
  return { vm, P, store, draws: () => draws };
}

test('budget vm: tabs, filters and the sheet', () => {
  const { vm } = budgetVM();
  eq(vm.tab, 'dash'); vm.setTab('nope'); eq(vm.tab, 'dash'); vm.setTab('budget'); eq(vm.tab, 'budget');
  const cast = vm.F.cats.find(c => c.name === 'Cast');
  vm.toggleCollapsed(cast.id); assert(vm.sheet(vm.calc).find(s => s.x.cat.id === cast.id).collapsed);
  vm.setLineFilter({ q: 'camera' }); const s = vm.sheet(vm.calc);
  eq(s.length, 1); eq(s[0].lines[0].id, 'l2'); eq(vm.isCollapsed(cast.id), false, 'search shows everything');
  vm.showLineExpenses('l1'); eq([vm.tab, vm.expFilter.line], ['expenses', 'l1']);
  vm.setExpFilter({ cat: 'Cast' }); eq(vm.expFilter.line, '', 'choosing a category clears the line filter');
});

test('budget vm: locked estimates, quiet typing and line commands', () => {
  const { vm, P, store, draws } = budgetVM();
  const d0 = draws(); eq(vm.updateLine('l1', 'rate', '1200', { quiet: true }), true); eq(draws(), d0, 'typing does not redraw');
  eq(vm.calc.lines.get('l1').est, 6000); assert(store.touches > 0);
  vm.toggleLock(); eq(vm.locked, true);
  eq(vm.updateLine('l1', 'rate', '1'), false); eq(vm.updateLine('l1', 'notes', 'ok'), true);
  vm.setLocked(false);
  const cast = vm.F.cats.find(c => c.name === 'Cast'); vm.toggleCollapsed(cast.id);
  const l = vm.addLine('Cast', 'l1'); eq(P.budget[1].id, l.id); eq(vm.isCollapsed(cast.id), false, 'adding a line opens its category');
  vm.duplicateLine('l1'); vm.shiftLine('l1', 1); vm.toggleDone('l1'); eq(vm.line('l1').done, true);
  eq(vm.numberAccounts(), 4); vm.removeLine(l.id); eq(P.budget.length, 3);
});

test('budget vm: expenses use the local date and need an amount', () => {
  const { vm, P } = budgetVM();
  const t = vm.newExpense({ lineId: 'l2' }); eq(t.date, '2026-11-24');
  eq(vm.saveExpense(t), false); t.amount = '250'; eq(vm.saveExpense(t), true); eq(P.fin.txns[0].amount, 250);
  vm.updateExpense(t.id, 'vendor', 'Acme', { quiet: true }); eq(vm.expense(t.id).vendor, 'Acme');
  eq(vm.updateExpense(t.id, 'status', 'Lost'), false);
  vm.duplicateExpense(t.id); const ids = P.fin.txns.map(x => x.id);
  vm.setExpenseStatus(ids, 'Invoiced'); vm.assignExpenses(ids, 'l1');
  eq(vm.expenses.totals.Invoiced, 500); eq(vm.calc.lines.get('l1').owed, 500);
  eq(vm.removeExpenses(ids), 2);
});

test('budget vm: categories, additions, funding and versions', () => {
  const { vm, P } = budgetVM();
  eq(vm.addCategory('Cast'), null); const c = vm.addCategory('VFX'); eq(c.name, 'VFX');
  eq(vm.renameCategory(c.id, 'cast'), false); eq(vm.renameCategory(c.id, 'Visual effects'), true);
  eq(vm.moveCategory(c.id, -1), true);
  eq(vm.presetAdds[0][0], 'VAT'); const a = vm.addAddition({ name: 'Fee', type: 'fixed', value: 100 });
  vm.updateAddition(a.id, 'value', 200, { quiet: true }); eq(vm.calc.adds.find(x => x.add.id === a.id).est, 200);
  vm.moveAddition(a.id, -1); vm.removeAddition(a.id); eq(P.fin.adds.length, 2);
  const f = vm.addFunding(); vm.updateFunding(f.id, 'amount', '5000'); eq(vm.calc.funded, 5000); vm.removeFunding(f.id);
  const v = vm.saveVersion({ name: 'A', baseline: true }); eq(v.date, '2026-11-24');
  P.budget[0].rate = 2000; eq(vm.compare(v.id).change, 5000);
  vm.restoreVersion(v.id); eq(P.budget[0].rate, 1000); eq(P.fin.versions.length, 2);
  vm.removeVersion(v.id); eq(P.fin.baseline, '');
});

test('budget vm: stand-in categories become real when changed', () => {
  const P = budgetProject(); P.budget.push({ id: 'x', cat: 'Catering', qty: 1, rate: 50 });
  const { vm } = budgetVM(P); const cat = vm.F.cats.find(c => c.name === 'Catering');
  eq(cat.id, 'new:Catering'); eq(P.fin.cats.some(c => c.name === 'Catering'), false, 'reading does not add it');
  vm.updateCategory(cat.id, 'group', 'atl'); eq(P.fin.cats.find(c => c.name === 'Catering').group, 'atl');
});

test('budget vm: printouts, sync and imports', () => {
  const { vm, P } = budgetVM(budgetProject({ props: [{ cost: 40 }] }));
  eq(vm.printable('ledger'), null, 'nothing to print'); eq(vm.printable('top').title, 'Budget top sheet');
  eq(vm.printable('detail').rows[0], { grp: 'Cast — $5,000.00' });
  eq(vm.syncProduction().items, 1); assert(P.budget.some(l => l.desc === 'Props (from Props list)'));
  const ls = vm.parseLines([['Description', 'Rate'], ['Fuel', '30']]); vm.addLines(ls); eq(P.budget.length, 4);
  vm.addTxns(vm.parseTxns([['Date', 'Description', 'Amount'], ['2026-01-02', 'Taxi', '-12']]));
  eq(vm.tab, 'expenses'); eq(vm.calc.un.n, 1);
});
