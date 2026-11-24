'use strict';
/* ===================================================================
   Pitch deck builder — slides built from your project, printable to PDF
   =================================================================== */
const SLIDE_TYPES = [['cover', 'Cover'], ['text', 'Text'], ['split', 'Text + image'], ['gallery', 'Image gallery'], ['list', 'List / columns']];
const DECK_THEMES = [['ink', 'Ink'], ['paper', 'Paper'], ['bold', 'Bold']];
const newSlide = (type = 'text', o = {}) => Object.assign({ id: uid(), type, title: '', body: '', image: '', images: [] }, o);

function slideEl(P, s, theme, idx) {
  const el = h('div', { class: `slide th-${theme} t-${s.type}` });
  const paras = t => (t || '').split(/\n{1,}/).filter(x => x.trim()).map(x => h('p', {}, x));
  const img = u => u ? { backgroundImage: `url(${u})` } : {};
  if (s.type === 'cover') {
    if (s.image) el.style.backgroundImage = `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.55)), url(${s.image})`;
    el.append(h('div', { class: 'sc-in' }, h('div', { class: 'bar' }), h('h1', {}, s.title || 'Untitled'), s.body ? h('div', { class: 'sub' }, s.body) : null));
  } else if (s.type === 'split') {
    el.append(h('div', { class: 'sc-in' }, h('h2', {}, s.title), h('div', { class: 'bd' }, paras(s.body))), h('div', { class: 'sc-img' + (s.image ? '' : ' ph'), style: img(s.image) }, s.image ? '' : 'Add an image'));
  } else if (s.type === 'gallery') {
    const imgs = (s.images || []).slice(0, 6);
    el.append(h('div', { class: 'sc-in' }, h('h2', {}, s.title), h('div', { class: 'grid n' + Math.max(1, Math.min(6, imgs.length || 3)) }, imgs.length ? imgs.map(u => h('div', { class: 'gi', style: img(u) })) : [1, 2, 3].map(() => h('div', { class: 'gi ph' }, 'Add images')))));
  } else if (s.type === 'list') {
    const items = (s.body || '').split('\n').filter(x => x.trim());
    el.append(h('div', { class: 'sc-in' }, h('h2', {}, s.title), h('div', { class: 'cols' }, items.map(l => { const m = /^(.*?)\s+[—–-]\s+(.*)$/.exec(l); return h('div', { class: 'li' }, h('b', {}, m ? m[1] : l), m ? h('span', {}, m[2]) : null); }))));
  } else {
    el.append(h('div', { class: 'sc-in' }, h('h2', {}, s.title), h('div', { class: 'bd wide' }, paras(s.body))));
  }
  if (s.type !== 'cover') el.append(h('div', { class: 'sc-ft' }, h('span', {}, P.title), h('span', {}, String(idx + 1).padStart(2, '0'))));
  return el;
}

function buildDeck(P) {
  const sc = getScenes(P), slides = [];
  slides.push(newSlide('cover', { title: P.title, body: [P.meta.credit, P.meta.author].filter(Boolean).join(' ') }));
  slides.push(newSlide('text', { title: 'Logline', body: P.meta.logline || 'Add your logline in the Script → Title page dialog, or type it here.' }));
  const syn = sc.filter(s => s.synopsis).map(s => `${s.num}. ${s.synopsis}`).join('\n');
  slides.push(newSlide('text', { title: 'Synopsis', body: syn || 'Write a scene synopsis in the Breakdown, or type your story here.' }));
  const roles = P.casting.roles.length ? P.casting.roles.map(r => `${r.name || 'Role'} — ${[r.age, r.desc].filter(Boolean).join(', ') || 'describe this character'}`) : [...allCharacters(P)].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => `${c} — add a one-line description`);
  slides.push(newSlide('list', { title: 'Characters', body: roles.join('\n') }));
  slides.push(newSlide('gallery', { title: 'Look & tone', images: [] }));
  const crew = P.people.filter(p => p.type === 'crew' && p.name);
  slides.push(newSlide('list', { title: 'Team', body: crew.length ? crew.map(p => `${p.name} — ${p.role || p.dept}`).join('\n') : 'Director — your name\nProducer — your name' }));
  const total = finCalc(P).total;
  slides.push(newSlide('text', { title: 'Budget & schedule', body: [total ? `Budget: ${money(total)}` : 'Budget: to be confirmed', `Shoot days: ${P.days.length || 'TBC'}`, `Script: ${scriptStats(P).pages} pages, ${sc.length} scenes`].join('\n') }));
  slides.push(newSlide('text', { title: 'Let’s make it', body: P.meta.contact || 'Contact details' }));
  return slides;
}

Views.pitch = function (root) {
  const P = Store.P, D = P.pitch = P.pitch || { theme: 'ink', slides: [] }; D.slides = D.slides || [];
  let sel = D.slides.find(s => s.id === UI.slideId) ? UI.slideId : (D.slides[0] && D.slides[0].id);
  root.parentElement.classList.add('noscroll');
  const left = h('div', { class: 'stage-side', style: { width: '230px' } }), main = h('div', { class: 'stage-main', style: { overflow: 'auto', alignItems: 'center' } }), right = h('div', { class: 'stage-right' });
  const themeSeg = h('div', { class: 'seg' }, DECK_THEMES.map(([k, l]) => h('button', { 'data-k': k, class: D.theme === k ? 'on' : '', onclick: () => { D.theme = k; Store.touch(); $$('button', themeSeg).forEach(b => b.classList.toggle('on', b.dataset.k === k)); drawPreview(); drawList(); } }, l)));
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', onclick: autoBuild }, icon('wand', 15), 'Build from my project'),
    h('button', { class: 'btn', onclick: e => menu(e.currentTarget, SLIDE_TYPES.map(([k, l]) => ({ label: l, icon: 'plus', onClick: () => addSlide(k) }))) }, icon('plus', 15), 'Add slide'),
    h('span', { class: 'small muted' }, 'Theme'), themeSeg, h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => present(D.slides.findIndex(s => s.id === sel)) }, icon('play', 15), 'Present'),
    h('button', { class: 'btn primary', onclick: printDeck }, icon('print', 15), 'Print / PDF')),
    h('div', { class: 'stage-wrap' }, left, main, right)));

  const cur = () => D.slides.find(s => s.id === sel);
  function addSlide(type) { const s = newSlide(type, { title: type === 'cover' ? P.title : 'New slide' }); const i = D.slides.findIndex(x => x.id === sel); D.slides.splice(i + 1, 0, s); sel = UI.slideId = s.id; Store.touch(); drawAll(); }
  async function autoBuild() {
    if (D.slides.length && !(await confirmBox('Replace your current slides with a fresh deck built from this project? (Your images on existing slides will be lost.)', 'Replace slides', 'Build from project'))) return;
    D.slides = buildDeck(P); sel = UI.slideId = D.slides[0].id; Store.touch(); drawAll(); toast('Deck built — edit each slide to tell your story');
  }
  function printDeck() { if (!D.slides.length) return toast('Add some slides first.', true); printNode(h('div', { class: 'print-deck' }, D.slides.map((s, i) => slideEl(P, s, D.theme, i)))); }
  function present(start) {
    if (!D.slides.length) return toast('Add some slides first.', true);
    let i = Math.max(0, start); const ov = h('div', { class: 'present', style: { alignItems: 'center', justifyContent: 'center' }, tabindex: 0 }); const holder = h('div'); ov.append(holder);
    const count = h('span', { class: 'small', style: { minWidth: '60px', textAlign: 'center' } });
    function show() { holder.innerHTML = ''; const el = slideEl(P, D.slides[i], D.theme, i); el.style.zoom = Math.min(innerWidth / 1280, innerHeight / 720); holder.append(el); count.textContent = `${i + 1} / ${D.slides.length}`; }
    const go = d => { i = Math.max(0, Math.min(D.slides.length - 1, i + d)); show(); };
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

  function drawList() {
    left.innerHTML = '';
    left.append(h('h3', { style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', marginBottom: '8px' } }, `Slides (${D.slides.length})`));
    D.slides.forEach((s, i) => { const t = slideEl(P, s, D.theme, i); t.style.zoom = 0.153; t.style.pointerEvents = 'none';
      left.append(h('div', { class: 'thumb-s' + (s.id === sel ? ' on' : ''), onclick: () => { sel = UI.slideId = s.id; drawAll(); } }, h('span', { class: 'tn' }, i + 1), h('div', { class: 'tw' }, t))); });
  }
  let pvBox = null;
  function drawPreview() {
    if (!pvBox) return; pvBox.innerHTML = ''; const s = cur();
    if (!s) return; const el = slideEl(P, s, D.theme, D.slides.indexOf(s)); const k = Math.min(1, (main.clientWidth - 40) / 1280) || .6; el.style.zoom = k; pvBox.append(el);
    const t = $$('.thumb-s .tw', left)[D.slides.indexOf(s)]; if (t) { const te = slideEl(P, s, D.theme, D.slides.indexOf(s)); te.style.zoom = 0.153; te.style.pointerEvents = 'none'; t.replaceChildren(te); }
  }
  function drawMain() {
    main.innerHTML = '';
    if (!D.slides.length) { main.append(h('div', { class: 'empty', style: { margin: 'auto' } }, h('h3', {}, 'Pitch your project'), h('p', { style: { maxWidth: '48ch' } }, 'Build a deck from your script, cast, crew and budget in one click — cover, logline, synopsis, characters, look & tone, team and budget — then edit each slide and export a PDF.'), h('button', { class: 'btn primary', onclick: autoBuild }, icon('wand', 15), 'Build from my project'))); pvBox = null; return; }
    pvBox = h('div', { class: 'pv-box' }); main.append(pvBox); drawPreview();
  }
  function drawRight() {
    right.innerHTML = ''; const s = cur(); if (!s) return;
    const i = D.slides.indexOf(s);
    const upload = async cb => { const f = await pickFile('image/*'); if (f) { cb(await readImage(f, 1400)); Store.touch(); drawAll(); } };
    right.append(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Slide type'), h('select', { class: 'inp', onchange: e => { s.type = e.target.value; Store.touch(); drawAll(); } }, SLIDE_TYPES.map(([k, l]) => h('option', { value: k, selected: k === s.type }, l)))),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, s.type === 'cover' ? 'Title' : 'Heading'), h('input', { class: 'inp', value: s.title, oninput: e => { s.title = e.target.value; Store.touch(); drawPreview(); } })),
      s.type !== 'gallery' ? h('div', { class: 'field' }, h('label', { class: 'lbl' }, s.type === 'cover' ? 'Subtitle' : s.type === 'list' ? 'Items — one per line, “Name — detail”' : 'Text'), h('textarea', { class: 'inp', rows: s.type === 'cover' ? 2 : 9, value: s.body, oninput: e => { s.body = e.target.value; Store.touch(); drawPreview(); } })) : null,
      s.type === 'cover' || s.type === 'split' ? h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Image'), h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => upload(u => s.image = u) }, icon('upload', 14), s.image ? 'Replace' : 'Upload'), s.image ? h('button', { class: 'btn sm', onclick: () => { s.image = ''; Store.touch(); drawAll(); } }, 'Remove') : null)) : null,
      s.type === 'gallery' ? h('div', { class: 'field' }, h('label', { class: 'lbl' }, `Images (${(s.images || []).length}/6)`),
        h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, (s.images || []).map((u, k) => h('div', { style: { position: 'relative' } }, h('div', { class: 'thumb', style: { width: '70px', backgroundImage: `url(${u})`, backgroundSize: 'cover' } }), h('button', { class: 'icon-btn', style: { position: 'absolute', top: '-8px', right: '-8px', width: '22px', height: '22px', background: 'var(--surface)', border: '1px solid var(--border)' }, onclick: () => { s.images.splice(k, 1); Store.touch(); drawAll(); } }, icon('x', 11))))),
        (s.images || []).length < 6 ? h('button', { class: 'btn sm', onclick: () => upload(u => { s.images = s.images || []; s.images.push(u); }) }, icon('plus', 14), 'Add image') : null) : null,
      h('div', { class: 'nav-sep' }),
      h('div', { class: 'row' }, ibtn('up', 'Move earlier', () => { if (i > 0) { [D.slides[i - 1], D.slides[i]] = [D.slides[i], D.slides[i - 1]]; Store.touch(); drawAll(); } }), ibtn('down', 'Move later', () => { if (i < D.slides.length - 1) { [D.slides[i + 1], D.slides[i]] = [D.slides[i], D.slides[i + 1]]; Store.touch(); drawAll(); } }),
        ibtn('copy', 'Duplicate slide', () => { const c = JSON.parse(JSON.stringify(s)); c.id = uid(); D.slides.splice(i + 1, 0, c); sel = UI.slideId = c.id; Store.touch(); drawAll(); }), h('span', { class: 'grow' }),
        ibtn('trash', 'Delete slide', () => { D.slides.splice(i, 1); sel = UI.slideId = (D.slides[Math.min(i, D.slides.length - 1)] || {}).id; Store.touch(); drawAll(); }, 'danger')));
  }
  function drawAll() { drawList(); drawMain(); drawRight(); }
  drawAll();
  const onResize = () => drawPreview(); addEventListener('resize', onResize);
  setTimeout(drawPreview, 60);
  return () => { removeEventListener('resize', onResize); root.parentElement.classList.remove('noscroll'); };
};
