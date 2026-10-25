import { z } from 'zod';

// Watch mode (WATCH_MODE.md): what the watcher model reports about each frame.

export const ACTIVITIES = ['reading_paper', 'watching_video', 'homework', 'coding', 'writing', 'browsing', 'other'] as const;
export const SOURCE_KINDS = ['paper', 'video', 'webpage', 'document', 'code', 'other'] as const;

export const ObservationSchema = z.object({
  activity: z.enum(ACTIVITIES),
  /** learning: reading/watching to understand (answer directly). homework: problems with answers (hints only). */
  mode: z.enum(['learning', 'homework', 'other']),
  subject: z.string().max(160),
  source: z.object({
    kind: z.enum(SOURCE_KINDS),
    title: z.string().max(200).nullable(),
    /** Section, page, slide or video timestamp, when visible. */
    locator: z.string().max(120).nullable()
  }),
  summary: z.string().max(500),
  key_points: z.array(z.string().max(240)).max(4).default([]),
  stuck: z.object({
    likely: z.boolean(),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(240).nullable()
  }),
  /**
   * The question the student is on right now that has no answer written yet (where the cursor or
   * the blank answer is), short; null if none. A long pause on it is a "thinking pause".
   */
  unanswered_question: z.string().max(200).nullable().default(null),
  /** One entry per question/problem the student answered on screen (several can be wrong at once). */
  answer_checks: z
    .array(
      z.object({
        /** The question or problem this answer belongs to, short ("What is underfitting?", "2x + 5 = 13"). */
        question: z.string().max(200).nullable(),
        visible_answer: z.string().max(240).nullable(),
        looks_correct: z.boolean().nullable(),
        issue: z.string().max(240).nullable()
      })
    )
    .max(4)
    .default([])
});

export type Observation = z.infer<typeof ObservationSchema>;
export type WatchModeKind = Observation['mode'];
export type SourceKind = Observation['source']['kind'];

/** What the Q&A model returns. Citation numbers refer to the numbered sources it was given. */
export const WatchAnswerSchema = z.object({
  answer: z.string().min(1).max(2500),
  grounded: z.boolean(),
  citations: z
    .array(z.object({ n: z.coerce.number().int(), locator: z.string().max(120).nullable() }))
    .max(8)
    .default([])
});

export type ModelWatchAnswer = z.infer<typeof WatchAnswerSchema>;
