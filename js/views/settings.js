/* Momentum — Settings: profile, theme, notifications, data management, trash */
(function (global) {
  'use strict';

  function renderStorageMeter(el) {
    if (!el) return;
    let bytes = 0;
    try { bytes = (localStorage.getItem('momentum.data.v1') || '').length * 2; } catch (e) { bytes = 0; }
    const state = Store.get();
    const atts = state.tasks.reduce((n, t) => n + ((t.attachments || []).length), 0);
    const quota = 5 * 1024 * 1024;
    const pct = Math.min(100, Math.round((bytes / quota) * 100));
    const kb = Math.max(1, Math.round(bytes / 1024));
    const warn = bytes > 4 * 1024 * 1024;
    const probe = Storage.probe();
    const ls = Storage.lastSave();
    let status;
    if (!probe.ok) {
      status = '<strong style="color:var(--red)">Saving is blocked by your browser — see the warning at the top of the page.</strong>';
    } else if (ls.at) {
      const when = new Date(ls.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      status = ls.ok ? `Saving works. Last saved ${when}.` : '<strong style="color:var(--red)">Last save failed — storage may be full.</strong>';
    } else {
      status = 'Saving works.';
    }
    el.innerHTML = `
      <div class="meter-row">
        <span class="bar"><span class="bar-fill ${warn ? 'bar-red' : 'bar-green'}" style="width:${pct}%"></span></span>
        <span class="muted small">${kb} KB of ~5 MB browser storage used (${pct}%)</span>
      </div>
      <div class="muted small">${status}</div>
      <div class="muted small">${atts} attachment${atts === 1 ? '' : 's'} stored${warn ? ' — <strong style="color:var(--red)">storage is nearly full; export a backup and remove large attachments.</strong>' : ''}</div>`;
  }

  function render(host) {
    const state = Store.get();
    const s = state.settings;
    const notifState = global.Reminders.notificationState();

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Settings & Data</h2><div class="sub">Personalize Momentum and manage your saved data.</div></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title"><span>👤 Profile & appearance</span></div>
          <div class="field"><label>Your name (used in the dashboard greeting)</label>
            <input class="input" id="setName" maxlength="60" value="${H(s.userName)}" placeholder="e.g. Alex"></div>
          <div class="settings-row">
            <div><div class="s-label">Version</div><div class="s-desc">Momentum v${H(App.version)} — school-first edition with classes, study sessions, workload balancing, exams, templates, timer, attachments and breaks.</div></div>
            <span class="badge badge-done">Up to date</span>
          </div>
          <div class="settings-row">
            <div><div class="s-label">Theme</div><div class="s-desc">Auto follows the time of day — light in the daytime, dark at night (7 PM – 7 AM). Your choice is remembered.</div></div>
            <select class="select" id="setThemeMode" style="width:auto">
              <option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>🌗 Auto (day / night)</option>
              <option value="light" ${s.theme === 'light' ? 'selected' : ''}>☀️ Light (always)</option>
              <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>🌙 Dark (always)</option>
            </select>
          </div>
          <div class="settings-row">
            <div><div class="s-label">Week starts on</div><div class="s-desc">Affects weekly planner and analytics.</div></div>
            <select class="select" id="setWeekStart" style="width:auto">
              <option value="1" ${s.weekStartsOn === 1 ? 'selected' : ''}>Monday</option>
              <option value="0" ${s.weekStartsOn === 0 ? 'selected' : ''}>Sunday</option>
            </select>
          </div>
          <div class="settings-row">
            <div><div class="s-label">Daily workload warning</div><div class="s-desc">Planners show a ⚖ warning when planned work (task estimates + study sessions) exceeds this many minutes per day.</div></div>
            <select class="select" id="setLoadLimit" style="width:auto">
              ${[120, 180, 240, 300, 480].map(m => `<option value="${m}" ${(s.dailyLoadLimit || 180) === m ? 'selected' : ''}>${UI.reminderLabel(m).replace(' before', '')}</option>`).join('')}
            </select>
          </div>
          <div class="settings-row">
            <div><div class="s-label">Default reminder</div><div class="s-desc">Applied to new tasks. Individual reminders are set per task.</div></div>
            <select class="select" id="setReminder" style="width:auto">
              ${[0, 5, 15, 30, 60, 120, 1440].map(m => `<option value="${m}" ${s.reminderDefault === m ? 'selected' : ''}>${UI.reminderLabel(m)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><span>🔔 Notifications</span></div>
          <div class="settings-row">
            <div><div class="s-label">In-app reminders</div>
              <div class="s-desc">Always on. Reminders appear as toasts while the app is open — for due tasks, deadlines and overdue work.</div></div>
            <span class="badge badge-done">Active</span>
          </div>
          <div class="settings-row">
            <div><div class="s-label">Device notifications</div>
              <div class="s-desc" id="notifDesc">${notifDescText(notifState)}</div></div>
              <div id="notifAction"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><span>💾 Data — backup & restore</span></div>
          <p class="muted small" style="margin-top:0">Everything is stored locally in your browser (localStorage) and saved automatically after every change. Rolling snapshots of your last ${5} saves are kept for recovery.</p>
          <div class="row-wrap">
            <button class="btn" id="exportBtn">⬇️ Export backup (JSON)</button>
            <button class="btn" id="importBtn">⬆️ Import backup</button>
            <input type="file" id="importFile" accept=".json,application/json" class="hidden">
          </div>
          <div class="detail-section">
            <h4>Storage usage</h4>
            <div id="storageMeter"></div>
          </div>
          <div class="detail-section">
            <h4>Automatic snapshots</h4>
            <div id="backupList"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><span>🗑️ Trash — protection against accidental deletion</span></div>
          <div id="trashList"></div>
        </div>

        <div class="card" style="grid-column:1/-1">
          <div class="card-title"><span>🏷️ Categories</span>
            <button class="btn btn-sm btn-primary" id="newCat">＋ New category</button></div>
          <div class="row-wrap" id="catList"></div>
        </div>

        <div class="card" style="grid-column:1/-1">
          <div class="card-title"><span>🏖 School breaks & holidays</span></div>
          <p class="muted small" style="margin-top:0">Break days are skipped by workload balancing and smart rescheduling, and shaded in the calendar.</p>
          <div id="breakList"></div>
          <div class="field-row-3" style="margin-top:10px">
            <div class="field"><label>Break name</label><input class="input" id="brkName" maxlength="80" placeholder="e.g. Winter break"></div>
            <div class="field"><label>First day</label><input class="input" type="date" id="brkStart"></div>
            <div class="field"><label>Last day</label><input class="input" type="date" id="brkEnd"></div>
          </div>
          <button class="btn btn-sm btn-primary" id="brkAdd">＋ Add break</button>
        </div>

        <div class="card" style="grid-column:1/-1;border-color:var(--red)">
          <div class="card-title"><span style="color:var(--red)">⚠ Danger zone</span></div>
          <div class="row-wrap">
            <button class="btn btn-danger" id="loadSample">Load sample data</button>
            <button class="btn btn-danger" id="resetAll">Delete ALL data…</button>
          </div>
          <p class="muted small" style="margin-bottom:0">Loading sample data adds example tasks, projects and goals (existing data is kept). Deleting all data requires confirmation and cannot be undone — export a backup first.</p>
        </div>
      </div>
    `;

    /* profile & appearance */
    host.querySelector('#setName').addEventListener('change', e => Store.updateSettings({ userName: e.target.value.trim() }));
    host.querySelector('#setThemeMode').addEventListener('change', e => App.setTheme(e.target.value));
    host.querySelector('#setWeekStart').addEventListener('change', e => Store.updateSettings({ weekStartsOn: Number(e.target.value) }));
    host.querySelector('#setReminder').addEventListener('change', e => Store.updateSettings({ reminderDefault: Number(e.target.value) }));
    host.querySelector('#setLoadLimit').addEventListener('change', e => Store.updateSettings({ dailyLoadLimit: Number(e.target.value) }));

    /* notifications */
    const notifAction = host.querySelector('#notifAction');
    if (notifState === 'granted') {
      notifAction.innerHTML = '<span class="badge badge-done">Permission granted</span>';
    } else if (notifState === 'denied') {
      notifAction.innerHTML = '<span class="badge badge-overdue">Blocked by browser</span>';
    } else if (notifState === 'unsupported') {
      notifAction.innerHTML = '<span class="badge">Not supported here</span>';
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm';
      btn.textContent = 'Enable…';
      btn.addEventListener('click', async () => {
        const res = await Reminders.requestPermission();
        render(host);
        if (res === 'granted') {
          Store.updateSettings({ browserNotifications: true });
          UI.toast('success', 'Device notifications enabled', 'Reminders will now also appear outside the app while it is open.');
        } else {
          UI.toast('warning', 'Permission not granted', 'In-app reminders still work. Device notifications were not enabled.');
        }
      });
      notifAction.appendChild(btn);
    }

    /* export / import */
    host.querySelector('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([Storage.exportJson(Store.get())], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `momentum-backup-${Utils.todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      UI.toast('success', 'Backup exported', 'Keep the JSON file somewhere safe.');
    });
    const fileInput = host.querySelector('#importFile');
    host.querySelector('#importBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = Storage.importJson(reader.result);
        if (res.error) { UI.toast('danger', 'Import failed', res.error); return; }
        UI.openModal({
          title: 'Import backup?',
          body: `<p style="margin:0;color:var(--text-2)">This will <strong>replace all current data</strong> with the backup's contents (${res.data.tasks.length} tasks, ${res.data.projects.length} projects, ${res.data.notes.length} notes). Your current data is kept in automatic snapshots.</p>`,
          buttons: [
            { label: 'Cancel', class: 'btn-ghost', onClick: () => UI.closeModal() },
            {
              label: 'Replace data', class: 'btn-primary',
              onClick: () => {
                Store.replaceState(res.data);
                UI.toast('success', 'Backup imported', 'All data has been restored.');
                UI.closeModal();
              }
            }
          ]
        });
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    /* snapshots */
    const backupList = host.querySelector('#backupList');
    renderStorageMeter(host.querySelector('#storageMeter'));
    const backups = Storage.listBackups();
    if (!backups.length) {
      backupList.innerHTML = `<div class="muted small">No snapshots yet — they are created automatically as you use the app.</div>`;
    } else {
      backups.forEach(b => {
        const row = document.createElement('div');
        row.className = 'settings-row';
        let count = '?';
        try { count = String(JSON.parse(b.data).tasks.length); } catch (e) { /* corrupt snapshot */ }
        row.innerHTML = `
          <div><div class="s-label">${H(new Date(b.ts).toLocaleString())}</div><div class="s-desc">${count} tasks</div></div>
          <button class="btn btn-sm">Restore</button>`;
        row.querySelector('button').addEventListener('click', async () => {
          const ok = await UI.confirmDialog({
            title: 'Restore snapshot?',
            message: 'Current data will be replaced by this snapshot. It was captured automatically.',
            confirmLabel: 'Restore'
          });
          if (ok && Storage.restoreBackup(b.ts)) {
            UI.toast('success', 'Snapshot restored', 'Your data was rolled back.');
          } else if (ok) {
            UI.toast('danger', 'Restore failed', 'The snapshot could not be read.');
          }
        });
        backupList.appendChild(row);
      });
    }

    /* trash */
    const trashList = host.querySelector('#trashList');
    if (!state.trash.length) {
      trashList.innerHTML = `<div class="muted small">Trash is empty. Deleted tasks, projects, goals, notes and categories land here first.</div>`;
    } else {
      state.trash.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'settings-row';
        row.innerHTML = `
          <div><div class="s-label">${H(entry.label)}</div>
          <div class="s-desc">${H(entry.type)} · deleted ${H(new Date(entry.deletedAt).toLocaleDateString())}</div></div>
          <button class="btn btn-sm">Restore</button>`;
        row.querySelector('button').addEventListener('click', () => {
          Store.restoreTrash(entry.id);
          UI.toast('success', 'Restored', `“${entry.label}” is back.`);
        });
        trashList.appendChild(row);
      });
      const emptyBtn = document.createElement('button');
      emptyBtn.className = 'btn btn-sm btn-danger';
      emptyBtn.style.marginTop = '10px';
      emptyBtn.textContent = 'Empty trash';
      emptyBtn.addEventListener('click', async () => {
        const ok = await UI.confirmDialog({ title: 'Empty trash?', message: 'Everything in the trash will be permanently deleted.', confirmLabel: 'Empty trash', danger: true });
        if (ok) Store.emptyTrash();
      });
      trashList.appendChild(emptyBtn);
    }

    /* categories */
    const catList = host.querySelector('#catList');
    state.categories.forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'badge badge-cat';
      chip.style.padding = '6px 12px';
      chip.innerHTML = `<span class="dot" style="background:${H(c.color)}"></span>${H(c.icon)} ${H(c.name)}
        <button class="icon-btn" style="width:22px;height:22px;font-size:11px" title="Edit">✏️</button>
        <button class="icon-btn" style="width:22px;height:22px;font-size:11px" title="Delete">🗑️</button>`;
      const [editBtn, delBtn] = chip.querySelectorAll('.icon-btn');
      editBtn.addEventListener('click', () => UI.openCategoryEditor(c.id));
      delBtn.addEventListener('click', async () => {
        const ok = await UI.confirmDialog({
          title: 'Delete category?',
          message: `“${c.name}” will be moved to trash. Tasks in it are kept but become uncategorized.`,
          confirmLabel: 'Delete', danger: true
        });
        if (ok) { Store.deleteCategory(c.id); UI.toast('info', 'Category deleted', c.name); }
      });
      catList.appendChild(chip);
    });
    host.querySelector('#newCat').addEventListener('click', () => UI.openCategoryEditor());

    /* school breaks */
    const breakList = host.querySelector('#breakList');
    if (!(state.breaks || []).length) {
      breakList.innerHTML = `<div class="muted small">No breaks defined yet.</div>`;
    } else {
      state.breaks.forEach(b => {
        const row = document.createElement('div');
        row.className = 'settings-row';
        const days = Utils.diffDays(b.end, b.start) + 1;
        row.innerHTML = `
          <div><div class="s-label">🏖 ${H(b.name)}</div>
          <div class="s-desc">${H(Utils.fmtDate(b.start))} – ${H(Utils.fmtDate(b.end))} · ${days} day${days === 1 ? '' : 's'}</div></div>
          <button class="btn btn-sm">Remove</button>`;
        row.querySelector('button').addEventListener('click', () => {
          Store.deleteBreak(b.id);
          UI.toast('info', 'Break removed', b.name);
        });
        breakList.appendChild(row);
      });
    }
    host.querySelector('#brkAdd').addEventListener('click', () => {
      const name = host.querySelector('#brkName').value.trim();
      const start = host.querySelector('#brkStart').value;
      const end = host.querySelector('#brkEnd').value;
      if (!name || !start || !end) { UI.toast('warning', 'Missing details', 'Give the break a name and both dates.'); return; }
      if (end < start) { UI.toast('warning', 'Invalid range', 'The last day cannot be before the first day.'); return; }
      Store.saveBreak({ name, start, end });
      UI.toast('success', 'Break added', name);
    });

    /* danger zone */
    host.querySelector('#loadSample').addEventListener('click', async () => {
      const ok = await UI.confirmDialog({
        title: 'Load sample data?',
        message: 'Adds example tasks, projects, goals and notes so you can explore the app. Your existing data is kept.',
        confirmLabel: 'Load samples'
      });
      if (ok) { App.loadSampleData(); UI.toast('success', 'Sample data loaded', 'Explore the dashboard, planner views and analytics.'); }
    });
    host.querySelector('#resetAll').addEventListener('click', async () => {
      const ok = await UI.confirmDialog({
        title: 'Delete ALL data?',
        message: 'Every task, project, goal, note and category will be permanently deleted. This cannot be undone — export a backup first!',
        confirmLabel: 'Delete everything', danger: true
      });
      if (ok) {
        const fresh = Storage.emptyState();
        fresh.settings = { ...Store.get().settings, seeded: true };
        Store.replaceState(fresh);
        UI.toast('info', 'All data deleted', 'You are starting fresh.');
      }
    });
  }

  function notifDescText(notifState) {
    if (notifState === 'granted') return 'Granted — reminders also appear as device notifications while the app is open.';
    if (notifState === 'denied') return 'Permission was denied in the browser. In-app reminders still work; to change this, adjust site permissions in your browser settings.';
    if (notifState === 'unsupported') return 'This browser does not support the Notification API. In-app reminders still work.';
    return 'Optional. Ask the browser for permission — if granted, reminders also appear as real device notifications while the app is open. In-app reminders work regardless.';
  }

  global.Views = global.Views || {};
  global.Views.settings = { title: 'Settings & Data', render };
})(typeof window !== 'undefined' ? window : globalThis);
