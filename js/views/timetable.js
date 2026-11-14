/* Momentum — School timetable: recurring class schedule on a weekly time grid */
(function (global) {
  'use strict';

  const DEFAULT_START_HOUR = 8;
  const DEFAULT_END_HOUR = 18;

  function render(host) {
    const state = Store.get();
    const today = Utils.todayStr();
    const weekStart = Utils.startOfWeek(today, state.settings.weekStartsOn);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(Utils.addDays(weekStart, i));

    const allSlots = state.classes.flatMap(c => c.slots);
    const startHour = allSlots.length ? Math.min(DEFAULT_START_HOUR, ...allSlots.map(s => Math.floor(Utils.minutesOf(s.start) / 60))) : DEFAULT_START_HOUR;
    const endHour = allSlots.length ? Math.max(DEFAULT_END_HOUR, ...allSlots.map(s => Math.ceil(Utils.minutesOf(s.end) / 60))) : DEFAULT_END_HOUR;
    const hours = [];
    for (let h = startHour; h < endHour; h++) hours.push(h);

    const totalSlots = allSlots.length;

    host.innerHTML = `
      <div class="page-head">
        <div><h2>School Timetable</h2><div class="sub">${totalSlots ? `${state.classes.length} classes · ${totalSlots} weekly periods` : 'Add class schedule slots in My Classes to build your timetable.'}</div></div>
        <div class="row">
          <button class="btn btn-primary" id="ttAddClass">＋ New class</button>
        </div>
      </div>
      ${totalSlots ? `
      <div class="card" style="padding:14px 18px">
        <div class="tt-grid" id="ttGrid">
          <div class="tt-corner"></div>
          ${days.map(d => `<div class="tt-day-head${d === today ? ' tt-today' : ''}">${Utils.DOW_SHORT[Utils.parseDate(d).getDay()]}${d === today ? ' · today' : ''}</div>`).join('')}
          ${hours.map(h => `
            <div class="tt-hour">${Utils.fmtTime(String(h).padStart(2, '0') + ':00')}</div>
            ${days.map(d => {
              const dow = Utils.parseDate(d).getDay();
              const cellSlots = [];
              state.classes.forEach(c => c.slots.filter(s => s.day === dow && Utils.minutesOf(s.start) >= h * 60 && Utils.minutesOf(s.start) < (h + 1) * 60).forEach(s => cellSlots.push({ c, s })));
              return `<div class="tt-cell${d === today ? ' tt-today-cell' : ''}">
                ${cellSlots.map(({ c, s }) => {
                  const startMin = Utils.minutesOf(s.start);
                  const endMin = Math.max(Utils.minutesOf(s.end), startMin + 15);
                  const top = ((startMin - h * 60) / 60) * 100;
                  const spanHeight = ((endMin - startMin) / 60) * 100;
                  return `
                  <div class="tt-block" data-cls="${H(c.id)}" style="background:${H(c.color)}18;border-color:${H(c.color)};top:${top.toFixed(2)}%;height:${spanHeight.toFixed(2)}%">
                    <div class="tt-block-name">${H(c.icon)} ${H(c.name)}</div>
                    <div class="tt-block-meta">${H(Utils.fmtTime(s.start))}–${H(Utils.fmtTime(s.end))}${c.room ? ' · ' + H(c.room) : ''}</div>
                  </div>`;
                }).join('')}
              </div>`;
            }).join('')}`).join('')}
        </div>
      </div>` : `
      <div class="empty"><span class="empty-icon">🗓️</span>No timetable yet.<br>Open a class in My Classes and add its weekly schedule slots.</div>`}
    `;

    host.querySelector('#ttAddClass').addEventListener('click', () => {
      if (Views.classes && Views.classes.openClassEditor) Views.classes.openClassEditor();
      else App.go('classes');
    });
    host.querySelectorAll('[data-cls]').forEach(el => {
      el.addEventListener('click', () => {
        if (Views.classes.selectClass) Views.classes.selectClass(el.dataset.cls);
        App.go('classes');
      });
    });
  }

  global.Views = global.Views || {};
  global.Views.timetable = { title: 'School Timetable', render };
})(typeof window !== 'undefined' ? window : globalThis);
