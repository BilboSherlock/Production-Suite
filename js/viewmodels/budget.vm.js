'use strict';
/* ===================================================================
   Budget — VIEW MODEL
   Dashboard, budget sheet, expenses, top sheet, cash flow, versions
   and setup: what each tab shows and what the user can do there.
   No DOM. See js/mvvm.js; the money rules are in BudgetModel.
   =================================================================== */

class BudgetVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx:
   *   fringeName(P) — the region's word for fringes;  taxName — the region's word for sales tax
   *   fromRates(P) → { cast, crew, loc }  (default: buildBudgetFromRates);  gearCats — gear → budget category
   *   today() → YYYY-MM-DD (default: local date)
   */
  constructor(opts = {}) {
    super(opts);
    const fx = opts.fx || {};
    this._fx = Object.assign({
      fringeName: P => typeof finFringeName === 'function' ? finFringeName(P) : 'Fringes & payroll',
      taxName: typeof TERM !== 'undefined' && TERM.tax ? TERM.tax : 'Tax',
      fromRates: typeof buildBudgetFromRates === 'function' ? buildBudgetFromRates : null,
      gearCats: () => typeof finGearCats === 'function' ? finGearCats() : {},
      today: () => localISODate(),
    }, fx);
    this.view = this.uiState('budget', { tab: 'dash', open: {}, collapsed: {}, shown: 200, lines: { q: '', over: false }, exp: { q: '', status: '', cat: '', line: '', month: '' } });
  }

  /** change the finance record (made valid first) */
  _fin(fn, o) { return this.commit(P => fn(P, BudgetModel.ensure(P, { fringeName: this._fx.fringeName(P) })), o); }

  /* ---------- UI state ---------- */
  static TABS = [['dash', 'Dashboard'], ['budget', 'Budget'], ['expenses', 'Expenses'], ['top', 'Top sheet'], ['cash', 'Cash flow'], ['versions', 'Versions'], ['setup', 'Setup']];
  get tabs() { return BudgetVM.TABS; }
  get tab() { return BudgetVM.TABS.some(t => t[0] === this.view.tab) ? this.view.tab : 'dash'; }
  setTab(tab) { this.setUi('budget', { tab }); }
  get lineFilter() { return this.view.lines; }
  setLineFilter(patch) { Object.assign(this.view.lines, patch); this.notify(); }
  get expFilter() { return this.view.exp; }
  setExpFilter(patch) { Object.assign(this.view.exp, patch); if (patch.cat !== undefined && patch.line === undefined) this.view.exp.line = ''; this.view.shown = 200; this.notify(); }
  /** open the expense list for one budget line */
  showLineExpenses(id) { this.view.exp = { q: '', status: '', cat: '', line: id, month: '' }; this.setUi('budget', { tab: 'expenses', shown: 200 }); }
  isOpen(id) { return !!this.view.open[id]; }
  toggleOpen(id) { this.view.open[id] = !this.view.open[id]; this.notify(); }
  isCollapsed(catId) { const B = this.view.lines; return !!this.view.collapsed[catId] && !B.q && !B.over; }
  toggleCollapsed(catId) { this.view.collapsed[catId] = !this.view.collapsed[catId]; this.notify(); }
  expand(catId) { delete this.view.collapsed[catId]; }
  collapseAll() { this.F.cats.forEach(c => { this.view.collapsed[c.id] = true; }); this.notify(); }
  expandAll() { this.view.collapsed = {}; this.notify(); }
  get shown() { return this.view.shown; }
  showMore() { this.view.shown += 300; this.notify(); }

  /* ---------- what to show ---------- */
  /** the finance record, read-only (see BudgetModel.view) */
  get F() { return BudgetModel.view(this.P); }
  get calc() { return BudgetModel.calc(this.P); }
  get locked() { return !!this.F.locked; }
  get isEmpty() { return !(this.P.budget || []).length && !this.F.txns.length; }
  fm(n) { return BudgetModel.money(this.P, n); }
  fs(n) { return BudgetModel.short(this.P, n); }
  line(id) { return BudgetModel.line(this.P, id); }
  lineRow(c, id) { return c.lines.get(id); }
  statusLabel(c) { return (BudgetModel.STATUS_LABEL[c.status] || BudgetModel.STATUS_LABEL.empty); }
  alerts(c) { return BudgetModel.alerts(this.P, c, n => this.fm(n)); }
  overLines(c) { return BudgetModel.overLines(this.P, c); }
  chartRows(c) { return BudgetModel.chartRows(c); }
  topVendors() { return BudgetModel.topVendors(this.F); }
  cashflow(c) { return BudgetModel.cashflow(this.P, this._fx.today().slice(0, 7), c); }
  topSheet(c) { return BudgetModel.topSheet(this.P, c, n => this.fm(n)); }
  /** the budget sheet: categories with the lines that pass the filters, and whether to show each */
  sheet(c) {
    const B = this.view.lines, filtered = !!(B.q || B.over);
    return c.cats.map(x => ({ x, lines: x.lines.filter(l => BudgetModel.lineMatches(l, c.lines.get(l.id), B)), collapsed: this.isCollapsed(x.cat.id) }))
      .filter(s => !filtered || s.lines.length).map(s => Object.assign(s, { filtered }));
  }
  addLabel(a) { return BudgetModel.addLabel(a); }
  /** expenses after the ledger filters, and the page of them to show */
  get expenses() { const list = BudgetModel.filterTxns(this.P, this.view.exp); return { list, shown: list.slice(0, this.view.shown), totals: BudgetModel.txnTotals(list) }; }
  get months() { return BudgetModel.txnMonths(this.F); }
  get vendors() { return BudgetModel.vendors(this.P); }
  get accountGroups() { return BudgetModel.accountGroups(this.P); }
  acctLabel(id) { return BudgetModel.acctLabel(this.P, id); }
  get units() { return BudgetModel.UNITS; }
  get statuses() { return BudgetModel.STATUS; }
  get statusHelp() { return BudgetModel.STATUS_HELP; }
  get payMethods() { return BudgetModel.PAY_METHODS; }
  get addBases() { return BudgetModel.ADD_BASES; }
  get templates() { return BudgetModel.templateList(); }
  get presetAdds() { return BudgetModel.presetAdds(this._fx.taxName); }
  get currency() { return (this.P.settings && this.P.settings.currency) || '$'; }
  /** a blank expense for the form (preset fields filled) */
  newExpense(preset = {}) { return BudgetModel.newTxn(preset, this._fx.today()); }
  compare(id) { const v = this.F.versions.find(x => x.id === id); return v ? Object.assign(BudgetModel.compare(this.P, v), { v }) : null; }
  /** printed reports: { title, head, rows, opts } or null when there is nothing to print */
  printable(kind) {
    const P = this.P, c = this.calc, fm = n => this.fm(n);
    if (kind === 'top') { const t = this.topSheet(c); return { title: 'Budget top sheet', head: t.head, rows: t.rows, opts: { landscape: true, sub: `${fm(c.total)} total budget` } }; }
    if (kind === 'detail') return { title: 'Detailed budget', head: ['Acct', 'Description', 'Qty', 'Unit', 'Rate', 'Estimate', 'Actual', 'Committed', 'Remaining'], rows: BudgetModel.detailRows(P, c, fm), opts: {} };
    if (kind === 'cost') return { title: 'Cost report — budget vs actual', head: ['Acct', 'Description', 'Budget', 'Actual', 'Committed', 'To complete', 'Forecast', 'Variance'], rows: BudgetModel.costReportRows(P, c, fm), opts: {} };
    if (kind === 'ledger') { const rows = BudgetModel.ledgerRows(P, fm); return rows.length ? { title: 'Expense ledger', head: ['Date', 'Vendor', 'Description', 'Account', 'Amount', 'Status', 'Ref'], rows, opts: {} } : null; }
    if (kind === 'cash') { const cf = this.cashflow(c); return cf.rows.length ? { title: 'Cash flow by month', head: ['Month', 'Spent', 'Committed', 'Forecast', 'Funding in', 'Cumulative spend', 'Balance'], rows: cf.rows.map(r => [r.month, fm(r.actual), fm(r.committed), fm(r.forecast), fm(r.funding), fm(r.cumSpend), fm(r.balance)]), opts: { landscape: false } } : null; }
    return null;
  }
  linesCsv() { return BudgetModel.linesCsv(this.P); }
  txnsCsv() { return BudgetModel.txnsCsv(this.P); }

  /* ---------- general ---------- */
  setLocked(v) { this._fin((P, F) => { F.locked = !!v; }); }
  toggleLock() { this.setLocked(!this.F.locked); }
  setCents(v) { this._fin((P, F) => { F.cents = !!v; }); }
  setCurrency(v) { this._fin(P => { P.settings.currency = String(v || '').trim() || '$'; }); }
  /** pull costs from cast, crew, locations, props, wardrobe and gear; returns the counts */
  syncProduction() { return this._fin(P => BudgetModel.syncProduction(P, { fromRates: this._fx.fromRates, gearCats: this._fx.gearCats() })); }
  /** add parsed CSV rows: budget lines or statement expenses */
  parseLines(rows) { return BudgetModel.parseLines(rows); }
  parseTxns(rows) { return BudgetModel.parseTxns(rows); }
  addLines(ls) { this._fin(P => { P.budget.push(...ls); }); }
  addTxns(ts) { this._fin((P, F) => { F.txns.push(...ts); }); this.setTab('expenses'); }

  /* ---------- budget lines ---------- */
  static EST_FIELDS = ['acct', 'desc', 'qty', 'unit', 'rate'];
  /** a new line in a category (by name), after another line or at the end */
  addLine(cat, afterId) { const l = this._fin(P => BudgetModel.addLine(P, cat, afterId), { quiet: true }); const c = this.F.cats.find(x => x.name === cat); if (c) this.expand(c.id); this.notify(); return l; }
  /** change a field; estimate fields are read-only while the budget is locked. Typing: { quiet: true } */
  updateLine(id, k, v, o) {
    if (this.locked && BudgetVM.EST_FIELDS.includes(k)) return false;
    return this._fin(P => { const l = BudgetModel.line(P, id); return !!l && BudgetModel.updateLine(l, k, v); }, o);
  }
  toggleDone(id) { this._fin(P => { const l = BudgetModel.line(P, id); if (l) BudgetModel.toggleDone(l); }); }
  duplicateLine(id) { return this._fin(P => BudgetModel.duplicateLine(P, id)); }
  shiftLine(id, d) { return this._fin(P => BudgetModel.shiftLine(P, id, d)); }
  moveLine(id, cat) { return this._fin(P => BudgetModel.moveLine(P, id, cat)); }
  removeLine(id) { return this._fin(P => BudgetModel.removeLine(P, id)); }
  numberAccounts() { return this._fin((P, F) => BudgetModel.numberAccounts(P, F)); }

  /* ---------- expenses ---------- */
  /** add or update an expense from the form; false when it has no amount */
  saveExpense(t) { if (!BudgetModel.num(t.amount)) return false; return this._fin((P, F) => BudgetModel.saveTxn(F, t)); }
  updateExpense(id, k, v, o) { return this._fin((P, F) => { const t = F.txns.find(x => x.id === id); return !!t && BudgetModel.updateTxn(t, k, v); }, o); }
  duplicateExpense(id) { return this._fin((P, F) => BudgetModel.duplicateTxn(F, id)); }
  removeExpenses(ids) { return this._fin((P, F) => BudgetModel.removeTxns(F, ids)); }
  assignExpenses(ids, lineId) { this._fin((P, F) => BudgetModel.assignTxns(F, ids, lineId)); }
  setExpenseStatus(ids, status) { return this._fin((P, F) => BudgetModel.setTxnStatus(F, ids, status)); }
  expense(id) { return this.F.txns.find(x => x.id === id); }

  /* ---------- additions ---------- */
  addAddition(o) { return this._fin((P, F) => BudgetModel.addAdd(F, o)); }
  updateAddition(id, k, v, o) { return this._fin((P, F) => { const a = F.adds.find(x => x.id === id); return !!a && BudgetModel.updateAdd(a, k, v); }, o); }
  moveAddition(id, d) { return this._fin((P, F) => BudgetModel.swap(F.adds, F.adds.findIndex(a => a.id === id), d)); }
  removeAddition(id) { this._fin((P, F) => BudgetModel.removeAdd(F, id)); }

  /* ---------- categories ---------- */
  /** null when the name is taken */
  addCategory(name) { if (name && BudgetModel.catNameTaken(this.F, name)) return null; return this._fin((P, F) => BudgetModel.addCat(F, name)); }
  /** false when the name is empty or taken */
  renameCategory(id, name) { const F = this.F, c = F.cats.find(x => x.id === id); if (!c || !String(name || '').trim() || BudgetModel.catNameTaken(F, name, c)) return false; return this._fin((P, F) => BudgetModel.renameCat(P, F, this._realCatId(F, id), name)); }
  updateCategory(id, k, v, o) { return this._fin((P, F) => { const c = F.cats.find(x => x.id === this._realCatId(F, id)); return !!c && BudgetModel.updateCat(c, k, v); }, o); }
  moveCategory(id, d) { return this._fin((P, F) => BudgetModel.swap(F.cats, F.cats.findIndex(c => c.id === this._realCatId(F, id)), d)); }
  removeCategory(id, moveTo) { return this._fin((P, F) => BudgetModel.removeCat(P, F, this._realCatId(F, id), moveTo)); }
  applyTemplate(key) { return this._fin((P, F) => BudgetModel.applyTemplate(P, F, key)); }
  /** a stand-in category ('new:Name', see BudgetModel.view) becomes real when changed */
  _realCatId(F, id) { if (!String(id).startsWith('new:')) return id; const c = F.cats.find(x => x.name === id.slice(4)); return c ? c.id : id; }

  /* ---------- funding ---------- */
  addFunding() { return this._fin((P, F) => BudgetModel.addFunding(F)); }
  updateFunding(id, k, v, o) { return this._fin((P, F) => { const f = F.funding.find(x => x.id === id); return !!f && BudgetModel.updateFunding(f, k, v); }, o); }
  removeFunding(id) { this._fin((P, F) => BudgetModel.removeFunding(F, id)); }

  /* ---------- versions ---------- */
  saveVersion({ name, note, baseline } = {}) { return this._fin((P, F) => BudgetModel.snapshot(P, F, { name, note, baseline, date: this._fx.today() })); }
  restoreVersion(id) { return this._fin((P, F) => BudgetModel.restore(P, F, id, { date: this._fx.today() })); }
  toggleBaseline(id) { this._fin((P, F) => BudgetModel.toggleBaseline(F, id)); }
  removeVersion(id) { this._fin((P, F) => BudgetModel.removeVersion(F, id)); }
}
