import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import { config } from 'dotenv';
import { initDatabase, getDatabase, closeDatabase } from '../src/main/db/index.js';

// Load environment variables
config();

// Initialize database when app is ready
let dbInitialized = false;

let overlayWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 200,
    height: 200,
    x: width - 250,
    y: height - 250,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Click-through except on mascot
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173/overlay.html');
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    overlayWindow.loadFile(join(__dirname, '../dist/overlay.html'));
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    dashboardWindow.loadURL('http://localhost:5173/dashboard.html');
    dashboardWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    dashboardWindow.loadFile(join(__dirname, '../dist/dashboard.html'));
  }

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize database
  try {
    initDatabase();
    dbInitialized = true;
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }

  createOverlayWindow();
  createDashboardWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createDashboardWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});

// IPC handlers (will be expanded in later phases)
ipcMain.handle('ping', async () => {
  return 'pong';
});

// Test database IPC handler
ipcMain.handle('db-test', async () => {
  try {
    const db = getDatabase();
    // Test write
    const testId = `test-${Date.now()}`;
    db.prepare(
      'INSERT INTO settings (key, value_json) VALUES (?, ?)'
    ).run('test_key', JSON.stringify({ value: testId }));

    // Test read
    const result = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('test_key') as { value_json: string } | undefined;

    // Clean up
    db.prepare('DELETE FROM settings WHERE key = ?').run('test_key');

    return result ? JSON.parse(result.value_json) : null;
  } catch (error) {
    console.error('Database test failed:', error);
    throw error;
  }
});

// Export for other modules
export { overlayWindow, dashboardWindow };
