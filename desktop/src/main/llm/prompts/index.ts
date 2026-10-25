import tutorV1 from './tutor.v1.md?raw';
import tutorFollowupV1 from './tutor-followup.v1.md?raw';
import assessmentV1 from './assessment.v1.md?raw';
import sourceHandwritingV1 from './source-handwriting.v1.md?raw';
import sourceCameraV1 from './source-camera.v1.md?raw';
import sourcePageV1 from './source-page.v1.md?raw';
import sourceScreenV1 from './source-screen.v1.md?raw';
import planV1 from './plan.v1.md?raw';
import planItemV1 from './plan-item.v1.md?raw';
import ideasV1 from './ideas.v1.md?raw';
import readingV1 from './reading.v1.md?raw';
import watchObserveV1 from './watch-observe.v1.md?raw';
import watchObserveV2 from './watch-observe.v2.md?raw';
import watchObserveV3 from './watch-observe.v3.md?raw';
import watchObserveV4 from './watch-observe.v4.md?raw';
import watchAnswerV1 from './watch-answer.v1.md?raw';

// Versioned prompt files (SPEC 6: prompts are files, not inline strings). To change a prompt,
// add a new version file and point the caller at it; the old one stays for comparison.

export const PROMPTS = {
  'tutor.v1': tutorV1,
  'tutor-followup.v1': tutorFollowupV1,
  'assessment.v1': assessmentV1,
  'source-handwriting.v1': sourceHandwritingV1,
  'source-camera.v1': sourceCameraV1,
  'source-page.v1': sourcePageV1,
  'source-screen.v1': sourceScreenV1,
  'plan.v1': planV1,
  'plan-item.v1': planItemV1,
  'ideas.v1': ideasV1,
  'reading.v1': readingV1,
  'watch-observe.v1': watchObserveV1,
  'watch-observe.v2': watchObserveV2,
  'watch-observe.v3': watchObserveV3,
  'watch-observe.v4': watchObserveV4,
  'watch-answer.v1': watchAnswerV1
} as const;

export type PromptName = keyof typeof PROMPTS;

/** Fills `{{name}}` placeholders; a missing variable becomes an empty string. */
export function renderPrompt(name: PromptName, vars: Record<string, string> = {}): string {
  return PROMPTS[name]
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
