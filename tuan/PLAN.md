# Tuan's Track: Execution Plan for 2 Parallel Agents

Source of truth: `SPEC.md`. This file splits Tuan's work (SPEC §11) between two agents, **Agent A (Sensing & Data)** and **Agent B (Intelligence)**, and lists the setup they share.

Ground rules for both agents:
- Read `SPEC.md`, `DECISIONS.md` (especially "Phase 0 fix-up"), `TESTING.md`, and `COORDINATION.md` first. Don't build anything outside the spec. When the spec is ambiguous, pick the simplest option and log it in `DECISIONS.md` under your agent's heading.
- Create your own branch off `main` (`tuan/a-sensing`, `tuan/b-intelligence`) and work in its own git worktree. Until `tuan/phase0-fixes` is merged to `main`, branch from `tuan/phase0-fixes` instead. Commit at the end of each work package, using the commit format in `COORDINATION.md`.
- **Reports are required.** When you finish a work package, and before you stop for any reason (done, blocked, or running low on context or tokens), write or update `tuan/reports/agent-a.md` or `tuan/reports/agent-b.md`. Cover what's done (with commits), what's in progress, what's left, what's blocking you, any decisions you made, and how to run or verify the work. Commit the report on your branch.
- Stay out of Thu's files: `desktop/src/renderer/**`, `web/**`, and `desktop/src/main/nudge/`. Also stay out of the shared core: `electron/**`, `src/common/ipc.ts`, `src/main/{ipc,settings,events,typed-emitter}.ts`, `db/index.ts`, `stuck/bus.ts`, `overlay/`, `features/`. If you need something from those, use the seams listed below, or write a Contract Change Proposal.
- Don't change `shared/` unless you add a "Contract Change Proposal" to `COORDINATION.md`. Thu has to review shared changes.
- Keep logic pure and unit-testable: pass in clocks, DB handles, and emitters. Tests run in plain Node with Vitest. For DB tests, use `openDatabase(':memory:')` plus `setDatabaseForTesting(db)` (see `desktop/src/main/__tests__/`). `better-sqlite3` 13 loads in both Node and Electron, so there's no rebuild step.
- Before each commit, run `npm run typecheck && npm test && npm run lint`. Run `npm run smoke` when you touch `main.ts`, the preload, or IPC.
- **Agent shells:** VS Code sets `ELECTRON_RUN_AS_NODE=1`. `npm run dev` and `npm run smoke` already unset it. If you launch Electron any other way, prefix the command with `env -u ELECTRON_RUN_AS_NODE`.
- New IPC channels go in your own `desktop/src/common/ipc-sensing.ts` or `ipc-intelligence.ts`. Register them with `handle()`, `onSend()`, or `sendTo()` from `desktop/src/main/ipc.ts`; never call `ipcMain` directly. Never edit `electron/main.ts`; wire everything in your own `register.ts` (see P0.5).

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

## P0.5: pre-split (done on `tuan/phase0-fixes`)

The feasibility review found that both agents would collide in a few shared files, so these were split before handing off:
- **Wiring:** `electron/main.ts` calls `registerSensing()` (`src/main/sensing/register.ts`, Agent A) and `registerIntelligence()` (`src/main/intelligence/register.ts`, Agent B), plus matching `unregister*()` on quit. **Agents never edit `main.ts`.** The menu's Start/Stop/Pause/Voice items already call `startSession`, `stopSession`, `setPaused` (in `session/index.ts`) and `setSetting('voice.enabled')`.
- **IPC:** Agent A adds channels only to `desktop/src/common/ipc-sensing.ts`, Agent B only to `ipc-intelligence.ts`. `ipc.ts` merges them. `broadcast(channel, payload)` in `src/main/ipc.ts` sends to every window, since modules can't reach the window objects.
- **Migrations:** Agent A uses `desktop/src/main/db/migrations-a.ts` (names `1xx_a_*`), Agent B uses `migrations-b.ts` (`2xx_b_*`). Each file exports its `tables` for clear and export. Migrations are additive only, never touch the other agent's tables, and need no Contract Change Proposal (log them in DECISIONS).
- **Dependencies, already installed:** desktop `ws`, `@types/ws`, `@google/genai`, `pdfjs-dist`, `zod-to-json-schema`; extension `vitest`, `jsdom`, `@types/jsdom`, plus a `test` script and a jsdom `vitest.config.ts`. Vite externals cover `ws`, `@google/genai`, and `pdfjs-dist`. **Agents don't add dependencies.** If one is unavoidable, run `npm install <pkg>@<exact version>` and never hand-merge `package-lock.json`.
- **Event types:** `EventType` accepts any dotted `x.y` string.
- **Two worktrees at once:** `main.ts` uses `VITE_DEV_SERVER_URL`, so Vite can pick another port, and `WOLFIE_USER_DATA` selects the data dir. Agent A uses `WOLFIE_USER_DATA=/tmp/wolfie-a`, Agent B uses `/tmp/wolfie-b`.
- **Per-agent headings:** `DECISIONS.md` and `COORDINATION.md` have `## Agent A` and `## Agent B` sections. Append only under your own.

## More ground rules (from the review)
- **Only `*/register.ts` files may import `electron` or `../ipc.js`.** Logic modules receive `powerMonitor`, `desktopCapturer`, `systemPreferences`, `dialog`, servers, and clocks as injected interfaces. Under Vitest, `electron` is just a path string, so a named import throws.
- **Servers:** listen on port 0 in tests. In the app, catch `EADDRINUSE`, log it, and keep running. Don't run `dev` or `smoke` from both worktrees at the same moment.
- **Setup per worktree:** `npm ci`, then `npm run typecheck && npm test`.
- **Merging:** agents never merge to `main`. Tuan merges at the merge points while the agents keep working on their branches.
- **Logs:** redact window titles, URLs, and page text (SPEC §6) in both agents' code.
- **Thu dependencies: stub, don't wait.**
  - B3 first-capture confirm: `dialog.showMessageBox` with the thumbnail as `icon`.
  - A9 copy: placeholders in `streak/messages.ts` for Thu to edit.
  - A1 permissions: an IPC status only; Thu renders the screen.
  - B8 upload: `dialog.showOpenDialog` from main.
  - Thu's tone review doesn't block A4.

---

## Agent A: Sensing & Data
**Owns:**
- `desktop/src/main/{sensing,session,monitor,rules,sync,streak,history}/`
- `desktop/src/main/stuck/signals/`
- `desktop/src/main/db/migrations-a.ts`
- `desktop/src/common/ipc-sensing.ts`
- `extension/**`
- `demo-pages/**`

| # | Work package | Spec | Done when |
|---|---|---|---|
| A1 | **Sessions + monitor.** Fill in `session/index.ts`: a `sessions` row, `logEvent('session.start'/'session.end')`, auto-start on the study app, and IPC `session-start {assessmentMode}` / `session-stop` / `session-get`. Pause propagates to the extension (`desk.state`) and the mic flag. Active-window poller every 2 s behind a `WindowSource` interface; the default uses `osascript` JXA via `execFile`. Idle detection via `powerMonitor.getSystemIdleTime()`. Write `app_events` only on change. Permissions status over IPC (Screen Recording, Accessibility, **Automation**, Mic); see Gotchas. Respect the title-capture setting. | Ph 2 | Test: a simulated window stream produces the correct `app_events` rows. Denied permissions produce a status, not a crash. |
| A2 | **Extension loopback server.** `ws` on `127.0.0.1:EXTENSION_WS_PORT`. First message `ext.hello` → `desk.hello_result`; the background worker already sends it. Check Origin in `verifyClient`: trust on first use, so the first `chrome-extension://` origin with a valid token is stored in `pairing.extension_id` and later origins must match it. Send `desk.state` on any change to session, frontmost app, pause, exclusions, or `capturePageText`; `reporting = session active && browser frontmost && !paused`. Generate the pairing token, store it in settings, and expose it over IPC. Store domains in `app_events.url_domain`. Call `setLatestPageSummary` / `setPageSummaryRequester`. Emit `stuckBus 'problem-changed'` **only when `PageSummary.problemId` changes**, never on URL or window switches. | Ph 2 | Test (port 0): no token, a wrong token, or a wrong origin is rejected. A valid client's domain lands in the DB. |
| A3 | **Extension.** Background: reconnect, ping under 30 s to keep the MV3 worker alive, report only while `desk.state.reporting` (A2 computes it), honor pause, exclusions, and incognito. Popup: connection status, pause toggle, editable excluded list, token entry. | Ph 2 | Builds, and the manifest loads unpacked. Excluded and incognito tabs send nothing (unit-test `reportableDomain`). |
| A4 | **Rules + warnings.** Lists come from settings (defaults already in shared). Matcher: domain suffix first, then app name or title as fallback. Per-rule cooldown from `monitored.rule_cooldown_minutes`. Warm message pools with variation. Buttons: "Taking a break", "I need this for the task", "Ignore for this session". Handle the queue's `'response'` event; "ignore" suppresses the rule for the session. Nothing fires outside a session. | Ph 3 | Unit tests for matching, cooldown, and ignore. A simulated stream produces a nudge, and its response is logged. |
| A5 | **PageSummary + web signals (content script).** Headings, ~2,500 characters of viewport-first text, ≤120 controls with stable ids, errors, dialogs, problem region, and `problemId` from `data-problem-id`. Hard redaction of password, payment, OTP, and `autocomplete=cc-*` fields. When `desk.state.capturePageText` is false, send the domain only. Throttle sends to meaningful change or `desk.request_summary`. Detectors: `wrong_answer_loop`, `dead_control_clicks`, `validation_errors`, `backtracking`, sent as `ext.signal`. Generic text patterns plus at most 2 tiny adapters. Inject `isVisible`/rect functions, since jsdom has no layout. | Ph 4a/4b | jsdom tests: redaction, each detector, domain-only mode. |
| A7 | **Demo pages.** `demo-pages/` static HTML: (A) algebra wrong-answer loop, (B) disabled Continue button, (C) coding page with failing results, (D) `distraction.md` steps. `data-problem-id` uses `demo-algebra-problem`, `demo-disabled-button`, `demo-code-error`. Serve with `npx vite demo-pages --port 5174`, because content scripts don't run on `file://`. | Ph 4f | Each page triggers its signal in a jsdom test using A5's detectors. |
| A6 | **Desktop signals.** `context_switch_loop`, `idle_on_work`, `long_on_problem` from the monitor. Forward `ext.signal` into `stuckBus 'signal'`. Store signals in `web_signals`. **Emit `stuckBus 'input'` by polling `getSystemIdleTime()` every 1 s** (input happened when idle < 1 s); nothing else emits it. Thresholds come from settings. | Ph 4b | Fake-clock unit tests. |
| A8 | **LAN sync server.** `ws` on `0.0.0.0:SYNC_WS_PORT` (triggers the macOS firewall prompt). Handshake as documented in `shared/src/schemas/sync.ts`. Paired devices go in `pairing.webapp_devices`. `ack` every message and dedupe by id. Unpair: delete the secret, then answer `auth.result {ok:false, reason:'unpaired'}`. Handle `session.start/end` (sessions with `device='webapp'`), `webapp.activity` → `webapp_activity`, and `nudge.log`. Route `hint.request`/`hint.followup` to `hints/index.ts`, replying `hint.response` or `hint.error`. Push `plan.snapshot` (empty stub until B6) and `streak.snapshot`. IPC: pairing code, LAN IPs and port for the QR, device list, unpair. | Ph 10 | Simulated client test (port 0): right/wrong code, offline replay with no duplicates, hint round trip with the mock provider, unpair stops traffic. |
| A9 | **Streak engine.** `streak/rules.ts` `dayQualifies(day)`. Focused minutes per local date across both devices, using work category only. Freeze earn (1 per week, max 2) and auto-consume. Reset. Longest streak. Recalculate when late syncs arrive. `getStreak()` and `streak.snapshot`. Celebration, milestone, reset, and evening-reminder nudges (kind `streak`) with copy from `streak/messages.ts`. | Ph 9 | Unit tests: qualifying, freeze, reset, longest, timezone change, DST, late sync. |
| A10 | **History, settings, data controls.** Time per category (work/AI/distraction/idle), nudge counts, max escalation level (from `events` `stuck.level`), hint count, and deepest level per session. IPC: `history-get`, `settings-get`/`settings-set`, `status-get` (extension connected; Gemini and ElevenLabs keys present, as booleans only), JSON export, and "Clear all data" (delete children before parents, then re-seed `streak_state`). | Ph 8 | History totals match the raw `app_events` in a test. Clear leaves every table empty except the re-seeded streak row. |

Order: A1 → A2 → A3 → A4 (**M1**) → A5 → A7 → A6 (**M2**, with B) → A8 (**M3**) → A9 → A10.

---

## Agent B: Intelligence
**Owns:**
- `desktop/src/main/{intelligence,llm,hints,plan,papers,reading,voice}/`
- `desktop/src/main/stuck/{engine,actions}.ts`
- `desktop/src/main/db/migrations-b.ts`
- `desktop/src/common/ipc-intelligence.ts`

| # | Work package | Spec | Done when |
|---|---|---|---|
| B1 | **LLM client.** `llm/client.ts`: timeout, one retry, per-day cap (`api.call_limit_per_day`), Zod validation with one retry on schema failure, redacted logs. Gemini provider via `@google/genai` with `GEMINI_MODEL` from `.env`, `responseMimeType: 'application/json'`, a JSON schema from `zod-to-json-schema`, and images as `inlineData` base64 (decode the data URL). Read the current SDK docs. Versioned prompts in `llm/prompts/` (`tutor.v1.md`, ...). `DEMO_MODE=1` forces mock. | §6 | Unit tests with an **injected fake provider or SDK client** (don't fake HTTP under the SDK): timeout, retry, schema retry, cap. |
| B5a | **Voice core (no network).** `SttProvider`/`TtsProvider` interfaces plus mocks. `voice/intents.ts`: stop, wait, hold on, quiet, snooze, mute, I'm good, another hint, I got it, repeat that, I'm stuck, plus Phase 3 answers (taking a break, I need this, ignore), in under 200 ms with no model call. `voice/echo.ts`: echo suppression. A first-two-sentences helper. `voice/router.ts`: a transcript goes to its local intent; otherwise, if a ladder is open, to `requestFollowup`; "I'm stuck" goes to `stuckBus 'help-requested' ('voice')`. STT stops while paused (SPEC §7). | Ph 1, 4d | Unit tests: intents, echo, routing. Gives Thu the interfaces early. |
| B2 | **Escalation runtime.** `stuck/engine.ts` and `stuck/actions.ts` (action string constants). Rules below under "B2 rules". L1/L2 → `setMascotState('glance' / 'question-mark')`, back to `'idle'` at 0. L3 → `push()` an offer; if `push()` returns null, **don't** apply `shown(3)`. L4 → speak the same offer via TTS (voice on only). Tick every 1 s and on bus events. Pause and snooze come from `isPaused()` and queue status. Voice mode is `getSetting('voice.enabled')`. Global hotkey `Alt+Shift+H` → `help-requested('manual')`. Log `stuck.level` events. | Ph 4c/4d | Fake-clock test with `push` and `setMascotState` mocked: a strong signal goes to the offer, then decline, cooldown, and re-escalation. Null-push and "I'm good" paths. |
| B3a | **Hint service.** Implement `requestHints`/`requestFollowup` (last 6 turns, current level or one up). Enforce ladder word limits. `assessment = session.assessmentMode \|\| domain ∈ assessment.domains`; in assessment mode the prompt forbids final answers. Offline rule-based ladder labeled "offline hints" after one failed retry. Log to `hint_requests` (only with an active session, since `session_id` is NOT NULL) and always to `events`. Write `imageDataUrl` to disk only if `image.storage_enabled`. | Ph 4e/4f | Tests: mock returns 5 distinct levels per demo id; failure produces the offline ladder; no image file remains with storage off. |
| B3b | **Hint flow.** Accepting the offer, a mascot click, or "I'm stuck" assembles context: `requestPageSummary()` first, then `desktopCapturer` as fallback (see Gotchas), with a first-capture-per-session confirm via `dialog.showMessageBox`. Ladder bubbles are nudges with `level: 3` and `push(..., { userInitiated: true })`; the ladder index lives in the hint service, keyed by nudge id (don't widen `NudgeLevel`). Buttons: Another hint, I got it, I'm good, Show the answer. "Show the answer" is a followup with a fixed utterance and is hidden in assessment mode. In voice mode, speak the first two sentences. | Ph 4e | Test: accept → 5 ladder levels one at a time; "Show the answer" absent in assessment mode. |
| M2-int | **Demo-suite test (after rebasing on A7).** With `DEMO_MODE=1`, drive scenario A from fixture page events through the bus, engine, offer, accept, and 5 ladder levels. | §8 | One integration test, offline. |
| B4 | **Handwriting + camera sources.** `context.imageDataUrl` from `hint.request` (A8 routes it). Prompt addition for illegible or ambiguous writing. A mock hint for a demo handwriting id. | Ph 12 | Mock round trip with `source: handwriting/camera` returns 5 levels. |
| B6 | **Plan generation.** Onboarding input stored in a B-owned table (not a new settings key). Generate a plan as JSON with weekly milestones, `plan_items`, and a rationale. Retry once on invalid JSON, then return a clear error. IPC for CRUD, reorder, and regenerate. `getPlanSnapshot()` for A8 and `getTodayPlanContext()` for nudges. | Ph 5 | Sample input (3 courses, 10 h/week, "get into a research lab by spring") produces a valid plan in the DB. |
| B5b | **ElevenLabs providers.** TTS: HTTP stream, cancelled with an `AbortController` for barge-in. STT: a WebSocket via `ws` (it needs the `xi-api-key` header), end-of-turn detection, 3 reconnects, then a bubble saying voice is having trouble. Voice id and models from `.env`. Keep the protocol in one file behind an injected socket factory. Read the current docs. No key means voice off, with a friendly note. **Thu owns** mic capture, playback, and the UI. | Ph 1 | Tests with a fake socket: reconnect ×3 then failure, abort on barge-in. |
| B7 | **Ideas + papers.** "Suggest" returns 3–5 ideas (scope, skills, first-week task) plus a reading list. Verify each paper via arXiv (1 request per 3 s, Atom XML) and/or Semantic Scholar (expect 429s): one at a time, cached, at most 5, matched on normalized title. Drop papers that can't be verified. Adding a paper creates a `papers` row and optionally a plan item. | Ph 6 | With HTTP mocked, unverifiable papers are dropped. |
| B8 | **Paper reading backend.** Upload via `dialog.showOpenDialog` or an arXiv URL. `pdfjs-dist/legacy/build/pdf.mjs` text extraction, section-aware chunking, BM25/keyword retrieval (no vector DB). Grounded answers cite sections; otherwise they're labeled "general knowledge". Modes: explain simply, check-my-understanding question, show-me-where. Save to `paper_questions` with the input mode. IPC for Thu's reading view. | Ph 7 | On a small committed CC-BY PDF fixture: a paragraph question cites the right section and an off-topic question is labeled. No network. |

Order: B1 → B5a → B2 → B3a → B3b (**M2**, then M2-int after A7) → B4 (**M3**) → B6 → B5b → B7 → B8.

### B2 rules (runtime traps found in review)
- **Signal lifetime:** a signal stays active for max(its detection window, 5 min), and re-emitting it refreshes it. Otherwise a 20 s `dead_control_clicks` signal expires before the 90 s climb to level 3. Signals clear on accept, decline, a real problem change, or session end. Log this in DECISIONS.
- **"I'm good" with no `currentProblemId`** would do nothing in the engine. Use `session:<id>` as the fallback problem key.
- **On accept**, clear active signals and hold level 0 while a ladder is open.
- **Reset** the engine state on every `sessionEvents 'change'`.
- **Response mapping:** `timeout` is not a decline; `dismissed` is a decline.

---

## Integration seams between A and B

| Seam | Producer | Consumer |
|---|---|---|
| `stuckBus` `signal` / `input` / `problem-changed` | A (A2, A5, A6) | B (B2) |
| `requestPageSummary()` | A (A2) | B (B3b) |
| `requestHints` / `requestFollowup` | B (B3a, B4) | A (A8, for the web app) |
| `getActiveSession()`, `isPaused()`, `sessionEvents` | A (A1) | B (B2, B3a, B5a) |
| `getPlanSnapshot()` / `getTodayPlanContext()` | B (B6) | A (A8, A4 optional hook); empty stubs until B6 |
| `getStreak()` | A (A9) | A8 (`streak.snapshot`), Thu's UI |

**Merge points (Tuan merges, agents keep going):** M1 after A4. M2 after A6 + B3b, then M2-int (demo scenario A end to end with `DEMO_MODE=1`). M3 after A8 + B4. Then the end. Merge B first at each point, then A rebases.

## Gotchas
- **Active window (A1):** `osascript -l JavaScript` via `execFile` needs the **Automation** permission. `active-win` has been renamed `get-windows`. Titles need Screen Recording. In dev, macOS attributes permissions to the terminal or VS Code app.
- **Permissions (A1):**
  - `systemPreferences.getMediaAccessStatus('screen' | 'microphone')`
  - `askForMediaAccess('microphone')`
  - `isTrustedAccessibilityClient(false)`
  - Screen Recording can't be requested; open `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`.
- **`ws` (A2, A8):** already externalized. Check Origin in `verifyClient`. Use `127.0.0.1` for the extension and `0.0.0.0` for the LAN.
- **`desktopCapturer` (B3b):** call `getSources({ types: ['window'], thumbnailSize })` in main, match by window title, fall back to `'screen'`. Without permission the image is blank, so check the status first.
- **`pdfjs-dist` (B8):** canvas and DOMMatrix warnings are harmless for text extraction.
- **jsdom (A5, A7):** no layout and no `innerText`; use `textContent`.
- **better-sqlite3 tests:** foreign keys are on, so insert a `sessions` row before child rows.

## Cut order if time is short (SPEC §11)
Per-site adapters (A5) → paper recommendations (B7) → camera (B4) → web voice. Keep the core loop intact: monitor → signals → escalate → hint → streak.
