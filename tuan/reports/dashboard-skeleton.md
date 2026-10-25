# Dashboard skeleton (teacher's and student's view of performance)

Branch `tuan/dashboard-skeleton`, made from `main`. Agreed with Tuan:
- The layout keeps the current style; Thu beautifies it later.
- Goals, Papers and History are dropped.
- Brightspace is a placeholder until Thu's input.

## Pages (sidebar)
1. **Dashboard (`HomeView`)**
   - **Study Session:** start/stop (real).
   - **Latest Session Report:** the last finished session this week, real from `history-get`: length, focused work, hints, deepest hint. The full report is `Planned`.
   - **Strengths & Weaknesses:** example chips (labelled), linking to the page.
   - **Streak:** `StreakCalendar`, real. The old fake-streak fallback on error was removed.
   - **Self-reliance, last 7 days:** real: AI-tool minutes, hints asked, sessions that went to the full answer (deepest hint 5), distracted minutes. A daily self-reliance score is `Planned`.
   - **Focus:** real, the time split per session (work / AI / distraction / idle) for the last 5 sessions. The in-session focus curve is `Planned` (optional).
2. **Reports (`ReportView`):** the real session list (30 newest), and the selected session's numbers and focus bar. The written report is `Planned`.
3. **Strengths & Weaknesses (`SkillsView`):** an example layout: strengths with evidence, weaknesses with evidence and an improvement plan. The real record is `Planned`.
4. **Brightspace Material (`MaterialsView`):** a placeholder owned by Thu (access design; optional RAG over course files).
5. **Settings (`SettingsView`), wired for real (it was a static mock before):**
   - AI and distracting websites: switch each on/off, remove, add (name plus websites; URLs are trimmed to the domain);
   - window-title capture, Read Replies Aloud and Voice Mode switches;
   - Export Data and Clear All Data (keeps settings);
   - errors from `settings-set` are shown.

## Shared pieces
- **`components/Planned.tsx`:** a "Coming next · owner" box with what the section will show and its data source, plus `ExampleBadge`.
- **`components/FocusBars.tsx`** and **`format.ts`:** durations, dates, category shares.
- **Styles:** new classes at the end of `styles/Dashboard.css` (`planned`, `chip`, `focus-bar`, `rule-row`, …).

## Removed
`TodayView`, `GoalsView(.css)`, `PapersView(.css)`, `HistoryView`, `PaperReading(.css)`. Their backend (plan, papers and reading, history) is untouched. Watch mode still uses reading for papers.

## Verified
- **Real app on a scratch profile (`WOLFIE_SMOKE_DASH`):** one short session recorded, all five pages open, with screenshots.
- **Settings check:** added "Discord" (`https://discord.com/channels` saved as `discord.com`), switched it off (`enabled: false` saved), removed it (gone).
- Typecheck and lint are clean.

## Next (Tuan)
1. **Session report:** save Watch mode's session memory per session (today it's in memory only and lost on restart): topics, sources, problems and their outcomes. Generate a report at session end.
2. **Strengths & weaknesses record:** topics with evidence across sessions (answer checks, hint depth, stalls) and a plan per weakness.
