/* Momentum — app shell: navigation, router, theme, global search, seed data */
(function (global) {
  'use strict';

  const H = s => Utils.escapeHtml(s);

  const NAV = [
    { section: 'Overview' },
    { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { id: 'inbox', icon: '📥', label: 'Inbox' },
    { section: 'School' },
    { id: 'classes', icon: '📘', label: 'My Classes' },
    { id: 'tasks', icon: '✅', label: 'Assignments' },
    { id: 'daily', icon: '📅', label: 'Daily Planner' },
    { id: 'weekly', icon: '🗓️', label: 'Weekly Planner' },
    { id: 'monthly', icon: '📆', label: 'Calendar' },
    { id: 'agenda', icon: '📋', label: 'Agenda' },
    { id: 'kanban', icon: '🗂️', label: 'Kanban Board' },
    { id: 'projects', icon: '📁', label: 'Projects' },
    { section: 'Activities' },
    { id: 'activities', icon: '⭐', label: 'Activities & Events' },
    { section: 'Personal' },
    { id: 'goals', icon: '🎯', label: 'Goals' },
    { id: 'notes', icon: '📝', label: 'Notes' },
    { id: 'analytics', icon: '📊', label: 'Analytics' },
    { id: 'settings', icon: '⚙️', label: 'Settings' }
  ];

  let currentView = 'dashboard';

  function buildNav() {
    const nav = document.getElementById('sideNav');
    const state = Store.get();
    const overdue = Priority.stats(state).overdue;
    nav.innerHTML = NAV.map(item => {
      if (item.section) return `<div class="nav-section">${H(item.section)}</div>`;
      const badge = item.id === 'tasks' && overdue ? `<span class="nav-badge">${overdue}</span>` : '';
      return `<button class="nav-item ${item.id === currentView ? 'active' : ''}" data-view="${item.id}">
        <span class="nav-icon">${item.icon}</span><span>${H(item.label)}</span>${badge}</button>`;
    }).join('');
    nav.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        go(btn.dataset.view);
        document.getElementById('sidebar').classList.remove('open');
      });
    });
  }

  function go(view, opts) {
    if (!Views[view]) view = 'dashboard';
    if (view === 'inbox') {
      view = 'tasks';
      if (Views.tasks.preset) Views.tasks.preset({ status: 'undated' });
    }
    currentView = view;
    const host = document.getElementById('viewHost');
    Views[view].render(host);
    document.getElementById('topbarTitle').textContent = Views[view].title;
    buildNav();
    host.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }

  function rerender() {
    const host = document.getElementById('viewHost');
    if (!UI.modalIsOpen()) Views[currentView].render(host);
    buildNav();
    updateThemeToggle();
  }

  /* ---------- Theme ---------- */
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    Store.updateSettings({ theme });
    updateThemeToggle();
  }

  function updateThemeToggle() {
    const btn = document.getElementById('themeToggle');
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.innerHTML = dark ? '☀️ <span>Light mode</span>' : '🌙 <span>Dark mode</span>';
  }

  function applyTheme() {
    document.documentElement.dataset.theme = Store.get().settings.theme || 'light';
    updateThemeToggle();
  }

  /* ---------- Global search (Ctrl+K) ---------- */
  function openSearch() {
    const overlay = document.getElementById('searchOverlay');
    overlay.classList.remove('hidden');
    const input = document.getElementById('searchInput');
    input.value = '';
    renderSearch('');
    setTimeout(() => input.focus(), 40);
  }

  function closeSearch() {
    document.getElementById('searchOverlay').classList.add('hidden');
  }

  function renderSearch(q) {
    const state = Store.get();
    const root = document.getElementById('searchResults');
    const query = q.trim().toLowerCase();
    if (!query) {
      root.innerHTML = `<div class="empty" style="margin:8px"><span class="empty-icon">🔍</span>Type to search tasks, projects, goals and notes.</div>`;
      return;
    }
    const results = [];
    state.tasks.forEach(t => {
      const hay = (t.title + ' ' + t.description + ' ' + t.notes + ' ' + t.tags.join(' ')).toLowerCase();
      if (hay.includes(query)) results.push({ kind: 'Task', title: t.title, sub: t.dueDate ? Utils.fmtDateSmart(t.dueDate) : 'no deadline', go: () => UI.openTaskViewer(t.id) });
    });
    state.projects.forEach(p => {
      if ((p.name + ' ' + p.description + ' ' + p.notes).toLowerCase().includes(query)) results.push({ kind: 'Project', title: p.name, sub: `${Store.projectProgress(p)}% complete`, go: () => { closeSearch(); go('projects'); } });
    });
    state.goals.forEach(g => {
      if ((g.name + ' ' + g.description).toLowerCase().includes(query)) results.push({ kind: 'Goal', title: g.name, sub: `${Store.goalProgress(g)}% of milestones done`, go: () => { closeSearch(); go('goals'); } });
    });
    state.notes.forEach(n => {
      if ((n.title + ' ' + n.body).toLowerCase().includes(query)) results.push({ kind: 'Note', title: n.title, sub: (n.body || '').slice(0, 60), go: () => { closeSearch(); go('notes'); } });
    });
    state.categories.forEach(c => {
      if (c.name.toLowerCase().includes(query)) results.push({ kind: 'Category', title: `${c.icon} ${c.name}`, sub: 'category', go: () => { closeSearch(); go('settings'); } });
    });

    if (!results.length) {
      root.innerHTML = `<div class="empty" style="margin:8px"><span class="empty-icon">🤷</span>No matches for “${H(q)}”.</div>`;
      return;
    }
    root.innerHTML = '';
    results.slice(0, 25).forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'search-result';
      btn.innerHTML = `<span class="sr-kind">${H(r.kind)}</span><span class="grow"><div class="sr-title">${H(r.title)}</div><div class="sr-sub">${H(r.sub)}</div></span>`;
      btn.addEventListener('click', () => { closeSearch(); r.go(); });
      root.appendChild(btn);
    });
  }

  /* ---------- Sample data (first run / optional) ---------- */
  function seedIfEmpty() {
    const state = Store.get();
    if (state.settings.seeded || state.tasks.length || state.categories.length) {
      state.settings.seeded = true;
      Store.persist();
      return;
    }
    loadSampleData();
    state.settings.seeded = true;
    Store.persist();
  }

  function loadSampleData() {
    const today = Utils.todayStr();
    const d = n => Utils.addDays(today, n);
    const cats = [
      { id: 'cat-school', name: 'Schoolwork & Homework', color: '#3b82f6', icon: '📚' },
      { id: 'cat-study', name: 'Studying & Exam Prep', color: '#8b5cf6', icon: '🎓' },
      { id: 'cat-projects', name: 'Projects & Assignments', color: '#ec4899', icon: '📝' },
      { id: 'cat-extracurricular', name: 'Extracurricular Activities', color: '#10b981', icon: '🏆' },
      { id: 'cat-personal', name: 'Personal Responsibilities', color: '#f59e0b', icon: '❤️' },
      { id: 'cat-household', name: 'Household Tasks', color: '#14b8a6', icon: '🧹' },
      { id: 'cat-hobbies', name: 'Hobbies', color: '#6366f1', icon: '🎨' },
      { id: 'cat-goals', name: 'Long-Term Goals', color: '#8b5cf6', icon: '🎯' },
      { id: 'cat-misc', name: 'Miscellaneous', color: '#64748b', icon: '🏷️' }
    ];
    cats.forEach(c => Store.saveCategory(c));

    const classes = [
      { id: 'cls-math', name: 'Mathematics', teacher: 'Mr. Alvarez', room: 'B-204', color: '#3b82f6', icon: '➗',
        slots: [{ day: 1, start: '08:30', end: '09:30' }, { day: 3, start: '08:30', end: '09:30' }, { day: 5, start: '08:30', end: '09:30' }] },
      { id: 'cls-sci', name: 'Science', teacher: 'Dr. Chen', room: 'Lab 2', color: '#14b8a6', icon: '🧪',
        slots: [{ day: 0, start: '10:00', end: '11:15' }, { day: 2, start: '10:00', end: '11:15' }] },
      { id: 'cls-eng', name: 'English', teacher: 'Ms. Rivera', room: 'A-101', color: '#ec4899', icon: '📖',
        slots: [{ day: 1, start: '13:00', end: '14:15' }, { day: 4, start: '13:00', end: '14:15' }] },
      { id: 'cls-hist', name: 'History', teacher: 'Mr. Okafor', room: 'C-310', color: '#f59e0b', icon: '🏛️',
        slots: [{ day: 0, start: '14:30', end: '15:30' }, { day: 3, start: '14:30', end: '15:30' }] }
    ];
    classes.forEach(c => Store.saveClass(c));

    const projId = 'proj-sample';
    Store.saveProject({
      id: projId, name: 'Biology Research Paper', icon: '📝', color: '#ec4899',
      description: 'End-of-term research paper on ecosystem dynamics — 12 pages, APA style.',
      startDate: d(-10), dueDate: d(9), priority: 'high', status: 'in-progress', categoryId: 'cat-projects', classId: 'cls-sci',
      milestones: [
        { id: Utils.uid('ms'), title: 'Choose topic & get approval', done: true },
        { id: Utils.uid('ms'), title: 'Finish literature research', done: true },
        { id: Utils.uid('ms'), title: 'Complete first draft', done: false, dueDate: d(4) },
        { id: Utils.uid('ms'), title: 'Revise & final edits', done: false, dueDate: d(8) }
      ],
      links: [{ label: 'Style guide', url: 'https://apastyle.apa.org' }],
      notes: 'Office hours: Tue/Thu 3–5pm. Grading rubric in course portal.'
    });

    const tasks = [
      { title: 'Finish physics lab report', description: 'Sections: method, results, error analysis. Graphs must be hand-drawn scale.', dueDate: today, time: '16:00', estimateMin: 90, priority: 'high', categoryId: 'cat-school', classId: 'cls-sci', assignmentType: 'lab', submission: 'working', tags: ['lab', 'physics'], reminders: [30, 1440], subtasks: [{ title: 'Write method section', done: true }, { title: 'Error analysis', done: false }, { title: 'Draw graphs', done: false }], sessions: [{ date: today, time: '16:00', durationMin: 60, objective: 'Error analysis + graphs' }] },
      { title: 'Math homework set 7', description: 'Chapter 7: integration by parts, problems 1–20.', dueDate: today, time: '19:00', estimateMin: 60, priority: 'medium', categoryId: 'cat-school', classId: 'cls-math', assignmentType: 'homework', tags: ['math'], reminders: [30], sessions: [{ date: today, time: '19:00', durationMin: 45, objective: 'Problems 1–20' }] },
      { title: 'Return library books', dueDate: d(-1), priority: 'low', categoryId: 'cat-misc', notes: '3 books, small fine accruing.' },
      { title: 'History essay outline', description: 'Thesis + 5 paragraph plan on the Industrial Revolution.', dueDate: d(1), time: '17:30', estimateMin: 45, priority: 'high', categoryId: 'cat-school', classId: 'cls-hist', assignmentType: 'essay', tags: ['essay', 'history'], sessions: [{ date: today, time: '17:30', durationMin: 45, objective: 'Thesis + section plan' }] },
      { title: 'Chemistry midterm — unit 3', description: 'Covers stoichiometry, bonding, reactions. Redo practice exam B first.', dueDate: d(4), estimateMin: 120, priority: 'high', categoryId: 'cat-study', classId: 'cls-sci', assignmentType: 'test', tags: ['exam', 'chemistry'], reminders: [1440], subtasks: [{ title: 'Practice exam A', done: true }, { title: 'Practice exam B', done: false }], sessions: [{ date: d(2), time: '16:30', durationMin: 60, objective: 'Redo practice exam B' }, { date: d(3), time: '16:30', durationMin: 60, objective: 'Flashcards: formulas' }] },
      { title: 'English reading — chapters 5–6', dueDate: d(2), estimateMin: 40, priority: 'medium', categoryId: 'cat-school', classId: 'cls-eng', assignmentType: 'reading', sessions: [{ date: d(1), time: '19:30', durationMin: 40, objective: 'Chapters 5–6 + notes' }] },
      { title: 'Research paper: first draft', description: 'Full draft of all sections for the Biology paper.', dueDate: d(5), estimateMin: 180, priority: 'urgent', categoryId: 'cat-projects', classId: 'cls-sci', assignmentType: 'project', projectId: projId, submission: 'working', reminders: [1440], sessions: [{ date: d(1), time: '15:30', durationMin: 60, objective: 'Draft intro + method' }, { date: d(2), time: '15:30', durationMin: 60, objective: 'Draft results' }, { date: d(3), time: '15:30', durationMin: 60, objective: 'Draft discussion' }] },
      { title: 'History quiz — Industrial Revolution', dueDate: d(7), estimateMin: 60, priority: 'medium', categoryId: 'cat-study', classId: 'cls-hist', assignmentType: 'quiz', sessions: [{ date: d(5), time: '17:00', durationMin: 30, objective: 'Review timeline' }] },
      { title: 'Clean and organize desk', dueDate: d(4), estimateMin: 30, priority: 'low', categoryId: 'cat-household' },
      { title: 'Practice guitar — new song', dueDate: d(2), time: '20:00', estimateMin: 40, priority: 'low', categoryId: 'cat-hobbies', recurrence: { type: 'daily', interval: 2 } },
      { title: 'Call grandma', dueDate: d(6), priority: 'medium', categoryId: 'cat-personal', recurrence: { type: 'weekly', interval: 1 } },
      { title: 'Buy groceries', description: 'Milk, eggs, spinach, rice, coffee.', dueDate: d(1), priority: 'medium', categoryId: 'cat-household' },
      { title: 'Read chapter 4 — Economics', dueDate: d(-2), estimateMin: 60, priority: 'high', categoryId: 'cat-school', status: 'in-progress', tags: ['reading'] },
      { title: 'Team project sync meeting', dueDate: d(1), time: '15:00', durationMin: 45, priority: 'medium', categoryId: 'cat-projects', links: [{ label: 'Meeting link', url: 'https://meet.example.com/team' }] },
      { title: 'Water the plants', dueDate: today, time: '09:00', priority: 'low', categoryId: 'cat-household', recurrence: { type: 'weekly', interval: 1 } },
      { title: 'Sign up for science fair', priority: 'low', categoryId: 'cat-school', classId: 'cls-sci', notes: 'Ask Dr. Chen about the deadline.' }
    ];
    tasks.forEach(t => Store.saveTask(t));

    const events = [
      { id: 'evt-soccer', title: 'Soccer practice', icon: '⚽', date: d(1), time: '18:00', endTime: '19:30', location: 'Main field', categoryId: 'cat-extracurricular', notes: 'Bring shin guards and water bottle.' },
      { id: 'evt-soccer2', title: 'Soccer practice', icon: '⚽', date: d(3), time: '18:00', endTime: '19:30', location: 'Main field', categoryId: 'cat-extracurricular' },
      { id: 'evt-club', title: 'Debate club meeting', icon: '🤝', date: d(2), time: '16:00', endTime: '17:00', location: 'Room A-105', categoryId: 'cat-extracurricular', notes: 'Prepare a 2-minute argument on the weekly motion.' },
      { id: 'evt-match', title: 'Soccer match vs. Riverside', icon: '🏆', date: d(5), time: '14:00', endTime: '16:00', location: 'Riverside HS', categoryId: 'cat-extracurricular', notes: 'Bus leaves 12:30 from the gym.' },
      { id: 'evt-dentist', title: 'Dentist appointment', icon: '🏥', date: d(4), time: '10:30', endTime: '11:15', location: 'Dr. Patel', categoryId: 'cat-personal' }
    ];
    events.forEach(e => Store.saveEvent(e));

    Store.saveGoal({
      name: 'Make the honor roll this semester', icon: '🎓', color: '#8b5cf6',
      description: 'Keep every class at B+ or above and ace the finals.',
      targetDate: d(60),
      milestones: [
        { id: Utils.uid('ms'), title: 'A in Physics midterm', done: true },
        { id: Utils.uid('ms'), title: 'All homework turned in for 4 straight weeks', done: false },
        { id: Utils.uid('ms'), title: 'Finish finals with no all-nighters', done: false }
      ]
    });
    Store.saveGoal({
      name: 'Run a 10K', icon: '🏃', color: '#10b981',
      description: 'From couch to 10K by end of season.',
      targetDate: d(90),
      milestones: [
        { id: Utils.uid('ms'), title: 'Run 5K without stopping', done: true },
        { id: Utils.uid('ms'), title: 'Run 8K', done: false },
        { id: Utils.uid('ms'), title: 'Complete a 10K race', done: false }
      ]
    });

    Store.saveNote({
      title: 'Essay requirements — History', color: '#f59e0b', pinned: true,
      body: '• 1500–2000 words\n• Minimum 5 sources, 2 primary\n• MLA citations\n• Due end of month — outline first!',
      taskIds: Store.get().tasks.filter(t => t.title === 'History essay outline').map(t => t.id)
    });
    Store.saveNote({
      title: 'Study techniques that work for me', color: '#10b981',
      body: 'Pomodoro 25/5 works best after 4pm.\nFlashcards for chemistry formulas.\nTeach concepts out loud to check understanding.',
      projectIds: [projId]
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    Store.init();
    applyTheme();

    document.getElementById('quickAddBtn').addEventListener('click', () => UI.quickAdd());
    document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('themeToggle').addEventListener('click', () => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    document.getElementById('globalSearchBtn').addEventListener('click', openSearch);
    document.getElementById('searchInput').addEventListener('input', e => renderSearch(e.target.value));
    document.getElementById('searchOverlay').addEventListener('click', e => { if (e.target.id === 'searchOverlay') closeSearch(); });

    document.addEventListener('keydown', e => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
      if (isCtrl && e.key.toLowerCase() === 'n' && !UI.modalIsOpen()) { e.preventDefault(); UI.quickAdd(); }
      if (e.key === 'Escape') {
        if (!document.getElementById('searchOverlay').classList.contains('hidden')) closeSearch();
        else if (UI.modalIsOpen()) UI.closeModal();
      }
    });

    Store.subscribe(rerender);
    seedIfEmpty();
    Reminders.start();
    go('dashboard');

    window.addEventListener('resize', Utils.debounce(() => {
      if (currentView === 'analytics' && !UI.modalIsOpen()) Views.analytics.render(document.getElementById('viewHost'));
    }, 250));
  }

  const App = { boot, go, setTheme, openTask: id => UI.openTaskViewer(id), loadSampleData, openSearch };

  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
