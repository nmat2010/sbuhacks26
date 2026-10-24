import type { RequestFollowup, RequestHints } from '@wolfie/shared';
import { getLLMProvider } from '../llm/client.js';

// Seam: frozen signatures (SPEC 11, contract 3). Agent B (B3) replaces the bodies with context
// assembly, logging to hint_requests, image handling, and the offline ladder. Agent A's LAN sync
// server (A8) routes web app hint.request / hint.followup messages here.

export const requestHints: RequestHints = (context, source, assessment) =>
  getLLMProvider().requestHints(context, source, assessment);

export const requestFollowup: RequestFollowup = async (followup) => {
  throw new Error(`requestFollowup not implemented yet (B3); request ${followup.requestId}`);
};
