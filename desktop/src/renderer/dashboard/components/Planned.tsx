// A section of the dashboard skeleton that isn't built yet: says what it will show and where the
// data will come from, so the layout can be styled (Thu) before the feature exists (Tuan).

interface PlannedProps {
  /** What the section will show, one item per line. */
  shows: string[];
  /** Where its data will come from. */
  source?: string;
  /** Who builds it next. */
  owner?: string;
}

export function Planned({ shows, source, owner }: PlannedProps) {
  return (
    <div className="planned">
      <span className="planned-badge">Coming next{owner ? ` · ${owner}` : ''}</span>
      <ul className="planned-list">
        {shows.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {source && <p className="planned-source">Data: {source}</p>}
    </div>
  );
}

/** Marks sample content in the skeleton, so nobody mistakes it for real results. */
export function ExampleBadge() {
  return <span className="example-badge">Example</span>;
}
