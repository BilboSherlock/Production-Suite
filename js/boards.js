'use strict';
/* ===================================================================
   Storyboard — a concept tool first. Frames live in free-form
   sequences (or by scene, or on a filmstrip), can be created from
   nothing, from the script or from the shot list, and can later be
   tied to scenes and shots. Frames can carry a camera move.
   =================================================================== */
const ASPECTS = { '16:9': 16 / 9, '2.39:1': 2.39, '1.85:1': 1.85, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 };
const INK = ['#111111', '#d12f3a', '#e8830c', '#1e8e54', '#2468d8', '#7a45c9', '#8a8f98'];
UI.boardCols = UI.boardCols || 3; UI.sbFrame = UI.sbFrame || null;
const SEQ_COLORS = ['#e5484d', '#e8830c', '#e8a40c', '#1e8e54', '#12a594', '#2468d8', '#7a45c9', '#d6409f'];
const newFrame = (o = {}) => Object.assign({ id: uid(), sceneId: '', seqId: '', shotId: '', img: '', base: '', ink: '', layers: [], caption: '', notes: '', dur: 3, size: '', angle: '', move: '', lens: '' }, o);

Views.board = function (root) {
  const P = Store.P; P.seqs = P.seqs || []; let scenes = getScenes(P);
  const ar = () => ASPECTS[P.settings.aspect] || 16 / 9;
  if (!UI.sbView) UI.sbView = (P.seqs.length || P.boards.some(b => !b.sceneId) || !P.boards.length) ? 'seq' : 'scene';
  const area = h('div', { class: 'page', style: { maxWidth: '1500px' } }), drag = { id: null };
  const aspSel = h('select', { class: 'inp', style: { width: 'auto' }, title: 'Frame aspect ratio', onchange: e => { P.settings.aspect = e.target.value; Store.touch(); draw(); toast('Existing frames keep their pictures; re-open one to see it in the new shape.'); } }, Object.keys(ASPECTS).map(k => h('option', { value: k, selected: k === P.settings.aspect }, k)));
  const colSel = h('select', { class: 'inp', style: { width: 'auto' }, title: 'Frames per row', onchange: e => { UI.boardCols = +e.target.value; draw(); } }, [2, 3, 4, 5, 6].map(n => h('option', { value: n, selected: n === UI.boardCols }, n + ' per row')));
  const viewSeg = h('div', { class: 'seg' }, [['seq', 'Sequences'], ['scene', 'By scene'], ['strip', 'Filmstrip']].map(([k, l]) => h('button', { 'data-k': k, class: UI.sbView === k ? 'on' : '', onclick: () => { UI.sbView = k; draw(); } }, l)));
  root.append(h('div', { class: 'toolbar' }, viewSeg, aspSel, colSel, h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: e => menu(e.currentTarget, [
      { label: 'Frames from the script (one per scene)', icon: 'wand', onClick: fromScript }, { label: 'Frames from the shot list', icon: 'wand', onClick: fromShots }, { sep: true },
      { label: 'Create shots from frames', icon: 'camera', onClick: shotsFromFrames }, { label: 'Paste frame', icon: 'copy', onClick: () => pasteFrame() }]) }, icon('wand', 15), 'Build'),
    h('button', { class: 'btn', onclick: () => newSeq() }, icon('plus', 15), 'Sequence'), h('button', { class: 'btn primary', onclick: () => addFrame() }, icon('plus', 15), 'Frame'),
    h('button', { class: 'btn', onclick: () => present(0) }, icon('play', 15), 'Present'), h('button', { class: 'btn', onclick: exportVideo }, icon('download', 15), 'Video'), h('button', { class: 'btn', onclick: printBoard }, icon('print', 15), 'Print')), area);

  /* ---------- creating and linking ---------- */
  function addFrame(o = {}) { const b = newFrame(Object.assign({ dur: 3 }, o)); P.boards.push(b); Store.touch(); draw(); editFrame(b); return b; }
  function insertAfter(b, nb) { P.boards.splice(P.boards.indexOf(b) + 1, 0, nb); }
  async function newSeq() { const n = await promptBox('New sequence', 'Name — e.g. “Opening”, “The chase”, “Act two turn”', ''); if (!n) return; P.seqs.push({ id: uid(), name: n, note: '', color: SEQ_COLORS[P.seqs.length % SEQ_COLORS.length] }); UI.sbView = 'seq'; Store.touch(); draw(); }
  function fromScript() {
    let n = 0; scenes.forEach(s => { if (!P.boards.some(b => b.sceneId === s.id)) { const blk = P.blocks.slice(s.idx + 1, s.end).find(x => x.type !== 'character' && x.type !== 'dialogue' && x.type !== 'paren' && x.text.trim()); P.boards.push(newFrame({ sceneId: s.id, caption: s.synopsis || (blk ? stripRich(blk.text).slice(0, 140) : s.label) })); n++; } });
    Store.touch(); draw(); toast(n ? `Created ${n} frame${n > 1 ? 's' : ''} from your scenes` : scenes.length ? 'Every scene already has a frame' : 'Write some scenes first', !n);
  }
  function fromShots() {
    let n = 0; P.shots.forEach(s => { if (!P.boards.some(b => b.shotId === s.id)) { P.boards.push(newFrame({ sceneId: s.sceneId, shotId: s.id, caption: s.desc, size: s.size, angle: s.angle, move: s.move, lens: s.lens })); n++; } });
    Store.touch(); draw(); toast(n ? `Created ${n} frame${n > 1 ? 's' : ''} from your shot list` : P.shots.length ? 'Every shot already has a frame' : 'No shots in the shot list yet', !P.shots.length);
  }
  function shotFromFrame(b) { if (!b.sceneId) return false; const sib = P.shots.filter(x => x.sceneId === b.sceneId), s = newShot(b.sceneId, { size: b.size || '', angle: b.angle || '', move: b.move || '', lens: b.lens || '', desc: b.caption || '' }); const last = sib[sib.length - 1]; P.shots.splice(last ? P.shots.indexOf(last) + 1 : P.shots.length, 0, s); b.shotId = s.id; return true; }
  function shotsFromFrames() {
    let n = 0, skipped = 0; P.boards.forEach(b => { if (b.shotId) return; if (!b.sceneId) { skipped++; return; } if (shotFromFrame(b)) n++; });
    Store.touch(); draw(); toast(n ? `Created ${n} shot${n > 1 ? 's' : ''} in the shot list${skipped ? ` (${skipped} frame${skipped > 1 ? 's' : ''} without a scene were skipped)` : ''}` : skipped ? 'Give your frames a scene first — shots live inside scenes.' : 'Every frame already has a shot', !n);
  }
  function copyFrame(b) { UI.sbFrame = SBD.clone(b); toast('Frame copied — use Build → Paste frame, or the paste tile in any sequence'); }
  function pasteFrame(after, over = {}) { const src = UI.sbFrame; if (!src) return toast('Copy a frame first.', true); const c = SBD.clone(src); c.id = uid(); c.shotId = ''; (c.layers || []).forEach(l => { l.id = uid(); }); Object.assign(c, over); if (after) insertAfter(after, c); else P.boards.push(c); Store.touch(); draw(); }
  const dupFrame = b => { const c = SBD.clone(b); c.id = uid(); c.shotId = ''; (c.layers || []).forEach(l => { l.id = uid(); }); insertAfter(b, c); Store.touch(); draw(); };

  /* ---------- the studio ---------- */
  function editFrame(b) {
    openFrameStudio(P, b, { ar: ar(), scenes, onSave: (out, makeShot) => {
      const keep = b.id; Object.assign(b, out, { id: keep });
      if (makeShot && !b.shotId) shotFromFrame(b);
      const sh = P.shots.find(x => x.id === b.shotId);
      if (sh && b.sync !== false) { ['size', 'angle', 'move', 'lens'].forEach(f => { if (b[f]) sh[f] = b[f]; }); if (!sh.desc && b.caption) sh.desc = b.caption; }
      Store.touch(); draw();
    } });
  }

  /* ---------- reordering by drag & drop ---------- */
  function place(id, beforeId, group) {   // group = {seqId} or {sceneId}
    const src = P.boards.find(x => x.id === id); if (!src || id === beforeId) return; P.boards.splice(P.boards.indexOf(src), 1);
    if (group) Object.assign(src, group);
    const at = beforeId ? P.boards.findIndex(x => x.id === beforeId) : -1; if (at >= 0) P.boards.splice(at, 0, src); else P.boards.push(src);
    Store.touch(); draw();
  }
  const groupKeyOf = (b) => UI.sbView === 'scene' ? { sceneId: b.sceneId || '' } : { seqId: b.seqId || '' };

  /* ---------- the cards ---------- */
  function card(b, i, list) {
    const shot = P.shots.find(s => s.id === b.shotId), sc = scenes.find(s => s.id === b.sceneId), moving = b.cam && b.cam.b;
    const fr = h('div', { class: 'frame', tabindex: 0, role: 'button', 'aria-label': 'Edit frame', style: { aspectRatio: String(ar()) }, onclick: () => editFrame(b), onkeydown: e => { if (e.key === 'Enter') editFrame(b); } },
      b.img ? h('img', { src: b.img, alt: b.caption || 'storyboard frame', draggable: false }) : h('span', { class: 'row small' }, icon('edit', 16), 'Click to draw'),
      h('span', { class: 'pn' }, [sc && `Sc ${sc.num}`, shot && shotLabel(P, shot, scenes), 'Frame ' + (i + 1)].filter(Boolean).join(' · ')), moving ? h('span', { class: 'cammove', title: 'Camera move' }, icon('camera', 12), ' move') : null);
    const swap = d => { const j = i + d; if (j < 0 || j >= list.length) return; const a = P.boards.indexOf(b), c = P.boards.indexOf(list[j]); [P.boards[a], P.boards[c]] = [P.boards[c], P.boards[a]]; Store.touch(); draw(); };
    const el = h('div', { class: 'panel', draggable: 'true', 'data-id': b.id, ondragstart: e => { drag.id = b.id; e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); }, ondragend: () => { el.classList.remove('dragging'); document.querySelectorAll('.panel.over,.addpanel.over').forEach(x => x.classList.remove('over')); },
      ondragover: e => { if (drag.id && drag.id !== b.id) { e.preventDefault(); el.classList.add('over'); } }, ondragleave: () => el.classList.remove('over'), ondrop: e => { e.preventDefault(); el.classList.remove('over'); if (drag.id) place(drag.id, b.id, groupKeyOf(b)); drag.id = null; } }, fr,
      h('div', { class: 'pt' }, h('textarea', { class: 'auto', rows: 1, placeholder: 'Caption — action, dialogue, camera…', value: b.caption, oninput: e => { b.caption = e.target.value; autosize(e.target); Store.touch(); } })),
      h('div', { class: 'pa' }, ibtn('left', 'Move earlier', () => swap(-1)), ibtn('right', 'Move later', () => swap(1)), ibtn('edit', 'Edit frame', () => editFrame(b)), ibtn('copy', 'Duplicate', () => dupFrame(b)),
        ibtn('more', 'More', e => menu(e.currentTarget, [{ label: 'Copy frame', icon: 'copy', onClick: () => copyFrame(b) }, { label: 'Paste a frame after this', icon: 'copy', onClick: () => pasteFrame(b, groupKeyOf(b)) }, { label: 'Insert blank frame after', icon: 'plus', onClick: () => { const nb = newFrame(Object.assign({ sceneId: b.sceneId, seqId: b.seqId }, {})); insertAfter(b, nb); Store.touch(); draw(); editFrame(nb); } }, { sep: true },
          !b.shotId && b.sceneId ? { label: 'Create a shot from this frame', icon: 'camera', onClick: () => { shotFromFrame(b); Store.touch(); draw(); toast('Shot added to the shot list'); } } : null, b.shotId ? { label: 'Unlink from shot', icon: 'x', onClick: () => { b.shotId = ''; Store.touch(); draw(); } } : null,
          b.sceneId ? { label: 'Make it free of any scene', icon: 'x', onClick: () => { b.sceneId = ''; b.shotId = ''; Store.touch(); draw(); } } : null].filter(Boolean))), h('span', { class: 'grow' }),
        ibtn('trash', 'Delete frame', () => { P.boards = P.boards.filter(x => x !== b); Store.touch(); draw(); }, 'danger')));
    return el;
  }
  const addTile = (group, label = 'Add frame') => h('div', { class: 'addpanel', tabindex: 0, role: 'button', onclick: () => addFrame(group), onkeydown: e => { if (e.key === 'Enter') addFrame(group); },
    ondragover: e => { if (drag.id) { e.preventDefault(); e.currentTarget.classList.add('over'); } }, ondragleave: e => e.currentTarget.classList.remove('over'), ondrop: e => { e.preventDefault(); e.currentTarget.classList.remove('over'); if (drag.id) place(drag.id, null, group); drag.id = null; } }, h('span', { class: 'row' }, icon('plus'), label));
  function groupBlock(title, sub, list, group, head) {
    const g = h('div', { class: 'board-grid' }); list.forEach((b, i) => g.append(card(b, i, list))); g.append(addTile(group));
    return h('div', { class: 'sb-group' }, head || h('div', { class: 'row', style: { margin: '8px 0 12px' } }, h('h3', {}, title), h('span', { class: 'pill' }, list.length + ' frame' + (list.length === 1 ? '' : 's')), sub), g);
  }
  function draw() {
    scenes = getScenes(P); [...viewSeg.children].forEach(b => b.classList.toggle('on', b.dataset.k === UI.sbView));
    area.replaceChildren(); area.style.setProperty('--cols', UI.boardCols); area.style.setProperty('--ar', ar());
    const none = !P.boards.length;
    if (none) area.append(h('div', { class: 'card sb-start' }, h('h3', { style: { margin: '0 0 6px' } }, 'Start telling the story'), h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'Storyboard first, script and shot list later — or the other way round. Frames can float free in sequences until you tie them to a scene.'),
      h('div', { class: 'row wrap', style: { gap: '8px' } }, h('button', { class: 'btn primary', onclick: () => addFrame() }, icon('pen', 15), 'Draw the first frame'), h('button', { class: 'btn', onclick: newSeq }, icon('plus', 15), 'Name a sequence'), h('button', { class: 'btn', onclick: fromScript }, icon('wand', 15), 'Frames from my scenes'), h('button', { class: 'btn', onclick: fromShots }, icon('camera', 15), 'Frames from my shots'))));
    if (UI.sbView === 'seq') {
      P.seqs.forEach((s, si) => {
        const list = P.boards.filter(b => b.seqId === s.id), head = h('div', { class: 'row sb-seqh', style: { margin: '8px 0 12px', gap: '8px' } }, h('input', { type: 'color', class: 'colorpick', value: s.color, title: 'Sequence colour', onchange: e => { s.color = e.target.value; Store.touch(); } }), h('input', { class: 'pf-title', style: { flex: '1 1 220px', margin: 0, fontSize: '19px' }, value: s.name, onchange: e => { s.name = e.target.value || 'Sequence'; Store.touch(); } }),
          h('span', { class: 'pill' }, list.length + ' frame' + (list.length === 1 ? '' : 's') + ' · ' + Math.round(sum(list, b => b.dur || 3)) + ' s'), ibtn('up', 'Move sequence up', () => { if (si) { [P.seqs[si - 1], P.seqs[si]] = [P.seqs[si], P.seqs[si - 1]]; Store.touch(); draw(); } }), ibtn('down', 'Move sequence down', () => { if (si < P.seqs.length - 1) { [P.seqs[si + 1], P.seqs[si]] = [P.seqs[si], P.seqs[si + 1]]; Store.touch(); draw(); } }),
          ibtn('trash', 'Delete sequence (frames are kept)', async () => { if (await confirmBox(`Delete the sequence “${s.name}”? Its ${list.length} frame${list.length === 1 ? '' : 's'} stay on the board, unsorted.`)) { list.forEach(b => b.seqId = ''); P.seqs = P.seqs.filter(x => x !== s); Store.touch(); draw(); } }, 'danger'));
        const blk = groupBlock(s.name, null, list, { seqId: s.id }, head); blk.style.borderLeft = `4px solid ${s.color}`; blk.style.paddingLeft = '14px'; area.append(blk);
      });
      const loose = P.boards.filter(b => !b.seqId); if (loose.length || !P.seqs.length) area.append(groupBlock(P.seqs.length ? 'Unsorted' : 'Frames', null, loose, { seqId: '' }));
    } else if (UI.sbView === 'scene') {
      scenes.forEach(sc => { const list = P.boards.filter(b => b.sceneId === sc.id); area.append(groupBlock('', null, list, { sceneId: sc.id }, h('div', { class: 'row', style: { margin: '8px 0 12px' } }, h('h3', {}, h('span', { style: { color: 'var(--accent)', marginRight: '8px' } }, sc.num), sc.label), h('span', { class: 'pill' }, list.length + ' frame' + (list.length === 1 ? '' : 's'))))); });
      const loose = P.boards.filter(b => !b.sceneId || !scenes.some(s => s.id === b.sceneId)); if (loose.length) area.append(groupBlock('Not tied to a scene', null, loose, { sceneId: '' }));
    } else {
      const total = sum(P.boards, b => b.dur || 3), strip = h('div', { class: 'sb-strip' });
      P.boards.forEach((b, i) => { const sc = scenes.find(s => s.id === b.sceneId), sq = P.seqs.find(s => s.id === b.seqId);
        strip.append(h('div', { class: 'sb-sf', draggable: 'true', style: { width: Math.max(150, (b.dur || 3) * 54) + 'px' }, ondragstart: e => { drag.id = b.id; e.dataTransfer.setData('text/plain', b.id); }, ondragover: e => { if (drag.id && drag.id !== b.id) { e.preventDefault(); e.currentTarget.classList.add('over'); } }, ondragleave: e => e.currentTarget.classList.remove('over'), ondrop: e => { e.preventDefault(); if (drag.id) place(drag.id, b.id, null); drag.id = null; }, onclick: () => editFrame(b) },
          h('div', { class: 'sb-sfi', style: { aspectRatio: String(ar()), borderTop: sq ? `3px solid ${sq.color}` : '' } }, b.img ? h('img', { src: b.img, draggable: false }) : h('span', { class: 'small muted' }, 'empty')), h('div', { class: 'small' }, h('b', {}, String(i + 1)), ' ', [sc && 'Sc ' + sc.num, (b.dur || 3) + 's', b.cam && b.cam.b ? '🎥' : ''].filter(Boolean).join(' · ')), h('div', { class: 'small muted clip' }, b.caption || ''))); });
      area.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('b', {}, `${P.boards.length} frame${P.boards.length === 1 ? '' : 's'}`), h('span', { class: 'muted small' }, `· runtime ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')} · drag to reorder, click to edit`)), strip, h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => addFrame() }, icon('plus', 15), 'Add frame')));
    }
    autosizeAll(area);
  }

  /* ---------- print ---------- */
  async function printBoard() {
    const node = h('div', { class: 'print-doc' }, h('h1', {}, 'Storyboard'), h('div', { class: 'sub' }, P.title)), groups = UI.sbView === 'scene' ? scenes.map(s => [`${s.num}. ${s.label}`, P.boards.filter(b => b.sceneId === s.id)]) : [...P.seqs.map(s => [s.name, P.boards.filter(b => b.seqId === s.id)]), [P.seqs.length ? 'Unsorted' : 'Frames', P.boards.filter(b => !b.seqId)]];
    groups.forEach(([name, list]) => { if (!list.length) return; node.append(h('h3', { style: { margin: '14pt 0 6pt', pageBreakAfter: 'avoid' } }, name)); const g = h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${Math.min(UI.boardCols, 3)}, 1fr)`, gap: '8pt' } });
      list.forEach((b, i) => { const shot = P.shots.find(s => s.id === b.shotId); g.append(h('div', { style: { pageBreakInside: 'avoid', border: '1px solid #999' } }, b.img ? h('img', { src: b.img, style: { width: '100%', display: 'block', aspectRatio: String(ar()) } }) : h('div', { style: { aspectRatio: String(ar()), background: '#f1f1f1' } }), h('div', { style: { padding: '3pt 5pt', fontSize: '9pt' } }, h('b', {}, (shot ? shotLabel(P, shot, scenes) + ' · ' : '') + (i + 1) + ' '), b.caption, b.cam && b.cam.b ? ' (camera move)' : ''))); }); node.append(g); });
    printNode(node);
  }

  /* ---------- animatic: stills hold, camera moves play ---------- */
  function playlist() { return P.boards.slice(); }
  async function drawAt(c, b, t) { const f = SBR.ensureLayers(SBD.clone(b), ar(), uid); await SBR.ready(f); SBR.renderFrame(c.getContext('2d'), c.width, c.height, f, ar(), t); }
  function present(start) {
    const list = playlist(); if (!list.length) return toast('Nothing to present yet — add some frames.', true);
    let i = start, raf = 0, t0 = 0, playingNow = false; const cv = h('canvas', { width: 1280, height: Math.round(1280 / ar()), style: { maxWidth: '100%', maxHeight: '78vh', background: '#fff' } }), stage = h('div', { class: 'stagebox' }, cv), cap = h('div', { class: 'cap' }), info = h('span', {});
    const frames = list.map(b => SBR.ensureLayers(SBD.clone(b), ar(), uid)), playBtn = h('button', { class: 'btn', onclick: () => toggle() }, icon('play', 15), 'Play');
    const ov = h('div', { class: 'present', tabindex: 0 }, stage, cap, h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: () => go(-1) }, icon('left', 15)), playBtn, h('button', { class: 'btn', onclick: () => go(1) }, icon('right', 15)), info, h('span', { style: { flex: 1 } }), h('button', { class: 'btn', onclick: close }, 'Close')));
    async function show(t = 0) { const f = frames[i]; await SBR.ready(f); SBR.renderFrame(cv.getContext('2d'), cv.width, cv.height, f, ar(), t); cap.textContent = f.caption || ''; const sc = scenes.find(s => s.id === f.sceneId), sq = P.seqs.find(s => s.id === f.seqId); info.textContent = `${i + 1} / ${list.length}${sq ? ' · ' + sq.name : ''}${sc ? ' · Scene ' + sc.num : ''}`; }
    function go(d) { stop(); i = Math.max(0, Math.min(list.length - 1, i + d)); show(); }
    function stop() { cancelAnimationFrame(raf); raf = 0; playingNow = false; playBtn.lastChild.textContent = 'Play'; }
    function run() { const f = frames[i], dur = (f.dur || 3) * 1000; t0 = performance.now(); const step = now => { const t = Math.min(1, (now - t0) / dur); show(f.cam && f.cam.b ? t : 0); if (t < 1) raf = requestAnimationFrame(step); else if (i < list.length - 1) { i++; run(); } else stop(); }; raf = requestAnimationFrame(step); }
    function toggle() { if (playingNow) return stop(); playingNow = true; playBtn.lastChild.textContent = 'Pause'; run(); }
    function key(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === ' ') { e.preventDefault(); toggle(); } }
    function close() { stop(); document.removeEventListener('keydown', key); ov.remove(); }
    document.addEventListener('keydown', key); document.body.append(ov); show(); ov.focus();
  }
  /* record the animatic to a .webm file (camera moves and holds, in real time) */
  async function exportVideo() {
    const list = playlist(); if (!list.length) return toast('Nothing to export yet — add some frames.', true);
    if (!window.MediaRecorder) return toast('This browser cannot record video. Try Chrome or Edge.', true);
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = Math.round(1280 / ar()); const g = cv.getContext('2d'), stream = cv.captureStream(30), chunks = [], rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    rec.ondataavailable = e => e.data.size && chunks.push(e.data); const done = new Promise(r => { rec.onstop = r; });
    const total = sum(list, b => b.dur || 3), bar = h('i', { style: { width: '0%' } }), w = modal({ title: 'Recording the animatic…', body: h('div', {}, h('p', { style: { marginTop: 0 } }, `${list.length} frames, ${Math.round(total)} seconds. It records in real time — keep this tab open.`), h('div', { class: 'progress' }, bar)), buttons: [] });
    const frames = list.map(b => SBR.ensureLayers(SBD.clone(b), ar(), uid)); for (const f of frames) await SBR.ready(f);
    rec.start(); let elapsed = 0;
    for (const f of frames) { const dur = (f.dur || 3) * 1000, t0 = performance.now(); await new Promise(res => { const step = now => { const t = Math.min(1, (now - t0) / dur); SBR.renderFrame(g, cv.width, cv.height, f, ar(), f.cam && f.cam.b ? t : 0); bar.style.width = ((elapsed + (now - t0)) / (total * 1000) * 100) + '%'; if (t < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); elapsed += dur; }
    rec.stop(); await done; w.close(); const bl = new Blob(chunks, { type: 'video/webm' }), a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = slug(P.title) + '-animatic.webm'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Animatic saved');
  }
  draw();
};
