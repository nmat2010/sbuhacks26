import type { Outcome } from '../types/wolfie';
import './OutcomeTag.css';

export interface OutcomeTagProps {
  outcome: Outcome;
}

const OUTCOME_LABELS: Record<Outcome, string> = {
  solved: 'SOLVED',
  hinted: 'HINTED',
  stuck: 'STUCK'
};

export function OutcomeTag({ outcome }: OutcomeTagProps) {
  return (
    <span className={`outcome-tag outcome-tag--${outcome}`}>
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}
