/* Momentum — Weekly planner: 7-day board, drag tasks between days */
(function (global) {
  'use strict';

  let weekStart = null;

  function render(host) {
    const state = Store.get();
    if (!weekStart) weekStart = Utils.startOfWeek(Utils.todayStr(), state.settings.weekStartsOn);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(Utils.addDays(weekStart, i));
    const today = Utils.todayStr();
    const weekEnd = days[6];
    const weekTasks = state.tasks.filter(t => t.dueDate && t.dueDate >= weekStart && t.dueDate <= weekEnd);
    const doneCount = weekTasks.filter(t => t.status === 'completed').length;

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Weekly Planner</h2><div class="sub">${Utils.fmtDate(weekStart)} – ${Utils.fmtDate(weekEnd)} · ${weekTasks.length} tasks, ${doneCount} done</div></div>
        <div class="row">
          <button class="btn" id="wToday">This week</button>
          <button class="icon-btn" id="wPrev" aria-label="Previous week">←</button>
          <button class="icon-btn" id="wNext" aria-label="Next week">→</button>
        </div>
      </div>
      <div class="week-grid" id="weekGrid"></div>
    `;

    host.querySelector('#wPrev').addEventListener('click', () => { weekStart = Utils.addDays(weekStart, -7); render(host); });
    host.querySelector('#wNext').addEventListener('click', () => { weekStart = Utils.addDays(weekStart, 7); render(host); });
    host.querySelector('#wToday').addEventListener('click', () => { weekStart = Utils.startOfWeek(Utils.todayStr(), state.settings.weekStartsOn); render(host); });

    const grid = host.querySelector('#weekGrid');
    days.forEach(d => {
      const items = Priority.allOn(state, d);
      const col = document.createElement('div');
      col.className = 'week-col' + (d === today ? ' today-col-hl' : '');
      col.innerHTML = `
        <div class="week-col-head">
          <span class="dow">${Utils.DOW_SHORT[Utils.parseDate(d).getDay()]}${d === today ? ' · today' : ''}</span>
          <span class="dnum">${Utils.fmtDate(d).replace(', ' + Utils.parseDate(d).getFullYear(), '')}</span>
        </div>
        <div class="week-col-body"></div>
        <button class="btn btn-sm btn-ghost btn-block" style="margin-top:8px" data-add="${d}">＋ Add task</button>`;
      col.querySelector('[data-add]').addEventListener('click', () => UI.openTaskEditor(null, { dueDate: d }));

      const body = col.querySelector('.week-col-body');
      body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
      body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
      body.addEventListener('drop', e => {
        e.preventDefault();
        body.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/task-id');
        const t = Store.getTask(id);
        if (!t || t.dueDate === d) return;
        Store.saveTask({ ...t, dueDate: d });
        UI.toast('success', 'Moved', `“${t.title}” → ${Utils.fmtDate(d)}`);
      });

      if (!items.length) {
        body.innerHTML = `<div class="muted small" style="text-align:center;padding:10px 0">Nothing planned</div>`;
      }
      items.forEach(t => {
        const mini = document.createElement('div');
        mini.className = 'mini-task' + (t.status === 'completed' ? ' done' : '');
        mini.draggable = true;
        const cat = UI.catOf(t);
        if (cat) mini.style.borderLeftColor = cat.color;
        const sub = t.subtasks.filter(s => s.done).length;
        mini.innerHTML = `
          <div class="mt-title">${t.time ? H(Utils.fmtTime(t.time)) + ' · ' : ''}${H(t.title)}</div>
          <div class="mt-meta">
            ${t.priority === 'urgent' ? '<span style="color:var(--red);font-weight:700">urgent</span>' : ''}
            ${t.priority === 'high' ? '<span style="color:var(--amber);font-weight:600">high</span>' : ''}
            ${t.estimateMin ? `<span>~${H(Utils.fmtDuration(t.estimateMin))}</span>` : ''}
            ${t.subtasks.length ? `<span>☑ ${sub}/${t.subtasks.length}</span>` : ''}
            ${cat ? `<span>${H(cat.icon)}</span>` : ''}
          </div>`;
        mini.addEventListener('click', () => UI.openTaskViewer(t.id));
        mini.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/task-id', t.id);
          mini.classList.add('dragging');
        });
        mini.addEventListener('dragend', () => mini.classList.remove('dragging'));
        body.appendChild(mini);
      });
      grid.appendChild(col);
    });
  }

  global.Views = global.Views || {};
  global.Views.weekly = { title: 'Weekly Planner', render };
})(typeof window !== 'undefined' ? window : globalThis);
