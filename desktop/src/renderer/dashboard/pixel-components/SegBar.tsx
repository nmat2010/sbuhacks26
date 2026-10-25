import './SegBar.css';

export type SegBarTone = 'gold' | 'green' | 'weak' | 'default';

export interface SegBarProps {
  value: number; // 0-10
  tone?: SegBarTone;
  label: string; // for aria-label
}

export function SegBar({ value, tone = 'default', label }: SegBarProps) {
  const segments = Array.from({ length: 10 }, (_, i) => i < value);
  const toneClass = tone !== 'default' ? `seg-bar--${tone}` : '';

  return (
    <div
      className={`seg-bar ${toneClass}`.trim()}
      role="img"
      aria-label={label}
    >
      {segments.map((filled, index) => (
        <span
          key={index}
          className={`seg-bar__segment ${filled ? 'seg-bar__segment--filled' : ''}`.trim()}
          style={{ ['--i' as string]: index }}
        />
      ))}
    </div>
  );
}
