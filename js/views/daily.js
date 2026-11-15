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
    const conflicts = Planner.conflictsOn(state, currentDate);
    const dow = Utils.parseDate(currentDate).getDay();
    const minsNow = new Date().getHours() * 60 + new Date().getMinutes();
    const isToday = currentDate === Utils.todayStr();
    const classesToday = state.classes
      .map(c => ({ c, slot: (c.slots || []).find(x => x.day === dow) }))
      .filter(x => x.slot)
      .sort((a, b) => Utils.minutesOf(a.slot.start) - Utils.minutesOf(b.slot.start));

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Daily Planner</h2><div class="sub">Drag tasks between hours to reschedule. Click a task for details.</div></div>
        <div class="row">
          <button class="btn" id="dBalance" title="Move study sessions off overloaded days">⚖ Balance workload</button>
          <button class="btn" id="dSuggest" title="Suggest study sessions for upcoming deadlines, placed after your last class on lighter days">✨ Suggest sessions</button>
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
      ${classesToday.length ? `<div class="card" style="padding:12px 18px;margin-bottom:14px;border-left:4px solid var(--accent)">
        <div class="card-title" style="margin-bottom:8px"><span>🏫 Today's classes (${classesToday.length})</span>
          <button class="link-btn" data-go="classes">My classes →</button></div>
        <div class="row-wrap" id="dayClasses"></div>
      </div>` : ''}
      ${conflicts.length ? `<div class="card" style="padding:10px 18px;margin-bottom:14px;border-left:4px solid var(--red)">
        <strong style="color:var(--red)">⚠ ${conflicts.length} scheduling conflict${conflicts.length > 1 ? 's' : ''}</strong>
        <div class="muted small" style="margin-top:4px">${conflicts.slice(0, 4).map(c =>
          `${H(c.a.label)} (${H(Utils.fmtTime(Utils.hhmm(c.a.start)))}–${H(Utils.fmtTime(Utils.hhmm(c.a.end)))}) overlaps ${H(c.b.label)} (${H(Utils.fmtTime(Utils.hhmm(c.b.start)))}–${H(Utils.fmtTime(Utils.hhmm(c.b.end)))})`).join('<br>')}</div>
      </div>` : ''}
      ${Planner.breakOn(state, currentDate) ? `<div class="card" style="padding:10px 18px;margin-bottom:14px;border-left:4px solid var(--purple)">
        <strong>🏖 ${H(Planner.breakOn(state, currentDate).name)}</strong> <span class="muted small">— school break; planners skip this day when balancing workload.</span>
      </div>` : ''}
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
    host.querySelector('#dSuggest').addEventListener('click', () => {
      const plans = AI.suggestPlan(Store.get(), currentDate);
      if (!plans.length) { UI.toast('info', 'Nothing to suggest', 'No upcoming deadlines need extra sessions — you are already on track.'); return; }
      const body = document.createElement('div');
      body.innerHTML = `
        <p class="muted small" style="margin-top:0">Suggested study sessions for upcoming deadlines — placed after your last class on days with room left. Tick what you want, then apply.</p>
        <div id="planList">${plans.map((pl, i) => `
          <label class="settings-row" style="cursor:pointer">
            <input type="checkbox" class="plan-check" data-i="${i}" checked style="margin-right:10px">
            <div class="grow"><div class="s-label">${H(pl.taskTitle)}</div>
            <div class="s-desc">${H(Utils.fmtDateSmart(pl.date))} · ${H(Utils.fmtTime(pl.time))} · ${H(Utils.fmtDuration(pl.durationMin))} — ${H(pl.objective)}</div></div>
          </label>`).join('')}</div>`;
      UI.openModal({
        title: '✨ Suggested study plan', body,
        buttons: [
          { label: 'Cancel', onClick: () => UI.closeModal() },
          { label: 'Apply', class: 'btn-primary', onClick: () => {
              const checks = [...body.querySelectorAll('.plan-check')];
              let n = 0;
              checks.forEach(c => {
                if (!c.checked) return;
                const pl = plans[Number(c.dataset.i)];
                Store.addSession(pl.taskId, { date: pl.date, time: pl.time, durationMin: pl.durationMin, objective: pl.objective });
                n++;
              });
              UI.closeModal();
              UI.toast('success', 'Sessions added', n + ' study session(s) added to your plan.');
              render(host);
            } }
        ]
      });
    });
    host.querySelector('#dBalance').addEventListener('click', () => {
      UI.openSuggestionModal({
        title: '⚖ Balance workload',
        intro: `Days over your ${Utils.fmtDuration(state.settings.dailyLoadLimit || 180)} limit are listed below. Study sessions move to the lightest day that is still before the assignment's due date — school breaks are skipped. Nothing changes until you apply.`,
        suggestions: Planner.suggestDistribution(Store.get()),
        noneTitle: 'Workload looks good',
        noneMsg: 'No day is over your workload limit — nothing needs moving.',
        appliedTitle: 'Workload rebalanced'
      });
    });

    const clsHost = host.querySelector('#dayClasses');
    if (clsHost) {
      classesToday.forEach(({ c, slot }) => {
        const isNow = isToday && Utils.minutesOf(slot.start) <= minsNow && minsNow < Utils.minutesOf(slot.end);
        const chip = document.createElement('span');
        chip.className = 'chip' + (isNow ? ' chip-now' : '');
        chip.innerHTML = `<strong>${H(c.icon)} ${H(c.name)}</strong>
          <span class="muted small">${H(Utils.fmtTime(slot.start))}–${H(Utils.fmtTime(slot.end))}${c.room ? ' · ' + H(c.room) : ''}${isNow ? ' · <b>now</b>' : ''}</span>`;
        chip.addEventListener('click', () => { Views.classes.selectClass(c.id); App.go('classes'); });
        clsHost.appendChild(chip);
      });
    }
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
        if ((t.sessions || []).length > 0) {
          const undone = t.sessions.filter(s => !s.done).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
          if (undone.length) {
            Store.moveSession(t.id, undone[0].id, currentDate, hourKey);
            UI.toast('success', 'Study session moved', `“${t.title}” work session → ${Utils.fmtDate(currentDate)} ${Utils.fmtTime(hourKey)} · deadline kept at ${Utils.fmtDate(t.dueDate)}`);
          } else {
            Store.addSession(t.id, { date: currentDate, time: hourKey, durationMin: 45, objective: 'Extra work' });
            UI.toast('success', 'Study session added', `“${t.title}” → ${Utils.fmtDate(currentDate)} ${Utils.fmtTime(hourKey)} · deadline unchanged`);
          }
        } else {
          Store.saveTask({ ...t, dueDate: currentDate, time: hourKey });
          UI.toast('success', 'Rescheduled', `“${t.title}” → ${Utils.fmtDate(currentDate)} ${Utils.fmtTime(hourKey)}`);
        }
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
  global.Views.daily = { title: 'Daily Planner', render, currentDate: () => currentDate, setDate: d => { currentDate = d; } };
})(typeof window !== 'undefined' ? window : globalThis);
