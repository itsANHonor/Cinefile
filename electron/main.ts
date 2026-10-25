import { app, BrowserWindow, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let serverInstance: http.Server | null = null;

function getResourceRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, '../..');
}

function configureDesktopEnvironment(): void {
  const userDataPath = app.getPath('userData');
  const uploadsPath = path.join(userDataPath, 'uploads');
  const dbPath = path.join(userDataPath, 'database.sqlite');

  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(uploadsPath, { recursive: true });

  const resourceRoot = getResourceRoot();
  const publicDir = path.join(resourceRoot, 'client', 'dist');
  const migrationsDir = path.join(resourceRoot, 'server', 'migrations');

  process.env.DESKTOP_MODE = 'true';
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.DATABASE_PATH = process.env.DATABASE_PATH || dbPath;
  process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || uploadsPath;
  process.env.PUBLIC_DIR = process.env.PUBLIC_DIR || publicDir;
  process.env.MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || migrationsDir;
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
}

async function createWindow(port: number): Promise<void> {
  const resourceRoot = getResourceRoot();
  const iconPath = path.join(resourceRoot, 'client', 'public', 'icon-512.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    title: 'Cinefile',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external http/https links (e.g. TMDb or store links) in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return { action: 'allow' };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrapDesktopApp(): Promise<void> {
  configureDesktopEnvironment();

  const resourceRoot = getResourceRoot();
  const serverEntryPath = path.join(resourceRoot, 'server', 'dist', 'index-full.js');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startFullServer } = require(serverEntryPath);
  const requestedPort = Number(process.env.DESKTOP_PORT) || 0;

  serverInstance = await startFullServer({
    host: '127.0.0.1',
    port: requestedPort,
  });

  const address = serverInstance?.address();
  const boundPort =
    typeof address === 'object' && address ? address.port : requestedPort;

  await createWindow(boundPort);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(boundPort);
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    bootstrapDesktopApp().catch((err) => {
      console.error('Failed to start Cinefile desktop application:', err);
      app.quit();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (serverInstance) {
      serverInstance.close();
      serverInstance = null;
    }
  });
}
