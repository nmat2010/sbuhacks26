import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  EventChannel,
  EventChannels,
  InvokeChannel,
  InvokeChannels,
  SendChannels
} from '../src/common/ipc';

type Listener = (payload: never) => void;
type Wrapped = (event: IpcRendererEvent, payload: unknown) => void;

// on() wraps each callback, so keep the wrapper to let off() remove the same function.
const wrappers = new Map<Listener, Map<string, Wrapped>>();

const api = {
  ping: () => ipcRenderer.invoke('ping') as Promise<string>,

  setIgnoreMouseEvents: (...args: SendChannels['set-ignore-mouse-events']) =>
    ipcRenderer.send('set-ignore-mouse-events', ...args),

  invoke: <C extends InvokeChannel>(channel: C, ...args: InvokeChannels[C]['args']) =>
    ipcRenderer.invoke(channel, ...args) as Promise<InvokeChannels[C]['result']>,

  /** Returns an unsubscribe function; off() also works. */
  on: <C extends EventChannel>(channel: C, callback: (payload: EventChannels[C]) => void) => {
    const wrapped: Wrapped = (_event, payload) => callback(payload as EventChannels[C]);
    const byChannel = wrappers.get(callback as Listener) ?? new Map<string, Wrapped>();
    byChannel.set(channel, wrapped);
    wrappers.set(callback as Listener, byChannel);
    ipcRenderer.on(channel, wrapped);
    return () => api.off(channel, callback);
  },

  off: <C extends EventChannel>(channel: C, callback: (payload: EventChannels[C]) => void) => {
    const byChannel = wrappers.get(callback as Listener);
    const wrapped = byChannel?.get(channel);
    if (!wrapped) return;
    ipcRenderer.removeListener(channel, wrapped);
    byChannel!.delete(channel);
    if (byChannel!.size === 0) wrappers.delete(callback as Listener);
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('ipc', api); // Alias for convenience

export type ElectronAPI = typeof api;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    ipc: ElectronAPI; // Alias for convenience
  }
}
