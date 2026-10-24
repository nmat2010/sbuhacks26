import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  HintResponseSchema,
  type ChatTurnType,
  type HintContext,
  type HintFollowup,
  type HintFollowupResponse,
  type HintResponse,
  type HintSourceType,
  type SettingsKey,
  type SettingsValues
} from '@wolfie/shared';
import type { LlmCall } from '../llm/client.js';
import { parseImageDataUrl } from '../llm/data-url.js';
import { redactForLog } from '../llm/redact.js';
import type { LlmImage } from '../llm/provider.js';
import type { EventType } from '../events.js';
import { SHOW_ANSWER_UTTERANCE } from './constants.js';
import { limitLadder, limitWords, wordLimitForLevel } from './limits.js';
import { offlineFollowupText, offlineLadder } from './offline.js';
import { buildSystemPrompt, describeContext } from './prompt.js';

// The hint service (SPEC 4e/4f): turns a HintContext into the five-level ladder, answers
// follow-ups, falls back to the offline ladder when the model is unreachable, and logs to
// hint_requests / events. Nothing here touches Electron; the outside world is injected.

const LlmLadderOutput = z.object({
  what_i_see: z.string().min(1),
  hint_levels: z.object({
    nudge: z.string().min(1),
    hint: z.string().min(1),
    explanation: z.string().min(1),
    analogous_example: z.string().min(1),
    direct_step: z.string().min(1)
  })
});

const LlmFollowupOutput = z.object({
  text: z.string().min(1),
  level: z.coerce.number().int().min(1).max(5)
});

export interface HintServiceDeps {
  llm: () => { generate<T>(call: LlmCall<T>): Promise<T> };
  db: () => Database.Database;
  now: () => number;
  getSetting: <K extends SettingsKey>(key: K) => SettingsValues[K];
  activeSession: () => { id: string; assessmentMode: boolean } | null;
  /** Directory for stored images; null when the app has not provided one. */
  imageDir: () => string | null;
  log: (type: EventType, payload: Record<string, unknown>) => void;
  console?: (line: string) => void;
}

export interface LevelLog {
  context: Pick<HintContext, 'sessionId' | 'device' | 'trigger'>;
  source: HintSourceType;
  level: number;
  text: string;
  imagePath?: string | null;
}

export class HintService {
  constructor(private readonly deps: HintServiceDeps) {}

  /** assessment = the caller's flag, the session's toggle, or the page's domain being listed. */
  resolveAssessment(requested: boolean, context: HintContext): boolean {
    if (requested) return true;
    const { deps } = this;
    const active = deps.activeSession();
    if (active && active.id === context.sessionId && active.assessmentMode) return true;
    try {
      const row = deps
        .db()
        .prepare('SELECT assessment_mode FROM sessions WHERE id = ?')
        .get(context.sessionId) as { assessment_mode: number } | undefined;
      if (row?.assessment_mode) return true;
    } catch {
      /* no database yet */
    }
    const domain = context.pageSummary?.domain?.toLowerCase();
    if (!domain) return false;
    return deps
      .getSetting('assessment.domains')
      .some((d) => {
        const entry = d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        return entry !== '' && (domain === entry || domain.endsWith(`.${entry}`));
      });
  }

  async requestHints(context: HintContext, source: HintSourceType, assessmentFlag: boolean): Promise<HintResponse> {
    const assessment = this.resolveAssessment(assessmentFlag, context);
    const image = this.decodeImage(context.imageDataUrl);

    let response: HintResponse;
    try {
      const out = await this.deps.llm().generate({
        task: 'hints',
        system: buildSystemPrompt('ladder', source, assessment),
        messages: [{ role: 'user', content: describeContext(context, source, !!image) }],
        images: image ? [image] : undefined,
        schema: LlmLadderOutput,
        mockKey: { problemId: this.problemId(context), assessment, source }
      });
      response = HintResponseSchema.parse({
        what_i_see: limitWords(out.what_i_see, 60),
        hint_levels: limitLadder(out.hint_levels),
        offline: false
      });
    } catch (error) {
      this.say(`[hints] model unavailable, using the offline ladder: ${redactForLog(error, 120)}`);
      response = offlineLadder(context);
    }

    const imagePath = context.imageNoStore ? null : this.storeImage(context.imageDataUrl);
    this.deps.log('hint.requested', {
      device: context.device,
      source,
      trigger: context.trigger,
      assessment,
      offline: response.offline,
      hasImage: !!context.imageDataUrl,
      stored: !!imagePath,
      problem: this.problemId(context) ?? null
    });
    this.logLevel({ context, source, level: 1, text: response.hint_levels.nudge, imagePath });
    return response;
  }

  async requestFollowup(
    followup: HintFollowup,
    context: HintContext,
    source: HintSourceType,
    assessmentFlag: boolean
  ): Promise<HintFollowupResponse> {
    const assessment = this.resolveAssessment(assessmentFlag, context);
    const current = followup.currentLevel;
    const image = this.decodeImage(context.imageDataUrl);
    const history = followup.conversationHistory.slice(-6);

    let result: HintFollowupResponse;
    try {
      const out = await this.deps.llm().generate({
        task: 'followup',
        system: buildSystemPrompt('followup', source, assessment),
        messages: [{ role: 'user', content: this.followupMessage(context, source, !!image, history, followup, current) }],
        images: image ? [image] : undefined,
        schema: LlmFollowupOutput,
        mockKey: { problemId: this.problemId(context), assessment, source, currentLevel: current, utterance: followup.utterance }
      });
      // "At the current level or one up" (SPEC 4e.4); the explicit "Show the answer" jumps to 5
      // outside assessment mode.
      const asksForAnswer = !assessment && followup.utterance === SHOW_ANSWER_UTTERANCE;
      const level = asksForAnswer ? 5 : Math.min(5, Math.max(current, Math.min(out.level, current + 1)));
      result = { requestId: followup.requestId, text: limitWords(out.text, wordLimitForLevel(level)), level, offline: false };
    } catch (error) {
      this.say(`[hints] follow-up fell back to offline: ${redactForLog(error, 120)}`);
      result = { requestId: followup.requestId, text: offlineFollowupText(context, current), level: current, offline: true };
    }

    this.deps.log('hint.followup', {
      device: context.device,
      source,
      level: result.level,
      offline: result.offline,
      assessment
    });
    this.logLevel({ context, source, level: result.level, text: result.text });
    return result;
  }

  /** The hint flow calls this when it shows a ladder level to the student. */
  logLevelShown(entry: LevelLog): void {
    this.deps.log('hint.level_shown', { level: entry.level, source: entry.source, device: entry.context.device });
    this.logLevel(entry);
  }

  // ---- internals ---------------------------------------------------------------------------

  private followupMessage(
    context: HintContext,
    source: HintSourceType,
    hasImage: boolean,
    history: ChatTurnType[],
    followup: HintFollowup,
    current: number
  ): string {
    const transcript = history.map((t) => `${t.role === 'user' ? 'Student' : 'Wolfie'}: ${t.content}`).join('\n');
    return [
      describeContext(context, source, hasImage),
      transcript ? `Conversation so far:\n${transcript}` : '',
      `Current hint level: ${current} of 5.`,
      `The student just said: "${followup.utterance}"`
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private problemId(context: HintContext): string | undefined {
    return context.problemId ?? context.pageSummary?.problemId;
  }

  private decodeImage(dataUrl: string | undefined): LlmImage | undefined {
    if (!dataUrl) return undefined;
    try {
      return parseImageDataUrl(dataUrl);
    } catch (error) {
      this.say(`[hints] ignoring unusable image: ${redactForLog(error, 80)}`);
      return undefined;
    }
  }

  /** Images are kept on disk only when the user turned image storage on; otherwise nothing is written. */
  private storeImage(dataUrl: string | undefined): string | null {
    if (!dataUrl || !this.deps.getSetting('image.storage_enabled')) return null;
    const dir = this.deps.imageDir();
    const image = this.decodeImage(dataUrl);
    if (!dir || !image) return null;
    try {
      mkdirSync(dir, { recursive: true });
      const ext = image.mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
      const path = join(dir, `hint-${this.deps.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
      writeFileSync(path, Buffer.from(image.data, 'base64'));
      return path;
    } catch (error) {
      this.say(`[hints] could not store image: ${redactForLog(error, 80)}`);
      return null;
    }
  }

  /** hint_requests needs a sessions row (FK, NOT NULL); without one only the events log is written. */
  private logLevel(entry: LevelLog): void {
    try {
      const db = this.deps.db();
      const session = db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(entry.context.sessionId);
      if (!session) return;
      db.prepare(
        'INSERT INTO hint_requests (session_id, ts, device, source, trigger, image_path, hint_level, hint_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        entry.context.sessionId,
        this.deps.now(),
        entry.context.device,
        entry.source,
        entry.context.trigger,
        entry.imagePath ?? null,
        entry.level,
        entry.text
      );
    } catch (error) {
      this.say(`[hints] could not log hint request: ${redactForLog(error, 80)}`);
    }
  }

  private say(line: string): void {
    (this.deps.console ?? console.log)(line);
  }
}
