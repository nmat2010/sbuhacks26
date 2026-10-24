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

### B6: plan generation
- **Storage:** onboarding answers are one JSON row in `plan_onboarding` (not a settings key). Goals go in the core `goals` table (upsert by id; goals dropped from the form are archived, never deleted). Generation adds `plan_goal_meta` (rationale), `plan_milestones` (weekly milestones) and `plan_item_meta` (position, milestone, estimated hours, `source` generated/user/paper) next to the core `plan_items`. B's tables declare no foreign keys so "Clear all data" can delete them in any order; B's delete code removes the matching rows itself.
- **Date rules live in the Zod output schema** (item `due_date` between today and the goal's `plan_until`, `week_start` not after it, `goal_id` must be a real goal). A bad date therefore counts as invalid output and gets the client's one corrective retry; after that the user sees "I couldn't put together a valid plan this time" and the DB is untouched.
- `plan_until` is the goal's target date, else the semester end, capped at 400 days out. A target date already in the past is a friendly error before any model call.
- **Regenerating** a goal replaces only its generated, unfinished items and its milestones. Completed items, items the student added, and items the student edited (editing flips `source` to `user`) stay. Regenerating a single item keeps it a generated item.
- Reorder takes the ids that should come first; any ids not listed keep their relative order after them.
- **Seams for Agent A / nudges:** `getPlanSnapshot()` returns `plan.snapshot` items due in the window from 7 days ago to 14 days ahead (any status; the web app filters to today); `getTodayPlanContext()` returns `{ text: "Today's goal: <oldest open item due today or earlier>", ... }` or null. Both are in `desktop/src/main/plan/index.ts`. Completing an item logs `plan.item_completed`.
- Dates are `YYYY-MM-DD` strings with UTC date math (`plan/dates.ts`), so DST never shifts a due date; "today" is the local calendar date.

### B5b: ElevenLabs providers
- **TTS:** `POST /v1/text-to-speech/{voice_id}/stream?output_format=pcm_16000` with the key in the `xi-api-key` header. 16-bit little-endian mono PCM at 16 kHz was chosen over MP3 because the renderer can schedule PCM chunks in Web Audio as they arrive, with no MP3 frame boundaries to decode; chunks are kept sample-aligned. The stream is cancelled when the abort signal fires (barge-in), and a chunk that arrives after the abort is not played. Default model `eleven_flash_v2_5` (lowest latency per the ElevenLabs models page, 2026-10-24); `ELEVENLABS_TTS_MODEL` overrides it.
- **STT:** `wss://api.elevenlabs.io/v1/speech-to-text/realtime` (Scribe v2 Realtime, `scribe_v2_realtime`), `audio_format=pcm_16000`, `commit_strategy=vad` (server-side end of turn). The key goes in the `xi-api-key` header (the `ws` package is used because browsers cannot set it), never in the URL. Client messages are `input_audio_chunk` with base64 PCM; server messages handled are `session_started`, `partial_transcript` (barge-in only), `committed_transcript` (the turn), `warning`, plus the error types.
- **Reconnects:** a dropped socket, a socket that never reports `session_started` within 8 s, or a transient server error (rate limit, queue overflow, session time limit, transcriber error) triggers up to 3 reconnects with 0.4/0.8/1.6 s backoff; the counter resets after a successful `session_started`. After the third reconnect fails, `onError` fires once and the controller sends the "voice is having trouble" message. Fatal errors (bad key, quota, terms, invalid request) do not retry.
- **End-of-turn fallback:** if there has been a partial transcript but no committed one for 1.5 s, we send a manual commit.
- **Whole protocol is in `voice/elevenlabs-stt.ts`** behind an injected socket factory; `voice/elevenlabs-tts.ts` takes an injected `fetch`.
- **No key -> mock providers and a note** (`voice-trouble` event and `voice-status.note`): "Voice needs an ElevenLabs key..." A key without `ELEVENLABS_VOICE_ID` keeps STT live but TTS on the mock, with its own note. `DEMO_MODE=1` forces the mocks and no note. Changing `voice.stt_provider` / `voice.tts_provider` swaps providers at runtime.

### B7: ideas and papers
- **Verification** (`papers/verify.ts`): each recommended paper is looked up by title, one at a time, in arXiv first (Atom XML, `ti:"..."` query, spaced at least 3 s apart) and then Semantic Scholar (JSON, spaced 1.1 s, one retry after a 429). A paper is kept only if a result's normalized title matches (lowercase, accents and punctuation removed; a dropped subtitle is allowed when the shorter title is at least 15 characters). At most 5 are kept and the search stops there. Title, authors, year and link shown to the student come from the API; only the one-line "why" is the model's.
- **"Could not check" is not "fake":** if no API answers (offline, 429), the paper is dropped for this run but not cached as missing, and the result carries `verificationUnavailable: true` so the UI can say so instead of showing an empty list. Hits are cached for 30 days and genuine misses for 24 hours (`paper_lookup_cache`).
- **DEMO_MODE** uses a small offline catalog of real, well-known papers (`papers/demo-catalog.ts`) as the "search API", and the mock model's reading list includes one invented title, so the offline demo shows both a verified list and a dropped paper.
- **Adding a paper** writes the core `papers` row plus `paper_meta` (authors, year, arXiv id); the same link or arXiv id twice returns the existing paper. The optional plan item "Read: <title>" is a `plan_items` row with `source: 'paper'` and needs a goal (the core table requires one). Deleting a paper removes its questions, text chunks and metadata.
- Optional `SEMANTIC_SCHOLAR_API_KEY` is read from the environment if present (higher rate limit); nothing requires it.
- Migration `203_b_papers` also creates `paper_chunks` for B8.

### B8: paper reading backend
- **Extraction:** `pdfjs-dist/legacy/build/pdf.mjs` (dynamic import, externalized in the Vite config), text items grouped into lines by baseline, with page number, font size and line gaps. Checked to run in Electron 44.7's own Node as well as under Vitest. The canvas/DOMMatrix warnings are harmless. Scanned PDFs with no text layer give a friendly error (no OCR).
- **Chunking:** headings are detected from text patterns (Abstract, References, numbered "3.2 Procedure", ALL CAPS) combined with font size; paragraphs come from line gaps; paragraphs are packed into chunks of about 140 words (max about 220) that never cross a section boundary. The title block before the first heading is the "Title and authors" chunk. Each chunk keeps its section name and page, which are the citations.
- **Retrieval:** BM25 in memory (no vector DB) with a light stemmer, stop words, and the section title indexed twice. Highlighted text is first located verbatim in the chunks (anchoring the answer to the exact passage). A question counts as covered by the paper only if the best chunk matches at least 50% of the question's terms weighted by rarity, so a term the paper never uses (like "photosynthesis") weighs heavily and an unrelated question is not "covered" just because a common word like "work" appears.
- **Answers:** the model gets only the numbered excerpts (up to 4) and must cite them. If the model says "grounded" without citing a real excerpt, the answer is downgraded to general knowledge. Grounded answers end with "Source: <section>, p. N" and carry structured citations; ungrounded ones are prefixed "This isn't covered in the paper, so here is some general background:" and labeled "General knowledge (not from this paper)". "Show me where" is pure retrieval (no model call) and says so when nothing matches ("Not found in this paper"). "Check my understanding" returns one question about the selection (or the abstract if nothing is selected).
- **Saving:** every question goes to `paper_questions` with `input_mode`, plus `paper_answer_meta` (mode, grounded, citations). Downloaded arXiv PDFs are kept in `<userData>/papers/` and their path in `paper_meta.local_path` (migration 204).
- **Voice:** `paper-focus` tells main which paper is open. While one is, speech that is not a command (and no hint ladder is open) is answered from the paper, delivered on the `paper-answer` event and spoken (first two sentences, without the source line).
- **Fixture:** `reading/__tests__/fixtures/sample-paper.pdf` is a two-page paper written for this project (original text, so no licence issue; treat as CC0). It was generated by a small script, not downloaded.

### B: integration with Agent A
- Plan changes fire `planEvents` (`plan/index.ts`); after the merge `intelligence/register.ts` sets `setPlanSnapshotProvider(getPlanSnapshot)` and refreshes the web app's snapshot on that event (patch in `tuan/reports/b-post-merge.patch`). B cannot import A's `sync/snapshots.ts` before A is merged.
- `MockLLMProvider.requestHints` stays as a direct-call convenience (no client, no delay) because A's LAN server test uses it.
- B's tables have no foreign keys, so A's "Clear all data" can delete in any order. Files outside SQLite that clear-all should remove: `<userData>/images/` (hint images, only exist if image storage is on) and `<userData>/papers/` (downloaded PDFs).
