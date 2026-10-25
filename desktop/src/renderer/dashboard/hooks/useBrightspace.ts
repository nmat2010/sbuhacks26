import { useState, useEffect, useCallback } from 'react';
import type { BrightspaceCourse as ImportedBrightspaceCourse } from '@wolfie/shared';
import { useLiveData } from './useLiveData';

export type BrightspaceCourse = ImportedBrightspaceCourse;

export function useBrightspace() {
  const [courses, setCourses] = useState<BrightspaceCourse[]>([]);
  const [semester, setSemester] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [coursesData, semesterData] = await Promise.all([
        window.ipc.invoke('brightspace-get-courses'),
        window.ipc.invoke('brightspace-get-semester')
      ]);
      setCourses(coursesData);
      setSemester(semesterData);
      setLastSyncAt(Date.now());
    } catch (error) {
      console.error('Failed to load Brightspace data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useLiveData(() => void loadData());

  return {
    courses,
    semester,
    loading,
    lastSyncAt,
    refresh: loadData,
    isSynced: courses.length > 0
  };
}
