import { TypedEmitter } from '../typed-emitter.js';

// Wolfie is working on a reply the student asked for (a question, help, a hint step): the overlay
// shows the thinking sprite meanwhile. Background looks (Watch mode) don't count. Several waits
// can overlap; Wolfie stops thinking when the last one ends.

const active = new Set<symbol>();

export const thinkingEvents = new TypedEmitter<{ change: [thinking: boolean] }>();

/** Starts a wait; call the returned function when the reply is in (calling it twice is harmless). */
export function beginThinking(): () => void {
  const token = Symbol('thinking');
  active.add(token);
  if (active.size === 1) thinkingEvents.emit('change', true);
  return () => {
    if (active.delete(token) && active.size === 0) thinkingEvents.emit('change', false);
  };
}

/** Thinking until `work` settles. */
export async function whileThinking<T>(work: Promise<T>): Promise<T> {
  const end = beginThinking();
  try {
    return await work;
  } finally {
    end();
  }
}

export function isThinking(): boolean {
  return active.size > 0;
}
