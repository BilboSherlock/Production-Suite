'use strict';
/* Sync — model tests */
test('sync: who wins — pull, push or ask', () => {
  const L = { a: { updated: 10 }, b: { updated: 20 }, c: { updated: 30 }, d: { updated: 40 }, e: { updated: 50 }, f: { updated: 60 }, g: { updated: 70 } };
  const R = [{ id: 'a', updated: 15 }, { id: 'b', updated: 25 }, { id: 'c', updated: 25 }, { id: 'd', updated: 40 }, { id: 'n', updated: 5 }, { id: 'f', updated: 55 }, { id: 'g', updated: 99 }, { id: 'a', updated: 99 }, null];
  const last = { a: 10, b: 15, c: 25, f: 50, g: 80 };
  eq(SyncModel.plan(L, R, last), { pull: ['a', 'n'], push: ['c', 'e'], conflict: ['b', 'f', 'g'], remove: [] },
    'a: only theirs changed → take it; b: both changed → ask; c: only ours changed → send; d: same; e: only here; n: only there; f: both changed although theirs looks older; g: both changed; repeats ignored');
  eq(SyncModel.plan({ x: { updated: 100 } }, [{ id: 'x', updated: 500 }], { x: 500 }), { pull: [], push: ['x'], conflict: [], remove: [] }, 'a device with a fast clock: ours changed since, theirs did not → send ours');
  eq(SyncModel.plan({}, [], {}), { pull: [], push: [], conflict: [], remove: [] });
  eq(SyncModel.plan({ k: { updated: 3 }, m: { updated: 9 }, u: { updated: 4 } }, [{ id: 'k', updated: 7, deleted: true }, { id: 'm', updated: 7, deleted: true }, { id: 'u', updated: 7, deleted: true }, { id: 'gone', updated: 7, deleted: true }], { k: 3, m: 5 }),
    { pull: [], push: ['m', 'u'], conflict: [], remove: ['k'] }, 'deleted elsewhere: removed here unless changed here since (or never synced here)');
  eq(SyncModel.plan({ x: { updated: 5 }, y: { updated: 9 } }, [{ id: 'x', updated: 9 }, { id: 'y', updated: 5 }]), { pull: [], push: ['y'], conflict: ['x'], remove: [] }, 'never synced here: ours newer → send; theirs newer → ask');
});

test('sync: file names and timing', () => {
  eq(SyncModel.fileName({ id: 'ab12', title: ' My: "Film" / Draft\n2 ' }, '.studiobindahh'), 'My Film Draft 2 (ab12).studiobindahh');
  eq(SyncModel.fileName({ id: 'z', title: '' }, '.x'), 'Untitled (z).x');
  eq([SyncModel.pushDelay('folder', 9e6), SyncModel.pushDelay('drive', 0), SyncModel.pushDelay('drive', 2e6), SyncModel.pushDelay('drive', 9e7)], [1500, 6000, 26000, 30000]);
});
