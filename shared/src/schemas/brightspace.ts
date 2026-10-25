import { z } from 'zod';

// Brightspace course and assignment data schemas

export const BrightspaceResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(), // e.g., "file", "link", "folder", "assignment"
  url: z.string().optional(),
  dueDate: z.string().optional(), // ISO date string
});

export const BrightspaceAssignmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  courseId: z.string(),
  dueDate: z.string().optional(), // ISO date string
  isCompleted: z.boolean(),
  submittedDate: z.string().optional(), // ISO date string
  url: z.string().optional()
});

export const BrightspaceCourseSchema = z.object({
  id: z.string(),
  code: z.string(), // e.g., "CSE 220"
  name: z.string(), // e.g., "Systems Fundamentals"
  semester: z.string().optional(), // e.g., "Fall 2026"
  url: z.string().optional(),
  assignments: z.array(BrightspaceAssignmentSchema).default([]),
  resources: z.array(BrightspaceResourceSchema).default([])
});

export const BrightspaceDataSchema = z.object({
  semester: z.string(), // Current active semester
  courses: z.array(BrightspaceCourseSchema),
  lastFetched: z.number() // timestamp
});

export type BrightspaceResource = z.infer<typeof BrightspaceResourceSchema>;
export type BrightspaceAssignment = z.infer<typeof BrightspaceAssignmentSchema>;
export type BrightspaceCourse = z.infer<typeof BrightspaceCourseSchema>;
export type BrightspaceData = z.infer<typeof BrightspaceDataSchema>;
