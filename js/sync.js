'use strict';
/* ===================================================================
   Folder sync — keeps every project mirrored as a .json file in a
   folder you choose. Point it at a OneDrive / Dropbox / Google Drive /
   network folder and your projects follow you between computers, or are
   shared with collaborators. Needs the File System Access API
   (Chrome, Edge and other Chromium browsers).
   =================================================================== */
const Sync = {
  dir: null, status: 'off', timer: null, pushT: null, busy: false, conflictOpen: false,
  supported: typeof window !== 'undefined' && !!window.showDirectoryPicker,
  last: {},
  fname: p => `${typeof p === 'string' ? p : p.id}.studiobindahh.json`,
  saveLast() { try { localStorage.setItem('sb-sync-last', JSON.stringify(Sync.last)); } catch (e) { } },

  async init() {
    try { Sync.last = JSON.parse(localStorage.getItem('sb-sync-last') || '{}'); } catch (e) { }
    if (!Store.persist) return;
    try {
      const hd = await DB.getMeta('syncdir');
      if (hd && Sync.supported) {
        Sync.dir = hd; const perm = await hd.queryPermission({ mode: 'readwrite' });
        Sync.status = perm === 'granted' ? 'on' : 'needs';
        if (Sync.status === 'on') { Sync.start(); Sync.syncAll(true).catch(console.error); }
      }
    } catch (e) { console.warn('sync init', e); }
    Sync.paint();
  },
  start() { clearInterval(Sync.timer); Sync.timer = setInterval(() => Sync.syncAll(), 20000); window.addEventListener('focus', Sync.onFocus); },
  onFocus() { if (Sync.status === 'on') Sync.syncAll(); },
  async choose() {
    try {
      const hd = await window.showDirectoryPicker({ id: 'studiobindahh', mode: 'readwrite' });
      Sync.dir = hd; await DB.setMeta('syncdir', hd); Sync.status = 'on'; Sync.start(); Sync.paint();
      await Sync.syncAll(true); toast('Sync folder connected');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not open that folder: ' + e.message, true); }
  },
  async reconnect() {
    try { const p = await Sync.dir.requestPermission({ mode: 'readwrite' }); if (p === 'granted') { Sync.status = 'on'; Sync.start(); Sync.paint(); await Sync.syncAll(true); toast('Sync reconnected'); } }
    catch (e) { toast('Permission was not granted.', true); }
  },
  async disconnect() { clearInterval(Sync.timer); Sync.dir = null; Sync.status = 'off'; try { await DB.setMeta('syncdir', null); } catch (e) { } Sync.paint(); },

  queuePush(p) { if (Sync.status !== 'on') return; clearTimeout(Sync.pushT); Sync.pushT = setTimeout(() => Sync.push(p).catch(e => { console.warn(e); Sync.status = 'needs'; Sync.paint(); }), 1500); },
  async push(p) {
    if (Sync.status !== 'on' || !Sync.dir) return;
    const fh = await Sync.dir.getFileHandle(Sync.fname(p), { create: true });
    /* the file is written whole and swapped in on close (createWritable), then checked: a cloud
       folder that is full or offline fails here, so the project stays queued instead of looking synced */
    const text = JSON.stringify(p), bytes = new TextEncoder().encode(text);
    const w = await fh.createWritable(); try { await w.write(bytes); await w.close(); } catch (e) { try { await w.abort(); } catch (x) { } throw e; }
    if ((await fh.getFile()).size !== bytes.length) throw new Error('The sync folder did not keep the whole file');
    Sync.last[p.id] = p.updated; Sync.saveLast(); Sync.paint(true);
  },
  async readRemote() {
    const out = [];
    for await (const [name, hd] of Sync.dir.entries()) {
      if (hd.kind !== 'file' || !name.endsWith('.studiobindahh.json')) continue;
      try { const f = await hd.getFile(); const j = JSON.parse(await f.text()); if (j && j.id && Array.isArray(j.blocks)) out.push(j); } catch (e) { /* ignore partial files */ }
    }
    return out;
  },
  async applyRemote(r) {
    const p = migrate(r); Store.projects[p.id] = p; if (Store.persist) await DB.put(p);
    Sync.last[p.id] = p.updated; Sync.saveLast();
    if (Store.P && Store.P.id === p.id) { Store.P = p; Router.refresh(); }
  },
  async syncAll(quiet) {
    if (Sync.busy || Sync.status !== 'on' || !Sync.dir) return;
    Sync.busy = true;
    try {
      if (Store.P) { clearTimeout(Store._t); if (Store.persist) await DB.put(Store.P); }
      const remote = await Sync.readRemote(), byId = Object.fromEntries(remote.map(r => [r.id, r])); let pulled = 0, pushed = 0;
      for (const r of remote) {
        const l = Store.projects[r.id];
        if (!l) { await Sync.applyRemote(r); pulled++; continue; }
        if (r.updated > l.updated) {
          if (l.updated <= (Sync.last[l.id] || 0)) { await Sync.applyRemote(r); pulled++; }
          else await Sync.conflict(l, r);
        } else if (r.updated < l.updated) { await Sync.push(l); pushed++; }
      }
      for (const l of Object.values(Store.projects)) if (!byId[l.id]) { await Sync.push(l); pushed++; }
      if (pulled && !quiet) toast(`Synced — ${pulled} project${pulled > 1 ? 's' : ''} updated from the sync folder`);
      if (pulled && quiet) toast(`Loaded ${pulled} project${pulled > 1 ? 's' : ''} from the sync folder`);
      Sync.paint(true);
    } catch (e) {
      console.warn('sync failed', e);
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { Sync.status = 'needs'; }
      Sync.paint();
    } finally { Sync.busy = false; }
  },
  conflict(l, r) {
    return new Promise(res => {
      if (Sync.conflictOpen) return res(); Sync.conflictOpen = true;
      const done = () => { Sync.conflictOpen = false; res(); };
      modal({ title: 'Edited in two places', onClose: done,
        body: h('p', { style: { margin: 0 } }, `“${l.title}” was changed here and also saved in the sync folder (from another device or person) since the last sync. Which version should win?`),
        buttons: [
          { label: 'Keep both', onClick: async () => { const c = JSON.parse(JSON.stringify(r)); c.id = uid(); c.title = r.title + ' (other version)'; await Store.add(c); await Sync.push(l); await Sync.push(c); toast('Saved the other version as a copy'); if (!Store.P) Router.refresh(); } },
          { label: 'Use the other version', onClick: () => Sync.applyRemote(r) },
          { label: 'Keep this device’s version', primary: true, onClick: () => { l.updated = Date.now(); return Sync.push(l); } }] });
    });
  },
  paint(ok) {
    const d = $('#syncDot'); if (d) d.className = 'syncdot ' + (Sync.status === 'on' ? 'on' : Sync.status === 'needs' ? 'warn' : '');
    const b = $('#syncBtn'); if (b) b.title = Sync.status === 'on' ? 'Folder sync is on' : Sync.status === 'needs' ? 'Sync needs permission — click to reconnect' : 'Set up folder sync';
  },
  panel() {
    const body = h('div');
    const draw = () => {
      body.innerHTML = '';
      body.append(h('p', { style: { marginTop: 0 } }, 'Folder sync saves a copy of every project into a folder you choose and keeps it up to date. Pick a folder inside OneDrive, Dropbox, Google Drive or a shared network drive and your projects follow you across computers — or are shared with the people who can access that folder. When two people edit the same project, StudioBindahh asks which version to keep.'));
      if (!Sync.supported) { body.append(h('div', { class: 'csalert' }, 'This browser can’t write to folders. Use Chrome or Edge for folder sync. You can still use Backup to move projects by hand.')); return; }
      if (Sync.status === 'off') body.append(h('button', { class: 'btn primary', onclick: async () => { await Sync.choose(); draw(); } }, icon('cloud', 15), 'Choose sync folder…'));
      else {
        body.append(h('div', { class: 'row', style: { marginBottom: '12px' } }, h('i', { class: 'syncdot ' + (Sync.status === 'on' ? 'on' : 'warn') }), h('b', {}, Sync.status === 'on' ? 'Connected' : 'Needs permission'), h('span', { class: 'muted' }, Sync.dir && Sync.dir.name ? `· ${Sync.dir.name}` : '')));
        body.append(h('div', { class: 'row wrap' },
          Sync.status === 'needs' ? h('button', { class: 'btn primary', onclick: async () => { await Sync.reconnect(); draw(); } }, 'Reconnect') : h('button', { class: 'btn primary', onclick: async () => { await Sync.syncAll(); toast('Synced'); } }, icon('rotate', 15), 'Sync now'),
          h('button', { class: 'btn', onclick: async () => { await Sync.choose(); draw(); } }, 'Change folder…'),
          h('button', { class: 'btn danger', onclick: async () => { await Sync.disconnect(); draw(); } }, 'Disconnect')));
        body.append(h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'Your browser asks permission again each time you reopen the app — use Reconnect when the dot turns amber.'));
      }
    };
    draw(); modal({ title: 'Folder sync', body, buttons: [{ label: 'Close', primary: true }] });
  },
};

window.Sync = Sync;   // classic-script consts are not window properties; other modules test window.Sync
