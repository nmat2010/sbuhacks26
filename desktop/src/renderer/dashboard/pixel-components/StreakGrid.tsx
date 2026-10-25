import type { DayStatus } from '../types/wolfie';
import './StreakGrid.css';

export interface StreakGridProps {
  days: Array<{ date: string; status: DayStatus }>;
  label: string; // for aria-label
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function StreakGrid({ days, label }: StreakGridProps) {
  // Ensure we have exactly 14 days, pad if needed
  const paddedDays = [...days];
  while (paddedDays.length < 14) {
    paddedDays.unshift({ date: '', status: 'no-session' });
  }

  const week1 = paddedDays.slice(0, 7);
  const week2 = paddedDays.slice(7, 14);

  const renderDay = (day: { date: string; status: DayStatus }, index: number) => {
    const statusClass =
      day.status === 'clean' ? 'streak-grid__day--clean' :
      day.status === 'leaned-on-ai' ? 'streak-grid__day--ai' :
      day.status === 'open' ? 'streak-grid__day--open' :
      '';

    return (
      <span
        key={index}
        className={`streak-grid__day ${statusClass}`.trim()}
        title={day.date}
      >
        {day.status === 'leaned-on-ai' ? 'X' : ''}
      </span>
    );
  };

  return (
    <div className="streak-grid" role="img" aria-label={label}>
      <div className="streak-grid__labels">
        {DAY_LABELS.map((label, i) => (
          <span key={i} className="streak-grid__label">{label}</span>
        ))}
      </div>
      <div className="streak-grid__row">
        {week1.map(renderDay)}
      </div>
      <div className="streak-grid__row">
        {week2.map(renderDay)}
      </div>
    </div>
  );
}
