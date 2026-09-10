# Lightweight Kanban PM tool

A shared Kanban board backed by a Google Sheet and served as a Google Apps Script
web app. No server, no database, no build step, no paid infrastructure — the
spreadsheet is the database and Apps Script is both the API and the host.

- **Backend** — `Code.gs` (Apps Script)
- **Frontend** — `Index.html` + `Stylesheet.html` + `JavaScript.html` (vanilla JS)
- **Drag and drop** — [SortableJS](https://sortablejs.github.io/Sortable/) from a CDN
- **Auth** — whatever you pick when deploying the web app

## Files

| File | Purpose |
| --- | --- |
| `appsscript.json` | Project manifest (V8 runtime, web app settings) |
| `Code.gs` | Sheet schema, read/write API, validation, locking |
| `Index.html` | Page shell: app bar, board, editor panel, toast |
| `Stylesheet.html` | Styles, light + dark, desktop + phone |
| `JavaScript.html` | Board rendering, drag and drop, editing, refresh |
| `tests/` | Node tests for the backend (see [Tests](#tests)) |

## Setup

### 1. Create the project

**From the Sheet (simplest).** Create a Google Sheet, then **Extensions → Apps
Script**. Create one file per entry in the table above (File → New → *Script* for
`Code.gs`, *HTML* for the three `.html` files) and paste the contents in. The
HTML files must be named exactly `Index`, `Stylesheet` and `JavaScript` — the
backend looks them up by name. Enable the manifest with **Project Settings →
Show "appsscript.json" manifest file**, then paste in `appsscript.json`.

**With [clasp](https://github.com/google/clasp).**

```bash
npm install -g @google/clasp
clasp login
cd kanban-pm
clasp create --type sheets --title "Kanban Board"   # or: clasp clone <scriptId>
clasp push
```

If you'd rather keep the script standalone (not bound to a Sheet), add a script
property named `SPREADSHEET_ID` holding the spreadsheet's id — `getSpreadsheet_()`
prefers it over the bound Sheet.

### 2. Create the sheets

Reload the spreadsheet and choose **Kanban → Set up sheets**, or run
`setupSpreadsheet` once from the Apps Script editor. It creates:

**`Tasks`** — one row per task.

| Column | Purpose |
| --- | --- |
| `ID` | Permanent unique identifier (UUID), assigned on create — never edit |
| `Title` | Task name (required, ≤ 200 chars) |
| `Description` | Optional details (≤ 5000 chars) |
| `Status` | Must match a name on the `Settings` sheet |
| `Start Date` | Optional, `yyyy-MM-dd` |
| `Due Date` | Optional, `yyyy-MM-dd`, not before the start date |
| `Assignee` | Optional free text (≤ 120 chars) |
| `Position` | Order within the column, renumbered `1..n` on every write |
| `Updated At` | Timestamp of the last change |

**`Settings`** — one board column per row in column A, in board order. Rename,
reorder, add or remove them and the board follows on the next refresh. Rows whose
status is not listed here still appear, in a trailing column marked *not a board
column*, so nothing typed by hand ever disappears.

Setup is idempotent: run it again any time without duplicating anything.

### 3. Deploy

**Deploy → New deployment → Web app**, then:

- **Execute as** — *Me*. Everyone shares one spreadsheet, and this way viewers
  don't need direct access to the Sheet itself.
- **Who has access** — *Anyone within <your domain>* for a Workspace team. The
  manifest ships with `DOMAIN`; use *Only myself* for a personal board, or
  *Anyone with a Google account* if collaborators are outside your domain (that
  means anyone with the link can edit the board, so treat the URL as a secret).

Share the deployment URL. Re-deploy (**Deploy → Manage deployments → Edit → New
version**) after changing the code.

## Using the board

- **Add** — `+ Add task` at the bottom of a column, or the app-bar button. Enter
  adds the card and keeps the composer open for the next one; Shift+Enter is a
  newline; Escape closes it.
- **Move** — drag cards within or between columns. The new status and order are
  written immediately; if the write fails, the card springs back and an error
  appears.
- **Edit** — click a card (or focus it and press Enter) to open the details panel.
  Each field saves as soon as you leave it. A rejected value is restored and the
  reason is shown in the panel.
- **Delete** — the panel's Delete button, after a confirmation.
- **Refresh** — the board reloads every 45 seconds, and on demand from the app bar.
  A background refresh is skipped while you are dragging, typing in the composer,
  or have the editor open, so it never overwrites work in progress.

The app bar's pill shows the sync state: *Loading*, *Saving*, *Saved*, *Up to
date*, or *Not saved* when something failed.

## Concurrency

Every write takes a `LockService` script lock, re-reads the sheet, recomputes
positions, writes, flushes, and returns the whole board. Two people dragging at
the same time serialize rather than interleave, and a client's stale card index
is clamped against the rows the server just read — so a simultaneous edit can
reorder a card unexpectedly, but it cannot duplicate, drop, or half-write a row.
Clients always render the board the server returned, never their optimistic guess.

## Tests

The backend runs against in-memory fakes for `SpreadsheetApp`, `LockService` and
friends, so the ordering, validation and concurrency rules are checked without a
Google account:

```bash
node kanban-pm/tests/backend.test.js
```

The frontend was verified separately in a headless browser (rendering, add/edit/
delete, real mouse drags between columns, failed-save rollback, and the phone
layout) against a stubbed `google.script.run`; that harness is not checked in
because it needs Playwright.

## Deliberately not included

User roles, comments, attachments, notifications, activity history, subtasks,
dependencies, filtering, and real-time sync. Manual and periodic refresh covers a
small team; add more only if the team actually asks for it.
