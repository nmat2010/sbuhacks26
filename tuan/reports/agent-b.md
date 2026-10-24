# Report: Agent B (Intelligence)

**Branch:** `tuan/b-intelligence` (from `tuan/phase0-fixes` @ f4de16a)

## Status: all packages done
| Package | State | Commit |
|---|---|---|
| B1 LLM client | done | 0afbf9b |
| B5a Voice core | done | da3c3ce |
| B2 Escalation runtime | done | de65418 |
| B3a Hint service | done | 4053392 |
| B3b Hint flow (M2) | done | c240e5c |
| B4 Handwriting + camera | done | 14bb590 |
| B6 Plan | done | 9c75011 |
| B5b ElevenLabs | done, but no real call verified | c17ab34 |
| B7 Ideas + papers | done | 198b47f |
| B8 Paper reading | done | a5ffe59 |
| M2-int | done (A7 is committed on `tuan/a-sensing`) | be95128 |
| Merge-readiness tweaks | done | 1d15b17 |

In progress: nothing. Left: nothing in B's plan. Blockers: none.

On this branch: `npm run typecheck` clean, `npm test` passes (47 shared, 235 desktop), lint has no errors (warnings only), `npm run smoke` OK.

## What to do when merging (Tuan)
I merged `tuan/a-sensing` into a throwaway branch (deleted, nothing of it is on this branch) and ran everything: typecheck clean, 405 tests pass, smoke OK. Three mechanical things come up when B and A meet:
1. `desktop/src/main/__tests__/db.test.ts` conflicts (A and I made the same one-line fix to the migration-list assertion). Take either side; A's regex also skips `1xx_a_` and `2xx_b_`.
2. `history.test.ts` ("seeding really fills every table") fails after the merge, because it seeds every table in `DATA_TABLES` and B's new tables have no rows. The fix is 9 INSERTs in `tuan/reports/b-post-merge.patch`. With them "Clear all data" passes too, so B's tables (no foreign keys) clear in any order. Clear-all should also delete the folders `<userData>/papers/` and `<userData>/images/`, which live outside SQLite.
3. Plan snapshot wiring: A's `sync/snapshots.ts` says "B6 calls `setPlanSnapshotProvider`". That import cannot exist on B's branch before A is merged, so it is in the same patch (`setPlanSnapshotProvider(getPlanSnapshot)`, and `planEvents.on('changed', () => notifySnapshotsChanged('plan'))` in `intelligence/register.ts`). Apply it on the merged tree with `git apply tuan/reports/b-post-merge.patch` (verified there: typecheck, 405 tests, smoke).

A's `lan-server.test.ts` calls `MockLLMProvider.requestHints`; I kept that method as a compatibility shim (commit 1d15b17).

## Not verified
- Any real Gemini call (no key). The request shape follows the `@google/genai` 2.28 typings and the structured-output docs.
- Any real ElevenLabs call (no key). The protocol follows the ElevenLabs docs read on 2026-10-24.
- Live arXiv and Semantic Scholar (tests use fakes; the arXiv format matches the API manual).
- Electron pieces that need a human: the first-capture confirm dialog, `desktopCapturer` with Screen Recording permission, the PDF file picker, the `Alt+Shift+H` shortcut, audio playback and mic capture (Thu's renderer does the last two).
- Plan, ideas and reading quality from the real model (only the mock was exercised).

## Needs action from others
- Thu: send `nudge-response` with `dismissed` (X pressed) and `timeout` (bubble faded) from the overlay; the hint ladder and the offer rely on it. Mic capture into `voice-audio-in`, playback of `voice-audio-out` (PCM 16 kHz 16-bit mono), and the UI for plan, papers and reading on the channels in `ipc-intelligence.ts`. Details are in COORDINATION.md under Agent B. `voice-utterance` takes typed text for the developer panel.
- Agent A: nothing blocking. Optional: `setFrontWindowProvider` (in `hints/capture.ts`) so screenshots match the active window, and listen on `voiceBus` for `taking_a_break`, `need_this`, `ignore`.

## B1 details
- Files: `desktop/src/main/llm/{client,provider,gemini-provider,mock-provider,schema,usage,redact,data-url}.ts`, `llm/prompts/*`, `db/migrations-b.ts` (`201_b_llm_usage`).
- Tests: `llm/__tests__/client.test.ts`, `llm/__tests__/gemini-provider.test.ts` (fake provider and fake SDK; no network): timeout + abort + retry, retry limit, no retry on auth, 429 retry, schema retry with feedback, INVALID_JSON, daily cap per local day, mock exempt, retries counted, log redaction, SQLite usage store, provider selection, `gemini-pro` refused, inlineData/schema/system prompt sent as expected.
- Not verified: a real Gemini call (no key available). The request shape follows the installed `@google/genai` 2.28 typings.

## How to verify
```
npm ci && npm run typecheck && npm test
cd desktop && npx eslint --no-eslintrc -c ../.eslintrc.json src electron   # lint workaround for nested worktrees, see DECISIONS.md
WOLFIE_USER_DATA=/tmp/wolfie-b npm run smoke
```
Trying the loop by hand (no keys needed): `WOLFIE_USER_DATA=/tmp/wolfie-b DEMO_MODE=1 npm run dev`, start a session from the mascot menu, then press Alt+Shift+H or click Wolfie. With no extension connected you get the screenshot confirm dialog (it needs Screen Recording permission for your terminal or VS Code). The hint bubbles then walk through the five mock levels.

## M2-int details
`desktop/src/main/intelligence/__tests__/m2-int.test.ts` (7 tests, offline; `DEMO_MODE=1` selects the mock even with a key present). Page events come in the way A's extension link delivers them (`setLatestPageSummary`, `setPageSummaryRequester`, `stuckBus` `problem-changed` and `signal`). The real `EscalationEngine`, `HintFlow`, `HintService` and `NudgeQueue` do the rest: glance, "?", offer after 90 s, accept, five distinct ladder levels one per bubble, `hint_requests` rows 1-5, "Show the answer" present outside assessment mode and absent in assessment mode (no worked answer in level 5), decline cooldown, "I'm good" per problem, voice-mode level 4 speech, voice "I'm stuck". The page summary in the test is a fixture; A's detectors on the real demo pages are covered by A's own `demo-pages.test.ts`.

## B5a details
- Files: `desktop/src/main/voice/{types,mock,text,intents,echo,speaker,router,controller,service,bus}.ts`, IPC in `src/common/ipc-intelligence.ts`, voice wiring in `intelligence/register.ts`.
- Interfaces for Thu: `SttProvider`/`TtsProvider` in `voice/types.ts`; mic frames arrive via invoke `voice-audio-in` (16 kHz 16-bit mono PCM; the preload has no generic `send`), audio goes out on events `voice-audio-out` / `voice-stop-playback`, green dot on `voice-mic`, failures on `voice-trouble`. Developer panel / typed input: invoke `voice-utterance` (works with the mock STT). `voice-status` reports providers and whether an ElevenLabs key exists.
- For Agent A (A4): every recognized intent is announced on `voiceBus` (`voice/bus.ts`). `taking_a_break`, `need_this`, `ignore` have no B handler; A4 listens and answers its open nudge.
- Tests: `voice/__tests__/voice.test.ts` (46): intents incl. negatives and speed, echo, first-two-sentences, speaker barge-in and TTS failure, router (intents with no model call, follow-up only with an open ladder, paused drop, echo drop, barge-in), controller (STT closes on pause, drops frames, trouble).
- Verified: typecheck, tests, lint (workaround), `npm run smoke` OK with the register wiring.
- Not verified: real microphone or ElevenLabs (B5b).

## B2 details
- Files: `desktop/src/main/stuck/{engine,actions}.ts`, `intelligence/hotkey.ts`, wiring in `intelligence/register.ts` (engine, hotkey, voice `im_good` handler).
- Tests: `stuck/__tests__/engine.test.ts` (17, fake clock, `push` and `setMascotState` mocked): climb glance, "?", offer; dead_control_clicks window outlived by the 90 s climb; refresh on re-emit; weak cap; accept -> `help-requested('auto')` and ladder hold; decline -> 3 min cooldown -> penalized re-escalation -> full after 10 min; null push not counted and retried; level 4 spoken only with voice and 60 s unanswered; "I'm good" with `session:<id>` key and per-problem; dismissed vs timeout; input guard, snooze, pause; session reset; problem change; signal logging without content. `intelligence/__tests__/hotkey.test.ts` (2).
- Verified: typecheck, tests, lint (workaround), smoke OK.
- Not verified: the hotkey in a real Electron session (`globalShortcut` may be refused on some machines; it degrades with a log line).

## B3a details
- Files: `desktop/src/main/hints/{index,service,prompt,limits,offline}.ts`, prompts `llm/prompts/{assessment,source-*}.v1.md`.
- Tests: `hints/__tests__/hints.test.ts` (21): mock returns 5 distinct levels for each demo id; assessment rules reach the prompt (flag, active session, stored session, domain list); offline ladder after 1 retry (also invalid output and daily cap); word limits; `hint_requests` only with a session row, events always, no page text in events; images: nothing on disk when storage is off (also after an offline fallback), file + `image_path` when on; follow-ups: level clamp, conversation sent, offline reply, logging.
- Verified: typecheck, 119 tests, lint (workaround), `npm run smoke` OK (main bundle builds with the `?raw` prompt imports).
- For Agent A (A8): call `requestHints(context, source, assessment)` / `requestFollowup(followup, context, source, assessment)` from `desktop/src/main/hints/index.ts`; both can throw only on programmer error (model failures become `offline: true` responses). `assessment` may be false: the service also checks the stored session and domain list.

## B3b details (M2)
- Files: `desktop/src/main/hints/{flow,capture,constants}.ts`, `voice/nudge-speech.ts`, `stuck/engine.ts` (offer id, no spokenText on the offer), wiring in `intelligence/register.ts` (dialog, desktopCapturer, systemPreferences, nativeImage injected there only).
- Tests: `hints/__tests__/flow.test.ts` (21): accept -> five distinct levels shown one at a time with the right buttons and `hint_requests` rows 1-5; spoken text is the first two sentences; "Show the answer" present outside assessment mode (returns the mock answer at level 5) and absent at all five levels in assessment mode (and ignored if requested); page summary preferred, screenshot fallback for empty/stale/missing summaries, confirm only once per session, decline and denied permission end gently with no model call; paused ignored; offline ladder labeled; closing paths (got it, I'm good, dismissed vs timeout, idle, problem change); help again = another hint; voice answers via `respond`; follow-ups keep at most 6 turns; the real `EscalationEngine` accepting the offer starts the flow; `captureActiveWindow` (permission, title match, blank, error). Plus `voice.test.ts` nudge speech.
- Verified: typecheck, 141 tests, lint (workaround), `npm run smoke` OK.
- Not verified in a real app: the Electron dialog, `desktopCapturer` and the overlay showing the bubbles (needs Thu's overlay to send `dismissed`/`timeout`, see COORDINATION.md). To try the loop by hand in dev: `WOLFIE_USER_DATA=/tmp/wolfie-b DEMO_MODE=1 npm run dev`, start a session from the mascot menu, click Wolfie (or Alt+Shift+H); with no extension connected, expect the screenshot confirm dialog (needs Screen Recording permission for the terminal/VS Code).

## B4 details
- Files: `llm/mock-provider.ts` (demo-handwriting, demo-camera, demo-illegible, handwriting-default), prompts `source-handwriting.v1.md` / `source-camera.v1.md` (added in B3a).
- Tests: `hints/__tests__/handwriting.test.ts` (8): mock round trip for handwriting and camera (demo and unknown ids) returns five distinct levels with the image passed to the model; illegible demo asks for clarification; illegible-writing instructions are in the prompt for handwriting/camera only; assessment mode and follow-ups; webapp device logged against its session; no image on disk with storage off.
- Verified: typecheck, tests, lint (workaround).
- Not verified: a real Gemini read of real handwriting (no key).

## B6 details
- Files: `desktop/src/main/plan/{dates,schemas,store,service,index}.ts`, `llm/mock-plan.ts`, prompts `plan.v1.md` / `plan-item.v1.md`, migration `202_b_plan`, IPC types in `common/ipc-intelligence.ts`, handlers in `intelligence/register.ts`.
- Tests: `plan/__tests__/plan.test.ts` (15): the sample input (3 courses, 10 h/week, research lab by spring) produces a valid plan in the DB (milestones, items inside the window, hours within the weekly limit, sorted, contiguous positions); the model sees today, courses and hours; retry once on an invalid date; two invalid replies give a clear error and change nothing; no onboarding, past target, offline and daily cap messages; bad goal_id rejected; onboarding validation and goal archiving; check off, edit, add, delete, reorder; regenerate keeps completed, edited and user items; single-item regenerate; snapshot and "Today's goal".
- Verified: typecheck, 165 tests, lint (workaround), smoke OK (migration 202 runs).
- Not verified: plan quality from the real Gemini (mock only).

## B5b details
- Files: `voice/{elevenlabs-tts,elevenlabs-stt,providers}.ts`, wiring in `intelligence/register.ts` (`ws` socket factory, `fetch`), `.env.example` comments.
- Tests: `voice/__tests__/elevenlabs.test.ts` (15): TTS URL/headers/body and sample alignment, abort on barge-in cancels the stream and drops late chunks, errors never contain the key; STT URL/header/audio message shape, transcripts and partials, reconnect x3 then a single failure, attempts counted when the socket cannot even be created, counter reset after a good session, connect timeout, fatal auth error without retry or key leak, transient errors reconnect while quiet-audio notices do not, manual commit fallback, close stops reconnects; provider selection (DEMO_MODE, no key, no voice id, settings).
- Verified: typecheck, 180 tests, lint (workaround), smoke OK.
- **Not verified: any real ElevenLabs call** (no key in this environment). The protocol follows the docs fetched on 2026-10-24: https://elevenlabs.io/docs/api-reference/text-to-speech/stream and .../speech-to-text/v-1-speech-to-text-realtime. Worth a 5-minute hand test with a real key: set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `desktop/.env`, run `npm run dev`, turn voice on, and send mic frames through `voice-audio-in` once Thu's capture exists.
- For Thu: TTS audio arrives on `voice-audio-out` as `audio/pcm;rate=16000` (16-bit LE mono); schedule chunks as they come and drop them on `voice-stop-playback`.

## B7 details
- Files: `desktop/src/main/papers/{types,arxiv,semantic-scholar,verify,demo-catalog,store,service,index}.ts`, `llm/mock-ideas.ts`, prompt `ideas.v1.md`, migration `203_b_papers`, IPC in `ipc-intelligence.ts` / `register.ts`.
- Tests: `papers/__tests__/papers.test.ts` (21, HTTP and model faked, no network): Atom parsing (multi-line titles, entities, ids), request URL and 3 s spacing even for overlapping callers, HTTP/network failures; Semantic Scholar mapping, API key header, 429 retry once; verifier: arXiv then Semantic Scholar then drop, similar-but-different titles rejected, unavailable vs not found, caching (memory + SQLite, negative expiry), sequential checks with a cap of 5 and dedupe; ideas: unverifiable papers dropped with the verified link and API metadata, 5-paper cap, "could not verify" state, goal type rules, bad model output, and the DEMO_MODE offline path (5 verified, 1 invented dropped, no network); adding papers: row + metadata + "Read:" plan item, dedupe by link, validation, list/status/delete cleanup.
- Verified: typecheck, tests, lint (workaround).
- Not verified: the live arXiv and Semantic Scholar APIs (no network calls were made in tests). The request and Atom format match the arXiv API user manual (https://info.arxiv.org/help/api/user-manual.html, read 2026-10-24); the Semantic Scholar response shape is from my knowledge of their Graph API, not re-read. Worth one real request by hand: `curl 'https://export.arxiv.org/api/query?search_query=ti:%22attention%20is%20all%20you%20need%22&max_results=5'`.

## B8 details
- Files: `desktop/src/main/reading/{extract,chunk,bm25,store,service,arxiv-fetch,index}.ts`, `llm/mock-reading.ts`, prompt `reading.v1.md`, migration `204_b_paper_answers` (also `paper_meta.local_path`), IPC in `ipc-intelligence.ts` / `register.ts` (file picker, `paper-focus`, voice route), fixture `reading/__tests__/fixtures/sample-paper.pdf`.
- Tests: `reading/__tests__/reading.test.ts` (26) on the committed PDF, no network: line extraction with pages and font sizes; section split (11 sections, no chunk crosses a section); heading detection incl. false positives; unreadable PDF errors; BM25 ranking and rarity-weighted coverage; arXiv id parsing; import (real title, re-import updates the same paper); a selected paragraph + "what does this mean?" cites `3.2 Procedure` (page 1); keyword questions cite `4 Results` / `3.1 Participants`; an off-topic question is labeled general knowledge with no citations; a model claiming "grounded" without valid citations is downgraded; only retrieved excerpts reach the model (none for off-topic); check-my-understanding; show-me-where makes no model call and reports "not found"; every question saved with its input mode; arXiv import with faked HTTP (download, save, metadata, make-readable in place, friendly failures). Plus the router's free-speech path in `voice.test.ts`.
- Verified: typecheck, 228 tests, lint (workaround). pdf.js also verified by hand inside Electron 44.7's Node (`ELECTRON_RUN_AS_NODE=1 electron probe.mjs`: 2 pages, 47 text items).
- Not verified: the native file picker, a real arXiv download, answer quality from real Gemini.
