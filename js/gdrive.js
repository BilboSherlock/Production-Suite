'use strict';
/* ===================================================================
   Google Drive sync — a sync place for js/sync.js. Sign in once with
   Google; every project is kept as a checked .studiobindahh file
   (js/models/savefile.model.js) in a “StudioBindahh” folder in your
   Drive, so any device signed in to the same Google account gets them.

   · Access is limited to files this app made (the drive.file scope):
     StudioBindahh cannot see anything else in your Drive.
   · Each file carries the project's id and last-change time
     (appProperties), so a sync only downloads projects that changed.
   · A damaged or half-uploaded file is never applied; uploads are
     checked by size.
   · Needs a Google OAuth client ID (README → Google Drive sync) and the
     app opened from https:// or localhost (Google's rule for sign-in).
   =================================================================== */

/* the OAuth client ID for this copy of StudioBindahh (public, not a secret). It can also be set per device in the Sync panel. */
const GOOGLE_CLIENT_ID = '';

const DriveSync = (() => {
  const API = 'https://www.googleapis.com/drive/v3/', UP = 'https://www.googleapis.com/upload/drive/v3/files';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file', FOLDER = 'StudioBindahh';
  const K = { on: 'sb-gdrive-on', client: 'sb-gdrive-client', folder: 'sb-gdrive-folder', user: 'sb-gdrive-user', token: 'sb-gdrive-token' };
  let token = null, exp = 0, fid = null, ids = {};

  const clientId = () => (localStorage.getItem(K.client) || GOOGLE_CLIENT_ID || '').trim();
  const local = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const supported = () => typeof fetch === 'function' && (location.protocol === 'https:' || (location.protocol === 'http:' && local()));
  const why = () => `Google only allows sign-in from a secure (https://) address or from localhost on this computer. This copy is open at ${location.origin}. See README → Google Drive sync for ways to open it securely on a tablet.`;
  const lost = () => Object.assign(new Error('Google sign-in has expired'), { name: 'NotAllowedError' });

  function setToken(t, secs) {
    token = t; exp = Date.now() + (+secs || 3600) * 1000;
    try { sessionStorage.setItem(K.token, JSON.stringify({ t, exp })); } catch (e) { }
  }
  function loadToken() {
    try { const s = JSON.parse(sessionStorage.getItem(K.token) || 'null'); if (s && s.exp > Date.now() + 60000) { token = s.t; exp = s.exp; } } catch (e) { }
    return !!token;
  }
  function dropToken() { token = null; exp = 0; try { sessionStorage.removeItem(K.token); } catch (e) { } }

  /* ---------- Google sign-in (Google Identity Services, loaded only when needed) ---------- */
  let gis = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return gis || (gis = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(); s.onerror = () => { gis = null; no(new Error('could not reach Google — check the internet connection')); };
      document.head.append(s);
    }));
  }
  async function auth(prompt) {
    const id = clientId(); if (!id) throw new Error('add your Google client ID first');
    await loadGis();
    return new Promise((ok, no) => {
      const hint = localStorage.getItem(K.user) || undefined;
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: id, scope: SCOPE, prompt, login_hint: hint,
        callback: r => {
          if (r.error) return no(new Error(r.error_description || r.error));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return no(new Error('Drive access was not allowed. Tick the Google Drive box when Google asks'));
          setToken(r.access_token, r.expires_in); ok();
        },
        error_callback: e => {
          const t = e && e.type, err = new Error(t === 'popup_failed_to_open' ? 'the browser blocked Google’s sign-in window. Allow pop-ups for this site' : t === 'popup_closed' ? 'the Google window was closed' : (e && e.message) || 'sign-in failed');
          if (t === 'popup_closed') err.quiet = true; no(err);
        },
      });
      tc.requestAccessToken({ prompt });
    });
  }

  /* ---------- Drive REST ---------- */
  async function api(url, opt = {}, raw) {
    for (let tries = 0; ; tries++) {
      if (!token || Date.now() > exp - 30000) { dropToken(); throw lost(); }
      const r = await fetch(/^https:/.test(url) ? url : API + url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + token }, opt.headers || {}) }));
      if (r.status === 401) { dropToken(); throw lost(); }
      if ((r.status === 429 || r.status >= 500) && tries < 3) { await new Promise(q => setTimeout(q, 1000 * 2 ** tries)); continue; }
      if (!r.ok) {
        let m = ''; try { const j = await r.json(); m = j.error && j.error.message; } catch (e) { }
        if (r.status === 403 && /insufficient|scope|permission/i.test(m || '')) { dropToken(); throw lost(); }
        throw Object.assign(new Error(m || `Google Drive answered ${r.status}`), { status: r.status });
      }
      return raw ? r : r.status === 204 ? null : r.json();
    }
  }
  const q = s => encodeURIComponent(s);

  async function folder() {
    if (fid) return fid;
    let id = localStorage.getItem(K.folder);
    if (id) { try { const f = await api(`files/${id}?fields=id,trashed`); if (!f.trashed) return (fid = id); } catch (e) { if (e.name === 'NotAllowedError') throw e; } }
    const l = await api(`files?q=${q(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&spaces=drive`);
    id = l.files && l.files[0] ? l.files[0].id : (await api('files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).id;
    localStorage.setItem(K.folder, id); return (fid = id);
  }

  async function list() {
    const f = await folder(), out = [], best = {}; let pt = '';
    do {
      const r = await api(`files?q=${q(`'${f}' in parents and trashed=false`)}&fields=nextPageToken,files(id,size,appProperties)&pageSize=1000&spaces=drive${pt ? '&pageToken=' + q(pt) : ''}`);
      for (const x of r.files || []) {
        const a = x.appProperties || {}; if (!a.sbid) continue;
        const u = +a.updated || 0; if (best[a.sbid] && best[a.sbid].updated >= u) continue;     // two devices made a file at once: the newer wins
        best[a.sbid] = { id: a.sbid, updated: u || null, file: x.id, deleted: a.deleted === '1' };
      }
      pt = r.nextPageToken;
    } while (pt);
    for (const e of Object.values(best)) { ids[e.id] = e.file; out.push({ id: e.id, updated: e.updated || 0, deleted: e.deleted, read: () => e.deleted ? null : read(e.file, e.id) }); }
    return out;
  }
  /* a project file → the project, or null when it is damaged, cut off or not that project (never half-applied) */
  async function read(file, sbid) {
    const r = await api(`files/${file}?alt=media`, {}, true), b = new Uint8Array(await r.arrayBuffer());
    try { const d = await SaveFile.decode(b); return d.complete && d.data && d.data.id === sbid && Array.isArray(d.data.blocks) ? d.data : null; }
    catch (e) { console.warn('Google Drive: unreadable file for', sbid, e); return null; }
  }
  async function upload(id, meta, bytes) {
    const url = UP + (id ? '/' + id : ''), method = id ? 'PATCH' : 'POST', f = '&fields=id,size';
    if (bytes.length < 4e6) {
      const B = 'sbx' + Math.random().toString(36).slice(2);
      const body = new Blob([`--${B}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${B}\r\nContent-Type: application/octet-stream\r\n\r\n`, bytes, `\r\n--${B}--`]);
      return api(url + '?uploadType=multipart' + f, { method, headers: { 'Content-Type': 'multipart/related; boundary=' + B }, body });
    }
    const s = await api(url + '?uploadType=resumable' + f, { method, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(bytes.length) }, body: JSON.stringify(meta) }, true);
    const loc = s.headers.get('Location'); if (!loc) throw new Error('Google Drive did not start the upload');
    return api(loc, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
  }
  /* a deleted project leaves an empty marker file, so other devices remove it too instead of sending it back */
  async function remove(sbid) {
    const f = await folder(); let id = ids[sbid];
    if (!id) { const l = await api(`files?q=${q(`'${f}' in parents and trashed=false and appProperties has { key='sbid' and value='${sbid}' }`)}&fields=files(id)&spaces=drive`); id = l.files && l.files[0] && l.files[0].id; }
    if (!id) return;
    await upload(id, { name: `(deleted) ${sbid}${SaveFile.EXT}`, appProperties: { sbid, deleted: '1', updated: String(Date.now()) } }, new Uint8Array(0));
  }
  async function write(p) {
    const f = await folder(), bytes = await SaveFile.write(p, { kind: 'project', title: p.title, exported: Date.now() });
    const meta = { name: SyncModel.fileName(p, SaveFile.EXT), mimeType: 'application/octet-stream', appProperties: { sbid: p.id, updated: String(p.updated || 0), deleted: '0' } };
    let id = ids[p.id];
    if (!id) { const l = await api(`files?q=${q(`'${f}' in parents and trashed=false and appProperties has { key='sbid' and value='${p.id}' }`)}&fields=files(id)&spaces=drive`); id = l.files && l.files[0] && l.files[0].id; }
    let res;
    try { res = await upload(id, id ? meta : Object.assign({ parents: [f] }, meta), bytes); }
    catch (e) { if (id && e.status === 404) { delete ids[p.id]; res = await upload(null, Object.assign({ parents: [f] }, meta), bytes); } else throw e; }
    if (+res.size !== bytes.length) throw new Error('Google Drive did not keep the whole file');
    ids[p.id] = res.id;
  }

  /* ---------- the provider (see js/sync.js) ---------- */
  return {
    kind: 'drive', label: 'Google Drive', supported, why, clientId,
    async restore() { if (!localStorage.getItem(K.on) || !supported()) return 'off'; return loadToken() ? 'on' : 'needs'; },
    async connect() {
      if (!supported()) throw new Error(why());
      await auth(localStorage.getItem(K.on) ? '' : 'consent'); fid = null; ids = {};
      await folder();
      try { const a = await api('about?fields=user(emailAddress)'); if (a.user && a.user.emailAddress) localStorage.setItem(K.user, a.user.emailAddress); } catch (e) { }
      localStorage.setItem(K.on, '1');
    },
    async reconnect() { await auth(''); return true; },
    async forget() { dropToken(); fid = null; ids = {}; [K.on, K.folder, K.user].forEach(k => localStorage.removeItem(k)); },
    where: () => localStorage.getItem(K.user) || '',
    list, write, remove,

    /** the Sync panel's Google Drive part: client ID (when needed) and Connect */
    setup(onConnect, redraw) {
      const box = h('div');
      box.append(h('h4', { style: { margin: '0 0 6px' } }, 'Google Drive'),
        h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Sign in with Google and every project is kept in a “StudioBindahh” folder in your Drive. Open StudioBindahh on another device, sign in with the same Google account, and your projects are there. StudioBindahh can only see the files it made.'));
      if (!supported()) { box.append(h('div', { class: 'csalert' }, why())); return box; }
      if (!clientId()) {
        const inp = h('input', { class: 'grow', placeholder: '1234567890-abc….apps.googleusercontent.com', 'aria-label': 'Google OAuth client ID', spellcheck: false });
        box.append(h('label', { class: 'lbl' }, 'Google client ID (one-time setup — README → Google Drive sync)'),
          h('div', { class: 'row' }, inp, h('button', { class: 'btn', onclick: () => {
            const v = inp.value.trim(); if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(v)) return toast('That doesn’t look like a Google OAuth client ID (it ends in .apps.googleusercontent.com).', true);
            localStorage.setItem(K.client, v); redraw();
          } }, 'Save')));
        return box;
      }
      box.append(h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: onConnect }, icon('cloud', 15), 'Connect Google Drive'),
        localStorage.getItem(K.client) ? h('button', { class: 'btn ghost sm', onclick: () => { localStorage.removeItem(K.client); redraw(); } }, 'Change client ID') : null));
      return box;
    },
  };
})();
