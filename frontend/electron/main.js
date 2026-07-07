const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

const DIST_PATH = path.join(__dirname, '..', 'dist');

let mainWindow;
let server;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function serveIndex(res) {
  fs.readFile(path.join(DIST_PATH, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
}

/**
 * Create a lightweight HTTP server that serves the dist/ directory.
 * This avoids the custom protocol issues (Expo Router doesn't understand
 * non-http URLs) and the file:// protocol issues (absolute asset paths
 * like /_expo/... resolve to the filesystem root).
 */
function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let filePath = decodeURIComponent(req.url).split('?')[0];

      // Default to index.html for root or SPA routes
      if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
      }

      const fullPath = path.join(DIST_PATH, filePath);

      // Prevent path traversal
      if (!fullPath.startsWith(DIST_PATH + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            // If the URL has no file extension, treat it as an SPA route
            // and serve index.html so Expo Router can handle it
            const ext = path.extname(filePath).toLowerCase();
            if (!ext) {
              return serveIndex(res);
            }
          }
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': getMimeType(fullPath) });
        res.end(data);
      });
    });

    // Use a fixed port so Supabase auth session persists in localStorage across restarts
    const PORT = 55630;
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[server] Serving dist/ on http://localhost:${PORT}`);
      resolve(PORT);
    });

    server.on('error', reject);
  });
}

/**
 * Auto-updater configuration — checks GitHub Releases for new versions.
 */
function setupAutoUpdater() {
  autoUpdater.logger = console;
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for updates…');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] No update available (current:', info.version, ')');
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available', info.version);
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

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 600,
    minHeight: 500,
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

  // Load from the local HTTP server — Expo Router works perfectly over HTTP
  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    await createWindow(port);

    if (app.isPackaged) {
      setupAutoUpdater();
      setTimeout(() => {
        autoUpdater.checkForUpdates();
      }, 5000);
    }
  } catch (err) {
    console.error('[app] Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (server) {
    server.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    server.close();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    // Need to restart server if it was closed
    startServer().then(port => createWindow(port));
  }
});
