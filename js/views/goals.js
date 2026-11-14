/* Momentum — Long-term goals with milestone progress tracking */
(function (global) {
  'use strict';

  function render(host) {
    const state = Store.get();

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Long-Term Goals</h2><div class="sub">Track the big picture. Add milestones and watch progress build.</div></div>
        <button class="btn btn-primary" id="newGoal">＋ New goal</button>
      </div>
      <div class="grid grid-2" id="goalGrid"></div>
    `;
    host.querySelector('#newGoal').addEventListener('click', () => openGoalEditor());

    const grid = host.querySelector('#goalGrid');
    if (!state.goals.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="empty-icon">🎯</span>No goals yet.<br>Define what you're working toward this semester and beyond.</div>`;
      return;
    }

    state.goals.forEach(g => {
      const pct = Store.goalProgress(g);
      const msDone = g.milestones.filter(m => m.done).length;
      const daysLeft = g.targetDate ? Utils.daysUntil(g.targetDate) : null;
      const card = document.createElement('div');
      card.className = 'card proj-card';
      card.innerHTML = `
        <div class="proj-head">
          <div class="proj-icon" style="background:${H(g.color)}22">${H(g.icon)}</div>
          <div class="grow">
            <div class="proj-name">${H(g.name)}</div>
            <div class="row-wrap" style="margin-top:5px">
              ${g.targetDate ? `<span class="badge ${daysLeft < 0 && pct < 100 ? 'badge-overdue' : ''}">🏁 target ${H(Utils.fmtDateSmart(g.targetDate))}</span>` : ''}
              <span class="badge">${g.milestones.length} milestone${g.milestones.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div class="task-actions">
            <button class="icon-btn" data-act="edit" title="Edit goal">✏️</button>
            <button class="icon-btn" data-act="delete" title="Delete goal">🗑️</button>
          </div>
        </div>
        ${g.description ? `<div class="muted small">${H(g.description)}</div>` : ''}
        <div>
          <div class="spread small" style="margin-bottom:5px"><span class="muted">Progress</span><strong>${pct}%</strong></div>
          <div class="progress ${pct === 100 ? 'green' : ''}"><div style="width:${pct}%"></div></div>
        </div>
        <div class="detail-section" style="border-top:none;padding-top:0;margin-top:2px">
          <h4 style="margin-bottom:4px">Milestones</h4>
          <div id="msHost"></div>
          <button class="btn btn-sm btn-ghost" data-addms style="margin-top:6px">＋ Add milestone</button>
        </div>
      `;
      const msHost = card.querySelector('#msHost');
      g.milestones.forEach(m => {
        const row = document.createElement('div');
        row.className = 'milestone';
        row.innerHTML = `
          <button class="task-check ${m.done ? 'checked' : ''}" aria-label="Toggle milestone">✓</button>
          <span class="ms-title ${m.done ? 'done' : ''}">${H(m.title)}</span>
          ${m.dueDate ? `<span class="muted small">${H(Utils.fmtDateSmart(m.dueDate))}</span>` : ''}
          <button class="icon-btn" style="opacity:.6" title="Remove milestone">✕</button>`;
        row.querySelector('.task-check').addEventListener('click', () => Store.toggleGoalMilestone(g.id, m.id));
        row.querySelector('.icon-btn').addEventListener('click', () => {
          g.milestones = g.milestones.filter(x => x.id !== m.id);
          Store.saveGoal(g);
        });
        msHost.appendChild(row);
      });
      card.querySelector('[data-addms]').addEventListener('click', () => {
        UI.openModal({
          title: 'New milestone',
          body: `<div class="field"><label>Milestone *</label><input class="input" id="msT" placeholder="e.g. Finish first draft"></div>`,
          buttons: [
            { label: 'Cancel', class: 'btn-ghost', onClick: () => UI.closeModal() },
            {
              label: 'Add', class: 'btn-primary',
              onClick: () => {
                const v = document.getElementById('msT').value.trim();
                if (!v) return false;
                Store.saveGoal({ ...g, milestones: [...g.milestones, { id: Utils.uid('ms'), title: v, done: false }] });
                UI.closeModal();
              }
            }
          ]
        });
      });
      card.querySelector('[data-act="edit"]').addEventListener('click', () => openGoalEditor(g.id));
      card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        const ok = await UI.confirmDialog({
          title: 'Delete goal?', message: `“${g.name}” will be moved to trash.`,
          confirmLabel: 'Delete', danger: true
        });
        if (ok) { Store.deleteGoal(g.id); UI.toast('info', 'Goal deleted', 'Restore it from Settings → Trash.'); }
      });
      grid.appendChild(card);
    });
  }

  function openGoalEditor(goalId) {
    const g = goalId ? Store.getGoal(goalId) : null;
    const base = g || {
      name: '', description: '', targetDate: null, milestones: [],
      color: UI.COLOR_SWATCHES[Math.floor(Math.random() * UI.COLOR_SWATCHES.length)], icon: '🎯', notes: ''
    };
    UI.openModal({
      title: g ? 'Edit goal' : 'New goal',
      body: `
        <div class="field-row">
          <div class="field"><label>Goal *</label><input class="input" id="glName" maxlength="120" value="${H(base.name)}" placeholder="e.g. Run a half marathon"></div>
          <div class="field"><label>Icon</label><select class="select" id="glIcon">${UI.ICON_CHOICES.map(i => `<option ${i === base.icon ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Description</label><textarea class="textarea" id="glDesc">${H(base.description)}</textarea></div>
        <div class="field"><label>Target date</label><input class="input" type="date" id="glTarget" value="${H(base.targetDate || '')}"></div>`,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => UI.closeModal() },
        {
          label: g ? 'Save changes' : 'Create goal', class: 'btn-primary',
          onClick: () => {
            const name = document.getElementById('glName').value.trim();
            if (!name) { UI.toast('danger', 'Missing name', 'Please give the goal a name.'); return false; }
            Store.saveGoal({
              id: goalId || undefined, name,
              description: document.getElementById('glDesc').value,
              targetDate: document.getElementById('glTarget').value || null,
              icon: document.getElementById('glIcon').value,
              color: g ? g.color : base.color,
              milestones: g ? g.milestones : [],
              notes: g ? g.notes : ''
            });
            UI.toast('success', g ? 'Goal updated' : 'Goal created', name);
            UI.closeModal();
          }
        }
      ]
    });
  }

  global.Views = global.Views || {};
  global.Views.goals = { title: 'Goals', render, openGoalEditor };
})(typeof window !== 'undefined' ? window : globalThis);
