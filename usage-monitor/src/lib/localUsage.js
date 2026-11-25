// Totals token usage from Claude Code's local session logs (~/.claude/projects/**/*.jsonl).
// Works offline; covers Claude Code on this computer only (not claude.ai chats).
const fs = require('fs');
const path = require('path');
const { configDirs } = require('./credentials');

function* walkJsonl(dir, depth = 0) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 4) yield* walkJsonl(p, depth + 1);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}

function startOfToday(now) {
  const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime();
}
function startOfWeek(now) { // Monday 00:00 local time
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function emptyBucket() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, messages: 0, byModel: {} };
}
function add(bucket, u, model) {
  const i = u.input_tokens || 0, o = u.output_tokens || 0;
  const cw = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
  bucket.input += i; bucket.output += o; bucket.cacheWrite += cw; bucket.cacheRead += cr;
  bucket.total += i + o + cw + cr; bucket.messages += 1;
  const key = model || 'unknown';
  bucket.byModel[key] = (bucket.byModel[key] || 0) + i + o + cw + cr;
}

/** @param {number} [now] */
function computeLocalUsage(now = Date.now(), dirs = configDirs().map(d => path.join(d, 'projects'))) {
  const today = startOfToday(now), week = startOfWeek(now);
  // rolling 7 local days (oldest first) for the activity chart
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    days.push({ start: d.getTime(), date: d.toISOString(), total: 0, messages: 0 });
  }
  const since = Math.min(week, days[0].start);
  const result = { today: emptyBucket(), week: emptyBucket(), days, filesScanned: 0 };
  const seen = new Set();

  for (const root of dirs) {
    for (const file of walkJsonl(root)) {
      let stat;
      try { stat = fs.statSync(file); } catch (_) { continue; }
      if (stat.mtimeMs < since) continue; // file untouched since before the window
      result.filesScanned++;
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
      for (const line of text.split('\n')) {
        if (!line.includes('"usage"')) continue;
        let rec;
        try { rec = JSON.parse(line); } catch (_) { continue; }
        const usage = rec.message && rec.message.usage;
        if (!usage || !rec.timestamp) continue;
        const ts = Date.parse(rec.timestamp);
        if (!(ts >= since)) continue;
        const id = `${rec.message.id || ''}:${rec.requestId || ''}`;
        if (id !== ':') { if (seen.has(id)) continue; seen.add(id); }
        const model = rec.message.model;
        if (model === '<synthetic>') continue;
        const t = (usage.input_tokens || 0) + (usage.output_tokens || 0) +
          (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
        for (let i = days.length - 1; i >= 0; i--) {
          if (ts >= days[i].start) { days[i].total += t; days[i].messages += 1; break; }
        }
        if (ts >= week) add(result.week, usage, model);
        if (ts >= today) add(result.today, usage, model);
      }
    }
  }
  return result;
}

module.exports = { computeLocalUsage, startOfWeek, startOfToday };
