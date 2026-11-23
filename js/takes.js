'use strict';
/* ===================================================================
   Script supervisor — take log, circle takes, camera & sound reports
   =================================================================== */
const TAKE_STATUS = [['', '—'], ['circle', 'Circle (print)'], ['good', 'Good'], ['ng', 'NG'], ['alt', 'Alt / wild'], ['hold', 'Hold']];
const takeStatusLabel = k => (TAKE_STATUS.find(s => s[0] === k) || [0, k])[1];
const newTake = (shotId, n, o = {}) => Object.assign({ id: uid(), shotId, n, status: '', roll: '', sound: '', tc: '', len: '', notes: '' }, o);
const takesOfShot = (P, id) => (P.takes || []).filter(t => t.shotId === id).sort((a, b) => a.n - b.n);

Views.takes = function (root) {
  const P = Store.P; P.takes = P.takes || []; const scenes = getScenes(P);
  if (!scenes.length) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'No scenes yet'), h('p', {}, 'Write scenes and plan shots first — the take log is kept shot by shot.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/script` }, 'Go to Script')))); return; }
  if (!scenes.find(s => s.id === UI.takeScene)) UI.takeScene = scenes[0].id;
  if (UI.takeTab === 'lined') { root.parentElement.classList.add('noscroll'); mountLined(root, P); return () => root.parentElement.classList.remove('noscroll'); }
  root.parentElement.classList.add('noscroll');
  const left = h('div', { class: 'stage-side' }), main = h('div', { class: 'stage-main', style: { overflow: 'auto', alignItems: 'stretch' } });
  const sc = () => scenes.find(s => s.id === UI.takeScene);
  const lastRoll = () => { const t = [...P.takes].reverse().find(x => x.roll); return t ? t.roll : ''; }, lastSound = () => { const t = [...P.takes].reverse().find(x => x.sound); return t ? t.sound : ''; };
  root.append(h('div', { class: 'script-wrap' }, h('div', { class: 'toolbar' },
    h('span', { class: 'small muted' }, `${P.takes.length} take${P.takes.length === 1 ? '' : 's'} logged · ${P.takes.filter(t => t.status === 'circle').length} circled`), h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => { UI.takeTab = 'lined'; Router.refresh(); } }, icon('pen', 15), 'Lined script'),
    h('button', { class: 'btn', onclick: () => report('camera') }, icon('print', 15), TERM.camReport), h('button', { class: 'btn', onclick: () => report('sound') }, icon('print', 15), TERM.soundReport), h('button', { class: 'btn', onclick: () => report('continuity') }, icon('print', 15), 'Continuity log'),
    h('button', { class: 'btn', onclick: () => download(slug(P.title) + '-takes.csv', toCSV([['Scene', 'Shot', 'Take', 'Status', 'Camera roll', 'Sound roll', 'TC', 'Length', 'Notes'], ...P.takes.map(t => { const s = P.shots.find(x => x.id === t.shotId), scn = s && scenes.find(z => z.id === s.sceneId); return [scn ? scn.num : '', s ? shotLabel(P, s, scenes) : 'wild', t.n, takeStatusLabel(t.status), t.roll, t.sound, t.tc, t.len, t.notes]; })]), 'text/csv') }, icon('download', 15), 'CSV')),
    h('div', { class: 'stage-wrap' }, left, main)));

  function report(kind) {
    const rows = []; const label = t => { const s = P.shots.find(x => x.id === t.shotId), scn = s ? scenes.find(z => z.id === s.sceneId) : null; return { sc: scn ? scn.num : '', shot: s ? shotLabel(P, s, scenes) : 'wild' }; };
    if (!P.takes.length) return toast('No takes logged yet.', true);
    if (kind === 'continuity') {
      scenes.forEach(s => { const ts = P.takes.filter(t => { const x = P.shots.find(z => z.id === t.shotId); return x && x.sceneId === s.id; }); if (!ts.length) return; rows.push({ grp: `Scene ${s.num} — ${s.label}` });
        P.shots.filter(x => x.sceneId === s.id).forEach(x => takesOfShot(P, x.id).forEach(t => rows.push([shotLabel(P, x, scenes), t.n, takeStatusLabel(t.status), x.size, x.lens, x.desc, t.notes]))); });
      return printTable('Continuity log', ['Shot', 'Take', 'Status', 'Size', 'Lens', 'Description', 'Notes'], rows);
    }
    const key = kind === 'camera' ? 'roll' : 'sound', groups = new Map(); P.takes.forEach(t => { const k = t[key] || '(no roll)'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, ts]) => { rows.push({ grp: `${kind === 'camera' ? 'Camera roll / card' : 'Sound roll'} ${k} — ${ts.length} take${ts.length > 1 ? 's' : ''}, ${ts.filter(t => t.status === 'circle').length} circled` });
      ts.forEach(t => { const l = label(t); rows.push([l.sc, l.shot, t.n, takeStatusLabel(t.status), t.tc, t.len, kind === 'camera' ? t.sound : t.roll, t.notes]); }); });
    printTable(kind === 'camera' ? TERM.camReport : TERM.soundReport, ['Sc', 'Shot', 'Take', 'Status', 'TC', 'Length', kind === 'camera' ? 'Sound roll' : 'Camera roll', 'Notes'], rows);
  }
  function circle(t, shot) { if (t.status === 'circle' && shot && !shot.done) { shot.done = true; toast(`Shot ${shotLabel(P, shot, scenes)} marked as shot in the shot list`); } }
  function drawLeft() {
    left.innerHTML = ''; left.append(h('h3', { style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--muted)', marginBottom: '8px' } }, 'Scenes'));
    scenes.forEach(s => { const shots = P.shots.filter(x => x.sceneId === s.id), n = sum(shots, x => takesOfShot(P, x.id).length), c = shots.filter(x => takesOfShot(P, x.id).some(t => t.status === 'circle')).length;
      left.append(h('div', { class: 'frame-i' + (s.id === UI.takeScene ? ' on' : ''), style: { marginBottom: '6px', flexDirection: 'column', alignItems: 'stretch', gap: '2px' }, onclick: () => { UI.takeScene = s.id; draw(); } },
        h('b', {}, `${s.num}. ${s.label}`.slice(0, 40)), h('span', { class: 'small muted' }, shots.length ? `${c}/${shots.length} shots circled · ${n} takes` : 'No shots planned'))); });
  }
  function drawMain() {
    main.innerHTML = ''; const s = sc(), shots = P.shots.filter(x => x.sceneId === s.id);
    main.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h2', { style: { fontSize: '20px' } }, `Scene ${s.num} — ${s.label}`), h('span', { class: 'grow' }), h('a', { class: 'btn sm', href: `#/p/${P.id}/shots`, onclick: () => { UI.shotScene = s.id; } }, icon('camera', 14), 'Shot list')));
    if (!shots.length) { main.append(h('div', { class: 'empty' }, h('h3', {}, 'No shots in this scene'), h('p', {}, 'Takes are logged against planned shots. Add them in the Shot List, or use the Shot list → More → master shot button.'), h('a', { class: 'btn primary', href: `#/p/${P.id}/shots`, onclick: () => { UI.shotScene = s.id; } }, 'Open shot list'))); return; }
    shots.forEach(x => {
      const ts = takesOfShot(P, x.id), slate = shotLabel(P, x, scenes), circled = ts.some(t => t.status === 'circle');
      main.append(h('div', { class: 'card', style: { padding: '12px 14px', marginBottom: '12px', borderColor: circled ? 'var(--ok)' : 'var(--border)' } },
        h('div', { class: 'row', style: { marginBottom: '8px' } }, h('b', { style: { fontFamily: 'var(--head)', fontSize: '16px' } }, `Slate ${slate}`), h('span', { class: 'muted small clip', style: { flex: 1 } }, [x.size, x.lens, x.desc].filter(Boolean).join(' · ')), circled ? h('span', { class: 'pill', style: { background: 'var(--ok)', color: '#fff' } }, 'Circled') : null,
          h('button', { class: 'btn sm primary', onclick: () => { P.takes.push(newTake(x.id, (ts[ts.length - 1] ? ts[ts.length - 1].n : 0) + 1, { roll: ts.length ? ts[ts.length - 1].roll : lastRoll(), sound: ts.length ? ts[ts.length - 1].sound : lastSound() })); Store.touch(); draw(); } }, icon('plus', 13), 'Take')),
        ts.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Take', 'Status', 'Camera roll', 'Sound roll', 'TC in', 'Length', 'Notes — performance, continuity, problems', ''].map(c => h('th', {}, c)))),
          h('tbody', {}, ts.map(t => h('tr', { class: t.status === 'ng' ? 'done' : '' }, h('td', { style: { width: '60px' } }, h('input', { class: 'cell', type: 'number', min: 1, value: t.n, style: { fontWeight: 700 }, onchange: e => { t.n = +e.target.value || t.n; Store.touch(); } })),
            h('td', { style: { width: '140px' } }, h('select', { class: 'cell', onchange: e => { t.status = e.target.value; circle(t, x); Store.touch(); draw(); } }, TAKE_STATUS.map(([k, l]) => h('option', { value: k, selected: k === t.status }, l)))),
            ...['roll', 'sound', 'tc', 'len'].map((k, i) => h('td', { style: { width: ['110px', '110px', '100px', '80px'][i] } }, h('input', { class: 'cell', value: t[k], placeholder: ['A001', 'S01', '01:02:03', '0:45'][i], oninput: e => { t[k] = e.target.value; Store.touch(); } }))),
            h('td', {}, h('input', { class: 'cell', value: t.notes, placeholder: 'Great energy / line flub / plane overhead…', oninput: e => { t.notes = e.target.value; Store.touch(); } })),
            h('td', { style: { width: '40px' } }, ibtn('trash', 'Delete take', () => { P.takes = P.takes.filter(z => z !== t); Store.touch(); draw(); }, 'danger')))))) : h('div', { class: 'small muted' }, 'No takes yet — press “Take” on the clap.')));
    });
  }
  function draw() { drawLeft(); drawMain(); }
  draw();
  return () => root.parentElement.classList.remove('noscroll');
};
