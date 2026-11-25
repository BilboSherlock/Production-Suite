'use strict';
/* ===================================================================
   Budget — MODEL
   Categories, budget lines, expenses (actuals and commitments),
   percentage / fixed additions (fringes, contingency, tax, fees),
   forecast, cash flow, funding, versions and portfolio totals.
   Pure functions — no DOM, no Store.

   Budget lines stay in P.budget: [{ id, cat, acct, desc, qty, unit, rate,
     vendor, due, etc (forecast override), notes, done, auto (integration key) }]
   Everything else is P.fin = { v: 2, cats:[{ id, name, group: atl|btl, fringe, color }],
     adds:[{ id, name, type: percent|fixed, value, base, cont }],
     txns:[{ id, date, vendor, desc, lineId ('' | line id | 'add:'+add id), amount, status, ref, method, notes, receipt }],
     versions:[{ id, name, note, date, total, data:{ lines, cats, adds } }], baseline, funding:[{ id, date, source, amount, notes }],
     locked, cents }
   =================================================================== */

const BudgetModel = {
  UNITS: ['Flat', 'Day', 'Week', 'Hour', 'Month', 'Each', 'Item'],
  /** paid / owed / purchase order or booking */
  STATUS: ['Paid', 'Invoiced', 'Committed'],
  STATUS_HELP: { Paid: 'Money has left the account', Invoiced: 'Invoice received, not yet paid', Committed: 'Booked, quoted or ordered — not invoiced yet' },
  COLORS: ['#e5484d', '#e8830c', '#ca8a04', '#1e8e54', '#12a594', '#2468d8', '#7a45c9', '#d6409f', '#8a6d3b', '#687076'],
  ADD_BASES: [['fringe', 'Fringeable categories'], ['all', 'All lines'], ['atl', 'Above the line'], ['btl', 'Below the line'], ['running', 'Everything above (running total)']],
  PAY_METHODS: ['Card', 'Bank transfer', 'Cash', 'Cheque', 'Petty cash', 'Direct debit'],
  /** category sets per production type: [name, group, fringeable] */
  TEMPLATES: {
    film: { label: 'Film & TV', cats: [['Above the line', 'atl', true], ['Cast', 'atl', true], ['Crew', 'btl', true], ['Camera & grip', 'btl'], ['Lighting', 'btl'], ['Art & wardrobe', 'btl'], ['Locations & travel', 'btl'], ['Sound', 'btl'], ['Post-production', 'btl'], ['Insurance & legal', 'btl'], ['Miscellaneous', 'btl']] },
    stage: { label: 'Stage', cats: [['Creative team', 'atl', true], ['Cast', 'atl', true], ['Stage management & crew', 'btl', true], ['Set & scenic', 'btl'], ['Costume', 'btl'], ['Lighting', 'btl'], ['Sound & AV', 'btl'], ['Props', 'btl'], ['Venue & front of house', 'btl'], ['Marketing & PR', 'btl'], ['Rights & licensing', 'btl'], ['Insurance & legal', 'btl'], ['Miscellaneous', 'btl'],
      ['Crew', 'btl', true], ['Camera & grip', 'btl'], ['Art & wardrobe', 'btl'], ['Locations & travel', 'btl']] },
    photo: { label: 'Photo shoot', cats: [['Above the line', 'atl'], ['Cast', 'atl', true], ['Crew', 'btl', true], ['Camera & grip', 'btl'], ['Lighting', 'btl'], ['Art & wardrobe', 'btl'], ['Hair, makeup & styling', 'btl'], ['Locations & travel', 'btl'], ['Post-production', 'btl'], ['Usage & licensing', 'btl'], ['Insurance & legal', 'btl'], ['Miscellaneous', 'btl']] },
    podcast: { label: 'Podcast & Audio', cats: [['Host & Creators', 'atl', true], ['Voice Talent & Guests', 'atl', true], ['Audio Production & Engineering', 'btl', true], ['Sound Design & Foley', 'btl'], ['Original Music & Licensing', 'btl'], ['Studio Hire & Remote Recording', 'btl'], ['Post-Production & Editing', 'btl'], ['Hosting, RSS & Distribution', 'btl'], ['Artwork, Video & Marketing', 'btl'], ['Legal & Administration', 'btl'], ['Miscellaneous', 'btl']] },
    blank: { label: 'Blank', cats: [['Above the line', 'atl', true], ['Below the line', 'btl'], ['Miscellaneous', 'btl']] },
  },
  templateKey: mode => BudgetModel.TEMPLATES[mode] ? mode : 'film',
  /** the templates offered in Setup (av and screenplay are aliases of film) */
  templateList() { return Object.entries(BudgetModel.TEMPLATES).filter(([k]) => !['av', 'screenplay'].includes(k)).map(([key, t]) => ({ key, label: t.label })); },

  /* ---------- numbers ---------- */
  /** "1,200.50", "$30", 7 → a number (0 when not a number) */
  num: v => { const n = +String(v ?? '').replace(/[^0-9.\-]/g, ''); return isFinite(n) ? n : 0; },
  sum: (list, f) => list.reduce((a, x) => a + (+f(x) || 0), 0),
  lineEst: l => BudgetModel.num(l.qty) * BudgetModel.num(l.rate),
  line: (P, id) => (P.budget || []).find(l => l.id === id),
  money(P, n, cents) { const F = P.fin || {}, c = cents === undefined ? F.cents !== false : cents; return ((P.settings && P.settings.currency) || '$') + (+n || 0).toLocaleString(undefined, { minimumFractionDigits: c ? 2 : 0, maximumFractionDigits: c ? 2 : 0 }); },
  short(P, n) { const a = Math.abs(n), s = (P.settings && P.settings.currency) || '$', sign = n < 0 ? '−' : ''; return sign + s + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(1) + 'k' : Math.round(a).toLocaleString()); },
  pct: (a, b) => b ? Math.round(a / b * 100) + '%' : '—',

  /* ---------- the finance record ---------- */
  cats(tpl) { return BudgetModel.TEMPLATES[tpl].cats.map(([name, group, fringe], i) => ({ id: newId(), name, group, fringe: !!fringe, color: BudgetModel.COLORS[i % BudgetModel.COLORS.length] })); },
  adds(fringePct = 0, contPct = 10, fringeName = 'Fringes & payroll') {
    return [{ id: newId(), name: fringeName, type: 'percent', value: fringePct, base: 'fringe', cont: false }, { id: newId(), name: 'Contingency', type: 'percent', value: contPct, base: 'running', cont: true }];
  },
  /** a guess at a category the budget doesn't know yet (integrations create lines by category name) */
  guessCat: (name, i, id) => ({ id, name, group: /^(above|cast|creative)/i.test(name) ? 'atl' : 'btl', fringe: /^(above|cast|crew|creative)/i.test(name), color: BudgetModel.COLORS[i % BudgetModel.COLORS.length] }),
  /**
   * Make sure the project has a valid finance record (for changes): migrates the old flat budget once
   * (opening actuals become expenses) and adds a category for any line in one it doesn't know.
   * o = { fringeName } (the region's word for fringes)
   */
  ensure(P, o = {}) {
    let F = P.fin; const settings = P.settings || {};
    if (!F || F.v !== 2) {
      const old = F || {};
      F = P.fin = { v: 2, cats: BudgetModel.cats(BudgetModel.templateKey(P.mode)), adds: BudgetModel.adds(+settings.fringe || 0, settings.contingency === undefined ? 10 : +settings.contingency || 0, o.fringeName || 'Fringes & payroll'),
        txns: [], versions: [], baseline: '', funding: [], locked: false, cents: true, ...old, v: 2 };
      (P.budget || []).forEach(l => {
        const a = BudgetModel.num(l.actual); if (a) F.txns.push({ id: newId(), date: '', vendor: '', desc: 'Opening actual', lineId: l.id, amount: a, status: 'Paid', ref: '', method: '', notes: 'Carried over from the earlier budget sheet' });
        delete l.actual;
      });
    }
    F.cats = F.cats || []; F.adds = F.adds || []; F.txns = F.txns || []; F.versions = F.versions || []; F.funding = F.funding || [];
    const names = new Set(F.cats.map(c => c.name));
    (P.budget || []).forEach(l => { if (!l.cat) l.cat = 'Miscellaneous'; if (!names.has(l.cat)) { names.add(l.cat); F.cats.push(BudgetModel.guessCat(l.cat, F.cats.length, newId())); } });
    return F;
  },
  /**
   * The finance record for reading, without changing the project: a missing record reads as empty,
   * and lines in unknown categories show under a stand-in category (made real by ensure on the next change).
   */
  view(P) {
    const src = P.fin && P.fin.v === 2 ? P.fin : null, F = Object.assign({ v: 2, cats: [], adds: [], txns: [], versions: [], baseline: '', funding: [], locked: false, cents: true }, src || {});
    ['cats', 'adds', 'txns', 'versions', 'funding'].forEach(k => { F[k] = F[k] || []; });
    const names = new Set(F.cats.map(c => c.name)), extra = [];
    (P.budget || []).forEach(l => { const n = l.cat || 'Miscellaneous'; if (!names.has(n)) { names.add(n); extra.push(BudgetModel.guessCat(n, F.cats.length + extra.length, 'new:' + n)); } });
    if (extra.length) F.cats = [...F.cats, ...extra];
    return F;
  },

  /* ---------- the calculation ---------- */
  calc(P) {
    const N = BudgetModel.num, S = BudgetModel.sum, F = BudgetModel.view(P), budget = P.budget || [], ids = new Set(budget.map(l => l.id)), addIds = new Set(F.adds.map(a => 'add:' + a.id));
    const by = new Map(), unalloc = { paid: 0, invoiced: 0, committed: 0, n: 0 };
    F.txns.forEach(t => {
      const amt = N(t.amount), k = t.status === 'Committed' ? 'committed' : t.status === 'Invoiced' ? 'invoiced' : 'paid';
      if (ids.has(t.lineId) || addIds.has(t.lineId)) { const o = by.get(t.lineId) || { paid: 0, invoiced: 0, committed: 0, n: 0 }; o[k] += amt; o.n++; by.set(t.lineId, o); } else { unalloc[k] += amt; unalloc.n++; }
    });
    const lines = new Map(); budget.forEach(l => {
      const e = BudgetModel.lineEst(l), t = by.get(l.id) || { paid: 0, invoiced: 0, committed: 0, n: 0 }, act = t.paid + t.invoiced, com = t.committed;
      const etc = l.done ? 0 : (l.etc !== undefined && l.etc !== '' && l.etc !== null) ? N(l.etc) : Math.max(0, e - act - com);
      lines.set(l.id, { est: e, act, paid: t.paid, owed: t.invoiced, com, etc, eac: act + com + etc, rem: e - act - com, n: t.n });
    });
    const mk = () => ({ est: 0, act: 0, paid: 0, owed: 0, com: 0, etc: 0, eac: 0, rem: 0, n: 0 }), addTo = (a, b) => { for (const k in a) a[k] += b[k] || 0; return a; };
    const cats = F.cats.map(c => { const ls = budget.filter(l => (l.cat || 'Miscellaneous') === c.name), tot = mk(); ls.forEach(l => addTo(tot, lines.get(l.id))); return { cat: c, lines: ls, ...tot, count: ls.length }; });
    const un = mk(); un.act = unalloc.paid + unalloc.invoiced; un.paid = unalloc.paid; un.owed = unalloc.invoiced; un.com = unalloc.committed; un.eac = un.act + un.com; un.rem = -(un.act + un.com); un.n = unalloc.n;
    const sub = mk(); cats.forEach(c => addTo(sub, c)); addTo(sub, un);
    const grp = g => { const t = mk(); cats.filter(c => c.cat.group === g).forEach(c => addTo(t, c)); return t; };
    const atl = grp('atl'), btl = grp('btl'), fr = mk(); cats.filter(c => c.cat.fringe).forEach(c => addTo(fr, c));
    /* additions, applied in order; "running" includes everything before it */
    const adds = []; let run = { est: sub.est, eac: sub.eac };
    F.adds.forEach(a => {
      const b = a.base === 'all' ? sub : a.base === 'atl' ? atl : a.base === 'btl' ? btl : a.base === 'running' ? run : fr, o = by.get('add:' + a.id) || { paid: 0, invoiced: 0, committed: 0 }, used = o.paid + o.invoiced + o.committed;
      const est = a.type === 'fixed' ? N(a.value) : (b.est || 0) * N(a.value) / 100;
      const eac = a.cont ? used : a.type === 'fixed' ? Math.max(N(a.value), used) : Math.max((b.eac || 0) * N(a.value) / 100, used);
      adds.push({ add: a, est, eac, act: o.paid + o.invoiced, com: o.committed, used, rem: est - used }); run = { est: run.est + est, eac: run.eac + eac };
    });
    const addEst = S(adds, x => x.est), addEac = S(adds, x => x.eac), addAct = S(adds, x => x.act), addCom = S(adds, x => x.com);
    const total = sub.est + addEst, act = sub.act + addAct, com = sub.com + addCom, eac = sub.eac + addEac;
    const cont = adds.filter(x => x.add.cont), contEst = S(cont, x => x.est), contUsed = S(cont, x => x.used), funded = S(F.funding, f => N(f.amount));
    const over = (act + com) > total || eac > total + 0.005, risk = !over && total > 0 && eac > total * 0.95;
    return { F, lines, cats, un, sub, atl, btl, fr, adds, addEst, total, act, paid: sub.paid, com, eac, remaining: total - act - com, variance: total - eac, spentPct: total ? (act / total) * 100 : 0, contEst, contUsed, funded,
      status: over ? 'over' : risk ? 'risk' : total ? 'ok' : 'empty', baseline: BudgetModel.baselineTotal(P) };
  },
  baselineVersion(P) { const F = P.fin; return F && F.baseline && (F.versions || []).find(x => x.id === F.baseline) || null; },
  baselineTotal(P) { const v = BudgetModel.baselineVersion(P); return v ? v.total : null; },
  /** per-category totals of the approved version: { v, m: Map(cat → estimate) } or null */
  baselineByCat(P) { const v = BudgetModel.baselineVersion(P); if (!v) return null; const m = new Map(); v.data.lines.forEach(l => m.set(l.cat, (m.get(l.cat) || 0) + BudgetModel.lineEst(l))); return { v, m }; },
  /** a line is over when its spend and commitments pass its estimate */
  isOver: r => !!r && r.act + r.com > r.est + 0.005 && (r.act + r.com) > 0,

  /* ---------- dashboard ---------- */
  /** categories worth charting: [{ cat, est, spent, com, left, over }] */
  chartRows(c) { return c.cats.filter(x => x.count || x.act || x.com).map(x => ({ cat: x.cat, est: x.est, eac: x.eac, spent: x.act, com: x.com, left: Math.max(0, x.est - x.act - x.com), over: Math.max(0, x.act + x.com - x.est) })); },
  /** lines over budget, biggest overrun first: [{ l, r, by }] */
  overLines(P, c) { return (P.budget || []).map(l => ({ l, r: c.lines.get(l.id) })).filter(x => BudgetModel.isOver(x.r)).map(x => Object.assign(x, { by: x.r.act + x.r.com - x.r.est })).sort((a, b) => b.by - a.by); },
  /** what needs attention: [tone, message, tab]; fm = money formatter */
  alerts(P, c, fm) {
    const F = c.F, out = [], over = BudgetModel.overLines(P, c), S = BudgetModel.sum;
    if (c.un.n) out.push(['warn', `${c.un.n} expense${c.un.n > 1 ? 's' : ''} (${fm(c.un.act + c.un.com)}) not assigned to an account`, 'expenses']);
    if (over.length) out.push(['danger', `${over.length} line${over.length > 1 ? 's' : ''} over budget`, 'budget']);
    if (c.status === 'over') out.push(['danger', `Forecast is ${fm(-c.variance)} over the total budget`, 'top']); else if (c.status === 'risk') out.push(['warn', 'Forecast is within 5% of the total budget', 'top']);
    if (c.funded && c.funded < c.eac) out.push(['warn', `Funding covers ${fm(c.funded)} of the ${fm(c.eac)} forecast`, 'cash']);
    const noEst = (P.budget || []).filter(l => !BudgetModel.lineEst(l)).length; if (noEst) out.push(['', `${noEst} line${noEst > 1 ? 's have' : ' has'} no estimate yet`, 'budget']);
    const owed = F.txns.filter(t => t.status === 'Invoiced'); if (owed.length) out.push(['', `${owed.length} invoice${owed.length > 1 ? 's' : ''} awaiting payment (${fm(S(owed, t => BudgetModel.num(t.amount)))})`, 'expenses']);
    return out;
  },
  /** money paid or owed per vendor, biggest first: [[vendor, amount]] */
  topVendors(F, n = 6) { const m = new Map(); F.txns.filter(t => t.status !== 'Committed').forEach(t => { const k = (t.vendor || '').trim() || '(no vendor)'; m.set(k, (m.get(k) || 0) + BudgetModel.num(t.amount)); }); return [...m].sort((a, b) => b[1] - a[1]).slice(0, n); },

  /* ---------- the top sheet ---------- */
  /** rows for the top sheet (screen and print): { head, rows } — a row is an array (with .strong) or { grp } */
  topSheet(P, c, fm) {
    const bl = BudgetModel.baselineByCat(P), rows = [], head = ['', 'Budget', 'Actual', 'Committed', 'To complete', 'Forecast', 'Variance', 'Spent'], S = BudgetModel.sum; if (bl) head.splice(2, 0, 'Approved');
    const line = (name, o, strong, base) => { const r = [name, fm(o.est), o.act ? fm(o.act) : '', o.com ? fm(o.com) : '', o.etc ? fm(o.etc) : '', fm(o.eac), fm(o.est - o.eac), BudgetModel.pct(o.act, o.est)]; if (bl) r.splice(2, 0, base === undefined ? '' : fm(base)); r.strong = strong; return r; };
    [['atl', 'Above the line', c.atl], ['btl', 'Below the line', c.btl]].forEach(([g, label, tot]) => {
      rows.push({ grp: label }); c.cats.filter(x => x.cat.group === g && (x.count || x.act || x.com)).forEach(x => rows.push(line(x.cat.name, x, false, bl ? bl.m.get(x.cat.name) || 0 : undefined))); rows.push(line(`Total ${label.toLowerCase()}`, tot, true));
    });
    if (c.un.n) rows.push(line('Unallocated expenses', c.un, false));
    rows.push({ grp: 'Totals' }); rows.push(line('Subtotal', c.sub, true, bl ? S([...bl.m.values()], x => x) : undefined));
    c.adds.forEach(x => rows.push(line(`${x.add.name}${x.add.type === 'percent' ? ` (${BudgetModel.num(x.add.value)}%)` : ''}`, { est: x.est, act: x.act, com: x.com, etc: Math.max(0, x.eac - x.used), eac: x.eac }, false)));
    rows.push(line('GRAND TOTAL', { est: c.total, act: c.act, com: c.com, etc: c.eac - c.act - c.com, eac: c.eac }, true, bl ? bl.v.total : undefined));
    return { head, rows, baseline: bl && bl.v };
  },
  detailRows(P, c, fm) {
    const rows = [];
    c.cats.filter(x => x.count).forEach(x => { rows.push({ grp: `${x.cat.name} — ${fm(x.est)}` }); x.lines.forEach(l => { const r = c.lines.get(l.id); rows.push([l.acct || '', l.desc, l.qty, l.unit, fm(BudgetModel.num(l.rate)), fm(r.est), r.act ? fm(r.act) : '', r.com ? fm(r.com) : '', fm(r.rem)]); }); });
    rows.push({ grp: 'Totals' }); rows.push(['', 'Subtotal', '', '', '', fm(c.sub.est), fm(c.sub.act), fm(c.sub.com), fm(c.sub.est - c.sub.act - c.sub.com)]);
    c.adds.forEach(x => rows.push(['', x.add.name, '', '', '', fm(x.est), x.act ? fm(x.act) : '', x.com ? fm(x.com) : '', fm(x.rem)])); rows.push(['', 'TOTAL BUDGET', '', '', '', fm(c.total), fm(c.act), fm(c.com), fm(c.remaining)]);
    return rows;
  },
  costReportRows(P, c, fm) {
    const rows = [];
    c.cats.filter(x => x.count || x.act || x.com).forEach(x => { rows.push({ grp: x.cat.name }); x.lines.forEach(l => { const r = c.lines.get(l.id); if (r.est || r.act || r.com) rows.push([l.acct || '', l.desc, fm(r.est), fm(r.act), fm(r.com), fm(r.etc), fm(r.eac), fm(r.est - r.eac)]); }); rows.push(['', `Total ${x.cat.name}`, fm(x.est), fm(x.act), fm(x.com), fm(x.etc), fm(x.eac), fm(x.est - x.eac)]); });
    rows.push({ grp: 'Grand total' }); rows.push(['', 'TOTAL (incl. additions)', fm(c.total), fm(c.act), fm(c.com), fm(c.eac - c.act - c.com), fm(c.eac), fm(c.variance)]);
    return rows;
  },
  ledgerRows(P, fm) { return [...BudgetModel.view(P).txns].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(t => [t.date, t.vendor, t.desc, BudgetModel.acctLabel(P, t.lineId) || 'Unallocated', fm(BudgetModel.num(t.amount)), t.status, t.ref]); },

  /* ---------- cash flow ---------- */
  /**
   * Spend, commitments, forecast and funding by month (YYYY-MM, then 'undated'). Remaining estimates land on the
   * line's due date, else the month of the last shoot day, else `month` (this month, YYYY-MM).
   */
  cashflow(P, month, c = BudgetModel.calc(P)) {
    const N = BudgetModel.num, F = c.F, months = new Map(), key = d => (d || '').slice(0, 7) || '';
    const cell = k => { if (!months.has(k)) months.set(k, { actual: 0, committed: 0, forecast: 0, funding: 0 }); return months.get(k); };
    const dated = F.txns.filter(t => key(t.date)); F.txns.forEach(t => { const m = cell(key(t.date) || 'undated'), a = N(t.amount); if (t.status === 'Committed') m.committed += a; else m.actual += a; });
    const lastDay = (P.days || []).map(d => d.date).filter(Boolean).sort().pop() || '', fallback = key(lastDay) || month;
    (P.budget || []).forEach(l => { const r = c.lines.get(l.id); if (r && r.etc > 0) cell(key(l.due) || fallback).forecast += r.etc; });
    c.adds.forEach(x => { if (!x.add.cont && x.eac > x.used) cell(fallback).forecast += x.eac - x.used; });
    F.funding.forEach(f => { cell(key(f.date) || 'undated').funding += N(f.amount); });
    const keys = [...months.keys()].filter(k => k !== 'undated').sort(); if (months.has('undated')) keys.push('undated');
    let cumSpend = 0, cumFund = 0; const rows = keys.map(k => { const m = months.get(k); cumSpend += m.actual + m.committed + m.forecast; cumFund += m.funding; return { month: k, ...m, cumSpend, cumFund, balance: cumFund - cumSpend }; });
    return { rows, dated: dated.length };
  },

  /* ---------- budget lines ---------- */
  LINE_FIELDS: ['acct', 'desc', 'qty', 'unit', 'rate', 'vendor', 'due', 'etc', 'notes'],
  newLine: (cat, o = {}) => Object.assign({ id: newId(), cat, acct: '', desc: '', qty: 1, unit: 'Flat', rate: 0 }, o),
  /** a new line in a category, after another line (or at the end) */
  addLine(P, cat, afterId) { const l = BudgetModel.newLine(cat), i = afterId ? P.budget.findIndex(x => x.id === afterId) : -1; if (i >= 0) P.budget.splice(i + 1, 0, l); else P.budget.push(l); return l; },
  /** set a field; an empty forecast override goes back to automatic */
  updateLine(l, k, v) {
    if (!BudgetModel.LINE_FIELDS.includes(k)) return false;
    if (k === 'unit' && !BudgetModel.UNITS.includes(v)) return false;
    if (k === 'etc' && (v === '' || v == null)) { delete l.etc; return true; }
    l[k] = v; return true;
  },
  toggleDone(l) { l.done = !l.done; },
  duplicateLine(P, id) { const i = P.budget.findIndex(x => x.id === id); if (i < 0) return null; const cp = Object.assign({}, P.budget[i], { id: newId() }); delete cp.auto; P.budget.splice(i + 1, 0, cp); return cp; },
  /** swap a line with its neighbour in the same category */
  shiftLine(P, id, d) {
    const l = BudgetModel.line(P, id); if (!l) return false;
    const same = P.budget.filter(x => x.cat === l.cat), o = same[same.indexOf(l) + d]; if (!o) return false;
    const a = P.budget.indexOf(l), b = P.budget.indexOf(o); P.budget[a] = o; P.budget[b] = l; return true;
  },
  moveLine(P, id, cat) { const l = BudgetModel.line(P, id); if (!l) return false; l.cat = cat; return true; },
  /** remove a line; its expenses stay in the ledger, unallocated */
  removeLine(P, id) { const n = P.budget.length; P.budget = P.budget.filter(x => x.id !== id); return P.budget.length < n; },
  /** give every line without one an account code: 1010, 1020… per category (2010… for the second) */
  numberAccounts(P, F) { let n = 0; F.cats.forEach((cat, ci) => P.budget.filter(l => l.cat === cat.name).forEach((l, i) => { if (!l.acct) { l.acct = String((ci + 1) * 1000 + (i + 1) * 10); n++; } })); return n; },
  /** lines matching the budget sheet's search and "over budget only" filters. B = { q, over } */
  lineMatches(l, r, B) { const q = (B.q || '').toLowerCase(); return (!q || `${l.desc || ''} ${l.acct || ''} ${l.vendor || ''} ${l.notes || ''}`.toLowerCase().includes(q)) && (!B.over || BudgetModel.isOver(r)); },

  /* ---------- expenses ---------- */
  TXN_FIELDS: ['date', 'vendor', 'desc', 'lineId', 'amount', 'status', 'ref', 'method', 'notes', 'receipt'],
  newTxn: (o = {}, today = '') => Object.assign({ id: newId(), date: today, vendor: '', desc: '', lineId: '', amount: '', status: 'Paid', ref: '', method: '', notes: '', receipt: '' }, o),
  /** add or update an expense from the expense form; false when it has no amount */
  saveTxn(F, t) {
    const amount = BudgetModel.num(t.amount); if (!amount) return false;
    const rec = Object.assign({}, t, { amount }), ex = F.txns.find(x => x.id === t.id);
    if (ex) Object.assign(ex, rec); else F.txns.push(rec);
    return true;
  },
  updateTxn(t, k, v) { if (!BudgetModel.TXN_FIELDS.includes(k)) return false; if (k === 'status' && !BudgetModel.STATUS.includes(v)) return false; t[k] = v; return true; },
  duplicateTxn(F, id) { const t = F.txns.find(x => x.id === id); if (!t) return null; const c = Object.assign({}, t, { id: newId() }); F.txns.push(c); return c; },
  removeTxns(F, ids) { const s = new Set(ids), n = F.txns.length; F.txns = F.txns.filter(t => !s.has(t.id)); return n - F.txns.length; },
  /** bulk edits on selected expenses */
  assignTxns(F, ids, lineId) { const s = new Set(ids); F.txns.forEach(t => { if (s.has(t.id)) t.lineId = lineId; }); },
  setTxnStatus(F, ids, status) { if (!BudgetModel.STATUS.includes(status)) return false; const s = new Set(ids); F.txns.forEach(t => { if (s.has(t.id)) t.status = status; }); return true; },
  /** "1010 · Camera package", "Contingency (addition)", or '' when unallocated */
  acctLabel(P, lineId) {
    const l = BudgetModel.line(P, lineId); if (l) return `${l.acct ? l.acct + ' ' : ''}${l.desc}`;
    if (String(lineId || '').startsWith('add:')) { const a = ((P.fin && P.fin.adds) || []).find(x => 'add:' + x.id === lineId); return a ? `${a.name} (addition)` : ''; }
    return '';
  },
  /** the expense ledger, filtered and newest first. E = { q, status, cat ('__un' = unallocated), line, month } */
  filterTxns(P, E) {
    const F = BudgetModel.view(P), q = (E.q || '').toLowerCase(), catOf = t => { const l = BudgetModel.line(P, t.lineId); return l ? l.cat : ''; };
    return F.txns.filter(t => (!E.status || t.status === E.status) && (!E.line || t.lineId === E.line) && (!E.cat || catOf(t) === E.cat || (E.cat === '__un' && !catOf(t))) && (!E.month || (t.date || '').startsWith(E.month))
      && (!q || `${t.vendor || ''} ${t.desc || ''} ${t.ref || ''} ${t.notes || ''}`.toLowerCase().includes(q))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },
  txnTotals(list) { const t = k => BudgetModel.sum(list.filter(x => x.status === k), x => BudgetModel.num(x.amount)); return { Paid: t('Paid'), Invoiced: t('Invoiced'), Committed: t('Committed') }; },
  txnMonths(F) { return [...new Set(F.txns.map(t => (t.date || '').slice(0, 7)).filter(Boolean))].sort().reverse(); },
  /** vendors already used: in expenses, people and budget lines */
  vendors(P) { return [...new Set([...BudgetModel.view(P).txns.map(x => x.vendor), ...(P.people || []).map(p => p.name), ...(P.budget || []).map(l => l.vendor)].filter(Boolean))]; },
  /** the account picker: [{ label, options:[{ value, label }] }] */
  accountGroups(P) {
    const F = BudgetModel.view(P), out = [];
    F.cats.forEach(c => { const ls = (P.budget || []).filter(l => (l.cat || 'Miscellaneous') === c.name); if (ls.length) out.push({ label: c.name, options: ls.map(l => ({ value: l.id, label: `${l.acct ? l.acct + ' · ' : ''}${l.desc || '(no description)'}`.slice(0, 70) })) }); });
    if (F.adds.length) out.push({ label: 'Additions & contingency', options: F.adds.map(a => ({ value: 'add:' + a.id, label: a.cont ? `${a.name} (draw)` : a.name })) });
    return out;
  },

  /* ---------- additions ---------- */
  ADD_FIELDS: ['name', 'type', 'value', 'base', 'cont'],
  /** quick additions offered in Setup: [name, type, value, base] — the tax name comes from the region */
  presetAdds: taxName => [[taxName || 'Tax', 'percent', 20, 'running'], ['Insurance', 'percent', 2, 'all'], ['Production / agency fee', 'percent', 15, 'all']],
  addAdd(F, o = {}) { const a = Object.assign({ id: newId(), name: 'New addition', type: 'percent', value: 0, base: 'all', cont: false }, o); F.adds.push(a); return a; },
  updateAdd(a, k, v) {
    if (!BudgetModel.ADD_FIELDS.includes(k)) return false;
    if (k === 'type' && !['percent', 'fixed'].includes(v)) return false;
    if (k === 'base' && !BudgetModel.ADD_BASES.some(b => b[0] === v)) return false;
    a[k] = k === 'cont' ? !!v : v; return true;
  },
  /** move an item one place earlier (d = -1) or later (1) in a list */
  swap(list, i, d) { const j = i + d; if (i < 0 || j < 0 || i >= list.length || j >= list.length) return false; [list[i], list[j]] = [list[j], list[i]]; return true; },
  removeAdd(F, id) { F.adds = F.adds.filter(a => a.id !== id); },
  /** "Contingency (10% of everything above (running total))" */
  addLabel(a) { return `${a.name}${a.type === 'percent' ? ` (${BudgetModel.num(a.value)}% of ${(BudgetModel.ADD_BASES.find(b => b[0] === a.base) || [0, ''])[1].toLowerCase()})` : ''}`; },

  /* ---------- categories ---------- */
  CAT_FIELDS: ['group', 'fringe', 'color'],
  catNameTaken: (F, name, except) => F.cats.some(c => c !== except && c.name.toLowerCase() === String(name).trim().toLowerCase()),
  /** a new category; null when the name is empty or taken */
  addCat(F, name) { name = String(name || '').trim() || `New category ${F.cats.length + 1}`; if (BudgetModel.catNameTaken(F, name)) return null; const c = { id: newId(), name, group: 'btl', fringe: false, color: BudgetModel.COLORS[F.cats.length % BudgetModel.COLORS.length] }; F.cats.push(c); return c; },
  /** rename a category and its lines; false when the name is empty or taken */
  renameCat(P, F, id, name) {
    const c = F.cats.find(x => x.id === id); name = String(name || '').trim(); if (!c || !name || BudgetModel.catNameTaken(F, name, c)) return false;
    P.budget.forEach(l => { if (l.cat === c.name) l.cat = name; }); c.name = name; return true;
  },
  updateCat(c, k, v) { if (!BudgetModel.CAT_FIELDS.includes(k)) return false; if (k === 'group' && !['atl', 'btl'].includes(v)) return false; c[k] = k === 'fringe' ? !!v : v; return true; },
  /** delete a category; its lines move to another (moveTo = that category's name) */
  removeCat(P, F, id, moveTo) {
    const c = F.cats.find(x => x.id === id); if (!c) return false;
    const has = P.budget.some(l => l.cat === c.name); if (has && (!moveTo || moveTo === c.name || !F.cats.some(x => x.name === moveTo))) return false;
    if (has) P.budget.forEach(l => { if (l.cat === c.name) l.cat = moveTo; });
    F.cats = F.cats.filter(x => x !== c); return true;
  },
  /** replace the category list with a template's (colours of same-named categories kept; lines keep their categories) */
  applyTemplate(P, F, key) {
    if (!BudgetModel.TEMPLATES[key]) return false;
    const old = new Map(F.cats.map(x => [x.name, x])); F.cats = BudgetModel.cats(key).map(x => Object.assign(x, old.get(x.name) ? { color: old.get(x.name).color } : {}));
    BudgetModel.ensure(P); return true;
  },

  /* ---------- funding ---------- */
  FUND_FIELDS: ['date', 'source', 'amount', 'notes'],
  addFunding(F) { const f = { id: newId(), date: '', source: '', amount: '', notes: '' }; F.funding.push(f); return f; },
  updateFunding(f, k, v) { if (!BudgetModel.FUND_FIELDS.includes(k)) return false; f[k] = v; return true; },
  removeFunding(F, id) { F.funding = F.funding.filter(f => f.id !== id); },

  /* ---------- versions (snapshots of lines, categories and additions) ---------- */
  /** o = { name, note, baseline, date (YYYY-MM-DD), total } */
  snapshot(P, F, o = {}) {
    const copy = x => JSON.parse(JSON.stringify(x));
    const v = { id: newId(), name: o.name || 'Version ' + (F.versions.length + 1), note: o.note || '', date: o.date || '', total: o.total != null ? o.total : BudgetModel.calc(P).total, data: { lines: copy(P.budget), cats: copy(F.cats), adds: copy(F.adds) } };
    F.versions.push(v); if (o.baseline) F.baseline = v.id; return v;
  },
  diff(P, v) {
    const cur = new Map(P.budget.map(l => [l.id, l])), old = new Map(v.data.lines.map(l => [l.id, l])), out = { added: [], removed: [], changed: [] };
    cur.forEach((l, id) => { const o = old.get(id); if (!o) out.added.push(l); else if (BudgetModel.lineEst(o) !== BudgetModel.lineEst(l) || o.cat !== l.cat || o.desc !== l.desc) out.changed.push({ now: l, was: o }); });
    old.forEach((o, id) => { if (!cur.has(id)) out.removed.push(o); });
    return out;
  },
  /** estimates per category, a version against now: [{ cat, was, now, change }] plus totals */
  compare(P, v) {
    const was = new Map(), now = new Map(), add = (m, l) => m.set(l.cat, (m.get(l.cat) || 0) + BudgetModel.lineEst(l));
    v.data.lines.forEach(l => add(was, l)); P.budget.forEach(l => add(now, l));
    const rows = [...new Set([...was.keys(), ...now.keys()])].map(cat => ({ cat, was: was.get(cat) || 0, now: now.get(cat) || 0, change: (now.get(cat) || 0) - (was.get(cat) || 0) }));
    const tw = BudgetModel.sum(rows, r => r.was), tn = BudgetModel.sum(rows, r => r.now);
    return { rows, was: tw, now: tn, change: tn - tw, diff: BudgetModel.diff(P, v) };
  },
  /** go back to a version (a safety copy of today's budget is saved first). o = { date } */
  restore(P, F, id, o = {}) {
    const v = F.versions.find(x => x.id === id); if (!v) return false;
    BudgetModel.snapshot(P, F, { name: `Before restoring “${v.name}”`, date: o.date });
    const copy = x => JSON.parse(JSON.stringify(x)); P.budget = copy(v.data.lines); F.cats = copy(v.data.cats); F.adds = copy(v.data.adds); return true;
  },
  toggleBaseline(F, id) { F.baseline = F.baseline === id ? '' : id; },
  removeVersion(F, id) { F.versions = F.versions.filter(v => v.id !== id); if (F.baseline === id) F.baseline = ''; },

  /* ---------- CSV ---------- */
  linesCsv(P, c = BudgetModel.calc(P)) {
    return [['Account', 'Category', 'Description', 'Qty', 'Unit', 'Rate', 'Estimate', 'Actual', 'Committed', 'Remaining', 'Vendor', 'Notes'],
      ...(P.budget || []).map(l => { const r = c.lines.get(l.id); return [l.acct || '', l.cat, l.desc, l.qty, l.unit, l.rate, r.est, r.act, r.com, r.rem, l.vendor || '', l.notes || '']; })];
  },
  txnsCsv(P) {
    return [['Date', 'Vendor', 'Description', 'Account', 'Category', 'Amount', 'Status', 'Reference', 'Method', 'Notes'],
      ...BudgetModel.view(P).txns.map(t => { const l = BudgetModel.line(P, t.lineId); return [t.date, t.vendor, t.desc, l ? l.acct || l.desc : (String(t.lineId || '').startsWith('add:') ? 'Contingency / addition' : ''), l ? l.cat : '', t.amount, t.status, t.ref, t.method, t.notes]; })];
  },
  _col(head, ...k) { return head.findIndex(h => k.some(x => h.includes(x))); },
  /** budget lines from CSV rows (header names matched loosely: Account, Category, Description, Qty, Unit, Rate / Total) */
  parseLines(rows) {
    if (rows.length < 2) return []; const N = BudgetModel.num, head = rows[0].map(x => String(x).trim().toLowerCase()), ix = (...k) => BudgetModel._col(head, ...k), cell = (r, i) => String(r[i] == null ? '' : r[i]);
    const a = ix('acc', 'code'), cat = ix('categ', 'section', 'group'), d = ix('desc', 'item', 'name'), q = ix('qty', 'quant'), u = ix('unit'), r = ix('rate', 'price', 'cost'), tot = ix('total', 'amount', 'estimate');
    return rows.slice(1).map(row => ({ id: newId(), acct: a >= 0 ? cell(row, a).trim() : '', cat: cat >= 0 && cell(row, cat).trim() ? cell(row, cat).trim() : 'Miscellaneous', desc: d >= 0 ? cell(row, d).trim() : '',
      qty: q >= 0 && cell(row, q) !== '' ? N(row[q]) : 1, unit: u >= 0 && BudgetModel.UNITS.includes(cell(row, u).trim()) ? cell(row, u).trim() : 'Flat', rate: r >= 0 ? N(row[r]) : tot >= 0 ? N(row[tot]) : 0 })).filter(l => l.desc || l.rate);
  },
  /** expenses from a bank / card statement's CSV rows: Date, Description or Payee, Amount (negative = spend is fine) */
  parseTxns(rows) {
    if (rows.length < 2) return []; const head = rows[0].map(x => String(x).trim().toLowerCase()), ix = (...k) => BudgetModel._col(head, ...k);
    const dt = ix('date'), ds = ix('desc', 'payee', 'memo', 'narr', 'detail', 'merchant'), vd = ix('vendor', 'payee', 'merchant'), am = ix('amount', 'debit', 'value', 'total'), ref = ix('ref', 'invoice', 'receipt');
    const iso = s => { s = String(s || '').trim(); const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; } return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; };
    return rows.slice(1).map(r => ({ id: newId(), date: dt >= 0 ? iso(r[dt]) : '', vendor: vd >= 0 && vd !== ds ? r[vd] || '' : '', desc: ds >= 0 ? r[ds] || '' : '', lineId: '', amount: Math.abs(am >= 0 ? BudgetModel.num(r[am]) : 0), status: 'Paid', ref: ref >= 0 ? r[ref] || '' : '', method: 'Statement import', notes: '' })).filter(t => t.amount);
  },

  /* ---------- costs from the rest of the production ---------- */
  /**
   * Update the automatic lines: cast, crew and locations (o.fromRates(P) → { cast, crew, loc }), prop and wardrobe
   * totals, and rented gear (o.gearCats = { gear category: budget category }). Returns the counts.
   */
  syncProduction(P, o = {}) {
    const N = BudgetModel.num, r = o.fromRates ? o.fromRates(P) : { cast: 0, crew: 0, loc: 0 }; let items = 0, gear = 0;
    [['props', 'Props (from Props list)'], ['wardrobe', 'Wardrobe (from Wardrobe list)']].forEach(([kind, desc]) => {
      const tot = BudgetModel.sum(P[kind] || [], x => N(x.cost)); if (!tot) return; const line = P.budget.find(l => l.cat === 'Art & wardrobe' && l.desc === desc);
      if (line) Object.assign(line, { qty: 1, unit: 'Flat', rate: tot }); else P.budget.push({ id: newId(), cat: 'Art & wardrobe', desc, qty: 1, unit: 'Flat', rate: tot }); items++;
    });
    [...((P.podcast && P.podcast.gear) || []), ...((P.photo && P.photo.gear) || [])].filter(g => N(g.rate) > 0).forEach(g => {
      const days = N(g.days) || (P.days || []).length || 1, key = 'gear:' + g.id; let l = P.budget.find(x => x.auto === key);
      if (!l) { l = { id: newId(), auto: key }; P.budget.push(l); }
      Object.assign(l, { cat: (o.gearCats && o.gearCats[g.cat]) || 'Miscellaneous', desc: `${g.name}${g.source && g.source !== 'Owned' ? ' (' + g.source + ')' : ''}`, qty: (N(g.qty) || 1) * days, unit: 'Day', rate: N(g.rate) });
      gear++;
    });
    BudgetModel.ensure(P); return Object.assign({}, r, { items, gear });
  },

  /* ---------- portfolio (every project) ---------- */
  STATUS_LABEL: { ok: ['On track', 'ok'], risk: ['At risk', 'warn'], over: ['Over budget', 'danger'], empty: ['No budget', ''] },
  /** every project's totals, biggest budget first: [{ p, c, cur }] */
  portfolio(projects) { return projects.map(p => ({ p, c: BudgetModel.calc(p), cur: (p.settings && p.settings.currency) || '$' })).sort((a, b) => b.c.total - a.c.total); },
  /** totals per currency: [{ cur, n, total, act, com, eac }] */
  portfolioTotals(rows) { return [...new Set(rows.map(r => r.cur))].map(cur => { const rs = rows.filter(r => r.cur === cur), t = k => BudgetModel.sum(rs, r => r.c[k]); return { cur, n: rs.length, total: t('total'), act: t('act'), com: t('com'), eac: t('eac') }; }); },
};
BudgetModel.TEMPLATES.av = { label: 'Video / AV', cats: BudgetModel.TEMPLATES.film.cats };
BudgetModel.TEMPLATES.screenplay = BudgetModel.TEMPLATES.film;
