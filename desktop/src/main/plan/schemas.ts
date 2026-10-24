import { z } from 'zod';
import type { PlanOnboardingInput } from '../../common/ipc-intelligence.js';
import { isValidDate } from './dates.js';

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'dates must look like YYYY-MM-DD')
  .refine(isValidDate, 'not a real calendar date');

export const GoalTypeSchema = z.enum(['research', 'job', 'project', 'course', 'other']);

export const OnboardingSchema = z
  .object({
    semesterStart: IsoDate,
    semesterEnd: IsoDate,
    courses: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          credits: z.number().min(0).max(30),
          importantDates: z.array(z.object({ title: z.string().trim().min(1).max(160), date: IsoDate })).max(40)
        })
      )
      .max(12),
    weeklyHours: z.number().min(0).max(100),
    goals: z
      .array(
        z.object({
          id: z.string().min(1).optional(),
          title: z.string().trim().min(1).max(200),
          type: GoalTypeSchema,
          targetDate: IsoDate.optional()
        })
      )
      .min(1, 'Add at least one goal')
      .max(8)
  })
  .refine((v) => v.semesterEnd >= v.semesterStart, { message: 'The semester must end after it starts', path: ['semesterEnd'] });

// Compile-time check that the IPC type and the schema describe the same thing
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const onboardingMatchesIpcType: Equal<z.infer<typeof OnboardingSchema>, PlanOnboardingInput> = true;
void onboardingMatchesIpcType;

export const PlanItemPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  dueDate: IsoDate.nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  notes: z.string().max(2000).nullable().optional()
});

export const NewItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: IsoDate.optional(),
  notes: z.string().max(2000).optional()
});

// ---- What the model returns ------------------------------------------------------------------

export interface PlanWindow {
  /** Items may not be due before this day. */
  today: string;
  /** Latest allowed due date per goal id. */
  goalEnds: Record<string, string>;
}

/**
 * The model's plan. Date rules are part of the schema, so a bad date counts as "invalid JSON" and
 * gets the client's one corrective retry before the user sees an error.
 */
export function makePlanOutputSchema(window: PlanWindow) {
  const goalIds = Object.keys(window.goalEnds);
  return z
    .object({
      goals: z
        .array(
          z.object({
            goal_id: z.string(),
            rationale: z.string().min(1).max(800),
            milestones: z
              .array(z.object({ week_start: IsoDate, title: z.string().min(1).max(200) }))
              .min(1)
              .max(40),
            items: z
              .array(
                z.object({
                  title: z.string().min(1).max(200),
                  due_date: IsoDate,
                  notes: z.string().max(600).optional(),
                  milestone_week: IsoDate.optional(),
                  estimated_hours: z.number().min(0).max(40).optional()
                })
              )
              .min(1)
              .max(80)
          })
        )
        .min(1)
    })
    .superRefine((plan, ctx) => {
      plan.goals.forEach((goal, gi) => {
        if (!goalIds.includes(goal.goal_id)) {
          ctx.addIssue({ code: 'custom', path: ['goals', gi, 'goal_id'], message: `unknown goal_id (use one of: ${goalIds.join(', ')})` });
          return;
        }
        const end = window.goalEnds[goal.goal_id];
        goal.items.forEach((item, ii) => {
          if (item.due_date < window.today || item.due_date > end) {
            ctx.addIssue({
              code: 'custom',
              path: ['goals', gi, 'items', ii, 'due_date'],
              message: `due_date must be between ${window.today} and ${end}`
            });
          }
        });
        goal.milestones.forEach((m, mi) => {
          if (m.week_start > end) {
            ctx.addIssue({ code: 'custom', path: ['goals', gi, 'milestones', mi, 'week_start'], message: `week_start must not be after ${end}` });
          }
        });
      });
    });
}

export type PlanOutput = z.infer<ReturnType<typeof makePlanOutputSchema>>;

export function makeItemOutputSchema(window: { today: string; end: string }) {
  return z.object({
    title: z.string().min(1).max(200),
    due_date: IsoDate.refine((d) => d >= window.today && d <= window.end, `due_date must be between ${window.today} and ${window.end}`),
    notes: z.string().max(600).optional()
  });
}
