import { HINT_LEVEL_KEYS, type HintResponse } from '@wolfie/shared';
import type { LLMProvider, LlmRequest } from './provider.js';

// Deterministic provider for DEMO_MODE=1, dev without a key, and tests. Hints are keyed by the
// demo problem ids (data-problem-id on the demo pages; SPEC 4f). It never touches the network.

interface MockHint {
  what_i_see: string;
  hint_levels: HintResponse['hint_levels'];
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
    }
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
    }
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
    }
  },
  default: {
    what_i_see: "I can see you're working on a problem.",
    hint_levels: {
      nudge: 'Try breaking the problem into smaller steps.',
      hint: 'What information do you have, and what are you trying to find?',
      explanation: 'Complex problems become easier when you identify what you know and what you need to discover.',
      analogous_example: 'Like planning a trip: you know where you are, you know where you want to go, now find the path.',
      direct_step: 'Write down what you know and what the question is asking for.'
    }
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

export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  readonly countsTowardCap = false;

  async generateJson(req: LlmRequest): Promise<unknown> {
    // Short delay so the UI shows its thinking state in demos
    await new Promise((resolve) => setTimeout(resolve, 150));
    switch (req.task) {
      case 'hints':
        return this.hints(req);
      case 'followup':
        return this.followup(req);
      default:
        // Plan, ideas and reading mocks are added by the packages that need them.
        return {};
    }
  }

  private hints(req: LlmRequest): MockHint {
    const id = typeof req.mockKey?.problemId === 'string' ? req.mockKey.problemId : undefined;
    const hint = MOCK_HINTS[id && id in MOCK_HINTS ? id : 'default'];
    return req.mockKey?.assessment === true ? assessmentSafe(hint) : hint;
  }

  private followup(req: LlmRequest): { text: string; level: number } {
    const id = typeof req.mockKey?.problemId === 'string' ? req.mockKey.problemId : undefined;
    const hint = MOCK_HINTS[id && id in MOCK_HINTS ? id : 'default'];
    const current = Number(req.mockKey?.currentLevel ?? 1);
    const level = Math.min(5, Math.max(1, current + 1));
    return { text: hint.hint_levels[HINT_LEVEL_KEYS[level - 1]], level };
  }
}
