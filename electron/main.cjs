const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const http = require('http');
const { fork } = require('child_process');
const fs = require('fs');

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3002;
const APP_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let serverProcess = null;

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timed out waiting for server at ${url}`));
          } else {
            setTimeout(check, 250);
          }
        });
    };
    check();
  });
}

function startProductionServer() {
  const possiblePaths = [
    path.join(process.resourcesPath, 'standalone', 'server.js'),
    path.join(__dirname, '..', '.next', 'standalone', 'server.js'),
    path.join(process.cwd(), '.next', 'standalone', 'server.js'),
  ];

  const serverPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!serverPath) {
    console.error('Next.js standalone server not found at any of:', possiblePaths);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, '.app-settings.json');

    serverProcess = fork(serverPath, [], {
      cwd: path.dirname(serverPath),
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1',
        NODE_PATH: path.join(path.dirname(serverPath), 'node_modules'),
        APP_SETTINGS_PATH: settingsPath,
      },
      stdio: 'inherit',
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start Next.js server:', err);
      reject(err);
    });

    waitForServer(APP_URL).then(resolve).catch(reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0a0a',
    title: 'GitHub Activity Trace',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Open external links in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
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
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.loadURL(APP_URL).catch((err) => {
    console.error('Failed to load app:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function init() {
  if (!isDev) {
    try {
      await startProductionServer();
    } catch (err) {
      console.error('Error starting production server:', err);
    }
  }
  createWindow();
}

app.whenReady().then(() => {
  init();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
