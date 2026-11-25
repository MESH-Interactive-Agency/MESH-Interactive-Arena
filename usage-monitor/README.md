# Claude Usage Monitor

A small desktop tray app that shows your Claude plan usage live:

- **Session (5-hour window)**: % used, reset time and countdown
- **Weekly limit**: % used, reset time, plus Opus or Sonnet weekly caps when your plan has them
- **Status badge**: Normal (under 70%) · Heads up (70%+) · Near limit (90%+) · Limited (100%)
- **Claude Code tokens**: today and this week (from Monday) on this computer, split by model
- A tray icon gauge that changes color with your status. On macOS the menu bar shows `46% · 78%` (session · weekly).
- Desktop notifications at 70%, 90% and 100% for both windows
- Updates every 60 seconds. "On top" pins the window above other windows. You can also turn on "Start at login".

## Setup

You need Node.js 18 or later and Claude Code, signed in with your Pro/Max account. Run `claude` once to sign in.

```bash
cd usage-monitor
npm install
npm start
```

To build an installable app (`.dmg`, `.exe` or AppImage in `dist/`):

```bash
npm run dist:mac
```

## How it works

- **Limits**: reads the login token Claude Code already saved (the macOS Keychain entry `Claude Code-credentials`, or
  `~/.claude/.credentials.json`) and calls `https://api.anthropic.com/api/oauth/usage`. This is the same data that
  `/usage` in Claude Code and claude.ai → Settings → Usage show. The token is only sent to api.anthropic.com.
  Note: this endpoint isn't publicly documented, so Anthropic could change it.
- **Token counts**: read from Claude Code's local logs in `~/.claude/projects/**/*.jsonl`. They don't include
  claude.ai web or desktop chats, but those chats *do* count toward the session and weekly percentages above.

If your token has expired, run any `claude` command to refresh it, then click **Refresh**.

| Env var | Default | Purpose |
|---|---|---|
| `USAGE_POLL_SECONDS` | `60` | Polling interval (minimum 30) |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Custom Claude config folder |

`npm test` runs the data-layer tests against a mock API.
