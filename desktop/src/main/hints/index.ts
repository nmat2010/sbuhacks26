import { HintResponseSchema, type RequestFollowup, type RequestHints } from '@wolfie/shared';
import { getLLMClient } from '../llm/client.js';
import { renderPrompt } from '../llm/prompts/index.js';

// Seam: frozen signatures (SPEC 11, contract 3). B3a replaces these bodies with context
// assembly, logging to hint_requests, image handling, and the offline ladder. Agent A's LAN sync
// server (A8) routes web app hint.request / hint.followup messages here.

const LlmHintOutput = HintResponseSchema.omit({ offline: true });

export const requestHints: RequestHints = async (context, source, assessment) => {
  const out = await getLLMClient().generate({
    task: 'hints',
    system: renderPrompt('tutor.v1'),
    messages: [{ role: 'user', content: JSON.stringify({ source, page: context.pageSummary }) }],
    schema: LlmHintOutput,
    mockKey: { problemId: context.problemId ?? context.pageSummary?.problemId, assessment }
  });
  return { ...out, offline: false };
};

export const requestFollowup: RequestFollowup = async (followup) => {
  throw new Error(`requestFollowup not implemented yet (B3a); request ${followup.requestId}`);
};
