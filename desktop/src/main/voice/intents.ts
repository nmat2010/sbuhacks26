import { normalizeText } from './text.js';

// Local voice intents (SPEC Phase 1, 4d, 3): parsed from a transcript with no model call, so
// they answer well under 200 ms. Matching is deliberately strict: the whole utterance must be the
// phrase (plus polite filler), so "I don't get step 2" or "can't stop at step 2" never trigger one.

export type VoiceIntent =
  | 'stop' // stop talking: "stop", "wait", "hold on", "quiet"
  | 'snooze'
  | 'mute'
  | 'im_good' // decline an offer
  | 'another_hint'
  | 'got_it'
  | 'repeat'
  | 'stuck' // starts the hint flow
  | 'show_answer'
  // Phase 3 answers to a distraction / AI-tool nudge
  | 'taking_a_break'
  | 'need_this'
  | 'ignore';

const PATTERNS: Array<[VoiceIntent, string[]]> = [
  ['stop', ['stop', 'stop talking', 'stop it', 'wait', 'wait a sec', 'wait a second', 'wait a minute', 'hold on', 'hold on a sec', 'hold on a second', 'hold up', 'quiet', 'be quiet', 'shush', 'enough', 'thats enough']],
  ['snooze', ['snooze', 'snooze wolfie', 'snooze for 30 minutes', 'snooze for thirty minutes', 'snooze for half an hour']],
  ['mute', ['mute', 'mute wolfie', 'mute voice', 'mute the mic', 'turn off voice', 'voice off']],
  ['im_good', ['im good', 'i am good', 'im fine', 'im ok', 'im okay', 'i am okay', 'no thanks', 'no thank you', 'not now', 'i dont need help', 'i dont need a hint']],
  ['another_hint', ['another hint', 'another one', 'one more hint', 'next hint', 'give me another hint', 'give me another one', 'give me one more hint', 'i need another hint', 'more help', 'a bigger hint']],
  ['got_it', ['i got it', 'got it', 'i get it', 'i get it now', 'i figured it out', 'i figured it out now', 'i understand now', 'that helps']],
  ['repeat', ['repeat that', 'repeat', 'say that again', 'say it again', 'what was that', 'what did you say', 'come again', 'repeat please']],
  ['stuck', ['im stuck', 'i am stuck', 'i am so stuck', 'im really stuck', 'i need help', 'i need a hint', 'help me', 'give me a hint', 'can i get a hint', 'hint please', 'hint']],
  ['show_answer', ['show the answer', 'show me the answer', 'give me the answer', 'whats the answer', 'what is the answer']],
  ['taking_a_break', ['taking a break', 'im taking a break', 'i am taking a break', 'just a break', 'on a break', 'break time']],
  ['need_this', ['i need this', 'i need this for the task', 'i need this for my task', 'i need this for the assignment', 'i need this for class', 'i need this for work', 'this is for the task', 'its for the task', 'its for class']],
  ['ignore', ['ignore', 'ignore it', 'ignore this', 'ignore for this session', 'ignore for the session', 'ignore that', 'dont warn me again', 'dont remind me again']]
];

const FILLER_PREFIX = /^(?:(?:hey|ok|okay|um|uh|so|well|please|yeah|yes|wolfie|hey wolfie|ok wolfie|okay wolfie)\s+)+/;
const FILLER_SUFFIX = /(?:\s+(?:please|now|thanks|thank you|wolfie|for now|right now))+$/;

const LOOKUP = new Map<string, VoiceIntent>();
for (const [intent, phrases] of PATTERNS) for (const phrase of phrases) LOOKUP.set(phrase, intent);

/** Returns the intent if the whole utterance is one of the phrases, else null. */
export function parseIntent(transcript: string): VoiceIntent | null {
  let text = normalizeText(transcript);
  if (!text) return null;
  const direct = LOOKUP.get(text);
  if (direct) return direct;
  text = text.replace(FILLER_PREFIX, '').replace(FILLER_SUFFIX, '').trim();
  return LOOKUP.get(text) ?? null;
}
