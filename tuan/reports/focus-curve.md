# Productivity curve (focus across a session)

On `tuan/dashboard-merge`. Tuan asked for the curve to answer, from the record:
- **How long is the usual session?**
- **When in a session do you jump to distracting sites?**
- **How does focus rise, peak and drop around that point?**

Sample data was requested until there are enough sessions.

## How it's answered (`main/history/focus-curve.ts`)
- **Source:** finished desktop sessions from the last 30 days with at least 5 minutes of activity. Each session's `app_events` are turned into time slices with a category (work / AI / distraction / idle / paused, the same rules as History) and the site or app (`www.` dropped).
- **Average session:** the mean active length (paused time excluded). The curve runs to it, in 5-minute buckets of *session time*, not clock time.
- **Focus per bucket:** the work share of that stretch (0–100). The distraction share (distraction plus AI) is kept too.
- **When you usually drift (`usualDrift`):** the 5-minute stretch of session time with the most drifting (distraction plus AI) across sessions, how many sessions drifted then, and the top sites in it. This was first the median of each session's first drift, but with two habits (an early Reddit check, YouTube 30 minutes in) the median landed at minute 17, where nobody drifts.
- **Peak:** the best bucket. **Drop at drift:** peak focus minus focus in the bucket where the usual first drift happens.
- **Fewer than 3 such sessions:** `SAMPLE_CURVE` (`sample: true`), a 50-minute session that peaks 10–15 min in, drifts to YouTube around minute 27, dips 34 points, recovers a little and fades.
- **Per session:** `sessionDrifts` lists each drift (minute, site, how long; back-to-back slices on one site merged).
- **IPC:** `focus-curve-get`, `session-drifts-get`.
- **Reports:** a session's report facts now include its `drifts`. Prompt `session-report.v3` tells Gemini to mention a drift pattern in one sentence, and it may make one next step about it.

## Dashboard
- **The "Productivity curve" card** replaces the placeholder:
  - stat tiles: average session, sessions recorded, you usually drift at, focus drop at drift;
  - a pixel step chart of focus over the session, with the peak stretch shaded and a red dashed marker at the usual drift (minute and site);
  - a one-line summary;
  - the recent sessions' focus bars underneath.
  - An "Example" badge shows while it's sample data.
- **The Reports page** lists each session's drifts under its focus bar ("min 12: youtube.com (4 min) · min 25: ChatGPT (5 min, AI)").

## Verified
- **Tests:** sample when there are too few sessions; three recorded 40-minute sessions give an average of 40, 8 buckets, first drift median 22 with top sites youtube.com and reddit.com, a dip where the drifts happen, and the peak; per-session drifts are merged and timed.
- **Real app:**
  - **Scratch profile:** shows the sample with its Example badge.
  - **Copy of Tuan's data:** 11 recorded sessions; average 9 min; usually drifts around minute 2 to youtube.com, claude.ai or chatgpt.com (6 of 11 sessions); peak 5–10 min (96%). YouTube lectures count as drifts while YouTube is on the distracting list (it can be switched off in Settings).
- Tests: 706 pass. Typecheck clean, lint has no errors.

## Long sessions (Tuan asked whether the curve gets longer)
- Yes. The curve spans the average session length.
- **Demo on a scratch profile** (`scratchpad/seed_long.py`, never Tuan's data): 6 fake 90–110 minute sessions, with YouTube about 32–40 minutes in, Reddit about 60, ChatGPT about 80, and idle near the end.
- **Result:**
  - the average is 99 min and the curve runs 0–100 min in 20 steps;
  - full focus for half an hour;
  - a 77-point dip at 35–40 min, marked, YouTube in 6 of 6 sessions;
  - smaller dips at the Reddit and ChatGPT stretches, and a slight fade at the end.
- Tests: 707 pass.
