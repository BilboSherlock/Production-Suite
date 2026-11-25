'use strict';
/* ===================================================================
   Projects home — MODEL. The project cards, setting up a new or
   duplicated project, the "back up all" bundle, and reading an
   imported .json (one project, a bundle of projects, or contacts).
   Pure: no DOM, no Store. See js/mvvm.js.
   =================================================================== */

const HomeModel = (() => {
  const MODE_LABEL = { screenplay: 'Screenplay', stage: 'Stage play', av: 'AV script', photo: 'Photo shoot', podcast: 'Podcast' };
  /** what a project's sections are called on its card */
  const UNIT = { av: 'segments', podcast: 'segments', photo: 'setups' };
  const modeLabel = m => MODE_LABEL[m] || 'Screenplay';

  /** most recently edited first */
  const sorted = projects => Object.values(projects).sort((a, b) => b.updated - a.updated);
  /**
   * A project's card → { id, title, mode, modeLabel, series, stats, edited }
   * stats = { scenes, pages };  epCode(series) → 'S1E2';  date(ms) → 'Mar 3, 2026'
   */
  function card(p, stats, epCode, date) {
    return { id: p.id, title: p.title || 'Untitled', mode: p.mode, modeLabel: modeLabel(p.mode),
      series: p.series ? `${p.series.name} · ${epCode(p.series)}` : null,
      stats: `${stats.scenes} ${UNIT[p.mode] || 'scenes'} · ~${stats.pages} pp`,
      edited: 'Edited ' + date(p.updated) + (p.meta && p.meta.author ? ' · ' + p.meta.author : '') };
  }

  /**
   * Give a new, blank project its first scene and line, and (photo / podcast) its section preset.
   * o = { defType: mode → first line type, presets: { photo: { on }, podcast: { on } } }
   */
  function setupNew(p, mode, o) {
    p.blocks = [{ id: newId(), type: 'scene', text: '' }, { id: newId(), type: o.defType(mode), text: '' }];
    if ((mode === 'photo' || mode === 'podcast') && o.presets[mode]) p.settings.nav = { preset: mode, on: o.presets[mode].on };
    return p;
  }
  /** where a new project opens */
  const startView = mode => mode === 'podcast' ? 'rundown' : 'script';

  /** a deep copy with a new id, '(copy)' on the title, and (in a series) the next episode number of its season */
  function copy(p, episodes, now) {
    const c = JSON.parse(JSON.stringify(p)); c.id = newId(); c.title = p.title + ' (copy)'; c.created = c.updated = now;
    if (c.series) c.series.ep = Math.max(0, ...episodes.filter(e => e.series.season === c.series.season).map(e => e.series.ep)) + 1;
    return c;
  }
  /** an imported project whose id is already taken gets a new id and '(imported)' on its title */
  function unclash(q, projects) { if (projects[q.id]) { q.id = newId(); q.title += ' (imported)'; } return q; }

  /** the "back up all" file → { name, data, n, meta } or null when there is nothing to back up */
  function bundle(projects, contacts, prefs, now) {
    const all = Object.values(projects); if (!all.length) return null;
    return { name: 'studiobindahh-all-projects' + SaveFile.EXT, n: all.length, meta: { kind: 'bundle', title: 'All projects', n: all.length, exported: now },
      data: { studiobindahh: 'bundle', version: 3, exported: now, projects: all, contacts, prefs: { preset: prefs.preset, on: prefs.on } } };
  }
  /** a single project's backup file name */
  const fileName = (p, slug) => slug(p.title) + SaveFile.EXT;

  /** what an imported .json holds → { contacts: [] | null, projects: [] | null, project: object | null } */
  function classify(j) {
    const contacts = j && Array.isArray(j.contacts) ? j.contacts : null, projects = j && Array.isArray(j.projects) ? j.projects : null;
    return { contacts, projects, project: contacts || projects ? null : j };
  }
  /** add contacts not already in the list (same id, or same name and email) → how many were added */
  function mergeContacts(list, incoming) {
    let n = 0;
    incoming.forEach(c => { if (c && c.name && !list.some(x => x.id === c.id || (x.name === c.name && (x.email || '') === (c.email || '')))) { list.push(c); n++; } });
    return n;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  return { MODE_LABEL, UNIT, modeLabel, sorted, card, setupNew, startView, copy, unclash, bundle, fileName, classify, mergeContacts, plural };
})();
