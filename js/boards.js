'use strict';
/* ===================================================================
   Storyboard — VIEW. A concept tool first. Frames live in free-form
   sequences (or by scene, or on a filmstrip), can be created from
   nothing, from the script or from the shot list, and can later be
   tied to scenes and shots. Frames can carry a camera move.
   Rules: js/models/boards.model.js; screen state and commands:
   js/viewmodels/boards.vm.js. Drawing: js/sbstudio.js, js/sbrender.js.
   =================================================================== */
/* older global names, used by the drawing studio and the podcast suite */
const ASPECTS = BoardsModel.ASPECTS;
const INK = ['#111111', '#d12f3a', '#e8830c', '#1e8e54', '#2468d8', '#7a45c9', '#8a8f98'];
const SEQ_COLORS = BoardsModel.SEQ_COLORS;
const newFrame = o => BoardsModel.newFrame(o);

Views.board = function (root) {
  const vm = new BoardsVM(), P = Store.P;
  const ar = () => vm.ar, plural = BoardsModel.plural;
  const toolbar = h('div', { class: 'toolbar' }), area = h('div', { class: 'page', style: { maxWidth: '1500px' } });
  root.append(toolbar, area);

  /* ---------- creating and linking ---------- */
  function addFrame(group) { const b = vm.add(group); editFrame(b); return b; }
  async function newSeq() { const n = await promptBox('New sequence', 'Name — e.g. “Opening”, “The chase”, “Act two turn”', ''); if (n) vm.addSeq(n); }
  function fromScript() { const n = vm.fromScript(); toast(n ? `Created ${n} frame${n > 1 ? 's' : ''} from your scenes` : vm.scenes.length ? 'Every scene already has a frame' : 'Write some scenes first', !n); }
  function fromShots() { const n = vm.fromShots(), any = (P.shots || []).length; toast(n ? `Created ${n} frame${n > 1 ? 's' : ''} from your shot list` : any ? 'Every shot already has a frame' : 'No shots in the shot list yet', !any); }
  function shotsFromFrames() {
    const { n, skipped } = vm.shotsFromFrames();
    toast(n ? `Created ${n} shot${n > 1 ? 's' : ''} in the shot list${skipped ? ` (${skipped} frame${skipped > 1 ? 's' : ''} without a scene were skipped)` : ''}` : skipped ? 'Give your frames a scene first — shots live inside scenes.' : 'Every frame already has a shot', !n);
  }
  function copyFrame(b) { vm.copy(b.id); toast('Frame copied — use Build → Paste frame, or the paste tile in any sequence'); }
  function pasteFrame(afterId, group) { if (!vm.paste(afterId, group)) toast('Copy a frame first.', true); }
  function aspect(k) { vm.setAspect(k); toast('Existing frames keep their pictures; re-open one to see it in the new shape.'); }

  /* ---------- the studio ---------- */
  function editFrame(b) { openFrameStudio(P, b, { ar: ar(), scenes: vm.scenes, onSave: (out, makeShot) => vm.save(b.id, out, makeShot) }); }

  /* ---------- the cards ---------- */
  function cardMenu(btn, b) {
    menu(btn, [{ label: 'Copy frame', icon: 'copy', onClick: () => copyFrame(b) }, { label: 'Paste a frame after this', icon: 'copy', onClick: () => pasteFrame(b.id, vm.groupOf(b)) },
      { label: 'Insert blank frame after', icon: 'plus', onClick: () => { const nb = vm.addAfter(b.id); if (nb) editFrame(nb); } }, { sep: true },
      !b.shotId && b.sceneId ? { label: 'Create a shot from this frame', icon: 'camera', onClick: () => { vm.shotFromFrame(b.id); toast('Shot added to the shot list'); } } : null,
      b.shotId ? { label: 'Unlink from shot', icon: 'x', onClick: () => vm.unlinkShot(b.id) } : null,
      b.sceneId ? { label: 'Make it free of any scene', icon: 'x', onClick: () => vm.freeFromScene(b.id) } : null].filter(Boolean));
  }
  function card(b, i, ids) {
    const fr = h('div', { class: 'frame', tabindex: 0, role: 'button', 'aria-label': 'Edit frame', style: { aspectRatio: String(ar()) }, onclick: () => editFrame(b), onkeydown: e => { if (e.key === 'Enter') editFrame(b); } },
      b.img ? h('img', { src: b.img, alt: b.caption || 'storyboard frame', draggable: false }) : h('span', { class: 'row small' }, icon('edit', 16), 'Click to draw'),
      h('span', { class: 'pn' }, vm.cornerLabel(b, i)), BoardsModel.hasMove(b) ? h('span', { class: 'cammove', title: 'Camera move' }, icon('camera', 12), ' move') : null);
    const el = h('div', { class: 'panel', 'data-id': b.id, 'data-key': b.id }, fr,
      h('div', { class: 'pt' }, h('textarea', { class: 'auto', rows: 1, placeholder: 'Caption — action, dialogue, camera…', value: b.caption, oninput: e => { autosize(e.target); vm.setCaption(b.id, e.target.value, { quiet: true }); } })),
      h('div', { class: 'pa' }, ibtn('left', 'Move earlier', () => vm.step(b.id, -1, ids)), ibtn('right', 'Move later', () => vm.step(b.id, 1, ids)), ibtn('edit', 'Edit frame', () => editFrame(b)), ibtn('copy', 'Duplicate', () => vm.duplicate(b.id)),
        ibtn('more', 'More', e => cardMenu(e.currentTarget, b)), h('span', { class: 'grow' }),
        ibtn('trash', 'Delete frame', () => vm.remove(b.id), 'danger')));
    return DnD.item(el, 'frame', b.id, id => vm.place(id, b.id, vm.groupOf(b)));   // drop a frame here to put it before this one
  }
  const addTile = group => { const t = DnD.zone(h('div', { class: 'addpanel', tabindex: 0, role: 'button', onclick: () => addFrame(group), onkeydown: e => { if (e.key === 'Enter') addFrame(group); } },
    h('span', { class: 'row' }, icon('plus'), 'Add frame')), 'frame', id => vm.place(id, null, group)); t.dataset.key = 'add'; return t; };   // dropping on "Add frame" moves to the end of the group
  function seqHead(s, list, secs) {
    return h('div', { class: 'row sb-seqh', style: { margin: '8px 0 12px', gap: '8px' } },
      h('input', { type: 'color', class: 'colorpick', value: s.color, title: 'Sequence colour', onchange: e => vm.updateSeq(s.id, 'color', e.target.value) }),
      h('input', { class: 'pf-title', style: { flex: '1 1 220px', margin: 0, fontSize: '19px' }, value: s.name, onchange: e => vm.updateSeq(s.id, 'name', e.target.value) }),
      h('span', { class: 'pill' }, plural(list.length, 'frame') + ' · ' + secs + ' s'), ibtn('up', 'Move sequence up', () => vm.moveSeq(s.id, -1)), ibtn('down', 'Move sequence down', () => vm.moveSeq(s.id, 1)),
      ibtn('trash', 'Delete sequence (frames are kept)', async () => { if (await confirmBox(`Delete the sequence “${s.name}”? Its ${plural(list.length, 'frame')} stay on the board, unsorted.`)) vm.removeSeq(s.id); }, 'danger'));
  }
  function groupBlock(g) {
    const ids = g.frames.map(b => b.id);
    const head = g.seq ? seqHead(g.seq, g.frames, g.secs)
      : g.scene ? h('div', { class: 'row', style: { margin: '8px 0 12px' } }, h('h3', {}, h('span', { style: { color: 'var(--accent)', marginRight: '8px' } }, g.scene.num), g.scene.label), h('span', { class: 'pill' }, plural(g.frames.length, 'frame')))
      : h('div', { class: 'row', style: { margin: '8px 0 12px' } }, h('h3', {}, g.title), h('span', { class: 'pill' }, plural(g.frames.length, 'frame')));
    return h('div', { class: 'sb-group', 'data-key': g.key, style: g.seq ? { borderLeft: `4px solid ${g.seq.color}`, paddingLeft: '14px' } : {} }, head,
      h('div', { class: 'board-grid' }, g.frames.map((b, i) => card(b, i, ids)), addTile(g.group)));
  }
  function strip() {
    const list = vm.frames, total = vm.runtime;
    return [h('div', { class: 'row', 'data-key': 'striph', style: { marginBottom: '10px' } }, h('b', {}, plural(list.length, 'frame')), h('span', { class: 'muted small' }, `· runtime ${BoardsModel.clock(total)} · drag to reorder, click to edit`)),
      h('div', { class: 'sb-strip', 'data-key': 'strip' }, list.map((b, i) => { const sc = vm.sceneOf(b), sq = vm.seqOf(b);
        return DnD.item(h('div', { class: 'sb-sf', style: { width: Math.max(150, BoardsModel.dur(b) * 54) + 'px' }, onclick: () => editFrame(b) },
          h('div', { class: 'sb-sfi', style: { aspectRatio: String(ar()), borderTop: sq ? `3px solid ${sq.color}` : '' } }, b.img ? h('img', { src: b.img, draggable: false }) : h('span', { class: 'small muted' }, 'empty')),
          h('div', { class: 'small' }, h('b', {}, String(i + 1)), ' ', [sc && 'Sc ' + sc.num, BoardsModel.dur(b) + 's', BoardsModel.hasMove(b) ? '🎥' : ''].filter(Boolean).join(' · ')), h('div', { class: 'small muted clip' }, b.caption || '')), 'frame', b.id, id => vm.place(id, b.id, null)); })),
      h('div', { 'data-key': 'stripadd', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => addFrame() }, icon('plus', 15), 'Add frame'))];
  }
  function drawToolbar() {
    morph(toolbar, [h('div', { class: 'seg' }, [['seq', 'Sequences'], ['scene', 'By scene'], ['strip', 'Filmstrip']].map(([k, l]) => h('button', { class: vm.view === k ? 'on' : '', onclick: () => vm.setView(k) }, l))),
      h('select', { class: 'inp', style: { width: 'auto' }, title: 'Frame aspect ratio', onchange: e => aspect(e.target.value) }, vm.aspects.map(k => h('option', { value: k, selected: k === vm.aspectKey }, k))),
      h('select', { class: 'inp', style: { width: 'auto' }, title: 'Frames per row', onchange: e => vm.setCols(e.target.value) }, [2, 3, 4, 5, 6].map(n => h('option', { value: n, selected: n === vm.cols }, n + ' per row'))), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: e => menu(e.currentTarget, [
        { label: 'Frames from the script (one per scene)', icon: 'wand', onClick: fromScript }, { label: 'Frames from the shot list', icon: 'wand', onClick: fromShots }, { sep: true },
        { label: 'Create shots from frames', icon: 'camera', onClick: shotsFromFrames }, { label: 'Paste frame', icon: 'copy', onClick: () => pasteFrame() }]) }, icon('wand', 15), 'Build'),
      h('button', { class: 'btn', onclick: newSeq }, icon('plus', 15), 'Sequence'), h('button', { class: 'btn primary', onclick: () => addFrame() }, icon('plus', 15), 'Frame'),
      h('button', { class: 'btn', onclick: () => present(0) }, icon('play', 15), 'Present'), h('button', { class: 'btn', onclick: exportVideo }, icon('download', 15), 'Video'), h('button', { class: 'btn', onclick: printBoard }, icon('print', 15), 'Print')]);
  }
  function draw() {
    drawToolbar();
    area.style.setProperty('--cols', vm.cols); area.style.setProperty('--ar', ar());
    const start = vm.empty ? h('div', { class: 'card sb-start', 'data-key': 'start' }, h('h3', { style: { margin: '0 0 6px' } }, 'Start telling the story'), h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'Storyboard first, script and shot list later — or the other way round. Frames can float free in sequences until you tie them to a scene.'),
      h('div', { class: 'row wrap', style: { gap: '8px' } }, h('button', { class: 'btn primary', onclick: () => addFrame() }, icon('pen', 15), 'Draw the first frame'), h('button', { class: 'btn', onclick: newSeq }, icon('plus', 15), 'Name a sequence'), h('button', { class: 'btn', onclick: fromScript }, icon('wand', 15), 'Frames from my scenes'), h('button', { class: 'btn', onclick: fromShots }, icon('camera', 15), 'Frames from my shots'))) : null;
    morph(area, [start, ...(vm.view === 'strip' ? strip() : vm.groups.map(groupBlock))]);
    autosizeAll(area);
  }

  /* ---------- print ---------- */
  async function printBoard() {
    const node = h('div', { class: 'print-doc' }, h('h1', {}, 'Storyboard'), h('div', { class: 'sub' }, P.title)), groups = vm.printGroups;
    groups.forEach(([name, list]) => { node.append(h('h3', { style: { margin: '14pt 0 6pt', pageBreakAfter: 'avoid' } }, name)); const g = h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${Math.min(vm.cols, 3)}, 1fr)`, gap: '8pt' } });
      list.forEach((b, i) => { const sl = vm.shotLabelOf(b); g.append(h('div', { style: { pageBreakInside: 'avoid', border: '1px solid #999' } }, b.img ? h('img', { src: b.img, style: { width: '100%', display: 'block', aspectRatio: String(ar()) } }) : h('div', { style: { aspectRatio: String(ar()), background: '#f1f1f1' } }), h('div', { style: { padding: '3pt 5pt', fontSize: '9pt' } }, h('b', {}, (sl ? sl + ' · ' : '') + (i + 1) + ' '), b.caption, b.cam && b.cam.b ? ' (camera move)' : ''))); }); node.append(g); });
    printNode(node);
  }

  /* ---------- animatic: stills hold, camera moves play ---------- */
  function playlist() { return vm.frames.slice(); }
  async function drawAt(c, b, t) { const f = SBR.ensureLayers(SBD.clone(b), ar(), uid); await SBR.ready(f); SBR.renderFrame(c.getContext('2d'), c.width, c.height, f, ar(), t); }
  function present(start) {
    const list = playlist(); if (!list.length) return toast('Nothing to present yet — add some frames.', true);
    let i = start, raf = 0, t0 = 0, playingNow = false; const cv = h('canvas', { width: 1280, height: Math.round(1280 / ar()), style: { maxWidth: '100%', maxHeight: '78vh', background: '#fff' } }), stage = h('div', { class: 'stagebox' }, cv), cap = h('div', { class: 'cap' }), info = h('span', {});
    const frames = list.map(b => SBR.ensureLayers(SBD.clone(b), ar(), uid)), playBtn = h('button', { class: 'btn', onclick: () => toggle() }, icon('play', 15), 'Play');
    const ov = h('div', { class: 'present', tabindex: 0 }, stage, cap, h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: () => go(-1) }, icon('left', 15)), playBtn, h('button', { class: 'btn', onclick: () => go(1) }, icon('right', 15)), info, h('span', { style: { flex: 1 } }), h('button', { class: 'btn', onclick: close }, 'Close')));
    async function show(t = 0) { const f = frames[i]; await SBR.ready(f); SBR.renderFrame(cv.getContext('2d'), cv.width, cv.height, f, ar(), t); cap.textContent = f.caption || ''; const sc = vm.sceneOf(f), sq = vm.seqOf(f); info.textContent = `${i + 1} / ${list.length}${sq ? ' · ' + sq.name : ''}${sc ? ' · Scene ' + sc.num : ''}`; }
    function go(d) { stop(); i = Math.max(0, Math.min(list.length - 1, i + d)); show(); }
    function stop() { cancelAnimationFrame(raf); raf = 0; playingNow = false; playBtn.lastChild.textContent = 'Play'; }
    function run() { const f = frames[i], dur = (f.dur || 3) * 1000; t0 = performance.now(); const step = now => { const t = Math.min(1, (now - t0) / dur); show(f.cam && f.cam.b ? t : 0); if (t < 1) raf = requestAnimationFrame(step); else if (i < list.length - 1) { i++; run(); } else stop(); }; raf = requestAnimationFrame(step); }
    function toggle() { if (playingNow) return stop(); playingNow = true; playBtn.lastChild.textContent = 'Pause'; run(); }
    function key(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === ' ') { e.preventDefault(); toggle(); } }
    function close() { stop(); document.removeEventListener('keydown', key); ov.remove(); }
    ov._close = close;
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
  return bindView(vm, draw);
};
