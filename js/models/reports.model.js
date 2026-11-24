'use strict';
/* ===================================================================
   Reports — MODEL
   Builds each report as plain data: a title, column headers and rows
   (arrays of cell text, or { grp } group headings), plus `meta` the
   screen uses for its notes. Reports never change the project.
   Pure functions — no DOM, no Store. See js/mvvm.js.

   Every builder takes (P, scenes, fx). fx holds the app helpers a report
   needs, so the rules can be tested in Node with plain stand-ins:
     castOf(s)            Set of a scene's characters (normalised)
     locOf(s)             a scene's location name
     norm(name)           a character name as the script uses it
     charsIn(item, sid)   who wears a wardrobe item in a scene
     itemLabel(item, sid) an item's name as written in that scene
     itemById(id), whoOf(tag), conflicts(day)
     elementRows(), shotTags(), allShots(), shotLabel(shot), singular(name)
     charNames()          every character, in script order
     words(text)          words in a line of dialogue
     fmtEighths(n), fmtDateShort(date)
     shotStatuses         photo shot statuses, in order
   =================================================================== */

const ReportsModel = {
  /** [key, label] in tab order; wardrobe/report words follow US / UK terms */
  tabs(P, terms) {
    return [['dood', 'Day out of Days'], ['oneliner', 'One-liner'], ['characters', 'Characters'], ['continuity', 'Continuity & costumes'], ['elements', 'Element list'],
      ['shottags', 'Shots by tag'], ['props', 'Props & ' + terms.wardrobe.toLowerCase()], ['chart', 'Character / scene chart'], ['changes', 'Costume changes'],
      ['preset', 'Pre-set & strike'], ...(P.mode === 'photo' ? [['shotstatus', 'Shot status']] : []), ['dpr', terms.dpr]];
  },
  INFO: {
    shotstatus: 'Where every planned frame stands: planned, shot, selected, retouching, in client review, approved, delivered.', shottags: 'Every shot grouped by its tags — VFX, stunts, drone and more — with how many are done.',
    dood: 'Which days each cast member works. Fills in once scenes are scheduled.', oneliner: 'One line per scene: where, when, who and how long.', characters: 'How much each character speaks, and where.',
    continuity: 'Per scene: wardrobe & makeup by character, and the props that must match from shot to shot.', elements: 'Every breakdown element, grouped by category, with the scenes it appears in (×n = quantity).',
    props: 'Props and wardrobe scene by scene, and how many items are still outstanding.', chart: 'Who is in which scene.',
    changes: 'Where a character’s wardrobe changes between scenes they appear in — back-to-back and one-scene gaps need planning.', preset: 'What is on stage at the start of each scene and how each prop gets there.' },
  /** the marks used in Day out of Days */
  MARKS: ['SW', 'W', 'WF', 'SWF', 'H'],
  /** columns a report leaves out when nobody has filled them in */
  OPTIONAL: { oneliner: ['Synopsis'], continuity: ['Story day', 'Continuity notes'] },

  /* ---------- shared bits ---------- */
  cast(P) { return P.people.filter(p => p.type === 'cast'); },
  /** a character's cast number (1-based) where an actor is cast, else the name */
  castKey(P, ch, fx) { const i = ReportsModel.cast(P).findIndex(p => fx.norm(p.character) === ch); return i >= 0 ? i + 1 : ch; },
  /** wardrobe items grouped under the character who wears them: one line per character */
  wardByChar(list, sid, fx) {
    const m = new Map(), none = [];
    list.forEach(x => { const ch = fx.charsIn(x, sid); if (!ch.length) none.push(fx.itemLabel(x, sid)); else ch.forEach(c => { if (!m.has(c)) m.set(c, []); m.get(c).push(fx.itemLabel(x, sid)); }); });
    return [...m].map(([c, v]) => `${c}: ${v.join(', ')}`).concat(none.length ? ['UNASSIGNED: ' + none.join(', ')] : []).join('\n');
  },
  /** what is still to get, grouped so each status is written once */
  byStatus(list) {
    const m = new Map(); list.forEach(x => { const k = x.status || 'Needed'; m.set(k, (m.get(k) || 0) + 1); });
    return [...m].map(([k, v]) => `${k.toUpperCase()}: ${v} item${v > 1 ? 's' : ''}`).join('\n');
  },

  /* ---------- Day out of Days ---------- */
  /** per character: which days they work (SW start, W work, WF finish, SWF single day, H hold between) */
  doodRows(P, scenes, fx) {
    const days = P.days, chars = [], seen = new Set(), by = new Map(scenes.map(s => [s.id, s]));
    scenes.forEach(s => fx.castOf(s).forEach(c => { if (c && !seen.has(c)) { seen.add(c); chars.push(c); } }));
    const cast = ReportsModel.cast(P).filter(p => p.character), at = c => { const i = cast.findIndex(p => fx.norm(p.character) === c); return i < 0 ? 999 : i; };
    return chars.sort((a, b) => at(a) - at(b)).map(ch => {
      const person = cast.find(p => fx.norm(p.character) === ch);
      const worked = days.map(d => d.sceneIds.some(id => { const s = by.get(id); return s && fx.castOf(s).has(ch); }));
      const first = worked.indexOf(true), last = worked.lastIndexOf(true), n = worked.filter(Boolean).length;
      const marks = worked.map((w, i) => w ? (n === 1 ? 'SWF' : i === first ? 'SW' : i === last ? 'WF' : 'W') : (first >= 0 && i > first && i < last ? 'H' : ''));
      return { label: person && person.name ? `${person.name} (${ch})` : ch, ch, marks, total: n, unscheduled: first < 0 };
    });
  },
  dood(P, scenes, fx) {
    const rows = ReportsModel.doodRows(P, scenes, fx), hasDays = P.days.length > 0;
    const conflicts = P.days.flatMap((d, i) => fx.conflicts(d).map(m => `Day ${i + 1}: ${m}`));
    if (!hasDays) return { title: 'Day out of Days', grid: true, marks: true, headers: ['Cast', 'Scenes in script', 'Shoot days'],
      rows: rows.map(r => [r.label, String(scenes.filter(s => fx.castOf(s).has(r.ch)).length), '—']), meta: { hasDays, conflicts } };
    return { title: 'Day out of Days', grid: true, marks: true,
      headers: ['Cast', ...P.days.map((d, i) => `Day ${i + 1}${d.date ? '\n' + fx.fmtDateShort(d.date) : ''}`), 'Days'],
      rows: rows.map(r => [r.label, ...r.marks, r.unscheduled ? '—' : String(r.total)]), meta: { hasDays, conflicts } };
  },

  /* ---------- one-liner ---------- */
  oneliner(P, scenes, fx) {
    const rows = scenes.map(s => {
      const dn = P.days.map((d, i) => d.sceneIds.includes(s.id) ? i + 1 : 0).filter(Boolean);   // a split scene is on several days
      return [s.num, s.ioe, s.tod, fx.locOf(s) || s.label, s.synopsis, [...fx.castOf(s)].map(c => ReportsModel.castKey(P, c, fx)).join(', '), fx.fmtEighths(s.eighths), dn.length ? `Day${dn.length > 1 ? 's' : ''} ${dn.join(', ')}` : '—'];
    });
    return { title: 'One-liner schedule', headers: ['Sc', 'I/E', 'D/N', 'Location', 'Synopsis', 'Cast', 'Pgs', 'Shoot day'], rows,
      meta: { castKey: ReportsModel.cast(P).map((p, i) => `${i + 1} ${p.character || p.name}${p.character && p.name ? ' (' + p.name + ')' : ''}`) } };
  },

  /* ---------- characters ---------- */
  characters(P, scenes, fx) {
    const st = new Map(), by = new Map(scenes.map(s => [s.id, s])); let sc = null, speaker = null;
    P.blocks.forEach(b => {
      if (b.type === 'scene') { sc = by.get(b.id) || null; speaker = null; return; }
      if (b.type === 'character') { speaker = fx.norm(b.text); if (speaker && !st.has(speaker)) st.set(speaker, { lines: 0, words: 0, scenes: new Set() }); if (speaker && sc) st.get(speaker).scenes.add(sc.num); return; }
      if (b.type === 'dialogue' && speaker && st.has(speaker)) { const o = st.get(speaker); o.lines++; o.words += fx.words(b.text); }
    });
    const rows = [...st.entries()].sort((a, b) => b[1].words - a[1].words).map(([c, o]) => {
      const per = P.people.find(p => p.type === 'cast' && fx.norm(p.character) === c), sl = [...o.scenes];
      return [c, per ? per.name : '', o.lines, o.words, sl.length, sl[0] || '', sl.join(', ')];
    });
    return { title: 'Character report', headers: ['Character', 'Actor', 'Lines', 'Words', 'Scenes', 'First scene', 'Scene list'], rows, meta: {} };
  },

  /* ---------- continuity & costume plot ---------- */
  continuity(P, scenes, fx) {
    const rows = scenes.map(s => {
      const meta = P.sceneMeta[s.id] || {}, tg = P.tags.filter(t => t.sceneId === s.id), byWho = new Map();
      const add = (k, v) => { if (!byWho.has(k)) byWho.set(k, []); if (!byWho.get(k).includes(v)) byWho.get(k).push(v); };
      tg.filter(t => t.cat === 'wardrobe' || t.cat === 'makeup').forEach(t => { const x = t.itemId && fx.itemById(t.itemId), nm = x ? fx.itemLabel(x, s.id) : t.text, who = x ? fx.charsIn(x, s.id) : fx.whoOf(t); (who.length ? who : ['General']).forEach(k => add(k, nm)); });
      const props = []; tg.filter(t => t.cat === 'props').forEach(t => { const x = t.itemId && fx.itemById(t.itemId), nm = x ? fx.itemLabel(x, s.id) : t.text; if (!props.includes(nm)) props.push(nm); });
      return [s.num, meta.storyDay || '', `${s.ioe} · ${s.tod}`, fx.locOf(s) || s.label, [...byWho].map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n'), props.join(', '), meta.continuity || ''];
    });
    /* costume plot by character: loose tags first, then wardrobe profiles */
    const plot = new Map(), put = (w, v) => { if (!plot.has(w)) plot.set(w, []); plot.get(w).push(v); }, by = new Map(scenes.map(s => [s.id, s]));
    scenes.forEach(s => P.tags.filter(t => t.sceneId === s.id && (t.cat === 'wardrobe' || t.cat === 'makeup') && !t.itemId && fx.whoOf(t).length).forEach(t => fx.whoOf(t).forEach(w => put(w, `Sc ${s.num}: ${t.text}`))));
    P.wardrobe.forEach(x => x.sceneIds.forEach(id => fx.charsIn(x, id).forEach(w => { const sc = by.get(id); if (sc) put(w, `Sc ${sc.num}: ${x.name}${x.look ? ' (' + x.look + ')' : ''}`); })));
    return { title: 'Continuity & costume plot', headers: ['Sc', 'Story day', 'I/E · D/N', 'Location', 'Wardrobe & makeup', 'Props', 'Continuity notes'], rows,
      meta: { plot: [...plot].map(([k, v]) => [k, [...new Set(v)]]) } };
  },

  /* ---------- element list ---------- */
  elements(P, scenes, fx) {
    const er = fx.elementRows(), cats = [...new Set(er.map(r => r.cat.label))], rows = [];
    const aka = (r, sep) => r.variants.filter(v => fx.singular(v) !== fx.singular(r.name)).join(sep), where = r => r.scenes.map(([n, q]) => n + (q > 1 ? ` ×${q}` : '')).join(', ');
    cats.forEach(c => { const rs = er.filter(r => r.cat.label === c); rows.push({ grp: `${c} · ${rs.length}` }); rs.forEach(r => rows.push([r.name, aka(r, ', '), where(r), r.status || ''])); });
    const headers = ['Element', 'Also called', 'Scenes', 'Status'];
    return { title: 'Element list', headers, rows, csvHead: ['Category', ...headers], csvRows: er.map(r => [r.cat.label, r.name, aka(r, '; '), where(r), r.status || '']), meta: {} };
  },

  /* ---------- shots ---------- */
  /** a shot counts as done once ticked, or once a photo frame is shot or further along */
  isShotDone: s => !!(s.done || ['Shot', 'Selected', 'Retouching', 'Client review', 'Approved', 'Delivered'].includes(s.status)),
  shotTags(P, scenes, fx) {
    const all = fx.allShots(), num = new Map(scenes.map(s => [s.id, s.num])), rows = [], isDone = ReportsModel.isShotDone;
    fx.shotTags().forEach(tg => { const ss = all.filter(s => (s.tags || []).includes(tg.id)); rows.push([tg.name, tg.dept || '', ss.length, ss.filter(isDone).length, [...new Set(ss.map(s => num.get(s.sceneId)))].filter(Boolean).join(', '), ss.map(fx.shotLabel).join(', ')]); });
    const un = all.filter(s => !(s.tags || []).length); rows.push(['Untagged', '', un.length, un.filter(isDone).length, '', '']);
    return { title: 'Shots by tag', headers: ['Tag', 'Department', 'Shots', 'Done', 'Scenes / setups', 'Shots'], rows, meta: {} };
  },
  shotStatus(P, scenes, fx) {
    const ST = fx.shotStatuses, fin = ss => ss.filter(x => ['Approved', 'Delivered'].includes(x.status)).length, pct = ss => ss.length ? Math.round(fin(ss) / ss.length * 100) + '%' : '—';
    const line = (a, b, ss) => [a, b, ss.length, ss.filter(x => x.hero).length || '', ...ST.map(st => ss.filter(x => x.status === st).length || ''), pct(ss)];
    const rows = scenes.map(s => line(s.num, s.label, P.photo.shots.filter(x => x.sceneId === s.id)));
    rows.push(line('', 'TOTAL', P.photo.shots));
    return { title: 'Photo shot status', headers: ['Sc', 'Setup', 'Shots', 'Hero', ...ST, 'Done %'], rows, meta: {} };
  },

  /* ---------- who is where ---------- */
  chart(P, scenes, fx) {
    const lines = new Map(); let sp = null;
    P.blocks.forEach(b => { if (b.type === 'character') { sp = fx.norm(b.text); if (!lines.has(sp)) lines.set(sp, 0); } else if (b.type === 'dialogue' && sp) lines.set(sp, (lines.get(sp) || 0) + 1); else if (b.type === 'scene' || b.type === 'act') sp = null; });
    const rows = fx.charNames().map(c => {
      const pr = scenes.map(s => fx.castOf(s).has(c)), ps = scenes.map((s, i) => pr[i] ? (s.chars && s.chars.has(c) ? '●' : '○') : '');
      return [c, ...ps.map((v, i) => v ? (!pr[i - 1] ? '▸' : '') + v + (!pr[i + 1] ? '◂' : '') : ''), pr.filter(Boolean).length, lines.get(c) || 0];
    }).sort((a, b) => b[b.length - 2] - a[a.length - 2]);
    return { title: 'Character / scene chart', grid: true, headers: ['Character', ...scenes.map(s => String(s.num)), 'Scenes', 'Lines'], rows, meta: {} };
  },
  changes(P, scenes, fx) {
    const rows = [];
    for (const c of fx.charNames()) {
      const apps = scenes.map((s, i) => ({ s, i })).filter(x => fx.castOf(x.s).has(c));
      const set = sc => P.wardrobe.filter(w => w.sceneIds.includes(sc.id) && fx.charsIn(w, sc.id).includes(c)).map(w => w.name).sort();
      for (let k = 0; k + 1 < apps.length; k++) {
        const A = set(apps[k].s), B = set(apps[k + 1].s); if (!A.length && !B.length) continue; if (A.join('|') === B.join('|')) continue;
        const gap = apps[k + 1].i - apps[k].i - 1;
        rows.push([c, apps[k].s.num, apps[k + 1].s.num, gap, gap === 0 ? (P.mode === 'stage' ? 'ON-STAGE / immediate change' : 'Back-to-back scenes') : gap === 1 ? 'QUICK CHANGE (1 scene)' : 'Change', A.join(', ') || '—', B.join(', ') || '—']);
      }
    }
    return { title: 'Costume changes', headers: ['Character', 'From scene', 'To scene', 'Off stage between', 'Change', 'Wears before', 'Wears after'], rows, meta: {} };
  },
  preset(P, scenes, fx) {
    const nm = (s, kind) => P.props.filter(x => x.sceneIds.includes(s.id) && ((x.setup || {})[s.id] || '') === kind).map(x => fx.itemLabel(x, s.id)).join(', ');
    const rows = scenes.map((s, i) => { const prev = scenes[i - 1], crew = nm(s, 'crew'), flown = nm(s, 'flown');
      return [s.num, fx.locOf(s) || s.label, nm(s, 'preset'), nm(s, 'actor'), crew + (flown ? (crew ? '; ' : '') + 'flown: ' + flown : ''), prev ? P.props.filter(x => x.sceneIds.includes(prev.id) && !x.sceneIds.includes(s.id)).map(x => x.name).join(', ') : '']; });
    return { title: 'Pre-set & strike list', headers: ['Sc', 'Scene', 'Pre-set on stage', 'Carried on by actor', 'Brought on by crew', 'Struck from the scene before'], rows, meta: { stage: P.mode === 'stage' } };
  },
  props(P, scenes, fx) {
    const ready = ['Prepped', 'On set', 'Returned', 'Cleaned / returned'], open = x => !ready.includes(x.status);
    const rows = scenes.map(s => { const ps = P.props.filter(x => x.sceneIds.includes(s.id)), ws = P.wardrobe.filter(x => x.sceneIds.includes(s.id));
      return [s.num, fx.locOf(s) || s.label, ps.map(x => fx.itemLabel(x, s.id)).join(', '), ReportsModel.wardByChar(ws, s.id, fx), ReportsModel.byStatus(ps.concat(ws).filter(open))]; });
    return { title: 'Props & wardrobe by scene', headers: ['Sc', 'Scene', 'Props', 'Wardrobe', 'Still to get'], rows, meta: { hasItems: !!(P.props.length || P.wardrobe.length) } };
  },

  /* ---------- building one ---------- */
  BUILDERS: { dood: 'dood', oneliner: 'oneliner', characters: 'characters', continuity: 'continuity', elements: 'elements', shottags: 'shotTags', shotstatus: 'shotStatus', chart: 'chart', changes: 'changes', preset: 'preset', props: 'props' },
  /** build the report for a tab (unknown tabs give the continuity report, as before), leaving out empty optional columns */
  build(tab, P, scenes, fx) {
    const r = ReportsModel[ReportsModel.BUILDERS[tab] || 'continuity'](P, scenes, fx);
    r.tab = ReportsModel.BUILDERS[tab] ? tab : 'continuity';
    r.hidden = ReportsModel.hideEmpty(r, ReportsModel.OPTIONAL[r.tab] || []);
    return r;
  },
  /** remove the named columns where no row has anything; returns their names */
  hideEmpty(r, names) {
    const hidden = [];
    names.forEach(nm => {
      const i = r.headers.indexOf(nm);
      if (i >= 0 && r.rows.every(x => !Array.isArray(x) || !String(x[i] || '').trim())) { r.headers.splice(i, 1); r.rows.forEach(x => Array.isArray(x) && x.splice(i, 1)); hidden.push(nm.toLowerCase()); }
    });
    return hidden;
  },
};
