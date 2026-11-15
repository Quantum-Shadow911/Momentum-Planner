/* Momentum — Tasks view: full CRUD list with search, filters, sorting, history */
(function (global) {
  'use strict';

  const filters = { q: '', prio: '', cat: '', cls: '', type: '', sub: '', status: 'open', tag: '', sort: 'due', mode: '' };
  let showHistory = false;

  const MODES = {
    inbox: { title: '📥 Inbox', sub: 'Tasks you captured without a date. Open one to schedule it, or drag it into a day when you are ready.' },
    personal: { title: '🏠 Other Responsibilities', sub: 'Open tasks that are not tied to a school class — personal, household and everything else.' }
  };

  function render(host) {
    const state = Store.get();
    const allTags = Array.from(new Set(state.tasks.flatMap(t => t.tags))).sort();
    const mode = MODES[filters.mode] || { title: 'Assignments', sub: 'Create, organize and track everything on your plate.' };

    host.innerHTML = `
      <div class="page-head">
        <div><h2>${H(mode.title)}</h2><div class="sub">${H(mode.sub)}</div></div>
        <div class="row">
          <button class="btn" id="newFromTpl">📋 From template</button>
          <button class="btn btn-primary" id="newTaskBtn">＋ New task</button>
        </div>
      </div>
      <div class="toolbar">
        <input class="input search-grow" id="fQ" placeholder="🔍 Search tasks…" value="${H(filters.q)}">
        <select class="select" id="fStatus">
          <option value="open" ${filters.status === 'open' ? 'selected' : ''}>Open tasks</option>
          <option value="today" ${filters.status === 'today' ? 'selected' : ''}>Due today</option>
          <option value="overdue" ${filters.status === 'overdue' ? 'selected' : ''}>Overdue</option>
          <option value="undated" ${filters.status === 'undated' ? 'selected' : ''}>Inbox (no date)</option>
          <option value="not-started" ${filters.status === 'not-started' ? 'selected' : ''}>Not started</option>
          <option value="in-progress" ${filters.status === 'in-progress' ? 'selected' : ''}>In progress</option>
          <option value="waiting" ${filters.status === 'waiting' ? 'selected' : ''}>Waiting</option>
          <option value="completed" ${filters.status === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="all" ${filters.status === 'all' ? 'selected' : ''}>All</option>
        </select>
        <select class="select" id="fPrio">
          <option value="">All priorities</option>
          ${['urgent', 'high', 'medium', 'low'].map(p => `<option value="${p}" ${filters.prio === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}
        </select>
        <select class="select" id="fCat">
          <option value="">All categories</option>
          ${state.categories.map(c => `<option value="${H(c.id)}" ${filters.cat === c.id ? 'selected' : ''}>${H(c.icon)} ${H(c.name)}</option>`).join('')}
        </select>
        <select class="select" id="fCls">
          <option value="">All classes</option>
          <option value="none" ${filters.cls === 'none' ? 'selected' : ''}>Not school-related</option>
          ${state.classes.map(c => `<option value="${H(c.id)}" ${filters.cls === c.id ? 'selected' : ''}>${H(c.icon)} ${H(c.name)}</option>`).join('')}
        </select>
        <select class="select" id="fType">
          <option value="">All types</option>
          ${Storage.ASSIGNMENT_TYPES.map(t => `<option value="${t}" ${filters.type === t ? 'selected' : ''}>${UI.TYPE_LABELS[t] || t}</option>`).join('')}
        </select>
        <select class="select" id="fSub">
          <option value="">All submissions</option>
          ${Storage.SUBMISSION_STATES.map(s => `<option value="${s}" ${filters.sub === s ? 'selected' : ''}>${{ 'not-started': 'Not started', working: 'Working on it', ready: 'Ready to submit', submitted: 'Submitted' }[s]}</option>`).join('')}
        </select>
        <select class="select" id="fTag"><option value="">All tags</option>${allTags.map(t => `<option value="${H(t)}" ${filters.tag === t ? 'selected' : ''}>#${H(t)}</option>`).join('')}</select>
        <select class="select" id="fSort">
          <option value="due" ${filters.sort === 'due' ? 'selected' : ''}>Sort: deadline</option>
          <option value="priority" ${filters.sort === 'priority' ? 'selected' : ''}>Sort: priority</option>
          <option value="smart" ${filters.sort === 'smart' ? 'selected' : ''}>Sort: smart score</option>
          <option value="created" ${filters.sort === 'created' ? 'selected' : ''}>Sort: newest</option>
          <option value="title" ${filters.sort === 'title' ? 'selected' : ''}>Sort: title A–Z</option>
        </select>
        <button class="btn btn-ghost" id="clearFilters">Reset</button>
      </div>
      <div class="task-list" id="taskList"></div>
      <div class="detail-section" style="margin-top:22px">
        <button class="link-btn" id="toggleHistory">${showHistory ? '▾' : '▸'} Task history — completed (${state.tasks.filter(t => t.status === 'completed').length})</button>
        <div id="historyArea" style="margin-top:12px"></div>
      </div>
    `;

    host.querySelector('#newTaskBtn').addEventListener('click', () => UI.openTaskEditor());
    host.querySelector('#newFromTpl').addEventListener('click', () => UI.openTemplatePicker({ dueDate: null, classId: filters.cls !== 'none' ? filters.cls : null }));
    const bind = (id, key) => {
      const el = host.querySelector(id);
      el.addEventListener('change', () => { filters[key] = el.value; filters.mode = ''; renderList(); });
    };
    host.querySelector('#fQ').addEventListener('input', Utils.debounce(() => { filters.q = host.querySelector('#fQ').value; renderList(); }, 150));
    bind('#fStatus', 'status'); bind('#fPrio', 'prio'); bind('#fCat', 'cat'); bind('#fTag', 'tag'); bind('#fSort', 'sort');
    bind('#fCls', 'cls'); bind('#fType', 'type'); bind('#fSub', 'sub');
    host.querySelector('#clearFilters').addEventListener('click', () => {
      Object.assign(filters, { q: '', prio: '', cat: '', cls: '', type: '', sub: '', status: 'open', tag: '', mode: '' });
      render(host);
    });
    host.querySelector('#toggleHistory').addEventListener('click', () => { showHistory = !showHistory; render(host); });

    function renderList() {
      const list = host.querySelector('#taskList');
      const cur = Store.get();
      const q = filters.q.toLowerCase();
      let items = cur.tasks.filter(t => {
        if (filters.status === 'open' && t.status === 'completed') return false;
        if (filters.status === 'completed' && t.status !== 'completed') return false;
        if (['not-started', 'in-progress', 'waiting'].includes(filters.status) && t.status !== filters.status) return false;
        if (filters.status === 'today' && !Priority.isDueToday(t)) return false;
        if (filters.status === 'overdue' && !Priority.isOverdue(t)) return false;
        if (filters.status === 'undated' && t.dueDate) return false;
        if (filters.prio && t.priority !== filters.prio) return false;
        if (filters.cat && t.categoryId !== filters.cat) return false;
        if (filters.cls && (filters.cls === 'none' ? !!t.classId : t.classId !== filters.cls)) return false;
        if (filters.type && t.assignmentType !== filters.type) return false;
        if (filters.sub && t.submission !== filters.sub) return false;
        if (filters.tag && !t.tags.includes(filters.tag)) return false;
        if (q) {
          const hay = (t.title + ' ' + t.description + ' ' + t.notes + ' ' + t.tags.join(' ')).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      switch (filters.sort) {
        case 'priority': items.sort((a, b) => (Priority.PRIO_WEIGHT[b.priority] || 0) - (Priority.PRIO_WEIGHT[a.priority] || 0) || Priority.byDue(a, b)); break;
        case 'smart': items.sort((a, b) => Priority.score(b, cur) - Priority.score(a, cur)); break;
        case 'created': items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')); break;
        case 'title': items.sort((a, b) => a.title.localeCompare(b.title)); break;
        default: items.sort(Priority.byDue);
      }

      list.innerHTML = '';
      if (!items.length) {
        list.innerHTML = `<div class="empty"><span class="empty-icon">🗂️</span>No tasks match these filters.</div>`;
      } else {
        items.forEach(t => list.appendChild(UI.taskItem(t)));
      }
    }

    function renderHistory() {
      const area = host.querySelector('#historyArea');
      if (!showHistory) { area.innerHTML = ''; return; }
      const done = Store.get().tasks.filter(t => t.status === 'completed')
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
      if (!done.length) {
        area.innerHTML = `<div class="empty"><span class="empty-icon">📜</span>Completed tasks will appear here.</div>`;
        return;
      }
      done.forEach(t => area.appendChild(UI.taskItem(t)));
    }

    renderList();
    renderHistory();
  }

  function preset(patch) {
    Object.assign(filters, patch);
  }

  global.Views = global.Views || {};
  global.Views.tasks = { title: 'Assignments', render, preset };
})(typeof window !== 'undefined' ? window : globalThis);
