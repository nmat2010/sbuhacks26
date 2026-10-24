// Agent B's IPC channels. Merged into the maps in ipc.ts; only Agent B edits this file.
// Types here are plain TypeScript (no runtime code) so renderers can import them freely; the
// main process validates inputs with Zod in the owning module.

/** Generic result for B's channels. */
export interface BResult<T = undefined> {
  success: boolean;
  /** Friendly, user-facing message when success is false. */
  error?: string;
  data?: T;
}

// ---- Voice -----------------------------------------------------------------------------------

export interface VoiceStatus {
  /** Voice mode toggle (settings voice.enabled). */
  enabled: boolean;
  sttProvider: string;
  ttsProvider: string;
  /** Mic currently live (session active + voice on + not paused). */
  micLive: boolean;
  /** False when no ElevenLabs key is set: voice falls back to typed utterances (mock). */
  hasVoiceKey: boolean;
}

// ---- Goals and plan (SPEC Phase 5) -----------------------------------------------------------

export type GoalType = 'research' | 'job' | 'project' | 'course' | 'other';
export type PlanItemStatus = 'pending' | 'in_progress' | 'completed';

export interface PlanOnboardingInput {
  /** YYYY-MM-DD */
  semesterStart: string;
  semesterEnd: string;
  courses: Array<{
    name: string;
    credits: number;
    importantDates: Array<{ title: string; date: string }>;
  }>;
  /** Free hours per week for goals. */
  weeklyHours: number;
  goals: Array<{
    /** Present when editing an existing goal. */
    id?: string;
    title: string;
    type: GoalType;
    targetDate?: string;
  }>;
}

export interface PlanItemView {
  id: string;
  goalId: string;
  title: string;
  dueDate: string | null;
  status: PlanItemStatus;
  notes: string | null;
  position: number;
  milestoneId: string | null;
  estimatedHours: number | null;
  source: 'generated' | 'user' | 'paper';
}

export interface PlanMilestoneView {
  id: string;
  /** Monday-ish start of the week, YYYY-MM-DD */
  weekStart: string;
  title: string;
}

export interface PlanGoalView {
  id: string;
  title: string;
  type: GoalType;
  targetDate: string | null;
  status: 'active' | 'completed' | 'archived';
  rationale: string | null;
  milestones: PlanMilestoneView[];
  items: PlanItemView[];
}

export interface PlanView {
  goals: PlanGoalView[];
}

export interface PlanItemPatch {
  title?: string;
  dueDate?: string | null;
  status?: PlanItemStatus;
  notes?: string | null;
}

// ---- Channels --------------------------------------------------------------------------------

/** renderer -> main, request/response: 'channel': { args: [...]; result: ... } */
export interface IntelligenceInvoke {
  /**
   * A typed utterance, as if the student had said it. Used by the developer panel with the mock
   * STT provider. Result is the router's decision: 'intent:<name>', 'followup', 'ignored', 'dropped:<why>'.
   */
  'voice-utterance': { args: [text: string]; result: { success: boolean; route: string } };
  'voice-status': { args: []; result: VoiceStatus };
  /**
   * Mic frames from the hidden capture renderer: 16 kHz, 16-bit LE mono PCM. This is an invoke
   * (not a send) because the preload only exposes a generic invoke; the result is ignored.
   */
  'voice-audio-in': { args: [pcm: Uint8Array]; result: void };

  'plan-onboarding-get': { args: []; result: PlanOnboardingInput | null };
  /** Validates, stores the answers, and creates/updates the goals. Returns the goal ids in input order. */
  'plan-onboarding-save': { args: [input: PlanOnboardingInput]; result: BResult<{ goalIds: string[] }> };
  'plan-get': { args: []; result: PlanView };
  /** Generates (or regenerates) the plan for one goal or for all active goals. Slow: show a spinner. */
  'plan-generate': { args: [opts?: { goalId?: string }]; result: BResult<PlanView> };
  'plan-item-add': {
    args: [goalId: string, item: { title: string; dueDate?: string; notes?: string }];
    result: BResult<PlanItemView>;
  };
  'plan-item-update': { args: [id: string, patch: PlanItemPatch]; result: BResult<PlanItemView> };
  'plan-item-delete': { args: [id: string]; result: BResult };
  /** New order for a goal's items (ids from top to bottom). */
  'plan-reorder': { args: [goalId: string, orderedItemIds: string[]]; result: BResult };
  /** Asks for a replacement for one item. */
  'plan-item-regenerate': { args: [id: string]; result: BResult<PlanItemView> };
}

/** renderer -> main, fire-and-forget: 'channel': [...args] */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IntelligenceSend {}

/** main -> renderer events: 'channel': payload */
export interface IntelligenceEvents {
  /** Encoded TTS audio, in order. The first chunk of a new utteranceId starts playback. */
  'voice-audio-out': { utteranceId: number; mimeType: string; chunk: Uint8Array };
  /** Drop queued audio now (barge-in, "stop"). */
  'voice-stop-playback': { utteranceId: number };
  /** Green dot on the mascot: true while the mic is live. */
  'voice-mic': boolean;
  /** Friendly message for a bubble when voice breaks (STT reconnects exhausted). */
  'voice-trouble': string;
}
