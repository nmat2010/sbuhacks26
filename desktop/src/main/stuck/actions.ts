// Button action strings for the stuck-detection offer and the hint ladder bubbles. The overlay
// sends them back on `nudge-response`; the escalation engine (offer) and the hint flow (ladder)
// map them to behavior. Some match what Thu's overlay already uses ('accept_hint', 'decline').

export const ACTIONS = {
  // The level-3 offer ("Want a hint?")
  ACCEPT_HINT: 'accept_hint',
  DECLINE: 'decline',
  IM_GOOD: 'im_good',
  // Ladder bubbles
  ANOTHER_HINT: 'another_hint',
  GOT_IT: 'got_it',
  SHOW_ANSWER: 'show_answer'
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/** Responses the overlay generates itself. A timeout is not a decline; a dismissal is. */
export const AUTO_RESPONSES = {
  TIMEOUT: 'timeout',
  DISMISSED: 'dismissed'
} as const;
