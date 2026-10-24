import { z } from 'zod';

export const InteractiveControl = z.object({
  id: z.string(),
  role: z.string(),
  label: z.string(),
  state: z.string(), // enabled, disabled, checked, etc.
  type: z.string().optional() // button, input, select, etc.
});

export const PageSummarySchema = z.object({
  url: z.string(),
  domain: z.string(),
  title: z.string(),
  headings: z.array(z.string()).max(50),
  visibleText: z.string().max(2500),
  controls: z.array(InteractiveControl).max(120),
  errorMessages: z.array(z.string()).max(10),
  openDialogs: z.array(z.string()).max(5),
  problemRegion: z.string().optional(),
  timestamp: z.number()
});

export type PageSummary = z.infer<typeof PageSummarySchema>;
export type InteractiveControlType = z.infer<typeof InteractiveControl>;
