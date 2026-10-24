import { EventEmitter } from 'events';

/** EventEmitter with a typed event map, e.g. TypedEmitter<{ signal: [StruggleSignal] }>. */
export class TypedEmitter<T extends Record<string, unknown[]>> {
  private emitter = new EventEmitter();

  on<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): () => void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return () => this.off(event, listener);
  }

  off<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof T & string>(event: K, ...args: T[K]): void {
    this.emitter.emit(event, ...args);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
