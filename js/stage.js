'use strict';
/* ===================================================================
   Stage tools — blocking diagrams (with animated frames) and cue sheet.
   VIEW (and the SVG drawing of the diagram). Rules: js/models/stage.model.js;
   screen state and commands: js/viewmodels/stage.vm.js.
   =================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); kids.flat().forEach(c => c && e.append(c.nodeType ? c : document.createTextNode(c))); return e; };
/* the item kinds, colours and rules live in js/models/stage.model.js; these names are kept for older callers */
const STAGE_COLORS = StageModel.COLORS, KINDS = StageModel.KINDS, PHOTO_ONLY = StageModel.PHOTO_ONLY, STAGE_ONLY = StageModel.STAGE_ONLY;
const initials = s => StageModel.initials(s);

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
const stageDeck = plan => StageModel.deck(plan);
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
  /* VIEW. Rules: js/models/stage.model.js; screen state and commands: js/viewmodels/stage.vm.js */
  const vm = new StageVM();
  const toolbar = h('div', { class: 'toolbar' }), body = h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } });
  root.append(h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column' } }, toolbar, body)); root.parentElement.classList.add('noscroll');
  const left = h('div', { class: 'stage-side' }), main = h('div', { class: 'stage-main' }), right = h('div', { class: 'stage-right' }), stageWrap = h('div', { class: 'stage-wrap' }, left, main, right);
  const mainBar = h('div', { class: 'row wrap' }), mainNote = h('div', { class: 'small muted', style: { textAlign: 'center' } });
  let shown = null, svg = null, svgKey = '', itemEls = new Map(), playing = null, animT = null;

  /* ---------------- blocking: the diagram ---------------- */
  const toSvg = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  function buildStage(plan) {
    svg = makeStageSvg(true, plan); itemEls = new Map();
    plan.items.forEach(it => {
      const g = S('g', { class: 'item', style: `--c:${it.color}`, 'data-id': it.id }, shapeFor(it));
      itemEls.set(it.id, g); svg.append(g);
      g.addEventListener('pointerdown', e => {
        e.preventDefault(); svg.classList.remove('animate'); stopPlayback();
        if (vm.sel !== it.id) vm.select(it.id);
        g.setPointerCapture(e.pointerId);
        const p0 = toSvg(e), pos = vm.posOf(it.id), dx = pos.x - p0.x, dy = pos.y - p0.y;
        const mv = ev => { const p = toSvg(ev), np = vm.dragTo(it.id, p.x + dx, p.y + dy); applyPos(g, np); const rd = right.querySelector('#posRead'); if (rd) rd.textContent = vm.posText(np); };
        const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); vm.drop(); };
        g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
      });
    });
  }
  /** the same plan and items keep the same drawing, so moving between frames can animate */
  function syncStage(plan) {
    const key = JSON.stringify([plan.id, plan.w, plan.d, plan.unit, vm.P.mode, plan.items]);
    if (key !== svgKey || !svg) { svgKey = key; buildStage(plan); }
    itemEls.forEach((g, id) => { applyPos(g, vm.posOf(id)); g.classList.toggle('sel', id === vm.sel); });
    return svg;
  }
  function goFrame(i, animate = true) {
    if (animate && svg) { svg.classList.add('animate'); clearTimeout(animT); animT = setTimeout(() => svg && svg.classList.remove('animate'), 1100); }
    vm.goFrame(i);
  }
  function stopPlayback() { if (!playing) return; clearInterval(playing); playing = null; const b = main.querySelector('#playBtn'); if (b) b.lastChild.textContent = 'Play'; }
  function play() {
    if (playing) return stopPlayback();
    const plan = vm.plan; if (plan.frames.length < 2) return toast('Add a second frame to animate between positions.', true);
    playing = setInterval(() => { const p = vm.plan; if (!p || p.cur >= p.frames.length - 1) return stopPlayback(); goFrame(p.cur + 1); }, 1500);
    main.querySelector('#playBtn').lastChild.textContent = 'Stop'; goFrame(0);
  }
  function printPlan() {
    const plan = vm.plan, node = h('div', { class: 'print-doc' }, h('h1', {}, `Blocking — ${plan.name}`), h('div', { class: 'sub' }, vm.P.title));
    plan.frames.forEach((f, i) => { const sv = makeStageSvg(false, plan); plan.items.forEach(it => { const g = S('g', { class: 'item', style: `--c:${it.color}` }, shapeFor(it)); applyPos(g, f.pos[it.id] || StageModel.CENTRE); sv.append(g); }); sv.style.maxWidth = '100%';
      node.append(h('div', { style: { pageBreakInside: 'avoid', marginBottom: '14pt' } }, h('h3', {}, `${i + 1}. ${f.name}`), sv, f.notes ? h('p', {}, f.notes) : null)); });
    printNode(node);
  }
  const addKind = async (k, v) => { if (StageModel.ASK_LABEL.has(k)) { const n = await promptBox(`New ${v.label.toLowerCase()}`, k === 'actor' ? 'Actor or character name' : 'Label', ''); if (n === null) return; stopPlayback(); vm.addItem(k, n); } else { stopPlayback(); vm.addItem(k, ''); } };

  /* ---------------- blocking: the panels ---------------- */
  function drawLeft(plan) {
    morph(left, [h('div', { class: 'row', 'data-key': 'plans-h', style: { marginBottom: '8px' } }, h('h3', { class: 'grow', style: { fontSize: '15px' } }, 'Plans'), h('button', { class: 'btn sm primary', onclick: () => { stopPlayback(); vm.addPlan(); } }, icon('plus', 13), 'New')),
      ...vm.plans.map(p => h('div', { class: 'frame-i' + (p === plan ? ' on' : ''), 'data-key': 'plan:' + p.id, style: { marginBottom: '6px' }, onclick: () => { stopPlayback(); vm.openPlan(p.id); } }, h('span', { class: 'grow' }, p.name), h('span', { class: 'small muted' }, p.frames.length + 'f'))),
      ...(plan ? [h('div', { class: 'nav-sep', 'data-key': 'sep' }), h('h3', { 'data-key': 'add-h', style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: '8px' } }, 'Add to stage'),
        h('div', { class: 'palette-g', 'data-key': 'palette' }, vm.kinds.map(([k, v]) => h('button', { class: 'btn sm', onclick: () => addKind(k, v) }, icon('plus', 13), v.label))),
        h('button', { class: 'btn sm', 'data-key': 'actors', style: { marginTop: '8px', width: '100%' }, onclick: () => { stopPlayback(); const n = vm.addActors(); toast(n ? `Added ${n} actor${n > 1 ? 's' : ''} from the script` : 'No new characters to add', !n); } }, icon('wand', 14), 'Actors from script')] : [])]);
  }
  function drawMain(plan) {
    if (!plan) { svg = null; svgKey = ''; return main.replaceChildren(h('div', { class: 'empty', style: { margin: 'auto' } }, h('h3', {}, 'Plan your blocking'), h('p', { style: { maxWidth: '46ch' } }, 'Lay out actors, furniture and doors on a top-down stage. Add frames to choreograph who moves where, then play it back.'), h('button', { class: 'btn primary', onclick: () => vm.addPlan() }, icon('plus', 15), 'Create first plan'))); }
    morph(mainBar, [h('input', { class: 'inp', value: plan.name, style: { maxWidth: '280px', fontWeight: 650 }, oninput: e => vm.setPlan('name', e.target.value) }),
      h('select', { class: 'inp', style: { maxWidth: '280px' }, onchange: e => vm.setPlan('sceneId', e.target.value) }, h('option', { value: '', selected: !plan.sceneId }, 'Scene: any'), vm.scenes.map(s => h('option', { value: s.id, selected: s.id === plan.sceneId }, `${s.num}. ${s.label}`.slice(0, 50)))),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!plan.snap, onchange: e => vm.setPlan('snap', e.target.checked) }), 'Snap to grid'),
      h('label', { class: 'row small', title: 'Stage or set width' }, 'W', h('input', { class: 'inp', type: 'number', min: 2, max: 200, value: plan.w || 12, style: { width: '64px', padding: '3px 6px' }, onchange: e => vm.setPlan('w', e.target.value) })),
      h('label', { class: 'row small', title: 'Stage or set depth' }, 'D', h('input', { class: 'inp', type: 'number', min: 2, max: 200, value: plan.d || 8, style: { width: '64px', padding: '3px 6px' }, onchange: e => vm.setPlan('d', e.target.value) })),
      h('select', { class: 'inp', style: { width: 'auto', padding: '3px 6px' }, onchange: e => vm.setPlan('unit', e.target.value) }, StageModel.UNITS.map(u => h('option', { selected: u === (plan.unit || 'm') }, u))), h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', id: 'playBtn', onclick: play }, icon('play', 15), playing ? 'Stop' : 'Play'),
      h('button', { class: 'btn', onclick: printPlan }, icon('print', 15), 'Print'),
      h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(`Delete “${plan.name}”?`)) { stopPlayback(); vm.removePlan(); } } }, icon('trash', 15))]);
    mainNote.textContent = vm.isPhoto ? 'Top-down view: the camera position is at the bottom. Drag lights, modifiers, backdrops and talent marks into place; label each with its power or modifier.' : 'Stage Right is on the left of the diagram (the actor faces the audience).';
    const sv = syncStage(plan);
    if (main.children[0] !== mainBar || main.children[1] !== sv || main.children[2] !== mainNote) main.replaceChildren(mainBar, sv, mainNote);
  }
  function drawRight(plan) {
    if (!plan) return morph(right, []);
    const f = vm.frame, it = vm.item, pos = it && vm.posOf(it.id);
    morph(right, [h('div', { class: 'row', 'data-key': 'frames-h', style: { marginBottom: '8px' } }, h('h3', { class: 'grow', style: { fontSize: '15px' } }, 'Frames'),
      h('button', { class: 'btn sm', title: 'Duplicate the current positions as a new frame', onclick: () => { stopPlayback(); vm.addFrame(); } }, icon('plus', 13), 'Frame')),
      h('div', { class: 'frames', 'data-key': 'frames' }, plan.frames.map((fr, i) => h('div', { class: 'frame-i' + (i === plan.cur ? ' on' : ''), 'data-key': fr.id, onclick: () => { stopPlayback(); goFrame(i); } }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'grow', style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, fr.name || 'Frame ' + (i + 1)),
        plan.frames.length > 1 ? ibtn('trash', 'Delete frame', e => { e.stopPropagation(); stopPlayback(); vm.removeFrame(i); }, 'danger') : null))),
      h('div', { class: 'field', 'data-key': 'fname:' + f.id, style: { marginTop: '12px' } }, h('label', { class: 'lbl' }, 'Frame name'), h('input', { class: 'inp', value: f.name, oninput: e => vm.setFrame('name', e.target.value) })),
      h('div', { class: 'field', 'data-key': 'fnotes:' + f.id }, h('label', { class: 'lbl' }, 'Director\'s notes for this moment'), h('textarea', { class: 'inp', rows: 4, value: f.notes, placeholder: 'Who moves, why, on which line…', oninput: e => vm.setFrame('notes', e.target.value) })),
      ...(it ? [h('div', { class: 'nav-sep', 'data-key': 'isep' }), h('h3', { 'data-key': 'ikind', style: { fontSize: '15px', marginBottom: '8px' } }, StageModel.KINDS[it.kind].label),
        h('div', { class: 'field', 'data-key': 'ilabel:' + it.id }, h('label', { class: 'lbl' }, 'Label'), h('input', { class: 'inp', value: it.label, oninput: e => vm.setItem(it.id, 'label', e.target.value) })),
        h('div', { id: 'posRead', 'data-key': 'pos', class: 'small muted', style: { marginBottom: '8px' } }, vm.posText(pos)),
        it.kind === 'camera' ? h('div', { class: 'field', 'data-key': 'fov:' + it.id }, h('label', { class: 'lbl' }, `Field of view: ${it.fov || 40}° (≈ ${StageModel.focal(it.fov)} mm on Super 35)`), h('input', { type: 'range', min: 10, max: 120, value: it.fov || 40, style: { width: '100%' }, oninput: e => vm.setItem(it.id, 'fov', e.target.value) })) : null,
        h('div', { class: 'row wrap', 'data-key': 'colors', style: { marginBottom: '10px' } }, StageModel.COLORS.concat([StageModel.GREY]).map(c => h('button', { class: 'sw' + (c === it.color ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => vm.setItem(it.id, 'color', c) }))),
        h('div', { class: 'row', 'data-key': 'iacts' }, h('button', { class: 'btn sm', onclick: () => vm.rotate(it.id, -15) }, icon('rotate', 14), '−15°'), h('button', { class: 'btn sm', onclick: () => vm.rotate(it.id, 15) }, icon('rotate', 14), '+15°'), h('span', { class: 'grow' }),
          h('button', { class: 'btn sm danger', onclick: () => { stopPlayback(); vm.removeItem(it.id); } }, icon('trash', 14), 'Remove'))] : [])]);
  }

  /* ---------------- cue sheet ---------------- */
  function pinCue(id) {
    const ch = vm.pinChoices(id); if (!ch) return; const c = ch.cue;
    const list = h('div', { class: 'sr-list' }, ch.lines.map(b => h('div', { class: 'sr-row' + (b.id === ch.current ? ' on' : ''), onclick: () => { vm.pin(id, b.id); dlg.close(); toast('Cue pinned to that line'); } },
      h('span', { class: 'pill' }, b.type), h('div', { class: 'sr-t' }, h('b', {}, stripRich(b.text).slice(0, 90) || '(empty)')))));
    const dlg = modal({ title: `Pin “${c.cue || 'cue'}” to a line`, wide: true, body: h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Pick the line the cue happens on. The calling script puts the GO there, and a STANDBY a few lines earlier.'), list), buttons: [c.anchor ? { label: 'Unpin', onClick: () => vm.unpin(id) } : { label: 'Cancel' }, { label: 'Close', primary: true }] });
  }
  const addCue = () => { const c = vm.addCue(); setTimeout(() => { const i = body.querySelector(`tr[data-key="${c.id}"] input`); i && i.focus(); }, 20); };
  const importCues = () => { const n = vm.importCues(); toast(n ? `Imported ${n} cue${n > 1 ? 's' : ''}` : 'No new cues found — use the “Light / Sound Cue” element in the script.', !n); };
  function drawCues() {
    const P = vm.P, scenes = vm.scenes, list = vm.cues, cell = (c, k, ph, st) => h('input', { class: 'cell', value: c[k], placeholder: ph, style: st, oninput: e => vm.setCue(c.id, k, e.target.value) });
    morph(body, [h('div', { class: 'page', 'data-key': 'cues' }, h('div', { class: 'page-h' }, h('h2', {}, 'Cue sheet'), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: importCues }, icon('wand', 15), 'Import cues from script'),
      h('button', { class: 'btn primary', onclick: addCue }, icon('plus', 15), 'Add cue'),
      h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-cues.csv', toCSV(vm.csvRows()), 'text/csv') }, icon('download', 15), 'CSV'),
      h('button', { class: 'btn', onclick: () => printTable('Cue sheet', ['Cue', 'Type', 'Sc', 'Trigger', 'Description', 'Notes'], vm.printRows()) }, icon('print', 15), 'Print')),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Cue', 'Type', 'Scene', 'Trigger (line / action)', 'Description', 'Notes', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, list.length ? list.map(c => h('tr', { 'data-key': c.id },
          h('td', { style: { width: '110px' } }, cell(c, 'cue', 'LX 12', { fontWeight: 700 })),
          h('td', { style: { width: '95px' } }, h('select', { class: 'cell', onchange: e => vm.setCue(c.id, 'type', e.target.value) }, StageModel.CUE_TYPES.map(t => h('option', { selected: t === c.type }, t)))),
          h('td', { style: { width: '120px' } }, h('select', { class: 'cell', onchange: e => vm.setCue(c.id, 'sceneId', e.target.value) }, h('option', { value: '', selected: !c.sceneId }, '—'), scenes.map(s => h('option', { value: s.id, selected: s.id === c.sceneId }, 'Sc ' + s.num)))),
          h('td', {}, cell(c, 'at', 'On “…the clock is patient.”')), h('td', {}, cell(c, 'desc', 'What happens')), h('td', {}, cell(c, 'note', 'Standby, timing…')),
          h('td', { style: { whiteSpace: 'nowrap' } }, ibtn('search', 'Pin this cue to a line in the script', () => pinCue(c.id)), ibtn('up', 'Move up', () => vm.moveCue(c.id, -1)), ibtn('down', 'Move down', () => vm.moveCue(c.id, 1)), ibtn('trash', 'Delete', () => vm.removeCue(c.id), 'danger'))))
          : [h('tr', { 'data-key': 'none' }, h('td', { colspan: 7 }, h('div', { class: 'empty', style: { padding: '30px' } }, 'No cues yet.')))])))]);
  }

  /* ---------------- calling script / prompt book ---------------- */
  function drawCalling() {
    const P = vm.P, lead = vm.lead, pg = paginate(P), C = vm.calling(), rows = [];
    let lastPage = -1;
    P.blocks.forEach((b, i) => {
      const pp = pg.blockPage[i], g = C.go.get(b.id) || [], s2 = C.standby.get(b.id) || [];
      if (pp !== lastPage) { rows.push(h('div', { class: 'call-page' }, `Page ${pg.labels[pp]}`)); lastPage = pp; }
      rows.push(h('div', { class: 'call-row' }, h('div', { class: 'call-cues' }, s2.map(c => h('span', { class: 'cq sb' }, `STBY ${c.cue}`)), g.map(c => h('span', { class: 'cq go', title: c.desc }, `${c.cue} GO`))),
        h('div', { class: 'rb t-' + b.type, style: { paddingTop: ['paren', 'dialogue'].includes(b.type) ? 0 : '.8em' } }, h('span', { html: richHTML(b.type === 'character' ? cueText(b) : b.text) }))));
    });
    const sheet = h('div', { class: 'mini ' + P.mode + ' calling', 'data-key': 'sheet' }, rows), n = vm.cues.length;
    morph(body, [h('div', { class: 'page', 'data-key': 'calling', style: { maxWidth: '1100px' } }, h('div', { class: 'page-h' }, h('h2', {}, TERM.calling), h('span', { class: 'grow' }), h('label', { class: 'row small' }, 'Standby lines before GO', h('input', { class: 'inp', type: 'number', min: 1, max: 20, value: lead, style: { width: '64px' }, onchange: e => vm.setLead(e.target.value) })),
      h('button', { class: 'btn primary', onclick: () => printNode(h('div', { class: 'print-doc calling-print' }, h('h1', {}, `${P.title} — Calling script`), h('div', { class: 'sub' }, `${n} cues · standby ${lead} lines before each GO`), body.querySelector('.calling').cloneNode(true))) }, icon('print', 15), 'Print prompt book')),
      C.unpinned ? h('div', { class: 'csalert', 'data-key': 'unpinned' }, `${C.unpinned} cue${C.unpinned > 1 ? 's are' : ' is'} not pinned to a line yet — they will not appear below. In the Cue sheet, use the magnifier on each row to pin it.`) : null,
      n ? sheet : h('div', { class: 'empty', 'data-key': 'nocues' }, h('h3', {}, 'No cues yet'), h('p', {}, 'Add cues in the Cue sheet (or type a “Light / Sound Cue” line in the script) and pin each one to a line.')))]);
  }

  function draw() {
    const tab = vm.tab, photo = vm.isPhoto;
    morph(toolbar, [h('div', { class: 'seg' }, (photo ? [['blocking', 'Set & lighting diagrams']] : [['blocking', 'Blocking & set plans'], ['cues', 'Cue sheet'], ['calling', TERM.calling]]).map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => vm.setTab(k) }, l))),
      h('span', { class: 'small muted' }, tab === 'blocking' ? 'Drag actors, set pieces, cameras and lights on a scaled plan; add frames to choreograph movement, then press Play.' : tab === 'cues' ? 'Lighting, sound, flys and scene changes — pin each one to a line of the script.' : 'The stage manager’s prompt book: your script with every standby and GO in the margin.')]);
    if (tab !== shown) {
      stopPlayback(); shown = tab; body.replaceChildren(); body.style.overflow = tab === 'blocking' ? 'hidden' : 'auto';
      if (tab === 'blocking') body.append(stageWrap); else { svg = null; svgKey = ''; }
    }
    if (tab === 'blocking') { const plan = vm.plan; drawLeft(plan); drawMain(plan); drawRight(plan); }
    else if (tab === 'cues') drawCues(); else drawCalling();
  }
  const unbind = bindView(vm, draw);
  return () => { stopPlayback(); clearTimeout(animT); unbind(); root.parentElement.classList.remove('noscroll'); };
};

/* where a cue lives in the script: an explicit pin, the script's own cue line, or its trigger text */
const cueAnchor = (P, c) => StageModel.anchor(P, c, getScenes(P), t => stripRich(t));
