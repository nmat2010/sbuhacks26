import type { PageSummary, StruggleSignal, BrightspaceCourse } from '@wolfie/shared';
import type { ExtensionPairingInfo } from '../../common/ipc-sensing.js';
import type { Monitor } from '../monitor/monitor.js';
import { TypedEmitter } from '../typed-emitter.js';
import { computeDeskState, type DeskState } from './desk-state.js';
import { DomainTracker } from './domain-tracker.js';
import { createExtensionBridge, type ExtensionBridge } from './extension-bridge.js';
import { ExtensionServer } from './extension-server.js';
import { ensureToken, generateToken } from './pairing.js';

// Composition of the extension side (A2) with no Electron imports: server + bridge + domain
// tracker, kept in sync with the session, the monitor and the settings. register.ts supplies the
// real singletons; tests supply fakes.

export interface ExtensionLinkDeps {
  /** Shared with the monitor, which reads the active tab domain from it. */
  tracker: DomainTracker;
  port: number;
  host?: string;
  monitor: Pick<Monitor, 'getLast' | 'poke' | 'events'>;
  getSession(): { id: string } | null;
  isPaused(): boolean;
  sessionEvents: { on(event: 'change' | 'pause', fn: () => void): () => void };
  settingsEvents: { on(event: 'change', fn: (key: string) => void): () => void };
  settings: {
    getToken(): string | null;
    setToken(token: string): void;
    getExtensionId(): string | null;
    setExtensionId(id: string | null): void;
    excludedDomains(): string[];
    capturePageText(): boolean;
  };
  setLatestPageSummary(summary: PageSummary | null): void;
  setPageSummaryRequester(fn: (() => Promise<PageSummary | null>) | null): void;
  emitProblemChanged(problemId: string | null): void;
  onSignal?(signal: StruggleSignal, domain: string): void;
  scheduleTabNone?(clear: () => void): void;
  helloTimeoutMs?: number;
  heartbeatMs?: number;
}

export interface ExtensionLink {
  tracker: DomainTracker;
  server: ExtensionServer;
  bridge: ExtensionBridge;
  events: TypedEmitter<{ connection: [connected: boolean] }>;
  port: number | null;
  getExtensionPairingInfo(): ExtensionPairingInfo;
  /** New token, and forget the trusted extension id (needed after reinstalling the extension). */
  regenerateToken(): ExtensionPairingInfo;
  /** Ask the extension to re-scrape Brightspace; false when it is not connected. */
  requestBrightspace(): boolean;
  /** Get all Brightspace courses cached from the extension. */
  getBrightspaceCourses(): BrightspaceCourse[];
  /** Get the current semester name from cached Brightspace data. */
  getBrightspaceSemester(): string | null;
  stop(): Promise<void>;
}

export async function startExtensionLink(deps: ExtensionLinkDeps): Promise<ExtensionLink> {
  const { settings, tracker } = deps;
  ensureToken({ get: settings.getToken, set: settings.setToken });

  const getDeskState = (): DeskState => {
    const session = deps.getSession();
    const last = deps.monitor.getLast();
    return computeDeskState({
      sessionActive: session !== null,
      browserFrontmost: !!session && !!last && last.sessionId === session.id && last.isBrowser,
      paused: deps.isPaused(),
      excludedDomains: settings.excludedDomains(),
      capturePageText: settings.capturePageText()
    });
  };

  const bridge = createExtensionBridge({
    tracker,
    getDeskState,
    setLatestPageSummary: deps.setLatestPageSummary,
    emitProblemChanged: deps.emitProblemChanged,
    onSignal: deps.onSignal,
    scheduleTabNone: deps.scheduleTabNone
  });

  const server = new ExtensionServer({
    host: deps.host,
    port: deps.port,
    getToken: settings.getToken,
    getExtensionId: settings.getExtensionId,
    setExtensionId: settings.setExtensionId,
    getDeskState,
    handlers: bridge.handlers,
    helloTimeoutMs: deps.helloTimeoutMs,
    heartbeatMs: deps.heartbeatMs
  });
  const port = await server.start();
  if (port === null) console.error(`[extension] could not listen on port ${deps.port}; extension features are off`);
  else console.log(`[extension] loopback server listening on 127.0.0.1:${port}`);

  let wasReporting = getDeskState().reporting;
  const refresh = () => {
    const reporting = getDeskState().reporting;
    if (wasReporting && !reporting) bridge.clearContext();
    wasReporting = reporting;
    server.pushState();
  };

  const offs = [
    deps.monitor.events.on('tick', refresh),
    deps.sessionEvents.on('change', () => {
      bridge.resetProblem();
      refresh();
    }),
    deps.sessionEvents.on('pause', refresh),
    deps.settingsEvents.on('change', (key) => {
      if (key === 'monitored.excluded_domains' || key === 'monitoring.capture_page_text') refresh();
    }),
    tracker.events.on('change', () => void deps.monitor.poke())
  ];
  deps.setPageSummaryRequester(() => server.requestSummary());

  const info = (): ExtensionPairingInfo => ({
    token: settings.getToken() ?? '',
    extensionId: settings.getExtensionId(),
    connected: server.isConnected(),
    port
  });

  return {
    tracker,
    server,
    bridge,
    events: server.events,
    port,
    getExtensionPairingInfo: info,
    regenerateToken() {
      settings.setToken(generateToken());
      settings.setExtensionId(null);
      // Existing sockets were authenticated with the old token: drop them.
      server.dropClients();
      return info();
    },
    requestBrightspace: () => server.requestBrightspace(),
    getBrightspaceCourses() {
      const data = bridge.getBrightspaceData();
      return data?.courses ?? [];
    },
    getBrightspaceSemester() {
      const data = bridge.getBrightspaceData();
      return data?.semester ?? null;
    },
    async stop() {
      offs.forEach((off) => off());
      deps.setPageSummaryRequester(null);
      deps.setLatestPageSummary(null);
      await server.stop();
    }
  };
}
