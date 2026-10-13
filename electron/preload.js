const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
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

  // Single-device offline licensing IPC
  getMachineCode: () => ipcRenderer.invoke('license:get-machine-code'),
  getLicenseStatus: () => ipcRenderer.invoke('license:get-status'),
  activate: (licenseKeyOrJson) => ipcRenderer.invoke('license:activate', licenseKeyOrJson),
  onLicenseStatusChanged: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('license:status-changed', handler);
    return () => ipcRenderer.removeListener('license:status-changed', handler);
  },
});

