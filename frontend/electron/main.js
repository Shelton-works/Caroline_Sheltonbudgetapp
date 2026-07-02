const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 900,
    minWidth: 380,
    minHeight: 600,
    maxWidth: 500,
    title: 'Our Finances - Shared Sanctuary',
    icon: path.join(__dirname, '..', 'assets', 'images', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    backgroundColor: '#F9F9F9',
  });

  // Load the Expo web build
  const webBuildPath = path.join(__dirname, '..', 'dist');
  mainWindow.loadFile(path.join(webBuildPath, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Remove default menu for cleaner look
  Menu.setApplicationMenu(null);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
