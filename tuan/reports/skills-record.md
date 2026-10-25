# Strengths & weaknesses record

Branch `tuan/skills`, made from `tuan/session-report` (needs the session reports, which aren't on `main` yet; Thu is pushing to `main`, so it stays untouched for now).

## What it does
- The **Strengths & Weaknesses** page and the Dashboard card now show the real record, built from session reports. The example data is gone.
- **Each skill** (e.g. "Dynamic programming: state definition") has a dot per session (green strong, red weak, grey touched on), its latest evidence, and a status:
  - **To work on**, with a 2–3 step improvement plan;
  - **Improving**: was weak, and the latest evidence is strong;
  - **Strength**;
  - **Touched on**: no evidence either way.
- **Full session reports** also show the plan under each weakness.

## No duplicates (checking what's already in the record)
1. **The report writer sees the record.** `session-report.v2` gets `known_skills` (the record's names) and must reuse an exact name when the topic is the same concept. New names follow the "area: concept" style. Weaknesses get a `plan`.
2. **Close names merge.** `SkillRecordStore.find` matches the exact name, any earlier name (aliases), or `sameName` (the shared word matcher).
3. **One entry per session per skill.** If two topics of one report land on one skill, the more telling verdict wins (weakness over strength over touched on). A rewritten report replaces its session's entries, and a skill no session names any more is removed.
4. **Tidy-up for what words can't connect** ("Triangle path sum" and "Dynamic programming: Triangle state definition"):
   - `skills-merge.v1` gets only the skill names and groups those that mean one concept, without merging related-but-different concepts. Members it invents are ignored.
   - `mergeGroups` merges histories under the best name and keeps the old names as aliases, so later reports using them land correctly.
   - It runs at app start (≥2 skills) and after a report that added a new skill.

## Status rules (`skillStatus`)
Only sessions with evidence count (touched-on sessions don't):
- latest evidence weak → **To work on**;
- strong after an earlier weakness → **Improving**, until it's strong twice in a row → **Strength**;
- never weak → **Strength**;
- no evidence → **Touched on**.

## Storage
- Table `skills` (migration `207_b`), one row per skill with its history (JSON). It's included in "Clear all data" and export.
- On first run it's built from the existing reports, oldest first.
- IPC: `skills-get`, and the event `skills-updated`.

## Verified
- **Live Gemini, report with known skills:** the Triangle struggle was filed under the existing "Dynamic programming: state definition" (not a new "Triangle" skill), Coin Change under the existing name, and the weakness got a 3-step plan.
- **Real app on a copy of Tuan's database (original untouched):**
  - the record was built from 5 reports;
  - the start-up tidy-up (1.9 s) merged the two Triangle skills (8 → 7) and kept related-but-different ones apart (the two NLP skills);
  - the page shows To work on (comparing means), Strengths (Coin Change, dots touched → strong → strong) and Touched on.
- **Tests:** 706 pass (new: status rules, matching, rewrite, verdict rank, names, `mergeGroups`, `tidySkills`, the report passing `known_skills`). Typecheck and lint are clean.

## Note
Tuan's running `npm run dev` rebuilt with this branch's code, so the real profile already has the `skills` table (8 skills from his reports, before the tidy-up existed). The next app start tidies it.
