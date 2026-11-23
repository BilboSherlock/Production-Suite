'use strict';
/* ===================================================================
   Reports — Day out of Days, one-liner, character, continuity & costume
   =================================================================== */
UI.repTab = 'dood';

function doodData(P, scenes) {
  const days = P.days, chars = new Map();
  scenes.forEach(s => sceneCast(P, s).forEach(c => { if (c && !chars.has(c)) chars.set(c, 1); }));
  const cast = P.people.filter(p => p.type === 'cast' && p.character);
  const order = [...chars.keys()].sort((a, b) => { const ia = cast.findIndex(p => normChar(p.character) === a), ib = cast.findIndex(p => normChar(p.character) === b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
  const rows = order.map(ch => {
    const person = cast.find(p => normChar(p.character) === ch);
    const worked = days.map(d => d.sceneIds.some(id => { const s = scenes.find(x => x.id === id); return s && sceneCast(P, s).has(ch); }));
    const first = worked.indexOf(true), last = worked.lastIndexOf(true), n = worked.filter(Boolean).length;
    const marks = worked.map((w, i) => w ? (n === 1 ? 'SWF' : i === first ? 'SW' : i === last ? 'WF' : 'W') : (first >= 0 && i > first && i < last ? 'H' : ''));
    return { label: person && person.name ? `${person.name} (${ch})` : ch, ch, marks, total: n, unscheduled: first < 0 };
  });
  return { days, rows };
}

/* wardrobe items grouped under the character who wears them: one line per character */
function wardByChar(list, sid) {
  const m = new Map(), none = [];
  list.forEach(x => { const ch = itemCharsIn(x, sid); if (!ch.length) none.push(itemLabel(x, sid)); else ch.forEach(c => { if (!m.has(c)) m.set(c, []); m.get(c).push(itemLabel(x, sid)); }); });
  return [...m].map(([c, v]) => `${c}: ${v.join(', ')}`).concat(none.length ? ['UNASSIGNED: ' + none.join(', ')] : []).join('\n');
}
/* what is still to get, grouped so each status is written once */
function byStatus(list) {
  const m = new Map(); list.forEach(x => { const k = x.status || 'Needed'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m].map(([k, v]) => `${k.toUpperCase()}: ${v} item${v > 1 ? 's' : ''}`).join('\n');
}
const REPORT_INFO = {
  shotstatus: 'Where every planned frame stands: planned, shot, selected, retouching, in client review, approved, delivered.', shottags: 'Every shot grouped by its tags — VFX, stunts, drone and more — with how many are done.', dood: 'Which days each cast member works. Fills in once scenes are scheduled.', oneliner: 'One line per scene: where, when, who and how long.', characters: 'How much each character speaks, and where.',
  continuity: 'Per scene: wardrobe & makeup by character, and the props that must match from shot to shot.', elements: 'Every breakdown element, grouped by category, with the scenes it appears in (×n = quantity).',
  props: 'Props and wardrobe scene by scene, and how many items are still outstanding.', chart: 'Who is in which scene.', changes: 'Where a character’s wardrobe changes between scenes they appear in — back-to-back and one-scene gaps need planning.', preset: 'What is on stage at the start of each scene and how each prop gets there.' };

Views.reports = function (root) {
  const P = Store.P, scenes = getScenes(P), tab = UI.repTab;
  const holder = h('div', { class: 'page', style: { maxWidth: '1300px' } });
  const TABS = [['dood', 'Day out of Days'], ['oneliner', 'One-liner'], ['characters', 'Characters'], ['continuity', 'Continuity & costumes'], ['elements', 'Element list'], ['shottags', 'Shots by tag'], ['props', 'Props & ' + TERM.wardrobe.toLowerCase()], ['chart', 'Character / scene chart'], ['changes', 'Costume changes'], ['preset', 'Pre-set & strike'], ...(P.mode === 'photo' ? [['shotstatus', 'Shot status']] : []), ['dpr', TERM.dpr]];
  const tabsEl = () => h('div', { class: 'tabs rep-tabs' }, TABS.map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: () => { UI.repTab = k; Router.refresh(); } }, l)));
  if (tab === 'dpr') { const box = h('div'); root.append(h('div', { class: 'page', style: { maxWidth: '1100px' } }, h('div', { class: 'page-h' }, h('h2', {}, 'Reports')), tabsEl(), box)); mountDPR(box, UI.dprDay); return; }
  let title = '', headers = [], rows = [], markCols = false, extra = null, csvHead = null, csvRows = null;
  if (!scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes yet'), h('p', {}, 'Reports are built from your script, breakdown and schedule.')))); return; }

  if (tab === 'dood') {
    const d = doodData(P, scenes); title = 'Day out of Days';
    headers = ['Cast', ...d.days.map((day, i) => `Day ${i + 1}${day.date ? '\n' + fmtDateShort(day.date) : ''}`), 'Days'];
    rows = d.rows.map(r => [r.label, ...r.marks, r.unscheduled ? '—' : String(r.total)]);
    if (!d.days.length) { headers = ['Cast', 'Scenes in script', 'Shoot days']; rows = d.rows.map(r => [r.label, String(scenes.filter(sc => sceneCast(P, sc).has(r.ch)).length), '—']); }
    markCols = true;
    extra = h('div', { class: 'small muted', style: { margin: '10px 0' } }, 'SW = start work · W = work · WF = work finish · SWF = single day · H = hold (between work days). ',
      P.days.length ? '' : h('a', { href: `#/p/${P.id}/schedule`, style: { fontWeight: 600 } }, 'Create shoot days in the Schedule to fill in the day-by-day chart.'));
    const conflicts = P.days.flatMap((day, i) => dayConflicts(P, day, scenes).map(m => `Day ${i + 1}: ${m}`));
    if (conflicts.length) extra.append(h('div', { class: 'csalert', style: { marginTop: '10px' } }, h('b', {}, 'Scheduling conflicts'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, conflicts.map(c => h('li', {}, c)))));
  } else if (tab === 'oneliner') {
    title = 'One-liner schedule'; headers = ['Sc', 'I/E', 'D/N', 'Location', 'Synopsis', 'Cast', 'Pgs', 'Shoot day'];
    const cast = P.people.filter(p => p.type === 'cast');
    rows = scenes.map(s => { const di = P.days.findIndex(d => d.sceneIds.includes(s.id));
      return [s.num, s.ioe, s.tod, locName(P, s) || s.label, s.synopsis, [...sceneCast(P, s)].map(c => { const i = cast.findIndex(p => normChar(p.character) === c); return i >= 0 ? i + 1 : c; }).join(', '), fmtEighths(s.eighths), di >= 0 ? `Day ${di + 1}` : '—']; });
    if (cast.length) extra = h('p', { class: 'small muted', style: { marginTop: '12px' } }, h('b', {}, 'Cast key: '), cast.map((p, i) => `${i + 1} ${p.character || p.name}${p.character && p.name ? ' (' + p.name + ')' : ''}`).join('  ·  '));
  } else if (tab === 'shottags') {
    title = 'Shots by tag'; headers = ['Tag', 'Department', 'Shots', 'Done', 'Scenes / setups', 'Shots'];
    const all = allShotsOf(P), lab = s => (P.photo.shots.includes(s) ? photoShotLabel(P, s, scenes) : shotLabel(P, s, scenes)), isDone = s => s.done || ['Shot', 'Selected', 'Retouching', 'Client review', 'Approved', 'Delivered'].includes(s.status);
    shotTagList(P).forEach(tg => { const ss = all.filter(s => (s.tags || []).includes(tg.id)); rows.push([tg.name, tg.dept || '', ss.length, ss.filter(isDone).length, [...new Set(ss.map(s => (scenes.find(x => x.id === s.sceneId) || {}).num))].filter(Boolean).join(', '), ss.map(lab).join(', ')]); });
    const un = all.filter(s => !(s.tags || []).length); rows.push(['Untagged', '', un.length, un.filter(isDone).length, '', '']);
    extra = h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Tag shots in the Shot list (or Photo shot list). Use Select shots to tag many at once.');
  } else if (tab === 'shotstatus') {
    title = 'Photo shot status'; headers = ['Sc', 'Setup', 'Shots', 'Hero', ...SHOT_STATUS, 'Done %'];
    rows = scenes.map(s => { const ss = P.photo.shots.filter(x => x.sceneId === s.id), fin = ss.filter(x => ['Approved', 'Delivered'].includes(x.status)).length; return [s.num, s.label, ss.length, ss.filter(x => x.hero).length || '', ...SHOT_STATUS.map(st => ss.filter(x => x.status === st).length || ''), ss.length ? Math.round(fin / ss.length * 100) + '%' : '—']; });
    const all = P.photo.shots; rows.push(['', 'TOTAL', all.length, all.filter(x => x.hero).length || '', ...SHOT_STATUS.map(st => all.filter(x => x.status === st).length || ''), all.length ? Math.round(all.filter(x => ['Approved', 'Delivered'].includes(x.status)).length / all.length * 100) + '%' : '—']);
  } else if (tab === 'elements') {
    title = 'Element list'; headers = ['Element', 'Also called', 'Scenes', 'Status'];
    const er = elementRows(P, scenes), cats = [...new Set(er.map(r => r.cat.label))];
    csvHead = ['Category', ...headers]; csvRows = er.map(r => [r.cat.label, r.name, r.variants.filter(v => singularKey(v) !== singularKey(r.name)).join('; '), r.scenes.map(([n, q]) => n + (q > 1 ? ` ×${q}` : '')).join(', '), r.status || '']);
    cats.forEach(c => { const rs = er.filter(r => r.cat.label === c); rows.push({ grp: `${c} · ${rs.length}` }); rs.forEach(r => rows.push([r.name, r.variants.filter(v => singularKey(v) !== singularKey(r.name)).join(', '), r.scenes.map(([n, q]) => n + (q > 1 ? ` ×${q}` : '')).join(', '), r.status || ''])); });
  } else if (tab === 'chart') {
    title = 'Character / scene chart'; headers = ['Character', ...scenes.map(s => String(s.num)), 'Scenes', 'Lines'];
    const chars = allCharNames(P), lines = new Map(); P.blocks.forEach(b => { if (b.type === 'character') { const c = normChar(b.text); lines.set(c, 0); } });
    let sp = null; P.blocks.forEach(b => { if (b.type === 'character') sp = normChar(b.text); else if (b.type === 'dialogue' && sp) lines.set(sp, (lines.get(sp) || 0) + 1); else if (b.type === 'scene' || b.type === 'act') sp = null; });
    const present = c => scenes.map(s => sceneCast(P, s).has(c));
    rows = chars.map(c => { const pr = present(c), ps = scenes.map((s, i) => pr[i] ? (s.chars.has(c) ? '●' : '○') : '');
      return [c, ...ps.map((v, i) => v ? (!pr[i - 1] ? '▸' : '') + v + (!pr[i + 1] ? '◂' : '') : ''), pr.filter(Boolean).length, lines.get(c) || 0]; }).sort((a, b) => b[b.length - 2] - a[a.length - 2]);
    extra = h('p', { class: 'small muted', style: { marginTop: '10px' } }, '● speaks · ○ present, silent · ▸ enters (absent in the scene before) · ◂ exits (absent in the next scene). Sorted by scenes.');
  } else if (tab === 'changes') {
    title = 'Costume changes'; headers = ['Character', 'From scene', 'To scene', 'Off stage between', 'Change', 'Wears before', 'Wears after'];
    chars_loop: for (const c of allCharNames(P)) {
      const apps = scenes.map((s, i) => ({ s, i })).filter(x => sceneCast(P, x.s).has(c)), set = sc => P.wardrobe.filter(w => w.sceneIds.includes(sc.id) && itemCharsIn(w, sc.id).includes(c)).map(w => w.name).sort();
      for (let k = 0; k + 1 < apps.length; k++) { const A = set(apps[k].s), B = set(apps[k + 1].s); if (!A.length && !B.length) continue; if (A.join('|') === B.join('|')) continue;
        const gap = apps[k + 1].i - apps[k].i - 1; rows.push([c, apps[k].s.num, apps[k + 1].s.num, gap, gap === 0 ? (P.mode === 'stage' ? 'ON-STAGE / immediate change' : 'Back-to-back scenes') : gap === 1 ? 'QUICK CHANGE (1 scene)' : 'Change', A.join(', ') || '—', B.join(', ') || '—']); }
    }
    extra = h('p', { class: 'small muted', style: { marginTop: '10px' } }, rows.length ? 'Built from the wardrobe you assigned per scene. Quick and on-stage changes are the ones to rehearse and rig.' : 'Assign wardrobe to characters scene by scene in the Breakdown to see where costume changes fall.');
  } else if (tab === 'preset') {
    title = 'Pre-set & strike list'; headers = ['Sc', 'Scene', 'Pre-set on stage', 'Carried on by actor', 'Brought on by crew', 'Struck from the scene before'];
    const nm = (s, kind) => P.props.filter(x => x.sceneIds.includes(s.id) && ((x.setup || {})[s.id] || '') === kind).map(x => itemLabel(x, s.id)).join(', ');
    rows = scenes.map((s, i) => { const prev = scenes[i - 1]; return [s.num, locName(P, s) || s.label, nm(s, 'preset'), nm(s, 'actor'), nm(s, 'crew') + (nm(s, 'flown') ? (nm(s, 'crew') ? '; ' : '') + 'flown: ' + nm(s, 'flown') : ''), prev ? P.props.filter(x => x.sceneIds.includes(prev.id) && !x.sceneIds.includes(s.id)).map(x => x.name).join(', ') : '']; });
    extra = P.mode === 'stage' ? h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Set “how it gets on stage” for each prop in its profile (scene list). Pre-set items are on stage at the top of the scene.') : null;
  } else if (tab === 'props') {
    title = 'Props & wardrobe by scene'; headers = ['Sc', 'Scene', 'Props', 'Wardrobe', 'Still to get'];
    rows = scenes.map(s => { const ps = P.props.filter(x => x.sceneIds.includes(s.id)), ws = P.wardrobe.filter(x => x.sceneIds.includes(s.id)), open = x => !['Prepped', 'On set', 'Returned', 'Cleaned / returned'].includes(x.status);
      return [s.num, locName(P, s) || s.label, ps.map(x => itemLabel(x, s.id)).join(', '), wardByChar(ws, s.id), byStatus(ps.concat(ws).filter(open))]; });
    extra = (P.props.length || P.wardrobe.length) ? null : h('p', { class: 'muted', style: { marginTop: '14px' } }, 'No profiles yet — add them in Props & Wardrobe.');
  } else if (tab === 'characters') {
    title = 'Character report'; headers = ['Character', 'Actor', 'Lines', 'Words', 'Scenes', 'First scene', 'Scene list'];
    const st = new Map(); let sc = null, speaker = null;
    P.blocks.forEach(b => {
      if (b.type === 'scene') { sc = scenes.find(s => s.id === b.id); speaker = null; return; }
      if (b.type === 'character') { speaker = normChar(b.text); if (speaker && !st.has(speaker)) st.set(speaker, { lines: 0, words: 0, scenes: new Set() }); if (speaker && sc) st.get(speaker).scenes.add(sc.num); return; }
      if (b.type === 'dialogue' && speaker && st.has(speaker)) { const o = st.get(speaker); o.lines++; o.words += stripRich(b.text).trim().split(/\s+/).filter(Boolean).length; }
    });
    rows = [...st.entries()].sort((a, b) => b[1].words - a[1].words).map(([c, o]) => { const per = P.people.find(p => p.type === 'cast' && normChar(p.character) === c); const sl = [...o.scenes];
      return [c, per ? per.name : '', o.lines, o.words, sl.length, sl[0] || '', sl.join(', ')]; });
  } else {
    title = 'Continuity & costume plot'; headers = ['Sc', 'Story day', 'I/E · D/N', 'Location', 'Wardrobe & makeup', 'Props', 'Continuity notes'];
    rows = scenes.map(s => {
      const meta = P.sceneMeta[s.id] || {}, tg = P.tags.filter(t => t.sceneId === s.id);
      const wm = tg.filter(t => t.cat === 'wardrobe' || t.cat === 'makeup'), byWho = new Map();
      const add = (k, v) => { if (!byWho.has(k)) byWho.set(k, []); if (!byWho.get(k).includes(v)) byWho.get(k).push(v); };
      wm.forEach(t => { const x = t.itemId && itemById(P, t.itemId), nm = x ? itemLabel(x, s.id) : t.text, who = x ? itemCharsIn(x, s.id) : whoOf(t); (who.length ? who : ['General']).forEach(k => add(k, nm)); });
      const props = []; tg.filter(t => t.cat === 'props').forEach(t => { const x = t.itemId && itemById(P, t.itemId), nm = x ? itemLabel(x, s.id) : t.text; if (!props.includes(nm)) props.push(nm); });
      return [s.num, meta.storyDay || '', `${s.ioe} · ${s.tod}`, locName(P, s) || s.label, [...byWho].map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n'), props.join(', '), meta.continuity || ''];
    });
    // costume plot by character
    const plot = new Map();
    scenes.forEach(s => P.tags.filter(t => t.sceneId === s.id && (t.cat === 'wardrobe' || t.cat === 'makeup') && !t.itemId && whoOf(t).length).forEach(t => whoOf(t).forEach(w => { if (!plot.has(w)) plot.set(w, []); plot.get(w).push(`Sc ${s.num}: ${t.text}`); })));
    P.wardrobe.forEach(x => x.sceneIds.forEach(id => itemCharsIn(x, id).forEach(w => { const sc = scenes.find(z => z.id === id); if (sc) { if (!plot.has(w)) plot.set(w, []); plot.get(w).push(`Sc ${sc.num}: ${x.name}${x.look ? ' (' + x.look + ')' : ''}`); } })));
    if (plot.size) extra = h('div', { style: { marginTop: '26px' } }, h('h3', { style: { marginBottom: '10px' } }, 'Costume plot by character'),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Character'), h('th', {}, 'Wardrobe & makeup by scene'))),
        h('tbody', {}, [...plot].map(([k, v]) => h('tr', {}, h('td', {}, h('b', {}, k)), h('td', {}, [...new Set(v)].join('   ·   ')))))));
    else extra = h('p', { class: 'muted', style: { marginTop: '16px' } }, 'Tip: in the Breakdown, assign Wardrobe and Makeup items to a character to build the costume plot. Add a story day and continuity notes for each scene there too.');
  }

  /* columns nobody has filled in are left out (and listed in a hint) */
  const hidden = [];
  ({ oneliner: ['Synopsis'], continuity: ['Story day', 'Continuity notes'] }[tab] || []).forEach(nm => {
    const i = headers.indexOf(nm);
    if (i >= 0 && rows.every(r => !Array.isArray(r) || !String(r[i] || '').trim())) { headers.splice(i, 1); rows.forEach(r => Array.isArray(r) && r.splice(i, 1)); hidden.push(nm.toLowerCase()); }
  });
  if (hidden.length) extra = h('div', {}, extra, h('p', { class: 'small muted', style: { marginTop: '8px' } }, `Add ${hidden.join(' and ')} for each scene in the Breakdown and ${hidden.length > 1 ? 'they' : 'it'} will appear here.`));
  const isGrid = tab === 'dood' || tab === 'chart', DASH = h('span', { class: 'rdash' }, '—');
  const cellNode = (c, i) => {
    const txt = String(c ?? '');
    if (!txt.trim()) return DASH.cloneNode(true);
    if (markCols && i > 0 && ['SW', 'W', 'WF', 'SWF', 'H'].includes(txt)) return h('span', { class: 'mk ' + txt }, txt);
    if (i === 0 && tab !== 'oneliner' && !txt.includes('\n')) return h('b', {}, txt);
    if (txt.includes('\n') || /^[A-Z][A-Z0-9' /.&-]*: /.test(txt)) return h('div', { class: 'rlines' }, txt.split('\n').map(l => { const m = l.match(/^([A-Z][A-Z0-9' /.&-]*): (.*)$/); return h('div', {}, m ? [h('b', { class: 'rwho' }, m[1]), ' ', m[2]] : l); }));
    return txt;
  };
  const shown = rows.filter(r => Array.isArray(r)).length;
  const tbl = h('div', { class: 'rep-wrap' }, h('table', { class: 'tbl rep' + (isGrid ? ' dood' : '') + ' rep-' + tab },
    h('thead', {}, h('tr', {}, headers.map((x, i) => h('th', { class: isGrid && i > 0 ? 'dcol' : '', style: { whiteSpace: 'pre-line' } }, x)))),
    h('tbody', {}, shown || rows.length ? rows.map(r => r.grp !== undefined && !Array.isArray(r) ? h('tr', { class: 'grp' }, h('td', { colspan: headers.length }, r.grp)) : h('tr', {}, r.map((c, i) => h('td', { class: (isGrid && i > 0 ? 'dcol ' : '') + (i === 0 && !isGrid ? 'first' : '') }, cellNode(c, i))))) : h('tr', {}, h('td', { colspan: headers.length }, 'Nothing to report yet.')))));
  const flatRows = csvRows || rows.filter(r => Array.isArray(r)), flatHead = csvHead || headers;
  holder.append(h('div', { class: 'page-h' }, h('div', {}, h('h2', {}, 'Reports'), h('div', { class: 'muted small', style: { marginTop: '3px' } }, [P.title, REPORT_INFO[tab]].filter(Boolean).join(' — '))), h('span', { class: 'grow' }), h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
    h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-' + tab + '.csv', toCSV([flatHead.map(x => x.replace('\n', ' ')), ...flatRows]), 'text/csv') }, icon('download', 15), 'CSV'),
    h('button', { class: 'btn', onclick: () => printTable(title, headers.map(x => x.replace('\n', ' ')), rows) }, icon('print', 15), 'Print'))),
    tabsEl(), tbl, extra);
  root.append(holder);
};
