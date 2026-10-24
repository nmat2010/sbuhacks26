import { HintResponse } from '@wolfie/shared';
import { LLMProvider, HintContext, ChatMessage } from './provider.js';

export class MockLLMProvider implements LLMProvider {
  name = 'mock';

  private demoHints: Record<string, HintResponse> = {
    'demo-algebra-problem': {
      what_i_see: 'I see an algebra problem asking you to solve for x in the equation 2x + 5 = 13.',
      hint_levels: {
        nudge: 'What operation would help you isolate the variable?',
        hint: 'Try moving the constant term to the other side of the equation.',
        explanation: 'In algebra, we use inverse operations to isolate variables. Subtraction undoes addition.',
        analogous_example: 'If you had 2y + 3 = 11, you would subtract 3 from both sides to get 2y = 8.',
        direct_step: 'Subtract 5 from both sides: 2x + 5 - 5 = 13 - 5, which gives you 2x = 8.'
      },
      offline: false
    },
    'demo-disabled-button': {
      what_i_see: 'I see a form with a Continue button that appears to be disabled.',
      hint_levels: {
        nudge: 'Have you filled in all the required fields?',
        hint: 'Look for any fields marked with an asterisk or highlighted in red.',
        explanation: 'Forms often disable submit buttons until all required information is provided. This prevents incomplete submissions.',
        analogous_example: 'Like a checkout button on a shopping site that only activates after entering your address.',
        direct_step: 'Check the email field at the top - it appears to be empty and is required.'
      },
      offline: false
    },
    'demo-code-error': {
      what_i_see: 'I see code with a test failure indicating "expected 5 but got undefined".',
      hint_levels: {
        nudge: 'What is the function supposed to return?',
        hint: 'Check if your function has a return statement.',
        explanation: 'Functions in JavaScript return undefined by default unless you explicitly return a value.',
        analogous_example: 'function add(a, b) { a + b } returns undefined, but function add(a, b) { return a + b } returns the sum.',
        direct_step: 'Add "return" before the expression on line 3.'
      },
      offline: false
    },
    'default': {
      what_i_see: 'I can see you\'re working on a problem.',
      hint_levels: {
        nudge: 'Try breaking the problem into smaller steps.',
        hint: 'What information do you have, and what are you trying to find?',
        explanation: 'Complex problems become easier when you identify what you know and what you need to discover.',
        analogous_example: 'Like planning a trip: you know where you are, you know where you want to go, now find the path.',
        direct_step: 'Write down what you know and what the question is asking for.'
      },
      offline: false
    }
  };

  async requestHints(context: HintContext): Promise<HintResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if there's a demo problem ID in the context
    const demoId = this.extractDemoId(context);
    const hints = this.demoHints[demoId] || this.demoHints['default'];

    // In assessment mode, modify the hints to not give direct answers
    if (context.assessment) {
      return {
        ...hints,
        hint_levels: {
          ...hints.hint_levels,
          direct_step: 'In assessment mode, I can guide you through the thinking process, but the final answer is yours to discover. ' + hints.hint_levels.explanation
        }
      };
    }

    return hints;
  }

  async chatCompletion(messages: ChatMessage[], schema?: any): Promise<any> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simple mock response based on the last message
    const lastMessage = messages[messages.length - 1];

    if (schema) {
      // Return a mock structured response
      return {
        response: `Mock response to: ${lastMessage.content}`,
        timestamp: Date.now()
      };
    }

    return {
      role: 'assistant',
      content: `Mock response to: ${lastMessage.content}`
    };
  }

  private extractDemoId(context: HintContext): string {
    // Try to extract demo ID from page summary or image path
    if (context.pageSummary?.problemId) {
      return context.pageSummary.problemId;
    }
    if (context.imagePath?.includes('demo-')) {
      const match = context.imagePath.match(/demo-([^/]+)/);
      return match ? `demo-${match[1]}` : 'default';
    }
    return 'default';
  }
}
