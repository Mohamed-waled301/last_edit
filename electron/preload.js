const { contextBridge, ipcRenderer } = require('electron');

function resolvePreloadEdition() {
  if (process.env.EDITION === 'standard' || process.env.EDITION === 'cutting') {
    return process.env.EDITION;
  }
  try {
    const syncEdition = ipcRenderer.sendSync('edition:get-sync');
    if (syncEdition === 'standard' || syncEdition === 'cutting') {
      return syncEdition;
    }
  } catch {}
  try {
    const fs = require('fs');
    const path = require('path');
    const edFile = path.join(__dirname, 'edition.json');
    if (fs.existsSync(edFile)) {
      const parsed = JSON.parse(fs.readFileSync(edFile, 'utf8'));
      if (parsed?.edition === 'standard' || parsed?.edition === 'cutting') {
        return parsed.edition;
      }
    }
  } catch {}
  const execLower = (process.execPath || '').toLowerCase();
  if (execLower.includes('standard')) {
    return 'standard';
  }
  return 'cutting';
}

const activeEdition = resolvePreloadEdition();

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  edition: activeEdition,
  getEdition: () => activeEdition,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:version'),
  saveAutoBackup: (data) => ipcRenderer.invoke('backup:save-auto', data),
  notifyAutoBackupCompleted: () => ipcRenderer.send('backup:auto-completed'),
  onTriggerAutoBackup: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:trigger-auto-backup', handler);
    return () => ipcRenderer.removeListener('app:trigger-auto-backup', handler);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  saveExcel: (data) => ipcRenderer.invoke('excel:save', data),
  print: (options) => ipcRenderer.invoke('app:print', options),
  listPrinters: () => ipcRenderer.invoke('print:list-printers'),
  printHtml: (params) => ipcRenderer.invoke('print:print-html', params),
  savePdf: (params) => ipcRenderer.invoke('print:save-pdf', params),

  // Single-device offline licensing IPC
  getMachineCode: () => ipcRenderer.invoke('license:get-machine-code'),
  getUserDataPath: () => ipcRenderer.invoke('license:get-user-data-path'),
  getLicenseStatus: () => ipcRenderer.invoke('license:get-status'),
  activate: (licenseKeyOrJson) => ipcRenderer.invoke('license:activate', licenseKeyOrJson),
  onLicenseStatusChanged: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('license:status-changed', handler);
    return () => ipcRenderer.removeListener('license:status-changed', handler);
  },

  // Local SQLite Database IPC
  db: {
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    get: (sql, params) => ipcRenderer.invoke('db:get', sql, params),
    run: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
    exec: (sql) => ipcRenderer.invoke('db:exec', sql),
    transaction: (operations) => ipcRenderer.invoke('db:transaction', operations),
    checkIntegrity: () => ipcRenderer.invoke('db:check-integrity'),
    backup: (targetPath) => ipcRenderer.invoke('db:backup', targetPath),
    restore: (sourcePath) => ipcRenderer.invoke('db:restore', sourcePath),
    chooseBackupLocation: () => ipcRenderer.invoke('db:choose-backup-location'),
    chooseRestoreFile: () => ipcRenderer.invoke('db:choose-restore-file'),
    onIntegrityWarning: (callback) => {
      const handler = (_event, info) => callback(info);
      ipcRenderer.on('db:integrity-warning', handler);
      return () => ipcRenderer.removeListener('db:integrity-warning', handler);
    },
  },
});

