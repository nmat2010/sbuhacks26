import type { BrightspaceData, BrightspaceCourse, BrightspaceAssignment } from '@wolfie/shared';
import { getDatabase } from '../db/index.js';

// Brightspace data storage (Agent A, A2). Receives course and assignment data from the Chrome
// extension when the user visits their Brightspace homepage during onboarding or session.

/**
 * Saves Brightspace courses and assignments to the database, replacing any existing data.
 * Called when the extension scrapes fresh data from Brightspace.
 */
export function saveBrightspaceData(data: BrightspaceData): void {
  try {
    const db = getDatabase();
    const now = Date.now();

    // Save courses
    const insertCourse = db.prepare(`
      INSERT OR REPLACE INTO brightspace_courses (id, code, name, semester, url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const course of data.courses) {
      insertCourse.run(
        course.id,
        course.code,
        course.name,
        course.semester ?? null,
        course.url ?? null,
        now
      );
    }

    // Save assignments from all courses
    const insertAssignment = db.prepare(`
      INSERT OR REPLACE INTO brightspace_assignments (id, course_id, title, due_date, is_completed, submitted_date, url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const course of data.courses) {
      for (const assignment of course.assignments) {
        // Generate assignment ID from course and assignment title if not provided
        const assignmentId = assignment.id || `${course.id}_${assignment.title}`;
        insertAssignment.run(
          assignmentId,
          course.id,
          assignment.title,
          assignment.dueDate ?? null,
          0, // is_completed - default to not completed
          null, // submitted_date
          assignment.url ?? null,
          now
        );
      }
    }

    console.log(`[brightspace] Saved ${data.courses.length} courses with assignments to database`);
  } catch (error) {
    console.error('[brightspace] Failed to save data:', error instanceof Error ? error.message : error);
  }
}

/**
 * Retrieves all Brightspace courses from the database.
 */
export function getBrightspaceCourses(): BrightspaceCourse[] {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, code, name, semester, url
      FROM brightspace_courses
      ORDER BY semester DESC, code ASC
    `).all() as Array<{ id: string; code: string; name: string; semester: string | null; url: string | null }>;

    return rows.map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      semester: row.semester ?? undefined,
      url: row.url ?? undefined,
      assignments: [],
      resources: []
    }));
  } catch (error) {
    console.error('[brightspace] Failed to get courses:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Retrieves all assignments for a specific course.
 */
export function getCourseAssignments(courseId: string): BrightspaceAssignment[] {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, title, course_id, due_date, is_completed, submitted_date, url
      FROM brightspace_assignments
      WHERE course_id = ?
      ORDER BY due_date ASC
    `).all(courseId) as Array<{
      id: string;
      title: string;
      course_id: string;
      due_date: string | null;
      is_completed: number;
      submitted_date: string | null;
      url: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      courseId: row.course_id,
      dueDate: row.due_date ?? undefined,
      isCompleted: row.is_completed === 1,
      submittedDate: row.submitted_date ?? undefined,
      url: row.url ?? undefined
    }));
  } catch (error) {
    console.error('[brightspace] Failed to get assignments:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Gets all courses with their assignments included.
 */
export function getCoursesWithAssignments(): BrightspaceCourse[] {
  const courses = getBrightspaceCourses();
  for (const course of courses) {
    course.assignments = getCourseAssignments(course.id);
  }
  return courses;
}

/**
 * Gets the current semester based on the most recent course data.
 */
export function getCurrentSemester(): string | null {
  try {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT semester
      FROM brightspace_courses
      WHERE semester IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `).get() as { semester: string } | undefined;

    return row?.semester ?? null;
  } catch (error) {
    console.error('[brightspace] Failed to get current semester:', error instanceof Error ? error.message : error);
    return null;
  }
}
