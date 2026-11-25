'use strict';
/* ===================================================================
   Pitch deck — VIEW. Slides built from your project, presented full
   screen or printed to PDF. Rules: js/models/pitch.model.js; screen
   state and commands: js/viewmodels/pitch.vm.js.
   =================================================================== */
const SLIDE_TYPES = PitchModel.TYPES, DECK_THEMES = PitchModel.THEMES;
const newSlide = (type, o) => PitchModel.newSlide(type, o);

function slideEl(P, s, theme, idx) {
  const el = h('div', { class: `slide th-${theme} t-${s.type}` });
  const paras = t => PitchModel.paras(t).map(x => h('p', {}, x));
  const img = u => u ? { backgroundImage: `url(${u})` } : {};
  if (s.type === 'cover') {
    if (s.image) el.style.backgroundImage = `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.55)), url(${s.image})`;
    el.append(h('div', { class: 'sc-in' }, h('div', { class: 'bar' }), h('h1', {}, s.title || 'Untitled'), s.body ? h('div', { class: 'sub' }, s.body) : null));
  } else if (s.type === 'split') {
    el.append(h('div', { class: 'sc-in' }, h('h2', {}, s.title), h('div', { class: 'bd' }, paras(s.body))), h('div', { class: 'sc-img' + (s.image ? '' : ' ph'), style: img(s.image) }, s.image ? '' : 'Add an image'));
  } else if (s.type === 'gallery') {
    const imgs = PitchModel.galleryImages(s);
    el.append(h('div', { class: 'sc-in' }, h('h2', {}, s.title), h('div', { class: 'grid n' + Math.max(1, Math.min(6, imgs.length || 3)) }, imgs.length ? imgs.map(u => h('div', { class: 'gi', style: img(u) })) : [1, 2, 3].map(() => h('div', { class: 'gi ph' }, 'Add images')))));
  } else if (s.type === 'list') {
    el.append(h('div', { class: 'sc-in' }, h('h2', {}, s.title), h('div', { class: 'cols' }, PitchModel.listItems(s.body).map(it => h('div', { class: 'li' }, h('b', {}, it.name), it.detail ? h('span', {}, it.detail) : null)))));
  } else {
    el.append(h('div', { class: 'sc-in' }, h('h2', {}, s.title), h('div', { class: 'bd wide' }, paras(s.body))));
  }
  if (s.type !== 'cover') el.append(h('div', { class: 'sc-ft' }, h('span', {}, P.title), h('span', {}, String(idx + 1).padStart(2, '0'))));
  return el;
}

/** the one-click deck for a project (kept for older callers) */
function buildDeck(P) { return PitchModel.build(PitchVM.facts(P)); }

Views.pitch = function (root) {
  const vm = new PitchVM(), P = Store.P;
  root.parentElement.classList.add('noscroll');
  const left = h('div', { class: 'stage-side', style: { width: '230px' } }), main = h('div', { class: 'stage-main', style: { overflow: 'auto', alignItems: 'center' } }), right = h('div', { class: 'stage-right' });
  const themeSeg = h('div', { class: 'seg' });
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', onclick: autoBuild }, icon('wand', 15), 'Build from my project'),
    h('button', { class: 'btn', onclick: e => menu(e.currentTarget, vm.types.map(([k, l]) => ({ label: l, icon: 'plus', onClick: () => vm.add(k) }))) }, icon('plus', 15), 'Add slide'),
    h('span', { class: 'small muted' }, 'Theme'), themeSeg, h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => present(vm.index) }, icon('play', 15), 'Present'),
    h('button', { class: 'btn primary', onclick: printDeck }, icon('print', 15), 'Print / PDF')),
    h('div', { class: 'stage-wrap' }, left, main, right)));

  async function autoBuild() {
    if (vm.slides.length && !(await confirmBox('Replace your current slides with a fresh deck built from this project? (Your images on existing slides will be lost.)', 'Replace slides', 'Build from project'))) return;
    vm.rebuild(); toast('Deck built — edit each slide to tell your story');
  }
  function printDeck() { const L = vm.slides; if (!L.length) return toast('Add some slides first.', true); printNode(h('div', { class: 'print-deck' }, L.map((s, i) => slideEl(P, s, vm.theme, i)))); }
  function present(start) {
    const L = vm.slides; if (!L.length) return toast('Add some slides first.', true);
    let i = Math.max(0, start); const ov = h('div', { class: 'present', style: { alignItems: 'center', justifyContent: 'center' }, tabindex: 0 }); const holder = h('div'); ov.append(holder);
    const count = h('span', { class: 'small', style: { minWidth: '60px', textAlign: 'center' } });
    function show() { holder.innerHTML = ''; const el = slideEl(P, L[i], vm.theme, i); el.style.zoom = Math.min(innerWidth / 1280, innerHeight / 720); holder.append(el); count.textContent = `${i + 1} / ${L.length}`; }
    const go = d => { i = Math.max(0, Math.min(L.length - 1, i + d)); show(); };
    const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1); };
    const close = () => { document.removeEventListener('keydown', key); window.removeEventListener('resize', show); ov.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); };
    ov._close = close;
    /* touch & pen: swipe, or tap the left third to go back and anywhere else to go on; the bar leaves */
    const stop = e => e.stopPropagation();
    ov.append(h('div', { class: 'bar pres-bar', onpointerdown: stop, onpointerup: stop },
      h('button', { class: 'btn', 'aria-label': 'Previous slide', onclick: () => go(-1) }, icon('left', 15)), count,
      h('button', { class: 'btn', 'aria-label': 'Next slide', onclick: () => go(1) }, icon('right', 15)),
      h('button', { class: 'btn', onclick: close }, icon('x', 15), 'Exit')));
    ov.style.touchAction = 'none';
    let down = null;
    ov.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    ov.addEventListener('pointerup', e => {
      if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else if (Math.hypot(dx, dy) < 12) go(e.clientX < innerWidth / 3 ? -1 : 1);
    });
    document.addEventListener('keydown', key); window.addEventListener('resize', show); document.body.append(ov); show(); ov.focus();
  }


  const thumb = (s, i, theme) => { const t = slideEl(P, s, theme, i); t.style.zoom = 0.153; t.style.pointerEvents = 'none'; return t; };
  function drawList() {
    const L = vm.slides, cur = vm.slide, th = vm.theme;
    morph(left, [h('h3', { 'data-key': 'h', style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', marginBottom: '8px' } }, `Slides (${L.length})`),
      ...L.map((s, i) => h('div', { 'data-key': s.id, class: 'thumb-s' + (s === cur ? ' on' : ''), onclick: () => vm.select(s.id) }, h('span', { class: 'tn' }, String(i + 1)), h('div', { class: 'tw' }, thumb(s, i, th))))]);
  }
  function drawMain() {
    const s = vm.slide;
    if (!s) return morph(main, h('div', { class: 'empty', 'data-key': 'empty', style: { margin: 'auto' } }, h('h3', {}, 'Pitch your project'), h('p', { style: { maxWidth: '48ch' } }, 'Build a deck from your script, cast, crew and budget in one click — cover, logline, synopsis, characters, look & tone, team and budget — then edit each slide and export a PDF.'), h('button', { class: 'btn primary', onclick: autoBuild }, icon('wand', 15), 'Build from my project')));
    const el = slideEl(P, s, vm.theme, vm.index); el.style.zoom = Math.min(1, (main.clientWidth - 40) / 1280) || .6;
    morph(main, h('div', { class: 'pv-box', 'data-key': 'pv' }, el));
  }
  function drawRight() {
    const s = vm.slide; if (!s) return morph(right, []);
    const L = vm.labels(s), n = (s.images || []).length;
    const upload = async cb => { const f = await pickFile('image/*'); if (f) cb(await readImage(f, 1400)); };
    morph(right, [
      h('div', { class: 'field', 'data-key': 'type' }, h('label', { class: 'lbl' }, 'Slide type'), h('select', { class: 'inp', onchange: e => vm.update('type', e.target.value) }, vm.types.map(([k, l]) => h('option', { value: k, selected: k === s.type }, l)))),
      h('div', { class: 'field', 'data-key': 'title:' + s.id }, h('label', { class: 'lbl' }, L.title), h('input', { class: 'inp', value: s.title, oninput: e => vm.update('title', e.target.value) })),
      L.hasBody ? h('div', { class: 'field', 'data-key': 'body:' + s.id }, h('label', { class: 'lbl' }, L.body), h('textarea', { class: 'inp', rows: s.type === 'cover' ? 2 : 9, value: s.body, oninput: e => vm.update('body', e.target.value) })) : null,
      L.hasImage ? h('div', { class: 'field', 'data-key': 'image' }, h('label', { class: 'lbl' }, 'Image'), h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => upload(u => vm.setImage(u)) }, icon('upload', 14), s.image ? 'Replace' : 'Upload'), s.image ? h('button', { class: 'btn sm', onclick: () => vm.setImage('') }, 'Remove') : null)) : null,
      L.hasImages ? h('div', { class: 'field', 'data-key': 'images' }, h('label', { class: 'lbl' }, `Images (${n}/${PitchModel.MAX_IMAGES})`),
        h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, (s.images || []).map((u, k) => h('div', { style: { position: 'relative' } }, h('div', { class: 'thumb', style: { width: '70px', backgroundImage: `url(${u})`, backgroundSize: 'cover' } }), h('button', { class: 'icon-btn', 'aria-label': 'Remove image', style: { position: 'absolute', top: '-8px', right: '-8px', width: '22px', height: '22px', background: 'var(--surface)', border: '1px solid var(--border)' }, onclick: () => vm.removeImage(k) }, icon('x', 11))))),
        n < PitchModel.MAX_IMAGES ? h('button', { class: 'btn sm', onclick: () => upload(u => vm.addImage(u)) }, icon('plus', 14), 'Add image') : null) : null,
      h('div', { class: 'nav-sep', 'data-key': 'sep' }),
      h('div', { class: 'row', 'data-key': 'ops' }, ibtn('up', 'Move earlier', () => vm.move(-1)), ibtn('down', 'Move later', () => vm.move(1)),
        ibtn('copy', 'Duplicate slide', () => vm.duplicate()), h('span', { class: 'grow' }), ibtn('trash', 'Delete slide', () => vm.remove(), 'danger'))]);
  }
  function drawTheme() { const th = vm.theme; morph(themeSeg, vm.themes.map(([k, l]) => h('button', { 'data-key': k, class: th === k ? 'on' : '', onclick: () => vm.setTheme(k) }, l))); }
  const unbind = bindView(vm, () => { drawTheme(); drawList(); drawMain(); drawRight(); });
  const onResize = () => drawMain(); addEventListener('resize', onResize);
  const t = setTimeout(drawMain, 60);
  return () => { clearTimeout(t); unbind(); removeEventListener('resize', onResize); root.parentElement.classList.remove('noscroll'); };
};
