import { z } from 'zod';
import { Device } from './common.js';
import { PageSummarySchema } from './page-summary.js';

export const HintSource = z.enum(['screen', 'page', 'handwriting', 'camera']);
export const HintTrigger = z.enum(['auto', 'manual', 'voice']);

// The five-level ladder, in order. Levels 1-2 ~40 words, 3-5 ~90 words (SPEC 4e).
export const HINT_LEVEL_KEYS = [
  'nudge',
  'hint',
  'explanation',
  'analogous_example',
  'direct_step'
] as const;

export const HintLevels = z.object({
  nudge: z.string().max(400),
  hint: z.string().max(400),
  explanation: z.string().max(800),
  analogous_example: z.string().max(800),
  direct_step: z.string().max(800)
});

export const ChatTurn = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string()
});

// Everything the hint service needs. Images travel as data URLs because the web app has no
// shared filesystem with the desktop; the desktop may write them to disk if image storage is on.
export const HintContextSchema = z.object({
  sessionId: z.string(),
  device: Device,
  trigger: HintTrigger,
  pageSummary: PageSummarySchema.optional(),
  imageDataUrl: z.string().optional(),
  problemId: z.string().optional(),
  /** Watch mode: what the student has been reading/watching this session, as text (WATCH_MODE.md). */
  sessionContext: z.string().max(8000).optional(),
  conversationHistory: z.array(ChatTurn).max(6).optional()
});

export const HintRequestSchema = z.object({
  requestId: z.string(),
  context: HintContextSchema,
  source: HintSource,
  assessment: z.boolean().default(false),
  timestamp: z.number()
});

export const HintResponseSchema = z.object({
  what_i_see: z.string().max(600),
  hint_levels: HintLevels,
  offline: z.boolean().default(false)
});

export const HintFollowupSchema = z.object({
  requestId: z.string(),
  utterance: z.string(),
  currentLevel: z.number().int().min(1).max(5),
  conversationHistory: z.array(ChatTurn).max(6)
});

export const HintFollowupResponseSchema = z.object({
  requestId: z.string(),
  text: z.string(),
  level: z.number().int().min(1).max(5),
  offline: z.boolean().default(false)
});

export type HintSourceType = z.infer<typeof HintSource>;
export type HintTriggerType = z.infer<typeof HintTrigger>;
export type HintLevelKey = (typeof HINT_LEVEL_KEYS)[number];
export type HintContext = z.infer<typeof HintContextSchema>;
export type HintRequest = z.infer<typeof HintRequestSchema>;
export type HintResponse = z.infer<typeof HintResponseSchema>;
export type HintFollowup = z.infer<typeof HintFollowupSchema>;
export type HintFollowupResponse = z.infer<typeof HintFollowupResponseSchema>;
export type ChatTurnType = z.infer<typeof ChatTurn>;

// Frozen signature (SPEC 11, contract 3). Implemented in desktop/src/main/hints/.
export type RequestHints = (
  context: HintContext,
  source: HintSourceType,
  assessment: boolean
) => Promise<HintResponse>;

export type RequestFollowup = (
  followup: HintFollowup,
  context: HintContext,
  source: HintSourceType,
  assessment: boolean
) => Promise<HintFollowupResponse>;
