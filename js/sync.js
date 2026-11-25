'use strict';
/* ===================================================================
   Sync — keeps every project mirrored in one place you choose, so your
   projects follow you between devices or are shared with collaborators:
     · Google Drive  (js/gdrive.js) — sign in once; works on any device
       and browser that opens the app from its https address (or localhost)
     · a folder      — OneDrive / Dropbox / Drive-for-desktop / network
       folder; needs the File System Access API (Chrome, Edge)
   Which copy wins is decided by SyncModel.plan (js/models/sync.model.js);
   a project changed in both places since the last sync asks you.
   A place is a provider:
     { kind, label, supported(), why(), restore() → 'on' | 'needs' | 'off', connect(), reconnect(),
       forget(), where(), list() → [{ id, updated, deleted, read() → project | null }], write(p), remove(id)? }
   =================================================================== */

/* ---------- a folder on this computer ---------- */
const FolderSync = {
  kind: 'folder', label: 'Folder', dir: null, ext: '.studiobindahh.json',
  supported: () => typeof window !== 'undefined' && !!window.showDirectoryPicker,
  why: () => 'This browser can’t write to folders. Use Chrome or Edge for folder sync, or use Google Drive.',
  async restore() {
    const hd = await DB.getMeta('syncdir'); if (!hd || !FolderSync.supported()) return 'off';
    FolderSync.dir = hd; return (await hd.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'on' : 'needs';
  },
  async connect() { const hd = await window.showDirectoryPicker({ id: 'studiobindahh', mode: 'readwrite' }); FolderSync.dir = hd; await DB.setMeta('syncdir', hd); },
  async reconnect() { return (await FolderSync.dir.requestPermission({ mode: 'readwrite' })) === 'granted'; },
  async forget() { FolderSync.dir = null; try { await DB.setMeta('syncdir', null); } catch (e) { } },
  where: () => FolderSync.dir && FolderSync.dir.name || '',
  fname: p => `${typeof p === 'string' ? p : p.id}.studiobindahh.json`,
  async list() {
    const out = [];
    for await (const [name, hd] of FolderSync.dir.entries()) {
      if (hd.kind !== 'file' || !name.endsWith(FolderSync.ext)) continue;
      try { const j = JSON.parse(await (await hd.getFile()).text()); if (j && j.id && Array.isArray(j.blocks)) out.push({ id: j.id, updated: j.updated, read: async () => j }); }
      catch (e) { /* a file still being written by another device; it is read next time */ }
    }
    return out;
  },
  /* written whole and swapped in on close (createWritable), then checked: a folder that is full or
     offline fails here, so the project stays queued instead of looking synced */
  async write(p) {
    const fh = await FolderSync.dir.getFileHandle(FolderSync.fname(p), { create: true });
    const bytes = new TextEncoder().encode(JSON.stringify(p));
    const w = await fh.createWritable(); try { await w.write(bytes); await w.close(); } catch (e) { try { await w.abort(); } catch (x) { } throw e; }
    if ((await fh.getFile()).size !== bytes.length) throw new Error('The sync folder did not keep the whole file');
  },
};

/* ---------- the sync engine ---------- */
const Sync = {
  providers: { drive: typeof DriveSync !== 'undefined' ? DriveSync : null, folder: FolderSync },
  kind: null, status: 'off', timer: null, pushT: null, busy: false, again: false, conflictOpen: false, last: {}, warned: false,
  get p() { return Sync.kind ? Sync.providers[Sync.kind] : null; },
  get supported() { return Object.values(Sync.providers).some(p => p && p.supported()); },
  get label() { return Sync.kind === 'drive' ? 'Google Drive sync' : 'Folder sync'; },

  lastKey: () => 'sb-sync-last-' + Sync.kind,
  loadLast() { try { Sync.last = JSON.parse(localStorage.getItem(Sync.lastKey()) || (Sync.kind === 'folder' && localStorage.getItem('sb-sync-last')) || '{}'); } catch (e) { Sync.last = {}; } },
  saveLast() { try { localStorage.setItem(Sync.lastKey(), JSON.stringify(Sync.last)); } catch (e) { } },

  async init() {
    if (!Store.persist) return Sync.paint();
    try {
      Sync.kind = localStorage.getItem('sb-sync-kind') || null;
      if (!Sync.kind && await DB.getMeta('syncdir')) Sync.kind = 'folder';          // set up before Google Drive existed
      if (Sync.kind && !Sync.p) Sync.kind = null;
      if (Sync.kind) {
        Sync.loadLast(); Sync.status = await Sync.p.restore();
        if (Sync.status === 'on') { Sync.start(); Sync.syncAll(true).catch(console.error); }
        else if (Sync.status === 'off') Sync.kind = null;
      }
    } catch (e) { console.warn('sync init', e); Sync.status = Sync.kind ? 'needs' : 'off'; }
    Sync.paint();
  },
  start() {
    clearInterval(Sync.timer); Sync.timer = setInterval(() => Sync.syncAll(), Sync.kind === 'drive' ? 30000 : 20000);
    window.removeEventListener('focus', Sync.onFocus); window.addEventListener('focus', Sync.onFocus);
    document.removeEventListener('visibilitychange', Sync.onVisible); document.addEventListener('visibilitychange', Sync.onVisible);
  },
  onFocus() { if (Sync.status === 'on') Sync.syncAll(); },
  onVisible() { if (document.visibilityState === 'visible') Sync.onFocus(); else if (Sync.status === 'on' && Store.P && Sync.last[Store.P.id] !== Store.P.updated) { clearTimeout(Sync.pushT); Sync.push(Store.P).catch(Sync.failed); } },   // leaving the app sends the latest edit now

  /** connect a place (switching from another one) and sync everything to it */
  async use(kind) {
    const prov = Sync.providers[kind]; if (!prov) return false;
    try {
      await prov.connect();
      if (Sync.kind && Sync.kind !== kind) { try { await Sync.p.forget(); } catch (e) { } }
      Sync.kind = kind; localStorage.setItem('sb-sync-kind', kind); Sync.loadLast();
      Sync.status = 'on'; Sync.warned = false; Sync.start(); Sync.paint();
      await Sync.syncAll(true); toast(kind === 'drive' ? 'Google Drive connected — your projects now sync' : 'Sync folder connected');
      return true;
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.quiet)) return false;
      toast((kind === 'drive' ? 'Could not connect Google Drive: ' : 'Could not open that folder: ') + (e.message || e), true); return false;
    }
  },
  async reconnect() {
    try { if (await Sync.p.reconnect()) { Sync.status = 'on'; Sync.warned = false; Sync.start(); Sync.paint(); await Sync.syncAll(true); toast('Sync reconnected'); return true; } }
    catch (e) { if (!e || !e.quiet) toast('Could not reconnect: ' + (e && e.message || 'permission was not granted'), true); }
    return false;
  },
  async disconnect() {
    clearInterval(Sync.timer); clearTimeout(Sync.pushT);
    if (Sync.p) { try { await Sync.p.forget(); } catch (e) { } }
    Sync.kind = null; Sync.status = 'off'; localStorage.removeItem('sb-sync-kind'); Sync.paint();
  },

  /** something went wrong talking to the sync place: lost sign-in or permission pauses sync until you reconnect */
  failed(e) {
    console.warn('sync', e);
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      Sync.status = 'needs';
      if (!Sync.warned) { Sync.warned = true; toast(Sync.kind === 'drive' ? 'Google Drive sync is paused — tap the cloud button to sign in again.' : 'Folder sync needs permission — tap the cloud button to reconnect.', true); }
    }
    Sync.paint();
  },

  /** a project was deleted here: tell the sync place, so other devices remove it too */
  removed(id) {
    delete Sync.last[id]; Sync.saveLast();
    if (Sync.status === 'on' && Sync.p && Sync.p.remove) Sync.p.remove(id).catch(Sync.failed);
  },
  queuePush(p) {
    if (Sync.status !== 'on') return; clearTimeout(Sync.pushT);
    Sync.pushT = setTimeout(() => Sync.push(p).catch(Sync.failed), SyncModel.pushDelay(Sync.kind, Sync.kind === 'drive' ? JSON.stringify(p).length : 0));
  },
  async push(p) {
    if (Sync.status !== 'on' || !Sync.p) return;
    const at = p.updated; await Sync.p.write(p);
    Sync.last[p.id] = at; Sync.saveLast(); Sync.paint(true);
  },
  async applyRemote(r) {
    const p = migrate(r); Store.projects[p.id] = p; if (Store.persist) await DB.put(p);
    Sync.last[p.id] = p.updated; Sync.saveLast();
    if (Store.P && Store.P.id === p.id) { Store.P = p; Router.refresh(); }
  },
  async syncAll(quiet) {
    if (Sync.status !== 'on' || !Sync.p) return;
    if (Sync.busy) { Sync.again = true; return; }
    Sync.busy = true;
    try {
      if (Store.P && Store.dirty) await Store.flush();
      const remote = await Sync.p.list();
      for (const r of remote) if (r.updated == null) { const j = await r.read(); r.updated = j ? j.updated : 0; r.read = async () => j; }
      const byId = Object.fromEntries(remote.map(r => [r.id, r])), plan = SyncModel.plan(Store.projects, remote, Sync.last);
      let pulled = 0;
      for (const id of plan.pull) { const r = await byId[id].read(); if (r) { await Sync.applyRemote(r); pulled++; } }
      for (const id of plan.conflict) { const r = await byId[id].read(); if (r && Store.projects[id]) await Sync.conflict(Store.projects[id], r); }
      for (const id of plan.push) if (Store.projects[id]) await Sync.push(Store.projects[id]);
      for (const id of plan.remove) {
        const p = Store.projects[id]; if (!p) continue;
        delete Store.projects[id]; if (Store.persist) await DB.del(id); delete Sync.last[id]; Sync.saveLast();
        toast(`“${p.title}” was deleted on another device`);
        if (Store.P && Store.P.id === id) { Store.P = null; location.hash = '#/'; } else if (!Store.P) Router.refresh();
      }
      const where = Sync.kind === 'drive' ? 'Google Drive' : 'the sync folder';
      if (pulled) toast(quiet ? `Loaded ${pulled} project${pulled > 1 ? 's' : ''} from ${where}` : `Synced — ${pulled} project${pulled > 1 ? 's' : ''} updated from ${where}`);
      if (pulled && !Store.P && location.hash.replace(/^#\/?/, '') === '') Router.refresh();
      Sync.paint(true);
    } catch (e) { Sync.failed(e); }
    finally { Sync.busy = false; if (Sync.again) { Sync.again = false; setTimeout(() => Sync.syncAll(true), 50); } }
  },
  conflict(l, r) {
    return new Promise(res => {
      if (Sync.conflictOpen) return res(); Sync.conflictOpen = true;
      const done = () => { Sync.conflictOpen = false; res(); };
      const where = Sync.kind === 'drive' ? 'in Google Drive' : 'in the sync folder';
      modal({ title: 'Edited in two places', onClose: done,
        body: h('p', { style: { margin: 0 } }, `“${l.title}” was changed here and also saved ${where} (from another device or person) since the last sync. Which version should win?`),
        buttons: [
          { label: 'Keep both', onClick: async () => { const c = JSON.parse(JSON.stringify(r)); c.id = uid(); c.title = r.title + ' (other version)'; await Store.add(c); l.updated = Date.now(); await Sync.push(l); await Sync.push(c); toast('Saved the other version as a copy'); if (!Store.P) Router.refresh(); } },
          { label: 'Use the other version', onClick: () => Sync.applyRemote(r) },
          { label: 'Keep this device’s version', primary: true, onClick: () => { l.updated = Date.now(); return Sync.push(l); } }] });
    });
  },

  /* ---------- the cloud button and its panel ---------- */
  paint() {
    const d = $('#syncDot'); if (d) d.className = 'syncdot ' + (Sync.status === 'on' ? 'on' : Sync.status === 'needs' ? 'warn' : '');
    const b = $('#syncBtn');
    if (b) b.title = Sync.status === 'on' ? `${Sync.label} is on` : Sync.status === 'needs' ? `${Sync.label} is paused — click to reconnect` : 'Set up sync (Google Drive or a folder)';
  },
  panel() {
    const body = h('div');
    const draw = () => {
      body.innerHTML = '';
      body.append(h('p', { style: { marginTop: 0 } }, 'Sync keeps a copy of every project in one place and keeps it up to date, so your projects follow you between devices — or are shared with the people who can open that place. When the same project was changed in two places, StudioBindahh asks which version to keep.'));
      if (Sync.status !== 'off' && Sync.p) {
        const w = Sync.p.where();
        body.append(h('div', { class: 'row', style: { marginBottom: '12px' } }, h('i', { class: 'syncdot ' + (Sync.status === 'on' ? 'on' : 'warn') }),
          h('b', {}, `${Sync.kind === 'drive' ? 'Google Drive' : 'Folder'} — ${Sync.status === 'on' ? 'connected' : 'paused'}`), w ? h('span', { class: 'muted' }, '· ' + w) : null));
        body.append(h('div', { class: 'row wrap' },
          Sync.status === 'needs'
            ? h('button', { class: 'btn primary', onclick: async () => { await Sync.reconnect(); draw(); } }, Sync.kind === 'drive' ? 'Sign in again' : 'Reconnect')
            : h('button', { class: 'btn primary', onclick: async () => { await Sync.syncAll(); toast('Synced'); } }, icon('rotate', 15), 'Sync now'),
          Sync.kind === 'folder' ? h('button', { class: 'btn', onclick: async () => { await Sync.use('folder'); draw(); } }, 'Change folder…') : null,
          h('button', { class: 'btn danger', onclick: async () => { await Sync.disconnect(); draw(); } }, 'Disconnect')));
        body.append(h('p', { class: 'small muted', style: { marginBottom: 0 } }, Sync.kind === 'drive'
          ? 'Projects are saved in a “StudioBindahh” folder in your Google Drive. Google asks you to sign in again after a while; the cloud button turns amber when it does.'
          : 'Your browser asks permission again each time you reopen the app — use Reconnect when the dot turns amber.'));
        if (Sync.kind === 'drive' || !Sync.providers.drive) return;
        body.append(h('hr'));
      }
      const D = Sync.providers.drive;
      if (D && Sync.kind !== 'drive') body.append(D.setup(async () => { if (await Sync.use('drive')) draw(); }, draw));
      if (Sync.kind !== 'folder') {
        body.append(h('h4', { style: { margin: '16px 0 6px' } }, 'Or a folder on this computer'));
        if (!FolderSync.supported()) body.append(h('p', { class: 'small muted', style: { margin: 0 } }, FolderSync.why()));
        else body.append(h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Pick a folder inside OneDrive, Dropbox, Google Drive for desktop or a shared network drive.'),
          h('button', { class: 'btn', onclick: async () => { if (await Sync.use('folder')) draw(); } }, icon('cloud', 15), 'Choose sync folder…'));
      }
    };
    draw(); modal({ title: 'Sync', body, buttons: [{ label: 'Close', primary: true }] });
  },
};

window.Sync = Sync;   // classic-script consts are not window properties; other modules test window.Sync
