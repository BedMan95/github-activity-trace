const { contextBridge } = require('electron');

// Expose safe desktop info/APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});
