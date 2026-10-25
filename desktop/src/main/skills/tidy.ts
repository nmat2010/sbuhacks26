import { z } from 'zod';
import type { LlmCall } from '../llm/client.js';
import { renderPrompt } from '../llm/prompts/index.js';
import type { SkillRecordStore } from './record.js';

// Keeps the strengths & weaknesses record free of duplicates that word matching can't see
// ("Triangle path sum" and "Dynamic programming: Triangle state definition"): the model groups
// the skill names that mean one concept, and the groups are merged. Names only, one small call;
// run after past reports are loaded and when a report added a new skill.

const MergeSchema = z.object({
  groups: z
    .array(z.object({ name: z.string().min(1).max(80), members: z.array(z.string().min(1).max(80)).min(2).max(10) }))
    .max(20)
    .default([])
});

const MAX_NAMES = 80;

export async function tidySkills(
  store: SkillRecordStore,
  llm: () => { generate<T>(call: LlmCall<T>): Promise<T> }
): Promise<number> {
  const names = store.names(MAX_NAMES);
  if (names.length < 2) return 0;
  const out = await llm().generate({
    task: 'skills_merge',
    system: renderPrompt('skills-merge.v1'),
    messages: [{ role: 'user', content: JSON.stringify({ skills: names }) }],
    schema: MergeSchema,
    temperature: 0
  });
  // Only names that are really in the record (the model must not invent members)
  const known = new Set(names);
  const groups = out.groups
    .map((g) => ({ name: g.name, members: g.members.filter((m) => known.has(m)) }))
    .filter((g) => g.members.length >= 2);
  return groups.length ? store.mergeGroups(groups) : 0;
}
