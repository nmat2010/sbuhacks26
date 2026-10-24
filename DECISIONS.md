# Architecture and Implementation Decisions

This document tracks decisions made during implementation where the spec was ambiguous or required clarification.

## Phase 0: Scaffold

### Technology Choices
- **Confirmed**: Electron + Vite + React + TypeScript for desktop
- **Confirmed**: Chrome MV3 for extension
- **Confirmed**: SQLite with better-sqlite3
- **Confirmed**: Zod for schema validation

### Build System
- Using npm workspaces for monorepo management
- Vite for desktop bundling with vite-plugin-electron
- TypeScript compilation for extension (no bundler for now - may add later if needed)

### Database
- Using migrations table to track applied migrations
- All timestamps stored as Unix epoch milliseconds (INTEGER)
- Boolean values stored as INTEGER (0 or 1) per SQLite conventions
- Foreign keys enabled via pragma

### LLM Provider
- Created provider interface with Gemini and Mock implementations
- Mock provider returns deterministic hints based on demo problem IDs
- Gemini provider stubbed for Phase 4 implementation (Tuan's work)
- DEMO_MODE=1 forces mock provider regardless of API key presence
- Using Gemini API instead of Claude per updated spec requirements

### Extension Architecture
- Using WebSocket for desktop communication (loopback only)
- Pairing token stored in chrome.storage.local
- Background service worker handles connection management
- Content script will be implemented in Phase 4

### Desktop Windows
- Overlay: 200x200px, transparent, frameless, always-on-top
- Dashboard: 1200x800px, standard window
- Overlay click-through enabled except when hovering over mascot
- Both windows use separate React apps

## Tablet/iPad Support: Web App Instead of Native iOS
- **Decision**: Use a React web app instead of a native iOS/SwiftUI app for tablet support
- **Rationale**:
  - Faster development for hackathon timeline (no App Store, no Xcode required)
  - Cross-platform: works on iPad, Android tablets, and any device with a browser
  - Code reuse: can share React components with desktop dashboard
  - HTML5 Canvas provides drawing capabilities (though not as advanced as PencilKit)
  - Web Speech API provides voice (browser-native, on-device)
  - Camera API via `<input capture>` allows photographing physical paper
  - WebSocket sync works the same way as native would
- **Trade-offs**:
  - ❌ No native Apple Pencil pressure sensitivity
  - ❌ No PencilKit's advanced features
  - ❌ Web app feel instead of native iOS feel
  - ✅ But core functionality preserved: drawing, stuck detection, hints, voice, camera, sync
- **Storage**: IndexedDB instead of SwiftData/Core Data
- **Implementation**: Thu's responsibility (Phases 10, 11, 12)

## Notes for Future Phases
- Icon assets needed for extension (16px, 48px, 128px)
- Mascot sprite sheet needed for overlay states
- Speech provider implementations (STT/TTS) needed for Phase 1
- Demo page scenarios needed for Phase 4

## Phase 0 fix-up (Tuan, 2026-10-24)

- **Dependency bumps:** `better-sqlite3` 9 → 13 (9 does not compile on Node 24; 13 ships Node-API prebuilds that load in both Node and Electron, so there is no electron-rebuild step and tests run in plain Node). Electron 28 (EOL) → 44.7.0. Nothing else changed major version.
- **`package-lock.json` is now committed** so both machines install the same tree.
- **`@wolfie/shared` is consumed from source** (`exports` point at `src/*.ts`). Vite, Vitest and esbuild compile it; there is no shared build step.
- **Device name is `webapp` everywhere** (was `ipad` in schemas, `webapp` in the DB). Sync type `ipad.activity` → `webapp.activity`.
- **Messages use one envelope** `{ id, type, ts, payload }` with a Zod discriminated union per channel (`SyncMessageSchema`, `ExtensionMessageSchema`).
- **Extension auth:** the token is sent in the first message (`ext.hello`), never in the URL; the desktop also checks the Origin. The extension reports only while `desk.state.reporting` is true; the desktop decides that from session active + browser frontmost + not paused, since the extension cannot know which app is frontmost.
- **Web app auth:** challenge/response, `auth.challenge {nonce}` → `auth.hello {deviceId, hmac(secret, nonce)}`; pairing via `pair.request {code}` → `pair.result {secret}`. Every message gets an `ack`; the desktop dedupes by message id.
- **Hint images travel as data URLs** (`HintContext.imageDataUrl`), since the web app shares no filesystem with the desktop. The desktop writes them to disk only if image storage is on.
- **`HintContext` and `requestHints(context, source, assessment)` live in shared** and are frozen.
- **The escalation engine lives in `shared/src/schemas/escalation.ts`**, so desktop and web app run one implementation instead of two kept in sync by fixtures. `computeLevel(signals, state)` is pure, and `applyEscalationEvent` is its reducer. Interpretations of SPEC 4c:
  - Levels step up one at a time, at most every 45 s, and not within 5 s of input. A drop in signals lowers the level immediately.
  - A decline gives 3 min at level 0, then target − 1 until 10 min after the decline.
  - "I'm good" caps that problem at level 2 (glance / "?") for the session; offers (3+) are suppressed.
  - Level 4 = level 3 left unanswered 60 s with voice on. It is the same offer spoken, not a new bubble.
- **NudgeQueue additions (Thu's file, small edits):**
  - `push()` returns the nudge id or null, and every nudge gets an id.
  - `respond()` and a `'response'` event; the overlay sends `nudge-response`.
  - `{ userInitiated: true }` skips cooldown, the hourly cap and snooze (for "Another hint" and hint replies); pause still applies.
  - Limits come from settings.
- **Escalation levels 1–2 and sleeping are sprite states** on the `overlay-state` IPC channel, not nudges. This avoids the `stuck` cooldown blocking the steps.
- **Migration 002:** `nudges.session_id` is nullable (streak reminders can fire outside a session), and `nudges.uid` holds the queue id.
- **Typed IPC:** channel maps in `desktop/src/common/ipc.ts`; preload and `src/main/ipc.ts` are typed from them. The preload's `on()` returns an unsubscribe and `off()` now actually removes the listener.
- **Preload is built as CommonJS** (`preload.cjs`); sandboxed preloads cannot be ESM. The main bundle stays ESM and derives `__dirname` from `import.meta.url`.
- **Extension build uses esbuild** (`extension/build.mjs`): the background worker is ESM, content and popup scripts are IIFE. Load unpacked from `extension/dist`.
- **Ports:** extension loopback 45678 (`EXTENSION_WS_PORT`), web app LAN 45679 (`SYNC_WS_PORT`).

## Agent A
_(Agent A appends decisions here.)_

## Agent B
_(Agent B appends decisions here.)_

### B1: LLM client
- **Provider interface changed** (it is in `llm/`, which B owns): a provider now exposes one method, `generateJson(req) -> parsed JSON`, plus `name` and `countsTowardCap`. Timeout, retry, schema validation and the daily cap live once in `LLMClient`, so Gemini and the mock behave identically. The old `requestHints`/`chatCompletion` provider methods are gone; `requestHints`/`requestFollowup` (frozen) live in `hints/`. Per-task mock output is keyed by `LlmRequest.task` + `mockKey`.
- **Retry policy:** transient failures (timeout, no HTTP status, 429, 5xx) are retried once after a short delay; 400/401/403 are not. Unparseable or schema-invalid replies are retried once with the validation problems appended as a user message. Every provider attempt counts against `api.call_limit_per_day` (real providers only; the mock never counts). The count is per local day in table `llm_usage` (migration `201_b_llm_usage`), so a restart does not reset it.
- **Gemini:** `models.generateContent` with `responseMimeType: 'application/json'` and `responseJsonSchema` (from `zod-to-json-schema`, stripped to the keywords Gemini supports). Images are `inlineData` parts on the last user message. Model comes from `GEMINI_MODEL`; if unset, `gemini-3.6-flash` (a current stable Flash model per ai.google.dev/gemini-api/docs/models on 2026-10-24). `gemini-pro` is refused.
- **Prompts** are Markdown files in `llm/prompts/`, imported with Vite `?raw` (works in the Electron main bundle and in Vitest). New version = new file.
- **Logs** carry only task, provider, attempt, duration and a scrubbed error (keys and URLs removed). Prompt text, page text and titles are never logged.
- **Tests touched outside B's folders:** `db.test.ts` asserted the exact migration list; it now filters to core `0xx_` names so agent migrations don't break it (Agent A probably needs the same one-line change).
- **Lint in nested worktrees:** `npm run lint` fails here because ESLint also finds the parent repo's `.eslintrc.json` (the worktree lives inside `sbuhacks26/.claude/worktrees/`). Equivalent check: `cd desktop && npx eslint --no-eslintrc -c ../.eslintrc.json src electron`.

### B5a: voice core
- Local intents match the **whole utterance** (plus polite filler like "Wolfie," / "please"), never a substring, so "I don't get step 2" or "I can't stop at step two" are not commands. Intent list: stop/wait/hold on/quiet, snooze, mute, I'm good, another hint, I got it, repeat that, I'm stuck, show the answer, taking a break, I need this, ignore.
- Recognized intents are announced on `voice/bus.ts` (`voiceBus`). B handles snooze, mute, I'm good, another hint, I got it, show the answer, stop, repeat and I'm stuck; Agent A's rules (A4) can listen for the Phase 3 answers (`taking_a_break`, `need_this`, `ignore`).
- Echo suppression: a transcript is an echo when at least 75% of its words are in what Wolfie just said (while speaking and for 4 s after). Under 3 words it must appear verbatim, and a command is never treated as an echo, so "stop" always works as barge-in.
- Speech that is not an echo stops playback first, even before the transcript is final (partial results are used for barge-in only).
- Mic frames come in through the invoke channel `voice-audio-in` because the preload only exposes a generic `invoke`, not `send`.
- Speaking is skipped unless voice mode is on and monitoring is not paused. STT is opened only while a session is active, voice mode is on, and not paused.

### B2: escalation runtime
- **Signal lifetime** is `max(detection window, 5 min)` and re-emitting a signal refreshes it. Windows come from `stuck.thresholds` (dead clicks 20 s, validation 120 s, ...), `stuck.idle_minutes` for `idle_on_work`. Signals are cleared on accept, decline, "I'm good", help-requested, a real problem change, and session change. Signals that carry a different `problemId` than the one on screen are dropped.
- The engine's problem key is `session:<id>` until a real `problemId` is known ("I'm good" with no `currentProblemId` therefore still works). A signal that carries a `problemId` while the key is still the fallback adopts it.
- Accepting the offer does not call the hint flow directly: the engine emits `stuckBus 'help-requested' ('auto')`, and the engine's own listener plus the hint flow (B3b) both react to that one event, same as hotkey, mascot click and "I'm stuck".
- Offer buttons: `accept_hint` ("Yes, give me a hint"), `decline` ("Not now"), `im_good`. Response mapping: `accept_hint` accept; `decline` and `dismissed` decline; `im_good` I'm good; `timeout` is nothing (the offer stays open so level 4 can still follow).
- A level-3 `push()` that returns null is not applied as shown; the engine stays at level 2 and retries after 5 s.
- Level 4 speaks the same offer text; the text includes "say I'm stuck" so it works when the bubble has already faded. Level 4 only happens with voice mode on (the shared engine caps otherwise).
- While paused the engine does not touch the sprite (main.ts owns "sleeping"). `setLadderOpen(true)` (called by the hint flow) clears signals, ignores new ones and holds level 0.
- Hotkey `Alt+Shift+H` emits `help-requested('manual')`; if the key is taken the app logs it and continues.

### B3a: hint service
- `requestHints` / `requestFollowup` (frozen signatures) delegate to `HintService` (`hints/service.ts`), which takes all outside things as injected deps. Callers can pass `assessment=false` and still get assessment mode: the service ORs in the active session's toggle, the stored `sessions.assessment_mode` for `context.sessionId` (web app sessions), and `assessment.domains` (suffix match on the page domain).
- **Logging:** each ladder request writes one `hint_requests` row for level 1 (what the student sees first); the hint flow calls `logLevelShown` for each later level; follow-ups log the level they answered at. Rows are written only if a `sessions` row with that id exists (FK + NOT NULL). `events` always gets `hint.requested` / `hint.followup` / `hint.level_shown` with no page text.
- **Word limits** are enforced after the model answers (40 words for levels 1-2, 90 for 3-5, cut on a sentence boundary when possible). Follow-ups are clamped to the current level or one up, never above 5.
- **Offline ladder:** any `LLMError` after the client's one retry (network, invalid output, daily cap, no key) produces the rule-based ladder with `offline: true` and a `what_i_see` that says "offline hints". If the page had an error message, level 2 quotes it (truncated).
- **Images** are decoded for the model and written to `<userData>/images` only when `image.storage_enabled`; otherwise nothing touches disk, so nothing needs deleting.
- Follow-up conversation is sent as one user message (context, transcript, current level, the new utterance), which avoids role-alternation problems with Gemini.

### B3b: hint flow
- Every entry point is `stuckBus 'help-requested'` (offer accepted -> `'auto'`, hotkey and mascot click -> `'manual'`, "I'm stuck" -> `'voice'`). The flow ignores it while paused. If a ladder is already open, a manual or voice request means "another hint".
- **Context order:** a page summary is used if it is fresh (under 2 minutes old, since a stale one means the browser was probably not in front) and has content; otherwise a `desktopCapturer` screenshot (frontmost window if a provider is set, else the primary screen). Screen Recording permission is checked first; without it the bubble explains how to enable it and no model call is made.
- **First capture per session** shows a native confirm dialog with the thumbnail (`dialog.showMessageBox`, injected). Declining ends gently without a model call.
- Ladder bubbles are `kind: 'stuck', level: 3` pushed with `userInitiated: true`. The ladder position lives in `HintFlow`, keyed by the id of the bubble on screen. Buttons: Another hint (not at level 5), I got it, I'm good, Show the answer (absent in assessment mode, and ignored if asked by voice).
- "Show the answer" sends the fixed utterance `Please show me the answer.` as a follow-up; outside assessment mode the service jumps to level 5 and the follow-up prompt allows the worked answer. In assessment mode the assessment rules override it.
- Voice answers go through `NudgeQueue.respond` (`via: 'voice'`), so they are logged in `nudges.user_response` exactly like clicks.
- Closing: "I got it", "I'm good" (also marks the problem for the engine), dismissing the bubble, a real problem change, a session change, or 5 minutes without interaction (checked every 5 s). A bubble fading ('timeout') keeps the ladder open. The engine is held at level 0 while a ladder is open.
- Spoken output: ladder bubbles carry `spokenText` (first two sentences); main speaks any nudge with `spokenText` when voice mode is on and monitoring is not paused. The level-3 offer has no `spokenText` on purpose (level 4 speaks it).
- "Let me take a look..." appears only if the model call takes longer than 0.8 s.

### B4: handwriting and camera sources
- No new code path: `hint.request` with `source: handwriting | camera` already reaches `requestHints` with `context.imageDataUrl` (A8 routes it). B4 added the prompt notes (`source-handwriting.v1.md`, `source-camera.v1.md`: say exactly what could not be read, make the level 1 nudge a clarifying question, build only on what is readable) and mock hints.
- **Mock problem ids for the web app's demo canvas (tell Thu):** `demo-handwriting` (product rule), `demo-camera` (distributing a bracket), `demo-illegible` (the hint says what it could not read and asks). Any other id with a handwriting or camera source gets the `handwriting-default` ladder, so the demo never falls through to the typed-page text.
