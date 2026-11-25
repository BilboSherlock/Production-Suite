'use strict';
/* ===================================================================
   Script supervisor: take log — MODEL. Takes are logged shot by shot
   (P.takes: { id, shotId, n, status, roll, sound, tc, len, notes });
   circling a take marks its shot as shot. Report and CSV rows.
   Pure: no DOM, no Store. See js/mvvm.js.
   =================================================================== */

const TakesModel = (() => {
  const STATUS = [['', '—'], ['circle', 'Circle (print)'], ['good', 'Good'], ['ng', 'NG'], ['alt', 'Alt / wild'], ['hold', 'Hold']];
  /** the text fields a take has (typed into the log) */
  const TEXT = ['roll', 'sound', 'tc', 'len', 'notes'];
  const statusLabel = k => (STATUS.find(s => s[0] === k) || [0, k])[1];
  const newTake = (shotId, n, o = {}) => Object.assign({ id: newId(), shotId, n, status: '', roll: '', sound: '', tc: '', len: '', notes: '' }, o);
  const all = P => (P.takes = P.takes || []);
  const find = (P, id) => all(P).find(t => t.id === id) || null;
  /** a shot's takes in take order */
  const ofShot = (P, id) => (P.takes || []).filter(t => t.shotId === id).sort((a, b) => a.n - b.n);
  const circled = ts => ts.filter(t => t.status === 'circle');
  const label = (P, s, scenes) => ShotsModel.label(P, s, scenes);

  /** the roll (key 'roll' or 'sound') of the last take logged anywhere that has one */
  function lastRoll(P, key) { const t = [...all(P)].reverse().find(x => x[key]); return t ? t[key] : ''; }

  /** the next take of a shot: numbered on from its last take, on the same rolls (else the last rolls used) */
  function add(P, shotId) {
    const ts = ofShot(P, shotId), last = ts[ts.length - 1];
    const t = newTake(shotId, (last ? last.n : 0) + 1, { roll: last ? last.roll : lastRoll(P, 'roll'), sound: last ? last.sound : lastRoll(P, 'sound') });
    all(P).push(t); return t;
  }
  /** change a take's number or a text field → whether it was a known field */
  function set(P, id, k, v) {
    const t = find(P, id); if (!t) return false;
    if (k === 'n') { t.n = +v || t.n; return true; }
    if (!TEXT.includes(k)) return false;
    t[k] = String(v ?? ''); return true;
  }
  /** change a take's status → the shot newly marked as shot (circling a take), else null */
  function setStatus(P, id, v) {
    const t = find(P, id); if (!t) return null;
    t.status = STATUS.some(s => s[0] === v) ? v : '';
    const shot = (P.shots || []).find(s => s.id === t.shotId);
    if (t.status === 'circle' && shot && !shot.done) { shot.done = true; return shot; }
    return null;
  }
  function remove(P, id) { const n = all(P).length; P.takes = P.takes.filter(t => t.id !== id); return P.takes.length < n; }

  /* ---------- reading ---------- */
  function totals(P) { const ts = P.takes || []; return { takes: ts.length, circled: circled(ts).length }; }
  const totalsText = P => { const t = totals(P); return `${t.takes} take${t.takes === 1 ? '' : 's'} logged · ${t.circled} circled`; };
  /** a scene's shots, each with its takes → [{ shot, takes, circled }] */
  const shotsOf = (P, sceneId) => (P.shots || []).filter(x => x.sceneId === sceneId).map(shot => { const takes = ofShot(P, shot.id); return { shot, takes, circled: takes.some(t => t.status === 'circle') }; });
  /** the scene list line: '2/3 shots circled · 7 takes' (or 'No shots planned') */
  function sceneText(P, sceneId) {
    const sh = shotsOf(P, sceneId); if (!sh.length) return 'No shots planned';
    return `${sh.filter(x => x.circled).length}/${sh.length} shots circled · ${sum(sh, x => x.takes.length)} takes`;
  }
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);

  /* ---------- out ---------- */
  function where(P, t, scenes) { const s = (P.shots || []).find(x => x.id === t.shotId), scn = s ? scenes.find(z => z.id === s.sceneId) : null; return { sc: scn ? scn.num : '', shot: s ? label(P, s, scenes) : 'wild' }; }
  function csvRows(P, scenes) {
    return [['Scene', 'Shot', 'Take', 'Status', 'Camera roll', 'Sound roll', 'TC', 'Length', 'Notes'],
      ...all(P).map(t => { const w = where(P, t, scenes); return [w.sc, w.shot, t.n, statusLabel(t.status), t.roll, t.sound, t.tc, t.len, t.notes]; })];
  }
  /**
   * A printed report → { headers, rows } (rows may hold { grp } headings), or null when nothing is logged.
   * kind: 'camera' (by camera roll), 'sound' (by sound roll) or 'continuity' (scene by scene).
   */
  function report(P, scenes, kind) {
    const ts = all(P); if (!ts.length) return null;
    const rows = [];
    if (kind === 'continuity') {
      scenes.forEach(s => {
        const sts = ts.filter(t => { const x = P.shots.find(z => z.id === t.shotId); return x && x.sceneId === s.id; }); if (!sts.length) return;
        rows.push({ grp: `Scene ${s.num} — ${s.label}` });
        P.shots.filter(x => x.sceneId === s.id).forEach(x => ofShot(P, x.id).forEach(t => rows.push([label(P, x, scenes), t.n, statusLabel(t.status), x.size, x.lens, x.desc, t.notes])));
      });
      return { headers: ['Shot', 'Take', 'Status', 'Size', 'Lens', 'Description', 'Notes'], rows };
    }
    const cam = kind === 'camera', key = cam ? 'roll' : 'sound', groups = new Map();
    ts.forEach(t => { const k = t[key] || '(no roll)'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, g]) => {
      rows.push({ grp: `${cam ? 'Camera roll / card' : 'Sound roll'} ${k} — ${g.length} take${g.length > 1 ? 's' : ''}, ${circled(g).length} circled` });
      g.forEach(t => { const w = where(P, t, scenes); rows.push([w.sc, w.shot, t.n, statusLabel(t.status), t.tc, t.len, cam ? t.sound : t.roll, t.notes]); });
    });
    return { headers: ['Sc', 'Shot', 'Take', 'Status', 'TC', 'Length', cam ? 'Sound roll' : 'Camera roll', 'Notes'], rows };
  }

  return { STATUS, TEXT, statusLabel, newTake, all, find, ofShot, lastRoll, add, set, setStatus, remove, totals, totalsText, shotsOf, sceneText, csvRows, report };
})();
