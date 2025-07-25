const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Función principal para crear a xanela da aplicación
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // Activa a ponte de contexto segura e asocia o script 'preload.js'
      // Isto é crucial para que a comunicación renderer <-> main funcione
      contextIsolation: true,
      nodeIntegration: false, // É importante manter isto en false por seguridade
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Carga o ficheiro principal da interface
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Descomenta a seguinte liña se queres que as ferramentas de desenvolvemento se abran ao iniciar
  // mainWindow.webContents.openDevTools();
}

// --- XESTIÓN DE DIÁLOGOS DE GARDAR/CARGAR ---

// Escoita a petición 'save-dialog' dende o renderer (vía preload)
ipcMain.handle('save-dialog', async (event, settings) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Gardar configuración do sintetizador',
    buttonLabel: 'Gardar',
    defaultPath: 'config.json', // Suxire un nome de ficheiro
    filters: [{ name: 'Configuración JSON', extensions: ['json'] }]
  });

  if (filePath) {
    try {
      // Escribe a configuración no ficheiro elixido
      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Error gardando a configuración:', error);
      return { success: false, error: error.message };
    }
  }
  // O usuario cancelou o diálogo
  return { success: false, cancelled: true };
});

// Escoita a petición 'load-dialog'
ipcMain.handle('load-dialog', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Cargar configuración do sintetizador',
    buttonLabel: 'Cargar',
    properties: ['openFile'],
    filters: [{ name: 'Configuración JSON', extensions: ['json'] }]
  });

  if (filePaths && filePaths.length > 0) {
    try {
      // Le o ficheiro e devolve os datos
      const data = fs.readFileSync(filePaths[0], 'utf-8');
      return { success: true, data: JSON.parse(data) };
    } catch (error) {
      console.error('Error cargando a configuración:', error);
      return { success: false, error: error.message };
    }
  }
  // O usuario cancelou o diálogo
  return { success: false, cancelled: true };
});

// --- CICLO DE VIDA DA APLICACIÓN ---

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});