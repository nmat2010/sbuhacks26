import { describe, expect, it } from 'vitest';
import { beginThinking, isThinking, thinkingEvents, whileThinking } from '../thinking.js';

describe('thinking', () => {
  it('overlapping waits: thinking until the last one ends; ending twice is harmless', async () => {
    const changes: boolean[] = [];
    const off = thinkingEvents.on('change', (on) => void changes.push(on));
    const endA = beginThinking();
    let release!: () => void;
    const b = whileThinking(new Promise<void>((r) => (release = r)));
    endA();
    endA();
    expect(isThinking()).toBe(true);
    release();
    await b;
    expect(isThinking()).toBe(false);
    expect(changes).toEqual([true, false]);
    off();
  });

  it('a failed wait still ends', async () => {
    await expect(whileThinking(Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(isThinking()).toBe(false);
  });
});
