# Claude Usage Monitor

> **Easiest option: Usage Pulse.** `web/usage-pulse.html` is the same monitor published as a Claude artifact
> (https://claude.ai/artifact/6Lx3LgHqZdT99RD7AV5vQa). Open it in the Claude desktop app and choose
> **Install as app**. It runs as a Mac app with a menu bar item, Dock badge and notifications, and you don't need Node or Electron.
> The Electron app below is a standalone alternative.

A small desktop tray app that shows your Claude plan usage live:

- **Session (5-hour window)**: % used, reset time and countdown
- **Weekly limit**: % used, reset time, plus Opus or Sonnet weekly caps when your plan has them
- **Status badge**: Normal (under 70%) · Heads up (70%+) · Near limit (90%+) · Limited (100%)
- **Dual-ring gauge**: the outer ring is weekly and the inner ring is the session. Notches mark 70% and 90%.
- **Claude Code activity**: a 7-day token chart (hover a bar for details), today and this-week totals, and a split by model
- Dark glass design. On macOS it uses the native frosted-glass window effect.
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
