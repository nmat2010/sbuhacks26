// Agent A (Sensing & Data) wires its modules here: session manager, monitor, rules, extension and
// LAN servers, streak, history IPC. main.ts calls this once after the DB and NudgeQueue are ready.
// Only register files may import `electron` or `../ipc.js`; logic modules get them injected.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { powerMonitor, shell, systemPreferences } from 'electron';
import type { SessionInfo } from '../../common/ipc-sensing.js';
import { getDatabase } from '../db/index.js';
import { broadcast, handle } from '../ipc.js';
import { Monitor } from '../monitor/monitor.js';
import { getPermissionsStatus, requestPermission, type PermissionDeps } from '../monitor/permissions.js';
import { createOsascriptWindowSource } from '../monitor/window-source.js';
import {
  closeOrphanedSessions,
  getActiveSession,
  isMicAllowed,
  isPaused,
  sessionEvents,
  setAssessmentMode,
  startSession,
  stopSession
} from '../session/index.js';
import { getSetting, setSetting, settingsEvents } from '../settings.js';
import { stuckBus } from '../stuck/bus.js';
import { DomainTracker } from '../sync/domain-tracker.js';
import { startExtensionLink, type ExtensionLink } from '../sync/extension-link.js';
import { setLatestPageSummary, setPageSummaryRequester } from '../sync/context.js';
import { EXTENSION_WS_PORT } from '@wolfie/shared';

const execFileAsync = promisify(execFile);

let stops: Array<() => void> = [];
let monitor: Monitor | null = null;
let extensionLink: ExtensionLink | null = null;
const domainTracker = new DomainTracker();

function sessionInfo(): SessionInfo {
  const s = getActiveSession();
  return {
    active: s ? { id: s.id, startedAt: s.startedAt, assessmentMode: s.assessmentMode, goalId: s.goalId } : null,
    paused: isPaused()
  };
}

function offlinePairing() {
  return { token: getSetting('pairing.extension_token') ?? '', extensionId: getSetting('pairing.extension_id'), connected: false, port: null };
}

/** One module failing to start must not take the app down: log and carry on. */
function guarded(name: string, start: () => void | (() => void)): void {
  try {
    const stop = start();
    if (stop) stops.push(stop);
  } catch (error) {
    console.error(`[sensing] ${name} failed to start:`, error instanceof Error ? error.message : error);
  }
}

export function registerSensing(): void {
  // ---- A1: sessions, monitor, permissions -------------------------------------------------
  guarded('sessions', () => {
    const closed = closeOrphanedSessions();
    if (closed) console.log(`[sensing] closed ${closed} session(s) left open by a previous run`);

    handle('session-start', async (opts) => {
      startSession(opts ?? {});
      return sessionInfo();
    });
    handle('session-stop', async () => {
      stopSession();
      return sessionInfo();
    });
    handle('session-get', async () => sessionInfo());
    handle('session-set-assessment', async (value) => {
      setAssessmentMode(value);
      return sessionInfo();
    });

    // Tell every window, and the mic flag (SPEC 7: pause mutes the mic)
    let lastMic: boolean | null = null;
    const publish = () => {
      broadcast('session-changed', sessionInfo());
      const mic = isMicAllowed();
      if (mic !== lastMic) {
        lastMic = mic;
        broadcast('mic-allowed', mic);
      }
    };
    const offs = [
      sessionEvents.on('change', publish),
      sessionEvents.on('pause', publish),
      settingsEvents.on('change', (key) => {
        if (key === 'voice.enabled') publish();
      })
    ];
    return () => offs.forEach((off) => off());
  });

  guarded('monitor', () => {
    monitor = new Monitor({
      source: createOsascriptWindowSource((file, args, opts) => execFileAsync(file, args, opts)),
      db: getDatabase,
      now: Date.now,
      getSession: getActiveSession,
      isPaused,
      getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
      getDomain: () => domainTracker.getDomain(),
      settings: {
        captureTitles: () => getSetting('monitoring.capture_window_titles'),
        idleTimeoutSeconds: () => getSetting('session.idle_timeout_seconds'),
        autoStartApp: () => getSetting('session.auto_start_app')
      },
      startSession: () => void startSession()
    });
    const m = monitor;
    m.start(2000);
    const off = sessionEvents.on('change', (s) => {
      if (s) void m.poke();
    });
    return () => {
      off();
      m.stop();
    };
  });

  // ---- A2: extension loopback server --------------------------------------------------------
  guarded('extension-link', () => {
    if (!monitor) throw new Error('monitor not running');
    const m = monitor;
    handle('extension-pairing-get', async () => extensionLink?.getExtensionPairingInfo() ?? offlinePairing());
    handle('extension-pairing-regenerate', async () => extensionLink?.regenerateToken() ?? offlinePairing());
    void startExtensionLink({
      tracker: domainTracker,
      port: EXTENSION_WS_PORT,
      monitor: m,
      getSession: getActiveSession,
      isPaused,
      sessionEvents,
      settingsEvents,
      settings: {
        getToken: () => getSetting('pairing.extension_token'),
        setToken: (t) => setSetting('pairing.extension_token', t),
        getExtensionId: () => getSetting('pairing.extension_id'),
        setExtensionId: (id) => setSetting('pairing.extension_id', id),
        excludedDomains: () => getSetting('monitored.excluded_domains'),
        capturePageText: () => getSetting('monitoring.capture_page_text')
      },
      setLatestPageSummary,
      setPageSummaryRequester,
      emitProblemChanged: (id) => stuckBus.emit('problem-changed', id)
    })
      .then((link) => {
        extensionLink = link;
        link.events.on('connection', (connected) => broadcast('extension-status', { connected }));
      })
      .catch((error) => console.error('[sensing] extension link failed:', error instanceof Error ? error.message : error));
    return () => {
      void extensionLink?.stop();
      extensionLink = null;
    };
  });

  guarded('permissions', () => {
    const deps: PermissionDeps = {
      platform: process.platform,
      getMediaAccessStatus: (kind) => systemPreferences.getMediaAccessStatus(kind),
      isTrustedAccessibilityClient: (prompt) => systemPreferences.isTrustedAccessibilityClient(prompt),
      askForMediaAccess: (kind) => systemPreferences.askForMediaAccess(kind),
      openExternal: (url) => shell.openExternal(url),
      getAutomationState: () => monitor?.getAutomationState() ?? 'unknown'
    };
    handle('permissions-get', async () => getPermissionsStatus(deps));
    handle('permissions-request', async (kind) => requestPermission(kind, deps));
  });
}

/** Called on quit: close servers, stop pollers. */
export function unregisterSensing(): void {
  for (const stop of stops.reverse()) {
    try {
      stop();
    } catch (error) {
      console.error('[sensing] shutdown error:', error instanceof Error ? error.message : error);
    }
  }
  stops = [];
  monitor = null;
}
