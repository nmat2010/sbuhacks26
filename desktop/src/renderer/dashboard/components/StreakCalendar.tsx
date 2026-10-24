import type { StreakSnapshotType } from '@wolfie/shared';
import './StreakCalendar.css';

interface StreakCalendarProps {
  streak: StreakSnapshotType;
  onUseFreeze?: () => void;
}

const STATUS_INFO = {
  filled: { emoji: '🔥', color: '#CC0000', label: 'Completed' },
  missed: { emoji: '❌', color: '#ff3b30', label: 'Missed' },
  frozen: { emoji: '🧊', color: '#007aff', label: 'Frozen' },
  pending: { emoji: '⏳', color: '#6e6e73', label: 'In Progress' }
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function StreakCalendar({ streak, onUseFreeze }: StreakCalendarProps) {
  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    return DAY_LABELS[date.getDay()];
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const getMilestone = (current: number) => {
    if (current >= 100) return { emoji: '👑', label: 'Century Club!', color: '#ffd700' };
    if (current >= 50) return { emoji: '💎', label: 'Diamond Streak!', color: '#b9f2ff' };
    if (current >= 30) return { emoji: '🌟', label: 'Star Streak!', color: '#ffcc00' };
    if (current >= 14) return { emoji: '💪', label: '2-Week Warrior!', color: '#ff9500' };
    if (current >= 7) return { emoji: '🎯', label: 'Week Complete!', color: '#34c759' };
    if (current >= 3) return { emoji: '🚀', label: 'Building Momentum!', color: '#007aff' };
    return null;
  };

  const milestone = getMilestone(streak.current);

  return (
    <div className="streak-calendar">
      {/* Streak Header */}
      <div className="streak-header">
        <div className="streak-flame">
          <span className={`flame-icon ${streak.current > 0 ? 'burning' : ''}`}>🔥</span>
          <div className="streak-number">{streak.current}</div>
        </div>
        <div className="streak-info">
          <h3 className="streak-title">Current Streak</h3>
          {streak.current > 0 ? (
            <p className="streak-subtitle">Keep it going!</p>
          ) : (
            <p className="streak-subtitle">Start your journey</p>
          )}
          {milestone && (
            <div className="streak-milestone" style={{ borderColor: milestone.color }}>
              <span className="milestone-emoji">{milestone.emoji}</span>
              <span className="milestone-label">{milestone.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Week Calendar */}
      <div className="week-calendar">
        {streak.week.map((day, idx) => {
          const status = STATUS_INFO[day.status];
          return (
            <div key={idx} className="calendar-day">
              <div className="day-label">{getDayLabel(day.localDate)}</div>
              <div
                className={`day-indicator ${day.status}`}
                style={{ backgroundColor: status.color }}
                title={`${getDateLabel(day.localDate)} - ${status.label}`}
              >
                <span className="day-emoji">{status.emoji}</span>
              </div>
              <div className="day-date">{getDateLabel(day.localDate)}</div>
            </div>
          );
        })}
      </div>

      {/* Streak Stats */}
      <div className="streak-stats">
        <div className="stat-item">
          <div className="stat-value">{streak.todayMinutes}</div>
          <div className="stat-label">Minutes Today</div>
          {!streak.todayQualified && streak.todayMinutes > 0 && (
            <div className="stat-hint">Need 20+ min to qualify</div>
          )}
          {streak.todayQualified && (
            <div className="stat-qualified">✅ Qualified!</div>
          )}
        </div>

        <div className="stat-item">
          <div className="stat-value">{streak.longest}</div>
          <div className="stat-label">Longest Streak</div>
          {streak.current === streak.longest && streak.current > 0 && (
            <div className="stat-badge">🏆 New Record!</div>
          )}
        </div>

        <div className="stat-item">
          <div className="stat-value">{streak.freezesAvailable}</div>
          <div className="stat-label">Streak Freezes</div>
          {onUseFreeze && streak.freezesAvailable > 0 && (
            <button className="use-freeze-btn" onClick={onUseFreeze}>
              🧊 Use Freeze
            </button>
          )}
        </div>
      </div>

      {/* Freeze Info */}
      {streak.freezesAvailable === 0 && (
        <div className="freeze-info">
          <div className="freeze-info-icon">💡</div>
          <p>Earn streak freezes by maintaining your streak! Get one freeze for every 7 consecutive days.</p>
        </div>
      )}
    </div>
  );
}
