'use strict';
/* ===================================================================
   Series & episodes — MODEL
   Each episode is its own project; a series links them
   (P.series { id, name, season, ep, bible }) and every episode carries
   a copy of one shared bible { premise, tone, rules, world, notes,
   arcs: { season: text }, characters: [{ id, name, desc, arc }], v }.
   The copy with the newest `v` wins. Pure functions: no DOM, no Store,
   no UI state; the list of projects is passed in. See js/mvvm.js.
   =================================================================== */

const SeriesModel = (() => {
  const TEXT = ['premise', 'tone', 'rules', 'world', 'notes'];
  const CHAR_FIELDS = ['name', 'desc', 'arc'];
  const blankBible = () => ({ premise: '', tone: '', rules: '', world: '', notes: '', arcs: {}, characters: [], v: 0 });
  const clone = x => JSON.parse(JSON.stringify(x));
  const pad = n => String(n || 1).padStart(2, '0');
  /** 'S01E04' */
  const epCode = s => s ? `S${pad(s.season)}E${pad(s.ep)}` : '';
  const key = name => (name || '').trim().toUpperCase();

  /** the episodes of a series, in season and episode order (then by creation) */
  const episodes = (projects, sid) => projects.filter(p => p.series && p.series.id === sid)
    .sort((a, b) => (a.series.season - b.series.season) || (a.series.ep - b.series.ep) || (a.created - b.created));

  /** the bible, filled out with anything missing (and an id on every character) */
  function ensure(S) {
    const B = S.bible = S.bible || blankBible();
    TEXT.forEach(k => { if (B[k] == null) B[k] = ''; });
    if (!B.arcs || typeof B.arcs !== 'object') B.arcs = {};
    if (!Array.isArray(B.characters)) B.characters = [];
    B.characters.forEach(c => { if (!c.id) c.id = newId(); CHAR_FIELDS.forEach(k => { if (c[k] == null) c[k] = ''; }); });
    return B;
  }
  /** take the newest copy of the bible (and series name) among the episodes → whether it changed */
  function adopt(P, eps) {
    if (!P.series) return false;
    let best = P.series.bible || blankBible(), name = P.series.name, changed = false;
    eps.forEach(e => { if (e !== P && ((e.series.bible || {}).v || 0) > (best.v || 0)) { best = e.series.bible; name = e.series.name; changed = true; } });
    if (changed) { P.series.bible = clone(best); P.series.name = name; }
    ensure(P.series); return changed;
  }
  /** stamp this copy as the newest and give every other episode the same bible and name → the episodes changed */
  function share(P, eps, now) {
    if (!P.series) return [];
    P.series.bible.v = now;
    return eps.filter(e => e !== P).map(e => { e.series.bible = clone(P.series.bible); e.series.name = P.series.name; return e; });
  }

  /* ---------- joining and leaving ---------- */
  function start(P, name, season, ep, id = newId()) { P.series = { id, name: (name || '').trim() || P.title, season: Math.max(1, +season || 1), ep: Math.max(1, +ep || 1), bible: blankBible() }; return P.series; }
  function leave(P) { if (!P.series) return false; P.series = null; return true; }
  function setNumber(series, season, ep) { series.season = Math.max(1, +season || 1); series.ep = Math.max(1, +ep || 1); return true; }
  /** the next episode number in a season */
  const nextEp = (eps, season) => Math.max(0, ...eps.filter(e => e.series.season === season).map(e => e.series.ep)) + 1;
  /**
   * fill a blank project `p` as the next episode after the series' last one: the same bible, author
   * details, budget lines (without spending), and some settings; with `carry`, the cast, crew,
   * casting and locations too (availability cleared).
   * defType(mode) → the first line type of a script
   */
  function fillEpisode(p, P, eps, carry, defType) {
    const last = eps[eps.length - 1] || P, season = last.series.season, n = nextEp(eps, season);
    p.title = `${P.series.name} — Episode ${n}`;
    p.series = { id: P.series.id, name: P.series.name, season, ep: n, bible: clone(P.series.bible) };
    p.blocks = [{ id: newId(), type: 'scene', text: '' }, { id: newId(), type: defType(P.mode), text: '' }];
    Object.assign(p.meta, { author: P.meta.author, credit: P.meta.credit, contact: P.meta.contact, copyright: P.meta.copyright });
    if (P.fin) { p.fin = clone(P.fin); Object.assign(p.fin, { txns: [], versions: [], funding: [], baseline: '', locked: false }); }
    Object.assign(p.settings, { multicam: P.settings.multicam, currency: P.settings.currency, contingency: P.settings.contingency, aspect: P.settings.aspect });
    if (carry) {
      p.people = clone(P.people || []); p.locations = clone(P.locations || []); p.casting = clone(P.casting || {});
      p.people.forEach(x => { x.unavail = ''; });
    }
    return p;
  }

  /* ---------- the bible ---------- */
  function setText(B, k, v) { if (!TEXT.includes(k)) return false; B[k] = String(v ?? ''); return true; }
  function setName(S, v) { S.name = String(v ?? ''); return true; }
  function addCharacter(B, name = '') { const c = { id: newId(), name, desc: '', arc: '' }; B.characters.push(c); return c; }
  function setCharacter(B, id, k, v) { const c = B.characters.find(x => x.id === id); if (!c || !CHAR_FIELDS.includes(k)) return false; c[k] = String(v ?? ''); return true; }
  function removeCharacter(B, id) { const n = B.characters.length; B.characters = B.characters.filter(c => c.id !== id); return B.characters.length < n; }
  /** add every name not yet in the bible → how many were added */
  function importCharacters(B, names) { const have = new Set(B.characters.map(c => key(c.name))); let n = 0; names.forEach(c => { if (!have.has(key(c))) { addCharacter(B, c); have.add(key(c)); n++; } }); return n; }
  /** bible characters with no cast member playing them in `people` → their names (upper case) */
  function castMissing(B, people) {
    const have = new Set((people || []).filter(x => x.type === 'cast').map(x => key(x.character))), out = [];
    B.characters.forEach(c => { const k = key(c.name); if (k && !have.has(k)) { out.push(k); have.add(k); } });
    return out;
  }
  /** in how many episodes a character speaks (charsOf(project) → a Set of names) */
  const appearances = (eps, name, charsOf) => eps.filter(e => charsOf(e).has(key(name))).length;

  /** the seasons with an arc or an episode, in order */
  const seasons = (eps, B) => [...new Set([...eps.map(e => e.series.season), ...Object.keys(B.arcs).map(Number)])].sort((a, b) => a - b);
  /** add the next season (its arc starts as a space, so it is kept) → its number */
  function addSeason(B, eps) { const n = Math.max(0, ...seasons(eps, B)) + 1; B.arcs[n] = B.arcs[n] || ' '; return n; }
  function setArc(B, season, v) { if (!(+season >= 1)) return false; B.arcs[+season] = String(v ?? ''); return true; }

  /* ---------- printing (esc() escapes text) ---------- */
  function bibleHtml(S, esc) {
    const B = S.bible, sec = (t, x) => x && x.trim() ? `<h3>${esc(t)}</h3><p style="white-space:pre-wrap">${esc(x)}</p>` : '';
    return `<h1>${esc(S.name)} — Series bible</h1>${sec('Premise', B.premise)}${sec('Tone & style', B.tone)}${sec('Rules of the world', B.rules)}${sec('Setting & world', B.world)}${sec('Notes', B.notes)}
    ${B.characters.length ? '<h3>Characters</h3>' + B.characters.map(c => `<p><b>${esc(c.name)}</b>${c.desc ? ' — ' + esc(c.desc) : ''}${c.arc ? '<br><i>Arc:</i> ' + esc(c.arc) : ''}</p>`).join('') : ''}
    ${Object.keys(B.arcs).sort((a, b) => a - b).filter(k => (B.arcs[k] || '').trim()).map(k => `<h3>Season ${esc(k)} arc</h3><p style="white-space:pre-wrap">${esc(B.arcs[k])}</p>`).join('')}`;
  }
  /** pagesOf(project) → its page count */
  const guideHtml = (S, eps, esc, pagesOf) => `<h1>${esc(S.name)} — Episode guide</h1><table><thead><tr><th>Ep</th><th>Title</th><th>Logline</th><th>Pages</th></tr></thead><tbody>${eps.map(e => `<tr><td>${epCode(e.series)}</td><td>${esc(e.title)}</td><td>${esc(e.meta.logline || '')}</td><td>${pagesOf(e)}</td></tr>`).join('')}</tbody></table>`;

  return { TEXT, CHAR_FIELDS, blankBible, epCode, episodes, ensure, adopt, share, start, leave, setNumber, nextEp, fillEpisode, setText, setName, addCharacter, setCharacter, removeCharacter, importCharacters, castMissing, appearances, seasons, addSeason, setArc, bibleHtml, guideHtml };
})();
