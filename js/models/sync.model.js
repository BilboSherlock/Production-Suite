'use strict';
/* ===================================================================
   Sync — MODEL. Decides, for every project, whether this device should
   take the stored copy (pull), send its own (push), or ask (conflict).
   Shared by every place projects sync to (a folder, Google Drive). No DOM.

   local   { id: project }                      — this device's projects (each has .updated)
   remote  [{ id, updated, deleted }]           — what the sync place holds (deleted: removed on another device)
   last    { id: updated }                      — each project's .updated when it last synced here
   =================================================================== */
const SyncModel = (() => {
  /**
   * → { pull: [id], push: [id], conflict: [id], remove: [id] }
   * Each side counts as changed when its .updated differs from the one recorded at the last sync,
   * so devices whose clocks disagree still sync correctly. Never synced here: the newer one is sent
   * when this device's is newer, and you are asked when the stored one is. A project deleted on
   * another device is removed here too — unless it was changed here since, then it is sent back.
   */
  function plan(local, remote, last = {}) {
    const out = { pull: [], push: [], conflict: [], remove: [] }, seen = new Set();
    for (const r of remote) {
      if (!r || !r.id || seen.has(r.id)) continue; seen.add(r.id);
      const l = local[r.id];
      if (r.deleted) { if (l) (last[r.id] !== undefined && +l.updated === +last[r.id] ? out.remove : out.push).push(r.id); continue; }
      if (!l) { out.pull.push(r.id); continue; }
      const ru = +r.updated || 0, lu = +l.updated || 0, at = last[r.id];
      if (ru === lu) continue;
      if (at === undefined) { (ru > lu ? out.conflict : out.push).push(r.id); continue; }
      const mine = lu !== +at, theirs = ru !== +at;
      if (mine && theirs) out.conflict.push(r.id); else if (theirs) out.pull.push(r.id); else out.push.push(r.id);
    }
    for (const id of Object.keys(local)) if (!seen.has(id)) out.push.push(id);
    return out;
  }
  /** a project's file name in a sync place: readable, and unique by its id */
  function fileName(p, ext) {
    const t = String(p.title || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
    return `${t} (${p.id})${ext}`;
  }
  /** how long to wait after an edit before sending it (bigger projects wait longer on a slow link) */
  const pushDelay = (kind, bytes = 0) => kind === 'drive' ? Math.min(30000, 6000 + Math.round(bytes / 1e5) * 1000) : 1500;
  return { plan, fileName, pushDelay };
})();
