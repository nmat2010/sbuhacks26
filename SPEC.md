# Wolfie Sensei: Build Spec (v1)

A companion that sits on the student's laptop and iPad during study/work sessions. It notices when they are stuck, offers graduated hints (by text or voice, including while handwriting), warns when they open AI tools or distractions, keeps a daily streak, and ties sessions to semester goals through a dashboard and a generated plan.

**For Claude Code:** build in the phase order below. Finish each phase, run its acceptance checks, and commit before starting the next. Do not add features that are not in this spec. If something is ambiguous, pick the simplest option, note it in `DECISIONS.md`, and continue. Each phase names an owner (Thu or Tuan); the split and the shared contracts are in section 11.

---

## 1. Scope

### In v1
1. Always-on-top mascot overlay with speech bubbles and voice (desktop)
2. Local session monitoring (active app, window title, idle time)
3. Chrome extension that senses what the student is doing in the browser (domain, page structure, struggle signals)
4. Warnings for AI tools and distracting apps (configurable lists)
5. Stuck detection with graduated escalation and a five-level hint ladder, proactive, by text or voice
6. Goals and semester input, plan generation
7. Project ideas and starter paper recommendations
8. Paper reading mode: ask about concepts you are stuck on, by text or voice
9. Dashboard (goals, plan, session history, streak)
10. Daily streak (Duolingo-style) as the first resilience feature
11. iPad app: handwriting notebook with Wolfie, handwriting-aware stuck detection and hints, voice, on-demand camera check of physical paper, synced with the desktop app
12. Demo-safe mode: deterministic mock providers and scripted demo scenarios
13. Event logging so more resilience features can be added later

### Not in v1
- Other resilience mechanics beyond the streak (see section 9)
- Wolfie acting on the student's behalf (no clicking, typing, or submitting for them; Wolfie only observes and coaches)
- Accounts, cloud sync, multi-user, Android, Windows (keep OS-specific code behind interfaces)
- Monitoring other iPad apps (iOS does not allow it; see section 3)

---

## 2. Assumptions (change in `DECISIONS.md` if wrong)

- **Desktop:** macOS first. Electron + TypeScript + React (Vite).
- **Browser sensor:** Chrome extension, Manifest V3, TypeScript. It is a sensor only: Wolfie's character lives in the desktop overlay, not injected into web pages.
- **iPad/Tablet:** Web app (React + TypeScript), works in Safari on iPad and other tablet browsers. HTML5 Canvas for drawing, Web Speech API for voice, Camera API for photographing paper.
- **Storage:** desktop local SQLite (`better-sqlite3`); web app uses IndexedDB for offline queue and localStorage for pairing token.
- **LLM:** Gemini API, called only from the desktop main process. The web app and the extension never hold API keys.
- **Voice (desktop):** provider interfaces for speech-to-text and text-to-speech, default implementation using Eleven Labs for TTS and speech-to-text, keys in `.env`. A mock provider is used in dev and demo mode.
- **Voice (web app):** Web Speech API (browser-native, on-device), so audio stays on the device.
- **Sync:** the web app connects to the desktop over the local network via WebSocket (6-digit pairing code, shared secret in localStorage). The extension connects to the desktop over loopback only. No cloud server in v1.
- **Mascot art:** placeholder sprite sheet for now. The team supplies final art and confirms it may use the university mascot. Do not generate or imitate mascot artwork.

---

## 3. Architecture

```
Desktop (Electron)
 ├─ monitor/      active-window poller, idle detector, session manager
 ├─ rules/        distraction + AI-tool matching, nudge scheduler
 ├─ stuck/        signal intake, escalation engine, hint service
 ├─ voice/        mic capture, STT/TTS providers, barge-in, local intents
 ├─ streak/       streak engine
 ├─ llm/          provider interface (claude | mock), prompts, JSON-schema outputs
 ├─ sync/         loopback server for the extension, LAN server for the iPad, pairing
 ├─ db/           SQLite schema, migrations, repositories
 └─ ipc/          typed channels to renderers
Renderer windows
 ├─ overlay/      transparent, frameless, always-on-top mascot + bubbles
 └─ dashboard/    goals, plan, papers, history, streak, settings

Chrome extension (MV3)
 ├─ content/      page understanding (PageSummary), signal tracker
 ├─ background/   connection to desktop, tab tracking, exclusions
 └─ popup/        status, pause, excluded sites, pairing token

Web App (React, for tablets/iPad)
 ├─ Notebook/     HTML5 Canvas drawing, pages, selection tool
 ├─ Wolfie/       mascot widget, bubbles, NudgeQueue
 ├─ Stuck/        canvas-activity signals, escalation engine
 ├─ Voice/        Web Speech API (browser-native)
 ├─ Capture/      canvas render, Camera API for physical paper photos
 ├─ Sync/         WebSocket client to desktop, IndexedDB offline queue
 └─ Today/        read-only plan items + streak
```

### Repository layout
```
wolfie/
  shared/        Zod schemas, JSON Schemas, types, mock hint bank, test fixtures
  desktop/       Electron app
  extension/     Chrome MV3 extension
  web/           React web app for tablets/iPad
  demo-pages/    scripted demo scenarios (see Phase 4 and section 8)
  DECISIONS.md  TESTING.md
```

### Shared contracts
- `shared/schemas/` holds JSON Schemas for: nudge, hint request/response, sync messages, extension messages, `PageSummary`, struggle signals. Zod types for TypeScript are exported and used across desktop, extension, and web app.
- `shared/fixtures/` holds example JSON for every message and `escalation.json` (signal sequences with expected levels). Both the desktop and web app TypeScript test suites must pass against the same fixtures, so the two implementations of the escalation engine stay identical.

### Rules
- Monitoring and rule matching run locally on each device. Images (screenshots, page renders, camera photos) leave a device only when the user triggers or accepts a hint request, and go only to the paired desktop and then to the LLM API.
- Audio is never stored and never sent to the LLM; only transcripts of the student's turns are used, in memory, for the current session.
- The desktop renderer never touches the database or API keys; typed IPC only.
- Every user-visible nudge goes through one `NudgeQueue` per device that enforces cooldowns.
- **Web app limitation:** the web app can only observe itself (the browser tab). It cannot see which other apps or browser tabs are open. Drawing/handwriting monitoring therefore happens inside the Wolfie web notebook. The Page Visibility API can detect when the user switches tabs or apps, but which tab/app was opened is not known.

---

## 4. Data model

### Desktop SQLite
```
sessions(id, device, started_at, ended_at, goal_id NULL, label, assessment_mode)  -- device: desktop | webapp
app_events(id, session_id, ts, app_name, window_title, url_domain NULL, is_idle)
web_signals(id, session_id, ts, type, strength, meta_json)                         -- from the extension, see Phase 4
nudges(id, session_id, ts, device, kind, level, payload_json, user_response)       -- kind: distraction | ai_tool | stuck | streak | other
goals(id, title, type, target_date, status)                                        -- type: research | job | project | course | other
plan_items(id, goal_id, title, due_date, status, notes)
papers(id, goal_id NULL, title, url_or_path, status, added_at)
paper_questions(id, paper_id, question, answer, input_mode, ts)                    -- input_mode: text | voice
hint_requests(id, session_id, ts, device, source, trigger, image_path NULL, hint_level, hint_text) -- source: screen | page | handwriting | camera
webapp_activity(id, session_id, ts, type, meta_json)                               -- canvas_stroke | erase | undo | clear | tab_hidden | tab_visible
streak_days(local_date, qualified, focus_minutes, freeze_used)
streak_state(current, longest, freezes_available, last_freeze_grant)
settings(key, value_json)
events(id, ts, device, type, payload_json)                                         -- generic append-only log, see section 9
```

### Web App (IndexedDB)
```
notebooks (id, title, createdAt)
pages (id, notebookId, canvasDataUrl /* base64 PNG */, updatedAt)
pendingSync (id, kind, payload, createdAt)                                         -- queue for offline events
```
Notebook content stays in the browser. Only session metadata, activity summaries, and requested images are sent to the desktop.

Window titles and page text can be sensitive. Provide a "clear history" button, a setting to disable title capture (app name only), and a setting to disable the extension's page text (domain only).

---

## 5. Build phases

### Phase 0: Scaffold and contracts
**Owner: Thu and Tuan together (the first working session; see section 11).**
- Monorepo with `shared/`, `desktop/`, `extension/`, `web/`, `demo-pages/`.
- Desktop: Electron + Vite + React + TypeScript, ESLint, Prettier, Vitest. Two windows: overlay (transparent, frameless, always-on-top, click-through except on the mascot) and dashboard. Typed IPC, SQLite with migrations, `.env` loading.
- Extension: MV3 skeleton that builds and loads unpacked, with a popup.
- Web app: React + Vite + TypeScript skeleton that serves on a local dev server and can be opened on any device.
- `llm/` provider interface with `gemini` and `mock` implementations; `DEMO_MODE=1` forces mock providers (LLM, STT, TTS).
- Write and freeze the contracts in section 11 (schemas, nudge API, settings keys), with fixtures.

**Accept:** `npm run dev` opens both desktop windows; the overlay shows a draggable placeholder mascot. The extension loads in Chrome. The web app loads in a browser (desktop or tablet). A test IPC round trip writes and reads a DB row. Contract fixtures validate in TypeScript.

### Phase 1: Mascot overlay and voice
**Owner: Thu (overlay, NudgeQueue, voice UI) with Tuan providing the speech provider implementations.**

*Overlay*
- Sprite states: idle, talking, alert, sleeping, plus escalation states: glance, question-mark (used in Phase 4).
- Speech bubble with text, optional buttons, auto-dismiss.
- `NudgeQueue` in main: priority, per-kind cooldown, max nudges per hour (configurable), global "snooze 30 min".
- Right-click menu: start/stop session, open dashboard, snooze, pause monitoring, voice on/off, quit.
- API exposed to the rest of the app: `nudge.push({ kind, level, text, spokenText?, buttons[], priority })`.

*Voice*
- Mic capture in a hidden renderer (AudioWorklet to 16 kHz PCM) streamed to the STT provider; end-of-turn detection from the provider (fall back to a simple voice-activity timeout). Streaming TTS played back through Web Audio, starting on the first audio frame.
- `SttProvider` / `TtsProvider` interfaces with an Eleven Labs implementation and a mock (typed utterances from the developer panel; TTS shown as text only). If no key is set, voice is off with a friendly note and everything still works by text.
- Voice mode toggle (default `Alt+Shift+V`) plus optional hold-to-talk. A green dot on the mascot means the mic is live; one click mutes. The mic is only ever live during an active session with voice mode on.
- **Barge-in:** speech that is not an echo of Wolfie's own words stops playback immediately and interrupts the TTS stream. Echo suppression compares incoming transcripts to the text just spoken; recommend headphones in the UI.
- **Local intents (no model call, under 200 ms):** "stop", "wait", "hold on", "quiet" (stop talking); "snooze"; "mute"; "I'm good" (decline an offer); "another hint"; "I got it"; "repeat that".
- Spoken replies are short: Wolfie speaks the first two sentences of a hint and the bubble shows the full text.
- Failure handling: STT socket loss reconnects up to 3 times, then Wolfie says in the bubble that voice is having trouble and text still works. TTS failure falls back to text.

**Accept:** A debug command pushes a nudge and the bubble appears; 10 quick nudges show at most the configured number; snooze suppresses them. With mock providers, a typed utterance produces a spoken-style response in the bubble; with real keys, speech in and out works. Talking over Wolfie stops playback and the new utterance is processed; Wolfie's own speech is not transcribed back as input. "Stop", "snooze", and "another hint" work without any LLM call.

### Phase 2: Session monitoring and extension connection
**Owner: Tuan.**
- Start/stop sessions manually; optionally auto-start when a user-chosen "study app" is focused.
- Poll the active window every 2 seconds: app name and window title. Detect idle time with Electron `powerMonitor.getSystemIdleTime()`.
- Write `app_events` only when the app or title changes, plus idle flag changes.
- Handle macOS Screen Recording, Accessibility, and Microphone permissions with a clear first-run explanation screen.
- **Extension connection:** the desktop runs a loopback-only WebSocket endpoint. The extension connects with a pairing token entered once in its popup. Reject connections without a valid token or from any origin other than the extension's own. The extension reports the active tab's URL domain and title on change, but only while the browser is the frontmost app and a session is active. The desktop stores the domain in `app_events.url_domain`.
- The extension popup shows connection status, a pause toggle, and an excluded-sites list. Defaults exclude banking, email, and health-portal domains, and the user can edit the list. Excluded and incognito pages report nothing.

**Accept:** After a 5-minute test session switching between apps and sites, the DB shows correct time per app and per domain and idle periods. With the extension disconnected the app keeps working using window titles. Denying permissions shows a helpful message and does not crash. A WebSocket client without the token is rejected.

### Phase 3: AI-tool and distraction warnings
**Owner: Tuan (rules, message pools reviewed by Thu for tone).**
- Settings lists with defaults: **AI tools** (Claude, ChatGPT, Gemini, Copilot, Perplexity) and **distractions** (YouTube, Netflix, Instagram, TikTok, Reddit, games). Users can add, remove, and toggle entries.
- Matching: when the extension is connected, match on the tab's domain; otherwise fall back to app name and window title. Domain matching is the primary path because titles are unreliable.
- During an active session, when a matched app or domain comes to the front, Wolfie speaks up through the `NudgeQueue`. Tone is a warm teacher voice, not a scolding one. Message pools per kind with variation. Spoken if voice mode is on.
- Cooldown per rule (default 10 minutes).
- The user can answer from the bubble or by voice ("Taking a break", "I need this for the task", "Ignore for this session"). Responses are logged in `nudges.user_response`, and "ignore" suppresses that rule for the session.
- No nudges outside an active session.

**Accept:** In a session, opening a listed site triggers a nudge within 3 seconds with the extension connected and within 5 seconds with only window titles. Cooldowns and ignores work. Outside a session, nothing fires. Every nudge and response is logged.

### Phase 4: Stuck detection, escalation, and hints
**Owner: Tuan (signals, escalation engine, hint service, extension page understanding, demo scenarios). Thu (escalation sprite states, spoken hint conversation UI).**

**4a. Page understanding (extension).**
- The content script builds a compact `PageSummary`: URL and domain, title, headings, visible text (about 2,500 characters, viewport first), up to 120 interactive controls with role, label, state and a stable id, visible error messages, open dialogs, and any detected "problem region". No raw DOM is ever sent.
- Never read or send values from password, payment, one-time-code, or other sensitive fields. Skip excluded domains entirely.
- Throttled: send on meaningful change and on request from the desktop, not continuously.
- When the browser is frontmost and a `PageSummary` is available, hints use it as context in preference to a screenshot. Screenshots are the fallback for non-browser apps, canvas, PDF viewers, and pages where the summary is empty.

**4b. Struggle signals.** Cheap, local, no model calls. Each signal has a type and a strength (weak or strong) and is stored in `web_signals` (web) or computed in the main process (desktop). Thresholds are tunable in settings.
- `wrong_answer_loop` (strong): 2 or more failed checks on the same problem (result text indicates incorrect, error, or failure after a submit-like action).
- `dead_control_clicks` (strong): 3 or more clicks on a disabled or no-effect control within 20 seconds.
- `validation_errors` (weak): 3 or more errors after submits within 2 minutes.
- `backtracking` (weak): URL oscillation A→B→A 3 or more times within 2 minutes.
- `context_switch_loop` (weak): 3 or more rapid switches between the work window and the same other window within 2 minutes.
- `idle_on_work` (weak): same work window focused with no input for N minutes (default 4).
- `long_on_problem` (weak): same problem for more than N minutes (default 12) with no visible progress.
- Start with generic text-pattern detection and a small, optional adapter list for a couple of known sites (e.g. a coding-practice site and a generic quiz page). Do not build per-site adapters beyond that.

**4c. Escalation engine.** One pure function `computeLevel(signals, state) -> 0..4` in `stuck/escalation.ts`, unit-tested with the shared fixtures.
- Level 0: nothing. Level 1: Wolfie glances toward the work. Level 2: a "?" appears over Wolfie. Level 3: a bubble offers help ("Want a hint?") with buttons. Level 4: Wolfie speaks the offer (only when voice mode is on; otherwise the maximum is level 3).
- Weak signals alone cap at level 2. A strong signal, or two weak signals together, can reach level 3. Level 4 requires level 3 to have been shown and left unanswered for 60 seconds.
- Cooldown of 45 seconds between escalation steps. A decline starts a 3-minute cooldown and lowers intensity by one level for 10 minutes. "I'm good" (button or voice) suppresses offers for that problem for the rest of the session. Snooze and pause are always respected.
- No offer appears within 5 seconds of recent keyboard or mouse input.
- Wolfie never gives a hint unasked; the levels only escalate the offer.

**4d. Manual entry points.** Global hotkey, clicking Wolfie, or saying "I'm stuck" in voice mode all start the same hint flow.

**4e. Hint flow and ladder.**
1. On accept, assemble context: `PageSummary` if available, else capture the active window (`desktopCapturer`) with a preview and a confirm the first time per session.
2. `requestHints(context, source, assessment)` calls the LLM with a system prompt that makes it a tutor, not an answer machine. It returns structured JSON: `{ "what_i_see": string, "hint_levels": [nudge, hint, explanation, analogous_example, direct_step] }`.
   - Level 1, nudge: a question or pointer to look somewhere.
   - Level 2, hint: a more specific pointer.
   - Level 3, explanation: the underlying concept in plain words.
   - Level 4, analogous example: a similar worked problem, not the student's own.
   - Level 5, direct step: the next concrete step, never the full solution.
   - Levels 1 to 2 stay under about 40 words; levels 3 to 5 under about 90 words.
3. Wolfie shows level 1 (speaking the first two sentences in voice mode). Buttons or voice: "Another hint", "I got it", "I'm good", and "Show the answer". Each choice is logged in `hint_requests`.
4. **Voice follow-ups:** in voice mode the student can say things like "I don't get step 2". The utterance goes to the hint service with the last 6 turns of conversation and the same context, and Wolfie answers at the current level or one level up.
5. **Assessment mode:** a per-session toggle, "This is graded work", and an optional list of assessment domains in settings. In assessment mode "Show the answer" is hidden, the prompt forbids giving the final answer, and the ladder tops out at level 5 as a next step only.
6. Images are stored locally only if the user enables it in settings; otherwise deleted after the call.

**4f. Offline and demo behavior.**
- If the LLM call fails after one retry, fall back to a rule-based generic ladder (restate the problem in your own words, list what you know, try a smaller case, and so on), labeled "offline hints".
- With `DEMO_MODE=1`, the mock provider returns deterministic hints keyed by the demo problem IDs in `shared/` so a live demo never depends on the network or model.
- `demo-pages/` contains scripted scenarios: (A) an algebra problem with a wrong-answer loop leading to the offer and hint, (B) a page with a disabled "Continue" control that triggers dead-control clicks, (C) a coding-practice-style page with failing results, (D) a distraction scenario for Phase 3.

**Accept:** Unit tests for `computeLevel` pass on the shared fixtures, including cooldowns, declines, "I'm good", and the voice-off cap at level 3. In demo scenario A, two wrong answers escalate through the levels to the offer; accepting shows five distinct ladder levels one at a time and "Show the answer" appears only outside assessment mode. A `PageSummary` never contains password or payment field values. With the network disabled and `DEMO_MODE=0`, the offline ladder appears. In voice mode, "I'm stuck" starts the flow and "I don't get step 2" gets a contextual reply. With image storage off, no image file remains after a call.

### Phase 5: Goals and plan generation
**Owner: Tuan (generation logic), Thu (onboarding and plan UI).**
- Dashboard onboarding: semester dates, courses (name, credits, important dates), weekly hours available, and goals (research, job applications, projects, courses) with target dates.
- "Generate plan" calls the LLM with a JSON schema and returns weekly milestones, `plan_items` with due dates, and a short rationale. The user can edit, delete, reorder, and regenerate any item.
- Plan view: this week and a timeline. Checking off an item updates status.
- Wolfie can reference the current plan in nudges ("Today's goal: finish section 2 of the paper").

**Accept:** From a sample input (3 courses, 10 free hours per week, goal "get into a research lab by spring") the app produces a valid, editable plan saved in the DB. Invalid LLM JSON is retried once, then shows a clear error.

### Phase 6: Project ideas and paper recommendations
**Owner: Tuan.**
- For a goal of type research or project, a "Suggest" action returns 3 to 5 project ideas, each with scope, required skills, and a first-week task, plus a starter reading list with title, authors, year, one-line why, and a link.
- **Do not trust model-generated citations.** Use arXiv and/or Semantic Scholar to find and verify each recommended paper. Drop any that cannot be verified and show the verified link.
- Adding a paper creates a `papers` row and can create a plan item ("Read paper X by date").

**Accept:** Suggestions return only papers that resolve through the search API. Adding a paper creates the paper row and an optional plan item.

### Phase 7: Paper reading mode
**Owner: Tuan (extraction, grounding), Thu (reading view UI, voice questions).**
- Add a paper by PDF upload or arXiv URL. Extract text locally and chunk it.
- Reading view with the paper beside a chat panel. The user asks about a concept, selects text and clicks "Explain", or asks by voice. Answers are grounded in the paper's chunks with section references. If the paper does not cover it, the answer says so and gives a short general explanation, clearly labeled.
- Options: "Explain simply", "Give me a question to check my understanding", "Show me where this is in the paper".
- Q&A is saved to `paper_questions` with the input mode. In voice mode answers are spoken (first two sentences) with the full text shown.

**Accept:** On a sample arXiv paper, selecting a paragraph and asking "what does this mean?" returns an answer citing the correct section, by text and by voice. A question outside the paper is labeled as general knowledge.

### Phase 8: Dashboard
**Owner: Thu (UI), Tuan (queries and data).**
- **Today:** active goal, plan items due, session start/stop, current streak.
- **Goals and plan:** from Phase 5.
- **Papers:** list, status, questions asked.
- **History:** sessions from both devices with time per category (work / AI tools / distraction / idle), nudge count, escalation levels reached, hint count and deepest hint level. Simple charts.
- **Settings:** monitored lists, nudge frequency, stuck thresholds, voice (on/off, provider keys status, hold-to-talk), assessment domains, extension status and excluded sites, image options, data clearing and export (JSON).

**Accept:** After several test sessions, History totals match the raw `app_events`. Export produces a JSON file and "Clear all data" empties every table.

### Phase 9: Daily streak (first resilience feature)
**Owner: Tuan (engine), Thu (streak UI and Wolfie reactions).**
A Duolingo-style streak that tracks consecutive days the student showed up and did focused work.

- **Qualifying day:** at least one session totaling at least 20 focused minutes that day (desktop and web app combined; focused means work-category time, excluding idle, AI-tool and distraction time). The threshold is a setting. The rule is a single swappable function `dayQualifies(day) -> boolean` in `streak/rules.ts`.
- **Day boundary:** the user's local calendar date, handled correctly across time zones and DST. Store `local_date` strings.
- **Streak state:** current streak, longest streak, a weekly calendar view (filled / missed / frozen).
- **Streak freeze:** earn 1 freeze per week of streak (maximum 2 stored). A missed day consumes a freeze automatically if available; otherwise the streak resets to 0.
- **Wolfie reactions:** a small celebration when today first qualifies; milestone messages at 3, 7, 14, 30, 60, 100 days; a gentle evening reminder (default 8 pm, configurable, off-able) if today has not qualified and a streak is at stake; a kind, non-guilt message after a reset. Spoken in voice mode.
- Streak shows on the dashboard Today view, the mascot menu, and the web app Today screen.
- The desktop streak engine is the source of truth; web app sessions count once synced, and late-synced sessions trigger recalculation of affected days.

**Accept:** Unit tests with simulated multi-day histories cover qualifying and non-qualifying days, freeze earn and consume, reset, longest streak, timezone change, DST transition, and late-synced web app sessions. In the app, finishing a 20-minute session triggers the celebration once and updates the dashboard.

### Phase 10: Pairing and sync
**Owner: Tuan (desktop server), Thu (web app client).**
- Desktop runs a WebSocket server on the LAN for the web app (separate from the loopback endpoint used by the extension). Settings shows a 6-digit pairing code and paired devices with "Unpair."
- The web app finds the desktop via manual IP entry or QR code, enters the code, and both store a shared secret (desktop in DB, web app in localStorage). All messages are authenticated; unauthenticated connections are rejected.
- Message types: `session.start/end`, `webapp.activity` (batched), `nudge.log`, `hint.request`, `hint.followup`, `hint.response`, `plan.snapshot` and `streak.snapshot` (desktop to web app, read-only).
- The web app queues outbound messages in IndexedDB `pendingSync` table when the desktop is unreachable and replays them in order on reconnect; the desktop dedupes by message ID.
- `hint.request` and `hint.followup` fail fast with a clear web app message when the desktop is unreachable ("Wolfie's desktop isn't reachable. Your notebook still works.").

**Accept:** Pairing works with the correct code and fails with a wrong one. A web app session created offline appears in the desktop History after reconnect with no duplicates. Unpairing stops all traffic. All message fixtures validate in TypeScript.

### Phase 11: Web app notebook, Wolfie, and voice
**Owner: Thu.**
- Notebooks and pages with an HTML5 Canvas: pen, highlighter, eraser, selection tool, undo/redo, colors, page add/delete, thumbnails. Touch and stylus support (works with Apple Pencil in Safari on iPad).
- Wolfie widget in a screen corner: draggable, sprite states (including glance and question-mark), speech bubbles, same `NudgeQueue` rules.
- Sessions: start/stop in the notebook, or auto-start on the first canvas stroke after a gap (configurable). Session time counts toward the streak.
- Tab visibility detection using Page Visibility API: if the tab is hidden longer than a configurable time (default 60 seconds) during a session, Wolfie says something on return. Be explicit in-app that the specific app/tab visited is not known.
- **Voice:** a push-to-talk button on the Wolfie widget. Web Speech API (browser-native) for recognition and synthesis; transcripts go to the desktop as `hint.followup` messages. Barge-in stops synthesis when the student speaks. Local intents ("stop", "another hint", "I got it", "I'm good") work without a round trip. Mic permission is requested on first use; audio is never stored.
- **Today** screen: plan items due today (read-only), streak, start-session button.

**Accept:** On an iPad (or any tablet), drawing is responsive with touch/stylus, pages persist in IndexedDB after browser reload, a session logs correctly and appears on the desktop, and hiding the tab past the threshold triggers the return message. Voice works with push-to-talk, "stop" cuts speech immediately, and a spoken follow-up while offline shows the unreachable message.

### Phase 12: Canvas-based stuck detection, hints, and camera check
**Owner: Thu (canvas signals, UI, camera), Tuan (hint service support for handwriting and camera sources).**

**Canvas-activity signals** (tracked locally; raw canvas data is never uploaded automatically):
- `idle_on_page` (weak): no drawing activity for N minutes (default 4) on a page that has content.
- `scribble_outs` (strong): repeated erasing or drawing over the same area (3 or more in 90 seconds).
- `undo_burst` (weak): 5 or more undos in 60 seconds.
- `abandoned_start` (weak): began drawing, then a long pause with no mouse/touch input.

The web app uses the same escalation engine (levels 0 to 4, cooldowns, decline and "I'm good" behavior, no offer within 5 seconds of recent drawing), tested against `shared/fixtures/escalation.json`. Level 4 is spoken only when voice mode is on. Wolfie never gives a hint unasked.

**Hint flow for handwritten work:**
1. The student taps Wolfie, clicks "Get hint", says "I'm stuck", or accepts an offer.
2. They may use the selection tool to select a region ("select the part you're stuck on"); otherwise the whole canvas is used.
3. The app converts the canvas region to an image (PNG), shows a preview, and sends `hint.request` with `source: handwriting` to the desktop, which runs the Phase 4 hint service. The same five-level ladder, assessment mode, and offline fallback apply.
4. If the handwriting is illegible or ambiguous, the hint says what could not be read and asks the student to clarify instead of guessing.

**Camera check of physical paper:**
- A "Check paper" button opens the device camera via `<input type="file" capture="environment">`. The student photographs their handwritten work, previews it, and confirms. Same hint flow with `source: camera`.
- On demand only. No continuous video or background camera use, ever.

**Demo support:** a developer-only "simulate stall" control and a pre-filled demo canvas so the escalation and hint flow can be shown without waiting for a real pause.

**Accept:** Simulated canvas activity triggers each signal as specified and none during active drawing, with identical levels to the desktop TypeScript engine on the shared fixtures. A selected handwritten math or code problem returns five distinct hint levels. A photographed paper returns hints. With image storage off on the desktop, no image persists after the call. Camera permission denial shows a clear message. The demo scenario runs end to end with `DEMO_MODE=1` and no network.

---

## 6. LLM usage rules

- All calls go through `llm/client.ts` behind a provider interface (`gemini`, `mock`), with a request timeout, one retry, and a per-day call cap in settings.
- Use structured JSON outputs validated with Zod. Reject and retry once on schema failure.
- Prompts live in `llm/prompts/` as versioned files, not inline strings.
- The tutor persona prompt must: ask before telling, give the smallest useful hint first, follow the five-level ladder, stay within the word limits, and keep a warm, encouraging voice. It receives an `assessment` flag and must never give a final answer when it is true.
- Handwriting and camera prompt addition: if the writing is illegible or ambiguous, say what could not be read and ask for clarification.
- Never log API keys. Redact window titles, URLs, and page text from debug logs.

## 7. Privacy and safety requirements

- First-run consent screen on each app (desktop and web) explaining what is monitored, what stays local, and what is sent to the API (images and page summaries only when a hint is requested or accepted).
- Window-title capture, page text, and image storage are each off-able in settings.
- One-click "pause monitoring" in the mascot menu on both desktop and web app, reflected by a sleeping sprite. Pausing also mutes the mic and tells the extension to stop reporting.
- Nothing is monitored outside an active session.
- The extension requests broad host access in v1 so it can run on any site; note this in `DECISIONS.md` and restrict it to an allowlist before any public release. Excluded domains and incognito windows report nothing.
- Audio is never stored. Saving transcript history is opt-in and off by default.
- Web app: camera and microphone permissions requested only when first used (browser-managed). Raw canvas data and notebooks never leave the browser automatically.
- Sync is local-network only for the web app and loopback only for the extension; both require pairing, and unpairing deletes the shared secret on both sides.

## 8. Testing

- Unit tests: rule matching (apps and domains), cooldown logic, stuck signals, `computeLevel` against shared fixtures (TypeScript), NudgeQueue limits, plan JSON validation, streak engine, sync dedupe, `PageSummary` redaction of sensitive fields, voice local intents.
- Contract tests: every JSON fixture in `shared/fixtures/` validates in TypeScript (desktop and web app).
- Integration tests: a simulated session event stream produces expected nudges and DB rows; a simulated web app client against the sync server covers pairing, offline replay, and a hint round trip; a simulated extension client covers domain reporting and `PageSummary` delivery.
- Demo suite: each scenario in `demo-pages/` runs with `DEMO_MODE=1`, offline, and produces the expected escalation and hints.
- Manual checklist in `TESTING.md` for permissions (screen, accessibility, microphone, camera), overlay click-through, multi-monitor, sleep/wake, touch/stylus behavior, voice barge-in with and without headphones, and network loss mid-hint.

## 9. Hooks for more resilience features (not built in v1)

The streak (Phase 9) is the only resilience mechanic in v1. The team may add more, so keep the foundation:
- A generic `events` table and `logEvent(type, payload)` helper called for: session start/end, nudge shown/answered with level, stuck signals, hint requested and deepest level used, offers accepted/declined, plan item completed, streak qualified/frozen/reset.
- Timestamps on everything, so durations such as time-to-first-hint can be computed later.
- A `features/` directory on desktop (and `/features/` on web app) where new mascot behaviors can be registered without editing core code.

Do not implement any scoring, predictions, or training logic beyond the streak.

## 10. Definition of done for v1

A student can set up the desktop app and web app, install the extension, pair them, enter their semester and goals, and get a plan. On the laptop they can start a session, get warned when opening AI tools or distractions, see Wolfie escalate gently when they struggle, and get a five-level hint ladder by text or voice, with assessment mode available. They can add a paper and ask questions about it by text or voice. On a tablet (iPad or other) they can draw in a notebook, get Wolfie's offer and hints when their work stalls, talk to Wolfie, and photograph physical paper for a hint. Focused time from both devices builds a daily streak with freezes and Wolfie reactions, and the dashboard shows sessions, plan, and streak. All monitoring data is stored locally and clearable, and the full demo runs offline in demo mode.

---

## 11. Team split (2 people)

### Day-zero contracts (both, before splitting)
Freeze these in Phase 0 so the two tracks can build against stubs:
1. JSON Schemas and fixtures: nudge, hint request/response (five levels), sync messages, extension messages, `PageSummary`, struggle signals.
2. The `nudge.push(...)` API and `NudgeQueue` behavior.
3. The `requestHints(context, source, assessment)` signature and mock responses for the demo problems.
4. The streak API: `getStreak()` and a `streak.snapshot` message.
5. Settings keys and the DB schema in section 4.
6. `shared/fixtures/escalation.json` with the expected levels.

### Tuan: Desktop and intelligence
Phases 2, 3, 4 (signals, escalation, hint service, extension, demo pages), 5 and 7 (logic), 6, 9 (engine), 10 (desktop server), plus the speech provider implementations from Phase 1, the LLM client and prompts, mock/demo mode, and desktop-side support for the handwriting and camera sources in Phase 12.

### Thu: Experience and Web App
Phases 1 (overlay, NudgeQueue, voice UI), 5, 7 and 8 (all dashboard and reading UI), 9 (streak UI and reactions), 10 (web app client), 11, and 12 (canvas signals, selection tool, camera, web app escalation engine), plus mascot animation and demo scripting for the web app.

Whoever is more comfortable with React/frontend should take Thu's web app work and trade smaller desktop UI pieces to the other person if the load feels uneven.

### Milestones and integration checkpoints
- **M0, together:** Phase 0 and the contracts. Exit: both tracks can run against mocks.
- **M1:** Tuan builds monitoring, extension connection, and warnings; Thu builds the overlay, NudgeQueue, and dashboard shell. **Integrate:** a distraction warning appears on the overlay, spoken in voice mode.
- **M2:** Tuan builds the signals, escalation engine, and hint service; Thu builds the web app notebook and Wolfie widget (no sync yet) and the escalation sprite states. **Integrate:** desktop demo scenario A runs end to end.
- **M3:** Tuan builds plan, papers, and the sync server; Thu builds dashboard screens and the web app sync client. **Integrate:** a web app hint request round-trips through the desktop.
- **M4:** Tuan builds the streak engine, voice pipeline polish, and handwriting source support; Thu builds streak UI, web app canvas signals, camera, and web voice. **Integrate:** the web app stall demo and a streak update across both devices.
- **M5, together:** demo mode polish, all demo scenarios offline, full test pass, privacy review, and the pitch walkthrough.

### Working agreements
- Changes to anything in `shared/` need the other person's review, since both tracks depend on it.
- Each person owns their phases' tests; the shared fixtures are owned jointly.
- If one track slips, cut in this order: voice on web app, camera check, per-site extension adapters, paper recommendations. The core loop (monitor, escalate, hint, streak) must survive.