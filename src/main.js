const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Ruta robusta para cargar o index.html desde a carpeta src
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Descomenta a seguinte liña para abrir as ferramentas de desenvolvemento ao iniciar
  // mainWindow.webContents.openDevTools();

  mainWindow.on('maximize', () => {
    mainWindow.setFullScreen(true);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});