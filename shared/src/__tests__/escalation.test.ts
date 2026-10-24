import { describe, expect, it } from 'vitest';
import { escalation } from '../fixtures/index.js';
import { runEscalationScenario, type EscalationFixture } from '../testing/index.js';

const fixture = escalation as unknown as EscalationFixture;

describe('computeLevel against shared/fixtures/escalation.json', () => {
  it.each(fixture.scenarios.map((s) => [s.name, s] as const))('%s', (_name, scenario) => {
    expect(runEscalationScenario(fixture, scenario)).toEqual(scenario.expected);
  });
});
