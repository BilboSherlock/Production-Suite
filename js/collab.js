'use strict';
/* ===================================================================
   Live collaboration (UI) — share a project with devices on the same
   network, see who is here and where, and edit together. The relay and
   the encryption live in serve.py and collabnet.js.
   =================================================================== */
const Collab = {
  sess: null, P: null, code: '', chat: [], unread: 0, lastInput: 0, scriptHook: null, panelRefresh: null, addrs: [],
  user() { let u = null; try { u = JSON.parse(localStorage.getItem('sb-user') || 'null'); } catch (e) { } if (!u) { u = { name: '', color: ['#e5484d', '#2468d8', '#1e8e54', '#e8830c', '#7a45c9', '#d6409f', '#12a594'][Math.floor(Math.random() * 7)] }; } return u; },
  saveUser(u) { try { localStorage.setItem('sb-user', JSON.stringify(u)); } catch (e) { } },
  active(P) { return !!(Collab.sess && Collab.P && (!P || P.id === Collab.P.id)); },
  get ro() { return !!(Collab.sess && Collab.sess.role === 'view'); },
  supported() { return /^https?:$/.test(location.protocol); },

  /* ---------- hooks used by the rest of the app ---------- */
  onLocalChange(P) { if (Collab.sess && Collab.P === P) Collab.sess.touch(); },
  flush() { if (Collab.sess) Collab.sess.flushNow(); },
  viewName() { return (location.hash.replace(/^#\/?/, '').split('/')[2] || 'overview'); },
  setView() { if (Collab.sess && Store.P === Collab.P) Collab.sess.setPresence({ view: Collab.viewName() }); Collab.paint(); },
  setPresence(p) { if (Collab.sess) Collab.sess.setPresence(p); },
  persist() { const P = Collab.P; if (!P) return; P.updated = Date.now(); clearTimeout(Collab._pt); Collab._pt = setTimeout(async () => { try { await DB.put(P); if (window.Sync) Sync.queuePush(P); } catch (e) { } }, 500); },

  /* ---------- events from the session ---------- */
  wire(s) {
    s.on.state = () => Collab.paint(); s.on.users = () => { Collab.paint(); Collab.decorate(); Collab.panelRefresh && Collab.panelRefresh(); };
    s.on.presence = () => { Collab.decorate(); Collab.panelRefresh && Collab.panelRefresh(); };
    s.on.remote = t => { Collab.persist(); Collab.requestRedraw(t); };
    s.on.reset = n => { Collab.persist(); toast(n ? 'Reconnected — you were out of sync, so the host’s version was loaded.' : 'Synchronised with the session', !!n); Router.refresh(); };
    s.on.role = r => { Collab.applyRole(); toast(r === 'view' ? 'You are now view-only.' : 'You can edit again.'); Collab.paint(); };
    s.on.chat = m => { Collab.chat.push(m); if (Collab.chat.length > 200) Collab.chat.shift(); if (m.from !== s.me) { if (!Collab.panelRefresh) { Collab.unread++; toast(`${m.name}: ${m.text.slice(0, 80)}`); Collab.paint(); } } Collab.panelRefresh && Collab.panelRefresh(); };
    s.on.tamper = () => toast('A message failed its security check and was ignored.', true);
    s.on.closed = msg => { Collab.end(); modal({ title: 'Session ended', body: h('p', { style: { margin: 0 } }, msg + ' Your copy of the project stays on this device.'), buttons: [{ label: 'OK', primary: true }] }); };
    Collab.applyRole();
  },
  applyRole() { document.body.classList.toggle('collab-ro', Collab.ro); },
  end() { if (Collab.P) delete Collab.P.collab; Collab.sess = null; Collab.P = null; Collab.code = ''; Collab.chat = []; Collab.unread = 0; Collab.panelRefresh = null; document.body.classList.remove('collab-ro'); Collab.paint(); Collab.decorate(); },

  /* ---------- remote changes → screen ---------- */
  requestRedraw(t) {
    const q = Collab._q = Collab._q || { sec: new Set(), ids: new Set(), structural: false };
    t.sec.forEach(x => q.sec.add(x)); t.ids.forEach(x => q.ids.add(x)); q.structural = q.structural || t.structural;
    clearTimeout(Collab._rt); Collab._rt = setTimeout(Collab.redraw, 220);
  },
  redraw() {
    const q = Collab._q; if (!q || !Collab.P || Store.P !== Collab.P) { Collab._q = null; return; }
    if (document.querySelector('.overlay')) { Collab._rt = setTimeout(Collab.redraw, 900); return; }
    const info = { sec: q.sec, ids: q.ids, structural: q.structural };
    if (Collab.viewName() === 'script' && Collab.scriptHook) { Collab._q = null; Collab.scriptHook.remote(info); Collab.decorate(); return; }
    const a = document.activeElement, typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#main') && (Date.now() - Collab.lastInput < 1600);
    if (typing) { Collab._rt = setTimeout(Collab.redraw, 600); return; }
    Collab._q = null; const m = document.getElementById('main'), top = m ? m.scrollTop : 0; Router.refresh(); setTimeout(() => { const mm = document.getElementById('main'); if (mm) mm.scrollTop = top; Collab.decorate(); }, 80);
  },
  /* colour the script lines other people are on */
  decorate() {
    document.querySelectorAll('.blk[data-peer]').forEach(e => { e.removeAttribute('data-peer'); e.style.removeProperty('--peer'); });
    const s = Collab.sess; if (!s || Store.P !== Collab.P || Collab.viewName() !== 'script') return;
    s.users.forEach((u, uid) => { if (uid === s.me || !u.online || !u.pres || !u.pres.block || u.pres.view !== 'script') return; const el = document.querySelector(`.blk[data-id="${u.pres.block}"]`); if (el) { el.dataset.peer = u.name; el.style.setProperty('--peer', u.color); } });
  },

  /* ---------- the header button ---------- */
  button() { const b = h('button', { class: 'btn sm collab-btn', id: 'collabBtn', title: 'Live collaboration', onclick: () => Collab.panel() }); Collab.fillButton(b); return b; },
  fillButton(b) {
    const s = Collab.sess; b.replaceChildren(); b.classList.toggle('live', !!s);
    if (!s) { b.append(icon('users', 15), 'Share'); return; }
    const on = [...s.users.values()].filter(u => u.online), dot = h('i', { class: 'cdot-state ' + (s.state === 'live' ? 'ok' : 'bad') });
    b.append(dot, h('span', { class: 'collab-av' }, on.slice(0, 4).map(u => h('i', { style: { background: u.color }, title: u.name }, (u.name || '?')[0].toUpperCase()))), h('span', {}, s.state === 'live' ? `${on.length} here` : 'Reconnecting…'), Collab.unread ? h('span', { class: 'pill danger', style: { marginLeft: '4px' } }, String(Collab.unread)) : null, Collab.ro ? h('span', { class: 'pill' }, 'view only') : null);
  },
  paint() { const b = document.getElementById('collabBtn'); if (b) Collab.fillButton(b); const bar = document.getElementById('collabBanner'); if (bar) bar.remove(); if (Collab.sess && Collab.ro && Store.P === Collab.P) { const c = document.getElementById('content'); if (c) c.insertBefore(h('div', { id: 'collabBanner', class: 'collab-banner' }, icon('lock', 14), ' You have view-only access — changes you make here are not shared.'), c.children[1] || null); } },

  /* ---------- starting, joining, leaving ---------- */
  async startHost(P, o) {
    const net = new CollabNet.Net(location.origin), s = new CollabNet.Session(net);
    Collab.wire(s); const d = await s.startHost(o.code, P, { name: o.name, hostName: o.hostName, color: o.color, defaultRole: o.defaultRole, pid: P.id });
    Collab.sess = s; Collab.P = P; Collab.code = o.code; Collab.addrs = d.lan.map(ip => `http://${ip}:${d.port}`); P.collab = { hosting: true }; Store.touch(); Collab.paint(); Collab.setView(); return d;
  },
  async join(base, code, name, color) {
    const net = new CollabNet.Net(base), s = new CollabNet.Session(net); Collab.wire(s);
    const j = await s.prepareJoin(code, name, color), p = migrate(JSON.parse(JSON.stringify(j.doc)));
    p.id = uid(); p.created = Date.now(); p.collab = { guest: true, host: base, title: j.doc.title }; await Store.add(p);
    s.attach(p); Collab.sess = s; Collab.P = p; Collab.code = code; Collab.addrs = []; Collab.paint();
    return p;
  },
  async leave() {
    const s = Collab.sess; if (!s) return; const host = s.host; await s.stop(host); Collab.end();
    toast(host ? 'Session closed. Everyone has been disconnected.' : 'You left the session. Your copy stays on this device.');
  },

  /* ---------- the panel ---------- */
  panel() {
    if (!Collab.supported()) return modal({ title: 'Live collaboration', body: h('p', { style: { margin: 0 } }, 'Live sessions need the StudioBindahh server. Close this file and start the app with “Start StudioBindahh.bat” (or python serve.py), then open http://localhost:5173.'), buttons: [{ label: 'OK', primary: true }] });
    if (location.protocol === 'https:' && !Collab.sess) return modal({ title: 'Live collaboration', body: h('div', {}, h('p', { style: { marginTop: 0 } }, 'Live sessions run between devices on the same network through the StudioBindahh server on a PC, which uses a plain http address. Secure (https) pages such as this one are not allowed by the browser to talk to it.'), h('p', { style: { marginBottom: 0 } }, 'To collaborate, run “Start StudioBindahh.bat” on the PC and open the address it prints (http://192.168…) on this device instead. Your projects there are stored separately — use Backup and Import to move them across.')), buttons: [{ label: 'OK', primary: true }] });
    if (Collab.sess) return Collab.livePanel(); if (!Store.P) return Collab.joinModal(); return Collab.startModal(Store.P);
  },
  startModal(P) {
    const me = Collab.user(); let code = SBC.newCode(); const name = h('input', { class: 'inp', value: me.name, placeholder: 'Your name' }), room = h('input', { class: 'inp', value: P.title }), codeIn = h('input', { class: 'inp mono', value: code, style: { fontSize: '17px', letterSpacing: '.05em' } });
    const role = h('select', { class: 'inp' }, [['edit', 'Can edit'], ['view', 'View only']].map(([k, l]) => h('option', { value: k }, l))), err = h('div', { class: 'csalert', style: { display: 'none', marginTop: '10px' } });
    modal({ title: 'Share this project live', wide: true, body: h('div', {},
      h('p', { style: { marginTop: 0 } }, 'Invite people on the same Wi-Fi or network to work in this project with you, live. Nothing leaves your network, and everything is encrypted with a session code that you give people in person.'),
      h('div', { class: 'fx-grid' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Your name'), name), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Session name'), room), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'People who join can'), role),
        h('div', { class: 'field', style: { gridColumn: '1 / -1' } }, h('label', { class: 'lbl' }, 'Session code (people need this to join)'), h('div', { class: 'row' }, codeIn, h('button', { class: 'btn', onclick: () => { codeIn.value = SBC.newCode(); } }, icon('rotate', 14), 'New code')))),
      h('ul', { class: 'small muted', style: { margin: '12px 0 0', paddingLeft: '18px' } }, h('li', {}, 'Others open the address shown after you start (this computer must stay on and keep StudioBindahh running).'), h('li', {}, 'Undo is switched off during a session so nobody reverses other people’s work. Use Drafts or budget Versions to go back.'), h('li', {}, 'Only people with the code can read or change anything.')), err),
      buttons: [{ label: 'Cancel' }, { label: 'Start session', primary: true, onClick: async () => {
        const c = codeIn.value.trim().toUpperCase(), nm = name.value.trim(); if (nm.length < 1) { err.style.display = 'block'; err.textContent = 'Enter your name.'; return false; } if (c.replace(/[^A-Z0-9]/g, '').length < 8) { err.style.display = 'block'; err.textContent = 'The session code needs at least 8 letters or numbers.'; return false; }
        Collab.saveUser({ name: nm, color: me.color }); const w = modal({ title: 'Securing the session…', body: h('p', { style: { margin: 0 } }, 'Deriving the encryption keys — this takes a couple of seconds.'), buttons: [] });
        setTimeout(async () => { try { await Collab.startHost(P, { code: c, name: room.value.trim() || P.title, hostName: nm, color: me.color, defaultRole: role.value }); w.close(); Collab.livePanel(); } catch (e) { w.close(); toast('Could not start the session: ' + e.message, true); } }, 60);
      } }] });
  },
  livePanel() {
    const s = Collab.sess; if (!s) return; Collab.unread = 0; Collab.paint(); let box = h('div'); const chatIn = h('input', { class: 'inp', placeholder: 'Message everyone…', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { s.chat(e.target.value.trim()); e.target.value = ''; } } });
    const log = h('div', { class: 'collab-chat' });
    const draw = () => {
      const users = [...s.users.values()], host = s.host, show = UI.collabShowCode;
      box.replaceChildren(h('div', { class: 'row', style: { marginBottom: '12px' } }, h('i', { class: 'cdot-state ' + (s.state === 'live' ? 'ok' : 'bad') }), h('b', {}, s.state === 'live' ? 'Live' : s.state === 'reconnecting' ? 'Reconnecting…' : s.state), h('span', { class: 'muted small' }, host ? '· you are hosting' : `· hosted by ${(s.users.get(s.hostUid) || {}).name || 'the host'}`), h('span', { class: 'grow' }), s.role === 'view' ? h('span', { class: 'pill' }, 'view only') : h('span', { class: 'pill', style: { background: 'var(--ok)', color: '#fff' } }, 'can edit')),
        host ? h('div', { class: 'card', style: { padding: '12px 14px', marginBottom: '12px' } }, h('div', { class: 'small muted' }, 'Tell people to open one of these on their device, choose “Join session”, and enter the code:'),
          Collab.addrs.length ? Collab.addrs.map(a => h('div', { class: 'row', style: { margin: '6px 0' } }, h('b', { class: 'mono', style: { fontSize: '16px' } }, a), h('button', { class: 'btn sm', onclick: async () => { toast(await copyText(a) ? 'Address copied' : 'Select and copy the address by hand', false); } }, icon('copy', 13), 'Copy'))) : h('div', { class: 'small', style: { margin: '6px 0' } }, 'No network address found — are you connected to Wi-Fi or Ethernet? (Others can still join at this computer’s IP address.)'),
          h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'small muted' }, 'Session code'), h('b', { class: 'mono', style: { fontSize: '17px', letterSpacing: '.06em' } }, show ? Collab.code : '••• ••• ••• •••'), h('button', { class: 'btn sm ghost', onclick: () => { UI.collabShowCode = !show; draw(); } }, show ? 'Hide' : 'Show'), h('button', { class: 'btn sm', onclick: async () => { toast(await copyText(Collab.code) ? 'Code copied' : 'Select and copy the code by hand', false); } }, icon('copy', 13), 'Copy'))) : null,
        h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Who', 'Where', host ? 'Access' : '', ''].map(x => h('th', {}, x)))), h('tbody', {}, users.map(u => h('tr', { class: u.online ? '' : 'done' }, h('td', {}, h('span', { class: 'collab-dot', style: { background: u.color } }, (u.name || '?')[0].toUpperCase()), ' ', h('b', {}, u.name), u.uid === s.me ? h('span', { class: 'muted small' }, ' (you)') : null, u.uid === s.hostUid ? h('span', { class: 'pill', style: { marginLeft: '6px' } }, 'host') : null),
          h('td', { class: 'small muted' }, u.online ? ((u.pres && u.pres.view) || '—') : 'offline'),
          h('td', {}, host && u.uid !== s.me ? h('select', { class: 'cell', onchange: e => s.setRole(u.uid, e.target.value) }, [['edit', 'Can edit'], ['view', 'View only']].map(([k, l]) => h('option', { value: k, selected: k === u.role }, l))) : h('span', { class: 'small muted' }, host || u.uid === s.me ? (u.role === 'view' ? 'view only' : 'can edit') : '')),
          h('td', {}, host && u.uid !== s.me ? ibtn('x', 'Remove from session', () => s.kickUser(u.uid), 'danger') : null))))),
        h('div', { class: 'small muted', style: { margin: '14px 0 6px' } }, 'Chat'), log, chatIn,
        h('p', { class: 'small muted', style: { margin: '12px 0 0' } }, 'Encrypted end-to-end between devices on this network. Undo is off during a session.'));
      log.replaceChildren(...(Collab.chat.length ? Collab.chat.slice(-60).map(m => h('div', { class: 'small' }, h('b', {}, m.name + ': '), m.text)) : [h('div', { class: 'small muted' }, 'No messages yet.')])); log.scrollTop = 1e6;
    };
    Collab.panelRefresh = () => { if (document.body.contains(box)) draw(); else Collab.panelRefresh = null; }; draw();
    modal({ title: s.host ? 'Live session — hosting' : 'Live session', wide: true, body: box, onClose: () => { Collab.panelRefresh = null; }, buttons: [{ label: s.host ? 'End session for everyone' : 'Leave session', onClick: () => { Collab.panelRefresh = null; setTimeout(() => Collab.leave(), 0); } }, { label: 'Close', primary: true }] });
  },
  joinModal() {
    const me = Collab.user(), local = /^(localhost|127\.|\[?::1)/.test(location.hostname), name = h('input', { class: 'inp', value: me.name, placeholder: 'Your name' }), addr = h('input', { class: 'inp', value: local ? '' : location.host, placeholder: '192.168.1.20:5173', style: local ? {} : { opacity: .7 } }), code = h('input', { class: 'inp mono', placeholder: 'XXX-XXX-XXX-XXX', style: { fontSize: '17px', letterSpacing: '.05em' } }), err = h('div', { class: 'csalert', style: { display: 'none', marginTop: '10px' } });
    modal({ title: 'Join a live session', body: h('div', {}, h('p', { style: { marginTop: 0 } }, 'Ask the host for their address and session code. You must be on the same network.'), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Your name'), name), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Host address'), addr), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Session code'), code), err),
      buttons: [{ label: 'Cancel' }, { label: 'Join', primary: true, onClick: async () => {
        const nm = name.value.trim(), a = addr.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''), c = code.value.trim().toUpperCase(); if (!nm || !a || !c) { err.style.display = 'block'; err.textContent = 'Fill in all three fields.'; return false; }
        Collab.saveUser({ name: nm, color: me.color }); const w = modal({ title: 'Joining…', body: h('p', { style: { margin: 0 } }, 'Securing the connection and loading the project.'), buttons: [] });
        setTimeout(async () => { try { const p = await Collab.join((location.protocol === 'https:' ? 'https://' : 'http://') + a, c, nm, me.color); w.close(); location.hash = `#/p/${p.id}/overview`; toast(`Joined “${p.title}”`); } catch (e) { w.close(); toast(e.status === 403 ? 'That session code is not right.' : e.status === 429 ? e.message : 'Could not join: ' + e.message, true); } }, 60);
      } }] });
  },
};
document.addEventListener('input', () => { Collab.lastInput = Date.now(); }, true);
document.addEventListener('keydown', () => { Collab.lastInput = Date.now(); }, true);
addEventListener('beforeunload', () => { try { Collab.flush(); } catch (e) { } });

window.Collab = Collab;   // other modules test window.Collab
