# Tuan's Track: Execution Plan for 2 Parallel Agents

Source of truth: `SPEC.md`. This file splits Tuan's work (SPEC §11) between two agents, **Agent A (Sensing & Data)** and **Agent B (Intelligence)**, and lists the setup they share.

Ground rules for both agents:
- Read `SPEC.md`, `DECISIONS.md`, and `COORDINATION.md` first. Don't build anything outside the spec. When the spec is ambiguous, pick the simplest option and log it in `DECISIONS.md` under your agent's heading.
- Create your own branch off `main` (`tuan/a-sensing`, `tuan/b-intelligence`) and work in its own git worktree. Commit at the end of each work package, using the commit format in `COORDINATION.md`.
- **Reports are required.** When you finish a work package, and before you stop for any reason (done, blocked, or running low on context or tokens), write or update `tuan/reports/agent-a.md` or `tuan/reports/agent-b.md`. Cover what's done (with commits), what's in progress, what's left, what's blocking you, any decisions you made, and how to run or verify the work. Commit the report on your branch.
- Stay out of Thu's files: `desktop/src/renderer/**`, `web/**`, the NudgeQueue internals, and the overlay/voice UI. If you need something from those, use the stub interfaces from Step 0.
- Don't change `shared/` after Step 0 unless you add a "Contract Change Proposal" to `COORDINATION.md`. Thu has to review shared changes.
- Keep logic pure and unit-testable without Electron or SQLite: pass in clocks, DB handles, and emitters. Vitest runs under plain Node, but `better-sqlite3` gets rebuilt for Electron's ABI, so tests use an in-memory DB from a test helper, or none at all.
- In `main.ts`, the only edit you make is one `registerX()` call for your own module. Keep everything else in your module folders.

---

## Phase 0 review: problems found in the current scaffold

The scaffold is marked "Phase 0 complete" in `STATUS.md`, but it has these problems:

1. **`npm install` has never been run.** There's no `node_modules`, so nothing has been built or tested. `@wolfie/shared` exports `dist/` but has no build step wired into `dev`.
2. **Device name mismatch.** Shared schemas use `'ipad'` (`HintRequestSchema.device`, `SessionStartMessage.device`, sync type `ipad.activity`). The DB and SPEC use `webapp` / `webapp.activity`.
3. **Missing fixtures.** `shared/src/fixtures/` has only `nudge.json` and `escalation.json`. SPEC §3 requires fixtures for hint request/response, sync messages, extension messages, PageSummary, and signals. There are no contract tests yet.
4. **`escalation.json` doesn't model engine state.** It has no cooldowns, decline, "I'm good", snooze, or recent-input fields. It needs a sequence/state format that `computeLevel(signals, state)` can consume.
5. **No extension message schemas.** The extension sends `{type:'tab_change'|'page_summary'}` without a contract, and its token goes in the URL query string.
6. **IPC isn't typed.** The preload exposes a generic `invoke(channel, ...any)`, and `set-ignore-mouse-events` has no handler in main.
7. **Possible ESM `__dirname` bug.** With `"type": "module"`, `__dirname` in `electron/main.ts` may be undefined, depending on vite-plugin-electron's output format. Check this when you first run `npm run dev`.
8. **The Gemini provider is a stub** that uses the retired `gemini-pro` model. `LLMProvider` has no timeout, retry, daily cap, or Zod validation, and no `llm/prompts/` folder exists.
9. **Missing pieces:** `demo-pages/`, `TESTING.md`, the `events` table helper (`logEvent`), and the `features/` directory.
10. ~~No `nudge.push`.~~ **Partly fixed in 85ff9b7 (Thu Phase 1).** `NudgeQueue` now exists, but it has gaps. See Step 0 item 8.

**Status after Thu's 85ff9b7:** items 1–9 are still open. Thu also added more untyped IPC channels (`nudge-*`, `session-control`, `voice-toggle`) and another `__dirname` use.

---

## Step 0: Contract fix-up (one agent, sequential, ~1 hour, before splitting)

Agent B runs this on `main`, or Tuan runs it, then posts it to Thu as a contract change.

1. Run `npm install` at the root and wire up the `shared` build: add a `predev` step or point desktop and extension at the `src` paths via tsconfig/vite alias. Confirm that `npm run dev` opens both windows. Fix item 7 if it's broken.
2. Rename `ipad` to `webapp` in every shared schema, including `webapp.activity`.
3. Add `shared/src/schemas/extension.ts` with these Zod schemas:
   - `ext.hello` (token)
   - `ext.tab` (domain, title, frontmost)
   - `ext.page_summary`
   - `ext.signal`
   - `desk.request_summary`
   - `desk.pause`
   - `desk.session_state`
4. Add a typed message envelope with `id`, `type`, `ts`, and `payload`, validated with a discriminated union per type. Do this for both sync and extension messages.
5. Write fixtures for every message type in `shared/src/fixtures/`. Add `shared/src/__tests__/fixtures.test.ts` to check that each fixture validates.
6. Redesign `escalation.json` as a list of scenarios, each with:
   - `{ name, voiceMode, steps: [{ t, signals?, event? }], expected: [{ t, level }] }`
   - where `event` is one of `shown | accepted | declined | im_good | snooze | input`
   - covering every rule in SPEC §4c.

   Put the engine's `EscalationState` type in `shared/src/schemas/escalation.ts`. Thu's web engine must implement the same type.
7. Freeze the `requestHints` signature in `shared`: `requestHints(context: HintContext, source: HintSource, assessment: boolean) => Promise<HintResponse>`. Move `HintContext` into shared.
8. Connect to Thu's NudgeQueue (`desktop/src/main/nudge/`, merged from main in 85ff9b7). Call `getNudgeQueue().push(nudge)` directly from main-process code. Don't go through the `nudge-push` IPC. Before Agents A and B depend on it, send Thu a Contract Change Proposal asking for these:
   - **Nudge id plus a response path back.** Today the overlay's `handleButtonClick` only dismisses the bubble, so main never sees the response. Add an `id` to `Nudge`, and have the overlay invoke `nudge-response {id, action}`. The queue then emits `response` so A4 and B3 can log `nudges.user_response`.
   - **Logging to the database.** The queue writes nothing to the `nudges` or `events` tables. Either Thu adds that, or the queue emits `shown` and we log it on our side.
   - **Escalation levels 1–2 aren't bubbles.** Glance and "?" need a separate `overlay-state` channel that skips the queue's cooldowns. Right now the `stuck` kind has a 3-minute cooldown, so level 2 gets dropped 45 s after level 1 and the offer never shows.
   - **Push the rule's reason back to callers.** A dropped nudge returns `false` and is never queued, which is fine. A4 and B2 need to treat `false` as "not shown".
   - **Cooldowns from settings.** `maxNudgesPerHour` and cooldowns are hardcoded. Read `NUDGE_MAX_PER_HOUR` from settings.
   - **Voice intents.** Thu's `useVoiceIntents` matches help, dismiss, and close using the browser Web Speech API. That API doesn't work inside Electron, and those aren't the spec's intent words. Agree that B5's intent parser and ElevenLabs STT are the desktop path, and keep Web Speech for the web app only.
9. Create stub seams in desktop so A and B can work in parallel:
   - `desktop/src/main/stuck/bus.ts`: a typed `EventEmitter` for `StruggleSignal` and `user-input` events.
   - `desktop/src/main/sync/context.ts`: `getLatestPageSummary()` and `requestPageSummary(): Promise<PageSummary|null>`. Agent A implements these.
   - `desktop/src/main/hints/index.ts`: exports `requestHints` and `followup`. Agent B implements these.
   - `desktop/src/main/events.ts`: `logEvent(type, payload)`.
   - `desktop/src/main/settings.ts`: typed `get` and `set` with defaults for every `SettingsKeys` entry.
10. Commit as `[Phase 0] Contract fix-up`. Add a Contract Change Proposal to `COORDINATION.md` so Thu can acknowledge it.

---

## Agent A: Sensing & Data
**Owns:** `desktop/src/main/{monitor,rules,sync,streak,db/repos/{sessions,app_events,web_signals,streak,history}}`, `desktop/src/main/stuck/signals/`, `extension/**`, `demo-pages/**`

| # | Work package | Spec | Done when |
|---|---|---|---|
| A1 | **Sessions + monitor.** Session manager with start/stop and auto-start on the study app. Active-window poller every 2 s, using `active-win` or AppleScript behind a `WindowSource` interface. Idle detection via `powerMonitor`. Write `app_events` only when something changes. Add a first-run permissions check (Screen Recording, Accessibility, Mic) that sends a status over IPC so Thu can render it. Respect the title-capture setting. | Ph 2 | Integration test: a simulated window stream produces the correct `app_events` rows. Denied permissions don't crash the app. |
| A2 | **Extension loopback server.** WS on `127.0.0.1` only. Auth uses the first-message token (`ext.hello`), not the URL query. Check the Origin header against `chrome-extension://<id>`. Generate the pairing token, store it in settings, and expose it over IPC. Store domains in `app_events.url_domain`. Implement `sync/context.ts`. | Ph 2 | A test client without a token or with the wrong origin is rejected. A valid client's domain lands in the DB. |
| A3 | **Extension.** Background: reconnect, report the tab only while a session is active and the browser is frontmost (desktop sends `desk.session_state`), honor pause, excluded domains (defaults: banking, email, health portals), and incognito. Popup: status, pause toggle, editable excluded list, token entry. Add placeholder icons. Make sure `npm run build` produces a loadable `dist/`. | Ph 2 | Loads unpacked in Chrome, pairs, and reports domains. Excluded and incognito pages send nothing. |
| A4 | **Rules + warnings.** Default AI-tool and distraction lists in settings. Matcher: domain first, then app name or title as fallback. Per-rule cooldown (10 min). Warm message pools with variation for each kind. Buttons: "Taking a break", "I need this for the task", "Ignore for this session". Record the response in `nudges.user_response`. "Ignore" suppresses the rule for the session. Nothing fires outside a session. | Ph 3 | Unit tests for matching and cooldown. A simulated event stream triggers a nudge within the latency budget. |
| A5 | **PageSummary + web signals (content script).** Headings, ~2,500 characters of viewport-first text, ≤120 controls with stable ids, errors, dialogs, and the problem region. Hard redaction of password, payment, OTP, and `autocomplete=cc-*` fields. Throttle sends to meaningful change or desktop request. Signal detectors: `wrong_answer_loop`, `dead_control_clicks`, `validation_errors`, `backtracking`. Generic text patterns, plus at most 2 tiny adapters. | Ph 4a/4b | Redaction unit tests with fixture HTML (jsdom). Each detector has a test. |
| A6 | **Desktop signals.** `context_switch_loop`, `idle_on_work`, and `long_on_problem`, computed from the monitor and emitted on `stuck/bus.ts`. Forward extension signals into the bus. Store them in `web_signals`. Thresholds come from settings. | Ph 4b | Unit tests with a fake clock. |
| A7 | **Demo pages.** `demo-pages/` static HTML: (A) algebra wrong-answer loop, (B) disabled Continue button, (C) coding page with failing results, (D) distraction scenario notes. Expose problem ids through `data-problem-id` matching the mock hint keys (`demo-algebra-problem`, `demo-disabled-button`, `demo-code-error`), and include them in the PageSummary. | Ph 4f | Each page triggers its signal in a jsdom test. |
| A8 | **LAN sync server.** A separate WS on the LAN with a 6-digit pairing code, a shared secret in the DB, an HMAC or token on every message, and unpair. Handle `session.start/end`, batched `webapp.activity`, `nudge.log`, dedupe by message id, and route `hint.request`/`hint.followup` to `hints/index.ts`. Push `plan.snapshot`/`streak.snapshot`. Expose IPC for pairing code and device list. | Ph 10 | Simulated web client test: right/wrong code, offline replay with no duplicates, hint round trip against the mock, unpair cuts traffic. |
| A9 | **Streak engine.** `streak/rules.ts` `dayQualifies(day)`. Focused minutes per local date across both devices, using work category only. Freeze earn (1 per week, max 2) and auto-consume. Reset. Longest streak. Recalculate when late syncs arrive. `getStreak()`. Fire celebration/milestone/reset/evening-reminder events through `nudge.push`. Thu writes the copy and UI. | Ph 9 | Unit tests: qualifying, freeze, reset, longest, timezone change, DST, late sync. |
| A10 | **History queries + data controls.** Time per category (work/AI/distraction/idle), nudge counts, max escalation level, hint count, and deepest level per session. JSON export. "Clear all data". Typed IPC handlers for Thu's dashboard. | Ph 8 | History totals match raw `app_events` in a test. "Clear" empties every table. |

Order: A1 → A2 → A3 → A4 (**M1 ready**) → A5 → A6 → A7 (**M2 ready**, together with B) → A8 (**M3**) → A9 → A10.

---

## Agent B: Intelligence
**Owns:** `desktop/src/main/{llm,hints,stuck/escalation.ts,stuck/engine.ts,plan,papers,reading,voice/providers}`, `desktop/src/main/db/repos/{hints,goals,plan,papers}`

| # | Work package | Spec | Done when |
|---|---|---|---|
| B1 | **LLM client.** `llm/client.ts` with a timeout, one retry, a per-day call cap from settings, Zod validation with one retry on schema failure, and redaction in logs. A real Gemini provider (current model, JSON response schema, image input support) using the API from `@google/genai`. Read the current docs and don't guess. Versioned prompts in `llm/prompts/` (`tutor.v1.md` etc.). `DEMO_MODE=1` forces mock. | §6, Ph 0 | Unit tests with a fake fetch: timeout, retry, schema retry, cap. |
| B2 | **Escalation engine.** Pure `computeLevel(signals, state) -> 0..4` in `stuck/escalation.ts`, implementing every rule in SPEC §4c. A runtime wrapper `stuck/engine.ts` subscribes to `stuck/bus.ts`, applies snooze/pause and the 5 s recent-input guard, and pushes glance (L1), "?" (L2), offer (L3), and spoken offer (L4) via `nudge.push`. Manual entry points: global hotkey, mascot click (IPC), and "I'm stuck". | Ph 4c/4d | Every scenario in `shared/fixtures/escalation.json` passes. Copy the test file into `shared/` so Thu's web engine runs the same suite. |
| B3 | **Hint service.** Assemble context: PageSummary from `sync/context.ts`, falling back to a `desktopCapturer` capture of the active window, with a first-capture-per-session confirm sent over IPC. Implement `requestHints` and `followup` (last 6 turns, current level or one up). Enforce the ladder word limits. Assessment mode hides "Show the answer" and the prompt forbids final answers. Log every choice to `hint_requests` and `events`. Delete images after the call unless storage is enabled. Fall back to an offline rule-based ladder labeled "offline hints". | Ph 4e/4f | Tests: mock returns 5 distinct levels per demo id. Network failure produces the offline ladder. No image file remains when storage is off. |
| B4 | **Handwriting + camera sources.** Accept a PNG from `hint.request` (A8 routes it). Add a prompt section for illegible or ambiguous handwriting. Add mock hints for a demo handwriting id. | Ph 12 | Mock round trip with `source: handwriting/camera` returns 5 levels. |
| B5 | **Speech providers.** `SttProvider`/`TtsProvider` interfaces. ElevenLabs implementations: streaming TTS, and STT with end-of-turn detection, 3 reconnects, then failure. Mock providers. Local intent parser for stop, wait, hold on, quiet, snooze, mute, I'm good, another hint, I got it, repeat that, and I'm stuck, running in under 200 ms with no model call. Echo-suppression helper that compares a transcript with recently spoken text. A "first two sentences" helper. **Thu owns** mic capture, playback, and the UI. | Ph 1 | Unit tests for intents, echo suppression, and reconnect logic. |
| B6 | **Plan generation.** Onboarding input schema (semester, courses, hours, goals). Generate plan as JSON with weekly milestones, `plan_items`, and a rationale. Retry once on invalid JSON, then return a clear error. CRUD, reorder, and regenerate over IPC. A `getTodayPlanContext()` that nudges can use. | Ph 5 | A sample input (3 courses, 10 h/week, "get into a research lab by spring") produces a valid plan in the DB. |
| B7 | **Ideas + papers.** "Suggest" returns 3–5 ideas (scope, skills, first-week task) plus a reading list. Verify each paper through the arXiv API and/or Semantic Scholar, and drop any that can't be verified. Adding a paper creates a `papers` row and optionally a plan item. | Ph 6 | With HTTP mocked, unverifiable papers are dropped. |
| B8 | **Paper reading backend.** PDF upload or arXiv URL. Local text extraction (`pdfjs-dist`), section-aware chunking, and simple local retrieval (BM25/keyword; no vector DB). Answers are grounded with section references, or labeled "general knowledge" when the paper doesn't cover the question. Modes: explain simply, check-my-understanding question, show-me-where. Save to `paper_questions` with the input mode. IPC for Thu's reading view. | Ph 7 | On a sample arXiv PDF fixture, a paragraph question cites the right section and an off-topic question is labeled. |

Order: B1 → B2 → B3 (**M2 ready**) → B5 (needed by Thu's Phase 1 voice, so start early if Thu is waiting) → B6 → B7 → B4 → B8.

---

## Integration seams between A and B

| Seam | Producer | Consumer | Defined in Step 0 |
|---|---|---|---|
| `StruggleSignal` events | A (A5, A6) | B (B2) | `stuck/bus.ts` |
| `getLatestPageSummary` / `requestPageSummary` | A (A2) | B (B3) | `sync/context.ts` |
| `requestHints` / `followup` | B (B3, B4) | A (A8 for the web app) | `hints/index.ts` |
| `getNudgeQueue().push` and `response` event | Thu (exists; response path pending) | A4, A9, B2, B3 | `nudge/index.ts` (Thu's) |
| Escalation sprite state (L1/L2) | B (B2) | Thu's overlay | `overlay-state` IPC (proposed) |
| Settings and `logEvent` | Step 0 | both | `settings.ts`, `events.ts` |
| Plan snapshot for sync | B (B6) | A (A8) | B exports `getPlanSnapshot()`; A uses a stub until it lands |

**Merge points:** merge A and B into `main` after A4 (M1), after A7+B3 (M2: demo scenario A runs end to end with `DEMO_MODE=1`), after A8+B4 (M3), and at the end. Agent B merges first at each point, then A rebases.

## Cut order if time is short (SPEC §11)
Per-site adapters (A5) → paper recommendations (B7) → camera (B4) → web voice. Keep the core loop intact: monitor → signals → escalate → hint → streak.
