import { HINT_LEVEL_KEYS, type HintResponse } from '@wolfie/shared';
import type { HintContext, HintSourceType } from '@wolfie/shared';
import type { LLMProvider, LlmRequest } from './provider.js';
import { mockPlan } from './mock-plan.js';
import { mockIdeas } from './mock-ideas.js';
import { mockReading } from './mock-reading.js';
import { mockSessionReport, mockWatchAnswer, mockWatchObserve } from './mock-watch.js';

// Deterministic provider for DEMO_MODE=1, dev without a key, and tests. Hints are keyed by the
// demo problem ids (data-problem-id on the demo pages; SPEC 4f). It never touches the network.

interface MockHint {
  what_i_see: string;
  hint_levels: HintResponse['hint_levels'];
  /** What "Show the answer" returns outside assessment mode. */
  answer: string;
}

export const MOCK_HINTS: Record<string, MockHint> = {
  'demo-algebra-problem': {
    what_i_see: 'I see an algebra problem asking you to solve for x in the equation 2x + 5 = 13.',
    hint_levels: {
      nudge: 'What operation would help you isolate the variable?',
      hint: 'Try moving the constant term to the other side of the equation.',
      explanation: 'In algebra, we use inverse operations to isolate variables. Subtraction undoes addition.',
      analogous_example: 'If you had 2y + 3 = 11, you would subtract 3 from both sides to get 2y = 8.',
      direct_step: 'Subtract 5 from both sides: 2x + 5 - 5 = 13 - 5, which gives you 2x = 8.'
    },
    answer: 'x = 4. Subtracting 5 from both sides gives 2x = 8, and dividing both sides by 2 gives x = 4.'
  },
  'demo-disabled-button': {
    what_i_see: 'I see a form with a Continue button that appears to be disabled.',
    hint_levels: {
      nudge: 'Have you filled in all the required fields?',
      hint: 'Look for any fields marked with an asterisk or highlighted in red.',
      explanation:
        'Forms often disable submit buttons until all required information is provided. This prevents incomplete submissions.',
      analogous_example: 'Like a checkout button on a shopping site that only activates after entering your address.',
      direct_step: 'Check the email field at the top - it appears to be empty and is required.'
    },
    answer: 'Fill in the email field at the top. Once every required field has a value, Continue becomes enabled.'
  },
  'demo-code-error': {
    what_i_see: 'I see code with a test failure indicating "expected 5 but got undefined".',
    hint_levels: {
      nudge: 'What is the function supposed to return?',
      hint: 'Check if your function has a return statement.',
      explanation: 'Functions in JavaScript return undefined by default unless you explicitly return a value.',
      analogous_example:
        'function add(a, b) { a + b } returns undefined, but function add(a, b) { return a + b } returns the sum.',
      direct_step: 'Add "return" before the expression on line 3.'
    },
    answer: 'Change line 3 to "return a + b;". Without return the function gives back undefined, which is why the test sees undefined instead of 5.'
  },
  // Handwriting / camera demos (SPEC Phase 12). The web app's pre-filled demo canvas uses
  // problemId 'demo-handwriting'; 'demo-camera' covers the photographed-paper demo.
  'demo-handwriting': {
    what_i_see: 'I can read your handwriting: you are differentiating f(x) = x^2 sin(x) and wrote 2x cos(x).',
    hint_levels: {
      nudge: 'Look at f(x): it is two functions multiplied together. Does your answer account for both?',
      hint: 'When two functions are multiplied, each one gets its turn to be differentiated. What happened to the x^2 part?',
      explanation:
        'The product rule says the derivative of u times v is u prime times v, plus u times v prime. Differentiating only one factor, or only one piece, misses half of the terms.',
      analogous_example:
        'For g(x) = x^3 e^x, the product rule gives 3x^2 e^x + x^3 e^x. Both terms keep one factor as it was and differentiate the other.',
      direct_step: 'Write u = x^2 and v = sin(x), find u prime and v prime separately, then combine them as u prime v plus u v prime.'
    },
    answer: 'The derivative is 2x sin(x) + x^2 cos(x), from the product rule with u = x^2 and v = sin(x).'
  },
  'demo-camera': {
    what_i_see: 'I can read the photo of your paper: you are solving 3(x - 2) = 12 and wrote 3x - 2 = 12.',
    hint_levels: {
      nudge: 'Look at your second line. When you multiplied the bracket by 3, what happened to each thing inside it?',
      hint: 'The 3 has to multiply both the x and the 2. Check the second term on that line.',
      explanation:
        'Distributing means multiplying every term inside the brackets by the number outside. Skipping the second term changes the equation, so the later steps start from a different problem.',
      analogous_example: 'For 4(y + 1) = 20, distributing gives 4y + 4 = 20, not 4y + 1 = 20.',
      direct_step: 'Rewrite the second line with 3 times x and 3 times 2 both showing, then continue from there.'
    },
    answer: 'Distributing gives 3x - 6 = 12, so 3x = 18 and x = 6.'
  },
  // The writing could not be read: say what, and ask (SPEC Phase 12, "illegible or ambiguous")
  'demo-illegible': {
    what_i_see:
      'I could not read the third line: I cannot tell whether it says 3x or 8x, and the exponent on the last line is cut off.',
    hint_levels: {
      nudge: 'Before I help, can you tell me what the third line says: 3x or 8x?',
      hint: 'Could you rewrite the last line a little larger, including the exponent, so I can read it?',
      explanation:
        'Once I can read every line, I can point at exactly where the work changes direction. Until then I would only be guessing.',
      analogous_example:
        'It is like proofreading a sentence with a smudge: you need to know the word before you can say whether the sentence works.',
      direct_step: 'Rewrite the unclear part clearly, then ask me again and I will build on what I can read.'
    },
    answer: 'I cannot give an answer yet because I could not read your work. Please rewrite the unclear lines.'
  },
  // Used for handwriting / camera sources whose problem id is not a known demo
  'handwriting-default': {
    what_i_see: 'I can see your handwritten work, but I am not certain I read every line correctly.',
    hint_levels: {
      nudge: 'Which line are you least sure about? Start there and tell me what you were trying to do.',
      hint: 'Compare that line with the line before it. What changed, and why?',
      explanation:
        'Mistakes often hide at the step where one line turns into the next. Checking each change on its own makes them easy to spot.',
      analogous_example: 'Like retracing a route on a map: go one turn at a time and confirm each one before the next.',
      direct_step: 'Redo just that one step on fresh paper, writing what you do to both sides or to each term.'
    },
    answer: 'I can not safely give the answer from handwriting alone. Walk me through the step you are unsure about.'
  },
  default: {
    what_i_see: "I can see you're working on a problem.",
    hint_levels: {
      nudge: 'Try breaking the problem into smaller steps.',
      hint: 'What information do you have, and what are you trying to find?',
      explanation: 'Complex problems become easier when you identify what you know and what you need to discover.',
      analogous_example: 'Like planning a trip: you know where you are, you know where you want to go, now find the path.',
      direct_step: 'Write down what you know and what the question is asking for.'
    },
    answer: 'I can only see a little of this problem, so I can not give you its answer. Write down what you know and what is being asked, and tell me where you get stuck.'
  }
};

/** Level 5 in assessment mode is a next step in thinking, never the worked answer. */
function assessmentSafe(hint: MockHint): MockHint {
  return {
    ...hint,
    hint_levels: {
      ...hint.hint_levels,
      direct_step: `This is graded work, so I will point at the next move without finishing it for you. ${hint.hint_levels.hint}`
    }
  };
}

function pickHint(problemId: string | undefined, source: unknown): MockHint {
  if (problemId && problemId in MOCK_HINTS) return MOCK_HINTS[problemId];
  if (source === 'handwriting' || source === 'camera') return MOCK_HINTS['handwriting-default'];
  return MOCK_HINTS.default;
}

export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  readonly countsTowardCap = false;

  /** `delayMs` is a short pause so demos show a thinking state; tests pass 0. */
  constructor(private readonly opts: { delayMs?: number } = {}) {}

  async generateJson(req: LlmRequest): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, this.opts.delayMs ?? 150));
    switch (req.task) {
      case 'hints':
        return this.hints(req);
      case 'followup':
        return this.followup(req);
      case 'plan':
        return mockPlan(req.mockKey);
      case 'ideas':
        return mockIdeas(req.mockKey);
      case 'paper_answer':
        return mockReading(req.mockKey);
      case 'watch_observe':
        return mockWatchObserve(req.mockKey);
      case 'watch_answer':
        return mockWatchAnswer(req.mockKey);
      case 'session_report':
        return mockSessionReport(req.mockKey);
      case 'skills_merge':
        return { groups: [] };
      default:
        return {};
    }
  }

  /**
   * Convenience for tests and callers that want the demo ladder straight from the mock, without
   * an LLMClient (the frozen `requestHints` shape). No delay, no retries.
   */
  async requestHints(context: HintContext, source: HintSourceType, assessment: boolean): Promise<HintResponse> {
    const hint = this.hints({
      task: 'hints',
      system: '',
      messages: [],
      mockKey: { problemId: context.problemId ?? context.pageSummary?.problemId, assessment, source }
    });
    return { ...hint, offline: false };
  }

  private hints(req: LlmRequest): MockHint {
    const id = typeof req.mockKey?.problemId === 'string' ? req.mockKey.problemId : undefined;
    const hint = pickHint(id, req.mockKey?.source);
    return req.mockKey?.assessment === true ? assessmentSafe(hint) : hint;
  }

  private followup(req: LlmRequest): { text: string; level: number } {
    const id = typeof req.mockKey?.problemId === 'string' ? req.mockKey.problemId : undefined;
    const hint = pickHint(id, req.mockKey?.source);
    // The fixed "Show the answer" request (outside assessment mode) gets the worked answer
    if (req.mockKey?.assessment !== true && /show me the answer/i.test(String(req.mockKey?.utterance ?? ''))) {
      return { text: hint.answer, level: 5 };
    }
    const current = Number(req.mockKey?.currentLevel ?? 1);
    const level = Math.min(5, Math.max(1, current + 1));
    return { text: hint.hint_levels[HINT_LEVEL_KEYS[level - 1]], level };
  }
}
