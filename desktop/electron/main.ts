import { app, BrowserWindow, screen, Menu } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { initDatabase, getDatabase, closeDatabase } from '../src/main/db/index.js';
import { initNudgeQueue, getNudgeQueue } from '../src/main/nudge/index.js';
import { handle, onSend, sendTo } from '../src/main/ipc.js';
import { overlayStateEvents, setMascotState } from '../src/main/overlay/state.js';
import { stuckBus } from '../src/main/stuck/bus.js';
import { logEvent } from '../src/main/events.js';
import { getSetting } from '../src/main/settings.js';
import { startFeatures, stopFeatures } from '../src/main/features/index.js';
import { Nudge } from '@wolfie/shared';

// The main bundle is ESM ("type": "module"), so __dirname does not exist; derive it.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
config();

let overlayWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let testWindow: BrowserWindow | null = null;

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
          setMascotState('sleeping');
        } else {
          queue.resume();
          setMascotState('idle');
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
    initDatabase(app.getPath('userData'));
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }

  // Initialize nudge queue
  try {
    const nudgeQueue = initNudgeQueue();
    console.log('NudgeQueue initialized successfully');

    // Forward nudges to overlay window
    nudgeQueue.on('show', (nudge: Nudge) => {
      sendTo(overlayWindow?.webContents, 'nudge-show', nudge);
    });
  } catch (error) {
    console.error('Failed to initialize nudge queue:', error);
  }

  // Sprite-only states (escalation glance / "?", sleeping) bypass the queue
  overlayStateEvents.on('change', (state) => {
    sendTo(overlayWindow?.webContents, 'overlay-state', state);
  });

  // Feature modules register their own startup here (one registerX() call per module).
  startFeatures({
    pushNudge: (nudge) => getNudgeQueue().push(nudge),
    logEvent,
    getSetting,
    stuckBus
  });

  createOverlayWindow();
  createDashboardWindow();

  // `npm run smoke`: renderer -> preload -> main -> DB round trip, then quit (Phase 0 accept)
  if (process.env.WOLFIE_SMOKE === '1') {
    overlayWindow?.webContents.on('preload-error', (_event, path, error) => {
      console.log(`[smoke] preload error in ${path}: ${error}`);
    });
    overlayWindow?.webContents.on('console-message', (event) => {
      console.log(`[smoke] renderer: ${event.message}`);
    });
    overlayWindow?.webContents.once('did-finish-load', async () => {
      try {
        const result = await overlayWindow?.webContents.executeJavaScript(
          "Promise.all([window.electronAPI.ping(), window.electronAPI.invoke('db-test')]).then(JSON.stringify)"
        );
        console.log(`[smoke] OK ${result}`);
      } catch (error) {
        console.log(`[smoke] FAIL ${error}`);
        process.exitCode = 1;
      }
      app.quit();
    });
  }

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
  stopFeatures();
  closeDatabase();
});

// IPC handlers (typed: see src/common/ipc.ts)
handle('ping', async () => 'pong');

// Test database IPC handler
handle('db-test', async () => {
  const db = getDatabase();
  // Test write
  const testId = `test-${Date.now()}`;
  db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?)').run('test_key', JSON.stringify({ value: testId }));

  // Test read
  const result = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('test_key') as
    | { value_json: string }
    | undefined;

  // Clean up
  db.prepare('DELETE FROM settings WHERE key = ?').run('test_key');

  return result ? JSON.parse(result.value_json) : null;
});

// Click-through except on the mascot: the overlay toggles this on hover
onSend('set-ignore-mouse-events', (sender, ignore, options) => {
  BrowserWindow.fromWebContents(sender)?.setIgnoreMouseEvents(ignore, options);
});

// Nudge API IPC handlers
const guarded = (fn: () => void) => {
  try {
    fn();
    return { success: true };
  } catch (error) {
    console.error('[IPC] Nudge call failed:', error);
    return { success: false, error: String(error) };
  }
};

handle('nudge-push', async (nudge) => {
  try {
    const id = getNudgeQueue().push(nudge);
    return id ? { success: true, id } : { success: false };
  } catch (error) {
    console.error('Failed to push nudge:', error);
    return { success: false, error: String(error) };
  }
});
handle('nudge-snooze', async () => guarded(() => getNudgeQueue().snooze()));
handle('nudge-pause', async () =>
  guarded(() => {
    getNudgeQueue().pause();
    setMascotState('sleeping');
  })
);
handle('nudge-resume', async () =>
  guarded(() => {
    getNudgeQueue().resume();
    setMascotState('idle');
  })
);
handle('nudge-status', async () => getNudgeQueue().getStatus());
handle('nudge-response', async (response) => guarded(() => getNudgeQueue().respond(response)));

// Manual hint entry point (SPEC 4d); the escalation engine (B2) listens on stuckBus
handle('mascot-click', async () => guarded(() => stuckBus.emit('help-requested', 'manual')));

// Export for other modules
export { overlayWindow, dashboardWindow, testWindow };
