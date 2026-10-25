import { app, BrowserWindow, screen, Menu } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';
import { initDatabase, getDatabase, closeDatabase } from '../src/main/db/index.js';
import { initNudgeQueue, getNudgeQueue } from '../src/main/nudge/index.js';
import { handle, onSend, sendTo } from '../src/main/ipc.js';
import { overlayStateEvents, setMascotState } from '../src/main/overlay/state.js';
import { stuckBus } from '../src/main/stuck/bus.js';
import { logEvent } from '../src/main/events.js';
import { getSetting, setSetting } from '../src/main/settings.js';
import { startFeatures, stopFeatures } from '../src/main/features/index.js';
import { isPaused, sessionEvents, setPaused, startSession, stopSession } from '../src/main/session/index.js';
import { registerSensing, unregisterSensing } from '../src/main/sensing/register.js';
import { registerIntelligence, unregisterIntelligence } from '../src/main/intelligence/register.js';
import { Nudge } from '@wolfie/shared';

// The main bundle is ESM ("type": "module"), so __dirname does not exist; derive it.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
config();

// Separate data dirs let two worktrees run side by side (WOLFIE_USER_DATA=/tmp/wolfie-a ...)
if (process.env.WOLFIE_USER_DATA) app.setPath('userData', process.env.WOLFIE_USER_DATA);

let overlayWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let testWindow: BrowserWindow | null = null;

// Set by vite-plugin-electron in dev; follows Vite if it had to pick another port
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function loadPage(win: BrowserWindow, page: string) {
  if (devServerUrl) {
    win.loadURL(new URL(page, devServerUrl).toString());
  } else {
    win.loadFile(join(__dirname, `../dist/${page}`));
  }
}

// Room for the mascot at the bottom plus a bubble or hint above it; transparent and
// click-through outside the mascot and bubble, so the extra size doesn't block other apps.
const OVERLAY_WIDTH = 360;
const OVERLAY_HEIGHT = 520;
/** Height while the chat is open, so answers have room (capped by the screen). */
const OVERLAY_CHAT_HEIGHT = 780;

function createOverlayWindow() {
  const { x: areaX, y: areaY, width, height } = screen.getPrimaryDisplay().workArea;

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: areaX + width - OVERLAY_WIDTH - 16,
    y: areaY + height - OVERLAY_HEIGHT - 8,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    // macOS: an NSPanel can float above other apps' full-screen windows
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    skipTaskbar: false, // Show in taskbar for easier debugging
    resizable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Above normal windows, on every desktop (Space), and over full-screen apps
  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Click-through except on mascot
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Start Session',
      click: () => {
        startSession();
        sendTo(overlayWindow?.webContents, 'session-control', 'start');
      }
    },
    {
      label: 'Stop Session',
      click: () => {
        stopSession();
        sendTo(overlayWindow?.webContents, 'session-control', 'stop');
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
      checked: isPaused(),
      click: (menuItem) => setPaused(menuItem.checked)
    },
    { type: 'separator' },
    {
      label: 'Voice',
      type: 'checkbox',
      checked: getSetting('voice.enabled'),
      click: (menuItem) => {
        setSetting('voice.enabled', menuItem.checked);
        sendTo(overlayWindow?.webContents, 'voice-toggle', menuItem.checked);
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

  loadPage(overlayWindow, 'overlay.html');
  if (devServerUrl && process.env.WOLFIE_SMOKE !== '1') overlayWindow.webContents.openDevTools({ mode: 'detach' });

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

  loadPage(dashboardWindow, 'dashboard.html');
  if (devServerUrl && process.env.WOLFIE_SMOKE !== '1') dashboardWindow.webContents.openDevTools({ mode: 'detach' });

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

  loadPage(testWindow, 'test-nudge.html');

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

  // Pause monitoring (SPEC 7): queue + sleeping sprite here; A1 adds mic and extension
  sessionEvents.on('pause', (paused) => {
    const queue = getNudgeQueue();
    if (paused) queue.pause();
    else queue.resume();
    setMascotState(paused ? 'sleeping' : 'idle');
  });

  // Each agent wires its modules in its own register file; do not add calls to main.ts
  registerSensing();
  registerIntelligence();

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
        // WOLFIE_SMOKE_SHOT=<png path>: open the chat, ask a question, save a picture of the overlay
        if (process.env.WOLFIE_SMOKE_SHOT && overlayWindow) {
          const ui = (js: string) => overlayWindow!.webContents.executeJavaScript(js);
          // WOLFIE_SMOKE_STUCK: a picture of the "I'm stuck" button, then press it and see the chat
          if (process.env.WOLFIE_SMOKE_STUCK) {
            writeFileSync(process.env.WOLFIE_SMOKE_SHOT.replace(/\.png$/, '-button.png'), (await overlayWindow.webContents.capturePage()).toPNG());
            await ui("document.querySelector('.stuck-button').click()");
            await new Promise((r) => setTimeout(r, 6000));
            console.log(`[smoke] stuck: chat-open=${await ui("!!document.querySelector('.hint-messages')")}`);
          }
          await ui("document.querySelector('.mascot').click()");
          await new Promise((r) => setTimeout(r, 500));
          console.log(`[smoke] chat-open messages=${await ui("document.querySelectorAll('.message-text').length")} first=${await ui("document.querySelector('.message-text')?.textContent?.slice(0, 40)")}`);
          await ui(`(() => {
            const input = document.querySelector('.hint-input');
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            set.call(input, ${JSON.stringify(process.env.WOLFIE_SMOKE_QUESTION ?? 'What is attention in a transformer?')});
            input.dispatchEvent(new Event('input', { bubbles: true }));
            document.querySelector('.send-btn').click();
          })()`);
          await new Promise((r) => setTimeout(r, process.env.WOLFIE_SMOKE_QUESTION ? 8000 : 2500));
          const texts = await ui("[...document.querySelectorAll('.message-text')].map((e) => e.textContent).join(' | ')");
          console.log(`[smoke] chat: ${texts}`);
          // WOLFIE_SMOKE_QUESTION: just that question (e.g. suggested resources), then the picture
          const resources = await ui("[...document.querySelectorAll('.resource-link')].map((e) => e.title + ' :: ' + e.textContent).join(' | ')");
          if (resources) console.log(`[smoke] resources: ${resources}`);
          if (!process.env.WOLFIE_SMOKE_QUESTION) {
            // Overflow the list, then scroll with real wheel input and see whether it moves
            for (let i = 0; i < 4; i++) {
              await ui(`(() => {
                const input = document.querySelector('.hint-input');
                const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                set.call(input, 'Question ${i + 1}');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('.send-btn').click();
              })()`);
              await new Promise((r) => setTimeout(r, 900));
            }
            const box = await ui("(() => { const r = document.querySelector('.hint-messages').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
            if (process.env.WOLFIE_SMOKE_OS_SCROLL) {
              // Real macOS scroll test: print the screen point, give an outside tool time to scroll there
              const wb = overlayWindow.getBounds();
              const osBefore = await ui("document.querySelector('.hint-messages').scrollTop");
              console.log(`[smoke] os-point ${Math.round(wb.x + box.x)},${Math.round(wb.y + box.y)} before=${osBefore}`);
              await new Promise((r) => setTimeout(r, 6000));
              console.log(`[smoke] os-after=${await ui("document.querySelector('.hint-messages').scrollTop")}`);
            }
            const before = await ui("document.querySelector('.hint-messages').scrollTop");
            for (let i = 0; i < 5; i++) {
              overlayWindow.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round(box.x), y: Math.round(box.y), deltaX: 0, deltaY: 120, canScroll: true } as Electron.MouseWheelInputEvent);
            }
            await new Promise((r) => setTimeout(r, 600));
            const after = await ui("document.querySelector('.hint-messages').scrollTop");
            const sizes = await ui("(() => { const m = document.querySelector('.hint-messages'); return m.scrollHeight + '/' + m.clientHeight; })()");
            console.log(`[smoke] scroll: before=${before} after=${after} scrollHeight/clientHeight=${sizes}`);
          }
          const image = await overlayWindow.webContents.capturePage();
          writeFileSync(process.env.WOLFIE_SMOKE_SHOT, image.toPNG());
        }
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
  unregisterIntelligence();
  unregisterSensing();
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
handle('nudge-pause', async () => guarded(() => setPaused(true)));
handle('nudge-resume', async () => guarded(() => setPaused(false)));
handle('nudge-status', async () => getNudgeQueue().getStatus());
handle('nudge-response', async (response) => guarded(() => getNudgeQueue().respond(response)));

// Manual hint entry point (SPEC 4d); the escalation engine (B2) listens on stuckBus
handle('mascot-click', async () => guarded(() => stuckBus.emit('help-requested', 'manual')));

handle('open-test-panel', async () => guarded(() => createTestWindow()));

// Grow upward while the chat is open; the bottom edge (and the mascot) stays where it is
handle('overlay-expand', async (expanded) =>
  guarded(() => {
    if (!overlayWindow) return;
    const b = overlayWindow.getBounds();
    const area = screen.getDisplayMatching(b).workArea;
    const height = expanded ? Math.min(OVERLAY_CHAT_HEIGHT, area.height - 16) : OVERLAY_HEIGHT;
    const bottom = b.y + b.height;
    overlayWindow.setBounds({ x: b.x, y: Math.max(area.y, bottom - height), width: b.width, height });
  })
);

// Export for other modules
export { overlayWindow, dashboardWindow, testWindow };
