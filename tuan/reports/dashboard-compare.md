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

## Done on tuan/dashboard-merge (not pushed; main untouched)
- **Merge:** Thu's main merged into `tuan/dashboard-merge`, made from `tuan/skills`. It merged cleanly; her pages and backend are all there.
- **Fixes to her code:**
  - contract fixtures for `ext.brightspace_data` and `desk.request_brightspace`, so the shared contract test passes;
  - two type annotations in `extension/src/content/brightspace.ts`, so typecheck passes.
- **`App.tsx`:**
  - **Thu's:** `AppShell` (top bar, sidebar, Sensei sprite, level and XP from her `dash-summary`) and her retro onboarding.
  - **Tuan's pages:** `HomeView`, `ReportView`, `SkillsView`, `SettingsView`.
  - **Her page:** `BrightspaceMaterialPage`.
  - Her `DashboardPage`, `ReportPage`, `StrengthWeaknessPage` and `SettingsPage` stay in the tree, unused, for the later decision.
- **`styles/retro-views.css`:** restyles Tuan's markup in Thu's look (her tokens, pixel borders, gold headings, gold and red buttons, chips, badges, her square switch), scoped to `.app-shell`. Our base layout (`Dashboard.css`) is still imported for grids and rows. Hard-coded light colors in `HomeView` and `SettingsView` became classes.
- **Smoke:** nav selectors updated for her shell.
- **Verified** on a copy of Tuan's real data:
  - all five pages load in her shell;
  - Settings still saves (add, switch off, remove);
  - screenshots look right.
  - Tests: 703 pass. Typecheck and lint are clean (also fixed 2 lint errors in her extension code: a `let` → `const`, an unused import).

## Decisions (Tuan, 2026-10-25)
- **Kept ours:** problems and scores, streak, settings.
- **Focus:** Thu's productivity curve is real data. From the last 14 days of `app_events`, it slices time into work / AI / distraction / idle (same rules as history), spreads it over hour-of-day buckets (6 AM to 11 PM), and scores each hour as the work share, 0–100, with peak and low windows. It doesn't overlap ours; Tuan was asked whether to add it to our Focus card.
- **Extras, the parts that don't overlap:**
  - **Level and XP:** kept in her sidebar. They count studied minutes; her "solved unaided" part uses her manual log, so it's 0 for now.
  - **"Sensei says":** the card is now on our Dashboard, fed by **our** skills record (latest weak spot, then improving, then strengths, then a start message).
  - **Course chips:** semester, course count, Brightspace synced, extension connected, now in our Dashboard header (her `useBrightspace` / `useAppStatus`).
  - **Sample data:** dropped.
- **Chat avatar:** Thu's pixel Wolfie (`WolfieSprite`) replaces the 🐺 emoji in the chat header, beside each Wolfie message, and in "Thinking...".
