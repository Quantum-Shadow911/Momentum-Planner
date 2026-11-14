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
      const hasDeadline = items.some(t => t.status !== 'completed' && (t.priority === 'urgent' || Priority.isOverdue(t, d)));
      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (inMonth ? '' : ' other-month') + (d === today ? ' today-cell' : '') + (hasDeadline ? ' has-deadline' : '');
      cell.innerHTML = `<div class="cal-day-num">${Number(d.slice(8, 10))}</div><div class="cal-events"></div>`;
      const evHost = cell.querySelector('.cal-events');
      items.slice(0, 3).forEach(t => {
        const cat = UI.catOf(t);
        const ev = document.createElement('div');
        ev.className = 'cal-ev' + (t.status === 'completed' ? ' ev-done' : '');
        ev.style.borderLeftColor = cat ? cat.color : 'var(--accent)';
        ev.innerHTML = `${t.time ? `<span class="ev-time">${H(Utils.fmtTime(t.time))}</span> ` : ''}${H(t.title)}`;
        ev.addEventListener('click', e => { e.stopPropagation(); UI.openTaskViewer(t.id); });
        evHost.appendChild(ev);
      });
      if (items.length > 3) {
        const more = document.createElement('button');
        more.className = 'cal-more';
        more.textContent = `+${items.length - 3} more`;
        more.addEventListener('click', e => { e.stopPropagation(); dayDialog(d, items); });
        evHost.appendChild(more);
      }
      cell.addEventListener('click', () => dayDialog(d, items));
      grid.appendChild(cell);
    }
  }

  function dayDialog(d, items) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="task-list" id="dayList"></div>
      <button class="btn btn-primary btn-block" id="dayAdd" style="margin-top:12px">＋ Add task on ${H(Utils.fmtDate(d))}</button>`;
    const list = wrap.querySelector('#dayList');
    if (!items.length) list.innerHTML = `<div class="empty"><span class="empty-icon">🗓️</span>Nothing scheduled on this day.</div>`;
    items.forEach(t => list.appendChild(UI.taskItem(t)));
    wrap.querySelector('#dayAdd').addEventListener('click', () => { UI.closeModal(); UI.openTaskEditor(null, { dueDate: d }); });
    UI.openModal({ title: Utils.fmtDate(d, { long: true }), body: wrap, large: true, buttons: [{ label: 'Close', onClick: () => UI.closeModal() }] });
  }

  global.Views = global.Views || {};
  global.Views.monthly = { title: 'Calendar', render };
})(typeof window !== 'undefined' ? window : globalThis);
