'use strict';
/* ===================================================================
   Storyboard renderer & geometry. A frame is a pasteboard ("world",
   1000 units wide) holding layers; each layer is a bitmap pinned to a
   four-corner quad (so it can be moved, scaled, rotated, cropped and
   3D-distorted). A camera rectangle (with optional end position) says
   what the shot actually sees, and moves over the frame's duration.
   =================================================================== */
const SBR = (() => {
  const WORLD_W = 1000;
  /* ---------- geometry (pure) ---------- */
  const rectQuad = (cx, cy, w, h, rot = 0) => { const c = Math.cos(rot), s = Math.sin(rot), pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]; return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]); };
  const center = q => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const quadSize = q => [(dist(q[0], q[1]) + dist(q[3], q[2])) / 2, (dist(q[0], q[3]) + dist(q[1], q[2])) / 2];
  const quadAngle = q => Math.atan2((q[1][1] - q[0][1]) + (q[2][1] - q[3][1]), (q[1][0] - q[0][0]) + (q[2][0] - q[3][0]));
  const mapPts = (q, f) => q.map(p => f(p[0], p[1]));
  const bbox = q => { const xs = q.map(p => p[0]), ys = q.map(p => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
  /* unit square (0,0)(1,0)(1,1)(0,1) -> quad (TL,TR,BR,BL): Heckbert's projective mapping */
  function homography(q) {
    const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3; let a, b, c, d, e, f, g, h;
    if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) { a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; g = h = 0; }
    else { const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, det = dx1 * dy2 - dx2 * dy1 || 1e-12; g = (sx * dy2 - dx2 * sy) / det; h = (dx1 * sy - sx * dy1) / det; a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0; }
    const M = [a, b, c, d, e, f, g, h, 1];
    const fwd = (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
    // inverse of the 3x3
    const A = M[0], B = M[1], C = M[2], D = M[3], E = M[4], F = M[5], G = M[6], H = M[7], I = 1, det = A * (E * I - F * H) - B * (D * I - F * G) + C * (D * H - E * G) || 1e-12;
    const inv = [(E * I - F * H) / det, (C * H - B * I) / det, (B * F - C * E) / det, (F * G - D * I) / det, (A * I - C * G) / det, (C * D - A * F) / det, (D * H - E * G) / det, (B * G - A * H) / det, (A * E - B * D) / det];
    const back = (x, y) => { const w = inv[6] * x + inv[7] * y + inv[8]; return [(inv[0] * x + inv[1] * y + inv[2]) / w, (inv[3] * x + inv[4] * y + inv[5]) / w]; };
    return { fwd, inv: back, affine: g === 0 && h === 0, a, b, c, d, e, f };
  }
  const pointInQuad = (q, x, y) => { let neg = false, pos = false; for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4], cr = (n[0] - p[0]) * (y - p[1]) - (n[1] - p[1]) * (x - p[0]); if (cr < 0) neg = true; if (cr > 0) pos = true; } return !(neg && pos); };
  /* the part of a quad covering [u0,u1]x[v0,v1] of itself */
  const subQuad = (q, u0, v0, u1, v1) => { const H = homography(q); return [H.fwd(u0, v0), H.fwd(u1, v0), H.fwd(u1, v1), H.fwd(u0, v1)]; };
  const affineApply = (q, f) => q.map(p => f(p[0], p[1]));
  const scaleAbout = (q, cx, cy, sx, sy = sx) => q.map(p => [cx + (p[0] - cx) * sx, cy + (p[1] - cy) * sy]);
  const rotateAbout = (q, cx, cy, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return q.map(p => { const x = p[0] - cx, y = p[1] - cy; return [cx + x * c - y * s, cy + x * s + y * c]; }); };
  const translate = (q, dx, dy) => q.map(p => [p[0] + dx, p[1] + dy]);
  const flipH = q => [q[1], q[0], q[3], q[2]].map(p => [p[0], p[1]]), flipV = q => [q[3], q[2], q[1], q[0]].map(p => [p[0], p[1]]);
  /* tilt a flat rectangle in 3D (degrees about X and Y) with a pinhole camera, returning the projected quad */
  function tiltQuad(flat, rxDeg, ryDeg, persp = 2) {
    const { cx, cy, w, h, rot } = flat, rx = rxDeg * Math.PI / 180, ry = ryDeg * Math.PI / 180, D = Math.max(w, h) * Math.max(0.6, persp);
    return rectQuad(0, 0, w, h, 0).map(([x, y]) => {
      let X = x, Y = y, Z = 0; const cY = Math.cos(ry), sY = Math.sin(ry); [X, Z] = [X * cY + Z * sY, -X * sY + Z * cY];
      const cX = Math.cos(rx), sX = Math.sin(rx); [Y, Z] = [Y * cX - Z * sX, Y * sX + Z * cX];
      const k = D / (D - Z), px = X * k, py = Y * k, c = Math.cos(rot), s = Math.sin(rot); return [cx + px * c - py * s, cy + px * s + py * c];
    });
  }
  /* ---------- camera ---------- */
  const worldH = ar => WORLD_W / ar;
  const defaultCam = ar => ({ cx: WORLD_W / 2, cy: worldH(ar) / 2, zoom: 1, rot: 0 });
  const camQuad = (cam, ar) => rectQuad(cam.cx, cam.cy, WORLD_W / cam.zoom, worldH(ar) / cam.zoom, (cam.rot || 0) * Math.PI / 180);
  const ease = (t, mode) => mode === 'linear' ? t : mode === 'in' ? t * t : mode === 'out' ? 1 - (1 - t) * (1 - t) : t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const camAt = (cams, t, ar) => { const a = (cams && cams.a) || defaultCam(ar), b = cams && cams.b; if (!b) return a; const k = ease(Math.max(0, Math.min(1, t)), cams.ease || 'inout'); return { cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)), rot: lerp(a.rot || 0, b.rot || 0, k) }; };
  /* world -> canvas pixels for a camera filling a W x H canvas */
  function camProject(cam, W, H, ar) { const s = W / (WORLD_W / cam.zoom), r = -(cam.rot || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r); return (x, y) => { const dx = x - cam.cx, dy = y - cam.cy; return [(dx * c - dy * sn) * s + W / 2, (dx * sn + dy * c) * s + H / 2]; }; }
  const camPresets = (a, ar) => {
    const w = WORLD_W / a.zoom, make = o => Object.assign({}, a, o);
    return { push: make({ zoom: a.zoom * 1.5 }), pull: make({ zoom: a.zoom / 1.5 }), panL: make({ cx: a.cx - w * 0.35 }), panR: make({ cx: a.cx + w * 0.35 }), tiltU: make({ cy: a.cy - worldH(ar) / a.zoom * 0.35 }), tiltD: make({ cy: a.cy + worldH(ar) / a.zoom * 0.35 }), roll: make({ rot: (a.rot || 0) + 15 }) };
  };

  /* ---------- bitmaps ---------- */
  const IMGS = new Map(), WAIT = new Set(); let onLoaded = null;
  const textCache = new Map();
  function imageFor(src) {
    if (!src) return null; let e = IMGS.get(src); if (e) return e.ok ? e.img : null;
    const img = new Image(); e = { img, ok: false }; IMGS.set(src, e); if (IMGS.size > 120) { const k = IMGS.keys().next().value; IMGS.delete(k); }
    img.onload = () => { e.ok = true; WAIT.delete(src); onLoaded && onLoaded(); }; img.onerror = () => { e.ok = false; WAIT.delete(src); }; WAIT.add(src); img.src = src; return null;
  }
  const ready = frame => new Promise(res => { const need = (frame.layers || []).filter(l => l.kind !== 'text' && l.src).map(l => l.src); let n = 0; const tick = () => { if (need.every(s => { const e = IMGS.get(s); return e && (e.ok || !WAIT.has(s)); })) res(); else if (n++ < 100) setTimeout(tick, 40); else res(); }; need.forEach(imageFor); tick(); });
  /* text becomes a bitmap so it can be warped like everything else */
  function textBitmap(l) {
    const t = l.text || {}, key = JSON.stringify([t.s, t.size, t.color, t.font, t.bold, t.bg]); let c = textCache.get(key); if (c) return c;
    const size = t.size || 64, font = `${t.bold ? '700 ' : ''}${size}px ${t.font || 'Inter, system-ui, sans-serif'}`, lines = String(t.s || '').split('\n'), m = document.createElement('canvas').getContext('2d'); m.font = font;
    const w = Math.max(20, Math.ceil(Math.max(...lines.map(x => m.measureText(x).width)) + size * .5)), h = Math.ceil(lines.length * size * 1.25 + size * .3); c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (t.bg) { g.fillStyle = t.bg; g.fillRect(0, 0, w, h); } g.font = font; g.fillStyle = t.color || '#111'; g.textBaseline = 'top'; lines.forEach((x, i) => g.fillText(x, size * .25, size * .15 + i * size * 1.25)); textCache.set(key, c); if (textCache.size > 60) textCache.delete(textCache.keys().next().value); return c;
  }
  const bitmapOf = (l, live) => l.kind === 'text' ? textBitmap(l) : ((live && live.get(l.id)) || imageFor(l.src));
  const natural = b => b ? [b.naturalWidth || b.width, b.naturalHeight || b.height] : [0, 0];

  /* ---------- drawing a bitmap onto a quad (affine, or perspective by mesh) ---------- */
  function triAffine(s0, s1, s2, d0, d1, d2) {   // maps source triangle to destination triangle
    const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]) || 1e-12;
    const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / det, c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / det;
    const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / det, d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / det;
    return [a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]];
  }
  function drawQuad(ctx, bmp, crop, q) {
    const [nw, nh] = natural(bmp); if (!nw) return; const cr = crop || { x: 0, y: 0, w: 1, h: 1 }, sx = cr.x * nw, sy = cr.y * nh, sw = cr.w * nw, sh = cr.h * nh, H = homography(q);
    if (H.affine) { ctx.save(); ctx.transform(H.a / sw, H.d / sw, H.b / sh, H.e / sh, H.c - H.a * sx / sw - H.b * sy / sh, H.f - H.d * sx / sw - H.e * sy / sh); ctx.drawImage(bmp, sx, sy, sw, sh, sx, sy, sw, sh); ctx.restore(); return; }
    const bb = bbox(q), span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0), N = Math.max(8, Math.min(22, Math.round(span / 40)));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N, p00 = H.fwd(u0, v0), p10 = H.fwd(u1, v0), p01 = H.fwd(u0, v1), p11 = H.fwd(u1, v1);
      const s00 = [sx + u0 * sw, sy + v0 * sh], s10 = [sx + u1 * sw, sy + v0 * sh], s01 = [sx + u0 * sw, sy + v1 * sh], s11 = [sx + u1 * sw, sy + v1 * sh];
      [[s00, s10, s01, p00, p10, p01], [s10, s11, s01, p10, p11, p01]].forEach(([a, b, c, d, e, f]) => {
        const cx = (d[0] + e[0] + f[0]) / 3, cy = (d[1] + e[1] + f[1]) / 3, grow = p => [p[0] + (p[0] - cx) * .06 + Math.sign(p[0] - cx) * .4, p[1] + (p[1] - cy) * .06 + Math.sign(p[1] - cy) * .4], M = triAffine(a, b, c, d, e, f);
        ctx.save(); ctx.beginPath(); const g0 = grow(d), g1 = grow(e), g2 = grow(f); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.closePath(); ctx.clip(); ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        const rx = Math.min(a[0], b[0], c[0]), ry = Math.min(a[1], b[1], c[1]), rw = Math.max(a[0], b[0], c[0]) - rx, rh = Math.max(a[1], b[1], c[1]) - ry; ctx.drawImage(bmp, rx, ry, rw + 1, rh + 1, rx, ry, rw + 1, rh + 1); ctx.restore();
      });
    }
  }
  /* draw every visible layer, using proj(x,y) to turn world points into canvas pixels */
  function drawLayers(ctx, frame, proj, live, opts = {}) {
    (frame.layers || []).forEach(l => {
      if (l.visible === false || (opts.skip && opts.skip.has(l.id))) return; const bmp = bitmapOf(l, live); if (!bmp) return;
      ctx.save(); ctx.globalAlpha = l.opacity === undefined ? 1 : l.opacity; drawQuad(ctx, bmp, l.crop, l.quad.map(p => proj(p[0], p[1]))); ctx.restore();
    });
  }
  /* a finished picture of what the camera sees at time t (0..1) */
  function renderFrame(ctx, W, H, frame, ar, t = 0, o = {}) {
    const cam = o.cam || camAt(frame.cam, t, ar); ctx.save(); ctx.fillStyle = frame.bg || '#ffffff'; ctx.fillRect(0, 0, W, H); drawLayers(ctx, frame, camProject(cam, W, H, ar), o.live); ctx.restore();
  }
  const setOnLoad = f => { onLoaded = f; };
  /* upgrade a frame saved by the old two-layer editor into layers */
  function ensureLayers(fr, ar, uid) {
    if (Array.isArray(fr.layers)) return fr; const H = worldH(ar), full = rectQuad(WORLD_W / 2, H / 2, WORLD_W, H), L = [];
    const mk = (name, kind, src) => ({ id: uid(), kind, name, visible: true, locked: false, opacity: 1, quad: full.map(p => p.slice()), crop: null, src, nw: 1000, nh: Math.round(H) });
    if (fr.base) L.push(mk('Background image', 'image', fr.base)); if (fr.ink) L.push(mk('Drawing', 'draw', fr.ink)); if (!L.length && fr.img) L.push(mk('Image', 'image', fr.img));
    fr.layers = L; fr.cam = fr.cam || { a: defaultCam(ar), b: null, ease: 'inout' }; return fr;
  }
  return { WORLD_W, rectQuad, center, dist, quadSize, quadAngle, mapPts, bbox, homography, pointInQuad, subQuad, scaleAbout, rotateAbout, translate, flipH, flipV, tiltQuad, worldH, defaultCam, camQuad, camAt, camProject, camPresets, ease, lerp, imageFor, ready, bitmapOf, natural, textBitmap, drawQuad, drawLayers, renderFrame, setOnLoad, ensureLayers };
})();
if (typeof module !== 'undefined') module.exports = SBR;
