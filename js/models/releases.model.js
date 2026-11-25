'use strict';
/* ===================================================================
   Releases & permits — MODEL
   The paperwork checklist of a photo shoot (P.photo.releases): model
   releases, minor consent, property releases, permits, insurance and
   usage terms. Items: { id, kind, who, status, date, expires, notes,
   personId?, locationId? }. Pure functions: no DOM, no Store, no UI
   state; `today` ('YYYY-MM-DD', the user's local date) is passed in.
   See js/mvvm.js.
   =================================================================== */

const ReleasesModel = (() => {
  const KINDS = ['Model release', 'Minor consent', 'Property release', 'Location permit', 'Usage agreement', 'Insurance certificate', 'Trademark clearance', 'Music / audio licence', 'Other'];
  const STATUS = ['Needed', 'Sent', 'Signed', 'N/A'];
  const OPEN = ['Needed', 'Sent'], DONE = ['Signed', 'N/A'];
  const FIELDS = ['kind', 'who', 'status', 'date', 'expires', 'notes'];
  /** the filter menu: [value, label] */
  const FILTERS = [['', 'Everything'], ['open', 'Outstanding only'], ['expired', 'Expired'], ...KINDS.map(k => [k, k])];

  const item = (kind = 'Model release', o = {}) => Object.assign({ id: newId(), kind, who: '', status: 'Needed', date: '', expires: '', notes: '' }, o);
  const list = H => (H && H.releases) || [];
  const isOpen = r => OPEN.includes(r.status);
  const isDone = r => DONE.includes(r.status);
  /** a signed item whose expiry date has passed */
  const isExpired = (r, today) => !!r.expires && r.expires < today && r.status === 'Signed';
  /** whole years old on `today`, from a 'YYYY-MM-DD' date of birth (null when unknown) */
  function ageOn(dob, today) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob || ''), t = /^(\d{4})-(\d{2})-(\d{2})/.exec(today || ''); if (!m || !t) return null;
    let a = +t[1] - +m[1]; if (t[2] + t[3] < m[2] + m[3]) a--; return a;
  }

  function filter(L, f, today) { return L.filter(r => !f || (f === 'open' ? isOpen(r) : f === 'expired' ? isExpired(r, today) : r.kind === f)); }
  const stats = (H, today) => ({ total: list(H).length, open: list(H).filter(isOpen).length, done: list(H).filter(isDone).length, expired: list(H).filter(r => isExpired(r, today)).length });

  function add(H, kind, o) { const r = item(kind, o); (H.releases = H.releases || []).push(r); return r; }
  const find = (H, id) => list(H).find(r => r.id === id) || null;
  /** change a field; signing stamps today's date when there is none */
  function update(r, k, v, today) {
    if (!FIELDS.includes(k) || (k === 'kind' && !KINDS.includes(v)) || (k === 'status' && !STATUS.includes(v))) return false;
    r[k] = v; if (k === 'status' && v === 'Signed' && !r.date) r.date = today || ''; return true;
  }
  function remove(H, id) { const n = list(H).length; H.releases = list(H).filter(r => r.id !== id); return H.releases.length < n; }

  /**
   * build the checklist from the project → how many items were added:
   * a model release per cast member (minor consent too when under 18, and already signed when their
   * profile says the release is done), a property release per location (and a permit when one is
   * needed), insurance and usage terms. Never adds the same kind for the same name twice.
   */
  function generate(P, H, today) {
    H.releases = H.releases || []; let n = 0;
    const has = (kind, who) => H.releases.some(r => r.kind === kind && (r.who || '').toLowerCase() === who.toLowerCase());
    const put = (kind, who, extra) => { if (!who || has(kind, who)) return; add(H, kind, Object.assign({ who }, extra)); n++; };
    (P.people || []).filter(p => p.type === 'cast' && p.name).forEach(p => {
      put('Model release', p.name, { personId: p.id });
      const a = ageOn(p.dob, today); if (a !== null && a < 18) put('Minor consent', p.name, { personId: p.id, notes: 'Parent / guardian signature, chaperone and working-hours limits.' });
      if ((p.docs || {}).release) { const r = H.releases.find(x => x.kind === 'Model release' && x.who === p.name); if (r && r.status === 'Needed') r.status = 'Signed'; }
    });
    (P.locations || []).filter(l => l.name).forEach(l => {
      put('Property release', l.name, { locationId: l.id });
      if (['Needed', 'Applied', 'Approved'].includes(l.permit)) put('Location permit', l.name, { locationId: l.id, status: l.permit === 'Approved' ? 'Signed' : l.permit === 'Applied' ? 'Sent' : 'Needed' });
    });
    put('Insurance certificate', 'Production liability'); put('Usage agreement', 'Client usage terms');
    return n;
  }
  /** names to suggest in "Who / what": people and locations */
  const whoSuggestions = P => [...(P.people || []).map(p => p.name), ...(P.locations || []).map(l => l.name)].filter(Boolean);
  const printRows = H => list(H).map(r => [r.kind, r.who, r.status, r.date, r.expires, r.notes]);

  return { KINDS, STATUS, OPEN, DONE, FIELDS, FILTERS, item, list, isOpen, isDone, isExpired, ageOn, filter, stats, add, find, update, remove, generate, whoSuggestions, printRows };
})();
