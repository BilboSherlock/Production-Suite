'use strict';
/* ===================================================================
   Shoot brief — MODEL
   The creative and commercial brief of a photo shoot (P.photo.brief):
   text fields plus two tables, deliverables and approvers. Pure
   functions: no DOM, no Store, no UI state. See js/mvvm.js.
   =================================================================== */

const BriefModel = (() => {
  const FIELDS = ['client', 'campaign', 'photographer', 'concept', 'mood', 'objectives', 'messages', 'usage', 'territory', 'term', 'exclusivity', 'budgetCap'];
  const SIGNOFF = ['Pending', 'Approved', 'Changes requested'];
  /** the two tables: their columns [key, heading, { ph, type, select }], a blank row, and the hint shown while empty */
  const TABLES = {
    deliverables: { title: 'Deliverables', cols: [['name', 'Deliverable', { ph: 'Hero key visual' }], ['spec', 'Ratio / spec', { ph: '4:5 · 4000px' }], ['qty', 'Qty', { type: 'number' }], ['channel', 'Channel', { ph: 'Instagram' }], ['due', 'Due', { type: 'date' }]],
      blank: () => ({ id: newId(), name: '', spec: '', qty: '', channel: '', due: '' }), hint: 'List every final image or crop you must hand over. Shots in the Photo shot list can be checked against these.' },
    approvers: { title: 'Approvals & stakeholders', cols: [['name', 'Name'], ['role', 'Role', { ph: 'Art director' }], ['email', 'Email', { type: 'email' }], ['status', 'Sign-off', { select: SIGNOFF }]],
      blank: () => ({ id: newId(), name: '', role: '', email: '', status: 'Pending' }), hint: 'Who has to approve selects and finals?' },
  };
  const blank = () => Object.assign(Object.fromEntries(FIELDS.map(k => [k, ''])), { deliverables: [], approvers: [] });

  /** the brief, filled out with anything missing (and an id on every row) */
  function ensure(H) {
    const B = H.brief = H.brief || blank();
    FIELDS.forEach(k => { if (B[k] == null) B[k] = ''; });
    Object.keys(TABLES).forEach(t => { if (!Array.isArray(B[t])) B[t] = []; B[t].forEach(r => { if (!r.id) r.id = newId(); }); });
    return B;
  }
  function set(B, k, v) { if (!FIELDS.includes(k)) return false; B[k] = String(v ?? ''); return true; }

  /* ---------- the tables ---------- */
  const table = t => TABLES[t] || null;
  function addRow(B, t) { const T = table(t); if (!T) return null; const r = T.blank(); B[t].push(r); return r; }
  function setCell(B, t, id, k, v) {
    const T = table(t), r = T && B[t].find(x => x.id === id), col = T && T.cols.find(c => c[0] === k); if (!r || !col) return false;
    const o = col[2] || {}; if (o.select && !o.select.includes(v)) return false;
    r[k] = String(v ?? ''); return true;
  }
  function removeRow(B, t, id) { if (!table(t)) return false; const n = B[t].length; B[t] = B[t].filter(r => r.id !== id); return B[t].length < n; }

  /* ---------- reading ---------- */
  /** the shoot window: { days, from } from the schedule */
  const shootWindow = days => ({ days: (days || []).length, from: ((days || [])[0] || {}).date || '' });
  /** the printed brief as HTML; esc() escapes text */
  function printHtml(title, B, esc) {
    const sec = (t, x) => x && String(x).trim() ? `<h3>${esc(t)}</h3><p style="white-space:pre-wrap">${esc(x)}</p>` : '';
    const tbl = (t, heads, keys) => B[t].length ? `<h3>${t === 'approvers' ? 'Approvals' : 'Deliverables'}</h3><table><thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>` + B[t].map(d => `<tr>${keys.map(k => `<td>${esc(d[k])}</td>`).join('')}</tr>`).join('') + '</tbody></table>' : '';
    return `<h1>${esc(title)} — Shoot brief</h1><div class="sub">${esc([B.client, B.campaign, B.photographer && 'Photographer: ' + B.photographer].filter(Boolean).join(' · '))}</div>
      ${sec('Concept', B.concept)}${sec('Mood & references', B.mood)}${sec('Objectives', B.objectives)}${sec('Key messages', B.messages)}
      <h3>Usage & licensing</h3><p>${esc([B.usage, B.territory && 'Territory: ' + B.territory, B.term && 'Term: ' + B.term, B.exclusivity && 'Exclusivity: ' + B.exclusivity].filter(Boolean).join(' · ') || '—')}</p>
      ${tbl('deliverables', ['Deliverable', 'Ratio / spec', 'Qty', 'Channel', 'Due'], ['name', 'spec', 'qty', 'channel', 'due'])}
      ${tbl('approvers', ['Name', 'Role', 'Email', 'Sign-off'], ['name', 'role', 'email', 'status'])}`;
  }

  return { FIELDS, SIGNOFF, TABLES, blank, ensure, set, table, addRow, setCell, removeRow, shootWindow, printHtml };
})();
