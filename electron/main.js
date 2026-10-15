const { app, BrowserWindow, shell, ipcMain, Menu, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL UNCAUGHT EXCEPTION]:', err);
  try {
    const errorLogPath = path.join(app.getPath('userData') || __dirname, 'startup-error.log');
    fs.appendFileSync(errorLogPath, `[${new Date().toISOString()}] ${err?.stack || err}\n`);
  } catch {}
  try {
    dialog.showErrorBox('خطأ غير متوقع في تشغيل التطبيق', `${err?.message || err}\n\nيرجى التواصل مع الدعم الفني.`);
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});

const { LicenseManager } = require('./licenseManager');
const { LocalDatabaseManager } = require('./localDatabase');

// 1. Single Instance Lock
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// Explicitly preserve the existing userData folder to guarantee no data or license loss
const testUserDataDir = process.env.TEST_USER_DATA_DIR;
const activeEdition = process.env.EDITION || (app.name && app.name.includes('standard') ? 'standard' : 'cutting');

if (testUserDataDir) {
  app.setPath('userData', testUserDataDir);
} else {
  if (activeEdition === 'standard') {
    const standardPath = path.join(app.getPath('appData'), 'code-systems-standard');
    app.setPath('userData', standardPath);
  } else {
    // Cutting edition: preserves legacy data folder so existing clients never lose data
    const existingUserDataPath = path.join(app.getPath('appData'), 'apex-apparel-erp');
    const tempNewPath = path.join(app.getPath('appData'), 'code-systems');

    if (!fs.existsSync(existingUserDataPath) && fs.existsSync(tempNewPath)) {
      try {
        fs.cpSync(tempNewPath, existingUserDataPath, { recursive: true });
      } catch (migErr) {
        console.warn('[UserData Restore Warning]:', migErr);
      }
    }
    app.setPath('userData', existingUserDataPath);
  }
}

let mainWindow = null;
let isQuitting = false;
let backupFinished = false;
let licenseManager = null;
let localDatabaseManager = null;

const isDev =
  process.env.NODE_ENV === 'development' ||
  process.argv.includes('--dev') ||
  Boolean(process.env.VITE_DEV_SERVER_URL);

async function createWindow() {
  const electronIco = path.join(__dirname, 'icon.ico');
  const icoPath = path.join(__dirname, '../build/icon.ico');
  const fallbackIco = path.join(__dirname, '../public/icon.ico');
  const iconPath = fs.existsSync(electronIco)
    ? electronIco
    : fs.existsSync(icoPath)
    ? icoPath
    : fs.existsSync(fallbackIco)
    ? fallbackIco
    : undefined;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    title: activeEdition === 'standard' ? 'code systems - الإصدار القياسي' : 'code systems - إصدار مصانع الملابس وقص المراحل',
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
      devTools: isDev,
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

      // Also create an atomic SQLite backup on app close
      if (localDatabaseManager) {
        try {
          await localDatabaseManager.autoBackupOnClose();
        } catch (sqliteBackupErr) {
          console.warn('[AutoBackup SQLite] Close backup warning:', sqliteBackupErr);
        }
      }

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

// 1. In-App Print Preview IPC Handlers (Item 8: direct silent print & save PDF)
ipcMain.handle('print:list-printers', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return [];
  }
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      status: p.status,
      isDefault: Boolean(p.isDefault),
    }));
  } catch (err) {
    console.error('[list-printers error]:', err);
    return [];
  }
});

ipcMain.handle('print:print-html', async (_event, params = {}) => {
  const {
    html = '',
    deviceName = '',
    pageSize = 'A4',
    landscape = false,
    margins = 'default',
    copies = 1,
    printBackground = true,
  } = params;

  let hiddenWin = null;
  try {
    hiddenWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const encoded = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await hiddenWin.loadURL(encoded);

    // Wait for fonts to finish rendering
    try {
      await hiddenWin.webContents.executeJavaScript('document.fonts ? document.fonts.ready : Promise.resolve()');
    } catch {}

    // Map margin options
    let marginConfig = { marginType: 'default' };
    if (margins === 'none') {
      marginConfig = { marginType: 'none' };
    } else if (margins === 'minimal') {
      marginConfig = { marginType: 'minimum' };
    }

    return await new Promise((resolve) => {
      hiddenWin.webContents.print(
        {
          silent: true,
          deviceName: deviceName || '',
          pageSize: pageSize === '80mm' ? { width: 80000, height: 297000 } : pageSize,
          landscape: Boolean(landscape),
          margins: marginConfig,
          copies: Math.max(1, Number(copies) || 1),
          printBackground: printBackground !== false,
        },
        (success, failureReason) => {
          if (success) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: failureReason || 'فشلت الطباعة، تأكد من اتصال الطابعة' });
          }
        }
      );
    });
  } catch (err) {
    console.error('[print:print-html error]:', err);
    return { success: false, error: err?.message || 'فشلت عملية الطباعة' };
  } finally {
    if (hiddenWin && !hiddenWin.isDestroyed()) {
      hiddenWin.destroy();
    }
  }
});

ipcMain.handle('print:save-pdf', async (_event, params = {}) => {
  const {
    html = '',
    filename = 'document.pdf',
    pageSize = 'A4',
    landscape = false,
  } = params;

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'حفظ كملف PDF',
    defaultPath: filename,
    filters: [{ name: 'ملفات PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  let hiddenWin = null;
  try {
    hiddenWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const encoded = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await hiddenWin.loadURL(encoded);

    try {
      await hiddenWin.webContents.executeJavaScript('document.fonts ? document.fonts.ready : Promise.resolve()');
    } catch {}

    const pdfData = await hiddenWin.webContents.printToPDF({
      pageSize: pageSize === '80mm' ? { width: 80000, height: 297000 } : pageSize,
      landscape: Boolean(landscape),
      printBackground: true,
    });

    await fs.promises.writeFile(filePath, pdfData);
    return { success: true, filePath };
  } catch (err) {
    console.error('[print:save-pdf error]:', err);
    return { success: false, error: err?.message || 'فشل حفظ ملف PDF' };
  } finally {
    if (hiddenWin && !hiddenWin.isDestroyed()) {
      hiddenWin.destroy();
    }
  }
});

// Legacy direct printing fallback
ipcMain.handle('app:print', async (_event, options = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, error: 'النافذة غير متاحة' };
  }
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options.silent || false,
        printBackground: options.printBackground !== false,
        deviceName: options.deviceName || '',
        margins: options.margins || { marginType: 'none' },
        pageSize: options.pageSize || undefined,
      },
      (success, failureReason) => {
        resolve({ success, failureReason });
      }
    );
  });
});

// Edition IPC Handlers
ipcMain.on('edition:get-sync', (event) => {
  event.returnValue = activeEdition;
});
ipcMain.handle('edition:get', () => {
  return activeEdition;
});

// 2. Offline Single-Device Licensing IPC Handlers
ipcMain.handle('license:get-machine-code', () => {
  if (!licenseManager) {
    licenseManager = new LicenseManager(app.getPath('userData'), process.env.EDITION || 'cutting');
  }
  return licenseManager.getMachineCode();
});

ipcMain.handle('license:get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('license:get-status', () => {
  const allowDevBypass = !app.isPackaged && process.env.ALLOW_DEV_LICENSE_BYPASS === 'true';
  if (allowDevBypass) {
    return {
      isValid: true,
      isActivated: true,
      isDevBypass: true,
      customerName: 'مطور النظام (تخطي تجريبي)',
      edition: process.env.EDITION || 'cutting',
      machineCode: licenseManager ? licenseManager.getMachineCode() : 'DEV-MODE',
      daysRemaining: null,
      isPermanent: true,
      error: null,
      code: null,
    };
  }
  if (!licenseManager) {
    licenseManager = new LicenseManager(app.getPath('userData'), process.env.EDITION || 'cutting');
  }
  return licenseManager.getStatus();
});

ipcMain.handle('license:activate', (_event, licenseInput) => {
  if (!licenseManager) {
    licenseManager = new LicenseManager(app.getPath('userData'), process.env.EDITION || 'cutting');
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
    const backupDir = path.join(documentsDir, 'code-systems-Backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const fileName = `code-systems-Backup-${dateStr}.json`;
    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');

    // Retain only the last 15 backup files
    try {
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith('code-systems-Backup-') && f.endsWith('.json'))
        .map((f) => {
          const fullPath = path.join(backupDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, path: fullPath, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 15) {
        const toDelete = files.slice(15);
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

// 3. Local SQLite Database IPC Handlers
function getLocalDb() {
  if (!localDatabaseManager) {
    localDatabaseManager = new LocalDatabaseManager(app.getPath('userData'));
  }
  return localDatabaseManager;
}

ipcMain.handle('db:query', (_event, sql, params) => {
  return getLocalDb().query(sql, params);
});

ipcMain.handle('db:get', (_event, sql, params) => {
  return getLocalDb().get(sql, params);
});

ipcMain.handle('db:run', (_event, sql, params) => {
  return getLocalDb().run(sql, params);
});

ipcMain.handle('db:exec', (_event, sql) => {
  return getLocalDb().exec(sql);
});

ipcMain.handle('db:transaction', (_event, operations) => {
  return getLocalDb().executeTransaction(operations);
});

ipcMain.handle('db:check-integrity', () => {
  return getLocalDb().checkIntegrity();
});

ipcMain.handle('db:backup', async (_event, targetPath) => {
  return getLocalDb().backupDatabase(targetPath);
});

ipcMain.handle('db:restore', async (_event, sourcePath) => {
  return getLocalDb().restoreDatabase(sourcePath);
});

ipcMain.handle('db:choose-backup-location', async () => {
  const { dialog } = require('electron');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const defaultName = `apex-erp-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.db`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'تحديد مسار حفظ النسخة الاحتياطية لقاعدة البيانات',
    defaultPath: defaultName,
    filters: [{ name: 'code systems Database Backup (*.db)', extensions: ['db'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('db:choose-restore-file', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'تحديد ملف النسخة الاحتياطية للاسترجاع',
    properties: ['openFile'],
    filters: [{ name: 'code systems Database Backup (*.db, *.sqlite)', extensions: ['db', 'sqlite'] }],
  });
  return result.canceled ? null : result.filePaths[0];
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

// WhatsApp / wa.me External Link Opener (Requirement 6)
ipcMain.handle('shell:open-external', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://wa.me/') || url.startsWith('http://wa.me/'))) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: 'غير مصرح بفتح هذا الرابط' };
});

// Native Excel Save As Dialog & File Writing (Requirement 5)
ipcMain.handle('excel:save', async (_event, { filename, base64Data }) => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ ملف إكسيل',
      defaultPath: filename || 'تقرير.xlsx',
      filters: [{ name: 'Excel Workbook (*.xlsx)', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Lifecycle
app.whenReady().then(async () => {
  licenseManager = new LicenseManager(app.getPath('userData'), process.env.EDITION || 'cutting');
  localDatabaseManager = new LocalDatabaseManager(app.getPath('userData'));

  // Daily Automated Backup: runs once every day without manual user intervention
  async function runDailyAutomatedBackup() {
    try {
      const documentsDir = app.getPath('documents');
      const backupDir = path.join(documentsDir, 'code-systems-Backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const todayStr = new Date().toISOString().split('T')[0];
      const files = fs.readdirSync(backupDir);
      const hasToday = files.some((f) => f.includes(todayStr));
      if (!hasToday && localDatabaseManager) {
        const dbBackupPath = path.join(backupDir, `code-systems-daily-${todayStr}.db`);
        await localDatabaseManager.backupDatabase(dbBackupPath);
        console.log('[AutoBackup] Daily automated database backup created:', dbBackupPath);
      }
    } catch (err) {
      console.warn('[AutoBackup] Daily automated backup error:', err);
    }
  }

  await runDailyAutomatedBackup();
  setInterval(runDailyAutomatedBackup, 6 * 60 * 60 * 1000);

  // Run startup integrity check
  const integrity = localDatabaseManager.checkIntegrity();
  if (!integrity.ok) {
    console.error('[Startup DB Integrity Warning]:', integrity.details);
  }

  await createWindow();

  if (!integrity.ok && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('db:integrity-warning', integrity);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((readyErr) => {
  console.error('[CRITICAL ERROR in whenReady]:', readyErr);
  try {
    dialog.showErrorBox('خطأ أثناء بدء التشغيل', readyErr?.stack || String(readyErr));
  } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

