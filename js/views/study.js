/* Momentum — Study Timer & Essentials: a dedicated focus page with the study
   timer, today's planned sessions, a get-ready checklist and study stats */
(function (global) {
  'use strict';

  /* Live clock subscription — wired once, updates only when the page is open */
  let tickWired = false;
  function wireTick() {
    if (tickWired) return;
    tickWired = true;
    Timer.onTick(st => {
      const el = document.getElementById('studyClock');
      if (!el) return;
      el.textContent = clockText(st.elapsedSec);
      const btn = document.getElementById('studyToggle');
      if (btn && st.active) btn.textContent = st.running ? '⏸ Pause' : '▶️ Resume';
    });
  }

  function clockText(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  const ESSENTIALS = [
    { id: 'plan', icon: '🎯', label: 'I know what I\u2019m working on (picked my top task)' },
    { id: 'phone', icon: '📵', label: 'Phone away or on silent' },
    { id: 'water', icon: '💧', label: 'Water or drink within reach' },
    { id: 'materials', icon: '📚', label: 'Books, worksheets & materials out' },
    { id: 'spot', icon: '🪑', label: 'Quiet spot, chair & desk ready' },
    { id: 'snack', icon: '🍎', label: 'Light snack if I\u2019m hungry' }
  ];

  const TIPS = [
    ['⏱️', 'Start with 15–25 minutes. Starting is the hard part — momentum does the rest.'],
    ['🎯', 'One task at a time. Multitasking makes everything slower.'],
    ['📝', 'Harder before easier: tackle the subject you like least while you\u2019re freshest.'],
    ['🧠', 'Test yourself instead of re-reading. Closing the book and recalling is what sticks.'],
    ['☕', 'Take a real 5-minute break between sessions — move around, look away from screens.'],
    ['🌙', 'Don\u2019t plan late-night marathons. Sleep is when your brain saves what you studied.']
  ];

  function parseTrackedMin(text) {
    const m = /^Tracked (.+?) on /.exec(text || '');
    if (!m) return 0;
    let mins = 0;
    const h = /(\d+)h/.exec(m[1]);
    const mm = /(\d+)m/.exec(m[1]);
    if (h) mins += Number(h[1]) * 60;
    if (mm) mins += Number(mm[1]);
    return mins;
  }

  function trackedMinutesSince(state, sinceStr) {
    return state.activity
      .filter(a => a.type === 'progress' && String(a.ts).slice(0, 10) >= sinceStr)
      .reduce((sum, a) => sum + parseTrackedMin(a.text), 0);
  }

  function sessionRow(entry) {
    const { session: ses, task } = entry;
    const cls = Store.get().classes.find(c => c.id === task.classId);
    const row = document.createElement('div');
    row.className = 'task-item';
    if (ses.done) row.style.opacity = '.55';
    row.innerHTML = `
      <div style="font-size:20px">${cls ? H(cls.icon) : '⏱️'}</div>
      <div class="task-main">
        <div class="task-title" style="${ses.done ? 'text-decoration:line-through' : ''}">${H(task.title)}</div>
        <div class="task-meta">
          <span class="meta-txt">⏱ ${H(Utils.fmtDuration(ses.durationMin || 30))}</span>
          ${ses.time ? `<span class="meta-txt">🕐 ${H(Utils.fmtTime(ses.time))}</span>` : ''}
          ${ses.objective ? `<span class="meta-txt">🎯 ${H(ses.objective)}</span>` : ''}
          ${cls ? `<span class="meta-txt">${H(cls.name)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-done title="${ses.done ? 'Mark not done' : 'Mark done'}">${ses.done ? '↩️' : '✅'}</button>
        ${ses.done ? '' : '<button class="btn btn-sm btn-primary" data-start>▶ Study this</button>'}
      </div>`;
    row.querySelector('[data-done]').addEventListener('click', () => Store.toggleSession(task.id, ses.id));
    const startBtn = row.querySelector('[data-start]');
    if (startBtn) startBtn.addEventListener('click', () => startFor(task.id));
    return row;
  }

  function startFor(taskId) {
    const st = Timer.start(taskId);
    if (!st) { UI.toast('warning', 'Cannot start', 'That task no longer exists.'); return; }
    UI.toast('info', 'Timer started ⏱', st.title);
    render(document.getElementById('viewHost'));
  }

  function render(host) {
    wireTick();
    const state = Store.get();
    const today = Utils.todayStr();
    const st = Timer.status();
    const openTasks = state.tasks
      .filter(t => t.status !== 'completed')
      .sort((a, b) => Priority.score(b) - Priority.score(a));
    const sessionsToday = Priority.sessionsOn(state, today);
    const doneToday = sessionsToday.filter(e => e.session.done).length;

    const trackedToday = trackedMinutesSince(state, today);
    const weekStart = Utils.addDays(today, -6);
    const trackedWeek = trackedMinutesSince(state, weekStart);
    const totalMin = state.tasks.reduce((sum, t) => sum + (t.actualMin || 0), 0);

    const ess = state.settings.studyEssentials || {};
    const readyCount = ESSENTIALS.filter(e => ess[e.id]).length;

    const taskOptions = openTasks.map(t => {
      const cls = state.classes.find(c => c.id === t.classId);
      return `<option value="${H(t.id)}" ${st.taskId === t.id ? 'selected' : ''}>${cls ? H(cls.icon + ' ' + cls.name + ' — ') : ''}${H(t.title)}</option>`;
    }).join('');

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Study Timer & Essentials</h2><div class="sub">Focus on one thing at a time — every finished timer logs real time to that task.</div></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title"><span>⏱️ Study timer</span></div>
          ${openTasks.length ? `
            <div class="field">
              <label>What are you working on?</label>
              <select class="select" id="studyTask">${taskOptions}</select>
            </div>
            <div id="studyClock" style="font-size:56px;font-weight:700;text-align:center;letter-spacing:2px;margin:14px 0;font-variant-numeric:tabular-nums">${clockText(st.active ? st.elapsedSec : 0)}</div>
            <div class="row-wrap" style="justify-content:center">
              ${st.active
                ? `<button class="btn btn-primary" id="studyToggle">${st.running ? '⏸ Pause' : '▶️ Resume'}</button>
                   <button class="btn" id="studyFinish">✅ Finish & log time</button>
                   <button class="btn btn-ghost" id="studyCancel">✕ Discard</button>`
                : `<button class="btn btn-primary" id="studyToggle" style="min-width:160px">▶️ Start studying</button>`}
            </div>
            <p class="muted small" style="margin-bottom:0;text-align:center">Finished time is added to the task\u2019s \u201ctime spent\u201d automatically.</p>
          ` : '<div class="empty"><span class="empty-icon">🎉</span>No open tasks — add one and the timer is ready for it.</div>'}
        </div>

        <div class="card">
          <div class="card-title"><span>📊 Study stats</span></div>
          <div class="grid grid-2" style="gap:10px">
            <div class="stat"><span class="stat-label">studied today</span><span class="stat-value tone-accent">${trackedToday ? Utils.fmtDuration(trackedToday) : '—'}</span></div>
            <div class="stat"><span class="stat-label">last 7 days</span><span class="stat-value tone-accent">${trackedWeek ? Utils.fmtDuration(trackedWeek) : '—'}</span></div>
            <div class="stat"><span class="stat-label">all time on tasks</span><span class="stat-value tone-accent">${totalMin ? Utils.fmtDuration(totalMin) : '—'}</span></div>
            <div class="stat"><span class="stat-label">sessions done today</span><span class="stat-value tone-accent">${doneToday}/${sessionsToday.length}</span></div>
          </div>
          <div class="meter-row" style="margin-top:14px">
            <span class="bar"><span class="bar-fill bar-green" style="width:${sessionsToday.length ? Math.round(doneToday / sessionsToday.length * 100) : 0}%"></span></span>
            <span class="small muted">${sessionsToday.length ? Math.round(doneToday / sessionsToday.length * 100) + '% of today\u2019s sessions' : 'No sessions planned today'}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><span>🗓️ Today\u2019s planned study sessions</span></div>
          <div id="studySessions"></div>
        </div>

        <div class="card">
          <div class="card-title"><span>✅ Study essentials — get ready</span>
            <span class="small muted">${readyCount}/${ESSENTIALS.length} ready</span></div>
          <div id="essList"></div>
          <div class="row-wrap" style="margin-top:10px">
            <button class="btn btn-sm btn-ghost" id="essReset">↩️ Reset checklist</button>
          </div>
        </div>

        <div class="card" style="grid-column:1/-1">
          <div class="card-title"><span>🧠 Study tips that actually work</span></div>
          <div class="grid grid-3" style="gap:10px">
            ${TIPS.map(([icon, tip]) => `<div class="review-sect"><div style="font-size:20px;margin-bottom:6px">${icon}</div><span class="small">${H(tip)}</span></div>`).join('')}
          </div>
        </div>
      </div>
    `;

    /* timer controls */
    const taskSel = host.querySelector('#studyTask');
    const toggleBtn = host.querySelector('#studyToggle');
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      if (!st.active) {
        const id = taskSel && taskSel.value;
        if (!id) { UI.toast('warning', 'Pick a task first', 'Choose what you\u2019re working on.'); return; }
        startFor(id);
      } else {
        Timer.toggle();
      }
    });
    const finishBtn = host.querySelector('#studyFinish');
    if (finishBtn) finishBtn.addEventListener('click', () => {
      const res = Timer.finish();
      if (res && res.committed) UI.toast('success', 'Time logged ⏱', `${Utils.fmtDuration(res.minutes)} added to \u201C${res.title}\u201D.`);
      else if (res) UI.toast('info', 'Timer finished', 'The task no longer exists — time was discarded.');
      render(host);
    });
    const cancelBtn = host.querySelector('#studyCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { Timer.cancel(); render(host); });

    /* today's sessions */
    const sesHost = host.querySelector('#studySessions');
    if (!sessionsToday.length) {
      sesHost.innerHTML = '<div class="empty"><span class="empty-icon">🗓️</span>Nothing planned for today. Plan sessions from a task\u2019s editor (\u201cPlan a session\u201d) or use the timer above.</div>';
    } else {
      sessionsToday.forEach(e => sesHost.appendChild(sessionRow(e)));
    }

    /* essentials checklist */
    const essHost = host.querySelector('#essList');
    ESSENTIALS.forEach(item => {
      const row = document.createElement('label');
      row.className = 'check-row';
      row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;cursor:pointer;background:var(--surface-2)';
      row.innerHTML = `<input type="checkbox" ${ess[item.id] ? 'checked' : ''}> <span>${item.icon}</span> <span style="${ess[item.id] ? 'text-decoration:line-through;opacity:.6' : ''}">${H(item.label)}</span>`;
      row.querySelector('input').addEventListener('change', e => {
        const next = { ...(Store.get().settings.studyEssentials || {}), [item.id]: e.target.checked };
        Store.updateSettings({ studyEssentials: next });
      });
      essHost.appendChild(row);
    });
    host.querySelector('#essReset').addEventListener('click', () => {
      Store.updateSettings({ studyEssentials: {} });
      render(host);
    });
  }

  global.Views.study = { title: 'Study Timer & Essentials', render };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Views.study;
})(typeof window !== 'undefined' ? window : globalThis);
