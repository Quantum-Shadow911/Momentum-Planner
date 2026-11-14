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
        <div><h2>Weekly Planner</h2><div class="sub">${Utils.fmtDate(weekStart)} – ${Utils.fmtDate(weekEnd)} · ${weekTasks.length} tasks, ${doneCount} done · ⚖ = planned workload per day (warns over ${Utils.fmtDuration(state.settings.dailyLoadLimit || 180)})</div></div>
        <div class="row">
          <button class="btn" id="wBalance" title="Move study sessions off overloaded days">⚖ Balance workload</button>
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
    host.querySelector('#wBalance').addEventListener('click', () => {
      UI.openSuggestionModal({
        title: '⚖ Balance workload',
        intro: `Days over your ${Utils.fmtDuration(limitOf(state))} limit are listed below. Study sessions move to the lightest day that is still before the assignment's due date — school breaks are skipped. Nothing changes until you apply.`,
        suggestions: Planner.suggestDistribution(Store.get()),
        noneTitle: 'Workload looks good',
        noneMsg: 'No day is over your workload limit — nothing needs moving.',
        appliedTitle: 'Workload rebalanced'
      });
    });

    function limitOf(state) { return state.settings.dailyLoadLimit || 180; }

    const grid = host.querySelector('#weekGrid');
    const limit = state.settings.dailyLoadLimit || 180;
    days.forEach(d => {
      const items = Priority.allOn(state, d);
      const evts = Priority.eventsOn(state, d);
      const sessions = Priority.sessionsOn(state, d);
      const load = Priority.workloadOn(state, d);
      const col = document.createElement('div');
      col.className = 'week-col' + (d === today ? ' today-col-hl' : '');
      const brk = Planner.breakOn(state, d);
      col.innerHTML = `
        <div class="week-col-head">
          <span class="dow">${Utils.DOW_SHORT[Utils.parseDate(d).getDay()]}${d === today ? ' · today' : ''}</span>
          <span class="dnum">${Utils.fmtDate(d).replace(', ' + Utils.parseDate(d).getFullYear(), '')}</span>
          <div class="row-wrap" style="margin-top:4px">
            ${brk ? `<span class="badge" style="background:var(--purple-soft,var(--surface-2));color:var(--purple)">🏖 ${H(brk.name)}</span>` : ''}
            ${load.total ? `<span class="badge ${load.total >= limit ? 'badge-overdue' : 'badge-cat'}" title="Tasks due: ${Utils.fmtDuration(load.taskLoad)} · sessions: ${Utils.fmtDuration(load.sessionLoad)}">⚖ ${Utils.fmtDuration(load.total)}${load.total >= limit ? ' — heavy!' : ''}</span>` : ''}
            ${evts.length ? `<span class="badge" style="background:var(--green-soft);color:var(--green)">⭐ ${evts.length}</span>` : ''}
          </div>
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

      if (!items.length && !evts.length && !sessions.length) {
        body.innerHTML = `<div class="muted small" style="text-align:center;padding:10px 0">Nothing planned</div>`;
      }
      evts.forEach(e => {
        const mini = document.createElement('div');
        mini.className = 'mini-task';
        mini.style.borderLeftColor = e.color;
        mini.style.background = 'var(--green-soft)';
        mini.innerHTML = `
          <div class="mt-title">${H(e.icon)} ${H(e.title)}</div>
          <div class="mt-meta">⭐ event${e.time ? ' · ' + H(Utils.fmtTime(e.time)) : ''}${e.location ? ' · ' + H(e.location) : ''}</div>`;
        mini.addEventListener('click', () => App.go('activities'));
        body.appendChild(mini);
      });
      sessions.forEach(({ session: s, task: t }) => {
        const mini = document.createElement('div');
        mini.className = 'mini-task' + (s.done ? ' done' : '');
        const cls = UI.classOf(t);
        mini.style.borderLeftColor = cls ? cls.color : 'var(--purple)';
        mini.style.borderLeftStyle = 'dashed';
        mini.innerHTML = `
          <div class="mt-title">${s.time ? H(Utils.fmtTime(s.time)) + ' · ' : ''}🧠 ${H(t.title)}</div>
          <div class="mt-meta">
            <span>${H(Utils.fmtDuration(s.durationMin))}</span>
            ${s.objective ? `<span>${H(s.objective.slice(0, 30))}</span>` : ''}
            ${cls ? `<span>${H(cls.icon)}</span>` : ''}
          </div>`;
        mini.addEventListener('click', () => UI.openTaskViewer(t.id));
        body.appendChild(mini);
      });
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
