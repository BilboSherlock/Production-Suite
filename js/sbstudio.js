'use strict';
/* ===================================================================
   Frame studio — the storyboard frame editor. Layers on a pasteboard,
   move / scale / rotate / crop / 3D-distort, drawing, text, copy &
   paste, onion skin, and a camera that can move (pan, zoom, roll).
   =================================================================== */
const SB_INK = ['#111111', '#d12f3a', '#e8830c', '#e8c40c', '#1e8e54', '#2468d8', '#7a45c9', '#ffffff'];
UI.sbClip = UI.sbClip || null;
async function loadImageFile(file, maxDim = 2200) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; }), k = Math.min(1, maxDim / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const png = /png|gif|webp|svg/.test(file.type) && c.width * c.height < 2.2e6;
    return { src: c.toDataURL(png ? 'image/png' : 'image/jpeg', .88), nw: c.width, nh: c.height };
  } finally { URL.revokeObjectURL(url); }
}
/* what the camera sees, as a canvas (used for thumbnails, prints and the animatic) */
async function flatFrame(frame, ar, W = 1000, t = 0) {
  await SBR.ready(frame); const H = Math.round(W / ar), c = document.createElement('canvas'); c.width = W; c.height = H; SBR.renderFrame(c.getContext('2d'), W, H, frame, ar, t); return c;
}

function openFrameStudio(P, b, { ar, scenes, onSave }) {
  const WH = SBR.worldH(ar), uidf = uid, D = SBD;
  const fr = SBR.ensureLayers(D.clone(b), ar, uidf); fr.cam = fr.cam || { a: SBR.defaultCam(ar), b: null, ease: 'inout' }; if (!fr.cam.a) fr.cam.a = SBR.defaultCam(ar);
  const live = new Map();                       // layer id -> canvas being drawn on
  let sel = null, tool = 'select', camMode = 'a', onion = false, thirds = false, space = false, dragging = null, hover = null, tT = 0, playing = null, flat = null, shapePrev = null;
  let ink = SB_INK[0], size = 6, fillShape = false, dirty = false; const hist = [], redo = [];
  const view = { s: 1, cx: SBR.WORLD_W / 2, cy: WH / 2 };
  const initial = JSON.stringify(fr), changed = () => JSON.stringify(fr) !== initial;   // Cancel only asks when something really changed
  const layers = () => fr.layers, byId = id => fr.layers.find(l => l.id === id), cur = () => byId(sel);
  const camQ = k => SBR.camQuad(fr.cam[k] || SBR.defaultCam(ar), ar);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  /* ---------- history ---------- */
  const snap = () => ({ layers: D.clone(fr.layers), cam: D.clone(fr.cam), sel });
  const histBtns = [];   // every undo / redo button, enabled only when there is something to undo / redo
  const histSync = () => histBtns.forEach(([b, r]) => { b.disabled = !(r ? redo.length : hist.length); });
  const pushHist = () => { hist.push(snap()); if (hist.length > 60) hist.shift(); redo.length = 0; dirty = true; histSync(); };
  function restore(s) { fr.layers.length = 0; fr.layers.push(...D.clone(s.layers)); fr.cam = D.clone(s.cam); sel = s.sel && byId(s.sel) ? s.sel : null; live.clear(); fr.layers.forEach(l => { if (l.kind === 'draw') liveOf(l); }); flat = null; panel(); render(); }
  const undo = () => { if (!hist.length) return; redo.push(snap()); restore(hist.pop()); histSync(); }, redoIt = () => { if (!redo.length) return; hist.push(snap()); restore(redo.pop()); histSync(); };

  /* ---------- drawing layers keep a live canvas ---------- */
  function liveOf(l) {
    let c = live.get(l.id); if (c) return c; c = document.createElement('canvas'); c.width = l.nw || 1600; c.height = l.nh || Math.round(1600 / ar); live.set(l.id, c);
    if (l.src) { const im = new Image(); im.onload = () => { c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); render(); }; im.src = l.src; } return c;
  }
  const commit = l => { const c = live.get(l.id); if (c) { l.src = c.toDataURL('image/png'); l.nw = c.width; l.nh = c.height; } };
  fr.layers.forEach(l => { if (l.kind === 'draw') liveOf(l); });

  /* ---------- the stage ---------- */
  const cv = h('canvas', { class: 'sbs-cv', tabindex: 0 }), ctx = cv.getContext('2d'), stage = h('div', { class: 'sbs-stage' }, cv);
  const W = () => cv.width / dpr, H = () => cv.height / dpr;
  const toS = (x, y) => [(x - view.cx) * view.s + W() / 2, (y - view.cy) * view.s + H() / 2], toW = (sx, sy) => [(sx - W() / 2) / view.s + view.cx, (sy - H() / 2) / view.s + view.cy];
  function fit() { const q = SBR.bbox(camQ('a')), pad = 80, w = q.x1 - q.x0, hh = q.y1 - q.y0; view.s = Math.max(.05, Math.min((W() - pad) / w, (H() - pad) / hh)); view.cx = (q.x0 + q.x1) / 2; view.cy = (q.y0 + q.y1) / 2; render(); }
  function resize() { const r = stage.getBoundingClientRect(); cv.width = Math.max(100, Math.round(r.width * dpr)); cv.height = Math.max(100, Math.round(r.height * dpr)); render(); }
  let raf = 0; const render = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
  SBR.setOnLoad(render);
  const prevFrame = () => { const i = P.boards.findIndex(x => x.id === b.id); return i > 0 ? P.boards[i - 1] : null; };
  let onionImg = null; async function loadOnion() { const pf = prevFrame(); if (!pf) return; const f = SBR.ensureLayers(D.clone(pf), ar, uidf); onionImg = await flatFrame(f, ar, 640); render(); }
  const quadPath = (q, proj) => { const p = q.map(pt => proj(pt[0], pt[1])); ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); return p; };
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5';

  function paint() {
    const w = W(), hh = H(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#2b2e35'; ctx.fillRect(0, 0, w, hh);
    const ac = accent(), activeK = camMode, cams = fr.cam;
    // paper under the active camera
    quadPath(camQ('a'), toS); ctx.fillStyle = '#fff'; ctx.fill(); if (cams.b) { quadPath(camQ('b'), toS); ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fill(); }
    if (onion && onionImg) { ctx.save(); ctx.globalAlpha = .28; SBR.drawQuad(ctx, onionImg, null, camQ('a').map(p => toS(p[0], p[1]))); ctx.restore(); }
    SBR.drawLayers(ctx, fr, toS, live);
    // dim everything outside the active camera
    const cq = quadPath(camQ(activeK === 'b' && cams.b ? 'b' : 'a'), toS); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, hh); ctx.moveTo(cq[0][0], cq[0][1]); for (let i = 3; i >= 0; i--) ctx.lineTo(cq[i][0], cq[i][1]); ctx.closePath(); ctx.fillStyle = 'rgba(15,17,22,.55)'; ctx.fill('evenodd'); ctx.restore();
    // camera outlines
    const outline = (k, dashed) => { const p = quadPath(camQ(k), toS); ctx.save(); ctx.lineWidth = camMode === k ? 2.5 : 1.5; ctx.strokeStyle = k === 'a' ? '#ffd24a' : '#5ec2ff'; if (dashed) ctx.setLineDash([7, 5]); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.font = '700 11px sans-serif'; ctx.fillText(k === 'a' ? 'CAMERA A (start)' : 'CAMERA B (end)', p[0][0] + 4, p[0][1] - 5); ctx.restore(); return p; };
    outline('a', false); if (cams.b) { outline('b', true); const ca = SBR.center(camQ('a')), cb = SBR.center(camQ('b')), pa = toS(ca[0], ca[1]), pb = toS(cb[0], cb[1]); ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.restore(); if (playing || tT > 0) { const c = SBR.camAt(cams, tT, ar), p = SBR.camQuad(c, ar).map(pt => toS(pt[0], pt[1])); ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); p.slice(1).forEach(x => ctx.lineTo(x[0], x[1])); ctx.closePath(); ctx.stroke(); ctx.restore(); } }
    if (thirds) { const q = camQ(camMode === 'b' && cams.b ? 'b' : 'a'), H0 = SBR.homography(q); const lines = []; [1 / 3, 2 / 3].forEach(t => { [[t, 0, t, 1], [0, t, 1, t]].forEach(([a, bb, c, d]) => lines.push([toS(...H0.fwd(a, bb)), toS(...H0.fwd(c, d))])); });
      /* a dark line with a light core reads on white paper, dark photos and everything between */
      ctx.save(); [['rgba(0,0,0,.45)', 3], ['rgba(255,255,255,.95)', 1]].forEach(([col, lw]) => { ctx.strokeStyle = col; ctx.lineWidth = lw; lines.forEach(([p0, p1]) => { ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke(); }); }); ctx.restore(); }
    handles(ac);
    if (shapePrev) { ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, size * view.s); ctx.lineCap = 'round'; const [a, bb] = shapePrev.pts; shapeStroke(ctx, shapePrev.kind, toS(...a), toS(...bb), fillShape ? ink : null); ctx.restore(); }
  }
  function shapeStroke(g, kind, a, bb, fill) {
    g.beginPath();
    if (kind === 'line' || kind === 'arrow') { g.moveTo(a[0], a[1]); g.lineTo(bb[0], bb[1]); g.stroke(); if (kind === 'arrow') { const ang = Math.atan2(bb[1] - a[1], bb[0] - a[0]), L = Math.max(10, g.lineWidth * 4); g.beginPath(); g.moveTo(bb[0], bb[1]); g.lineTo(bb[0] - L * Math.cos(ang - .45), bb[1] - L * Math.sin(ang - .45)); g.moveTo(bb[0], bb[1]); g.lineTo(bb[0] - L * Math.cos(ang + .45), bb[1] - L * Math.sin(ang + .45)); g.stroke(); } return; }
    if (kind === 'rect') g.rect(Math.min(a[0], bb[0]), Math.min(a[1], bb[1]), Math.abs(bb[0] - a[0]), Math.abs(bb[1] - a[1])); else g.ellipse((a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2, Math.abs(bb[0] - a[0]) / 2, Math.abs(bb[1] - a[1]) / 2, 0, 0, 7); if (fill) { g.fillStyle = fill; g.fill(); } g.stroke();
  }
  /* ---------- handles ---------- */
  const TOUCH = () => !!document.documentElement.dataset.touch, HS = 9, hsz = () => TOUCH() ? 20 : HS, hrad = hd => (hd.kind === 'rot' ? 10 : 9) * (TOUCH() ? 2.2 : 1);
  const touches = new Map(); let penSeen = false, pinch = null, penErase = false;
  function handleSet() {
    // returns [{id, p:[sx,sy], kind}] for the active tool
    const out = [], L = cur();
    if (tool === 'camera') { const k = camMode === 'b' && fr.cam.b ? 'b' : 'a', q = camQ(k).map(p => toS(p[0], p[1])); q.forEach((p, i) => out.push({ id: 'c' + i, p, kind: 'scale' })); const mt = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2], c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2], nx = mt[0] - c[0], ny = mt[1] - c[1], nl = Math.hypot(nx, ny) || 1; out.push({ id: 'crot', p: [mt[0] + nx / nl * 28, mt[1] + ny / nl * 28], kind: 'rot' }); return out; }
    if (!L) return out; const q = L.quad.map(p => toS(p[0], p[1]));
    if (tool === 'distort') { q.forEach((p, i) => out.push({ id: 'd' + i, p, kind: 'corner' })); return out; }
    if (tool === 'select' || tool === 'crop') {
      q.forEach((p, i) => out.push({ id: 's' + i, p, kind: 'corner' })); for (let i = 0; i < 4; i++) { const a = q[i], c = q[(i + 1) % 4]; out.push({ id: 'e' + i, p: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], kind: 'edge' }); }
      if (tool === 'select') { const mt = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2], c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2], nx = mt[0] - c[0], ny = mt[1] - c[1], nl = Math.hypot(nx, ny) || 1; out.push({ id: 'rot', p: [mt[0] + nx / nl * 28, mt[1] + ny / nl * 28], kind: 'rot' }); }
    }
    return out;
  }
  function handles(ac) {
    const L = cur(); if (L && ['select', 'distort', 'crop'].includes(tool)) { const q = L.quad.map(p => toS(p[0], p[1])); ctx.save(); ctx.strokeStyle = tool === 'crop' ? '#ffd24a' : ac; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.stroke(); ctx.restore(); }
    const hs = handleSet(); ctx.save(); hs.forEach(hd => { ctx.fillStyle = hd.kind === 'rot' ? ac : '#fff'; ctx.strokeStyle = tool === 'crop' ? '#b08900' : ac; ctx.lineWidth = 1.5; ctx.beginPath(); if (hd.kind === 'rot') ctx.arc(hd.p[0], hd.p[1], hsz() * .68, 0, 7); else ctx.rect(hd.p[0] - hsz() / 2, hd.p[1] - hsz() / 2, hsz(), hsz()); ctx.fill(); ctx.stroke(); }); ctx.restore();
    if (hs.length && hs.find(x => x.id === 'rot')) { const r = hs.find(x => x.id === 'rot'), q = L.quad.map(p => toS(p[0], p[1])), mt = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2]; ctx.save(); ctx.strokeStyle = ac; ctx.beginPath(); ctx.moveTo(mt[0], mt[1]); ctx.lineTo(r.p[0], r.p[1]); ctx.stroke(); ctx.restore(); }
  }
  const hitHandle = (sx, sy) => handleSet().find(hd => Math.hypot(hd.p[0] - sx, hd.p[1] - sy) <= hrad(hd));
  const hitLayer = (wx, wy) => { for (let i = fr.layers.length - 1; i >= 0; i--) { const l = fr.layers[i]; if (l.visible === false || l.locked) continue; if (SBR.pointInQuad(l.quad, wx, wy)) return l; } return null; };

  /* ---------- pointer interaction ---------- */
  const ptr = e => { const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top; return { sx, sy, w: toW(sx, sy), pr: e.pointerType === 'pen' ? (e.pressure || .5) * 1.6 : 1 }; };
  const drawTarget = () => { let l = cur(); if (l && l.kind === 'draw' && !l.locked) return l; l = [...fr.layers].reverse().find(x => x.kind === 'draw' && !x.locked && x.visible !== false); if (l) { sel = l.id; panel(); return l; } pushHist(); const cq = camQ('a'), c = SBR.center(cq), [cw, ch] = SBR.quadSize(cq), nl = { id: uidf(), kind: 'draw', name: 'Drawing', visible: true, locked: false, opacity: 1, quad: SBR.rectQuad(c[0], c[1], cw * 1.0, ch * 1.0, SBR.quadAngle(cq)), crop: null, src: '', nw: 1600, nh: Math.round(1600 / ar) }; fr.layers.push(nl); liveOf(nl); sel = nl.id; panel(); return nl; };
  const toBitmap = (l, w) => { const H0 = SBR.homography(l.quad), [u, v] = H0.inv(w[0], w[1]), c = l.crop || { x: 0, y: 0, w: 1, h: 1 }, cvv = live.get(l.id); return [(c.x + u * c.w) * cvv.width, (c.y + v * c.h) * cvv.height]; };
  const brushPx = l => { const c = l.crop || { w: 1 }, cvv = live.get(l.id); return cvv.width * c.w / (SBR.quadSize(l.quad)[0] || 1); };
  function strokeTo(l, a, bb, pr, kind, erase) {
    const g = live.get(l.id).getContext('2d'), k = brushPx(l), A = toBitmap(l, a), B = toBitmap(l, bb), er = tool === 'eraser' || erase; g.save(); g.globalCompositeOperation = er ? 'destination-out' : 'source-over'; g.strokeStyle = g.fillStyle = ink; g.lineWidth = Math.max(.5, (er ? size * 2.5 : size) * k * pr); g.lineCap = g.lineJoin = 'round';
    if (kind) shapeStroke(g, kind, A, B, fillShape ? ink : null); else { g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); } g.restore();
  }
  const DRAWT = ['pen', 'eraser', 'line', 'arrow', 'rect', 'ellipse'];
  function abortDrag() { const d = dragging; if (!d) return; if (d.kind === 'ink' || d.kind === 'shape') { shapePrev = null; if (hist.length) restore(hist.pop()); } else if (d.L && d.q0) { d.L.quad = d.q0; } dragging = null; render(); }
  let tapG = null;   // a quick multi-finger tap in progress: { n, t, moved }
  let touchHist = null;   // history as it was before the first finger landed, so a pinch or multi-finger tap leaves no trace in undo / redo
  function pinchStart() { const [a, b2] = [...touches.values()]; abortDrag(); if (touchHist) { hist.splice(0, hist.length, ...touchHist.hist); redo.splice(0, redo.length, ...touchHist.redo); histSync(); } pinch = { d0: Math.hypot(a.x - b2.x, a.y - b2.y) || 1, m0: [(a.x + b2.x) / 2, (a.y + b2.y) / 2], s0: view.s, c0: toW((a.x + b2.x) / 2, (a.y + b2.y) / 2) }; }
  function pinchMove() { const [a, b2] = [...touches.values()]; if (!pinch || !b2) return; const d = Math.hypot(a.x - b2.x, a.y - b2.y) || 1, m = [(a.x + b2.x) / 2, (a.y + b2.y) / 2]; view.s = Math.max(.05, Math.min(12, pinch.s0 * d / pinch.d0)); if (tapG && Math.hypot(m[0] - pinch.m0[0], m[1] - pinch.m0[1]) > 18) tapG.moved = true; view.cx = pinch.c0[0] - (m[0] - W() / 2) / view.s; view.cy = pinch.c0[1] - (m[1] - H() / 2) / view.s; zoomLbl(); render(); }
  const touchOnly = e => e.pointerType === 'touch', fromPen = e => e.pointerType === 'pen';
  cv.addEventListener('pointerdown', e => {
    if (fromPen(e)) { penSeen = true; penErase = !!(e.buttons & 32) || e.button === 5; }
    if (touchOnly(e)) { const r = cv.getBoundingClientRect(); touches.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top }); if (touches.size === 1) touchHist = { hist: hist.slice(), redo: redo.slice() }; if (touches.size === 2) { try { cv.setPointerCapture(e.pointerId); } catch (x) { } pinchStart(); tapG = { n: 2, t: performance.now(), moved: false }; e.stopImmediatePropagation(); return; } if (touches.size > 2) { if (tapG) tapG.n = Math.max(tapG.n, touches.size); e.stopImmediatePropagation(); return; }
      if (penSeen && DRAWT.includes(tool)) { /* a pen has been used: fingers pan instead of leaving marks (palm rejection) */ const p0 = ptr(e); try { cv.setPointerCapture(e.pointerId); } catch (x) { } dragging = { kind: 'pan', sx: p0.sx, sy: p0.sy, cx: view.cx, cy: view.cy }; e.stopImmediatePropagation(); return; } }
  }, true);
  cv.addEventListener('pointermove', e => { if (touchOnly(e) && touches.has(e.pointerId)) { const r = cv.getBoundingClientRect(); touches.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top }); if (pinch) { pinchMove(); if (tapG && Math.abs(view.s / pinch.s0 - 1) > .06) tapG.moved = true; e.stopImmediatePropagation(); } } }, true);
  const touchEnd = e => { if (touches.has(e.pointerId)) { touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
    if (touches.size === 0 && tapG) { const g = tapG; tapG = null; if (!g.moved && e.type === 'pointerup' && performance.now() - g.t < 350) { if (g.n === 2) undo(); else if (g.n === 3) redoIt(); } } if (e.pointerType === 'touch' && touches.size === 0 && penErase) penErase = false; } };
  cv.addEventListener('pointerup', touchEnd, true); cv.addEventListener('pointercancel', touchEnd, true);
  cv.addEventListener('pointerdown', e => {
    cv.focus(); const p = ptr(e); try { cv.setPointerCapture(e.pointerId); } catch (x) { }
    if (e.button === 1 || space || tool === 'hand') { dragging = { kind: 'pan', sx: p.sx, sy: p.sy, cx: view.cx, cy: view.cy }; cv.style.cursor = 'grabbing'; return; }
    if (['pen', 'eraser'].includes(tool) || (penErase && fromPen(e))) { const n0 = hist.length, l = drawTarget(); if (hist.length === n0) pushHist(); dragging = { kind: 'ink', l, last: p.w, erase: penErase && fromPen(e) }; const g = live.get(l.id).getContext('2d'), A = toBitmap(l, p.w), k = brushPx(l); g.save(); const er = tool === 'eraser' || dragging.erase; g.globalCompositeOperation = er ? 'destination-out' : 'source-over'; g.fillStyle = ink; g.beginPath(); g.arc(A[0], A[1], Math.max(.5, (er ? size * 2.5 : size) * k * p.pr) / 2, 0, 7); g.fill(); g.restore(); render(); return; }
    if (['line', 'arrow', 'rect', 'ellipse'].includes(tool)) { const n0 = hist.length, l = drawTarget(); if (hist.length === n0) pushHist(); dragging = { kind: 'shape', l, a: p.w }; shapePrev = { kind: tool, pts: [p.w, p.w] }; return; }
    if (tool === 'text') { addText(p.w); return; }
    const hd = hitHandle(p.sx, p.sy);
    if (tool === 'camera') { const k = camMode === 'b' && fr.cam.b ? 'b' : 'a'; pushHist(); const cam = fr.cam[k]; if (hd) { dragging = { kind: hd.id === 'crot' ? 'camrot' : 'camscale', k, cam: { ...cam }, p0: p.w, h0: hd.id, undoable: true }; } else if (SBR.pointInQuad(camQ(k), p.w[0], p.w[1])) dragging = { kind: 'cammove', k, cam: { ...cam }, p0: p.w, undoable: true }; else hist.pop(); return; }
    if (hd && cur()) {
      pushHist(); const L = cur(), q0 = L.quad.map(x => x.slice()), c = SBR.center(q0);
      if (tool === 'distort') dragging = { kind: 'corner', L, i: +hd.id.slice(1) };
      else if (tool === 'crop') dragging = { kind: 'crop', L, hid: hd.id, q0, crop0: L.crop ? { ...L.crop } : { x: 0, y: 0, w: 1, h: 1 } };
      else if (hd.id === 'rot') dragging = { kind: 'rot', L, q0, c, a0: Math.atan2(p.w[1] - c[1], p.w[0] - c[0]) };
      else if (hd.id[0] === 's') dragging = { kind: 'scale', L, q0, i: +hd.id.slice(1), p0: p.w };
      else dragging = { kind: 'edge', L, q0, i: +hd.id.slice(1), p0: p.w };
      dragging.undoable = true; flat = null; return;
    }
    const L = hitLayer(p.w[0], p.w[1]);
    if (L) { sel = L.id; panel(); pushHist(); dragging = { kind: 'move', L, q0: L.quad.map(x => x.slice()), p0: p.w, undoable: true }; flat = null; render(); } else if (tool === 'select' || tool === 'distort' || tool === 'crop') { sel = null; panel(); render(); }
  });
  cv.addEventListener('pointermove', e => {
    const p = ptr(e), d = dragging;
    if (!d) { const hd = (cur() || tool === 'camera') ? hitHandle(p.sx, p.sy) : null; cv.style.cursor = space || tool === 'hand' ? 'grab' : hd ? (hd.kind === 'rot' ? 'alias' : 'nwse-resize') : ['pen', 'eraser', 'line', 'arrow', 'rect', 'ellipse'].includes(tool) ? 'crosshair' : tool === 'text' ? 'text' : (tool === 'select' && hitLayer(p.w[0], p.w[1])) ? 'move' : 'default'; return; }
    if (d.kind === 'pan') { view.cx = d.cx - (p.sx - d.sx) / view.s; view.cy = d.cy - (p.sy - d.sy) / view.s; render(); return; }
    if (d.kind === 'ink') { strokeTo(d.l, d.last, p.w, p.pr, null, d.erase); d.last = p.w; render(); return; }
    if (d.kind === 'shape') { shapePrev = { kind: tool, pts: [d.a, e.shiftKey && (tool === 'rect' || tool === 'ellipse') ? [d.a[0] + Math.sign(p.w[0] - d.a[0]) * Math.max(Math.abs(p.w[0] - d.a[0]), Math.abs(p.w[1] - d.a[1])), d.a[1] + Math.sign(p.w[1] - d.a[1]) * Math.max(Math.abs(p.w[0] - d.a[0]), Math.abs(p.w[1] - d.a[1]))] : p.w] }; render(); return; }
    const L = d.L; dirty = true; d.moved = true;
    if (d.kind === 'move') { L.quad = SBR.translate(d.q0, p.w[0] - d.p0[0], p.w[1] - d.p0[1]); }
    else if (d.kind === 'corner') { L.quad = L.quad.map((x, i) => i === d.i ? [p.w[0], p.w[1]] : x); }
    else if (d.kind === 'rot') { let da = Math.atan2(p.w[1] - d.c[1], p.w[0] - d.c[0]) - d.a0; if (e.shiftKey) da = Math.round(da / (Math.PI / 12)) * (Math.PI / 12); L.quad = SBR.rotateAbout(d.q0, d.c[0], d.c[1], da); }
    else if (d.kind === 'scale') { const O = d.q0[(d.i + 2) % 4], P0 = d.q0[d.i], v0 = [P0[0] - O[0], P0[1] - O[1]], v1 = [p.w[0] - O[0], p.w[1] - O[1]], s = Math.max(.02, (v1[0] * v0[0] + v1[1] * v0[1]) / (v0[0] * v0[0] + v0[1] * v0[1] || 1)); L.quad = SBR.scaleAbout(d.q0, e.altKey ? SBR.center(d.q0)[0] : O[0], e.altKey ? SBR.center(d.q0)[1] : O[1], s); }
    else if (d.kind === 'edge') { const q = d.q0, i = d.i, a = q[i], bb = q[(i + 1) % 4], c2 = q[(i + 2) % 4], d2 = q[(i + 3) % 4], m = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2], o = [(c2[0] + d2[0]) / 2, (c2[1] + d2[1]) / 2], vx = m[0] - o[0], vy = m[1] - o[1], len = Math.hypot(vx, vy) || 1, ux = vx / len, uy = vy / len, proj = (p.w[0] - o[0]) * ux + (p.w[1] - o[1]) * uy, s = Math.max(.02, proj / len); L.quad = q.map(pt => { const t = (pt[0] - o[0]) * ux + (pt[1] - o[1]) * uy; return [pt[0] + ux * (s - 1) * t, pt[1] + uy * (s - 1) * t]; }); }
    else if (d.kind === 'crop') { cropDrag(d, p.w); }
    else if (d.kind === 'cammove') { const cam = fr.cam[d.k]; cam.cx = d.cam.cx + p.w[0] - d.p0[0]; cam.cy = d.cam.cy + p.w[1] - d.p0[1]; }
    else if (d.kind === 'camscale') { const cam = fr.cam[d.k], c = [d.cam.cx, d.cam.cy], r0 = Math.hypot(d.p0[0] - c[0], d.p0[1] - c[1]) || 1, r1 = Math.hypot(p.w[0] - c[0], p.w[1] - c[1]) || 1; cam.zoom = Math.max(.1, Math.min(20, d.cam.zoom * r0 / r1)); }
    else if (d.kind === 'camrot') { const cam = fr.cam[d.k], c = [d.cam.cx, d.cam.cy]; let ang = Math.atan2(p.w[1] - c[1], p.w[0] - c[0]) - Math.atan2(d.p0[1] - c[1], d.p0[0] - c[0]); let deg = d.cam.rot + ang * 180 / Math.PI; if (e.shiftKey) deg = Math.round(deg / 5) * 5; cam.rot = deg; }
    render(); sideTick();
  });
  const endDrag = e => {
    const d = dragging; dragging = null; cv.style.cursor = '';
    if (!d) return;
    if (d.undoable && !d.moved) hist.pop();   // a tap that only selected something leaves no undo step
    histSync();
    if (d.kind === 'ink') { commit(d.l); thumbs(); }
    else if (d.kind === 'shape') { const p = ptr(e), kind = tool; strokeTo(d.l, d.a, shapePrev ? shapePrev.pts[1] : p.w, 1, kind); shapePrev = null; commit(d.l); thumbs(); }
    else if (d.kind === 'crop') { }
    render(); panel(); previewCam();
  };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('dblclick', e => { const p = ptr(e), L = hitLayer(p.w[0], p.w[1]); if (L && L.kind === 'text') { sel = L.id; panel(); const t = side.querySelector('[data-textarea]'); t && t.focus(); } });
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = ptr(e), before = toW(p.sx, p.sy), k = Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0016)); view.s = Math.max(.05, Math.min(12, view.s * k)); const after = toW(p.sx, p.sy); view.cx += before[0] - after[0]; view.cy += before[1] - after[1]; zoomLbl(); render(); }, { passive: false });
  /* crop: handles move the edges of the visible rectangle; the quad shrinks to match so the picture stays put */
  function cropDrag(d, w) {
    const L = d.L, H0 = SBR.homography(d.q0), [u, v] = H0.inv(w[0], w[1]), c0 = d.crop0; let u0 = 0, v0 = 0, u1 = 1, v1 = 1; const id = d.hid, lo = k => -c0[k === 'x' ? 'x' : 'y'] / c0[k === 'x' ? 'w' : 'h'], hi = k => (1 - c0[k === 'x' ? 'x' : 'y']) / c0[k === 'x' ? 'w' : 'h'];
    const set = (which, val) => { if (which === 'u0') u0 = Math.max(lo('x'), Math.min(u1 - .03, val)); if (which === 'u1') u1 = Math.min(hi('x'), Math.max(u0 + .03, val)); if (which === 'v0') v0 = Math.max(lo('y'), Math.min(v1 - .03, val)); if (which === 'v1') v1 = Math.min(hi('y'), Math.max(v0 + .03, val)); };
    const i = +id.slice(1); if (id[0] === 's') { if (i === 0) { set('u0', u); set('v0', v); } else if (i === 1) { set('u1', u); set('v0', v); } else if (i === 2) { set('u1', u); set('v1', v); } else { set('u0', u); set('v1', v); } } else { if (i === 0) set('v0', v); else if (i === 1) set('u1', u); else if (i === 2) set('v1', v); else set('u0', u); }
    L.quad = SBR.subQuad(d.q0, u0, v0, u1, v1); L.crop = { x: c0.x + u0 * c0.w, y: c0.y + v0 * c0.h, w: (u1 - u0) * c0.w, h: (v1 - v0) * c0.h };
  }

  /* ---------- layer operations ---------- */
  const newLayer = (o) => Object.assign({ id: uidf(), visible: true, locked: false, opacity: 1, crop: null }, o);
  function placeNew(l, wScale = 1) { const cq = camQ('a'), c = SBR.center(cq), [cw, ch] = SBR.quadSize(cq); const ratio = l.nw / l.nh, fitW = Math.min(cw * wScale, ch * wScale * ratio); l.quad = SBR.rectQuad(c[0], c[1], fitW, fitW / ratio, SBR.quadAngle(cq)); }
  async function addImage(file) { try { const im = await loadImageFile(file); pushHist(); const l = newLayer({ kind: 'image', name: (file.name || 'Image').replace(/\.[^.]+$/, '').slice(0, 24), src: im.src, nw: im.nw, nh: im.nh }); placeNew(l, .98); fr.layers.push(l); sel = l.id; tool = 'select'; toolSync(); panel(); render(); } catch (e) { toast('Could not read that image.', true); } }
  function addBlank() { pushHist(); const cq = camQ('a'), c = SBR.center(cq), [cw, ch] = SBR.quadSize(cq), l = newLayer({ kind: 'draw', name: 'Drawing ' + (fr.layers.filter(x => x.kind === 'draw').length + 1), src: '', nw: 1600, nh: Math.round(1600 / ar), quad: SBR.rectQuad(c[0], c[1], cw, ch, SBR.quadAngle(cq)) }); fr.layers.push(l); liveOf(l); sel = l.id; panel(); render(); }
  function addText(at) { pushHist(); const l = newLayer({ kind: 'text', name: 'Text', text: { s: 'Text', size: 72, color: ink === '#ffffff' ? '#111' : ink, font: 'Inter, system-ui, sans-serif', bold: true, bg: '' } }), bmp = SBR.textBitmap(l); l.nw = bmp.width; l.nh = bmp.height; const cq = camQ('a'), k = SBR.quadSize(cq)[0] / 1000; l.quad = SBR.rectQuad(at ? at[0] : SBR.center(cq)[0], at ? at[1] : SBR.center(cq)[1], l.nw * k * .6, l.nh * k * .6, 0); fr.layers.push(l); sel = l.id; tool = 'select'; toolSync(); panel(); render(); setTimeout(() => { const t = side.querySelector('[data-textarea]'); t && (t.focus(), t.select()); }, 40); }
  function retext(l) { const bmp = SBR.textBitmap(l), [w, hh] = SBR.quadSize(l.quad), k = (l.nw ? w / l.nw : 1); l.nw = bmp.width; l.nh = bmp.height; const c = SBR.center(l.quad), a = SBR.quadAngle(l.quad); l.quad = SBR.rectQuad(c[0], c[1], l.nw * k, l.nh * k, a); }
  function del() { const l = cur(); if (!l) return; pushHist(); fr.layers.splice(fr.layers.indexOf(l), 1); live.delete(l.id); sel = null; panel(); render(); }
  function dup(l = cur(), off = 24) { if (!l) return; pushHist(); if (l.kind === 'draw') commit(l); const c = D.clone(l); c.id = uidf(); c.name = l.name + ' copy'; c.quad = SBR.translate(c.quad, off, off); fr.layers.splice(fr.layers.indexOf(l) + 1, 0, c); if (c.kind === 'draw') liveOf(c); sel = c.id; panel(); render(); }
  function order(dir) { const l = cur(); if (!l) return; const i = fr.layers.indexOf(l), j = i + dir; if (j < 0 || j >= fr.layers.length) return; pushHist(); [fr.layers[i], fr.layers[j]] = [fr.layers[j], fr.layers[i]]; panel(); render(); }
  function copyLayer(cut) { const l = cur(); if (!l) return toast('Select a layer to copy.', true); if (l.kind === 'draw') commit(l); UI.sbClip = { layers: [D.clone(l)], t: Date.now() }; try { if (l.kind !== 'text' && l.src && navigator.clipboard && window.ClipboardItem) { fetch(l.src).then(r => r.blob()).then(bl => navigator.clipboard.write([new ClipboardItem({ [bl.type]: bl })])).catch(() => { }); } } catch (e) { } toast(cut ? 'Cut' : 'Copied — paste into any frame'); if (cut) del(); }
  function pasteLayer() { const cl = UI.sbClip; if (!cl || !cl.layers.length) return toast('Nothing copied yet.', true); pushHist(); cl.layers.forEach(src => { const c = D.clone(src); c.id = uidf(); const k = 24; c.quad = SBR.translate(c.quad, k, k); UI.sbClip.layers[0].quad = c.quad.map(p => p.slice()); fr.layers.push(c); if (c.kind === 'draw') liveOf(c); sel = c.id; }); panel(); render(); }
  const setQuadFrom = (fn) => { const l = cur(); if (!l) return; pushHist(); l.quad = fn(l); flat = null; panel(); render(); };
  const fitLayer = cover => setQuadFrom(l => { const cq = camQ('a'), c = SBR.center(cq), [cw, ch] = SBR.quadSize(cq), ratio = (l.crop ? l.crop.w * l.nw / (l.crop.h * l.nh) : l.nw / l.nh) || 1, k = cover ? Math.max(cw, ch * ratio) : Math.min(cw, ch * ratio); return SBR.rectQuad(c[0], c[1], k, k / ratio, SBR.quadAngle(cq)); });
  const resetDistort = () => setQuadFrom(l => { const c = SBR.center(l.quad), [w, hh] = SBR.quadSize(l.quad); return SBR.rectQuad(c[0], c[1], w, hh, SBR.quadAngle(l.quad)); });
  const resetCrop = () => { const l = cur(); if (!l || !l.crop) return; pushHist(); const c = l.crop, H0 = SBR.homography(l.quad); l.quad = [H0.fwd(-c.x / c.w, -c.y / c.h), H0.fwd((1 - c.x) / c.w, -c.y / c.h), H0.fwd((1 - c.x) / c.w, (1 - c.y) / c.h), H0.fwd(-c.x / c.w, (1 - c.y) / c.h)]; l.crop = null; panel(); render(); };
  function setSize(wNew, hNew) { const l = cur(); if (!l) return; pushHist(); const [w, hh] = SBR.quadSize(l.quad), c = SBR.center(l.quad); l.quad = SBR.scaleAbout(l.quad, c[0], c[1], wNew ? wNew / w : 1, hNew ? hNew / hh : 1); flat = null; panel(); render(); }
  /* 3D tilt around the layer's own centre, from the layer as it was when the sliders were first touched */
  function tilt(rx, ry, per) { const l = cur(); if (!l) return; if (!flat || flat.id !== l.id) { const c = SBR.center(l.quad), [w, hh] = SBR.quadSize(l.quad); flat = { id: l.id, cx: c[0], cy: c[1], w, h: hh, rot: SBR.quadAngle(l.quad), rx: 0, ry: 0, per: 2 }; } flat.rx = rx; flat.ry = ry; flat.per = per; l.quad = SBR.tiltQuad(flat, rx, ry, per); dirty = true; render(); }

  /* ---------- the panels ---------- */
  const side = h('div', { class: 'sbs-side' }), toolsEl = h('div', { class: 'sbs-tools' }), opts = h('div', { class: 'sbs-opts' }), zl = h('span', { class: 'sbs-zl' });
  const zoomLbl = () => { zl.textContent = Math.round(view.s * 100 / (W() / (SBR.WORLD_W)) ) + '%'; };
  const TOOLS = [['select', '↖', 'Select & transform (V)', 'v'], ['distort', '◇', '3D distort — drag the corners (D)', 'd'], ['crop', '⌗', 'Crop (C)', 'c'], ['pen', 'pen', 'Pen (P)', 'p'], ['eraser', 'eraser', 'Eraser (E)', 'e'], ['line', '╱', 'Line (L)', 'l'], ['arrow', '➔', 'Arrow (A)', 'a'], ['rect', '▭', 'Rectangle (R)', 'r'], ['ellipse', '◯', 'Ellipse (O)', 'o'], ['text', 'T', 'Text (T)', 't'], ['hand', '✋', 'Pan the pasteboard (H, or hold Space)', 'h'], ['camera', 'camera', 'Camera — move, zoom and rotate the shot (K)', 'k']];
  let toolHist = null;
  function toolSync() { toolHist = toolHist || [histBtn(false, 'sbs-tool sbs-hist'), histBtn(true, 'sbs-tool sbs-hist')]; toolsEl.replaceChildren(...TOOLS.map(([k, g, t]) => h('button', { class: 'sbs-tool' + (tool === k ? ' on' : ''), title: t, 'aria-label': t, onclick: () => { tool = k; toolSync(); optsDraw(); render(); } }, g.length > 2 ? icon(g, 17) : g)), h('span', { class: 'sbs-hist-sep' }), ...toolHist); optsDraw(); histSync(); }
  function optsDraw() {
    const drawing = ['pen', 'eraser', 'line', 'arrow', 'rect', 'ellipse', 'text'].includes(tool);
    opts.replaceChildren(drawing ? h('div', { class: 'row', style: { gap: '8px' } }, ...SB_INK.map(c => h('button', { class: 'sw' + (c === ink ? ' on' : ''), style: { background: c, border: c === '#ffffff' ? '1px solid #999' : '' }, title: c, onclick: () => { ink = c; const l = cur(); if (l && l.kind === 'text') { pushHist(); l.text.color = c; retext(l); } optsDraw(); render(); } })), h('input', { type: 'color', value: ink, title: 'Any colour', style: { width: '26px', height: '26px', padding: 0, border: 0, background: 'none' }, oninput: e => { ink = e.target.value; render(); } }),
      tool !== 'text' ? [h('span', { class: 'small muted' }, 'Size'), h('input', { type: 'range', min: 1, max: 60, value: size, style: { width: '120px' }, oninput: e => { size = +e.target.value; } })] : null, ['rect', 'ellipse'].includes(tool) ? h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: fillShape, onchange: e => { fillShape = e.target.checked; } }), 'Fill') : null) : h('span', { class: 'small muted' }, ({ select: 'Drag a layer to move it. Handles scale, the round handle rotates (Shift snaps). Alt-drag a corner scales from the centre.', distort: 'Drag any corner to pin the layer in perspective — line it up with the room, floor or horizon. Use the 3D tilt sliders for quick angles.', crop: 'Drag the handles to crop the selected layer. Reset crop restores it.', hand: 'Drag to pan. Scroll to zoom.', camera: 'Drag the camera box to reframe the shot; corner handles zoom, the round handle rolls. Set a camera B for a move.' })[tool] || ''));
  }
  const thumbEls = new Map();
  function thumbs() { thumbEls.forEach((cvv, id) => { const l = byId(id); if (!l) return; const g = cvv.getContext('2d'); g.clearRect(0, 0, cvv.width, cvv.height); g.fillStyle = '#e9e9ee'; g.fillRect(0, 0, cvv.width, cvv.height); const bmp = SBR.bitmapOf(l, live); if (bmp) { const [nw, nh] = SBR.natural(bmp), k = Math.min(cvv.width / nw, cvv.height / nh); g.drawImage(bmp, (cvv.width - nw * k) / 2, (cvv.height - nh * k) / 2, nw * k, nh * k); } }); }
  const numField = (label, val, onch, step = 1) => h('label', { class: 'sbs-n' }, h('span', {}, label), h('input', { class: 'cell', type: 'number', step, value: Math.round(val * 100) / 100, onchange: e => onch(+e.target.value) }));
  let sideTick = () => { };
  function panel() {
    const L = cur(), sceneShots = P.shots.filter(s => s.sceneId === fr.sceneId); thumbEls.clear();
    const sec = (title, ...kids) => h('section', { class: 'sbs-sec' }, h('h4', {}, title), ...kids);
    /* layers */
    const list = h('div', { class: 'sbs-layers' }, [...fr.layers].reverse().map(l => { const tc = h('canvas', { width: 44, height: 30 }); thumbEls.set(l.id, tc);
      return h('div', { class: 'sbs-layer' + (l.id === sel ? ' on' : '') + (l.visible === false ? ' off' : ''), onclick: () => { sel = l.id; if (['pen', 'eraser'].includes(tool) && l.kind !== 'draw') { } panel(); render(); } },
        h('button', { class: 'ib', title: 'Show / hide', onclick: e => { e.stopPropagation(); pushHist(); l.visible = l.visible === false; panel(); render(); } }, l.visible === false ? '◌' : '●'), tc,
        h('input', { class: 'sbs-name', value: l.name, onclick: e => e.stopPropagation(), onchange: e => { pushHist(); l.name = e.target.value; } }), h('button', { class: 'ib', title: 'Lock', onclick: e => { e.stopPropagation(); l.locked = !l.locked; panel(); } }, l.locked ? '🔒' : '🔓')); }));
    const addMenu = e => menu(e.currentTarget, [{ label: 'Image from file…', icon: 'image', onClick: async () => { const fs = await pickFiles('image/*'); for (const f of fs) await addImage(f); } }, { label: 'Blank drawing layer', icon: 'pen', onClick: addBlank }, { label: 'Text', icon: 'edit', onClick: () => addText() }, { label: 'Paste (Ctrl+V)', icon: 'copy', onClick: pasteLayer }]);
    const props = !L ? h('p', { class: 'small muted', style: { margin: '4px 0' } }, 'Select a layer to move, scale, rotate, crop or distort it. You can also paste an image (Ctrl+V) or drop a file on the canvas.') : (() => {
      const c = SBR.center(L.quad), [w, hh] = SBR.quadSize(L.quad), ang = SBR.quadAngle(L.quad) * 180 / Math.PI;
      return h('div', {}, h('div', { class: 'sbs-row' }, h('span', { class: 'small muted' }, 'Opacity'), h('input', { type: 'range', min: 0, max: 1, step: .01, value: L.opacity === undefined ? 1 : L.opacity, style: { flex: 1 }, oninput: e => { L.opacity = +e.target.value; render(); }, onchange: () => { pushHist(); } })),
        h('div', { class: 'sbs-grid2' }, numField('X', c[0], v => setQuadFrom(l => SBR.translate(l.quad, v - SBR.center(l.quad)[0], 0))), numField('Y', c[1], v => setQuadFrom(l => SBR.translate(l.quad, 0, v - SBR.center(l.quad)[1]))), numField('W', w, v => setSize(v, 0)), numField('H', hh, v => setSize(0, v)), numField('Rotate °', ang, v => setQuadFrom(l => { const cc = SBR.center(l.quad); return SBR.rotateAbout(l.quad, cc[0], cc[1], (v - SBR.quadAngle(l.quad) * 180 / Math.PI) * Math.PI / 180); }), 1)),
        h('div', { class: 'row wrap', style: { gap: '4px', margin: '8px 0' } }, h('button', { class: 'btn sm', onclick: () => setQuadFrom(l => SBR.flipH(l.quad)) }, 'Flip ↔'), h('button', { class: 'btn sm', onclick: () => setQuadFrom(l => SBR.flipV(l.quad)) }, 'Flip ↕'), h('button', { class: 'btn sm', onclick: () => fitLayer(false) }, 'Fit'), h('button', { class: 'btn sm', onclick: () => fitLayer(true) }, 'Fill'), h('button', { class: 'btn sm', onclick: () => setQuadFrom(l => { const cc = SBR.center(l.quad), cq = SBR.center(camQ('a')); return SBR.translate(l.quad, cq[0] - cc[0], cq[1] - cc[1]); }) }, 'Centre'), L.crop ? h('button', { class: 'btn sm', onclick: resetCrop }, 'Reset crop') : null, h('button', { class: 'btn sm', onclick: resetDistort }, 'Flatten')),
        h('div', { class: 'small muted', style: { margin: '6px 0 2px' } }, '3D tilt (from the layer as it is now)'),
        ['Tilt up/down', 'Tilt left/right', 'Perspective'].map((lab, i) => h('div', { class: 'sbs-row' }, h('span', { class: 'small', style: { width: '92px' } }, lab), h('input', { type: 'range', min: i < 2 ? -70 : 1, max: i < 2 ? 70 : 6, step: i < 2 ? 1 : .1, value: i === 0 ? (flat && flat.id === L.id ? flat.rx : 0) : i === 1 ? (flat && flat.id === L.id ? flat.ry : 0) : (flat && flat.id === L.id ? flat.per : 2), style: { flex: 1 }, onpointerdown: () => pushHist(), oninput: e => { const v = +e.target.value, f = flat && flat.id === L.id ? flat : { rx: 0, ry: 0, per: 2 }; tilt(i === 0 ? v : f.rx, i === 1 ? v : f.ry, i === 2 ? v : f.per); } }))),
        L.kind === 'text' ? h('div', { style: { marginTop: '8px' } }, h('textarea', { class: 'inp', 'data-textarea': 1, rows: 2, value: L.text.s, oninput: e => { L.text.s = e.target.value; retext(L); render(); thumbs(); } }), h('div', { class: 'sbs-row', style: { marginTop: '4px' } }, h('span', { class: 'small' }, 'Size'), h('input', { type: 'range', min: 16, max: 220, value: L.text.size, style: { flex: 1 }, oninput: e => { L.text.size = +e.target.value; retext(L); render(); thumbs(); } }), h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!L.text.bold, onchange: e => { L.text.bold = e.target.checked; retext(L); render(); } }), 'Bold'), h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!L.text.bg, onchange: e => { L.text.bg = e.target.checked ? '#ffffff' : ''; retext(L); render(); } }), 'Box'))) : null);
    })();
    const layerSec = sec('Layers', h('div', { class: 'row', style: { gap: '4px', marginBottom: '6px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm primary', onclick: addMenu }, icon('plus', 13), 'Add'), ibtn('up', 'Bring forward  ]', () => order(1)), ibtn('down', 'Send back  [', () => order(-1)), ibtn('copy', 'Duplicate (Ctrl+D)', () => dup()), ibtn('trash', 'Delete layer (Del)', del, 'danger')), list, h('div', { style: { marginTop: '8px' } }, props));
    /* camera */
    const k = camMode === 'b' && fr.cam.b ? 'b' : 'a', cam = fr.cam[k], presets = SBR.camPresets(fr.cam.a, ar);
    const preset = (label, to) => h('button', { class: 'btn sm', onclick: () => { pushHist(); fr.cam.b = to ? { ...to } : null; if (!to) camMode = 'a'; panel(); render(); previewCam(); } }, label);
    const camSec = sec('Camera', h('div', { class: 'seg', style: { marginBottom: '8px' } }, h('button', { class: camMode === 'a' ? 'on' : '', onclick: () => { camMode = 'a'; panel(); render(); } }, 'A · start'), h('button', { class: camMode === 'b' ? 'on' : '', disabled: !fr.cam.b, onclick: () => { camMode = 'b'; panel(); render(); } }, 'B · end')),
      h('div', { class: 'sbs-grid2' }, numField('Zoom ×', cam.zoom, v => { pushHist(); cam.zoom = Math.max(.1, v || 1); panel(); render(); previewCam(); }, .1), numField('Roll °', cam.rot || 0, v => { pushHist(); cam.rot = v; panel(); render(); previewCam(); }), numField('Pan X', cam.cx, v => { pushHist(); cam.cx = v; render(); previewCam(); }), numField('Pan Y', cam.cy, v => { pushHist(); cam.cy = v; render(); previewCam(); })),
      h('div', { class: 'small muted', style: { margin: '8px 0 4px' } }, 'Camera move (A → B)'), h('div', { class: 'row wrap', style: { gap: '4px' } }, preset('Static', null), preset('Push in', presets.push), preset('Pull out', presets.pull), preset('Pan ←', presets.panL), preset('Pan →', presets.panR), preset('Tilt ↑', presets.tiltU), preset('Tilt ↓', presets.tiltD), preset('Roll', presets.roll), !fr.cam.b ? h('button', { class: 'btn sm', onclick: () => { pushHist(); fr.cam.b = { ...fr.cam.a }; camMode = 'b'; tool = 'camera'; toolSync(); panel(); render(); } }, 'Custom B…') : null),
      fr.cam.b ? h('div', { class: 'row', style: { marginTop: '8px', gap: '8px' } }, h('select', { class: 'inp', style: { width: 'auto' }, onchange: e => { fr.cam.ease = e.target.value; dirty = true; } }, [['inout', 'Ease in & out'], ['linear', 'Linear'], ['in', 'Ease in'], ['out', 'Ease out']].map(([v, l]) => h('option', { value: v, selected: v === (fr.cam.ease || 'inout') }, l))), h('input', { type: 'range', min: 0, max: 1, step: .01, value: tT, style: { flex: 1 }, oninput: e => { tT = +e.target.value; previewCam(); render(); } }), h('button', { class: 'btn sm', onclick: playMove }, playing ? 'Stop' : 'Play')) : null,
      h('canvas', { class: 'sbs-prev', width: 288, height: Math.round(288 / ar), id: 'sbsPrev' }));
    /* frame */
    const dl = h('datalist', { id: 'dl-sb-size' }, (SHOT_OPTS.size || []).map(o => h('option', { value: o }))), dla = h('datalist', { id: 'dl-sb-angle' }, (SHOT_OPTS.angle || []).map(o => h('option', { value: o }))), dlm = h('datalist', { id: 'dl-sb-move' }, (SHOT_OPTS.move || []).map(o => h('option', { value: o })));
    const fld = (lab, el) => h('div', { class: 'field', style: { marginBottom: '8px' } }, h('label', { class: 'lbl' }, lab), el);
    const frameSec = sec('Frame', fld('Caption', h('textarea', { class: 'inp', rows: 2, value: fr.caption || '', placeholder: 'Action, dialogue, intent…', oninput: e => { fr.caption = e.target.value; dirty = true; } })), fld('Notes for the crew', h('textarea', { class: 'inp', rows: 2, value: fr.notes || '', oninput: e => { fr.notes = e.target.value; dirty = true; } })),
      h('div', { class: 'sbs-grid2' }, fld('Seconds', h('input', { class: 'inp', type: 'number', min: .5, step: .5, value: fr.dur || 3, onchange: e => { fr.dur = +e.target.value || 3; dirty = true; } })), fld('Sequence', h('select', { class: 'inp', onchange: e => { fr.seqId = e.target.value; dirty = true; } }, h('option', { value: '' }, '— none —'), (P.seqs || []).map(s => h('option', { value: s.id, selected: s.id === fr.seqId }, s.name))))),
      fld('Scene (optional)', h('select', { class: 'inp', onchange: e => { fr.sceneId = e.target.value; if (!sceneShots.some(s => s.id === fr.shotId)) fr.shotId = ''; dirty = true; panel(); } }, h('option', { value: '' }, '— not tied to a scene —'), scenes.map(s => h('option', { value: s.id, selected: s.id === fr.sceneId }, `${s.num}. ${s.label}`.slice(0, 54))))),
      fld('Linked shot (optional)', h('select', { class: 'inp', disabled: !fr.sceneId, onchange: e => { fr.shotId = e.target.value; const s = P.shots.find(x => x.id === fr.shotId); if (s) { ['size', 'angle', 'move', 'lens'].forEach(f => { if (!fr[f]) fr[f] = s[f] || ''; }); } dirty = true; panel(); } }, h('option', { value: '' }, fr.sceneId ? '— no shot yet —' : 'Pick a scene first'), P.shots.filter(s => s.sceneId === fr.sceneId).map(s => h('option', { value: s.id, selected: s.id === fr.shotId }, `${shotLabel(P, s, scenes)} ${s.size || ''} ${s.desc || ''}`.slice(0, 56))))),
      h('div', { class: 'sbs-grid2' }, ['size', 'angle', 'move', 'lens'].map(f => fld({ size: 'Shot size', angle: 'Angle', move: 'Movement', lens: 'Lens' }[f], h('input', { class: 'inp', list: f === 'lens' ? undefined : 'dl-sb-' + f, value: fr[f] || '', onchange: e => { fr[f] = e.target.value; dirty = true; } })))),
      fr.shotId ? h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: fr.sync !== false, onchange: e => { fr.sync = e.target.checked; } }), 'Update the linked shot when I save') : (fr.sceneId ? h('button', { class: 'btn sm', onclick: () => { UI.sbMakeShot = true; toast('A shot will be created from this frame when you save.'); } }, icon('camera', 13), 'Create a shot from this frame') : null), dl, dla, dlm);
    side.replaceChildren(layerSec, camSec, frameSec); thumbs(); previewCam(); sideTick = () => { const L2 = cur(); if (!L2) return; };
  }
  function previewCam() { const c = document.getElementById('sbsPrev'); if (!c) return; const g = c.getContext('2d'); SBR.renderFrame(g, c.width, c.height, fr, ar, tT, { live }); }
  function playMove() { if (playing) { cancelAnimationFrame(playing); playing = null; panel(); return; } const dur = (fr.dur || 3) * 1000, t0 = performance.now(); const step = now => { tT = Math.min(1, (now - t0) / dur); previewCam(); render(); if (tT < 1) playing = requestAnimationFrame(step); else { playing = null; panel(); } }; playing = requestAnimationFrame(step); panel(); }

  /* ---------- the shell ---------- */
  let ov, closing = false;
  function close(save) {
    if (closing) return; closing = true; if (playing) cancelAnimationFrame(playing); document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); document.removeEventListener('paste', onPaste, true); window.removeEventListener('resize', resize); ro && ro.disconnect(); SBR.setOnLoad(null); ov.remove();
    if (save) { fr.layers.forEach(l => { if (l.kind === 'draw') commit(l); }); finish(); }
  }
  async function cancel() {
    if (document.querySelector('body > .overlay')) return;                       // a question is already open
    if (changed() && !(await confirmBox('Discard your changes to this frame?', 'Discard', 'Unsaved changes'))) return;
    close(false);
  }
  async function finish() { const out = D.clone(fr); delete out.base; delete out.ink; out.base = ''; out.ink = ''; out.sceneId = out.sceneId || ''; const c = await flatFrame(out, ar, 1000, 0); out.img = c.toDataURL('image/jpeg', .86); onSave(out, !!UI.sbMakeShot); UI.sbMakeShot = false; }
  async function exportPng() { const c = await flatFrame(fr, ar, 1920); c.toBlob(bl => { const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'storyboard-frame.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }); }
  function histBtn(isRedo, cls = '') { const b = ibtn(isRedo ? 'redo' : 'undo', isRedo ? 'Redo (Ctrl+Y, or tap with three fingers)' : 'Undo (Ctrl+Z, or tap with two fingers)', isRedo ? redoIt : undo, cls); histBtns.push([b, isRedo]); return b; }
  const top = h('div', { class: 'sbs-top' }, h('b', {}, 'Frame studio'), h('span', { class: 'small muted' }, 'Your pasteboard is larger than the frame — park reference images off to the side and reframe with the camera.'), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm sbs-sidebtn', title: 'Layers, camera and frame details', onclick: () => { ov.classList.toggle('side-open'); setTimeout(() => { resize(); }, 30); } }, icon('layers', 14), 'Panels'),
    histBtn(false), histBtn(true), h('span', { class: 'sep' }), ibtn('minus', 'Zoom out', () => { view.s = Math.max(.05, view.s / 1.25); zoomLbl(); render(); }), zl, ibtn('plus', 'Zoom in', () => { view.s = Math.min(12, view.s * 1.25); zoomLbl(); render(); }), h('button', { class: 'btn sm', onclick: () => { fit(); zoomLbl(); } }, 'Fit'),
    h('button', { class: 'btn sm' + (onion ? ' active' : ''), title: 'Ghost the previous frame', onclick: e => { onion = !onion; e.currentTarget.classList.toggle('active', onion); if (onion) loadOnion(); render(); } }, 'Onion skin'), h('button', { class: 'btn sm', onclick: e => { thirds = !thirds; e.currentTarget.classList.toggle('active', thirds); render(); } }, icon('grid', 14), 'Thirds'),
    h('button', { class: 'btn sm', onclick: exportPng }, icon('download', 14), 'PNG'), h('span', { class: 'sep' }), h('button', { class: 'btn', onclick: cancel }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => close(true) }, icon('check', 15), 'Save frame'));
  ov = h('div', { class: 'sbs' }, top, opts, h('div', { class: 'sbs-body' }, toolsEl, stage, side)); document.body.append(ov);
  const ro = window.ResizeObserver ? new ResizeObserver(() => resize()) : null; ro && ro.observe(stage); window.addEventListener('resize', resize);
  stage.addEventListener('dragover', e => e.preventDefault()); stage.addEventListener('drop', async e => { e.preventDefault(); for (const f of e.dataTransfer.files) if (/^image\//.test(f.type)) await addImage(f); });
  const onPaste = async e => { if (/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) return; const items = [...(e.clipboardData ? e.clipboardData.items : [])].filter(i => i.type.startsWith('image/')); if (items.length) { e.preventDefault(); e.stopPropagation(); for (const it of items) { const f = it.getAsFile(); if (f) await addImage(f); } } else if (UI.sbClip) { e.preventDefault(); e.stopPropagation(); pasteLayer(); } };
  function onKey(e) {
    const tag = (e.target || {}).tagName || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag)) { if (e.key === 'Escape') e.target.blur(); return; }
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey; e.stopPropagation();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redoIt() : undo(); } else if (mod && k === 'y') { e.preventDefault(); redoIt(); } else if (mod && k === 'c') { e.preventDefault(); copyLayer(false); } else if (mod && k === 'x') { e.preventDefault(); copyLayer(true); } else if (mod && k === 'd') { e.preventDefault(); dup(); } else if (mod && k === 'v') { /* handled by the paste event */ } else if (mod && k === 's') { e.preventDefault(); close(true); }
    else if (k === ' ') { e.preventDefault(); space = true; cv.style.cursor = 'grab'; } else if (k === 'delete' || k === 'backspace') { e.preventDefault(); del(); } else if (k === '[') order(-1); else if (k === ']') order(1);
    else if (k === 'escape') cancel();
    else if (k === '=' || k === '+') { view.s = Math.min(12, view.s * 1.2); zoomLbl(); render(); } else if (k === '-') { view.s = Math.max(.05, view.s / 1.2); zoomLbl(); render(); } else if (k === '0') { fit(); zoomLbl(); }
    else if (k.startsWith('arrow') && cur() && !mod) { e.preventDefault(); const st = e.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -st : k === 'arrowright' ? st : 0, dy = k === 'arrowup' ? -st : k === 'arrowdown' ? st : 0; pushHist(); cur().quad = SBR.translate(cur().quad, dx, dy); panel(); render(); }
    else if (!mod) { const t = TOOLS.find(x => x[3] === k); if (t) { tool = t[0]; toolSync(); render(); } }
  }
  function onKeyUp(e) { if (e.key === ' ') { space = false; cv.style.cursor = ''; } }
  document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true); document.addEventListener('paste', onPaste, true);
  toolSync(); panel(); setTimeout(() => { resize(); fit(); zoomLbl(); cv.focus(); }, 30); setTimeout(() => { resize(); fit(); zoomLbl(); }, 250);
  if (UI.sbDebug) UI.sbDebug.api = { fr, handleSet, toS, toW, view, live, cur: () => cur(), tool: () => tool, camQ, pushHist };
  if (!fr.layers.length) { /* empty frame: start on the pen with a drawing layer ready */ tool = 'pen'; toolSync(); }
}
