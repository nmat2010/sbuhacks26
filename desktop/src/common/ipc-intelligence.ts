// Agent B's IPC channels. Merged into the maps in ipc.ts; only Agent B edits this file.
/* eslint-disable @typescript-eslint/no-empty-interface */

/** renderer -> main, request/response: 'channel': { args: [...]; result: ... } */
export interface IntelligenceInvoke {}

/** renderer -> main, fire-and-forget: 'channel': [...args] */
export interface IntelligenceSend {}

/** main -> renderer events: 'channel': payload */
export interface IntelligenceEvents {}
