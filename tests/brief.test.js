'use strict';
/* Shoot brief — model and view-model tests */
const BFM = BriefModel;
const bfEsc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

test('brief: filling out, fields and tables', () => {
  const H = { brief: { client: 'Aurora', deliverables: [{ name: 'Hero' }] } }, B = BFM.ensure(H);
  eq([B === H.brief, B.client, B.concept, B.approvers, !!B.deliverables[0].id, BFM.ensure(H) === B], [true, 'Aurora', '', [], true, true], 'filled in place, rows get ids');
  eq([BFM.ensure({}).deliverables, Object.keys(BFM.blank()).length], [[], 14]);
  eq([BFM.set(B, 'mood', 'Warm'), B.mood, BFM.set(B, 'deliverables', 'x'), BFM.set(B, 'nope', 'x')], [true, 'Warm', false, false]);
  const r = BFM.addRow(B, 'approvers'); eq([r.status, B.approvers.length, BFM.addRow(B, 'bogus')], ['Pending', 1, null]);
  eq([BFM.setCell(B, 'approvers', r.id, 'status', 'Approved'), BFM.setCell(B, 'approvers', r.id, 'status', 'Maybe'), r.status], [true, false, 'Approved']);
  eq([BFM.setCell(B, 'approvers', r.id, 'email', 'a@b.c'), BFM.setCell(B, 'approvers', r.id, 'spec', 'x'), BFM.setCell(B, 'approvers', 'zz', 'name', 'x')], [true, false, false]);
  eq([BFM.removeRow(B, 'approvers', r.id), BFM.removeRow(B, 'approvers', r.id), B.approvers], [true, false, []]);
});

test('brief: shoot window and the printed brief', () => {
  eq([BFM.shootWindow([{ date: '2026-03-01' }, {}]), BFM.shootWindow([{}]), BFM.shootWindow()], [{ days: 2, from: '2026-03-01' }, { days: 1, from: '' }, { days: 0, from: '' }]);
  const B = BFM.ensure({ brief: { client: 'A&B', campaign: 'Spring', concept: 'Light <3', usage: 'Print', term: '2 years', deliverables: [{ id: 'd', name: 'Hero', spec: '4:5', qty: 3, channel: 'OOH', due: '' }] } });
  const html = BFM.printHtml('Reel', B, bfEsc);
  eq([html.includes('<h1>Reel — Shoot brief</h1>'), html.includes('A&amp;B · Spring'), html.includes('<h3>Concept</h3><p style="white-space:pre-wrap">Light &lt;3</p>'), html.includes('<h3>Mood'), html.includes('Print · Term: 2 years'), html.includes('<td>Hero</td><td>4:5</td><td>3</td><td>OOH</td><td></td>'), html.includes('Approvals')], [true, true, true, false, true, true, false]);
  eq(BFM.printHtml('X', BFM.ensure({}), bfEsc).includes('<h3>Usage & licensing</h3><p>—</p>'), true);
});

test('brief vm: quiet typing, sign-off and rows', () => {
  const P = fakeProject({ mode: 'photo', days: [{ date: '2026-03-01' }, { date: '2026-03-02' }], photo: { brief: { client: '' } } });
  const vm = new BriefVM({ project: () => P, store: fakeStore(P), ui: {}, fx: { holder: Q => Q.photo, fmtDate: d => 'D' + d.slice(-2), esc: bfEsc } });
  let draws = 0; vm.subscribe(() => draws++);
  eq(vm.windowText, '2 days scheduled from D01');
  vm.set('client', 'Aurora'); eq([draws, P.photo.brief.client], [0, 'Aurora'], 'typing is quiet');
  const r = vm.addRow('approvers'); eq([draws, vm.rows('approvers').length], [1, 1]);
  vm.setCell('approvers', r.id, 'name', 'Elise'); eq(draws, 1); vm.setCell('approvers', r.id, 'status', 'Approved'); eq([draws, r.status], [2, 'Approved'], 'sign-off redraws');
  vm.removeRow('approvers', r.id); eq([draws, vm.rows('approvers')], [3, []]);
  P.days = []; eq(vm.windowText, 'No shoot days yet — add them in Schedule.');
  eq(vm.printHtml().includes('<h1>Test — Shoot brief</h1>'), true);
});
