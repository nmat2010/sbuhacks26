import { ipcMain, type WebContents } from 'electron';
import type {
  EventChannel,
  EventChannels,
  InvokeChannel,
  InvokeChannels,
  SendChannel,
  SendChannels
} from '../common/ipc.js';

export function handle<C extends InvokeChannel>(
  channel: C,
  fn: (...args: InvokeChannels[C]['args']) => InvokeChannels[C]['result'] | Promise<InvokeChannels[C]['result']>
): void {
  ipcMain.handle(channel, (_event, ...args) => fn(...(args as InvokeChannels[C]['args'])));
}

export function onSend<C extends SendChannel>(
  channel: C,
  fn: (sender: WebContents, ...args: SendChannels[C]) => void
): void {
  ipcMain.on(channel, (event, ...args) => fn(event.sender, ...(args as SendChannels[C])));
}

export function sendTo<C extends EventChannel>(
  target: WebContents | null | undefined,
  channel: C,
  payload: EventChannels[C]
): void {
  if (target && !target.isDestroyed()) target.send(channel, payload);
}
