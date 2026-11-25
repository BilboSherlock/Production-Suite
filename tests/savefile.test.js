'use strict';
/* Save files (.studiobindahh) — model tests */
const sfBytes = (n, seed = 1) => { const u = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; u[i] = x >>> 24; } return u; };
const sfImg = (n, seed) => { const b = sfBytes(n, seed); let s = ''; for (const c of b) s += String.fromCharCode(c); return 'data:image/png;base64,' + btoa(s); };
const sfProject = () => {
  const a = sfImg(6000, 1), b = sfImg(4000, 2);
  return { id: 'p', title: 'Ünïcode — “quotes” 🎬', blocks: [{ id: 'x', text: 'line\nbreak\ttab' }], n: [0, -1.5, 1e21, null, true],
    boards: [{ frames: [{ src: a }, { src: a }, { src: b }] }],                     // the same image twice is stored once
    odd: ['\0sbx:0', '\0\0', '\0', 'data:image/png;base64,short', 'data:text/plain;base64,' + 'QUJD'.repeat(80) + '\n', 'data:image/png,notbase64'.padEnd(300, 'x')],
    empty: {}, list: [] };
};

test('savefile: lossless round trip, images stored once as bytes', async () => {
  const P = sfProject(), bytes = await SaveFile.write(P, { title: P.title }), r = await SaveFile.decode(bytes);
  eq([r.format, r.kind, r.title, r.complete, r.problems], ['sbx', 'project', P.title, true, []]);
  eq(JSON.stringify(r.data), JSON.stringify(P), 'every value comes back exactly, including look-alike markers and odd data URLs');
  assert(bytes.length < JSON.stringify(P).length * 0.6, `compact: ${bytes.length} bytes vs ${JSON.stringify(P).length} as JSON`);
  const big = await SaveFile.encode({ s: sfImg(6000, 3) }), one = await SaveFile.encode({ s: [sfImg(6000, 3), sfImg(6000, 3)] });
  assert(one.length - big.length < 100, 'a repeated image costs a few bytes, not a second copy');
});

test('savefile: a cut-off or damaged file is noticed, and what is whole comes back', async () => {
  const P = sfProject(), bytes = await SaveFile.write(P);
  const cut = await SaveFile.decode(bytes.subarray(0, bytes.length - 3000));
  eq([cut.complete, cut.lost.images, cut.data.title, cut.data.blocks[0].text, cut.data.boards[0].frames[0].src.length > 100, cut.data.boards[0].frames[2].src], [false, 1, P.title, 'line\nbreak\ttab', true, ''], 'only the image past the cut is blank');
  assert(/cut off/.test(cut.problems[0]), cut.problems[0]);
  const junk = new Uint8Array(bytes.length + 7); junk.set(bytes); junk.set([12, 0, 0, 0, 3, 0, 1], bytes.length);
  eq((await SaveFile.decode(junk)).complete, true, 'junk after a whole file loses nothing');
  const H = new DataView(bytes.buffer).getUint32(4, true);
  let err = ''; try { await SaveFile.decode(bytes.subarray(0, 8 + H + 10)); } catch (e) { err = e.message; } assert(/nothing in it could be read/.test(err), err);
  const plain = { id: 'q', title: 'No images', blocks: Array.from({ length: 400 }, (_, i) => ({ id: 'b' + i, text: 'Line ' + i + ' ' + 'word '.repeat(i % 9) })) };
  const pb = await SaveFile.write(plain), part = await SaveFile.decode(pb.subarray(0, Math.floor(pb.length * 0.6)));
  eq([part.complete, part.data.title, part.data.blocks.length > 20, part.data.blocks.length < 400, part.lost.after], [false, 'No images', true, true, 'blocks'], 'compressed data that is cut off is read as far as it goes');
  assert(JSON.stringify(part.data.blocks) === JSON.stringify(plain.blocks.slice(0, part.data.blocks.length)), 'and what comes back is exact');
  const bad = bytes.slice(); bad[8 + H + 20] ^= 0xff; err = ''; let br = null; try { br = await SaveFile.decode(bad); } catch (e) { err = e.message; } assert(/damaged/.test(err) || (br && !br.complete && /damaged/.test(br.problems[0])), err || 'damage is reported');
  const badImg = bytes.slice(); badImg[bytes.length - 100] ^= 0xff; const bi = await SaveFile.decode(badImg); eq([bi.complete, bi.lost.images], [false, 1], 'a damaged image is left blank, nothing else is lost');
  err = ''; try { await SaveFile.decode(bytes.subarray(0, 6)); } catch (e) { err = e.message; } assert(/cut off before/.test(err), err);
});

test('savefile: header checks and newer versions', async () => {
  const bytes = await SaveFile.encode({ id: 'p', blocks: [] }), H = new DataView(bytes.buffer).getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + H))); head.format = 9;
  const hb = new TextEncoder().encode(JSON.stringify(head)), rest = bytes.subarray(8 + H), out = new Uint8Array(8 + hb.length + rest.length);
  out.set(bytes.subarray(0, 4)); new DataView(out.buffer).setUint32(4, hb.length, true); out.set(hb, 8); out.set(rest, 8 + hb.length);
  let err = ''; try { await SaveFile.decode(out); } catch (e) { err = e.message; } assert(/newer version/.test(err), err);
  eq([SaveFile.crc32(new TextEncoder().encode('123456789')), SaveFile.isBackup('a.studiobindahh'), SaveFile.isBackup('a.studiobindahh.json'), SaveFile.isBackup('a.fdx')], [0xCBF43926, true, true, false]);
});

test('savefile: older .json backups, whole and cut off', async () => {
  const P = { id: 'o', title: 'Old', blocks: [{ id: 'a', text: 'x' }], shots: [{ id: 's1' }, { id: 's2' }], boards: [{ id: 'b', layers: [{ src: 'data:image/png;base64,AAAA' }] }] };
  const text = JSON.stringify(P), enc = s => new TextEncoder().encode(s);
  const whole = await SaveFile.decode(enc('﻿' + text)); eq([whole.format, whole.complete, whole.data], ['json', true, P]);
  const cut = await SaveFile.decode(enc(text.slice(0, text.indexOf('AAAA') + 2) + '\f\0\0\x03'));
  eq([cut.complete, cut.data.shots.length, cut.data.boards[0].id, cut.data.boards[0].layers, cut.lost.after], [false, 2, 'b', [], 'boards'], 'kept up to the last whole value, brackets closed');
  eq(SaveFile.salvage(text + 'garbage').data, P, 'junk after a whole object');
  eq(SaveFile.salvage('nothing'), null);
  let err = ''; try { await SaveFile.decode(enc('Hello, world')); } catch (e) { err = e.message; } eq(err, 'This is not a StudioBindahh backup.');
  const gz = await new Response(new Blob([enc(text)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  eq((await SaveFile.decode(gz)).data, P, 'a gzipped .json opens too');
});
