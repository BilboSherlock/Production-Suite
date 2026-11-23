'use strict';
/* ===================================================================
   Collaboration transport + session logic (works in the browser and in
   Node for testing). The server only relays opaque, encrypted bytes.
   =================================================================== */
const CollabNet = (() => {
  const C = (typeof SBC !== 'undefined') ? SBC : require('./crypto.js'), D = (typeof SBD !== 'undefined') ? SBD : require('./diff.js'), E = (typeof CollabCore !== 'undefined') ? CollabCore : require('./collabcore.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  class Net {
    constructor(base, fetchFn) { this.base = base.replace(/\/$/, ''); this.fetch = fetchFn || ((...a) => fetch(...a)); this.keys = null; this.token = ''; }
    async sign(method, path, bodyBytes) {
      const ts = String(Date.now()), msg = `${this.token}|${ts}|${C.hex(C.sha256(bodyBytes || new Uint8Array(0)))}|${method}|${path}`;
      return { 'X-Token': this.token, 'X-Ts': ts, 'X-Sig': C.hex(C.hmac(this.keys.auth, C.enc(msg))) };
    }
    async json(method, path, obj, signed = true) {
      const bytes = obj === undefined ? new Uint8Array(0) : C.enc(JSON.stringify(obj)), headers = Object.assign({ 'Content-Type': 'application/json' }, signed ? await this.sign(method, path.split('?')[0], bytes) : {});
      const r = await this.fetch(this.base + path, { method, headers, body: method === 'GET' ? undefined : bytes }); let d = null; try { d = await r.json(); } catch (e) { }
      if (!r.ok) { const e = new Error((d && d.error) || ('HTTP ' + r.status)); e.status = r.status; throw e; } return d;
    }
    status() { return this.json('GET', '/api/status', undefined, false); }
    async open(code, salt, o) {
      this.keys = C.deriveKeys(code, salt); const d = await this.json('POST', '/api/room/open', { name: o.name, salt: C.b64(salt), auth: C.hex(this.keys.auth), hostName: o.hostName, color: o.color, defaultRole: o.defaultRole, pid: o.pid }, false);
      this.token = d.token; return d;
    }
    async join(code, name, color) {
      const st = await this.status(); if (!st.room) throw new Error('No session is open on that computer.');
      this.keys = C.deriveKeys(code, C.unb64(st.room.salt)); const ch = await this.json('GET', '/api/challenge', undefined, false);
      const proof = C.hex(C.hmac(this.keys.auth, C.enc(`${ch.nonce}|${name}`)));
      const d = await this.json('POST', '/api/join', { nonce: ch.nonce, name, color, proof }, false); this.token = d.token; return d;
    }
    send(k, obj, cid) { return this.json('POST', '/api/send', { k, cid, d: C.b64(C.sealJSON(this.keys, obj)) }); }
    async putSnapshot(seq, obj) {
      const body = C.seal(this.keys, C.enc(JSON.stringify(obj))), path = '/api/snapshot', r = await this.fetch(`${this.base}${path}?seq=${seq}`, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, await this.sign('PUT', path, body)), body });
      if (!r.ok) { const e = new Error('snapshot ' + r.status); e.status = r.status; throw e; } return true;
    }
    async getSnapshot() {
      const path = '/api/snapshot', r = await this.fetch(this.base + path, { headers: await this.sign('GET', path) }); if (!r.ok) { const e = new Error('snapshot ' + r.status); e.status = r.status; throw e; }
      const seq = +r.headers.get('X-Seq'), bytes = new Uint8Array(await r.arrayBuffer()), plain = C.open(this.keys, bytes); if (!plain) throw new Error('Snapshot failed its integrity check');
      return { seq, doc: JSON.parse(C.dec(plain)) };
    }
    /* Server-sent events over fetch (so we can send auth headers). Calls onEvent(obj) for each message. */
    async stream(since, onEvent, signal) {
      const path = '/api/stream', r = await this.fetch(`${this.base}${path}?since=${since}`, { headers: await this.sign('GET', path), signal });
      if (!r.ok) { const e = new Error('stream ' + r.status); e.status = r.status; throw e; }
      const rd = r.body.getReader(), td = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += td.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split('\n').find(l => l.startsWith('data: ')); if (line) { try { onEvent(JSON.parse(line.slice(6))); } catch (e) { } } } }
    }
  }

  /* One person's connection to a session */
  class Session {
    constructor(net, opts = {}) {
      this.net = net; this.on = {}; this.me = null; this.role = 'edit'; this.host = false; this.engine = null; this.users = new Map(); this.state = 'idle'; this.pres = {}; this.opts = Object.assign({ snapEvery: 60, flushMs: 120, presMs: 350 }, opts);
      this.abort = null; this.sending = false; this.opsSinceSnap = 0; this.stopped = false; this.timers = []; this.tamper = 0; this.rejoin = null;
    }
    emit(k, ...a) { const f = this.on[k]; if (f) try { f(...a); } catch (e) { console.error(e); } }
    setState(s) { if (this.state !== s) { this.state = s; this.emit('state', s); } }
    /* ---- start as host: doc is the live project object ---- */
    async startHost(code, doc, o) {
      const salt = C.rand(16); const d = await this.net.open(code, salt, o); this.me = d.uid; this.host = true; this.role = 'edit'; this.info = d;
      D.normalize(doc); this.engine = new E.Engine(doc, this.me, 0); await this.net.putSnapshot(0, snapshotOf(doc)); this.begin(); return d;
    }
    /* ---- join: returns the shared document; call attach(liveDoc) afterwards ---- */
    async prepareJoin(code, name, color) {
      const d = await this.net.join(code, name, color); this.me = d.uid; this.role = d.role; this.info = d; this.host = false;
      let snap = null; for (let i = 0; i < 40 && !snap; i++) { try { snap = await this.net.getSnapshot(); } catch (e) { if (e.status !== 404) throw e; await sleep(500); } }
      if (!snap) throw new Error('The host has not shared the project yet.'); this.joinSeq = snap.seq; return { doc: snap.doc, seq: snap.seq, info: d };
    }
    attach(liveDoc) { D.sortAll(liveDoc); this.engine = new E.Engine(liveDoc, this.me, this.joinSeq); this.begin(); }
    /* ---- lifecycle ---- */
    begin() { this.stopped = false; this.setState('connecting'); this.loop(); this.timers.push(setInterval(() => this.maybeSnapshot(), 15000)); }
    async loop() {
      let delay = 800;
      while (!this.stopped) {
        this.abort = new AbortController();
        try {
          this.setState(this.engine.lastSeq ? 'reconnecting' : 'connecting');
          await this.net.stream(this.engine.lastSeq, ev => { delay = 800; this.handle(ev); }, this.abort.signal);
        } catch (e) {
          if (this.stopped) return; if (e.status === 401 || e.status === 404) { this.stopped = true; this.setState('lost'); this.emit('closed', 'The session is no longer available.'); return; }
        }
        if (this.stopped) return; this.setState('reconnecting'); await sleep(delay); delay = Math.min(delay * 2, 8000);
      }
    }
    async handle(ev) {
      switch (ev.k) {
        case 'hello': this.role = ev.role; this.hostUid = ev.host; this.setUsers(ev.users); this.setState('live'); this.engine.pending.forEach(b => { b.sent = false; }); if (ev.resync) await this.resync(); this.kick(); break;
        case 'users': this.setUsers(ev.users); break;
        case 'role': if (ev.uid === this.me) { this.role = ev.role; this.emit('role', ev.role); } break;
        case 'kicked': if (ev.uid === this.me) { this.stop(); this.emit('closed', 'The host removed you from the session.'); } break;
        case 'closed': this.stop(); this.emit('closed', 'The host closed the session.'); break;
        case 'ops': this.onOps(ev); break;
        case 'pres': { const p = C.openJSON(this.net.keys, C.unb64(ev.d)); if (!p) { this.tamper++; break; } const u = this.users.get(ev.from); if (u) { u.pres = p; this.emit('presence', ev.from, p); } break; }
        case 'chat': { const p = C.openJSON(this.net.keys, C.unb64(ev.d)); if (!p) { this.tamper++; break; } this.emit('chat', { from: ev.from, name: (this.users.get(ev.from) || {}).name || '?', text: String(p.text || '').slice(0, 2000), t: ev.t }); break; }
      }
    }
    setUsers(list) { const next = new Map(); list.forEach(u => next.set(u.uid, Object.assign({}, this.users.get(u.uid) || {}, u))); this.users = next; this.emit('users', this.users); }
    onOps(ev) {
      if (ev.seq > this.engine.lastSeq + 1) { this.abort && this.abort.abort(); return; }     // missed something: reconnect and replay
      const plain = C.openJSON(this.net.keys, C.unb64(ev.d)); if (!plain) { this.tamper++; this.emit('tamper', this.tamper); this.engine.lastSeq = ev.seq; return; }
      const touched = this.engine.receive({ seq: ev.seq, from: ev.from, cid: ev.cid, ops: plain.ops }); this.opsSinceSnap++;
      if (touched) this.emit('remote', touched, ev.from); else this.kick();
    }
    async resync() {
      const snap = await this.net.getSnapshot(); const had = this.engine.pending.length + this.engine.outbox.length; this.engine.reset(snap.doc, snap.seq); this.emit('reset', had);
    }
    /* ---- sending ---- */
    touch() { if (this.role !== 'edit' || !this.engine) return; clearTimeout(this.ft); this.ft = setTimeout(() => this.kick(), this.opts.flushMs); }
    flushNow() { if (!this.engine || this.role !== 'edit') return; this.engine.local(); }
    async kick() {
      if (this.sending || !this.engine || this.stopped) return; this.sending = true;
      try {
        for (;;) {
          if (this.role === 'edit') this.engine.batch();
          const b = this.engine.pending.find(x => !x.sent); if (!b) break;
          try { await this.net.send('ops', { ops: b.ops }, b.cid); b.sent = true; } catch (e) { if (e.status === 403) { this.role = 'view'; this.emit('role', 'view'); break; } if (e.status === 401 || e.status === 404) break; await sleep(800); break; }
        }
      } finally { this.sending = false; }
      if (this.engine && this.engine.pending.some(x => !x.sent)) setTimeout(() => this.kick(), 1500);
    }
    /* resend anything unacknowledged after a reconnect (server de-duplicates by cid) */
    async maybeSnapshot() {
      if (!this.engine || this.role !== 'edit' || this.state !== 'live' || this.opsSinceSnap < this.opts.snapEvery && !(this.host && this.opsSinceSnap > 0 && Date.now() - (this.lastSnap || 0) > 60000)) return;
      if (!this.engine.clean()) return; const seq = this.engine.lastSeq;
      try { await this.net.putSnapshot(seq, snapshotOf(this.engine.doc)); this.opsSinceSnap = 0; this.lastSnap = Date.now(); } catch (e) { }
    }
    setPresence(p) { this.pres = Object.assign(this.pres, p); clearTimeout(this.pt); this.pt = setTimeout(() => { if (this.state === 'live') this.net.send('pres', Object.assign({ t: Date.now() }, this.pres)).catch(() => { }); }, this.opts.presMs); }
    chat(text) { return this.net.send('chat', { text }).catch(() => { }); }
    async stop(close) { this.stopped = true; this.timers.forEach(clearInterval); this.timers = []; clearTimeout(this.ft); clearTimeout(this.pt); this.abort && this.abort.abort(); this.setState('idle'); if (close) { try { await this.net.json('POST', '/api/room/close', {}); } catch (e) { } } else { try { await this.net.json('POST', '/api/leave', {}); } catch (e) { } } }
    setRole(uid, role) { return this.net.json('POST', '/api/role', { uid, role }); }
    kickUser(uid) { return this.net.json('POST', '/api/kick', { uid }); }
  }
  const snapshotOf = doc => { const o = {}; for (const k of Object.keys(doc)) if (!D.EXCLUDE.has(k)) o[k] = doc[k]; return o; };
  return { Net, Session, snapshotOf };
})();
if (typeof module !== 'undefined') module.exports = CollabNet;
