'use strict';
/* ===================================================================
   Lined script — the script supervisor's coverage lines.
   Drag down the right margin to line the dialogue/action a shot covers.
   Solid line = on camera, squiggle = off camera. Slate and circled takes are written at the top.
   =================================================================== */
const LINE_W = 11;   // pt between margin columns
function linedModel(P) {
  const pg = paginate(P), pages = [], idx = new Map(P.blocks.map((b, i) => [b.id, i]));
  const seg = new Map();   // block index -> [{page,r0,r1}]
  pg.pages.forEach((page, k) => {
    let r = 0; const rows = [];
    const touch = (bi, a, b) => { if (bi == null || bi < 0) return; let s = seg.get(bi); if (!s) seg.set(bi, s = []); const l = s[s.length - 1]; if (l && l.page === k) { l.r0 = Math.min(l.r0, a); l.r1 = Math.max(l.r1, b); } else s.push({ page: k, r0: a, r1: b }); };
    page.lines.forEach(rec => {
      if (rec.kind === 'dual') { const rr = r; [rec.left, rec.right].forEach(col => col.forEach((ln, j) => touch(ln.bi, rr + j, rr + j))); rows.push({ rec, r, h: rec.h }); r += rec.h; }
      else { if (rec.kind === 'line') touch(rec.bi, r, r); rows.push({ rec, r, h: 1 }); r++; }
    });
    pages.push({ page, rows, n: r });
  });
  return { pg, pages, seg, idx };
}
/* lines for this script, with their block indexes; anything pointing at deleted blocks or shots is dropped */
function validLines(P, M) {
  return (P.lined || []).map(l => ({ l, a: M.idx.get(l.from), b: M.idx.get(l.to), shot: P.shots.find(s => s.id === l.shotId) })).filter(x => x.a != null && x.b != null && x.shot)
    .map(x => (x.a > x.b ? { ...x, a: x.b, b: x.a } : x));
}
function linedPageNode(P, M, k, items, cols, ui) {
  const { page, rows, n } = M.pages[k], scenes = getScenes(P);
  const node = h('div', { class: 'lp ' + P.mode, 'data-k': k });
  const body = h('div', { class: 'lp-body' });
  rows.forEach(({ rec }) => {
    if (rec.kind === 'blank') body.append(h('div', { class: 'ln' }));
    else if (rec.kind === 'more') body.append(h('div', { class: 'ln', style: { marginLeft: layoutOf(P.mode, 'character').i + 'ch' } }, '(MORE)'));
    else if (rec.kind === 'contd') body.append(h('div', { class: 'ln', style: lineStyleFor(P, 'character') }, rec.text.toUpperCase()));
    else if (rec.kind === 'dual') {
      const colEl = list => h('div', { class: 'dcol' }, list.map(ln => h('div', { class: 'ln', style: { marginLeft: ln.ind + 'ch', textAlign: ln.type === 'character' ? 'center' : 'left', width: ln.w + 'ch', fontWeight: layoutOf(P.mode, ln.type).b ? 'bold' : 'normal', fontStyle: layoutOf(P.mode, ln.type).it ? 'italic' : 'normal' }, html: runsHTML(ln.chars, ln.flags) || '&nbsp;' })));
      body.append(h('div', { class: 'dual' }, colEl(rec.left), colEl(rec.right)));
    } else { const el = h('div', { class: 'ln', style: lineStyleFor(P, rec.type), html: runsHTML(rec.chars, rec.flags) || '&nbsp;' }); body.append(el); }
  });
  node.append(h('div', { class: 'lp-no' }, M.pg.labels[k] + '.'), body);
  const margin = h('div', { class: 'lp-m', style: { height: n * 12 + 'pt' } });
  /* the coverage lines drawn on this page */
  items.forEach(it => {
    let r0 = Infinity, r1 = -Infinity, topCut = false, botCut = false;
    for (let bi = it.a; bi <= it.b; bi++) (M.seg.get(bi) || []).forEach(s => { if (s.page === k) { r0 = Math.min(r0, s.r0); r1 = Math.max(r1, s.r1); } });
    if (r0 === Infinity) return;
    const firstSeg = (M.seg.get(it.a) || [])[0], lastSegs = M.seg.get(it.b) || [], lastSeg = lastSegs[lastSegs.length - 1];
    topCut = !(firstSeg && firstSeg.page === k); botCut = !(lastSeg && lastSeg.page === k);
    const x = Math.min(cols.get(it.l.id) || 0, 7) * LINE_W, sc = scenes.find(s => s.id === it.shot.sceneId);
    const takes = takesOfShot(P, it.shot.id), circ = takes.filter(t => t.status === 'circle').map(t => t.n);
    const label = shotLabel(P, it.shot, scenes) + (circ.length ? ' · T' + circ.join(',') : '');
    const el = h('div', { class: 'lm-line ' + it.l.kind + (it.l.id === ui.sel ? ' sel' : '') + (circ.length ? ' circ' : ''), title: `Slate ${label} — ${it.l.kind === 'off' ? 'off camera' : 'on camera'}${sc ? ' · scene ' + sc.num : ''}`, 'data-id': it.l.id,
      style: { left: x + 'pt', top: r0 * 12 + 'pt', height: (r1 - r0 + 1) * 12 + 'pt' }, onclick: e => { e.stopPropagation(); ui.pick(it.l, e); } },
    h('i', { class: 'lm-top' + (topCut ? ' cut' : '') }), h('span', { class: 'lm-lbl' }, label), h('i', { class: 'lm-bot' + (botCut ? ' cut' : '') }));
    margin.append(el);
  });
  node.append(margin);
  return node;
}
function linedAllPages(P, ui) {
  const M = linedModel(P), items = validLines(P, M);
  /* greedy column assignment so lines that overlap never share a column */
  const cols = new Map(), ends = []; [...items].sort((p, q) => p.a - q.a || q.b - p.b).forEach(it => { let c = ends.findIndex(e => e < it.a); if (c < 0) { c = ends.length; ends.push(0); } ends[c] = it.b; cols.set(it.l.id, c); });
  return { M, items, nodes: M.pages.map((_, k) => linedPageNode(P, M, k, items, cols, ui)) };
}

function mountLined(root, P) {
  const scenes = getScenes(P); P.lined = P.lined || [];
  if (!P.shots.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'Plan some shots first'), h('p', {}, 'A lined script draws each shot’s coverage over the script pages. Add shots in the Shot list, then come back.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/shots` }, 'Open shot list')))); return; }
  if (!P.shots.find(s => s.id === UI.lineShot)) UI.lineShot = (P.shots.find(s => s.sceneId === UI.takeScene) || P.shots[0]).id;
  UI.lineKind = UI.lineKind || 'on';
  const ui = { sel: null, pick: null };
  const holder = h('div', { class: 'lined-scroll' });
  let drag = null, built;
  const sel = h('select', { class: 'inp', style: { maxWidth: '320px' }, onchange: e => { UI.lineShot = e.target.value; } });
  const fillSel = () => { sel.replaceChildren(...scenes.flatMap(sc => P.shots.filter(s => s.sceneId === sc.id).map(s => h('option', { value: s.id, selected: s.id === UI.lineShot }, `${shotLabel(P, s, scenes)} — ${[s.size, s.desc].filter(Boolean).join(' · ') || 'shot'}`.slice(0, 60))))); };
  const kindBtn = (k, l) => h('button', { class: UI.lineKind === k ? 'on' : '', onclick: () => { UI.lineKind = k; [...kinds.children].forEach(b => b.classList.toggle('on', b.dataset.k === UI.lineKind)); } }, l);
  const kinds = h('div', { class: 'tabs', style: { margin: 0, border: 0 } });
  [['on', 'On camera ━'], ['off', 'Off camera 〰']].forEach(([k, l]) => { const b = kindBtn(k, l); b.dataset.k = k; kinds.append(b); });
  const jump = h('select', { class: 'inp', style: { maxWidth: '220px' }, onchange: e => { const bi = P.blocks.findIndex(b => b.id === e.target.value), sg = built && built.M.seg.get(bi); if (sg && sg[0]) holder.querySelector(`.lp[data-k="${sg[0].page}"]`)?.scrollIntoView({ block: 'start' }); e.target.value = ''; } },
    h('option', { value: '' }, 'Jump to scene…'), ...scenes.map(s => h('option', { value: s.id }, `${s.num}. ${s.label}`.slice(0, 44))));
  const count = h('span', { class: 'small muted' });
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' }, h('span', { class: 'small muted' }, 'Slate'), sel, kinds, jump, count, h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => { UI.takeTab = 'log'; Router.refresh(); } }, icon('list', 15), 'Take log'),
    h('button', { class: 'btn', onclick: () => printLined() }, icon('print', 15), 'Print lined script')), holder));

  function redraw(keep) {
    const top = holder.scrollTop; fillSel(); built = linedAllPages(P, ui); holder.replaceChildren(h('div', { class: 'lined-hint' }, 'Drag down the right margin from the first to the last line a shot covers. Click a line to change or delete it.'), ...built.nodes);
    count.textContent = `${built.items.length} coverage line${built.items.length === 1 ? '' : 's'}`; if (keep) holder.scrollTop = top;
    built.nodes.forEach((n, k) => n.addEventListener('pointerdown', e => down(e, n, k)));
  }
  const rowAt = (n, k, e) => { const r = n.querySelector('.lp-body').getBoundingClientRect(), pt = (e.clientY - r.top) / (r.height / (built.M.pages[k].n || 1)); return Math.max(0, Math.min(built.M.pages[k].n - 1, Math.floor(pt))); };
  const blockAt = (k, row) => { const { rows } = built.M.pages[k]; for (const { rec, r, h: hh } of rows) if (row >= r && row < r + hh) { if (rec.kind === 'line') return rec.bi; if (rec.kind === 'dual') { const ln = [...rec.left, ...rec.right][row - r] || rec.left[0] || rec.right[0]; return ln ? ln.bi : null; } } /* blank: nearest block above */ for (let q = rows.length - 1; q >= 0; q--) { const z = rows[q]; if (z.r <= row && z.rec.kind === 'line') return z.rec.bi; } return null; };
  function down(e, n, k) {
    if (e.target.closest('.lm-line') || e.button) return;
    const mr = n.querySelector('.lp-m').getBoundingClientRect(); if (e.clientX < mr.left - 8) return;   // only the margin is draggable
    const bi = blockAt(k, rowAt(n, k, e)); if (bi == null) return;
    drag = { a: bi, b: bi }; e.preventDefault();
    const mv = ev => { const t = document.elementFromPoint(ev.clientX, ev.clientY), pn = t && t.closest('.lp'); if (!pn) return; const kk = +pn.dataset.k, b2 = blockAt(kk, rowAt(pn, kk, ev)); if (b2 != null) { drag.b = b2; hilite(); } };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); holder.querySelectorAll('.hl').forEach(x => x.remove()); if (!drag) return; const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b); drag = null;
      P.lined.push({ id: uid(), shotId: UI.lineShot, from: P.blocks[a].id, to: P.blocks[b].id, kind: UI.lineKind }); Store.touch(); redraw(true); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); hilite();
  }
  function hilite() {
    holder.querySelectorAll('.hl').forEach(x => x.remove()); const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b);
    built.nodes.forEach((n, k) => { let r0 = Infinity, r1 = -Infinity; for (let bi = a; bi <= b; bi++) (built.M.seg.get(bi) || []).forEach(s => { if (s.page === k) { r0 = Math.min(r0, s.r0); r1 = Math.max(r1, s.r1); } }); if (r0 !== Infinity) n.querySelector('.lp-m').append(h('div', { class: 'hl', style: { top: r0 * 12 + 'pt', height: (r1 - r0 + 1) * 12 + 'pt' } })); });
  }
  ui.pick = (l, e) => menu(e.currentTarget, [
    { label: l.kind === 'on' ? 'Make off camera 〰' : 'Make on camera ━', onClick: () => { l.kind = l.kind === 'on' ? 'off' : 'on'; Store.touch(); redraw(true); } },
    { label: 'Use this slate for new lines', onClick: () => { UI.lineShot = l.shotId; redraw(true); } },
    { label: 'Open takes for this shot', onClick: () => { const s = P.shots.find(x => x.id === l.shotId); if (s) UI.takeScene = s.sceneId; UI.takeTab = 'log'; Router.refresh(); } },
    { sep: true }, { label: 'Delete line', danger: true, onClick: () => { P.lined = P.lined.filter(x => x !== l); Store.touch(); redraw(true); } }]);
  function printLined() {
    if (!built.items.length) return toast('Draw some coverage lines first.', true);
    const { nodes } = linedAllPages(P, { sel: null, pick: () => { } });
    printNode(h('div', { class: 'print-lined ' + P.mode }, nodes));
  }
  redraw();
}
