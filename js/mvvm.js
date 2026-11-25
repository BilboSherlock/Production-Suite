'use strict';
/* ===================================================================
   MVVM foundation

   Every section is built in three layers:
   Tasks, Schedule, Call sheets, Reports, Daily reports, Live desk, Podcast suite (planner + recorder), Budget, Props & wardrobe, Breakdown, Cast & crew (with Casting), Locations, Shot list, Storyboard, Lookbook, Pitch deck, Script editor, Corkboard, Gear & rentals, Overview, Releases & permits, Selects, Run of show, Setups & looks, Photo shot list, Shoot brief, Series bible, Blocking & cues, Script supervisor (take log + lined script), Projects home, Contacts, Settings, Search, Region dialog.

   MODEL       js/models/<feature>.model.js
               The project data (plain objects inside Store.P) plus the rules
               that change and query it: pure functions that take the project
               or a list and return a result. No DOM, no Store, no UI state —
               so they run in the browser and in Node tests alike.

   VIEW MODEL  js/viewmodels/<feature>.vm.js
               One object per screen. Holds the screen's UI state (filters,
               mode), exposes derived data as getters (what to show), and
               commands (what the user can do). Commands change the model only
               through `commit`, which records the change for saving, undo and
               live collaboration (Store.touch) and tells the view to redraw.
               No DOM.

   VIEW        js/<feature>.js  — Views.<feature>(root)
               Builds the DOM from the view model and wires events to its
               commands. Never edits project data itself.

   Rules of thumb
   - A view reads `vm.something` and calls `vm.doSomething()`. If a view
     needs `P.x = …`, that line belongs in a model function.
   - Typing into a field: call the command with { quiet: true } so the change
     is saved without redrawing (and stealing focus from) the field.
   - View models read the project lazily (`this.P`), because undo, folder sync
     and live sessions can swap whole sections of the project out underneath.
   =================================================================== */

/** A minimal change notifier. */
class Observable {
  constructor() { /** @type {Set<Function>} */ this._subs = new Set(); }
  /** @param {Function} fn  @returns {() => void} unsubscribe */
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }
  notify() { [...this._subs].forEach(fn => { try { fn(this); } catch (e) { console.error(e); } }); }
}

/**
 * Base class for a screen's view model.
 * @param {object} [opts]
 * @param {() => object} [opts.project]  where the project comes from (default: the open project)
 * @param {{ touch(): void }} [opts.store] what records a change (default: Store — save, undo, live sync)
 * @param {object} [opts.ui] object that keeps UI state between visits (default: the global UI)
 */
class ViewModel extends Observable {
  constructor(opts = {}) {
    super();
    this._project = opts.project || (() => Store.P);
    this._store = opts.store || Store;
    this._ui = opts.ui || UI;
  }
  /** The project, read fresh every time. */
  get P() { return this._project(); }

  /**
   * Change the model. `fn` receives the project; its return value is passed back.
   * Records the change (save / undo / live collaboration) and redraws unless quiet.
   */
  commit(fn, { quiet = false } = {}) {
    const r = fn(this.P);
    this._store.touch();
    if (!quiet) this.notify();
    return r;
  }

  /**
   * UI state that survives leaving and returning to the screen (kept on the
   * global UI object, which lives for the browser session; not saved to the project).
   */
  uiState(key, defaults) {
    const s = this._ui[key] = Object.assign({}, defaults, this._ui[key]);
    return s;
  }
  /** Change UI state and redraw. Not saved, not undoable. */
  setUi(key, patch) { Object.assign(this._ui[key], patch); this.notify(); }

  /** Redraw without changing anything (e.g. after a dialog closes). */
  refresh() { this.notify(); }
  dispose() { this._subs.clear(); }
}

/**
 * Connect a view's draw function to its view model: draws now and on every change.
 * @returns {() => void} call to disconnect (return it from Views.x as part of cleanup)
 */
function bindView(vm, draw) {
  const off = vm.subscribe(draw);
  draw();
  return () => { off(); vm.dispose(); };
}

/** A new id for model objects (the app's uid() when loaded; a fallback in Node tests). */
const newId = () => typeof uid === 'function' ? uid() : Math.random().toString(36).slice(2, 11);

/** A file-name-safe version of a title (the app's slug() when loaded; a fallback in Node tests). */
const slugOf = t => typeof slug === 'function' ? slug(t) : (String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project');

/** Today's date as YYYY-MM-DD in the user's own time zone (not UTC). */
const localISODate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
