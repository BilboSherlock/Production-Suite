'use strict';
/* ===================================================================
   Lookbook — MODEL
   Mood boards (P.lookbook.boards), each a list of tiles: reference
   images, colour swatches and notes, with captions.
   Pure functions: no DOM, no Store, no UI state. See js/mvvm.js.
   =================================================================== */

const LookbookModel = (() => {
  const KINDS = ['image', 'note', 'color'];
  const HEX = /^#[0-9a-f]{6}$/i;
  const newBoard = (name = 'New board') => ({ id: newId(), name, about: '', tiles: [] });
  const newTile = (kind, o = {}) => Object.assign({ id: newId(), kind: KINDS.includes(kind) ? kind : 'note', img: '', text: '', color: '#2c3a9e', caption: '' }, o);
  const ensure = P => { P.lookbook = P.lookbook || {}; P.lookbook.boards = P.lookbook.boards || []; return P.lookbook; };
  const boards = P => ((P.lookbook || {}).boards) || [];
  const find = (P, id) => boards(P).find(b => b.id === id) || null;
  const cover = b => (b.tiles.find(t => t.kind === 'image') || {}).img || '';
  const images = b => b.tiles.filter(t => t.kind === 'image').map(t => t.img);

  /* ---------- boards ---------- */
  function addBoard(P, name) { const b = newBoard(name); ensure(P).boards.push(b); return b; }
  /** the next default name: "Board 3" */
  const nextName = P => 'Board ' + (boards(P).length + 1);
  /** a board per name that has none yet (case-insensitive), at most 20 → how many added */
  function addBoards(P, names) {
    const have = new Set(boards(P).map(b => b.name.toLowerCase())); let n = 0;
    [...new Set(names.map(x => String(x || '').trim()).filter(Boolean))].slice(0, 20).forEach(nm => { if (!have.has(nm.toLowerCase())) { have.add(nm.toLowerCase()); addBoard(P, nm); n++; } });
    return n;
  }
  function updateBoard(b, k, v) { if (k !== 'name' && k !== 'about') return false; b[k] = String(v ?? ''); return true; }
  function removeBoard(P, id) { const L = ensure(P), n = L.boards.length; L.boards = L.boards.filter(b => b.id !== id); return L.boards.length < n; }

  /* ---------- tiles ---------- */
  function addTile(b, kind, o) { const t = newTile(kind, o); b.tiles.push(t); return t; }
  const findTile = (b, id) => b.tiles.find(t => t.id === id) || null;
  function updateTile(t, k, v) {
    if (k === 'color') { if (!HEX.test(v)) return false; t.color = v.toLowerCase(); return true; }
    if (k !== 'caption' && k !== 'text') return false; t[k] = String(v ?? ''); return true;
  }
  function moveTile(b, id, d) { const i = b.tiles.findIndex(t => t.id === id), j = i + d; if (i < 0 || j < 0 || j >= b.tiles.length) return false; [b.tiles[i], b.tiles[j]] = [b.tiles[j], b.tiles[i]]; return true; }
  function removeTile(b, id) { const n = b.tiles.length; b.tiles = b.tiles.filter(t => t.id !== id); return b.tiles.length < n; }

  /** what a pitch-deck gallery slide gets: the board name and up to six images (null when there are none) */
  const pitchGallery = b => { const imgs = images(b).slice(0, 6); return imgs.length ? { title: b.name, images: imgs } : null; };
  /** names for "a board for every location": linked locations, then scene headings */
  const locationNames = (P, scenes) => [...(P.locations || []).map(l => l.name), ...scenes.map(s => s.location)].filter(Boolean);

  return { KINDS, newBoard, newTile, ensure, boards, find, cover, images, addBoard, nextName, addBoards, updateBoard, removeBoard, addTile, findTile, updateTile, moveTile, removeTile, pitchGallery, locationNames };
})();
