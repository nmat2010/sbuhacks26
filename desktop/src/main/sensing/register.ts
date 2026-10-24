// Agent A (Sensing & Data) wires its modules here: session manager, monitor, rules, extension and
// LAN servers, streak, history IPC. main.ts calls this once after the DB and NudgeQueue are ready.
// Only register files may import `electron` or `../ipc.js`; logic modules get them injected.

import { execFile } from 'child_process';
import { networkInterfaces } from 'os';
import { promisify } from 'util';
import { unlinkSync, writeFileSync } from 'fs';
import { BrowserWindow, dialog, powerMonitor, shell, systemPreferences } from 'electron';
import type { SessionInfo } from '../../common/ipc-sensing.js';
import { DATA_TABLES, getDatabase } from '../db/index.js';
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
import { getNudgeQueue } from '../nudge/index.js';
import { RulesEngine } from '../rules/engine.js';
import { matchForeground } from '../rules/matcher.js';
import { DesktopSignalDetector } from '../stuck/signals/desktop-signals.js';
import { InputPoller } from '../stuck/signals/input-poller.js';
import { SignalSink } from '../stuck/signals/sink.js';
import { logEvent } from '../events.js';
import { getSetting, setSetting, settingsEvents } from '../settings.js';
import { stuckBus } from '../stuck/bus.js';
import { DomainTracker } from '../sync/domain-tracker.js';
import { startExtensionLink, type ExtensionLink } from '../sync/extension-link.js';
import { setLatestPageSummary, setPageSummaryRequester } from '../sync/context.js';
import { EXTENSION_WS_PORT, SYNC_WS_PORT } from '@wolfie/shared';
import { requestFollowup, requestHints } from '../hints/index.js';
import { StreakEngine } from '../streak/engine.js';
import { buildExport, clearAllData } from '../history/data-controls.js';
import { getHistory } from '../history/queries.js';
import { isPublicSettingKey, keyPresent, readPublicSettings, writePublicSetting } from '../history/settings-api.js';
import { startLanLink, type LanLink } from '../sync/lan-link.js';
import { getPlanSnapshotForSync, getStreakSnapshotForSync, notifySnapshotsChanged, setStreakSnapshotProvider } from '../sync/snapshots.js';
import type { SyncInfo } from '../../common/ipc-sensing.js';

const execFileAsync = promisify(execFile);

let stops: Array<() => void> = [];
let monitor: Monitor | null = null;
let extensionLink: ExtensionLink | null = null;
let signalSink: SignalSink | null = null;
let lanLink: LanLink | null = null;
let streakEngine: StreakEngine | null = null;
const domainTracker = new DomainTracker();

function sessionInfo(): SessionInfo {
  const s = getActiveSession();
  return {
    active: s ? { id: s.id, startedAt: s.startedAt, assessmentMode: s.assessmentMode, goalId: s.goalId } : null,
    paused: isPaused()
  };
}

function offlineSync(): SyncInfo {
  return { listening: false, port: null, addresses: [], code: '', codeExpiresAt: 0, devices: [] };
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
      startSession: () => void startSession(),
      // macOS reports the Electron main process as the frontmost app for any Wolfie window
      isSelf: (info) => info.pid === process.pid
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

  // ---- A4: AI-tool and distraction warnings -------------------------------------------------
  guarded('rules', () => {
    if (!monitor) throw new Error('monitor not running');
    const engine = new RulesEngine({
      monitorEvents: monitor.events,
      sessionEvents,
      nudgeEvents: getNudgeQueue(),
      getSession: getActiveSession,
      isPaused,
      getLists: () => ({ aiTools: getSetting('monitored.ai_tools'), distractions: getSetting('monitored.distractions') }),
      getCooldownMinutes: () => getSetting('monitored.rule_cooldown_minutes'),
      push: (nudge) => getNudgeQueue().push(nudge),
      logEvent: (type, payload) => logEvent(type, payload),
      now: Date.now,
      random: Math.random
    });
    engine.start();
    return () => engine.stop();
  });

  // ---- A6: desktop signals, extension signal forwarding, input events --------------------------
  guarded('signals', () => {
    if (!monitor) throw new Error('monitor not running');
    const m = monitor;
    const sink = new SignalSink({
      db: getDatabase,
      getSession: getActiveSession,
      isPaused,
      emit: (signal) => stuckBus.emit('signal', signal),
      logEvent: (type, payload) => logEvent(type, payload),
      now: Date.now
    });
    signalSink = sink;
    const detector = new DesktopSignalDetector({
      now: Date.now,
      emit: (signal) => void sink.accept(signal, 'desktop'),
      getConfig: () => {
        const t = getSetting('stuck.thresholds');
        return {
          contextSwitchCount: t.contextSwitchCount,
          contextSwitchWindowSec: t.contextSwitchWindowSec,
          idleMinutes: getSetting('stuck.idle_minutes'),
          longProblemMinutes: getSetting('stuck.long_problem_minutes')
        };
      },
      classify: (snap) =>
        matchForeground(snap, { aiTools: getSetting('monitored.ai_tools'), distractions: getSetting('monitored.distractions') })
          ? 'other'
          : 'work'
    });
    const poller = new InputPoller({
      getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
      isActive: () => getActiveSession() !== null && !isPaused(),
      now: Date.now,
      emit: (at) => stuckBus.emit('input', at)
    });
    poller.start(1000);
    const offs = [
      m.events.on('foreground', (snap) => detector.handleForeground(snap)),
      m.events.on('tick', (snap) => detector.handleTick(snap)),
      sessionEvents.on('change', () => detector.reset()),
      stuckBus.on('problem-changed', (id) => detector.handleProblem(id, m.getLast()))
    ];
    return () => {
      poller.stop();
      offs.forEach((off) => off());
      signalSink = null;
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
      emitProblemChanged: (id) => stuckBus.emit('problem-changed', id),
      onSignal: (signal) => void signalSink?.accept({ ...signal, timestamp: Date.now() }, 'extension')
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

  // ---- A9: streak engine ----------------------------------------------------------------------
  guarded('streak', () => {
    const engine = new StreakEngine({
      db: getDatabase,
      now: Date.now,
      getTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      qualifyingMinutes: () => getSetting('streak.qualifying_minutes'),
      reminderEnabled: () => getSetting('streak.reminder_enabled'),
      reminderTime: () => getSetting('streak.reminder_time'),
      getLists: () => ({ aiTools: getSetting('monitored.ai_tools'), distractions: getSetting('monitored.distractions') }),
      push: (nudge) => getNudgeQueue().push(nudge),
      logEvent: (type, payload, opts) => logEvent(type, payload, opts),
      onChange: (snapshot) => {
        broadcast('streak-changed', snapshot);
        notifySnapshotsChanged('streak');
      }
    });
    streakEngine = engine;
    setStreakSnapshotProvider(() => engine.getStreak());
    handle('streak-get', async () => engine.getStreak());
    const run = () => {
      try {
        engine.tick();
      } catch (error) {
        console.error('[streak] tick failed:', error instanceof Error ? error.message : error);
      }
    };
    run();
    // A running session grows today's minutes, so check every 30 s; also when a session starts or ends.
    const timer = setInterval(run, 30_000);
    const offs = [sessionEvents.on('change', run), settingsEvents.on('change', (key) => key.startsWith('streak.') && run())];
    return () => {
      clearInterval(timer);
      offs.forEach((off) => off());
      streakEngine = null;
    };
  });

  // ---- A8: LAN sync server for the web app --------------------------------------------------
  guarded('lan-sync', () => {
    handle('sync-info-get', async () => lanLink?.getInfo() ?? offlineSync());
    handle('sync-regenerate-code', async () => lanLink?.regenerateCode() ?? offlineSync());
    handle('sync-unpair', async (deviceId) => lanLink?.unpair(deviceId) ?? offlineSync());
    void startLanLink({
      port: SYNC_WS_PORT,
      db: getDatabase,
      now: Date.now,
      getDevices: () => getSetting('pairing.webapp_devices'),
      setDevices: (devices) => setSetting('pairing.webapp_devices', devices),
      hints: { requestHints, requestFollowup },
      getPlanSnapshot: getPlanSnapshotForSync,
      getStreakSnapshot: getStreakSnapshotForSync,
      logEvent: (type, payload, opts) => logEvent(type, payload, opts),
      networkInterfaces,
      // A web session finished (possibly synced late): recompute the streak for the days it touches
      onSessionEnded: () => void streakEngine?.recalculate()
    })
      .then((link) => {
        lanLink = link;
        link.events.on('changed', (info) => broadcast('sync-changed', info));
      })
      .catch((error) => console.error('[sensing] LAN sync failed:', error instanceof Error ? error.message : error));
    return () => {
      void lanLink?.stop();
      lanLink = null;
    };
  });

  // ---- A10: history, settings, status, data controls ----------------------------------------
  guarded('data', () => {
    const lists = () => ({ aiTools: getSetting('monitored.ai_tools'), distractions: getSetting('monitored.distractions') });

    handle('history-get', async (opts) =>
      getHistory(getDatabase(), { now: Date.now(), lists: lists(), limit: opts?.limit, sinceTs: opts?.sinceTs })
    );
    handle('settings-get', async () => readPublicSettings(getSetting));
    handle('settings-set', async (key, value) => writePublicSetting(key, value, setSetting));
    handle('status-get', async () => ({
      extensionConnected: extensionLink?.server.isConnected() ?? false,
      extensionListening: extensionLink?.port != null,
      syncListening: lanLink?.getInfo().listening ?? false,
      pairedDevices: getSetting('pairing.webapp_devices').length,
      geminiKeyPresent: keyPresent(process.env.GEMINI_API_KEY),
      elevenLabsKeyPresent: keyPresent(process.env.ELEVENLABS_API_KEY),
      demoMode: process.env.DEMO_MODE === '1' || getSetting('demo.mode'),
      sessionActive: getActiveSession() !== null,
      paused: isPaused()
    }));

    handle('data-export', async () => {
      try {
        const win = BrowserWindow.getFocusedWindow();
        const options = {
          title: 'Export Wolfie data',
          defaultPath: `wolfie-export-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        };
        const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
        if (choice.canceled || !choice.filePath) return { success: false, canceled: true };
        writeFileSync(choice.filePath, JSON.stringify(buildExport(getDatabase(), DATA_TABLES, Date.now()), null, 2), 'utf8');
        return { success: true, path: choice.filePath };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    handle('data-clear', async (opts) => {
      try {
        stopSession(); // end the running session cleanly before its rows go
        const result = clearAllData(getDatabase(), DATA_TABLES, { keepSettings: opts?.keepSettings, deleteFile: unlinkSync });
        if (!opts?.keepSettings) extensionLink?.regenerateToken(); // settings are gone, so make a fresh pairing token
        streakEngine?.recalculate();
        broadcast('session-changed', sessionInfo());
        broadcast('data-cleared', {});
        return { success: true, tablesCleared: result.tablesCleared.length };
      } catch (error) {
        console.error('[sensing] clear all data failed:', error instanceof Error ? error.message : error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Tell every window about setting changes; apply the NudgeQueue limits live
    return settingsEvents.on('change', (key, value) => {
      if (isPublicSettingKey(key)) broadcast('settings-changed', { key, value });
      if (key === 'nudge.max_per_hour' || key === 'nudge.cooldown_minutes') {
        try {
          getNudgeQueue().updateConfig({
            maxNudgesPerHour: getSetting('nudge.max_per_hour'),
            cooldownMinutes: getSetting('nudge.cooldown_minutes')
          });
        } catch {
          // queue not ready yet
        }
      }
    });
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
