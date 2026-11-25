'use strict';
/* ===================================================================
   Pitch deck — MODEL
   The deck (P.pitch = { theme, slides }): cover, text, text + image,
   gallery and list slides, and the one-click deck built from facts
   about the project. Pure functions: no DOM, no Store, no UI state.
   See js/mvvm.js.
   =================================================================== */

const PitchModel = (() => {
  const TYPES = [['cover', 'Cover'], ['text', 'Text'], ['split', 'Text + image'], ['gallery', 'Image gallery'], ['list', 'List / columns']];
  const THEMES = [['ink', 'Ink'], ['paper', 'Paper'], ['bold', 'Bold']];
  const MAX_IMAGES = 6;
  const isType = t => TYPES.some(x => x[0] === t);

  const newSlide = (type = 'text', o = {}) => Object.assign({ id: newId(), type: isType(type) ? type : 'text', title: '', body: '', image: '', images: [] }, o);
  const ensure = P => { P.pitch = P.pitch || { theme: 'ink', slides: [] }; P.pitch.slides = P.pitch.slides || []; P.pitch.theme = P.pitch.theme || 'ink'; return P.pitch; };
  const slides = P => ((P.pitch || {}).slides) || [];
  const theme = P => (P.pitch || {}).theme || 'ink';
  const find = (P, id) => slides(P).find(s => s.id === id) || null;
  const index = (P, id) => slides(P).findIndex(s => s.id === id);

  /* ---------- what a slide shows ---------- */
  /** paragraphs of a text slide */
  const paras = t => String(t || '').split(/\n+/).filter(x => x.trim());
  /** list items: one per line, "Name — detail" */
  const listItems = t => String(t || '').split('\n').filter(x => x.trim()).map(l => { const m = /^(.*?)\s+[—–-]\s+(.*)$/.exec(l); return m ? { name: m[1], detail: m[2] } : { name: l, detail: '' }; });
  const galleryImages = s => (s.images || []).slice(0, MAX_IMAGES);
  /** labels for the slide editor */
  const labels = s => ({ title: s.type === 'cover' ? 'Title' : 'Heading', body: s.type === 'cover' ? 'Subtitle' : s.type === 'list' ? 'Items — one per line, “Name — detail”' : 'Text',
    hasBody: s.type !== 'gallery', hasImage: s.type === 'cover' || s.type === 'split', hasImages: s.type === 'gallery' });

  /* ---------- editing ---------- */
  function setTheme(P, k) { if (!THEMES.some(t => t[0] === k)) return false; ensure(P).theme = k; return true; }
  /** a new slide after `afterId` (or at the end) → the slide */
  function add(P, type, afterId, o) { const D = ensure(P), s = newSlide(type, o), i = index(P, afterId); D.slides.splice(i < 0 ? D.slides.length : i + 1, 0, s); return s; }
  function update(s, k, v) {
    if (k === 'type') { if (!isType(v)) return false; s.type = v; return true; }
    if (k !== 'title' && k !== 'body') return false; s[k] = String(v ?? ''); return true;
  }
  function setImage(s, url) { s.image = url || ''; return true; }
  function addImage(s, url) { s.images = s.images || []; if (!url || s.images.length >= MAX_IMAGES) return false; s.images.push(url); return true; }
  function removeImage(s, k) { if (!s.images || k < 0 || k >= s.images.length) return false; s.images.splice(k, 1); return true; }
  function move(P, id, d) { const L = slides(P), i = index(P, id), j = i + d; if (i < 0 || j < 0 || j >= L.length) return false; [L[i], L[j]] = [L[j], L[i]]; return true; }
  function duplicate(P, id) { const i = index(P, id); if (i < 0) return null; const c = Object.assign(JSON.parse(JSON.stringify(slides(P)[i])), { id: newId() }); P.pitch.slides.splice(i + 1, 0, c); return c; }
  /** delete a slide → the id of the slide to show next (the one after it, else before), or '' */
  function remove(P, id) { const L = slides(P), i = index(P, id); if (i < 0) return null; L.splice(i, 1); return (L[Math.min(i, L.length - 1)] || {}).id || ''; }
  /** replace the deck with one built from facts (see build) → the first slide */
  function rebuild(P, facts) { ensure(P).slides = build(facts); return P.pitch.slides[0]; }

  /* ---------- the one-click deck ---------- */
  /**
   * facts: { title, credit, author, logline, contact, synopses: [num, text][],
   *   roles: [{ name, age, desc }], characters: [[name, lines]], crew: [{ name, role, dept }],
   *   budget: '' (formatted total, '' when none), days, pages, scenes }
   */
  function build(f) {
    const out = [];
    out.push(newSlide('cover', { title: f.title || '', body: [f.credit, f.author].filter(Boolean).join(' ') }));
    out.push(newSlide('text', { title: 'Logline', body: f.logline || 'Add your logline in the Script → Title page dialog, or type it here.' }));
    const syn = (f.synopses || []).filter(x => x[1]).map(([n, t]) => `${n}. ${t}`).join('\n');
    out.push(newSlide('text', { title: 'Synopsis', body: syn || 'Write a scene synopsis in the Breakdown, or type your story here.' }));
    const roles = (f.roles || []).length ? f.roles.map(r => `${r.name || 'Role'} — ${[r.age, r.desc].filter(Boolean).join(', ') || 'describe this character'}`)
      : [...(f.characters || [])].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => `${c} — add a one-line description`);
    out.push(newSlide('list', { title: 'Characters', body: roles.join('\n') }));
    out.push(newSlide('gallery', { title: 'Look & tone', images: [] }));
    const crew = (f.crew || []).filter(p => p.name);
    out.push(newSlide('list', { title: 'Team', body: crew.length ? crew.map(p => `${p.name} — ${p.role || p.dept || ''}`).join('\n') : 'Director — your name\nProducer — your name' }));
    out.push(newSlide('text', { title: 'Budget & schedule', body: [f.budget ? `Budget: ${f.budget}` : 'Budget: to be confirmed', `Shoot days: ${f.days || 'TBC'}`, `Script: ${f.pages || 0} pages, ${f.scenes || 0} scenes`].join('\n') }));
    out.push(newSlide('text', { title: 'Let’s make it', body: f.contact || 'Contact details' }));
    return out;
  }

  return { TYPES, THEMES, MAX_IMAGES, newSlide, ensure, slides, theme, find, index, paras, listItems, galleryImages, labels, setTheme, add, update, setImage, addImage, removeImage, move, duplicate, remove, rebuild, build };
})();
