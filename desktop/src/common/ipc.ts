import type { MascotStateType, Nudge, NudgeInput, NudgeResponse } from '@wolfie/shared';
import type { SensingEvents, SensingInvoke, SensingSend } from './ipc-sensing.js';
import type { IntelligenceEvents, IntelligenceInvoke, IntelligenceSend } from './ipc-intelligence.js';

// Typed IPC contract between the main process and renderers (SPEC 3: "typed IPC only").
// Core channels live here; Agent A adds to ipc-sensing.ts and Agent B to ipc-intelligence.ts.
// preload.ts and src/main/ipc.ts are typed from the combined maps.

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
export interface CoreInvoke {
  ping: { args: []; result: string };
  'db-test': { args: []; result: unknown };
  'nudge-push': { args: [nudge: NudgeInput]; result: Result & { id?: string } };
  'nudge-snooze': { args: []; result: Result };
  'nudge-pause': { args: []; result: Result };
  'nudge-resume': { args: []; result: Result };
  'nudge-status': { args: []; result: NudgeQueueStatus };
  'nudge-response': { args: [response: NudgeResponse]; result: Result };
  /** The overlay chat opened/closed: the overlay window grows taller (same width) while it is open. */
  'overlay-expand': { args: [expanded: boolean]; result: Result };
  /** Dragging Wolfie: 'start' on mouse down (the window follows the cursor), 'end' on mouse up. */
  'overlay-drag': { args: [phase: 'start' | 'end']; result: Result };
  /** Hover menu "Test panel" (dev). */
  'open-test-panel': { args: []; result: Result };
  /** Clicking Wolfie starts the hint flow (SPEC 4d). */
  'mascot-click': { args: []; result: Result };
  /** Open URL in default external browser (not Electron window). */
  'open-external': { args: [url: string]; result: Result };
}

/** renderer -> main, fire-and-forget (ipcRenderer.send / ipcMain.on) */
export interface CoreSend {
  'set-ignore-mouse-events': [ignore: boolean, options?: { forward: boolean }];
}

/** main -> renderer events (webContents.send / ipcRenderer.on) */
export interface CoreEvents {
  'nudge-show': Nudge;
  /** Escalation levels 1-2 and pause (sleeping) are sprite states, not bubbles. */
  'overlay-state': MascotStateType;
  'session-control': 'start' | 'stop';
  'voice-toggle': boolean;
}

export interface InvokeChannels extends CoreInvoke, SensingInvoke, IntelligenceInvoke {}
export interface SendChannels extends CoreSend, SensingSend, IntelligenceSend {}
export interface EventChannels extends CoreEvents, SensingEvents, IntelligenceEvents {}

export type InvokeChannel = keyof InvokeChannels;
export type SendChannel = keyof SendChannels;
export type EventChannel = keyof EventChannels;
