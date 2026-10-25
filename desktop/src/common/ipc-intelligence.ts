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
  /** Something to tell the student (missing key or voice id); null when voice is fully set up. */
  note: string | null;
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

// ---- Ideas and papers (SPEC Phase 6) ---------------------------------------------------------

export interface ProjectIdea {
  title: string;
  scope: string;
  skills: string[];
  firstWeekTask: string;
}

/** A recommended paper that was found through arXiv or Semantic Scholar (never an unverified one). */
export interface SuggestedPaper {
  title: string;
  authors: string[];
  year: number | null;
  /** One line on why it is worth reading (from the model). */
  why: string;
  /** The verified link. */
  url: string;
  source: 'arxiv' | 'semantic_scholar' | 'demo_catalog';
  arxivId: string | null;
}

export interface IdeasResult {
  goalId: string;
  ideas: ProjectIdea[];
  papers: SuggestedPaper[];
  /** How many recommended papers could not be verified and were dropped. */
  dropped: number;
  /** True when papers could not be checked at all (offline or rate limited), so none are shown. */
  verificationUnavailable: boolean;
}

export type PaperStatus = 'pending' | 'reading' | 'completed';

export interface PaperView {
  id: string;
  goalId: string | null;
  title: string;
  /** Link, or a local file path for uploaded PDFs. */
  urlOrPath: string;
  status: PaperStatus;
  addedAt: number;
  authors: string[];
  year: number | null;
  arxivId: string | null;
  questionCount: number;
  /** True once the text has been extracted and the paper can be read with Wolfie. */
  readable: boolean;
}

export interface AddPaperInput {
  title: string;
  url: string;
  goalId?: string;
  authors?: string[];
  year?: number;
  arxivId?: string;
  /** If set (YYYY-MM-DD) and a goal is given, also creates the plan item "Read: <title>". */
  planItemDueDate?: string;
}

// ---- Paper reading (SPEC Phase 7) -------------------------------------------------------------

export type ReadingMode = 'explain' | 'check' | 'where';

export interface PaperCitation {
  /** Heading the passage sits under, e.g. "3.2 Procedure". */
  section: string;
  page: number | null;
  /** The start of the cited passage, for hover or "show me where". */
  snippet: string;
  chunkId: number;
}

export interface PaperAnswer {
  paperId: string;
  question: string;
  mode: ReadingMode;
  /** The text to show (and, in voice mode, the first two sentences are spoken). */
  answer: string;
  /** True only if the answer is based on passages of this paper, which are listed in `citations`. */
  grounded: boolean;
  /** Always shown with the answer: "From the paper" or "General knowledge (not from this paper)". */
  label: string;
  citations: PaperCitation[];
}

export interface PaperQuestionView {
  id: number;
  question: string;
  answer: string;
  inputMode: 'text' | 'voice';
  ts: number;
  mode: ReadingMode;
  grounded: boolean;
  citations: PaperCitation[];
}

export interface PaperSection {
  title: string;
  page: number | null;
  /** The section's text, paragraphs separated by blank lines. */
  text: string;
}

export interface AskPaperInput {
  paperId: string;
  question: string;
  mode: ReadingMode;
  inputMode: 'text' | 'voice';
  /** Text the student selected in the reading view ("what does this mean?"). */
  selection?: string;
}

// ---- Watch mode (WATCH_MODE.md) -----------------------------------------------------------------

export type WatchState =
  | 'off'
  /** Turned on, but the consent screen hasn't been accepted. */
  | 'needs_consent'
  /** On, but no session is running or monitoring is paused. */
  | 'idle'
  | 'watching'
  /** The window in front is excluded or private (nothing is captured). */
  | 'skipping'
  /** No keyboard or mouse input for 10+ minutes: nothing is looked at until the student is back. */
  | 'away'
  | 'no_permission'
  | 'limit_reached'
  | 'error';

export interface WatchStatus {
  enabled: boolean;
  consented: boolean;
  state: WatchState;
  /** From the latest observation; null before the first one. */
  mode: 'learning' | 'homework' | 'other' | null;
  activity: string | null;
  subject: string | null;
  lastObservedAt: number | null;
  /** The window being looked at right now ("Google Chrome — Practice: Linear equations"), before the model has answered. */
  looking: string | null;
  /** When `looking` last changed; a description older than this is about the previous window. */
  lookingSince: number | null;
  /** Why nothing is being watched right now, in words for the student; null when watching normally. */
  note: string | null;
  intervalSeconds: number;
  autoImportPapers: boolean;
  excludedApps: string[];
}

export interface WatchPatch {
  enabled?: boolean;
  intervalSeconds?: number;
  autoImportPapers?: boolean;
  excludedApps?: string[];
}

export interface WatchCitation {
  n: number;
  kind: 'paper' | 'video' | 'note';
  title: string;
  /** Section and page, or a video timestamp. */
  locator: string | null;
  url: string | null;
}

export interface WatchAnswer {
  question: string;
  mode: 'learning' | 'homework' | 'other';
  answer: string;
  /** True only when the answer is based on sources from this session (listed in citations). */
  grounded: boolean;
  /** Always shown with the answer, e.g. "From your session" or "Hint (homework mode...)". */
  label: string;
  citations: WatchCitation[];
}

/** One message in Wolfie's chat history (overlay chat panel). */
export interface ChatMessageView {
  id: string;
  ts: number;
  role: 'user' | 'wolfie';
  text: string;
  label?: string;
  citations?: WatchCitation[];
  /** For help-flow bubbles: answer their buttons with nudge-response. */
  nudgeId?: string;
  buttons?: Array<{ label: string; action: string; variant?: 'primary' | 'secondary' | 'danger' }>;
  /** The buttons were used (or the step moved on): show them as inactive. */
  answered?: boolean;
}

export interface WatchMemoryView {
  sources: Array<{
    kind: string;
    title: string;
    url: string | null;
    paperId: string | null;
    /** Watch mode's import of this paper (null if not a paper or not tried). */
    paperImport: { status: 'importing' | 'imported' | 'failed'; at: number; error?: string } | null;
    lastSeen: number;
    minutes: number;
    locators: string[];
    points: string[];
  }>;
  recent: Array<{ ts: number; activity: string; mode: string; summary: string }>;
}

// ---- Channels --------------------------------------------------------------------------------

/** renderer -> main, request/response: 'channel': { args: [...]; result: ... } */
export interface IntelligenceInvoke {
  /**
   * A typed utterance, as if the student had said it. Used by the developer panel with the mock
   * STT provider. Result is the router's decision: 'intent:<name>', 'followup', 'ignored', 'dropped:<why>'.
   */
  'voice-utterance': { args: [text: string]; result: { success: boolean; route: string } };
  'watch-get': { args: []; result: WatchStatus };
  /** Turning Watch mode on fails until the consent screen has been accepted. */
  'watch-set': { args: [patch: WatchPatch]; result: BResult<WatchStatus> };
  /** The consent screen's answer. Declining also turns Watch mode off. */
  'watch-consent': { args: [accepted: boolean]; result: WatchStatus };
  'watch-memory-get': { args: []; result: WatchMemoryView };
  'watch-memory-clear': { args: []; result: WatchStatus };
  /**
   * The overlay chat panel. With a hint ladder or an explanation open, the text is a follow-up to
   * it (the reply arrives as a 'stuck' nudge, like the ladder). Otherwise it is a question,
   * answered from the session when Watch mode is on, or from general knowledge when it is off.
   */
  'chat-send': {
    args: [text: string];
    result: { kind: 'answer'; answer: WatchAnswer } | { kind: 'followup' } | { kind: 'error'; error: string };
  };
  /** The chat history (kept across closing the chat and restarts). */
  'chat-history': { args: []; result: ChatMessageView[] };
  'chat-clear': { args: []; result: { success: boolean } };
  /** "Help me with this" from the chat: recorded, then the help flow starts. */
  'chat-help': { args: []; result: { success: boolean } };
  /** A question about what the student is studying, answered from the whole session. */
  'watch-ask': { args: [input: { question: string; inputMode: 'text' | 'voice' }]; result: BResult<WatchAnswer> };
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

  /** Slow (paper checks are rate limited to one request per 3 s): show a spinner. */
  'ideas-suggest': { args: [goalId: string]; result: BResult<IdeasResult> };
  /** Adds a paper (and optionally the plan item "Read: <title>"). Adding the same link twice returns the existing paper. */
  'paper-add': { args: [input: AddPaperInput]; result: BResult<{ paper: PaperView; planItemId: string | null }> };
  'papers-list': { args: []; result: PaperView[] };
  'paper-set-status': { args: [id: string, status: PaperStatus]; result: BResult<PaperView> };
  'paper-delete': { args: [id: string]; result: BResult };

  /** Opens a file picker (PDF). Resolves with the new paper, or success:false with no error if cancelled. */
  'paper-import-pdf': { args: []; result: BResult<{ paper: PaperView }> };
  /** An arXiv link or id (abs/pdf URL, "2301.12345", "arXiv:2301.12345v2"): downloads the PDF and reads it. */
  'paper-import-arxiv': { args: [urlOrId: string, goalId?: string]; result: BResult<{ paper: PaperView }> };
  /** Makes a library paper readable by fetching its arXiv PDF (for papers added from recommendations). */
  'paper-make-readable': { args: [id: string]; result: BResult<{ paper: PaperView }> };
  /** The paper's text by section, for the reading view. */
  'paper-content': { args: [id: string]; result: BResult<{ paper: PaperView; sections: PaperSection[] }> };
  /** Ask about the paper: explain simply, a check-my-understanding question, or show me where. */
  'paper-ask': { args: [input: AskPaperInput]; result: BResult<PaperAnswer> };
  'paper-questions': { args: [paperId: string]; result: PaperQuestionView[] };
  /**
   * The paper open in the reading view. While set, spoken questions that are not commands are
   * answered from this paper and delivered on the 'paper-answer' event.
   */
  'paper-focus': { args: [paperId: string | null]; result: void };
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
  /** A spoken question answered from the focused paper (the answer is also spoken, first two sentences). */
  'paper-answer': PaperAnswer;
  /** Watch mode changed state (for the watching indicator on the mascot). */
  'watch-state': WatchStatus;
  /** An answer to a spoken Watch-mode question (typed ones come back from watch-ask). */
  'watch-answer': WatchAnswer;
  /** The chat history changed (new message, a step answered, cleared): the full list. */
  'chat-history-changed': ChatMessageView[];
}
