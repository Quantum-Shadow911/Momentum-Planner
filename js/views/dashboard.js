/* Momentum — Dashboard view: today at a glance, recommended next task, deadlines */
(function (global) {
  'use strict';

  function render(host) {
    const state = Store.get();
    const st = Priority.stats(state);
    const now = new Date();
    const today = Utils.todayStr();
    const name = state.settings.userName ? ', ' + state.settings.userName : '';

    const reco = Priority.recommended(state);
    const todays = Priority.allOn(state, today);
    const overdue = Priority.overdueTasks(state);
    const upcoming = Priority.upcoming(state, 7).filter(t => t.dueDate !== today);
    const inProgress = state.tasks.filter(t => t.status === 'in-progress' && t.status !== 'completed');

    host.innerHTML = `
      <div class="dash-hero">
        <div>
          <h1>${Utils.greeting(now.getHours())}${H(name)} 👋</h1>
          <div class="date-line">${Utils.fmtDate(today, { long: true })} · ${st.open ? st.open + ' open task' + (st.open === 1 ? '' : 's') : 'all caught up!'}</div>
        </div>
        <div class="quick-add">
          <input class="input" id="dashQuickInput" placeholder="Quick add a task for today… (Enter)">
          <button class="btn btn-primary" id="dashQuickBtn">＋ Add</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat"><span class="stat-label">Due today</span><span class="stat-value tone-amber">${st.dueToday}</span><span class="stat-sub">${todays.filter(t => t.status === 'completed').length} done of ${todays.length} scheduled</span></div>
        <div class="stat"><span class="stat-label">Overdue</span><span class="stat-value ${st.overdue ? 'tone-red' : 'tone-green'}">${st.overdue}</span><span class="stat-sub">${st.overdue ? 'needs attention' : 'nothing overdue'}</span></div>
        <div class="stat"><span class="stat-label">Completed today</span><span class="stat-value tone-green">${st.completedToday}</span><span class="stat-sub">${st.completedWeek} this week</span></div>
        <div class="stat"><span class="stat-label">Overall progress</span><span class="stat-value tone-accent">${st.completionPct}%</span><span class="stat-sub">${st.completed} of ${st.total} tasks · ${Utils.fmtDuration(st.remainingMin)} left</span></div>
      </div>

      <div class="reco-card" style="margin-bottom:16px">
        <div class="reco-label">✨ Recommended next task</div>
        ${reco ? `
          <div class="spread row-wrap">
            <div class="grow">
              <div class="reco-title" id="recoTitle">${H(reco.task.title)}</div>
              <div class="reco-why">${H(reco.why)}</div>
            </div>
            <div class="row">
              ${UI.prioBadge(reco.task)}
              <button class="btn btn-sm btn-primary" id="recoDone">✓ Mark done</button>
            </div>
          </div>` : `
          <div class="reco-title">You're all caught up 🎉</div>
          <div class="reco-why">No unblocked tasks right now — add something new or enjoy the break.</div>`}
      </div>

      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-title"><span>📋 Today's schedule</span><button class="link-btn" data-go="daily">Open daily planner →</button></div>
          <div class="today-col" id="dashToday"></div>
        </div>
        <div class="stack">
          ${overdue.length ? `
          <div class="card" style="border-color:var(--red)">
            <div class="card-title"><span style="color:var(--red)">⚠ Overdue (${overdue.length})</span></div>
            <div class="today-col" id="dashOverdue"></div>
          </div>` : ''}
          ${inProgress.length ? `
          <div class="card">
            <div class="card-title"><span>◐ In progress</span></div>
            <div class="today-col" id="dashProgress"></div>
          </div>` : ''}
          <div class="card">
            <div class="card-title"><span>📅 Upcoming deadlines</span><button class="link-btn" data-go="agenda">Full agenda →</button></div>
            <div class="today-col" id="dashUpcoming"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span>🗓 Next several days</span><button class="link-btn" data-go="weekly">Weekly planner →</button></div>
        <div class="grid grid-4" id="dashNextDays"></div>
      </div>
    `;

    /* wire quick add */
    const qi = host.querySelector('#dashQuickInput');
    const doQuick = () => {
      const v = qi.value.trim();
      if (!v) { qi.focus(); return; }
      const saved = Store.saveTask({ title: v, dueDate: today, reminders: [state.settings.reminderDefault] });
      UI.toast('success', 'Task added', saved.title);
      qi.value = '';
      qi.focus();
    };
    host.querySelector('#dashQuickBtn').addEventListener('click', doQuick);
    qi.addEventListener('keydown', e => { if (e.key === 'Enter') doQuick(); });

    if (reco) {
      host.querySelector('#recoTitle').addEventListener('click', () => UI.openTaskViewer(reco.task.id));
      host.querySelector('#recoDone').addEventListener('click', () => {
        Store.toggleTask(reco.task.id);
        UI.toast('success', 'Nice work! ✅', `“${reco.task.title}” completed.`);
      });
    }

    const todayHost = host.querySelector('#dashToday');
    if (!todays.length) {
      todayHost.innerHTML = `<div class="empty"><span class="empty-icon">🌤️</span>Nothing scheduled for today.<br>Use quick add above to plan your day.</div>`;
    } else {
      todays.forEach(t => todayHost.appendChild(UI.taskItem(t)));
    }

    const odHost = host.querySelector('#dashOverdue');
    if (odHost) overdue.slice(0, 5).forEach(t => odHost.appendChild(UI.taskItem(t)));

    const prHost = host.querySelector('#dashProgress');
    if (prHost) inProgress.slice(0, 4).forEach(t => prHost.appendChild(UI.taskItem(t)));

    const upHost = host.querySelector('#dashUpcoming');
    if (!upcoming.length) {
      upHost.innerHTML = `<div class="empty"><span class="empty-icon">🎈</span>No deadlines in the next 7 days.</div>`;
    } else {
      upcoming.slice(0, 8).forEach(t => {
        const row = document.createElement('div');
        row.className = 'task-item';
        row.innerHTML = `
          <div class="task-main">
            <div class="task-title">${H(t.title)}</div>
            <div class="task-meta">${UI.dueBadge(t)} ${UI.catBadge(t)}</div>
          </div>`;
        row.querySelector('.task-main').addEventListener('click', () => UI.openTaskViewer(t.id));
        upHost.appendChild(row);
      });
    }

    /* next 5 days mini columns */
    const nextHost = host.querySelector('#dashNextDays');
    for (let i = 1; i <= 4; i++) {
      const d = Utils.addDays(today, i);
      const items = Priority.allOn(state, d);
      const col = document.createElement('div');
      col.className = 'week-col' + (i === 1 ? ' today-col-hl' : '');
      col.innerHTML = `
        <div class="week-col-head"><span class="dow">${Utils.DOW_SHORT[Utils.parseDate(d).getDay()]}</span><span class="dnum">${Utils.fmtDate(d).replace(', ' + Utils.parseDate(d).getFullYear(), '')}</span></div>
        <div class="week-col-body"></div>`;
      const body = col.querySelector('.week-col-body');
      if (!items.length) body.innerHTML = `<div class="muted small" style="text-align:center;padding:8px 0">—</div>`;
      items.slice(0, 4).forEach(t => {
        const mini = document.createElement('div');
        mini.className = 'mini-task' + (t.status === 'completed' ? ' done' : '');
        const cat = UI.catOf(t);
        mini.style.borderLeftColor = cat ? cat.color : 'var(--accent)';
        mini.innerHTML = `<div class="mt-title">${t.time ? H(Utils.fmtTime(t.time)) + ' · ' : ''}${H(t.title)}</div>`;
        mini.addEventListener('click', () => UI.openTaskViewer(t.id));
        body.appendChild(mini);
      });
      if (items.length > 4) {
        const more = document.createElement('div');
        more.className = 'muted small';
        more.style.padding = '2px 4px';
        more.textContent = `+${items.length - 4} more`;
        body.appendChild(more);
      }
      nextHost.appendChild(col);
    }

    host.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => App.go(b.dataset.go)));
  }

  global.Views = global.Views || {};
  global.Views.dashboard = { title: 'Dashboard', render };
})(typeof window !== 'undefined' ? window : globalThis);
