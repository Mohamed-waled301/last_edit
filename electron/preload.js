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
});
