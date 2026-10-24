# Tuan's Track: Execution Plan for 2 Parallel Agents

Source of truth: `SPEC.md`. This file splits Tuan's work (SPEC §11) between two agents, **Agent A (Sensing & Data)** and **Agent B (Intelligence)**, and lists the setup they share.

Ground rules for both agents:
- Read `SPEC.md`, `DECISIONS.md` (especially "Phase 0 fix-up"), `TESTING.md`, and `COORDINATION.md` first. Don't build anything outside the spec. When the spec is ambiguous, pick the simplest option and log it in `DECISIONS.md` under your agent's heading.
- Create your own branch off `main` (`tuan/a-sensing`, `tuan/b-intelligence`) and work in its own git worktree. Until `tuan/phase0-fixes` is merged to `main`, branch from `tuan/phase0-fixes` instead. Commit at the end of each work package, using the commit format in `COORDINATION.md`.
- **Reports are required.** When you finish a work package, and before you stop for any reason (done, blocked, or running low on context or tokens), write or update `tuan/reports/agent-a.md` or `tuan/reports/agent-b.md`. Cover what's done (with commits), what's in progress, what's left, what's blocking you, any decisions you made, and how to run or verify the work. Commit the report on your branch.
- Stay out of Thu's files: `desktop/src/renderer/**`, `web/**`, and `desktop/src/main/nudge/queue.ts`. If you need something from those, use the seams listed below, or write a Contract Change Proposal.
- Don't change `shared/` unless you add a "Contract Change Proposal" to `COORDINATION.md`. Thu has to review shared changes.
- Keep logic pure and unit-testable: pass in clocks, DB handles, and emitters. Tests run in plain Node with Vitest. For DB tests, use `openDatabase(':memory:')` plus `setDatabaseForTesting(db)` (see `desktop/src/main/__tests__/`). `better-sqlite3` 13 loads in both Node and Electron, so there's no rebuild step.
- Before each commit, run `npm run typecheck && npm test && npm run lint`. Run `npm run smoke` when you touch `main.ts`, the preload, or IPC.
- **Agent shells:** VS Code sets `ELECTRON_RUN_AS_NODE=1`. `npm run dev` and `npm run smoke` already unset it. If you launch Electron any other way, prefix the command with `env -u ELECTRON_RUN_AS_NODE`.
- New IPC channels go in `desktop/src/common/ipc.ts`. Register them with `handle()`, `onSend()`, or `sendTo()` from `desktop/src/main/ipc.ts`; never call `ipcMain` directly. In `electron/main.ts`, add only one `registerX()` (or `startX()`) call for your own module.

---

## Phase 0: fixed on `tuan/phase0-fixes`

All 10 problems from the first review are fixed, plus 5 more bugs found while fixing them. Verified with typecheck (all workspaces), 58 tests (47 shared, 11 desktop), lint, `npm run smoke` (overlay → preload → main → SQLite round trip), and an extension build whose manifest references all resolve.

| # | Problem | Fix |
|---|---|---|
| 1 | `npm install` was never run; it fails on Node 24 (`better-sqlite3` 9) | `better-sqlite3` ^13 and Electron 44.7.0; lockfile committed; `shared` consumed from source (no build step) |
| 2 | `ipad` vs `webapp` | `webapp` everywhere (`Device` in `shared/src/schemas/common.ts`); `webapp.activity` |
| 3 | Missing fixtures and contract tests | `shared/src/fixtures/messages.json` covers every message type plus invalid cases; `contracts.test.ts` also checks that every type has a fixture |
| 4 | Escalation fixture had no state | Step-sequence scenarios (11) in `escalation.json`, plus `runEscalationScenario` in `@wolfie/shared/testing`. **The engine itself (`computeLevel`, `applyEscalationEvent`) now lives in `shared/src/schemas/escalation.ts`** and is shared by desktop and web |
| 5 | No extension contract; token in the URL | `ExtensionMessageSchema` (`ext.hello`/`tab`/`page_summary`/`signal`, `desk.hello_result`/`state`/`request_summary`); token goes in the first message; background worker rewritten to use it |
| 6 | Untyped IPC; `set-ignore-mouse-events` had no handler | Channel maps in `desktop/src/common/ipc.ts`; typed preload, `handle`/`onSend`/`sendTo`; handler added; `off()` actually removes listeners now |
| 7 | `__dirname` in the ESM main bundle (would crash) | Derived from `import.meta.url`; preload built as real CommonJS `preload.cjs` (sandboxed preloads can't be ESM) |
| 8 | Gemini stub with a retired model | Moved to the frozen `requestHints(context, source, assessment)` signature and flagged for B1. **B1 still implements it** |
| 9 | Missing `demo-pages/`, `TESTING.md`, `logEvent`, `features/` | All added (`demo-pages/` is a README; A7 builds the pages) |
| 10 | NudgeQueue gaps | Ids; `respond()` / `'response'` event; overlay sends `nudge-response`; DB logging to `nudges` + `events`; `{ userInitiated }` bypass for hint replies; limits from settings; `overlay-state` channel for sprite-only levels 1–2 and sleeping |
| new | Overlay crashed: `React.useEffect` without importing React | Fixed |
| new | Preload's `on()` wrapped the callback, so `off()` leaked the listener | Fixed, and `on()` returns an unsubscribe |
| new | Extension manifest pointed to `dist/dist/*`; no icons; `tsc` can't bundle shared | esbuild build (`extension/build.mjs`); load unpacked from `extension/dist`; placeholder icons |
| new | `nudges.session_id NOT NULL` blocked streak reminders outside sessions | Migration 002: nullable, plus `uid` |
| new | Agent shells set `ELECTRON_RUN_AS_NODE=1`, so Electron started as plain Node | `dev` and `smoke` scripts unset it |

**Still open (not Tuan's):** the `web/` skeleton (Thu, Phase 0 accept), Thu's decision on desktop voice intents (see `COORDINATION.md`), and Thu's review of the contract change.

### Seams the agents build on (already in place)

| Seam | File | Who fills it in |
|---|---|---|
| `getNudgeQueue().push(n, { userInitiated? })` returns an id or null; `.on('response', ...)` | `desktop/src/main/nudge/` | Thu owns it; A and B call it |
| `setMascotState('glance' \| 'question-mark' \| 'sleeping' \| 'idle')` | `desktop/src/main/overlay/state.ts` | B2 (escalation 1–2), A1 (pause) |
| `stuckBus`: `signal`, `input`, `help-requested`, `problem-changed` | `desktop/src/main/stuck/bus.ts` | A emits; B2 subscribes |
| `computeLevel` / `applyEscalationEvent` | `@wolfie/shared` (re-exported in `stuck/escalation.ts`) | done; B2 wraps it |
| `getActiveSession()` / `setActiveSession()` / `sessionEvents` | `desktop/src/main/session/index.ts` | A1 |
| `setLatestPageSummary`, `setPageSummaryRequester`, `requestPageSummary` | `desktop/src/main/sync/context.ts` | A2 sets them; B3 reads them |
| `requestHints`, `requestFollowup` (frozen signatures) | `desktop/src/main/hints/index.ts` | B3 |
| `getSetting` / `setSetting` (typed, with defaults) | `desktop/src/main/settings.ts`, keys and defaults in `shared/src/schemas/settings.ts` | both |
| `logEvent(type, payload)` | `desktop/src/main/events.ts` | both |
| `registerFeature` | `desktop/src/main/features/index.ts` | future resilience features |
| Ports `EXTENSION_WS_PORT` 45678 and `SYNC_WS_PORT` 45679 | `@wolfie/shared` | A2, A8 |

---

## Agent A: Sensing & Data
**Owns:** `desktop/src/main/{monitor,rules,sync,streak,db/repos/{sessions,app_events,web_signals,streak,history}}`, `desktop/src/main/stuck/signals/`, `extension/**`, `demo-pages/**`

| # | Work package | Spec | Done when |
|---|---|---|---|
| A1 | **Sessions + monitor.** Session manager with start/stop and auto-start on the study app. Active-window poller every 2 s, using `active-win` or AppleScript behind a `WindowSource` interface. Idle detection via `powerMonitor`. Write `app_events` only when something changes. Add a first-run permissions check (Screen Recording, Accessibility, Mic) that sends a status over IPC so Thu can render it. Respect the title-capture setting. | Ph 2 | Integration test: a simulated window stream produces the correct `app_events` rows. Denied permissions don't crash the app. |
| A2 | **Extension loopback server.** WS on `127.0.0.1:EXTENSION_WS_PORT` only. Auth uses the first-message token (`ext.hello` → `desk.hello_result`); the background worker already sends it. Check the Origin header against `chrome-extension://<id>`. Send `desk.state` whenever session, frontmost app, pause, or exclusions change. Generate the pairing token, store it in settings, and expose it over IPC. Store domains in `app_events.url_domain`. Implement `sync/context.ts`. | Ph 2 | A test client without a token or with the wrong origin is rejected. A valid client's domain lands in the DB. |
| A3 | **Extension.** Background: reconnect, report the tab only while a session is active and the browser is frontmost (desktop sends `desk.session_state`), honor pause, excluded domains (defaults: banking, email, health portals), and incognito. Popup: status, pause toggle, editable excluded list, token entry. Add placeholder icons. Make sure `npm run build` produces a loadable `dist/`. | Ph 2 | Loads unpacked in Chrome, pairs, and reports domains. Excluded and incognito pages send nothing. |
| A4 | **Rules + warnings.** Default AI-tool and distraction lists in settings. Matcher: domain first, then app name or title as fallback. Per-rule cooldown (10 min). Warm message pools with variation for each kind. Buttons: "Taking a break", "I need this for the task", "Ignore for this session". Record the response in `nudges.user_response`. "Ignore" suppresses the rule for the session. Nothing fires outside a session. | Ph 3 | Unit tests for matching and cooldown. A simulated event stream triggers a nudge within the latency budget. |
| A5 | **PageSummary + web signals (content script).** Headings, ~2,500 characters of viewport-first text, ≤120 controls with stable ids, errors, dialogs, and the problem region. Hard redaction of password, payment, OTP, and `autocomplete=cc-*` fields. Throttle sends to meaningful change or desktop request. Signal detectors: `wrong_answer_loop`, `dead_control_clicks`, `validation_errors`, `backtracking`. Generic text patterns, plus at most 2 tiny adapters. | Ph 4a/4b | Redaction unit tests with fixture HTML (jsdom). Each detector has a test. |
| A6 | **Desktop signals.** `context_switch_loop`, `idle_on_work`, and `long_on_problem`, computed from the monitor and emitted on `stuck/bus.ts`. Forward extension signals into the bus. Store them in `web_signals`. Thresholds come from settings. | Ph 4b | Unit tests with a fake clock. |
| A7 | **Demo pages.** `demo-pages/` static HTML: (A) algebra wrong-answer loop, (B) disabled Continue button, (C) coding page with failing results, (D) distraction scenario notes. Expose problem ids through `data-problem-id` matching the mock hint keys (`demo-algebra-problem`, `demo-disabled-button`, `demo-code-error`), and include them in the PageSummary. | Ph 4f | Each page triggers its signal in a jsdom test. |
| A8 | **LAN sync server.** A separate WS on the LAN (`SYNC_WS_PORT`) implementing the handshake documented in `shared/src/schemas/sync.ts`: `auth.challenge` → `auth.hello` HMAC, or `pair.request` with a 6-digit code → `pair.result` secret. Store paired devices in the `pairing.webapp_devices` setting. Send `ack` for each message. Support unpair. Handle `session.start/end`, batched `webapp.activity`, `nudge.log`, dedupe by message id, and route `hint.request`/`hint.followup` to `hints/index.ts`. Push `plan.snapshot`/`streak.snapshot`. Expose IPC for pairing code and device list. | Ph 10 | Simulated web client test: right/wrong code, offline replay with no duplicates, hint round trip against the mock, unpair cuts traffic. |
| A9 | **Streak engine.** `streak/rules.ts` `dayQualifies(day)`. Focused minutes per local date across both devices, using work category only. Freeze earn (1 per week, max 2) and auto-consume. Reset. Longest streak. Recalculate when late syncs arrive. `getStreak()`. Fire celebration/milestone/reset/evening-reminder events through `getNudgeQueue().push()` (kind `streak`). Thu writes the copy and UI. | Ph 9 | Unit tests: qualifying, freeze, reset, longest, timezone change, DST, late sync. |
| A10 | **History queries + data controls.** Time per category (work/AI/distraction/idle), nudge counts, max escalation level, hint count, and deepest level per session. JSON export. "Clear all data". Typed IPC handlers for Thu's dashboard. | Ph 8 | History totals match raw `app_events` in a test. "Clear" empties every table. |

A1 calls `setActiveSession()` and owns pause → `setMascotState('sleeping')` together with `nudge-pause`.

Order: A1 → A2 → A3 → A4 (**M1 ready**) → A5 → A6 → A7 (**M2 ready**, together with B) → A8 (**M3**) → A9 → A10.

---

## Agent B: Intelligence
**Owns:** `desktop/src/main/{llm,hints,stuck/engine.ts,plan,papers,reading,voice/providers}`, `desktop/src/main/db/repos/{hints,goals,plan,papers}`

| # | Work package | Spec | Done when |
|---|---|---|---|
| B1 | **LLM client.** `llm/client.ts` with a timeout, one retry, a per-day call cap from settings, Zod validation with one retry on schema failure, and redaction in logs. A real Gemini provider (current model, JSON response schema, image input support) using the API from `@google/genai`. Read the current docs and don't guess. Versioned prompts in `llm/prompts/` (`tutor.v1.md` etc.). `DEMO_MODE=1` forces mock. | §6, Ph 0 | Unit tests with a fake fetch: timeout, retry, schema retry, cap. |
| B2 | **Escalation runtime.** The pure engine is done in shared. Build `stuck/engine.ts`: keep the active signals in their detection windows, tick on a timer (~1 s) and on bus events, call `computeLevel`, and map the result. L1/L2 → `setMascotState('glance' / 'question-mark')`. L3 → `push()` an offer with buttons. L4 → speak the **same** L3 offer via TTS, not a new push. Map nudge `'response'` actions to `applyEscalationEvent`. Feed pause/snooze from the queue status. Manual entry points: `help-requested` on `stuckBus` (mascot click is already wired), a global hotkey, and "I'm stuck". | Ph 4c/4d | Unit test with a fake clock: a strong signal goes to bubble → decline → cooldown → re-escalation, with `push` and `setMascotState` mocked. The shared escalation suite still passes. |
| B3 | **Hint service.** Assemble context: PageSummary from `sync/context.ts` (`requestPageSummary()`), falling back to a `desktopCapturer` capture of the active window, with a first-capture-per-session confirm sent over IPC. Implement `requestHints` and `followup` (last 6 turns, current level or one up). Enforce the ladder word limits. Assessment mode hides "Show the answer" and the prompt forbids final answers. Show ladder levels with `push(..., { userInitiated: true })` so cooldowns don't block them. Log every choice to `hint_requests` and `events`. Delete images after the call unless storage is enabled. Fall back to an offline rule-based ladder labeled "offline hints". | Ph 4e/4f | Tests: mock returns 5 distinct levels per demo id. Network failure produces the offline ladder. No image file remains when storage is off. |
| B4 | **Handwriting + camera sources.** Accept `context.imageDataUrl` from `hint.request` (A8 routes it). Add a prompt section for illegible or ambiguous handwriting. Add mock hints for a demo handwriting id. | Ph 12 | Mock round trip with `source: handwriting/camera` returns 5 levels. |
| B5 | **Speech providers.** `SttProvider`/`TtsProvider` interfaces. ElevenLabs implementations: streaming TTS, and STT with end-of-turn detection, 3 reconnects, then failure. Mock providers. Local intent parser for stop, wait, hold on, quiet, snooze, mute, I'm good, another hint, I got it, repeat that, and I'm stuck, running in under 200 ms with no model call. Echo-suppression helper that compares a transcript with recently spoken text. A "first two sentences" helper. **Thu owns** mic capture, playback, and the UI. | Ph 1 | Unit tests for intents, echo suppression, and reconnect logic. |
| B6 | **Plan generation.** Onboarding input schema (semester, courses, hours, goals). Generate plan as JSON with weekly milestones, `plan_items`, and a rationale. Retry once on invalid JSON, then return a clear error. CRUD, reorder, and regenerate over IPC. A `getTodayPlanContext()` that nudges can use. | Ph 5 | A sample input (3 courses, 10 h/week, "get into a research lab by spring") produces a valid plan in the DB. |
| B7 | **Ideas + papers.** "Suggest" returns 3–5 ideas (scope, skills, first-week task) plus a reading list. Verify each paper through the arXiv API and/or Semantic Scholar, and drop any that can't be verified. Adding a paper creates a `papers` row and optionally a plan item. | Ph 6 | With HTTP mocked, unverifiable papers are dropped. |
| B8 | **Paper reading backend.** PDF upload or arXiv URL. Local text extraction (`pdfjs-dist`), section-aware chunking, and simple local retrieval (BM25/keyword; no vector DB). Answers are grounded with section references, or labeled "general knowledge" when the paper doesn't cover the question. Modes: explain simply, check-my-understanding question, show-me-where. Save to `paper_questions` with the input mode. IPC for Thu's reading view. | Ph 7 | On a sample arXiv PDF fixture, a paragraph question cites the right section and an off-topic question is labeled. |

Order: B1 → B2 → B3 (**M2 ready**) → B5 (needed by Thu's Phase 1 voice, so start early if Thu is waiting) → B6 → B7 → B4 → B8.

---

## Integration seams between A and B

| Seam | Producer | Consumer |
|---|---|---|
| `stuckBus` `signal` / `input` / `problem-changed` | A (A5, A6) | B (B2) |
| `requestPageSummary()` | A (A2) | B (B3) |
| `requestHints` / `requestFollowup` | B (B3, B4) | A (A8, for the web app) |
| `getActiveSession()` | A (A1) | everyone who logs |
| `getPlanSnapshot()` | B (B6) | A (A8 sends `plan.snapshot`); A uses an empty stub until B6 lands |
| `getStreak()` | A (A9) | A8 (`streak.snapshot`), Thu's UI |

**Merge points:** merge A and B into `main` after A4 (M1), after A7+B3 (M2: demo scenario A runs end to end with `DEMO_MODE=1`), after A8+B4 (M3), and at the end. Agent B merges first at each point, then A rebases.

## Cut order if time is short (SPEC §11)
Per-site adapters (A5) → paper recommendations (B7) → camera (B4) → web voice. Keep the core loop intact: monitor → signals → escalate → hint → streak.
