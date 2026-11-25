const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, shell, screen } = require('electron');
const path = require('path');
const { fetchLimits } = require('./lib/limits');
const { computeLocalUsage } = require('./lib/localUsage');
const { gaugePng } = require('./lib/trayIcon');

const POLL_MS = Math.max(30, Number(process.env.USAGE_POLL_SECONDS) || 60) * 1000;
const ALERT_LEVELS = [70, 90, 100];

let win = null;
let tray = null;
let latest = null;
let timer = null;
const alerted = { session: 0, weekly: 0 }; // highest threshold already notified, per window

function pct(w) { return w ? Math.round(w.percent) : null; }

function createWindow() {
  win = new BrowserWindow({
    width: 360, height: 560, show: false, resizable: true, minWidth: 320, minHeight: 420,
    title: 'Claude Usage', backgroundColor: '#0f1115', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', e => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

function toggleWindow() {
  if (!win) return createWindow();
  if (win.isVisible() && win.isFocused()) return win.hide();
  if (tray && process.platform !== 'linux') {
    // place the window under/over the tray icon
    const t = tray.getBounds(), b = win.getBounds();
    const wa = screen.getDisplayMatching(t).workArea;
    const x = Math.min(Math.max(t.x + t.width / 2 - b.width / 2, wa.x), wa.x + wa.width - b.width);
    const y = t.y < wa.y + wa.height / 2 ? t.y + t.height + 4 : t.y - b.height - 4;
    win.setPosition(Math.round(x), Math.round(y));
  }
  win.show(); win.focus();
}

function updateTray() {
  if (!tray) return;
  const lim = latest?.limits;
  const s = lim?.ok ? pct(lim.session) : null, w = lim?.ok ? pct(lim.weekly) : null;
  const headline = lim?.ok ? Math.max(s ?? 0, w ?? 0) : null;
  const img = nativeImage.createFromBuffer(gaugePng(headline, lim?.ok ? lim.status : 'unknown', 32), { scaleFactor: 2 });
  tray.setImage(img);
  const label = lim?.ok ? `S ${s ?? '–'}%  W ${w ?? '–'}%` : 'Claude usage: unavailable';
  tray.setToolTip(lim?.ok ? `Claude usage\nSession (5h): ${s ?? '–'}%\nWeekly: ${w ?? '–'}%` : label);
  if (process.platform === 'darwin') tray.setTitle(lim?.ok ? ` ${s ?? '–'}% · ${w ?? '–'}%` : '');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label, enabled: false },
    { type: 'separator' },
    { label: 'Show window', click: toggleWindow },
    { label: 'Refresh now', click: refresh },
    { label: 'Open claude.ai usage settings', click: () => shell.openExternal('https://claude.ai/settings/usage') },
    { type: 'separator' },
    { label: 'Start at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function maybeNotify(key, label, w) {
  if (!w || !Notification.isSupported()) return;
  const hit = ALERT_LEVELS.filter(l => w.percent >= l).pop() || 0;
  if (hit < alerted[key]) alerted[key] = hit; // window reset -> re-arm
  if (hit > alerted[key]) {
    alerted[key] = hit;
    const when = w.resetsAt ? ` Resets ${new Date(w.resetsAt).toLocaleString()}.` : '';
    new Notification({
      title: hit >= 100 ? `Claude ${label} limit reached` : `Claude ${label} usage at ${Math.round(w.percent)}%`,
      body: `You've used ${Math.round(w.percent)}% of your ${label} allowance.${when}`,
    }).show();
  }
}

async function refresh() {
  const [limits, local] = await Promise.all([
    fetchLimits().catch(e => ({ ok: false, error: e.message })),
    Promise.resolve().then(() => computeLocalUsage()).catch(() => null),
  ]);
  latest = { limits, local, updatedAt: new Date().toISOString(), pollSeconds: POLL_MS / 1000 };
  if (limits.ok) { maybeNotify('session', 'session (5-hour)', limits.session); maybeNotify('weekly', 'weekly', limits.weekly); }
  updateTray();
  if (win && !win.isDestroyed()) win.webContents.send('usage:update', latest);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide(); // menu-bar app
  tray = new Tray(nativeImage.createFromBuffer(gaugePng(null, 'unknown'), { scaleFactor: 2 }));
  tray.on('click', toggleWindow);
  updateTray();

  ipcMain.handle('usage:get', () => latest);
  ipcMain.handle('usage:refresh', async () => { await refresh(); return latest; });
  ipcMain.handle('win:pin', (_e, on) => { win?.setAlwaysOnTop(!!on, 'floating'); return !!on; });
  ipcMain.handle('open:external', (_e, url) => { if (/^https:\/\/claude\.ai\//.test(url)) shell.openExternal(url); });

  createWindow();
  refresh();
  timer = setInterval(refresh, POLL_MS);
});

app.on('second-instance', () => toggleWindow());
if (!app.requestSingleInstanceLock()) app.quit();
app.on('before-quit', () => { app.isQuitting = true; clearInterval(timer); });
app.on('window-all-closed', e => e.preventDefault()); // keep running in tray
app.on('activate', () => toggleWindow());
