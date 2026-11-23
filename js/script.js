'use strict';
/* ===================================================================
   Script editor — screenplay & stage play
   =================================================================== */
const Views = {};

const PLACEHOLDER = {
  scene: 'INT. LOCATION - DAY', action: 'Describe what we see and hear…', character: 'CHARACTER', paren: '(parenthetical)', dialogue: 'Dialogue…',
  transition: 'CUT TO:', shot: 'CLOSE ON…', act: 'ACT ONE', video: 'Describe the picture…', audio: 'Narration, dialogue…', super: 'ON-SCREEN TEXT', sfx: 'Music / SFX cue…', setting: 'Describe the setting…', direction: 'Stage direction…', cue: 'LX 1 — GO',
};
const TRANSITIONS = ['CUT TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'DISSOLVE TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'BLACKOUT.', 'LIGHTS UP.', 'END OF ACT.'];
const TIMES = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME'];
const SC_PREFIX = /^(INT\.?\/EXT\.|INT\.|EXT\.|EST\.|I\/E\.)/i;

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
  const P = Store.P;
  const types = TYPES[P.mode];
  const typeKeys = types.map(t => t.k);
  const defType = DEFAULT_TYPE[P.mode];
  const els = new Map();
  let curId = null, navOpen = innerWidth > 1100, focusMode = false, navMode = 'scenes';

  /* ---------- history ---------- */
  const hist = { s: [], i: -1 }; let pend = null;
  const snap = () => JSON.stringify(P.blocks.map(b => [b.id, b.type, b.text, b.rev || '', b.num || '', b.note || '', b.lockPg || 0, b.om ? 1 : 0]));
  hist.s.push(snap()); hist.i = 0;
  function runCommit() {
    pend = null;
    const s = snap(); if (s === hist.s[hist.i]) return;
    hist.s = hist.s.slice(0, hist.i + 1); hist.s.push(s);
    if (hist.s.length > 250) hist.s.shift();
    hist.i = hist.s.length - 1; updateHistBtns();
  }
  function commit(now) { clearTimeout(pend); pend = null; Store.touch(); if (now) runCommit(); else pend = setTimeout(runCommit, 700); }
  function flushPending() { if (pend) { clearTimeout(pend); runCommit(); } }
  function restore(s) {
    P.blocks = JSON.parse(s).map(([id, type, text, rev, num, note, lockPg, om]) => { const b = { id, type, text }; if (rev) b.rev = rev; if (num) b.num = num; if (note) b.note = note; if (lockPg) b.lockPg = lockPg; if (om) b.om = true; return b; });
    renderAll(); scheduleRefresh(true); Store.touch();
    const id = els.has(curId) ? curId : P.blocks[0].id; focusBlock(id, 'end');
  }
  function undo() { flushPending(); if (hist.i > 0) { hist.i--; restore(hist.s[hist.i]); updateHistBtns(); } }
  function redo() { flushPending(); if (hist.i < hist.s.length - 1) { hist.i++; restore(hist.s[hist.i]); updateHistBtns(); } }
  function updateHistBtns() { undoBtn.disabled = hist.i <= 0; redoBtn.disabled = hist.i >= hist.s.length - 1; undoBtn.style.opacity = undoBtn.disabled ? .4 : 1; redoBtn.style.opacity = redoBtn.disabled ? .4 : 1; }

  /* ---------- DOM skeleton ---------- */
  const paper = h('div', { class: 'paper ' + P.mode + (P.settings.multicam ? ' multicam' : '') });
  const paperWrap = h('div', { class: 'paper-wrap' }, paper);
  const numsOn = () => P.settings.sceneNumbers || P.settings.sceneNumLock || P.settings.multicam;
  const scroller = h('div', { class: 'script-scroll' + (numsOn() ? ' show-nums' : '') }, paperWrap);
  const navList = h('ul', { class: 'navlist' });
  const navSeg = h('div', { class: 'seg', style: { margin: '0 14px 8px' } }, ['scenes', 'notes'].map(k => h('button', { 'data-k': k, class: k === navMode ? 'on' : '', onclick: () => { navMode = k; $$('button', navSeg).forEach(b => b.classList.toggle('on', b.dataset.k === k)); renderNav(); } }, k === 'scenes' ? 'Scenes' : 'Notes')));
  const nav = h('div', { class: 'navp' + (navOpen ? '' : ' closed') },
    h('div', { class: 'navp-h' }, h('span', { class: 'grow' }, 'Outline'), h('button', { class: 'btn sm', onclick: addScene }, icon('plus', 14), 'Scene')), navSeg, navList);
  const typeSel = h('select', { class: 'typesel', title: 'Element type (Tab cycles, Ctrl+1…8 sets)', onchange: () => { const b = curBlock(); if (b) { setType(b, typeSel.value); focusBlock(b.id, els.get(b.id).ta.selectionStart); } } },
    types.map((t, i) => h('option', { value: t.k }, `${t.label}  (Ctrl+${i + 1})`)));
  const undoBtn = ibtn('undo', 'Undo (Ctrl+Z)', undo), redoBtn = ibtn('redo', 'Redo (Ctrl+Y)', redo);
  const status = h('div', { class: 'statusbar' });
  const findBar = h('div', { class: 'findbar hidden' });
  const readBtn = ibtn('play', 'Read aloud — a table read with a different voice per character', () => toggleRead());
  const draftsBtn = h('button', { class: 'btn sm', onclick: () => draftsModal(), title: 'Save, compare and restore drafts' }, icon('file', 15), 'Drafts');
  const revBtn = h('button', { class: 'btn sm', onclick: revisionsModal, title: 'Track changes as coloured revision pages' }, icon('layers', 15), 'Revisions');
  const toolbar = h('div', { class: 'toolbar' },
    ibtn('sidebar', 'Toggle outline', () => { navOpen = !navOpen; nav.classList.toggle('closed', !navOpen); setTimeout(fitZoom, 20); }),
    h('span', { class: 'sep' }), typeSel, h('span', { class: 'sep' }), undoBtn, redoBtn, ibtn('search', 'Find & replace (Ctrl+F)', openFind),
    h('span', { class: 'sep' }),
    ibtn('bold', 'Bold (Ctrl+B)', () => fmt('**')), ibtn('italic', 'Italic (Ctrl+I)', () => fmt('*')), ibtn('underline', 'Underline (Ctrl+U)', () => fmt('_')),
    P.mode === 'screenplay' ? ibtn('dual', 'Dual dialogue (Ctrl+D) — puts this character side-by-side with the previous speaker', () => toggleDual()) : null,
    ibtn('msg', 'Add a note to this line (Ctrl+Alt+M)', () => { const b = curBlock(); if (b) editNote(b); else toast('Click into a line first.'); }),
    ibtn('x', 'Omit / restore the current scene (keeps its number, prints OMITTED)', () => toggleOmit()), readBtn,
    h('span', { class: 'sep' }),
    h('button', { class: 'btn sm', onclick: () => editTitle() }, icon('title', 15), 'Title page'),
    P.mode === 'screenplay' ? h('button', { class: 'btn sm', id: 'numBtn', onclick: e => menu(e.currentTarget, [
      { label: (P.settings.sceneNumbers ? '✓ ' : '') + 'Show scene numbers', onClick: toggleNums },
      { label: P.settings.sceneNumLock ? 'Unlock scene numbers' : 'Lock scene numbers (production)', icon: 'lock', onClick: toggleLock },
    ]) }, icon('hash', 15), 'Scene #') : null,
    revBtn, draftsBtn,
    h('span', { class: 'grow' }),
    ibtn('minus', 'Zoom out', () => zoom(-0.1)), h('span', { class: 'small muted', id: 'zl', style: { minWidth: '38px', textAlign: 'center' } }), ibtn('plus', 'Zoom in', () => zoom(0.1)),
    ibtn('focus', 'Focus mode — dims everything except the line you are writing', e => { focusMode = !focusMode; scroller.classList.toggle('focus-mode', focusMode); e.currentTarget.classList.toggle('active', focusMode); }),
    h('button', { class: 'btn sm', onclick: e => menu(e.currentTarget, [
      { head: 'Import' }, { label: 'Import Fountain / Final Draft…', icon: 'upload', onClick: importScript },
      { head: 'Export' },
      { label: 'PDF / Print (revision colours)', icon: 'print', onClick: () => printNode(scriptPrintNode(P)) },
      { label: 'PDF / Print (white pages)', icon: 'print', onClick: () => printNode(scriptPrintNode(P, { revisionColors: false })) },
      { label: 'Print revised pages only', icon: 'print', onClick: () => { const r = scriptPrintNode(P, { revisedOnly: true }); if (r.querySelectorAll('.sp').length) printNode(r); else toast('No pages are marked as revised yet — start a revision or lock pages first.', true); } },
      { label: 'PDF with watermark…', icon: 'print', onClick: async () => { const w = await promptBox('Watermark', 'Recipient name or note (printed diagonally on every page)', ''); if (w) printNode(scriptPrintNode(P, { watermark: w })); } },
      P.mode === 'av' ? { label: 'Two-column CSV (.csv)', icon: 'download', onClick: () => download(slug(P.title) + '.csv', toAVCSV(P), 'text/csv') } : null,
      P.mode === 'av' ? null : { label: 'Fountain (.fountain)', icon: 'download', onClick: () => download(slug(P.title) + '.fountain', toFountain(P)) },
      P.mode === 'av' ? null : { label: 'Final Draft (.fdx)', icon: 'download', onClick: () => download(slug(P.title) + '.fdx', toFDX(P), 'application/xml') },
      { label: 'Plain text (.txt)', icon: 'download', onClick: () => download(slug(P.title) + '.txt', toPlainText(P)) },
    ].filter(Boolean)) }, icon('download', 15), 'Import / Export'));

  root.append(h('div', { class: 'script-wrap' }, toolbar, findBar, h('div', { class: 'script-body' }, nav, scroller), status));
  root.parentElement.classList.add('noscroll');

  /* ---------- helpers ---------- */
  const curBlock = () => P.blocks.find(b => b.id === curId);
  const idx = b => P.blocks.indexOf(b);
  function fit(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  function fitAll() {
    const l = [...els.values()].map(x => x.ta);
    l.forEach(t => t.style.height = 'auto'); const hs = l.map(t => t.scrollHeight); l.forEach((t, i) => t.style.height = hs[i] + 'px');
  }
  function focusBlock(id, where = 'end') {
    const e = els.get(id); if (!e) return;
    e.ta.focus({ preventScroll: true });
    const p = where === 'end' ? e.ta.value.length : where === 'start' ? 0 : where;
    e.ta.setSelectionRange(p, p);
    keepVisible(e.el);
  }
  function keepVisible(el) {
    const r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    if (focusMode) scroller.scrollTop += r.top - (s.top + s.height * 0.4);
    else if (r.bottom > s.bottom - 70) scroller.scrollTop += r.bottom - s.bottom + 140;
    else if (r.top < s.top + 20) scroller.scrollTop += r.top - s.top - 100;
  }
  function newBlock(type, text = '') { const b = { id: uid(), type, text }; if (P.settings.rev) b.rev = P.settings.rev; return b; }
  function markRev(b) { if (P.settings.rev && b.rev !== P.settings.rev) { b.rev = P.settings.rev; applyRev(b); } }
  function applyRev(b) {
    const e = els.get(b.id); if (!e) return;
    if (b.rev) { e.el.dataset.rev = '1'; e.el.style.setProperty('--rev', revColor(P, b.rev) || '#999'); } else { delete e.el.dataset.rev; e.el.style.removeProperty('--rev'); }
  }
  function warnSceneLoss(b) {
    if (b.type !== 'scene') return;
    const n = sceneDataCount(P, b.id);
    if (n) toast(`That scene had ${n} linked item${n > 1 ? 's' : ''} (shots, tags, frames, schedule). Ctrl+Z restores it; otherwise clean up from the Backup menu.`, true);
  }

  /* ---------- zoom ---------- */
  function fitZoom() {
    const avail = scroller.clientWidth - 32;
    const z = Math.max(0.3, Math.min(P.settings.zoom, avail / (8.5 * 96)));
    paperWrap.style.zoom = z;
    $('#zl', toolbar).textContent = Math.round(z * 100) + '%';
  }
  function zoom(d) { P.settings.zoom = clamp(+(P.settings.zoom + d).toFixed(2), 0.5, 1.8); Store.touch(); fitZoom(); }

  /* ---------- block creation ---------- */
  function makeBlock(b) {
    const ta = h('textarea', { rows: 1, spellcheck: true, value: b.text, placeholder: PLACEHOLDER[b.type] || '', 'data-id': b.id, 'aria-label': b.type });
    const nd = h('button', { class: 'notedot' + (b.note ? '' : ' hidden'), tabindex: -1, title: b.note || '', onclick: () => editNote(b) }, icon('msg', 14));
    const el = h('div', { class: 'blk t-' + b.type + (isDual(b) ? ' dual' : ''), 'data-id': b.id }, ta, nd, h('i', { class: 'revbar' }));
    ta.addEventListener('input', () => onInput(b, ta, el));
    ta.addEventListener('keydown', e => onKey(e, b, ta, el));
    ta.addEventListener('focus', () => { curId = b.id; el.classList.add('focus'); typeSel.value = b.type; markNavActive(); if (window.Collab) Collab.setPresence({ block: b.id, view: 'script' }); kbarShow(); });
    ta.addEventListener('blur', () => { el.classList.remove('focus'); closeSuggest(); finishParen(b, ta); kbarHideSoon(); });
    ta.addEventListener('paste', e => onPaste(e, b, ta));
    els.set(b.id, { el, ta, nd });
    applyRev(b);
    return el;
  }
  function renderAll() {
    paper.innerHTML = ''; els.clear();
    if (P.mode === 'av') paper.append(h('div', { class: 'avh-ed' }, h('span', {}, 'VIDEO'), h('span', {}, 'AUDIO')));
    const f = document.createDocumentFragment(); P.blocks.forEach(b => f.append(makeBlock(b))); paper.append(f);
    fitAll();
  }
  function finishParen(b, ta) {
    if (b.type !== 'paren' || !ta.value.trim()) return;
    let v = ta.value.trim(); if (!v.startsWith('(')) v = '(' + v; if (!v.endsWith(')')) v += ')';
    if (v !== ta.value) { ta.value = v; b.text = v; fit(ta); Store.touch(); }
  }
  function setNoteDot(b) { const e = els.get(b.id); if (!e) return; e.nd.classList.toggle('hidden', !b.note); e.nd.title = b.note || ''; }

  /* ---------- input ---------- */
  function onInput(b, ta, el) {
    let v = ta.value; const was = b.text;
    if (P.mode === 'screenplay' && b.type === 'action' && !SC_PREFIX.test(was) && SC_PREFIX.test(v) && v.length <= 10) retype(b, 'scene');
    else if ((b.type === 'dialogue' || b.type === 'action') && was === '' && v === '(') retype(b, 'paren');
    else if (P.mode === 'podcast') {
      const up = v.toUpperCase();
      if (/^(?:SFX|SOUND|FX)[:\s]/.test(up) && b.type !== 'sfx') retype(b, 'sfx');
      else if (/^(?:MUSIC|TRACK|THEME)[:\s]/.test(up) && b.type !== 'music') retype(b, 'music');
      else if (/^(?:CLIP|TAPE|ACTUALITY)[:\s]/.test(up) && b.type !== 'clip') retype(b, 'clip');
      else if (/^(?:SPONSOR|AD|MIDROLL)[:\s]/.test(up) && b.type !== 'sponsor') retype(b, 'sponsor');
      else if (/^(?:SEGMENT|TRACK|SCENE|PART)\s+\d+/i.test(v) && b.type !== 'scene') retype(b, 'scene');
    }
    if (CAPS.has(b.type)) { const s = ta.selectionStart, u = v.toUpperCase(); if (u !== v) { ta.value = u; ta.setSelectionRange(s, s); v = u; } }
    b.text = v; markRev(b); fit(ta); commit(false); scheduleRefresh(b.type === 'scene' || b.type === 'act');
    if (b.type === 'character') el.classList.toggle('dual', isDual(b));
    if (focusMode) keepVisible(el);
    showSuggest(b, ta);
  }
  function retype(b, type) {
    b.type = type; const e = els.get(b.id); e.el.className = 'blk t-' + type + (isDual(b) ? ' dual' : '') + ' focus'; e.ta.placeholder = PLACEHOLDER[type] || ''; typeSel.value = type; fit(e.ta);
  }
  function setType(b, type) {
    if (b.type === type) return;
    flushPending(); warnSceneLoss(b); retype(b, type); markRev(b);
    const e = els.get(b.id);
    if (CAPS.has(type)) { e.ta.value = e.ta.value.toUpperCase(); b.text = e.ta.value; fit(e.ta); }
    commit(true); scheduleRefresh(true);
  }
  function cycleType(b, dir) {
    let i = typeKeys.indexOf(b.type); i = (i + dir + typeKeys.length) % typeKeys.length;
    setType(b, typeKeys[i]);
  }

  /* ---------- formatting, dual dialogue, notes ---------- */
  function fmt(mark, blk) {
    const b = blk || curBlock(); if (!b) return toast('Click into a line first.');
    const ta = els.get(b.id).ta; ta.focus();
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e), m = mark.length;
    if (sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark)) { ta.setRangeText(sel.slice(m, -m), s, e, 'select'); }
    else if (s >= m && v.slice(s - m, s) === mark && v.slice(e, e + m) === mark) { ta.setRangeText(sel, s - m, e + m, 'select'); }
    else if (!sel) { ta.setRangeText(mark + mark, s, e, 'end'); ta.setSelectionRange(s + m, s + m); }
    else ta.setRangeText(mark + sel + mark, s, e, 'select');
    ta.dispatchEvent(new Event('input'));
  }
  function toggleDual(blk) {
    const b = blk || curBlock();
    if (!b || b.type !== 'character') return toast('Put the cursor in a Character line, then use Dual dialogue to place it beside the speaker above.');
    flushPending(); const e = els.get(b.id);
    b.text = isDual(b) ? b.text.replace(/\s*\^\s*$/, '') : b.text.replace(/\s+$/, '') + ' ^';
    e.ta.value = b.text; e.el.classList.toggle('dual', isDual(b)); markRev(b); commit(true); scheduleRefresh(true);
    toast(isDual(b) ? 'Dual dialogue on — prints beside the previous speaker' : 'Dual dialogue off');
  }
  function editNote(b) {
    const ta = h('textarea', { class: 'inp', rows: 5, value: b.note || '', placeholder: 'A private note on this line — never printed.' });
    modal({ title: 'Note', body: ta, buttons: [
      b.note ? { label: 'Delete note', danger: true, onClick: () => { flushPending(); delete b.note; setNoteDot(b); commit(true); scheduleRefresh(true); } } : { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: () => { flushPending(); const v = ta.value.trim(); if (v) b.note = v; else delete b.note; setNoteDot(b); commit(true); scheduleRefresh(true); } }] });
  }

  /* ---------- key handling ---------- */
  function onKey(e, b, ta, el) {
    if (sug.open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sugMove(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sugMove(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); sugAccept(); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeSuggest(); return; }
    }
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) { const t = types[+e.key - 1]; if (t) { e.preventDefault(); setType(b, t.k); } return; }
    if (mod && e.altKey && k === 'm') { e.preventDefault(); editNote(b); return; }
    if (mod && k === 'b') { e.preventDefault(); fmt('**', b); return; }
    if (mod && k === 'i') { e.preventDefault(); fmt('*', b); return; }
    if (mod && k === 'u') { e.preventDefault(); fmt('_', b); return; }
    if (mod && k === 'd' && P.mode === 'screenplay') { e.preventDefault(); toggleDual(b); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'f') { e.preventDefault(); openFind(); return; }
    if (mod && k === 's') { e.preventDefault(); flushPending(); Store.flush(); toast('Saved'); return; }
    if (e.key === 'Tab') { e.preventDefault(); cycleType(b, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Enter' && !e.shiftKey && !mod) { e.preventDefault(); splitBlock(b, ta); return; }
    if (e.key === 'Enter' && mod) { e.preventDefault(); insertAfter(b, newBlock(defType), 0); return; }
    const i = idx(b);
    if (e.key === 'Backspace' && !e.ctrlKey && ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      const prev = P.blocks[i - 1];
      flushPending();
      if (!ta.value) { warnSceneLoss(b); removeBlock(b); focusBlock(prev.id, 'end'); }
      else if (prev.type === b.type) { warnSceneLoss(b); const pl = prev.text.length; prev.text += b.text; els.get(prev.id).ta.value = prev.text; markRev(prev); removeBlock(b); fit(els.get(prev.id).ta); focusBlock(prev.id, pl); }
      else if (!prev.text.trim()) { warnSceneLoss(prev); removeBlock(prev); focusBlock(b.id, 0); }
      else if (b.type !== defType && b.type !== 'scene') setType(b, defType);
      return;
    }
    if (e.key === 'Delete' && ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length && i < P.blocks.length - 1) {
      const next = P.blocks[i + 1];
      if (next.type === b.type || !next.text.trim() || !ta.value) {
        e.preventDefault(); flushPending();
        if (!ta.value && next.text) { warnSceneLoss(b); removeBlock(b); focusBlock(next.id, 0); return; }
        warnSceneLoss(next); const pl = b.text.length; b.text += next.text; ta.value = b.text; markRev(b); removeBlock(next); fit(ta); focusBlock(b.id, pl);
      }
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && !mod && i > 0 && ta.selectionStart === 0 && ta.selectionEnd === 0) { e.preventDefault(); focusBlock(P.blocks[i - 1].id, 'end'); }
    if (e.key === 'ArrowDown' && !e.shiftKey && !mod && i < P.blocks.length - 1 && ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length) { e.preventDefault(); focusBlock(P.blocks[i + 1].id, 'start'); }
    if (e.key === 'ArrowLeft' && !e.shiftKey && !mod && ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) { e.preventDefault(); focusBlock(P.blocks[i - 1].id, 'end'); }
    if (e.key === 'ArrowRight' && !e.shiftKey && !mod && ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length && i < P.blocks.length - 1) { e.preventDefault(); focusBlock(P.blocks[i + 1].id, 'start'); }
  }

  function splitBlock(b, ta) {
    flushPending(); finishParen(b, ta);
    const v = ta.value, pos = ta.selectionStart, before = v.slice(0, pos), after = v.slice(ta.selectionEnd).replace(/^[ 	]+/, '');
    if (!v.trim()) {
      if (b.type !== defType) { setType(b, defType); return; }
      insertAfter(b, newBlock(defType), 0); return;
    }
    if (P.mode === 'screenplay' && b.type === 'action' && /^[A-Z][A-Z .\-]*TO:$/.test(before.trim()) && !after.trim()) retype(b, 'transition');
    let type;
    if (after.trim()) type = (b.type === 'scene' || b.type === 'act' || b.type === 'character') ? NEXT[P.mode][b.type] : b.type;
    else type = NEXT[P.mode][b.type] || defType;
    if (!before.trim() && after.trim()) {
      b.text = ''; ta.value = ''; fit(ta);
      insertAfter(b, newBlock(b.type, after), 0, true); return;
    }
    b.text = before; ta.value = before; fit(ta); markRev(b);
    insertAfter(b, newBlock(type, CAPS.has(type) ? after.toUpperCase() : after), 0, true);
  }
  function insertAfter(b, nb, caret = 0, already) {
    if (!already) flushPending();
    P.blocks.splice(idx(b) + 1, 0, nb);
    els.get(b.id).el.after(makeBlock(nb));
    fit(els.get(nb.id).ta);
    commit(true); scheduleRefresh(true); focusBlock(nb.id, caret);
  }
  function removeBlock(b) {
    if (P.blocks.length <= 1) { b.text = ''; const e = els.get(b.id); e.ta.value = ''; return; }
    P.blocks.splice(idx(b), 1);
    const e = els.get(b.id); e.el.remove(); els.delete(b.id);
    commit(true); scheduleRefresh(true);
  }
  function addScene() {
    flushPending();
    const nb = newBlock('scene'), nb2 = newBlock(defType); P.blocks.push(nb, nb2);
    paper.append(makeBlock(nb), makeBlock(nb2)); fitAll(); commit(true); scheduleRefresh(true);
    focusBlock(nb.id, 0); scroller.scrollTop = scroller.scrollHeight;
  }

  /* ---------- paste ---------- */
  function onPaste(e, b, ta) {
    const t = (e.clipboardData || window.clipboardData).getData('text');
    if (!/\n/.test(t.trim())) {
      if (CAPS.has(b.type)) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText(t.replace(/\s*\n\s*/g, ' ').toUpperCase(), s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
      return;
    }
    e.preventDefault(); flushPending();
    const blocks = parseFountain(t, P.mode).blocks; if (!blocks.length) return;
    blocks.forEach(nb => { if (P.settings.rev) nb.rev = P.settings.rev; });
    const pos = ta.selectionStart, before = ta.value.slice(0, pos), after = ta.value.slice(ta.selectionEnd);
    let ref = b;
    if (before.trim()) { b.text = before; ta.value = before; fit(ta); } else { b.text = blocks[0].text; b.type = blocks[0].type; blocks.shift(); ta.value = b.text; retype(b, b.type); fit(ta); }
    blocks.forEach(nb => { P.blocks.splice(idx(ref) + 1, 0, nb); els.get(ref.id).el.after(makeBlock(nb)); ref = nb; });
    if (after.trim()) { const nb = newBlock(defType, after); P.blocks.splice(idx(ref) + 1, 0, nb); els.get(ref.id).el.after(makeBlock(nb)); }
    fitAll(); commit(true); scheduleRefresh(true); focusBlock(ref.id, 'end');
    toast(`Pasted ${blocks.length + 1} elements`);
  }

  /* ---------- autocomplete ---------- */
  const sug = { open: false, items: [], i: 0, from: 0, to: 0, ta: null, b: null };
  const sugEl = h('div', { class: 'suggest hidden' });
  document.body.append(sugEl);
  function knownLocations() {
    const s = new Set(getScenes(P).map(x => x.location.toUpperCase()).filter(Boolean));
    P.locations.forEach(l => l.name && s.add(l.name.toUpperCase()));
    return [...s];
  }
  function computeSuggest(b, ta) {
    if (ta.selectionStart !== ta.selectionEnd) return null;
    const pos = ta.selectionStart, before = ta.value.slice(0, pos), up = before.toUpperCase();
    if (b.type === 'character') {
      if (!up.trim() || /\(/.test(up)) return null;
      const names = [...allCharacters(P)].sort((a, c) => c[1] - a[1]).map(x => x[0]);
      P.people.forEach(x => { if (x.type === 'cast' && x.character) names.push(x.character.toUpperCase()); });
      const items = [...new Set(names)].filter(n => n.startsWith(up) && n !== up);
      return items.length ? { items, from: 0, to: ta.value.length } : null;
    }
    if (b.type === 'transition') {
      const items = TRANSITIONS.filter(n => n.startsWith(up) && n !== up);
      return up && items.length ? { items, from: 0, to: ta.value.length } : null;
    }
    if (b.type === 'scene' && P.mode === 'screenplay') {
      if (/^[A-Z.\/]*$/.test(up)) { const items = ['INT. ', 'EXT. ', 'INT./EXT. ', 'I/E. '].filter(x => x.startsWith(up) && x !== up); return items.length ? { items, from: 0, to: pos } : null; }
      const m = /^(INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+(.*)$/.exec(up);
      if (!m) return null; const rest = m[2];
      const tm = /\s-\s([A-Z' ]*)$/.exec(rest);
      if (tm) { const items = TIMES.filter(x => x.startsWith(tm[1]) && x !== tm[1]); return items.length ? { items, from: pos - tm[1].length, to: pos } : null; }
      if (rest && !/ - /.test(rest)) { const items = knownLocations().filter(l => l.startsWith(rest) && l !== rest).map(l => l + ' - '); return items.length ? { items, from: pos - rest.length, to: pos } : null; }
    }
    return null;
  }
  function showSuggest(b, ta) {
    const r = computeSuggest(b, ta);
    if (!r) return closeSuggest();
    Object.assign(sug, r, { open: true, i: 0, ta, b });
    sugEl.innerHTML = '';
    r.items.slice(0, 8).forEach((it, n) => sugEl.append(h('div', { class: n === 0 ? 'on' : '', onmousedown: e => { e.preventDefault(); sug.i = n; sugAccept(); } }, it)));
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
    const v = ta.value; ta.value = v.slice(0, sug.from) + it + v.slice(sug.to);
    const p = sug.from + it.length; ta.setSelectionRange(p, p);
    closeSuggest(); ta.dispatchEvent(new Event('input'));
  }

  /* ---------- outline (scenes / notes) ---------- */
  let dragId = null;
  function renderNav() {
    navList.innerHTML = '';
    if (navMode === 'notes') {
      const withNotes = P.blocks.filter(b => b.note);
      if (!withNotes.length) navList.append(h('li', { class: 'act', style: { textTransform: 'none', letterSpacing: 0, fontWeight: 500 } }, 'No notes yet. Click a line, then the speech-bubble button (Ctrl+Alt+M).'));
      let scene = '';
      P.blocks.forEach(b => { if (b.type === 'scene') scene = b.text; if (!b.note) return;
        navList.append(h('li', { onclick: () => scrollToBlock(b.id) }, icon('msg', 15), h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'nh' }, b.note), h('div', { class: 'ns' }, (stripRich(b.text).slice(0, 60) || '(empty)') + (scene ? ' · ' + stripRich(scene).slice(0, 30) : ''))))); });
      return;
    }
    const sc = getScenes(P);
    if (!sc.length) navList.append(h('li', { class: 'act' }, 'No scenes yet'));
    let lastAct = null;
    sc.forEach(s => {
      if (s.act !== lastAct && s.act) { navList.append(h('li', { class: 'act' }, s.act)); }
      lastAct = s.act;
      const li = h('li', { draggable: true, 'data-id': s.id, title: 'Click to jump · drag to reorder', style: s.color ? { borderLeft: `4px solid ${s.color}` } : {},
        onclick: () => { scrollToBlock(s.id); },
        ondragstart: e => { dragId = s.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); },
        ondragover: e => { e.preventDefault(); const r = li.getBoundingClientRect(); const top = e.clientY < r.top + r.height / 2; li.classList.toggle('over-top', top); li.classList.toggle('over-bot', !top); },
        ondragleave: () => li.classList.remove('over-top', 'over-bot'),
        ondrop: e => { e.preventDefault(); const r = li.getBoundingClientRect(); const after = e.clientY >= r.top + r.height / 2; li.classList.remove('over-top', 'over-bot'); moveScene(dragId, s.id, after); },
      },
        h('span', { class: 'num' }, s.num),
        h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'nh' }, s.label), s.synopsis ? h('div', { class: 'ns' }, s.synopsis) : null),
        h('span', { class: 'np' }, fmtEighths(s.eighths)));
      navList.append(li);
    });
    const omitted = P.blocks.filter(b => b.type === 'scene' && b.om);
    if (omitted.length) { navList.append(h('li', { class: 'act' }, 'Omitted scenes')); omitted.forEach(b => navList.append(h('li', { style: { opacity: .7 } }, h('span', { class: 'num' }, b.num || '—'), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'nh', style: { textDecoration: 'line-through' } }, stripRich(b.text) || '(untitled)')), h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); flushPending(); delete b.om; commit(true); scheduleRefresh(true); } }, 'Restore')))); }
    markNavActive();
  }
  function markNavActive() {
    const i = P.blocks.findIndex(b => b.id === curId); if (i < 0) return;
    let sid = null; for (let j = i; j >= 0; j--) { if (P.blocks[j].type === 'scene') { sid = P.blocks[j].id; break; } if (P.blocks[j].type === 'act') break; }
    $$('li[data-id]', navList).forEach(li => li.classList.toggle('on', li.dataset.id === sid));
    UI.scene = sid || UI.scene;
  }
  function scrollToBlock(id) {
    const e = els.get(id); if (!e) return;
    const r = e.el.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + r.top - s.top - 70, behavior: 'smooth' });
    e.ta.focus({ preventScroll: true }); e.ta.setSelectionRange(e.ta.value.length, e.ta.value.length);
  }
  function moveScene(srcId, tgtId, after) {
    flushPending();
    if (!moveSceneBlocks(P, srcId, tgtId, after)) return;
    renderAll(); commit(true); scheduleRefresh(true); toast('Scene moved');
  }

  /* ---------- pagination markers, status ---------- */
  let rt = null;
  function scheduleRefresh(now) { clearTimeout(rt); if (now) refresh(); else rt = setTimeout(refresh, 450); }
  function refresh() {
    if (P.settings.sceneNumLock && assignNewSceneNumbers(P)) Store.touch();
    const pg = paginate(P), scMap = new Map(getScenes(P).map(x => [x.id, x.num])); let n = 0, prev = -1, words = 0, inOm = false;
    P.blocks.forEach((b, i) => {
      if (b.type === 'scene') n++;
      if (b.type === 'scene' || b.type === 'act') inOm = b.type === 'scene' && !!b.om;
      if (b.text.trim()) words += b.text.trim().split(/\s+/).length;
      const e = els.get(b.id); if (!e) return; e.el.classList.toggle('omitted', inOm);
      const pp = pg.blockPage[i];
      if (pp > 0 && pp !== prev) e.el.dataset.page = pg.labels[pp]; else delete e.el.dataset.page;
      prev = pp;
      if (b.type === 'scene' && scMap.has(b.id)) e.el.dataset.num = scMap.get(b.id); else delete e.el.dataset.num;
    });
    const rev = currentRev(P);
    revBtn.classList.toggle('active', !!rev); revBtn.lastChild.textContent = rev ? rev.name : 'Revisions';
    status.innerHTML = '';
    const estMin = P.mode === 'podcast' ? Math.max(1, Math.round(words / 140)) : (P.mode === 'stage' ? Math.round(pg.count * 1.5) : pg.count);
    status.append(h('span', {}, `${pg.count} page${pg.count === 1 ? '' : 's'}`), h('span', {}, `${n} scene${n === 1 ? '' : 's'}`), h('span', {}, `${words.toLocaleString()} words`),
      h('span', {}, `~${estMin} min runtime`),
      rev ? h('span', { style: { color: 'var(--accent)', fontWeight: 600 } }, `Tracking: ${rev.name}`) : null, h('span', { class: 'grow' }),
      h('span', {}, 'Tab: change element · Enter: next line · Ctrl+B/I/U: format'));
    renderNav();
  }

  /* ---------- find & replace ---------- */
  let matches = [], mi = -1;
  function openFind() {
    findBar.classList.remove('hidden'); findBar.innerHTML = '';
    const f = h('input', { class: 'inp', placeholder: 'Find…', oninput: () => runFind(true), onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') closeFind(); } });
    const r = h('input', { class: 'inp', placeholder: 'Replace with…', onkeydown: e => { if (e.key === 'Escape') closeFind(); } });
    const cnt = h('span', { class: 'small muted' });
    function runFind(first) {
      matches = []; const q = f.value.toLowerCase();
      if (q) P.blocks.forEach(b => { const t = b.text.toLowerCase(); let k = -1; while ((k = t.indexOf(q, k + 1)) >= 0) matches.push({ id: b.id, at: k }); });
      mi = matches.length ? (first ? 0 : mi) : -1; cnt.textContent = q ? `${matches.length} found` : ''; if (first && matches.length) show();
    }
    function show() { const m = matches[mi]; if (!m) return; const e = els.get(m.id); e.ta.focus({ preventScroll: true }); e.ta.setSelectionRange(m.at, m.at + f.value.length); const rr = e.el.getBoundingClientRect(), s = scroller.getBoundingClientRect(); scroller.scrollTop += rr.top - s.top - s.height / 3; cnt.textContent = `${mi + 1} of ${matches.length}`; f.focus(); }
    function stepFind(d) { if (!matches.length) return; mi = (mi + d + matches.length) % matches.length; show(); }
    function replaceAll() {
      const q = f.value; if (!q) return; flushPending(); let n = 0; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      P.blocks.forEach(b => { if (re.test(b.text)) { re.lastIndex = 0; let nt = b.text.replace(re, () => { n++; return r.value; }); if (CAPS.has(b.type)) nt = nt.toUpperCase(); b.text = nt; markRev(b); const e = els.get(b.id); e.ta.value = nt; fit(e.ta); } });
      commit(true); scheduleRefresh(true); runFind(false); toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`);
    }
    findBar.append(f, r, h('button', { class: 'btn sm', onclick: () => stepFind(-1) }, icon('up', 14)), h('button', { class: 'btn sm', onclick: () => stepFind(1) }, icon('down', 14)),
      h('button', { class: 'btn sm', onclick: replaceAll }, 'Replace all'), cnt, h('span', { class: 'grow' }), ibtn('x', 'Close', closeFind));
    f.focus();
  }
  function closeFind() { findBar.classList.add('hidden'); matches = []; const b = curBlock(); if (b) focusBlock(b.id, els.get(b.id).ta.selectionStart); }

  /* ---------- title page, numbers, revisions, import ---------- */
  function editTitle() {
    const m = P.meta;
    const f = (label, get, set, ta) => h('div', { class: 'field' }, h('label', { class: 'lbl' }, label),
      h(ta ? 'textarea' : 'input', { class: 'inp', value: get(), rows: 3, oninput: e => { set(e.target.value); Store.touch(); } }));
    modal({ title: 'Title page', body: h('div', {},
      f('Title', () => P.title, v => { P.title = v; const t = $('.ptitle'); if (t) t.value = v; }),
      f('Credit line', () => m.credit, v => m.credit = v), f('Author(s)', () => m.author, v => m.author = v), f('Based on / source', () => m.source, v => m.source = v),
      f('Contact info', () => m.contact, v => m.contact = v, true), f('Draft / date', () => m.draft, v => m.draft = v), f('Copyright', () => m.copyright, v => m.copyright = v),
      ...(P.mode === 'stage' ? [f('Setting (place)', () => m.setting || '', v => m.setting = v), f('Time / period', () => m.time || '', v => m.time = v), f('Running time', () => m.runtime || '', v => m.runtime = v)] : []),
      ...(P.mode === 'screenplay' ? [h('label', { class: 'row', style: { margin: '2px 0 14px' } }, h('input', { type: 'checkbox', checked: !!P.settings.multicam, onchange: e => { P.settings.multicam = e.target.checked; paper.classList.toggle('multicam', e.target.checked); scroller.classList.toggle('show-nums', numsOn()); Store.touch(); scheduleRefresh(true); setTimeout(fitAll, 30); } }), h('span', {}, h('b', {}, 'Sitcom (multi-camera) format'), h('span', { class: 'muted small', style: { display: 'block' } }, 'Double-spaced dialogue, ALL-CAPS action, “SCENE A” lettering and underlined headings.')))] : []),
      f('Logline', () => m.logline, v => m.logline = v, true)), buttons: [{ label: 'Done', primary: true }] });
  }
  function toggleNums() { P.settings.sceneNumbers = !P.settings.sceneNumbers; scroller.classList.toggle('show-nums', numsOn()); Store.touch(); scheduleRefresh(true); }
  async function toggleLock() {
    flushPending();
    if (P.settings.sceneNumLock) { if (!(await confirmBox('Unlock scene numbers? Scenes will renumber 1, 2, 3… and any A-scenes (like 12A) will be lost.', 'Unlock', 'Unlock scene numbers'))) return; unlockSceneNumbers(P); }
    else { lockSceneNumbers(P); toast('Scene numbers locked. New scenes get numbers like 4A, so existing numbers never change.'); }
    scroller.classList.toggle('show-nums', numsOn()); commit(true); scheduleRefresh(true);
  }
  function revisionsModal() {
    const body = h('div'); let box;
    function draw() {
      body.innerHTML = ''; const cur = currentRev(P);
      body.append(h('p', { class: 'muted', style: { marginTop: 0 } }, 'Start a revision to track every line you change after a draft is circulated. Changed lines get a * in the margin, and the pages print on coloured paper — the way a production tracks script changes.'),
        cur ? h('div', { class: 'card', style: { padding: '12px 14px', marginBottom: '12px', borderColor: 'var(--accent)' } }, h('b', {}, 'Tracking: '), cur.name, h('button', { class: 'btn sm', style: { marginLeft: '12px' }, onclick: () => { P.settings.rev = ''; Store.touch(); scheduleRefresh(true); draw(); } }, 'Stop tracking')) : null);
      if (P.revisions.length) body.append(h('table', { class: 'tbl', style: { marginBottom: '14px' } }, h('thead', {}, h('tr', {}, ['Colour', 'Name', 'Date', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, P.revisions.map(r => h('tr', {}, h('td', {}, h('span', { style: { display: 'inline-block', width: '22px', height: '22px', borderRadius: '2px', background: r.color, border: '1px solid var(--border)' } })), h('td', {}, r.name + (r.id === P.settings.rev ? '  (current)' : '')), h('td', {}, r.date),
          h('td', {}, r.id === P.settings.rev ? null : h('button', { class: 'btn sm', onclick: () => { P.settings.rev = r.id; Store.touch(); scheduleRefresh(true); draw(); } }, 'Track this')))))));
      const used = new Set(P.revisions.map(r => r.name)), nextC = REV_COLORS.find(c => !P.revisions.some(r => r.color === c.color)) || REV_COLORS[1];
      const sel = h('select', { class: 'inp', style: { width: 'auto' } }, REV_COLORS.map(c => h('option', { value: c.k, selected: c.k === nextC.k }, c.label)));
      const date = h('input', { class: 'inp', type: 'date', value: new Date().toISOString().slice(0, 10), style: { width: 'auto' } });
      body.append(h('div', { class: 'row wrap' }, sel, date, h('button', { class: 'btn primary', onclick: () => {
        const c = REV_COLORS.find(x => x.k === sel.value); const r = { id: uid(), name: c.label + ' Revision', color: c.color, date: date.value };
        P.revisions.push(r); P.settings.rev = r.id; Store.touch(); scheduleRefresh(true); draw(); toast(`Now tracking changes as the ${c.label} revision`);
      } }, 'Start new revision')),
        P.blocks.some(b => b.rev) ? h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox('Remove all revision marks and colours from the script? (Use this when you issue a clean, all-white script.)', 'Clear marks')) { flushPending(); P.blocks.forEach(b => delete b.rev); P.revisions = []; P.settings.rev = ''; $$('.blk[data-rev]', paper).forEach(e => { delete e.dataset.rev; }); commit(true); scheduleRefresh(true); draw(); } } }, 'Clear all revision marks')) : null);
    }
    const drawBase = draw;
    draw = function () {
      drawBase();
      body.append(h('div', { class: 'pf-sec', style: { marginTop: '18px' } }, h('h4', {}, 'Page locking'),
        h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Lock pages when the script goes into production. Every page keeps its number; text you add spills onto A-pages (12A, 12B) instead of renumbering everything after it. Then use Export → “Print revised pages only”.'),
        P.settings.pageLock ? h('div', { class: 'row' }, h('span', { class: 'pill accent' }, 'Pages locked'), h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox('Unlock pages? Pages will renumber 1, 2, 3… and A-pages will be lost.', 'Unlock', 'Unlock pages')) { flushPending(); unlockPages(P); commit(true); scheduleRefresh(true); draw(); } } }, 'Unlock'))
          : h('button', { class: 'btn', onclick: () => { flushPending(); takeSnapshot(P, 'Before locking pages', true); lockPages(P); commit(true); scheduleRefresh(true); toast('Pages locked at the current page numbers'); draw(); } }, icon('lock', 15), 'Lock pages now')));
    };
    draw(); box = modal({ title: 'Script revisions', body, wide: false, buttons: [{ label: 'Done', primary: true }] });
  }
  function toggleOmit() {
    const b = curBlock(); if (!b) return toast('Click into the scene first.');
    let head = null; for (let j = idx(b); j >= 0; j--) { if (P.blocks[j].type === 'scene') { head = P.blocks[j]; break; } if (P.blocks[j].type === 'act') break; }
    if (!head) return toast('Place the cursor inside a scene.', true);
    flushPending(); if (head.om) { delete head.om; toast('Scene restored'); } else { head.om = true; toast('Scene omitted — it keeps its number and prints as OMITTED. Restore it from the outline.'); }
    commit(true); scheduleRefresh(true);
  }
  /* ----- table read: browser speech, a different voice / pitch per character ----- */
  let reading = false;
  function stopRead() { reading = false; try { speechSynthesis.cancel(); } catch (e) { } readBtn.classList.remove('active'); $$('.blk.reading', paper).forEach(x => x.classList.remove('reading')); }
  function toggleRead() {
    if (!('speechSynthesis' in window)) return toast('This browser has no speech engine for table reads.', true);
    if (reading) return stopRead();
    let i = Math.max(0, idx(curBlock() || P.blocks[0])), speaker = null, nVoice = 0; const voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)), assigned = new Map();
    reading = true; readBtn.classList.add('active'); toast('Reading aloud from here — click the speaker button again to stop.');
    let omitted = false;
    const next = () => {
      if (!reading || i >= P.blocks.length) return stopRead();
      const blk = P.blocks[i++];
      if (blk.type === 'scene' || blk.type === 'act') omitted = blk.type === 'scene' && !!blk.om;
      if (omitted && blk.type !== 'scene') return next();
      if (blk.type === 'character') { speaker = normChar(blk.text); return next(); }
      if (blk.type === 'paren' || blk.type === 'cue' || blk.type === 'shot' || blk.type === 'sfx' || blk.type === 'super') return next();
      let text = stripRich(blk.text).trim(); if (!text) return next();
      if (blk.type === 'scene') text = text.replace(/^INT\.?\/EXT\.?/i, 'Interior exterior.').replace(/^INT\.?/i, 'Interior.').replace(/^EXT\.?/i, 'Exterior.').replace(/^I\/E\.?/i, 'Interior exterior.').replace(/\s+-\s+/g, '. ');
      const u = new SpeechSynthesisUtterance(text); u.rate = 1.02;
      if (blk.type === 'dialogue') {
        if (!assigned.has(speaker)) assigned.set(speaker, nVoice++);
        const k = assigned.get(speaker); if (voices.length) u.voice = voices[k % voices.length]; u.pitch = 0.75 + (k % 6) * 0.14;
      } else { if (voices.length) u.voice = voices[0]; u.pitch = 1; u.rate = 1.1; }
      const el = els.get(blk.id) && els.get(blk.id).el; if (el) { el.classList.add('reading'); keepVisible(el); }
      u.onend = u.onerror = () => { if (el) el.classList.remove('reading'); next(); };
      speechSynthesis.speak(u);
    };
    next();
  }
  function redline(s) {
    const parts = wordDiff(s.old, s.now);
    modal({ title: 'Redline — ' + (stripRich(s.head) || 'scene'), wide: true, body: h('div', { class: 'redline' }, h('p', { class: 'small muted', style: { marginTop: 0 } }, [h('ins', {}, 'inserted'), '  ', h('del', {}, 'deleted')]), h('div', { class: 'rl-body' }, parts.map(x => x.t === '+' ? h('ins', {}, x.v) : x.t === '-' ? h('del', {}, x.v) : x.v))), buttons: [{ label: 'Close', primary: true }] });
  }
  function draftsModal() {
    flushPending(); const body = h('div'); let dlg; const nameIn = h('input', { class: 'inp', placeholder: 'Name this draft — e.g. “Second draft, after notes”' });
    const fmtD = t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    function compare(sn) {
      const d = diffDraft(P, sn), st = scriptStats(P), li = (arr, f) => arr.length ? h('ul', { style: { margin: '4px 0 12px', paddingLeft: '18px' } }, arr.slice(0, 12).map(f), arr.length > 12 ? h('li', { class: 'muted' }, `…and ${arr.length - 12} more`) : null) : h('div', { class: 'muted', style: { margin: '4px 0 12px' } }, 'None');
      modal({ title: `“${sn.name}” → now`, body: h('div', {}, h('div', { class: 'sum', style: { marginBottom: '12px' } }, [['Pages', `${sn.pages} → ${st.pages}`], ['Scenes', `${sn.scenes} → ${st.scenes}`], ['Words', `${sn.words.toLocaleString()} → ${st.words.toLocaleString()}`]].map(([k, v]) => h('div', {}, h('span', {}, k), h('b', { style: { fontSize: '18px' } }, v)))),
        h('b', {}, `Scenes added (${d.added.length})`), li(d.added, s => h('li', {}, stripRich(s.head) || '(untitled)')),
        h('b', {}, `Scenes removed (${d.removed.length})`), li(d.removed, s => h('li', {}, stripRich(s.head) || '(untitled)')),
        h('b', {}, `Scenes changed (${d.changed.length})`), li(d.changed, s => h('li', {}, stripRich(s.head) || '(untitled)', h('span', { class: 'muted' }, `  ${s.delta >= 0 ? '+' : ''}${s.delta} words`), h('button', { class: 'btn sm', style: { marginLeft: '8px' }, onclick: () => redline(s) }, 'Redline'))),
        d.moved ? h('p', { class: 'small muted' }, 'Scene order has changed.') : null), buttons: [{ label: 'Close', primary: true }] });
    }
    function draw() {
      body.innerHTML = ''; const snaps = [...(P.snapshots || [])].reverse();
      body.append(h('p', { class: 'muted', style: { marginTop: 0 } }, 'A draft is a saved copy of your script text. One is saved automatically on each day you write, and before bulk changes such as imports or renaming a character. Restoring a draft saves your current script first, so nothing is ever lost.'),
        h('div', { class: 'row', style: { marginBottom: '14px' } }, nameIn, h('button', { class: 'btn primary', onclick: () => { const sn = takeSnapshot(P, nameIn.value.trim() || 'Draft ' + new Date().toLocaleDateString(), false); sn.auto = false; Store.touch(); nameIn.value = ''; toast('Draft saved'); draw(); } }, icon('plus', 15), 'Save draft')),
        snaps.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Draft', 'Saved', 'Pages', 'Words', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, snaps.map(sn => h('tr', {}, h('td', { style: { padding: '9px 10px', fontWeight: sn.auto ? 400 : 650 } }, sn.name, sn.auto ? h('span', { class: 'pill', style: { marginLeft: '6px' } }, 'auto') : null), h('td', { style: { padding: '9px 10px' } }, fmtD(sn.date)), h('td', { style: { padding: '9px 10px' } }, sn.pages), h('td', { style: { padding: '9px 10px' } }, sn.words.toLocaleString()),
            h('td', { style: { whiteSpace: 'nowrap' } }, h('button', { class: 'btn sm', onclick: () => compare(sn) }, 'Compare'), ' ',
              h('button', { class: 'btn sm', onclick: async () => { if (!(await confirmBox(`Restore “${sn.name}”? Your current script is saved as a draft first.`, 'Restore', 'Restore draft'))) return; takeSnapshot(P, `Before restoring “${sn.name}”`, true); P.blocks = parseSnap(sn); renderAll(); commit(true); scheduleRefresh(true); toast('Draft restored'); dlg.close(); } }, 'Restore'), ' ',
              ibtn('trash', 'Delete draft', () => { P.snapshots = P.snapshots.filter(x => x !== sn); Store.touch(); draw(); }, 'danger')))))) : h('div', { class: 'empty', style: { padding: '24px' } }, 'No drafts yet.'));
    }
    draw(); dlg = modal({ title: 'Drafts', wide: true, body, buttons: [{ label: 'Close', primary: true }] });
  }
  function applyImport(res, replace) {
    flushPending(); const mt = res.meta || {}; takeSnapshot(P, replace ? 'Before replacing with import' : 'Before adding import', true);
    if (replace) { P.blocks = res.blocks; if (mt.title) P.title = mt.title; } else P.blocks = P.blocks.filter((b, i) => b.text.trim() || i < P.blocks.length - 1).concat(res.blocks);
    if (replace) { P.meta.credit = mt.credit || P.meta.credit; P.meta.author = mt.author || mt.authors || P.meta.author; P.meta.source = mt.source || ''; P.meta.contact = mt.contact || ''; P.meta.draft = mt['draft date'] || mt.draft || mt.date || ''; P.meta.copyright = mt.copyright || ''; if (res.keepNumbers) { P.settings.sceneNumLock = true; scroller.classList.add('show-nums'); } }
    renderAll(); commit(true); scheduleRefresh(true); const t = $('.ptitle'); if (t) t.value = P.title;
    toast(`Imported ${res.blocks.length} elements`);
  }
  async function importScript() {
    const f = await pickFile(P.mode === 'av' ? '.csv,.txt' : '.fountain,.txt,.fdx,.md,.spmd,.pdf,.highland,.zip'); if (!f) return;
    if (P.mode === 'av') {
      if (!/\.(csv|txt)$/i.test(f.name)) return toast('Two-column scripts import from a CSV with Video and Audio columns.', true);
      const blocks = avFromCSV(await readText(f)); if (!blocks.length) return toast('No rows found in that CSV.', true);
      return modal({ title: 'Import two-column script', body: h('p', { style: { margin: 0 } }, `“${f.name}” has ${blocks.length} video / audio items. Replace the current script, or add them to the end?`), buttons: [{ label: 'Cancel' }, { label: 'Add to end', onClick: () => applyImport({ meta: {}, blocks }, false) }, { label: 'Replace script', primary: true, onClick: () => applyImport({ meta: {}, blocks }, true) }] });
    }
    if (/\.pdf$/i.test(f.name)) { pdfImportFlow(f, { mode: P.mode, lockMode: true, apply: [{ label: 'Add to end', run: r => applyImport(r, false) }, { label: 'Replace script', run: r => applyImport(r, true) }] }); return; }
    try {
      const txt = await readScriptFile(f);
      const res = /\.fdx$/i.test(f.name) ? parseFDX(txt) : parseFountain(txt, P.mode);
      if (!res.blocks.length) return toast('No script content found in that file.', true);
      const apply = replace => applyImport({ meta: res.meta, blocks: res.blocks }, replace);
      modal({ title: 'Import script', body: h('p', { style: { margin: 0 } }, `“${f.name}” contains ${res.blocks.length} script elements. Replace the current script, or add them to the end?`),
        buttons: [{ label: 'Cancel' }, { label: 'Add to end', onClick: () => apply(false) }, { label: 'Replace script', primary: true, onClick: () => apply(true) }] });
    } catch (e) { toast('Could not read that file.', true); }
  }

  /* ---------- go ---------- */
  renderAll(); fitZoom(); scheduleRefresh(true); updateHistBtns(); autoSnapshot(P);
  if (P.settings.sceneNumbers) $('#numBtn', toolbar)?.classList.add('active');
  const first = P.blocks.find(b => b.text === '') || P.blocks[0];
  setTimeout(() => { fitAll(); if (UI.scene && els.has(UI.scene)) scrollToBlock(UI.scene); else if (first && P.blocks.length <= 2) focusBlock(first.id, 0); }, 60);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitAll(); });
  const onResize = () => { fitZoom(); fitAll(); };
  addEventListener('resize', onResize);
  const onGlobal = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.target.closest('.overlay')) { e.preventDefault(); openFind(); } };
  document.addEventListener('keydown', onGlobal);
  /* touch keyboards have no Tab or Ctrl: a bar above the keyboard changes the element type and formats */
  let kbar = null, kbarT = 0;
  function kbarBuild() {
    const hold = fn => ({ onpointerdown: e => { e.preventDefault(); }, onclick: e => { e.preventDefault(); const b = curBlock(); if (b) fn(b); } });
    const B = (label, title, fn, cls = '') => h('button', Object.assign({ class: 'kb ' + cls, title, type: 'button' }, hold(fn)), label);
    kbar = h('div', { class: 'kbar', role: 'toolbar', 'aria-label': 'Writing keys' },
      B('⇤', 'Previous element type', b => cycleType(b, -1)), B('⇥', 'Next element type (Tab)', b => cycleType(b, 1)),
      h('span', { class: 'kb-sep' }), ...types.slice(0, 8).map(t => B(t.label.replace(/ \(.*\)/, '').replace('Scene Heading', 'Scene').replace('Parenthetical', '( )').replace('Stage Direction', 'Direction').replace('Light / Sound Cue', 'Cue').replace('Setting / Description', 'Setting').replace('On-screen Text / Graphic', 'Text'), t.label, b => { setType(b, t.k); const e = els.get(b.id); e && e.ta.focus(); }, 'type')),
      h('span', { class: 'kb-sep' }), B('B', 'Bold', b => fmt('**', b), 'b'), B('I', 'Italic', b => fmt('*', b), 'i'), B('U', 'Underline', b => fmt('_', b), 'u'), B('✎', 'Note on this line', b => editNote(b)),
      h('span', { class: 'kb-sep' }), B('↶', 'Undo', () => undo()), B('↷', 'Redo', () => redo()), B('⌄', 'Hide keyboard', () => { const a = document.activeElement; a && a.blur && a.blur(); }, 'done'));
    document.body.append(kbar);
    const place = () => { if (!kbar) return; const vv = window.visualViewport; kbar.style.bottom = vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) + 'px' : '0'; };
    if (window.visualViewport) { visualViewport.addEventListener('resize', place); visualViewport.addEventListener('scroll', place); } kbar._place = place;
  }
  function kbarShow() {
    if (!document.documentElement.dataset.touch) return; clearTimeout(kbarT); if (!kbar) kbarBuild(); kbar.classList.add('on'); kbar._place(); const b = curBlock(); if (b) $$('.kb.type', kbar).forEach((x, i) => x.classList.toggle('active', types[i] && types[i].k === b.type));
  }
  function kbarHideSoon() { clearTimeout(kbarT); kbarT = setTimeout(() => { if (kbar && !(document.activeElement && paper.contains(document.activeElement))) kbar.classList.remove('on'); }, 220); }
  /* changes from other people in a live session */
  if (window.Collab) Collab.scriptHook = { remote(t) {
    const a = document.activeElement, typing = a && paper.contains(a), keep = curId, sel = typing ? [a.selectionStart, a.selectionEnd] : null;
    const struct = t.structural && t.sec.has('blocks');
    if (struct) { renderAll(); if (typing && els.has(keep)) { const e = els.get(keep); e.ta.focus(); try { e.ta.setSelectionRange(sel[0], sel[1]); } catch (x) { } } }
    else if (t.sec.has('blocks')) t.ids.forEach(id => { const e = els.get(id), b = P.blocks.find(x => x.id === id); if (!e || !b) return; if (document.activeElement !== e.ta && e.ta.value !== b.text) { e.ta.value = b.text; fit(e.ta); } e.el.className = 'blk t-' + b.type + (isDual(b) ? ' dual' : '') + (document.activeElement === e.ta ? ' focus' : ''); e.ta.setAttribute('aria-label', b.type); setNoteDot(b); applyRev(b); });
    renderNav(); scheduleRefresh(true); fitZoom();
  } };
  return () => {
    if (window.Collab) Collab.scriptHook = null; if (kbar) { kbar.remove(); kbar = null; }
    flushPending(); Store.flush(); removeEventListener('resize', onResize); document.removeEventListener('keydown', onGlobal); sugEl.remove(); root.parentElement.classList.remove('noscroll');
    const o = orphanReport(P);
    if (o.total) toast(`${o.total} item${o.total > 1 ? 's' : ''} (shots, tags, frames…) belong to scenes you deleted. Review under Backup → Clean up unused data.`, true);
  };
};
