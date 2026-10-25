import './SampleNotice.css';

/** Shown on any page that is displaying sample data instead of the student's own. */
export function SampleNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="sample-notice" role="note">
      <span className="sample-notice__tag">SAMPLE DATA</span>
      <span>{children ?? 'Numbers below are an example. They are replaced by yours as you study.'}</span>
    </div>
  );
}
