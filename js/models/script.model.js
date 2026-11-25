'use strict';
/* ===================================================================
   Script — MODEL
   The script is P.blocks: one line ("element") per block,
   { id, type, text, rev?, num?, note?, lockPg?, om? }. This file holds
   the element types for each writing mode and every editing rule:
   what Enter, Backspace and Delete do, the types lines turn into as you
   type, pasting, bold / italic marks, dual dialogue, notes, omitting
   scenes, find & replace, autocomplete, revisions, locked scene
   numbers, the editor's undo snapshots, imports and the title page.
   Pure functions: no DOM, no Store, no UI state. See js/mvvm.js.
   (Loaded before core.js, which takes its type tables from here.)
   =================================================================== */

const ScriptModel = (() => {
  /* ---------- element types per writing mode ---------- */
  const TYPES = {
    screenplay: [
      { k: 'scene', label: 'Scene Heading' }, { k: 'action', label: 'Action' }, { k: 'character', label: 'Character' },
      { k: 'paren', label: 'Parenthetical' }, { k: 'dialogue', label: 'Dialogue' }, { k: 'transition', label: 'Transition' }, { k: 'shot', label: 'Shot' }, { k: 'act', label: 'Act Break (TV)' },
    ],
    stage: [
      { k: 'act', label: 'Act' }, { k: 'scene', label: 'Scene' }, { k: 'setting', label: 'Setting / Description' }, { k: 'character', label: 'Character' },
      { k: 'paren', label: 'Parenthetical' }, { k: 'dialogue', label: 'Dialogue' }, { k: 'direction', label: 'Stage Direction' }, { k: 'cue', label: 'Light / Sound Cue' },
    ],
    photo: [{ k: 'scene', label: 'Setup / Look' }, { k: 'action', label: 'Notes' }],
    av: [
      { k: 'scene', label: 'Segment Heading' }, { k: 'video', label: 'Video' }, { k: 'audio', label: 'Audio' }, { k: 'super', label: 'On-screen Text / Graphic' }, { k: 'sfx', label: 'Music / SFX' },
    ],
    podcast: [
      { k: 'scene', label: 'Scene / Segment' }, { k: 'character', label: 'Speaker / Voice' }, { k: 'paren', label: 'Mic / Delivery Note' },
      { k: 'dialogue', label: 'Dialogue / Copy' }, { k: 'sfx', label: 'Sound Effect (SFX)' }, { k: 'music', label: 'Music Cue' },
      { k: 'clip', label: 'Audio Clip / Tape' }, { k: 'sponsor', label: 'Sponsor / Ad Read' },
    ],
  };
  /** types written in capitals */
  const CAPS = new Set(['scene', 'character', 'transition', 'shot', 'act', 'cue']);
  /** the type of the line Enter makes after each type */
  const NEXT = {
    screenplay: { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action', transition: 'scene', shot: 'action', act: 'scene' },
    stage: { act: 'scene', scene: 'setting', setting: 'character', character: 'dialogue', paren: 'dialogue', dialogue: 'character', direction: 'character', cue: 'character' },
    photo: { scene: 'action', action: 'action' },
    av: { scene: 'video', video: 'audio', super: 'audio', audio: 'video', sfx: 'video' },
    podcast: { scene: 'character', character: 'dialogue', paren: 'dialogue', dialogue: 'character', sfx: 'character', music: 'character', clip: 'character', sponsor: 'character' },
  };
  const DEFAULT_TYPE = { screenplay: 'action', stage: 'direction', av: 'video', photo: 'action', podcast: 'dialogue' };
  const PLACEHOLDER = {
    scene: 'INT. LOCATION - DAY', action: 'Describe what we see and hear…', character: 'CHARACTER', paren: '(parenthetical)', dialogue: 'Dialogue…',
    transition: 'CUT TO:', shot: 'CLOSE ON…', act: 'ACT ONE', video: 'Describe the picture…', audio: 'Narration, dialogue…', super: 'ON-SCREEN TEXT', sfx: 'Music / SFX cue…', setting: 'Describe the setting…', direction: 'Stage direction…', cue: 'LX 1 — GO',
  };
  const TRANSITIONS = ['CUT TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'DISSOLVE TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'BLACKOUT.', 'LIGHTS UP.', 'END OF ACT.'];
  const TIMES = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME'];
  const SC_PREFIX = /^(INT\.?\/EXT\.|INT\.|EXT\.|EST\.|I\/E\.)/i;
  const REV_COLORS = [
    { k: 'white', label: 'White', color: '#ffffff' }, { k: 'blue', label: 'Blue', color: '#cfe3ff' }, { k: 'pink', label: 'Pink', color: '#ffd5e5' },
    { k: 'yellow', label: 'Yellow', color: '#fff4b3' }, { k: 'green', label: 'Green', color: '#d3f2d0' }, { k: 'goldenrod', label: 'Goldenrod', color: '#f5dd9b' },
    { k: 'buff', label: 'Buff', color: '#efdcb8' }, { k: 'salmon', label: 'Salmon', color: '#ffd0bd' }, { k: 'cherry', label: 'Cherry', color: '#ffb5bd' },
  ];

  const typesOf = mode => TYPES[mode] || TYPES.screenplay;
  const defType = mode => DEFAULT_TYPE[mode] || 'action';
  const nextType = (mode, t) => (NEXT[mode] || {})[t];
  const caps = (type, v) => CAPS.has(type) ? String(v).toUpperCase() : String(v);
  const isDual = b => b.type === 'character' && /\^\s*$/.test(b.text);
  const rev = P => (P.settings || {}).rev || '';
  const currentRev = P => (P.revisions || []).find(r => r.id === rev(P)) || null;
  const revColor = (P, id) => { const r = (P.revisions || []).find(x => x.id === id); return r ? r.color : ''; };

  const blocks = P => (P && P.blocks) || [];
  const index = (P, id) => blocks(P).findIndex(b => b.id === id);
  const find = (P, id) => blocks(P).find(b => b.id === id) || null;

  /* ---------- lines ---------- */
  /** a new line, marked with the revision being tracked */
  function newBlock(P, type, text = '') { const b = { id: newId(), type, text }; if (rev(P)) b.rev = rev(P); return b; }
  /** mark a changed line with the revision being tracked → whether the mark changed */
  function markRev(P, b) { const r = rev(P); if (r && b.rev !== r) { b.rev = r; return true; } return false; }
  /** the type a line turns into as you type `v` over `was`, or null */
  function autoType(mode, b, was, v) {
    if (mode === 'screenplay' && b.type === 'action' && !SC_PREFIX.test(was) && SC_PREFIX.test(v) && v.length <= 10) return 'scene';
    if ((b.type === 'dialogue' || b.type === 'action') && was === '' && v === '(') return 'paren';
    if (mode === 'podcast') {
      const up = v.toUpperCase();
      if (/^(?:SFX|SOUND|FX)[:\s]/.test(up) && b.type !== 'sfx') return 'sfx';
      if (/^(?:MUSIC|TRACK|THEME)[:\s]/.test(up) && b.type !== 'music') return 'music';
      if (/^(?:CLIP|TAPE|ACTUALITY)[:\s]/.test(up) && b.type !== 'clip') return 'clip';
      if (/^(?:SPONSOR|AD|MIDROLL)[:\s]/.test(up) && b.type !== 'sponsor') return 'sponsor';
      if (/^(?:SEGMENT|TRACK|SCENE|PART)\s+\d+/i.test(v) && b.type !== 'scene') return 'scene';
    }
    return null;
  }
  /** typing: store `v` in the line (auto type, capitals, revision mark) → the line */
  function type(P, b, v) {
    const t = autoType(P.mode, b, b.text, v); if (t) b.type = t;
    b.text = caps(b.type, v); markRev(P, b); return b;
  }
  /** change a line's type → false when it already was that type */
  function setType(P, b, t) {
    if (b.type === t || !t) return false;
    b.type = t; if (CAPS.has(t)) b.text = b.text.toUpperCase(); markRev(P, b); return true;
  }
  /** Tab / Shift+Tab: the next type round the mode's list */
  function cycleType(mode, t, dir) { const k = typesOf(mode).map(x => x.k); let i = k.indexOf(t); i = (i + dir + k.length) % k.length; return k[i]; }
  /** a parenthetical always has its brackets */
  function finishParen(v) { if (!String(v).trim()) return v; let s = v.trim(); if (!s.startsWith('(')) s = '(' + s; if (!s.endsWith(')')) s += ')'; return s; }
  /** wrap or unwrap the selection [s, e) of `v` in a mark (** bold, * italic, _ underline) → { value, start, end } */
  function toggleMark(v, s, e, mark) {
    const sel = v.slice(s, e), m = mark.length;
    if (sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark)) return { value: v.slice(0, s) + sel.slice(m, -m) + v.slice(e), start: s, end: e - 2 * m };
    if (s >= m && v.slice(s - m, s) === mark && v.slice(e, e + m) === mark) return { value: v.slice(0, s - m) + sel + v.slice(e + m), start: s - m, end: e - m };
    if (!sel) return { value: v.slice(0, s) + mark + mark + v.slice(e), start: s + m, end: s + m };
    return { value: v.slice(0, s) + mark + sel + mark + v.slice(e), start: s, end: e + 2 * m };
  }
  /** dual dialogue: a character line ending in ^ prints beside the speaker above → whether it is now dual */
  function toggleDual(P, b) {
    if (b.type !== 'character') return null;
    b.text = isDual(b) ? b.text.replace(/\s*\^\s*$/, '') : b.text.replace(/\s+$/, '') + ' ^';
    markRev(P, b); return isDual(b);
  }
  /** a private note on a line ('' deletes it) */
  function setNote(b, v) { v = String(v || '').trim(); if (v) b.note = v; else delete b.note; return true; }

  /* ---------- structure: each returns where the cursor goes, { id, caret } ('end' / 'start' / a number), or null ---------- */
  function insertAfter(P, b, nb) { P.blocks.splice(index(P, b.id) + 1, 0, nb); return nb; }
  /** remove a line (the last one left is emptied instead) → whether it was removed */
  function remove(P, b) { if (P.blocks.length <= 1) { b.text = ''; return false; } P.blocks.splice(index(P, b.id), 1); return true; }
  /** Enter with the selection [s, e) of the line's text `v` */
  function split(P, b, v, s, e) {
    const mode = P.mode, def = defType(mode);
    if (b.type === 'paren') { const f = finishParen(v); if (f !== v) { v = f; s = e = v.length; } }
    b.text = v;
    const before = v.slice(0, s), after = v.slice(e).replace(/^[ \t]+/, '');
    if (!v.trim()) {
      if (b.type !== def) { setType(P, b, def); return { id: b.id, caret: 0 }; }
      return { id: insertAfter(P, b, newBlock(P, def)).id, caret: 0 };
    }
    if (mode === 'screenplay' && b.type === 'action' && /^[A-Z][A-Z .\-]*TO:$/.test(before.trim()) && !after.trim()) b.type = 'transition';
    const t = after.trim() ? (['scene', 'act', 'character'].includes(b.type) ? nextType(mode, b.type) || def : b.type) : nextType(mode, b.type) || def;
    if (!before.trim() && after.trim()) { b.text = ''; return { id: insertAfter(P, b, newBlock(P, b.type, after)).id, caret: 0 }; }
    b.text = before; markRev(P, b);
    return { id: insertAfter(P, b, newBlock(P, t, caps(t, after))).id, caret: 0 };
  }
  /** Ctrl+Enter: a new empty line after this one */
  function lineAfter(P, b) { return { id: insertAfter(P, b, newBlock(P, defType(P.mode))).id, caret: 0 }; }
  /** Backspace at the very start of a line whose text is `v`. `lost`: a line that went (it may have had scene data) */
  function backspace(P, b, v) {
    b.text = v; const i = index(P, b.id); if (i <= 0) return null;
    const prev = P.blocks[i - 1], def = defType(P.mode);
    if (!v) { remove(P, b); return { id: prev.id, caret: 'end', lost: b }; }
    if (prev.type === b.type) { const pl = prev.text.length; prev.text += b.text; markRev(P, prev); remove(P, b); return { id: prev.id, caret: pl, lost: b }; }
    if (!prev.text.trim()) { remove(P, prev); return { id: b.id, caret: 0, lost: prev }; }
    if (b.type !== def && b.type !== 'scene') { const was = b.type; setType(P, b, def); return { id: b.id, caret: 0, retyped: was }; }
    return null;
  }
  /** Delete at the very end of a line whose text is `v` (joins the next line when it is the same type or empty) */
  function del(P, b, v) {
    b.text = v; const i = index(P, b.id); if (i < 0 || i >= P.blocks.length - 1) return null;
    const next = P.blocks[i + 1];
    if (!(next.type === b.type || !next.text.trim() || !v)) return null;
    if (!v && next.text) { remove(P, b); return { id: next.id, caret: 0, lost: b }; }
    const pl = b.text.length; b.text += next.text; markRev(P, b); remove(P, next); return { id: b.id, caret: pl, lost: next };
  }
  /** a new scene heading (and an empty line under it) at the end */
  function addScene(P) { const a = newBlock(P, 'scene'), c = newBlock(P, defType(P.mode)); P.blocks.push(a, c); return { id: a.id, caret: 0 }; }
  /** paste several parsed lines into [s, e) of line `b` (text `v`) */
  function paste(P, b, v, s, e, parsed) {
    const L = parsed.slice(); if (!L.length) return null;
    const r = rev(P); L.forEach(nb => { if (r) nb.rev = r; });
    const before = v.slice(0, s), after = v.slice(e); let ref = b;
    if (before.trim()) b.text = before; else { const f = L.shift(); b.text = f.text; b.type = f.type; }
    L.forEach(nb => { insertAfter(P, ref, nb); ref = nb; });
    if (after.trim()) insertAfter(P, ref, newBlock(P, defType(P.mode), after));
    return { id: ref.id, caret: 'end', count: parsed.length };
  }

  /* ---------- scenes ---------- */
  /** the scene heading a line sits under (null outside a scene, or under an act break) */
  function sceneOf(P, id) { for (let j = index(P, id); j >= 0; j--) { const x = P.blocks[j]; if (x.type === 'scene') return x; if (x.type === 'act') return null; } return null; }
  /** omit / restore the scene a line is in → 'omitted', 'restored' or null (not in a scene) */
  function toggleOmit(P, id) { const h = sceneOf(P, id); if (!h) return null; if (h.om) { delete h.om; return 'restored'; } h.om = true; return 'omitted'; }
  function restoreScene(P, id) { const h = find(P, id); if (!h || !h.om) return false; delete h.om; return true; }
  const omitted = P => blocks(P).filter(b => b.type === 'scene' && b.om);
  /** lines with notes, and the scene heading each is under */
  function notes(P) { let scene = ''; const out = []; blocks(P).forEach(b => { if (b.type === 'scene') scene = b.text; if (b.note) out.push({ id: b.id, note: b.note, text: b.text, scene }); }); return out; }

  /* ---------- locked scene numbers (production): new scenes get 4A, 4B… ---------- */
  function lockNumbers(P) { let n = 0; blocks(P).forEach(b => { if (b.type === 'scene') b.num = String(++n); }); P.settings.sceneNumLock = true; }
  function unlockNumbers(P) { blocks(P).forEach(b => { delete b.num; }); P.settings.sceneNumLock = false; }
  function nextLetters(s) { const a = s.split(''); let i = a.length - 1; while (i >= 0) { if (a[i] === 'Z') { a[i] = 'A'; i--; } else { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); return a.join(''); } } return 'A' + a.join(''); }
  /** give unnumbered scenes a lettered number after the scene before them → whether any changed */
  function assignNumbers(P) {
    const used = new Set(blocks(P).filter(b => b.type === 'scene' && b.num).map(b => b.num)); let prev = '', changed = false;
    blocks(P).forEach(b => {
      if (b.type !== 'scene') return;
      if (!b.num) {
        let cand;
        if (!prev) cand = 'A1';
        else { const m = /^(.*?)([A-Z]*)$/.exec(prev); const base = m[1]; let suf = m[2] ? nextLetters(m[2]) : 'A'; cand = base + suf; while (used.has(cand)) { suf = nextLetters(suf); cand = base + suf; } }
        b.num = cand; used.add(cand); changed = true;
      }
      prev = b.num;
    });
    return changed;
  }

  /* ---------- find & replace ---------- */
  function findAll(P, q) { const out = []; q = String(q || '').toLowerCase(); if (!q) return out; blocks(P).forEach(b => { const t = b.text.toLowerCase(); let k = -1; while ((k = t.indexOf(q, k + 1)) >= 0) out.push({ id: b.id, at: k }); }); return out; }
  /** replace every match, any case → how many */
  function replaceAll(P, q, r) {
    if (!q) return 0; let n = 0; const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    blocks(P).forEach(b => { re.lastIndex = 0; if (!re.test(b.text)) return; re.lastIndex = 0; b.text = caps(b.type, b.text.replace(re, () => { n++; return r; })); markRev(P, b); });
    return n;
  }

  /* ---------- autocomplete: { items, from, to } to replace [from, to) with, or null ---------- */
  /** known: { characters: names, most used first; locations } */
  function suggest(mode, t, v, pos, known = {}) {
    const before = v.slice(0, pos), up = before.toUpperCase();
    if (t === 'character') {
      if (!up.trim() || /\(/.test(up)) return null;
      const items = [...new Set(known.characters || [])].filter(n => n.startsWith(up) && n !== up);
      return items.length ? { items, from: 0, to: v.length } : null;
    }
    if (t === 'transition') { const items = TRANSITIONS.filter(n => n.startsWith(up) && n !== up); return up && items.length ? { items, from: 0, to: v.length } : null; }
    if (t === 'scene' && mode === 'screenplay') {
      if (/^[A-Z.\/]*$/.test(up)) { const items = ['INT. ', 'EXT. ', 'INT./EXT. ', 'I/E. '].filter(x => x.startsWith(up) && x !== up); return items.length ? { items, from: 0, to: pos } : null; }
      const m = /^(INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+(.*)$/.exec(up); if (!m) return null;
      const rest = m[2], tm = /\s-\s([A-Z' ]*)$/.exec(rest);
      if (tm) { const items = TIMES.filter(x => x.startsWith(tm[1]) && x !== tm[1]); return items.length ? { items, from: pos - tm[1].length, to: pos } : null; }
      if (rest && !/ - /.test(rest)) { const items = (known.locations || []).filter(l => l.startsWith(rest) && l !== rest).map(l => l + ' - '); return items.length ? { items, from: pos - rest.length, to: pos } : null; }
    }
    return null;
  }
  /** put a suggestion into the text → { value, caret } */
  const acceptSuggestion = (v, s, item) => ({ value: v.slice(0, s.from) + item + v.slice(s.to), caret: s.from + item.length });

  /* ---------- revisions (coloured pages) ---------- */
  const nextRevColor = P => REV_COLORS.find(c => !(P.revisions || []).some(r => r.color === c.color)) || REV_COLORS[1];
  /** start tracking a new revision → the revision */
  function startRevision(P, k, date) {
    const c = REV_COLORS.find(x => x.k === k); if (!c) return null;
    const r = { id: newId(), name: c.label + ' Revision', color: c.color, date: date || '' };
    (P.revisions = P.revisions || []).push(r); P.settings.rev = r.id; return r;
  }
  function track(P, id) { if (id && !(P.revisions || []).some(r => r.id === id)) return false; P.settings.rev = id || ''; return true; }
  /** a clean, all-white script */
  function clearMarks(P) { blocks(P).forEach(b => delete b.rev); P.revisions = []; P.settings.rev = ''; return true; }

  /* ---------- the editor's undo snapshots (also used for saved drafts) ---------- */
  const snap = P => JSON.stringify(blocks(P).map(b => [b.id, b.type, b.text, b.rev || '', b.num || '', b.note || '', b.lockPg || 0, b.om ? 1 : 0]));
  const parse = s => JSON.parse(s).map(([id, type, text, rev, num, note, lockPg, om]) => { const b = { id, type, text }; if (rev) b.rev = rev; if (num) b.num = num; if (note) b.note = note; if (lockPg) b.lockPg = lockPg; if (om) b.om = true; return b; });
  function restore(P, s) { P.blocks = parse(s); return P.blocks; }

  /* ---------- import ---------- */
  /** res: { meta, blocks, keepNumbers }; replace the script, or add to its end (dropping a trailing empty line) */
  function applyImport(P, res, replace) {
    const mt = res.meta || {};
    if (!replace) { P.blocks = blocks(P).filter((b, i, L) => b.text.trim() || i < L.length - 1).concat(res.blocks); return res.blocks.length; }
    P.blocks = res.blocks; if (mt.title) P.title = mt.title;
    const m = P.meta = P.meta || {};
    m.credit = mt.credit || m.credit; m.author = mt.author || mt.authors || m.author; m.source = mt.source || ''; m.contact = mt.contact || '';
    m.draft = mt['draft date'] || mt.draft || mt.date || ''; m.copyright = mt.copyright || '';
    if (res.keepNumbers) P.settings.sceneNumLock = true;
    return res.blocks.length;
  }

  /* ---------- title page and editor settings ---------- */
  /** the title page fields: [key, label, multi-line] */
  function titleFields(mode) {
    return [['title', 'Title'], ['credit', 'Credit line'], ['author', 'Author(s)'], ['source', 'Based on / source'], ['contact', 'Contact info', true], ['draft', 'Draft / date'], ['copyright', 'Copyright'],
      ...(mode === 'stage' ? [['setting', 'Setting (place)'], ['time', 'Time / period'], ['runtime', 'Running time']] : []), ['logline', 'Logline', true]];
  }
  const metaOf = (P, k) => k === 'title' ? P.title || '' : (P.meta || {})[k] || '';
  function setMeta(P, k, v) { if (!titleFields(P.mode).some(f => f[0] === k)) return false; if (k === 'title') P.title = String(v); else (P.meta = P.meta || {})[k] = String(v); return true; }
  function zoom(P, d) { const z = Math.min(1.8, Math.max(0.5, +((P.settings.zoom || 1) + d).toFixed(2))); P.settings.zoom = z; return z; }
  const numbersShown = P => !!(P.settings.sceneNumbers || P.settings.sceneNumLock || P.settings.multicam);

  /* ---------- counts and the table read ---------- */
  function stats(P) { let scenes = 0, words = 0; blocks(P).forEach(b => { if (b.type === 'scene') scenes++; const t = b.text.trim(); if (t) words += t.split(/\s+/).length; }); return { scenes, words }; }
  /** rough running time in minutes */
  const runtime = (mode, pages, words) => mode === 'podcast' ? Math.max(1, Math.round(words / 140)) : mode === 'stage' ? Math.round(pages * 1.5) : pages;
  const SILENT = new Set(['paren', 'cue', 'shot', 'sfx', 'super']);
  /** what a table read speaks, from line `from` on: [{ id, type, text, speaker }] (omitted scenes read only their heading) */
  function readQueue(P, from = 0) {
    const out = []; let speaker = '', om = false;
    blocks(P).slice(Math.max(0, from)).forEach(b => {
      if (b.type === 'scene' || b.type === 'act') om = b.type === 'scene' && !!b.om;
      if (om && b.type !== 'scene') return;
      if (b.type === 'character') { speaker = b.text; return; }
      if (SILENT.has(b.type) || !b.text.trim()) return;
      out.push({ id: b.id, type: b.type, text: b.text, speaker: b.type === 'dialogue' ? speaker : '' });
    });
    return out;
  }
  /** a scene heading read out loud */
  const spokenHeading = t => t.replace(/^INT\.?\/EXT\.?/i, 'Interior exterior.').replace(/^INT\.?/i, 'Interior.').replace(/^EXT\.?/i, 'Exterior.').replace(/^I\/E\.?/i, 'Interior exterior.').replace(/\s+-\s+/g, '. ');

  return {
    TYPES, CAPS, NEXT, DEFAULT_TYPE, PLACEHOLDER, TRANSITIONS, TIMES, SC_PREFIX, REV_COLORS,
    typesOf, defType, nextType, caps, isDual, currentRev, revColor, index, find,
    newBlock, markRev, autoType, type, setType, cycleType, finishParen, toggleMark, toggleDual, setNote,
    insertAfter, remove, split, lineAfter, backspace, del, addScene, paste,
    sceneOf, toggleOmit, restoreScene, omitted, notes,
    lockNumbers, unlockNumbers, nextLetters, assignNumbers,
    findAll, replaceAll, suggest, acceptSuggestion,
    nextRevColor, startRevision, track, clearMarks,
    snap, parse, restore, applyImport, titleFields, metaOf, setMeta, zoom, numbersShown,
    stats, runtime, readQueue, spokenHeading,
  };
})();
