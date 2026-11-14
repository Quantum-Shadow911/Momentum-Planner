/* Momentum — Analytics: real statistics from saved data, canvas charts */
(function (global) {
  'use strict';

  function render(host) {
    const state = Store.get();
    const st = Priority.stats(state);
    const today = Utils.todayStr();

    /* last 14 days completion trend */
    const trend = [];
    for (let i = 13; i >= 0; i--) {
      const d = Utils.addDays(today, -i);
      const count = state.tasks.filter(t => t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) === d).length;
      trend.push({ label: i % 2 === 0 ? Utils.fmtDate(d).replace(', ' + d.slice(0, 4), '').split(' ')[1] : '', value: count, date: d });
    }

    /* category progress */
    const catData = state.categories.map(c => {
      const tasks = state.tasks.filter(t => t.categoryId === c.id);
      const done = tasks.filter(t => t.status === 'completed').length;
      return { label: `${c.icon} ${c.name}`, value: done, max: tasks.length, color: c.color, total: tasks.length };
    }).filter(c => c.total > 0);

    /* completion by weekday (historical) */
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];
    state.tasks.filter(t => t.completedAt).forEach(t => { dowCounts[Utils.parseDate(t.completedAt.slice(0, 10)).getDay()]++; });
    const busiestDow = dowCounts.indexOf(Math.max(...dowCounts));

    /* priority distribution of open tasks */
    const prioCounts = ['urgent', 'high', 'medium', 'low'].map(p => ({
      label: p[0].toUpperCase() + p.slice(1),
      value: state.tasks.filter(t => t.priority === p && t.status !== 'completed').length
    }));

    /* ---- school metrics ---- */
    const classData = state.classes.map(c => {
      const tasks = state.tasks.filter(t => t.classId === c.id);
      const done = tasks.filter(t => t.status === 'completed' || t.submission === 'submitted').length;
      return { label: `${c.icon} ${c.name}`, value: done, max: tasks.length, color: c.color, total: tasks.length };
    }).filter(c => c.total > 0);

    const subCounts = Storage.SUBMISSION_STATES.map(s => ({
      label: { 'not-started': 'Not started', working: 'Working', ready: 'Ready', submitted: 'Submitted' }[s],
      value: state.tasks.filter(t => t.submission === s && t.status !== 'completed').length
    }));

    const sessionTrend = [];
    for (let i = 13; i >= 0; i--) {
      const d = Utils.addDays(today, -i);
      const doneMin = state.tasks.reduce((sum, t) => sum + (t.sessions || []).filter(s => s.done && s.date === d).reduce((x, s) => x + s.durationMin, 0), 0);
      sessionTrend.push({ label: i % 2 === 0 ? Utils.fmtDate(d).replace(', ' + d.slice(0, 4), '').split(' ')[1] : '', value: Math.round(doneMin / 5) / 12, date: d });
    }

    const workloadWeek = [];
    for (let i = 0; i < 7; i++) {
      const d = Utils.addDays(today, i);
      const load = Priority.workloadOn(state, d).total;
      workloadWeek.push({ label: Utils.DOW_SHORT[Utils.parseDate(d).getDay()], value: load, color: load > (state.settings.dailyLoadLimit || 180) ? 'var(--red)' : 'var(--accent)' });
    }

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Productivity Analytics</h2><div class="sub">Every number here is computed from your actual saved tasks.</div></div>
      </div>

      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat"><span class="stat-label">Completed today</span><span class="stat-value tone-green">${st.completedToday}</span><span class="stat-sub">${st.todayPct}% of today's load</span></div>
        <div class="stat"><span class="stat-label">Completed this week</span><span class="stat-value tone-accent">${st.completedWeek}</span><span class="stat-sub">${st.completed} all time</span></div>
        <div class="stat"><span class="stat-label">Remaining</span><span class="stat-value">${st.open}</span><span class="stat-sub">${Utils.fmtDuration(st.remainingMin)} estimated</span></div>
        <div class="stat"><span class="stat-label">Overdue</span><span class="stat-value ${st.overdue ? 'tone-red' : 'tone-green'}">${st.overdue}</span><span class="stat-sub">${st.overdue ? 'catch up soon' : 'all clear'}</span></div>
      </div>

      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-title"><span>📈 Completion trend — last 14 days</span></div>
          <div class="chart-wrap"><canvas id="trendChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title"><span>🥧 Overall completion</span></div>
          <div class="chart-wrap" style="max-width:260px;margin:0 auto"><canvas id="donutChart"></canvas></div>
          <div class="legend" style="justify-content:center">
            <span class="lg-item"><span class="dot" style="background:var(--green)"></span>Completed (${st.completed})</span>
            <span class="lg-item"><span class="dot" style="background:var(--surface-3)"></span>Open (${st.open})</span>
          </div>
        </div>
      </div>

      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-title"><span>🗂 Category progress</span></div>
          ${catData.length ? '<div class="chart-wrap"><canvas id="catChart"></canvas></div><div class="muted small" style="margin-top:8px">Completed / total tasks per category</div>'
            : '<div class="empty"><span class="empty-icon">🗂️</span>Add tasks with categories to see progress.</div>'}
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title"><span>🎓 School progress</span></div>
        ${classData.length ? '<div class="chart-wrap"><canvas id="clsChart"></canvas></div><div class="muted small" style="margin-top:8px">Completed or submitted work per class</div>'
          : '<div class="empty"><span class="empty-icon">📚</span>Add classes in My Classes and assign schoolwork to see per-subject progress.</div>'}
      </div>

      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-title"><span>🧠 Study time — last 14 days</span></div>
          <div class="chart-wrap"><canvas id="sesChart"></canvas></div>
          <div class="muted small" style="margin-top:8px">Hours of completed study sessions per day</div>
        </div>
        <div class="card">
          <div class="card-title"><span>⚖ Workload — next 7 days</span></div>
          <div class="heat-row" style="height:120px;align-items:flex-end">
            ${(() => {
              const max = Math.max(60, ...workloadWeek.map(w => w.value));
              return workloadWeek.map(w => `<div class="heat-cell" style="height:${Math.max(4, Math.round((w.value / max) * 100))}%;${w.value > (state.settings.dailyLoadLimit || 180) ? 'background:var(--red)' : ''}" title="${w.label}: ${Utils.fmtDuration(w.value)}"><strong>${w.label}</strong></div>`).join('');
            })()}
          </div>
          <div class="muted small" style="margin-top:8px">Red bars exceed your ${Utils.fmtDuration(state.settings.dailyLoadLimit || 180)} daily limit — use ⚖ Balance workload in the weekly planner.</div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title"><span>📊 Historical completion by weekday</span></div>
          <div class="heat-row" style="height:120px;align-items:flex-end">
            ${Utils.DOW_SHORT.map((d, i) => {
              const max = Math.max(1, ...dowCounts);
              const pct = Math.round((dowCounts[i] / max) * 100);
              return `<div class="heat-cell" style="height:${Math.max(4, pct)}%;${i === busiestDow && dowCounts[i] > 0 ? 'background:var(--accent)' : ''}" title="${d}: ${dowCounts[i]} tasks"><strong>${d}</strong></div>`;
            }).join('')}
          </div>
          <div class="muted small" style="margin-top:8px">Most productive day: <strong>${busiestDow >= 0 && dowCounts[busiestDow] > 0 ? Utils.DOW[busiestDow] : '—'}</strong></div>
        </div>
        <div class="card">
          <div class="card-title"><span>🎯 Open tasks by priority</span></div>
          <div class="chart-wrap"><canvas id="prioChart"></canvas></div>
          <div class="muted small" style="margin-top:8px">Keep “Urgent” rare — if everything is urgent, nothing is.</div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-title"><span>📮 Submission pipeline (open assignments)</span></div>
        <div class="heat-row" style="height:90px;align-items:flex-end">
          ${(() => {
            const max = Math.max(1, ...subCounts.map(s => s.value));
            const cols = ['var(--surface-3)', 'var(--accent)', 'var(--amber)', 'var(--green)'];
            return subCounts.map((s, i) => `<div class="heat-cell" style="height:${Math.max(4, Math.round((s.value / max) * 100))}%;background:${cols[i]}" title="${s.label}: ${s.value}"><strong>${s.value}</strong><span class="small">${s.label}</span></div>`).join('');
          })()}
        </div>
      </div>
    `;

    Charts.lineChart(host.querySelector('#trendChart'), trend, { height: 200 });
    Charts.donutChart(host.querySelector('#donutChart'), [
      { label: 'Completed', value: st.completed, color: cssVar('--green') },
      { label: 'Open', value: st.open, color: cssVar('--surface-3') }
    ], { centerBig: st.completionPct + '%', centerSmall: 'complete' });
    if (catData.length) Charts.barChart(host.querySelector('#catChart'), catData, { labelWidth: 150 });
    if (classData.length) Charts.barChart(host.querySelector('#clsChart'), classData, { labelWidth: 150 });
    Charts.lineChart(host.querySelector('#sesChart'), sessionTrend, { height: 200 });
    Charts.barChart(host.querySelector('#prioChart'), prioCounts.map((p, i) => ({
      ...p, color: ['var(--prio-urgent)', 'var(--prio-high)', 'var(--prio-medium)', 'var(--prio-low)'][i]
    })), { labelWidth: 90 });
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  global.Views = global.Views || {};
  global.Views.analytics = { title: 'Analytics', render };
})(typeof window !== 'undefined' ? window : globalThis);
