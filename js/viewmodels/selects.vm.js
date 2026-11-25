'use strict';
/* ===================================================================
   Selects & approvals — VIEW MODEL. The frame grid, its filters and
   sort, the thumbnail size, importing, rating, flags, colours,
   approvals and shot links. No DOM. See js/mvvm.js.
   =================================================================== */

class SelectsVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; plus opts.fx (defaults use the app):
   *   holder(P) → P.photo (made when missing);  scenes(P) → the setups;  shotLabel(P, shot, scenes) → '1A'
   */
  constructor(opts = {}) {
    super(opts);
    this._fx = Object.assign({
      holder: P => (P.photo = P.photo || blankPhoto()),
      scenes: P => getScenes(P),
      shotLabel: (P, s, scenes) => photoShotLabel(P, s, scenes),
    }, opts.fx || {});
    this.f = this.uiState('selF', SelectsModel.blankFilter());
    if (!(this._ui.selSize >= 110 && this._ui.selSize <= 360)) this._ui.selSize = 190;
  }

  /* ---------- what the view shows ---------- */
  get H() { const H = this._fx.holder(this.P); H.selects = H.selects || []; H.shots = H.shots || []; return H; }
  get all() { return this.H.selects; }
  get filter() { const F = SelectsModel.cleanFilter(this.f); if (F.shot && !this.shots.some(s => s.id === F.shot)) F.shot = ''; return F; }
  get rows() { return SelectsModel.filter(this.all, this.filter); }
  get statsText() { return SelectsModel.statsText(this.all); }
  get size() { return this._ui.selSize; }
  get scenes() { return this._fx.scenes(this.P); }
  /** shots that can be linked, as [{ id, label }] */
  get shots() { const sc = this.scenes; return SelectsModel.shotChoices(this.H, sc).map(s => ({ id: s.id, label: `${this._fx.shotLabel(this.P, s, sc)} ${s.title || ''}`.slice(0, 40) })); }
  find(id) { return SelectsModel.find(this.H, id); }
  /** picked filenames in the current view */
  picks() { return SelectsModel.picks(this.rows); }
  csvRows() { const sc = this.scenes; return SelectsModel.csvRows(this.H, s => this._fx.shotLabel(this.P, s, sc)); }
  /** would adding n frames make a set big enough to ask first? */
  isBig(n) { return this.all.length + n > SelectsModel.BIG_SET; }

  /* ---------- filters and size (UI: remembered, not saved) ---------- */
  setFilter(k, v) { if (!(k in this.f)) return; this.setUi('selF', SelectsModel.cleanFilter(Object.assign({}, this.f, { [k]: k === 'rating' ? +v : v }))); }
  /** the size slider resizes the cells itself, so no redraw */
  setSize(n) { n = +n; if (n >= 110 && n <= 360) this._ui.selSize = n; }

  /* ---------- commands ---------- */
  /** add imported thumbnails [{ name, thumb, w, h }] → how many were added (one redraw) */
  addImages(images) { return images.length ? this.commit(() => { images.forEach(t => SelectsModel.add(this.H, { name: t.name, thumb: t.thumb, w: t.w, h: t.h })); return images.length; }) : 0; }
  _on(id, fn, o) { const x = this.find(id); return x ? this.commit(() => fn(x), o) : false; }
  rate(id, n) { return this._on(id, x => SelectsModel.rate(x, n)); }
  setRating(id, n) { return this._on(id, x => SelectsModel.setRating(x, n)); }
  setFlag(id, f) { return this._on(id, x => SelectsModel.setFlag(x, f)); }
  toggleFlag(id, f) { return this._on(id, x => SelectsModel.toggleFlag(x, f)); }
  setColor(id, c) { return this._on(id, x => SelectsModel.setColor(x, c)); }
  setStatus(id, s) { return this._on(id, x => SelectsModel.setStatus(x, s)); }
  linkShot(id, shotId) { return this._on(id, x => SelectsModel.linkShot(this.H, x, shotId)); }
  /** typing is quiet */
  setNote(id, v) { return this._on(id, x => SelectsModel.setNote(x, v), { quiet: true }); }
}
