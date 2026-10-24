// The escalation engine lives in @wolfie/shared so the desktop and the web app share one
// implementation, tested against shared/src/fixtures/escalation.json.
export {
  computeLevel,
  applyEscalationEvent,
  initialEscalationState,
  targetLevel,
  ESCALATION_TIMING,
  type EscalationState,
  type EscalationEvent
} from '@wolfie/shared';
