/* Momentum — shared UI: toasts, modals, task editor, task items, confirm dialogs */
(function (global) {
  'use strict';

  const H = s => Utils.escapeHtml(s);

  /* Only allow safe URL schemes in user-provided links (blocks javascript:, data:, vbscript:...). */
  function safeUrl(u) {
    const raw = String(u || '').trim();
    if (!raw) return null;
    try {
      const parsed = new URL(raw, 'https://momentum.invalid');
      if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return raw;
      return null;
    } catch (e) { return null; }
  }

  /* ================= Toasts ================= */
  function toast(kind, title, msg, onClick) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = 'toast toast-' + (kind || 'info');
    el.innerHTML = `
      <div class="toast-body">
        <div class="toast-title">${H(title)}</div>
        ${msg ? `<div class="toast-msg">${H(msg)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss">✕</button>`;
    const close = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 220);
    };
    el.querySelector('.toast-close').addEventListener('click', close);
    if (onClick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', e => {
        if (e.target.classList.contains('toast-close')) return;
        onClick(); close();
      });
    }
    root.appendChild(el);
    setTimeout(close, 6500);
    return el;
  }

  /* ================= Modals ================= */
  let openModalEl = null;

  function openModal(opts) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal ${opts.large ? 'modal-lg' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${H(opts.title || '')}</h3>
          <button class="icon-btn" data-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body"></div>
        ${opts.footer === false ? '' : '<div class="modal-foot"></div>'}
      </div>`;
    const body = backdrop.querySelector('.modal-body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    if (opts.footer !== false) {
      const foot = backdrop.querySelector('.modal-foot');
      (opts.buttons || [{ label: 'Close' }]).forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (b.class || 'btn-ghost');
        btn.textContent = b.label;
        btn.addEventListener('click', () => {
          if (b.onClick) {
            const result = b.onClick(backdrop);
            if (result === false) return;
          } else closeModal();
        });
        foot.appendChild(btn);
      });
    }
    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) closeModal(); });
    backdrop.querySelector('[data-close]').addEventListener('click', closeModal);
    document.getElementById('modalRoot').appendChild(backdrop);
    openModalEl = backdrop;
    const firstInput = body.querySelector('input, select, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
    if (opts.onOpen) opts.onOpen(backdrop, body);
    return backdrop;
  }

  function closeModal() {
    if (openModalEl) { openModalEl.remove(); openModalEl = null; }
  }

  function modalIsOpen() { return !!openModalEl; }

  function confirmDialog(opts) {
    return new Promise(resolve => {
      openModal({
        title: opts.title || 'Are you sure?',
        body: `<p style="margin:0;color:var(--text-2)">${H(opts.message || '')}</p>` +
          (opts.requireText ? `<div class="field" style="margin-top:12px"><label>Type <strong>${H(opts.requireText)}</strong> to confirm</label><input class="input" id="confirmText" autocomplete="off" spellcheck="false"></div>` : ''),
        buttons: [
          { label: opts.cancelLabel || 'Cancel', class: 'btn-ghost', onClick: () => { closeModal(); resolve(false); } },
          { label: opts.confirmLabel || 'Confirm', class: opts.danger ? 'btn-danger' : 'btn-primary', onClick: () => {
            if (opts.requireText) {
              const inp = document.getElementById('confirmText');
              if (!inp || inp.value.trim().toLowerCase() !== opts.requireText.toLowerCase()) {
                if (inp) inp.style.borderColor = 'var(--red)';
                return;
              }
            }
            closeModal(); resolve(true);
          } }
        ],
        onCloseForce: () => resolve(false)
      });
    });
  }

  /* ================= Badges & fragments ================= */

  function catOf(task) {
    return Store.get().categories.find(c => c.id === task.categoryId) || null;
  }

  function classOf(task) {
    return Store.get().classes.find(c => c.id === task.classId) || null;
  }

  const TYPE_LABELS = { general: '', homework: '📝 Homework', essay: '✍️ Essay', project: '📊 Project', lab: '🧪 Lab', reading: '📖 Reading', revision: '🔄 Revision', 'test-prep': '🧠 Test prep', quiz: '❓ Quiz', test: '📄 Test' };
  const SUBMISSION_LABELS = { 'not-started': '', working: '◐ working', ready: '✋ ready to submit', submitted: '📮 submitted' };

  function classBadge(task) {
    const c = classOf(task);
    if (!c) return '';
    return `<span class="badge badge-cat"><span class="dot" style="background:${H(c.color)}"></span>${H(c.icon)} ${H(c.name)}</span>`;
  }

  function typeBadge(task) {
    const label = TYPE_LABELS[task.assignmentType] || '';
    if (!label) return '';
    const cls = Priority.isAssessment(task) ? 'badge-today' : 'badge-cat';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function submissionBadge(task) {
    const label = SUBMISSION_LABELS[task.submission] || '';
    if (!label) return '';
    const cls = task.submission === 'submitted' ? 'badge-done' : task.submission === 'ready' ? 'badge-today' : '';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function prioBadge(task) {
    const p = task.priority;
    const labels = { urgent: '🔴 Urgent', high: '🟠 High', medium: '🔵 Medium', low: '⚪ Low' };
    return `<span class="badge badge-prio-${p}">${labels[p]}</span>`;
  }

  function dueBadge(task) {
    if (!task.dueDate) return '';
    const n = Utils.daysUntil(task.dueDate);
    if (task.status === 'completed') return `<span class="meta-txt">📅 ${H(Utils.fmtDateSmart(task.dueDate))}</span>`;
    if (n < 0) return `<span class="badge badge-overdue">⚠ ${Math.abs(n)}d overdue</span>`;
    if (n === 0) return `<span class="badge badge-today">Today${task.time ? ' · ' + H(Utils.fmtTime(task.time)) : ''}</span>`;
    return `<span class="meta-txt">📅 ${H(Utils.fmtDateSmart(task.dueDate))}${task.time ? ' · ' + H(Utils.fmtTime(task.time)) : ''}</span>`;
  }

  function catBadge(task) {
    const c = catOf(task);
    if (!c) return '';
    return `<span class="badge badge-cat"><span class="dot" style="background:${H(c.color)}"></span>${H(c.icon)} ${H(c.name)}</span>`;
  }

  function tagBadges(task) {
    return (task.tags || []).map(t => `<span class="tag-chip">#${H(t)}</span>`).join('');
  }

  function statusBadge(task) {
    const map = {
      'not-started': ['○ Not started', ''],
      'in-progress': ['◐ In progress', 'badge-today'],
      'waiting': ['⏸ Waiting', 'badge-cat'],
      'completed': ['✓ Done', 'badge-done']
    };
    const [label, cls] = map[task.status] || map['not-started'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  /* ================= Task item (used across list views) ================= */

  function taskItem(task, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'task-item' + (task.status === 'completed' ? ' done' : '');
    el.draggable = !!opts.draggable;
    if (opts.draggable) el.dataset.taskId = task.id;

    const cat = catOf(task);
    const subDone = task.subtasks.filter(s => s.done).length;
    const subTotal = task.subtasks.length;
    const blocked = Priority.isBlocked(task, Store.get());
    const blockNames = Priority.blockingNames(task, Store.get());

    el.innerHTML = `
      <button class="task-check ${task.status === 'completed' ? 'checked' : ''}" title="Toggle complete" aria-label="Toggle complete">✓</button>
      <div class="task-main">
        <div class="task-title">${H(task.title)}</div>
        <div class="task-meta">
          ${prioBadge(task)}
          ${statusBadge(task)}
          ${dueBadge(task)}
          ${classBadge(task)}
          ${typeBadge(task)}
          ${submissionBadge(task)}
          ${catBadge(task)}
          ${tagBadges(task)}
          ${task.estimateMin ? `<span class="meta-txt">⏱ ~${H(Utils.fmtDuration(task.estimateMin))}</span>` : ''}
          ${subTotal ? `<span class="meta-txt">☑ ${subDone}/${subTotal}</span>` : ''}
          ${task.sessions && task.sessions.length ? `<span class="meta-txt">🗓 ${task.sessions.filter(s => s.done).length}/${task.sessions.length} sessions</span>` : ''}
          ${task.recurrence.type !== 'none' ? `<span class="meta-txt">🔁 ${H(recurrenceLabel(task.recurrence))}</span>` : ''}
          ${task.projectId ? `<span class="meta-txt">📁 ${H((Store.getProject(task.projectId) || {}).name || '')}</span>` : ''}
          ${blocked ? `<span class="badge badge-overdue" title="Blocked by: ${H(blockNames.join(', '))}">⛔ blocked</span>` : ''}
        </div>
        ${subTotal ? `<div class="subtask-track"><div class="progress slim green"><div style="width:${Math.round((subDone / subTotal) * 100)}%"></div></div></div>` : ''}
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-act="edit" title="Edit task">✏️</button>
        <button class="icon-btn" data-act="duplicate" title="Duplicate task">⧉</button>
        <button class="icon-btn" data-act="delete" title="Delete task">🗑️</button>
      </div>`;

    el.querySelector('.task-check').addEventListener('click', e => {
      e.stopPropagation();
      Store.toggleTask(task.id);
    });
    el.querySelector('.task-main').addEventListener('click', () => opts.onOpen ? opts.onOpen(task) : openTaskViewer(task.id));
    el.querySelector('[data-act="edit"]').addEventListener('click', () => openTaskEditor(task.id));
    el.querySelector('[data-act="duplicate"]').addEventListener('click', () => {
      const copy = Store.duplicateTask(task.id);
      toast('success', 'Task duplicated', copy.title);
    });
    el.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete task?',
        message: `“${task.title}” will be moved to trash. You can restore it from Settings → Trash.`,
        confirmLabel: 'Delete', danger: true
      });
      if (ok) {
        Store.deleteTask(task.id);
        toast('info', 'Task deleted', 'Find it in Settings → Trash if this was a mistake.', () => App.go('settings'));
      }
    });
    return el;
  }

  function recurrenceLabel(r) {
    if (!r || r.type === 'none') return '';
    const every = r.interval > 1 ? `${r.interval} ` : '';
    const names = { daily: `every ${every}day${r.interval > 1 ? 's' : ''}`, weekdays: 'every weekday', weekly: `every ${every}week${r.interval > 1 ? 's' : ''}`, biweekly: 'every 2 weeks', monthly: `every ${every}month${r.interval > 1 ? 's' : ''}` };
    return names[r.type] || r.type;
  }

  /* ================= Task viewer (read-only detail) ================= */

  function openTaskViewer(id) {
    const t = Store.getTask(id);
    if (!t) return;
    const cat = catOf(t);
    const project = t.projectId ? Store.getProject(t.projectId) : null;
    const deps = (t.dependsOn || []).map(did => Store.getTask(did)).filter(Boolean);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="row-wrap" style="margin-bottom:12px">
        ${prioBadge(t)} ${statusBadge(t)} ${dueBadge(t)} ${catBadge(t)} ${tagBadges(t)}
        ${t.recurrence.type !== 'none' ? `<span class="badge">🔁 ${H(recurrenceLabel(t.recurrence))}</span>` : ''}
      </div>
      ${t.description ? `<p style="margin:0 0 6px;color:var(--text-2);white-space:pre-wrap">${H(t.description)}</p>` : ''}
      ${t.sessions && t.sessions.length ? `
        <div class="detail-section">
          <h4>Planned work sessions (${t.sessions.filter(s => s.done).length}/${t.sessions.length} done)</h4>
          <div class="task-list">
            ${t.sessions.slice().sort((a, b) => a.date.localeCompare(b.date)).map(s => `
              <div class="task-item" style="padding:7px 10px">
                <button class="task-check ${s.done ? 'checked' : ''}" data-ses="${H(s.id)}">✓</button>
                <div class="task-main">
                  <div class="task-title" style="font-size:13.5px;${s.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${H(Utils.fmtDateSmart(s.date))}${s.time ? ' · ' + H(Utils.fmtTime(s.time)) : ''} · ${H(Utils.fmtDuration(s.durationMin))}</div>
                  ${s.objective ? `<div class="muted small">${H(s.objective)}</div>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      ${t.subtasks.length ? `
        <div class="detail-section">
          <h4>Checklist (${t.subtasks.filter(s => s.done).length}/${t.subtasks.length})</h4>
          <div class="task-list">
            ${t.subtasks.map(s => `
              <div class="task-item" style="padding:7px 10px">
                <button class="task-check ${s.done ? 'checked' : ''}" data-sub="${H(s.id)}">✓</button>
                <div class="task-main"><div class="task-title" style="font-size:13.5px;${s.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${H(s.title)}</div></div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      <div class="detail-section">
        <h4>Details</h4>
        <dl class="kv">
          ${classOf(t) ? `<dt>Class</dt><dd>${H(classOf(t).icon)} ${H(classOf(t).name)}</dd>` : ''}
          ${t.assignmentType !== 'general' ? `<dt>Type</dt><dd>${H(TYPE_LABELS[t.assignmentType] || t.assignmentType)}</dd>` : ''}
          ${t.submission !== 'not-started' ? `<dt>Submission</dt><dd>${H(SUBMISSION_LABELS[t.submission] || t.submission)}</dd>` : ''}
          ${t.startDate ? `<dt>Start date</dt><dd>${H(Utils.fmtDate(t.startDate, { long: true }))}</dd>` : ''}
          ${t.dueDate ? `<dt>Due date</dt><dd>${H(Utils.fmtDate(t.dueDate, { long: true }))}${t.time ? ' at ' + H(Utils.fmtTime(t.time)) : ''}</dd>` : ''}
          ${t.durationMin ? `<dt>Scheduled time</dt><dd>${H(Utils.fmtDuration(t.durationMin))}</dd>` : ''}
          ${t.estimateMin ? `<dt>Estimated time</dt><dd>${H(Utils.fmtDuration(t.estimateMin))}</dd>` : ''}
          ${t.actualMin ? `<dt>Time spent</dt><dd>${H(Utils.fmtDuration(t.actualMin))}</dd>` : ''}
          ${project ? `<dt>Project</dt><dd>${H(project.icon)} ${H(project.name)}</dd>` : ''}
          ${deps.length ? `<dt>Depends on</dt><dd>${deps.map(d => `${d.status === 'completed' ? '✅' : '⬜'} ${H(d.title)}`).join('<br>')}</dd>` : ''}
          ${t.reminders.length ? `<dt>Reminders</dt><dd>${t.reminders.map(m => H(reminderLabel(m))).join('<br>')}</dd>` : ''}
          ${t.links.length ? `<dt>Links</dt><dd>${t.links.map(l => {
            const su = safeUrl(l.url);
            return su ? `<a href="${H(su)}" target="_blank" rel="noopener noreferrer">${H(l.label || l.url)}</a>` : `<span class="muted">${H(l.label || l.url)} (link blocked for safety)</span>`;
          }).join('<br>')}</dd>` : ''}
        </dl>
      </div>
      ${t.notes ? `<div class="detail-section"><h4>Notes</h4><p style="margin:0;color:var(--text-2);white-space:pre-wrap">${H(t.notes)}</p></div>` : ''}
      ${t.attachments && t.attachments.length ? `
      <div class="detail-section">
        <h4>📎 Attachments (${t.attachments.length})</h4>
        ${t.attachments.map(a => {
          const dl = typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:') ? `<a class="btn btn-sm" href="${H(a.dataUrl)}" download="${H(a.name)}">Download</a>` : '';
          return `<div class="settings-row"><div class="s-label">${H(a.name)}</div><div class="s-desc">${H(Math.max(1, Math.round(a.size / 1024)))} KB</div>${dl}</div>`;
        }).join('')}
      </div>` : ''}
    `;
    body.querySelectorAll('[data-sub]').forEach(btn => {
      btn.addEventListener('click', () => Store.toggleSubtask(t.id, btn.dataset.sub));
    });
    body.querySelectorAll('[data-ses]').forEach(btn => {
      btn.addEventListener('click', () => Store.toggleSession(t.id, btn.dataset.ses));
    });
    const refreshSubs = Store.subscribe(() => {
      if (!document.body.contains(body)) { refreshSubs(); return; }
      const cur = Store.getTask(t.id);
      body.querySelectorAll('[data-sub]').forEach(btn => {
        const st = cur.subtasks.find(s => s.id === btn.dataset.sub);
        if (st) {
          btn.classList.toggle('checked', st.done);
          btn.nextElementSibling.firstElementChild.style.textDecoration = st.done ? 'line-through' : '';
        }
      });
    });
    const buttons = [
      { label: '✏️ Edit', class: 'btn-primary', onClick: () => { closeModal(); openTaskEditor(t.id); } },
      { label: '🧪 Study kit', class: 'btn-ghost', onClick: () => { closeModal(); openStudyKit(t.id); } },
      { label: 'Close', onClick: () => closeModal() }
    ];
    if (t.status !== 'completed' && global.Timer) {
      buttons.unshift({
        label: '⏱ Study timer', class: 'btn-ghost',
        onClick: () => {
          global.Timer.start(t.id);
          closeModal();
          toast('info', 'Timer started ⏱', `Tracking time for “${t.title}”. Click the timer to pause or finish.`);
        }
      });
    }
    openModal({
      title: t.title,
      body,
      large: true,
      buttons
    });
  }

  function reminderLabel(mins) {
    if (mins === 0) return 'At due time';
    if (mins < 60) return `${mins} min before`;
    if (mins < 1440) return `${mins / 60} hour${mins === 60 ? '' : 's'} before`;
    return `${mins / 1440} day${mins === 1440 ? '' : 's'} before`;
  }

  /* ================= Task editor (create / edit) ================= */

  const REMINDER_CHOICES = [0, 5, 15, 30, 60, 120, 1440];

  function openTaskEditor(taskId, presets) {
    const state = Store.get();
    const t = taskId ? Store.getTask(taskId) : null;
    const p = presets || {};
    const base = t || {
      title: p.title || '', description: p.description || '', startDate: p.startDate || null, dueDate: p.dueDate || null, time: p.time || null,
      durationMin: p.durationMin || 0, priority: p.priority || 'medium', categoryId: p.categoryId || (state.categories[0] && state.categories[0].id) || null,
      classId: p.classId || null,
      assignmentType: p.assignmentType || 'general',
      submission: p.submission || 'not-started',
      sessions: p.sessions || [],
      tags: p.tags || [], estimateMin: p.estimateMin || 0, actualMin: 0, subtasks: p.subtasks || [], recurrence: { type: 'none', interval: 1 },
      reminders: p.reminders || [], links: p.links || [], attachments: p.attachments || [], notes: p.notes || '', status: p.status || 'not-started', dependsOn: p.dependsOn || [], projectId: p.projectId || null
    };

    const depOptions = state.tasks.filter(x => x.id !== taskId && x.status !== 'completed');
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="field">
        <label>Title *</label>
        <input class="input" name="title" maxlength="300" placeholder="What needs to be done?" value="${H(base.title)}">
      </div>
      <div class="field">
        <label>Description</label>
        <textarea class="textarea" name="description" placeholder="Details, instructions, links to materials…">${H(base.description)}</textarea>
        <button class="btn btn-sm btn-ghost" id="aiBreakdownBtn" type="button" style="margin-top:6px">✨ Break into steps</button>
        <div id="aiBreakdownOut" style="margin-top:8px"></div>
      </div>
      <div class="field-row-3">
        <div class="field">
          <label>Priority</label>
          <select class="select" name="priority">
            ${['low', 'medium', 'high', 'urgent'].map(pr => `<option value="${pr}" ${base.priority === pr ? 'selected' : ''}>${{ low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }[pr]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Status</label>
          <select class="select" name="status">
            ${Storage.STATUSES.map(st => `<option value="${st}" ${base.status === st ? 'selected' : ''}>${{ 'not-started': 'Not started', 'in-progress': 'In progress', waiting: 'Waiting', completed: 'Completed' }[st]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Category</label>
          <select class="select" name="categoryId">
            <option value="">None</option>
            ${state.categories.map(c => `<option value="${H(c.id)}" ${base.categoryId === c.id ? 'selected' : ''}>${H(c.icon)} ${H(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row-3">
        <div class="field">
          <label>Class</label>
          <select class="select" name="classId">
            <option value="">Not school-related</option>
            ${state.classes.map(c => `<option value="${H(c.id)}" ${base.classId === c.id ? 'selected' : ''}>${H(c.icon)} ${H(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Assignment type</label>
          <select class="select" name="assignmentType">
            ${Storage.ASSIGNMENT_TYPES.map(at => `<option value="${at}" ${base.assignmentType === at ? 'selected' : ''}>${{ general: 'General task', homework: 'Homework', essay: 'Essay', project: 'Project', lab: 'Lab', reading: 'Reading', revision: 'Revision', 'test-prep': 'Test preparation', quiz: 'Quiz', test: 'Test' }[at]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Submission</label>
          <select class="select" name="submission">
            ${Storage.SUBMISSION_STATES.map(ss => `<option value="${ss}" ${base.submission === ss ? 'selected' : ''}>${{ 'not-started': 'Not started', working: 'Working on it', ready: 'Ready to submit', submitted: 'Submitted' }[ss]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row-3">
        <div class="field">
          <label>Start date</label>
          <input class="input" type="date" name="startDate" value="${H(base.startDate || '')}">
        </div>
        <div class="field">
          <label>Due date</label>
          <input class="input" type="date" name="dueDate" value="${H(base.dueDate || '')}">
        </div>
        <div class="field">
          <label>Scheduled time</label>
          <input class="input" type="time" name="time" value="${H(base.time || '')}">
        </div>
      </div>
      <div class="field-row-3">
        <div class="field">
          <label>Duration (min)</label>
          <input class="input" type="number" min="0" step="5" name="durationMin" value="${base.durationMin || ''}" placeholder="e.g. 45">
        </div>
        <div class="field">
          <label>Estimate (min) <button class="link-btn" id="aiEstimateBtn" type="button">✨ estimate for me</button></label>
          <input class="input" type="number" min="0" step="5" name="estimateMin" value="${base.estimateMin || ''}" placeholder="e.g. 60">
          <div class="muted small" id="aiEstimateOut" style="margin-top:4px"></div>
        </div>
        <div class="field">
          <label>Time spent (min)</label>
          <input class="input" type="number" min="0" step="5" name="actualMin" value="${base.actualMin || ''}" placeholder="e.g. 30">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Tags <span class="muted">(comma separated)</span></label>
          <input class="input" name="tags" value="${H((base.tags || []).join(', '))}" placeholder="essay, chapter-4, group-work">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Repeats</label>
          <select class="select" name="recurrenceType">
            ${Storage.RECURRENCE_TYPES.map(rt => `<option value="${rt}" ${base.recurrence.type === rt ? 'selected' : ''}>${{ none: 'Does not repeat', daily: 'Daily', weekdays: 'Every weekday (Mon–Fri)', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' }[rt]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Repeat interval</label>
          <input class="input" type="number" min="1" max="52" name="recurrenceInterval" value="${base.recurrence.interval || 1}">
        </div>
      </div>
      <div class="field">
        <label>Reminders</label>
        <div class="row-wrap" id="remChoices">
          ${REMINDER_CHOICES.map(m => `
            <label class="check-row" style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:5px 10px">
              <input type="checkbox" value="${m}" ${base.reminders.includes(m) ? 'checked' : ''}> ${H(reminderLabel(m))}
            </label>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Reference links</label>
        <div id="linksEditor"></div>
        <button class="btn btn-sm btn-ghost" id="addLink" type="button">＋ Add link</button>
      </div>
      <div class="field">
        <label>Attachments <span class="muted">(worksheets, instructions — up to 2 MB per file, stored in your browser)</span></label>
        <div id="attachEditor"></div>
        <input type="file" id="attachFile" multiple class="hidden">
        <button class="btn btn-sm btn-ghost" id="addAttach" type="button">📎 Attach files</button>
      </div>
      <div class="field">
        <label>Subtasks / checklist</label>
        <div id="subtasksEditor"></div>
        <button class="btn btn-sm btn-ghost" id="addSubtask" type="button">＋ Add step</button>
      </div>
      <div class="field">
        <label>Planned work sessions <span class="muted">(when you'll work on it — shown in Daily/Weekly planners)</span></label>
        <div id="sessionsEditor"></div>
        <button class="btn btn-sm btn-ghost" id="addSession" type="button">＋ Plan a session</button>
      </div>
      ${depOptions.length ? `
      <div class="field">
        <label>Depends on <span class="muted">(blocked until these are done)</span></label>
        <div class="row-wrap" id="depChoices" style="max-height:110px;overflow-y:auto">
          ${depOptions.slice(0, 30).map(d => `
            <label class="check-row" style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:5px 10px">
              <input type="checkbox" value="${H(d.id)}" ${base.dependsOn.includes(d.id) ? 'checked' : ''}> ${H(d.title.slice(0, 40))}
            </label>`).join('')}
        </div>
      </div>` : ''}
      <div class="field">
        <label>Notes</label>
        <textarea class="textarea" name="notes" placeholder="Additional notes…">${H(base.notes)}</textarea>
        <button class="btn btn-sm btn-ghost" id="aiWritingBtn" type="button" style="margin-top:6px">✍️ Review my writing</button>
        <div id="aiWritingOut" style="margin-top:6px"></div>
      </div>
      <div class="form-error" id="taskFormError"></div>
    `;

    /* dynamic editors */
    const subEd = body.querySelector('#subtasksEditor');
    function addSubRow(sub) {
      const row = document.createElement('div');
      row.className = 'subtask-editor-row';
      row.innerHTML = `
        <input type="checkbox" class="sub-done" ${sub && sub.done ? 'checked' : ''}>
        <input class="input" placeholder="Step description" value="${H(sub ? sub.title : '')}">
        <button class="icon-btn" type="button" aria-label="Remove step">✕</button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      subEd.appendChild(row);
    }
    (base.subtasks || []).forEach(addSubRow);
    body.querySelector('#addSubtask').addEventListener('click', () => addSubRow(null));

    const linkEd = body.querySelector('#linksEditor');
    function addLinkRow(link) {
      const row = document.createElement('div');
      row.className = 'subtask-editor-row';
      row.innerHTML = `
        <input class="input" style="flex:0 0 130px" placeholder="Label" value="${H(link ? link.label : '')}">
        <input class="input link-url" placeholder="https://…" value="${H(link ? link.url : '')}">
        <button class="icon-btn" type="button" aria-label="Remove link">✕</button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      linkEd.appendChild(row);
    }
    (base.links || []).forEach(addLinkRow);
    body.querySelector('#addLink').addEventListener('click', () => addLinkRow(null));

    const attEd = body.querySelector('#attachEditor');
    const attachments = (base.attachments || []).slice();
    function renderAttachments() {
      attEd.innerHTML = '';
      attachments.forEach((a, i) => {
        const row = document.createElement('div');
        row.className = 'subtask-editor-row';
        row.innerHTML = `
          <span class="grow muted small" style="overflow:hidden;text-overflow:ellipsis">📎 ${H(a.name)} <span>· ${H(Math.max(1, Math.round(a.size / 1024)) + ' KB')}</span></span>
          <button class="icon-btn" type="button" aria-label="Remove attachment">✕</button>`;
        row.querySelector('button').addEventListener('click', () => { attachments.splice(i, 1); renderAttachments(); });
        attEd.appendChild(row);
      });
    }
    renderAttachments();
    const fileInput = body.querySelector('#attachFile');
    body.querySelector('#addAttach').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files || []).forEach(file => {
        if (file.size > Storage.MAX_ATTACHMENT_BYTES) {
          UI.toast('warning', 'File too large', `“${file.name}” is over 2 MB and was not attached.`);
          return;
        }
        if (attachments.length >= 8) { UI.toast('warning', 'Attachment limit', 'Up to 8 files per task.'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          attachments.push({ id: Utils.uid('att'), name: file.name, size: file.size, dataUrl: String(reader.result) });
          renderAttachments();
        };
        reader.readAsDataURL(file);
      });
      fileInput.value = '';
    });

    const sesEd = body.querySelector('#sessionsEditor');
    function addSessionRow(ses) {
      const row = document.createElement('div');
      row.className = 'subtask-editor-row session-row';
      row.innerHTML = `
        <input class="input" style="flex:0 0 130px" type="date" value="${H(ses ? ses.date : '')}">
        <input class="input ses-time" style="flex:0 0 96px" type="time" value="${H(ses && ses.time || '')}">
        <input class="input ses-dur" style="flex:0 0 74px" type="number" min="5" step="5" placeholder="min" value="${ses ? ses.durationMin : 45}">
        <input class="input ses-obj" placeholder="Objective (e.g. research, draft…)" value="${H(ses ? ses.objective : '')}">
        <button class="icon-btn" type="button" aria-label="Remove session">✕</button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      sesEd.appendChild(row);
    }
    (base.sessions || []).forEach(addSessionRow);
    body.querySelector('#addSession').addEventListener('click', () => addSessionRow(null));

    /* AI tools — always preview-only; nothing is saved until the user confirms */
    const aiOut = body.querySelector('#aiBreakdownOut');
    body.querySelector('#aiBreakdownBtn').addEventListener('click', () => {
      const draft = {
        title: body.querySelector('[name="title"]').value.trim(),
        description: body.querySelector('[name="description"]').value,
        notes: body.querySelector('[name="notes"]').value,
        assignmentType: body.querySelector('[name="assignmentType"]').value,
        dueDate: body.querySelector('[name="dueDate"]').value || null,
        estimateMin: Number(body.querySelector('[name="estimateMin"]').value) || 0
      };
      if (!draft.title && !draft.description.trim()) { aiOut.innerHTML = '<span class="muted small">Add a title or description first.</span>'; return; }
      aiOut.innerHTML = '<span class="muted small">⏳ Thinking…</span>';
      AI.breakdown(draft).then(res => {
        aiOut.innerHTML = `
          <div class="muted small" style="margin-bottom:4px">${res.source === 'ai' ? '🤖 Suggested by your AI model' : '✨ Suggested by the built-in smart engine'} — tick what you want:</div>
          <div class="row-wrap">${res.steps.map((s, i) => `
            <label class="check-row" style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:5px 10px">
              <input type="checkbox" class="ai-step" data-i="${i}" checked> ${H(s.title)} <span class="muted">· ~${H(Utils.fmtDuration(s.minutes))}</span>
            </label>`).join('')}</div>
          <div class="row" style="margin-top:8px">
            <button class="btn btn-sm btn-primary" id="aiAsSubs" type="button">＋ Add as subtasks</button>
            <button class="btn btn-sm" id="aiAsSes" type="button">📅 Add as study sessions</button>
          </div>`;
        const chosen = () => res.steps.filter((_, i) => aiOut.querySelectorAll('.ai-step')[i].checked);
        aiOut.querySelector('#aiAsSubs').addEventListener('click', () => {
          const sel = chosen();
          if (!sel.length) return;
          sel.forEach(s => addSubRow({ title: s.title }));
          toast('success', 'Steps added', sel.length + ' subtask row(s) added — save the task to keep them.');
        });
        aiOut.querySelector('#aiAsSes').addEventListener('click', () => {
          const sel = chosen();
          if (!sel.length) return;
          const pool = (res.sessions && res.sessions.length) ? res.sessions : sel.map(s => ({ date: null, durationMin: s.minutes, objective: s.title }));
          sel.forEach((s, i) => {
            const srcSes = pool[i % pool.length] || {};
            addSessionRow({ date: srcSes.date || null, time: srcSes.time || null, durationMin: s.minutes, objective: s.title });
          });
          toast('success', 'Sessions added', sel.length + ' session row(s) added — set dates if empty, then save.');
        });
      }).catch(err => {
        aiOut.innerHTML = '<span class="muted small">⚠ ' + H(err && err.message || 'Could not generate steps.') + '</span>';
      });
    });

    body.querySelector('#aiEstimateBtn').addEventListener('click', () => {
      const out = body.querySelector('#aiEstimateOut');
      const draft = {
        title: body.querySelector('[name="title"]').value.trim(),
        description: body.querySelector('[name="description"]').value,
        assignmentType: body.querySelector('[name="assignmentType"]').value,
        classId: body.querySelector('[name="classId"]').value || null
      };
      const res = AI.estimate(draft, Store.get());
      body.querySelector('[name="estimateMin"]').value = res.anchor;
      out.textContent = '≈ ' + res.lo + '–' + res.hi + ' min · ' + res.split.map(s => s.label + ' ' + s.minutes).join(' · ') + (res.fromHistory ? ' · based on your history' : '');
    });

    body.querySelector('#aiWritingBtn').addEventListener('click', () => {
      const out = body.querySelector('#aiWritingOut');
      const res = AI.writingFeedback(body.querySelector('[name="notes"]').value);
      if (res.ok) { out.innerHTML = '<span class="muted small">✅ Looks good — no issues found in ' + res.wordCount + ' words.</span>'; return; }
      out.innerHTML = '<div class="muted small" style="margin-bottom:4px">' + res.wordCount + ' words · suggestions:</div>' +
        res.issues.map(i => '<div class="small" style="margin-bottom:3px">' + i.icon + ' <strong>' + H(i.title) + '</strong> — ' + H(i.detail) + '</div>').join('');
    });

    function collect() {
      const f = name => body.querySelector(`[name="${name}"]`);
      const err = body.querySelector('#taskFormError');
      err.textContent = '';
      const title = f('title').value.trim();
      if (!title) { err.textContent = 'Please give the task a title.'; return null; }
      const recurrenceType = f('recurrenceType').value;
      if (recurrenceType !== 'none' && !f('dueDate').value) {
        err.textContent = 'Repeating tasks need a due date to anchor the schedule.';
        return null;
      }
      return {
        id: taskId || undefined,
        title,
        description: f('description').value,
        startDate: f('startDate').value || null,
        dueDate: f('dueDate').value || null,
        time: f('time').value || null,
        durationMin: Number(f('durationMin').value) || 0,
        estimateMin: Number(f('estimateMin').value) || 0,
        actualMin: Number(f('actualMin').value) || 0,
        priority: f('priority').value,
        status: f('status').value,
        categoryId: f('categoryId').value || null,
        projectId: f('projectId') ? (f('projectId').value || null) : (base.projectId || null),
        tags: f('tags').value.split(',').map(s => s.trim()).filter(Boolean),
        recurrence: { type: recurrenceType, interval: Math.max(1, Number(f('recurrenceInterval').value) || 1) },
        reminders: Array.from(body.querySelectorAll('#remChoices input:checked')).map(i => Number(i.value)),
        links: Array.from(linkEd.querySelectorAll('.subtask-editor-row')).map(row => ({
          label: row.children[0].value.trim(),
          url: row.querySelector('.link-url').value.trim()
        })).filter(l => l.url),
        subtasks: Array.from(subEd.querySelectorAll('.subtask-editor-row')).map(row => ({
          id: Utils.uid('sub'),
          title: row.querySelector('.input').value.trim(),
          done: row.querySelector('.sub-done').checked
        })).filter(s => s.title),
        sessions: Array.from(sesEd.querySelectorAll('.session-row')).map(row => ({
          id: Utils.uid('ses'),
          date: row.querySelector('input[type="date"]').value || null,
          time: row.querySelector('.ses-time').value || null,
          durationMin: Number(row.querySelector('.ses-dur').value) || 30,
          objective: row.querySelector('.ses-obj').value.trim(),
          done: false
        })).filter(s => s.date),
        classId: f('classId').value || null,
        assignmentType: f('assignmentType').value,
        submission: f('submission').value,
        attachments: attachments.slice(),
        dependsOn: Array.from(body.querySelectorAll('#depChoices input:checked')).map(i => i.value),
        notes: f('notes').value
      };
    }

    openModal({
      title: t ? 'Edit task' : 'New task',
      body,
      large: true,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => closeModal() },
        {
          label: t ? 'Save changes' : 'Create task',
          class: 'btn-primary',
          onClick: () => {
            const data = collect();
            if (!data) return false;
            const saved = Store.saveTask(data);
            toast('success', t ? 'Task updated' : 'Task created', saved.title);
            closeModal();
          }
        }
      ]
    });
  }

  /* ================= AI: study kit & describe-a-task ================= */

  function openStudyKit(id) {
    const t = Store.getTask(id);
    if (!t) return;
    const renderKit = (kit, source) => {
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="muted small" style="margin-top:0">${source === 'ai' ? '🤖 Generated by your AI model' : '✨ Built-in smart engine — built from this task’s description and notes'}</div>
        ${kit.summary ? `<div class="detail-section"><h4>🗒 Summary</h4><p style="margin:0;color:var(--text-2)">${H(kit.summary)}</p></div>` : ''}
        ${kit.concepts.length ? `<div class="detail-section"><h4>🔑 Key concepts</h4><div class="row-wrap">${kit.concepts.map(c => '<span class="badge">' + H(c) + '</span>').join('')}</div></div>` : ''}
        ${kit.flashcards.length ? `<div class="detail-section"><h4>🏆 Flashcards (${kit.flashcards.length}) — tap to flip</h4><div class="task-list">${kit.flashcards.map((c, i) => `
          <div class="task-item" data-fc="${i}" style="cursor:pointer"><div class="task-main"><div class="task-title">${H(c.front)}</div><div class="muted small fc-back" style="display:none">${H(c.back)}</div></div></div>`).join('')}</div></div>` : ''}
        ${kit.quiz.length ? `<div class="detail-section"><h4>🧠 Practice quiz (${kit.quiz.length}) — pick an answer</h4>${kit.quiz.map((q, qi) => `
          <div style="margin-bottom:10px"><div class="task-title" style="font-size:13.5px">${qi + 1}. ${H(q.q)}</div>
          <div class="row-wrap" data-quiz="${qi}" style="margin-top:4px">${q.choices.map((c, ci) => `<button class="btn btn-sm" data-choice="${ci}" type="button">${H(c)}</button>`).join('')}</div></div>`).join('')}</div>` : ''}
        ${!kit.summary && !kit.concepts.length && !kit.flashcards.length && !kit.quiz.length ? '<div class="empty"><div class="empty-icon">📝</div>Add a description or notes to this task first — the study kit is built from them.</div>' : ''}`;
      body.querySelectorAll('[data-fc]').forEach(el => {
        el.addEventListener('click', () => {
          const back = el.querySelector('.fc-back');
          back.style.display = back.style.display === 'none' ? 'block' : 'none';
        });
      });
      body.querySelectorAll('[data-quiz]').forEach(wrap => {
        const qi = Number(wrap.dataset.quiz);
        wrap.querySelectorAll('[data-choice]').forEach(btn => {
          btn.addEventListener('click', () => {
            const pick = Number(btn.dataset.choice);
            const correct = pick === kit.quiz[qi].answer;
            btn.classList.add(correct ? 'btn-primary' : 'btn-danger');
            if (!correct) wrap.querySelectorAll('[data-choice]')[kit.quiz[qi].answer].classList.add('btn-primary');
          });
        });
      });
      openModal({
        title: '🧪 Study kit — ' + t.title,
        body,
        large: true,
        buttons: [
          { label: 'Save to task', class: 'btn-primary', onClick: () => { Store.saveTask({ ...t, studyKit: kit }); toast('success', 'Study kit saved', 'Open this task anytime to see it again.'); closeModal(); } },
          { label: 'Regenerate', onClick: () => { closeModal(); generate(); } },
          { label: 'Close', onClick: () => closeModal() }
        ]
      });
    };
    const generate = () => {
      if (t.studyKit) { renderKit(t.studyKit, t.studyKit.source); return; }
      openModal({ title: '🧪 Study kit', body: '<p class="muted">⏳ Building your study kit…</p>', buttons: [{ label: 'Cancel', onClick: () => closeModal() }] });
      AI.studyKit(t).then(kit => { closeModal(); renderKit(kit, kit.source); })
        .catch(err => { closeModal(); toast('warning', 'No study kit', err && err.message || 'Could not build a study kit.'); });
    };
    generate();
  }

  function openDescribeTask(preset) {
    const p = preset || {};
    const state = Store.get();
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="muted small" style="margin-top:0">Write it the way you'd say it — dates, priority and length are picked out automatically. Example: “Science project due next Thursday, high priority, about an hour”.</p>
      <div class="field"><label>Description</label>
        <textarea class="textarea" id="aiDescText" placeholder="e.g. Math worksheet 4.2 due tomorrow at 4pm, high priority, 45 min">${H(p.text || '')}</textarea></div>
      <div id="aiDescPreview"></div>
      <div class="muted small" style="margin-top:8px">Works without any AI key using the built-in smart engine. Connect a model in Settings → AI assistant for smarter results. Nothing is saved until you confirm.</div>`;
    const previewBtn = document.createElement('button');
    previewBtn.className = 'btn btn-sm btn-primary';
    previewBtn.textContent = '✨ Preview task';
    previewBtn.style.marginTop = '8px';
    body.appendChild(previewBtn);
    previewBtn.addEventListener('click', () => {
      const prev = body.querySelector('#aiDescPreview');
      const parsed = AI.parseTaskText(body.querySelector('#aiDescText').value, state);
      if (!parsed) { prev.innerHTML = '<span class="muted small">Type something first.</span>'; return; }
      const cls = state.classes.find(c => c.id === parsed.classId);
      prev.innerHTML = `
        <div class="card" style="padding:12px 16px;margin:10px 0">
          <div class="card-title" style="margin-bottom:6px"><span>📋 New task preview</span></div>
          <div class="task-title">${H(parsed.title)}</div>
          <div class="task-meta" style="margin-top:4px">
            <span class="badge">${parsed.dueDate ? '📅 ' + H(Utils.fmtDateSmart(parsed.dueDate)) : '📍 no deadline'}</span>
            ${parsed.time ? '<span class="badge">⏰ ' + H(Utils.fmtTime(parsed.time)) + '</span>' : ''}
            <span class="badge">${{ low: '🟢 Low', medium: '🟡 Medium', high: '🔴 High', urgent: '⚡ Urgent' }[parsed.priority]}</span>
            ${parsed.estimateMin ? '<span class="badge">⏱ ~' + H(Utils.fmtDuration(parsed.estimateMin)) + '</span>' : ''}
            ${cls ? '<span class="badge badge-cat"><span class="dot" style="background:' + H(cls.color) + '"></span>' + H(cls.icon + ' ' + cls.name) + '</span>' : ''}
          </div>
          ${parsed.matched.length ? '<div class="muted small" style="margin-top:6px">Understood: ' + H(parsed.matched.join(', ')) + '</div>' : '<div class="muted small" style="margin-top:6px">No date or priority detected — the whole text becomes the title.</div>'}
        </div>`;
      const actions = document.createElement('div');
      actions.className = 'row';
      actions.style.marginTop = '8px';
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-sm btn-primary';
      addBtn.textContent = '＋ Add task';
      addBtn.addEventListener('click', () => {
        const saved = Store.saveTask({
          title: parsed.title, dueDate: parsed.dueDate, time: parsed.time,
          priority: parsed.priority, estimateMin: parsed.estimateMin, classId: parsed.classId
        });
        closeModal();
        toast('success', 'Task added', saved.title);
      });
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm';
      editBtn.textContent = '✏️ Open in editor…';
      editBtn.addEventListener('click', () => {
        closeModal();
        openTaskEditor(null, parsed);
      });
      actions.appendChild(addBtn);
      actions.appendChild(editBtn);
      prev.appendChild(actions);
    });
    openModal({ title: '✨ Describe a task', body, buttons: [{ label: 'Close', onClick: () => closeModal() }] });
  }

  /* ================= Quick add ================= */

  function quickAdd(prefill) {
    openModal({
      title: 'Quick add task',
      body: `
        <div class="field">
          <label>Task title *</label>
          <input class="input" id="qaTitle" placeholder="e.g. Finish physics lab report" value="${H(prefill || '')}" maxlength="300">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Due date <span class="muted">(leave empty to unschedule)</span></label>
            <input class="input" type="date" id="qaDue" value="">
          </div>
          <div class="field">
            <label>Priority</label>
            <select class="select" id="qaPriority">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <p class="muted small" style="margin:0">No date = it goes to your Agenda under “No deadline” until you schedule it.</p>
        <div class="form-error" id="qaError"></div>`,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => closeModal() },
        {
          label: 'Add task', class: 'btn-primary',
          onClick: () => {
            const title = document.getElementById('qaTitle').value.trim();
            if (!title) { document.getElementById('qaError').textContent = 'Please enter a title.'; return false; }
            const saved = Store.saveTask({
              title,
              dueDate: document.getElementById('qaDue').value || null,
              priority: document.getElementById('qaPriority').value,
              reminders: [Store.get().settings.reminderDefault]
            });
            toast('success', 'Task added', saved.title);
            closeModal();
          }
        },
        {
          label: 'More options…', class: 'btn-ghost',
          onClick: () => {
            const title = document.getElementById('qaTitle').value.trim();
            const due = document.getElementById('qaDue').value || null;
            const priority = document.getElementById('qaPriority').value;
            closeModal();
            openTaskEditor(null, { title, dueDate: due, priority });
            return false;
          }
        }
      ]
    });
  }

  /* ================= Assignment templates ================= */

  function openTemplatePicker(preset) {
    const p = preset || {};
    const state = Store.get();
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="muted small" style="margin-top:0">Pick a template — it pre-fills type, checklist and a realistic plan of study sessions spread before the due date.</p>
      <div class="field-row-2">
        <div class="field"><label>Title</label><input class="input" id="tplTitle" placeholder="e.g. History essay — Industrial Revolution"></div>
        <div class="field"><label>Due date</label><input class="input" type="date" id="tplDue" value="${H(p.dueDate || '')}"></div>
      </div>
      <div class="field"><label>Class</label>
        <select class="select" id="tplClass">
          <option value="">Not school-related</option>
          ${state.classes.map(c => `<option value="${H(c.id)}" ${p.classId === c.id ? 'selected' : ''}>${H(c.icon)} ${H(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="tpl-grid" id="tplGrid">
        ${Planner.TEMPLATES.map(tp => `
          <button type="button" class="tpl-card" data-tpl="${tp.id}">
            <div class="tpl-icon">${tp.icon}</div>
            <div class="tpl-name">${H(tp.name)}</div>
            <div class="muted small">~${H(Utils.fmtDuration(tp.estimateMin))} · ${tp.sessions.length} session${tp.sessions.length === 1 ? '' : 's'} · ${tp.subtasks.length} steps</div>
          </button>`).join('')}
      </div>`;
    body.querySelectorAll('[data-tpl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const title = body.querySelector('#tplTitle').value.trim();
        const due = body.querySelector('#tplDue').value || null;
        const classId = body.querySelector('#tplClass').value || null;
        const fields = Planner.buildFromTemplate(btn.dataset.tpl, { title, dueDate: due, classId, state });
        if (!fields) return;
        closeModal();
        openTaskEditor(null, fields);
      });
    });
    openModal({ title: 'New from template', body, large: true, buttons: [{ label: 'Cancel', class: 'btn-ghost', onClick: () => closeModal() }] });
  }

  /* ================= Suggestion approval (workload balance / reschedule) ================= */

  function openSuggestionModal(opts) {
    const sug = opts.suggestions || [];
    if (!sug.length) {
      toast('success', opts.noneTitle || 'Nothing to do', opts.noneMsg || 'Everything already fits your schedule.');
      return;
    }
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="muted small" style="margin-top:0">${H(opts.intro || '')}</p>
      <div id="sugList">
        ${sug.map((s, i) => `
          <label class="settings-row sug-row" style="cursor:pointer">
            <input type="checkbox" class="sug-check" data-i="${i}" checked style="margin-right:10px">
            <div class="grow">
              <div class="s-label">${H(s.kind === 'task' ? '📅 ' : '🧠 ')}${H(s.title || s.taskTitle)}${s.objective ? ` — ${H(s.objective)}` : ''}${s.durationMin ? ` <span class="muted">(${H(Utils.fmtDuration(s.durationMin))})</span>` : ''}</div>
              <div class="s-desc">${H(Utils.fmtDateSmart(s.fromDate))} → <strong>${H(Utils.fmtDateSmart(s.toDate))}</strong> (${H(Utils.relDayLabel(s.toDate))})</div>
            </div>
          </label>`).join('')}
      </div>`;
    openModal({
      title: opts.title,
      body,
      large: true,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => closeModal() },
        {
          label: opts.applyLabel || 'Apply selected', class: 'btn-primary',
          onClick: () => {
            const checks = Array.from(body.querySelectorAll('.sug-check:checked'));
            if (!checks.length) { closeModal(); return; }
            checks.forEach(c => Planner.applySuggestion(sug[Number(c.dataset.i)]));
            toast('success', opts.appliedTitle || 'Applied', `${checks.length} change${checks.length === 1 ? '' : 's'} made.`);
            closeModal();
          }
        }
      ]
    });
  }

  /* ================= Category editor ================= */

  const COLOR_SWATCHES = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#3b82f6', '#64748b'];
  const ICON_CHOICES = ['📚', '📝', '🎓', '🏆', '🏡', '🧹', '🎨', '🎯', '💼', '🏃', '🎵', '🛒', '⚙️', '❤️', '🏷️'];

  function openCategoryEditor(catId) {
    const state = Store.get();
    const c = catId ? state.categories.find(x => x.id === catId) : null;
    let color = c ? c.color : COLOR_SWATCHES[0];
    let icon = c ? c.icon : ICON_CHOICES[0];
    const body = document.createElement('div');
    const render = () => {
      body.innerHTML = `
        <div class="field">
          <label>Name *</label>
          <input class="input" id="catName" maxlength="60" value="${H(c ? c.name : '')}" placeholder="e.g. Schoolwork">
        </div>
        <div class="field">
          <label>Icon</label>
          <div class="row-wrap" id="iconRow">
            ${ICON_CHOICES.map(i => `<button type="button" class="btn ${i === icon ? 'btn-primary' : ''}" data-icon="${i}" style="font-size:16px">${i}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Color</label>
          <div class="row-wrap" id="colorRow">
            ${COLOR_SWATCHES.map(col => `<button type="button" data-color="${col}" style="width:30px;height:30px;border-radius:50%;background:${col};border:${col === color ? '3px solid var(--text)' : '2px solid var(--border)'}" aria-label="${col}"></button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Preview</label>
          <span class="badge badge-cat"><span class="dot" style="background:${color}"></span>${icon} ${H(body.querySelector('#catName') ? body.querySelector('#catName').value : (c ? c.name : '')) || 'Category'}</span>
        </div>
        <div class="form-error" id="catError"></div>`;
      body.querySelector('#iconRow').addEventListener('click', e => {
        const b = e.target.closest('[data-icon]');
        if (b) { icon = b.dataset.icon; render(); }
      });
      body.querySelector('#colorRow').addEventListener('click', e => {
        const b = e.target.closest('[data-color]');
        if (b) { color = b.dataset.color; render(); }
      });
    };
    render();
    openModal({
      title: c ? 'Edit category' : 'New category',
      body,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => closeModal() },
        {
          label: c ? 'Save' : 'Create', class: 'btn-primary',
          onClick: () => {
            const name = body.querySelector('#catName').value.trim();
            if (!name) { body.querySelector('#catError').textContent = 'Please enter a name.'; return false; }
            Store.saveCategory({ id: catId || undefined, name, color, icon });
            toast('success', c ? 'Category updated' : 'Category created', name);
            closeModal();
          }
        }
      ]
    });
  }

  const UI = {
    toast, openModal, closeModal, modalIsOpen, confirmDialog,
    prioBadge, dueBadge, catBadge, tagBadges, statusBadge, catOf,
    classOf, classBadge, typeBadge, submissionBadge, TYPE_LABELS, SUBMISSION_LABELS,
    taskItem, openTaskViewer, openTaskEditor, quickAdd, openCategoryEditor,
    openTemplatePicker, openSuggestionModal, openDescribeTask, openStudyKit,
    recurrenceLabel, reminderLabel, COLOR_SWATCHES, ICON_CHOICES
  };

  global.UI = UI;
  if (typeof module !== 'undefined' && module.exports) module.exports = UI;
})(typeof window !== 'undefined' ? window : globalThis);
