'use strict';
/* ===================================================================
   Collaboration engine (no DOM, no network): tracks local edits as ops,
   keeps unacknowledged ops, and rebases them over remote ops so every
   device ends in the same state whatever the order messages arrive in.
   =================================================================== */
const CollabCore = (() => {
  const D = (typeof SBD !== 'undefined') ? SBD : require('./diff.js');
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  class Engine {
    constructor(doc, me, lastSeq = 0) { this.doc = doc; this.me = me; this.shadow = D.clone(doc); this.pending = []; this.outbox = []; this.lastSeq = lastSeq; this.dropped = 0; }
    /* capture whatever changed in the document since last time */
    local() { D.normalize(this.doc); const ops = D.diff(this.shadow, this.doc); if (ops.length) { D.applyAll(this.shadow, ops); this.outbox.push(...ops); } return ops; }
    /* ops waiting to be sent become one batch (kept until acknowledged) */
    batch() { this.local(); if (!this.outbox.length) return null; const b = { cid: rid(), ops: this.outbox.splice(0) }; this.pending.push(b); return b; }
    clean() { this.local(); return !this.pending.length && !this.outbox.length; }
    /* a sequenced message from the server. msg = {seq, from, cid, ops} */
    receive(msg) {
      if (msg.seq <= this.lastSeq) return null; this.lastSeq = msg.seq;
      if (msg.from === this.me) { const i = this.pending.findIndex(b => b.cid === msg.cid); if (i >= 0) this.pending.splice(i, 1); return null; }
      this.local();                                               // keep our in-flight edits out of the remote state
      D.applyAll(this.doc, msg.ops); D.applyAll(this.shadow, msg.ops);
      for (const b of this.pending) { D.applyAll(this.doc, b.ops); D.applyAll(this.shadow, b.ops); }   // our edits stay on top
      D.applyAll(this.doc, this.outbox); D.applyAll(this.shadow, this.outbox);
      D.sortAll(this.doc); D.sortAll(this.shadow);
      return D.touched(msg.ops);
    }
    /* replace everything (joining, or after a gap in the log) */
    reset(newDoc, seq) { for (const k of Object.keys(this.doc)) if (!D.EXCLUDE.has(k)) delete this.doc[k]; for (const k of Object.keys(newDoc)) if (!D.EXCLUDE.has(k)) this.doc[k] = D.clone(newDoc[k]); D.sortAll(this.doc); this.shadow = D.clone(this.doc); this.pending = []; this.outbox = []; this.lastSeq = seq; }
  }
  return { Engine, rid };
})();
if (typeof module !== 'undefined') module.exports = CollabCore;
