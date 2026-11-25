// Fetches live plan-limit utilisation (the same numbers `/usage` shows in Claude Code).
const { getOAuth } = require('./credentials');

const USAGE_URL = process.env.CLAUDE_USAGE_URL || 'https://api.anthropic.com/api/oauth/usage';

function normWindow(w) {
  if (!w || typeof w.utilization !== 'number') return null;
  return { percent: Math.max(0, Math.min(100, w.utilization)), resetsAt: w.resets_at || null };
}

function statusFor(percent) {
  if (percent == null) return 'unknown';
  if (percent >= 100) return 'limited';
  if (percent >= 90) return 'critical';
  if (percent >= 70) return 'warning';
  return 'ok';
}

async function fetchLimits() {
  const oauth = await getOAuth();
  if (!oauth) {
    return { ok: false, error: 'No Claude login found. Run `claude` in a terminal and sign in, then click Refresh.' };
  }
  if (oauth.expiresAt && oauth.expiresAt < Date.now()) {
    return { ok: false, error: 'Your Claude login token has expired. Run any `claude` command to refresh it.' };
  }

  let res;
  try {
    res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-usage-monitor/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { ok: false, error: `Network error: ${e.message}` };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'Login rejected (401/403). Run `claude` to sign in again.' };
  }
  if (!res.ok) return { ok: false, error: `Usage API returned HTTP ${res.status}` };

  const body = await res.json();
  const session = normWindow(body.five_hour);
  const weekly = normWindow(body.seven_day);
  const weeklyOpus = normWindow(body.seven_day_opus);
  const weeklySonnet = normWindow(body.seven_day_sonnet);
  const worst = Math.max(session?.percent ?? 0, weekly?.percent ?? 0);

  return {
    ok: true,
    plan: oauth.subscriptionType || null,
    session, weekly, weeklyOpus, weeklySonnet,
    status: statusFor(session || weekly ? worst : null),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchLimits, statusFor };
