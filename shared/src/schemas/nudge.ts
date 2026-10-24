import { z } from 'zod';

export const NudgeKind = z.enum([
  'distraction',
  'ai_tool',
  'stuck',
  'streak',
  'other'
]);

export const NudgeLevel = z.number().int().min(0).max(4);

export const NudgeButton = z.object({
  label: z.string(),
  action: z.string(),
  variant: z.enum(['primary', 'secondary', 'danger']).optional()
});

export const NudgeSchema = z.object({
  kind: NudgeKind,
  level: NudgeLevel,
  text: z.string(),
  spokenText: z.string().optional(),
  buttons: z.array(NudgeButton).optional(),
  priority: z.number().int().min(0).max(10).default(5)
});

export type Nudge = z.infer<typeof NudgeSchema>;
export type NudgeKindType = z.infer<typeof NudgeKind>;
export type NudgeButtonType = z.infer<typeof NudgeButton>;
