'use strict';
/* ignore empty children (null / undefined / false) in append() and prepend(), so conditional UI never prints "null" */
(function () { for (const m of ['append', 'prepend']) { const o = Element.prototype[m]; Element.prototype[m] = function (...a) { return o.apply(this, a.filter(x => x != null && x !== false)); }; } })();
/* ===================================================================
   StudioBindahh core: helpers, storage, script formats, scene analysis
   =================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);

/* ---------- tiny DOM builder ---------- */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  let value;
  for (const k in props || {}) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const s in v) { if (s.startsWith('--')) e.style.setProperty(s, v[s]); else e.style[s] = v[s]; } }
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) { const t = k.slice(2); (e._on || (e._on = {}))[t] = v; e.addEventListener(t, hDispatch); }
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(c)); });
  if (value !== undefined) e.value = value;
  return e;
}
/* h() keeps each element's handlers in e._on behind one shared listener, so morph() can hand
   a reused element its new handlers. */
function hDispatch(ev) { const f = this._on && this._on[ev.type]; if (f) return f.call(this, ev); }

/* ---------- morph: redraw in place ----------
   Makes parent's children match `kids` (fresh nodes from h()). Matching nodes are kept and
   brought up to date — attributes, handlers, text, form state — so a view can rebuild its
   whole tree as often as it likes with no flicker, and keeps scroll, focus and the caret.
   Children with a data-key (e.g. a person's id) are matched by key, so a filtered or
   re-sorted list moves its rows instead of rewriting them; the rest match by position.
   Nodes marked _own (listeners h() doesn't know about, e.g. drag & drop) and media are
   swapped whole rather than reused. */
const MORPH_WHOLE = new Set(['CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'IMG']);
function morph(parent, kids) {
  const next = [kids].flat(Infinity).filter(c => c != null && c !== false).map(c => c.nodeType ? c : document.createTextNode(c));
  const old = [...parent.childNodes], byKey = new Map(), loose = [], kept = new Set(), key = n => n.nodeType === 1 && n.dataset.key;
  for (const n of old) { const k = key(n); if (k) byKey.set(k, n); else loose.push(n); }
  let li = 0;
  const pairs = next.map(b => { const k = key(b), a = k ? byKey.get(k) : loose[li++], ok = a && !kept.has(a) && morphable(a, b); if (ok) kept.add(a); return [b, ok ? a : null]; });
  for (const n of old) if (!kept.has(n)) n.remove();          // drop leftovers first, so kept nodes move as little as possible
  pairs.forEach(([b, a], i) => {                               // (moving a node would blur a field being typed in)
    const n = a || b; if (a) morphNode(a, b);
    const at = parent.childNodes[i]; if (at !== n) parent.insertBefore(n, at || null);
  });
}
function morphable(a, b) {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName && !a._own && !b._own && !MORPH_WHOLE.has(a.nodeName)
    && (a.nodeType !== 1 || ((a.id || '') === (b.id || '') && (a.getAttribute('type') || '') === (b.getAttribute('type') || '')));
}
function morphNode(a, b) {
  if (a.nodeType !== 1) { if (a.data !== b.data) a.data = b.data; return; }
  for (const { name, value } of b.attributes) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  if (a._on || b._on) { for (const t in b._on) if (!a._on || !a._on[t]) a.addEventListener(t, hDispatch); a._on = b._on; }
  morph(a, [...b.childNodes]);
  /* form state lives in properties, not attributes; never overwrite what is being typed */
  if ('value' in b && a !== document.activeElement && a.value !== b.value) a.value = b.value;
  for (const k of ['checked', 'selected', 'indeterminate']) if (k in b && a[k] !== b[k]) a[k] = b[k];
}

/* ---------- icons (feather-style strokes) ---------- */
const ICONS = {
  film: 'M4 4h16v16H4z|M4 9h4|M4 15h4|M16 9h4|M16 15h4|M8 4v16|M16 4v16',
  pen: 'M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  list: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z|M7 7h.01',
  camera: 'M3 6h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z|M23 7l-5 4 5 4z',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z|M8.5 8.5h.01|M21 15l-5-5L5 21',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M16 2v4|M8 2v4|M3 10h18',
  clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2|M9 2h6v4H9z|M9 12h6|M9 16h6',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z|M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  dollar: 'M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  stage: 'M3 3h18v18H3z|M3 9h18|M9 21V9',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 1v2|M12 21v2|M4.2 4.2l1.4 1.4|M18.4 18.4l1.4 1.4|M1 12h2|M21 12h2|M4.2 19.8l1.4-1.4|M18.4 5.6l1.4-1.4',
  print: 'M6 9V2h12v7|M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2|M6 14h12v8H6z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12',
  plus: 'M12 5v14|M5 12h14',
  minus: 'M5 12h14',
  trash: 'M3 6h18|M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6|M10 11v6|M14 11v6|M9 6V4h6v2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3',
  undo: 'M3 7v6h6|M3 13a9 9 0 1 0 3-7.7L3 8',
  redo: 'M21 7v6h-6|M21 13a9 9 0 1 1-3-7.7L21 8',
  keyboard: 'M3 6h18v12H3z|M7 10h.01|M11 10h.01|M15 10h.01|M7 14h10',
  copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
  up: 'M12 19V5|M5 12l7-7 7 7',
  down: 'M12 5v14|M19 12l-7 7-7-7',
  left: 'M19 12H5|M12 19l-7-7 7-7',
  right: 'M5 12h14|M12 5l7 7-7 7',
  play: 'M5 3l14 9-14 9z',
  pause: 'M6 4h4v16H6z|M14 4h4v16h-4z',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18|M6 6l12 12',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  eraser: 'M20 20H9L3.5 14.5a2 2 0 0 1 0-2.8L12 3.2a2 2 0 0 1 2.8 0l5.7 5.7a2 2 0 0 1 0 2.8L12 20',
  focus: 'M3 8V5a2 2 0 0 1 2-2h3|M16 3h3a2 2 0 0 1 2 2v3|M21 16v3a2 2 0 0 1-2 2h-3|M8 21H5a2 2 0 0 1-2-2v-3|M12 12h.01',
  sidebar: 'M3 3h18v18H3z|M9 3v18',
  title: 'M4 7V4h16v3|M9 20h6|M12 4v16',
  hash: 'M4 9h16|M4 15h16|M10 3L8 21|M16 3l-2 18',
  rotate: 'M23 4v6h-6|M20.5 15a9 9 0 1 1-2.1-9.4L23 10',
  more: 'M12 12h.01|M5 12h.01|M19 12h.01',
  wand: 'M15 4V2|M15 16v-2|M8 9h2|M20 9h2|M17.8 11.8L19 13|M17.8 6.2L19 5|M3 21l9-9|M12.2 6.2L11 5',
  grid: 'M3 3h7v7H3z|M14 3h7v7h-7z|M14 14h7v7h-7z|M3 14h7v7H3z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8',
  cue: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z|M19 10v2a7 7 0 0 1-14 0v-2|M12 19v3',
  cloud: 'M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  msg: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  layers: 'M12 2L2 7l10 5 10-5z|M2 17l10 5 10-5|M2 12l10 5 10-5',
  chart: 'M18 20V10|M12 20V4|M6 20v-6',
  lock: 'M5 11h14v10H5z|M8 11V7a4 4 0 0 1 8 0v4',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M22 6l-10 7L2 6',
  bold: 'M6 4h8a4 4 0 0 1 0 8H6z|M6 12h9a4 4 0 0 1 0 8H6z',
  italic: 'M19 4h-9|M14 20H5|M15 4L9 20',
  underline: 'M6 3v7a6 6 0 0 0 12 0V3|M4 21h16',
  cards: 'M3 3h8v8H3z|M13 3h8v8h-8z|M3 13h8v8H3z|M13 13h8v8h-8z',
  alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z|M12 9v4|M12 17h.01',
  dual: 'M4 4h7v16H4z|M13 4h7v16h-7z',
  shirt: 'M20.4 5.5L16 3a4 4 0 0 1-8 0L3.6 5.5 2 10l4 1.5V21h12v-9.5l4-1.5z',
  palette: 'M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 22 11c0-5-4.5-9-10-9z|M7.5 11h.01|M12 7h.01|M16.5 11h.01',
  layout: 'M3 3h18v18H3z|M3 9h18|M9 21V9',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5z|M3 8l9 5 9-5|M12 13v8',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  tasks: 'M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  deck: 'M2 3h20v14H2z|M8 21h8|M12 17v4',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  report: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M8 13h2|M8 17h2|M12 13h4|M12 17h4',
  monitor: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z|M8 21h8|M12 17v4',
  tablet: 'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M11 18h2',
  chev: 'M6 9l6 6 6-6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2',
  flag: 'M4 22V4|M4 4h13l-2 4 2 4H4',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7|M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
};
function icon(name, size = 18) {
  const s = document.createElement('span');
  s.className = 'ico';
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${(ICONS[name] || '').split('|').map(d => `<path d="${d}"/>`).join('')}</svg>`;
  return s;
}
const ibtn = (name, title, onclick, cls = '') => h('button', { class: 'icon-btn ' + cls, title, 'aria-label': title, onclick }, icon(name));

/* ---------- toast / modal / menu ---------- */
function toast(msg, err) {
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), err ? 4200 : 2200);
}
function modal({ title, body, buttons = [], wide = false, onClose }) {
  const ov = h('div', { class: 'overlay' });
  /* Escape closes only the topmost dialog, so a confirmation over a form doesn't take the form with it */
  const onKey = e => { if (e.key === 'Escape' && ov === [...document.querySelectorAll('.overlay')].pop()) { e.stopPropagation(); close(); } };
  let closed = false;
  function close() { if (closed) return; closed = true; ov.remove(); document.removeEventListener('keydown', onKey, true); onClose && onClose(); }
  ov._close = close;
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
    h('div', { class: 'modal-h' }, h('h3', {}, title), ibtn('x', 'Close', close)),
    h('div', { class: 'modal-b' }, body),
    buttons.length ? h('div', { class: 'modal-f' }, buttons.map(b => h('button', {
      class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''),
      onclick: () => { if (b.onClick && b.onClick() === false) return; close(); }
    }, b.label))) : null);
  ov.append(box);
  /* close on a tap or click on the backdrop itself; waiting for the click (not mousedown) stops a tap on a
     touch screen from also activating whatever is behind the dialog once it disappears */
  let downOnBackdrop = false;
  ov.addEventListener('pointerdown', e => { downOnBackdrop = e.target === ov; });
  ov.addEventListener('click', e => { if (downOnBackdrop && e.target === ov) close(); downOnBackdrop = false; });
  document.addEventListener('keydown', onKey, true);
  document.body.append(ov);
  /* focus the first field — on a touch screen only when it is the dialog's single field, so the
     on-screen keyboard doesn't pop up over a form you came to read or choose from */
  const fields = $$('input:not([type=hidden]),textarea,select', box), f = fields[0];
  if (f && !wide && (!Device.touchOn() || fields.length === 1)) setTimeout(() => f.focus(), 30);
  return { close, box };
}
function confirmBox(msg, okLabel = 'Delete', title = 'Are you sure?') {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (!done) { done = true; res(v); } };
    modal({ title, body: h('p', { style: { margin: 0 } }, msg), onClose: () => fin(false),
      buttons: [{ label: 'Cancel' }, { label: okLabel, primary: true, danger: false, onClick: () => { fin(true); } }] });
  });
}
function promptBox(title, label, value = '') {
  return new Promise(res => {
    let done = false;
    const inp = h('input', { class: 'inp', value, onkeydown: e => { if (e.key === 'Enter') { done = true; res(inp.value.trim() || null); box.close(); } } });
    const box = modal({ title, body: h('div', {}, h('label', { class: 'lbl' }, label), inp), onClose: () => { if (!done) res(null); },
      buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { done = true; res(inp.value.trim() || null); } }] });
  });
}
let _menu = null;
function closeMenu() { if (_menu) { _menu.remove(); _menu = null; document.removeEventListener('mousedown', _menuOut, true); } }
function _menuOut(e) { if (_menu && !_menu.contains(e.target)) closeMenu(); }
function menu(anchor, items) {
  closeMenu();
  const m = h('div', { class: 'menu' }, items.map(it => it.sep ? h('div', { class: 'msep' }) : it.head ? h('div', { class: 'mh' }, it.head) :
    h('button', { onclick: () => { closeMenu(); it.onClick && it.onClick(); } }, it.icon ? icon(it.icon, 16) : null, it.label)));
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  let x = r.left, y = r.bottom + 4;
  const mw = m.offsetWidth, mh = m.offsetHeight;
  if (x + mw > innerWidth - 8) x = innerWidth - mw - 8;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  m.style.left = Math.max(8, x) + 'px'; m.style.top = y + 'px';
  _menu = m;
  setTimeout(() => document.addEventListener('mousedown', _menuOut, true), 0);
}

/* ---------- file helpers ---------- */
/* content is text, or bytes (a Uint8Array). The file's address is kept for a minute: a big file
   on a slow tablet is still being saved long after the click, and taking the address away early
   leaves a cut-off file. */
function download(name, content, type = 'text/plain') {
  const bin = content instanceof Uint8Array;
  const url = URL.createObjectURL(new Blob([content], { type: bin ? type : type + ';charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
/* a project or every project as a checked .studiobindahh file (see js/models/savefile.model.js) */
async function downloadBackup(b) {
  if (!b) return false;
  try { download(b.name, await SaveFile.write(b.data, b.meta), 'application/octet-stream'); return true; }
  catch (e) { toast('Backup failed: ' + (e.message || e), true); return false; }
}
function pickFile(accept) {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept, style: { display: 'none' } });
    i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); });
    document.body.append(i); i.click();
  });
}
function pickFiles(accept) {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept, multiple: true, style: { display: 'none' } });
    i.addEventListener('change', () => { res([...i.files]); i.remove(); });
    document.body.append(i); i.click();
  });
}
const readText = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsText(f); });
const readDataURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
async function readImage(file, maxW = 960) {
  const url = await readDataURL(file);
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
  const k = Math.min(1, maxW / img.width);
  const c = h('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
const csvCell = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
const slug = s => (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

function printNode(node, landscape = false) {
  const root = $('#printRoot');
  root.innerHTML = ''; root.append(node);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 80);
}
function printTable(title, headers, rows, { landscape = true, sub = '' } = {}) {
  const P = Store.P;
  const body = rows.map(r => r.grp ? `<tr class="grp"><td colspan="${headers.length}">${esc(r.grp)}</td></tr>` :
    `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');   // cells keep their line breaks (see .print-doc td)
  const node = h('div', { class: 'print-doc' + (landscape ? ' land' : ''), html:
    `<h1>${esc(title)}</h1><div class="sub">${esc(P ? P.title : '')}${sub ? ' · ' + esc(sub) : ''} · ${new Date().toLocaleDateString()}</div>
     <table><thead><tr>${headers.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>` });
  printNode(node, landscape);
}

/* ---------- storage (IndexedDB) ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((ok, no) => {
      if (!window.indexedDB) return no(new Error('no idb'));
      const r = indexedDB.open('studiobindahh', 2);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' }); if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta'); };
      r.onsuccess = () => { DB.db = r.result; ok(); };
      r.onerror = () => no(r.error);
    });
  },
  /* every call settles when its transaction has committed (or failed), not when the request was
     queued — so 'saved' means saved, and a full disk shows up as an error instead of vanishing */
  tx(name, mode, fn) {
    return new Promise((ok, no) => {
      let t; try { t = DB.db.transaction(name, mode); } catch (e) { return no(e); }
      let out; const r = fn(t.objectStore(name)); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => ok(out);
      t.onerror = e => { e.preventDefault(); };                     // reported once, by onabort
      t.onabort = () => no(DB.why(t.error));
    });
  },
  why(e) {
    if (e && e.name === 'QuotaExceededError') return new Error('this device is out of storage space. Download a backup, then free some space');
    return e || new Error('the browser cancelled the save');
  },
  all() { return DB.tx('projects', 'readonly', s => s.getAll()); },
  put(p) { return DB.tx('projects', 'readwrite', s => s.put(p)); },
  getMeta(k) { return DB.tx('meta', 'readonly', s => s.get(k)); },
  setMeta(k, v) { return DB.tx('meta', 'readwrite', s => s.put(v, k)); },
  del(id) { return DB.tx('projects', 'readwrite', s => s.delete(id)); },
};

function setSaveState(s) {
  const e = $('#savestate'); if (!e) return;
  const label = s === 'saving' ? 'Saving…' : s === 'error' ? 'Save failed' : 'All changes saved';
  e.className = s; e.title = label; e.setAttribute('role', 'status');
  e.innerHTML = `<i></i>${label}`;
}
const Store = {
  projects: {}, P: null, persist: true, _t: null, dirty: false,
  async init() {
    try { await DB.open(); (await DB.all()).forEach(p => { Store.projects[p.id] = migrate(p); }); }
    catch (e) { Store.persist = false; console.warn('Persistent storage unavailable', e); }
  },
  touch() {
    const P = Store.P; if (!P) return;
    P.updated = Date.now(); Store.dirty = true; setSaveState('saving'); if (Hist.active) Hist.note(); if (window.Collab) Collab.onLocalChange(P);
    clearTimeout(Store._t); Store._t = setTimeout(Store.flush, 450);
  },
  /* writes the open project. Switching sections only writes when something changed (a whole-project
     write is the slowest part of navigating on a tablet); leaving or hiding the app always writes. */
  async flush(force) {
    clearTimeout(Store._t);
    const P = Store.P; if (!P || !Store.persist) { Store.dirty = false; setSaveState('saved'); return; }
    if (!Store.dirty && force !== true) return;
    Store.dirty = false;
    try { await DB.put(P); if (!Store.dirty) setSaveState('saved'); if (window.Sync) Sync.queuePush(P); } catch (e) { Store.dirty = true; setSaveState('error'); toast('Could not save: ' + (e.message || e), true); }
  },
  async add(p) { if (typeof finEnsure === 'function') finEnsure(p); Store.projects[p.id] = p; if (Store.persist) await DB.put(p); },
  async remove(id) { delete Store.projects[id]; if (Store.persist) await DB.del(id); },
};

function blankPhoto() {
  return { brief: { client: '', campaign: '', photographer: '', concept: '', mood: '', objectives: '', messages: '', usage: '', territory: '', term: '', exclusivity: '', budgetCap: '', deliverables: [], approvers: [] },
    shots: [], gear: [], releases: [], runs: {}, selects: [], statuses: null };
}
function blankPodcast() {
  return { rundown: [], guests: [], sponsors: [], gear: [], notes: { titleOptions: '', summary: '', links: '', audioCues: [] } };
}
function blankProject(mode = 'screenplay', title = 'Untitled') {
  const p = blankProjectRaw(mode, title), rg = (typeof Prefs !== 'undefined' && REGIONS[Prefs.region]) ? Prefs.region : 'US', d = REGIONS[rg];
  p.settings.region = rg; p.settings.currency = d.currency; if (rg !== 'US') { p.settings.dayHours = d.dayHours; p.settings.mealHours = d.mealHours; p.settings.turnaround = d.turnaround; }
  return p;
}
function blankProjectRaw(mode, title) {
  return {
    id: uid(), title, mode, created: Date.now(), updated: Date.now(),
    meta: { credit: 'Written by', author: '', source: '', contact: '', draft: '', copyright: '', logline: '' },
    blocks: [{ id: uid(), type: 'scene', text: mode === 'stage' ? '' : '' }],
    sceneMeta: {}, revisions: [], snapshots: [], tags: [], shots: [], boards: [], days: [], people: [], locations: [], budget: [],
    stage: { plans: [] }, cues: [],
    casting: { roles: [] }, props: [], wardrobe: [], lookbook: { boards: [] }, takes: [], tasks: [], reports: {}, pitch: { theme: 'ink', slides: [] },
    series: null, lined: [], photo: blankPhoto(), podcast: blankPodcast(), fin: null, shotTags: [], seqs: [],
    settings: { sceneNumbers: false, sceneNumLock: false, multicam: false, rev: '', autoContd: true, zoom: 1, aspect: '16:9', currency: '$', contingency: 10 },
  };
}
function migrate(p) {
  p.settings = p.settings || {}; if (!p.settings.region) p.settings.region = 'US';
  const d = blankProject(p.mode, p.title);
  for (const k in d) if (p[k] === undefined) p[k] = d[k];
  p.settings = Object.assign({}, d.settings, p.settings);
  p.meta = Object.assign({}, d.meta, p.meta);
  p.stage = p.stage || { plans: [] };
  if (typeof finEnsure === 'function') { try { finEnsure(p); } catch (e) { console.warn('finance migrate', e); } }
  p.photo = Object.assign(blankPhoto(), p.photo || {}); p.photo.brief = Object.assign(blankPhoto().brief, p.photo.brief || {});
  p.podcast = Object.assign(blankPodcast(), p.podcast || {}); p.podcast.notes = Object.assign(blankPodcast().notes, p.podcast.notes || {});
  if (typeof linkLegacyTags === 'function') { try { linkLegacyTags(p); } catch (e) { console.warn('legacy tag link', e); } }
  return p;
}
const cur = () => Store.P;

/* ===================================================================
   Script model
   =================================================================== */
/* element types, capitals, what Enter makes next and each mode's default line: js/models/script.model.js */
const { TYPES, CAPS, NEXT, DEFAULT_TYPE } = ScriptModel;
const gapOf = t => (t === 'paren' || t === 'dialogue') ? 0 : (t === 'scene' || t === 'act') ? 2 : 1;
const HEAD_DASH = /\s+(?:-{1,3}|–|—)\s+/;
const TOD_WORD = /\b(DAWN|SUNRISE|MORNING|DAY|NOON|AFTERNOON|EVENING|SUNSET|DUSK|TWILIGHT|NIGHT|MIDNIGHT|CONTINUOUS|LATER|MOMENTS LATER|SAME|SAME TIME)\b/i;
function parseHeading(t, mode) {
  t = (t || '').trim();
  if (mode === 'photo') { const pr = t.split(/\s+—\s+/); return { ioe: '', location: (pr[1] || '').trim(), tod: (pr[2] || '').trim() }; }   // "Setup name — Location — Time"
  if (mode === 'podcast') {
    const m = /^(?:SEGMENT|TRACK|SCENE|PART|ACT)\s+[\w.]+\s*(?:[-–—:]\s*)?(.*)$/i.exec(t); let rest = (m && m[1]) ? m[1] : t, tod = '';
    const parts = rest.split(HEAD_DASH); if (parts.length > 1 && TOD_WORD.test(parts[parts.length - 1])) { tod = parts.pop().trim(); rest = parts.join(' - '); }
    return { ioe: '', location: rest.replace(/^[,;:\s]+|[,;:\s]+$/g, '').trim(), tod };
  }
  if (mode === 'stage') {   // "SCENE 1 - A DOCTOR'S WAITING ROOM, LATE AFTERNOON"  /  "Scene Two: The Kitchen, Evening"
    const m = /^(?:SCENE|SC\.?)\s+[\w.]+\s*(?:[-–—:.]\s*)?(.*)$/i.exec(t); let rest = (m && m[1]) ? m[1] : t, tod = '';
    const parts = rest.split(HEAD_DASH); if (parts.length > 1 && TOD_WORD.test(parts[parts.length - 1])) { tod = parts.pop().trim(); rest = parts.join(' - '); }
    else { const c = rest.lastIndexOf(','); if (c > 0 && TOD_WORD.test(rest.slice(c + 1)) && rest.slice(c + 1).split(' ').length <= 4) { tod = rest.slice(c + 1).trim(); rest = rest.slice(0, c); } }
    return { ioe: '', location: rest.replace(/^[,;:\s]+|[,;:\s]+$/g, ''), tod };
  }
  const m = /^\s*(INT\.?\s*\/\s*EXT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?|EST\.?)\s*(.*)$/i.exec(t);
  let ioe = '', rest = t;
  if (m) { ioe = m[1].toUpperCase().replace(/[.\s]/g, ''); rest = m[2]; }
  const parts = rest.split(HEAD_DASH);
  const tod = parts.length > 1 ? parts.pop().trim() : '';
  return { ioe, location: parts.join(' - ').trim(), tod };
}
const normChar = t => (t || '').toUpperCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\^/g, '').trim();
const isNight = tod => /\b(NIGHT|EVENING|DUSK|MIDNIGHT|DARK|SUNSET|TWILIGHT)\b/i.test(String(tod || '').replace(/\(.*?\)/g, ''));

function getScenes(p) {
  const out = []; let c = null, n = 0, act = '', actN = 0, inAct = 0;
  p.blocks.forEach((b, i) => {
    if (b.type === 'act') { act = b.text; actN++; inAct = 0; c = null; return; }
    if (b.type === 'scene') {
      n++; inAct++; if (b.om) { c = null; return; } const hd = parseHeading(b.text, p.mode);
      c = { id: b.id, num: (p.settings.sceneNumLock && b.num) ? b.num : (p.mode === 'stage' && actN ? `${actN}.${inAct}` : (p.settings.multicam && p.mode === 'screenplay') ? sceneLetter(inAct) : n), ord: n, heading: b.text, idx: i, end: i + 1, act, ...hd, lines: 2, chars: new Map() };
      out.push(c); return;
    }
    if (c) {
      c.end = i + 1; c.lines += gapOf(b.type) + lineCount(b, p.mode, p.settings.multicam && p.mode === 'screenplay');
      if (b.type === 'character') { const ch = normChar(b.text); if (ch) c.chars.set(ch, (c.chars.get(ch) || 0) + 1); }
    }
  });
  out.forEach(s => {
    if (p.mode === 'av') s.lines = 2 + avLines(p, s);
    s.eighths = Math.max(1, Math.round(s.lines / lppOf(p) * 8));
    s.night = isNight(s.tod);
    s.synopsis = (p.sceneMeta[s.id] || {}).synopsis || '';
    s.color = (p.sceneMeta[s.id] || {}).color || '';
    s.label = stripRich(s.heading) || '(untitled scene)';
  });
  return out;
}
function scriptStats(p) {
  const pages = paginate(p).count;
  const words = sum(p.blocks, b => (b.text.trim() ? b.text.trim().split(/\s+/).length : 0));
  return { pages, words, scenes: p.blocks.filter(b => b.type === 'scene' && !b.om).length };
}
const fmtEighths = e => { const w = Math.floor(e / 8), r = e % 8; return (w ? w : '') + (w && r ? ' ' : '') + (r ? r + '/8' : '') || '0'; };
const sceneBlocks = (p, s) => p.blocks.slice(s.idx, s.end);
function sceneCast(p, s) {
  const set = new Set(s.chars.keys());
  p.tags.forEach(t => { if (t.sceneId === s.id && t.cat === 'cast') set.add(normChar(t.text)); });
  return set;
}
const sceneByIdMap = p => Object.fromEntries(getScenes(p).map(s => [s.id, s]));
const sceneLabel = s => s ? `${s.num}. ${s.label}` : '';
function allCharacters(p) {
  const m = new Map();
  p.blocks.forEach(b => { if (b.type === 'character') { const c = normChar(b.text); if (c) m.set(c, (m.get(c) || 0) + 1); } });
  return m;
}

/* ---------- rendering a scene read-only (breakdown, shot list) ---------- */
function miniScene(p, s, hl) {
  const wrap = h('div', { class: 'mini ' + p.mode });
  sceneBlocks(p, s).forEach(b => wrap.append(h('div', { class: 'rb t-' + b.type, html: hl ? hl(stripRich(b.type === 'character' ? cueText(b) : b.text)) : richHTML(b.type === 'character' ? cueText(b) : b.text) })));
  return wrap;
}

/* ===================================================================
   Fountain / FDX / text
   =================================================================== */
const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
function parseFountain(src, mode = 'screenplay') {
  const notes = [];
  src = src.replace(/\r\n?/g, '\n').replace(/[ \t]*\[\[([\s\S]*?)\]\]/g, (_, n) => { notes.push(n.trim()); return ` \u0001${notes.length - 1}\u0002`; }).replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = src.split('\n'); const meta = {}; let i = 0;
  if (/^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision)\s*:/i.test(lines[0] || '')) {
    let key = null;
    while (i < lines.length && lines[i].trim() !== '') {
      const m = /^([A-Za-z ]+):\s*(.*)$/.exec(lines[i]);
      if (m) { key = m[1].trim().toLowerCase(); meta[key] = m[2]; } else if (key) meta[key] += (meta[key] ? '\n' : '') + lines[i].trim();
      i++;
    }
  }
  const blocks = [];
  const push = (type, text) => {
    const b = { id: uid(), type, text }; const m = /\s*\u0001(\d+)\u0002/.exec(text);
    if (m) { b.note = notes[+m[1]]; b.text = text.replace(/\s*\u0001\d+\u0002/g, ''); }
    blocks.push(b);
  };
  const isChar = t => t === t.toUpperCase() && /[A-Z]/.test(t) && !/^\(/.test(t) && !SCENE_RE.test(t) && !/TO:$/.test(t) && t.length < 48 && !/^[=#.!>~]/.test(t);
  const readDialogue = from => {
    let j = from, buf = [];
    const flush = () => { if (buf.length) { push('dialogue', buf.join('\n')); buf = []; } };
    while (j + 1 < lines.length && lines[j + 1].trim()) {
      j++; const l = lines[j].trim();
      if (/^\(.*\)$/.test(l)) { flush(); push('paren', l); } else buf.push(l);
    }
    flush(); return j;
  };
  for (; i < lines.length; i++) {
    const ln = lines[i]; if (!ln.trim()) continue;
    const t = ln.trim();
    if (/^\u0001\d+\u0002$/.test(t)) { const last = blocks[blocks.length - 1]; if (last) last.note = notes[+t.slice(1, -1)]; continue; }
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i + 1 >= lines.length || !lines[i + 1].trim();
    if (/^={3,}$/.test(t) || /^=/.test(t)) continue;
    if (t[0] === '#') {
      const m = /^(#+)\s*(.*)/.exec(t);
      if (mode === 'stage') push(m[1].length === 1 ? 'act' : 'scene', m[2].toUpperCase());
      else if (m[1].length === 1) push('act', m[2].toUpperCase());
      continue;
    }
    if (t[0] === '.' && t[1] !== '.') { push('scene', t.slice(1).trim().toUpperCase()); continue; }
    if (t[0] === '!') {
      if (mode === 'podcast') {
        const sub = ln.replace(/^\s*!\s*/, '');
        if (/^(?:SFX|SOUND|FX)[:\s]/i.test(sub)) { push('sfx', sub); continue; }
        if (/^(?:MUSIC|TRACK|THEME)[:\s]/i.test(sub)) { push('music', sub); continue; }
        if (/^(?:CLIP|TAPE|ACTUALITY)[:\s]/i.test(sub)) { push('clip', sub); continue; }
        if (/^(?:SPONSOR|AD|MIDROLL)[:\s]/i.test(sub)) { push('sponsor', sub); continue; }
      }
      push('action', ln.replace(/^\s*!/, '')); continue;
    }
    if (t[0] === '@') { push('character', t.slice(1).trim().toUpperCase()); i = readDialogue(i); continue; }
    if (t[0] === '>' && !/<$/.test(t)) { push('transition', t.slice(1).trim().toUpperCase()); continue; }
    if (t[0] === '>') { push('action', t.replace(/^>\s*|\s*<$/g, '')); continue; }
    if (prevBlank && mode === 'stage' && /^ACT\s+\w+/i.test(t) && nextBlank) { push('act', t.toUpperCase()); continue; }
    if (prevBlank && mode === 'stage' && /^SCENE\s+\w+/i.test(t) && nextBlank) { push('scene', t.toUpperCase()); continue; }
    if (prevBlank && mode === 'podcast' && /^(?:SEGMENT|TRACK|SCENE|PART)\s+\w+/i.test(t) && nextBlank) { push('scene', t.toUpperCase()); continue; }
    if (prevBlank && mode === 'podcast' && /^(?:SFX|SOUND|FX)[:\s]/i.test(t)) { push('sfx', t); continue; }
    if (prevBlank && mode === 'podcast' && /^(?:MUSIC|TRACK|THEME)[:\s]/i.test(t)) { push('music', t); continue; }
    if (prevBlank && mode === 'podcast' && /^(?:CLIP|TAPE|ACTUALITY)[:\s]/i.test(t)) { push('clip', t); continue; }
    if (prevBlank && mode === 'podcast' && /^(?:SPONSOR|AD|MIDROLL)[:\s]/i.test(t)) { push('sponsor', t); continue; }
    if (prevBlank && SCENE_RE.test(t)) { push('scene', t.replace(/\s*#[^#]*#$/, '').toUpperCase()); continue; }
    if (prevBlank && nextBlank && (/^[A-Z0-9 .\-']+TO:$/.test(t) || /^(FADE IN:|FADE OUT\.?|FADE TO BLACK\.?|CUT TO BLACK\.?|BLACKOUT\.?|THE END\.?)$/.test(t))) { push('transition', t); continue; }
    if (prevBlank && !nextBlank && isChar(t)) { push('character', t); i = readDialogue(i); continue; }
    const buf = [ln.replace(/\s+$/, '')];
    while (i + 1 < lines.length && lines[i + 1].trim()) { i++; buf.push(lines[i].replace(/\s+$/, '')); }
    push('action', buf.join('\n'));
  }
  if (mode === 'stage') blocks.forEach((b, k) => {
    if (b.type === 'action') b.type = (blocks[k - 1] && (blocks[k - 1].type === 'scene' || blocks[k - 1].type === 'act')) ? 'setting' : 'direction';
    else if (b.type === 'transition') b.type = 'cue';
  });
  if (mode === 'av') blocks.forEach(b => { if (b.type === 'action') b.type = 'video'; else if (['character', 'dialogue', 'paren', 'transition', 'shot'].includes(b.type)) b.type = 'audio'; });
  if (mode === 'podcast') blocks.forEach(b => {
    if (b.type === 'action') {
      if (/^(?:SFX|SOUND|FX)[:\s]/i.test(b.text)) b.type = 'sfx';
      else if (/^(?:MUSIC|TRACK|THEME)[:\s]/i.test(b.text)) b.type = 'music';
      else if (/^(?:CLIP|TAPE|ACTUALITY)[:\s]/i.test(b.text)) b.type = 'clip';
      else if (/^(?:SPONSOR|AD|MIDROLL)[:\s]/i.test(b.text)) b.type = 'sponsor';
      else b.type = 'dialogue';
    }
  });
  return { meta, blocks };
}
function toFountain(p) {
  const m = p.meta; let o = '';
  const kv = (k, v) => v ? `${k}: ${String(v).replace(/\n/g, '\n    ')}\n` : '';
  o += kv('Title', p.title) + kv('Credit', m.credit) + kv('Author', m.author) + kv('Source', m.source) + kv('Draft date', m.draft) + kv('Contact', m.contact) + kv('Copyright', m.copyright) + '\n';
  p.blocks.forEach(b => {
    const t = b.text; let piece;
    switch (b.type) {
      case 'act': piece = `# ${t}\n\n`; break;
      case 'scene': piece = (p.mode === 'stage' ? `## ${t}` : (SCENE_RE.test(t) ? t : '.' + t)) + '\n\n'; break;
      case 'character': piece = (/[a-z]/.test(t) ? '@' : '') + t + '\n'; break;
      case 'paren': piece = t + '\n'; break;
      case 'dialogue': piece = t + '\n\n'; break;
      case 'transition': piece = (/TO:$/.test(t) ? t : '> ' + t) + '\n\n'; break;
      case 'cue': piece = '> ' + t + '\n\n'; break;
      case 'sfx': piece = '!SFX: ' + t.replace(/^SFX:\s*/i, '') + '\n\n'; break;
      case 'music': piece = '!MUSIC: ' + t.replace(/^MUSIC:\s*/i, '') + '\n\n'; break;
      case 'clip': piece = '!CLIP: ' + t.replace(/^CLIP:\s*/i, '') + '\n\n'; break;
      case 'sponsor': piece = '!SPONSOR: ' + t.replace(/^SPONSOR:\s*/i, '') + '\n\n'; break;
      default: piece = '!' + t + '\n\n';
    }
    if (b.note) piece = piece.replace(/\n*$/, m => ` [[${b.note.replace(/\n/g, ' ')}]]` + m);
    o += piece;
  });
  return o;
}
function toFDX(p) {
  const map = { scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', act: 'Scene Heading', setting: 'Action', direction: 'Action', cue: 'Transition', sfx: 'General', music: 'General', clip: 'General', sponsor: 'General' };
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="2">\n<Content>\n` +
    p.blocks.map(b => `<Paragraph Type="${map[b.type] || 'Action'}">${richRuns(b.type === 'character' ? cueText(b) : b.text).map(r => `<Text${r.f ? ` Style="${[r.f & 1 ? 'Bold' : '', r.f & 2 ? 'Italic' : '', r.f & 4 ? 'Underline' : ''].filter(Boolean).join('+')}"` : ''}>${esc(r.t)}</Text>`).join('')}</Paragraph>`).join('\n') + `\n</Content>\n</FinalDraft>\n`;
}
function toPlainText(p) {
  if (p.mode === 'av') {      // two columns, 34 characters each
    const wrap = t => wrapRich(t, 34, false).map(l => l.chars.join('')), out = [];
    for (let i = 0; i < p.blocks.length; i++) {
      const b = p.blocks[i];
      if (b.type === 'scene') { out.push('', stripRich(b.text).toUpperCase(), ''); continue; }
      let L = '', R = '';
      if (AV_L.has(b.type)) { L = (b.type === 'super' ? '[SUPER] ' : '') + stripRich(b.text); const nb = p.blocks[i + 1]; if (nb && AV_R.has(nb.type)) { R = (nb.type === 'sfx' ? '[MUSIC/SFX] ' : '') + stripRich(nb.text); i++; } } else R = (b.type === 'sfx' ? '[MUSIC/SFX] ' : '') + stripRich(b.text);
      const a2 = wrap(L), b2 = wrap(R), n = Math.max(a2.length, b2.length);
      for (let k = 0; k < n; k++) out.push((a2[k] || '').padEnd(38) + (b2[k] || ''));
      out.push('');
    }
    return 'VIDEO'.padEnd(38) + 'AUDIO\n' + '-'.repeat(72) + out.join('\n');
  }
  const pad = (n, t) => t.split('\n').map(l => ' '.repeat(n) + l).join('\n');
  if (p.mode === 'podcast') {
    return p.blocks.map(b0 => {
      const b = { ...b0, text: stripRich(b0.type === 'character' ? cueText(b0) : b0.text) };
      if (b.type === 'scene') return '\n\n' + b.text.toUpperCase() + '\n' + '='.repeat(Math.max(20, Math.min(60, b.text.length))) + '\n';
      if (b.type === 'character') return '\n' + pad(16, b.text.toUpperCase()) + '\n';
      if (b.type === 'paren') return pad(16, '(' + b.text.replace(/^\(|\)$/g, '') + ')') + '\n';
      if (b.type === 'dialogue') return pad(10, b.text) + '\n';
      if (b.type === 'sfx') return '\n[SFX: ' + b.text.replace(/^SFX:\s*/i, '') + ']\n';
      if (b.type === 'music') return '\n[MUSIC: ' + b.text.replace(/^MUSIC:\s*/i, '') + ']\n';
      if (b.type === 'clip') return '\n[CLIP: ' + b.text.replace(/^CLIP:\s*/i, '') + ']\n';
      if (b.type === 'sponsor') return '\n[SPONSOR READ: ' + b.text.replace(/^SPONSOR:\s*/i, '') + ']\n';
      return b.text + '\n';
    }).join('');
  }
  return p.blocks.map(b0 => {
    const b = { ...b0, text: stripRich(b0.type === 'character' ? cueText(b0) : b0.text) };
    if (p.mode === 'stage') {
      if (b.type === 'act' || b.type === 'scene') return '\n' + pad(24, b.text);
      if (b.type === 'character') return pad(24, b.text);
      if (b.type === 'dialogue') return pad(10, b.text) + '\n';
      if (b.type === 'direction') return pad(18, '(' + b.text + ')') + '\n';
      return b.text + '\n';
    }
    const n = { character: 22, paren: 16, dialogue: 10, transition: 40 }[b.type] || 0;
    return (b.type === 'scene' ? '\n' : '') + pad(n, b.text) + (b.type === 'character' || b.type === 'paren' ? '' : '\n');
  }).join('\n');
}

/* ---------- misc shared ---------- */
const CATS = [
  { k: 'cast', label: 'Cast Members', color: '#e5484d' }, { k: 'extras', label: 'Background / Extras', color: '#30a46c' },
  { k: 'stunts', label: 'Stunts', color: '#f76b15' }, { k: 'vehicles', label: 'Vehicles', color: '#ca8a04' },
  { k: 'props', label: 'Props', color: '#8e4ec6' }, { k: 'wardrobe', label: 'Wardrobe', color: '#0091ff' },
  { k: 'makeup', label: 'Makeup & Hair', color: '#d6409f' }, { k: 'setdress', label: 'Set Dressing', color: '#00a2c7' },
  { k: 'sfx', label: 'Special Effects', color: '#12a594' }, { k: 'vfx', label: 'Visual Effects', color: '#6e56cf' },
  { k: 'sound', label: 'Sound / Music', color: '#3e63dd' }, { k: 'camera', label: 'Camera / Equipment', color: '#7c6f64' },
  { k: 'animals', label: 'Animals', color: '#a18072' }, { k: 'notes', label: 'Special Notes', color: '#687076' },
];
const CATMAP = Object.fromEntries(CATS.map(c => [c.k, c]));
const fmtTime = t => { if (!t) return ''; const [hh, mm] = t.split(':').map(Number); if (typeof clock24 === 'function' && clock24()) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
const fmtDate = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return x.toLocaleDateString(typeof regionDef === 'function' ? regionDef().locale : undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); };
const fmtDateShort = d => { if (!d) return ''; return new Date(d + 'T12:00:00').toLocaleDateString(typeof regionDef === 'function' ? regionDef().locale : undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
const money = (n, p = Store.P) => ((p && p.settings.currency) || '$') + (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* the script editor's lines grow with their text natively (CSS field-sizing) where supported, measured otherwise */
const AUTO_FIELD = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('field-sizing', 'content');
if (AUTO_FIELD) document.documentElement.classList.add('auto-field');
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
function autosizeAll(root) {
  const l = $$('textarea.auto', root); l.forEach(t => t.style.height = 'auto'); const hs = l.map(t => t.scrollHeight); l.forEach((t, i) => t.style.height = hs[i] + 'px');
}
const UI = { scene: null, shotScene: 'all', callDay: null, peopleTab: 'cast', bdMode: 'scene', stageTab: 'blocking' };

/* ---------- plural / singular handling for tag matching ---------- */
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* regex source matching a phrase and its plural / singular form, and its canonical singular key
   (the rules live in js/models/breakdown.model.js) */
const pluralPattern = text => BreakdownModel.plural(text);
const singularKey = text => BreakdownModel.key(text);
/* a tag's / item's assigned characters, always as a list (older data stored a single name) */
const whoOf = t => Array.isArray(t.who) ? t.who : (t.who ? [t.who] : []);

/* the location a scene is actually shot at: the linked Location profile if set, otherwise the heading's text */
const locName = (P, s) => LocationsModel.placeOf(P, s);


/* ===================================================================
   Device support — tablets and touch screens
   =================================================================== */
/* ---------- device profiles ----------
   A profile tunes the whole layout for one screen: density, touch targets, how the live
   dashboard is arranged, and which device features are used. `form` drives the CSS
   (html[data-form]), `id` allows exact tuning for one model (html[data-device]). */
const DEVICES = {
  auto: { label: 'Automatic', desc: 'Detects the screen and pointer each time the app opens.' },
  desktop: { label: 'Desktop / laptop', desc: 'Mouse and keyboard on a large screen: dense layout, hover tools, keyboard shortcuts.', form: 'desktop', touch: false,
    specs: ['Any size from 1366 × 768 up', 'Mouse, trackpad & keyboard', 'Side-by-side panels'] },
  ideatab: { label: 'Lenovo Idea Tab Plus 12.1″', desc: 'Laid out for its 2560 × 1600 (2.5K) 12.1″ screen at about 1280 × 800 layout pixels, in landscape or portrait.', form: 'tablet', touch: true, pen: true, css: [1280, 800],
    specs: ['12.1″ · 2560 × 1600 · 16:10', 'Touch + Lenovo Tab Pen Plus', 'Landscape cockpit, portrait stack', 'Screen kept awake on live views'] },
};
const Device = {
  installEvent: null,
  profile() { try { const p = localStorage.getItem('sb-device'); return DEVICES[p] ? p : 'auto'; } catch (e) { return 'auto'; } },
  /* the profile in effect: the chosen one, or a guess from the screen and pointer */
  form() { const d = DEVICES[Device.profile()]; return d.form || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 1100 ? 'tablet' : 'desktop'); },
  setProfile(p) { try { localStorage.setItem('sb-device', p); } catch (e) { } Device.apply(); },
  mode() { try { return localStorage.getItem('sb-touch') || 'auto'; } catch (e) { return 'auto'; } },
  /* touch targets: an explicit on / off wins, then the profile, then the pointer */
  touchOn() { const m = Device.mode(), d = DEVICES[Device.profile()]; return m === 'on' || (m === 'auto' && (d.touch !== undefined ? d.touch : matchMedia('(pointer: coarse)').matches)); },
  apply() {
    const r = document.documentElement, p = Device.profile();
    if (Device.touchOn()) r.dataset.touch = '1'; else delete r.dataset.touch;
    r.dataset.form = Device.form(); if (p === 'auto') delete r.dataset.device; else r.dataset.device = p;
    r.dataset.lists = Device.lists();
  },
  setMode(m) { try { localStorage.setItem('sb-touch', m); } catch (e) { } Device.apply(); },
  /* long tables and lists: 'scroll' (by touch or wheel, no bar, faded edges) or 'page' (‹ › pages that fit) */
  lists() { try { return localStorage.getItem('sb-lists') === 'page' ? 'page' : 'scroll'; } catch (e) { return 'scroll'; } },
  setLists(m) { try { localStorage.setItem('sb-lists', m === 'page' ? 'page' : 'scroll'); } catch (e) { } Device.apply(); },
  secure: () => window.isSecureContext,
  installed: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  init() {
    Device.apply(); try { matchMedia('(pointer: coarse)').addEventListener('change', Device.apply); } catch (e) { }
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); Device.installEvent = e; });
    window.addEventListener('appinstalled', () => { Device.installEvent = null; toast('StudioBindahh is installed.'); });
    if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }    // ask the browser not to evict our data
    /* keep the on-screen keyboard from hiding what you are typing */
    if (window.visualViewport) { const set = () => document.documentElement.style.setProperty('--vvh', visualViewport.height + 'px'); visualViewport.addEventListener('resize', set); set(); }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Device._awake.size) Device.awake([...Device._awake][0], true); });
    /* full-screen presentations (pitch deck, storyboard) keep the screen awake while they are open */
    new MutationObserver(() => Device.awake('present', !!document.querySelector('body > .present'))).observe(document.body, { childList: true });
  },
  /* keep the screen on while something needs watching (live dashboard, presentations, table reads).
     Each caller holds its own reason; the lock is released when none remain, and re-taken when the
     tablet wakes or the tab comes back to the front (the browser drops it when hidden). */
  _awake: new Set(), _lock: null,
  async awake(reason, on) {
    if (on) Device._awake.add(reason); else Device._awake.delete(reason);
    if (!('wakeLock' in navigator)) return;
    try {
      if (Device._awake.size && !Device._lock && document.visibilityState === 'visible') {
        Device._lock = await navigator.wakeLock.request('screen');
        Device._lock.addEventListener('release', () => { Device._lock = null; });
      } else if (!Device._awake.size && Device._lock) { const l = Device._lock; Device._lock = null; await l.release(); }
    } catch (e) { Device._lock = null; }
  },
  async install() { const e = Device.installEvent; if (!e) return false; e.prompt(); const r = await e.userChoice.catch(() => ({})); Device.installEvent = null; return r.outcome === 'accepted'; },
};
/* copying text works on plain-http network addresses too */
async function copyText(t) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return true; } } catch (e) { }
  const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.append(ta); ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } ta.remove(); return ok;
}
