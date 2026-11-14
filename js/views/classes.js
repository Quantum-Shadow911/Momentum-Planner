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
      <div id="classWorkspace" style="margin-top:20px"></div>
    `;
    host.querySelector('#newClass').addEventListener('click', () => openClassEditor());

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

    renderWorkspace(host);
  }

  function renderWorkspace(host) {
    const ws = host.querySelector('#classWorkspace');
    const state = Store.get();
    const c = selectedClassId ? Store.getClass(selectedClassId) : null;
    if (!c) { ws.innerHTML = ''; return; }

    const tasks = state.tasks.filter(t => t.classId === c.id);
    const open = tasks.filter(t => t.status !== 'completed').sort(Priority.byDue);
    const tests = open.filter(t => Priority.isAssessment(t));
    const work = open.filter(t => !Priority.isAssessment(t));
    const done = tasks.filter(t => t.status === 'completed');
    const classNotes = state.notes.filter(n => n.classId === c.id);

    ws.innerHTML = `
      <div class="card" style="border-color:${H(c.color)}">
        <div class="card-title">
          <span>${H(c.icon)} ${H(c.name)} — workspace</span>
          <button class="link-btn" id="wsClose">Close ✕</button>
        </div>
        <div class="grid grid-2">
          <div>
            <div class="spread" style="margin-bottom:8px"><h4 style="font-size:13px">📚 Assignments & work (${work.length})</h4>
              <button class="btn btn-sm btn-primary" id="wsAddWork">＋ Add</button></div>
            <div class="task-list" id="wsWork"></div>
          </div>
          <div>
            <div class="spread" style="margin-bottom:8px"><h4 style="font-size:13px">📄 Tests & quizzes (${tests.length})</h4>
              <button class="btn btn-sm btn-primary" id="wsAddTest">＋ Add</button></div>
            <div class="task-list" id="wsTests"></div>
            ${c.slots.length ? `<div class="detail-section"><h4>Class schedule</h4>
              ${c.slots.map(s => `<div class="muted small" style="padding:2px 0">${Utils.DOW[s.day]}: ${Utils.fmtTime(s.start)}–${Utils.fmtTime(s.end)}${c.room ? ' · ' + H(c.room) : ''}</div>`).join('')}
            </div>` : ''}
            ${classNotes.length ? `<div class="detail-section"><h4>📝 Related notes</h4>
              ${classNotes.map(n => `<div class="mini-task" data-note="${H(n.id)}" style="cursor:pointer"><div class="mt-title">${H(n.title)}</div></div>`).join('')}
            </div>` : ''}
            ${done.length ? `<div class="detail-section"><h4>✅ Completed (${done.length})</h4>
              <div class="task-list" id="wsDone"></div></div>` : ''}
          </div>
        </div>
      </div>`;

    const workHost = ws.querySelector('#wsWork');
    const testHost = ws.querySelector('#wsTests');
    if (!work.length) workHost.innerHTML = `<div class="empty"><span class="empty-icon">🎉</span>No open assignments.</div>`;
    work.forEach(t => workHost.appendChild(UI.taskItem(t)));
    if (!tests.length) testHost.innerHTML = `<div class="muted small" style="padding:4px">No tests scheduled.</div>`;
    tests.forEach(t => testHost.appendChild(UI.taskItem(t)));
    const doneHost = ws.querySelector('#wsDone');
    if (doneHost) done.slice(0, 5).forEach(t => doneHost.appendChild(UI.taskItem(t)));

    ws.querySelector('#wsClose').addEventListener('click', () => { selectedClassId = null; render(host); });
    ws.querySelector('#wsAddWork').addEventListener('click', () => UI.openTaskEditor(null, { classId: c.id, assignmentType: 'homework' }));
    ws.querySelector('#wsAddTest').addEventListener('click', () => UI.openTaskEditor(null, { classId: c.id, assignmentType: 'test' }));
    ws.querySelectorAll('[data-note]').forEach(el => el.addEventListener('click', () => { App.go('notes'); Views.notes.openNoteEditor(el.dataset.note); }));
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
