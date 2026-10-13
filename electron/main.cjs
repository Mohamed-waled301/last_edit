const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer } = require('./server.cjs');

// Prevent multiple instances of the app
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let embeddedServer = null;

const isDev =
  process.env.NODE_ENV === 'development' ||
  process.argv.includes('--dev') ||
  Boolean(process.env.ELECTRON_START_URL);

async function createWindow() {
  const icoPath = path.join(__dirname, '../public/icon.ico');
  const pngPath = path.join(__dirname, '../public/icon.png');
  const iconPath = fs.existsSync(icoPath) ? icoPath : (fs.existsSync(pngPath) ? pngPath : undefined);

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 650,
    backgroundColor: '#F4F5F7',
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      // If external website link, open in user default browser
      if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    console.log(`[Electron] Loading Dev Server: ${devUrl}`);
    await mainWindow.loadURL(devUrl);
    // Optionally open DevTools in dev mode
    // mainWindow.webContents.openDevTools();
  } else {
    // Production Mode: run embedded local server
    const distPath = path.join(__dirname, '../dist');
    const apiPath = path.join(__dirname, '../api/index.js');

    try {
      const serverInfo = await startServer(distPath, apiPath, 0);
      embeddedServer = serverInfo.server;
      console.log(`[Electron] Embedded Server running at: ${serverInfo.url}`);
      await mainWindow.loadURL(serverInfo.url);
    } catch (err) {
      console.error('[Electron] Failed to start local server, falling back to file load:', err);
      const fallbackFile = path.join(distPath, 'index.html');
      await mainWindow.loadFile(fallbackFile);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Second instance triggered: focus primary window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// App lifecycle
app.whenReady().then(async () => {
  // IPC Handlers
  ipcMain.handle('app:version', () => app.getVersion());
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

app.on('will-quit', () => {
  if (embeddedServer) {
    try {
      embeddedServer.close();
    } catch (e) {}
  }
});
