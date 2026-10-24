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
  // Assigned by the NudgeQueue when omitted; used to route the user's response back.
  id: z.string().optional(),
  kind: NudgeKind,
  level: NudgeLevel,
  text: z.string(),
  spokenText: z.string().optional(),
  buttons: z.array(NudgeButton).optional(),
  priority: z.number().int().min(0).max(10).default(5)
});

// Sent from a renderer when the user clicks a bubble button, answers by voice, or dismisses.
export const NudgeResponseSchema = z.object({
  id: z.string(),
  action: z.string(), // a button's `action`, a voice intent, or 'dismissed' / 'timeout'
  via: z.enum(['button', 'voice', 'auto']).default('button')
});

// Mascot sprite states. Escalation levels 1 and 2 (glance, question-mark) are sprite states,
// not bubbles, so they are sent on the overlay-state channel and bypass the NudgeQueue.
export const MascotState = z.enum([
  'idle',
  'talking',
  'alert',
  'sleeping',
  'glance',
  'question-mark'
]);

export type Nudge = z.infer<typeof NudgeSchema>;
export type NudgeInput = z.input<typeof NudgeSchema>;
export type NudgeKindType = z.infer<typeof NudgeKind>;
export type NudgeButtonType = z.infer<typeof NudgeButton>;
export type NudgeResponse = z.infer<typeof NudgeResponseSchema>;
export type MascotStateType = z.infer<typeof MascotState>;
