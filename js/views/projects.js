/* Momentum — Projects: milestones, linked tasks, auto-calculated progress */
(function (global) {
  'use strict';

  function render(host) {
    const state = Store.get();

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Projects</h2><div class="sub">Break big responsibilities into milestones and linked tasks. Progress is calculated automatically.</div></div>
        <button class="btn btn-primary" id="newProject">＋ New project</button>
      </div>
      <div class="grid grid-2" id="projGrid"></div>
    `;
    host.querySelector('#newProject').addEventListener('click', () => openProjectEditor());

    const grid = host.querySelector('#projGrid');
    if (!state.projects.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="empty-icon">📁</span>No projects yet.<br>Create one to organize multi-step work.</div>`;
      return;
    }

    state.projects.forEach(p => {
      const tasks = state.tasks.filter(t => t.projectId === p.id);
      const openTasks = tasks.filter(t => t.status !== 'completed');
      const pct = Store.projectProgress(p);
      const msDone = p.milestones.filter(m => m.done).length;
      const overdue = p.dueDate && p.status !== 'completed' && Utils.daysUntil(p.dueDate) < 0;
      const card = document.createElement('div');
      card.className = 'card proj-card';
      card.innerHTML = `
        <div class="proj-head">
          <div class="proj-icon" style="background:${H(p.color)}22">${H(p.icon)}</div>
          <div class="grow">
            <div class="proj-name">${H(p.name)}</div>
            <div class="row-wrap" style="margin-top:5px">
              ${UI.prioBadge({ priority: p.priority })}
              <span class="badge">${{ 'not-started': '○ Not started', 'in-progress': '◐ In progress', waiting: '⏸ Waiting', completed: '✓ Completed' }[p.status]}</span>
              ${p.dueDate ? `<span class="badge ${overdue ? 'badge-overdue' : ''}">🎯 target ${H(Utils.fmtDateSmart(p.dueDate))}</span>` : ''}
            </div>
          </div>
          <div class="task-actions">
            <button class="icon-btn" data-act="edit" title="Edit project">✏️</button>
            <button class="icon-btn" data-act="delete" title="Delete project">🗑️</button>
          </div>
        </div>
        ${p.description ? `<div class="muted small">${H(p.description)}</div>` : ''}
        <div>
          <div class="spread small" style="margin-bottom:5px"><span class="muted">Progress</span><strong>${pct}%</strong></div>
          <div class="progress ${pct === 100 ? 'green' : ''}"><div style="width:${pct}%"></div></div>
          <div class="muted small" style="margin-top:5px">${msDone}/${p.milestones.length} milestones · ${tasks.length - openTasks.length}/${tasks.length} tasks done</div>
        </div>
        ${p.milestones.length ? `<div>${p.milestones.map(m => `
          <div class="milestone">
            <button class="task-check ${m.done ? 'checked' : ''}" data-ms="${H(m.id)}" aria-label="Toggle milestone">✓</button>
            <span class="ms-title ${m.done ? 'done' : ''}">${H(m.title)}</span>
            ${m.dueDate ? `<span class="muted small">${H(Utils.fmtDateSmart(m.dueDate))}</span>` : ''}
          </div>`).join('')}</div>` : ''}
        ${openTasks.length ? `<div class="detail-section"><h4>Open tasks (${openTasks.length})</h4><div class="task-list">
          ${openTasks.slice(0, 4).map(t => `<div class="mini-task" data-task="${H(t.id)}" style="cursor:pointer"><div class="mt-title">${H(t.title)}</div><div class="mt-meta">${t.dueDate ? H(Utils.fmtDateSmart(t.dueDate)) : ''}</div></div>`).join('')}
          ${openTasks.length > 4 ? `<div class="muted small" style="padding:4px">+${openTasks.length - 4} more in Tasks view</div>` : ''}
        </div></div>` : ''}
      `;
      card.querySelector('[data-act="edit"]').addEventListener('click', () => openProjectEditor(p.id));
      card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        const ok = await UI.confirmDialog({
          title: 'Delete project?',
          message: `“${p.name}” will be moved to trash. Its ${tasks.length} linked task${tasks.length === 1 ? '' : 's'} will be kept but unlinked.`,
          confirmLabel: 'Delete', danger: true
        });
        if (ok) {
          Store.deleteProject(p.id);
          UI.toast('info', 'Project deleted', 'Restore it from Settings → Trash.');
        }
      });
      card.querySelectorAll('[data-ms]').forEach(btn => btn.addEventListener('click', () => Store.toggleMilestone(p.id, btn.dataset.ms)));
      card.querySelectorAll('[data-task]').forEach(el => el.addEventListener('click', () => UI.openTaskViewer(el.dataset.task)));
      card.querySelector('.proj-name').addEventListener('click', () => openProjectEditor(p.id));
      grid.appendChild(card);
    });
  }

  function openProjectEditor(projId) {
    const state = Store.get();
    const p = projId ? Store.getProject(projId) : null;
    const base = p || {
      name: '', description: '', startDate: Utils.todayStr(), dueDate: null, milestones: [],
      priority: 'medium', status: 'not-started', notes: '', links: [],
      color: UI.COLOR_SWATCHES[Math.floor(Math.random() * UI.COLOR_SWATCHES.length)],
      icon: '📁', categoryId: null
    };

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="field-row">
        <div class="field">
          <label>Project name *</label>
          <input class="input" id="pjName" maxlength="120" value="${H(base.name)}" placeholder="e.g. History final presentation">
        </div>
        <div class="field">
          <label>Icon</label>
          <select class="select" id="pjIcon">${UI.ICON_CHOICES.map(i => `<option ${i === base.icon ? 'selected' : ''}>${i}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Description</label>
        <textarea class="textarea" id="pjDesc" placeholder="What is this project about?">${H(base.description)}</textarea></div>
      <div class="field-row-3">
        <div class="field"><label>Start date</label><input class="input" type="date" id="pjStart" value="${H(base.startDate || '')}"></div>
        <div class="field"><label>Target completion</label><input class="input" type="date" id="pjDue" value="${H(base.dueDate || '')}"></div>
        <div class="field"><label>Priority</label>
          <select class="select" id="pjPrio">${['low', 'medium', 'high', 'urgent'].map(x => `<option value="${x}" ${base.priority === x ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Status</label>
          <select class="select" id="pjStatus">${Storage.STATUSES.map(s => `<option value="${s}" ${base.status === s ? 'selected' : ''}>${{ 'not-started': 'Not started', 'in-progress': 'In progress', waiting: 'Waiting', completed: 'Completed' }[s]}</option>`).join('')}</select></div>
        <div class="field"><label>Category</label>
          <select class="select" id="pjCat"><option value="">None</option>
            ${state.categories.map(c => `<option value="${H(c.id)}" ${base.categoryId === c.id ? 'selected' : ''}>${H(c.icon)} ${H(c.name)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Reference links</label>
        <div id="pjLinks"></div><button class="btn btn-sm btn-ghost" type="button" id="pjAddLink">＋ Add link</button></div>
      <div class="field"><label>Notes</label>
        <textarea class="textarea" id="pjNotes" placeholder="Reference materials, contacts, ideas…">${H(base.notes)}</textarea></div>
      <div class="form-error" id="pjError"></div>`;

    const linkEd = body.querySelector('#pjLinks');
    function addLinkRow(link) {
      const row = document.createElement('div');
      row.className = 'subtask-editor-row';
      row.innerHTML = `
        <input class="input" style="flex:0 0 130px" placeholder="Label" value="${H(link ? link.label : '')}">
        <input class="input link-url" placeholder="https://…" value="${H(link ? link.url : '')}">
        <button class="icon-btn" type="button">✕</button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      linkEd.appendChild(row);
    }
    base.links.forEach(addLinkRow);
    body.querySelector('#pjAddLink').addEventListener('click', () => addLinkRow(null));

    openModal({
      title: p ? 'Edit project' : 'New project',
      body, large: true,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => UI.closeModal() },
        {
          label: p ? 'Save changes' : 'Create project', class: 'btn-primary',
          onClick: () => {
            const name = body.querySelector('#pjName').value.trim();
            if (!name) { body.querySelector('#pjError').textContent = 'Please enter a project name.'; return false; }
            Store.saveProject({
              id: projId || undefined,
              name,
              description: body.querySelector('#pjDesc').value,
              startDate: body.querySelector('#pjStart').value || null,
              dueDate: body.querySelector('#pjDue').value || null,
              priority: body.querySelector('#pjPrio').value,
              status: body.querySelector('#pjStatus').value,
              categoryId: body.querySelector('#pjCat').value || null,
              icon: body.querySelector('#pjIcon').value,
              color: p ? p.color : base.color,
              notes: body.querySelector('#pjNotes').value,
              milestones: p ? p.milestones : [],
              links: Array.from(linkEd.querySelectorAll('.subtask-editor-row')).map(row => ({
                label: row.children[0].value.trim(),
                url: row.querySelector('.link-url').value.trim()
              })).filter(l => l.url)
            });
            UI.toast('success', p ? 'Project updated' : 'Project created', name);
            UI.closeModal();
          }
        }
      ]
    });
  }

  global.Views = global.Views || {};
  global.Views.projects = { title: 'Projects', render, openProjectEditor };
})(typeof window !== 'undefined' ? window : globalThis);
