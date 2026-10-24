import { SettingsDefaults, type StruggleSignal } from '@wolfie/shared';

// Struggle-signal detectors for the web (SPEC 4b). Cheap, local, no model calls. They are pure
// state machines over events with an injected clock, so every threshold is unit-testable.
// Signals carry a type, strength and ids only: never page text.

export interface DetectorConfig {
  wrongAnswerCount: number;
  deadClickCount: number;
  deadClickWindowMs: number;
  validationErrorCount: number;
  validationWindowMs: number;
}

/** The extension has no channel for desktop settings, so it uses the shared defaults. */
export function defaultDetectorConfig(): DetectorConfig {
  const t = SettingsDefaults['stuck.thresholds'];
  return {
    wrongAnswerCount: t.wrongAnswerCount,
    deadClickCount: t.deadClickCount,
    deadClickWindowMs: t.deadClickWindowSec * 1000,
    validationErrorCount: t.validationErrorCount,
    validationWindowMs: t.validationWindowSec * 1000
  };
}

// ---- result text classification ------------------------------------------------------------

const VALIDATION = /\b(required|is required|invalid|please (enter|fill|select|provide|choose|check)|must be|cannot be (empty|blank)|can't be (empty|blank)|too (short|long)|not a valid|missing)\b/i;
const FAILURE =
  /\b(incorrect|wrong|not correct|try again|failed|failure|fail\b|error|exception|traceback|didn'?t pass|did not pass|does not match|doesn'?t match|not quite|not right|unsuccessful|wrong answer|time limit exceeded|runtime error|compilation error|syntaxerror)\b|✗|✘|❌/i;
const SUCCESS = /\b(correct!?|you got it|well done|great job|all (tests|test cases) passed|passed|accepted|success|nice work|right!)\b|✓|✔|✅/i;

export interface ResultKind {
  failed: boolean;
  validation: boolean;
  success: boolean;
}

/** Classifies the feedback texts that appeared after a submit-like action. */
export function classifyFeedback(texts: string[]): ResultKind {
  let failed = false;
  let validation = false;
  let success = false;
  for (const t of texts) {
    if (VALIDATION.test(t)) validation = true;
    else if (FAILURE.test(t)) failed = true;
    // "Incorrect" contains "correct": a failure message is never also a success.
    else if (SUCCESS.test(t)) success = true;
  }
  if (failed || validation) success = false;
  return { failed, validation, success };
}

/** Buttons / forms that mean "check my answer". */
export const SUBMIT_LABEL = /\b(check|submit|run|test|verify|answer|done|finish|grade|save)\b|check answer/i;

// ---- detectors -----------------------------------------------------------------------------

export class SignalDetectors {
  private problemId: string | undefined;
  private failures = 0;
  private validationAt: number[] = [];
  private deadClicks = new Map<string, number[]>();

  constructor(
    private readonly opts: { now(): number; emit(signal: StruggleSignal): void; config?: DetectorConfig }
  ) {}

  private get config(): DetectorConfig {
    return this.opts.config ?? defaultDetectorConfig();
  }

  /** The problem on screen changed: failed-check counts belong to one problem. */
  setProblem(problemId: string | undefined): void {
    if (problemId === this.problemId) return;
    this.problemId = problemId;
    this.failures = 0;
  }

  /**
   * A submit-like action finished and the page showed `result`. Failed checks accumulate per
   * problem (strong `wrong_answer_loop` from the second one); a success resets the count;
   * validation errors are counted separately in a time window (weak `validation_errors`).
   */
  noteResult(result: ResultKind): void {
    const now = this.opts.now();
    const cfg = this.config;
    if (result.success) {
      this.failures = 0;
      return;
    }
    if (result.failed) {
      this.failures++;
      if (this.failures >= cfg.wrongAnswerCount) {
        this.opts.emit({
          type: 'wrong_answer_loop',
          strength: 'strong',
          timestamp: now,
          problemId: this.problemId,
          metadata: { attempts: this.failures }
        });
      }
    }
    if (result.validation) {
      this.validationAt = this.validationAt.filter((t) => now - t <= cfg.validationWindowMs);
      this.validationAt.push(now);
      if (this.validationAt.length >= cfg.validationErrorCount) {
        this.opts.emit({
          type: 'validation_errors',
          strength: 'weak',
          timestamp: now,
          problemId: this.problemId,
          metadata: { errors: this.validationAt.length }
        });
      }
    }
  }

  /** A click on a disabled control, or one that changed nothing. */
  noteDeadClick(controlId: string): void {
    const now = this.opts.now();
    const cfg = this.config;
    const times = (this.deadClicks.get(controlId) ?? []).filter((t) => now - t <= cfg.deadClickWindowMs);
    times.push(now);
    this.deadClicks.set(controlId, times);
    if (times.length >= cfg.deadClickCount) {
      this.opts.emit({
        type: 'dead_control_clicks',
        strength: 'strong',
        timestamp: now,
        problemId: this.problemId,
        metadata: { controlId, clicks: times.length }
      });
    }
  }
}
