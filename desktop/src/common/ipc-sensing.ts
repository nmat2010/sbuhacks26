// Agent A's IPC channels. Merged into the maps in ipc.ts; only Agent A edits this file.

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
}
