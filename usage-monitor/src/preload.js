const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usage', {
  get: () => ipcRenderer.invoke('usage:get'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  pin: on => ipcRenderer.invoke('win:pin', on),
  openExternal: url => ipcRenderer.invoke('open:external', url),
  onUpdate: cb => ipcRenderer.on('usage:update', (_e, data) => cb(data)),
});
