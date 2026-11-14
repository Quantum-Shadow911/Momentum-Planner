/* Momentum — tiny dependency-free canvas charts (line, bars, donut) */
(function (global) {
  'use strict';

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function setupCanvas(canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement.clientWidth || 300;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  /* Line / area chart: data = [{label, value}] */
  function lineChart(canvas, data, opts) {
    opts = opts || {};
    const height = opts.height || 190;
    const { ctx, width } = setupCanvas(canvas, height);
    const pad = { l: 30, r: 12, t: 14, b: 26 };
    const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
    const textC = cssVar('--text-3'), gridC = cssVar('--border');
    const accent = opts.color || cssVar('--accent');
    const max = Math.max(1, ...data.map(d => d.value));
    const maxR = Math.ceil(max * 1.15) || 1;
    ctx.clearRect(0, 0, width, height);
    ctx.font = '10.5px Inter, system-ui, sans-serif';

    const steps = 4;
    ctx.strokeStyle = gridC; ctx.fillStyle = textC; ctx.lineWidth = 1;
    for (let i = 0; i <= steps; i++) {
      const y = pad.t + (h / steps) * i;
      ctx.globalAlpha = .7;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
      ctx.globalAlpha = 1;
      const val = Math.round(maxR * (1 - i / steps));
      ctx.textAlign = 'right';
      ctx.fillText(String(val), pad.l - 6, y + 3.5);
    }

    if (data.length === 0) return;
    const xStep = data.length > 1 ? w / (data.length - 1) : 0;
    const px = i => pad.l + xStep * i;
    const py = v => pad.t + h - (v / maxR) * h;

    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
    grad.addColorStop(0, accent + '55');
    grad.addColorStop(1, accent + '00');
    ctx.beginPath();
    data.forEach((d, i) => { const x = px(i), y = py(d.value); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.lineTo(px(data.length - 1), pad.t + h); ctx.lineTo(px(0), pad.t + h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    data.forEach((d, i) => { const x = px(i), y = py(d.value); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = accent; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();

    data.forEach((d, i) => {
      const x = px(i), y = py(d.value);
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = cssVar('--surface'); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = textC; ctx.textAlign = 'center';
      ctx.fillText(d.label, x, height - 8);
    });
  }

  /* Horizontal bars: data = [{label, value, max, color}] */
  function barChart(canvas, data, opts) {
    opts = opts || {};
    const rowH = 30, height = Math.max(60, data.length * rowH + 10);
    const { ctx, width } = setupCanvas(canvas, height);
    ctx.clearRect(0, 0, width, height);
    const labelW = opts.labelWidth || 120;
    const barX = labelW, barW = width - labelW - 44;
    ctx.font = '11.5px Inter, system-ui, sans-serif';
    data.forEach((d, i) => {
      const y = i * rowH + 8;
      ctx.fillStyle = cssVar('--text-2');
      ctx.textAlign = 'left';
      ctx.fillText(String(d.label).slice(0, 18), 0, y + 11);
      ctx.fillStyle = cssVar('--surface-3');
      roundRect(ctx, barX, y + 2, barW, 13, 6); ctx.fill();
      const max = Math.max(1, d.max != null ? d.max : d.value);
      const bw = Math.max(d.value > 0 ? 8 : 0, (d.value / max) * barW);
      if (bw > 0) {
        ctx.fillStyle = d.color || cssVar('--accent');
        roundRect(ctx, barX, y + 2, bw, 13, 6); ctx.fill();
      }
      ctx.fillStyle = cssVar('--text-2');
      ctx.textAlign = 'left';
      ctx.fillText(String(d.value), barX + barW + 8, y + 12.5);
    });
  }

  /* Donut: data = [{label, value, color}], centerText = {big, small} */
  function donutChart(canvas, data, opts) {
    opts = opts || {};
    const height = opts.height || 180;
    const { ctx, width } = setupCanvas(canvas, height);
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2, cy = height / 2, r = Math.min(width, height) / 2 - 14;
    const total = data.reduce((s, d) => s + d.value, 0);
    const lineC = cssVar('--border');

    ctx.lineWidth = 20;
    if (!total) {
      ctx.strokeStyle = cssVar('--surface-3');
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    } else {
      let angle = -Math.PI / 2;
      data.forEach(d => {
        if (!d.value) return;
        const slice = (d.value / total) * Math.PI * 2;
        ctx.strokeStyle = d.color || cssVar('--accent');
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(cx, cy, r, angle, angle + slice); ctx.stroke();
        angle += slice;
      });
    }
    ctx.fillStyle = cssVar('--text');
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opts.centerBig != null ? String(opts.centerBig) : (total ? Math.round((data[0].value / total) * 100) + '%' : '0%'), cx, cy + 2);
    ctx.fillStyle = cssVar('--text-3');
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(opts.centerSmall || '', cx, cy + 20);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const Charts = { lineChart, barChart, donutChart };
  global.Charts = Charts;
  if (typeof module !== 'undefined' && module.exports) module.exports = Charts;
})(typeof window !== 'undefined' ? window : globalThis);
