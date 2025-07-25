// Ficheiro: src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ Preload script cargado correctamente.');

// Expón de forma segura métodos para gardar e cargar ficheiros
// O renderer poderá chamar a window.electronAPI.saveSettings(data) e window.electronAPI.loadSettings()
contextBridge.exposeInMainWorld('electronAPI', {
  saveSettings: (settings) => ipcRenderer.invoke('save-dialog', settings),
  loadSettings: () => ipcRenderer.invoke('load-dialog'),
});
