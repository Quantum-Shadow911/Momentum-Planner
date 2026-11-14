/* Momentum — Kanban board: 4 status columns with drag & drop between stages */
(function (global) {
  'use strict';

  const COLUMNS = [
    { key: 'not-started', label: '○ Not Started', color: 'var(--text-3)' },
    { key: 'in-progress', label: '◐ In Progress', color: 'var(--blue)' },
    { key: 'waiting', label: '⏸ Waiting', color: 'var(--amber)' },
    { key: 'completed', label: '✓ Completed', color: 'var(--green)' }
  ];
  let boardFilter = { cat: '', q: '' };

  function render(host) {
    const state = Store.get();

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Kanban Board</h2><div class="sub">Drag cards between columns to update status — every view stays in sync.</div></div>
      </div>
      <div class="toolbar">
        <input class="input search-grow" id="kbQ" placeholder="🔍 Filter cards…" value="${H(boardFilter.q)}">
        <select class="select" id="kbCat">
          <option value="">All categories</option>
          ${state.categories.map(c => `<option value="${H(c.id)}" ${boardFilter.cat === c.id ? 'selected' : ''}>${H(c.icon)} ${H(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="kanban" id="kanban"></div>
    `;

    host.querySelector('#kbQ').addEventListener('input', Utils.debounce(() => { boardFilter.q = host.querySelector('#kbQ').value; renderColumns(); }, 150));
    host.querySelector('#kbCat').addEventListener('change', () => { boardFilter.cat = host.querySelector('#kbCat').value; renderColumns(); });

    const kanban = host.querySelector('#kanban');
    COLUMNS.forEach(col => {
      const colEl = document.createElement('div');
      colEl.className = 'kanban-col';
      colEl.innerHTML = `
        <div class="kanban-col-head">
          <span class="dot" style="background:${col.color};width:10px;height:10px"></span>
          <span>${H(col.label)}</span><span class="count" data-count>0</span>
        </div>
        <div class="kanban-col-body" data-status="${col.key}"></div>
        <button class="btn btn-sm btn-ghost btn-block" style="margin-top:9px" data-add="${col.key}">＋ Add here</button>`;
      colEl.querySelector('[data-add]').addEventListener('click', () => UI.openTaskEditor(null, { status: col.key }));
      kanban.appendChild(colEl);

      const body = colEl.querySelector('.kanban-col-body');
      body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
      body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
      body.addEventListener('drop', e => {
        e.preventDefault();
        body.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/task-id');
        const t = Store.getTask(id);
        if (!t || t.status === col.key) return;
        Store.setTaskStatus(id, col.key);
        UI.toast('success', 'Status updated', `“${t.title}” → ${col.label.replace(/^\S+\s/, '')}`);
      });
    });

    function renderColumns() {
      const cur = Store.get();
      const q = boardFilter.q.toLowerCase();
      kanban.querySelectorAll('.kanban-col-body').forEach(body => {
        const status = body.dataset.status;
        body.innerHTML = '';
        const cards = cur.tasks.filter(t => {
          if (t.status !== status) return false;
          if (boardFilter.cat && t.categoryId !== boardFilter.cat) return false;
          if (q && !(t.title + ' ' + t.tags.join(' ')).toLowerCase().includes(q)) return false;
          return true;
        }).sort((a, b) => Priority.score(b, cur) - Priority.score(a, cur));

        body.closest('.kanban-col').querySelector('[data-count]').textContent = cards.length;

        if (!cards.length) {
          body.innerHTML = `<div class="muted small" style="text-align:center;padding:14px 4px">Drop tasks here</div>`;
        }
        cards.forEach(t => {
          const card = document.createElement('div');
          card.className = 'kanban-card';
          card.draggable = true;
          const cat = UI.catOf(t);
          const sub = t.subtasks.filter(s => s.done).length;
          card.innerHTML = `
            <div class="k-title">${H(t.title)}</div>
            <div class="k-meta">
              ${UI.prioBadge(t)}
              ${t.dueDate ? UI.dueBadge(t) : ''}
              ${cat ? `<span class="badge badge-cat"><span class="dot" style="background:${H(cat.color)}"></span>${H(cat.icon)}</span>` : ''}
              ${t.subtasks.length ? `<span class="muted small">☑ ${sub}/${t.subtasks.length}</span>` : ''}
            </div>`;
          card.addEventListener('click', () => UI.openTaskViewer(t.id));
          card.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/task-id', t.id);
            card.classList.add('dragging');
          });
          card.addEventListener('dragend', () => card.classList.remove('dragging'));
          body.appendChild(card);
        });
      });
    }

    renderColumns();
  }

  global.Views = global.Views || {};
  global.Views.kanban = { title: 'Kanban Board', render };
})(typeof window !== 'undefined' ? window : globalThis);
