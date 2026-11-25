'use strict';
/* ===================================================================
   Selects & approvals — MODEL
   The frames of a photo shoot (P.photo.selects), stored as small
   thumbnails: { id, name, thumb, w, h, rating 0–5, flag ('pick' |
   'reject' | ''), color, status, shotId, note }. Filtering, sorting,
   rating and flagging, approvals and the shot link. Pure functions:
   no DOM, no Store, no UI state. See js/mvvm.js.
   =================================================================== */

const SelectsModel = (() => {
  const STATUS = ['To review', 'Selected', 'Retouch', 'Client review', 'Approved', 'Final'];
  const COLORS = { red: '#e5484d', orange: '#e8830c', yellow: '#ca8a04', green: '#1e8e54', blue: '#2468d8', purple: '#7a45c9' };
  const FLAGS = ['pick', 'reject', ''];
  /** menus: [value, label] */
  const FLAG_FILTERS = [['', 'Any flag'], ['pick', 'Picked'], ['reject', 'Rejected'], ['none', 'Unflagged']];
  const SORTS = [['name', 'Sort: name'], ['rating', 'Sort: rating'], ['added', 'Sort: import order']];
  /** an import set this large slows saving, so the user is asked first */
  const BIG_SET = 1500;
  const blankFilter = () => ({ rating: 0, flag: '', status: '', shot: '', color: '', sort: 'name' });

  const item = (o = {}) => Object.assign({ id: newId(), name: '', thumb: '', w: 0, h: 0, rating: 0, flag: '', color: '', status: 'To review', shotId: '', note: '' }, o);
  const list = H => (H && H.selects) || [];
  const find = (H, id) => list(H).find(x => x.id === id) || null;
  function add(H, o) { const x = item(o); (H.selects = H.selects || []).push(x); return x; }

  /** a filter with anything unknown reset (so a stale filter never hides everything) */
  function cleanFilter(F = {}) {
    const B = blankFilter();
    return {
      rating: [0, 1, 2, 3, 4, 5].includes(+F.rating) ? +F.rating : 0,
      flag: FLAG_FILTERS.some(x => x[0] === F.flag) ? F.flag : B.flag,
      status: STATUS.includes(F.status) ? F.status : '',
      shot: typeof F.shot === 'string' ? F.shot : '',
      color: COLORS[F.color] ? F.color : '',
      sort: SORTS.some(x => x[0] === F.sort) ? F.sort : B.sort,
    };
  }
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
  /** the frames that pass the filter, sorted (by name with numbers in order, by rating, or as imported) */
  function filter(L, F) {
    F = cleanFilter(F);
    const r = L.filter(x => (x.rating || 0) >= F.rating && (!F.flag || (F.flag === 'none' ? !x.flag : x.flag === F.flag)) && (!F.status || x.status === F.status) && (!F.shot || x.shotId === F.shot) && (!F.color || x.color === F.color));
    return F.sort === 'added' ? r : [...r].sort(F.sort === 'rating' ? (a, b) => (b.rating - a.rating) || byName(a, b) : byName);
  }

  /** the summary line's numbers */
  function stats(L) {
    const rated = L.filter(x => x.rating);
    return {
      count: L.length, picks: L.filter(x => x.flag === 'pick').length, rejects: L.filter(x => x.flag === 'reject').length,
      avg: rated.length ? rated.reduce((s, x) => s + x.rating, 0) / rated.length : null,
      byStatus: STATUS.map(s => [s, L.filter(x => x.status === s).length]).filter(x => x[1]),
    };
  }
  function statsText(L) {
    const S = stats(L); if (!S.count) return '';
    return [`${S.count} images`, `${S.picks} picked`, `${S.rejects} rejected`, `${S.avg === null ? '–' : S.avg.toFixed(1)} avg rating`, ...S.byStatus.map(([s, n]) => n + ' ' + s.toLowerCase())].join(' · ');
  }

  /* ---------- editing ---------- */
  /** click a star: the same star again clears the rating */
  function rate(x, n) { n = +n; if (!(n >= 0 && n <= 5)) return false; x.rating = x.rating === n && n ? 0 : n; return true; }
  /** a key press sets the rating outright (0 clears) */
  function setRating(x, n) { n = +n; if (!(n >= 0 && n <= 5)) return false; x.rating = n; return true; }
  function setFlag(x, f) { if (!FLAGS.includes(f)) return false; x.flag = f; return true; }
  /** P / X keys: press again to clear */
  function toggleFlag(x, f) { return setFlag(x, x.flag === f ? '' : f); }
  function setColor(x, c) { if (c && !COLORS[c]) return false; x.color = c || ''; return true; }
  function setStatus(x, s) { if (!STATUS.includes(s)) return false; x.status = s; return true; }
  function setNote(x, v) { x.note = v || ''; return true; }
  /** link a frame to a shot; a shot still 'Planned' is now 'Shot' */
  function linkShot(H, x, shotId) {
    x.shotId = shotId || '';
    const s = (H.shots || []).find(z => z.id === x.shotId); if (s && s.status === 'Planned') s.status = 'Shot';
    return true;
  }
  /** clear links to shots that no longer exist */
  function unlinkMissing(H) { const ok = new Set((H.shots || []).map(s => s.id)); let n = 0; list(H).forEach(x => { if (x.shotId && !ok.has(x.shotId)) { x.shotId = ''; n++; } }); return n; }

  /** shots that can be linked: those whose scene (setup) still exists */
  const shotChoices = (H, scenes) => (H.shots || []).filter(s => scenes.some(x => x.id === s.sceneId));
  const picks = L => L.filter(x => x.flag === 'pick').map(x => x.name);
  /** CSV rows; labelOf(shot) names the linked shot */
  const csvRows = (H, labelOf) => [['File', 'Rating', 'Flag', 'Colour', 'Status', 'Shot', 'Note'], ...list(H).map(x => { const s = (H.shots || []).find(z => z.id === x.shotId); return [x.name, x.rating, x.flag, x.color, x.status, s ? labelOf(s) : '', x.note || '']; })];
  /** the contact sheet caption under a frame */
  const caption = x => '★'.repeat(x.rating) + '☆'.repeat(5 - x.rating) + (x.flag === 'pick' ? '  ⚑' : x.flag === 'reject' ? '  ✕' : '') + (x.status !== 'To review' ? ' · ' + x.status : '');

  return { STATUS, COLORS, FLAGS, FLAG_FILTERS, SORTS, BIG_SET, blankFilter, item, list, find, add, cleanFilter, filter, stats, statsText, rate, setRating, setFlag, toggleFlag, setColor, setStatus, setNote, linkShot, unlinkMissing, shotChoices, picks, csvRows, caption };
})();
