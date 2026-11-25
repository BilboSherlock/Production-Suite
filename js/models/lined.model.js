'use strict';
/* ===================================================================
   Script supervisor: lined script — MODEL. Coverage lines
   (P.lined: { id, shotId, from, to, kind: 'on' | 'off' }) run from the
   first to the last script line a shot covers. Given the script's
   pages (paginate() in js/layout.js), works out which rows each line
   covers on each page, the margin column each line is drawn in, and
   the marks to draw. Pure: no DOM, no Store. See js/mvvm.js.
   =================================================================== */

const LinedModel = (() => {
  /** pt between margin columns; a script row is 12pt */
  const LINE_W = 11, ROW = 12, MAX_COL = 7;
  const all = P => (P.lined = P.lined || []);
  const label = (P, s, scenes) => ShotsModel.label(P, s, scenes);

  /**
   * Rows of each page, and where every script line (block index) falls → { pg, pages:[{ page, rows, n }], seg, idx }
   * seg: block index → [{ page, r0, r1 }] (one entry per page the block is on); idx: block id → index.
   */
  function layout(P, pg) {
    const pages = [], idx = new Map(P.blocks.map((b, i) => [b.id, i])), seg = new Map();
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

  /** the lines that still point at a script line and a shot → [{ l, a, b, shot }] with a ≤ b */
  function lines(P, M) {
    return (P.lined || []).map(l => ({ l, a: M.idx.get(l.from), b: M.idx.get(l.to), shot: (P.shots || []).find(s => s.id === l.shotId) })).filter(x => x.a != null && x.b != null && x.shot)
      .map(x => (x.a > x.b ? { ...x, a: x.b, b: x.a } : x));
  }
  /** a margin column for each line, so lines that overlap never share one → Map line id → column */
  function columns(items) {
    const cols = new Map(), ends = [];
    [...items].sort((p, q) => p.a - q.a || q.b - p.b).forEach(it => { let c = ends.findIndex(e => e < it.a); if (c < 0) { c = ends.length; ends.push(0); } ends[c] = it.b; cols.set(it.l.id, c); });
    return cols;
  }
  /** the rows blocks a…b cover on page k → { r0, r1 }, or null when none are on it */
  function span(M, a, b, k) {
    let r0 = Infinity, r1 = -Infinity;
    for (let bi = a; bi <= b; bi++) (M.seg.get(bi) || []).forEach(s => { if (s.page === k) { r0 = Math.min(r0, s.r0); r1 = Math.max(r1, s.r1); } });
    return r0 === Infinity ? null : { r0, r1 };
  }
  /**
   * The coverage marks on page k → [{ id, kind, circ, x, top, height, label, title, topCut, botCut }] (positions in pt).
   * A cut end means the line carries on from the page before / to the page after.
   */
  function marks(P, M, k, items, cols, scenes) {
    const out = [];
    items.forEach(it => {
      const sp = span(M, it.a, it.b, k); if (!sp) return;
      const first = (M.seg.get(it.a) || [])[0], lasts = M.seg.get(it.b) || [], last = lasts[lasts.length - 1];
      const sc = scenes.find(s => s.id === it.shot.sceneId), circ = TakesModel.ofShot(P, it.shot.id).filter(t => t.status === 'circle').map(t => t.n);
      const lbl = label(P, it.shot, scenes) + (circ.length ? ' · T' + circ.join(',') : '');
      out.push({ id: it.l.id, kind: it.l.kind, circ: circ.length > 0, x: Math.min(cols.get(it.l.id) || 0, MAX_COL) * LINE_W, top: sp.r0 * ROW, height: (sp.r1 - sp.r0 + 1) * ROW, label: lbl,
        title: `Slate ${lbl} — ${it.l.kind === 'off' ? 'off camera' : 'on camera'}${sc ? ' · scene ' + sc.num : ''}`,
        topCut: !(first && first.page === k), botCut: !(last && last.page === k) });
    });
    return out;
  }
  /** the script line (block index) at row `row` of page k; a blank row counts as the line above it → index or null */
  function blockAt(M, k, row) {
    const { rows } = M.pages[k];
    for (const { rec, r, h } of rows) if (row >= r && row < r + h) {
      if (rec.kind === 'line') return rec.bi;
      if (rec.kind === 'dual') { const ln = [...rec.left, ...rec.right][row - r] || rec.left[0] || rec.right[0]; return ln ? ln.bi : null; }
    }
    for (let q = rows.length - 1; q >= 0; q--) { const z = rows[q]; if (z.r <= row && z.rec.kind === 'line') return z.rec.bi; }
    return null;
  }
  /** the first page a script line is on → page index or null */
  function pageOf(M, blockId) { const s = M.seg.get(M.idx.get(blockId)); return s && s[0] ? s[0].page : null; }

  /* ---------- editing ---------- */
  /** a line over script lines a…b (block indexes, either order) for a shot → the line */
  function add(P, shotId, a, b, kind) {
    const lo = Math.min(a, b), hi = Math.max(a, b); if (!P.blocks[lo] || !P.blocks[hi]) return null;
    const l = { id: newId(), shotId, from: P.blocks[lo].id, to: P.blocks[hi].id, kind: kind === 'off' ? 'off' : 'on' };
    all(P).push(l); return l;
  }
  const find = (P, id) => all(P).find(l => l.id === id) || null;
  /** on camera ⇄ off camera */
  function toggle(P, id) { const l = find(P, id); if (!l) return false; l.kind = l.kind === 'on' ? 'off' : 'on'; return true; }
  function remove(P, id) { const n = all(P).length; P.lined = P.lined.filter(l => l.id !== id); return P.lined.length < n; }

  /** the slate menu, in scene order → [{ id, label }] */
  const shotChoices = (P, scenes) => scenes.flatMap(sc => (P.shots || []).filter(s => s.sceneId === sc.id).map(s => ({ id: s.id, label: `${label(P, s, scenes)} — ${[s.size, s.desc].filter(Boolean).join(' · ') || 'shot'}`.slice(0, 60) })));

  return { LINE_W, ROW, layout, lines, columns, span, marks, blockAt, pageOf, add, find, toggle, remove, shotChoices };
})();
