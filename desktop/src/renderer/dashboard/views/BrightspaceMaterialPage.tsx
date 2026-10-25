import { useMemo, useState } from 'react';
import { PixelCard, PixelButton, OptionButton, Badge, Chip, SampleNotice, SourceTag } from '../pixel-components';
import type { DashMaterial } from '../../../common/ipc-dashboard';
import { sampleMaterials } from '../fixtures/sample';
import { useBrightspaceMaterial, type MaterialFilter } from '../hooks/useBrightspaceMaterial';
import { useBrightspace } from '../hooks/useBrightspace';
import '../styles/tokens.css';
import './BrightspaceMaterialPage.css';

const topicLabel = (id: string) => {
  const t = id.replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function BrightspaceMaterialPage() {
  const [filter, setFilter] = useState<MaterialFilter>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const { materials, loading, syncing, syncBrightspace, openMaterial } = useBrightspaceMaterial(
    filter,
    courseFilter === 'all' ? undefined : courseFilter
  );
  const { courses, semester } = useBrightspace();

  // Nothing stored and no filter applied: show an example so the page is not blank
  const isSample = !loading && materials.length === 0 && filter === 'all' && courseFilter === 'all' && courses.length === 0;
  const display: DashMaterial[] = isSample ? sampleMaterials : materials;

  const courseChips = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) set.add(c.code);
    for (const m of display) set.add(m.course);
    return [...set].sort();
  }, [courses, display]);

  const groupedByCourse = useMemo(() => {
    const groups: Record<string, DashMaterial[]> = {};
    for (const m of display) (groups[m.course] ??= []).push(m);
    return groups;
  }, [display]);
  const sortedCourses = Object.keys(groupedByCourse).sort();

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatDue = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const courseNames = useMemo(() => new Map(courses.map((c) => [c.code, c.name])), [courses]);
  const weakCount = display.filter((m) => m.matchesWeakSpot).length;
  const lastSynced = prefsSynced(courses.length);

  const handleMaterialClick = async (material: DashMaterial) => {
    if (isSample) return setNotice({ text: 'Sample item. Sync Brightspace to get your own.' });
    try {
      const r = await openMaterial(material.id);
      setNotice(r.success ? null : { text: r.error ?? 'Could not open that item.', error: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not open that item.', error: true });
    }
  };

  const handleSync = async () => {
    setNotice({ text: 'Asking the extension for your courses...' });
    try {
      const r = await syncBrightspace();
      setNotice(r.success ? { text: `Synced ${r.items} items from ${r.courses} courses.` } : { text: r.error ?? 'Sync failed.', error: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Sync failed.', error: true });
    }
  };

  return (
    <div className="brightspace-material-page">
      <div className="brightspace-material-page__header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h1 className="ws-heading" style={{ margin: 0, fontSize: '20px', color: 'var(--ws-gold)' }}>
            BRIGHTSPACE MATERIAL
          </h1>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {semester && <Chip>{semester}</Chip>}
            <Chip>
              Showing {sortedCourses.length} of {Math.max(courses.length, courseChips.length)} {courseChips.length === 1 ? 'course' : 'courses'}
            </Chip>
            <Chip style={{ color: lastSynced ? 'var(--ws-green)' : 'var(--ws-text-muted)' }}>{lastSynced ? 'Synced' : 'Not synced yet'}</Chip>
          </div>
        </div>
        <PixelButton size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? 'SYNCING...' : 'RE-SYNC'}
        </PixelButton>
      </div>

      {isSample && <SampleNotice>Showing an example until Brightspace is synced.</SampleNotice>}
      {notice && (
        <div role="status" aria-live="polite" style={{ fontSize: '15px', color: notice.error ? 'var(--ws-weak-text)' : 'var(--ws-gold)' }}>
          {notice.text}
        </div>
      )}

      {weakCount > 0 && (
        <PixelCard style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <Badge tone="gold">WEAK SPOT</Badge>
          <span style={{ flex: '1 1 300px', minWidth: 0 }}>
            Wolfie flagged {weakCount} {weakCount === 1 ? 'item' : 'items'} that match your weak topics. Study those first.
          </span>
        </PixelCard>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <OptionButton pressed={filter === 'all'} onClick={() => setFilter('all')}>ALL</OptionButton>
          <OptionButton pressed={filter === 'new'} onClick={() => setFilter('new')}>NEW</OptionButton>
          <OptionButton pressed={filter === 'weak-spots'} onClick={() => setFilter('weak-spots')}>MATCHES WEAK SPOTS</OptionButton>
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <OptionButton pressed={courseFilter === 'all'} onClick={() => setCourseFilter('all')}>ALL COURSES</OptionButton>
          {courseChips.map((code) => (
            <OptionButton key={code} pressed={courseFilter === code} onClick={() => setCourseFilter(code)}>
              {code}
            </OptionButton>
          ))}
        </div>
      </div>

      {sortedCourses.length === 0 && (
        <PixelCard style={{ padding: '24px', textAlign: 'center' }}>
          <span style={{ color: 'var(--ws-text-muted)' }}>
            {loading
              ? 'Loading materials...'
              : filter !== 'all' || courseFilter !== 'all'
                ? 'No materials match these filters.'
                : 'No materials yet. Press RE-SYNC, or open Brightspace in Chrome with the extension.'}
          </span>
        </PixelCard>
      )}

      {sortedCourses.map((course) => {
        const items = groupedByCourse[course];
        const newCount = items.filter((m) => m.isNew).length;
        return (
          <PixelCard key={course} as="section" aria-labelledby={`course-${course}`} style={{ padding: '26px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h2 id={`course-${course}`} className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-gold)' }}>
                  {course}
                </h2>
                {courseNames.get(course) && <span style={{ fontSize: '16px', color: 'var(--ws-text-muted)' }}>{courseNames.get(course)}</span>}
              </div>
              {newCount > 0 && <Badge tone="green">{newCount} NEW</Badge>}
            </div>

            {items.map((material) => (
              <PixelCard key={material.id} variant="inset" className="material-row">
                <SourceTag kind={material.kind} />
                <div className="material-row__text">
                  <span>{material.title}</span>
                  <span className="material-row__meta">
                    {[
                      material.topic ? topicLabel(material.topic) : null,
                      material.dueAt
                        ? `due ${formatDue(material.dueAt)}`
                        : `${material.kind === 'video' ? 'recorded' : 'posted'} ${formatDate(material.postedAt)}`
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {material.isNew && <Badge tone="green">NEW</Badge>}
                {material.matchesWeakSpot && <Badge tone="gold">WEAK SPOT</Badge>}
                <PixelButton size="sm" onClick={() => handleMaterialClick(material)} aria-label={`Study ${material.title}`}>
                  STUDY
                </PixelButton>
              </PixelCard>
            ))}
          </PixelCard>
        );
      })}
    </div>
  );
}

/** Courses in the store means a sync has happened at some point. */
function prefsSynced(courseCount: number): boolean {
  return courseCount > 0;
}
