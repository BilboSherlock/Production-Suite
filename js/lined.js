'use strict';
/* ===================================================================
   Lined script — the script supervisor's coverage lines.
   Drag down the right margin to line the dialogue/action a shot covers.
   Solid line = on camera, squiggle = off camera. Slate and circled takes are written at the top.
   VIEW. Rules: js/models/lined.model.js; screen state and commands:
   js/viewmodels/lined.vm.js. The pages are drawn once; each redraw
   only updates the coverage marks in the margins.
   =================================================================== */
const LINE_W = LinedModel.LINE_W;   // kept for older callers

/* the text of page k (drawn the same on screen and in print) */
function linedPageText(P, M, k) {
  const { page, rows } = M.pages[k], body = h('div', { class: 'lp-body' });
  rows.forEach(({ rec }) => {
    if (rec.kind === 'blank') body.append(h('div', { class: 'ln' }));
    else if (rec.kind === 'more') body.append(h('div', { class: 'ln', style: { marginLeft: layoutOf(P.mode, 'character').i + 'ch' } }, '(MORE)'));
    else if (rec.kind === 'contd') body.append(h('div', { class: 'ln', style: lineStyleFor(P, 'character') }, rec.text.toUpperCase()));
    else if (rec.kind === 'dual') {
      const colEl = list => h('div', { class: 'dcol' }, list.map(ln => h('div', { class: 'ln', style: { marginLeft: ln.ind + 'ch', textAlign: ln.type === 'character' ? 'center' : 'left', width: ln.w + 'ch', fontWeight: layoutOf(P.mode, ln.type).b ? 'bold' : 'normal', fontStyle: layoutOf(P.mode, ln.type).it ? 'italic' : 'normal' }, html: runsHTML(ln.chars, ln.flags) || '&nbsp;' })));
      body.append(h('div', { class: 'dual' }, colEl(rec.left), colEl(rec.right)));
    } else body.append(h('div', { class: 'ln', style: lineStyleFor(P, rec.type), html: runsHTML(rec.chars, rec.flags) || '&nbsp;' }));
  });
  return [h('div', { class: 'lp-no' }, M.pg.labels[k] + '.'), body];
}
/* a coverage mark in the margin */
const linedMark = (m, pick) => h('div', { class: 'lm-line ' + m.kind + (m.circ ? ' circ' : ''), title: m.title, 'data-id': m.id, 'data-key': m.id,
  style: { left: m.x + 'pt', top: m.top + 'pt', height: m.height + 'pt' }, onclick: e => { e.stopPropagation(); if (pick) pick(m.id, e); } },
h('i', { class: 'lm-top' + (m.topCut ? ' cut' : '') }), h('span', { class: 'lm-lbl' }, m.label), h('i', { class: 'lm-bot' + (m.botCut ? ' cut' : '') }));
/* every page with its marks (for print) */
function linedAllPages(P, vm) {
  const M = vm.M, marks = vm.allMarks();
  return M.pages.map((pg, k) => h('div', { class: 'lp ' + P.mode, 'data-k': k }, ...linedPageText(P, M, k), h('div', { class: 'lp-m', style: { height: pg.n * 12 + 'pt' } }, marks[k].map(m => linedMark(m)))));
}

/** the lined script tab of the take log → cleanup */
function mountLined(root) {
  const vm = new LinedVM(), P = vm.P;
  if (!vm.hasShots) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'Plan some shots first'), h('p', {}, 'A lined script draws each shot’s coverage over the script pages. Add shots in the Shot list, then come back.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/shots` }, 'Open shot list')))); return; }
  const back = () => { Router.refresh(); };
  const bar = h('div', { class: 'toolbar' }), holder = h('div', { class: 'lined-scroll' });
  root.append(h('div', { class: 'script-wrap' }, bar, holder));

  /* the pages: text drawn once; margins redrawn */
  const M = vm.M, margins = [];
  const pages = M.pages.map((pg, k) => { const m = h('div', { class: 'lp-m', style: { height: pg.n * 12 + 'pt' } }); margins.push(m);
    return h('div', { class: 'lp ' + P.mode, 'data-k': k, onpointerdown: e => down(e, e.currentTarget, k) }, ...linedPageText(P, M, k), m); });
  holder.append(h('div', { class: 'lined-hint' }, 'Drag down the right margin from the first to the last line a shot covers. Click a line to change or delete it.'), ...pages);

  let drag = null;
  const rowAt = (n, k, e) => { const r = n.querySelector('.lp-body').getBoundingClientRect(), pt = (e.clientY - r.top) / (r.height / (M.pages[k].n || 1)); return Math.max(0, Math.min(M.pages[k].n - 1, Math.floor(pt))); };
  function down(e, n, k) {
    if (e.target.closest('.lm-line') || e.button) return;
    const mr = n.querySelector('.lp-m').getBoundingClientRect(); if (e.clientX < mr.left - 8) return;   // only the margin is draggable
    const bi = vm.blockAt(k, rowAt(n, k, e)); if (bi == null) return;
    drag = { a: bi, b: bi }; e.preventDefault();
    const mv = ev => { const t = document.elementFromPoint(ev.clientX, ev.clientY), pn = t && t.closest('.lp'); if (!pn || !holder.contains(pn)) return; const kk = +pn.dataset.k, b2 = vm.blockAt(kk, rowAt(pn, kk, ev)); if (b2 != null) { drag.b = b2; hilite(); } };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); holder.querySelectorAll('.hl').forEach(x => x.remove()); if (!drag) return; const { a, b } = drag; drag = null; vm.addLine(a, b); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); hilite();
  }
  function hilite() {
    holder.querySelectorAll('.hl').forEach(x => x.remove());
    margins.forEach((m, k) => { const sp = vm.span(drag.a, drag.b, k); if (sp) m.append(h('div', { class: 'hl', style: { top: sp.r0 * 12 + 'pt', height: (sp.r1 - sp.r0 + 1) * 12 + 'pt' } })); });
  }
  const pick = (id, e) => { const l = LinedModel.find(vm.P, id); if (!l) return; menu(e.currentTarget, [
    { label: l.kind === 'on' ? 'Make off camera 〰' : 'Make on camera ━', onClick: () => vm.toggleLine(id) },
    { label: 'Use this slate for new lines', onClick: () => vm.useSlate(id) },
    { label: 'Open takes for this shot', onClick: () => { vm.openTakes(id); back(); } },
    { sep: true }, { label: 'Delete line', danger: true, onClick: () => vm.removeLine(id) }]); };
  function jumpTo(id) { const k = vm.pageOfScene(id); if (k != null) pages[k].scrollIntoView({ block: 'start' }); }
  function printLined() {
    if (!vm.items.length) return toast('Draw some coverage lines first.', true);
    printNode(h('div', { class: 'print-lined ' + P.mode }, linedAllPages(P, vm)));
  }

  function draw() {
    const shot = vm.shotId, kind = vm.kind;
    morph(bar, [h('span', { class: 'small muted' }, 'Slate'),
      h('select', { class: 'inp', style: { maxWidth: '320px' }, onchange: e => vm.setShot(e.target.value) }, vm.shotChoices.map(c => h('option', { value: c.id, selected: c.id === shot }, c.label))),
      h('div', { class: 'tabs', style: { margin: 0, border: 0 } }, [['on', 'On camera ━'], ['off', 'Off camera 〰']].map(([k, l]) => h('button', { class: kind === k ? 'on' : '', 'data-k': k, onclick: () => vm.setKind(k) }, l))),
      h('select', { class: 'inp', style: { maxWidth: '220px' }, onchange: e => { jumpTo(e.target.value); e.target.value = ''; } },
        h('option', { value: '' }, 'Jump to scene…'), ...vm.scenes.map(s => h('option', { value: s.id }, `${s.num}. ${s.label}`.slice(0, 44)))),
      h('span', { class: 'small muted' }, vm.countText), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => { vm.showLog(); back(); } }, icon('list', 15), 'Take log'),
      h('button', { class: 'btn', onclick: () => printLined() }, icon('print', 15), 'Print lined script')]);
    vm.allMarks().forEach((ms, k) => morph(margins[k], ms.map(m => linedMark(m, pick))));
  }
  return bindView(vm, draw);
}
