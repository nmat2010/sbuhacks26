import type { BResult, WatchAnswer, WatchCitation } from '../../common/ipc-intelligence.js';
import type { EventType } from '../events.js';
import type { LlmCall } from '../llm/client.js';
import { parseImageDataUrl } from '../llm/data-url.js';
import { renderPrompt } from '../llm/prompts/index.js';
import { LLMError } from '../llm/provider.js';
import type { SessionMemory, SourceEntry } from './memory.js';
import { WatchAnswerSchema, type WatchModeKind } from './types.js';

// Watch-mode questions (WATCH_MODE.md §3.3): answers grounded in the whole study session, so the
// student never restates context. Learning mode answers directly; homework mode (or a graded
// session) only gives a hint. Sources are numbered so citations can be checked.

export const LABEL_SESSION = 'From your session';
export const LABEL_GENERAL = 'General knowledge (not from your sources)';
export const LABEL_HINT = 'Hint (homework mode: no final answers)';

/** A frame older than this is not sent with a question. */
const FRAME_MAX_AGE_MS = 20_000;
/** Videos seen within this window can be attached so the model watches them. */
const VIDEO_RECENT_MS = 45 * 60_000;
const PAPER_EXCERPTS = 3;
const MAX_PAPERS = 2;

export interface WatchAnswerDeps {
  now: () => number;
  memory: SessionMemory;
  llm: () => { generate<T>(call: LlmCall<T>): Promise<T> };
  /** Paper passages matching a query (reading/service.ts `excerpts`). */
  excerpts: (paperId: string, query: string, limit: number) => Array<{ section: string; page: number | null; text: string }>;
  paperTitle: (paperId: string) => string | null;
  /** The newest watcher frame, or a fresh capture; null if none is allowed or available. */
  currentFrame: (maxAgeMs: number) => Promise<string | null>;
  /** The running session is marked as graded work. */
  assessment: () => boolean;
  log: (type: EventType, payload: Record<string, unknown>) => void;
}

export interface AskInput {
  question: string;
  inputMode: 'text' | 'voice';
  /** Wolfie offered help (or the mascot was clicked) with no question typed. */
  proactive?: boolean;
}

interface NumberedSource {
  n: number;
  kind: 'paper' | 'video' | 'note';
  title: string;
  locator: string | null;
  url: string | null;
  text?: string;
}

export class WatchAnswerService {
  constructor(private readonly deps: WatchAnswerDeps) {}

  /** The mode the student is in now (from the latest observation), forced to homework when graded. */
  mode(): WatchModeKind {
    if (this.deps.assessment()) return 'homework';
    return this.deps.memory.latest()?.obs.mode ?? 'other';
  }

  async ask(input: AskInput): Promise<BResult<WatchAnswer>> {
    const { deps } = this;
    const question = input.question.trim();
    if (!question && !input.proactive) return { success: false, error: 'Ask me something about what you are working on.' };

    const mode = this.mode();
    const homework = mode === 'homework';
    const latest = deps.memory.latest();
    const query = [question, latest?.obs.subject ?? ''].join(' ').trim();

    const sources = this.collectSources(query, question, latest?.source ?? null);
    const videos = sources.filter((s) => s.kind === 'video' && s.url).map((s) => s.url!);
    const frame = await deps.currentFrame(FRAME_MAX_AGE_MS).catch(() => null);

    const payload = {
      question: question || null,
      proactive: !!input.proactive,
      mode,
      assessment: deps.assessment(),
      now: latest
        ? { activity: latest.obs.activity, subject: latest.obs.subject, summary: latest.obs.summary, locator: latest.obs.source.locator }
        : null,
      session_notes: deps.memory.toPromptText(5000, deps.now()),
      sources: sources.map((s) => ({ n: s.n, kind: s.kind, title: s.title, locator: s.locator, text: s.text })),
      screenshot_attached: !!frame,
      videos_attached: videos.length
    };

    let out;
    try {
      out = await deps.llm().generate({
        task: 'watch_answer',
        system: renderPrompt('watch-answer.v1', {
          mode_rules: homework ? HOMEWORK_RULES : LEARNING_RULES,
          proactive_rule: input.proactive
            ? 'The student asked for help without typing a question. Work out from the screen and the session what they are most likely stuck on, and address that.'
            : 'Answer the question the student asked.'
        }),
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        images: frame ? [parseImageDataUrl(frame)] : undefined,
        videos: videos.length ? videos : undefined,
        schema: WatchAnswerSchema,
        mockKey: { question, mode, sources: sources.map((s) => ({ n: s.n, title: s.title })) },
        temperature: 0.3
      });
    } catch (error) {
      return { success: false, error: friendly(error) };
    }

    // Only citations that point at a source we actually sent count
    const byN = new Map(sources.map((s) => [s.n, s]));
    const citations: WatchCitation[] = [];
    for (const c of out.citations) {
      const s = byN.get(c.n);
      if (!s || citations.some((x) => x.n === c.n)) continue;
      citations.push({ n: s.n, kind: s.kind, title: s.title, locator: c.locator ?? s.locator, url: s.url });
    }
    const grounded = !homework && out.grounded && citations.length > 0;
    const answer: WatchAnswer = {
      question,
      mode,
      answer: out.answer.trim(),
      grounded,
      label: homework ? LABEL_HINT : grounded ? LABEL_SESSION : LABEL_GENERAL,
      citations: homework ? [] : citations
    };
    deps.log('watch.asked', {
      mode,
      grounded,
      inputMode: input.inputMode,
      proactive: !!input.proactive,
      sources: sources.length,
      videos: videos.length,
      screenshot: !!frame
    });
    return { success: true, data: answer };
  }

  /** Paper passages for the question, plus the video(s) worth watching for it. */
  private collectSources(query: string, question: string, current: SourceEntry | null): NumberedSource[] {
    const { deps } = this;
    const out: NumberedSource[] = [];
    let n = 0;

    for (const paperId of deps.memory.paperIds().slice(0, MAX_PAPERS)) {
      const title = deps.paperTitle(paperId) ?? 'paper';
      const entry = deps.memory.listSources().find((s) => s.paperId === paperId);
      for (const ex of deps.excerpts(paperId, query, PAPER_EXCERPTS)) {
        out.push({
          n: ++n,
          kind: 'paper',
          title,
          locator: `${ex.section}${ex.page ? `, p. ${ex.page}` : ''}`,
          url: entry?.url ?? null,
          text: ex.text.slice(0, 1800)
        });
      }
    }

    const now = deps.now();
    const recentVideos = deps.memory.videos().filter((v) => now - v.lastSeen <= VIDEO_RECENT_MS);
    const wantsVideo =
      current?.kind === 'video' || /\b(video|youtube|lecture|clip|he said|she said|they said)\b/i.test(question);
    const video = current?.kind === 'video' && current.url ? current : wantsVideo ? recentVideos[0] : undefined;
    if (video?.url) {
      out.push({ n: ++n, kind: 'video', title: video.title, locator: video.locators.at(-1) ?? null, url: video.url });
    }
    return out;
  }
}

const LEARNING_RULES =
  'The student is in learning mode: reading or watching to understand something. Answer the question directly and fully. Explain the how and the why, not just the what.';

const HOMEWORK_RULES =
  'The student is doing homework or graded work. Do NOT give the final answer, the full solution, or a worked version of their own problem. Give the smallest useful hint: point to the step or idea to look at again, or ask a guiding question. If they ask for the answer, kindly say you will help them get there and give a hint instead.';

function friendly(error: unknown): string {
  if (error instanceof LLMError) {
    if (error.code === 'DAILY_CAP') return "I've reached today's limit for questions. Try again tomorrow.";
    if (error.code === 'SCHEMA' || error.code === 'INVALID_JSON') return "I couldn't put together a good answer this time. Please ask again.";
    if (error.code === 'AUTH' || error.code === 'NOT_CONFIGURED') return 'The AI key is missing or not working. Check desktop/.env.';
  }
  return "I couldn't reach the AI just now. Check your connection and try again.";
}
