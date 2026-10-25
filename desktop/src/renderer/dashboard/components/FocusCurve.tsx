import { useEffect, useState } from 'react';
import type { FocusCurveView } from '../../../common/ipc-intelligence';
import { ExampleBadge } from './Planned';

// How focus moves through a study session (main: history/focus-curve.ts): average session length,
// when you usually drift to a distracting site and which one, and a curve of focus across the
// minutes of a session, with the drift point marked. Sample numbers until enough sessions exist.

const W = 720;
const H = 200;
const TOP = 16;

export function FocusCurve() {
  const [curve, setCurve] = useState<FocusCurveView | null>(null);
  useEffect(() => {
    const load = () =>
      void window.electronAPI
        .invoke('focus-curve-get')
        .then(setCurve)
        .catch(() => setCurve(null));
    load();
    const offs = [window.electronAPI.on('data-cleared', load), window.electronAPI.on('report-updated', load)];
    return () => offs.forEach((off) => off());
  }, []);

  if (!curve || !curve.points.length) return null;
  const { points, firstDrift, peak } = curve;
  const span = Math.max(curve.avgSessionMinutes, points.length * curve.bucketMinutes);
  const x = (minute: number) => (minute / span) * W;
  const y = (focus: number) => TOP + (1 - focus / 100) * (H - TOP);

  // Step curve: flat across each bucket, a step at the next
  let line = `M0,${y(points[0].focus)}`;
  points.forEach((p, i) => {
    line += ` H${x(p.minute)} V${y(p.focus)}`;
    if (i === points.length - 1) line += ` H${x(p.minute + curve.bucketMinutes)}`;
  });
  const area = `${line} V${H} H0 Z`;
  const driftX = firstDrift ? x(firstDrift.minute) : null;
  const site = firstDrift?.topSites[0];

  return (
    <div className="focus-curve">
      {curve.sample && (
        <p className="planned-source">
          <ExampleBadge /> Sample numbers until you have recorded 3 sessions; then this shows your own.
        </p>
      )}
      <div className="stats-grid">
        <Tile label="Average session" value={`${curve.avgSessionMinutes} min`} />
        <Tile label="Sessions recorded" value={`${curve.sessions}`} />
        <Tile label="You usually drift at" value={firstDrift ? `${firstDrift.minute} min` : '–'} />
        <Tile label="Focus drop at drift" value={curve.dropAfterDrift !== null ? `-${curve.dropAfterDrift}` : '–'} />
      </div>

      <svg className="focus-curve__chart" viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label="Focus across a session" shapeRendering="crispEdges">
        {[25, 50, 75].map((v) => (
          <g key={v}>
            <line x1={0} x2={W} y1={y(v)} y2={y(v)} className="focus-curve__grid" />
            <text x={4} y={y(v) - 4} className="focus-curve__label">
              {v}
            </text>
          </g>
        ))}
        {peak && <rect x={x(peak.fromMinute)} y={TOP} width={x(peak.toMinute) - x(peak.fromMinute)} height={H - TOP} className="focus-curve__peak" />}
        <path d={area} className="focus-curve__area" />
        <path d={line} className="focus-curve__line" />
        {driftX !== null && (
          <g>
            <line x1={driftX} x2={driftX} y1={TOP} y2={H} className="focus-curve__drift" />
            {/* At the bottom, clear of the curve (focus is usually high) */}
            <text x={Math.min(driftX + 6, W - 200)} y={H - 10} className="focus-curve__drift-label">
              drift ~{firstDrift!.minute} min{site ? ` · ${site}` : ''}
            </text>
          </g>
        )}
        {Array.from({ length: Math.floor(span / 10) + 1 }, (_, i) => i * 10).map((m) => (
          <text key={m} x={Math.min(x(m), W - 30)} y={H + 18} className="focus-curve__label">
            {m}m
          </text>
        ))}
      </svg>

      <p className="focus-curve__summary">{summary(curve)}</p>
    </div>
  );
}

/** The curve in one or two sentences. */
function summary(c: FocusCurveView): string {
  const parts: string[] = [];
  if (c.peak) parts.push(`You focus best ${c.peak.fromMinute}-${c.peak.toMinute} minutes into a session (${c.peak.focus}% on task).`);
  if (c.firstDrift) {
    const where = c.firstDrift.topSites.length ? ` to ${c.firstDrift.topSites.join(' or ')}` : '';
    parts.push(
      `Around minute ${c.firstDrift.minute} you usually drift${where} (${c.firstDrift.sessionsWithDrift} of ${c.sessions} sessions), and focus drops${c.dropAfterDrift !== null ? ` by ${c.dropAfterDrift} points` : ''}. A short planned break just before then may help.`
    );
  } else {
    parts.push('No drifts to distracting sites recorded. Nice.');
  }
  return parts.join(' ');
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}
