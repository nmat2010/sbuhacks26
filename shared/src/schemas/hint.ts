import { z } from 'zod';

export const HintSource = z.enum(['screen', 'page', 'handwriting', 'camera']);

export const HintLevels = z.object({
  nudge: z.string().max(200),
  hint: z.string().max(200),
  explanation: z.string().max(400),
  analogous_example: z.string().max(400),
  direct_step: z.string().max(400)
});

export const HintRequestSchema = z.object({
  sessionId: z.string(),
  device: z.enum(['desktop', 'ipad']),
  source: HintSource,
  trigger: z.enum(['auto', 'manual', 'voice']),
  imagePath: z.string().optional(),
  pageSummary: z.any().optional(), // Will be defined in page-summary.ts
  assessment: z.boolean().default(false),
  timestamp: z.number()
});

export const HintResponseSchema = z.object({
  what_i_see: z.string().max(300),
  hint_levels: HintLevels,
  offline: z.boolean().default(false)
});

export const HintFollowupSchema = z.object({
  requestId: z.string(),
  utterance: z.string(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).max(6)
});

export type HintRequest = z.infer<typeof HintRequestSchema>;
export type HintResponse = z.infer<typeof HintResponseSchema>;
export type HintFollowup = z.infer<typeof HintFollowupSchema>;
export type HintSourceType = z.infer<typeof HintSource>;
