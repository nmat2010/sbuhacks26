// Agent A's IPC channels. Merged into the maps in ipc.ts; only Agent A edits this file.
import type { SettingsValues, StreakSnapshotType } from '@wolfie/shared';

export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
export type PermissionKind = 'screen' | 'accessibility' | 'automation' | 'microphone';

/** macOS permission status (SPEC Phase 2). Denied permissions are a status, never a crash. */
export interface PermissionsStatus {
  platform: string;
  screen: PermissionState;
  accessibility: PermissionState;
  /** Can only be learned by trying: 'unknown' until the first window poll. */
  automation: PermissionState;
  microphone: PermissionState;
}

export interface SessionInfo {
  active: { id: string; startedAt: number; assessmentMode: boolean; goalId?: string } | null;
  paused: boolean;
}

/** Chrome extension pairing (A2): the token is shown in Wolfie's settings, typed once into the popup. */
export interface ExtensionPairingInfo {
  token: string;
  /** Trusted extension id (trust on first use), or null before the first pairing. */
  extensionId: string | null;
  connected: boolean;
  /** Bound loopback port, or null if the port was busy and the link is off. */
  port: number | null;
}

/** LAN sync with the web app (A8): what the pairing screen / QR code needs. */
export interface SyncDeviceInfo {
  deviceId: string;
  name: string;
  pairedAt: number;
  connected: boolean;
}

export interface SyncInfo {
  /** False if the LAN port was busy (the app keeps running without sync). */
  listening: boolean;
  port: number | null;
  /** LAN IPv4 addresses of this computer, best first. */
  addresses: string[];
  /** Six digits the web app types to pair. */
  code: string;
  codeExpiresAt: number;
  devices: SyncDeviceInfo[];
}

/** Settings the renderer may read and write. Pairing secrets have their own channels. */
/** Pairing secrets have their own screen; Watch mode on/off and consent go only through watch-set / watch-consent. */
export type PublicSettingKey = Exclude<keyof SettingsValues, `pairing.${string}` | 'watch.enabled' | 'watch.consented_at'>;
export type PublicSettings = { [K in PublicSettingKey]: SettingsValues[K] };

export interface SettingsSetResult {
  success: boolean;
  /** Why it was rejected (unknown key, wrong shape, out of range). */
  error?: string;
  /** The stored value, after normalization (e.g. lower-cased domains). */
  value?: unknown;
}

/** Health summary for the settings screen. Keys are reported as booleans only, never their values. */
export interface AppStatus {
  extensionConnected: boolean;
  /** False if the loopback port was busy. */
  extensionListening: boolean;
  syncListening: boolean;
  pairedDevices: number;
  geminiKeyPresent: boolean;
  elevenLabsKeyPresent: boolean;
  demoMode: boolean;
  sessionActive: boolean;
  paused: boolean;
}

export interface CategorySeconds {
  work: number;
  ai_tool: number;
  distraction: number;
  idle: number;
}

export interface HistorySession {
  id: string;
  device: 'desktop' | 'webapp';
  startedAt: number;
  endedAt: number | null;
  label: string | null;
  assessmentMode: boolean;
  /** Time per category in seconds. Paused time is not counted. */
  seconds: CategorySeconds;
  nudgeCount: number;
  hintCount: number;
  /** Highest hint ladder level shown (1-5), 0 if none. */
  deepestHintLevel: number;
  /** Highest escalation level reached (0-4), from `stuck.level` events. */
  deepestEscalationLevel: number;
}

export interface HistoryData {
  /** Newest first. */
  sessions: HistorySession[];
  totals: { seconds: CategorySeconds; nudgeCount: number; hintCount: number };
}

export interface DataExportResult {
  success: boolean;
  /** Where the JSON file was written. */
  path?: string;
  canceled?: boolean;
  error?: string;
}

export interface DataClearResult {
  success: boolean;
  error?: string;
  tablesCleared?: number;
}

/** renderer -> main, request/response: 'channel': { args: [...]; result: ... } */
export interface SensingInvoke {
  'session-start': { args: [opts?: { assessmentMode?: boolean; goalId?: string }]; result: SessionInfo };
  'session-stop': { args: []; result: SessionInfo };
  'session-get': { args: []; result: SessionInfo };
  /** "This is graded work" toggle for the running session. */
  'session-set-assessment': { args: [assessmentMode: boolean]; result: SessionInfo };
  'permissions-get': { args: []; result: PermissionsStatus };
  /** Microphone/Accessibility prompt; Screen Recording and Automation open System Settings. */
  'permissions-request': { args: [kind: PermissionKind]; result: PermissionsStatus };
  'extension-pairing-get': { args: []; result: ExtensionPairingInfo };
  /** New token; also forgets the trusted extension id and disconnects the extension. */
  'extension-pairing-regenerate': { args: []; result: ExtensionPairingInfo };
  'sync-info-get': { args: []; result: SyncInfo };
  'sync-regenerate-code': { args: []; result: SyncInfo };
  /** Deletes the device's secret and cuts it off. */
  'sync-unpair': { args: [deviceId: string]; result: SyncInfo };
  /** Current streak, longest, freezes, today's minutes and the 7-day calendar (same shape as streak.snapshot). */
  'streak-get': { args: []; result: StreakSnapshotType };
  'history-get': { args: [opts?: { limit?: number; sinceTs?: number }]; result: HistoryData };
  'settings-get': { args: []; result: PublicSettings };
  'settings-set': { args: [key: PublicSettingKey, value: unknown]; result: SettingsSetResult };
  'status-get': { args: []; result: AppStatus };
  /** Asks where to save, then writes every table as JSON (pairing secrets left out). */
  'data-export': { args: []; result: DataExportResult };
  /** Deletes all data and re-seeds the streak row. The UI should confirm first. */
  'data-clear': { args: [opts?: { keepSettings?: boolean }]; result: DataClearResult };
}

/** renderer -> main, fire-and-forget: 'channel': [...args] */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SensingSend {}

/** main -> renderer events: 'channel': payload */
export interface SensingEvents {
  'session-changed': SessionInfo;
  /** The mic may be live only during an active, unpaused session with voice mode on. */
  'mic-allowed': boolean;
  'extension-status': { connected: boolean };
  /** Paired devices or the pairing code changed. */
  'sync-changed': SyncInfo;
  /** The streak changed (a session grew today's minutes, a day qualified, a late sync repaired the past). */
  'streak-changed': StreakSnapshotType;
  /** A setting changed (from settings-set or elsewhere). */
  'settings-changed': { key: PublicSettingKey; value: unknown };
  /** All data was cleared: screens should reload. */
  'data-cleared': Record<string, never>;
}
