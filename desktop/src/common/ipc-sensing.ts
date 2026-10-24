// Agent A's IPC channels. Merged into the maps in ipc.ts; only Agent A edits this file.
/* eslint-disable @typescript-eslint/no-empty-interface */

/** renderer -> main, request/response: 'channel': { args: [...]; result: ... } */
export interface SensingInvoke {}

/** renderer -> main, fire-and-forget: 'channel': [...args] */
export interface SensingSend {}

/** main -> renderer events: 'channel': payload */
export interface SensingEvents {}
