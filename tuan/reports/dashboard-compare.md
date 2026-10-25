# Dashboard: Thu's version (origin/main 833cf05) vs Tuan's (tuan/skills)

For Tuan to decide later what to keep.
- **Meanwhile:** Tuan's data and pages, in Thu's retro look.
- **Brightspace:** Thu's.

## What Thu changed
- **Retro dashboard:** `pixel-components/`, `styles/tokens.css`, `RetroTheme.css`, `AppShell` (sidebar, top bar, Sensei sprite, level and XP), and pixel fonts.
- **New pages:** `DashboardPage`, `ReportPage`, `StrengthWeaknessPage`, `SettingsPage`, `BrightspaceMaterialPage`. Her `App.tsx` uses these instead of our views. Our views are still in the tree, unchanged.
- **Dashboard backend:** `main/dashboard/queries.ts` and `register.ts`, plus `common/ipc-dashboard.ts`.
  - **New tables:** `dash_session_meta` and `problem_attempts`.
  - **Channels:** `dash-summary`, `dash-session-start`, `reports-get-*`, `problem-log`, `brightspace-*`, `dash-prefs-*`.
- **Brightspace:** an extension content script that scrapes courses and materials, `main/brightspace`, shared schemas, `open-external`.
- **Retro onboarding;** the overlay `HoverMenu` positioned absolutely; `window.ipc` added as an alias for the existing preload API.
- **Not touched:** our backend (watcher, hints, voice, chat, reports, skills).

## Page by page
| Section | Thu | Thu's data source | Tuan | Tuan's data source |
|---|---|---|---|---|
| Start session | Studying field, 25/50/90-min timer, "AI sites stay gated until you write an attempt" | `dash-session-start` | Start/Stop | `session-start` |
| Latest report | Topics, problems tagged Solved / Hinted / Stuck, needs-work / strong pair with /10 scores | `problem_attempts`, filled only by manual `problem-log` | Gemini headline, summary, problems Watch mode saw, next steps | `report-get` (session reports) |
| Strengths & weaknesses | Topic scores /10 (weak, getting there, strong), change vs 2 weeks, course filter, practice plan | logged problems plus keyword topic guessing | Skills with status, evidence, dots per session, plan per weakness | `skills-get` (record built from reports) |
| Streak | Independence streak (clean vs leaned-on-AI days), tried first %, AI share vs cap, solved unaided % | logged problems plus prefs | Streak calendar plus self-reliance (AI minutes, hints, full-answer sessions, distracted minutes) | `streak-get`, `history-get` |
| Focus | Productivity curve: focus by hour of day over 14 days, peak and low windows | app activity (real) | Focus split per session | `history-get` |
| Extras | XP and level, "Sensei says", course chips, sample data when empty | `dash-summary` | — | — |
| Settings | Connections, Independence rules, report toggles, Powers, Appearance, Privacy (placeholder text) | `dash-prefs` (saved, nothing enforces them) | AI and distraction site lists, voice and read-aloud, export, clear | real settings |
| Brightspace | Courses and materials | Thu's Brightspace sync | placeholder | — |

## Mismatches to decide on
1. **Two problem and score systems.** Thu's only has data when problems are logged by hand. Tuan's comes from what Watch mode saw. They will disagree.
2. **Independence rules have no behavior.** Nothing in the app gates AI sites or enforces a try-first timer or an AI share cap.
3. **Two report APIs:** `reports-get-*` (Thu) and `report-get` / `skills-get` (Tuan).
4. **Worth keeping from Thu:**
   - the productivity curve, which is real data and is the planned "focus curve";
   - XP and level, as light gamification;
   - the study topic and timer at session start;
   - the Brightspace page.
