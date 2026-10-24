import { z } from 'zod';

export const SyncMessageType = z.enum([
  'session.start',
  'session.end',
  'ipad.activity',
  'nudge.log',
  'hint.request',
  'hint.followup',
  'hint.response',
  'plan.snapshot',
  'streak.snapshot'
]);

export const SyncMessageSchema = z.object({
  id: z.string(),
  type: SyncMessageType,
  timestamp: z.number(),
  payload: z.any()
});

export const SessionStartMessage = z.object({
  sessionId: z.string(),
  device: z.enum(['desktop', 'ipad']),
  goalId: z.string().optional(),
  assessmentMode: z.boolean().default(false)
});

export const SessionEndMessage = z.object({
  sessionId: z.string(),
  endedAt: z.number()
});

export const IpadActivityBatch = z.object({
  sessionId: z.string(),
  activities: z.array(z.object({
    type: z.string(),
    timestamp: z.number(),
    metadata: z.record(z.any()).optional()
  }))
});

export const PlanSnapshot = z.object({
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    dueDate: z.string().optional(),
    status: z.enum(['pending', 'in_progress', 'completed']),
    goalId: z.string().optional()
  }))
});

export const StreakSnapshot = z.object({
  current: z.number(),
  longest: z.number(),
  freezesAvailable: z.number(),
  todayQualified: z.boolean(),
  todayMinutes: z.number()
});

export type SyncMessage = z.infer<typeof SyncMessageSchema>;
export type SyncMessageTypeType = z.infer<typeof SyncMessageType>;
export type SessionStart = z.infer<typeof SessionStartMessage>;
export type SessionEnd = z.infer<typeof SessionEndMessage>;
export type IpadActivity = z.infer<typeof IpadActivityBatch>;
export type PlanSnapshotType = z.infer<typeof PlanSnapshot>;
export type StreakSnapshotType = z.infer<typeof StreakSnapshot>;
