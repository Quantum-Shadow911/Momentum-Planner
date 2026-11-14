/* Momentum — Dashboard: school-portal home — schedule panel left, to-do top, exams, dates, calendar */
(function (global) {
  'use strict';

  let calYear = null;
  let calMonth = null;

  function periodNum(c) {
    const m = /^(\d+)/.exec(c.period || '');
    return m ? Number(m[1]) : 99;
  }

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

      <div class="dash-grid">
        <div class="dash-side">
          <div class="card">
            <div class="card-title"><span>🏫 My schedule</span><button class="link-btn" data-go="timetable">Timetable →</button></div>
            <div id="dashPeriods"></div>
            <button class="link-btn" id="dashEditCls" style="margin-top:8px">✏️ Edit classes & periods</button>
          </div>
        </div>
        <div class="dash-main stack">
          <div class="card">
            <div class="card-title"><span>✅ To-do list — today</span><button class="link-btn" data-go="daily">Daily planner →</button></div>
            <div class="today-col" id="dashToday"></div>
          </div>
          ${overdue.length ? `
          <div class="card" style="border-color:var(--red)">
            <div class="card-title"><span style="color:var(--red)">⚠ Overdue (${overdue.length})</span>
              <button class="link-btn" id="dashResched" title="Move overdue work to realistic new days">⚖ Smart reschedule…</button></div>
            <div class="today-col" id="dashOverdue"></div>
          </div>` : ''}
          <div class="card">
            <div class="card-title"><span>🧠 Today's planned study sessions (${sch.sessionsTodayDone}/${sessionsToday.length} done)</span></div>
            <div id="dashSessions"></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title"><span>📝 Exams & quizzes</span><button class="link-btn" data-go="exams">Exam prep →</button></div>
        <div class="today-col" id="dashTests"></div>
      </div>

      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-title"><span>📌 Important dates — deadlines</span><button class="link-btn" data-go="agenda">Full agenda →</button></div>
          <div class="today-col" id="dashUpcoming"></div>
        </div>
        <div class="card">
          <div class="card-title"><span>⭐ Activities & appointments</span><button class="link-btn" data-go="activities">All events →</button></div>
          <div class="today-col" id="dashEvents"></div>
        </div>
      </div>

      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-title"><span>🗓 Calendar</span>
            <span class="row" style="gap:6px">
              <button class="icon-btn" id="calPrev" aria-label="Previous month">←</button>
              <button class="icon-btn" id="calToday" aria-label="This month">•</button>
              <button class="icon-btn" id="calNext" aria-label="Next month">→</button>
            </span></div>
          <div class="mini-cal-label" id="miniCalLabel"></div>
          <div class="mini-cal" id="miniCal"></div>
        </div>
        <div class="card">
          <div class="card-title"><span>🗓 Next several days</span><button class="link-btn" data-go="weekly">Weekly planner →</button></div>
          <div class="grid grid-2" id="dashNextDays"></div>
        </div>
      </div>

      ${recentlyDone.length ? `
      <div class="card">
        <div class="card-title"><span>✅ Recently completed</span></div>
        <div class="today-col" id="dashDone"></div>
      </div>` : ''}
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
      'Nothing scheduled for today.<br>Use quick add above to plan your day.', '🌤️');
    fillList(host.querySelector('#dashOverdue'), overdue.slice(0, 5), null, '⚠️');
    fillList(host.querySelector('#dashUpcoming'), dueSoon.length ? dueSoon.slice(0, 8) : null,
      'No deadlines in the next 7 days.', '📌');
    fillList(host.querySelector('#dashTests'), assessments.length ? assessments.slice(0, 5) : null,
      'No tests or quizzes in the next 14 days. 🎉', '📝');
    fillList(host.querySelector('#dashDone'), recentlyDone, null, '✅');

    const reschedBtn = host.querySelector('#dashResched');
    if (reschedBtn) reschedBtn.addEventListener('click', () => {
      UI.openSuggestionModal({
        title: '⚖ Smart reschedule',
        intro: 'Overdue assignments and missed study sessions get a realistic new day — the lightest of today and the next few days, skipping school breaks. Nothing changes until you apply.',
        suggestions: Planner.suggestReschedule(Store.get()),
        noneTitle: 'Nothing overdue',
        noneMsg: 'No overdue work to reschedule.',
        appliedTitle: 'Overdue work rescheduled'
      });
    });

    buildPeriods(host, state, now);
    buildMiniCalendar(host, state);

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
      evHost.innerHTML = `<div class="empty"><span class="empty-icon">⭐</span>No activities or appointments this week.</div>`;
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

  /* Left panel: periods with classes; the current period is highlighted live */
  function buildPeriods(host, state, now) {
    const el = host.querySelector('#dashPeriods');
    const classes = [...state.classes].sort((a, b) => periodNum(a) - periodNum(b));
    if (!classes.length) {
      el.innerHTML = `<div class="empty"><span class="empty-icon">🏫</span>No classes yet.<br>Add your periods in My Classes.</div>`;
    } else {
      const dow = now.getDay();
      const mins = now.getHours() * 60 + now.getMinutes();
      classes.forEach(c => {
        const slot = (c.slots || []).find(s => s.day === dow);
        const isNow = slot && Utils.minutesOf(slot.start) <= mins && mins < Utils.minutesOf(slot.end);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'period-row' + (isNow ? ' now' : '');
        row.innerHTML = `
          <span class="p-badge">${c.period ? 'P' + H(c.period) : '·'}</span>
          <span class="p-icon">${H(c.icon)}</span>
          <span class="p-main">
            <span class="p-name">${H(c.name)}${isNow ? ' <span class="badge badge-today">now</span>' : ''}</span>
            <span class="p-teacher">${H(c.teacher || '')}${c.room ? ' · ' + H(c.room) : ''}</span>
          </span>
          ${slot ? `<span class="p-time">${H(Utils.fmtTime(slot.start))}–${H(Utils.fmtTime(slot.end))}</span>` : ''}`;
        row.addEventListener('click', () => { Views.classes.selectClass(c.id); App.go('classes'); });
        el.appendChild(row);
      });
    }
    host.querySelector('#dashEditCls').addEventListener('click', () => App.go('classes'));
  }

  /* Mini month calendar: dots on days with tasks/events, click a day to open it */
  function buildMiniCalendar(host, state) {
    const now = new Date();
    if (calYear === null) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
    const today = Utils.todayStr();
    const counts = {};
    state.tasks.forEach(t => { if (t.status !== 'completed' && t.dueDate) counts[t.dueDate] = (counts[t.dueDate] || 0) + 1; });
    state.events.forEach(e => { if (e.date) counts[e.date] = (counts[e.date] || 0) + 1; });

    const label = host.querySelector('#miniCalLabel');
    const grid = host.querySelector('#miniCal');
    label.textContent = `${Utils.MONTHS[calMonth]} ${calYear}`;

    const first = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`;
    const gridStart = Utils.startOfWeek(first, state.settings.weekStartsOn);
    grid.innerHTML = Utils.DOW_SHORT.map(d => `<div class="mini-cal-head">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = Utils.addDays(gridStart, i);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'mini-cell'
        + (d.slice(0, 7) === first.slice(0, 7) ? '' : ' other')
        + (d === today ? ' today' : '');
      cell.innerHTML = `${Number(d.slice(8, 10))}${counts[d] ? '<span class="dot"></span>' : ''}`;
      cell.title = counts[d] ? `${counts[d]} item${counts[d] > 1 ? 's' : ''}` : 'Open day';
      cell.addEventListener('click', () => { Views.daily.setDate(d); App.go('daily'); });
      grid.appendChild(cell);
    }

    const monthShift = n => {
      calMonth += n;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      if (calMonth > 11) { calMonth = 0; calYear++; }
      buildMiniCalendar(host, state);
    };
    host.querySelector('#calPrev').addEventListener('click', () => monthShift(-1));
    host.querySelector('#calNext').addEventListener('click', () => monthShift(1));
    host.querySelector('#calToday').addEventListener('click', () => {
      calYear = now.getFullYear(); calMonth = now.getMonth();
      buildMiniCalendar(host, state);
    });
  }

  function fillList(el, items, emptyHtml, emptyIcon) {
    if (!el) return;
    if (!items) { el.innerHTML = `<div class="empty"><span class="empty-icon">${emptyIcon || '🌤️'}</span>${emptyHtml || 'Nothing here.'}</div>`; return; }
    items.forEach(t => el.appendChild(UI.taskItem(t)));
  }

  global.Views = global.Views || {};
  global.Views.dashboard = { title: 'Dashboard', render };
})(typeof window !== 'undefined' ? window : globalThis);
