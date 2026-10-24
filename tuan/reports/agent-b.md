# Report: Agent B (Intelligence)

**Branch:** `tuan/b-intelligence` (from `tuan/phase0-fixes` @ f4de16a)

## Status
| Package | State |
|---|---|
| B1 LLM client | done |
| B5a Voice core | done |
| B2 Escalation runtime | done |
| B3a Hint service | done |
| B3b Hint flow (M2) | done (M2-int pending A7) |
| B4 Handwriting + camera | not started |
| B6 Plan | not started |
| B5b ElevenLabs | not started |
| B7 Ideas + papers | not started |
| B8 Paper reading | not started |
| M2-int | pending (needs A7) |

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
