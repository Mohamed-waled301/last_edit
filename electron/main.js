const { app, BrowserWindow, shell, ipcMain, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { LicenseManager } = require('./licenseManager');

// 1. Single Instance Lock
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let isQuitting = false;
let backupFinished = false;
let licenseManager = null;

const isDev =
  process.env.NODE_ENV === 'development' ||
  process.argv.includes('--dev') ||
  Boolean(process.env.VITE_DEV_SERVER_URL);

async function createWindow() {
  const icoPath = path.join(__dirname, '../build/icon.ico');
  const fallbackIco = path.join(__dirname, '../public/icon.ico');
  const iconPath = fs.existsSync(icoPath) ? icoPath : (fs.existsSync(fallbackIco) ? fallbackIco : undefined);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    title: 'Apex Apparel ERP',
    backgroundColor: '#F4F5F7',
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  // Opens maximized when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Block external navigation & open links in system browser
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (isDev) {
        if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
          event.preventDefault();
          shell.openExternal(navigationUrl);
        }
      } else {
        if (parsed.protocol !== 'file:') {
          event.preventDefault();
          shell.openExternal(navigationUrl);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Auto-backup safeguard on app close
  mainWindow.on('close', async (event) => {
    if (isQuitting || backupFinished) {
      return;
    }

    event.preventDefault();
    isQuitting = true;

    try {
      // Trigger backup in renderer through IPC
      mainWindow.webContents.send('app:trigger-auto-backup');

      // Allow maximum 2.5s for renderer to complete backup; NEVER block closing if it fails
      await Promise.race([
        new Promise((resolve) => {
          ipcMain.once('backup:auto-completed', () => {
            backupFinished = true;
            resolve();
          });
        }),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (err) {
      console.warn('[AutoBackup] Close safeguard error:', err);
    } finally {
      backupFinished = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set strict Content-Security-Policy header
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self';",
        ],
      },
    });
  });

  // Disable DevTools and inspecting shortcuts in production builds
  if (!isDev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (
        (input.control && input.shift && (input.key.toLowerCase() === 'i' || input.key.toLowerCase() === 'j')) ||
        (input.control && input.key.toLowerCase() === 'r') ||
        input.key === 'F12'
      ) {
        event.preventDefault();
      }
    });
  }

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
    console.log(`[Electron] Loading Vite Dev Server: ${devUrl}`);
    await mainWindow.loadURL(devUrl);
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log(`[Electron] Loading Production dist: ${indexPath}`);
    await mainWindow.loadFile(indexPath);
  }
}

// Second instance triggered: focus primary window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Register IPC handlers
ipcMain.handle('app:version', () => app.getVersion());

// 2. Offline Single-Device Licensing IPC Handlers
ipcMain.handle('license:get-machine-code', () => {
  if (!licenseManager) {
    licenseManager = new LicenseManager(app.getPath('userData'));
  }
  return licenseManager.getMachineCode();
});

ipcMain.handle('license:get-status', () => {
  if (!licenseManager) {
    licenseManager = new LicenseManager(app.getPath('userData'));
  }
  return licenseManager.getStatus();
});

ipcMain.handle('license:activate', (_event, licenseInput) => {
  if (!licenseManager) {
    licenseManager = new LicenseManager(app.getPath('userData'));
  }
  const result = licenseManager.activate(licenseInput);
  if (result.success && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('license:status-changed', licenseManager.getStatus());
  }
  return result;
});

// Re-verify signature and machine hash every 24 hours while running
const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  if (licenseManager && mainWindow && !mainWindow.isDestroyed()) {
    const status = licenseManager.getStatus();
    mainWindow.webContents.send('license:status-changed', status);
  }
}, RECHECK_INTERVAL_MS);

ipcMain.handle('backup:save-auto', async (_event, backupData) => {
  try {
    if (!backupData || typeof backupData !== 'object') {
      return { success: false, error: 'بيانات غير صالحة' };
    }

    const documentsDir = app.getPath('documents');
    const backupDir = path.join(documentsDir, 'ApexERP-Backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const fileName = `ApexERP-Backup-${dateStr}.json`;
    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');

    // Retain only the last 10 backup files
    try {
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith('ApexERP-Backup-') && f.endsWith('.json'))
        .map((f) => {
          const fullPath = path.join(backupDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, path: fullPath, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 10) {
        const toDelete = files.slice(10);
        for (const item of toDelete) {
          try {
            fs.unlinkSync(item.path);
          } catch (delErr) {
            console.warn('[AutoBackup] Failed to remove old backup:', item.name, delErr);
          }
        }
      }
    } catch (cleanErr) {
      console.warn('[AutoBackup] Retention cleanup warning:', cleanErr);
    }

    return { success: true, filePath };
  } catch (err) {
    console.error('[AutoBackup] Failed to write backup:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

// Lifecycle
app.whenReady().then(async () => {
  licenseManager = new LicenseManager(app.getPath('userData'));
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

