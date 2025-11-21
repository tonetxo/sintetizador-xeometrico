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

  return mainWindow;
}

// Menu template
function createMenu(mainWindow) {
  const { Menu } = require('electron');

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Configuration',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-save');
          }
        },
        {
          label: 'Load Configuration',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-load');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- XESTIÓN DE DIÁLOGOS DE GARDAR/CARGAR ---

// Track last used directory (persist between sessions)
const userDataPath = app.getPath('userData');
const lastDirFile = path.join(userDataPath, 'last-directory.txt');

function getLastDirectory() {
  try {
    if (fs.existsSync(lastDirFile)) {
      return fs.readFileSync(lastDirFile, 'utf-8').trim();
    }
  } catch (error) {
    console.error('Error reading last directory:', error);
  }
  return null;
}

function setLastDirectory(dirPath) {
  try {
    fs.writeFileSync(lastDirFile, dirPath, 'utf-8');
  } catch (error) {
    console.error('Error saving last directory:', error);
  }
}

// Escoita a petición 'save-dialog' dende o renderer (vía preload)
ipcMain.handle('save-dialog', async (event, settings) => {
  const lastDir = getLastDirectory();
  const dialogOptions = {
    title: 'Gardar configuración do sintetizador',
    buttonLabel: 'Gardar',
    defaultPath: lastDir ? path.join(lastDir, 'config.json') : 'config.json',
    filters: [{ name: 'Configuración JSON', extensions: ['json'] }]
  };

  const { filePath } = await dialog.showSaveDialog(dialogOptions);

  if (filePath) {
    try {
      // Save last directory
      setLastDirectory(path.dirname(filePath));

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
  const lastDir = getLastDirectory();
  const dialogOptions = {
    title: 'Cargar configuración do sintetizador',
    buttonLabel: 'Cargar',
    properties: ['openFile'],
    filters: [{ name: 'Configuración JSON', extensions: ['json'] }]
  };

  // Set default path to last directory if available
  if (lastDir) {
    dialogOptions.defaultPath = lastDir;
  }

  const { filePaths } = await dialog.showOpenDialog(dialogOptions);

  if (filePaths && filePaths.length > 0) {
    try {
      // Save last directory
      setLastDirectory(path.dirname(filePaths[0]));

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
  const mainWindow = createWindow();
  createMenu(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      createMenu(win);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});