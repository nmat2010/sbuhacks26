import { z } from 'zod';
import type {
  AddPaperInput,
  BResult,
  IdeasResult,
  PaperStatus,
  PaperView,
  SuggestedPaper
} from '../../common/ipc-intelligence.js';
import type { LlmCall } from '../llm/client.js';
import { renderPrompt } from '../llm/prompts/index.js';
import { LLMError } from '../llm/provider.js';
import type { EventType } from '../events.js';
import type { PlanStore } from '../plan/store.js';
import { IsoDate } from '../plan/schemas.js';
import { PaperNotFoundError, type PapersStore } from './store.js';
import type { PaperVerifier } from './verify.js';

// Phase 6: project ideas with a verified reading list, and adding papers to the library.

const IdeasOutput = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        scope: z.string().min(1).max(500),
        skills: z.array(z.string().min(1).max(60)).min(1).max(8),
        first_week_task: z.string().min(1).max(400)
      })
    )
    .min(3)
    .max(5),
  reading_list: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        authors: z.array(z.string()).max(30).default([]),
        year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
        why: z.string().min(1).max(400)
      })
    )
    .min(1)
    .max(12)
});

const AddPaperSchema = z.object({
  title: z.string().trim().min(1).max(400),
  url: z.string().trim().min(1).max(2000),
  goalId: z.string().min(1).optional(),
  authors: z.array(z.string()).max(50).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  arxivId: z.string().max(60).optional(),
  planItemDueDate: IsoDate.optional()
});

export interface IdeasServiceDeps {
  plan: PlanStore;
  papers: PapersStore;
  verifier: PaperVerifier;
  llm: () => { generate<T>(call: LlmCall<T>): Promise<T> };
  log: (type: EventType, payload: Record<string, unknown>) => void;
}

const MAX_PAPERS = 5;

export class IdeasService {
  constructor(private readonly deps: IdeasServiceDeps) {}

  async suggest(goalId: string): Promise<BResult<IdeasResult>> {
    const { plan } = this.deps;
    const goal = plan.getGoal(goalId);
    if (!goal) return { success: false, error: "I couldn't find that goal." };
    if (goal.type !== 'research' && goal.type !== 'project') {
      return { success: false, error: 'Ideas and reading lists are for research and project goals.' };
    }
    const onboarding = plan.getOnboarding();

    let out;
    try {
      out = await this.deps.llm().generate({
        task: 'ideas',
        system: renderPrompt('ideas.v1'),
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              goal: { title: goal.title, type: goal.type },
              courses: onboarding?.courses.map((c) => ({ name: c.name, credits: c.credits })) ?? [],
              weeklyHours: onboarding?.weeklyHours ?? null
            })
          }
        ],
        schema: IdeasOutput,
        mockKey: { goalTitle: goal.title, goalType: goal.type }
      });
    } catch (error) {
      return { success: false, error: friendly(error) };
    }

    // Never trust model citations: keep only papers a search API returns (SPEC Phase 6)
    const { verified, dropped, unavailable } = await this.deps.verifier.verifyMany(
      out.reading_list.map((p) => ({ title: p.title, authors: p.authors, year: p.year ?? undefined })),
      MAX_PAPERS
    );
    const papers: SuggestedPaper[] = verified.map(({ candidate, paper }) => ({
      // Title, authors, year and link come from the API; only the one-line reason is the model's
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      why: out.reading_list.find((r) => r.title === candidate.title)?.why ?? '',
      url: paper.url,
      source: paper.source,
      arxivId: paper.arxivId
    }));

    this.deps.log('ideas.suggested', { goalType: goal.type, ideas: out.ideas.length, papers: papers.length, dropped });
    return {
      success: true,
      data: {
        goalId,
        ideas: out.ideas.map((i) => ({ title: i.title, scope: i.scope, skills: i.skills, firstWeekTask: i.first_week_task })),
        papers,
        dropped,
        verificationUnavailable: papers.length === 0 && unavailable > 0
      }
    };
  }
}

export class PapersService {
  constructor(
    private readonly deps: { papers: PapersStore; plan: PlanStore; log: (type: EventType, payload: Record<string, unknown>) => void }
  ) {}

  list(): PaperView[] {
    return this.deps.papers.list();
  }

  /** Adds the paper (once per link) and, if asked, the plan item "Read: <title>". */
  add(raw: unknown): BResult<{ paper: PaperView; planItemId: string | null }> {
    const parsed = AddPaperSchema.safeParse(raw as AddPaperInput);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { success: false, error: `${issue.message}${issue.path.length ? ` (${issue.path.join(' > ')})` : ''}` };
    }
    const input = parsed.data;
    const { papers, plan } = this.deps;
    if (input.goalId && !plan.getGoal(input.goalId)) return { success: false, error: "I couldn't find that goal." };
    if (input.planItemDueDate && !input.goalId) {
      return { success: false, error: 'Choose a goal to add a "read by" date to your plan.' };
    }

    const existing = papers.findDuplicate(input.url, input.arxivId);
    const paper =
      existing ??
      papers.add({
        title: input.title,
        urlOrPath: input.url,
        goalId: input.goalId ?? null,
        authors: input.authors,
        year: input.year ?? null,
        arxivId: input.arxivId ?? null,
        source: 'recommendation'
      });
    let planItemId: string | null = null;
    if (input.planItemDueDate && input.goalId) {
      planItemId = plan.addItem(input.goalId, { title: `Read: ${paper.title}`, dueDate: input.planItemDueDate }, 'paper').id;
    }
    if (!existing) this.deps.log('paper.added', { arxiv: Boolean(input.arxivId), planItem: planItemId !== null });
    return { success: true, data: { paper, planItemId } };
  }

  setStatus(id: string, status: PaperStatus): BResult<PaperView> {
    return this.guard(() => this.deps.papers.setStatus(id, status));
  }

  delete(id: string): BResult {
    return this.guard(() => {
      this.deps.papers.delete(id);
      return undefined;
    });
  }

  private guard<T>(fn: () => T): BResult<T> {
    try {
      return { success: true, data: fn() };
    } catch (error) {
      if (error instanceof PaperNotFoundError) return { success: false, error: "I couldn't find that paper." };
      throw error;
    }
  }
}

function friendly(error: unknown): string {
  if (error instanceof LLMError) {
    if (error.code === 'SCHEMA' || error.code === 'INVALID_JSON') return "I couldn't put together useful suggestions this time. Please try again.";
    if (error.code === 'DAILY_CAP') return "I've reached today's limit for suggestions. Try again tomorrow.";
  }
  return "I couldn't reach the suggestion service. Check your connection and try again.";
}
