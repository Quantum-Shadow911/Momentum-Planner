/* Momentum — Dashboard: school-first overview of everything that needs attention */
(function (global) {
  'use strict';

  function render(host) {
    const state = Store.get();
    const now = new Date();
    const today = Utils.todayStr();
    const st = Priority.stats(state);
    const sch = Priority.schoolStats(state);
    const name = state.settings.userName ? ', ' + state.settings.userName : '';

    const reco = Priority.recommended(state);
    const todays = Priority.allOn(state, today);
    const overdue = Priority.overdueTasks(state);
    const dueSoon = Priority.upcoming(state, 7).filter(t => t.dueDate !== today);
    const assessments = Priority.upcomingAssessments(state, 14);
    const sessionsToday = Priority.sessionsOn(state, today);
    const eventsWeek = Priority.upcomingEvents(state, 7);
    const recentlyDone = state.tasks.filter(t => t.status === 'completed' && t.completedAt)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 5);

    host.innerHTML = `
      <div class="dash-hero">
        <div>
          <h1>${Utils.greeting(now.getHours())}${H(name)} 👋</h1>
          <div class="date-line">${Utils.fmtDate(today, { long: true })} · Your school planning overview</div>
        </div>
        <div class="quick-add">
          <input class="input" id="dashQuickTitle" placeholder="Quick add… (Enter) · clear the date to unschedule">
          <input class="input" id="dashQuickDate" type="date" value="${today}" style="flex:0 0 140px" title="Due date — clear for no date">
          <button class="btn btn-primary" id="dashQuickBtn">＋ Add</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat"><span class="stat-label">Due today</span><span class="stat-value tone-amber">${st.dueToday}</span><span class="stat-sub">${todays.filter(t => t.status === 'completed').length} done of ${todays.length} scheduled</span></div>
        <div class="stat"><span class="stat-label">Assignments due soon</span><span class="stat-value tone-accent">${sch.dueSoon}</span><span class="stat-sub">next 7 days</span></div>
        <div class="stat"><span class="stat-label">Upcoming assessments</span><span class="stat-value ${assessments.length ? 'tone-red' : 'tone-green'}">${sch.assessments}</span><span class="stat-sub">tests & quizzes · 14 days</span></div>
        <div class="stat"><span class="stat-label">Overdue</span><span class="stat-value ${st.overdue ? 'tone-red' : 'tone-green'}">${st.overdue}</span><span class="stat-sub">${st.overdue ? 'needs attention' : 'nothing overdue'}</span></div>
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
        <div class="stack">
          <div class="card">
            <div class="card-title"><span>📋 Today's priorities</span><button class="link-btn" data-go="daily">Daily planner →</button></div>
            <div class="today-col" id="dashToday"></div>
          </div>
          ${overdue.length ? `
          <div class="card" style="border-color:var(--red)">
            <div class="card-title"><span style="color:var(--red)">⚠ Overdue (${overdue.length})</span></div>
            <div class="today-col" id="dashOverdue"></div>
          </div>` : ''}
          <div class="card">
            <div class="card-title"><span>🧠 Today's planned study sessions (${sch.sessionsTodayDone}/${sessionsToday.length} done)</span></div>
            <div id="dashSessions"></div>
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-title"><span>📅 Upcoming deadlines</span><button class="link-btn" data-go="agenda">Full agenda →</button></div>
            <div class="today-col" id="dashUpcoming"></div>
          </div>
          ${assessments.length ? `
          <div class="card">
            <div class="card-title"><span>📄 Tests & quizzes ahead</span><button class="link-btn" data-go="classes">My classes →</button></div>
            <div class="today-col" id="dashTests"></div>
          </div>` : ''}
          <div class="card">
            <div class="card-title"><span>⭐ Extracurricular schedule</span><button class="link-btn" data-go="activities">All events →</button></div>
            <div class="today-col" id="dashEvents"></div>
          </div>
          ${recentlyDone.length ? `
          <div class="card">
            <div class="card-title"><span>✅ Recently completed</span></div>
            <div class="today-col" id="dashDone"></div>
          </div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span>🗓 Next several days</span><button class="link-btn" data-go="weekly">Weekly planner →</button></div>
        <div class="grid grid-4" id="dashNextDays"></div>
      </div>
    `;

    /* quick add with clearable date */
    const qi = host.querySelector('#dashQuickTitle');
    const qd = host.querySelector('#dashQuickDate');
    const doQuick = () => {
      const v = qi.value.trim();
      if (!v) { qi.focus(); return; }
      const saved = Store.saveTask({ title: v, dueDate: qd.value || null, reminders: [state.settings.reminderDefault] });
      UI.toast('success', 'Task added', saved.title + (saved.dueDate ? ` · due ${Utils.fmtDateSmart(saved.dueDate)}` : ' · unscheduled'));
      qi.value = '';
      qd.value = today;
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

    fillList(host.querySelector('#dashToday'), todays.length ? todays : null,
      'Nothing scheduled for today.<br>Use quick add above to plan your day.');
    fillList(host.querySelector('#dashOverdue'), overdue.slice(0, 5));
    fillList(host.querySelector('#dashUpcoming'), dueSoon.length ? dueSoon.slice(0, 8) : null,
      'No deadlines in the next 7 days.');
    fillList(host.querySelector('#dashTests'), assessments.slice(0, 5));
    fillList(host.querySelector('#dashDone'), recentlyDone);

    /* sessions today */
    const sesHost = host.querySelector('#dashSessions');
    if (!sessionsToday.length) {
      sesHost.innerHTML = `<div class="empty"><span class="empty-icon">🧠</span>No study sessions planned for today.<br>Open an assignment and “Plan a session”.</div>`;
    } else {
      sessionsToday.forEach(({ session: s, task: t }) => {
        const cls = UI.classOf(t);
        const row = document.createElement('div');
        row.className = 'task-item' + (s.done ? ' done' : '');
        row.innerHTML = `
          <button class="task-check ${s.done ? 'checked' : ''}" aria-label="Toggle session">✓</button>
          <div class="task-main">
            <div class="task-title" style="${s.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${H(t.title)}</div>
            <div class="task-meta">
              ${s.time ? `<span class="meta-txt">🕐 ${H(Utils.fmtTime(s.time))}</span>` : ''}
              <span class="meta-txt">⏱ ${H(Utils.fmtDuration(s.durationMin))}</span>
              ${s.objective ? `<span class="meta-txt">🎯 ${H(s.objective)}</span>` : ''}
              ${cls ? `<span class="badge badge-cat"><span class="dot" style="background:${H(cls.color)}"></span>${H(cls.icon)} ${H(cls.name)}</span>` : ''}
              ${t.dueDate ? `<span class="meta-txt">due ${H(Utils.fmtDateSmart(t.dueDate))}</span>` : ''}
            </div>
          </div>`;
        row.querySelector('.task-check').addEventListener('click', () => Store.toggleSession(t.id, s.id));
        row.querySelector('.task-main').addEventListener('click', () => UI.openTaskViewer(t.id));
        sesHost.appendChild(row);
      });
    }

    /* events this week */
    const evHost = host.querySelector('#dashEvents');
    if (!eventsWeek.length) {
      evHost.innerHTML = `<div class="empty"><span class="empty-icon">⭐</span>No activities this week.</div>`;
    } else {
      eventsWeek.slice(0, 6).forEach(e => {
        const row = document.createElement('div');
        row.className = 'task-item';
        row.style.borderLeft = `3px solid ${e.color}`;
        row.innerHTML = `
          <div class="task-main">
            <div class="task-title">${H(e.icon)} ${H(e.title)}</div>
            <div class="task-meta">
              <span class="meta-txt">📅 ${H(Utils.fmtDateSmart(e.date))}${e.time ? ' · ' + H(Utils.fmtTime(e.time)) : ''}</span>
              ${e.location ? `<span class="meta-txt">📍 ${H(e.location)}</span>` : ''}
            </div>
          </div>`;
        row.querySelector('.task-main').addEventListener('click', () => App.go('activities'));
        evHost.appendChild(row);
      });
    }

    /* next 4 days with workload warnings */
    const nextHost = host.querySelector('#dashNextDays');
    const limit = state.settings.dailyLoadLimit || 180;
    for (let i = 1; i <= 4; i++) {
      const d = Utils.addDays(today, i);
      const items = Priority.allOn(state, d);
      const evts = Priority.eventsOn(state, d);
      const load = Priority.workloadOn(state, d);
      const col = document.createElement('div');
      col.className = 'week-col';
      col.innerHTML = `
        <div class="week-col-head">
          <span class="dow">${Utils.DOW_SHORT[Utils.parseDate(d).getDay()]}${i === 1 ? ' · tomorrow' : ''}</span>
          <span class="dnum">${Utils.fmtDate(d).replace(', ' + Utils.parseDate(d).getFullYear(), '')}</span>
          ${load.total >= limit ? `<span class="badge badge-overdue" title="Heavy day: ${Utils.fmtDuration(load.total)} planned">⚖ ${Utils.fmtDuration(load.total)} — heavy</span>` : load.total ? `<span class="badge badge-cat">⚖ ${Utils.fmtDuration(load.total)}</span>` : ''}
        </div>
        <div class="week-col-body"></div>`;
      const bodyEl = col.querySelector('.week-col-body');
      if (!items.length && !evts.length) bodyEl.innerHTML = `<div class="muted small" style="text-align:center;padding:8px 0">—</div>`;
      evts.slice(0, 2).forEach(e => {
        const mini = document.createElement('div');
        mini.className = 'mini-task';
        mini.style.borderLeftColor = e.color;
        mini.innerHTML = `<div class="mt-title">${H(e.icon)} ${H(e.title)}</div><div class="mt-meta">${e.time ? H(Utils.fmtTime(e.time)) : 'event'}</div>`;
        mini.addEventListener('click', () => App.go('activities'));
        bodyEl.appendChild(mini);
      });
      items.slice(0, 3).forEach(t => {
        const mini = document.createElement('div');
        mini.className = 'mini-task' + (t.status === 'completed' ? ' done' : '');
        const cat = UI.catOf(t) || UI.classOf(t);
        mini.style.borderLeftColor = cat ? cat.color : 'var(--accent)';
        mini.innerHTML = `<div class="mt-title">${t.time ? H(Utils.fmtTime(t.time)) + ' · ' : ''}${H(t.title)}</div>`;
        mini.addEventListener('click', () => UI.openTaskViewer(t.id));
        bodyEl.appendChild(mini);
      });
      const extra = evts.length + items.length - 5;
      if (extra > 0) {
        const more = document.createElement('div');
        more.className = 'muted small';
        more.style.padding = '2px 4px';
        more.textContent = `+${extra} more`;
        bodyEl.appendChild(more);
      }
      nextHost.appendChild(col);
    }

    host.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => App.go(b.dataset.go)));
  }

  function fillList(el, items, emptyHtml) {
    if (!el) return;
    if (!items) { el.innerHTML = `<div class="empty"><span class="empty-icon">🌤️</span>${emptyHtml || 'Nothing here.'}</div>`; return; }
    items.forEach(t => el.appendChild(UI.taskItem(t)));
  }

  global.Views = global.Views || {};
  global.Views.dashboard = { title: 'Dashboard', render };
})(typeof window !== 'undefined' ? window : globalThis);
