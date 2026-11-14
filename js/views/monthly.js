/* Momentum — Monthly calendar: interactive month grid with deadlines highlighted */
(function (global) {
  'use strict';

  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  function render(host) {
    const state = Store.get();
    const today = Utils.todayStr();
    const first = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const firstDow = Utils.parseDate(first).getDay();
    const lead = (firstDow - state.settings.weekStartsOn + 7) % 7;
    const gridStart = Utils.addDays(first, -lead);
    const monthTasks = state.tasks.filter(t => t.dueDate && t.dueDate.slice(0, 7) === first.slice(0, 7));

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Monthly Calendar</h2><div class="sub">${monthTasks.length} task${monthTasks.length === 1 ? '' : 's'} this month · deadlines highlighted in red</div></div>
        <div class="row">
          <button class="btn" id="mToday">Today</button>
          <button class="icon-btn" id="mPrev" aria-label="Previous month">←</button>
          <div style="font-weight:700;min-width:150px;text-align:center">${Utils.monthLabel(viewYear, viewMonth)}</div>
          <button class="icon-btn" id="mNext" aria-label="Next month">→</button>
        </div>
      </div>
      <div class="cal-header">${Utils.DOW_SHORT.map((d, i) => `<div>${Utils.DOW_SHORT[(i + state.settings.weekStartsOn) % 7]}</div>`).join('')}</div>
      <div class="cal-grid" id="calGrid"></div>
    `;

    host.querySelector('#mPrev').addEventListener('click', () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(host); });
    host.querySelector('#mNext').addEventListener('click', () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(host); });
    host.querySelector('#mToday').addEventListener('click', () => { const n = new Date(); viewYear = n.getFullYear(); viewMonth = n.getMonth(); render(host); });

    const grid = host.querySelector('#calGrid');
    for (let i = 0; i < 42; i++) {
      const d = Utils.addDays(gridStart, i);
      const inMonth = d.slice(0, 7) === first.slice(0, 7);
      const items = Priority.allOn(state, d);
      const evts = Priority.eventsOn(state, d);
      const open = items.filter(t => t.status !== 'completed');
      const hasOverdue = d < today && open.length > 0;
      const hasUrgent = open.some(t => t.priority === 'urgent' || Priority.isAssessment(t));
      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (inMonth ? '' : ' other-month') + (d === today ? ' today-cell' : '')
        + (hasOverdue ? ' has-overdue' : hasUrgent ? ' has-deadline' : '');
      cell.innerHTML = `<div class="cal-day-num">${Number(d.slice(8, 10))}</div><div class="cal-events"></div>`;
      const evHost = cell.querySelector('.cal-events');
      const entries = [
        ...evts.slice(0, 2).map(e => ({ kind: 'event', e })),
        ...items.slice(0, 3).map(t => ({ kind: 'task', t }))
      ].slice(0, 4);
      entries.forEach(en => {
        if (en.kind === 'event') {
          const e = en.e;
          const ev = document.createElement('div');
          ev.className = 'cal-ev cal-ev-event';
          ev.style.borderLeftColor = e.color;
          ev.innerHTML = `${e.time ? `<span class="ev-time">${H(Utils.fmtTime(e.time))}</span> ` : ''}${H(e.icon)} ${H(e.title)}`;
          ev.addEventListener('click', ev2 => { ev2.stopPropagation(); App.go('activities'); });
          evHost.appendChild(ev);
        } else {
          const t = en.t;
          const cat = UI.catOf(t) || UI.classOf(t);
          const ev = document.createElement('div');
          ev.className = 'cal-ev' + (t.status === 'completed' ? ' ev-done' : '');
          ev.style.borderLeftColor = cat ? cat.color : 'var(--accent)';
          ev.innerHTML = `${t.time ? `<span class="ev-time">${H(Utils.fmtTime(t.time))}</span> ` : ''}${H(t.title)}`;
          ev.addEventListener('click', e2 => { e2.stopPropagation(); UI.openTaskViewer(t.id); });
          evHost.appendChild(ev);
        }
      });
      const total = evts.length + items.length;
      if (total > 4) {
        const more = document.createElement('button');
        more.className = 'cal-more';
        more.textContent = `+${total - 4} more`;
        more.addEventListener('click', e => { e.stopPropagation(); dayDialog(d); });
        evHost.appendChild(more);
      }
      cell.addEventListener('click', () => dayDialog(d));
      grid.appendChild(cell);
    }
  }

  function dayDialog(d) {
    const state = Store.get();
    const items = Priority.allOn(state, d);
    const evts = Priority.eventsOn(state, d);
    const sessions = Priority.sessionsOn(state, d);
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="dayEvents"></div>
      <div class="task-list" id="dayList"></div>
      <button class="btn btn-primary btn-block" id="dayAdd" style="margin-top:12px">＋ Add task on ${H(Utils.fmtDate(d))}</button>`;
    const evHost = wrap.querySelector('#dayEvents');
    if (evts.length) {
      evts.forEach(e => {
        const row = document.createElement('div');
        row.className = 'task-item';
        row.style.borderLeft = `3px solid ${e.color}`;
        row.innerHTML = `
          <div class="task-main"><div class="task-title">${H(e.icon)} ${H(e.title)}</div>
          <div class="task-meta"><span class="meta-txt">⭐ Event</span>${e.time ? `<span class="meta-txt">${H(Utils.fmtTime(e.time))}${e.endTime ? '–' + H(Utils.fmtTime(e.endTime)) : ''}</span>` : ''}${e.location ? `<span class="meta-txt">📍 ${H(e.location)}</span>` : ''}</div></div>`;
        evHost.appendChild(row);
      });
    }
    const list = wrap.querySelector('#dayList');
    if (!items.length && !evts.length && !sessions.length) list.innerHTML = `<div class="empty"><span class="empty-icon">🗓️</span>Nothing scheduled on this day.</div>`;
    items.forEach(t => list.appendChild(UI.taskItem(t)));
    wrap.querySelector('#dayAdd').addEventListener('click', () => { UI.closeModal(); UI.openTaskEditor(null, { dueDate: d }); });
    UI.openModal({ title: Utils.fmtDate(d, { long: true }), body: wrap, large: true, buttons: [{ label: 'Close', onClick: () => UI.closeModal() }] });
  }

  global.Views = global.Views || {};
  global.Views.monthly = { title: 'Calendar', render };
})(typeof window !== 'undefined' ? window : globalThis);
