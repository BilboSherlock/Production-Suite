'use strict';
/* ===================================================================
   Script editor — VIEW (screenplay, stage play, two-column AV,
   podcast and photo shot lists). One textarea per line. Rules:
   js/models/script.model.js; commands, undo and screen state:
   js/viewmodels/script.vm.js.

   Every redraw runs syncBlocks(): it matches the page to P.blocks by
   id, reusing each line's textarea (so typing, the cursor and focus are
   never disturbed) and only adding, removing or moving what changed.
   Typing saves quietly and touches only its own line.
   =================================================================== */
const Views = {};

/** Final Draft (.fdx) → { meta, blocks } (needs the browser's XML parser, so it lives here) */
function parseFDX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const rev = { 'Scene Heading': 'scene', 'Action': 'action', 'Character': 'character', 'Parenthetical': 'paren', 'Dialogue': 'dialogue', 'Transition': 'transition', 'Shot': 'shot', 'General': 'action' };
  const blocks = [];
  $$('Content > Paragraph', doc).forEach(p => {
    const text = $$('Text', p).map(t => {
      const st = t.getAttribute('Style') || '', s = t.textContent;
      if (!s) return '';
      if (/Bold/.test(st) && /Italic/.test(st)) return '***' + s + '***';
      if (/Bold/.test(st)) return '**' + s + '**';
      if (/Italic/.test(st)) return '*' + s + '*';
      if (/Underline/.test(st)) return '_' + s + '_';
      return s;
    }).join('');
    if (!text.trim()) return;
    blocks.push({ id: uid(), type: rev[p.getAttribute('Type')] || 'action', text });
  });
  return { meta: {}, blocks };
}

Views.script = function (root) {
  const vm = new ScriptVM(), SM = ScriptModel;
  const mode = vm.mode, types = vm.types;
  const els = new Map();       // line id → { el, ta, nd, type }
  let navOpen = innerWidth > 1100, focusMode = false, remote = false;
  let kbar = null, kbarT = 0;  // the touch writing bar (built on first focus)

  /* ---------- DOM skeleton ---------- */
  const paper = h('div', { class: 'paper ' + mode });
  const avHead = mode === 'av' ? h('div', { class: 'avh-ed' }, h('span', {}, 'VIDEO'), h('span', {}, 'AUDIO')) : null;
  if (avHead) paper.append(avHead);
  const paperWrap = h('div', { class: 'paper-wrap' }, paper);
  const scroller = h('div', { class: 'script-scroll' }, paperWrap);
  const navList = h('ul', { class: 'navlist' });
  const navSeg = h('div', { class: 'seg', style: { margin: '0 14px 8px' } });
  const nav = h('div', { class: 'navp' + (navOpen ? '' : ' closed') },
    h('div', { class: 'navp-h' }, h('span', { class: 'grow' }, 'Outline'), h('button', { class: 'btn sm', onclick: () => { go(vm.addScene()); scroller.scrollTop = scroller.scrollHeight; } }, icon('plus', 14), 'Scene')), navSeg, navList);
  const typeSel = h('select', { class: 'typesel', title: 'Element type (Tab cycles, Ctrl+1…8 sets)', onchange: () => { const b = vm.current; if (!b) return; const e = els.get(b.id), at = e.ta.selectionStart; vm.setType(b.id, typeSel.value); focusBlock(b.id, at); } },
    types.map((t, i) => h('option', { value: t.k }, Device.touchOn() ? t.label : `${t.label}  (Ctrl+${i + 1})`)));
  const undoBtn = ibtn('undo', 'Undo (Ctrl+Z)', undo), redoBtn = ibtn('redo', 'Redo (Ctrl+Y)', redo);
  const status = h('div', { class: 'statusbar' });
  const findBar = h('div', { class: 'findbar hidden' });
  const readBtn = ibtn('play', 'Read aloud — a table read with a different voice per character', () => toggleRead());
  const revBtn = h('button', { class: 'btn sm', onclick: revisionsModal, title: 'Track changes as coloured revision pages' }, icon('layers', 15), h('span', {}, 'Revisions'));
  const numBtn = mode === 'screenplay' ? h('button', { class: 'btn sm', onclick: e => menu(e.currentTarget, [
    { label: (vm.settings.sceneNumbers ? '✓ ' : '') + 'Show scene numbers', onClick: () => vm.toggleNumbers() },
    { label: vm.settings.sceneNumLock ? 'Unlock scene numbers' : 'Lock scene numbers (production)', icon: 'lock', onClick: toggleLock },
  ]) }, icon('hash', 15), 'Scene #') : null;
  const zl = h('span', { class: 'small muted', style: { minWidth: '38px', textAlign: 'center' } });
  const P0 = () => vm.P;
  const toolbar = h('div', { class: 'toolbar' },
    ibtn('sidebar', 'Toggle outline', () => { navOpen = !navOpen; nav.classList.toggle('closed', !navOpen); setTimeout(fitZoom, 20); }),
    h('span', { class: 'sep' }), typeSel, h('span', { class: 'sep' }), undoBtn, redoBtn, ibtn('search', 'Find & replace (Ctrl+F)', openFind),
    h('span', { class: 'sep' }),
    ibtn('bold', 'Bold (Ctrl+B)', () => fmt('**')), ibtn('italic', 'Italic (Ctrl+I)', () => fmt('*')), ibtn('underline', 'Underline (Ctrl+U)', () => fmt('_')),
    mode === 'screenplay' ? ibtn('dual', 'Dual dialogue (Ctrl+D) — puts this character side-by-side with the previous speaker', () => toggleDual()) : null,
    ibtn('msg', 'Add a note to this line (Ctrl+Alt+M)', () => { if (vm.current) editNote(vm.cur); else toast('Click into a line first.'); }),
    ibtn('x', 'Omit / restore the current scene (keeps its number, prints OMITTED)', () => toggleOmit()), readBtn,
    h('span', { class: 'sep' }),
    h('button', { class: 'btn sm', onclick: () => editTitle() }, icon('title', 15), 'Title page'),
    numBtn, revBtn, h('button', { class: 'btn sm', onclick: () => draftsModal(), title: 'Save, compare and restore drafts' }, icon('file', 15), 'Drafts'),
    h('span', { class: 'grow' }),
    ibtn('minus', 'Zoom out', () => { vm.zoom(-0.1); fitZoom(); }), zl, ibtn('plus', 'Zoom in', () => { vm.zoom(0.1); fitZoom(); }),
    ibtn('focus', 'Focus mode — dims everything except the line you are writing', e => { focusMode = !focusMode; scroller.classList.toggle('focus-mode', focusMode); e.currentTarget.classList.toggle('active', focusMode); }),
    h('button', { class: 'btn sm', onclick: e => { const P = P0(); menu(e.currentTarget, [
      { head: 'Import' }, { label: 'Import Fountain / Final Draft…', icon: 'upload', onClick: importScript },
      { head: 'Export' },
      { label: 'PDF / Print (revision colours)', icon: 'print', onClick: () => printNode(scriptPrintNode(P)) },
      { label: 'PDF / Print (white pages)', icon: 'print', onClick: () => printNode(scriptPrintNode(P, { revisionColors: false })) },
      { label: 'Print revised pages only', icon: 'print', onClick: () => { const r = scriptPrintNode(P, { revisedOnly: true }); if (r.querySelectorAll('.sp').length) printNode(r); else toast('No pages are marked as revised yet — start a revision or lock pages first.', true); } },
      { label: 'PDF with watermark…', icon: 'print', onClick: async () => { const w = await promptBox('Watermark', 'Recipient name or note (printed diagonally on every page)', ''); if (w) printNode(scriptPrintNode(P, { watermark: w })); } },
      mode === 'av' ? { label: 'Two-column CSV (.csv)', icon: 'download', onClick: () => download(slug(P.title) + '.csv', toAVCSV(P), 'text/csv') } : null,
      mode === 'av' ? null : { label: 'Fountain (.fountain)', icon: 'download', onClick: () => download(slug(P.title) + '.fountain', toFountain(P)) },
      mode === 'av' ? null : { label: 'Final Draft (.fdx)', icon: 'download', onClick: () => download(slug(P.title) + '.fdx', toFDX(P), 'application/xml') },
      { label: 'Plain text (.txt)', icon: 'download', onClick: () => download(slug(P.title) + '.txt', toPlainText(P)) },
    ].filter(Boolean)); } }, icon('download', 15), 'Import / Export'));

  root.append(h('div', { class: 'script-wrap' }, toolbar, findBar, h('div', { class: 'script-body' }, nav, scroller), status));
  root.parentElement.classList.add('noscroll');

  /* ---------- helpers ---------- */
  /* lines size themselves with CSS field-sizing where supported (Chrome / Android), so the costly
     measure-every-line pass only runs on older browsers */
  function fit(ta) { if (AUTO_FIELD) return; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  function fitAll(list) {
    if (AUTO_FIELD) return;
    const l = list || [...els.values()].map(x => x.ta);
    l.forEach(t => t.style.height = 'auto'); const hs = l.map(t => t.scrollHeight); l.forEach((t, i) => t.style.height = hs[i] + 'px');
  }
  function focusBlock(id, where = 'end') {
    const e = els.get(id); if (!e) return;
    e.ta.focus({ preventScroll: true });
    const p = where === 'end' ? e.ta.value.length : where === 'start' ? 0 : where;
    e.ta.setSelectionRange(p, p);
    keepVisible(e.el);
  }
  /** a command's answer: where the cursor goes */
  function go(r) { if (r && r.id) focusBlock(r.id, r.caret); }
  function keepVisible(el) {
    const r = el.getBoundingClientRect(), s0 = scroller.getBoundingClientRect(), vv = window.visualViewport;
    /* the part of the editor you can actually see: above the on-screen keyboard and the writing bar */
    const visBottom = Math.min(s0.bottom, vv ? vv.offsetTop + vv.height - (kbar && kbar.classList.contains('on') ? kbar.offsetHeight : 0) : s0.bottom);
    const s = { top: s0.top, bottom: visBottom, height: visBottom - s0.top };
    if (focusMode) scroller.scrollTop += r.top - (s.top + s.height * 0.4);
    else if (r.bottom > s.bottom - 70) scroller.scrollTop += r.bottom - s.bottom + 140;
    else if (r.top < s.top + 20) scroller.scrollTop += r.top - s.top - 100;
  }

  /* ---------- zoom ---------- */
  function fitZoom() {
    const avail = scroller.clientWidth - 32;
    const z = Math.max(0.3, Math.min(vm.settings.zoom, avail / (8.5 * 96)));
    paperWrap.style.zoom = z; zl.textContent = Math.round(z * 100) + '%';
  }

  /* ---------- the lines ---------- */
  function makeBlock(b) {
    const id = b.id;
    const ta = h('textarea', { rows: 1, spellcheck: true, 'data-id': id });
    const nd = h('button', { class: 'notedot hidden', tabindex: -1, onclick: () => editNote(id) }, icon('msg', 14));
    const el = h('div', { class: 'blk', 'data-id': id }, ta, nd, h('i', { class: 'revbar' }));
    ta.addEventListener('input', () => onInput(id, ta, el));
    ta.addEventListener('keydown', e => onKey(e, id, ta));
    ta.addEventListener('focus', () => { vm.focus(id); el.classList.add('focus'); const b = vm.block(id); if (b) typeSel.value = b.type; markNavActive(); if (window.Collab) Collab.setPresence({ block: id, view: 'script' }); kbarShow(); });
    ta.addEventListener('blur', () => { el.classList.remove('focus'); closeSuggest(); const f = vm.finishParen(id, ta.value); if (f != null) { ta.value = f; fit(ta); } kbarHideSoon(); });
    ta.addEventListener('paste', e => onPaste(e, id, ta));
    const e = { el, ta, nd, type: '' }; els.set(id, e);
    paint(b, e);
    return e;
  }
  /** bring one line's DOM up to date → whether its text changed */
  function paint(b, e) {
    if (e.type !== b.type) { if (e.type) e.el.classList.remove('t-' + e.type); e.el.classList.add('t-' + b.type); e.type = b.type; e.ta.placeholder = SM.PLACEHOLDER[b.type] || ''; e.ta.setAttribute('aria-label', b.type); }
    e.el.classList.toggle('dual', SM.isDual(b));
    e.nd.classList.toggle('hidden', !b.note); e.nd.title = b.note || '';
    if (b.rev) { e.el.dataset.rev = '1'; e.el.style.setProperty('--rev', SM.revColor(vm.P, b.rev) || '#999'); } else if (e.el.dataset.rev) { delete e.el.dataset.rev; e.el.style.removeProperty('--rev'); }
    /* a change from someone else in a live session never overwrites the line you are typing in */
    if (e.ta.value !== b.text && !(remote && document.activeElement === e.ta)) { e.ta.value = b.text; return true; }
    return false;
  }
  /** match the page to P.blocks: reuse lines by id, add / remove / move only what changed */
  function syncBlocks() {
    const B = vm.blocks, want = new Set(B.map(b => b.id)), changed = [];
    for (const [id, e] of els) if (!want.has(id)) { e.el.remove(); els.delete(id); }
    let prev = avHead;
    B.forEach(b => {
      let e = els.get(b.id);
      if (!e) { e = makeBlock(b); changed.push(e.ta); } else if (paint(b, e)) changed.push(e.ta);
      const at = prev ? prev.nextSibling : paper.firstChild;
      if (at !== e.el) paper.insertBefore(e.el, at);
      prev = e.el;
    });
    if (changed.length) fitAll(changed);
  }

  /* ---------- typing ---------- */
  function onInput(id, ta, el) {
    const b = vm.input(id, ta.value); if (!b) return;
    if (b.text !== ta.value) { const s = ta.selectionStart, e = ta.selectionEnd; ta.value = b.text; ta.setSelectionRange(s, e); }
    paint(b, els.get(id)); typeSel.value = b.type; fit(ta);
    scheduleRefresh(b.type === 'scene' || b.type === 'act');
    if (focusMode) keepVisible(el);
    showSuggest(id, ta);
  }
  function fmt(mark, id = vm.cur) {
    const e = els.get(id); if (!e) return toast('Click into a line first.');
    const ta = e.ta; ta.focus();
    const r = vm.markText(ta.value, ta.selectionStart, ta.selectionEnd, mark);
    ta.value = r.value; ta.setSelectionRange(r.start, r.end); ta.dispatchEvent(new Event('input'));
  }
  function toggleDual(id = vm.cur) {
    const on = vm.toggleDual(id);
    if (on == null) return toast('Put the cursor in a Character line, then use Dual dialogue to place it beside the speaker above.');
    toast(on ? 'Dual dialogue on — prints beside the previous speaker' : 'Dual dialogue off');
  }
  function editNote(id) {
    const b = vm.block(id); if (!b) return;
    const ta = h('textarea', { class: 'inp', rows: 5, value: b.note || '', placeholder: 'A private note on this line — never printed.' });
    modal({ title: 'Note', body: ta, buttons: [
      b.note ? { label: 'Delete note', danger: true, onClick: () => vm.setNote(id, '') } : { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: () => vm.setNote(id, ta.value) }] });
  }
  function toggleOmit() {
    if (!vm.current) return toast('Click into the scene first.');
    const r = vm.toggleOmit(); if (!r) return toast('Place the cursor inside a scene.', true);
    toast(r === 'restored' ? 'Scene restored' : 'Scene omitted — it keeps its number and prints as OMITTED. Restore it from the outline.');
  }
  function undo() { const id = vm.undo(); if (id) focusBlock(id, 'end'); }
  function redo() { const id = vm.redo(); if (id) focusBlock(id, 'end'); }
  function updateHistBtns() { undoBtn.disabled = !vm.canUndo; redoBtn.disabled = !vm.canRedo; undoBtn.style.opacity = undoBtn.disabled ? .4 : 1; redoBtn.style.opacity = redoBtn.disabled ? .4 : 1; }
  vm.onHistory = updateHistBtns;

  /* ---------- keys ---------- */
  function onKey(e, id, ta) {
    if (sug.open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sugMove(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sugMove(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); sugAccept(); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeSuggest(); return; }
    }
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) { const t = types[+e.key - 1]; if (t) { e.preventDefault(); vm.setType(id, t.k); focusBlock(id, ta.selectionStart); } return; }
    if (mod && e.altKey && k === 'm') { e.preventDefault(); editNote(id); return; }
    if (mod && k === 'b') { e.preventDefault(); fmt('**', id); return; }
    if (mod && k === 'i') { e.preventDefault(); fmt('*', id); return; }
    if (mod && k === 'u') { e.preventDefault(); fmt('_', id); return; }
    if (mod && k === 'd' && mode === 'screenplay') { e.preventDefault(); toggleDual(id); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'f') { e.preventDefault(); openFind(); return; }
    if (mod && k === 's') { e.preventDefault(); vm.flush(); Store.flush(true); toast('Saved'); return; }
    if (e.key === 'Tab') { e.preventDefault(); const at = ta.selectionStart; vm.cycleType(id, e.shiftKey ? -1 : 1); focusBlock(id, at); return; }
    if (e.key === 'Enter' && !e.shiftKey && !mod) { e.preventDefault(); go(vm.split(id, ta.value, ta.selectionStart, ta.selectionEnd)); return; }
    if (e.key === 'Enter' && mod) { e.preventDefault(); go(vm.lineAfter(id)); return; }
    const i = vm.index(id), L = vm.blocks, atStart = ta.selectionStart === 0 && ta.selectionEnd === 0, atEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
    if (e.key === 'Backspace' && !e.ctrlKey && atStart && i > 0) { e.preventDefault(); go(vm.backspace(id, ta.value)); return; }
    if (e.key === 'Delete' && atEnd && i < L.length - 1) { const r = vm.del(id, ta.value); if (r) { e.preventDefault(); go(r); } return; }
    if (mod || e.shiftKey) return;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && i > 0 && atStart) { e.preventDefault(); focusBlock(L[i - 1].id, 'end'); }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && i < L.length - 1 && atEnd) { e.preventDefault(); focusBlock(L[i + 1].id, 'start'); }
  }

  /* ---------- paste ---------- */
  function onPaste(e, id, ta) {
    const t = (e.clipboardData || window.clipboardData).getData('text'), b = vm.block(id); if (!b) return;
    if (!/\n/.test(t.trim())) {
      if (SM.CAPS.has(b.type)) { e.preventDefault(); ta.setRangeText(t.replace(/\s*\n\s*/g, ' ').toUpperCase(), ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
      return;
    }
    e.preventDefault();
    const r = vm.paste(id, ta.value, ta.selectionStart, ta.selectionEnd, parseFountain(t, mode).blocks); if (!r) return;
    go(r); toast(`Pasted ${r.count} element${r.count === 1 ? '' : 's'}`);
  }

  /* ---------- autocomplete ---------- */
  const sug = { open: false, items: [], i: 0, from: 0, to: 0, ta: null };
  const sugEl = h('div', { class: 'suggest hidden' });
  document.body.append(sugEl);
  function showSuggest(id, ta) {
    const r = ta.selectionStart === ta.selectionEnd ? vm.suggest(id, ta.value, ta.selectionStart) : null;
    if (!r) return closeSuggest();
    Object.assign(sug, r, { open: true, i: 0, ta });
    morph(sugEl, r.items.slice(0, 8).map((it, n) => h('div', { class: n === 0 ? 'on' : '', onmousedown: e => { e.preventDefault(); sug.i = n; sugAccept(); } }, it)));
    const rc = ta.getBoundingClientRect();
    sugEl.classList.remove('hidden');
    sugEl.style.left = clamp(rc.left + 20, 8, innerWidth - 220) + 'px';
    const sh = sugEl.offsetHeight;
    sugEl.style.top = (rc.bottom + 4 + sh > innerHeight - 8 ? Math.max(8, rc.top - sh - 4) : rc.bottom + 4) + 'px';
  }
  function closeSuggest() { sug.open = false; sugEl.classList.add('hidden'); }
  function sugMove(d) { const n = Math.min(sug.items.length, 8); sug.i = (sug.i + d + n) % n; [...sugEl.children].forEach((c, i) => c.classList.toggle('on', i === sug.i)); }
  function sugAccept() {
    const it = sug.items[sug.i], ta = sug.ta; if (!it) return closeSuggest();
    const r = vm.acceptSuggestion(ta.value, sug, it); ta.value = r.value; ta.setSelectionRange(r.caret, r.caret);
    closeSuggest(); ta.dispatchEvent(new Event('input'));
  }

  /* ---------- outline (scenes / notes) ---------- */
  function drawNav() {
    morph(navSeg, ['scenes', 'notes'].map(k => h('button', { 'data-key': k, class: k === vm.navMode ? 'on' : '', onclick: () => vm.setNavMode(k) }, k === 'scenes' ? 'Scenes' : 'Notes')));
    if (vm.navMode === 'notes') {
      const N = vm.notes;
      morph(navList, N.length ? N.map(n => h('li', { 'data-key': 'n:' + n.id, onclick: () => scrollToBlock(n.id) }, icon('msg', 15), h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'nh' }, n.note), h('div', { class: 'ns' }, (stripRich(n.text).slice(0, 60) || '(empty)') + (n.scene ? ' · ' + stripRich(n.scene).slice(0, 30) : '')))))
        : h('li', { class: 'act', 'data-key': 'none', style: { textTransform: 'none', letterSpacing: 0, fontWeight: 500 } }, 'No notes yet. Click a line, then the speech-bubble button (Ctrl+Alt+M).'));
      return;
    }
    const sc = vm.scenes, out = []; let lastAct = null;
    if (!sc.length) out.push(h('li', { class: 'act', 'data-key': 'none' }, 'No scenes yet'));
    sc.forEach(s => {
      if (s.act !== lastAct && s.act) out.push(h('li', { class: 'act', 'data-key': 'a:' + s.id }, s.act));
      lastAct = s.act;
      const li = h('li', { 'data-id': s.id, 'data-key': s.id, title: 'Click to jump · drag to reorder', style: s.color ? { borderLeft: `4px solid ${s.color}` } : {}, onclick: () => scrollToBlock(s.id) },
        h('span', { class: 'num' }, s.num),
        h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'nh' }, s.label), s.synopsis ? h('div', { class: 'ns' }, s.synopsis) : null),
        h('span', { class: 'np' }, fmtEighths(s.eighths)));
      out.push(DnD.item(li, 'scene', s.id, (id, after) => { if (vm.moveScene(id, s.id, after)) toast('Scene moved'); }, { edge: 'y' }));
    });
    const om = vm.omitted;
    if (om.length) out.push(h('li', { class: 'act', 'data-key': 'omh' }, 'Omitted scenes'), ...om.map(b => h('li', { 'data-key': 'om:' + b.id, style: { opacity: .7 } }, h('span', { class: 'num' }, b.num || '—'),
      h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'nh', style: { textDecoration: 'line-through' } }, stripRich(b.text) || '(untitled)')),
      h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); vm.restoreScene(b.id); } }, 'Restore'))));
    morph(navList, out);
    markNavActive();
  }
  function markNavActive() { const sid = vm.sceneAt(); $$('li[data-id]', navList).forEach(li => li.classList.toggle('on', li.dataset.id === sid)); }
  function scrollToBlock(id) {
    const e = els.get(id); if (!e) return;
    const r = e.el.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + r.top - s.top - 70, behavior: 'smooth' });
    e.ta.focus({ preventScroll: true }); e.ta.setSelectionRange(e.ta.value.length, e.ta.value.length);
  }

  /* ---------- page breaks, scene numbers, status bar ---------- */
  let rt = null;
  function scheduleRefresh(now) { clearTimeout(rt); if (now) refresh(); else rt = setTimeout(refresh, 450); }
  function refresh() {
    clearTimeout(rt); vm.renumber();
    const P = vm.P, pg = paginate(P), scMap = new Map(vm.scenes.map(x => [x.id, x.num])); let prev = -1, inOm = false;
    P.blocks.forEach((b, i) => {
      if (b.type === 'scene' || b.type === 'act') inOm = b.type === 'scene' && !!b.om;
      const e = els.get(b.id); if (!e) return; e.el.classList.toggle('omitted', inOm);
      const pp = pg.blockPage[i];
      if (pp > 0 && pp !== prev) e.el.dataset.page = pg.labels[pp]; else delete e.el.dataset.page;
      prev = pp;
      if (b.type === 'scene' && scMap.has(b.id)) e.el.dataset.num = scMap.get(b.id); else delete e.el.dataset.num;
    });
    const rev = vm.currentRev, st = vm.stats;
    revBtn.classList.toggle('active', !!rev); revBtn.lastChild.textContent = rev ? rev.name : 'Revisions';
    morph(status, [h('span', {}, `${pg.count} page${pg.count === 1 ? '' : 's'}`), h('span', {}, `${st.scenes} scene${st.scenes === 1 ? '' : 's'}`), h('span', {}, `${st.words.toLocaleString()} words`),
      h('span', {}, `~${SM.runtime(mode, pg.count, st.words)} min runtime`),
      rev ? h('span', { 'data-key': 'rev', style: { color: 'var(--accent)', fontWeight: 600 } }, `Tracking: ${rev.name}`) : null, h('span', { class: 'grow', 'data-key': 'g' }),
      h('span', { class: 'hint', 'data-key': 'hint' }, Device.touchOn() ? 'Enter: next line · the bar above the keyboard changes the element type' : 'Tab: change element · Enter: next line · Ctrl+B/I/U: format')]);
    drawNav();
  }

  /** every redraw: the lines, the page look, the toolbar, then page breaks and the outline */
  function draw() {
    const S = vm.settings;
    paper.className = 'paper ' + mode + (S.multicam ? ' multicam' : '');
    scroller.classList.toggle('show-nums', vm.numbersShown);
    if (numBtn) numBtn.classList.toggle('active', !!S.sceneNumbers);
    syncBlocks(); updateHistBtns(); refresh();
    const b = vm.current; if (b) typeSel.value = b.type;
  }

  /* ---------- find & replace ---------- */
  let matches = [], mi = -1;
  function openFind() {
    findBar.classList.remove('hidden');
    const f = h('input', { class: 'inp', placeholder: 'Find…', oninput: () => runFind(true), onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') closeFind(); } });
    const r = h('input', { class: 'inp', placeholder: 'Replace with…', onkeydown: e => { if (e.key === 'Escape') closeFind(); } });
    const cnt = h('span', { class: 'small muted' });
    function runFind(first) { matches = vm.findAll(f.value); mi = matches.length ? (first ? 0 : Math.min(mi, matches.length - 1)) : -1; cnt.textContent = f.value ? `${matches.length} found` : ''; if (first && matches.length) show(); }
    function show() { const m = matches[mi]; if (!m) return; const e = els.get(m.id); if (!e) return; e.ta.focus({ preventScroll: true }); e.ta.setSelectionRange(m.at, m.at + f.value.length); const rr = e.el.getBoundingClientRect(), s = scroller.getBoundingClientRect(); scroller.scrollTop += rr.top - s.top - s.height / 3; cnt.textContent = `${mi + 1} of ${matches.length}`; f.focus(); }
    function stepFind(d) { if (!matches.length) return; mi = (mi + d + matches.length) % matches.length; show(); }
    function replaceAll() { if (!f.value) return; const n = vm.replaceAll(f.value, r.value); runFind(false); toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`); }
    findBar.replaceChildren(f, r, h('button', { class: 'btn sm', onclick: () => stepFind(-1) }, icon('up', 14)), h('button', { class: 'btn sm', onclick: () => stepFind(1) }, icon('down', 14)),
      h('button', { class: 'btn sm', onclick: replaceAll }, 'Replace all'), cnt, h('span', { class: 'grow' }), ibtn('x', 'Close', closeFind));
    f.focus();
  }
  function closeFind() { findBar.classList.add('hidden'); matches = []; const e = els.get(vm.cur); if (e) focusBlock(vm.cur, e.ta.selectionStart); }

  /* ---------- title page, numbers ---------- */
  function editTitle() {
    const f = ([k, label, multi]) => h('div', { class: 'field' }, h('label', { class: 'lbl' }, label),
      h(multi ? 'textarea' : 'input', { class: 'inp', value: vm.meta(k), rows: 3, oninput: e => { vm.setMeta(k, e.target.value); if (k === 'title') { const t = $('.ptitle'); if (t) t.value = e.target.value; } } }));
    const F = vm.titleFields(), logline = F.pop();
    modal({ title: 'Title page', body: h('div', {}, ...F.map(f),
      ...(mode === 'screenplay' ? [h('label', { class: 'row', style: { margin: '2px 0 14px' } }, h('input', { type: 'checkbox', checked: !!vm.settings.multicam, onchange: e => vm.setMulticam(e.target.checked) }), h('span', {}, h('b', {}, 'Sitcom (multi-camera) format'), h('span', { class: 'muted small', style: { display: 'block' } }, 'Double-spaced dialogue, ALL-CAPS action, “SCENE A” lettering and underlined headings.')))] : []),
      f(logline)), buttons: [{ label: 'Done', primary: true }] });
  }
  async function toggleLock() {
    if (vm.settings.sceneNumLock) { if (await confirmBox('Unlock scene numbers? Scenes will renumber 1, 2, 3… and any A-scenes (like 12A) will be lost.', 'Unlock', 'Unlock scene numbers')) vm.unlockNumbers(); }
    else { vm.lockNumbers(); toast('Scene numbers locked. New scenes get numbers like 4A, so existing numbers never change.'); }
  }

  /* ---------- revisions and page locking ---------- */
  function revisionsModal() {
    const body = h('div'), off = vm.subscribe(() => drawRev());
    function drawRev() {
      const cur = vm.currentRev, R = vm.revisions, nextC = vm.nextRevColor, S = vm.settings;
      const sel = h('select', { class: 'inp', style: { width: 'auto' } }, SM.REV_COLORS.map(c => h('option', { value: c.k, selected: c.k === nextC.k }, c.label)));
      const date = h('input', { class: 'inp', type: 'date', value: localISODate(), style: { width: 'auto' } });
      morph(body, [h('p', { class: 'muted', style: { marginTop: 0 } }, 'Start a revision to track every line you change after a draft is circulated. Changed lines get a * in the margin, and the pages print on coloured paper — the way a production tracks script changes.'),
        cur ? h('div', { 'data-key': 'cur', class: 'card', style: { padding: '12px 14px', marginBottom: '12px', borderColor: 'var(--accent)' } }, h('b', {}, 'Tracking: '), cur.name, h('button', { class: 'btn sm', style: { marginLeft: '12px' }, onclick: () => vm.stopTracking() }, 'Stop tracking')) : null,
        R.length ? h('table', { 'data-key': 'tbl', class: 'tbl', style: { marginBottom: '14px' } }, h('thead', {}, h('tr', {}, ['Colour', 'Name', 'Date', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, R.map(r => h('tr', { 'data-key': r.id }, h('td', {}, h('span', { style: { display: 'inline-block', width: '22px', height: '22px', borderRadius: '2px', background: r.color, border: '1px solid var(--border)' } })), h('td', {}, r.name + (r.id === S.rev ? '  (current)' : '')), h('td', {}, r.date),
            h('td', {}, r.id === S.rev ? null : h('button', { class: 'btn sm', onclick: () => vm.track(r.id) }, 'Track this')))))) : null,
        h('div', { 'data-key': 'new', class: 'row wrap' }, sel, date, h('button', { class: 'btn primary', onclick: () => { const r = vm.startRevision(sel.value, date.value); if (r) toast(`Now tracking changes as the ${r.name.replace(/ Revision$/, '')} revision`); } }, 'Start new revision')),
        vm.hasRevMarks ? h('div', { 'data-key': 'clear', style: { marginTop: '14px' } }, h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox('Remove all revision marks and colours from the script? (Use this when you issue a clean, all-white script.)', 'Clear marks')) vm.clearMarks(); } }, 'Clear all revision marks')) : null,
        h('div', { 'data-key': 'lock', class: 'pf-sec', style: { marginTop: '18px' } }, h('h4', {}, 'Page locking'),
          h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Lock pages when the script goes into production. Every page keeps its number; text you add spills onto A-pages (12A, 12B) instead of renumbering everything after it. Then use Export → “Print revised pages only”.'),
          S.pageLock ? h('div', { class: 'row', 'data-key': 'locked' }, h('span', { class: 'pill accent' }, 'Pages locked'), h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox('Unlock pages? Pages will renumber 1, 2, 3… and A-pages will be lost.', 'Unlock', 'Unlock pages')) vm.unlockPages(); } }, 'Unlock'))
            : h('button', { class: 'btn', 'data-key': 'lockbtn', onclick: () => { vm.lockPages(); toast('Pages locked at the current page numbers'); } }, icon('lock', 15), 'Lock pages now'))]);
    }
    drawRev(); modal({ title: 'Script revisions', body, wide: false, buttons: [{ label: 'Done', primary: true }], onClose: off });
  }

  /* ---------- table read: browser speech, a different voice / pitch per character ---------- */
  let reading = false;
  function stopRead() { reading = false; Device.awake('read', false); try { speechSynthesis.cancel(); } catch (e) { } readBtn.classList.remove('active'); $$('.blk.reading', paper).forEach(x => x.classList.remove('reading')); }
  /* Chrome (Android especially) loads its voices a moment after the first request */
  async function loadVoices() {
    let v = speechSynthesis.getVoices();
    if (!v.length) { await new Promise(r => { speechSynthesis.addEventListener('voiceschanged', r, { once: true }); setTimeout(r, 1500); }); v = speechSynthesis.getVoices(); }
    const lang = (navigator.language || 'en').slice(0, 2).toLowerCase(), mine = v.filter(x => x.lang.toLowerCase().startsWith(lang));
    return mine.length ? mine : v.filter(x => /^en/i.test(x.lang));
  }
  async function toggleRead() {
    if (!('speechSynthesis' in window)) return toast('This browser has no speech engine for table reads.', true);
    if (reading) return stopRead();
    reading = true; readBtn.classList.add('active');
    const Q = vm.readQueue(vm.cur || (vm.blocks[0] || {}).id); let i = 0, nVoice = 0; const voices = await loadVoices(), assigned = new Map();
    if (!reading) return;
    Device.awake('read', true); toast('Reading aloud from here — click the speaker button again to stop.');
    const next = () => {
      if (!reading || i >= Q.length) return stopRead();
      const q = Q[i++], text = stripRich(q.type === 'scene' ? SM.spokenHeading(q.text) : q.text).trim(); if (!text) return next();
      const u = new SpeechSynthesisUtterance(text); u.rate = 1.02;
      if (q.type === 'dialogue') {
        const who = normChar(q.speaker); if (!assigned.has(who)) assigned.set(who, nVoice++);
        const k = assigned.get(who); if (voices.length) u.voice = voices[k % voices.length]; u.pitch = 0.75 + (k % 6) * 0.14;
      } else { if (voices.length) u.voice = voices[0]; u.pitch = 1; u.rate = 1.1; }
      const el = els.get(q.id) && els.get(q.id).el; if (el) { el.classList.add('reading'); keepVisible(el); }
      u.onend = u.onerror = () => { if (el) el.classList.remove('reading'); next(); };
      speechSynthesis.speak(u);
    };
    next();
  }

  /* ---------- drafts ---------- */
  function redline(s) {
    const parts = wordDiff(s.old, s.now);
    modal({ title: 'Redline — ' + (stripRich(s.head) || 'scene'), wide: true, body: h('div', { class: 'redline' }, h('p', { class: 'small muted', style: { marginTop: 0 } }, [h('ins', {}, 'inserted'), '  ', h('del', {}, 'deleted')]), h('div', { class: 'rl-body' }, parts.map(x => x.t === '+' ? h('ins', {}, x.v) : x.t === '-' ? h('del', {}, x.v) : x.v))), buttons: [{ label: 'Close', primary: true }] });
  }
  function draftsModal() {
    vm.flush(); const body = h('div'); let dlg; const nameIn = h('input', { class: 'inp', placeholder: 'Name this draft — e.g. “Second draft, after notes”' });
    const fmtD = t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    function compare(sn) {
      const P = vm.P, d = diffDraft(P, sn), st = scriptStats(P), li = (arr, f) => arr.length ? h('ul', { style: { margin: '4px 0 12px', paddingLeft: '18px' } }, arr.slice(0, 12).map(f), arr.length > 12 ? h('li', { class: 'muted' }, `…and ${arr.length - 12} more`) : null) : h('div', { class: 'muted', style: { margin: '4px 0 12px' } }, 'None');
      modal({ title: `“${sn.name}” → now`, body: h('div', {}, h('div', { class: 'sum', style: { marginBottom: '12px' } }, [['Pages', `${sn.pages} → ${st.pages}`], ['Scenes', `${sn.scenes} → ${st.scenes}`], ['Words', `${sn.words.toLocaleString()} → ${st.words.toLocaleString()}`]].map(([k, v]) => h('div', {}, h('span', {}, k), h('b', { style: { fontSize: '18px' } }, v)))),
        h('b', {}, `Scenes added (${d.added.length})`), li(d.added, s => h('li', {}, stripRich(s.head) || '(untitled)')),
        h('b', {}, `Scenes removed (${d.removed.length})`), li(d.removed, s => h('li', {}, stripRich(s.head) || '(untitled)')),
        h('b', {}, `Scenes changed (${d.changed.length})`), li(d.changed, s => h('li', {}, stripRich(s.head) || '(untitled)', h('span', { class: 'muted' }, `  ${s.delta >= 0 ? '+' : ''}${s.delta} words`), h('button', { class: 'btn sm', style: { marginLeft: '8px' }, onclick: () => redline(s) }, 'Redline'))),
        d.moved ? h('p', { class: 'small muted' }, 'Scene order has changed.') : null), buttons: [{ label: 'Close', primary: true }] });
    }
    function drawDrafts() {
      const snaps = [...(vm.P.snapshots || [])].reverse();
      morph(body, [h('p', { class: 'muted', style: { marginTop: 0 } }, 'A draft is a saved copy of your script text. One is saved automatically on each day you write, and before bulk changes such as imports or renaming a character. Restoring a draft saves your current script first, so nothing is ever lost.'),
        h('div', { class: 'row', style: { marginBottom: '14px' } }, nameIn, h('button', { class: 'btn primary', onclick: () => { vm.saveDraft(nameIn.value.trim() || 'Draft ' + new Date().toLocaleDateString()); nameIn.value = ''; toast('Draft saved'); } }, icon('plus', 15), 'Save draft')),
        snaps.length ? h('table', { class: 'tbl', 'data-key': 'tbl' }, h('thead', {}, h('tr', {}, ['Draft', 'Saved', 'Pages', 'Words', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, snaps.map(sn => h('tr', { 'data-key': sn.id }, h('td', { style: { padding: '9px 10px', fontWeight: sn.auto ? 400 : 650 } }, sn.name, sn.auto ? h('span', { class: 'pill', style: { marginLeft: '6px' } }, 'auto') : null), h('td', { style: { padding: '9px 10px' } }, fmtD(sn.date)), h('td', { style: { padding: '9px 10px' } }, String(sn.pages)), h('td', { style: { padding: '9px 10px' } }, sn.words.toLocaleString()),
            h('td', { style: { whiteSpace: 'nowrap' } }, h('button', { class: 'btn sm', onclick: () => compare(sn) }, 'Compare'), ' ',
              h('button', { class: 'btn sm', onclick: async () => { if (!(await confirmBox(`Restore “${sn.name}”? Your current script is saved as a draft first.`, 'Restore', 'Restore draft'))) return; vm.restoreDraft(sn); toast('Draft restored'); dlg.close(); } }, 'Restore'), ' ',
              ibtn('trash', 'Delete draft', () => vm.deleteDraft(sn), 'danger')))))) : h('div', { class: 'empty', 'data-key': 'none', style: { padding: '24px' } }, 'No drafts yet.')]);
    }
    const off = vm.subscribe(drawDrafts);
    drawDrafts(); dlg = modal({ title: 'Drafts', wide: true, body, buttons: [{ label: 'Close', primary: true }], onClose: off });
  }

  /* ---------- import ---------- */
  function applyImport(res, replace) {
    const n = vm.importScript(res, replace); const t = $('.ptitle'); if (t) t.value = vm.P.title;
    toast(`Imported ${n} elements`);
  }
  async function importScript() {
    const f = await pickFile(mode === 'av' ? '.csv,.txt' : '.fountain,.txt,.fdx,.md,.spmd,.pdf,.highland,.zip'); if (!f) return;
    if (mode === 'av') {
      if (!/\.(csv|txt)$/i.test(f.name)) return toast('Two-column scripts import from a CSV with Video and Audio columns.', true);
      const blocks = avFromCSV(await readText(f)); if (!blocks.length) return toast('No rows found in that CSV.', true);
      return modal({ title: 'Import two-column script', body: h('p', { style: { margin: 0 } }, `“${f.name}” has ${blocks.length} video / audio items. Replace the current script, or add them to the end?`), buttons: [{ label: 'Cancel' }, { label: 'Add to end', onClick: () => applyImport({ meta: {}, blocks }, false) }, { label: 'Replace script', primary: true, onClick: () => applyImport({ meta: {}, blocks }, true) }] });
    }
    if (/\.pdf$/i.test(f.name)) { pdfImportFlow(f, { mode, lockMode: true, apply: [{ label: 'Add to end', run: r => applyImport(r, false) }, { label: 'Replace script', run: r => applyImport(r, true) }] }); return; }
    try {
      const txt = await readScriptFile(f);
      const res = /\.fdx$/i.test(f.name) ? parseFDX(txt) : parseFountain(txt, mode);
      if (!res.blocks.length) return toast('No script content found in that file.', true);
      const apply = replace => applyImport({ meta: res.meta, blocks: res.blocks }, replace);
      modal({ title: 'Import script', body: h('p', { style: { margin: 0 } }, `“${f.name}” contains ${res.blocks.length} script elements. Replace the current script, or add them to the end?`),
        buttons: [{ label: 'Cancel' }, { label: 'Add to end', onClick: () => apply(false) }, { label: 'Replace script', primary: true, onClick: () => apply(true) }] });
    } catch (e) { toast('Could not read that file.', true); }
  }

  /* ---------- touch keyboards have no Tab or Ctrl: a bar above the keyboard changes the element type and formats ---------- */
  function kbarBuild() {
    const hold = fn => ({ onpointerdown: e => { e.preventDefault(); }, onclick: e => { e.preventDefault(); if (vm.current) fn(vm.cur); } });
    const B = (label, title, fn, cls = '') => h('button', Object.assign({ class: 'kb ' + cls, title, type: 'button' }, hold(fn)), label);
    const short = l => l.replace(/ \(.*\)/, '').replace('Scene Heading', 'Scene').replace('Parenthetical', '( )').replace('Stage Direction', 'Direction').replace('Light / Sound Cue', 'Cue').replace('Setting / Description', 'Setting').replace('On-screen Text / Graphic', 'Text');
    const keep = id => { const e = els.get(id); return e ? e.ta.selectionStart : 'end'; };
    kbar = h('div', { class: 'kbar', role: 'toolbar', 'aria-label': 'Writing keys' },
      B('⇤', 'Previous element type', id => { const at = keep(id); vm.cycleType(id, -1); focusBlock(id, at); }), B('⇥', 'Next element type (Tab)', id => { const at = keep(id); vm.cycleType(id, 1); focusBlock(id, at); }),
      h('span', { class: 'kb-sep' }), ...types.slice(0, 8).map(t => B(short(t.label), t.label, id => { const at = keep(id); vm.setType(id, t.k); focusBlock(id, at); kbarShow(); }, 'type')),
      h('span', { class: 'kb-sep' }), B('B', 'Bold', id => fmt('**', id), 'b'), B('I', 'Italic', id => fmt('*', id), 'i'), B('U', 'Underline', id => fmt('_', id), 'u'), B('✎', 'Note on this line', id => editNote(id)),
      h('span', { class: 'kb-sep' }), B('↶', 'Undo', () => undo()), B('↷', 'Redo', () => redo()), B('⌄', 'Hide keyboard', () => { const a = document.activeElement; a && a.blur && a.blur(); }, 'done'));
    document.body.append(kbar);
    /* shown only while the on-screen keyboard is up: with a keyboard cover attached there is no soft
       keyboard, the viewport keeps its height, and Tab / Ctrl work as on a computer */
    const place = () => {
      if (!kbar) return; const vv = window.visualViewport, gap = vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) : 0;
      kbar.style.bottom = gap + 'px';
      kbar.classList.toggle('on', !!kbar._want && (!vv || gap > 120));
    };
    if (window.visualViewport) { visualViewport.addEventListener('resize', place); visualViewport.addEventListener('scroll', place); }
    kbar._place = place; kbar._unbind = () => { if (window.visualViewport) { visualViewport.removeEventListener('resize', place); visualViewport.removeEventListener('scroll', place); } };
  }
  function kbarShow() {
    if (!document.documentElement.dataset.touch) return; clearTimeout(kbarT); if (!kbar) kbarBuild(); kbar._want = true; kbar._place(); const b = vm.current; if (b) $$('.kb.type', kbar).forEach((x, i) => x.classList.toggle('active', types[i] && types[i].k === b.type));
  }
  function kbarHideSoon() { clearTimeout(kbarT); kbarT = setTimeout(() => { if (kbar && !(document.activeElement && paper.contains(document.activeElement))) { kbar._want = false; kbar.classList.remove('on'); } }, 220); }

  /* ---------- go ---------- */
  const unbind = bindView(vm, draw);
  fitZoom(); autoSnapshot(vm.P);
  const first = vm.blocks.find(b => b.text === '') || vm.blocks[0];
  setTimeout(() => { fitAll(); if (UI.scene && els.has(UI.scene)) scrollToBlock(UI.scene); else if (first && vm.blocks.length <= 2) focusBlock(first.id, 0); }, 60);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitAll());
  const onResize = () => { fitZoom(); fitAll(); };
  addEventListener('resize', onResize);
  const onGlobal = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.target.closest('.overlay')) { e.preventDefault(); openFind(); } };
  document.addEventListener('keydown', onGlobal);
  /* changes from other people in a live session: redraw, but never overwrite the line being typed */
  if (window.Collab) Collab.scriptHook = { remote() { remote = true; try { draw(); fitZoom(); } finally { remote = false; } } };
  return () => {
    if (window.Collab) Collab.scriptHook = null; if (reading) stopRead(); clearTimeout(kbarT); clearTimeout(rt); if (kbar) { kbar._unbind(); kbar.remove(); kbar = null; }
    unbind(); Store.flush(); removeEventListener('resize', onResize); document.removeEventListener('keydown', onGlobal); sugEl.remove(); root.parentElement.classList.remove('noscroll');
    const o = vm.P ? orphanReport(vm.P) : { total: 0 };
    if (o.total) toast(`${o.total} item${o.total > 1 ? 's' : ''} (shots, tags, frames…) belong to scenes you deleted. Review under Backup → Clean up unused data.`, true);
  };
};
