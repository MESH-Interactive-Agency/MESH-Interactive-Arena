const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('platform') === 'darwin') document.body.classList.add('mac');

// limit state -> reserved status palette, always shown with icon + label
const STATUS = {
  ok:       { cls: 'good',     text: 'Normal',     icon: '✓' },
  warning:  { cls: 'warning',  text: 'Heads up',   icon: '!' },
  critical: { cls: 'serious',  text: 'Near limit', icon: '!' },
  limited:  { cls: 'critical', text: 'Limited',    icon: '×' },
  unknown:  { cls: 'unknown',  text: 'Offline',    icon: '?' },
};
const levelOf = p => p == null ? 'unknown' : p >= 100 ? 'limited' : p >= 90 ? 'critical' : p >= 70 ? 'warning' : 'ok';
const cssVar = (cls, hi) => `var(--${cls}${hi ? '-hi' : ''})`;
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

let state = null;
let shownHeadline = 0;

function fmtTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function countdown(iso) {
  if (!iso) return '';
  let s = Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
const resetText = iso => {
  if (!iso) return 'No reset time';
  const d = new Date(iso), sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString([], sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', hour: 'numeric' });
};
const prettyModel = m => m.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2')
  .replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());

// ---------- gauge ----------
function buildTicks() {
  const g = $('ticks');
  for (const p of [70, 90]) {
    const a = (p / 100) * 2 * Math.PI - Math.PI / 2;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const [r1, r2] = [121, 128]; // short notch outside the outer ring
    line.setAttribute('x1', 130 + r1 * Math.cos(a)); line.setAttribute('y1', 130 + r1 * Math.sin(a));
    line.setAttribute('x2', 130 + r2 * Math.cos(a)); line.setAttribute('y2', 130 + r2 * Math.sin(a));
    line.setAttribute('class', 'tick');
    g.appendChild(line);
  }
}
function setArc(id, gradId, w) {
  const arc = $(id), r = Number(arc.getAttribute('r')), c = 2 * Math.PI * r;
  const frac = w ? Math.min(1, w.percent / 100) : 0;
  arc.style.strokeDasharray = `${c}`;
  arc.style.strokeDashoffset = `${c * (1 - frac)}`;
  arc.style.opacity = w ? 1 : 0;
  const cls = STATUS[levelOf(w?.percent)].cls;
  const grad = $(gradId);
  grad.style.setProperty('--c0', cssVar(cls));
  grad.style.setProperty('--c1', cssVar(cls, true));
}
function animateNumber(el, to) {
  const from = shownHeadline, start = performance.now(), dur = 900;
  const step = t => {
    const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  shownHeadline = to;
}

// ---------- limit cards ----------
function setCard(prefix, w) {
  const bar = $(prefix + 'Bar');
  if (!w) {
    $(prefix + 'Pct').textContent = '--'; bar.style.width = '0';
    $(prefix + 'Reset').textContent = 'No data'; $(prefix + 'Countdown').textContent = '';
    return;
  }
  const cls = STATUS[levelOf(w.percent)].cls;
  $(prefix + 'Pct').textContent = Math.round(w.percent);
  bar.style.width = Math.min(100, w.percent) + '%';
  bar.style.background = `linear-gradient(90deg, ${cssVar(cls)}, ${cssVar(cls, true)})`;
  $(prefix + 'Reset').textContent = resetText(w.resetsAt);
  const cd = countdown(w.resetsAt);
  $(prefix + 'Countdown').textContent = cd ? '↻ ' + cd : '';
}

// ---------- activity chart ----------
function renderChart(days) {
  const chart = $('chart');
  const max = Math.max(1, ...days.map(d => d.total));
  const peak = days.reduce((a, d, i) => (d.total > days[a].total ? i : a), 0);
  chart.replaceChildren(...days.map((d, i) => {
    const col = document.createElement('div');
    col.className = 'col' + (i === days.length - 1 ? ' today' : '');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${(d.total / max) * 100}%`;
    col.appendChild(bar);
    // selective direct labels: today and the peak day only
    if ((i === days.length - 1 || i === peak) && d.total > 0) {
      const v = document.createElement('span'); v.className = 'val';
      v.textContent = fmtTokens(d.total);
      v.style.bottom = `calc(${(d.total / max) * 100}% + 3px)`; v.style.top = 'auto';
      col.appendChild(v);
    }
    col.addEventListener('mouseenter', () => showTip(col, d));
    col.addEventListener('mouseleave', () => { $('tip').hidden = true; });
    return col;
  }));
  let labels = chart.nextElementSibling;
  if (!labels || !labels.classList.contains('days')) {
    labels = document.createElement('div'); labels.className = 'days';
    chart.after(labels);
  }
  labels.replaceChildren(...days.map((d, i) => {
    const s = document.createElement('span');
    s.textContent = i === days.length - 1 ? 'Today' : new Date(d.start).toLocaleDateString([], { weekday: 'short' });
    if (i === days.length - 1) s.className = 'today';
    return s;
  }));
}
function showTip(col, d) {
  const tip = $('tip'), panel = col.closest('.panel');
  const pr = panel.getBoundingClientRect(), cr = col.getBoundingClientRect();
  const bar = col.querySelector('.bar').getBoundingClientRect();
  tip.innerHTML = '<b></b><span></span>';
  tip.children[0].textContent = `${fmtTokens(d.total)} tokens`;
  tip.children[1].textContent = `${new Date(d.start).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} · ${d.messages} responses`;
  tip.hidden = false;
  const half = tip.offsetWidth / 2;
  const x = Math.min(Math.max(cr.left - pr.left + cr.width / 2, half + 4), pr.width - half - 4);
  tip.style.left = x + 'px';
  tip.style.top = (Math.min(bar.top, cr.bottom - 20) - pr.top - 8) + 'px';
}
function renderSplit(byModel) {
  let rows = Object.entries(byModel).sort((a, b) => b[1] - a[1]);
  if (rows.length > 3) { // never generate a 4th hue: fold into Other
    const other = rows.slice(2).reduce((s, [, n]) => s + n, 0);
    rows = [...rows.slice(0, 2), ['Other', other]];
  }
  const total = rows.reduce((s, [, n]) => s + n, 0) || 1;
  const color = (m, i) => (m === 'Other' ? 'var(--series-other)' : SERIES[i]);
  $('split').replaceChildren(...rows.map(([m, n], i) => {
    const seg = document.createElement('div');
    seg.style.flexGrow = String(n / total); seg.style.background = color(m, i);
    seg.title = `${prettyModel(m)}: ${fmtTokens(n)}`;
    return seg;
  }));
  $('legend').replaceChildren(...rows.map(([m, n], i) => {
    const s = document.createElement('span');
    s.innerHTML = '<i></i><span></span><b></b>';
    s.children[0].style.background = color(m, i);
    s.children[1].textContent = prettyModel(m);
    s.children[2].textContent = `${Math.round((n / total) * 100)}%`;
    return s;
  }));
}

// ---------- main render ----------
function render() {
  if (!state) return;
  const { limits, local, updatedAt, pollSeconds } = state;
  const ok = !!limits?.ok;

  const err = $('error');
  err.hidden = ok || !limits; if (!ok && limits) err.textContent = limits.error;

  const st = STATUS[ok ? limits.status : 'unknown'] || STATUS.unknown;
  $('statusChip').className = 'status ' + st.cls;
  $('statusText').textContent = st.text;
  $('statusIcon').textContent = st.icon;
  document.documentElement.style.setProperty('--status-glow', st.cls === 'good' ? '#3b5bff' : cssVar(st.cls));
  $('plan').textContent = limits?.plan ? limits.plan[0].toUpperCase() + limits.plan.slice(1) : '';

  const session = ok ? limits.session : null, weekly = ok ? limits.weekly : null;
  setArc('arcSession', 'gSession', session);
  setArc('arcWeekly', 'gWeekly', weekly);
  setCard('session', session);
  setCard('weekly', weekly);
  if (session || weekly) {
    const peak = Math.max(session?.percent ?? 0, weekly?.percent ?? 0);
    animateNumber($('headline'), Math.round(peak));
    $('headlineSub').textContent = (weekly?.percent ?? 0) >= (session?.percent ?? 0) ? 'weekly · tightest limit' : 'session · tightest limit';
  } else {
    $('headline').textContent = '--'; $('headlineSub').textContent = 'waiting for usage data';
  }

  const extra = [];
  if (ok && limits.weeklyOpus) extra.push(['Opus weekly', limits.weeklyOpus]);
  if (ok && limits.weeklySonnet) extra.push(['Sonnet weekly', limits.weeklySonnet]);
  $('weeklyExtra').replaceChildren(...extra.map(([k, w]) => {
    const s = document.createElement('span');
    s.textContent = k + ' '; const b = document.createElement('b'); b.textContent = Math.round(w.percent) + '%';
    s.appendChild(b); return s;
  }));

  if (local) {
    $('todayTokens').textContent = fmtTokens(local.today.total);
    $('todayMsgs').textContent = `${local.today.messages} responses`;
    $('weekTokens').textContent = fmtTokens(local.week.total);
    $('weekMsgs').textContent = `${local.week.messages} responses · since Mon`;
    if (local.days) renderChart(local.days);
    renderSplit(local.week.byModel);
  }

  const age = (Date.now() - Date.parse(updatedAt)) / 1000;
  document.body.classList.toggle('stale', !ok || age > (pollSeconds || 60) * 3);
  $('updated').textContent = 'Updated ' + new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

buildTicks();
window.usage.onUpdate(d => { state = d; render(); });
window.usage.get().then(d => { if (d) { state = d; render(); } });
$('refresh').addEventListener('click', async () => {
  const btn = $('refresh'); btn.classList.add('spin'); btn.disabled = true;
  state = await window.usage.refresh(); render();
  setTimeout(() => { btn.classList.remove('spin'); btn.disabled = false; }, 400);
});
$('pin').addEventListener('change', e => window.usage.pin(e.target.checked));
$('close').addEventListener('click', () => window.usage.hide());
setInterval(() => { // keep countdowns ticking between polls without re-animating
  if (!state?.limits?.ok) return;
  setCard('session', state.limits.session); setCard('weekly', state.limits.weekly);
}, 30000);
