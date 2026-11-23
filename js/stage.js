'use strict';
/* ===================================================================
   Stage tools — blocking diagrams (with animated frames) and cue sheet
   =================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); kids.flat().forEach(c => c && e.append(c.nodeType ? c : document.createTextNode(c))); return e; };
const STAGE_COLORS = ['#e5484d', '#2468d8', '#1e8e54', '#e8830c', '#7a45c9', '#d6409f', '#12a594', '#8a6d3b'];
const KINDS = {
  actor: { label: 'Actor', w: 24 }, chair: { label: 'Chair' }, table: { label: 'Table' }, sofa: { label: 'Sofa' }, bed: { label: 'Bed' },
  door: { label: 'Door' }, platform: { label: 'Platform' }, prop: { label: 'Prop' }, text: { label: 'Label' },
  camera: { label: 'Camera' }, light: { label: 'Light' }, boom: { label: 'Boom mic' },
  strobe: { label: 'Strobe / head' }, softbox: { label: 'Softbox' }, umbrella: { label: 'Umbrella' }, reflector: { label: 'Reflector' }, backdrop: { label: 'Backdrop' }, flag: { label: 'Flag / V-flat' }, mark: { label: 'Talent mark' },
};
const PHOTO_ONLY = new Set(['strobe', 'softbox', 'umbrella', 'reflector', 'backdrop', 'flag', 'mark']), STAGE_ONLY = new Set(['boom', 'platform', 'bed', 'door', 'sofa']);
const initials = s => (s || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

function shapeFor(it) {
  const c = it.color || '#8a8f98';
  switch (it.kind) {
    case 'actor': return [S('circle', { class: 'shape', r: 24 }), S('text', { y: 5 }, initials(it.label)), S('text', { class: 'lbl', y: 44 }, it.label || '')];
    case 'chair': return [S('rect', { class: 'shape', x: -17, y: -17, width: 34, height: 34, rx: 2 }), S('rect', { x: -17, y: -21, width: 34, height: 7, rx: 2, fill: 'rgba(0,0,0,.35)' })];
    case 'table': return [S('rect', { class: 'shape', x: -52, y: -30, width: 104, height: 60, rx: 2 }), S('text', { class: 'lbl', y: 5 }, it.label || '')];
    case 'sofa': return [S('rect', { class: 'shape', x: -58, y: -24, width: 116, height: 48, rx: 2 }), S('rect', { x: -58, y: -24, width: 116, height: 12, rx: 2, fill: 'rgba(0,0,0,.3)' })];
    case 'bed': return [S('rect', { class: 'shape', x: -48, y: -72, width: 96, height: 144, rx: 2 }), S('rect', { x: -40, y: -64, width: 80, height: 32, rx: 2, fill: 'rgba(255,255,255,.55)' })];
    case 'door': return [S('rect', { class: 'shape', x: -34, y: -6, width: 68, height: 12, rx: 2 }), S('path', { d: 'M-34 0 A34 34 0 0 1 0 34', fill: 'none', stroke: 'rgba(0,0,0,.4)', 'stroke-dasharray': '4 4' })];
    case 'platform': return [S('rect', { class: 'shape', x: -80, y: -50, width: 160, height: 100, rx: 2, 'fill-opacity': .45, 'stroke-dasharray': '8 5' }), S('text', { class: 'lbl', y: 5 }, it.label || 'Platform')];
    case 'prop': return [S('rect', { class: 'shape', x: -13, y: -13, width: 26, height: 26, rx: 2, transform: 'rotate(45)' }), S('text', { class: 'lbl', y: 32 }, it.label || '')];
    case 'camera': { const f = (it.fov || 40) * Math.PI / 360, L = 190, dx = L * Math.sin(f), dy = -L * Math.cos(f);
      return [S('path', { d: `M0 0 L${-dx} ${dy} L${dx} ${dy} Z`, fill: c, 'fill-opacity': .16, stroke: c, 'stroke-opacity': .55, 'stroke-dasharray': '5 4' }), S('rect', { class: 'shape', x: -13, y: -9, width: 26, height: 20, rx: 2 }), S('rect', { class: 'shape', x: -6, y: -17, width: 12, height: 9, rx: 1 }), S('text', { class: 'lbl', y: 34 }, it.label || '')]; }
    case 'light': return [S('circle', { class: 'shape', r: 11 }), ...[0, 45, 90, 135, 180, 225, 270, 315].map(a => S('line', { x1: 15 * Math.cos(a * Math.PI / 180), y1: 15 * Math.sin(a * Math.PI / 180), x2: 24 * Math.cos(a * Math.PI / 180), y2: 24 * Math.sin(a * Math.PI / 180), stroke: c, 'stroke-width': 2.5 })), S('text', { class: 'lbl', y: 42 }, it.label || '')];
    case 'boom': return [S('line', { x1: 0, y1: 0, x2: 0, y2: -80, stroke: c, 'stroke-width': 4 }), S('circle', { class: 'shape', cx: 0, cy: -84, r: 8 }), S('circle', { class: 'shape', r: 6 }), S('text', { class: 'lbl', y: 24 }, it.label || '')];
    case 'strobe': return [S('circle', { class: 'shape', r: 13 }), S('path', { d: 'M-3 -9 L4 -1 L-1 -1 L3 9 L-5 0 L0 0 Z', fill: '#fff', 'fill-opacity': .9 }), S('text', { class: 'lbl', y: 32 }, it.label || '')];
    case 'softbox': return [S('path', { class: 'shape', d: 'M-12 8 L-36 -22 L36 -22 L12 8 Z' }), S('rect', { x: -12, y: 8, width: 24, height: 9, rx: 2, fill: 'rgba(0,0,0,.45)' }), S('text', { class: 'lbl', y: 36 }, it.label || '')];
    case 'umbrella': return [S('path', { class: 'shape', d: 'M-34 -4 A34 34 0 0 1 34 -4 Z' }), S('line', { x1: 0, y1: -4, x2: 0, y2: 20, stroke: c, 'stroke-width': 3 }), S('circle', { class: 'shape', cx: 0, cy: 22, r: 6 }), S('text', { class: 'lbl', y: 42 }, it.label || '')];
    case 'reflector': return [S('ellipse', { class: 'shape', rx: 30, ry: 12 }), S('text', { class: 'lbl', y: 30 }, it.label || '')];
    case 'backdrop': return [S('rect', { class: 'shape', x: -130, y: -7, width: 260, height: 14, rx: 2, 'fill-opacity': .55 }), S('text', { class: 'lbl', y: 24 }, it.label || 'Backdrop')];
    case 'flag': return [S('rect', { class: 'shape', x: -40, y: -4, width: 80, height: 8, rx: 1 }), S('text', { class: 'lbl', y: 22 }, it.label || '')];
    case 'mark': return [S('line', { x1: -13, y1: 0, x2: 13, y2: 0, stroke: c, 'stroke-width': 4 }), S('line', { x1: 0, y1: -13, x2: 0, y2: 13, stroke: c, 'stroke-width': 4 }), S('text', { class: 'lbl', y: 30 }, it.label || 'X')];
    default: return [S('text', { class: 'lbl', y: 5, style: 'font-size:20px' }, it.label || 'Label')];
  }
}
/* stage dimensions -> drawn deck, grid step and scale */
function stageDeck(plan) {
  const w = (plan && +plan.w) || 12, d = (plan && +plan.d) || 8, sc = Math.min(920 / w, 540 / d), W = w * sc, Hh = d * sc;
  let step = 1; for (const st of [1, 2, 5, 10, 20, 50]) { step = st; if (st * sc >= 34) break; }
  return { x: 500 - W / 2, y: 24, w: W, h: Hh, s: sc, wU: w, dU: d, unit: (plan && plan.unit) || 'm', step };
}
function makeStageSvg(interactive, plan) {
  const D = stageDeck(plan), svg = S('svg', { class: 'stage-svg', viewBox: `0 0 1000 ${Math.round(D.y + D.h + 80)}`, role: 'img', 'aria-label': 'Stage plan' });
  svg.deck = D;
  svg.append(S('rect', { class: 'deck', x: D.x, y: D.y, width: D.w, height: D.h, rx: 2 }));
  for (let k = 1; k * D.step < D.wU; k++) svg.append(S('line', { class: 'gl fine', x1: D.x + D.w / 2 + k * D.step * D.s, y1: D.y, x2: D.x + D.w / 2 + k * D.step * D.s, y2: D.y + D.h }), S('line', { class: 'gl fine', x1: D.x + D.w / 2 - k * D.step * D.s, y1: D.y, x2: D.x + D.w / 2 - k * D.step * D.s, y2: D.y + D.h }));
  for (let k = 1; k * D.step < D.dU; k++) svg.append(S('line', { class: 'gl fine', x1: D.x, y1: D.y + D.h - k * D.step * D.s, x2: D.x + D.w, y2: D.y + D.h - k * D.step * D.s }));
  svg.append(S('line', { class: 'gl cl', x1: D.x + D.w / 2, y1: D.y, x2: D.x + D.w / 2, y2: D.y + D.h }));
  const areas = [['UR', 'UC', 'UL'], ['R', 'C', 'L'], ['DR', 'DC', 'DL']];
  areas.forEach((row, r) => row.forEach((a, c) => svg.append(S('text', { class: 'al', x: D.x + (c + .5) * D.w / 3, y: D.y + (r + .5) * D.h / 3 + 5 }, a))));
  svg.append(S('text', { class: 'al', x: 500, y: D.y + D.h + 34, style: 'font-size:18px' }, (Store.P && Store.P.mode === 'photo' ? '▼  CAMERA / FRONT  ▼' : '▼  AUDIENCE  ▼')));
  svg.append(S('text', { class: 'al', x: 500, y: 16, style: 'font-size:11px' }, 'BACKSTAGE'));
  const bx = D.x, by = D.y + D.h + 58;                                     // scale bar
  svg.append(S('line', { class: 'sbar', x1: bx, y1: by, x2: bx + D.step * D.s, y2: by }), S('line', { class: 'sbar', x1: bx, y1: by - 5, x2: bx, y2: by + 5 }), S('line', { class: 'sbar', x1: bx + D.step * D.s, y1: by - 5, x2: bx + D.step * D.s, y2: by + 5 }),
    S('text', { class: 'al', x: bx + D.step * D.s + 10, y: by + 4, style: 'text-anchor:start;font-size:12px' }, `${D.step} ${D.unit}`),
    S('text', { class: 'al', x: D.x + D.w, y: by + 4, style: 'text-anchor:end;font-size:12px' }, `${D.wU} × ${D.dU} ${D.unit}`));
  return svg;
}
function applyPos(g, p) { g.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.r || 0}deg)`; }

Views.stage = function (root) {
  const P = Store.P; P.stage.plans = P.stage.plans || [];
  if (!P.stage.plans.length && !P.cues.length) { /* first run */ }
  const tab = P.mode === 'photo' ? 'blocking' : UI.stageTab;
  const wrap = h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column' } });
  root.append(wrap); root.parentElement.classList.add('noscroll');
  wrap.append(h('div', { class: 'toolbar' }, h('div', { class: 'seg' }, (P.mode === 'photo' ? [['blocking', 'Set & lighting diagrams']] : [['blocking', 'Blocking & set plans'], ['cues', 'Cue sheet'], ['calling', TERM.calling]]).map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { UI.stageTab = k; Router.refresh(); } }, l))),
    h('span', { class: 'small muted' }, tab === 'blocking' ? 'Drag actors, set pieces, cameras and lights on a scaled plan; add frames to choreograph movement, then press Play.' : tab === 'cues' ? 'Lighting, sound, flys and scene changes — pin each one to a line of the script.' : 'The stage manager’s prompt book: your script with every standby and GO in the margin.')));
  const body = h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } }); wrap.append(body);
  let stopPlay = () => { };
  (tab === 'cues' ? cues : tab === 'calling' ? calling : blocking)();

  /* ---------------- blocking ---------------- */
  function blocking() {
    const scenes = getScenes(P);
    let plan = P.stage.plans.find(p => p.id === UI.planId) || P.stage.plans[0], sel = null, playing = null;
    const left = h('div', { class: 'stage-side' }), main = h('div', { class: 'stage-main' }), right = h('div', { class: 'stage-right' });
    body.append(h('div', { class: 'stage-wrap' }, left, main, right)); body.style.overflow = 'hidden';
    const frame = () => plan.frames[plan.cur];
    const posText = pos => { const D = stageDeck(plan), x = (pos.x - (D.x + D.w / 2)) / D.s, y = (D.y + D.h - pos.y) / D.s; return `${Math.abs(x).toFixed(1)} ${D.unit} ${x < 0 ? 'stage right' : 'stage left'} of centre · ${y.toFixed(1)} ${D.unit} upstage of the edge`; };
    function newPlan() {
      const p = { id: uid(), name: 'Plan ' + (P.stage.plans.length + 1), sceneId: '', items: [], frames: [{ id: uid(), name: 'Opening', notes: '', pos: {} }], cur: 0, snap: true };
      P.stage.plans.push(p); plan = p; UI.planId = p.id; sel = null; Store.touch(); drawAll();
    }
    function addItem(kind, label = '', color) {
      const it = { id: uid(), kind, label, color: color || (kind === 'actor' ? STAGE_COLORS[plan.items.filter(i => i.kind === 'actor').length % STAGE_COLORS.length] : '#8a8f98') };
      plan.items.push(it); const n = plan.items.length;
      plan.frames.forEach(f => f.pos[it.id] = { x: 500 + ((n * 37) % 160) - 80, y: 300 + ((n * 53) % 120) - 60, r: 0 });
      sel = it.id; Store.touch(); drawAll();
    }
    let svg, itemEls = new Map();
    function buildStage() {
      svg = makeStageSvg(true, plan); itemEls.clear();
      plan.items.forEach(it => {
        const g = S('g', { class: 'item' + (it.id === sel ? ' sel' : ''), style: `--c:${it.color}`, 'data-id': it.id }, shapeFor(it));
        applyPos(g, frame().pos[it.id] || { x: 500, y: 300 }); itemEls.set(it.id, g); svg.append(g);
        g.addEventListener('pointerdown', e => {
          e.preventDefault(); svg.classList.remove('animate'); stopPlayback();
          sel = it.id; $$('.item', svg).forEach(x => x.classList.toggle('sel', x === g)); drawRight();
          g.setPointerCapture(e.pointerId);
          const p0 = toSvg(e), pos = frame().pos[it.id], dx = pos.x - p0.x, dy = pos.y - p0.y;
          const mv = ev => { const p = toSvg(ev); const D = svg.deck; let x = clamp(p.x + dx, D.x + 6, D.x + D.w - 6), y = clamp(p.y + dy, D.y + 6, D.y + D.h - 6); if (plan.snap) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; } pos.x = x; pos.y = y; applyPos(g, pos); const rd = $('#posRead'); if (rd) rd.textContent = posText(pos); };
          const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); Store.touch(); };
          g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
        });
      });
    }
    const toSvg = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    function goFrame(i, animate = true) {
      plan.cur = clamp(i, 0, plan.frames.length - 1);
      if (animate) { svg.classList.add('animate'); clearTimeout(goFrame.t); goFrame.t = setTimeout(() => svg.classList.remove('animate'), 1100); }
      itemEls.forEach((g, id) => applyPos(g, frame().pos[id] || { x: 500, y: 300 }));
      drawRight(true);
    }
    function stopPlayback() { if (playing) { clearInterval(playing); playing = null; const b = $('#playBtn'); if (b) b.lastChild.textContent = 'Play'; } }
    stopPlay = stopPlayback;
    function play() {
      if (playing) return stopPlayback();
      if (plan.frames.length < 2) return toast('Add a second frame to animate between positions.', true);
      $('#playBtn').lastChild.textContent = 'Stop'; goFrame(0);
      playing = setInterval(() => { if (plan.cur >= plan.frames.length - 1) return stopPlayback(); goFrame(plan.cur + 1); }, 1500);
    }

    function drawLeft() {
      left.innerHTML = '';
      left.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', { class: 'grow', style: { fontSize: '15px' } }, 'Plans'), h('button', { class: 'btn sm primary', onclick: newPlan }, icon('plus', 13), 'New')));
      P.stage.plans.forEach(p => left.append(h('div', { class: 'frame-i' + (p === plan ? ' on' : ''), style: { marginBottom: '6px' }, onclick: () => { stopPlayback(); plan = p; UI.planId = p.id; sel = null; drawAll(); } }, h('span', { class: 'grow' }, p.name), h('span', { class: 'small muted' }, p.frames.length + 'f'))));
      if (!plan) return;
      left.append(h('div', { class: 'nav-sep' }), h('h3', { style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: '8px' } }, 'Add to stage'),
        h('div', { class: 'palette-g' }, Object.entries(KINDS).filter(([k]) => P.mode === 'photo' ? !STAGE_ONLY.has(k) : !PHOTO_ONLY.has(k)).map(([k, v]) => h('button', { class: 'btn sm', onclick: async () => { if (k === 'actor' || k === 'text' || k === 'prop' || k === 'strobe' || k === 'softbox' || k === 'umbrella' || k === 'reflector' || k === 'flag' || k === 'mark') { const n = await promptBox(`New ${v.label.toLowerCase()}`, k === 'actor' ? 'Actor or character name' : 'Label', ''); if (n === null) return; addItem(k, n); } else addItem(k, ''); } }, icon('plus', 13), v.label))),
        h('button', { class: 'btn sm', style: { marginTop: '8px', width: '100%' }, onclick: () => { const have = new Set(plan.items.filter(i => i.kind === 'actor').map(i => i.label.toUpperCase())); const sc = scenes.find(s => s.id === plan.sceneId); const names = sc ? [...sc.chars.keys()] : [...allCharacters(P).keys()]; let n = 0; names.forEach(c => { if (!have.has(c)) { const it = { id: uid(), kind: 'actor', label: c, color: STAGE_COLORS[(plan.items.length) % STAGE_COLORS.length] }; plan.items.push(it); plan.frames.forEach(f => f.pos[it.id] = { x: 120 + (n % 8) * 100, y: 500, r: 0 }); n++; } }); Store.touch(); drawAll(); toast(n ? `Added ${n} actor${n > 1 ? 's' : ''} from the script` : 'No new characters to add', !n); } }, icon('wand', 14), 'Actors from script'));
    }
    function drawMain() {
      main.innerHTML = '';
      if (!plan) { main.append(h('div', { class: 'empty', style: { margin: 'auto' } }, h('h3', {}, 'Plan your blocking'), h('p', { style: { maxWidth: '46ch' } }, 'Lay out actors, furniture and doors on a top-down stage. Add frames to choreograph who moves where, then play it back.'), h('button', { class: 'btn primary', onclick: newPlan }, icon('plus', 15), 'Create first plan'))); return; }
      buildStage();
      const nameIn = h('input', { class: 'inp', value: plan.name, style: { maxWidth: '280px', fontWeight: 650 }, oninput: e => { plan.name = e.target.value; Store.touch(); drawLeftLight(); } });
      const scSel = h('select', { class: 'inp', style: { maxWidth: '280px' }, onchange: e => { plan.sceneId = e.target.value; Store.touch(); } }, h('option', { value: '' }, 'Scene: any'), scenes.map(s => h('option', { value: s.id, selected: s.id === plan.sceneId }, `${s.num}. ${s.label}`.slice(0, 50))));
      main.append(h('div', { class: 'row wrap' }, nameIn, scSel, h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: plan.snap, onchange: e => { plan.snap = e.target.checked; Store.touch(); } }), 'Snap to grid'),
        h('label', { class: 'row small', title: 'Stage or set width' }, 'W', h('input', { class: 'inp', type: 'number', min: 2, max: 200, value: plan.w || 12, style: { width: '64px', padding: '3px 6px' }, onchange: e => { plan.w = Math.max(2, +e.target.value || 12); Store.touch(); drawMain(); } })),
        h('label', { class: 'row small', title: 'Stage or set depth' }, 'D', h('input', { class: 'inp', type: 'number', min: 2, max: 200, value: plan.d || 8, style: { width: '64px', padding: '3px 6px' }, onchange: e => { plan.d = Math.max(2, +e.target.value || 8); Store.touch(); drawMain(); } })),
        h('select', { class: 'inp', style: { width: 'auto', padding: '3px 6px' }, onchange: e => { plan.unit = e.target.value; Store.touch(); drawMain(); } }, ['m', 'ft'].map(u => h('option', { selected: u === (plan.unit || 'm') }, u))), h('span', { class: 'grow' }),
        h('button', { class: 'btn primary', id: 'playBtn', onclick: play }, icon('play', 15), 'Play'),
        h('button', { class: 'btn', onclick: printPlan }, icon('print', 15), 'Print'),
        h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(`Delete “${plan.name}”?`)) { stopPlayback(); P.stage.plans = P.stage.plans.filter(p => p !== plan); plan = P.stage.plans[0]; UI.planId = plan && plan.id; sel = null; Store.touch(); drawAll(); } } }, icon('trash', 15))), svg,
        h('div', { class: 'small muted', style: { textAlign: 'center' } }, (P.mode === 'photo' ? 'Top-down view: the camera position is at the bottom. Drag lights, modifiers, backdrops and talent marks into place; label each with its power or modifier.' : 'Stage Right is on the left of the diagram (the actor faces the audience).')));
    }
    const drawLeftLight = () => { $$('.frame-i .grow', left).forEach((el, i) => { if (P.stage.plans[i]) el.textContent = P.stage.plans[i].name; }); };
    function drawRight(onlyFrames) {
      right.innerHTML = ''; if (!plan) return;
      right.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', { class: 'grow', style: { fontSize: '15px' } }, 'Frames'),
        h('button', { class: 'btn sm', title: 'Duplicate the current positions as a new frame', onclick: () => { const f = frame(); const nf = { id: uid(), name: 'Frame ' + (plan.frames.length + 1), notes: '', pos: JSON.parse(JSON.stringify(f.pos)) }; plan.frames.splice(plan.cur + 1, 0, nf); plan.cur++; Store.touch(); drawAll(); } }, icon('plus', 13), 'Frame')));
      right.append(h('div', { class: 'frames' }, plan.frames.map((f, i) => h('div', { class: 'frame-i' + (i === plan.cur ? ' on' : ''), onclick: () => { stopPlayback(); goFrame(i); } }, h('span', { class: 'n' }, i + 1), h('span', { class: 'grow', style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name || 'Frame ' + (i + 1)),
        plan.frames.length > 1 ? ibtn('trash', 'Delete frame', e => { e.stopPropagation(); plan.frames.splice(i, 1); plan.cur = clamp(plan.cur, 0, plan.frames.length - 1); Store.touch(); drawAll(); }, 'danger') : null))));
      const f = frame();
      right.append(h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', { class: 'lbl' }, 'Frame name'), h('input', { class: 'inp', value: f.name, oninput: e => { f.name = e.target.value; Store.touch(); const el = $$('.frame-i', right)[plan.cur]; if (el) el.children[1].textContent = f.name || 'Frame'; } })),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Director\'s notes for this moment'), h('textarea', { class: 'inp', rows: 4, value: f.notes, placeholder: 'Who moves, why, on which line…', oninput: e => { f.notes = e.target.value; Store.touch(); } })));
      const it = plan.items.find(i => i.id === sel);
      if (it) {
        const pos = f.pos[it.id];
        right.append(h('div', { class: 'nav-sep' }), h('h3', { style: { fontSize: '15px', marginBottom: '8px' } }, KINDS[it.kind].label),
          h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Label'), h('input', { class: 'inp', value: it.label, oninput: e => { it.label = e.target.value; Store.touch(); const g = itemEls.get(it.id); if (g) { g.replaceChildren(...shapeFor(it)); } } })),
          h('div', { id: 'posRead', class: 'small muted', style: { marginBottom: '8px' } }, posText(pos)),
          it.kind === 'camera' ? h('div', { class: 'field' }, h('label', { class: 'lbl' }, `Field of view: ${it.fov || 40}° (≈ ${Math.round(18 / Math.tan((it.fov || 40) * Math.PI / 360))} mm on Super 35)`), h('input', { type: 'range', min: 10, max: 120, value: it.fov || 40, style: { width: '100%' }, oninput: e => { it.fov = +e.target.value; const g = itemEls.get(it.id); if (g) g.replaceChildren(...shapeFor(it)); e.target.previousSibling.textContent = `Field of view: ${it.fov}° (≈ ${Math.round(18 / Math.tan(it.fov * Math.PI / 360))} mm on Super 35)`; Store.touch(); } })) : null,
          h('div', { class: 'row wrap', style: { marginBottom: '10px' } }, STAGE_COLORS.concat(['#8a8f98']).map(c => h('button', { class: 'sw' + (c === it.color ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => { it.color = c; itemEls.get(it.id).style.setProperty('--c', c); Store.touch(); drawRight(); } }))),
          h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { pos.r = ((pos.r || 0) - 15); applyPos(itemEls.get(it.id), pos); Store.touch(); } }, icon('rotate', 14), '−15°'), h('button', { class: 'btn sm', onclick: () => { pos.r = ((pos.r || 0) + 15); applyPos(itemEls.get(it.id), pos); Store.touch(); } }, icon('rotate', 14), '+15°'), h('span', { class: 'grow' }),
            h('button', { class: 'btn sm danger', onclick: () => { plan.items = plan.items.filter(x => x !== it); plan.frames.forEach(fr => delete fr.pos[it.id]); sel = null; Store.touch(); drawAll(); } }, icon('trash', 14), 'Remove')));
      }
    }
    function printPlan() {
      const node = h('div', { class: 'print-doc' }, h('h1', {}, `Blocking — ${plan.name}`), h('div', { class: 'sub' }, P.title));
      plan.frames.forEach((f, i) => { const sv = makeStageSvg(false, plan); plan.items.forEach(it => { const g = S('g', { class: 'item', style: `--c:${it.color}` }, shapeFor(it)); applyPos(g, f.pos[it.id] || { x: 500, y: 300 }); sv.append(g); }); sv.style.maxWidth = '100%';
        node.append(h('div', { style: { pageBreakInside: 'avoid', marginBottom: '14pt' } }, h('h3', {}, `${i + 1}. ${f.name}`), sv, f.notes ? h('p', {}, f.notes) : null)); });
      printNode(node);
    }
    function drawAll() { stopPlayback(); drawLeft(); drawMain(); drawRight(); }
    drawAll();
  }

  /* ---------------- cue sheet ---------------- */
  function cues() {
    const scenes = getScenes(P); const CT = ['LX', 'SND', 'VID', 'FLY', 'SET', 'FX', 'OTHER'];
    const wrap2 = h('div', { class: 'page' }), tb = h('tbody'); body.append(wrap2);
    wrap2.append(h('div', { class: 'page-h' }, h('h2', {}, 'Cue sheet'), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: fromScript }, icon('wand', 15), 'Import cues from script'),
      h('button', { class: 'btn primary', onclick: () => { P.cues.push({ id: uid(), cue: '', type: 'LX', sceneId: (scenes[scenes.length - 1] || {}).id || '', at: '', desc: '', note: '' }); Store.touch(); fill(); setTimeout(() => { const i = $$('tbody tr:last-child input', wrap2)[0]; i && i.focus(); }, 20); } }, icon('plus', 15), 'Add cue'),
      h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-cues.csv', toCSV([['Cue', 'Type', 'Scene', 'Trigger', 'Description', 'Notes'], ...P.cues.map(c => [c.cue, c.type, (scenes.find(s => s.id === c.sceneId) || {}).num || '', c.at, c.desc, c.note])]), 'text/csv') }, icon('download', 15), 'CSV'),
      h('button', { class: 'btn', onclick: () => printTable('Cue sheet', ['Cue', 'Type', 'Sc', 'Trigger', 'Description', 'Notes'], P.cues.map(c => [c.cue, c.type, (scenes.find(s => s.id === c.sceneId) || {}).num || '', c.at, c.desc, c.note])) }, icon('print', 15), 'Print')),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Cue', 'Type', 'Scene', 'Trigger (line / action)', 'Description', 'Notes', ''].map(x => h('th', {}, x)))), tb));
    function fromScript() {
      let n = 0, scene = '';
      P.blocks.forEach(b => {
        if (b.type === 'scene') scene = b.id;
        if (b.type === 'cue' && b.text.trim() && !P.cues.some(c => c.src === b.id)) {
          const [a, ...r] = b.text.split(/\s+[-—:]\s+/); const t = (a.match(/^[A-Z]+/) || ['OTHER'])[0];
          P.cues.push({ id: uid(), src: b.id, cue: a, type: CT.includes(t) ? t : 'OTHER', sceneId: scene, at: '', desc: r.join(' — ') || '', note: '' }); n++;
        }
      });
      Store.touch(); fill(); toast(n ? `Imported ${n} cue${n > 1 ? 's' : ''}` : 'No new cues found — use the “Light / Sound Cue” element in the script.', !n);
    }
    function fill() {
      tb.innerHTML = '';
      if (!P.cues.length) tb.append(h('tr', {}, h('td', { colspan: 7 }, h('div', { class: 'empty', style: { padding: '30px' } }, 'No cues yet.'))));
      P.cues.forEach((c, i) => tb.append(h('tr', {},
        h('td', { style: { width: '110px' } }, h('input', { class: 'cell', value: c.cue, placeholder: 'LX 12', style: { fontWeight: 700 }, oninput: e => { c.cue = e.target.value; Store.touch(); } })),
        h('td', { style: { width: '95px' } }, h('select', { class: 'cell', onchange: e => { c.type = e.target.value; Store.touch(); } }, CT.map(t => h('option', { selected: t === c.type }, t)))),
        h('td', { style: { width: '120px' } }, h('select', { class: 'cell', onchange: e => { c.sceneId = e.target.value; Store.touch(); } }, h('option', { value: '' }, '—'), scenes.map(s => h('option', { value: s.id, selected: s.id === c.sceneId }, 'Sc ' + s.num)))),
        h('td', {}, h('input', { class: 'cell', value: c.at, placeholder: 'On “…the clock is patient.”', oninput: e => { c.at = e.target.value; Store.touch(); } })),
        h('td', {}, h('input', { class: 'cell', value: c.desc, placeholder: 'What happens', oninput: e => { c.desc = e.target.value; Store.touch(); } })),
        h('td', {}, h('input', { class: 'cell', value: c.note, placeholder: 'Standby, timing…', oninput: e => { c.note = e.target.value; Store.touch(); } })),
        h('td', { style: { whiteSpace: 'nowrap' } }, ibtn('search', 'Pin this cue to a line in the script', () => pinCue(c)), ibtn('up', 'Move up', () => { if (i) { [P.cues[i - 1], P.cues[i]] = [P.cues[i], P.cues[i - 1]]; Store.touch(); fill(); } }), ibtn('down', 'Move down', () => { if (i < P.cues.length - 1) { [P.cues[i + 1], P.cues[i]] = [P.cues[i], P.cues[i + 1]]; Store.touch(); fill(); } }), ibtn('trash', 'Delete', () => { P.cues.splice(i, 1); Store.touch(); fill(); }, 'danger')))));
    }
    function pinCue(c) {
      let from = 0, to = P.blocks.length; const sc = scenes.find(x => x.id === c.sceneId); if (sc) { from = sc.idx; to = sc.end; }
      const list = h('div', { class: 'sr-list' }), anchorId = cueAnchor(P, c);
      P.blocks.slice(from, to).forEach(b => list.append(h('div', { class: 'sr-row' + (b.id === anchorId ? ' on' : ''), onclick: () => { c.anchor = b.id; if (!c.at) c.at = stripRich(b.text).slice(0, 60); Store.touch(); dlg.close(); fill(); toast('Cue pinned to that line'); } },
        h('span', { class: 'pill' }, b.type), h('div', { class: 'sr-t' }, h('b', {}, stripRich(b.text).slice(0, 90) || '(empty)')))));
      const dlg = modal({ title: `Pin “${c.cue || 'cue'}” to a line`, wide: true, body: h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Pick the line the cue happens on. The calling script puts the GO there, and a STANDBY a few lines earlier.'), list), buttons: [c.anchor ? { label: 'Unpin', onClick: () => { delete c.anchor; Store.touch(); fill(); } } : { label: 'Cancel' }, { label: 'Close', primary: true }] });
    }
    fill();
  }

  /* ---------------- calling script / prompt book ---------------- */
  function calling() {
    const scenes = getScenes(P), lead = Math.max(1, +UI.standbyLead || 3), pg = paginate(P);
    const wrap2 = h('div', { class: 'page', style: { maxWidth: '1100px' } }), sheet = h('div', { class: 'mini ' + P.mode + ' calling' });
    const go = new Map(), sb = new Map(); let unpinned = 0;
    P.cues.forEach(c => { const id = cueAnchor(P, c); if (!id) { unpinned++; return; } const i = P.blocks.findIndex(b => b.id === id); (go.get(id) || go.set(id, []).get(id)).push(c);
      let j = Math.max(0, i - lead); const sc = scenes.find(s => s.idx <= i && s.end > i); if (sc) j = Math.max(sc.idx, j); const sid = P.blocks[j].id; if (sid !== id) (sb.get(sid) || sb.set(sid, []).get(sid)).push(c); });
    let lastPage = -1;
    P.blocks.forEach((b, i) => {
      const pp = pg.blockPage[i], g = go.get(b.id) || [], s2 = sb.get(b.id) || [];
      if (pp !== lastPage) { sheet.append(h('div', { class: 'call-page' }, `Page ${pg.labels[pp]}`)); lastPage = pp; }
      sheet.append(h('div', { class: 'call-row' }, h('div', { class: 'call-cues' }, s2.map(c => h('span', { class: 'cq sb' }, `STBY ${c.cue}`)), g.map(c => h('span', { class: 'cq go', title: c.desc }, `${c.cue} GO`))),
        h('div', { class: 'rb t-' + b.type, style: { paddingTop: ['paren', 'dialogue'].includes(b.type) ? 0 : '.8em' } }, richHTML(b.type === 'character' ? cueText(b) : b.text).replace(/^$/, '&nbsp;') && h('span', { html: richHTML(b.type === 'character' ? cueText(b) : b.text) }))));
    });
    wrap2.append(h('div', { class: 'page-h' }, h('h2', {}, TERM.calling), h('span', { class: 'grow' }), h('label', { class: 'row small' }, 'Standby lines before GO', h('input', { class: 'inp', type: 'number', min: 1, max: 20, value: lead, style: { width: '64px' }, onchange: e => { UI.standbyLead = +e.target.value || 3; Router.refresh(); } })),
      h('button', { class: 'btn primary', onclick: () => printNode(h('div', { class: 'print-doc calling-print' }, h('h1', {}, `${P.title} — Calling script`), h('div', { class: 'sub' }, `${P.cues.length} cues · standby ${lead} lines before each GO`), sheet.cloneNode(true))) }, icon('print', 15), 'Print prompt book')),
      unpinned ? h('div', { class: 'csalert' }, `${unpinned} cue${unpinned > 1 ? 's are' : ' is'} not pinned to a line yet — they will not appear below. In the Cue sheet, use the magnifier on each row to pin it.`) : null,
      P.cues.length ? sheet : h('div', { class: 'empty' }, h('h3', {}, 'No cues yet'), h('p', {}, 'Add cues in the Cue sheet (or type a “Light / Sound Cue” line in the script) and pin each one to a line.')));
    body.append(wrap2);
  }
  return () => { stopPlay(); root.parentElement.classList.remove('noscroll'); };
};

/* where a cue lives in the script: an explicit pin, the script's own cue line, or its trigger text */
function cueAnchor(P, c) {
  if (c.anchor && P.blocks.some(b => b.id === c.anchor)) return c.anchor;
  if (c.src && P.blocks.some(b => b.id === c.src)) return c.src;
  if (c.at && c.at.trim()) {
    const q = c.at.toLowerCase().replace(/[“”"]/g, '').trim(), sc = c.sceneId && getScenes(P).find(s => s.id === c.sceneId), from = sc ? sc.idx : 0, to = sc ? sc.end : P.blocks.length;
    const b = P.blocks.slice(from, to).find(b => stripRich(b.text).toLowerCase().includes(q)) || P.blocks.find(b => stripRich(b.text).toLowerCase().includes(q)); if (b) return b.id;
  }
  return null;
}
