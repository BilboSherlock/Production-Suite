'use strict';
/* ===================================================================
   Lookbook — mood boards of reference images, colour swatches and notes
   =================================================================== */
const newBoard = (name = 'New board') => ({ id: uid(), name, about: '', tiles: [] });
const newTile = (kind, o = {}) => Object.assign({ id: uid(), kind, img: '', text: '', color: '#2c3a9e', caption: '' }, o);

Views.lookbook = function (root) {
  const P = Store.P, L = P.lookbook; L.boards = L.boards || [];
  let sel = L.boards.find(b => b.id === UI.lbBoard) ? UI.lbBoard : (L.boards[0] && L.boards[0].id);
  root.parentElement.classList.add('noscroll');
  const left = h('div', { class: 'stage-side' }), main = h('div', { class: 'stage-main', style: { overflow: 'auto', alignItems: 'stretch' } });
  const board = () => L.boards.find(b => b.id === sel);
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', onclick: e => menu(e.currentTarget, [
      { label: 'Blank board', icon: 'plus', onClick: () => addBoard(newBoard('Board ' + (L.boards.length + 1))) },
      { label: 'A board for every character', icon: 'users', onClick: () => bulk([...new Set(allCharNames(P))].slice(0, 20)) },
      { label: 'A board for every location', icon: 'pin', onClick: () => bulk([...new Set(P.locations.map(l => l.name).filter(Boolean).concat(getScenes(P).map(s => s.location).filter(Boolean)))].slice(0, 20)) },
    ]) }, icon('plus', 15), 'New board'),
    h('button', { class: 'btn', onclick: addImages }, icon('image', 15), 'Add images'), h('button', { class: 'btn', onclick: () => addTile(newTile('note', { text: '' })) }, icon('edit', 15), 'Add note'),
    h('button', { class: 'btn', onclick: () => addTile(newTile('color')) }, icon('palette', 15), 'Add colour'), h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: toPitch, title: 'Copy this board’s images into a pitch deck gallery slide' }, icon('deck', 15), 'To pitch deck'),
    h('button', { class: 'btn', onclick: printBoard }, icon('print', 15), 'Print')),
    h('div', { class: 'stage-wrap' }, left, main)));

  function bulk(names) {
    let n = 0; names.forEach(nm => { if (!L.boards.some(b => b.name.toLowerCase() === nm.toLowerCase())) { L.boards.push(newBoard(nm)); n++; } });
    if (!sel && L.boards[0]) sel = UI.lbBoard = L.boards[0].id; Store.touch(); draw(); toast(n ? `Created ${n} board${n > 1 ? 's' : ''}` : 'Those boards already exist', !n);
  }
  function addBoard(b) { L.boards.push(b); sel = UI.lbBoard = b.id; Store.touch(); draw(); }
  function addTile(t) { const b = board(); if (!b) { addBoard(newBoard('Look')); return addTile(t); } b.tiles.push(t); Store.touch(); drawMain(); }
  async function addFiles(files) { let n = 0; for (const f of files) { if (!/^image\//.test(f.type)) continue; let b = board(); if (!b) { b = newBoard('Look'); L.boards.push(b); sel = UI.lbBoard = b.id; } b.tiles.push(newTile('image', { img: await readImage(f, 1000) })); n++; } if (n) { Store.touch(); draw(); toast(`Added ${n} image${n > 1 ? 's' : ''}`); } }
  async function addImages() { const fs = await pickFiles('image/*'); if (fs.length) addFiles(fs); }
  function toPitch() {
    const b = board(); const imgs = b ? b.tiles.filter(t => t.kind === 'image').slice(0, 6).map(t => t.img) : []; if (!imgs.length) return toast('Add some images to this board first.', true);
    P.pitch.slides.push(newSlide('gallery', { title: b.name, images: imgs })); Store.touch(); toast(`Added a “${b.name}” gallery slide to your pitch deck`);
  }
  function printBoard() {
    const b = board(); if (!b) return toast('Nothing to print yet.', true);
    const node = h('div', { class: 'print-doc' }, h('h1', {}, b.name), h('div', { class: 'sub' }, P.title + (b.about ? ' · ' + b.about : '')),
      h('div', { style: { columnCount: 3, columnGap: '10pt' } }, b.tiles.map(t => h('div', { style: { breakInside: 'avoid', marginBottom: '10pt', border: '1px solid #bbb' } },
        t.kind === 'image' ? h('img', { src: t.img, style: { width: '100%', display: 'block' } }) : t.kind === 'color' ? h('div', { style: { height: '70pt', background: t.color, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } }) : h('div', { style: { padding: '8pt', background: '#fff6bf', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', whiteSpace: 'pre-wrap' } }, t.text),
        (t.caption || t.kind === 'color') ? h('div', { style: { padding: '3pt 6pt', fontSize: '9pt' } }, t.kind === 'color' ? t.color.toUpperCase() + (t.caption ? ' · ' + t.caption : '') : t.caption) : null))));
    printNode(node);
  }

  function drawLeft() {
    left.innerHTML = '';
    left.append(h('h3', { style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', marginBottom: '8px' } }, `Boards (${L.boards.length})`));
    L.boards.forEach(b => { const first = b.tiles.find(t => t.kind === 'image');
      left.append(h('div', { class: 'frame-i' + (b.id === sel ? ' on' : ''), style: { marginBottom: '6px' }, onclick: () => { sel = UI.lbBoard = b.id; draw(); } },
        h('div', { class: 'thumb', style: { width: '40px', aspectRatio: '1', backgroundImage: first ? `url(${first.img})` : 'none', backgroundSize: 'cover', flex: 'none' } }), h('span', { class: 'grow clip' }, b.name || '(untitled)'), h('span', { class: 'small muted' }, b.tiles.length))); });
  }
  function tileEl(b, t, i) {
    const mv = d => { const j = i + d; if (j < 0 || j >= b.tiles.length) return; [b.tiles[i], b.tiles[j]] = [b.tiles[j], b.tiles[i]]; Store.touch(); drawMain(); };
    const ops = h('div', { class: 'lb-ops' }, ibtn('left', 'Move earlier', () => mv(-1)), ibtn('right', 'Move later', () => mv(1)), ibtn('trash', 'Delete', () => { b.tiles.splice(i, 1); Store.touch(); drawMain(); drawLeft(); }, 'danger'));
    const cap = h('input', { class: 'cell', placeholder: 'Caption', value: t.caption, oninput: e => { t.caption = e.target.value; Store.touch(); } });
    if (t.kind === 'image') return h('div', { class: 'lbtile' }, h('img', { src: t.img, alt: t.caption || 'reference', onclick: () => modal({ title: t.caption || b.name, wide: true, body: h('img', { src: t.img, style: { maxWidth: '100%', display: 'block', margin: '0 auto' } }), buttons: [{ label: 'Close', primary: true }] }) }), ops, cap);
    if (t.kind === 'color') { const hx = h('code', { class: 'small', style: { padding: '0 6px' } }, t.color.toUpperCase());
      return h('div', { class: 'lbtile' }, h('div', { class: 'lb-color', style: { background: t.color } }, h('input', { type: 'color', value: t.color, title: 'Pick colour', oninput: e => { t.color = e.target.value; e.target.parentElement.style.background = t.color; hx.textContent = t.color.toUpperCase(); Store.touch(); } })), ops, h('div', { class: 'row', style: { padding: '4px' } }, hx, cap)); }
    return h('div', { class: 'lbtile note' }, h('textarea', { class: 'auto', rows: 4, placeholder: 'Note — mood, reference, quote…', value: t.text, oninput: e => { t.text = e.target.value; autosize(e.target); Store.touch(); } }), ops);
  }
  function drawMain() {
    main.innerHTML = ''; const b = board();
    if (!b) { main.append(h('div', { class: 'empty', style: { margin: 'auto' } }, h('h3', {}, 'Build your lookbook'), h('p', { style: { maxWidth: '48ch' } }, 'Collect reference images, colour swatches and notes on mood boards — one for the overall look, one per character, one per location. Drop images straight onto a board.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => addBoard(newBoard('Overall look')) }, icon('plus', 15), 'Start a board'), h('button', { class: 'btn', onclick: addImages }, icon('image', 15), 'Add images')))); return; }
    main.append(h('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-end', marginBottom: '12px' } },
      h('input', { class: 'pf-title', style: { flex: '1 1 260px', margin: 0 }, value: b.name, placeholder: 'Board name', oninput: e => { b.name = e.target.value; Store.touch(); const el = $$('.frame-i .clip', left)[L.boards.indexOf(b)]; if (el) el.textContent = b.name || '(untitled)'; } }),
      h('input', { class: 'inp', style: { flex: '2 1 300px' }, placeholder: 'What is this board about? (tone, references, rules)', value: b.about, oninput: e => { b.about = e.target.value; Store.touch(); } }),
      h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(`Delete the board “${b.name}” and its ${b.tiles.length} tiles?`)) { L.boards = L.boards.filter(x => x !== b); sel = UI.lbBoard = L.boards[0] && L.boards[0].id; Store.touch(); draw(); } } }, icon('trash', 15))));
    main.append(b.tiles.length ? h('div', { class: 'lb-grid' }, b.tiles.map((t, i) => tileEl(b, t, i))) : h('div', { class: 'lb-drop' }, icon('upload', 26), h('div', {}, 'Drop images here, or use “Add images”')));
    autosizeAll(main);
  }
  main.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); main.classList.add('lb-over'); } });
  main.addEventListener('dragleave', e => { if (!main.contains(e.relatedTarget)) main.classList.remove('lb-over'); });
  main.addEventListener('drop', e => { if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); main.classList.remove('lb-over'); addFiles([...e.dataTransfer.files]); } });
  function draw() { drawLeft(); drawMain(); }
  draw();
  return () => root.parentElement.classList.remove('noscroll');
};
