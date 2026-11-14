/* Momentum — reminders: in-app toasts always; browser notifications only with
   explicit permission. Nothing is faked: if permission is missing, the UI says so. */
(function (global) {
  'use strict';

  let timer = null;
  const notifySupport = typeof global.Notification !== 'undefined';

  function notificationState() {
    if (!notifySupport) return 'unsupported';
    return global.Notification.permission; // 'default' | 'granted' | 'denied'
  }

  async function requestPermission() {
    if (!notifySupport) return 'unsupported';
    try {
      return await global.Notification.requestPermission();
    } catch (e) {
      return notificationState();
    }
  }

  function taskKey(t, mins) {
    return `${t.id}|${t.dueDate || ''}|${t.time || ''}|${mins}`;
  }

  function taskDateTime(t) {
    if (!t.dueDate) return null;
    const d = Utils.parseDate(t.dueDate);
    if (!d) return null;
    const mins = Utils.minutesOf(t.time);
    if (mins != null) d.setMinutes(mins);
    else d.setMinutes(23, 59, 999); // end of day
    return d;
  }

  function check(state) {
    const now = Date.now();
    const settings = state.settings;
    state.tasks.forEach(t => {
      if (t.status === 'completed') return;
      const when = taskDateTime(t);
      if (!when) return;
      const times = (t.reminders && t.reminders.length) ? t.reminders : [settings.reminderDefault];
      times.forEach(minsBefore => {
        const fireAt = when.getTime() - minsBefore * 60000;
        const key = taskKey(t, minsBefore);
        if (t.notified.includes(key)) return;
        if (now >= fireAt && now - fireAt < 12 * 3600000) {
          t.notified.push(key);
          const overdue = now > when.getTime();
          const msg = overdue
            ? `Was due ${Utils.fmtDateSmart(t.dueDate)}${t.time ? ' at ' + Utils.fmtTime(t.time) : ''}`
            : `Due ${Utils.fmtDateSmart(t.dueDate)}${t.time ? ' at ' + Utils.fmtTime(t.time) : ''} — in ${Utils.fmtDuration(Math.max(0, Math.round((when.getTime() - now) / 60000)))}`;
          if (global.UI) {
            global.UI.toast(overdue ? 'danger' : 'warning', '⏰ ' + t.title, msg, () => {
              if (global.App) global.App.openTask(t.id);
            });
          }
          if (settings.browserNotifications && notificationState() === 'granted') {
            try {
              const n = new global.Notification('Momentum — ' + t.title, {
                body: msg,
                tag: key,
                silent: false
              });
              n.onclick = () => { global.focus(); n.close(); };
            } catch (e) { /* notifications can fail silently on mobile browsers */ }
          }
        }
      });
    });
    Store.persist();
  }

  function start() {
    if (timer) return;
    check(Store.get());
    timer = setInterval(() => check(Store.get()), 30000);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  const Reminders = { start, stop, check, notificationState, requestPermission };
  global.Reminders = Reminders;
  if (typeof module !== 'undefined' && module.exports) module.exports = Reminders;
})(typeof window !== 'undefined' ? window : globalThis);
