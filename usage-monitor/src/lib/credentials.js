// Reads the OAuth token that Claude Code stores after you log in with `claude`.
// The token never leaves your machine except in the request to api.anthropic.com.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function configDirs() {
  const dirs = [];
  if (process.env.CLAUDE_CONFIG_DIR) dirs.push(...process.env.CLAUDE_CONFIG_DIR.split(',').map(s => s.trim()).filter(Boolean));
  dirs.push(path.join(os.homedir(), '.claude'), path.join(os.homedir(), '.config', 'claude'));
  return [...new Set(dirs)];
}

function readFileCredentials() {
  for (const dir of configDirs()) {
    const file = path.join(dir, '.credentials.json');
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) { /* try next */ }
  }
  return null;
}

function readMacKeychain() {
  return new Promise(resolve => {
    if (process.platform !== 'darwin') return resolve(null);
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout.trim())); } catch (_) { resolve(null); }
    });
  });
}

/** @returns {Promise<{accessToken:string, expiresAt?:number, subscriptionType?:string} | null>} */
async function getOAuth() {
  const raw = (await readMacKeychain()) || readFileCredentials();
  const oauth = raw && (raw.claudeAiOauth || raw);
  if (!oauth || !oauth.accessToken) return null;
  return oauth;
}

module.exports = { getOAuth, configDirs };
