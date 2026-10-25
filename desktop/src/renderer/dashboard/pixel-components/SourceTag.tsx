import './SourceTag.css';

export type SourceKind = 'slides' | 'pdf' | 'problem-set' | 'video';

const LABELS: Record<SourceKind, string> = {
  slides: 'SLIDES',
  pdf: 'PDF',
  'problem-set': 'PROBLEM SET',
  video: 'VIDEO'
};

/** Dark label for where a Brightspace item comes from. The text, not the colour, carries the meaning. */
export function SourceTag({ kind }: { kind: SourceKind }) {
  return <span className="source-tag">{LABELS[kind]}</span>;
}
