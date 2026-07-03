const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

const DIST_PATH = path.join(__dirname, '..', 'dist');

let mainWindow;

/**
 * Auto-updater configuration — checks GitHub Releases for new versions.
 */
function setupAutoUpdater() {
  // Log update events to console for debugging
  autoUpdater.logger = console;

  // Don't auto-download on check — we'll prompt the user first
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for updates…');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
    // Ask the user if they want to download
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] No update available (current:', info.version, ')');
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available');
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', progress.percent);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info.version);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', err.message);
    }
  });

  // Listen for renderer requesting update actions
  ipcMain.on('start-update-download', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdates();
  });
}

/**
 * Custom protocol handler for 'ourfinances://app/...'
 *
 * Expo web builds output index.html with absolute asset paths
 * (e.g. /_expo/static/js/web/entry-xxx.js). When loaded via
 * file:// protocol, those paths resolve to the filesystem root
 * rather than relative to the HTML file, causing a blank window.
 *
 * By registering a custom protocol, we ensure every resource
 * request is served from the dist/ directory correctly.
 */
function registerProtocol() {
  protocol.handle('ourfinances', (request) => {
    const url = new URL(request.url);
    let filePath = decodeURIComponent(url.pathname);
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }
    const fullPath = path.resolve(DIST_PATH, filePath.startsWith('/') ? filePath.slice(1) : filePath);
    // Prevent path traversal outside dist directory
    if (!fullPath.startsWith(DIST_PATH + path.sep)) {
      throw new Error('Invalid path');
    }
    return net.fetch(pathToFileURL(fullPath).toString());
  });
}

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

  // Load via custom protocol so absolute asset paths resolve correctly
  mainWindow.loadURL('ourfinances://app/index.html');

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

app.whenReady().then(() => {
  registerProtocol();
  createWindow();

  if (app.isPackaged) {
    setupAutoUpdater();
    // Check for updates after a short delay so the UI is ready
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 5000);
  }
});

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
