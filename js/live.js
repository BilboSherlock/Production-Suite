'use strict';
/* ===================================================================
   Live production dashboard — runs a shoot day (film, TV, stage, AV)
   or a photo shoot. Built on the live desk (livedesk.js):

   • top: clock, schedule status, progress, shots, problems and the
     next deadline (meal, sunset, call-sheet wrap)
   • alerts that matter now, worst first
   • "now" and "next": what is shooting, with everything connected
     to it — shots to tick off, who is needed and whether they are
     here, props / wardrobe / effects from the breakdown, storyboard
     frames, and one tap to the script, shot list or take log
   • the running order on a time axis, forecasting the wrap
   • problems, check-in, tasks and the activity log, shared with
     every other suite, feeding the daily production report
   A photo shoot runs from its run of show when there is one.
   =================================================================== */

/* minutes a scene / setup takes: its estimate, or pages × minutes per page (photo: an hour) */
const liveEst = (P, s) => P.mode === 'photo' ? (+(P.sceneMeta[s.id] || {}).est || 60) : sceneEst(P, s);
const liveWords = P => Object.assign({ item: 'Scene', items: 'scenes', Items: 'Scenes', crew: 'Crew', cast: 'Cast', day: 'shoot day' }, P.mode === 'photo' ? { item: 'Setup', items: 'setups', Items: 'Setups', cast: 'Talent' } : P.mode === 'av' ? { item: 'Segment', items: 'segments', Items: 'Segments', cast: 'Talent' } : P.mode === 'stage' ? { day: 'rehearsal or show day' } : {});

/* the planned running order: from the photo run of show, or scenes in sequence with company moves and lunch */
function livePlan(P, day, L) {
  const run = P.mode === 'photo' && P.photo && P.photo.runs && P.photo.runs[day.id];
  if (run && run.length) return livePlanFromRun(P, run);
  const scenes = getScenes(P), by = new Map(scenes.map(s => [s.id, s]));
  const ids = (L.order || []).filter(id => day.sceneIds.includes(id)); day.sceneIds.forEach(id => { if (!ids.includes(id)) ids.push(id); });
  const call = toMin(day.cs.shoot) ?? toMin(day.cs.crew) ?? 480, meal = +optOf(P, 'mealHours') || 6, lunchAt = toMin(day.cs.lunch) ?? (call + Math.round((meal - 1.5) * 60));
  const rows = []; let t = call, prevLoc = null, lunch = false;
  ids.filter(id => by.has(id)).forEach(id => {
    const s = by.get(id), loc = (locName(P, s) || '').toUpperCase();
    if (prevLoc !== null && loc && prevLoc && loc !== prevLoc) { rows.push({ kind: 'move', id: 'mv' + id, start: t, dur: 30, label: `${TERM.moveWord} → ${locName(P, s)}`, scene: s }); t += 30; }
    if (!lunch && t >= lunchAt) { rows.push({ kind: 'lunch', id: 'lunch', start: t, dur: 60, label: 'Lunch' }); t += 60; lunch = true; }
    const dur = liveEst(P, s); rows.push({ kind: 'scene', id, scene: s, start: t, dur }); t += dur; prevLoc = loc || prevLoc;
  });
  return { rows, call, end: t, lunchAt };
}
function livePlanFromRun(P, run) {
  const by = new Map(getScenes(P).map(s => [s.id, s])), rows = []; let t = toMin(run[0].start) ?? 480;
  run.forEach(r => {
    const start = toMin(r.start) ?? t, dur = Math.max(0, +r.dur || 0); t = start + dur;
    if (r.kind === 'Lunch') rows.push({ kind: 'lunch', id: 'lunch', start, dur, label: 'Lunch' });
    else if (r.sceneId && by.has(r.sceneId) && !rows.some(x => x.id === r.sceneId)) rows.push({ kind: 'scene', id: r.sceneId, scene: by.get(r.sceneId), start, dur });
    else rows.push({ kind: r.kind === 'Move' ? 'move' : 'block', id: 'ros' + r.id, start, dur, label: r.title || r.kind });
  });
  return { rows, call: rows.length ? rows[0].start : 480, end: t, lunchAt: (rows.find(r => r.kind === 'lunch') || {}).start, fromRun: true };
}
/* what is actually happening, and where the day is heading */
function liveForecast(P, day, L, plan, now) {
  const out = []; let cursor = plan.call; const started = !!L.started, flow = r => { const fs = started ? Math.max(cursor, now) : Math.max(cursor, r.start); return [fs, fs + r.dur]; };
  plan.rows.forEach((r, i) => {
    const o = { ...r, fs: r.start, fe: r.start + r.dur, state: 'pending', extra: 0 };
    if (r.kind === 'scene') {
      const it = L.items[r.id] || { status: 'pending' }; o.extra = +it.extra || 0; o.it = it; const dur = r.dur + o.extra;
      if (it.status === 'done') { o.state = 'done'; o.fs = msMin(it.start || Date.now()); o.fe = msMin(it.end || Date.now()); cursor = Math.max(cursor, o.fe); }
      else if (it.status === 'dropped') { o.state = 'dropped'; o.fs = o.fe = cursor; }
      else if (it.status === 'active') { o.state = 'active'; o.fs = msMin(it.start); o.fe = Math.max(o.fs + dur, now + (now > o.fs + dur ? Math.max(5, dur * .1) : 0)); o.over = now > o.fs + dur; cursor = o.fe; }
      else { [o.fs] = flow(r); o.fe = o.fs + dur; cursor = o.fe; o.late = o.fs > r.start + 10; }
    } else if (r.kind === 'move') {
      const next = plan.rows.slice(i + 1).find(x => x.kind === 'scene'), ni = next && (L.items[next.id] || {}).status;
      if (!plan.fromRun && (ni === 'done' || ni === 'dropped' || ni === 'active')) { o.state = 'skip'; o.fs = o.fe = cursor; } else { [o.fs, o.fe] = flow(r); cursor = o.fe; if (o.fe <= now && started) o.state = 'done'; }
    } else if (r.kind === 'lunch') {
      if (L.meal.in) { o.state = 'done'; o.fs = msMin(L.meal.out); o.fe = msMin(L.meal.in); cursor = Math.max(cursor, o.fe); }
      else if (L.meal.out) { o.state = 'active'; o.fs = msMin(L.meal.out); o.fe = Math.max(o.fs + r.dur, now); cursor = o.fe; }
      else { [o.fs, o.fe] = flow(r); cursor = o.fe; }
    } else { [o.fs, o.fe] = flow(r); cursor = o.fe; if (o.fe <= now && started) o.state = 'done'; }
    out.push(o);
  });
  const live = out.filter(r => r.state !== 'skip' && r.state !== 'dropped'), fWrap = live.length ? Math.max(...live.map(r => r.fe)) : plan.end;
  return { rows: out, wrap: fWrap, delta: fWrap - plan.end };
}

Views.live = function (root) {
  const P = Store.P;
  if (P.mode === 'podcast' && typeof renderPodcastLive === 'function') return renderPodcastLive(root, P);
  const W = liveWords(P);
  if (!P.days.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, `No ${W.day}s yet`), h('p', {}, `The live dashboard runs a ${W.day} from your schedule. Create a day and schedule its ${W.items} first.`), h('a', { class: 'btn primary', href: `#/p/${P.id}/schedule` }, 'Go to Schedule')))); return; }
  const today = todayISO();
  if (!P.days.find(d => d.id === UI.liveDay)) UI.liveDay = (P.days.find(d => d.date === today) || P.days.find(d => !(P.live && P.live.days[d.id] && P.live.days[d.id].ended)) || P.days[0]).id;
  const wrap = h('div', { class: 'live ld' + (UI.liveTV ? ' tv' : '') }); root.append(wrap);
  const day = () => P.days.find(d => d.id === UI.liveDay), dayN = () => P.days.indexOf(day()) + 1, sceneOf = id => getScenes(P).find(x => x.id === id);
  const flash = () => { Store.touch(); draw(); };

  /* ---------- actions ---------- */
  function startDay() { const L = liveOf(P, day()); L.started = Date.now(); liveLog(L, 'Day started', 'sys'); const R = dprOf(P, day()); if (!R.t.crew) R.t.crew = day().cs.crew || ''; flash(); }
  async function wrapDay() {
    const d = day(), L = liveOf(P, d), open = d.sceneIds.filter(id => !['done', 'dropped'].includes((L.items[id] || {}).status));
    if (open.length && !(await confirmBox(`${open.length} ${open.length > 1 ? W.items + ' are' : W.item.toLowerCase() + ' is'} not finished. Wrap the day anyway? Unfinished ${W.items} are marked Not shot.`, 'Wrap day', 'Wrap the day?'))) return;
    const R = dprOf(P, d); open.forEach(id => { L.items[id] = Object.assign(L.items[id] || {}, { status: 'dropped' }); R.scenes[id] = Object.assign(R.scenes[id] || {}, { status: 'Not shot' }); });
    L.ended = Date.now(); R.t.wrap = fromMin(Math.round(msMin(L.ended))); liveLog(L, `Day wrapped at ${clockTxt(msMin(L.ended))}`, 'sys'); flash();
  }
  function startScene(id) {
    const d = day(), L = liveOf(P, d), it = L.items[id] = L.items[id] || {}; if (!L.started) { L.started = Date.now(); liveLog(L, 'Day started', 'sys'); }
    it.status = 'active'; it.start = Date.now(); delete it.end; const s = sceneOf(id); liveLog(L, `Started ${W.item.toLowerCase()} ${s.num} — ${s.label}`, 'scene');
    const R = dprOf(P, d); if (!R.t.first) R.t.first = fromMin(Math.round(msMin(it.start))); flash();
  }
  function completeScene(id) {
    const d = day(), L = liveOf(P, d), it = L.items[id] = L.items[id] || {}, s = sceneOf(id); if (!it.start) it.start = Date.now() - liveEst(P, s) * 6e4;
    it.status = 'done'; it.end = Date.now(); liveLog(L, `Completed ${W.item.toLowerCase()} ${s.num} (${durTxt((it.end - it.start) / 6e4)} vs ${durTxt(liveEst(P, s))} planned)`, 'scene');
    const R = dprOf(P, d), shots = P.shots.filter(x => x.sceneId === id).length; R.scenes[id] = Object.assign(R.scenes[id] || {}, { status: 'Completed', pgs: String(s.eighths), setups: R.scenes[id] && R.scenes[id].setups || (shots ? String(shots) : '') }); flash();
  }
  function reopen(id) { const L = liveOf(P, day()), it = L.items[id]; if (it) { it.status = 'pending'; delete it.start; delete it.end; } liveLog(L, `${W.item} ${sceneOf(id).num} reset to pending`, 'scene'); flash(); }
  async function dropScene(id) {
    const s = sceneOf(id), why = await promptBox(`Drop ${W.item.toLowerCase()} ${s.num}`, `Reason (optional) — the ${W.item.toLowerCase()} is marked Not shot`, ''); if (why === null) return;
    const L = liveOf(P, day()); L.items[id] = Object.assign(L.items[id] || {}, { status: 'dropped', note: why }); dprOf(P, day()).scenes[id] = Object.assign(dprOf(P, day()).scenes[id] || {}, { status: 'Not shot' }); liveLog(L, `Dropped ${W.item.toLowerCase()} ${s.num}${why ? ': ' + why : ''}`, 'warn'); flash();
  }
  function moveScene(id, dir) { const d = day(), L = liveOf(P, d), ids = livePlan(P, d, L).rows.filter(r => r.kind === 'scene').map(r => r.id), i = ids.indexOf(id), j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; L.order = ids; liveLog(L, `Reordered: ${W.item.toLowerCase()} ${sceneOf(id).num} moved ${dir < 0 ? 'earlier' : 'later'}`, 'sys'); flash(); }
  function deferScene(id) {
    const d = day(), n = dayN(), next = P.days[n], s = sceneOf(id);
    const sel = h('select', { class: 'inp' }, h('option', { value: 'next', disabled: !next }, next ? `Day ${n + 1}${next.date ? ' (' + fmtDateShort(next.date) + ')' : ''}` : 'No next day'), h('option', { value: 'new' }, 'A new shoot day'), h('option', { value: 'drop' }, 'Unschedule (back to the unscheduled pile)'));
    if (!next) sel.value = 'new';
    modal({ title: `Move ${W.item.toLowerCase()} ${s.num} to another day`, body: h('div', {}, h('p', { style: { marginTop: 0 } }, `“${s.label}” will be removed from today’s plan.`), sel), buttons: [{ label: 'Cancel' }, { label: `Move ${W.item.toLowerCase()}`, primary: true, onClick: () => {
      const L = liveOf(P, d); d.sceneIds = d.sceneIds.filter(x => x !== id); L.order = L.order.filter(x => x !== id); delete L.items[id];
      if (sel.value === 'next' && next) next.sceneIds.unshift(id); else if (sel.value === 'new') { const nd = newDay(P, d.date ? addDays(d.date, 1, true) : ''); nd.sceneIds = [id]; P.days.splice(n, 0, nd); }
      liveLog(L, `Moved ${W.item.toLowerCase()} ${s.num} off today (${{ next: 'to Day ' + (n + 1), new: 'to a new day', drop: 'unscheduled' }[sel.value]})`, 'warn'); delete dprOf(P, d).scenes[id]; flash();
    } }] });
  }
  function addDelay(id) {
    const L = liveOf(P, day()), s = sceneOf(id), min = h('input', { class: 'inp', type: 'number', min: 1, value: 15, style: { width: '90px' } }), why = h('select', { class: 'inp' }, DELAY_REASONS.map(r => h('option', {}, r))), note = h('input', { class: 'inp', placeholder: 'Details (optional)' });
    modal({ title: `Delay — ${W.item.toLowerCase()} ${s.num}`, body: h('div', { class: 'fx-grid' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Minutes lost'), min), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Reason'), why), h('div', { class: 'field', style: { gridColumn: '1 / -1' } }, h('label', { class: 'lbl' }, 'Notes'), note)), buttons: [{ label: 'Cancel' }, { label: 'Log delay', primary: true, onClick: () => {
      const m = Math.max(1, +min.value || 0), it = L.items[id] = L.items[id] || {}; it.extra = (+it.extra || 0) + m; liveLog(L, `Delay +${m}m on ${W.item.toLowerCase()} ${s.num}: ${why.value}${note.value ? ' — ' + note.value : ''}`, 'warn');
      L.issues.unshift({ id: uid(), at: Date.now(), title: `${why.value} delay (${m} min)`, cat: why.value === 'Cast late' ? 'Cast' : LIVE_ISSUE_CATS.includes(why.value) ? why.value : 'Schedule', sev: m >= 30 ? 'High' : 'Medium', status: 'Open', owner: '', sceneId: id, notes: note.value, resolvedAt: 0, delay: m });
      const R = dprOf(P, day()); R.incidents = [R.incidents, `${clockTxt(nowMin())} — ${W.item} ${s.num}: ${why.value} delay, ${m} min${note.value ? ' (' + note.value + ')' : ''}`].filter(Boolean).join('\n'); flash();
    } }] });
  }
  function editTimes(r) {
    const it = (liveOf(P, day()).items[r.id] = liveOf(P, day()).items[r.id] || {}), hm = ms => ms ? fromMin(Math.round(msMin(ms))) : '', a = h('input', { class: 'inp', type: 'time', value: hm(it.start) }), b = h('input', { class: 'inp', type: 'time', value: hm(it.end) });
    const on = (t, ref) => { if (!t) return 0; const d = new Date(ref || Date.now()); const [H, M] = t.split(':').map(Number); d.setHours(H, M, 0, 0); return d.getTime(); };
    modal({ title: `Actual times — ${W.item.toLowerCase()} ${r.scene.num}`, body: h('div', { class: 'fx-grid' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Started'), a), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Finished'), b)), buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { it.start = on(a.value, it.start); it.end = on(b.value, it.start); if (it.start && it.end) it.status = 'done'; else if (it.start) it.status = 'active'; liveLog(liveOf(P, day()), `Times edited for ${W.item.toLowerCase()} ${r.scene.num}`, 'sys'); flash(); } }] });
  }
  function sceneMenu(e, r, plan) {
    const st = (r.it || {}).status, items = [], idle = st !== 'active' && st !== 'done' && st !== 'dropped';
    if (idle) items.push({ label: 'Start now', icon: 'play', onClick: () => startScene(r.id) });
    if (st === 'active') items.push({ label: 'Complete', icon: 'check', onClick: () => completeScene(r.id) });
    if (st !== 'done' && st !== 'dropped') { items.push({ label: 'Log a delay…', icon: 'clock', onClick: () => addDelay(r.id) }); if (!plan.fromRun) items.push({ label: 'Move earlier', icon: 'up', onClick: () => moveScene(r.id, -1) }, { label: 'Move later', icon: 'down', onClick: () => moveScene(r.id, 1) }); items.push({ label: 'Move to another day…', icon: 'right', onClick: () => deferScene(r.id) }, { label: `Drop ${W.item.toLowerCase()}…`, icon: 'trash', onClick: () => dropScene(r.id) }); }
    if (!idle) items.push({ sep: true }, { label: 'Edit times…', icon: 'edit', onClick: () => editTimes(r) }, { label: 'Reset to pending', icon: 'rotate', onClick: () => reopen(r.id) });
    items.push({ sep: true }, ...jumpLinks(r.scene).map(([label, ico, go]) => ({ label, icon: ico, onClick: go })));
    menu(e.currentTarget, items);
  }

  /* ---------- everything connected to a scene / setup ---------- */
  const go = (view, sceneId) => () => { UI.scene = sceneId; UI.shotScene = sceneId; location.hash = `#/p/${P.id}/${view}`; };
  const has = v => typeof Views[v] === 'function' && featureOn(P, v);
  function jumpLinks(s) {
    return [['Script', 'pen', 'script'], ['Breakdown', 'tag', 'breakdown'], ['Shot list', 'camera', P.mode === 'photo' ? 'photoshots' : 'shots'], ['Storyboard', 'image', 'board'], ['Take log', 'clipboard', 'takes']]
      .filter(([, , v]) => has(v)).map(([l, i, v]) => [l, i, go(v, s.id)]);
  }
  function castFor(s) {
    return [...sceneCast(P, s)].map(ch => ({ ch, p: P.people.find(x => x.type === 'cast' && normChar(x.character) === ch) }));
  }
  function contextOf(s, L, full) {
    const blocks = [];
    /* shots: tap to tick off */
    if (P.mode === 'photo') {
      const shots = P.photo.shots.filter(x => x.sceneId === s.id), shot = shots.filter(x => SHOT_STATUS.indexOf(x.status) >= 1).length;
      if (shots.length) blocks.push(['Shots', `${shot}/${shots.length}`, shots.map(x => h('button', { class: 'chip shot' + (SHOT_STATUS.indexOf(x.status) >= 1 ? ' on' : ''), style: { '--c': SHOT_TONE[x.status] || '' }, title: `${x.title || ''} — ${x.status}. Tap: mark shot / back to planned`, onclick: () => { x.status = SHOT_STATUS.indexOf(x.status) >= 1 ? 'Planned' : 'Shot'; liveLog(L, `Shot ${photoShotLabel(P, x, getScenes(P))} ${x.status === 'Shot' ? 'shot' : 'back to planned'}`, 'ok'); flash(); } }, x.hero ? '★ ' : '', photoShotLabel(P, x, getScenes(P)), x.title ? ' · ' + x.title.slice(0, 18) : ''))]);
    } else {
      const shots = P.shots.filter(x => x.sceneId === s.id), done = shots.filter(x => x.done).length;
      if (shots.length) blocks.push(['Shots', `${done}/${shots.length}`, shots.map(x => { const tk = (P.takes || []).filter(t => t.shotId === x.id), circ = tk.filter(t => t.status === 'circle').length;
        return h('button', { class: 'chip shot' + (x.done ? ' on' : ''), title: `${[x.size, x.angle, x.move, x.desc].filter(Boolean).join(' · ')}${tk.length ? ` — ${tk.length} takes, ${circ} circled` : ''}. Tap to tick off`, onclick: () => { x.done = !x.done; liveLog(L, `Shot ${shotLabel(P, x)} ${x.done ? 'done' : 'reopened'}`, x.done ? 'ok' : 'sys'); flash(); } }, x.done ? '✓ ' : '', shotLabel(P, x), x.size ? ' ' + x.size : '', tk.length ? h('span', { class: 'chip-n' }, circ ? `${circ}◉` : tk.length) : null); })]);
    }
    /* who is needed, and are they here */
    const cast = castFor(s);
    if (cast.length) blocks.push([W.cast, `${cast.filter(c => c.p && CHECK_HERE.includes((L.checkins[c.p.id] || {}).status)).length}/${cast.length} here`, cast.map(({ ch, p }) => { const st = p ? (L.checkins[p.id] || { status: 'Called' }).status : ''; return h('button', { class: 'chip who st-' + st.replace(/\s/g, ''), title: p ? `${p.name} as ${ch} — ${st}. Tap to update` : `${ch} — nobody cast yet`, onclick: e => p && menu(e.currentTarget, CHECK_STAGES.map(x => ({ label: x, icon: x === st ? 'check' : null, onClick: () => { L.checkins[p.id] = { status: x, at: Date.now() }; liveLog(L, `${p.name || ch}: ${x}`, 'sys'); flash(); } }))) }, h('i', { class: 'dot' }), p && p.name ? p.name.split(' ')[0] : ch, p && p.name && P.mode !== 'photo' ? h('span', { class: 'chip-sub' }, ch) : null); })]);
    /* what the departments need, from the breakdown */
    const need = P.tags.filter(t => t.sceneId === s.id && !['cast', 'notes'].includes(t.cat)), seen = new Set(), uniq = need.filter(t => { const k = t.cat + ':' + (t.itemId || t.text.toLowerCase()); if (seen.has(k)) return false; seen.add(k); return true; });
    if (uniq.length) blocks.push(['Needs', String(uniq.length), uniq.sort((a, b) => CATS.findIndex(c => c.k === a.cat) - CATS.findIndex(c => c.k === b.cat)).map(t => h('span', { class: 'chip need', style: { '--c': (CATMAP[t.cat] || {}).color }, title: (CATMAP[t.cat] || {}).label }, t.text))]);
    /* storyboard */
    const frames = P.boards.filter(b => b.sceneId === s.id && b.img);
    if (frames.length && full) blocks.push(['Boards', String(frames.length), [h('div', { class: 'ld-thumbs' }, frames.slice(0, 5).map(b => h('img', { src: b.img, alt: b.caption || 'frame', title: b.caption || '', loading: 'lazy', onclick: go('board', s.id) })), frames.length > 5 ? h('span', { class: 'chip' }, `+${frames.length - 5}`) : null)]]);
    const meta = P.sceneMeta[s.id] || {}, notes = [meta.notes, meta.synopsis && meta.synopsis !== s.synopsis ? meta.synopsis : ''].filter(Boolean)[0];
    return h('div', { class: 'ld-ctx' }, blocks.map(([label, n, kids]) => h('div', { class: 'ld-ctx-row' }, h('span', { class: 'ld-ctx-l' }, label, h('em', {}, n)), h('div', { class: 'ld-chips' }, kids))),
      full && notes ? h('div', { class: 'ld-ctx-row' }, h('span', { class: 'ld-ctx-l' }, 'Notes'), h('div', { class: 'ld-note' }, notes)) : null,
      full ? h('div', { class: 'ld-links' }, jumpLinks(s).map(([l, i, fn]) => h('button', { class: 'btn sm ghost', onclick: fn }, icon(i, 13), l))) : null);
  }

  /* ---------- the picture ---------- */
  function draw() {
    const d = day(), L = liveOf(P, d), scenes = getScenes(P), now = nowMin(), plan = livePlan(P, d, L), fc = liveForecast(P, d, L, plan, now), rows = fc.rows, sceneRows = rows.filter(r => r.kind === 'scene');
    const active = sceneRows.filter(r => r.state === 'active'), pending = sceneRows.filter(r => r.state === 'pending'), doneN = sceneRows.filter(r => r.state === 'done').length, dropN = sceneRows.filter(r => r.state === 'dropped').length, totalN = sceneRows.length - dropN;
    const pgs = rs => sum(rs, r => r.scene.eighths), pgDone = pgs(sceneRows.filter(r => r.state === 'done')), pgAll = pgs(sceneRows.filter(r => r.state !== 'dropped'));
    const daySet = new Set(d.sceneIds), photo = P.mode === 'photo';
    const shotsAll = photo ? P.photo.shots.filter(s => daySet.has(s.sceneId)) : P.shots.filter(s => daySet.has(s.sceneId)), shotsDone = photo ? shotsAll.filter(s => SHOT_STATUS.indexOf(s.status) >= 1).length : shotsAll.filter(s => s.done || (P.takes || []).some(t => t.shotId === s.id && t.status === 'circle')).length;
    const openIss = L.issues.filter(i => i.status !== 'Resolved'), crit = openIss.filter(i => i.sev === 'Critical');
    const started = !!L.started, ended = !!L.ended, delta = started ? fc.delta : 0, limitWrap = toMin(d.cs.wrap), sun = toMin(d.cs.sunset);
    const status = ended ? ['Wrapped', 'muted'] : !started ? ['Not started', 'muted'] : delta > 20 ? [`Behind ${durTxt(delta)}`, 'bad'] : delta > 5 ? [`Behind ${durTxt(delta)}`, 'warn'] : delta < -10 ? [`Ahead ${durTxt(-delta)}`, 'info'] : ['On time', 'good'];
    const mealCap = (toMin(d.cs.crew) ?? plan.call) + (+optOf(P, 'mealHours') || 6) * 60;
    const lunchOut = () => { L.meal.out = Date.now(); dprOf(P, d).t.lunchOut = fromMin(Math.round(msMin(L.meal.out))); liveLog(L, 'Lunch out', 'sys'); flash(); };

    /* the next thing with a deadline */
    const marks = [];
    if (started && !ended && !L.meal.out && plan.lunchAt != null) marks.push([mealCap, 'Meal due', mealCap - now < 30 ? 'warn' : '']);
    if (sun && !ended) marks.push([sun, 'Sunset', sun - now < 60 ? 'warn' : '']);
    if (limitWrap != null && !ended) marks.push([limitWrap, 'Call-sheet wrap', fc.wrap > limitWrap ? 'bad' : '']);
    const nextMark = marks.filter(m => m[0] > now).sort((a, b) => a[0] - b[0])[0];

    /* alerts */
    const alerts = [];
    crit.forEach(i => alerts.push(['crit', `Critical: ${i.title}`]));
    if (started && !ended) {
      if (!L.meal.out && plan.lunchAt != null && now > mealCap) alerts.push(['crit', `Meal break overdue — due by ${clockTxt(mealCap)} (${durTxt(now - mealCap)} late). Penalties may apply.`]); else if (!L.meal.out && plan.lunchAt != null && now > mealCap - 30) alerts.push(['warn', `Meal break due by ${clockTxt(mealCap)} (${durTxt(mealCap - now)} left)`, { label: 'Lunch out', fn: lunchOut }]);
      if (limitWrap != null && fc.wrap > limitWrap + 5) alerts.push([fc.wrap > limitWrap + 30 ? 'crit' : 'warn', `Forecast wrap ${clockTxt(fc.wrap)} is ${durTxt(fc.wrap - limitWrap)} after the call-sheet wrap (${clockTxt(limitWrap)})`]);
      const cap = (toMin(d.cs.crew) ?? plan.call) + (+P.settings.dayHours || 10) * 60; if (fc.wrap > cap) alerts.push(['warn', `The day would run past the ${P.settings.dayHours || 10}-hour limit (${clockTxt(cap)})`]);
      const nd = P.days[dayN()]; if (nd && nd.cs && nd.cs.crew && nd.date && d.date) { const gap = ((new Date(nd.date) - new Date(d.date)) / 6e4) - fc.wrap + (toMin(nd.cs.crew) || 0), need = (+optOf(P, 'turnaround') || 10) * 60; if (gap < need) alerts.push(['warn', `Forecast wrap leaves only ${(gap / 60).toFixed(1)} h turnaround before Day ${dayN() + 1} call (${need / 60} h needed)`]); }
      if (sun) { const late = sceneRows.filter(r => ['pending', 'active'].includes(r.state) && /EXT/i.test(r.scene.ioe || '') && !/NIGHT/i.test(r.scene.tod || '') && r.fe > sun); if (late.length) alerts.push(['warn', `Exterior ${late.length > 1 ? W.items : W.item.toLowerCase()} ${late.map(r => r.scene.num).join(', ')} forecast to finish after sunset (${clockTxt(sun)})`]); }
      const nextR = pending[0]; if (nextR && nextR.fs - now < 45) castFor(nextR.scene).forEach(({ ch, p }) => { if (p && !CHECK_HERE.includes((L.checkins[p.id] || {}).status)) alerts.push(['warn', `${p.name || ch}${P.mode !== 'photo' ? ` (${ch})` : ''} not on site yet — ${W.item.toLowerCase()} ${nextR.scene.num} starts ${nextR.fs <= now ? 'now' : 'in ' + durTxt(nextR.fs - now)}`]); });
      if (fc.delta > 25 && pending.length) { const need = fc.delta, cand = [...pending].reverse().map(r => ({ r, m: r.dur + r.extra })).sort((a, b) => Math.abs(a.m - need) - Math.abs(b.m - need))[0]; if (cand) alerts.push(['tip', `To recover ${durTxt(need)}, consider moving ${W.item.toLowerCase()} ${cand.r.scene.num} (${durTxt(cand.m)}) to another day.`, { label: `Move ${W.item.toLowerCase()}…`, fn: () => deferScene(cand.r.id) }]); }
    }

    /* header */
    const daySel = h('select', { class: 'inp ld-daysel', 'aria-label': 'Shoot day', onchange: e => { UI.liveDay = e.target.value; draw(); } }, P.days.map((x, i) => h('option', { value: x.id, selected: x.id === d.id }, `Day ${i + 1}${x.date ? ' · ' + fmtDateShort(x.date) : ''}${x.date === today ? ' (today)' : ''}`)));
    const header = h('div', { class: 'ld-head' },
      ldClock(clockTxt(now), started ? `${ended ? 'Day length' : 'Running'} ${durTxt(((ended || Date.now()) - L.started) / 6e4)}` : `Day ${dayN()} not started`),
      ldTile('Schedule', status[0], started ? `Wrap ~${clockTxt(fc.wrap)} · plan ${clockTxt(plan.end)}` : `Planned wrap ${clockTxt(plan.end)}`, status[1]),
      ldTile(W.Items, `${doneN}/${totalN}`, photo ? (dropN ? `${dropN} dropped` : `${pending.length} to go`) : `${fmtEighths(pgDone)} of ${fmtEighths(pgAll)} pp${dropN ? ` · ${dropN} dropped` : ''}`, '', ldProgress(totalN ? doneN / totalN * 100 : 0, 'good')),
      ldTile('Shots', shotsAll.length ? `${shotsDone}/${shotsAll.length}` : '—', shotsAll.length ? (photo ? 'shot / planned' : 'done / planned') : 'none planned', '', shotsAll.length ? ldProgress(shotsDone / shotsAll.length * 100) : null),
      ldTile('Problems', String(openIss.length), crit.length ? `${crit.length} critical` : openIss.length ? 'open' : 'all clear', crit.length ? 'bad' : openIss.length ? 'warn' : ''),
      nextMark ? ldTile(nextMark[1], `in ${durTxt(nextMark[0] - now)}`, `at ${clockTxt(nextMark[0])}`, nextMark[2]) : null,
      h('div', { class: 'ld-actions' }, daySel,
        !started ? h('button', { class: 'btn primary', onclick: startDay }, icon('play', 15), 'Start day') : !ended ? h('button', { class: 'btn', onclick: wrapDay }, icon('check', 15), 'Wrap day') : h('button', { class: 'btn', onclick: () => { L.ended = 0; flash(); } }, 'Reopen day'),
        h('button', { class: 'btn', onclick: () => ldIssueModal(cx) }, icon('alert', 15), 'Problem'),
        h('button', { class: 'icon-btn', title: 'Big-display mode (full screen)', 'aria-label': 'Big-display mode', onclick: () => ldTV(wrap) }, icon('focus', 17))));

    /* now & next */
    function nowCard(r, title) {
      if (!r) return h('div', { class: 'ld-card empty' }, h('span', { class: 'ld-l' }, title), h('p', { class: 'muted' }, started ? (pending.length ? `Nothing shooting — start the next ${W.item.toLowerCase()} when ready.` : `All ${W.items} done.`) : 'Start the day to begin.'), !started ? h('button', { class: 'btn primary', onclick: startDay }, icon('play', 15), 'Start day') : null);
      const s = r.scene, est = r.dur + r.extra, el = r.state === 'active' ? now - r.fs : 0;
      return h('div', { class: 'ld-card s-' + r.state + (r.over ? ' over' : ''), 'data-key': 'now-' + r.id },
        h('div', { class: 'ld-card-h' }, h('span', { class: 'ld-l' }, title), h('span', { class: 'grow' }), h('button', { class: 'icon-btn', title: 'More actions', 'aria-label': 'More actions', onclick: e => sceneMenu(e, r, plan) }, icon('more', 16))),
        h('div', { class: 'ld-title' }, h('b', {}, `${W.item === 'Scene' ? 'Sc' : W.item} ${s.num}`), ' ', s.label),
        h('div', { class: 'ld-meta' }, [locName(P, s), !photo && s.eighths ? `${fmtEighths(s.eighths)} pp` : '', s.tod].filter(Boolean).join(' · ')),
        s.synopsis ? h('div', { class: 'ld-syn clip2' }, s.synopsis) : null,
        h('div', { class: 'ld-times' }, h('span', {}, `Started ${clockTxt(r.fs)}`), h('b', { class: r.over ? 'neg' : '' }, `${durTxt(el)} of ${durTxt(est)}`), h('span', {}, r.over ? `${durTxt(el - est)} over` : `ends ~${clockTxt(r.fe)}`)),
        ldProgress(el / est * 100, r.over ? 'bad' : 'info'),
        h('div', { class: 'ld-btns' }, h('button', { class: 'btn primary big', onclick: () => completeScene(r.id) }, icon('check', 16), 'Complete'), h('button', { class: 'btn big', onclick: () => addDelay(r.id) }, icon('clock', 15), 'Delay')),
        contextOf(s, L, true));
    }
    function nextCard(r) {
      if (!r) return h('div', { class: 'ld-card empty' }, h('span', { class: 'ld-l' }, 'Up next'), h('p', { class: 'muted' }, `No more ${W.items} today.`));
      const s = r.scene, later = pending.filter(x => x !== r);
      return h('div', { class: 'ld-card s-next' + (r.late ? ' late' : ''), 'data-key': 'next-' + r.id },
        h('div', { class: 'ld-card-h' }, h('span', { class: 'ld-l' }, 'Up next'), h('span', { class: 'grow' }), h('button', { class: 'icon-btn', title: 'More actions', 'aria-label': 'More actions', onclick: e => sceneMenu(e, r, plan) }, icon('more', 16))),
        h('div', { class: 'ld-title' }, h('b', {}, `${W.item === 'Scene' ? 'Sc' : W.item} ${s.num}`), ' ', s.label),
        h('div', { class: 'ld-meta' }, [locName(P, s), `forecast ${clockTxt(r.fs)}${r.late ? ` (planned ${clockTxt(r.start)})` : ''}`, durTxt(r.dur + r.extra)].filter(Boolean).join(' · ')),
        h('div', { class: 'ld-btns' }, h('button', { class: 'btn primary big', onclick: () => startScene(r.id) }, icon('play', 15), active.length ? 'Start (2nd unit)' : 'Start'), h('button', { class: 'btn', onclick: () => deferScene(r.id) }, 'Another day')),
        contextOf(s, L, !active.length),
        later.length ? h('div', { class: 'ld-later' }, h('span', { class: 'ld-ctx-l' }, 'Then'), later.slice(0, 6).map(x => h('button', { class: 'chip', title: `${x.scene.label} · forecast ${clockTxt(x.fs)}`, onclick: e => sceneMenu(e, x, plan) }, h('b', {}, x.scene.num), ' ', clockTxt(x.fs))), later.length > 6 ? h('span', { class: 'chip' }, `+${later.length - 6}`) : null) : null);
    }
    const nowRow = h('div', { class: 'ld-now-row' + (active.length ? '' : ' idle') }, active.length ? active.map((r, i) => nowCard(r, active.length > 1 ? (i ? 'Shooting — 2nd unit' : 'Shooting — main unit') : photo ? 'Shooting now' : 'Shooting now')) : nowCard(null, 'Shooting now'), nextCard(pending[0]));

    /* running order */
    const mealBtn = !started || ended || plan.lunchAt == null ? null : !L.meal.out ? h('button', { class: 'btn sm', onclick: lunchOut }, 'Lunch out') : !L.meal.in ? h('button', { class: 'btn sm primary', onclick: () => { L.meal.in = Date.now(); dprOf(P, d).t.lunchIn = fromMin(Math.round(msMin(L.meal.in))); liveLog(L, `Lunch in (${durTxt((L.meal.in - L.meal.out) / 6e4)})`, 'sys'); flash(); } }, 'Lunch in') : h('span', { class: 'pill' }, `Lunch ${durTxt((L.meal.in - L.meal.out) / 6e4)}`);
    const shown = rows.filter(r => r.state !== 'skip').map(r => Object.assign(r, { label: r.kind === 'scene' ? `${r.scene.num}. ${r.scene.label}`.replace(/^(\S+)\. (INT|EXT)\.? ?/, '$1. ') : r.label }));
    const from = Math.floor((Math.min(plan.call, ...shown.map(r => Math.min(r.start, r.fs))) - 15) / 30) * 30, to = Math.ceil((Math.max(fc.wrap, plan.end, limitWrap || 0, sun || 0) + 15) / 30) * 30;
    const orderPanel = ldPanel('film:order', { title: 'Running order', ico: 'calendar', count: `${doneN}/${totalN}`, hint: started ? `wrap ~${clockTxt(fc.wrap)}` : '',
      tools: [mealBtn, P.mode === 'photo' && has('runofshow') ? h('a', { class: 'btn sm ghost', href: `#/p/${P.id}/runofshow` }, plan.fromRun ? 'Edit run of show' : 'Build run of show') : null, h('span', { class: 'ld-legend' }, h('i', { class: 'lg-plan' }), 'planned', h('i', { class: 'lg-bar' }), 'forecast')],
      body: () => ldTimeline(shown, { from, to, now, showNow: started && !ended, onRow: (e, r) => sceneMenu(e, r, plan), marks: [{ at: sun, label: 'sunset', cls: 'sun' }, { at: limitWrap, label: 'wrap', cls: 'wrap' }] }) }, draw);

    /* shared panels */
    const castIds = new Set(); sceneRows.forEach(r => { if (r.state !== 'dropped') sceneCast(P, r.scene).forEach(ch => castIds.add(ch)); });
    const callOf = p => { const c = (d.calls && d.calls[p.id]) || {}; return c.call || c.time || d.cs.crew || null; };
    cx.L = L; cx.date = d.date || today; cx.items = sceneRows.map(r => ({ id: r.id, label: `${W.item} ${r.scene.num}. ${r.scene.label}` }));
    cx.groups = [{ key: 'cast', label: W.cast, empty: `No ${W.cast.toLowerCase()} needed today.`, people: P.people.filter(p => p.type === 'cast' && (photo ? p.name : castIds.has(normChar(p.character)))).map(p => ({ p, sub: photo ? p.role || p.character : p.character, call: callOf(p) })) },
      { key: 'crew', label: W.crew, empty: 'No crew listed — add them in Cast & crew.', people: P.people.filter(p => p.type === 'crew' && p.name).map(p => ({ p, sub: [p.role, p.dept].filter(Boolean).join(' · '), call: callOf(p) })) }];
    cx.taskFilter = t => taskOverdue(t) || (t.due && t.due <= cx.date) || (t.sceneId && daySet.has(t.sceneId)) || t.status === 'blocked' || t.status === 'doing';
    cx.report = () => dprOf(P, d);

    morph(wrap, [header, ldAlerts(alerts, draw), h('div', { class: 'ld-grid' },
      h('div', { class: 'ld-main' }, nowRow, orderPanel),
      h('div', { class: 'ld-side' }, ldProblems(cx), ldCheckin(cx), ldTasks(cx), ldActivity(cx)))].filter(Boolean));
  }
  const cx = { P, key: 'film', redraw: draw, flash, itemWord: W.item, issueCats: LIVE_ISSUE_CATS };
  draw();
  return ldTicker(wrap, { redraw: draw, tick: () => { const L = liveOf(P, day()), e = document.getElementById('ldClockSub'); if (e && L.started) e.textContent = `${L.ended ? 'Day length' : 'Running'} ${durTxt(((L.ended || Date.now()) - L.started) / 6e4)}`; } });
};
