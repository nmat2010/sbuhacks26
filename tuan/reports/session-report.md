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
