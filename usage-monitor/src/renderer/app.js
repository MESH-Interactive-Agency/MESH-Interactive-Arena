const $ = id => document.getElementById(id);
const STATUS_TEXT = { ok: 'Normal', warning: 'Heads up', critical: 'Near limit', limited: 'Limited', unknown: 'Unknown' };
let state = null;

function level(p) { return p >= 100 ? 'limited' : p >= 90 ? 'critical' : p >= 70 ? 'warning' : 'ok'; }
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
  return 'in ' + (d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`);
}
function resetText(iso) {
  if (!iso) return 'Reset time unavailable';
  return 'Resets ' + new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
function setWindow(prefix, w) {
  const bar = $(prefix + 'Bar');
  if (!w) { $(prefix + 'Pct').textContent = '–'; bar.style.width = '0'; $(prefix + 'Reset').textContent = 'No data'; $(prefix + 'Countdown').textContent = ''; return; }
  const p = Math.round(w.percent);
  $(prefix + 'Pct').textContent = p + '%';
  bar.style.width = Math.min(100, w.percent) + '%';
  bar.style.background = `var(--${level(w.percent)})`;
  $(prefix + 'Reset').textContent = resetText(w.resetsAt);
  $(prefix + 'Countdown').textContent = countdown(w.resetsAt);
}
function prettyModel(m) {
  return m.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-/g, ' ');
}

function render() {
  if (!state) return;
  const { limits, local, updatedAt } = state;
  const err = $('error');
  if (limits && !limits.ok) { err.hidden = false; err.textContent = limits.error; } else { err.hidden = true; }

  const status = limits?.ok ? limits.status : 'unknown';
  $('status').className = 'badge ' + status;
  $('status').textContent = STATUS_TEXT[status];
  $('plan').textContent = limits?.plan ? `${limits.plan[0].toUpperCase()}${limits.plan.slice(1)} plan` : '';

  setWindow('session', limits?.ok ? limits.session : null);
  setWindow('weekly', limits?.ok ? limits.weekly : null);
  const extra = [];
  if (limits?.ok && limits.weeklyOpus) extra.push(['Opus weekly', limits.weeklyOpus]);
  if (limits?.ok && limits.weeklySonnet) extra.push(['Sonnet weekly', limits.weeklySonnet]);
  $('weeklyExtra').replaceChildren(...extra.map(([k, w]) => {
    const d = document.createElement('div');
    d.innerHTML = `<span></span><span></span>`;
    d.children[0].textContent = k; d.children[1].textContent = Math.round(w.percent) + '%';
    return d;
  }));

  if (local) {
    $('todayTokens').textContent = fmtTokens(local.today.total);
    $('todayMsgs').textContent = `${local.today.messages} responses`;
    $('weekTokens').textContent = fmtTokens(local.week.total);
    $('weekMsgs').textContent = `${local.week.messages} responses`;
    const rows = Object.entries(local.week.byModel).sort((a, b) => b[1] - a[1]).slice(0, 4);
    $('models').replaceChildren(...rows.map(([m, n]) => {
      const d = document.createElement('div');
      d.innerHTML = '<span></span><span></span>';
      d.children[0].textContent = prettyModel(m); d.children[1].textContent = fmtTokens(n);
      return d;
    }));
  }
  $('updated').textContent = 'Updated ' + new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

window.usage.onUpdate(d => { state = d; render(); });
window.usage.get().then(d => { if (d) { state = d; render(); } });
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true; $('refresh').textContent = '…';
  state = await window.usage.refresh(); render();
  $('refresh').disabled = false; $('refresh').textContent = 'Refresh';
});
$('pin').addEventListener('change', e => window.usage.pin(e.target.checked));
setInterval(render, 30000); // keep countdowns ticking between polls
