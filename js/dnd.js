'use strict';
/* ===================================================================
   Drag & drop — one helper for every reorderable thing in the app
   (storyboard frames, corkboard cards, outline scenes, stripboard
   strips, task cards, photo shot cards), plus touch support so the
   same code works with a mouse, a finger or a pen.

     DnD.source(el, kind, id, { handle })     el can be dragged
     DnD.zone(el, kind, onDrop, opts)         el accepts drops
     DnD.item(el, kind, id, onDrop, opts)     both: a reorderable item

   Zone options (pick one style of drop):
     edge: 'x' | 'y'   el is an item; onDrop(id, after) — before / after
                       it, by which half the pointer is over
     items: selector   el is a list; onDrop(id, index) — the insertion
                       index among its matching children, with a line
                       showing where the item will land
     (neither)         el is a bin; onDrop(id)
   `self` is an id that may not be dropped on itself.
   =================================================================== */
const DnD = {
  cur: null,                                   // { kind, id, el } while something is being dragged
  clear() {
    document.querySelectorAll('.dnd-over, .dnd-before, .dnd-after').forEach(x => x.classList.remove('dnd-over', 'dnd-before', 'dnd-after'));
    document.querySelectorAll('.drop-ind').forEach(x => x.remove());
  },
  end() { if (DnD.cur) DnD.cur.el.classList.remove('dragging'); DnD.cur = null; DnD.clear(); },

  source(el, kind, id, { handle } = {}) {
    const touching = () => document.documentElement.classList.contains('touch-dragging');
    el.draggable = !handle; el._own = true;   // its listeners are its own: morph() swaps it whole
    if (handle) {                              // drag only from the handle, so text inside stays selectable
      handle.addEventListener('pointerdown', () => { el.draggable = true; });
      handle.addEventListener('pointerup', () => { if (!touching()) el.draggable = false; });
    }
    el.addEventListener('dragstart', e => {
      if (e.target !== el) return;
      DnD.cur = { kind, id, el };
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
      setTimeout(() => DnD.cur && DnD.cur.el === el && el.classList.add('dragging'), 0);
    });
    el.addEventListener('dragend', () => { if (handle) el.draggable = false; DnD.end(); });
    return el;
  },

  zone(el, kind, onDrop, { edge, items, self } = {}) {
    el._own = true;
    const ok = () => DnD.cur && DnD.cur.kind === kind && DnD.cur.id !== self;
    const after = e => { const r = el.getBoundingClientRect(); return edge === 'x' ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2; };
    const kids = () => [...el.querySelectorAll(items)].filter(x => !x.classList.contains('dragging'));
    if (edge) el.dataset.dndEdge = edge;       // the CSS draws the before / after line on the right side
    const index = e => { let i = 0; for (const k of kids()) { const r = k.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) break; i++; } return i; };
    el.addEventListener('dragover', e => {
      if (!ok()) return;
      e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move';
      if (edge) { const a = after(e); el.classList.toggle('dnd-after', a); el.classList.toggle('dnd-before', !a); return; }
      el.classList.add('dnd-over');
      if (items) {
        const ks = kids(), i = index(e), at = ks[i];
        let ind = el.querySelector(':scope .drop-ind');
        if (ind && (at ? ind.nextElementSibling === at : !ind.nextElementSibling)) return;   // already in place: no DOM churn
        ind = ind || document.createElement('div'); ind.className = 'drop-ind';
        if (at) at.before(ind); else (ks.length ? ks[ks.length - 1].parentElement : el).append(ind);
      }
    });
    el.addEventListener('dragleave', e => {
      if (el.contains(e.relatedTarget)) return;
      el.classList.remove('dnd-over', 'dnd-before', 'dnd-after'); el.querySelectorAll('.drop-ind').forEach(x => x.remove());
    });
    el.addEventListener('drop', e => {
      if (!ok()) return;
      e.preventDefault(); e.stopPropagation();
      const id = DnD.cur.id, arg = edge ? after(e) : items ? index(e) : undefined;
      DnD.end();                               // the drop usually redraws, so the dragged node may never see dragend
      onDrop(id, arg);
    });
    return el;
  },

  item(el, kind, id, onDrop, opts = {}) { return DnD.zone(DnD.source(el, kind, id, opts), kind, onDrop, { ...opts, self: id }); },
};

/* ---------- touch: press and hold, then drag ----------
   Drives the same dragstart / dragover / drop events the mouse uses. A quick swipe still
   scrolls; only a hold (~0.35 s) picks the item up. Near a scroller's edge the list scrolls. */
(function () {
  if (!('ontouchstart' in window) || typeof DataTransfer !== 'function') return;
  const HOLD = 350, SLOP = 10, EDGE = 56;
  let pend = null, drag = null;

  const fire = (type, el, t, dt) => {
    if (!el) return false;
    const ev = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: t.clientX, clientY: t.clientY, screenX: t.screenX, screenY: t.screenY, dataTransfer: dt });
    return !el.dispatchEvent(ev);              // true when a handler called preventDefault()
  };
  const under = t => document.elementFromPoint(t.clientX, t.clientY);
  const scrollerOf = el => { for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (a.scrollHeight > a.clientHeight || a.scrollWidth > a.clientWidth)) return a; } return null; };
  const cancelPending = () => { if (pend) { clearTimeout(pend.timer); pend = null; } };

  function start() {
    const { src, touch } = pend; pend = null;
    const dt = new DataTransfer(); dt.effectAllowed = 'all';
    if (fire('dragstart', src, touch, dt)) return;      // the view refused the drag
    const r = src.getBoundingClientRect(), ghost = src.cloneNode(true);
    ghost.classList.add('touch-ghost'); ghost.classList.remove('dragging'); ghost.removeAttribute('id');
    Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px', left: r.left + 'px', top: r.top + 'px' });
    document.body.append(ghost);
    drag = { src, dt, ghost, dx: touch.clientX - r.left, dy: touch.clientY - r.top, over: null, ok: false, last: touch, raf: 0 };
    document.documentElement.classList.add('touch-dragging');
    try { if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(12); } catch (e) { }
    move(touch);
  }
  function move(t) {
    const d = drag; d.last = t;
    d.ghost.style.transform = `translate(${t.clientX - d.dx - parseFloat(d.ghost.style.left)}px, ${t.clientY - d.dy - parseFloat(d.ghost.style.top)}px) rotate(1.5deg) scale(1.03)`;
    const el = under(t);
    if (el !== d.over) { if (d.over) fire('dragleave', d.over, t, d.dt); if (el) fire('dragenter', el, t, d.dt); d.over = el; }
    d.ok = el ? fire('dragover', el, t, d.dt) : false;
    if (!d.raf) d.raf = requestAnimationFrame(autoScroll);
  }
  function autoScroll() {
    const d = drag; if (!d) return; d.raf = 0;
    const el = d.over && scrollerOf(d.over); if (!el) return;
    const r = el.getBoundingClientRect(), t = d.last; let vx = 0, vy = 0;
    if (t.clientY < r.top + EDGE) vy = -1; else if (t.clientY > r.bottom - EDGE) vy = 1;
    if (t.clientX < r.left + EDGE) vx = -1; else if (t.clientX > r.right - EDGE) vx = 1;
    if (vx || vy) { el.scrollBy(vx * 14, vy * 14); d.raf = requestAnimationFrame(() => { if (drag) move(drag.last); }); }
  }
  function end(dropIt) {
    const d = drag; drag = null; if (!d) return;
    cancelAnimationFrame(d.raf);
    if (dropIt && d.ok && d.over) fire('drop', d.over, d.last, d.dt);
    else if (d.over) fire('dragleave', d.over, d.last, d.dt);
    fire('dragend', d.src, d.last, d.dt);
    d.ghost.remove(); document.documentElement.classList.remove('touch-dragging');
  }

  document.addEventListener('touchstart', e => {
    cancelPending(); if (drag) return end(false);
    if (e.touches.length !== 1) return;
    const t = e.touches[0], src = e.target.closest && e.target.closest('[draggable="true"]');
    if (!src || e.target.closest('input, textarea, select, button, [contenteditable], a[href]')) return;
    pend = { src, touch: t, x: t.clientX, y: t.clientY, timer: setTimeout(start, HOLD) };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (pend) { if (Math.hypot(t.clientX - pend.x, t.clientY - pend.y) > SLOP) cancelPending(); else pend.touch = t; return; }
    if (!drag) return;
    e.preventDefault(); move(t);
  }, { passive: false });
  document.addEventListener('touchend', e => { cancelPending(); if (drag) { e.preventDefault(); end(true); } }, { passive: false });
  document.addEventListener('touchcancel', () => { cancelPending(); end(false); });
  /* a long press would otherwise open the context menu or start the browser's own drag */
  document.addEventListener('contextmenu', e => { if (pend || drag) e.preventDefault(); }, true);
  document.addEventListener('dragstart', e => { if (e.isTrusted && (pend || drag)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
})();
