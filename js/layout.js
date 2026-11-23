'use strict';
/* ===================================================================
   Layout engine — rich text, exact word-wrap, real pagination,
   dual dialogue, (MORE)/(CONT'D), revision pages, print output.
   All measurements are in monospaced character cells (Courier, 10 cpi,
   6 lines per inch) so the editor's page counts equal the printed ones.
   =================================================================== */
const LAYOUT = {
  screenplay: {
    scene: { i: 0, w: 60, b: 1, caps: 1 }, action: { i: 0, w: 60 }, character: { i: 22, w: 38, caps: 1 }, paren: { i: 16, w: 22 },
    dialogue: { i: 10, w: 35 }, transition: { i: 0, w: 60, align: 'right', caps: 1 }, shot: { i: 0, w: 60, b: 1, caps: 1 },
    act: { i: 0, w: 60, align: 'center', b: 1, u: 1, caps: 1 }, sceneTag: { i: 0, w: 60, align: 'center', b: 1, u: 1, caps: 1 },
  },
  stage: {
    act: { i: 0, w: 60, align: 'center', b: 1, u: 1, caps: 1 }, scene: { i: 0, w: 60, align: 'center', b: 1, caps: 1 }, setting: { i: 0, w: 60, it: 1 },
    character: { i: 0, w: 60, align: 'center', b: 1, caps: 1 }, paren: { i: 0, w: 60, align: 'center', it: 1 }, dialogue: { i: 5, w: 50 },
    direction: { i: 14, w: 46, it: 1 }, cue: { i: 0, w: 60, b: 1, caps: 1 },
  },
  photo: { scene: { i: 0, w: 60, b: 1 }, action: { i: 0, w: 60 } },
  av: {   // two columns, 28 characters each: video on the left, audio on the right
    scene: { i: 0, w: 60, b: 1, caps: 1 }, video: { i: 0, w: 28 }, super: { i: 0, w: 28, b: 1, caps: 1 }, audio: { i: 0, w: 28 }, sfx: { i: 0, w: 28, it: 1 },
  },
  podcast: {
    scene: { i: 0, w: 60, b: 1, caps: 1 }, character: { i: 16, w: 44, b: 1, caps: 1 },
    paren: { i: 16, w: 34, it: 1 }, dialogue: { i: 10, w: 48 },
    sfx: { i: 0, w: 60, b: 1, u: 1 }, music: { i: 0, w: 60, it: 1 },
    clip: { i: 4, w: 56, b: 1 }, sponsor: { i: 4, w: 56, it: 1 },
  },
};
const AV_L = new Set(['video', 'super']), AV_R = new Set(['audio', 'sfx']);
const sceneLetter = k => { let s = ''; while (k > 0) { s = String.fromCharCode(65 + ((k - 1) % 26)) + s; k = Math.floor((k - 1) / 26); } return s; };
const LPP = { screenplay: 54, stage: 54, av: 54, photo: 54, podcast: 54 };
const layoutOf = (mode, type) => { const m = LAYOUT[mode] || LAYOUT.screenplay; return m[type] || m[DEFAULT_TYPE[mode] || 'action']; };
const isDual = b => b.type === 'character' && /\^\s*$/.test(b.text);
const cueText = b => b.text.replace(/\s*\^\s*$/, '');

/* ---------- rich text: **bold**  *italic*  _underline_  ---------- */
function parseRich(src) {
  const chars = [], flags = [];
  const push = (s, f) => { for (const ch of s) { chars.push(ch); flags.push(f); } };
  const walk = (s, f) => {
    const re = /(?<![\w\\])(\*\*\*|\*\*|\*|_)(?=\S)([\s\S]+?)(?<=\S)\1(?!\w)/g; let last = 0, m;
    while ((m = re.exec(s))) {
      push(s.slice(last, m.index), f);
      walk(m[2], f | (m[1] === '***' ? 3 : m[1] === '**' ? 1 : m[1] === '*' ? 2 : 4));
      last = m.index + m[0].length;
    }
    push(s.slice(last), f);
  };
  walk(src || '', 0);
  return { chars, flags };
}
function runsHTML(chars, flags) {
  let out = '', i = 0;
  while (i < chars.length) {
    let j = i; const f = flags[i]; while (j < chars.length && flags[j] === f) j++;
    let s = esc(chars.slice(i, j).join(''));
    if (f & 1) s = `<b>${s}</b>`; if (f & 2) s = `<i>${s}</i>`; if (f & 4) s = `<u>${s}</u>`;
    out += s; i = j;
  }
  return out;
}
const richHTML = t => { const r = parseRich(t); return runsHTML(r.chars, r.flags); };
const stripRich = t => parseRich(t).chars.join('');
function richRuns(t) {
  const { chars, flags } = parseRich(t), out = []; let i = 0;
  while (i < chars.length) { let j = i; while (j < chars.length && flags[j] === flags[i]) j++; out.push({ t: chars.slice(i, j).join(''), f: flags[i] }); i = j; }
  return out;
}

/* ---------- exact word wrap (monospace) ---------- */
function wrapRich(text, width, caps) {
  let { chars, flags } = parseRich(text);
  if (caps) chars = chars.map(c => c.toUpperCase());
  const lines = [], segs = []; let start = 0;
  for (let i = 0; i <= chars.length; i++) if (i === chars.length || chars[i] === '\n') { segs.push([start, i]); start = i + 1; }
  for (const [s, e] of segs) {
    if (s === e) { lines.push({ chars: [], flags: [] }); continue; }
    let a = s;
    while (a < e) {
      let b = Math.min(e, a + width);
      if (b < e) { let k = b; while (k > a && chars[k] !== ' ') k--; if (k > a) b = k; }
      lines.push({ chars: chars.slice(a, b), flags: flags.slice(a, b) });
      a = b; while (a < e && chars[a] === ' ') a++;
    }
  }
  return lines.length ? lines : [{ chars: [], flags: [] }];
}
function lineCount(b, mode, mc) {
  const s = layoutOf(mode, b.type); let n = wrapRich(b.type === 'character' ? cueText(b) : b.text, s.w, s.caps).length;
  if (mc && (b.type === 'dialogue' || b.type === 'paren')) n = 2 * n - 1;     // multi-cam: dialogue is double-spaced
  return n;
}
/* lines a two-column AV scene takes: each video/audio pair is as tall as the taller side */
function avLines(p, s) {
  const bl = p.blocks; let n = 0;
  for (let i = s.idx + 1; i < s.end; i++) {
    const b = bl[i];
    if (AV_L.has(b.type)) { let a = lineCount(b, 'av'); if (i + 1 < s.end && AV_R.has(bl[i + 1].type)) { a = Math.max(a, lineCount(bl[i + 1], 'av')); i++; } n += 1 + a; }
    else n += 1 + lineCount(b, 'av');
  }
  return n;
}

/* ---------- pagination ---------- */
function paginate(p) {
  const PL = lppOf(p), bl = p.blocks, stage = p.mode === 'stage';
  const pages = [], blockPage = new Array(bl.length).fill(0), seen = [];
  /* omitted scenes keep their number and print as OMITTED; their text is skipped */
  const skip = new Set(); { let om = false; bl.forEach((b, i) => { if (b.type === 'scene' || b.type === 'act') om = b.type === 'scene' && !!b.om; else if (om) skip.add(i); }); }
  /* locked pages: every block belongs to the page it had when pages were locked; new text inherits from the block before it */
  const lockOn = !!p.settings.pageLock, eff = []; if (lockOn) { let c = 1; bl.forEach((b, i) => { if (b.lockPg) c = b.lockPg; eff[i] = c; }); }
  let cur = null, used = 0, sceneNo = 0, lastSpeaker = '', lastCue = '', actC = 0, scC = 0;
  const showNums = p.mode === 'screenplay' && (p.settings.sceneNumbers || p.settings.sceneNumLock || p.settings.multicam);
  const newPage = () => { cur = { lines: [], revs: [] }; pages.push(cur); used = 0; };
  newPage();
  const cache = new Map();
  const mc = !!p.settings.multicam && p.mode === 'screenplay', DBL = new Set(['dialogue', 'paren']), blankLn = () => ({ chars: [], flags: [] });
  const linesOf = (i, text) => {
    const b = bl[i], s = layoutOf(p.mode, b.type);
    let ls = wrapRich(text !== undefined ? text : (b.type === 'character' ? cueText(b) : b.text), s.w, s.caps || (mc && b.type === 'action'));
    if (mc && DBL.has(b.type)) ls = ls.flatMap((l, k) => k ? [blankLn(), l] : [l]);   // double-spaced dialogue
    return ls;
  };
  const L = i => { if (!bl[i]) return 0; if (!cache.has(i)) cache.set(i, linesOf(i)); return cache.get(i).length; };
  const blank = n => { for (let k = 0; k < n; k++) { cur.lines.push({ kind: 'blank' }); used++; } };
  const mark = bi => { if (!seen[bi]) { seen[bi] = true; blockPage[bi] = pages.length - 1; } if (bl[bi].rev) cur.revs.push(bl[bi].rev); };
  const placeLines = (i, ls, from, to, extra) => {
    for (let k = from; k < to; k++) { cur.lines.push({ kind: 'line', bi: i, type: bl[i].type, rev: bl[i].rev || '', ...ls[k], first: k === 0, ...(k === 0 && extra ? extra : {}) }); used++; }
    mark(i);
  };
  const chainNeed = (i, n) => {
    const t = bl[i].type, nx = bl[i + 1], nn = bl[i + 2];
    if (t === 'scene' || t === 'act') return n + Math.min(2, L(i + 1));
    if (t === 'character') {
      if (nx && nx.type === 'paren') return n + L(i + 1) + (nn && nn.type === 'dialogue' ? Math.min(2, L(i + 2)) : 0);
      if (nx && nx.type === 'dialogue') return n + Math.min(2, L(i + 1));
      return n;
    }
    if (t === 'paren') return n + (nx && nx.type === 'dialogue' ? Math.min(2, L(i + 1)) : 0);
    return Math.min(n, 2);
  };
  function processBlock(i) {
    const b = bl[i], type = b.type; let extra = {}, ls;
    if (type === 'act') { actC++; scC = 0; if (cur.lines.length) newPage(); }
    if (type === 'character') {
      const cue = cueText(b), norm = normChar(cue); let text = cue;
      if (p.settings.autoContd !== false && lastSpeaker === norm && bl[i - 1] && bl[i - 1].type !== 'scene' && bl[i - 1].type !== 'act' && !/CONT'D/i.test(cue)) text = cue + " (CONT'D)";
      lastSpeaker = norm; lastCue = cue; ls = linesOf(i, text);
    } else if (type === 'scene' && b.om) ls = wrapRich('OMITTED', layoutOf(p.mode, 'scene').w, true);
    else ls = linesOf(i);
    if (type === 'scene') {
      sceneNo++; scC++; lastSpeaker = '';
      const lbl = (p.settings.sceneNumLock && b.num) ? b.num : mc ? sceneLetter(scC) : String(sceneNo);
      if (mc && !b.om) { const tag = 'SCENE ' + lbl; ls = [{ chars: [...tag], flags: [...tag].map(() => 0), type: 'sceneTag' }, ...ls]; }
      else if (showNums) extra.sn = lbl;
    }
    let gap = used === 0 ? 0 : gapOf(type);
    const need = chainNeed(i, ls.length);
    if (used > 0 && used + gap + need > PL) { newPage(); gap = 0; }
    if (used + gap + ls.length <= PL) { blank(gap); placeLines(i, ls, 0, ls.length, extra); return; }
    const splittable = type === 'action' || type === 'dialogue' || type === 'setting' || type === 'direction';
    if (!splittable) { if (used > 0) { newPage(); gap = 0; } placeLines(i, ls, 0, ls.length, extra); return; }
    blank(gap); let from = 0;
    while (from < ls.length) {
      const room = PL - used;
      if (ls.length - from <= room) { placeLines(i, ls, from, ls.length, from === 0 ? extra : null); break; }
      let k = room - (type === 'dialogue' ? 1 : 0);
      if (ls.length - from - k < 2) k = ls.length - from - 2;
      if (k < 2) { if (used > 0) { newPage(); continue; } k = Math.max(1, room); }
      placeLines(i, ls, from, from + k, from === 0 ? extra : null);
      if (type === 'dialogue') { cur.lines.push({ kind: 'more' }); used++; }
      newPage();
      if (type === 'dialogue' && lastCue) { cur.lines.push({ kind: 'contd', text: lastCue + " (CONT'D)" }); used++; }
      from += k;
    }
  }
  function placeDual(left, right) {
    const col = range => {
      const out = [];
      range.forEach(j => {
        const b = bl[j], s = layoutOf(p.mode, b.type), w = b.type === 'paren' ? 20 : 28, ind = b.type === 'paren' ? 4 : 0;
        const dbl = mc && DBL.has(b.type);
        wrapRich(b.type === 'character' ? cueText(b) : b.text, w, s.caps).forEach((ln, k) => { if (dbl && k) out.push({ ...blankLn(), type: b.type, ind, w, bi: j }); out.push({ ...ln, type: b.type, ind, w, bi: j }); });
      });
      return out;
    };
    const A = col(left), B = col(right), hgt = Math.max(A.length, B.length);
    let gap = used === 0 ? 0 : 1;
    if (used > 0 && used + gap + hgt > PL) { newPage(); gap = 0; }
    blank(gap); cur.lines.push({ kind: 'dual', left: A, right: B, h: hgt }); used += hgt;
    [...left, ...right].forEach(mark); lastSpeaker = '';
  }
  /* two-column AV: a video block and the audio block after it share one row */
  function placeAV(li, ri) {
    const mkc = i => i < 0 ? [] : wrapRich(bl[i].text, 28, layoutOf('av', bl[i].type).caps).map(ln => ({ ...ln, type: bl[i].type, ind: 0, w: 28, bi: i }));
    let A = mkc(li), B = mkc(ri); const ids = [li, ri].filter(x => x >= 0);
    let gap = used === 0 ? 0 : 1; if (used > 0 && used + gap + Math.max(A.length, B.length) > PL) { newPage(); gap = 0; }
    blank(gap);
    while (A.length || B.length) {
      const room = Math.max(1, PL - used), n = Math.min(Math.max(A.length, B.length), room), ca = A.slice(0, n), cb = B.slice(0, n); A = A.slice(n); B = B.slice(n);
      const hh = Math.max(ca.length, cb.length); cur.lines.push({ kind: 'dual', left: ca, right: cb, h: hh, av: true }); used += hh; ids.forEach(mark);
      if (A.length || B.length) newPage();
    }
  }
  // build units (dual-dialogue pairs are placed together)
  const range = (a, b) => { const r = []; for (let k = a; k < b; k++) r.push(k); return r; };
  let prevI = null;
  for (let i = 0; i < bl.length; i++) {
    if (skip.has(i)) { blockPage[i] = pages.length - 1; continue; }
    if (lockOn && prevI !== null) { if (cur.lines.length) cur.lock = eff[prevI]; if (cur.lines.length && eff[i] !== eff[prevI]) newPage(); }
    prevI = i;
    if (p.mode === 'av' && (AV_L.has(bl[i].type) || AV_R.has(bl[i].type))) {
      let li = -1, ri = -1;
      if (AV_L.has(bl[i].type)) { li = i; if (bl[i + 1] && AV_R.has(bl[i + 1].type) && !skip.has(i + 1)) { ri = i + 1; i++; } } else ri = i;
      placeAV(li, ri); continue;
    }
    if (bl[i].type === 'character' && !isDual(bl[i])) {
      let j = i + 1; while (j < bl.length && (bl[j].type === 'paren' || bl[j].type === 'dialogue')) j++;
      if (j < bl.length && isDual(bl[j])) {
        let k = j + 1; while (k < bl.length && (bl[k].type === 'paren' || bl[k].type === 'dialogue')) k++;
        placeDual(range(i, j), range(j, k)); i = k - 1; continue;
      }
    }
    processBlock(i);
  }
  if (lockOn && prevI !== null) cur.lock = eff[prevI];
  if (pages.length > 1 && !pages[pages.length - 1].lines.length) pages.pop();
  /* page labels: 1, 2, 3 … or, when locked, 12, 12A, 12B … */
  const labels = [], seenLock = {};
  pages.forEach((pg, k) => { if (!lockOn) { labels[k] = String(k + 1); return; } const L = pg.lock || 1, n = seenLock[L] || 0; seenLock[L] = n + 1; labels[k] = n ? String(L) + (n <= 26 ? String.fromCharCode(64 + n) : n) : String(L); });
  return { pages, blockPage, count: pages.length, labels };
}

/* ---------- print output ---------- */
function lineStyleFor(p, type, rec) {
  const s = layoutOf(p.mode, type), st = {};
  if (s.align) { st.textAlign = s.align; st.width = s.w + 'ch'; } else { st.marginLeft = s.i + 'ch'; st.width = s.w + 'ch'; }
  if (s.b) st.fontWeight = 'bold'; if (s.it) st.fontStyle = 'italic'; if (s.u) st.textDecoration = 'underline';
  if (p.settings.multicam && type === 'scene') st.textDecoration = 'underline';
  return st;
}
function scriptPrintNode(p, { revisionColors = true, revisedOnly = false, watermark = '', noTitle = false, header = '' } = {}) {
  const m = p.meta, pg = paginate(p);
  const root = h('div', { class: 'print-script ' + p.mode });
  if (!revisedOnly && !noTitle) root.append(h('section', { class: 'sp tp' },
    h('div', { class: 'tp-body' }, h('h1', {}, p.title || 'Untitled'), p.series ? h('div', { style: { marginBottom: '10pt' } }, `${p.series.name} — Season ${p.series.season}, Episode ${p.series.ep}`) : null, h('div', {}, m.credit || ''), h('div', { style: { marginTop: '12pt' } }, m.author || ''),
      m.source ? h('div', { style: { marginTop: '24pt' } }, m.source) : null),
    h('div', { class: 'tpc' }, [m.contact, m.draft ? 'Draft: ' + m.draft : '', m.copyright].filter(Boolean).join('\n'))));
  if (p.mode === 'stage' && !revisedOnly && !noTitle) {
    const first = new Map(); p.blocks.forEach(b => { if (b.type === 'character') { const c = normChar(b.text); if (c && !first.has(c)) first.set(c, 0); } });
    const roleOf = c => (p.casting.roles || []).find(r => normChar(r.name) === c);
    const names = [...new Set([...(p.casting.roles || []).map(r => normChar(r.name)).filter(Boolean), ...first.keys()])];
    if (names.length || m.setting || m.time) root.append(h('section', { class: 'sp fm' },
      h('div', { class: 'fmh' }, 'CHARACTERS'), ...names.map(c => { const r = roleOf(c), d = r ? [r.age, r.desc].filter(Boolean).join(', ') : ''; return h('div', { class: 'fml' }, h('b', {}, c), d ? ' — ' + d : ''); }),
      m.setting ? h('div', { class: 'fmh', style: { marginTop: '28pt' } }, 'SETTING') : null, m.setting ? h('div', { class: 'fml' }, m.setting) : null,
      m.time ? h('div', { class: 'fmh', style: { marginTop: '18pt' } }, 'TIME') : null, m.time ? h('div', { class: 'fml' }, m.time) : null,
      m.runtime ? h('div', { class: 'fmh', style: { marginTop: '18pt' } }, 'RUNNING TIME') : null, m.runtime ? h('div', { class: 'fml' }, m.runtime) : null));
  }
  const revIdx = id => p.revisions.findIndex(r => r.id === id);
  pg.pages.forEach((page, k) => {
    if (revisedOnly && !page.revs.length && !/[A-Z]$/.test(pg.labels[k])) return;
    let rev = null; page.revs.forEach(id => { const ix = revIdx(id); if (ix >= 0 && (!rev || ix > revIdx(rev.id))) rev = p.revisions[ix]; });
    const sec = h('section', { class: 'sp', style: rev && revisionColors ? { background: rev.color } : {} });
    if (rev) sec.append(h('div', { class: 'revl' }, `${rev.name.toUpperCase()} ${rev.date || ''}`));
    if (k > 0 || pg.labels[k] !== '1') sec.append(h('div', { class: 'pgn' }, pg.labels[k] + '.'));
    if (watermark) sec.append(h('div', { class: 'wm' }, watermark), h('div', { class: 'wmf' }, 'Confidential — ' + watermark));
    if (header) sec.append(h('div', { class: 'sdh' }, header));
    if (p.mode === 'av') sec.append(h('div', { class: 'avh' }, h('span', {}, 'VIDEO'), h('span', {}, 'AUDIO')));
    page.lines.forEach(rec => {
      if (rec.kind === 'blank') sec.append(h('div', { class: 'ln' }));
      else if (rec.kind === 'more') sec.append(h('div', { class: 'ln', style: { marginLeft: layoutOf(p.mode, 'character').i + 'ch' } }, '(MORE)'));
      else if (rec.kind === 'contd') sec.append(h('div', { class: 'ln', style: lineStyleFor(p, 'character') }, rec.text.toUpperCase()));
      else if (rec.kind === 'dual') {
        const colEl = list => h('div', { class: 'dcol' }, list.map(ln => h('div', { class: 'ln', style: { marginLeft: ln.ind + 'ch', textAlign: ln.type === 'character' ? 'center' : 'left', width: ln.w + 'ch', fontWeight: layoutOf(p.mode, ln.type).b ? 'bold' : 'normal', fontStyle: layoutOf(p.mode, ln.type).it ? 'italic' : 'normal' }, html: runsHTML(ln.chars, ln.flags) || '&nbsp;' })));
        sec.append(h('div', { class: 'dual' }, colEl(rec.left), colEl(rec.right)));
      } else {
        const el = h('div', { class: 'ln', style: lineStyleFor(p, rec.type), html: (runsHTML(rec.chars, rec.flags) || '') + (rec.sn ? `<span class="sn l">${esc(rec.sn)}</span><span class="sn r">${esc(rec.sn)}</span>` : '') + (rec.rev && revisionColors ? '<span class="rv">*</span>' : '') });
        if (!rec.chars.length && !rec.sn && !rec.rev) el.innerHTML = '&nbsp;';
        sec.append(el);
      }
    });
    root.append(sec);
  });
  return root;
}
