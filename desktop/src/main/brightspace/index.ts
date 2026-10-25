import type { BrightspaceData, BrightspaceCourse, BrightspaceAssignment } from '@wolfie/shared';
import type Database from 'better-sqlite3';
import type { DashMaterial } from '../../common/ipc-dashboard.js';
import { getDatabase } from '../db/index.js';
import { TypedEmitter } from '../typed-emitter.js';
import { detectTopic } from '../dashboard/queries.js';

export const brightspaceEvents = new TypedEmitter<{ saved: [courses: number] }>();

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
    ensureBrightspaceSchema(db);

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

    // Resources (slides, PDFs, videos, links). first_seen_at survives re-syncs, so "new" means new to Wolfie.
    const insertResource = db.prepare(`
      INSERT INTO brightspace_resources (id, course_id, title, type, url, due_date, first_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, type = excluded.type, url = excluded.url,
        due_date = excluded.due_date, updated_at = excluded.updated_at
    `);
    for (const course of data.courses) {
      for (const resource of course.resources) {
        insertResource.run(
          `${course.id}:${resource.id}`,
          course.id,
          resource.title,
          resource.type,
          resource.url ?? null,
          resource.dueDate ?? null,
          now,
          now
        );
      }
    }

    console.log(`[brightspace] Saved ${data.courses.length} courses with assignments to database`);
    brightspaceEvents.emit('saved', data.courses.length);
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

/** Brightspace tables were never migrated; create them on first use (idempotent). */
export function ensureBrightspaceSchema(db: Database.Database = getDatabase()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS brightspace_courses (
      id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, semester TEXT, url TEXT, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brightspace_assignments (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, due_date TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0, submitted_date TEXT, url TEXT, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brightspace_resources (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, url TEXT,
      due_date TEXT, first_seen_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
}

function kindOf(type: string, title: string): DashMaterial['kind'] {
  const t = `${type} ${title}`.toLowerCase();
  if (/video|lecture recording|recording|youtube|panopto/.test(t)) return 'video';
  if (/problem set|homework|assignment|worksheet|quiz|exam/.test(t)) return 'problem-set';
  if (/slide|ppt|keynote/.test(t)) return 'slides';
  return 'pdf';
}

/** All stored Brightspace items (assignments + resources) as dashboard material, newest first. */
export function getBrightspaceMaterials(db: Database.Database = getDatabase()): Array<Omit<DashMaterial, 'matchesWeakSpot'>> {
  ensureBrightspaceSchema(db);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const out: Array<Omit<DashMaterial, 'matchesWeakSpot'>> = [];
  const resources = db
    .prepare(
      `SELECT r.id, r.title, r.type, r.url, r.due_date, r.first_seen_at, c.code
       FROM brightspace_resources r JOIN brightspace_courses c ON c.id = r.course_id`
    )
    .all() as Array<{ id: string; title: string; type: string; url: string | null; due_date: string | null; first_seen_at: number; code: string }>;
  for (const r of resources) {
    out.push({
      id: `res:${r.id}`,
      course: r.code,
      title: r.title,
      kind: kindOf(r.type, r.title),
      topic: detectTopic(r.title),
      postedAt: new Date(r.first_seen_at).toISOString(),
      dueAt: r.due_date,
      isNew: r.first_seen_at >= weekAgo,
      url: r.url
    });
  }
  const assignments = db
    .prepare(
      `SELECT a.id, a.title, a.url, a.due_date, a.updated_at, c.code
       FROM brightspace_assignments a JOIN brightspace_courses c ON c.id = a.course_id`
    )
    .all() as Array<{ id: string; title: string; url: string | null; due_date: string | null; updated_at: number; code: string }>;
  for (const a of assignments) {
    out.push({
      id: `asg:${a.id}`,
      course: a.code,
      title: a.title,
      kind: 'problem-set',
      topic: detectTopic(a.title),
      postedAt: new Date(a.updated_at).toISOString(),
      dueAt: a.due_date,
      isNew: a.updated_at >= weekAgo,
      url: a.url
    });
  }
  return out.sort((x, y) => y.postedAt.localeCompare(x.postedAt));
}
