/* Momentum — Exams & Quizzes: assessments with revision sessions, per class */
(function (global) {
  'use strict';

  function render(host) {
    const state = Store.get();
    const today = Utils.todayStr();
    const assessments = state.tasks
      .filter(t => Priority.isAssessment(t) && t.status !== 'completed' && t.dueDate)
      .sort(Priority.byDue);
    const upcoming = assessments.filter(t => t.dueDate >= today);
    const past = assessments.filter(t => t.dueDate < today);
    const recentlyDone = state.tasks
      .filter(t => Priority.isAssessment(t) && t.status === 'completed')
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 6);

    const byClass = {};
    upcoming.forEach(t => {
      const key = t.classId || 'none';
      (byClass[key] = byClass[key] || []).push(t);
    });

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Exams & Quizzes</h2><div class="sub">Every upcoming assessment with its revision plan — organize study by subject and topic.</div></div>
        <button class="btn btn-primary" id="exNew">＋ New assessment</button>
      </div>
      <div class="row-wrap" style="margin-bottom:16px" id="exClassChips">
        ${state.classes.map(c => {
          const list = byClass[c.id] || [];
          return list.length ? `<span class="badge badge-cat" style="padding:6px 12px"><span class="dot" style="background:${H(c.color)}"></span>${H(c.icon)} ${H(c.name)} · ${list.length}</span>` : '';
        }).join('')}
        ${(byClass.none || []).length ? `<span class="badge" style="padding:6px 12px">❓ Unassigned · ${byClass.none.length}</span>` : ''}
        ${!upcoming.length ? '<span class="muted small">No upcoming assessments.</span>' : ''}
      </div>
      <div class="task-list" id="exList"></div>
      ${past.length ? `
      <div class="detail-section" style="margin-top:20px">
        <button class="link-btn" id="exPastToggle">▸ Past / missed assessments (${past.length})</button>
        <div class="task-list" id="exPast" style="margin-top:10px"></div>
      </div>` : ''}
      ${recentlyDone.length ? `
      <div class="detail-section" style="margin-top:20px">
        <button class="link-btn" id="exDoneToggle">▸ Recently completed assessments (${recentlyDone.length})</button>
        <div class="task-list" id="exDone" style="margin-top:10px"></div>
      </div>` : ''}
    `;

    host.querySelector('#exNew').addEventListener('click', () => UI.openTaskEditor(null, { assignmentType: 'test', categoryId: (state.categories.find(c => /study|exam/i.test(c.name)) || {}).id || null }));

    const list = host.querySelector('#exList');
    if (!upcoming.length) {
      list.innerHTML = `<div class="empty"><span class="empty-icon">📄</span>No upcoming tests or quizzes.<br>Create one with type “Quiz” or “Test” — it will appear here with its revision plan.</div>`;
    }
    upcoming.forEach(t => list.appendChild(examCard(t, state, today)));

    let showPast = false, showDone = false;
    const pastToggle = host.querySelector('#exPastToggle');
    const doneToggle = host.querySelector('#exDoneToggle');
    if (pastToggle) pastToggle.addEventListener('click', () => {
      showPast = !showPast;
      pastToggle.textContent = (showPast ? '▾' : '▸') + ` Past / missed assessments (${past.length})`;
      const area = host.querySelector('#exPast');
      area.innerHTML = '';
      if (showPast) past.forEach(t => area.appendChild(examCard(t, state, today)));
    });
    if (doneToggle) doneToggle.addEventListener('click', () => {
      showDone = !showDone;
      doneToggle.textContent = (showDone ? '▾' : '▸') + ` Recently completed assessments (${recentlyDone.length})`;
      const area = host.querySelector('#exDone');
      area.innerHTML = '';
      if (showDone) recentlyDone.forEach(t => area.appendChild(UI.taskItem(t)));
    });
  }

  function examCard(t, state, today) {
    const cls = UI.classOf(t);
    const sessions = (t.sessions || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const doneSes = sessions.filter(s => s.done).length;
    const n = Utils.daysUntil(t.dueDate, today);
    const card = document.createElement('div');
    card.className = 'card exam-card';
    card.style.borderLeft = `4px solid ${cls ? cls.color : 'var(--red)'}`;
    card.innerHTML = `
      <div class="spread row-wrap">
        <div class="grow">
          <div class="task-title" style="font-size:15px;cursor:pointer" data-open>${H(t.title)}</div>
          <div class="task-meta">
            ${UI.prioBadge(t)}
            <span class="badge ${n < 0 ? 'badge-overdue' : n <= 2 ? 'badge-today' : 'badge-cat'}">${n < 0 ? `${Math.abs(n)}d overdue` : n === 0 ? 'Today' : `in ${n} day${n === 1 ? '' : 's'}`}</span>
            ${cls ? `<span class="badge badge-cat"><span class="dot" style="background:${H(cls.color)}"></span>${H(cls.icon)} ${H(cls.name)}</span>` : ''}
            ${UI.typeBadge(t)}
            ${sessions.length ? `<span class="meta-txt">🧠 ${sessions.filter(s => s.done).reduce((s, x) => s + x.durationMin, 0)}m revised</span>` : ''}
          </div>
        </div>
        <button class="btn btn-sm" data-rev>＋ Revision session</button>
      </div>
      ${sessions.length ? `
        <div class="task-list" style="margin-top:10px">
          ${sessions.map(s => `
            <div class="task-item" style="padding:6px 10px">
              <button class="task-check ${s.done ? 'checked' : ''}" data-ses="${H(s.id)}">✓</button>
              <div class="task-main">
                <div class="task-title" style="font-size:13px;${s.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${H(Utils.fmtDateSmart(s.date))}${s.time ? ' · ' + H(Utils.fmtTime(s.time)) : ''} · ${H(Utils.fmtDuration(s.durationMin))}</div>
                ${s.objective ? `<div class="muted small">${H(s.objective)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>
        <div class="muted small" style="margin-top:6px">Revision ${doneSes}/${sessions.length} sessions done</div>`
      : `<div class="muted small" style="margin-top:8px">No revision sessions planned yet — add one to space out your study.</div>`}
      ${t.notes ? `<div class="muted small" style="margin-top:6px;white-space:pre-wrap">${H(t.notes)}</div>` : ''}
    `;
    card.querySelector('[data-open]').addEventListener('click', () => UI.openTaskViewer(t.id));
    card.querySelector('[data-rev]').addEventListener('click', () => openRevisionEditor(t));
    card.querySelectorAll('[data-ses]').forEach(btn => {
      btn.addEventListener('click', () => Store.toggleSession(t.id, btn.dataset.ses));
    });
    return card;
  }

  function openRevisionEditor(t) {
    const today = Utils.todayStr();
    const lastDate = (t.sessions || []).reduce((m, s) => s.date > m ? s.date : m, today);
    UI.openModal({
      title: `Revision session — ${t.title}`,
      body: `
        <div class="field-row-3">
          <div class="field"><label>Date</label><input class="input" type="date" id="revDate" value="${H(Utils.addDays(lastDate, 1) || today)}"></div>
          <div class="field"><label>Time (optional)</label><input class="input" type="time" id="revTime"></div>
          <div class="field"><label>Duration (min)</label><input class="input" type="number" id="revDur" min="5" step="5" value="45"></div>
        </div>
        <div class="field"><label>Objective</label><input class="input" id="revObj" placeholder="e.g. Chapter 4 flashcards, past paper…"></div>`,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => UI.closeModal() },
        {
          label: 'Add session', class: 'btn-primary',
          onClick: () => {
            const date = document.getElementById('revDate').value;
            if (!date) return false;
            Store.addSession(t.id, {
              date,
              time: document.getElementById('revTime').value || null,
              durationMin: Number(document.getElementById('revDur').value) || 45,
              objective: document.getElementById('revObj').value.trim()
            });
            UI.toast('success', 'Revision session added', `${t.title} · ${Utils.fmtDateSmart(date)}`);
            UI.closeModal();
          }
        }
      ]
    });
  }

  global.Views = global.Views || {};
  global.Views.exams = { title: 'Exams & Quizzes', render };
})(typeof window !== 'undefined' ? window : globalThis);
