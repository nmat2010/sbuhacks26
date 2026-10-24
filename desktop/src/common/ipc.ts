import type { MascotStateType, Nudge, NudgeInput, NudgeResponse } from '@wolfie/shared';

// Typed IPC contract between the main process and renderers (SPEC 3: "typed IPC only").
// Add channels here first; preload.ts and src/main/ipc.ts are typed from these maps.

export interface NudgeQueueStatus {
  paused: boolean;
  snoozed: boolean;
  snoozedUntil: number;
  queueLength: number;
  nudgesInLastHour: number;
  maxNudgesPerHour: number;
}

export interface Result {
  success: boolean;
  error?: string;
}

/** renderer -> main, request/response (ipcRenderer.invoke / ipcMain.handle) */
export interface InvokeChannels {
  ping: { args: []; result: string };
  'db-test': { args: []; result: unknown };
  'nudge-push': { args: [nudge: NudgeInput]; result: Result & { id?: string } };
  'nudge-snooze': { args: []; result: Result };
  'nudge-pause': { args: []; result: Result };
  'nudge-resume': { args: []; result: Result };
  'nudge-status': { args: []; result: NudgeQueueStatus };
  'nudge-response': { args: [response: NudgeResponse]; result: Result };
  /** Clicking Wolfie starts the hint flow (SPEC 4d). */
  'mascot-click': { args: []; result: Result };
}

/** renderer -> main, fire-and-forget (ipcRenderer.send / ipcMain.on) */
export interface SendChannels {
  'set-ignore-mouse-events': [ignore: boolean, options?: { forward: boolean }];
}

/** main -> renderer events (webContents.send / ipcRenderer.on) */
export interface EventChannels {
  'nudge-show': Nudge;
  /** Escalation levels 1-2 and pause (sleeping) are sprite states, not bubbles. */
  'overlay-state': MascotStateType;
  'session-control': 'start' | 'stop';
  'voice-toggle': boolean;
}

export type InvokeChannel = keyof InvokeChannels;
export type SendChannel = keyof SendChannels;
export type EventChannel = keyof EventChannels;
