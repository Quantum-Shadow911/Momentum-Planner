/* Momentum — Agenda: chronological list of everything upcoming */
(function (global) {
  'use strict';

  function render(host) {
    const state = Store.get();
    const today = Utils.todayStr();

    const overdue = Priority.overdueTasks(state);
    const days = 30;
    const groups = [];
    for (let i = 0; i <= days; i++) {
      const d = Utils.addDays(today, i);
      const items = Priority.allOn(state, d);
      if (items.length) groups.push({ date: d, items });
    }
    const undated = state.tasks.filter(t => t.status !== 'completed' && !t.dueDate)
      .sort((a, b) => Priority.score(b, state) - Priority.score(a, state));

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Agenda</h2><div class="sub">Everything coming up, in order. ${overdue.length ? `<span style="color:var(--red);font-weight:600">${overdue.length} overdue</span>` : 'Nothing overdue.'}</div></div>
        <button class="btn btn-primary" id="agAdd">＋ New task</button>
      </div>
      <div id="agendaBody"></div>
    `;
    host.querySelector('#agAdd').addEventListener('click', () => UI.openTaskEditor());
    const body = host.querySelector('#agendaBody');

    if (overdue.length) {
      body.appendChild(groupHeader('⚠ Overdue', `${overdue.length} task${overdue.length === 1 ? '' : 's'} past due`, 'var(--red)'));
      const list = document.createElement('div');
      list.className = 'task-list';
      overdue.forEach(t => list.appendChild(UI.taskItem(t)));
      body.appendChild(list);
    }

    if (!groups.length && !undated.length && !overdue.length && !state.events.length) {
      body.innerHTML = `<div class="empty" style="margin-top:20px"><span class="empty-icon">🎉</span>Your agenda is completely clear.<br>Add a task to get started.</div>`;
      return;
    }

    groups.forEach(g => {
      const n = Utils.daysUntil(g.date, today);
      const rel = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : Utils.DOW[Utils.parseDate(g.date).getDay()];
      body.appendChild(groupHeader(Utils.fmtDate(g.date, { long: true }), rel, n === 0 ? 'var(--amber)' : null));
      const list = document.createElement('div');
      list.className = 'task-list';
      Priority.eventsOn(state, g.date).forEach(e => {
        const row = document.createElement('div');
        row.className = 'task-item';
        row.style.borderLeft = `3px solid ${e.color}`;
        row.innerHTML = `
          <div class="task-main"><div class="task-title">${H(e.icon)} ${H(e.title)}</div>
          <div class="task-meta"><span class="badge" style="background:var(--green-soft);color:var(--green)">⭐ Event</span>
          ${H(Priority.recurrenceLabel(e))}
          ${e.time ? `<span class="meta-txt">${H(Utils.fmtTime(e.time))}</span>` : ''}${e.location ? `<span class="meta-txt">📍 ${H(e.location)}</span>` : ''}</div></div>`;
        row.querySelector('.task-main').addEventListener('click', () => App.go('activities'));
        list.appendChild(row);
      });
      g.items.forEach(t => list.appendChild(UI.taskItem(t)));
      body.appendChild(list);
    });

    if (undated.length) {
      body.appendChild(groupHeader('📥 No deadline', `${undated.length} task${undated.length === 1 ? '' : 's'} — sorted by smart priority`, null));
      const list = document.createElement('div');
      list.className = 'task-list';
      undated.forEach(t => list.appendChild(UI.taskItem(t)));
      body.appendChild(list);
    }
  }

  function groupHeader(title, sub, color) {
    const el = document.createElement('div');
    el.className = 'agenda-day-head';
    el.innerHTML = `<span class="agd-date" ${color ? `style="color:${color}"` : ''}>${H(title)}</span><span class="agd-rel">${H(sub)}</span>`;
    return el;
  }

  global.Views = global.Views || {};
  global.Views.agenda = { title: 'Agenda', render };
})(typeof window !== 'undefined' ? window : globalThis);
