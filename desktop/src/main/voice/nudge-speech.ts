import type { Nudge } from '@wolfie/shared';

// Any nudge with `spokenText` is spoken when voice mode is on (SPEC Phase 3: "spoken if voice
// mode is on"; Phase 4e: first two sentences of a hint). One hook here means distraction warnings,
// streak messages and hint bubbles all get voice without each module calling TTS itself.
// The level-3 stuck offer deliberately has no spokenText: level 4 speaks it.

export interface NudgeEmitterLike {
  on(event: 'show', listener: (nudge: Nudge) => void): unknown;
  off(event: 'show', listener: (nudge: Nudge) => void): unknown;
}

export function attachNudgeSpeech(
  queue: NudgeEmitterLike,
  speakIfVoice: (text: string) => Promise<boolean> | boolean
): () => void {
  const listener = (nudge: Nudge) => {
    if (nudge.spokenText) void Promise.resolve(speakIfVoice(nudge.spokenText)).catch(() => undefined);
  };
  queue.on('show', listener);
  return () => void queue.off('show', listener);
}
