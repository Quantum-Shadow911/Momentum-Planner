/* Momentum — Important Dates: full calendar plus every upcoming date in one place */
(function (global) {
  'use strict';

  function fillList(el, items, emptyHtml, emptyIcon) {
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = `<div class="empty"><span class="empty-icon">${emptyIcon || '🗓️'}</span>${emptyHtml || 'Nothing here.'}</div>`;
      return;
    }
    items.forEach(t => el.appendChild(UI.taskItem(t)));
  }

  function render(host) {
    const state = Store.get();
    const today = Utils.todayStr();
    const overdue = Priority.overdueTasks(state);
    const dueSoon = Priority.upcoming(state, 14).filter(t => t.dueDate !== today);
    const assessments = Priority.upcomingAssessments(state, 30);
    const events = Priority.upcomingEvents(state, 14);
    const breaks = (state.breaks || [])
      .filter(b => b.end >= today)
      .sort((a, b) => a.start.localeCompare(b.start));

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Important Dates</h2><div class="sub">The full calendar plus every deadline, test and event coming up.</div></div>
      </div>
      <div id="datesCal"></div>
      <div class="grid grid-2" style="margin-top:18px">
        <div class="card">
          <div class="card-title"><span>📌 Deadlines — next 14 days</span><button class="link-btn" data-go="agenda">Full agenda →</button></div>
          <div class="today-col" id="dtDeadlines"></div>
        </div>
        <div class="card">
          <div class="card-title"><span>⭐ Activities & appointments — next 14 days</span><button class="link-btn" data-go="activities">All events →</button></div>
          <div class="today-col" id="dtEvents"></div>
        </div>
      </div>
      <div class="grid grid-2" style="margin-top:18px">
        <div class="card">
          <div class="card-title"><span>📄 Tests & quizzes — next 30 days</span><button class="link-btn" data-go="exams">Exams & quizzes →</button></div>
          <div class="today-col" id="dtTests"></div>
        </div>
        <div class="card">
          <div class="card-title"><span>🏖 School breaks</span><button class="link-btn" data-go="settings">Manage breaks →</button></div>
          <div class="today-col" id="dtBreaks"></div>
        </div>
      </div>`;

    Views.monthly.render(host.querySelector('#datesCal'));

    const dl = host.querySelector('#dtDeadlines');
    if (overdue.length) {
      const head = document.createElement('div');
      head.className = 'muted small';
      head.style.margin = '2px 0 6px';
      head.innerHTML = `<strong style="color:var(--red)">⚠️ ${overdue.length} overdue</strong> — these need attention first`;
      dl.appendChild(head);
      overdue.slice(0, 5).forEach(t => dl.appendChild(UI.taskItem(t)));
      if (dueSoon.length) {
        const sep = document.createElement('div');
        sep.className = 'muted small';
        sep.style.margin = '10px 0 6px';
        sep.textContent = 'Coming up:';
        dl.appendChild(sep);
      }
    }
    fillList(dl, dueSoon.length ? dueSoon.slice(0, 10) : (overdue.length ? [] : null),
      overdue.length ? '' : 'No deadlines in the next 14 days.', '📌');

    const evHost = host.querySelector('#dtEvents');
    if (!events.length) {
      evHost.innerHTML = `<div class="empty"><span class="empty-icon">⭐</span>No activities or appointments in the next 14 days.</div>`;
    } else {
      events.slice(0, 8).forEach(e => {
        const row = document.createElement('div');
        row.className = 'task-item';
        row.style.borderLeft = `3px solid ${e.color}`;
        row.innerHTML = `
          <div class="task-main">
            <div class="task-title">${H(e.icon)} ${H(e.title)}</div>
            <div class="task-meta">
              <span class="meta-txt">📅 ${H(Utils.fmtDateSmart(e.date))}${e.time ? ' · ' + H(Utils.fmtTime(e.time)) : ''}</span>
              ${H(Priority.recurrenceLabel(e))}
              ${e.location ? `<span class="meta-txt">📍 ${H(e.location)}</span>` : ''}
            </div>
          </div>`;
        row.querySelector('.task-main').addEventListener('click', () => App.go('activities'));
        evHost.appendChild(row);
      });
    }

    fillList(host.querySelector('#dtTests'), assessments.length ? assessments.slice(0, 8) : null,
      'No tests or quizzes in the next 30 days. 🎉', '📄');

    const brHost = host.querySelector('#dtBreaks');
    if (!breaks.length) {
      brHost.innerHTML = `<div class="empty"><span class="empty-icon">🏖</span>No school breaks added. Add them in Settings so the planner can skip those days.</div>`;
    } else {
      breaks.slice(0, 6).forEach(b => {
        const row = document.createElement('div');
        row.className = 'task-item';
        row.innerHTML = `
          <div class="task-main">
            <div class="task-title">🏖 ${H(b.name)}</div>
            <div class="task-meta"><span class="meta-txt">📅 ${H(Utils.fmtDateSmart(b.start))} → ${H(Utils.fmtDateSmart(b.end))}</span></div>
          </div>`;
        brHost.appendChild(row);
      });
    }

    host.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => App.go(b.dataset.go)));
  }

  global.Views = global.Views || {};
  global.Views.dates = { title: 'Important Dates', render };
})(typeof window !== 'undefined' ? window : globalThis);
