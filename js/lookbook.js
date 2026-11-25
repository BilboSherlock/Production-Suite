'use strict';
/* ===================================================================
   Lookbook — VIEW. Mood boards of reference images, colour swatches
   and notes. Rules: js/models/lookbook.model.js; screen state and
   commands: js/viewmodels/lookbook.vm.js.
   =================================================================== */
Views.lookbook = function (root) {
  const vm = new LookbookVM(), P = Store.P;
  root.parentElement.classList.add('noscroll');
  const left = h('div', { class: 'stage-side' }), main = h('div', { class: 'stage-main', style: { overflow: 'auto', alignItems: 'stretch' } });
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', onclick: e => menu(e.currentTarget, [
      { label: 'Blank board', icon: 'plus', onClick: () => vm.addBoard() },
      { label: 'A board for every character', icon: 'users', onClick: () => made(vm.boardsForCharacters()) },
      { label: 'A board for every location', icon: 'pin', onClick: () => made(vm.boardsForLocations()) },
    ]) }, icon('plus', 15), 'New board'),
    h('button', { class: 'btn', onclick: addImages }, icon('image', 15), 'Add images'), h('button', { class: 'btn', onclick: () => vm.addTile('note') }, icon('edit', 15), 'Add note'),
    h('button', { class: 'btn', onclick: () => vm.addTile('color') }, icon('palette', 15), 'Add colour'), h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: toPitch, title: 'Copy this board’s images into a pitch deck gallery slide' }, icon('deck', 15), 'To pitch deck'),
    h('button', { class: 'btn', onclick: printBoard }, icon('print', 15), 'Print')),
    h('div', { class: 'stage-wrap' }, left, main)));

  const made = n => toast(n ? `Created ${n} board${n > 1 ? 's' : ''}` : 'Those boards already exist', !n);
  async function addFiles(files) {
    const urls = []; for (const f of files) if (/^image\//.test(f.type)) urls.push(await readImage(f, 1000));
    const n = vm.addImages(urls); if (n) toast(`Added ${n} image${n > 1 ? 's' : ''}`);
  }
  async function addImages() { const fs = await pickFiles('image/*'); if (fs.length) addFiles(fs); }
  function toPitch() { const g = vm.toPitch(); if (g) toast(`Added a “${g.title}” gallery slide to your pitch deck`); else toast('Add some images to this board first.', true); }
  function printBoard() {
    const b = vm.board; if (!b) return toast('Nothing to print yet.', true);
    const node = h('div', { class: 'print-doc' }, h('h1', {}, b.name), h('div', { class: 'sub' }, P.title + (b.about ? ' · ' + b.about : '')),
      h('div', { style: { columnCount: 3, columnGap: '10pt' } }, b.tiles.map(t => h('div', { style: { breakInside: 'avoid', marginBottom: '10pt', border: '1px solid #bbb' } },
        t.kind === 'image' ? h('img', { src: t.img, style: { width: '100%', display: 'block' } }) : t.kind === 'color' ? h('div', { style: { height: '70pt', background: t.color, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } }) : h('div', { style: { padding: '8pt', background: '#fff6bf', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', whiteSpace: 'pre-wrap' } }, t.text),
        (t.caption || t.kind === 'color') ? h('div', { style: { padding: '3pt 6pt', fontSize: '9pt' } }, t.kind === 'color' ? t.color.toUpperCase() + (t.caption ? ' · ' + t.caption : '') : t.caption) : null))));
    printNode(node);
  }

  function drawLeft() {
    const l = vm.list;
    morph(left, [h('h3', { 'data-key': 'h', style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', marginBottom: '8px' } }, `Boards (${l.length})`),
      ...l.map(({ b, on, cover, count }) => h('div', { 'data-key': b.id, class: 'frame-i' + (on ? ' on' : ''), style: { marginBottom: '6px' }, onclick: () => vm.select(b.id) },
        h('div', { class: 'thumb', style: { width: '40px', aspectRatio: '1', backgroundImage: cover ? `url(${cover})` : 'none', backgroundSize: 'cover', flex: 'none' } }), h('span', { class: 'grow clip' }, b.name || '(untitled)'), h('span', { class: 'small muted' }, String(count))))]);
  }
  function tileEl(b, t) {
    const ops = h('div', { class: 'lb-ops' }, ibtn('left', 'Move earlier', () => vm.moveTile(t.id, -1)), ibtn('right', 'Move later', () => vm.moveTile(t.id, 1)), ibtn('trash', 'Delete', () => vm.removeTile(t.id), 'danger'));
    const cap = h('input', { class: 'cell', placeholder: 'Caption', value: t.caption, oninput: e => vm.updateTile(t.id, 'caption', e.target.value, { quiet: true }) });
    if (t.kind === 'image') return h('div', { class: 'lbtile', 'data-key': t.id }, h('img', { src: t.img, alt: t.caption || 'reference', onclick: () => modal({ title: t.caption || b.name, wide: true, body: h('img', { src: t.img, style: { maxWidth: '100%', display: 'block', margin: '0 auto' } }), buttons: [{ label: 'Close', primary: true }] }) }), ops, cap);
    if (t.kind === 'color') return h('div', { class: 'lbtile', 'data-key': t.id },
      /* dragging the picker saves quietly and tints the swatch; letting go redraws */
      h('div', { class: 'lb-color', style: { background: t.color } }, h('input', { type: 'color', value: t.color, title: 'Pick colour',
        oninput: e => { if (vm.updateTile(t.id, 'color', e.target.value, { quiet: true })) { e.target.parentElement.style.background = e.target.value; e.target.closest('.lbtile').querySelector('code').textContent = e.target.value.toUpperCase(); } },
        onchange: () => vm.refresh() })), ops, h('div', { class: 'row', style: { padding: '4px' } }, h('code', { class: 'small', style: { padding: '0 6px' } }, t.color.toUpperCase()), cap));
    return h('div', { class: 'lbtile note', 'data-key': t.id }, h('textarea', { class: 'auto', rows: 4, placeholder: 'Note — mood, reference, quote…', value: t.text, oninput: e => { autosize(e.target); vm.updateTile(t.id, 'text', e.target.value, { quiet: true }); } }), ops);
  }
  function drawMain() {
    const b = vm.board;
    if (!b) return morph(main, h('div', { class: 'empty', 'data-key': 'empty', style: { margin: 'auto' } }, h('h3', {}, 'Build your lookbook'), h('p', { style: { maxWidth: '48ch' } }, 'Collect reference images, colour swatches and notes on mood boards — one for the overall look, one per character, one per location. Drop images straight onto a board.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => vm.addBoard('Overall look') }, icon('plus', 15), 'Start a board'), h('button', { class: 'btn', onclick: addImages }, icon('image', 15), 'Add images'))));
    morph(main, h('div', { 'data-key': 'board:' + b.id },
      h('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-end', marginBottom: '12px' } },
        h('input', { class: 'pf-title', style: { flex: '1 1 260px', margin: 0 }, value: b.name, placeholder: 'Board name', oninput: e => vm.updateBoard('name', e.target.value) }),
        h('input', { class: 'inp', style: { flex: '2 1 300px' }, placeholder: 'What is this board about? (tone, references, rules)', value: b.about, oninput: e => vm.updateBoard('about', e.target.value, { quiet: true }) }),
        h('button', { class: 'btn danger', title: 'Delete board', onclick: async () => { if (await confirmBox(`Delete the board “${b.name}” and its ${b.tiles.length} tiles?`)) vm.removeBoard(); } }, icon('trash', 15))),
      b.tiles.length ? h('div', { class: 'lb-grid', 'data-key': 'grid' }, b.tiles.map(t => tileEl(b, t))) : h('div', { class: 'lb-drop', 'data-key': 'drop' }, icon('upload', 26), h('div', {}, 'Drop images here, or use “Add images”'))));
    autosizeAll(main);
  }
  main.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); main.classList.add('lb-over'); } });
  main.addEventListener('dragleave', e => { if (!main.contains(e.relatedTarget)) main.classList.remove('lb-over'); });
  main.addEventListener('drop', e => { if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); main.classList.remove('lb-over'); addFiles([...e.dataTransfer.files]); } });
  const unbind = bindView(vm, () => { drawLeft(); drawMain(); });
  return () => { unbind(); root.parentElement.classList.remove('noscroll'); };
};
