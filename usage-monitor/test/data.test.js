const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-'));
process.env.CLAUDE_CONFIG_DIR = tmp;
process.env.HOME = tmp; // keep tests away from any real ~/.claude
const { computeLocalUsage, startOfWeek } = require('../src/lib/localUsage');
const { statusFor } = require('../src/lib/limits');
const { gaugePng } = require('../src/lib/trayIcon');

function line(ts, id, usage, model = 'claude-opus-5-5') {
  return JSON.stringify({ type: 'assistant', timestamp: new Date(ts).toISOString(), requestId: 'r' + id,
    message: { id: 'm' + id, model, usage } });
}

test('local usage totals today and this week, dedupes repeats', () => {
  const now = Date.parse('2026-11-25T15:00:00'); // Wednesday
  const proj = path.join(tmp, 'projects', 'p1');
  fs.mkdirSync(proj, { recursive: true });
  const u = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 100 };
  fs.writeFileSync(path.join(proj, 's.jsonl'), [
    line(now - 3600e3, 1, u),
    line(now - 3600e3, 1, u),                      // duplicate streamed chunk
    line(now - 2 * 86400e3, 2, u, 'claude-sonnet-5-5'), // Monday
    line(startOfWeek(now) - 1000, 3, u),           // last week
    '{not json',
  ].join('\n'));
  const r = computeLocalUsage(now);
  assert.strictEqual(r.today.total, 135);
  assert.strictEqual(r.today.messages, 1);
  assert.strictEqual(r.week.total, 270);
  assert.strictEqual(r.week.byModel['claude-sonnet-5-5'], 135);
});

test('status thresholds', () => {
  assert.strictEqual(statusFor(10), 'ok');
  assert.strictEqual(statusFor(75), 'warning');
  assert.strictEqual(statusFor(95), 'critical');
  assert.strictEqual(statusFor(100), 'limited');
  assert.strictEqual(statusFor(null), 'unknown');
});

test('fetchLimits parses API response', async () => {
  let seenAuth;
  const srv = http.createServer((req, res) => {
    seenAuth = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      five_hour: { utilization: 42.5, resets_at: '2026-11-25T18:00:00Z' },
      seven_day: { utilization: 81, resets_at: '2026-11-30T09:00:00Z' },
      seven_day_opus: null,
    }));
  });
  await new Promise(r => srv.listen(0, r));
  process.env.CLAUDE_USAGE_URL = `http://127.0.0.1:${srv.address().port}/`;
  fs.writeFileSync(path.join(tmp, '.credentials.json'), JSON.stringify({
    claudeAiOauth: { accessToken: 'test-token', expiresAt: Date.now() + 3600e3, subscriptionType: 'max' } }));
  delete require.cache[require.resolve('../src/lib/limits')];
  const { fetchLimits } = require('../src/lib/limits');
  const r = await fetchLimits();
  srv.close();
  assert.strictEqual(seenAuth, 'Bearer test-token');
  assert.ok(r.ok);
  assert.strictEqual(r.session.percent, 42.5);
  assert.strictEqual(r.weekly.percent, 81);
  assert.strictEqual(r.weeklyOpus, null);
  assert.strictEqual(r.status, 'warning');
  assert.strictEqual(r.plan, 'max');
});

test('fetchLimits reports missing login', async () => {
  fs.rmSync(path.join(tmp, '.credentials.json'), { force: true });
  const { fetchLimits } = require('../src/lib/limits');
  const r = await fetchLimits();
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /No Claude login/);
});

test('tray gauge is a valid PNG', () => {
  const png = gaugePng(60, 'warning');
  assert.deepStrictEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
});

test('local usage builds a 7-day series', () => {
  const now = Date.parse('2026-11-25T15:00:00');
  const r = computeLocalUsage(now);
  assert.strictEqual(r.days.length, 7);
  assert.strictEqual(r.days[6].total, 135);           // today
  assert.strictEqual(r.days[4].total, 135);           // Monday
  assert.strictEqual(r.days[3].total, 135);           // Sunday (last week) still in the rolling chart
  assert.strictEqual(r.week.total, 270);              // but not in this-week totals
});
