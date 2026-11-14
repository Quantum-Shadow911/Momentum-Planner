/* Momentum — app shell: navigation, router, theme, global search, seed data */
(function (global) {
  'use strict';

  const H = s => Utils.escapeHtml(s);

  const APP_VERSION = '2.3.6-key-dates';

  const NAV = [
    { section: 'Overview' },
    { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { id: 'inbox', icon: '📥', label: 'Inbox' },
    { section: 'School' },
    { id: 'classes', icon: '📘', label: 'My Classes' },
    { id: 'tasks', icon: '✅', label: 'Assignments' },
    { id: 'exams', icon: '📄', label: 'Exams & Quizzes' },
    { id: 'daily', icon: '📅', label: 'Daily Planner' },
    { id: 'dates', icon: '📌', label: 'Important Dates/Calendar' },
    { id: 'agenda', icon: '📋', label: 'Agenda' },
    { section: 'Activities' },
    { id: 'activities', icon: '⭐', label: 'Activities & Events' },
    { id: 'personal', icon: '🏠', label: 'Other Responsibilities' },
    { section: 'Personal' },
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
    let titleOverride = null;
    if (view === 'inbox') {
      view = 'tasks';
      titleOverride = 'Inbox';
      if (Views.tasks.preset) Views.tasks.preset({ status: 'undated', cls: '', sub: '', mode: 'inbox' });
    }
    if (view === 'personal') {
      view = 'tasks';
      titleOverride = 'Other Responsibilities';
      if (Views.tasks.preset) Views.tasks.preset({ status: 'open', cls: 'none', sub: '', mode: 'personal' });
    }
    if (!Views[view]) view = 'dashboard';
    currentView = view;
    const host = document.getElementById('viewHost');
    Views[view].render(host);
    document.getElementById('topbarTitle').textContent = titleOverride || Views[view].title;
    buildNav();
    host.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }

  function rerender() {
    const host = document.getElementById('viewHost');
    if (!UI.modalIsOpen()) Views[currentView].render(host);
    buildNav();
    updateThemeToggle();
    updateSaveStatus();
  }

  /* ---------- Theme ---------- */
  function setTheme(theme) {
    Store.updateSettings({ theme });
    applyTheme();
  }

  const NIGHT_START = 19;
  const NIGHT_END = 7;

  function effectiveTheme() {
    const t = Store.get().settings.theme || 'light';
    if (t !== 'auto') return t;
    const h = new Date().getHours();
    return (h >= NIGHT_START || h < NIGHT_END) ? 'dark' : 'light';
  }

  function updateThemeToggle() {
    const btn = document.getElementById('themeToggle');
    const mode = Store.get().settings.theme || 'light';
    if (mode === 'auto') {
      btn.innerHTML = document.documentElement.dataset.theme === 'dark'
        ? '🌗 <span>Auto · night</span>'
        : '🌗 <span>Auto · day</span>';
    } else {
      btn.innerHTML = document.documentElement.dataset.theme === 'dark' ? '☀️ <span>Light mode</span>' : '🌙 <span>Dark mode</span>';
    }
  }

  function applyTheme() {
    document.documentElement.dataset.theme = effectiveTheme();
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
      root.innerHTML = `<div class="empty" style="margin:8px"><span class="empty-icon">🔍</span>Type to search tasks and events.</div>`;
      return;
    }
    const results = [];
    state.tasks.forEach(t => {
      const hay = (t.title + ' ' + t.description + ' ' + t.notes + ' ' + t.tags.join(' ')).toLowerCase();
      if (hay.includes(query)) results.push({ kind: 'Task', title: t.title, sub: t.dueDate ? Utils.fmtDateSmart(t.dueDate) : 'no deadline', go: () => UI.openTaskViewer(t.id) });
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
    state.settings.lastVersion = APP_VERSION;
    Store.persist();
  }

  /* Upgrade notice: when a returning user opens a newer version, offer the
     school sample content so new features are visible with their old data. */
  function maybeShowUpgrade() {
    const s = Store.get().settings;
    if (!s.seeded || s.lastVersion === APP_VERSION) return;
    Store.updateSettings({ lastVersion: APP_VERSION });
    const hasSchool = Store.get().classes.length > 0;
    const freshStart = () => {
      const fresh = Storage.emptyState();
      fresh.settings = { ...Store.get().settings, seeded: true };
      Store.replaceState(fresh);
      App.loadSampleData();
      UI.closeModal();
      App.go('dashboard');
      UI.toast('success', 'Fresh start ready', 'Your dashboard now shows the school portal with your period schedule.');
    };
    UI.openModal({
      title: '\u{1F44B} Welcome to Momentum v' + APP_VERSION,
      body: `
        <p style="margin-top:0;color:var(--text-2)">Momentum is now a <strong>school portal</strong>: your class periods sit on the left of the dashboard, with your to-do list, exams, important dates and a calendar below.</p>
        <div class="detail-section">
          <h4>New in this version</h4>
          <ul style="margin:0;padding-left:18px;color:var(--text-2);line-height:1.7">
            <li>\u{1F3EB} <strong>School-portal dashboard</strong> \u2014 period schedule panel, to-do list, exams, dates, calendar</li>
            <li>\u{1F315} <strong>Auto day/night theme</strong> \u2014 light in the daytime, dark at night</li>
            <li>\u2696 <strong>Smarter workload balancing</strong> \u2014 avoids days packed with activities</li>
            <li>\u{1F501} <strong>Recurring events</strong>, \u{1F4CB} <strong>weekly review</strong>, \u26A0 conflict warnings</li>
          </ul>
        </div>
        ${hasSchool
          ? '<p class="muted small" style="margin-bottom:0"><strong>Start fresh</strong> replaces the old sample data with the new school sample (your real schedule). Choose <em>Keep my data</em> if you have added your own tasks.</p>'
          : '<p class="muted small" style="margin-bottom:0">You can always load samples later from Settings \u2192 Danger zone.</p>'}`,
      buttons: [
        { label: 'Keep my data', class: 'btn-ghost', onClick: () => UI.closeModal() },
        hasSchool
          ? { label: '\u{1F504} Start fresh with the new sample', class: 'btn-primary', onClick: freshStart }
          : {
              label: '\u{1F4DA} Load school sample data', class: 'btn-primary',
              onClick: () => {
                App.loadSampleData();
                UI.closeModal();
                App.go('dashboard');
                UI.toast('success', 'School sample data loaded', 'Explore My Classes, the weekly \u2696 Balance workload button and Exams & Quizzes.');
              }
            }
      ]
    });
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

    const weekdays = [1, 2, 3, 4, 5];
    const daily = (start, end) => weekdays.map(day => ({ day, start, end }));
    const classes = [
      { id: 'cls-sci', name: 'Science 6', teacher: 'Mrs. Khichadia', room: 'C 207', period: '01', color: '#14b8a6', icon: '🧪', slots: daily('08:15', '09:01') },
      { id: 'cls-pe', name: 'PE 6th', teacher: 'Mrs. Pratt', room: 'GYM', period: '02', color: '#10b981', icon: '🏃', slots: daily('09:01', '09:55') },
      { id: 'cls-strings', name: 'Concert Orchestra', teacher: 'Mr. Balot', room: 'B 120', period: '03', color: '#8b5cf6', icon: '🎻', slots: daily('09:55', '10:41') },
      { id: 'cls-math', name: 'Course 3 Math', teacher: 'Mr. Haun', room: 'E 121', period: '04', color: '#3b82f6', icon: '➗', slots: daily('10:41', '11:57') },
      { id: 'cls-reading', name: 'Reading 6', teacher: 'Mrs. Kaplenko', room: 'C 102', period: '05', color: '#f59e0b', icon: '📖', slots: daily('11:57', '12:43') },
      { id: 'cls-la', name: 'Language Arts 6', teacher: 'Mrs. Kaplenko', room: 'C 102', period: '06', color: '#f97316', icon: '✏️', slots: daily('12:43', '13:29') },
      { id: 'cls-ss', name: 'Social Studies 6', teacher: 'Mrs. Kaplenko', room: 'C 102', period: '07', color: '#eab308', icon: '🌍', slots: daily('13:29', '14:15') },
    ];
    classes.forEach(c => Store.saveClass(c));

    Store.saveBreak({
      name: 'Winter break',
      start: Utils.addMonths(today, 1).slice(0, 8) + '20',
      end: Utils.addMonths(Utils.addMonths(today, 1), 1).slice(0, 8) + '02'
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

    const vEl = document.getElementById('appVersion');
    if (vEl) vEl.textContent = 'Momentum v' + APP_VERSION;
    showStorageBanners();
    Store.subscribe(rerender);
    Store.subscribe(updateSaveStatus);
    setInterval(applyTheme, 10 * 60 * 1000);
    seedIfEmpty();
    Reminders.start();
    Timer.init();
    Timer.onTick(renderTimerWidget);
    renderTimerWidget();
    go('dashboard');
    maybeShowUpgrade();

    window.addEventListener('resize', Utils.debounce(() => {
      if (currentView === 'analytics' && !UI.modalIsOpen()) Views.analytics.render(document.getElementById('viewHost'));
    }, 250));
  }

  /* ---------- Study timer widget ---------- */
  function renderTimerWidget() {
    let root = document.getElementById('timerWidget');
    if (!root) {
      root = document.createElement('div');
      root.id = 'timerWidget';
      root.className = 'timer-widget hidden';
      document.body.appendChild(root);
    }
    const st = Timer.status();
    if (!st.active) { root.classList.add('hidden'); root.innerHTML = ''; return; }
    root.classList.remove('hidden');
    const mm = String(Math.floor(st.elapsedSec / 60)).padStart(2, '0');
    const ss = String(st.elapsedSec % 60).padStart(2, '0');
    root.innerHTML = `
      <div class="timer-main">
        <div class="timer-time">${st.running ? '\u23F1' : '\u23F8'} ${mm}:${ss}</div>
        <div class="timer-title">${H(st.title)}</div>
      </div>
      <div class="timer-btns">
        <button class="icon-btn" data-tt title="${st.running ? 'Pause' : 'Resume'}">${st.running ? '\u23F8' : '\u25B6\uFE0F'}</button>
        <button class="icon-btn" data-tf title="Finish & log time">\u2705</button>
        <button class="icon-btn" data-tx title="Discard">\u2715</button>
      </div>`;
    root.querySelector('[data-tt]').addEventListener('click', () => Timer.toggle());
    root.querySelector('[data-tf]').addEventListener('click', () => {
      const res = Timer.finish();
      if (res && res.committed) UI.toast('success', 'Time logged \u23F1', `${Utils.fmtDuration(res.minutes)} added to \u201C${res.title}\u201D.`);
      else if (res) UI.toast('info', 'Timer finished', 'The task no longer exists \u2014 time was discarded.');
    });
    root.querySelector('[data-tx]').addEventListener('click', () => Timer.cancel());
  }

  /* ---------- Storage health: banners + save indicator ---------- */
  let storageProbe = null;

  function updateSaveStatus() {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    if (storageProbe && !storageProbe.ok) {
      el.textContent = '\u26A0\uFE0F Not saving';
      el.style.color = 'var(--red)';
      return;
    }
    const ls = Storage.lastSave();
    el.style.color = '';
    if (ls.ok === false) { el.textContent = '\u26A0\uFE0F Save failed'; return; }
    if (ls.at) {
      const d = new Date(ls.at);
      el.textContent = '\u2705 Saved ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else {
      el.textContent = '';
    }
  }

  function showStorageBanners() {
    storageProbe = Storage.probe();
    const main = document.querySelector('.main');
    if (!main) return;
    const old = document.getElementById('storageBanner');
    if (old) old.remove();
    let html = '';
    if (!storageProbe.ok) {
      html = `<strong>\u26A0\uFE0F Your browser is blocking saving.</strong> Nothing you add will be kept. Fix: don't use a Private/Incognito window, and allow cookies & site data for this website (Safari: Settings, or Chrome: the lock icon in the address bar).`;
    } else if (global.location && global.location.protocol === 'file:') {
      let dismissed = false;
      try { dismissed = global.sessionStorage.getItem('momentum.fileBannerDismissed') === '1'; } catch (e) { dismissed = false; }
      if (!dismissed) {
        html = `<strong>\u2139\uFE0F You're using a downloaded copy.</strong> Data saved here stays in this folder only and won't appear anywhere else. For one planner that's always up to date, use the live link instead: <strong>https://quantum-shadow911.github.io/Planner/</strong>`;
      }
    }
    if (!html) { updateSaveStatus(); return; }
    const banner = document.createElement('div');
    banner.id = 'storageBanner';
    banner.className = 'storage-banner' + (storageProbe.ok ? ' storage-banner-info' : '');
    banner.innerHTML = `<span>${html}</span>`;
    const close = document.createElement('button');
    close.className = 'icon-btn';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '\u2715';
    close.addEventListener('click', () => {
      try { global.sessionStorage.setItem('momentum.fileBannerDismissed', '1'); } catch (e) { /* ignore */ }
      banner.remove();
    });
    banner.appendChild(close);
    main.insertBefore(banner, main.firstChild);
    updateSaveStatus();
  }

  const App = { boot, go, setTheme, applyTheme, effectiveTheme, version: APP_VERSION, openTask: id => UI.openTaskViewer(id), loadSampleData, openSearch, storageWarning: () => storageProbe };

  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
