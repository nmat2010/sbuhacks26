import type { HintContext, HintSourceType, PageSummary } from '@wolfie/shared';
import { renderPrompt, type PromptName } from '../llm/prompts/index.js';

// Turns a HintContext into the system prompt and the user message. Page text goes to the model
// (that is what the student accepted when they asked for a hint) but is never logged.

const SOURCE_PROMPT: Record<HintSourceType, PromptName> = {
  screen: 'source-screen.v1',
  page: 'source-page.v1',
  handwriting: 'source-handwriting.v1',
  camera: 'source-camera.v1'
};

export function buildSystemPrompt(kind: 'ladder' | 'followup', source: HintSourceType, assessment: boolean): string {
  return renderPrompt(kind === 'ladder' ? 'tutor.v1' : 'tutor-followup.v1', {
    assessment_rules: assessment ? renderPrompt('assessment.v1') : '',
    source_notes: renderPrompt(SOURCE_PROMPT[source])
  });
}

function describePage(page: PageSummary): string {
  const lines: string[] = [`Page title: ${page.title}`, `Site: ${page.domain}`];
  if (page.headings.length) lines.push(`Headings: ${page.headings.slice(0, 12).join(' | ')}`);
  if (page.problemRegion) lines.push(`Problem region: ${page.problemRegion}`);
  if (page.visibleText) lines.push(`Visible text:\n${page.visibleText}`);
  if (page.errorMessages.length) lines.push(`Error messages: ${page.errorMessages.join(' | ')}`);
  if (page.openDialogs.length) lines.push(`Open dialogs: ${page.openDialogs.join(' | ')}`);
  const controls = page.controls
    .slice(0, 40)
    .map((c) => `${c.role} "${c.label}" (${c.state})`)
    .join('; ');
  if (controls) lines.push(`Controls: ${controls}`);
  return lines.join('\n');
}

/** What the student is working on, as text. Images are attached separately. */
export function describeContext(context: HintContext, source: HintSourceType, hasImage: boolean): string {
  const parts: string[] = [`Source: ${source}.`];
  if (context.focus) {
    parts.push(
      `FOCUS: help only with this problem (other problems on screen are not part of this request):\n${context.focus}`
    );
  }
  if (context.sessionContext) {
    parts.push(`What the student has been studying this session (Watch mode notes):\n${context.sessionContext}`);
  }
  if (context.pageSummary) parts.push(describePage(context.pageSummary));
  if (hasImage) parts.push('An image of the student\'s work is attached.');
  if (!context.pageSummary && !hasImage) parts.push('No page text or image is available.');
  return parts.join('\n\n');
}
