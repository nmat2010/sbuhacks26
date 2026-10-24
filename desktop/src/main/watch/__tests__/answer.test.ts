import { beforeEach, describe, expect, it } from 'vitest';
import type { LlmCall } from '../../llm/client.js';
import { LLMError } from '../../llm/provider.js';
import { SessionMemory } from '../memory.js';
import { LABEL_GENERAL, LABEL_HINT, LABEL_SESSION, WatchAnswerService, type WatchAnswerDeps } from '../answer.js';
import type { ModelWatchAnswer } from '../types.js';
import { obs } from './helpers.js';

const NOW = 5_000_000;
let memory: SessionMemory;
let calls: Array<LlmCall<unknown>>;
let reply: ModelWatchAnswer | Error;
let frame: string | null;
let assessment: boolean;

function make(over: Partial<WatchAnswerDeps> = {}): WatchAnswerService {
  return new WatchAnswerService({
    now: () => NOW,
    memory,
    llm: () => ({
      async generate<T>(call: LlmCall<T>): Promise<T> {
        calls.push(call as LlmCall<unknown>);
        if (reply instanceof Error) throw reply;
        return call.schema.parse(reply);
      }
    }),
    excerpts: (paperId) =>
      paperId === 'p1' ? [{ section: '3.2 Gated attention', page: 4, text: 'We gate each attention score with a learned mask...' }] : [],
    paperTitle: (id) => (id === 'p1' ? 'Sparse Gated Attention' : null),
    currentFrame: async () => frame,
    assessment: () => assessment,
    log: () => {},
    ...over
  });
}

const paperCtx = { ts: NOW - 60_000, appName: 'Google Chrome', windowTitle: 'paper.pdf', contentUrl: 'https://example.edu/paper.pdf', elapsedMs: 8000 };
const videoCtx = { ts: NOW - 30_000, appName: 'Google Chrome', windowTitle: 'Attention - YouTube', contentUrl: 'https://www.youtube.com/watch?v=abcdef123', elapsedMs: 8000 };

beforeEach(() => {
  memory = new SessionMemory();
  calls = [];
  reply = { answer: 'He gates each score with a learned mask, so most heads stay sparse.', grounded: true, citations: [{ n: 1, locator: null }] };
  frame = 'data:image/jpeg;base64,QUFB';
  assessment = false;
  memory.record(obs(), paperCtx);
  memory.attachPaper(paperCtx.contentUrl, 'p1', 'Sparse Gated Attention');
});

describe('WatchAnswerService', () => {
  it('learning mode: answers from the session with paper passages, the screen, and citations', async () => {
    const res = await make().ask({ question: 'how did the prof change the transformer?', inputMode: 'text' });
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ mode: 'learning', grounded: true, label: LABEL_SESSION });
    expect(res.data!.citations).toEqual([
      { n: 1, kind: 'paper', title: 'Sparse Gated Attention', locator: '3.2 Gated attention, p. 4', url: 'https://example.edu/paper.pdf' }
    ]);
    const payload = JSON.parse(calls[0].messages[0].content);
    expect(payload.session_notes).toContain('Sparse Gated Attention');
    expect(payload.sources[0].text).toContain('learned mask');
    expect(calls[0].images).toHaveLength(1);
    expect(calls[0].system).toContain('Answer the question directly');
  });

  it('drops citations to sources that were not sent, and then it is not grounded', async () => {
    reply = { answer: 'Something', grounded: true, citations: [{ n: 7, locator: null }] };
    const res = await make().ask({ question: 'what is the loss?', inputMode: 'text' });
    expect(res.data).toMatchObject({ grounded: false, label: LABEL_GENERAL, citations: [] });
  });

  it('homework mode gives hints only: homework rules, no citations, hint label', async () => {
    memory.record(obs({ mode: 'homework', activity: 'homework' }), { ...paperCtx, ts: NOW - 1000, contentUrl: null });
    const res = await make().ask({ question: 'what is the answer to Q1?', inputMode: 'text' });
    expect(calls[0].system).toContain('Do NOT give the final answer');
    expect(res.data).toMatchObject({ mode: 'homework', grounded: false, label: LABEL_HINT, citations: [] });
  });

  it('a graded session is homework mode even while reading', async () => {
    assessment = true;
    const res = await make().ask({ question: 'explain section 3', inputMode: 'voice' });
    expect(res.data?.mode).toBe('homework');
  });

  it('attaches the video the student is watching so the model can watch it', async () => {
    memory.record(obs({ activity: 'watching_video', source: { kind: 'video', title: 'Attention explained', locator: '4:10' } }), videoCtx);
    await make().ask({ question: 'what did he mean by that?', inputMode: 'voice' });
    expect(calls[0].videos).toEqual(['https://www.youtube.com/watch?v=abcdef123']);
  });

  it('attaches an earlier video only when the question is about a video', async () => {
    memory.record(obs({ activity: 'watching_video', source: { kind: 'video', title: 'Attention explained', locator: null } }), videoCtx);
    memory.record(obs(), { ...paperCtx, ts: NOW - 1000 });
    await make().ask({ question: 'what does equation 4 mean?', inputMode: 'text' });
    expect(calls[0].videos).toBeUndefined();
    await make().ask({ question: 'in the video, why did he skip the softmax?', inputMode: 'text' });
    expect(calls[1].videos).toEqual(['https://www.youtube.com/watch?v=abcdef123']);
  });

  it('proactive help works without a question; an empty typed question does not', async () => {
    expect((await make().ask({ question: '  ', inputMode: 'text' })).success).toBe(false);
    const res = await make().ask({ question: '', inputMode: 'text', proactive: true });
    expect(res.success).toBe(true);
    expect(calls[0].system).toContain('most likely stuck on');
  });

  it('works without a screenshot', async () => {
    frame = null;
    const res = await make().ask({ question: 'summarize what I read', inputMode: 'text' });
    expect(res.success).toBe(true);
    expect(calls[0].images).toBeUndefined();
  });

  it('turns model errors into a friendly message', async () => {
    reply = new LLMError('cap', 'DAILY_CAP', 'gemini');
    const res = await make().ask({ question: 'x?', inputMode: 'text' });
    expect(res).toEqual({ success: false, error: "I've reached today's limit for questions. Try again tomorrow." });
  });
});

describe('WatchAnswerService: video problems', () => {
  it('answers without the video when Gemini rejects it or times out, and never cites it', async () => {
    memory.record(obs({ activity: 'watching_video', source: { kind: 'video', title: 'Private lecture', locator: null } }), videoCtx);
    for (const code of ['BAD_REQUEST', 'TIMEOUT'] as const) {
      calls = [];
      let first = true;
      const service = make({
        llm: () => ({
          async generate<T>(call: LlmCall<T>): Promise<T> {
            calls.push(call as LlmCall<unknown>);
            if (first) {
              first = false;
              throw new LLMError('video', code, 'gemini');
            }
            return call.schema.parse({ answer: 'From your notes...', grounded: true, citations: [{ n: 2, locator: '4:10' }] });
          }
        })
      });
      const res = await service.ask({ question: 'what did he say in the video?', inputMode: 'text' });
      expect(res.success).toBe(true);
      expect(calls[0].videos).toEqual(['https://www.youtube.com/watch?v=abcdef123']);
      expect(calls[1].videos).toBeUndefined();
      expect(res.data!.citations.some((c) => c.kind === 'video')).toBe(false);
    }
  });

  it('does not retry other errors', async () => {
    memory.record(obs({ activity: 'watching_video', source: { kind: 'video', title: 'V', locator: null } }), videoCtx);
    reply = new LLMError('auth', 'AUTH', 'gemini');
    const res = await make().ask({ question: 'what did he say in the video?', inputMode: 'text' });
    expect(res.success).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
