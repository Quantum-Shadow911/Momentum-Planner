/* Momentum — My Classes: subjects with teachers, schedules, assignments, tests, workload */
(function (global) {
  'use strict';

  let selectedClassId = null;

  function render(host) {
    const state = Store.get();

    host.innerHTML = `
      <div class="page-head">
        <div><h2>My Classes</h2><div class="sub">Each subject gets its own workspace: assignments, tests, schedule and workload.</div></div>
        <button class="btn btn-primary" id="newClass">＋ New class</button>
      </div>
      <div class="grid grid-3" id="classGrid"></div>
    `;
    host.querySelector('#newClass').addEventListener('click', () => openClassEditor());

    if (selectedClassId && Store.getClass(selectedClassId)) {
      renderClassPage(host, Store.getClass(selectedClassId));
      return;
    }

    const grid = host.querySelector('#classGrid');
    if (!state.classes.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="empty-icon">📘</span>No classes yet.<br>Add your subjects to organize schoolwork properly.</div>`;
    }

    state.classes.forEach(c => {
      const tasks = state.tasks.filter(t => t.classId === c.id);
      const open = tasks.filter(t => t.status !== 'completed');
      const tests = open.filter(t => Priority.isAssessment(t));
      const nextDue = open.filter(t => t.dueDate).sort(Priority.byDue)[0];
      const load = open.reduce((s, t) => s + (t.estimateMin || 0), 0);
      const pct = Store.classProgress(c);
      const card = document.createElement('div');
      card.className = 'card proj-card' + (selectedClassId === c.id ? '' : '');
      card.style.cursor = 'pointer';
      if (selectedClassId === c.id) card.style.borderColor = c.color;
      card.innerHTML = `
        <div class="proj-head">
          <div class="proj-icon" style="background:${H(c.color)}22">${H(c.icon)}</div>
          <div class="grow">
            <div class="proj-name">${H(c.name)}</div>
            <div class="row-wrap" style="margin-top:4px">
              ${c.teacher ? `<span class="muted small">👩‍🏫 ${H(c.teacher)}</span>` : ''}
              ${c.room ? `<span class="muted small">📍 ${H(c.room)}</span>` : ''}
            </div>
          </div>
          <div class="task-actions">
            <button class="icon-btn" data-act="edit" title="Edit class">✏️</button>
            <button class="icon-btn" data-act="delete" title="Delete class">🗑️</button>
          </div>
        </div>
        <div class="row-wrap">
          <span class="badge">📚 ${open.length} open</span>
          ${tests.length ? `<span class="badge badge-today">📄 ${tests.length} test${tests.length === 1 ? '' : 's'} upcoming</span>` : ''}
          ${nextDue ? `<span class="badge ${Utils.daysUntil(nextDue.dueDate) < 0 ? 'badge-overdue' : 'badge-cat'}">next: ${H(Utils.fmtDateSmart(nextDue.dueDate))}</span>` : ''}
        </div>
        <div>
          <div class="spread small" style="margin-bottom:5px"><span class="muted">Workload ${load ? '· ~' + Utils.fmtDuration(load) + ' left' : ''}</span><strong>${pct}%</strong></div>
          <div class="progress ${pct === 100 ? 'green' : ''}"><div style="width:${pct}%"></div></div>
        </div>
        ${c.slots.length ? `<div class="muted small">🗓 ${c.slots.map(s => `${Utils.DOW_SHORT[s.day]} ${Utils.fmtTime(s.start)}–${Utils.fmtTime(s.end)}`).join(' · ')}</div>` : ''}
      `;
      card.querySelector('[data-act="edit"]').addEventListener('click', e => { e.stopPropagation(); openClassEditor(c.id); });
      card.querySelector('[data-act="delete"]').addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await UI.confirmDialog({
          title: 'Delete class?',
          message: `“${c.name}” will be moved to trash. Its ${tasks.length} assignment${tasks.length === 1 ? '' : 's'} are kept but become unassigned.`,
          confirmLabel: 'Delete', danger: true
        });
        if (ok) {
          if (selectedClassId === c.id) selectedClassId = null;
          Store.deleteClass(c.id);
          UI.toast('info', 'Class deleted', 'Restore it from Settings → Trash.');
        }
      });
      card.addEventListener('click', () => {
        selectedClassId = selectedClassId === c.id ? null : c.id;
        render(host);
      });
      grid.appendChild(card);
    });

  }

  function renderClassPage(host, c) {
    const state = Store.get();
    const tasks = state.tasks.filter(t => t.classId === c.id);
    const open = tasks.filter(t => t.status !== 'completed').sort(Priority.byDue);
    const tests = open.filter(t => Priority.isAssessment(t));
    const work = open.filter(t => !Priority.isAssessment(t));
    const done = tasks.filter(t => t.status === 'completed')
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    const pct = Store.classProgress(c);
    const loadLeft = open.reduce((s2, t) => s2 + Math.max(0, (t.estimateMin || 0) - (t.sessions || []).reduce((x, y) => x + y.durationMin, 0)), 0);
    const today = Utils.todayStr();
    const sessions = [];
    state.tasks.filter(t => t.classId === c.id && t.status !== 'completed').forEach(t => {
      (t.sessions || []).forEach(s2 => { if (!s2.done && s2.date && s2.date >= today) sessions.push({ session: s2, task: t }); });
    });
    sessions.sort((a, b) => (a.session.date + (a.session.time || '')).localeCompare(b.session.date + (b.session.time || '')));

    const periodBits = [
      c.period ? 'Period ' + c.period : '',
      c.teacher ? H(c.teacher) : '',
      c.room ? 'Room ' + H(c.room) : ''
    ].filter(Boolean).join('  \u00b7  ');

    host.innerHTML = `
      <div class="page-head">
        <div>
          <h2>${H(c.icon)} ${H(c.name)}</h2>
          <div class="sub">${periodBits}${c.slots.length ? '  \u00b7  ' + c.slots.map(sl => `${Utils.DOW_SHORT[sl.day]} ${Utils.fmtTime(sl.start)}\u2013${Utils.fmtTime(sl.end)}`).join(', ') : ''}</div>
        </div>
        <div class="row">
          <button class="btn" id="cpBack">← All classes</button>
          <button class="btn" id="cpEdit">✏️ Edit class</button>
          <button class="btn btn-primary" id="cpAddWork">＋ Assignment</button>
          <button class="btn" id="cpAddTest">＋ Test / quiz</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat"><span class="stat-label">Open assignments</span><span class="stat-value">${work.length}</span><span class="stat-sub">${loadLeft ? '~' + Utils.fmtDuration(loadLeft) + ' of work left' : 'all caught up'}</span></div>
        <div class="stat"><span class="stat-label">Tests & quizzes</span><span class="stat-value ${tests.length ? 'tone-red' : 'tone-green'}">${tests.length}</span><span class="stat-sub">upcoming</span></div>
        <div class="stat"><span class="stat-label">Completed</span><span class="stat-value tone-green">${done.length}</span><span class="stat-sub">of ${tasks.length} total</span></div>
        <div class="stat"><span class="stat-label">Class progress</span><span class="stat-value tone-accent">${pct}%</span><span class="stat-sub"><span class="progress ${pct === 100 ? 'green' : ''}" style="margin-top:6px"><div style="width:${pct}%"></div></span></span></div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title"><span>📚 Assignments & homework (${work.length})</span>
          <button class="btn btn-sm btn-primary" id="cpAddWork2">＋ Add</button></div>
        <div class="task-list" id="cpWork"></div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title"><span>📄 Tests & quizzes (${tests.length})</span>
          <button class="btn btn-sm btn-primary" id="cpAddTest2">＋ Add</button></div>
        <div class="task-list" id="cpTests"></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title"><span>🧠 Planned study sessions (${sessions.length})</span></div>
          <div class="task-list" id="cpSessions"></div>
        </div>
        <div class="card">
          <div class="card-title"><span>✅ Completed (${done.length})</span></div>
          <div class="task-list" id="cpDone"></div>
        </div>
      </div>
    `;

    const workHost = host.querySelector('#cpWork');
    if (!work.length) workHost.innerHTML = `<div class="empty"><span class="empty-icon">🎉</span>No open assignments for this class.</div>`;
    work.forEach(t => workHost.appendChild(UI.taskItem(t)));

    const testHost = host.querySelector('#cpTests');
    if (!tests.length) testHost.innerHTML = `<div class="empty"><span class="empty-icon">📄</span>No tests or quizzes scheduled. 🎉</div>`;
    tests.forEach(t => {
      const n = Utils.daysUntil(t.dueDate);
      const el = UI.taskItem(t);
      if (t.dueDate) {
        const meta = el.querySelector('.task-meta');
        const badge = document.createElement('span');
        badge.className = 'badge ' + (n < 0 ? 'badge-overdue' : n <= 2 ? 'badge-today' : 'badge-cat');
        badge.textContent = n < 0 ? `${-n}d overdue` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
        meta.appendChild(badge);
      }
      testHost.appendChild(el);
    });

    const sesHost = host.querySelector('#cpSessions');
    if (!sessions.length) sesHost.innerHTML = `<div class="empty"><span class="empty-icon">🧠</span>No study sessions planned. Open an assignment and “Plan a session”.</div>`;
    sessions.slice(0, 8).forEach(({ session: s2, task: t }) => {
      const row = document.createElement('div');
      row.className = 'task-item';
      row.innerHTML = `
        <div class="task-main">
          <div class="task-title">${H(t.title)}</div>
          <div class="task-meta">
            <span class="meta-txt">📅 ${H(Utils.fmtDateSmart(s2.date))}</span>
            ${s2.time ? `<span class="meta-txt">🕐 ${H(Utils.fmtTime(s2.time))}</span>` : ''}
            <span class="meta-txt">⏱ ${H(Utils.fmtDuration(s2.durationMin))}</span>
            ${s2.objective ? `<span class="meta-txt">🎯 ${H(s2.objective)}</span>` : ''}
          </div>
        </div>`;
      row.querySelector('.task-main').addEventListener('click', () => UI.openTaskViewer(t.id));
      sesHost.appendChild(row);
    });

    const doneHost = host.querySelector('#cpDone');
    if (!done.length) doneHost.innerHTML = `<div class="empty"><span class="empty-icon">✅</span>Nothing completed yet for this class.</div>`;
    done.slice(0, 8).forEach(t => doneHost.appendChild(UI.taskItem(t)));

    host.querySelector('#cpBack').addEventListener('click', () => { selectedClassId = null; render(host); });
    host.querySelector('#cpEdit').addEventListener('click', () => openClassEditor(c.id));
    const addWork = () => UI.openTaskEditor(null, { classId: c.id, assignmentType: 'homework' });
    const addTest = () => UI.openTaskEditor(null, { classId: c.id, assignmentType: 'test' });
    host.querySelector('#cpAddWork').addEventListener('click', addWork);
    host.querySelector('#cpAddWork2').addEventListener('click', addWork);
    host.querySelector('#cpAddTest').addEventListener('click', addTest);
    host.querySelector('#cpAddTest2').addEventListener('click', addTest);
  }

  function openClassEditor(classId) {
    const state = Store.get();
    const c = classId ? Store.getClass(classId) : null;
    const base = c || {
      name: '', teacher: '', room: '', color: UI.COLOR_SWATCHES[Math.floor(Math.random() * UI.COLOR_SWATCHES.length)],
      icon: '📘', slots: []
    };

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="field-row-3">
        <div class="field"><label>Subject name *</label><input class="input" id="clName" maxlength="80" value="${H(base.name)}" placeholder="e.g. Mathematics"></div>
        <div class="field"><label>Teacher</label><input class="input" id="clTeacher" maxlength="80" value="${H(base.teacher)}" placeholder="optional"></div>
        <div class="field"><label>Room</label><input class="input" id="clRoom" maxlength="40" value="${H(base.room)}" placeholder="optional"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Icon</label><select class="select" id="clIcon">
          ${['📘', '➗', '🧪', '📖', '🏛️', '🌍', '🎨', '🎵', '💻', '⚗️', '🧬', '📐'].map(i => `<option ${i === base.icon ? 'selected' : ''}>${i}</option>`).join('')}
        </select></div>
        <div class="field"><label>Color</label><div class="row-wrap" id="clColors">
          ${UI.COLOR_SWATCHES.map(col => `<button type="button" data-c="${col}" style="width:26px;height:26px;border-radius:50%;background:${col};border:${col === base.color ? '3px solid var(--text)' : '2px solid var(--border)'}"></button>`).join('')}
        </div></div>
      </div>
      <div class="field">
        <label>Weekly schedule <span class="muted">(when this class meets)</span></label>
        <div id="clSlots"></div>
        <button class="btn btn-sm btn-ghost" type="button" id="clAddSlot">＋ Add time slot</button>
      </div>
      <div class="form-error" id="clError"></div>`;

    let color = base.color;
    const slotHost = body.querySelector('#clSlots');
    function addSlotRow(slot) {
      const row = document.createElement('div');
      row.className = 'subtask-editor-row';
      row.innerHTML = `
        <select class="select" style="flex:0 0 110px">${Utils.DOW.map((d, i) => `<option value="${i}" ${slot && slot.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <input class="input slot-start" style="flex:0 0 96px" type="time" value="${H(slot ? slot.start : '09:00')}">
        <input class="input slot-end" style="flex:0 0 96px" type="time" value="${H(slot ? slot.end : '10:00')}">
        <button class="icon-btn" type="button">✕</button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      slotHost.appendChild(row);
    }
    base.slots.forEach(addSlotRow);
    body.querySelector('#clAddSlot').addEventListener('click', () => addSlotRow(null));
    body.querySelector('#clColors').addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      color = b.dataset.c;
      body.querySelectorAll('#clColors [data-c]').forEach(x => {
        x.style.border = x.dataset.c === color ? '3px solid var(--text)' : '2px solid var(--border)';
      });
    });

    UI.openModal({
      title: c ? 'Edit class' : 'New class',
      body,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => UI.closeModal() },
        {
          label: c ? 'Save changes' : 'Create class', class: 'btn-primary',
          onClick: () => {
            const name = body.querySelector('#clName').value.trim();
            if (!name) { body.querySelector('#clError').textContent = 'Please enter the subject name.'; return false; }
            Store.saveClass({
              id: classId || undefined, name,
              teacher: body.querySelector('#clTeacher').value.trim(),
              room: body.querySelector('#clRoom').value.trim(),
              icon: body.querySelector('#clIcon').value,
              color,
              slots: Array.from(slotHost.querySelectorAll('.subtask-editor-row')).map(row => ({
                day: Number(row.querySelector('select').value),
                start: row.querySelector('.slot-start').value,
                end: row.querySelector('.slot-end').value
              })).filter(s => s.start && s.end)
            });
            UI.toast('success', c ? 'Class updated' : 'Class created', name);
            UI.closeModal();
          }
        }
      ]
    });
  }

  function selectClass(id) { selectedClassId = id; }

  global.Views = global.Views || {};
  global.Views.classes = { title: 'My Classes', render, openClassEditor, selectClass };
})(typeof window !== 'undefined' ? window : globalThis);
