/* Momentum — Notes: ideas, instructions, research; linkable to tasks & projects */
(function (global) {
  'use strict';

  let noteQuery = '';

  function render(host) {
    const state = Store.get();

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Notes</h2><div class="sub">Assignment instructions, research, ideas and reminders — link them to tasks and projects.</div></div>
        <button class="btn btn-primary" id="newNote">＋ New note</button>
      </div>
      <div class="toolbar">
        <input class="input search-grow" id="noteQ" placeholder="🔍 Search notes…" value="${H(noteQuery)}">
      </div>
      <div class="notes-grid" id="notesGrid"></div>
    `;
    host.querySelector('#newNote').addEventListener('click', () => openNoteEditor());
    host.querySelector('#noteQ').addEventListener('input', Utils.debounce(() => {
      noteQuery = host.querySelector('#noteQ').value;
      renderGrid();
    }, 120));

    function renderGrid() {
      const grid = host.querySelector('#notesGrid');
      const cur = Store.get();
      const q = noteQuery.toLowerCase();
      const notes = cur.notes.filter(n => {
        if (q && !(n.title + ' ' + n.body).toLowerCase().includes(q)) return false;
        return true;
      }).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      grid.innerHTML = '';
      if (!notes.length) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="empty-icon">📝</span>${q ? 'No notes match your search.' : 'No notes yet. Capture your first idea!'}</div>`;
        return;
      }
      notes.forEach(n => {
        const linkedTasks = n.taskIds.map(id => cur.tasks.find(t => t.id === id)).filter(Boolean);
        const linkedProjects = n.projectIds.map(id => cur.projects.find(p => p.id === id)).filter(Boolean);
        const card = document.createElement('div');
        card.className = 'note-card' + (n.pinned ? ' pinned' : '');
        card.style.borderTopColor = n.pinned ? 'var(--amber)' : n.color;
        card.innerHTML = `
          <div class="spread">
            <div class="note-title">${H(n.title)}</div>
            <div class="task-actions">
              <button class="icon-btn" data-pin title="${n.pinned ? 'Unpin' : 'Pin'}">${n.pinned ? '📌' : '📍'}</button>
              <button class="icon-btn" data-edit title="Edit">✏️</button>
              <button class="icon-btn" data-del title="Delete">🗑️</button>
            </div>
          </div>
          <div class="note-body">${H(n.body)}</div>
          ${(linkedTasks.length || linkedProjects.length) ? `<div class="note-links">
            ${linkedTasks.map(t => `<span class="tag-chip" data-task="${H(t.id)}" style="cursor:pointer">✓ ${H(t.title.slice(0, 24))}</span>`).join('')}
            ${linkedProjects.map(p => `<span class="tag-chip" data-proj="${H(p.id)}" style="cursor:pointer">📁 ${H(p.name.slice(0, 24))}</span>`).join('')}
          </div>` : ''}
          <div class="muted small">Updated ${H(Utils.fmtDate((n.updatedAt || '').slice(0, 10)))}</div>`;
        card.querySelector('[data-pin]').addEventListener('click', () => Store.saveNote({ ...n, pinned: !n.pinned }));
        card.querySelector('[data-edit]').addEventListener('click', () => openNoteEditor(n.id));
        card.querySelector('[data-del]').addEventListener('click', async () => {
          const ok = await UI.confirmDialog({ title: 'Delete note?', message: `“${n.title}” will be moved to trash.`, confirmLabel: 'Delete', danger: true });
          if (ok) { Store.deleteNote(n.id); UI.toast('info', 'Note deleted', 'Restore it from Settings → Trash.'); }
        });
        card.querySelectorAll('[data-task]').forEach(el => el.addEventListener('click', () => UI.openTaskViewer(el.dataset.task)));
        card.querySelectorAll('[data-proj]').forEach(el => el.addEventListener('click', () => App.go('projects')));
        grid.appendChild(card);
      });
    }

    renderGrid();
  }

  function openNoteEditor(noteId) {
    const state = Store.get();
    const n = noteId ? state.notes.find(x => x.id === noteId) : null;
    const base = n || { title: '', body: '', color: '#f59e0b', pinned: false, taskIds: [], projectIds: [] };

    UI.openModal({
      title: n ? 'Edit note' : 'New note',
      large: true,
      body: `
        <div class="field-row">
          <div class="field"><label>Title *</label><input class="input" id="ntTitle" maxlength="200" value="${H(base.title)}" placeholder="e.g. Essay requirements"></div>
          <div class="field"><label>Color</label>
            <div class="row-wrap" id="ntColors">${UI.COLOR_SWATCHES.map(c => `<button type="button" data-c="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};border:${c === base.color ? '3px solid var(--text)' : '2px solid var(--border)'}"></button>`).join('')}</div></div>
        </div>
        <div class="field"><label>Note</label><textarea class="textarea" id="ntBody" style="min-height:160px" placeholder="Write anything: instructions, research links, reminders…">${H(base.body)}</textarea></div>
        ${state.tasks.length || state.projects.length ? `
        <div class="field-row">
          <div class="field"><label>Link to tasks</label>
            <select class="select" id="ntTask" multiple size="4">
              ${state.tasks.slice(0, 60).map(t => `<option value="${H(t.id)}" ${base.taskIds.includes(t.id) ? 'selected' : ''}>${H(t.title.slice(0, 50))}</option>`).join('')}
            </select></div>
          <div class="field"><label>Link to projects</label>
            <select class="select" id="ntProj" multiple size="4">
              ${state.projects.map(p => `<option value="${H(p.id)}" ${base.projectIds.includes(p.id) ? 'selected' : ''}>${H(p.name)}</option>`).join('')}
            </select></div>
        </div>` : ''}`,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => UI.closeModal() },
        {
          label: n ? 'Save note' : 'Create note', class: 'btn-primary',
          onClick: () => {
            const title = document.getElementById('ntTitle').value.trim();
            const bodyTxt = document.getElementById('ntBody').value;
            if (!title && !bodyTxt.trim()) { UI.toast('danger', 'Empty note', 'Add a title or some text.'); return false; }
            Store.saveNote({
              id: noteId || undefined, title, body: bodyTxt,
              color: selectedColor || base.color,
              pinned: n ? n.pinned : false,
              taskIds: Array.from(document.querySelectorAll('#ntTask option:checked')).map(o => o.value),
              projectIds: Array.from(document.querySelectorAll('#ntProj option:checked')).map(o => o.value)
            });
            UI.toast('success', n ? 'Note saved' : 'Note created', title || 'Untitled note');
            UI.closeModal();
          }
        }
      ]
    });

    let selectedColor = base.color;
    document.getElementById('ntColors').addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      selectedColor = b.dataset.c;
      document.querySelectorAll('#ntColors [data-c]').forEach(x => {
        x.style.border = x.dataset.c === selectedColor ? '3px solid var(--text)' : '2px solid var(--border)';
      });
    });
  }

  global.Views = global.Views || {};
  global.Views.notes = { title: 'Notes', render, openNoteEditor };
})(typeof window !== 'undefined' ? window : globalThis);
