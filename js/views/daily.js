/* Momentum — Daily planner: chronological time grid, reschedule via drag to hour */
(function (global) {
  'use strict';

  let currentDate = Utils.todayStr();

  function render(host) {
    const state = Store.get();
    const items = Priority.allOn(state, currentDate);
    const timed = items.filter(t => t.time);
    const allDay = items.filter(t => !t.time);
    const evts = Priority.eventsOn(state, currentDate);
    const sessions = Priority.sessionsOn(state, currentDate);
    const timedSessions = sessions.filter(e => e.session.time);
    const looseSessions = sessions.filter(e => !e.session.time);
    const load = Priority.workloadOn(state, currentDate);

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Daily Planner</h2><div class="sub">Drag tasks between hours to reschedule. Click a task for details.</div></div>
        <div class="row">
          <button class="btn" id="dToday">Today</button>
          <button class="icon-btn" id="dPrev" aria-label="Previous day">←</button>
          <button class="icon-btn" id="dNext" aria-label="Next day">→</button>
        </div>
      </div>
      <div class="day-nav">
        <div class="day-title">${Utils.fmtDate(currentDate, { long: true })} ${currentDate === Utils.todayStr() ? '<span class="badge badge-today">Today</span>' : ''}
          ${load.total ? `<span class="badge ${load.total >= (state.settings.dailyLoadLimit || 180) ? 'badge-overdue' : 'badge-cat'}">⚖ ${Utils.fmtDuration(load.total)} planned</span>` : ''}
        </div>
      </div>
      ${evts.length ? `<div class="card" style="padding:12px 18px;margin-bottom:14px;border-left:4px solid var(--green)">
        <div class="card-title" style="margin-bottom:8px"><span>⭐ Fixed commitments (${evts.length})</span>
          <button class="link-btn" data-go="activities">Manage events →</button></div>
        <div class="row-wrap" id="dayEvents"></div>
      </div>` : ''}
      <div class="card" style="padding:14px 18px">
        <div class="all-day-box" id="allDayBox">
          <div class="card-title" style="margin-bottom:8px"><span>📌 Anytime / all-day (${allDay.length + looseSessions.length})</span>
            <button class="btn btn-sm btn-ghost" id="addAnytime">＋ Add</button></div>
          <div class="task-list" id="allDayList"></div>
          <div class="row-wrap" id="looseSessions" style="margin-top:8px"></div>
        </div>
        <div class="time-grid" id="timeGrid"></div>
      </div>
    `;

    host.querySelector('#dPrev').addEventListener('click', () => { currentDate = Utils.addDays(currentDate, -1); render(host); });
    host.querySelector('#dNext').addEventListener('click', () => { currentDate = Utils.addDays(currentDate, 1); render(host); });
    host.querySelector('#dToday').addEventListener('click', () => { currentDate = Utils.todayStr(); render(host); });
    host.querySelector('#addAnytime').addEventListener('click', () => UI.openTaskEditor(null, { dueDate: currentDate }));

    host.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => App.go(b.dataset.go)));

    const evHost = host.querySelector('#dayEvents');
    if (evHost) {
      evts.forEach(e => {
        const chip = document.createElement('span');
        chip.className = 'badge';
        chip.style.background = e.color + '22';
        chip.style.padding = '6px 12px';
        chip.innerHTML = `${H(e.icon)} <strong>${H(e.title)}</strong>${e.time ? ` · ${H(Utils.fmtTime(e.time))}${e.endTime ? '–' + H(Utils.fmtTime(e.endTime)) : ''}` : ''}${e.location ? ' · 📍 ' + H(e.location) : ''}`;
        evHost.appendChild(chip);
      });
    }

    const allDayList = host.querySelector('#allDayList');
    if (!allDay.length) {
      allDayList.innerHTML = `<div class="muted small" style="padding:2px 0">No anytime tasks — timed items appear in the schedule below.</div>`;
    } else {
      allDay.forEach(t => allDayList.appendChild(UI.taskItem(t)));
    }

    const looseHost = host.querySelector('#looseSessions');
    if (looseHost) {
      looseSessions.forEach(({ session: s, task: t }) => {
        const mini = document.createElement('div');
        mini.className = 'mini-task' + (s.done ? ' done' : '');
        mini.style.borderLeftColor = 'var(--purple)';
        mini.style.borderLeftStyle = 'dashed';
        mini.style.flex = '1 1 220px';
        mini.innerHTML = `<div class="mt-title">🧠 ${H(t.title)}</div><div class="mt-meta">${H(Utils.fmtDuration(s.durationMin))}${s.objective ? ' · ' + H(s.objective.slice(0, 30)) : ''}</div>`;
        mini.addEventListener('click', () => UI.openTaskViewer(t.id));
        looseHost.appendChild(mini);
      });
    }

    const grid = host.querySelector('#timeGrid');
    for (let h = 0; h < 24; h++) {
      const hourKey = String(h).padStart(2, '0') + ':00';
      const row = document.createElement('div');
      row.className = 'time-row';
      row.innerHTML = `<div class="hour-label">${Utils.fmtTime(hourKey)}</div><div class="hour-cells"><div class="drop-zone" data-hour="${h}"></div></div>`;
      const zone = row.querySelector('.drop-zone');
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/task-id');
        const t = Store.getTask(id);
        if (!t) return;
        Store.saveTask({ ...t, dueDate: currentDate, time: hourKey });
        UI.toast('success', 'Rescheduled', `“${t.title}” → ${Utils.fmtDate(currentDate)} ${Utils.fmtTime(hourKey)}`);
      });
      const hourTasks = timed.filter(t => parseInt(t.time.slice(0, 2), 10) === h);
      hourTasks.forEach(t => {
        const item = UI.taskItem(t, { draggable: true });
        item.addEventListener('dragstart', e => e.dataTransfer.setData('text/task-id', t.id));
        zone.appendChild(item);
      });
      timedSessions.filter(e => parseInt(e.session.time.slice(0, 2), 10) === h).forEach(({ session: s, task: t }) => {
        const cls = UI.classOf(t);
        const card = document.createElement('div');
        card.className = 'task-item' + (s.done ? ' done' : '');
        card.style.borderLeft = `3px dashed ${cls ? cls.color : 'var(--purple)'}`;
        card.innerHTML = `
          <button class="task-check ${s.done ? 'checked' : ''}" aria-label="Toggle session">✓</button>
          <div class="task-main">
            <div class="task-title" style="font-size:13.5px">🧠 ${H(t.title)}</div>
            <div class="task-meta">
              <span class="meta-txt">⏱ ${H(Utils.fmtDuration(s.durationMin))}</span>
              ${s.objective ? `<span class="meta-txt">🎯 ${H(s.objective)}</span>` : ''}
              ${t.dueDate ? `<span class="meta-txt">due ${H(Utils.fmtDateSmart(t.dueDate))}</span>` : ''}
            </div>
          </div>`;
        card.querySelector('.task-check').addEventListener('click', () => Store.toggleSession(t.id, s.id));
        card.querySelector('.task-main').addEventListener('click', () => UI.openTaskViewer(t.id));
        zone.appendChild(card);
      });
      grid.appendChild(row);
    }
  }

  global.Views = global.Views || {};
  global.Views.daily = { title: 'Daily Planner', render, currentDate: () => currentDate };
})(typeof window !== 'undefined' ? window : globalThis);
