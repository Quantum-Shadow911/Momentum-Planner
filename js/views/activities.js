/* Momentum — Activities & Events: real events (practice, meetings, performances),
   distinct from tasks. They appear in the calendar but are not to-do items. */
(function (global) {
  'use strict';

  function render(host) {
    const state = Store.get();
    const today = Utils.todayStr();
    const upcoming = Priority.upcomingEvents(state, 30);
    const past = state.events.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

    host.innerHTML = `
      <div class="page-head">
        <div><h2>Activities &amp; Events</h2><div class="sub">Practices, club meetings, performances and appointments — fixed commitments, not tasks.</div></div>
        <button class="btn btn-primary" id="newEvent">＋ New event</button>
      </div>
      <div id="eventsBody"></div>
      ${past.length ? `<div class="detail-section" style="margin-top:24px">
        <button class="link-btn" id="pastToggle">▸ Past events (${state.events.filter(e => e.date < today).length})</button>
        <div id="pastArea" style="margin-top:10px"></div></div>` : ''}
    `;
    host.querySelector('#newEvent').addEventListener('click', () => openEventEditor());

    const body = host.querySelector('#eventsBody');
    if (!upcoming.length) {
      body.innerHTML = `<div class="empty"><span class="empty-icon">⭐</span>No upcoming events in the next 30 days.<br>Add soccer practice, club meetings, appointments…</div>`;
    } else {
      let lastDate = null;
      upcoming.forEach(e => {
        if (e.date !== lastDate) {
          lastDate = e.date;
          const head = document.createElement('div');
          head.className = 'agenda-day-head';
          const n = Utils.daysUntil(e.date, today);
          const rel = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : Utils.DOW[Utils.parseDate(e.date).getDay()];
          head.innerHTML = `<span class="agd-date">${H(Utils.fmtDate(e.date, { long: true }))}</span><span class="agd-rel">${H(rel)}</span>`;
          body.appendChild(head);
        }
        body.appendChild(eventRow(e, host));
      });
    }

    const pastToggle = host.querySelector('#pastToggle');
    if (pastToggle) {
      pastToggle.addEventListener('click', () => {
        const area = host.querySelector('#pastArea');
        if (area.innerHTML) { area.innerHTML = ''; pastToggle.textContent = `▸ Past events (${state.events.filter(e => e.date < today).length})`; return; }
        past.forEach(e => area.appendChild(eventRow(e, host)));
        pastToggle.textContent = `▾ Past events (${state.events.filter(e => e.date < today).length})`;
      });
    }
  }

  function eventRow(e, host) {
    const row = document.createElement('div');
    row.className = 'task-item';
    row.style.borderLeft = `3px solid ${e.color}`;
    const dur = e.time && e.endTime ? Utils.fmtDuration(Math.max(0, Utils.minutesOf(e.endTime) - Utils.minutesOf(e.time))) : '';
    row.innerHTML = `
      <div style="font-size:20px">${H(e.icon)}</div>
      <div class="task-main">
        <div class="task-title">${H(e.title)}</div>
        <div class="task-meta">
          <span class="badge" style="background:var(--green-soft);color:var(--green)">⭐ Event</span>
          ${e.time ? `<span class="meta-txt">🕐 ${H(Utils.fmtTime(e.time))}${e.endTime ? '–' + H(Utils.fmtTime(e.endTime)) : ''}${dur ? ' (' + H(dur) + ')' : ''}</span>` : ''}
          ${e.location ? `<span class="meta-txt">📍 ${H(e.location)}</span>` : ''}
          ${e.notes ? `<span class="meta-txt">📝 ${H(e.notes.slice(0, 60))}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-act="edit" title="Edit event">✏️</button>
        <button class="icon-btn" data-act="delete" title="Delete event">🗑️</button>
      </div>`;
    row.querySelector('[data-act="edit"]').addEventListener('click', () => openEventEditor(e.id));
    row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      const ok = await UI.confirmDialog({ title: 'Delete event?', message: `“${e.title}” will be moved to trash.`, confirmLabel: 'Delete', danger: true });
      if (ok) { Store.deleteEvent(e.id); UI.toast('info', 'Event deleted', 'Restore it from Settings → Trash.'); }
    });
    return row;
  }

  function openEventEditor(eventId) {
    const state = Store.get();
    const e = eventId ? Store.getEvent(eventId) : null;
    const base = e || {
      title: '', date: Utils.todayStr(), time: null, endTime: null, location: '',
      icon: '⭐', color: '#10b981', categoryId: (state.categories[0] && state.categories[0].id) || null, notes: ''
    };

    UI.openModal({
      title: e ? 'Edit event' : 'New event',
      body: `
        <div class="field-row">
          <div class="field"><label>Event *</label><input class="input" id="evTitle" maxlength="200" value="${H(base.title)}" placeholder="e.g. Soccer practice"></div>
          <div class="field"><label>Icon</label><select class="select" id="evIcon">
            ${['⭐', '⚽', '🎵', '🎭', '🏆', '🤝', '📌', '🏥', '✈️', '🎂'].map(i => `<option ${i === base.icon ? 'selected' : ''}>${i}</option>`).join('')}
          </select></div>
        </div>
        <div class="field-row-3">
          <div class="field"><label>Date *</label><input class="input" type="date" id="evDate" value="${H(base.date)}"></div>
          <div class="field"><label>Start time</label><input class="input" type="time" id="evTime" value="${H(base.time || '')}"></div>
          <div class="field"><label>End time</label><input class="input" type="time" id="evEnd" value="${H(base.endTime || '')}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Location</label><input class="input" id="evLoc" maxlength="120" value="${H(base.location)}" placeholder="e.g. Main field"></div>
          <div class="field"><label>Category</label><select class="select" id="evCat">
            <option value="">None</option>
            ${state.categories.map(c => `<option value="${H(c.id)}" ${base.categoryId === c.id ? 'selected' : ''}>${H(c.icon)} ${H(c.name)}</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label>Notes</label><textarea class="textarea" id="evNotes" placeholder="What to bring, who's going…">${H(base.notes)}</textarea></div>
        <div class="form-error" id="evError"></div>`,
      buttons: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => UI.closeModal() },
        {
          label: e ? 'Save changes' : 'Create event', class: 'btn-primary',
          onClick: () => {
            const title = document.getElementById('evTitle').value.trim();
            const date = document.getElementById('evDate').value;
            if (!title) { document.getElementById('evError').textContent = 'Please enter an event name.'; return false; }
            if (!date) { document.getElementById('evError').textContent = 'Please pick a date.'; return false; }
            Store.saveEvent({
              id: eventId || undefined, title, date,
              time: document.getElementById('evTime').value || null,
              endTime: document.getElementById('evEnd').value || null,
              location: document.getElementById('evLoc').value.trim(),
              icon: document.getElementById('evIcon').value,
              categoryId: document.getElementById('evCat').value || null,
              notes: document.getElementById('evNotes').value,
              color: e ? e.color : base.color
            });
            UI.toast('success', e ? 'Event updated' : 'Event created', title);
            UI.closeModal();
          }
        }
      ]
    });
  }

  global.Views = global.Views || {};
  global.Views.activities = { title: 'Activities & Events', render, openEventEditor };
})(typeof window !== 'undefined' ? window : globalThis);
