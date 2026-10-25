import type { HourlyFocus } from '../types/wolfie';
import './StepChart.css';

export interface StepChartProps {
  data: HourlyFocus[];
  label: string; // for aria-label
  width?: number;
  height?: number;
}

export function StepChart({
  data,
  label,
  width = 720,
  height = 200
}: StepChartProps) {
  if (data.length === 0) {
    return null;
  }

  const slotWidth = width / data.length;
  const maxScore = 100;
  const chartHeight = height - 10; // Leave room for baseline

  // Find peak hour
  const peakEntry = data.reduce((max, entry) =>
    entry.score > max.score ? entry : max
  , data[0]);
  const peakIndex = data.indexOf(peakEntry);
  const peakX = peakIndex * slotWidth;

  // Generate step path
  let pathCommands = `M0,${chartHeight - (data[0].score / maxScore) * chartHeight}`;

  data.forEach((entry, index) => {
    const x = index * slotWidth;
    const y = chartHeight - (entry.score / maxScore) * chartHeight;

    pathCommands += ` H${x} V${y}`;
  });

  pathCommands += ` H${width}`;

  // Create filled area path
  const areaPath = `${pathCommands} V${height} H0 Z`;

  // Grid lines
  const gridLines = [25, 50, 75].map(value => ({
    y: chartHeight - (value / maxScore) * chartHeight,
    label: value
  }));

  // Time labels (6 AM to 11 PM is typically 6 to 23)
  const minHour = Math.min(...data.map(d => d.hour));

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  const peakHour = peakEntry.hour;
  const peakLabel = `Peak ${formatHour(peakHour)}`;

  return (
    <div className="step-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        shapeRendering="crispEdges"
        role="img"
        aria-label={label}
      >
        {/* Peak highlight band */}
        <rect
          x={peakX}
          y={10}
          width={slotWidth}
          height={chartHeight}
          fill="var(--ws-gold)"
          opacity="0.2"
        />

        {/* Grid lines */}
        {gridLines.map((line, i) => (
          <line
            key={i}
            x1="0"
            y1={line.y}
            x2={width}
            y2={line.y}
            stroke="var(--ws-edge)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
        ))}

        {/* Filled area */}
        <path
          d={areaPath}
          fill="var(--ws-red-dark)"
          opacity="0.55"
        />

        {/* Line stroke */}
        <path
          d={pathCommands}
          fill="none"
          stroke="var(--ws-gold)"
          strokeWidth="4"
          strokeLinejoin="miter"
        />

        {/* Baseline */}
        <line
          x1="0"
          y1={height}
          x2={width}
          y2={height}
          stroke="var(--ws-text)"
          strokeWidth="2"
        />

        {/* Y-axis labels */}
        {gridLines.map((line, i) => (
          <text
            key={`label-${i}`}
            x="4"
            y={line.y - 7}
            fill="var(--ws-text-muted)"
            fontSize="18"
            fontFamily="Pixelify Sans, monospace"
          >
            {line.label}
          </text>
        ))}

        {/* Peak label */}
        <text
          x={peakX + slotWidth + 8}
          y={26}
          fill="var(--ws-gold)"
          fontSize="19"
          fontFamily="Pixelify Sans, monospace"
        >
          {peakLabel}
        </text>
      </svg>

      <div className="step-chart__time-labels">
        {[0, 3, 6, 9, 12, 15].map((offset) => (
          <span key={offset}>{formatHour(minHour + offset)}</span>
        ))}
      </div>
    </div>
  );
}
