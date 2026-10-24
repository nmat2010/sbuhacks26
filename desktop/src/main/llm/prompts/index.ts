import tutorV1 from './tutor.v1.md?raw';
import tutorFollowupV1 from './tutor-followup.v1.md?raw';

// Versioned prompt files (SPEC 6: prompts are files, not inline strings). To change a prompt,
// add a new version file and point the caller at it; the old one stays for comparison.

export const PROMPTS = {
  'tutor.v1': tutorV1,
  'tutor-followup.v1': tutorFollowupV1
} as const;

export type PromptName = keyof typeof PROMPTS;

/** Fills `{{name}}` placeholders; a missing variable becomes an empty string. */
export function renderPrompt(name: PromptName, vars: Record<string, string> = {}): string {
  return PROMPTS[name]
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
