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

### A1: sessions + monitor
- **`session/index.ts` keeps its public API.** `startSession`/`stopSession` now insert/update the `sessions` row (`device='desktop'`) and log `session.start`/`session.end`. `setActiveSession` stays state-only (existing NudgeQueue tests rely on that).
- **Assessment toggle (`setAssessmentMode`) mutates the active session in place and does not emit `change`**, because B2 resets the engine on every `change`. Readers (B3a) call `getActiveSession()` per request.
- **Crash recovery:** `closeOrphanedSessions()` runs at startup; open desktop sessions end at their last `app_events` ts (or start).
- **Pause marker:** while paused, the monitor writes one `app_events` row with `app_name='(paused)'` (`PAUSED_APP`) and nothing else. History/streak code must treat the time from a `(paused)` row to the next row as paused, not work. A session's last row runs to `sessions.ended_at`.
- **Mic flag:** `isMicAllowed()` = session active && !paused && `voice.enabled`. register.ts broadcasts `mic-allowed` on change (Thu's voice UI listens). Also `session-changed` is broadcast on session/pause changes.
- **Auto-start** fires on the *transition* to the `session.auto_start_app` app, so a manual Stop sticks while that app stays frontmost. With no session and no auto-start app set, the window source is not polled at all.
- **Window source:** JXA via `osascript` + System Events (Automation permission; titles also need Accessibility, otherwise the title is null). Automation can't be queried, so its status is learned from the poll result (`unknown` -> `granted`/`denied`). Screen Recording is reported but is not needed by this source.
- **Idle:** `is_idle = getSystemIdleTime() >= session.idle_timeout_seconds` (default 60 s). A flip writes a row.
- **Title capture off:** the source is not asked for the title, and `window_title` is NULL.
- **Browser list** (`monitor/browsers.ts`) is the set of Chromium-family app names; the tab domain is attached to `app_events.url_domain` only when one of them is frontmost.
- **Lint in nested worktrees:** a worktree under `.claude/worktrees/` sees the parent repo's `.eslintrc.json` too and `npm run lint` fails with "couldn't determine the plugin uniquely". Not a repo bug; run `eslint --no-eslintrc -c <root>/.eslintrc.json` there.

### A2: extension loopback server
- **Auth order:** Origin must match `chrome-extension://<32 chars a-p>` (checked in `verifyClient`, HTTP 403 otherwise, including no Origin). The first `chrome-extension` id seen with a valid token is stored in `pairing.extension_id` (trust on first use); later origins must match. The first message must be `ext.hello` within 5 s, else the socket closes (1008). Regenerating the token (IPC `extension-pairing-regenerate`) also clears the stored id and drops clients, which is the way out after reinstalling the extension (new id).
- **Token format** `XXXX-XXXX-XXXX` (no 0/O/1/I); compared case/dash-insensitively in constant time.
- **No wire-level ping in the contract:** `ExtensionMessageSchema` has no `ping`. MV3 keep-alive is therefore: the desktop re-sends `desk.state` every 20 s (receiving a WebSocket message resets the worker's idle timer in Chrome 116+) plus ws ping/pong to drop dead sockets; the extension also re-reports the active tab while reporting and runs a `chrome.alarms` check (A3). No contract change needed.
- **Desktop re-checks `desk.state`** on everything the extension sends (reporting, `capturePageText`, excluded domains), so a misbehaving client reports nothing. With `capturePageText` off, summaries are dropped; `ext.tab` domains still flow.
- **`problem-changed`** fires only when a summary with a *defined, different* `problemId` arrives. Summaries without a `problemId` (other tabs/pages) are stored as the latest page but never reset the problem; a new session resets the tracker so its first problem counts again.
- **Stale context is cleared:** when reporting turns false (browser not frontmost, pause, session end) the latest PageSummary and the tab domain are cleared, so a hint asked from another app never sees an old page.
- **`requestSummary`** correlates by arrival (the reply has no request id): the next `ext.page_summary` after the request resolves it, 1.5 s timeout, then `requestPageSummary()` falls back to the latest one.
- **Reporting needs the frontmost app**, which comes from the window poll. If Automation is denied, `reporting` stays false and the extension reports nothing (documented limitation; titles-only fallback applies the other way round).
- **EADDRINUSE:** the link logs and stays off; IPC `extension-pairing-get` reports `port: null`.

### A3: extension background + popup
- **Popup exclusions and pause are extension-local.** The contract has no extension-to-desktop settings message, so the popup keeps `localPaused` and `localExcluded` in `chrome.storage.local` and enforces them in the extension (union with `desk.state.excludedDomains`). Desktop-managed exclusions show read-only ("edit in Wolfie settings", via A10's `settings-set`). Removing a desktop default from the popup is therefore not possible; that is a settings-screen action.
- **Pairing rejected** (`desk.hello_result ok:false`) stops reconnect attempts until the user enters a new token (avoids hammering the desktop); an unreachable desktop retries with 1 s..30 s backoff (+20% jitter).
- **Keep-alive:** `chrome.alarms` every 30 s (added `alarms` permission) reconnects if the worker restarted; a 20 s interval re-reports the active tab while reporting; the desktop also heartbeats `desk.state` (see A2).
- **Page text gate in two places:** the background forwards `PAGE_SUMMARY` only when the tab is reportable, `capturePageText` is true and the summary's domain matches the tab's hostname; content scripts also ask for per-tab state (`GET_CONTENT_STATE`, pushed again as `STATE`).
- Pure logic is in `extension/src/lib` (`reportableDomain`, backoff, messages) and `background/connection.ts` (fake socket/timers in tests); `popup/view.ts` renders with `textContent` only.

### A4: rules + warnings
- **When it fires:** on a monitor `foreground` event whose matched rule differs from the previous one ("comes to the front"). Title/idle changes inside the same rule never re-fire. If the NudgeQueue drops the nudge (snooze, its per-kind cooldown, hourly cap) the rule's own cooldown is *not* consumed, so the next arrival tries again.
- **Two cooldowns stack:** per rule (`monitored.rule_cooldown_minutes`, default 10) here, plus the NudgeQueue's per-kind cooldown and hourly cap.
- **Matching:** with a tab domain known, only the domain is consulted (suffix match, `www.` ignored). Otherwise app name (whole word, case-insensitive), and the window title **only when the frontmost app is a browser** (otherwise "Reddit notes.md" in an editor would warn). Entries with a path (`github.com/copilot`) are skipped for domain matching because only the host is known; the Copilot rule still matches by app name. AI tools are checked before distractions.
- **Answers:** buttons `taking_break`, `need_for_task`, `ignore_session` (`RULE_ACTIONS` in `rules/messages.ts`). `parseRuleAction` also accepts loose phrasing ("taking a break", "I need this", "ignore"), so B5a's voice intents can send either the action id or the phrase as `NudgeResponse.action`. "Ignore" suppresses that rule for the session; "I need this" quiets it for 3 cooldown periods; "Taking a break" changes nothing. `dismissed`/`timeout` change nothing. Every response is already logged to `nudges.user_response` and `events` (`nudge.answered`) by the NudgeQueue wiring; the engine also logs `rule.response`.
- Rule nudges use `level: 1`, `priority: 6`, and set `spokenText` equal to the text (the overlay decides whether to speak, per voice mode).
- Ignores, cooldowns and pending nudges reset on every session change.

## Agent B
_(Agent B appends decisions here.)_
