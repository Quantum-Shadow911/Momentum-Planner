/* Momentum — Daily planner: chronological time grid, reschedule via drag to hour */
(function (global) {
  'use strict';

  let currentDate = Utils.todayStr();

  function render(host) {
    const state = Store.get();
    const items = Priority.allOn(state, currentDate);
    const timed = items.filter(t => t.time);
    const allDay = items.filter(t => !t.time);

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
        <div class="day-title">${Utils.fmtDate(currentDate, { long: true })} ${currentDate === Utils.todayStr() ? '<span class="badge badge-today">Today</span>' : ''}</div>
      </div>
      <div class="card" style="padding:14px 18px">
        <div class="all-day-box" id="allDayBox">
          <div class="card-title" style="margin-bottom:8px"><span>📌 Anytime / all-day (${allDay.length})</span>
            <button class="btn btn-sm btn-ghost" id="addAnytime">＋ Add</button></div>
          <div class="task-list" id="allDayList"></div>
        </div>
        <div class="time-grid" id="timeGrid"></div>
      </div>
    `;

    host.querySelector('#dPrev').addEventListener('click', () => { currentDate = Utils.addDays(currentDate, -1); render(host); });
    host.querySelector('#dNext').addEventListener('click', () => { currentDate = Utils.addDays(currentDate, 1); render(host); });
    host.querySelector('#dToday').addEventListener('click', () => { currentDate = Utils.todayStr(); render(host); });
    host.querySelector('#addAnytime').addEventListener('click', () => UI.openTaskEditor(null, { dueDate: currentDate }));

    const allDayList = host.querySelector('#allDayList');
    if (!allDay.length) {
      allDayList.innerHTML = `<div class="muted small" style="padding:2px 0">No anytime tasks — timed tasks appear in the schedule below.</div>`;
    } else {
      allDay.forEach(t => allDayList.appendChild(UI.taskItem(t)));
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
      grid.appendChild(row);
    }
  }

  global.Views = global.Views || {};
  global.Views.daily = { title: 'Daily Planner', render, currentDate: () => currentDate };
})(typeof window !== 'undefined' ? window : globalThis);
