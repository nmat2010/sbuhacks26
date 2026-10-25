# Session reports

Branch `tuan/session-report`, made from `main` after the dashboard skeleton.

## What it does
When a study session ends, Wolfie writes its report:
- what was studied;
- each problem and how it went;
- strengths and weaknesses with evidence;
- next steps.

The Reports page shows it in full, and the Dashboard's "Latest Session Report" card shows a short version. Both replace the "Coming next" placeholders.

## How
- **`report/tracker.ts` (`SessionTracker`)** follows the running session's problems:
  - Watch-mode answer checks: right, or wrong with each distinct wrong answer and what looked off;
  - unanswered questions;
  - thinking pauses (timed and "I'm stuck");
  - hint ladders on a problem (deepest level; level 5 means the answer was shown);
  - questions asked in the chat or by voice during a session.
  - Each problem's outcome is one of: solved alone, solved with help, needed the answer, still open.
- **Hooks:**
  - the watcher's `onObservation` passes each look;
  - the hint flow's `onHelpClosed` reports which problem a ladder was about (`focusQuestion`) and how deep it went;
  - the controller's `onSessionEnd` fires before memory is cleared.
- **At session end (`register.ts`):** Watch mode's memory is copied at once (sources with points and locators, and the merged timeline). The tracker is read one tick later, so the hint flow can close an open ladder first.
- **`report/service.ts` (`ReportService`):**
  - gathers the facts with the session's numbers (`history-get`) and saves them as `pending`;
  - Gemini writes the prose (`session-report.v1`: headline, summary, topics with verdict strength / weakness / practiced and evidence, next steps). The prompt allows a strength only with evidence and forbids invented facts and answers.
  - **Nothing Wolfie could see** (Watch mode off, no questions): the numbers are the report, with no model call.
  - **The model fails (quota, offline):** the facts are kept, with a friendly reason and "Try again" (`report-regenerate` re-runs it from the saved facts).
- **`report/store.ts`:** table `session_reports` (migration `206_b`), one row per session. It's included in "Clear all data" and export.
- **IPC:** `report-get`, `report-regenerate`, and the event `report-updated`.
- **Dashboard (`components/SessionReport.tsx`):** headline, summary, topic chips, strengths and weaknesses with evidence, problems with outcome badges, what you studied, questions asked, next steps. It also shows the pending, failed (Try again) and not-watched states.

## Privacy change
Before, Watch mode kept a session's content only in memory and discarded it when the session ended. Now each session's report saves a text summary: source titles and key points, timeline summaries, problem questions with what looked off, and questions asked. Screenshots are still never stored. It's local only, and "Clear all data" removes it.

## Verified
- **Real app with real Gemini, scratch profile (`WOLFIE_SMOKE_REPORT`):** start a session, ask one chat question, stop. The report was written in 1.3 s and shown on the Reports page. With little to go on, it marked the topic "practiced", not a strength.
- **Real Gemini on facts modelled on Tuan's homework session tonight:**
  - **Strengths:** linear equations (solved alone).
  - **Weaknesses:** under/overfitting (needed help, then the answer), and comparing mean and standard deviation (still open; "compared only the last element").
  - **Practiced:** NLP (read and watched).
  - The next steps aimed at the weaknesses.
- **Tests:** 686 pass (new: tracker outcomes, service facts / no-content / failure / regenerate, flow help-closed).
- Typecheck and lint are clean.

## Next
The strengths & weaknesses record: combine report topics across sessions (evidence and trend), and a plan per weakness, for the Strengths & Weaknesses page and the Dashboard card.

## Update: less repetition (from Tuan's first real report: Coin Change listed 6 times)
| Seen | Cause | Fix |
|---|---|---|
| The same problem 6 times under different wordings, plus "Fix the compilation error" as its own problem | The watcher re-worded the problem on every look | **Prompt `watch-observe.v5`:** name each problem by its own title or number ("Coin Change", "Q3"), never re-word it, never name a step inside it, and reuse `known_problems` (the tracker's names, passed in each look) |
| Any wordings that still slip through | — | **`sameProblem`:** matches at least 3 meaningful words making up 70% of the shorter name (plural, -ed and -ing endings ignored), or a short title fully contained in the other. Numbers, roman numerals and single letters must match ("= 13" ≠ "= 12", "i and ii" ≠ "iii and iv"). A problem keeps all its wordings and a new one may match any of them. **`mergeProblemFacts`:** does the same for saved facts when a report is written or rewritten. |
| Everything "Still open" although the code was accepted | Code results weren't judged | **v5:** "Accepted" or all tests passing counts as correct; a compile error, runtime error or failing test counts as wrong, with the issue saying which |
| "Still open · Right the first time" | A UI default | Text now depends on the outcome ("No answer checked yet" for open problems) |
| Topics twice | Chips under the summary plus the list below | Chips only on the short card |
| Date and length twice | The focus bar repeated them | `FocusBars bare` on the report |
| A long list of places | Every look's place was listed | Only the latest place |
| Chit-chat under "Questions you asked" | Every message was recorded | **`isRealQuestion`:** at least 4 words with a "?", or question wording. Applied when recording and when writing. |

- **New: "Rewrite report"** on a written report, which rewrites it from its saved facts with all of the above applied (for reports from before the fix).
- **Verified:**
  - **Live watch model with v5:** an accepted Coin Change was named exactly "Coin Change" and judged correct; a compile error was judged wrong with the reason.
  - **Read-only on Tuan's saved report:** 8 problems become 3 (Coin Change, the compile-error step, Triangle state), and 9 questions become 2 real ones.
  - Tests: 690 pass. Typecheck and lint are clean.

## Update: one entry per source in "What you studied"
- **Seen (second real session):** "120. Triangle - LeetCode", "Triangle - LeetCode" and "120. Triangle" were listed as three sources.
- **Cause:** without the browser extension there's no page URL, so session memory keyed each source by the title the watcher wrote, and that title varies between looks.
- **Fix:**
  - **`watch/similar.ts`:** the name matching now lives in one place (`sameName`; the tracker's `sameProblem` uses it), plus `sameTitle`. `sameTitle` drops the site part ("Triangle - LeetCode" becomes "Triangle"), lets a one-word title be contained in another, and keeps the numbers rule ("120. Triangle" ≠ "322. Coin Change").
  - **`SessionMemory.record`:** with no URL, a look whose title or window title matches a source already seen is that source. Each source keeps its titles (`aliases`, up to 8).
  - **`mergeSourceFacts`:** saved reports are merged the same way when written or rewritten (minutes added, places and points pooled).
- **Verified:**
  - **Read-only on Tuan's saved report:** 4 sources become 2 (Triangle, 3 min; Coin Change, 1 min).
  - Tests: 693 pass. Typecheck and lint are clean.

## Update: "Practiced" shown as "Touched on"
- Tuan found "Practiced" (and "Studied") claimed too much for a concept that barely came up. The grey topic label now reads **Touched on**: it came up, with no evidence either way.
- Only the label in `SessionReport.tsx` changed. The stored verdict stays `practiced`, so existing reports show the new label without rewriting.
