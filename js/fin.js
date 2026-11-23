'use strict';
/* ===================================================================
   Finance engine — categories, budget lines, expenses (actuals and
   commitments), percentage / fixed additions (fringes, contingency,
   tax, fees), forecast, cash flow, versions and portfolio totals.
   Budget lines stay in P.budget; everything else lives in P.fin.
   =================================================================== */
const finNum = v => { const n = +String(v ?? '').replace(/[^0-9.\-]/g, ''); return isFinite(n) ? n : 0; };
const FIN_UNITS = ['Flat', 'Day', 'Week', 'Hour', 'Month', 'Each', 'Item'];
const FIN_STATUS = ['Paid', 'Invoiced', 'Committed'];            // paid / owed / purchase order or booking
const FIN_STATUS_HELP = { Paid: 'Money has left the account', Invoiced: 'Invoice received, not yet paid', Committed: 'Booked, quoted or ordered — not invoiced yet' };
const FIN_COLORS = ['#e5484d', '#e8830c', '#ca8a04', '#1e8e54', '#12a594', '#2468d8', '#7a45c9', '#d6409f', '#8a6d3b', '#687076'];
const ADD_BASES = [['fringe', 'Fringeable categories'], ['all', 'All lines'], ['atl', 'Above the line'], ['btl', 'Below the line'], ['running', 'Everything above (running total)']];

/* category sets per production type: [name, group, fringeable] */
const FIN_TEMPLATES = {
  film: { label: 'Film & TV', cats: [['Above the line', 'atl', true], ['Cast', 'atl', true], ['Crew', 'btl', true], ['Camera & grip', 'btl'], ['Lighting', 'btl'], ['Art & wardrobe', 'btl'], ['Locations & travel', 'btl'], ['Sound', 'btl'], ['Post-production', 'btl'], ['Insurance & legal', 'btl'], ['Miscellaneous', 'btl']] },
  stage: { label: 'Stage', cats: [['Creative team', 'atl', true], ['Cast', 'atl', true], ['Stage management & crew', 'btl', true], ['Set & scenic', 'btl'], ['Costume', 'btl'], ['Lighting', 'btl'], ['Sound & AV', 'btl'], ['Props', 'btl'], ['Venue & front of house', 'btl'], ['Marketing & PR', 'btl'], ['Rights & licensing', 'btl'], ['Insurance & legal', 'btl'], ['Miscellaneous', 'btl'],
    ['Crew', 'btl', true], ['Camera & grip', 'btl'], ['Art & wardrobe', 'btl'], ['Locations & travel', 'btl']] },
  photo: { label: 'Photo shoot', cats: [['Above the line', 'atl'], ['Cast', 'atl', true], ['Crew', 'btl', true], ['Camera & grip', 'btl'], ['Lighting', 'btl'], ['Art & wardrobe', 'btl'], ['Hair, makeup & styling', 'btl'], ['Locations & travel', 'btl'], ['Post-production', 'btl'], ['Usage & licensing', 'btl'], ['Insurance & legal', 'btl'], ['Miscellaneous', 'btl']] },
  podcast: { label: 'Podcast & Audio', cats: [['Host & Creators', 'atl', true], ['Voice Talent & Guests', 'atl', true], ['Audio Production & Engineering', 'btl', true], ['Sound Design & Foley', 'btl'], ['Original Music & Licensing', 'btl'], ['Studio Hire & Remote Recording', 'btl'], ['Post-Production & Editing', 'btl'], ['Hosting, RSS & Distribution', 'btl'], ['Artwork, Video & Marketing', 'btl'], ['Legal & Administration', 'btl'], ['Miscellaneous', 'btl']] },
  blank: { label: 'Blank', cats: [['Above the line', 'atl', true], ['Below the line', 'btl'], ['Miscellaneous', 'btl']] },
};
FIN_TEMPLATES.av = { label: 'Video / AV', cats: FIN_TEMPLATES.film.cats };
FIN_TEMPLATES.screenplay = FIN_TEMPLATES.film;
const templateKey = mode => FIN_TEMPLATES[mode] ? mode : 'film';

function finCats(tpl) { return FIN_TEMPLATES[tpl].cats.map(([name, group, fringe], i) => ({ id: uid(), name, group, fringe: !!fringe, color: FIN_COLORS[i % FIN_COLORS.length] })); }
function finAdds(fringePct = 0, contPct = 10, fringeName = 'Fringes & payroll') {
  return [{ id: uid(), name: fringeName, type: 'percent', value: fringePct, base: 'fringe', cont: false }, { id: uid(), name: 'Contingency', type: 'percent', value: contPct, base: 'running', cont: true }];
}
/* make sure the project has a valid finance record; migrate the old flat budget once */
function finEnsure(P) {
  let F = P.fin;
  if (!F || F.v !== 2) {
    const old = F || {}, tpl = templateKey(P.mode), cats = finCats(tpl);
    F = P.fin = { v: 2, cats, adds: finAdds(+P.settings.fringe || 0, P.settings.contingency === undefined ? 10 : +P.settings.contingency || 0, ((typeof REGIONS !== 'undefined' && REGIONS[P.settings.region]) || { terms: { fringes: 'Fringes & payroll' } }).terms.fringes), txns: [], versions: [], baseline: '', funding: [], locked: false, cents: true, ...old, v: 2 };
    (P.budget || []).forEach(l => {                            // opening actuals become expenses
      const a = finNum(l.actual); if (a) { F.txns.push({ id: uid(), date: '', vendor: '', desc: 'Opening actual', lineId: l.id, amount: a, status: 'Paid', ref: '', method: '', notes: 'Carried over from the earlier budget sheet' }); }
      delete l.actual;
    });
  }
  F.cats = F.cats || []; F.adds = F.adds || []; F.txns = F.txns || []; F.versions = F.versions || []; F.funding = F.funding || [];
  /* any line in a category we don't know yet gets that category (integrations create lines by name) */
  const names = new Set(F.cats.map(c => c.name));
  (P.budget || []).forEach(l => { if (!l.cat) l.cat = 'Miscellaneous'; if (!names.has(l.cat)) { names.add(l.cat); F.cats.push({ id: uid(), name: l.cat, group: /^(above|cast|creative)/i.test(l.cat) ? 'atl' : 'btl', fringe: /^(above|cast|crew|creative)/i.test(l.cat), color: FIN_COLORS[F.cats.length % FIN_COLORS.length] }); } });
  return F;
}
const finLine = (P, id) => (P.budget || []).find(l => l.id === id);
const lineEst = l => finNum(l.qty) * finNum(l.rate);

/* ---------- the calculation ---------- */
function finCalc(P) {
  const F = finEnsure(P), ids = new Set((P.budget || []).map(l => l.id)), addIds = new Set(F.adds.map(a => 'add:' + a.id));
  const by = new Map(), unalloc = { paid: 0, invoiced: 0, committed: 0, n: 0 };
  F.txns.forEach(t => {
    const amt = finNum(t.amount), k = t.status === 'Committed' ? 'committed' : t.status === 'Invoiced' ? 'invoiced' : 'paid';
    if (ids.has(t.lineId) || addIds.has(t.lineId)) { const o = by.get(t.lineId) || { paid: 0, invoiced: 0, committed: 0, n: 0 }; o[k] += amt; o.n++; by.set(t.lineId, o); } else { unalloc[k] += amt; unalloc.n++; }
  });
  const lines = new Map(); (P.budget || []).forEach(l => {
    const e = lineEst(l), t = by.get(l.id) || { paid: 0, invoiced: 0, committed: 0, n: 0 }, act = t.paid + t.invoiced, com = t.committed;
    const etc = l.done ? 0 : (l.etc !== undefined && l.etc !== '' && l.etc !== null) ? finNum(l.etc) : Math.max(0, e - act - com);
    lines.set(l.id, { est: e, act, paid: t.paid, owed: t.invoiced, com, etc, eac: act + com + etc, rem: e - act - com, n: t.n });
  });
  const mk = () => ({ est: 0, act: 0, paid: 0, owed: 0, com: 0, etc: 0, eac: 0, rem: 0, n: 0 }), addTo = (a, b) => { for (const k in a) a[k] += b[k] || 0; return a; };
  const cats = F.cats.map(c => { const ls = (P.budget || []).filter(l => l.cat === c.name), tot = mk(); ls.forEach(l => addTo(tot, lines.get(l.id))); return { cat: c, lines: ls, ...tot, count: ls.length }; });
  const un = mk(); un.act = unalloc.paid + unalloc.invoiced; un.paid = unalloc.paid; un.owed = unalloc.invoiced; un.com = unalloc.committed; un.eac = un.act + un.com; un.rem = -(un.act + un.com); un.n = unalloc.n;
  const sub = mk(); cats.forEach(c => addTo(sub, c)); addTo(sub, un);
  const grp = g => { const t = mk(); cats.filter(c => c.cat.group === g).forEach(c => addTo(t, c)); return t; };
  const atl = grp('atl'), btl = grp('btl'), fr = mk(); cats.filter(c => c.cat.fringe).forEach(c => addTo(fr, c));
  /* additions, applied in order; "running" includes everything before it */
  const adds = []; let run = { est: sub.est, eac: sub.eac };
  F.adds.forEach(a => {
    const b = a.base === 'all' ? sub : a.base === 'atl' ? atl : a.base === 'btl' ? btl : a.base === 'running' ? run : fr, o = by.get('add:' + a.id) || { paid: 0, invoiced: 0, committed: 0 }, used = o.paid + o.invoiced + o.committed;
    const est = a.type === 'fixed' ? finNum(a.value) : (b.est || 0) * finNum(a.value) / 100;
    const eac = a.cont ? used : a.type === 'fixed' ? Math.max(finNum(a.value), used) : Math.max((b.eac || 0) * finNum(a.value) / 100, used);
    adds.push({ add: a, est, eac, act: o.paid + o.invoiced, com: o.committed, used, rem: est - used }); run = { est: run.est + est, eac: run.eac + eac };
  });
  const addEst = sum(adds, x => x.est), addEac = sum(adds, x => x.eac), addAct = sum(adds, x => x.act), addCom = sum(adds, x => x.com);
  const total = sub.est + addEst, act = sub.act + addAct, com = sub.com + addCom, eac = sub.eac + addEac;
  const cont = adds.filter(x => x.add.cont), contEst = sum(cont, x => x.est), contUsed = sum(cont, x => x.used);
  const funded = sum(F.funding, f => finNum(f.amount));
  const over = (act + com) > total || eac > total + 0.005, risk = !over && total > 0 && eac > total * 0.95;
  return { F, lines, cats, un, sub, atl, btl, fr, adds, addEst, total, act, paid: sub.paid + adds.reduce((a, x) => a, 0), com, eac, remaining: total - act - com, variance: total - eac, spentPct: total ? (act / total) * 100 : 0, contEst, contUsed, funded, status: over ? 'over' : risk ? 'risk' : total ? 'ok' : 'empty', baseline: finBaselineTotal(P) };
}
function finBaselineTotal(P) {
  const F = P.fin; if (!F || !F.baseline) return null; const v = F.versions.find(x => x.id === F.baseline); return v ? v.total : null;
}
const finMoney = (P, n, cents) => { const F = P.fin || {}, c = cents === undefined ? F.cents !== false : cents; return ((P.settings && P.settings.currency) || '$') + (+n || 0).toLocaleString(undefined, { minimumFractionDigits: c ? 2 : 0, maximumFractionDigits: c ? 2 : 0 }); };
const finShort = (P, n) => { const a = Math.abs(n), s = (P.settings && P.settings.currency) || '$', sign = n < 0 ? '−' : ''; return sign + s + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(1) + 'k' : Math.round(a).toLocaleString()); };

/* ---------- versions (snapshots of lines, categories and additions) ---------- */
function finSnapshot(P, name, note, baseline) {
  const F = finEnsure(P), c = finCalc(P), v = { id: uid(), name: name || 'Version ' + (F.versions.length + 1), note: note || '', date: new Date().toISOString().slice(0, 10), total: c.total, data: { lines: JSON.parse(JSON.stringify(P.budget)), cats: JSON.parse(JSON.stringify(F.cats)), adds: JSON.parse(JSON.stringify(F.adds)) } };
  F.versions.push(v); if (baseline) F.baseline = v.id; Store.touch(); return v;
}
function finDiff(P, v) {
  const cur = new Map(P.budget.map(l => [l.id, l])), old = new Map(v.data.lines.map(l => [l.id, l])), out = { added: [], removed: [], changed: [] };
  cur.forEach((l, id) => { const o = old.get(id); if (!o) out.added.push(l); else if (lineEst(o) !== lineEst(l) || o.cat !== l.cat || o.desc !== l.desc) out.changed.push({ now: l, was: o }); });
  old.forEach((o, id) => { if (!cur.has(id)) out.removed.push(o); });
  return out;
}
function finRestore(P, v) {
  const F = finEnsure(P); P.budget = JSON.parse(JSON.stringify(v.data.lines)); F.cats = JSON.parse(JSON.stringify(v.data.cats)); F.adds = JSON.parse(JSON.stringify(v.data.adds)); Store.touch();
}

/* ---------- cash flow ---------- */
function finCashflow(P) {
  const F = finEnsure(P), c = finCalc(P), months = new Map(), key = d => (d || '').slice(0, 7) || '';
  const cell = k => { if (!months.has(k)) months.set(k, { actual: 0, committed: 0, forecast: 0, funding: 0 }); return months.get(k); };
  const dated = F.txns.filter(t => key(t.date)); F.txns.forEach(t => { const k = key(t.date) || 'undated'; const m = cell(k), a = finNum(t.amount); if (t.status === 'Committed') m.committed += a; else m.actual += a; });
  /* remaining estimates land on the line's due date, else the last shoot day, else the current month */
  const lastDay = P.days.map(d => d.date).filter(Boolean).sort().pop() || '', fallback = key(lastDay) || new Date().toISOString().slice(0, 7);
  (P.budget || []).forEach(l => { const r = c.lines.get(l.id); if (r && r.etc > 0) cell(key(l.due) || fallback).forecast += r.etc; });
  c.adds.forEach(x => { if (!x.add.cont && x.eac > x.used) cell(fallback).forecast += x.eac - x.used; });
  F.funding.forEach(f => { cell(key(f.date) || 'undated').funding += finNum(f.amount); });
  const keys = [...months.keys()].filter(k => k !== 'undated').sort(); if (months.has('undated')) keys.push('undated');
  let cumSpend = 0, cumFund = 0; const rows = keys.map(k => { const m = months.get(k); cumSpend += m.actual + m.committed + m.forecast; cumFund += m.funding; return { month: k, ...m, cumSpend, cumFund, balance: cumFund - cumSpend }; });
  return { rows, dated: dated.length };
}

/* ---------- CSV ---------- */
function finLinesCSV(P) {
  const c = finCalc(P); return toCSV([['Account', 'Category', 'Description', 'Qty', 'Unit', 'Rate', 'Estimate', 'Actual', 'Committed', 'Remaining', 'Vendor', 'Notes'], ...P.budget.map(l => { const r = c.lines.get(l.id); return [l.acct || '', l.cat, l.desc, l.qty, l.unit, l.rate, r.est, r.act, r.com, r.rem, l.vendor || '', l.notes || '']; })]);
}
function finTxnsCSV(P) {
  return toCSV([['Date', 'Vendor', 'Description', 'Account', 'Category', 'Amount', 'Status', 'Reference', 'Method', 'Notes'], ...P.fin.txns.map(t => { const l = finLine(P, t.lineId); return [t.date, t.vendor, t.desc, l ? l.acct || l.desc : (String(t.lineId || '').startsWith('add:') ? 'Contingency / addition' : ''), l ? l.cat : '', t.amount, t.status, t.ref, t.method, t.notes]; })]);
}
/* read a budget CSV: Account, Category, Description, Qty, Unit, Rate (header names are matched loosely) */
function finParseLines(text) {
  const rows = parseCSV(text); if (rows.length < 2) return []; const head = rows[0].map(x => x.trim().toLowerCase()), ix = (...k) => head.findIndex(h => k.some(x => h.includes(x)));
  const a = ix('acc', 'code'), cat = ix('categ', 'section', 'group'), d = ix('desc', 'item', 'name'), q = ix('qty', 'quant'), u = ix('unit'), r = ix('rate', 'price', 'cost'), tot = ix('total', 'amount', 'estimate');
  return rows.slice(1).map(row => { const qty = q >= 0 ? finNum(row[q]) : 1, rate = r >= 0 ? finNum(row[r]) : tot >= 0 ? finNum(row[tot]) : 0; return { id: uid(), acct: a >= 0 ? row[a].trim() : '', cat: cat >= 0 && row[cat].trim() ? row[cat].trim() : 'Miscellaneous', desc: d >= 0 ? row[d].trim() : '', qty: q >= 0 && row[q] !== '' ? qty : 1, unit: u >= 0 && FIN_UNITS.includes(row[u].trim()) ? row[u].trim() : 'Flat', rate: r >= 0 || tot >= 0 ? rate : 0 }; }).filter(l => l.desc || l.rate);
}
/* bank / card statements: Date, Description or Payee, Amount (negative = spend is fine) */
function finParseTxns(text) {
  const rows = parseCSV(text); if (rows.length < 2) return []; const head = rows[0].map(x => x.trim().toLowerCase()), ix = (...k) => head.findIndex(h => k.some(x => h.includes(x)));
  const dt = ix('date'), ds = ix('desc', 'payee', 'memo', 'narr', 'detail', 'merchant'), vd = ix('vendor', 'payee', 'merchant'), am = ix('amount', 'debit', 'value', 'total'), ref = ix('ref', 'invoice', 'receipt');
  const iso = s => { s = (s || '').trim(); const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; } return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; };
  return rows.slice(1).map(r => ({ id: uid(), date: dt >= 0 ? iso(r[dt]) : '', vendor: vd >= 0 && vd !== ds ? r[vd] : '', desc: ds >= 0 ? r[ds] : '', lineId: '', amount: Math.abs(am >= 0 ? finNum(r[am]) : 0), status: 'Paid', ref: ref >= 0 ? r[ref] : '', method: 'Statement import', notes: '' })).filter(t => t.amount);
}

/* ---------- pulling costs from the rest of the production ---------- */
function finSyncProduction(P) {
  const r = buildBudgetFromRates(P); let items = 0, gear = 0;
  [['props', 'Props (from Props list)'], ['wardrobe', 'Wardrobe (from Wardrobe list)']].forEach(([kind, desc]) => {
    const tot = sum(P[kind], x => finNum(x.cost) * (x.sceneIds ? 1 : 1)); if (!tot) return; const line = P.budget.find(l => l.cat === 'Art & wardrobe' && l.desc === desc);
    if (line) { line.qty = 1; line.unit = 'Flat'; line.rate = tot; } else P.budget.push({ id: uid(), cat: 'Art & wardrobe', desc, qty: 1, unit: 'Flat', rate: tot }); items++;
  });
  const gList = [
    ...((P.podcast && P.podcast.gear) || []),
    ...((P.photo && P.photo.gear) || [])
  ];
  gList.filter(g => finNum(g.rate) > 0).forEach(g => {
    const days = finNum(g.days) || P.days.length || 1, key = 'gear:' + g.id;
    let l = P.budget.find(x => x.auto === key);
    if (!l) { l = { id: uid(), auto: key }; P.budget.push(l); }
    const cat = (typeof PODCAST_GEAR_BUDGET !== 'undefined' && PODCAST_GEAR_BUDGET[g.cat]) || (typeof GEAR_BUDGET !== 'undefined' && GEAR_BUDGET[g.cat]) || 'Miscellaneous';
    Object.assign(l, { cat, desc: `${g.name}${g.source && g.source !== 'Owned' ? ' (' + g.source + ')' : ''}`, qty: (finNum(g.qty) || 1) * days, unit: 'Day', rate: finNum(g.rate) });
    gear++;
  });
  finEnsure(P); Store.touch(); return { ...r, items, gear };
}

/* ---------- portfolio (every project) ---------- */
function finPortfolio() {
  return Object.values(Store.projects).map(p => { const c = finCalc(p); return { p, c, cur: (p.settings && p.settings.currency) || '$' }; });
}
