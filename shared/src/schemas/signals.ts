import { z } from 'zod';

export const SignalType = z.enum([
  // Desktop/web signals
  'wrong_answer_loop',
  'dead_control_clicks',
  'validation_errors',
  'backtracking',
  'context_switch_loop',
  'idle_on_work',
  'long_on_problem',
  // iPad signals
  'idle_on_page',
  'scribble_outs',
  'undo_burst',
  'abandoned_start'
]);

export const SignalStrength = z.enum(['weak', 'strong']);

export const StruggleSignalSchema = z.object({
  type: SignalType,
  strength: SignalStrength,
  timestamp: z.number(),
  metadata: z.record(z.any()).optional()
});

export type StruggleSignal = z.infer<typeof StruggleSignalSchema>;
export type SignalTypeType = z.infer<typeof SignalType>;
export type SignalStrengthType = z.infer<typeof SignalStrength>;
