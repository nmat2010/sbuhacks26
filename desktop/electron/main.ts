import { app, BrowserWindow, ipcMain, screen, Menu } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { initDatabase, getDatabase, closeDatabase } from '../src/main/db/index.js';
import { initNudgeQueue, getNudgeQueue } from '../src/main/nudge/index.js';
import { Nudge } from '@wolfie/shared';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

// Initialize database when app is ready
let dbInitialized = false;
let nudgeQueueInitialized = false;

let overlayWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let testWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 300,
    height: 300,
    x: width - 350,
    y: height - 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false, // Show in taskbar for easier debugging
    resizable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Click-through except on mascot
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Start Session',
      click: () => {
        overlayWindow?.webContents.send('session-control', 'start');
      }
    },
    {
      label: 'Stop Session',
      click: () => {
        overlayWindow?.webContents.send('session-control', 'stop');
      }
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        if (dashboardWindow) {
          dashboardWindow.show();
          dashboardWindow.focus();
        }
      }
    },
    {
      label: 'Open Test Panel',
      click: () => {
        createTestWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Snooze 30 min',
      click: () => {
        const queue = getNudgeQueue();
        queue.snooze();
      }
    },
    {
      label: 'Pause Monitoring',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        const queue = getNudgeQueue();
        if (menuItem.checked) {
          queue.pause();
        } else {
          queue.resume();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Voice',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        overlayWindow?.webContents.send('voice-toggle', menuItem.checked);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  overlayWindow.webContents.on('context-menu', () => {
    contextMenu.popup();
  });

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
      preload: join(__dirname, 'preload.cjs'),
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

function createTestWindow() {
  if (testWindow) {
    testWindow.show();
    testWindow.focus();
    return;
  }

  testWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Wolfie Test Panel',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    testWindow.loadURL('http://localhost:5173/test-nudge.html');
  } else {
    testWindow.loadFile(join(__dirname, '../dist/test-nudge.html'));
  }

  testWindow.on('closed', () => {
    testWindow = null;
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

  // Initialize nudge queue
  try {
    const nudgeQueue = initNudgeQueue();
    nudgeQueueInitialized = true;
    console.log('NudgeQueue initialized successfully');

    // Forward nudges to overlay window
    nudgeQueue.on('show', (nudge: Nudge) => {
      if (overlayWindow) {
        overlayWindow.webContents.send('nudge-show', nudge);
      }
    });
  } catch (error) {
    console.error('Failed to initialize nudge queue:', error);
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

ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options?: { forward: boolean }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, options);
  }
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

// Nudge API IPC handlers
ipcMain.handle('nudge-push', async (_event, nudge: Nudge) => {
  try {
    const queue = getNudgeQueue();
    const result = queue.push(nudge);
    return { success: result };
  } catch (error) {
    console.error('Failed to push nudge:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('nudge-snooze', async () => {
  try {
    const queue = getNudgeQueue();
    queue.snooze();
    return { success: true };
  } catch (error) {
    console.error('Failed to snooze:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('nudge-pause', async () => {
  try {
    const queue = getNudgeQueue();
    queue.pause();
    return { success: true };
  } catch (error) {
    console.error('Failed to pause:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('nudge-resume', async () => {
  try {
    const queue = getNudgeQueue();
    queue.resume();
    return { success: true };
  } catch (error) {
    console.error('Failed to resume:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('nudge-status', async () => {
  try {
    const queue = getNudgeQueue();
    return queue.getStatus();
  } catch (error) {
    console.error('Failed to get status:', error);
    throw error;
  }
});

ipcMain.handle('open-test-panel', async () => {
  createTestWindow();
  return { success: true };
});

// Export for other modules
export { overlayWindow, dashboardWindow, testWindow };
