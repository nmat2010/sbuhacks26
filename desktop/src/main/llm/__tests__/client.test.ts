import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LLMClient, selectProvider } from '../client.js';
import { localDay, MemoryUsageStore, SqliteUsageStore } from '../usage.js';
import { LLMError, type LLMProvider, type LlmRequest } from '../provider.js';
import { MockLLMProvider } from '../mock-provider.js';
import { GeminiProvider } from '../gemini-provider.js';
import { openDatabase } from '../../db/index.js';

const Answer = z.object({ answer: z.string().min(1) });

/** Fake provider whose replies are scripted: each entry is a value to return or an error to throw. */
function scripted(script: Array<unknown | Error | (() => Promise<unknown>)>, countsTowardCap = true) {
  const requests: LlmRequest[] = [];
  const provider: LLMProvider = {
    name: 'fake',
    countsTowardCap,
    async generateJson(req) {
      requests.push(req);
      const step = script[Math.min(requests.length - 1, script.length - 1)];
      if (step instanceof Error) throw step;
      if (typeof step === 'function') return (step as () => Promise<unknown>)();
      return step;
    }
  };
  return { provider, requests };
}

function makeClient(provider: LLMProvider, extra: Partial<ConstructorParameters<typeof LLMClient>[0]> = {}) {
  const logs: string[] = [];
  const client = new LLMClient({
    provider,
    timeoutMs: 50,
    retryDelayMs: 1,
    log: (l) => logs.push(l),
    ...extra
  });
  return { client, logs };
}

const call = {
  task: 'generic' as const,
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'hello page text secret-window-title' }],
  schema: Answer
};

describe('LLMClient', () => {
  it('returns validated output and sends a JSON schema', async () => {
    const { provider, requests } = scripted([{ answer: 'ok' }]);
    const { client } = makeClient(provider);
    expect(await client.generate(call)).toEqual({ answer: 'ok' });
    expect(requests[0].jsonSchema).toMatchObject({ type: 'object', required: ['answer'] });
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('times out a hung provider, aborts it, and retries once', async () => {
    let aborted = false;
    const hang = () =>
      new Promise<unknown>(() => {
        /* never resolves */
      });
    const { provider, requests } = scripted([hang, { answer: 'second try' }]);
    const original = provider.generateJson.bind(provider);
    provider.generateJson = (req) => {
      req.signal?.addEventListener('abort', () => (aborted = true));
      return original(req);
    };
    const { client } = makeClient(provider);
    expect(await client.generate(call)).toEqual({ answer: 'second try' });
    expect(requests).toHaveLength(2);
    expect(aborted).toBe(true);
  });

  it('gives up after one transport retry', async () => {
    const { provider, requests } = scripted([new LLMError('boom', 'NETWORK', 'fake', true)]);
    const { client } = makeClient(provider);
    await expect(client.generate(call)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(requests).toHaveLength(2);
  });

  it('does not retry non-retryable errors', async () => {
    const { provider, requests } = scripted([new LLMError('nope', 'AUTH', 'fake', false)]);
    const { client } = makeClient(provider);
    await expect(client.generate(call)).rejects.toMatchObject({ code: 'AUTH' });
    expect(requests).toHaveLength(1);
  });

  it('maps SDK-style status errors: 429 retries, 403 does not', async () => {
    const e429 = Object.assign(new Error('quota'), { status: 429 });
    const a = scripted([e429, { answer: 'ok' }]);
    expect(await makeClient(a.provider).client.generate(call)).toEqual({ answer: 'ok' });
    expect(a.requests).toHaveLength(2);

    const e403 = Object.assign(new Error('forbidden'), { status: 403 });
    const b = scripted([e403]);
    await expect(makeClient(b.provider).client.generate(call)).rejects.toMatchObject({ code: 'AUTH' });
    expect(b.requests).toHaveLength(1);
  });

  it('retries once on schema failure, telling the model what was wrong', async () => {
    const { provider, requests } = scripted([{ nope: 1 }, { answer: 'fixed' }]);
    const { client } = makeClient(provider);
    expect(await client.generate(call)).toEqual({ answer: 'fixed' });
    expect(requests).toHaveLength(2);
    const retryMessages = requests[1].messages;
    expect(retryMessages[retryMessages.length - 1].content).toMatch(/not valid/);
    expect(retryMessages[retryMessages.length - 1].content).toMatch(/answer/);
  });

  it('treats unparseable JSON as a schema failure and then throws SCHEMA', async () => {
    const bad = new LLMError('x', 'INVALID_JSON', 'fake');
    const { provider, requests } = scripted([bad]);
    const { client } = makeClient(provider);
    await expect(client.generate(call)).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(requests).toHaveLength(2);
  });

  it('enforces the per-day cap, per local day, and ignores the mock', async () => {
    let now = new Date(2026, 9, 24, 10).getTime();
    const usage = new MemoryUsageStore();
    const { provider, requests } = scripted([{ answer: 'ok' }]);
    const { client } = makeClient(provider, { dailyCap: () => 2, usage, now: () => now });
    await client.generate(call);
    await client.generate(call);
    await expect(client.generate(call)).rejects.toMatchObject({ code: 'DAILY_CAP' });
    expect(requests).toHaveLength(2);

    now = new Date(2026, 9, 25, 9).getTime();
    await expect(client.generate(call)).resolves.toEqual({ answer: 'ok' });

    const mock = scripted([{ answer: 'ok' }], false);
    const capped = makeClient(mock.provider, { dailyCap: () => 0 }).client;
    await expect(capped.generate(call)).resolves.toEqual({ answer: 'ok' });
  });

  it('counts retries against the cap', async () => {
    const usage = new MemoryUsageStore();
    const { provider } = scripted([new LLMError('x', 'NETWORK', 'fake', true), { answer: 'ok' }]);
    const { client } = makeClient(provider, { usage, now: () => 1_000_000, dailyCap: () => 100 });
    await client.generate(call);
    expect(usage.get(localDay(1_000_000))).toBe(2);
  });

  it('logs metadata only: no prompt text, URLs or keys', async () => {
    const leaky = new Error('failed https://claude.ai/chat/abc?key=AIzaSyA1234567890abcdefghijklmnop for key=AIzaSyA1234567890abcdefghijklmnop');
    const { provider } = scripted([leaky, leaky]);
    const { client, logs } = makeClient(provider);
    await expect(client.generate(call)).rejects.toBeTruthy();
    const all = logs.join('\n');
    expect(all).toContain('task=generic');
    expect(all).not.toContain('secret-window-title');
    expect(all).not.toContain('claude.ai');
    expect(all).not.toContain('AIzaSy');
  });

  it('persists the cap in SQLite', () => {
    const db = openDatabase(':memory:');
    const store = new SqliteUsageStore(() => db);
    expect(store.get('2026-10-24')).toBe(0);
    store.increment('2026-10-24');
    expect(store.increment('2026-10-24')).toBe(2);
    expect(store.get('2026-10-25')).toBe(0);
    db.close();
  });
});

describe('selectProvider', () => {
  it('DEMO_MODE=1 forces the mock even with a key', () => {
    expect(selectProvider({ DEMO_MODE: '1', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' })).toBeInstanceOf(MockLLMProvider);
  });
  it('uses Gemini with a key, and the mock without one', () => {
    expect(selectProvider({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.6-flash' })).toBeInstanceOf(GeminiProvider);
    expect(selectProvider({})).toBeInstanceOf(MockLLMProvider);
  });
  it('rejects the retired gemini-pro', () => {
    expect(() => selectProvider({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-pro' })).toThrow(/retired/);
  });
});

describe('LLMClient per-call options (Watch-mode video attempts)', () => {
  it('noRetry makes one attempt; timeoutMs overrides the client timeout', async () => {
    let attempts = 0;
    const provider = {
      name: 'slow',
      countsTowardCap: false,
      generateJson: () => {
        attempts++;
        return new Promise(() => {}); // never answers
      }
    };
    const { LLMClient: Client } = await import('../client.js');
    const { z } = await import('zod');
    const client = new Client({ provider, timeoutMs: 60_000, retryDelayMs: 1, log: () => {} });
    const started = Date.now();
    await expect(
      client.generate({ task: 'generic', system: '', messages: [{ role: 'user', content: 'x' }], schema: z.object({}), timeoutMs: 30, noRetry: true })
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(attempts).toBe(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('LLMClient: used-up daily quota (Gemini free tier)', () => {
  it('maps a per-day 429 to QUOTA without retrying; a per-minute 429 stays retryable', async () => {
    const { LLMClient: Client } = await import('../client.js');
    const { z } = await import('zod');
    let attempts = 0;
    const fail = (message: string) => ({
      name: 'gemini',
      countsTowardCap: false,
      generateJson: async () => {
        attempts++;
        throw Object.assign(new Error(message), { status: 429 });
      }
    });
    const call = { task: 'generic' as const, system: '', messages: [{ role: 'user' as const, content: 'x' }], schema: z.object({}) };
    const daily = new Client({ provider: fail('Generate content requests per day limit exceeded on Free Tier'), retryDelayMs: 1, log: () => {} });
    await expect(daily.generate(call)).rejects.toMatchObject({ code: 'QUOTA' });
    expect(attempts).toBe(1);
    attempts = 0;
    const perMinute = new Client({ provider: fail('Requests per minute limit exceeded'), retryDelayMs: 1, log: () => {} });
    await expect(perMinute.generate(call)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(attempts).toBe(2);
  });
});
