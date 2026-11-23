'use strict';
/* ===================================================================
   Integrity — things that touch the whole project safely:
   • rename / merge a character everywhere
   • draft snapshots (save, compare, restore) taken automatically before
     risky bulk changes
   • build budget lines from cast/crew rates, shoot days and locations
   =================================================================== */

/* ---------- draft snapshots ---------- */
const snapData = P => JSON.stringify(P.blocks.map(b => [b.id, b.type, b.text, b.rev || '', b.num || '', b.note || '', b.lockPg || 0, b.om ? 1 : 0]));
const parseSnap = s => JSON.parse(s.data).map(([id, type, text, rev, num, note, lockPg, om]) => { const b = { id, type, text }; if (rev) b.rev = rev; if (num) b.num = num; if (note) b.note = note; if (lockPg) b.lockPg = lockPg; if (om) b.om = true; return b; });
function takeSnapshot(P, name, auto = false) {
  P.snapshots = P.snapshots || []; const data = snapData(P), last = P.snapshots[P.snapshots.length - 1];
  if (last && last.data === data) return last;                       // nothing changed since the last one
  const st = scriptStats(P);
  const s = { id: uid(), name: name || 'Draft', date: Date.now(), auto, data, title: P.title, meta: { ...P.meta }, pages: st.pages, words: st.words, scenes: st.scenes };
  P.snapshots.push(s);
  const autos = P.snapshots.filter(x => x.auto); while (autos.length > 12) { const o = autos.shift(); P.snapshots = P.snapshots.filter(x => x !== o); }
  while (P.snapshots.length > 40) P.snapshots.shift();
  Store.touch(); return s;
}
function autoSnapshot(P) {   // one automatic snapshot per day of work
  P.snapshots = P.snapshots || []; const last = P.snapshots[P.snapshots.length - 1];
  if (P.blocks.length > 5 && (!last || Date.now() - last.date > 864e5)) takeSnapshot(P, 'Auto · ' + new Date().toLocaleDateString(), true);
}
/* scene-level comparison between a snapshot and the current script */
function diffDraft(P, snap) {
  const mapOf = blocks => { const m = new Map(), order = []; let cur = null; blocks.forEach(b => { if (b.type === 'scene') { cur = { id: b.id, head: b.text, text: '' }; m.set(b.id, cur); order.push(cur); } else if (cur) cur.text += b.text + '\n'; }); return { m, order }; };
  const old = mapOf(parseSnap(snap)), now = mapOf(P.blocks), words = t => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const added = now.order.filter(s => !old.m.has(s.id)), removed = old.order.filter(s => !now.m.has(s.id));
  const changed = now.order.filter(s => old.m.has(s.id) && (old.m.get(s.id).text !== s.text || old.m.get(s.id).head !== s.head)).map(s => ({ head: s.head, delta: words(s.text) - words(old.m.get(s.id).text), old: old.m.get(s.id).head + '\n' + old.m.get(s.id).text, now: s.head + '\n' + s.text }));
  const moved = now.order.filter(s => old.m.has(s.id)).map(s => s.id).join() !== old.order.filter(s => now.m.has(s.id)).map(s => s.id).join();
  return { added, removed, changed, moved };
}

/* ---------- rename / merge a character everywhere ---------- */
const caseLike = (match, to) => match === match.toUpperCase() ? to.toUpperCase() : /^[A-Z]/.test(match) ? to.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, c) => a + c.toUpperCase()) : to.toLowerCase();
function renameCharacter(P, fromRaw, toRaw, opts = {}) {
  const from = normChar(fromRaw), to = String(toRaw || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const st = { cues: 0, mentions: 0, people: 0, roles: 0, items: 0, tags: 0, merged: false };
  if (!from || !to || from === to) return st;
  const re = opts.mentions ? new RegExp(`(?<![\\w])${reEsc(from)}(?![\\w])`, 'gi') : null;
  P.blocks.forEach(b => {
    if (b.type === 'character' && normChar(b.text) === from) {
      const ext = (b.text.match(/\([^)]*\)/g) || []).join(' '), dual = /\^\s*$/.test(b.text);
      b.text = to + (ext ? ' ' + ext : '') + (dual ? ' ^' : ''); if (P.settings.rev) b.rev = P.settings.rev; st.cues++;
    } else if (re && ['action', 'dialogue', 'paren', 'direction', 'setting', 'shot', 'cue'].includes(b.type) && re.test(b.text)) {
      re.lastIndex = 0; b.text = b.text.replace(re, m => { st.mentions++; return caseLike(m, to); }); if (P.settings.rev) b.rev = P.settings.rev;
    }
  });
  P.people.forEach(p => { if (p.type === 'cast' && normChar(p.character) === from) { p.character = to; st.people++; } });
  const dups = P.people.filter(p => p.type === 'cast' && normChar(p.character) === to);
  if (dups.length > 1) {                                           // merging into a character that already exists
    const keep = dups.find(p => p.name) || dups[0]; st.merged = true;
    dups.filter(p => p !== keep).forEach(o => { Object.keys(o).forEach(k => { if (!keep[k] && o[k] && k !== 'id') keep[k] = o[k]; }); keep.docs = { ...(o.docs || {}), ...(keep.docs || {}) }; P.people = P.people.filter(p => p !== o); });
  }
  P.casting.roles.forEach(r => { if (normChar(r.name) === from) { r.name = to; st.roles++; } });
  const roles = P.casting.roles.filter(r => normChar(r.name) === to);
  if (roles.length > 1) { const keep = roles[0]; roles.slice(1).forEach(o => { keep.candidates.push(...o.candidates); if (!keep.castId && o.castId) keep.castId = o.castId; keep.desc = keep.desc || o.desc; keep.age = keep.age || o.age; P.casting.roles = P.casting.roles.filter(r => r !== o); }); }
  const fix = arr => [...new Set((arr || []).map(c => normChar(c) === from ? to : c))];
  P.wardrobe.concat(P.props).forEach(x => { let hit = false;
    if ((x.characters || []).some(c => normChar(c) === from)) { x.characters = fix(x.characters); hit = true; }
    if (x.usage) Object.keys(x.usage).forEach(id => { if (x.usage[id].some(c => normChar(c) === from)) { x.usage[id] = fix(x.usage[id]); hit = true; } });
    if (hit) st.items++; });
  P.tags.forEach(t => {
    if (t.cat === 'cast' && normChar(t.text) === from) { t.text = to; st.tags++; }
    if (Array.isArray(t.who) && t.who.some(c => normChar(c) === from)) t.who = fix(t.who);
  });
  const seen = new Set(); P.tags = P.tags.filter(t => { if (t.cat !== 'cast') return true; const k = t.sceneId + '|' + normChar(t.text); if (seen.has(k)) return false; seen.add(k); return true; });
  P.stage.plans.forEach(pl => pl.items.forEach(it => { if (it.kind === 'actor' && normChar(it.label) === from) it.label = to; }));
  Store.touch(); return st;
}
function openRenameCharacter(P, preset, done) {
  const names = allCharNames(P).sort(); if (!names.length) return toast('There are no characters yet.', true);
  const sel = h('select', { class: 'inp' }, names.map(n => h('option', { selected: normChar(n) === normChar(preset) }, n)));
  const inp = h('input', { class: 'inp', list: 'dl-rn', placeholder: 'New name — or an existing character to merge into', value: '' });
  const mentions = h('input', { type: 'checkbox', checked: true });
  const info = h('div', { class: 'small muted', style: { marginTop: '10px' } });
  const upd = () => { const f = normChar(sel.value), t = normChar(inp.value);
    const cues = P.blocks.filter(b => b.type === 'character' && normChar(b.text) === f).length, scenesN = getScenes(P).filter(s => s.chars.has(f)).length;
    info.textContent = `${cues} dialogue cue${cues === 1 ? '' : 's'} in ${scenesN} scene${scenesN === 1 ? '' : 's'} will change` + (t && t !== f && names.map(normChar).includes(t) ? ` — and “${f}” will be MERGED into the existing “${t}”.` : '.'); };
  sel.addEventListener('change', upd); inp.addEventListener('input', upd); upd();
  modal({ title: 'Rename or merge a character', body: h('div', {},
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'Changes the name everywhere at once: script cues, the cast profile, casting role, wardrobe and prop assignments, breakdown cast tags and stage blocking. A draft snapshot is saved first so you can go back.'),
    h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Character'), sel), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'New name'), inp), h('datalist', { id: 'dl-rn' }, names.map(n => h('option', { value: n }))),
    h('label', { class: 'row small' }, mentions, 'Also change the name where it appears inside action and dialogue text'), info),
    buttons: [{ label: 'Cancel' }, { label: 'Rename', primary: true, onClick: () => {
      const f = sel.value, t = inp.value.trim(); if (!t) { toast('Type the new name.', true); return false; }
      takeSnapshot(P, `Before renaming ${normChar(f)} → ${t.toUpperCase()}`, true);
      const r = renameCharacter(P, f, t, { mentions: mentions.checked });
      toast(`${r.merged ? 'Merged' : 'Renamed'}: ${r.cues} cue${r.cues === 1 ? '' : 's'}${r.mentions ? `, ${r.mentions} mention${r.mentions === 1 ? '' : 's'}` : ''}${r.items ? `, ${r.items} wardrobe/prop link${r.items === 1 ? '' : 's'}` : ''}. A snapshot was saved in Drafts.`);
      if (done) done(); else Router.refresh(); } }] });
}

/* ---------- budget from rates ---------- */
function buildBudgetFromRates(P) {
  const scenes = getScenes(P), num = v => +String(v || '').replace(/[^0-9.]/g, '') || 0, n = { cast: 0, crew: 0, loc: 0 };
  const dayCount = pred => P.days.filter(d => d.sceneIds.some(id => { const s = scenes.find(x => x.id === id); return s && pred(s); })).length;
  const qtyFor = (unit, days) => unit === 'Week' ? Math.ceil(days / 5) : unit === 'Flat' ? 1 : unit === 'Hour' ? days * 10 : days;
  const upsert = (key, cat, desc, qty, unit, rate) => { let l = P.budget.find(x => x.auto === key); if (!l) { l = { id: uid(), auto: key }; P.budget.push(l); } Object.assign(l, { cat, desc, qty, unit, rate }); };
  P.people.forEach(p => {
    const rate = num(p.rate); if (!rate) return; const unit = p.rateUnit || 'Day';
    if (p.type === 'cast') { const ch = normChar(p.character), days = ch ? dayCount(s => sceneCast(P, s).has(ch)) : 0; if (!days) return; upsert('cast:' + p.id, 'Cast', `${p.name || p.character} (${p.character})`, qtyFor(unit, days), unit === 'Day' ? 'Day' : unit, rate); n.cast++; }
    else if (P.days.length) { upsert('crew:' + p.id, 'Crew', `${p.name}${p.role ? ' — ' + p.role : ''}`, qtyFor(unit, P.days.length), unit, rate); n.crew++; }
  });
  P.locations.forEach(l => { const rate = num(l.cost); if (!rate || !l.name) return;
    const days = dayCount(s => { const m = P.sceneMeta[s.id]; return (m && m.locationId === l.id) || (!(m && m.locationId) && s.location && s.location.toUpperCase().includes(l.name.toUpperCase())); }); if (!days) return;
    upsert('loc:' + l.id, 'Locations & travel', `${l.name} — location fee`, days, 'Day', rate); n.loc++; });
  Store.touch(); return n;
}

/* ---------- page locking ---------- */
function lockPages(P) { P.settings.pageLock = false; const pg = paginate(P); P.blocks.forEach((b, i) => { b.lockPg = pg.blockPage[i] + 1; }); P.settings.pageLock = true; Store.touch(); }
function unlockPages(P) { P.blocks.forEach(b => { delete b.lockPg; }); P.settings.pageLock = false; Store.touch(); }

/* ---------- word-level redline between two texts ---------- */
function wordDiff(a, b) {
  const A = a.split(/(\s+)/).filter(x => x !== ''), B = b.split(/(\s+)/).filter(x => x !== ''), n = A.length, m = B.length;
  if (n * m > 4e6) return [{ t: '=', v: b }];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0; const push = (t, v) => { const l = out[out.length - 1]; if (l && l.t === t) l.v += v; else out.push({ t, v }); };
  while (i < n && j < m) { if (A[i] === B[j]) { push('=', A[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { push('-', A[i]); i++; } else { push('+', B[j]); j++; } }
  while (i < n) push('-', A[i++]); while (j < m) push('+', B[j++]);
  return out;
}

/* ---------- shooting-time estimates and company moves ---------- */
const sceneEst = (P, s) => { const m = P.sceneMeta[s.id]; return (m && +m.est) ? +m.est : Math.round(s.eighths / 8 * (+P.settings.minsPerPage || 60)); };
const fmtMin = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
function dayPlan(P, d, scenes) {
  const ls = d.sceneIds.map(id => scenes.find(s => s.id === id)).filter(Boolean), mins = sum(ls, s => sceneEst(P, s));
  let moves = 0; ls.forEach((s, i) => { if (i && (locName(P, s) || '').toUpperCase() !== (locName(P, ls[i - 1]) || '').toUpperCase()) moves++; });
  const cap = (+P.settings.dayHours || 10) * 60; return { ls, mins, moves, cap, over: mins + moves * 30 > cap };
}

/* ---------- script sides for a shoot day ---------- */
function printSides(P, day) {
  const scenes = getScenes(P), ls = day.sceneIds.map(id => scenes.find(s => s.id === id)).filter(Boolean);
  if (!ls.length) return toast('Schedule some scenes on this day first.', true);
  const blocks = []; ls.forEach(s => { blocks.push({ ...P.blocks[s.idx], num: String(s.num), om: false, lockPg: undefined }); for (let i = s.idx + 1; i < s.end; i++) blocks.push({ ...P.blocks[i], lockPg: undefined }); });
  const n = P.days.indexOf(day) + 1, sp = { ...P, blocks, settings: { ...P.settings, sceneNumLock: true, sceneNumbers: true, pageLock: false } };
  printNode(scriptPrintNode(sp, { noTitle: true, header: `SIDES — ${P.title} — Day ${n}${day.date ? ' — ' + fmtDateShort(day.date) : ''} — Scenes ${ls.map(s => s.num).join(', ')}` }));
}

/* ---------- reading a script from a Highland / zip archive (offline, via the browser's built-in inflate) ---------- */
async function readZip(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open zip files.');
  const dv = new DataView(buf), u8 = new Uint8Array(buf); let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('That is not a valid zip archive.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const comp = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    files.push({ name, usize, async read() {
      const h2 = lo, l2 = dv.getUint16(h2 + 26, true) + dv.getUint16(h2 + 28, true) + 30, data = u8.subarray(h2 + l2, h2 + l2 + csize);
      if (comp === 0) return data;
      const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(data); w.close();
      return new Uint8Array(await new Response(ds.readable).arrayBuffer());
    } });
  }
  return files;
}
async function readScriptFile(f) {
  if (!/\.(highland|zip)$/i.test(f.name)) return readText(f);
  const files = await readZip(await f.arrayBuffer());
  const cand = files.filter(x => /\.(fountain|md|markdown|txt|spmd)$/i.test(x.name) && !/__MACOSX|(^|\/)\./.test(x.name)).sort((a, b) => b.usize - a.usize)[0];
  if (!cand) throw new Error('No script text was found inside that archive.');
  return new TextDecoder().decode(await cand.read());
}

/* ---------- two-column AV scripts <-> CSV ---------- */
function parseCSV(t) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function avFromCSV(text) {
  const rows = parseCSV(text); if (!rows.length) return [];
  const head = rows[0].map(x => x.trim().toLowerCase()), vi = head.indexOf('video'), ai = head.indexOf('audio'), si = head.findIndex(x => /segment|scene|section/.test(x));
  const has = vi >= 0 || ai >= 0, v = has ? vi : 0, a = has ? ai : 1, data = has ? rows.slice(1) : rows, blocks = []; let seg = null;
  data.forEach(r => {
    if (si >= 0 && r[si] && r[si].trim() !== seg) { seg = r[si].trim(); blocks.push({ id: uid(), type: 'scene', text: seg.toUpperCase() }); }
    if (v >= 0 && r[v] && r[v].trim()) blocks.push({ id: uid(), type: 'video', text: r[v].trim() });
    if (a >= 0 && r[a] && r[a].trim()) blocks.push({ id: uid(), type: 'audio', text: r[a].trim() });
  });
  return blocks;
}
function toAVCSV(P) {
  const rows = [['Segment', 'Video', 'Audio']]; let seg = '';
  for (let i = 0; i < P.blocks.length; i++) {
    const b = P.blocks[i];
    if (b.type === 'scene') { seg = stripRich(b.text); continue; }
    if (AV_L.has(b.type)) { let aud = ''; if (P.blocks[i + 1] && AV_R.has(P.blocks[i + 1].type)) { aud = P.blocks[i + 1].text; i++; } rows.push([seg, (b.type === 'super' ? '[ON SCREEN] ' : '') + b.text, aud]); }
    else rows.push([seg, '', (b.type === 'sfx' ? '[MUSIC/SFX] ' : '') + b.text]);
  }
  return toCSV(rows);
}
