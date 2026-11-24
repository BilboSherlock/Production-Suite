'use strict';
/* ===================================================================
   Live production dashboard — VIEW. Runs a shoot day (film, TV, stage,
   AV) or a photo shoot, on the live desk frame (livedesk.js):

   • top: clock, schedule status, progress, shots, problems and the
     next deadline (meal, sunset, call-sheet wrap)
   • alerts that matter now, worst first
   • "now" and "next": what is shooting, with everything connected
     to it — shots to tick off, who is needed and whether they are
     here, props / wardrobe / effects from the breakdown, storyboard
     frames, and one tap to the script, shot list or take log
   • the running order on a time axis, forecasting the wrap
   • problems, check-in, tasks and the activity log, shared with
     every other suite, feeding the daily production report
   The plan, forecast and every action are in LiveModel / LiveVM
   (js/models/live.model.js, js/viewmodels/live.vm.js); this file draws.
   =================================================================== */

Views.live = function (root) {
  const P0 = Store.P;
  if (P0.mode === 'podcast' && typeof renderPodcastLive === 'function') return renderPodcastLive(root, P0);
  const vm = new LiveVM(), W = vm.W;
  if (!vm.hasDays) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, `No ${W.day}s yet`), h('p', {}, `The live dashboard runs a ${W.day} from your schedule. Create a day and schedule its ${W.items} first.`), h('a', { class: 'btn primary', href: `#/p/${P0.id}/schedule` }, 'Go to Schedule')))); return () => vm.dispose(); }
  const wrap = h('div', { class: 'live ld' + (UI.liveTV ? ' tv' : '') }); root.append(wrap);
  const ck = m => vm.clockTxt(m), dur = LiveModel.durTxt, word = () => vm.W.item.toLowerCase();

  /* the shared panels talk to the view model through cx */
  const cx = { key: 'film', itemWord: W.item, issueCats: LiveModel.ISSUE_CATS, redraw: () => vm.refresh(), flash: () => vm.refresh(), edit: fn => vm.edit(fn), toReport: () => vm.logToReport() };

  /* ---------- actions that ask first ---------- */
  async function wrapDay() {
    const n = vm.openIds.length, W = vm.W;
    if (n && !(await confirmBox(`${n} ${n > 1 ? W.items + ' are' : W.item.toLowerCase() + ' is'} not finished. Wrap the day anyway? Unfinished ${W.items} are marked Not shot.`, 'Wrap day', 'Wrap the day?'))) return;
    vm.wrapDay();
  }
  async function dropScene(id) {
    const s = vm.sceneOf(id), why = await promptBox(`Drop ${word()} ${s.num}`, `Reason (optional) — the ${word()} is marked Not shot`, ''); if (why === null) return;
    vm.dropScene(id, why);
  }
  function deferScene(id) {
    const s = vm.sceneOf(id), o = vm.deferOptions(id), next = o.next;
    const sel = h('select', { class: 'inp' }, h('option', { value: 'next', disabled: !next }, next ? `Day ${next.n}${next.date ? ' (' + fmtDateShort(next.date) + ')' : ''}` : 'No next day'), h('option', { value: 'new' }, 'A new shoot day'), h('option', { value: 'drop' }, 'Unschedule (back to the unscheduled pile)'));
    if (!next) sel.value = 'new';
    modal({ title: `Move ${word()} ${s.num} to another day`, body: h('div', {}, h('p', { style: { marginTop: 0 } }, `“${s.label}” will be removed from today’s plan.`), sel), buttons: [{ label: 'Cancel' }, { label: `Move ${word()}`, primary: true, onClick: () => {
      if (!vm.deferScene(id, sel.value)) { toast(`Day ${next.n} already has another part of this ${word()}. Move it to a new day, or merge the parts on the Schedule.`, true); return false; }
    } }] });
  }
  function addDelay(id) {
    const s = vm.sceneOf(id), min = h('input', { class: 'inp', type: 'number', min: 1, value: 15, style: { width: '90px' } }), why = h('select', { class: 'inp' }, LiveModel.DELAY_REASONS.map(r => h('option', {}, r))), note = h('input', { class: 'inp', placeholder: 'Details (optional)' });
    modal({ title: `Delay — ${word()} ${s.num}`, body: h('div', { class: 'fx-grid' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Minutes lost'), min), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Reason'), why), h('div', { class: 'field', style: { gridColumn: '1 / -1' } }, h('label', { class: 'lbl' }, 'Notes'), note)),
      buttons: [{ label: 'Cancel' }, { label: 'Log delay', primary: true, onClick: () => { vm.addDelay(id, min.value, why.value, note.value); } }] });
  }
  function editTimes(r) {
    const t = vm.timesOf(r.id), a = h('input', { class: 'inp', type: 'time', value: t.start }), b = h('input', { class: 'inp', type: 'time', value: t.end });
    modal({ title: `Actual times — ${word()} ${r.scene.num}`, body: h('div', { class: 'fx-grid' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Started'), a), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Finished'), b)),
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { vm.setTimes(r.id, a.value, b.value); } }] });
  }
  const runAlert = a => a.cmd === 'lunchOut' ? vm.lunchOut() : a.cmd === 'defer' ? deferScene(a.id) : null;
  function sceneMenu(e, r) {
    const m = vm.menuFor(r), items = [];
    if (m.start) items.push({ label: 'Start now', icon: 'play', onClick: () => vm.startScene(r.id) });
    if (m.complete) items.push({ label: 'Complete', icon: 'check', onClick: () => vm.completeScene(r.id) });
    if (m.delay) items.push({ label: 'Log a delay…', icon: 'clock', onClick: () => addDelay(r.id) });
    if (m.reorder) items.push({ label: 'Move earlier', icon: 'up', onClick: () => vm.moveScene(r.id, -1) }, { label: 'Move later', icon: 'down', onClick: () => vm.moveScene(r.id, 1) });
    if (m.defer) items.push({ label: 'Move to another day…', icon: 'right', onClick: () => deferScene(r.id) }, { label: `Drop ${word()}…`, icon: 'trash', onClick: () => dropScene(r.id) });
    if (m.editTimes) items.push({ sep: true }, { label: 'Edit times…', icon: 'edit', onClick: () => editTimes(r) }, { label: 'Reset to pending', icon: 'rotate', onClick: () => vm.reopenScene(r.id) });
    items.push({ sep: true }, ...links(r.scene).map(([label, ico, go]) => ({ label, icon: ico, onClick: go })));
    menu(e.currentTarget, items);
  }

  /* ---------- everything connected to a scene / setup ---------- */
  const go = (view, sceneId) => () => { UI.scene = sceneId; UI.shotScene = sceneId; location.hash = `#/p/${vm.P.id}/${view}`; };
  const links = s => vm.links().map(([l, i, v]) => [l, i, go(v, s.id)]);
  function contextOf(s, full) {
    const P = vm.P, c = vm.context(s), blocks = [];
    if (c.shots.length) blocks.push(['Shots', `${c.shotsDone}/${c.shots.length}`, P.mode === 'photo'
      ? c.shots.map(x => h('button', { class: 'chip shot' + (x.on ? ' on' : ''), style: { '--c': SHOT_TONE[x.status] || '' }, title: `${x.title} — ${x.status}. Tap: mark shot / back to planned`, onclick: () => vm.toggleShot(x.id) }, x.hero ? '★ ' : '', x.label, x.title ? ' · ' + x.title.slice(0, 18) : ''))
      : c.shots.map(x => h('button', { class: 'chip shot' + (x.on ? ' on' : ''), title: `${x.desc}${x.takes ? ` — ${x.takes} takes, ${x.circled} circled` : ''}. Tap to tick off`, onclick: () => vm.toggleShot(x.id) }, x.on ? '✓ ' : '', x.label, x.size ? ' ' + x.size : '', x.takes ? h('span', { class: 'chip-n' }, x.circled ? `${x.circled}◉` : x.takes) : null))]);
    if (c.cast.length) blocks.push([vm.W.cast, `${c.cast.filter(x => x.here).length}/${c.cast.length} here`, c.cast.map(({ ch, p, status }) => h('button', { class: 'chip who st-' + status.replace(/\s/g, ''), title: p ? `${p.name} as ${ch} — ${status}. Tap to update` : `${ch} — nobody cast yet`,
      onclick: e => p && menu(e.currentTarget, LiveModel.CHECK_STAGES.map(x => ({ label: x, icon: x === status ? 'check' : null, onClick: () => vm.checkIn(p.id, x) }))) }, h('i', { class: 'dot' }), p && p.name ? p.name.split(' ')[0] : ch, p && p.name && P.mode !== 'photo' ? h('span', { class: 'chip-sub' }, ch) : null))]);
    if (c.needs.length) blocks.push(['Needs', String(c.needs.length), c.needs.map(t => h('span', { class: 'chip need', style: { '--c': t.color }, title: t.label }, t.text))]);
    if (c.frames.length && full) blocks.push(['Boards', String(c.frames.length), [h('div', { class: 'ld-thumbs' }, c.frames.slice(0, 5).map(b => h('img', { src: b.img, alt: b.caption || 'frame', title: b.caption || '', loading: 'lazy', onclick: go('board', s.id) })), c.frames.length > 5 ? h('span', { class: 'chip' }, `+${c.frames.length - 5}`) : null)]]);
    return h('div', { class: 'ld-ctx' }, blocks.map(([label, n, kids]) => h('div', { class: 'ld-ctx-row' }, h('span', { class: 'ld-ctx-l' }, label, h('em', {}, n)), h('div', { class: 'ld-chips' }, kids))),
      full && c.notes ? h('div', { class: 'ld-ctx-row' }, h('span', { class: 'ld-ctx-l' }, 'Notes'), h('div', { class: 'ld-note' }, c.notes)) : null,
      full ? h('div', { class: 'ld-links' }, links(s).map(([l, i, fn]) => h('button', { class: 'btn sm ghost', onclick: fn }, icon(i, 13), l))) : null);
  }

  /* ---------- the picture ---------- */
  function draw() {
    const P = vm.P, d = vm.day, W = vm.W, b = vm.board, now = vm.now, plan = b.plan, fc = b.fc, photo = b.photo, { started, ended, active, pending } = b, itemTag = s => `${W.item === 'Scene' ? 'Sc' : W.item} ${s.num}`;

    /* header */
    const header = h('div', { class: 'ld-head' },
      ldClock(ck(now), b.running),
      ldTile('Schedule', b.status[0], started ? `Wrap ~${ck(fc.wrap)} · plan ${ck(plan.end)}` : `Planned wrap ${ck(plan.end)}`, b.status[1]),
      ldTile(W.Items, `${b.doneN}/${b.totalN}`, photo ? (b.dropN ? `${b.dropN} dropped` : `${pending.length} to go`) : `${fmtEighths(b.pgDone)} of ${fmtEighths(b.pgAll)} pp${b.dropN ? ` · ${b.dropN} dropped` : ''}`, '', ldProgress(b.totalN ? b.doneN / b.totalN * 100 : 0, 'good')),
      ldTile('Shots', b.shotsAll ? `${b.shotsDone}/${b.shotsAll}` : '—', b.shotsAll ? (photo ? 'shot / planned' : 'done / planned') : 'none planned', '', b.shotsAll ? ldProgress(b.shotsDone / b.shotsAll * 100) : null),
      ldTile('Problems', String(b.openIssues), b.crit ? `${b.crit} critical` : b.openIssues ? 'open' : 'all clear', b.crit ? 'bad' : b.openIssues ? 'warn' : ''),
      b.nextMark ? ldTile(b.nextMark.label, `in ${dur(b.nextMark.at - now)}`, `at ${ck(b.nextMark.at)}`, b.nextMark.tone) : null,
      h('div', { class: 'ld-actions' },
        h('select', { class: 'inp ld-daysel', 'aria-label': 'Shoot day', onchange: e => vm.selectDay(e.target.value) }, vm.dayOptions.map(o => h('option', { value: o.id, selected: o.selected }, o.label))),
        !started ? h('button', { class: 'btn primary', onclick: () => vm.startDay() }, icon('play', 15), 'Start day') : !ended ? h('button', { class: 'btn', onclick: wrapDay }, icon('check', 15), 'Wrap day') : h('button', { class: 'btn', onclick: () => vm.reopenDay() }, 'Reopen day'),
        h('button', { class: 'btn', onclick: () => ldIssueModal(cx) }, icon('alert', 15), 'Problem'),
        h('button', { class: 'icon-btn', title: 'Big-display mode (full screen)', 'aria-label': 'Big-display mode', onclick: () => ldTV(wrap) }, icon('focus', 17))));
    const alerts = b.alerts.map(([tone, msg, a]) => [tone, msg, a ? { label: a.label, fn: () => runAlert(a) } : null]);

    /* now & next */
    function nowCard(r, title) {
      if (!r) return h('div', { class: 'ld-card empty' }, h('span', { class: 'ld-l' }, title), h('p', { class: 'muted' }, started ? (pending.length ? `Nothing shooting — start the next ${W.item.toLowerCase()} when ready.` : `All ${W.items} done.`) : 'Start the day to begin.'), !started ? h('button', { class: 'btn primary', onclick: () => vm.startDay() }, icon('play', 15), 'Start day') : null);
      const s = r.scene, est = r.dur + r.extra, el = r.state === 'active' ? now - r.fs : 0, sh = ScheduleModel.share(P, d, s);
      return h('div', { class: 'ld-card s-' + r.state + (r.over ? ' over' : ''), 'data-key': 'now-' + r.id },
        h('div', { class: 'ld-card-h' }, h('span', { class: 'ld-l' }, title), h('span', { class: 'grow' }), h('button', { class: 'icon-btn', title: 'More actions', 'aria-label': 'More actions', onclick: e => sceneMenu(e, r) }, icon('more', 16))),
        h('div', { class: 'ld-title' }, h('b', {}, itemTag(s)), ' ', s.label),
        h('div', { class: 'ld-meta' }, [locName(P, s), !photo && s.eighths ? `${fmtEighths(sh.eighths)} pp${sh.label ? ' · ' + sh.label : ''}` : '', s.tod].filter(Boolean).join(' · ')),
        s.synopsis ? h('div', { class: 'ld-syn clip2' }, s.synopsis) : null,
        h('div', { class: 'ld-times' }, h('span', {}, `Started ${ck(r.fs)}`), h('b', { class: r.over ? 'neg' : '' }, `${dur(el)} of ${dur(est)}`), h('span', {}, r.over ? `${dur(el - est)} over` : `ends ~${ck(r.fe)}`)),
        ldProgress(el / est * 100, r.over ? 'bad' : 'info'),
        h('div', { class: 'ld-btns' }, h('button', { class: 'btn primary big', onclick: () => vm.completeScene(r.id) }, icon('check', 16), 'Complete'), h('button', { class: 'btn big', onclick: () => addDelay(r.id) }, icon('clock', 15), 'Delay')),
        contextOf(s, true));
    }
    function nextCard(r) {
      if (!r) return h('div', { class: 'ld-card empty' }, h('span', { class: 'ld-l' }, 'Up next'), h('p', { class: 'muted' }, `No more ${W.items} today.`));
      const s = r.scene, later = pending.filter(x => x !== r);
      return h('div', { class: 'ld-card s-next' + (r.late ? ' late' : ''), 'data-key': 'next-' + r.id },
        h('div', { class: 'ld-card-h' }, h('span', { class: 'ld-l' }, 'Up next'), h('span', { class: 'grow' }), h('button', { class: 'icon-btn', title: 'More actions', 'aria-label': 'More actions', onclick: e => sceneMenu(e, r) }, icon('more', 16))),
        h('div', { class: 'ld-title' }, h('b', {}, itemTag(s)), ' ', s.label),
        h('div', { class: 'ld-meta' }, [locName(P, s), `forecast ${ck(r.fs)}${r.late ? ` (planned ${ck(r.start)})` : ''}`, dur(r.dur + r.extra)].filter(Boolean).join(' · ')),
        h('div', { class: 'ld-btns' }, h('button', { class: 'btn primary big', onclick: () => vm.startScene(r.id) }, icon('play', 15), active.length ? 'Start (2nd unit)' : 'Start'), h('button', { class: 'btn', onclick: () => deferScene(r.id) }, 'Another day')),
        contextOf(s, !active.length),
        later.length ? h('div', { class: 'ld-later' }, h('span', { class: 'ld-ctx-l' }, 'Then'), later.slice(0, 6).map(x => h('button', { class: 'chip', title: `${x.scene.label} · forecast ${ck(x.fs)}`, onclick: e => sceneMenu(e, x) }, h('b', {}, x.scene.num), ' ', ck(x.fs))), later.length > 6 ? h('span', { class: 'chip' }, `+${later.length - 6}`) : null) : null);
    }
    const nowRow = h('div', { class: 'ld-now-row' + (active.length ? '' : ' idle') }, active.length ? active.map((r, i) => nowCard(r, active.length > 1 ? (i ? 'Shooting — 2nd unit' : 'Shooting — main unit') : 'Shooting now')) : nowCard(null, 'Shooting now'), nextCard(pending[0]));

    /* running order */
    const mealBtn = b.lunch === null ? null : b.lunch === 'out' ? h('button', { class: 'btn sm', onclick: () => vm.lunchOut() }, 'Lunch out') : b.lunch === 'in' ? h('button', { class: 'btn sm primary', onclick: () => vm.lunchIn() }, 'Lunch in') : h('span', { class: 'pill' }, `Lunch ${b.lunch}`);
    const tl = b.timeline;
    const orderPanel = ldPanel('film:order', { title: 'Running order', ico: 'calendar', count: `${b.doneN}/${b.totalN}`, hint: started ? `wrap ~${ck(fc.wrap)}` : '',
      tools: [mealBtn, photo && vm.has('runofshow') ? h('a', { class: 'btn sm ghost', href: `#/p/${P.id}/runofshow` }, plan.fromRun ? 'Edit run of show' : 'Build run of show') : null, h('span', { class: 'ld-legend' }, h('i', { class: 'lg-plan' }), 'planned', h('i', { class: 'lg-bar' }), 'forecast')],
      body: () => ldTimeline(tl.rows, { from: tl.from, to: tl.to, now, showNow: started && !ended, onRow: (e, r) => sceneMenu(e, r), marks: [{ at: b.sun, label: 'sunset', cls: 'sun' }, { at: b.limitWrap, label: 'wrap', cls: 'wrap' }] }) }, draw);

    /* shared panels */
    Object.assign(cx, { P, L: vm.L, date: vm.date, items: vm.issueItems, groups: vm.groups, taskFilter: vm.taskFilter() });
    morph(wrap, [header, ldAlerts(alerts, draw), h('div', { class: 'ld-grid' },
      h('div', { class: 'ld-main' }, nowRow, orderPanel),
      h('div', { class: 'ld-side' }, ldProblems(cx), ldCheckin(cx), ldTasks(cx), ldActivity(cx)))].filter(Boolean));
  }
  const unbind = bindView(vm, draw);
  const unTick = ldTicker(wrap, { redraw: () => vm.refresh(), tick: () => { const e = document.getElementById('ldClockSub'), t = vm.runningText(Date.now()); if (e && t) e.textContent = t; } });
  return () => { unTick(); unbind(); };
};
