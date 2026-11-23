'use strict';
/* ===================================================================
   PDF script import
   1. Reads every text fragment with its page position (pdf.js).
   2. Rebuilds lines, strips page furniture (page numbers, CONTINUED,
      running headers, scene-number margins, revision asterisks).
   3. Learns this script's indentation (character cue / dialogue /
      parenthetical) and classifies each line from layout + content.
   4. Joins wrapped lines, merges dialogue split by (MORE)/(CONT'D),
      rebuilds dual dialogue, reads the title page.
   5. Shows a review step before anything touches your project.
   The PDF never leaves your computer. The reader library (pdf.js) is
   loaded from js/vendor if present, otherwise once from a CDN.
   =================================================================== */
const PDFJS_VER = '3.11.174';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/`;
let _pdfLib = null;
function loadScriptTag(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error('load failed: ' + src)); }; document.head.append(s); });
}
async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  if (!_pdfLib) _pdfLib = (async () => {
    let base = null;
    try { await loadScriptTag('js/vendor/pdf.min.js'); base = 'js/vendor/'; }
    catch (e) { try { await loadScriptTag(PDFJS_CDN + 'pdf.min.js'); base = PDFJS_CDN; } catch (e2) { throw new Error('The PDF reader could not be loaded. Connect to the internet once, or copy pdf.min.js and pdf.worker.min.js (pdf.js 3.11) into the js/vendor folder for fully offline use.'); } }
    try { const r = await fetch(base + 'pdf.worker.min.js'); if (!r.ok) throw 0; window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' })); }
    catch (e) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; }
    return window.pdfjsLib;
  })();
  try { return await _pdfLib; } catch (e) { _pdfLib = null; throw e; }
}

/* ---------- step 1: positioned text -> rows of segments ---------- */
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function buildRows(pg) {
  const its = [];
  pg.items.forEach(i => {
    let s = i.s; if (!s || !s.trim()) return;
    const cw = i.w / Math.max(1, s.length), lead = s.length - s.trimStart().length;
    s = s.trim(); its.push({ s, x: i.x + lead * cw, w: Math.max(1, i.w - (lead + (i.s.length - i.s.trimEnd().length - 0)) * cw + 0), y: i.y, h: i.h || 12, cw });
  });
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of its) {
    const r = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2.5, it.h * 0.4));
    if (r) r.items.push(it); else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  rows.forEach(r => {
    r.items.sort((a, b) => a.x - b.x); const segs = []; let cur = null;
    for (const it of r.items) {
      if (cur && it.x - cur.x1 <= Math.max(16, it.cw * 2.4)) { const gap = it.x - cur.x1; cur.t += (gap > it.cw * 0.45 ? ' ' : '') + it.s; cur.x1 = it.x + it.w; }
      else { cur = { t: it.s, x0: it.x, x1: it.x + it.w }; segs.push(cur); }
    }
    segs.forEach(s => s.t = s.t.normalize('NFKC').replace(/\s+/g, ' ').trim());
    r.segs = segs.filter(s => s.t); r.page = pg.n; r.pw = pg.w; r.ph = pg.h; r.h = median(r.items.map(i => i.h)); delete r.items;
  });
  return rows.filter(r => r.segs.length);
}
async function extractPdf(buf, progress) {
  const lib = await loadPdfJs(); const pdf = await lib.getDocument({ data: buf }).promise; const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    const pg = { n, w: vp.width, h: vp.height, items: tc.items.map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height })) };
    pg.rows = buildRows(pg); delete pg.items; pages.push(pg); progress && progress(n, pdf.numPages);
  }
  return pages;
}

/* ---------- step 2-4: layout-aware parsing ---------- */
const CONTD_CUE = /^[A-Z][A-Z0-9 .'’\-]{0,38}\s*\((?:[Cc][Oo][Nn][Tt][’']?[Dd]\.?|[Cc][Oo][Nn][Tt][Ii][Nn][Uu][Ee][Dd])\)$/;
const SCENE_HEAD = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
const TRANS_RE = /^(?:[A-Z0-9 .'\-]+ TO:|[A-Z ]+ TO BLACK\.?|FADE IN:|FADE OUT\.?|FADE TO:?|CUT TO BLACK\.?|SMASH CUT:?|DISSOLVE TO:?|THE END\.?|BLACKOUT\.?)$/;
const isUpperText = t => { const l = t.replace(/[^A-Za-z]/g, ''); return l.length > 0 && t === t.toUpperCase(); };
const rowText = r => r.segs.map(s => s.t).join(' ').trim();
const stripSceneNum = t => t.replace(/^(\d{1,3}[A-Z]{0,2})\s+(?=(INT|EXT|EST|I\/E))/i, '').replace(/\s+(\d{1,3}[A-Z]{0,2})$/, '');

function parsePdfRows(srcPages, opts = {}) {
  const o = Object.assign({ mode: 'screenplay', keepBreaks: false, keepNums: true, dropTitle: true }, opts);
  const report = { pages: srcPages.length, warnings: [], dual: 0, unclassified: 0, sceneNums: 0 };
  const pages = srcPages.map(pg => ({ ...pg, rows: pg.rows.map(r => ({ ...r, segs: r.segs.map(s => ({ ...s })) })) }));
  const total = sum(pages, p => sum(p.rows, r => rowText(r).length));
  if (total < 200) { report.scanned = true; report.warnings.push('This PDF has almost no selectable text — it is probably a scan. Run it through OCR (for example in Adobe Acrobat or Google Drive) and import the result.'); return { meta: {}, blocks: [], report }; }
  const letters = sum(pages, p => sum(p.rows, r => (rowText(r).match(/[A-Za-z]/g) || []).length));
  if (letters / total < 0.5) report.warnings.push('Much of the extracted text is not letters. The PDF may use unusual fonts, so check the preview carefully.');

  /* page furniture */
  const edge = r => r.y > r.ph * 0.9 || r.y < r.ph * 0.08, freq = new Map(), np = pages.length;
  pages.forEach(pg => pg.rows.forEach(r => { if (edge(r)) { r.k = rowText(r).replace(/\d+/g, '#').toLowerCase(); freq.set(r.k, (freq.get(r.k) || 0) + 1); } }));
  const moreOn = new Set();
  pages.forEach(pg => { pg.rows = pg.rows.filter(r => {
    const t = rowText(r);
    if (/^\(?\s*(continued|more)\s*:?\s*\)?\s*(\(?\d+\)?)?$/i.test(t)) { if (/more/i.test(t)) moreOn.add(pg.n); return false; }
    if (/^\d{1,4}[.)]?$/.test(t) && edge(r)) return false;
    if (r.k && np >= 4 && freq.get(r.k) >= np * 0.4 && edge(r)) return false;
    return true; }); });

  /* title page */
  const meta = {}; const first = pages[0];
  const hasHead = p => p && p.rows.some(r => r.segs.some(s => SCENE_HEAD.test(stripSceneNum(s.t))));
  const rowCounts = pages.map(p => p.rows.length);
  if (o.dropTitle && first && pages.length > 1 && !hasHead(first) && hasHead(pages[1]) && first.rows.length < Math.max(8, median(rowCounts) * 0.8)) {
    const rows = first.rows, fs = Math.max(...rows.map(r => r.h)), titleRows = rows.filter(r => r.h >= fs - 0.5);
    meta.title = titleRows.map(rowText).join(' ').replace(/\s+/g, ' ').trim();
    const texts = rows.map(rowText), bi = texts.findIndex(t => /^(written\s+by|screenplay\s+by|teleplay\s+by|a\s+play\s+by|by)\b/i.test(t));
    if (bi >= 0) { const m = /^(written\s+by|screenplay\s+by|teleplay\s+by|a\s+play\s+by|by)\b[:\s]*(.*)$/i.exec(texts[bi]); meta.credit = /^by$/i.test(m[1]) ? 'Written by' : m[1].replace(/^./, c => c.toUpperCase()); meta.author = m[2] || (texts[bi + 1] || ''); }
    const src = texts.find(t => /^based on/i.test(t)); if (src) meta.source = src;
    const contact = rows.filter(r => r.y < r.ph * 0.35 && r.segs[0].x0 < r.pw * 0.45 && !titleRows.includes(r)).map(rowText); const cl = contact.filter(c => !/\b(draft|revision)\b/i.test(c)); if (cl.length) meta.contact = cl.join('\n');
    const dr = texts.find(t => /draft|revision|\b(19|20)\d\d\b/i.test(t) && t !== meta.title); if (dr) meta.draft = dr;
    first.rows = []; report.titlePage = true;
  }

  /* margins: baseline x, scale */
  const scale = (median(pages.map(p => p.w)) || 612) / 612;
  const headXs = []; pages.forEach(pg => pg.rows.forEach(r => r.segs.forEach(s => { if (SCENE_HEAD.test(stripSceneNum(s.t))) headXs.push(s.x0 + (/^\d/.test(s.t) ? 0 : 0)); })));
  let x0;
  if (headXs.length) x0 = median(headXs.filter(x => Math.abs(x - median(headXs)) < 40 * scale));
  else { const hist = new Map(); pages.forEach(pg => pg.rows.forEach(r => { if (r.segs.length === 1 && /[a-z]/.test(r.segs[0].t)) { const k = Math.round(r.segs[0].x0 / 4) * 4; hist.set(k, (hist.get(k) || 0) + 1); } })); x0 = [...hist.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 108 * scale; }
  if (o.mode === 'screenplay' && !headXs.length) report.warnings.push('No scene headings (INT./EXT.) were found. If this is a stage play, switch the format to Stage play.');
  const midX = x0 + 216 * scale;

  /* margin scene numbers and revision asterisks */
  const sceneNums = new Map();
  pages.forEach(pg => pg.rows.forEach(r => {
    if (r.segs.length >= 2) {
      const f = r.segs[0], l = r.segs[r.segs.length - 1];
      if (/^\d{1,3}[A-Z]{0,2}\*?$/.test(f.t) && f.x1 < x0 - 2 * scale && SCENE_HEAD.test(stripSceneNum(r.segs[1].t))) { r.sn = f.t.replace('*', ''); r.segs.shift(); }
      if (r.segs.length >= 2 && /^(\d{1,3}[A-Z]{0,2})?\*?$/.test(l.t) && l.x0 > x0 + 395 * scale) r.segs.pop();
    }
    if (r.segs.length === 1) { const t = r.segs[0].t; const m = /^(\d{1,3}[A-Z]{0,2})\s+(?=(INT|EXT|EST|I\/E))/i.exec(t); if (m && !r.sn) r.sn = m[1]; r.segs[0].t = stripSceneNum(t); }
    r.segs = r.segs.filter(s => !/^\*+$/.test(s.t) || s.x0 < x0 + 395 * scale); if (r.sn) report.sceneNums++;
  }));
  pages.forEach(pg => pg.rows = pg.rows.filter(r => r.segs.length));

  /* line height */
  const diffs = []; pages.forEach(pg => pg.rows.forEach((r, i) => { if (i) { const d = pg.rows[i - 1].y - r.y; if (d > 3 && d < 22) diffs.push(d); } }));
  const lh = median(diffs) || 12;

  /* flatten to tokens (dual dialogue handled in place) */
  const toks = []; let dualCount = 0;
  pages.forEach(pg => {
    const rows = pg.rows;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], prev = rows[i - 1];
      const gap = prev ? prev.y - r.y : 999, pageTop = i === 0;
      const isCueSeg = s => isUpperText(s.t) && s.t.length <= 40 && !SCENE_HEAD.test(s.t);
      if (o.mode === 'screenplay' && r.segs.length === 2 && isCueSeg(r.segs[0]) && isCueSeg(r.segs[1]) && r.segs[1].x0 > r.segs[0].x1 + 24 * scale) {
        const lx = r.segs[0].x0, rx = r.segs[1].x0, L = [r.segs[0].t], Rr = [r.segs[1].t]; let j = i + 1;
        for (; j < rows.length; j++) { const q = rows[j]; if (rows[j - 1].y - q.y > lh * 1.4) break; q.segs.forEach(s => (s.x0 >= (lx + rx) / 2 ? Rr : L).push(s.t)); }
        const mk = col => { const out = []; col.slice(1).forEach(t => { if (/^\(.*\)$/.test(t)) out.push({ type: 'paren', text: t }); else if (out.length && out[out.length - 1].type === 'dialogue') out[out.length - 1].text += ' ' + t; else out.push({ type: 'dialogue', text: t }); }); return out; };
        toks.push({ dual: [{ cue: col0(L), items: mk(L) }, { cue: col0(Rr), items: mk(Rr) }], page: pg.n, pageTop }); dualCount++; i = j - 1; continue;
      }
      const text = r.segs.map(s => s.t).join(' ').replace(/\s+/g, ' ').trim();
      toks.push({ text, x: r.segs[0].x0, x1: r.segs[r.segs.length - 1].x1, y: r.y, page: pg.n, pageTop, blank: !pageTop && gap > lh * 1.45, gap, sn: r.sn, pw: pg.w, h: r.h });
    }
  });
  function col0(a) { return a[0]; }
  report.dual = dualCount;
  toks.forEach(t => { if (!t.dual) t.o = (t.x - x0) / scale; });
  const lines = toks.filter(t => !t.dual);

  /* learn indents (character cue = C, dialogue = D) */
  let C = 158, D = 72;
  if (o.mode === 'screenplay') {
    const cand = [], nextO = [];
    toks.forEach((t, i) => { const n = toks[i + 1]; if (t.dual || !n || n.dual) return; const stripped = t.text.replace(/\s*\(.*?\)\s*/g, ' ').trim();
      if (isUpperText(stripped) && stripped.split(' ').length <= 5 && stripped.length <= 40 && t.o > 40 && !SCENE_HEAD.test(t.text) && !TRANS_RE.test(t.text) && n.page === t.page && t.y - n.y <= lh * 1.7 && n.o < t.o && n.o > 20) { cand.push(t.o); if (!/^\(.*\)$/.test(n.text)) nextO.push(n.o); } });
    if (cand.length >= 3) { C = median(cand); if (nextO.length >= 3) D = median(nextO); }
  }
  const T = Math.max(16, (C - D) * 0.38);

  /* classify */
  const out = []; let prevType = '', lastCharIdx = -1;
  const sceneAtMargin = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.dual) { out.push(t); prevType = 'dual'; continue; }
    let type = 'action'; const txt = t.text, core = txt.replace(/\s*\(.*?\)\s*/g, ' ').trim(), up = isUpperText(txt) || (core.length > 1 && isUpperText(core) && /\([^)]*\)\s*$/.test(txt) && !/^\(/.test(txt));   // "MAYA (cont'd)" / "MAYA (v.o.)": the name is capitals, the extension may not be
    if (o.mode === 'podcast') {
      if (/^(?:SFX|SOUND|FX)[:\s]/i.test(txt)) type = 'sfx';
      else if (/^(?:MUSIC|TRACK|THEME)[:\s]/i.test(txt)) type = 'music';
      else if (/^(?:CLIP|TAPE|ACTUALITY)[:\s]/i.test(txt)) type = 'clip';
      else if (/^(?:SPONSOR|AD|MIDROLL)[:\s]/i.test(txt)) type = 'sponsor';
      else if (/^(?:SEGMENT|TRACK|SCENE|PART|ACT)\s+\w+/i.test(txt)) type = 'scene';
      else if (up && core.length <= 40 && core.split(' ').length <= 5) type = 'character';
      else if (/^\(.*\)$/.test(txt)) type = 'paren';
      else type = 'dialogue';
    } else if (o.mode === 'stage') {
      const m = /^([A-Z][A-Z0-9 .'’-]{0,28}?)[:.]\s+(\S.*)$/.exec(txt);
      if (/^ACT\s+(?:[IVXLC\d]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|FIRST|SECOND|THIRD)\b/i.test(txt) && txt.length < 40) type = 'act';
      else if (/^SCENE\s+(?:[IVXLC\d]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|FIRST|SECOND|THIRD)\b/i.test(txt) && txt.length < 80) type = 'scene';
      else if (m && isUpperText(m[1]) && m[1].trim().split(/\s+/).length <= 4) { out.push({ ...t, type: 'character', text: m[1].trim() }); out.push({ ...t, type: 'dialogue', text: m[2], blank: false }); prevType = 'dialogue'; continue; }
      else if (up && core.length <= 34 && core.split(' ').length <= 4 && toks[i + 1] && !toks[i + 1].dual && toks[i + 1].page === t.page && t.y - toks[i + 1].y <= lh * 1.7 && !isUpperText(toks[i + 1].text)) type = 'character';
      else if (/^\(.*\)$/.test(txt) || /^\[.*\]$/.test(txt)) type = (prevType === 'character' && !t.blank) ? 'paren' : 'direction';
      else if ((prevType === 'character' || prevType === 'paren' || prevType === 'dialogue') && !t.blank) type = 'dialogue';
      else type = prevType === 'scene' || prevType === 'act' ? 'setting' : (prevType === 'setting' && !t.blank ? 'setting' : 'direction');
    } else {
      if (SCENE_HEAD.test(txt)) type = 'scene';
      else if (prevType === 'scene' && !t.blank && !t.pageTop && up && t.o <= T && !TRANS_RE.test(txt)) type = 'scene';
      else if (TRANS_RE.test(txt) && (t.o > T || /TO:$|^FADE|^CUT TO BLACK|^THE END/.test(txt))) type = 'transition';
      else if (up && core.length <= 46 && core.split(' ').length <= 6 && Math.abs(t.o - C) <= T && !/^\(.*\)$/.test(txt)) type = 'character';
      else if (CONTD_CUE.test(txt) && t.o > T && !/^\(.*\)$/.test(txt)) type = 'character';   // "CHARLIE (cont'd)" at an unusual indent is still a cue
      else if (/^\(/.test(txt) && t.o > T && t.o < C + T) type = 'paren';
      else if (prevType === 'paren' && !/\)$/.test(out[out.length - 1].text) && !t.blank) type = 'paren';
      else if (Math.abs(t.o - D) <= T && t.o > T) type = 'dialogue';
      else if (t.o <= T) type = 'action';
      else if (up && t.o > C + T) type = 'transition';
      else if (t.o > T && (prevType === 'character' || prevType === 'paren' || prevType === 'dialogue')) type = 'dialogue';
      else { type = 'action'; report.unclassified++; }
      if (type === 'action' && prevType === 'dialogue' && t.o > T && t.o < C - T / 2 && !t.blank) type = 'dialogue';
    }
    out.push({ ...t, type }); prevType = type;
  }

  /* assemble blocks */
  const blocks = []; let cur = null; const joinTxt = (a, b, hard) => a + (hard ? '\n' : ' ') + b;
  const endsSentence = s => /[.!?…:;"”)\]]\s*$/.test(s);
  const flush = () => { if (cur) { blocks.push(cur); cur = null; } };
  const mkBlock = (t, type, text) => { const b = { id: uid(), type, text }; if (t && t.sn) b._sn = t.sn; if (t) { b._page = t.page; b._pageTop = t.pageTop; } return b; };
  for (const t of out) {
    if (t.dual) {
      flush(); t.dual.forEach((c, k) => { blocks.push(mkBlock(t, 'character', c.cue.replace(/\s*\^$/, '').trim() + (k ? ' ^' : ''))); c.items.forEach(it => blocks.push(mkBlock(t, it.type, it.text))); }); continue;
    }
    const type = t.type;
    if (type === 'character') { flush(); const cue = t.text.replace(/\s*\((?:CONT[’']?D\.?|CONTINUED)\)\s*/i, ' ').replace(/\s+/g, ' ').trim().replace(/[:]$/, ''); const b = mkBlock(t, 'character', cue); b._contd = /CONT[’']?D|CONTINUED/i.test(t.text); blocks.push(b); continue; }
    const continuing = cur && cur.type === type && (!t.blank) && (!t.pageTop || !endsSentence(cur.text) || (type === 'dialogue' && moreOn.has(t.page - 1)));
    if (continuing) cur.text = joinTxt(cur.text, t.text, o.keepBreaks && (type === 'action' || type === 'direction' || type === 'setting'));
    else { flush(); cur = mkBlock(t, type, t.text); }
    if (type === 'scene' || type === 'act' || type === 'transition') { /* single-line elements */ }
  }
  flush();

  /* merge dialogue split across pages by (MORE) / (CONT'D) */
  for (let i = blocks.length - 1; i >= 2; i--) {
    const b = blocks[i];
    if (b.type === 'character' && b._contd && b._pageTop && blocks[i + 1] && blocks[i + 1].type === 'dialogue') {
      const pd = blocks[i - 1], pc = blocks[i - 2];
      if (pd.type === 'dialogue' && pc.type === 'character' && normChar(pc.text) === normChar(b.text)) { pd.text = pd.text + ' ' + blocks[i + 1].text; blocks.splice(i, 2); }
    }
  }

  /* clean text, scene numbers, report */
  const nums = [];
  blocks.forEach(b => {
    b.text = b.text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
    if (['scene', 'character', 'transition', 'act', 'cue', 'shot'].includes(b.type)) b.text = b.text.toUpperCase();
    if (b.type === 'scene' && b._sn) nums.push(b._sn);
  });
  if (o.keepNums && o.mode === 'screenplay' && nums.length >= Math.max(2, blocks.filter(b => b.type === 'scene').length * 0.5)) { blocks.forEach(b => { if (b.type === 'scene' && b._sn) b.num = b._sn; }); report.keepNumbers = true; }
  blocks.forEach(b => { delete b._sn; delete b._page; delete b._pageTop; delete b._contd; });
  const final = blocks.filter(b => b.text);
  report.elements = final.length; report.scenes = final.filter(b => b.type === 'scene').length;
  report.characters = new Set(final.filter(b => b.type === 'character').map(b => normChar(b.text))).size;
  report.indents = { C: Math.round(C), D: Math.round(D) };
  if (o.mode === 'screenplay' && final.length && !report.scenes) report.warnings.push('No scene headings were recognised, so everything may have come in as action.');
  if (report.unclassified > 8) report.warnings.push(`${report.unclassified} lines had an unusual indent and were treated as action — check the preview.`);
  if (report.dual) (report.notes = report.notes || []).push(`${report.dual} dual-dialogue block${report.dual > 1 ? 's' : ''} detected and rebuilt side by side.`);
  if (report.keepNumbers) (report.notes = report.notes || []).push('Scene numbers found in the margins will be kept and locked.');
  if (final.length && final.filter(b => b.type === 'character').length && !final.some(b => b.type === 'dialogue')) report.warnings.push('Characters were found but no dialogue. The layout may not match a standard screenplay.');
  return { meta, blocks: final, report };
}

/* ---------- step 5: review dialog ---------- */
async function pdfImportFlow(file, { mode = 'screenplay', apply, lockMode = false }) {
  const status = h('p', { style: { margin: 0 } }, 'Loading the PDF reader…');
  const wait = modal({ title: 'Reading PDF', body: h('div', {}, status, h('div', { class: 'progress', style: { marginTop: '12px' } }, h('i', { id: 'pdfprog', style: { width: '5%' } }))), buttons: [] });
  let pages;
  try { pages = await extractPdf(await file.arrayBuffer(), (n, t) => { status.textContent = `Reading page ${n} of ${t}…`; const b = $('#pdfprog'); if (b) b.style.width = (n / t * 100) + '%'; }); }
  catch (e) { wait.close(); modal({ title: 'Could not read that PDF', body: h('p', { style: { margin: 0 } }, e.message || String(e)), buttons: [{ label: 'Close', primary: true }] }); return; }
  wait.close();
  const state = { mode, keepBreaks: false, keepNums: true, dropTitle: true, shown: 250 };
  let result = parsePdfRows(pages, state);
  const body = h('div'); let box;
  function draw() {
    const r = result.report; body.innerHTML = '';
    body.append(h('div', { class: 'sum', style: { marginBottom: '12px' } }, [['Pages', r.pages], ['Scenes', r.scenes || 0], ['Characters', r.characters || 0], ['Elements', r.elements || 0]].map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, String(v))))),
      ...(r.notes || []).map(w => h('div', { class: 'csalert info' }, w)), ...r.warnings.map(w => h('div', { class: 'csalert' }, w)),
      h('div', { class: 'row wrap', style: { marginBottom: '12px', gap: '14px' } },
        lockMode ? null : h('label', { class: 'row small' }, 'Format', h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { state.mode = e.target.value; reparse(); } }, [['screenplay', 'Screenplay'], ['stage', 'Stage play'], ['podcast', 'Podcast / Audio']].map(([k, l]) => h('option', { value: k, selected: k === state.mode }, l)))),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: state.keepBreaks, onchange: e => { state.keepBreaks = e.target.checked; reparse(); } }), 'Keep line breaks in action'),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: state.keepNums, onchange: e => { state.keepNums = e.target.checked; reparse(); } }), 'Keep scene numbers'),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: state.dropTitle, onchange: e => { state.dropTitle = e.target.checked; reparse(); } }), 'Read title page'),
        result.meta.title ? h('span', { class: 'small muted' }, `Title: ${result.meta.title}${result.meta.author ? ' · ' + result.meta.author : ''}`) : null),
      h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, 'Check the preview. Use the menu on any line to fix its type, or the ✕ to drop it.'));
    const types = TYPES[state.mode], list = h('div', { class: 'imp-list' });
    result.blocks.slice(0, state.shown).forEach((b, i) => {
      const sel = h('select', { class: 'imp-type', onchange: e => { b.type = e.target.value; if (CAPS.has(b.type)) b.text = b.text.toUpperCase(); row.className = 'imp-row'; txt.className = 'rb t-' + b.type; txt.textContent = b.text; } }, types.map(t => h('option', { value: t.k, selected: t.k === b.type }, t.label)));
      const txt = h('div', { class: 'rb t-' + b.type }, b.text);
      const row = h('div', { class: 'imp-row' }, sel, h('div', { class: 'mini ' + state.mode, style: { flex: 1, padding: '6px 12px', boxShadow: 'none', background: 'transparent' } }, txt), h('button', { class: 'icon-btn', title: 'Drop this line', onclick: () => { const k = result.blocks.indexOf(b); if (k >= 0) result.blocks.splice(k, 1); row.remove(); } }, icon('x', 14)));
      list.append(row);
    });
    if (result.blocks.length > state.shown) list.append(h('button', { class: 'btn sm', style: { margin: '10px' }, onclick: () => { state.shown += 400; draw(); } }, `Show more (${result.blocks.length - state.shown} hidden)`));
    body.append(list);
  }
  function reparse() { result = parsePdfRows(pages, state); draw(); }
  draw();
  const buttons = [{ label: 'Cancel' }, ...(apply || []).map((a, i, arr) => ({ label: a.label, primary: i === arr.length - 1, onClick: () => { if (!result.blocks.length) { toast('Nothing to import — try the other format option.', true); return false; } a.run({ meta: result.meta, blocks: result.blocks, mode: state.mode, report: result.report, keepNumbers: !!result.report.keepNumbers }); } }))];
  box = modal({ title: `Import “${file.name}”`, body, wide: true, buttons });
}
