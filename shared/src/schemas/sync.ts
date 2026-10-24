import { z } from 'zod';
import { Device } from './common.js';
import { NudgeKind } from './nudge.js';
import {
  HintFollowupResponseSchema,
  HintFollowupSchema,
  HintRequestSchema,
  HintResponseSchema,
  HintContextSchema,
  HintSource
} from './hint.js';

// Web app <-> desktop over the LAN WebSocket (SPEC Phase 10).
//
// Handshake: the server sends `auth.challenge`; a paired client answers `auth.hello` with
// HMAC-SHA256(secret, nonce). An unpaired client sends `pair.request` with the 6-digit code
// instead. Every other message is accepted only on an authenticated socket. Clients queue
// outbound messages while offline and replay them in order; the desktop dedupes by `id` and
// answers each with `ack`.

/** LAN port for the web app sync server (separate from the extension's loopback port). */
export const SYNC_WS_PORT = 45679;

const envelope = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({
    id: z.string(),
    type: z.literal(type),
    ts: z.number(),
    payload
  });

export const WebappActivityType = z.enum([
  'canvas_stroke',
  'erase',
  'undo',
  'clear',
  'tab_hidden',
  'tab_visible'
]);

export const SessionStartPayload = z.object({
  sessionId: z.string(),
  device: Device,
  startedAt: z.number(),
  goalId: z.string().optional(),
  label: z.string().optional(),
  assessmentMode: z.boolean().default(false)
});

export const SessionEndPayload = z.object({
  sessionId: z.string(),
  endedAt: z.number()
});

export const WebappActivityBatch = z.object({
  sessionId: z.string(),
  activities: z.array(
    z.object({
      type: WebappActivityType,
      ts: z.number(),
      meta: z.record(z.any()).optional()
    })
  )
});

export const NudgeLogPayload = z.object({
  sessionId: z.string().optional(),
  ts: z.number(),
  kind: NudgeKind,
  level: z.number().int().min(0).max(4),
  text: z.string(),
  userResponse: z.string().optional()
});

export const PlanSnapshot = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      dueDate: z.string().optional(),
      status: z.enum(['pending', 'in_progress', 'completed']),
      goalId: z.string().optional()
    })
  )
});

export const StreakSnapshot = z.object({
  current: z.number(),
  longest: z.number(),
  freezesAvailable: z.number(),
  todayQualified: z.boolean(),
  todayMinutes: z.number(),
  // Last 7 local dates, oldest first, for the weekly calendar.
  week: z
    .array(z.object({ localDate: z.string(), status: z.enum(['filled', 'missed', 'frozen', 'pending']) }))
    .max(7)
    .default([])
});

export const SyncMessageSchema = z.discriminatedUnion('type', [
  envelope('auth.challenge', z.object({ nonce: z.string() })),
  envelope('auth.hello', z.object({ deviceId: z.string(), hmac: z.string() })),
  envelope('auth.result', z.object({ ok: z.boolean(), reason: z.string().optional() })),
  envelope('pair.request', z.object({ code: z.string().regex(/^\d{6}$/), deviceName: z.string() })),
  envelope(
    'pair.result',
    z.object({ ok: z.boolean(), deviceId: z.string().optional(), secret: z.string().optional(), reason: z.string().optional() })
  ),
  envelope('ack', z.object({ ackId: z.string() })),
  envelope('session.start', SessionStartPayload),
  envelope('session.end', SessionEndPayload),
  envelope('webapp.activity', WebappActivityBatch),
  envelope('nudge.log', NudgeLogPayload),
  envelope('hint.request', HintRequestSchema),
  envelope(
    'hint.followup',
    z.object({ followup: HintFollowupSchema, context: HintContextSchema, source: HintSource, assessment: z.boolean() })
  ),
  envelope('hint.response', z.object({ requestId: z.string(), response: HintResponseSchema })),
  envelope('hint.followup_response', HintFollowupResponseSchema),
  envelope('hint.error', z.object({ requestId: z.string(), message: z.string() })),
  envelope('plan.snapshot', PlanSnapshot),
  envelope('streak.snapshot', StreakSnapshot)
]);

export type SyncMessage = z.infer<typeof SyncMessageSchema>;
export type SyncMessageTypeType = SyncMessage['type'];
export type SyncMessageOf<T extends SyncMessageTypeType> = Extract<SyncMessage, { type: T }>;
export type SessionStart = z.infer<typeof SessionStartPayload>;
export type SessionEnd = z.infer<typeof SessionEndPayload>;
export type WebappActivity = z.infer<typeof WebappActivityBatch>;
export type PlanSnapshotType = z.infer<typeof PlanSnapshot>;
export type StreakSnapshotType = z.infer<typeof StreakSnapshot>;
