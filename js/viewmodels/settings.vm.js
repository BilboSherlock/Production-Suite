'use strict';
/* ===================================================================
   Settings — VIEW MODELS. No DOM. See js/mvvm.js.
   - SettingsVM: the "Sections & features" dialog. Works on a draft;
     nothing changes until save().
   - DeviceVM:   the device this copy of the app is laid out for
     (stored on the device by Device, not in any project).
   =================================================================== */

class SettingsVM extends ViewModel {
  /**
   * @param {object} [opts]  see ViewModel; opts.project → the open project when opened inside one (else null);
   *   plus opts.fx: prefs() → the global choice (Prefs);  savePrefs() (async)
   */
  constructor(opts = {}) {
    super(Object.assign({ project: () => null }, opts));
    this._fx = Object.assign({ prefs: () => Prefs, savePrefs: () => savePrefs() }, opts.fx || {});
    const P = this.P;
    /** the working copy (see SettingsModel.draft) */
    this.D = SettingsModel.draft(P, this.prefs, P && P.settings.nav ? 'project' : 'global');
    /** the default standards for new projects (only when opened outside a project) */
    this.region = this.prefs.region;
  }
  get prefs() { return this._fx.prefs(); }
  /** opened inside a project: the choice can apply to just this project */
  get scoped() { return !!this.P; }
  get scope() { return this.D.scope; }
  has(key) { return this.D.on.has(key); }
  folded(id) { return this.D.fold.has(id); }
  get preset() { return this.D.preset; }
  get foldPreset() { return this.D.foldPreset; }
  get foldChoices() { return SettingsModel.foldChoices(this.P); }
  /** inside a project that has its own choice: it can go back to the global one */
  get canUseGlobal() { const P = this.P; return !!(P && this.scope === 'project' && P.settings.nav); }

  setScope(s) { this.D = SettingsModel.draft(this.P, this.prefs, s === 'project' && this.scoped ? 'project' : 'global'); this.notify(); }
  setRegion(k) { this.region = k; this.notify(); }
  choosePreset(k) { const p = SettingsModel.PRESETS[k]; if (!p) return; this.D.on = new Set(p.on); this.D.preset = k; this.notify(); }
  toggle(key, on) { if (key === 'overview') return; on ? this.D.on.add(key) : this.D.on.delete(key); this.D.preset = SettingsModel.matchPreset(this.D.on); this.notify(); }
  chooseFold(k) { const p = SettingsModel.FOLD_PRESETS[k]; if (!p) return; this.D.fold = new Set(p.hubs); this.D.foldPreset = k; this.notify(); }
  toggleFold(id, on) { on ? this.D.fold.add(id) : this.D.fold.delete(id); this.D.foldPreset = SettingsModel.matchFold(this.D.fold); this.notify(); }

  /** store the draft (the project, or the global choice and default standards) */
  async save() {
    const P = this.P, prefs = this.prefs; if (!this.scoped) prefs.region = this.region;
    const r = SettingsModel.apply(this.D, P, prefs);
    if (r.project) this._store.touch();
    if (r.prefs) await this._fx.savePrefs();
    return r;
  }
  /** the project drops its own choice and follows the global one */
  useGlobal() { const P = this.P; if (P && SettingsModel.useGlobal(P)) this._store.touch(); }
}

class DeviceVM extends ViewModel {
  /** @param {object} [opts]  see ViewModel; plus opts.device → what stores the choice (default: Device) and opts.devices (default: DEVICES) */
  constructor(opts = {}) {
    super(Object.assign({ project: () => null }, opts));
    this._dev = opts.device || Device; this.devices = opts.devices || DEVICES;
  }
  get profile() { return this._dev.profile(); }
  get mode() { return this._dev.mode(); }
  /** 'In use now: tablet layout · 1280 × 800 layout pixels · touch controls' (w, h: the window size) */
  inUse(w, h) { return `In use now: ${this._dev.form() === 'tablet' ? 'tablet' : 'desktop'} layout · ${w} × ${h} layout pixels · ${this._dev.touchOn() ? 'touch' : 'pointer'} controls`; }
  setProfile(k) { this._dev.setProfile(k); this.notify(); }
  setMode(k) { this._dev.setMode(k); this.notify(); }
}
