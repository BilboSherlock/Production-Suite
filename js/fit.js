'use strict';
/* ===================================================================
   Fit — keeps every screen on the screen, with no scrollbars.

   Smart tables: every table.tbl is laid out to the width it has.
     · Columns are sized from their content. When they do not all fit,
       the least important ones fold into the row: a chevron at the end
       of the row opens it and shows them underneath, labelled.
     · Rows are paged to the height there is room for, with a pager in
       the table's footer (‹ ›, swipe on a touch screen, or Show all).
       A row that is added, searched for or focused is paged to.
     · Group rows (tr.grp) fold and unfold.
     · Wide day-by-day grids (the DOOD report) page their columns instead.
     A table can steer this: data-fit="off" on the table leaves it alone,
     data-fit="cols" pages its columns, data-fit="nopage" never pages rows;
     data-pri="0…100" on a header cell says how long a column stays
     (higher stays longer).

   Scroll hints: a panel that still has more than fits (a long script,
   a call sheet) scrolls by touch, wheel or keyboard with no bar; its
   edges fade where there is more to see.

   The rail folds tighter when its sections would not fit.

   Views redraw with morph(), which drops anything added here; a
   MutationObserver puts it back before the next paint. State (which
   page, which rows are open, which groups are folded) lives here, per
   table, so redraws keep it.
   =================================================================== */
const Fit = (() => {
  const S = new WeakMap();          // table → state
  const LOW = /note|comment|e-?mail|agent|address|tag|equip|lens|source|vendor|storage|care|phone|contact|link|ref\b|frame|thumb|size|look|remark|detail|paperwork|union/i;
  const HIGH = /^(#|no\.?|name|title|item|shot|scene|sc\.?|role|actor|character|cast|status|total|amount|cost|date|day|cue|take|who|person|task)$/i;
  const FORM = 'input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]), select, textarea';
  let mo = null, busy = false, raf = 0;
  const touch = () => !!document.documentElement.dataset.touch;

  const state = t => { let s = S.get(t); if (!s) { s = { page: 0, cpage: 0, open: new Set(), shut: new Set(), all: false, keys: null, sig: '', m: null }; S.set(t, s); } return s; };
  const px = v => (/px$/.test(v || '') ? parseFloat(v) : 0);
  const rowKey = (tr, i) => tr.dataset.key || ('#' + i);
  const isGrp = tr => tr.classList.contains('grp');
  const textOf = el => (el.textContent || '').replace(/\s+/g, ' ').trim();

  /* the element that scrolls this table (or the window) */
  function scroller(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.matches('.rep-wrap, .fin-wrap, .tbl-wrap')) continue;      /* sideways-scroll wrappers grow with the table */
      const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return p; }
    return null;
  }

  /* ---------- columns ---------- */
  function headCells(t) {
    const hr = t.tHead && [...t.tHead.rows].filter(r => !r.classList.contains('fit-pg')).pop();
    if (hr) return [...hr.cells].filter(c => !c.classList.contains('fit-xh'));
    const r = [...t.querySelectorAll(':scope > tbody > tr')].find(r => !isGrp(r) && [...r.cells].every(c => c.colSpan === 1));
    return r ? [...r.cells].filter(c => !c.classList.contains('fit-xc')) : [];
  }
  /* each column's comfortable width and how far it may shrink → [{want, min, pri, label, form}] */
  function measure(t, heads) {
    const was = t.classList.contains('fit'); t.classList.remove('fit'); t.classList.add('fit-measure');
    const rows = [...t.querySelectorAll(':scope > tbody > tr:not(.grp)')].slice(0, 60);
    const cols = heads.map((th, i) => {
      const label = textOf(th);
      let want = th.offsetWidth, form = false, long = false, tiny = true, action = !label, floor = px(th.style.minWidth) || px(th.style.width);
      rows.forEach(r => { const c = r.cells[i]; if (!c || c.colSpan !== 1) return;
        floor = Math.max(floor, px(c.style.minWidth));
        const f = c.querySelector(FORM); if (f) { form = true; if (f.tagName === 'TEXTAREA') long = true; floor = Math.max(floor, px(f.style.minWidth)); }
        if (c.offsetWidth > 46) tiny = false;
        if (action && textOf(c) && !c.querySelector('button, .icon-btn')) action = false; });
      if (!rows.length) tiny = false;
      want = Math.min(Math.max(want, 28, Math.min(floor, 300)), long ? 360 : 300);
      let min = want <= 116 ? want : Math.min(200, Math.max(116, Math.round(want * .55)));
      if (floor) min = Math.max(min, Math.min(floor, 220));
      const hint = th.dataset.pri;
      let pri = hint != null && hint !== '' ? +hint : 70 - i * 3;
      if (hint == null || hint === '') {
        if (i === 0) pri = 100; else if (tiny) pri = 92; else if (action && i === heads.length - 1) pri = 96;
        else if (HIGH.test(label)) pri += 14; else if (LOW.test(label)) pri -= 26;
      }
      return { want, min, pri, label, form, long, tiny };
    });
    t.classList.remove('fit-measure'); if (was) t.classList.add('fit');
    return cols;
  }
  /* which columns stay → a Set of hidden column indexes */
  function choose(cols, avail, xw) {
    const hid = new Set(), order = cols.map((c, i) => i).sort((a, b) => cols[a].pri - cols[b].pri || b - a);
    const used = () => cols.reduce((s, c, i) => s + (hid.has(i) ? 0 : c.min + 2), 0) + (hid.size ? xw : 0);
    for (const i of order) { if (used() <= avail) break; if (cols.length - hid.size <= 2) break; hid.add(i); }
    return hid;
  }

  /* ---------- one table ---------- */
  /* a table whose height changes by itself (a text box growing as it fills) is paged again */
  const ro = new ResizeObserver(es => { if (es.some(e => { const t = e.target, s = S.get(t), hgt = Math.round(e.contentRect.height); if (!s || s.h === hgt) return false; s.h = hgt; return true; })) soon(); });
  function apply(t) {
    if (!t.isConnected || t.dataset.fit === 'off' || t.closest('#printRoot, .print-doc, .cs')) return;
    const box = t.parentElement; if (!box || !t.offsetParent) return;
    const s = state(t), heads = headCells(t); if (!heads.length) return;
    const n = heads.length, cs = getComputedStyle(box);
    const avail = Math.floor(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const body = [...t.querySelectorAll(':scope > tbody > tr')], foot = [...t.querySelectorAll(':scope > tfoot:not(.fit-foot) > tr')];
    const xw = touch() ? 46 : 36, colMode = t.dataset.fit === 'cols' || t.classList.contains('dood');
    const sig = [n, body.length, avail, touch() ? 1 : 0, heads.map(textOf).join('|')].join(':');
    if (sig !== s.sig || !s.m) { s.m = measure(t, heads); s.sig = sig; }
    const cols = s.m;

    /* which columns show */
    let hid, cinfo = null;
    if (colMode) {
      /* keep the leading label columns, page the rest by what fits */
      const lead = Math.max(1, cols.findIndex((c, i) => i > 0 && /dcol/.test(heads[i].className)) || 1);
      const fixed = cols.slice(0, lead).reduce((a, c) => a + c.want + 2, 0), per = Math.max(1, Math.floor((avail - fixed - 4) / (Math.max(...cols.slice(lead).map(c => c.want), 40) + 2)));
      const rest = n - lead, pages = Math.max(1, Math.ceil(rest / per)); s.cpage = Math.min(s.cpage, pages - 1);
      const from = lead + s.cpage * per, to = Math.min(n, from + per);
      hid = new Set(); for (let i = lead; i < n; i++) if (i < from || i >= to) hid.add(i);
      if (pages > 1) cinfo = { from: from - lead + 1, to: to - lead, of: rest, pages, label: textOf(heads[from]) && /^\d|day/i.test(textOf(heads[from])) ? 'Days' : 'Columns' };
    } else hid = choose(cols, avail, xw);
    const fold = !colMode && hid.size > 0;

    /* grid template */
    const vis = cols.map((c, i) => i).filter(i => !hid.has(i));
    const tpl = vis.map(i => `minmax(${cols[i].min}px, ${cols[i].tiny ? 'max-content' : Math.max(1, Math.round(cols[i].want)) + 'fr'})`);
    if (fold) tpl.push(`${xw}px`);
    t.classList.add('fit'); t.classList.toggle('fit-fold', fold);
    if (!s.ro) { s.ro = true; ro.observe(t); }
    t.style.setProperty('--fit-cols', tpl.join(' '));

    /* header */
    heads.forEach((th, i) => th.classList.toggle('fit-h', hid.has(i)));
    const hr = heads[0].parentElement;
    let xh = hr.querySelector(':scope > .fit-xh');
    if (fold && !xh && hr.parentElement.tagName === 'THEAD') { xh = document.createElement('th'); xh.className = 'fit-xh'; hr.append(xh); }
    if (!fold && xh) xh.remove();

    /* rows */
    const keys = new Set(); let newKey = null;
    [...body, ...foot].forEach((tr, ri) => {
      const isFoot = ri >= body.length;
      const k = isFoot ? 'foot' + ri : rowKey(tr, ri); if (!isFoot) { keys.add(k); if (s.keys && s.keys.size && !s.keys.has(k) && tr.dataset.key) newKey = tr; }
      tr.classList.add('fit-r');
      if (isGrp(tr)) { [...tr.cells].forEach(c => { c.classList.add('fit-sp'); c.style.gridColumn = '1 / -1'; }); groupRow(t, tr, s); return; }
      let col = 0, any = false;
      [...tr.cells].forEach(c => {
        if (c.classList.contains('fit-xc')) return;
        const span = c.colSpan || 1, from = col; col += span;
        if (span > 1) {
          let v = 0; for (let j = from; j < from + span && j < n; j++) if (!hid.has(j)) v++;
          const full = from === 0 && from + span >= n - 1;
          c.classList.add('fit-sp'); c.style.gridColumn = full ? '1 / -1' : `span ${Math.max(1, v)}`;
          c.classList.toggle('fit-h', v === 0 && !full);
          if (v === 0 && !full && textOf(c)) any = true;
          return;
        }
        const h = hid.has(from); c.classList.toggle('fit-h', h);
        if (h) { c.dataset.fl = cols[from] ? cols[from].label : ''; if (fold && (textOf(c) || c.querySelector('input, select, textarea, button, img'))) any = true; }
      });
      let xc = tr.querySelector(':scope > .fit-xc');
      if (fold && isFoot) { if (!xc) { xc = document.createElement('td'); xc.className = 'fit-xc'; tr.append(xc); } return; }
      if (fold) {
        if (!xc) { xc = document.createElement('td'); xc.className = 'fit-xc'; xc.append(Object.assign(document.createElement('button'), { className: 'fit-x', type: 'button' })); tr.append(xc); }
        const b = xc.firstChild, open = s.open.has(k);
        b.hidden = !any; b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.title = open ? 'Show less' : 'Show more: ' + [...hid].map(i => cols[i].label).filter(Boolean).join(', ');
        b.setAttribute('aria-label', open ? 'Show less' : 'Show more');
        tr.classList.toggle('fit-open', open && any);
      } else { if (xc) xc.remove(); tr.classList.remove('fit-open'); }
    });
    s.keys = keys;

    /* folded groups */
    let inShut = false;
    body.forEach(tr => { if (isGrp(tr)) { inShut = s.shut.has(textOf(tr)); tr.classList.toggle('fit-shut', inShut); return; } tr.classList.toggle('fit-gc', inShut); });

    page(t, s, body, newKey, cinfo);
  }

  /* fold / unfold a group row */
  function groupRow(t, tr, s) {
    const td = tr.cells[0]; if (!td) return;
    let b = td.querySelector(':scope > .fit-g');
    if (!b) { b = Object.assign(document.createElement('button'), { className: 'fit-g', type: 'button' }); td.prepend(b); }
    const shut = s.shut.has(textOf(tr)); b.setAttribute('aria-expanded', shut ? 'false' : 'true'); b.title = shut ? 'Show this group' : 'Fold this group'; b.setAttribute('aria-label', b.title);
  }

  /* ---------- rows that fit ---------- */
  function page(t, s, body, newKey, cinfo) {
    body.forEach(tr => tr.classList.remove('fit-off'));
    /* rows the view itself hides (closed detail rows) don't count */
    const rows = body.filter(tr => !tr.classList.contains('fit-gc') && tr.offsetHeight > 0);
    const sc = scroller(t), noPage = t.dataset.fit === 'nopage' || s.all || !sc;
    let pages = [rows];
    if (!noPage && rows.length > 3) {
      const st = sc.getBoundingClientRect(), tt = t.getBoundingClientRect(), top = tt.top - st.top + sc.scrollTop;
      /* thead / tfoot are display: contents here, so their rows carry the height */
      const head = [...t.querySelectorAll(':scope > thead > tr, :scope > tfoot:not(.fit-foot) > tr')].reduce((a, r) => a + r.offsetHeight, 0), pagerH = touch() ? 50 : 42;
      /* whatever sits under the table (buttons, totals, the page's margin) stays on screen too */
      const after = Math.max(0, sc.scrollHeight - (tt.bottom - st.top + sc.scrollTop));
      let avail = sc.clientHeight - top - head - pagerH - Math.min(after, 160) - 4;
      /* never fewer than about five rows a page */
      avail = Math.max(avail, touch() ? 230 : 190);
      const heights = rows.map(tr => tr.offsetHeight);
      const total = heights.reduce((a, b) => a + b, 0);
      if (total > avail + 4) {
        pages = []; let cur = [], acc = 0;
        rows.forEach((tr, i) => { const hgt = heights[i]; if (cur.length && acc + hgt > avail) { pages.push(cur); cur = []; acc = 0; } cur.push(tr); acc += hgt; });
        if (cur.length) pages.push(cur);
        /* don't leave a group heading alone at the bottom of a page */
        for (let p = 0; p < pages.length - 1; p++) { const pg = pages[p]; if (pg.length > 1 && isGrp(pg[pg.length - 1])) pages[p + 1].unshift(pg.pop()); }
      }
    }
    if (newKey) { const p = pages.findIndex(pg => pg.includes(newKey)); if (p >= 0) s.page = p; }
    if (s.reveal) { const p = pages.findIndex(pg => pg.includes(s.reveal)); if (p >= 0) s.page = p; s.reveal = null; }
    s.page = Math.max(0, Math.min(s.page, pages.length - 1));
    if (pages.length > 1) { const on = new Set(pages[s.page]); rows.forEach(tr => tr.classList.toggle('fit-off', !on.has(tr))); }
    s.pages = pages.length;
    pager(t, s, pages, rows.length, cinfo, body.some(isGrp));
  }

  function pager(t, s, pages, nrows, cinfo, grouped) {
    let tf = t.querySelector(':scope > tfoot.fit-foot');
    const want = pages.length > 1 || s.all || cinfo || (grouped && s.shut.size);
    if (!want) { if (tf) tf.remove(); return; }
    if (!tf) { tf = document.createElement('tfoot'); tf.className = 'fit-foot'; tf.innerHTML = '<tr class="fit-pg"><td><div class="fit-pager"></div></td></tr>'; t.append(tf); }
    const bar = tf.querySelector('.fit-pager');
    const btn = (act, label, icon, opts = {}) => `<button type="button" class="fit-pb${opts.on ? ' on' : ''}" data-fit-act="${act}"${opts.dis ? ' disabled' : ''} title="${label}" aria-label="${label}">${icon}</button>`;
    const parts = [];
    if (pages.length > 1 || s.all) {
      const first = pages.slice(0, s.page).reduce((a, p) => a + p.length, 0) + 1, last = first + pages[s.page].length - 1;
      parts.push(btn('prev', 'Previous rows', '‹', { dis: s.all || s.page === 0 }));
      parts.push(`<span class="fit-pi">${s.all ? `All ${nrows} rows` : `<b>${first}–${last}</b> of ${nrows}`}</span>`);
      parts.push(btn('next', 'Next rows', '›', { dis: s.all || s.page >= pages.length - 1 }));
      if (pages.length > 1 && pages.length <= 12 && !s.all) parts.push(`<span class="fit-dots">${pages.map((p, i) => `<button type="button" class="fit-dot${i === s.page ? ' on' : ''}" data-fit-act="go" data-fit-p="${i}" aria-label="Page ${i + 1}" title="Rows ${i + 1}"></button>`).join('')}</span>`);
    }
    if (cinfo) {
      parts.push(`<span class="fit-sep"></span>`, btn('cprev', 'Earlier columns', '«', { dis: s.cpage === 0 }), `<span class="fit-pi">${cinfo.label} <b>${cinfo.from}–${cinfo.to}</b> of ${cinfo.of}</span>`, btn('cnext', 'Later columns', '»', { dis: s.cpage >= cinfo.pages - 1 }));
    }
    parts.push('<span class="fit-grow"></span>');
    if (grouped) parts.push(`<button type="button" class="fit-pt" data-fit-act="${s.shut.size ? 'unfold' : 'fold'}">${s.shut.size ? 'Unfold all' : 'Fold all'}</button>`);
    if (pages.length > 1 || s.all) parts.push(`<button type="button" class="fit-pt${s.all ? ' on' : ''}" data-fit-act="all">${s.all ? 'Fit to screen' : 'Show all'}</button>`);
    const html = parts.join('');
    if (bar._html !== html) { bar.innerHTML = html; bar._html = html; }
  }

  /* ---------- actions ---------- */
  function act(t, a, el) {
    const s = state(t);
    if (a === 'prev') s.page--; else if (a === 'next') s.page++; else if (a === 'go') s.page = +el.dataset.fitP;
    else if (a === 'cprev') s.cpage = Math.max(0, s.cpage - 1); else if (a === 'cnext') s.cpage++;
    else if (a === 'all') { s.all = !s.all; s.page = 0; }
    else if (a === 'fold') [...t.tBodies].forEach(b => [...b.rows].filter(isGrp).forEach(r => s.shut.add(textOf(r))));
    else if (a === 'unfold') s.shut.clear();
    run(t);
  }
  function onClick(e) {
    if (onListClick(e) || onSecClick(e) || onFoldClick(e)) return;
    const el = e.target.closest('[data-fit-act], .fit-x, .fit-g'); if (!el) return;
    const t = el.closest('table'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (el.classList.contains('fit-x')) {
      const tr = el.closest('tr'), s = state(t), k = rowKey(tr, [...tr.parentElement.rows].indexOf(tr));
      if (s.open.has(k)) s.open.delete(k); else { s.open.add(k); s.reveal = tr; }
      return run(t);
    }
    if (el.classList.contains('fit-g')) {
      const s = state(t), k = textOf(el.closest('tr')); if (s.shut.has(k)) s.shut.delete(k); else s.shut.add(k);
      return run(t);
    }
    act(t, el.dataset.fitAct, el);
  }
  /* page to a row that gets focus, or that something scrolls to */
  function reveal(tr) {
    const t = tr && tr.closest('table.fit'); if (!t) return false;
    const s = state(t);
    if (tr.classList.contains('fit-gc')) { let p = tr.previousElementSibling; while (p && !isGrp(p)) p = p.previousElementSibling; if (p) s.shut.delete(textOf(p)); }
    s.reveal = tr; run(t); return true;
  }
  /* an item of a paged list */
  function revealItem(el) {
    const x = el.closest && el.closest('.fit-off'); if (!x || x.tagName === 'TR') return false;
    const c = x.parentElement, s = c._fitS || lstate(c); s.reveal = x; run(); return true;
  }
  function onFocus(e) { const tr = e.target.closest && e.target.closest('tr.fit-off, tr.fit-gc'); if (tr) reveal(tr); else revealItem(e.target); }
  const sIV = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...a) { const tr = this.closest && this.closest('tr.fit-off, tr.fit-gc'); if (tr) reveal(tr); else revealItem(this); return sIV.apply(this, a); };

  /* swipe a paged table sideways on a touch screen */
  let sw = null;
  function onTouchStart(e) {
    sw = null; if (!e.target.closest) return;
    const lp = [...document.querySelectorAll('.fit-lp')].map(p => p.parentElement).find(c => c.contains(e.target) && c._fitS && c._fitS.pages > 1 && !c._fitS.all);
    const t = e.target.closest('table.fit') || lp;
    if (!t || e.touches.length !== 1 || e.target.closest('input, textarea, select, button, a, [contenteditable], .dnd-handle, [draggable=true]')) return;
    if (t.tagName === 'TABLE') { const s = state(t); if (!(s.pages > 1) && !t.querySelector('.fit-pager [data-fit-act=cnext]')) return; }
    sw = { t, x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    if (!sw) return; const c = e.changedTouches[0], dx = c.clientX - sw.x, dy = c.clientY - sw.y, t = sw.t; sw = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
    if (t.tagName !== 'TABLE') { const s = t._fitS; s.page = Math.max(0, Math.min(s.page + (dx < 0 ? 1 : -1), s.pages - 1)); return run(); }
    const s = state(t);
    if (s.pages > 1) { s.page += dx < 0 ? 1 : -1; s.page = Math.max(0, Math.min(s.page, s.pages - 1)); }
    else { s.cpage = Math.max(0, s.cpage + (dx < 0 ? 1 : -1)); }
    run(t);
  }

  /* ---------- long lists and card grids: paged the same way ----------
     The pager sits inside the list as its last child (a redraw drops it; it comes back).
     State is kept per screen and list, so a view that rebuilds keeps its page. */
  const LISTS = '.setup-list, .pod-seg-list, .sched-days, .prop-grid, .people-grid, .projects, .fx-grid, .cork, .grid-cards, .cast-grid, .kbody, .navlist, .board-grid, .lb-grid, .ps-grid, .setup-grid, [data-fit-list]';
  const LS = new Map();
  const lstate = c => { const all = [...document.querySelectorAll(LISTS)], k = location.hash.split('?')[0] + '|' + all.indexOf(c) + '|' + c.className.split(' ')[0]; let s = LS.get(k); if (!s) { s = { page: 0, all: false }; LS.set(k, s); } c._fitS = s; return s; };
  /* headings stay put on every page; the pager is not an item */
  const fixedItem = x => /^H[1-6]$/.test(x.tagName) || x.matches('.fit-lp, .fit-keep, .navp-h, label.lbl, datalist, template, script');
  const items = c => [...c.children].filter(x => !fixedItem(x));
  /* a scrolling pane that is really a list (most of its children are the same kind of thing) pages like one */
  function autoLists() {
    const out = [];
    document.querySelectorAll(SCROLLERS).forEach(el => {
      if (el.id === 'main' || el.id === 'rail' || el.matches('[data-fit-accordion], .menu, .suggest, .modal-b, ' + LISTS) || !el.closest('#app')) return;
      if (!el._fitAuto && el.scrollHeight <= el.clientHeight + 2) return;
      const k = items(el); if (k.length < 6) return;
      const counts = {}; k.forEach(x => { const c = x.tagName + '.' + (x.classList[0] || ''); counts[c] = (counts[c] || 0) + 1; });
      if (Math.max(...Object.values(counts)) < k.length * .7) return;
      el._fitAuto = true; out.push(el);
    });
    return out;
  }
  function list(c) {
    if (!c.isConnected || !c.offsetParent || c.dataset.fit === 'off' || c.closest('.fit-measure')) return;
    const s = lstate(c), kids = items(c);
    kids.forEach(x => x.classList.remove('fit-off'));
    let lp = c.querySelector(':scope > .fit-lp');
    const self = /(auto|scroll)/.test(getComputedStyle(c).overflowY), sc = self ? c : scroller(c);
    const shown = kids.filter(x => x.offsetParent || getComputedStyle(x).display !== 'none');
    if (!sc || s.all || shown.length < 4) return lpager(c, lp, s, 1, shown.length);
    const pagerH = touch() ? 50 : 40;
    let avail;
    if (self) { const cs = getComputedStyle(c); avail = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - pagerH - 12; }
    else {
      const st = sc.getBoundingClientRect(), top = c.getBoundingClientRect().top - st.top + sc.scrollTop;
      const below = parseFloat(getComputedStyle(c).paddingBottom) + 14;
      const after = Math.max(0, sc.scrollHeight - (c.getBoundingClientRect().bottom - st.top + sc.scrollTop));
      avail = Math.max(sc.clientHeight - top - pagerH - Math.max(below, Math.min(after, 160)), 220);
    }
    if (lp) lp.hidden = true;
    const first = shown[0].offsetTop, last = shown[shown.length - 1], end = last.offsetTop + last.offsetHeight - first;
    if (end <= avail + pagerH * (s.page ? 0 : 1) - 2 && !s.page) { if (lp) lp.hidden = false; return lpager(c, lp, s, 1, shown.length); }
    /* rows of a grid share a top edge: a page is whole rows that fit */
    const rows = []; shown.forEach(x => { const r = rows[rows.length - 1]; if (r && Math.abs(r.top - x.offsetTop) < 4) { r.items.push(x); r.bottom = Math.max(r.bottom, x.offsetTop + x.offsetHeight); } else rows.push({ top: x.offsetTop, bottom: x.offsetTop + x.offsetHeight, items: [x] }); });
    const pages = []; let cur = [], start = null;
    rows.forEach(r => { if (cur.length && r.bottom - start > avail) { pages.push(cur); cur = []; start = null; } if (start == null) start = r.top; cur.push(...r.items); });
    if (cur.length) pages.push(cur);
    /* a list that marks its current item (.on) opens on that page when it changes */
    const on = shown.find(x => x.classList.contains('on') || x.classList.contains('sel') || x.contains(document.activeElement));
    const onKey = on ? (on.dataset.key || shown.indexOf(on)) : null;
    if (on && onKey !== s.onKey) { const p = pages.findIndex(pg => pg.includes(on)); if (p >= 0) s.page = p; }
    s.onKey = onKey;
    if (s.reveal) { const p = pages.findIndex(pg => pg.some(x => x === s.reveal || x.contains(s.reveal))); if (p >= 0) s.page = p; s.reveal = null; }
    s.page = Math.max(0, Math.min(s.page, pages.length - 1)); s.pages = pages.length;
    const vis = new Set(pages[s.page]); shown.forEach(x => x.classList.toggle('fit-off', !vis.has(x)));
    lpager(c, lp, s, pages.length, shown.length, pages);
  }
  function lpager(c, lp, s, n, total, pages) {
    if (n <= 1 && !s.all) { if (lp) lp.remove(); return; }
    if (!lp) { lp = document.createElement('div'); lp.className = 'fit-lp'; c.append(lp); }
    lp.hidden = false;
    let first = 1, last = total;
    if (pages && !s.all) { first = pages.slice(0, s.page).reduce((a, p) => a + p.length, 0) + 1; last = first + pages[s.page].length - 1; }
    const b = (a, l, i, d) => `<button type="button" class="fit-pb" data-fit-l="${a}"${d ? ' disabled' : ''} title="${l}" aria-label="${l}">${i}</button>`;
    const html = (s.all ? '' : b('prev', 'Previous', '‹', s.page === 0)) + `<span class="fit-pi">${s.all ? `All ${total}` : `<b>${first}–${last}</b> of ${total}`}</span>` + (s.all ? '' : b('next', 'Next', '›', s.page >= n - 1))
      + (!s.all && n <= 12 ? `<span class="fit-dots">${Array.from({ length: n }, (x, i) => `<button type="button" class="fit-dot${i === s.page ? ' on' : ''}" data-fit-l="go" data-fit-p="${i}" aria-label="Page ${i + 1}"></button>`).join('')}</span>` : '')
      + `<span class="fit-grow"></span><button type="button" class="fit-pt${s.all ? ' on' : ''}" data-fit-l="all">${s.all ? 'Fit to screen' : 'Show all'}</button>`;
    if (lp._html !== html) { lp.innerHTML = html; lp._html = html; }
  }
  function lists() { return [...document.querySelectorAll(LISTS)].filter(c => c.closest('#app, body > .overlay')); }
  function onListClick(e) {
    const el = e.target.closest('[data-fit-l]'); if (!el) return false;
    const c = el.closest('.fit-lp').parentElement, s = c._fitS || lstate(c), a = el.dataset.fitL;
    if (a === 'prev') s.page--; else if (a === 'next') s.page++; else if (a === 'go') s.page = +el.dataset.fitP; else if (a === 'all') { s.all = !s.all; s.page = 0; }
    e.preventDefault(); e.stopPropagation(); run(); return true;
  }

  /* ---------- panels of folding sections: when they overflow, the sections opened longest ago fold ---------- */
  const opened = new WeakMap(), openedKey = new Map(); let tick = 0;   // <details> by node; live panels by their key
  function onToggle(e) { const d = e.target; if (d.tagName === 'DETAILS' && d.open && !accBusy) opened.set(d, ++tick); }
  let accBusy = false;
  /* the live desk: panels that run past the bottom of the screen fold, just for now (the desk's own
     fold setting, which you set with the header, is left alone). Opening one folds another instead. */
  function onPanelClick(e) {
    const b = e.target.closest && e.target.closest('.ld-pt'), p = b && b.closest('.ld-panel.fit-folded'); if (!p) return;
    e.preventDefault(); e.stopPropagation(); openedKey.set(p.dataset.key, ++tick); run();
  }
  function panels(c) {
    const sc = scroller(c); if (!sc) return;
    const all = [...c.querySelectorAll('.ld-panel.open')].filter(p => p.querySelector(':scope > .ld-ph .ld-pt'));
    all.forEach(p => p.classList.remove('fit-folded'));
    const over = () => sc.scrollHeight > sc.clientHeight + 1;
    if (!over() || all.length < 2) return;
    const bottom = () => sc.getBoundingClientRect().bottom;
    for (let i = 0; i < all.length && over(); i++) {
      const open = all.filter(p => !p.classList.contains('fit-folded'));
      if (open.length < 2) break;
      /* the panels hanging off the bottom go first; the one you opened last goes last */
      const keep = Math.max(...open.map(p => openedKey.get(p.dataset.key) || 0)), mine = p => !!keep && (openedKey.get(p.dataset.key) || 0) === keep;
      const rest = open.filter(p => !mine(p)), past = rest.filter(p => p.getBoundingClientRect().bottom > bottom() + 1);
      const pool = (past.length ? past : rest).sort((x, y) => (openedKey.get(x.dataset.key) || 0) - (openedKey.get(y.dataset.key) || 0) || y.offsetHeight - x.offsetHeight);
      if (!pool.length) break;
      pool[0].classList.add('fit-folded');
    }
  }
  function accordion(c) {
    if (c.classList.contains('ld')) return panels(c);
    if (c.scrollHeight <= c.clientHeight + 1) return;
    const open = [...c.querySelectorAll(':scope > details[open]')];
    if (open.length < 2) return;
    /* fold from the bottom, oldest first; the newest stays open */
    open.sort((a, b) => (opened.get(a) || 0) - (opened.get(b) || 0) || open.indexOf(b) - open.indexOf(a));
    accBusy = true;
    try { for (const d of open.slice(0, -1)) { if (c.scrollHeight <= c.clientHeight + 1) break; d.open = false; } }
    finally { accBusy = false; }
  }

  /* ---------- tall cards in a list fold to their first line (the header) when the screen is full;
     the card you opened or are typing in stays open ---------- */
  const FOLDS = '.setup-list > .setup-card, .brief-page > .card, .ps-group, .pod-seg-list > *, [data-fit-fold] > *', FO = new Map();
  const foldKey = c => location.hash.split('?')[0] + '|' + (c.dataset.key || [...c.parentElement.children].indexOf(c));
  function folds() {
    const byParent = new Map();
    document.querySelectorAll(FOLDS).forEach(c => { if (!c.closest('#app') || !c.firstElementChild) return; const p = c.parentElement; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(c); });
    byParent.forEach((cards, parent) => {
      cards.forEach(c => c.classList.remove('fit-shut', 'fit-off'));          /* measured with every card in view; paging comes after */
      const sc = scroller(parent); if (!sc || cards.length < 2) return;
      const over = () => sc.scrollHeight > sc.clientHeight + 1;
      if (!over()) return;
      const t = c => (c.contains(document.activeElement) ? 1e9 : 0) + (FO.get(foldKey(c)) || 0);
      const order = cards.slice().sort((a, b) => t(a) - t(b) || cards.indexOf(b) - cards.indexOf(a));
      /* fold everything but the one in use, then open from the top while they fit */
      order.slice(0, -1).forEach(c => c.classList.add('fit-shut'));
      if (!over()) for (const c of cards) { if (!c.classList.contains('fit-shut')) continue; c.classList.remove('fit-shut'); if (over()) { c.classList.add('fit-shut'); break; } }
    });
  }
  function onFoldClick(e) {
    const c = e.target.closest && e.target.closest('.fit-shut'); if (!c || !c.matches(FOLDS)) return false;
    if (e.target.closest('input, textarea, select, button, a, label')) return false;
    if (!c.firstElementChild.contains(e.target)) return false;
    FO.set(foldKey(c), ++tick); e.preventDefault(); run(); return true;
  }

  /* ---------- documents in sections (the call sheet): a heading folds its section; when the page
     would overflow, the biggest sections you haven't opened yourself fold first ---------- */
  const SECTIONED = '.cs, [data-fit-sections]', SEC = new Map();
  function sections(doc) {
    const heads = [...doc.children].filter(x => x.tagName === 'H4' || x.matches('[data-fit-sec]'));
    if (heads.length < 2) return;
    doc.classList.add('fit-secs');
    const key = h => location.hash.split('?')[0] + '|' + textOf(h);
    const parts = heads.map(hd => { const body = []; for (let n = hd.nextElementSibling; n && !heads.includes(n); n = n.nextElementSibling) body.push(n); return { hd, body, k: key(hd) }; });
    parts.forEach(p => { p.hd.classList.add('fit-sec'); p.hd.tabIndex = 0; p.hd.setAttribute('role', 'button'); p.body.forEach(b => b.classList.remove('fit-off')); });
    const want = p => SEC.get(p.k);                        // true = you opened it, false = you folded it
    parts.forEach(p => { if (want(p) === false) p.body.forEach(b => b.classList.add('fit-off')); });
    const sc = scroller(doc);
    if (sc) {
      const over = () => sc.scrollHeight > sc.clientHeight + 1;
      /* fold every section you haven't chosen, then open the smallest ones again while they fit */
      const size = p => p.body.reduce((x, e) => x + e.offsetHeight, 0);
      const auto = parts.filter(p => want(p) === undefined).map(p => [p, size(p)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
      if (over()) {
        auto.forEach(p => p.body.forEach(b => b.classList.add('fit-off')));
        for (const p of auto) { p.body.forEach(b => b.classList.remove('fit-off')); if (over()) p.body.forEach(b => b.classList.add('fit-off')); }
      }
      const mine = parts.filter(p => want(p) === true).sort((a, b) => (a.t || 0) - (b.t || 0)).slice(0, -1);
      for (const p of mine) { if (!over()) break; p.body.forEach(b => b.classList.add('fit-off')); }
      sectionRows(parts, sc, over);
    }
    parts.forEach(p => { const shut = p.body.length && p.body.every(b => b.classList.contains('fit-off')); p.hd.classList.toggle('shut', shut); p.hd.setAttribute('aria-expanded', shut ? 'false' : 'true');
      p.hd.dataset.n = shut ? (p.body.reduce((a, b) => a + (b.querySelectorAll ? b.querySelectorAll('tbody tr').length : 0), 0) || '') : ''; });
  }
  /* an open section whose table is still taller than the screen shows its rows a page at a time
     (a document like the call sheet keeps its plain tables; printing shows every row) */
  const CSP = new Map();
  function sectionRows(parts, sc, over) {
    const open = parts.filter(p => p.body.length && !p.body.every(b => b.classList.contains('fit-off')));
    const tabs = open.flatMap(p => p.body.filter(b => b.tagName === 'TABLE' && b.tBodies[0]).map(t => ({ p, t })));
    tabs.forEach(({ t }) => { t.querySelectorAll('tr.fit-rowoff').forEach(r => r.classList.remove('fit-rowoff')); t.querySelectorAll('tr.fit-csp').forEach(r => r.remove()); });
    if (!over()) return;
    tabs.sort((a, b) => b.t.offsetHeight - a.t.offsetHeight);
    for (const { p, t } of tabs) {
      const rows = [...t.tBodies[0].rows]; if (rows.length < 4) continue;
      const excess = sc.scrollHeight - sc.clientHeight + 46, hs = rows.map(r => r.offsetHeight);
      let room = hs.reduce((a, b) => a + b, 0) - excess, per = 0;
      for (const hh of hs) { if (room - hh < 0) break; room -= hh; per++; }
      per = Math.max(2, Math.min(per, rows.length - 1));
      const pages = Math.ceil(rows.length / per), pg = Math.max(0, Math.min(CSP.get(p.k) || 0, pages - 1)); CSP.set(p.k, pg);
      rows.forEach((r, i) => r.classList.toggle('fit-rowoff', i < pg * per || i >= (pg + 1) * per));
      const cols = Math.max(...[...t.rows].map(r => [...r.cells].reduce((a, c) => a + (c.colSpan || 1), 0)));
      const tr = document.createElement('tr'), td = document.createElement('td'); tr.className = 'fit-csp'; td.colSpan = cols;
      const a = pg * per + 1, b = Math.min(rows.length, (pg + 1) * per);
      td.innerHTML = `<button type="button" data-csp="-1" ${pg ? '' : 'disabled'} aria-label="Previous rows">‹</button><span>${a}–${b} of ${rows.length}</span><button type="button" data-csp="1" ${pg < pages - 1 ? '' : 'disabled'} aria-label="Next rows">›</button>`;
      td.dataset.k = p.k; tr.append(td); t.tBodies[0].append(tr);
      if (!over()) break;
    }
  }
  function onCspClick(e) {
    const b = e.target.closest && e.target.closest('.fit-csp button'); if (!b) return;
    const k = b.closest('td').dataset.k; e.preventDefault(); e.stopPropagation();
    CSP.set(k, (CSP.get(k) || 0) + Number(b.dataset.csp)); run();
  }
  /* a block that is only headings and what follows each (gear by category…) folds the same way */
  function autoSections() {
    const out = new Set();
    document.querySelectorAll('#main h3, #main h4').forEach(hd => {
      const p = hd.parentElement; if (out.has(p) || p.matches(SECTIONED) || p.closest('.cs, .modal, .card, .ld-panel, table')) return;
      const kids = [...p.children], heads = kids.filter(x => /^H[34]$/.test(x.tagName));
      if (heads.length < 2 || kids[0] !== heads[0] || heads.some(x => x.tagName !== heads[0].tagName)) return;
      out.add(p);
    });
    out.forEach(p => [...p.children].forEach(x => { if (/^H[34]$/.test(x.tagName)) x.dataset.fitSec = ''; }));
    return [...out];
  }
  function onSecClick(e) {
    const hd = e.target.closest && e.target.closest('.fit-sec'); if (!hd || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return false;
    if (e.target.closest('input, textarea, select, button, a')) return false;
    const k = location.hash.split('?')[0] + '|' + textOf(hd), open = hd.classList.contains('shut');
    /* opening one you didn't open before folds the rest you haven't chosen, oldest first, as needed */
    SEC.set(k, open); e.preventDefault(); run(); return true;
  }

  /* ---------- scroll hints ---------- */
  function hint(el) {
    const y = el.scrollHeight - el.clientHeight > 2, x = el.scrollWidth - el.clientWidth > 2;
    const t = y && el.scrollTop > 2, b = y && el.scrollTop < el.scrollHeight - el.clientHeight - 2;
    const l = x && el.scrollLeft > 2, r = x && el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
    const v = (t ? 't' : '') + (b ? 'b' : '') + (l ? 'l' : '') + (r ? 'r' : '');
    if ((el.dataset.sh || '') !== v) { if (v) el.dataset.sh = v; else delete el.dataset.sh; }
  }
  const SCROLLERS = '#main, #rail, .modal-b, .menu, .suggest, .navlist, .navp, .script-scroll, .bd-scenes, .bd-center, .bd-right, .sched-days, .sched-pool .zone, .shots-main, .shots-side, .stage-side, .stage-main, .stage-right, .ct-list, .scroll, .lined-scroll, .sbs-side, .fin-cols > *, [data-scroll]';
  function hints() { document.querySelectorAll(SCROLLERS).forEach(hint); }
  function onScroll(e) { const el = e.target; if (el && el.nodeType === 1) hint(el); }

  /* ---------- toolbars: when the buttons wrap onto a second line, their labels fold into icons ---------- */
  function wrapped(el) { const k = [...el.children].filter(x => x.offsetParent && x.offsetWidth && x.offsetHeight); if (k.length < 2) return false; const line = Math.min(...k.map(x => x.offsetTop + x.offsetHeight)); return k.some(x => x.offsetTop >= line - 2); }
  function toolbar(el) {
    el.classList.remove('tb-tight', 'tb-tighter');
    if (!wrapped(el)) return;
    el.querySelectorAll(':scope > .btn, :scope > a.btn, :scope > .seg > button').forEach(b => { if (!b.title && b.querySelector('.ico')) b.title = textOf(b); });
    el.querySelectorAll(':scope > span.small, :scope > span.muted, :scope > .small.muted').forEach(x => x.classList.toggle('tb-hint', textOf(x).length > 22));
    el.classList.add('tb-tight'); if (wrapped(el)) el.classList.add('tb-tighter');
  }

  /* ---------- the rail ---------- */
  function rail() {
    const r = document.getElementById('rail'); if (!r) return;
    r.classList.remove('dense', 'denser');
    if (r.scrollHeight > r.clientHeight + 1) r.classList.add('dense');
    if (r.scrollHeight > r.clientHeight + 1) r.classList.add('denser');
  }

  /* ---------- running ---------- */
  function tables() { return [...document.querySelectorAll('#app table.tbl, body > .overlay table.tbl')]; }
  function run(only) {
    busy = true;
    try { if (!only) { try { folds(); } catch (err) { console.error('fit', err); } } (only ? [only] : tables()).forEach(t => { try { apply(t); } catch (err) { console.error('fit', err); } }); if (!only) { [...lists(), ...autoLists()].forEach(c => { try { list(c); } catch (err) { console.error('fit', err); } }); document.querySelectorAll('[data-fit-accordion], #main .live.ld').forEach(accordion); [...document.querySelectorAll(SECTIONED), ...autoSections()].forEach(d => { try { sections(d); } catch (err) { console.error('fit', err); } }); document.querySelectorAll('#app .toolbar, #app .page-h').forEach(toolbar); rail(); } hints(); }
    finally { if (mo) mo.takeRecords(); busy = false; }
  }
  const soon = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; run(); }); };
  function init() {
    mo = new MutationObserver(recs => {
      if (busy) return;
      /* our own pager / toggle redraws need nothing more */
      if (recs.every(r => r.target.closest && r.target.closest('.fit-pager, .fit-lp'))) return;
      run();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
    new ResizeObserver(soon).observe(document.documentElement);
    addEventListener('resize', soon);
    /* a new screen settles (images, fonts, late panels) a moment after it draws: look once more */
    addEventListener('hashchange', () => setTimeout(soon, 300));
    document.addEventListener('click', onClick, true);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('toggle', onToggle, true);
    document.addEventListener('click', onPanelClick, true);
    document.addEventListener('click', onCspClick, true);
    document.addEventListener('keydown', e => { if (e.target.classList && e.target.classList.contains('fit-sec')) onSecClick(e); });
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    if (document.fonts) document.fonts.ready.then(() => { tables().forEach(t => { state(t).sig = ''; }); soon(); });
    run();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { run, reveal, state };
})();
