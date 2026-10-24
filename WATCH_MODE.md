# Watch mode: a Wolfie that understands what you're doing (design v1)

**Status:** proposed by Tuan on 2026-10-24. Tuan chose the hybrid design below. **Thu: please review before building UI for it.** Reply under "Thu's review" at the bottom, or in `COORDINATION.md`.

This extends `SPEC.md` and changes two of its rules (see "Spec changes"). It replaces nothing that already works: escalation, the hint ladder, NudgeQueue, paper reading, and the monitor all stay, and watch mode feeds them.

---

## 1. Why
Today Wolfie only knows *which* app or site you're on, plus behavior signals (wrong-answer loops, rapid switching, idle time). It sees the content only after you ask for help. By the time a student is stuck enough to ask, many have already given up and pasted the problem into ChatGPT.

Watch mode lets Wolfie follow the actual content of the study session, so it can:
- notice the specific thing you're stuck on and offer help *before* you shut down;
- answer questions that depend on everything you've looked at, without you restating it.

Example: *"I see Prof. Niranjan implements a transformer in his paper. Can you remind me how he changed it a little, and why it still works even though it isn't the conventional way?"* Wolfie already knows which paper, which section, and what the YouTube video you just watched explained.

## 2. Two scenarios, two behaviors
| | **Learning mode** | **Homework mode** |
|---|---|---|
| When | Reading papers, slides, docs; watching lectures or YouTube | Problem sets, quizzes, coding exercises |
| Wolfie notices | What you're reading or watching, and where you slow down or re-read | Long pauses; your visible answer is wrong (Wolfie checks it) |
| Wolfie does | **Answers directly**, grounded in the session's sources, with citations ("paper §3.2", "video at 4:10") | **Nudges, then the hint ladder** (5 levels, existing). Never the final answer. Assessment mode still applies |
| How the mode is set | The watcher classifies the screen | The same; the student can switch it at any time |

## 3. Architecture (hybrid)
```
            every ~8 s while Watch mode is on, in a session, not paused, not excluded
 screen frame (active window, ≤1024 px JPEG) ─┐
 PageSummary (extension)                      ├─► WATCHER  ── gemini-3.6-flash (generateContent, JSON)
 app / title / URL                            ─┘     │
                                                     ▼
                           SESSION MEMORY (local, in memory; summaries only)
                             • sources: papers (full text via the paper pipeline),
                               videos (title + captions), pages, problems
                             • timeline: what you looked at, for how long
                             • rolling summary, compacted as it grows
                                │                         │
          struggle signals ─────┘                         └──► CONVERSATION
          (model_stuck, answer_seen_wrong)                     • voice: gemini-3.8-live session, opened on demand,
                │                                                seeded with memory + relevant chunks + current frame;
                ▼                                                streams mic + ≤1 fps frames while open
          existing stuckBus → escalation → NudgeQueue → overlay  • text: gemini-3.6-flash with the same context
```

### 3.1 Watcher (backend, Tuan)
- **Input:** a scaled-down capture of the active window (`desktopCapturer`), the latest `PageSummary`, and app, title and URL.
- **Skips when** nothing changed: a perceptual hash of the frame plus the same URL means no call.
- **Model:** `gemini-3.6-flash` (the existing LLM client: timeout, retry, daily cap, Zod).
- **Output (JSON):**
  - `activity`: `reading_paper | watching_video | homework | coding | other`
  - `mode`: `learning | homework`
  - `subject`
  - `source_refs`: paper and section, video and timestamp
  - `stuck`: `{ likely, reason, confidence }`
  - `answer_check`: `{ visible_answer, looks_correct, issue }`
- **Interval:** setting `watch.interval_seconds`, default 8, minimum 5.

### 3.2 Session memory (backend, Tuan)
- Lives in memory for the session. Only text summaries are kept, never frames.
- At session end, a short summary is saved to the `events` table (`watch.session_summary`) for history; the rest is discarded.
- **Source enrichment, so answers are not limited to what was on screen:**
  - **PDF in Chrome** (the tab URL ends in `.pdf`, or arXiv): auto-import through the existing paper pipeline (B8) after a one-time "Let Wolfie read papers you open?" consent. Answers then use the whole paper, with section references.
  - **YouTube:** the extension reads the title, channel, and captions of the open video. ⚠️ Feasibility still to verify (see §8).
  - **Local PDF in Preview:** Wolfie sees the filename in the window title and offers "Add this paper to Wolfie?".

### 3.3 Conversation (backend Tuan, UI Thu)
- **Voice:** a `gemini-3.8-live` session opens when the student talks (talk button, `Alt+Shift+V`, or answering a Wolfie pop-up) and closes after about 60 s of silence.
  - Each session is seeded with: the session memory, the paper chunks relevant to the question (retrieved locally), and the current frame.
  - While open, it streams the mic (16 kHz PCM) and ≤1 fps frames.
  - Audio comes back as 24 kHz PCM, and its transcription is shown as text.
  - This replaces ElevenLabs for conversations. ElevenLabs stays as the fallback.
- **Text:** the same context goes to `gemini-3.6-flash`. This also works without voice.
- **Learning mode** answers directly. **Homework mode** routes to the existing hint ladder and follow-up rules.

### 3.4 Pop-ups (reuse)
- The watcher's judgment becomes two new struggle signal types:
  - `model_stuck`: weak or strong, depending on confidence;
  - `answer_seen_wrong`: strong.
- They go into the existing `stuckBus`, so the existing escalation engine (cooldowns, decline, "I'm good", 5 s input guard) and NudgeQueue decide whether and when Wolfie pops up. No new pop-up logic.

## 4. Privacy and consent (changes SPEC §3 and §7)
- **Watch mode is off by default.** Turning it on shows a consent screen: what is captured, that frames go to Google's Gemini API, that frames are never stored, and how to stop.
- While watching, the mascot shows a visible **watching indicator**. Pause stops capture immediately.
- **Never captured:** excluded domains (banking, email, health, plus the user's list), incognito windows, a new **excluded apps** list (e.g. Messages, Mail, 1Password), and anything outside a session.
- "Clear session memory" is available at any time. Frames are discarded right after each call, whatever the image-storage setting says.

## 5. Limits and cost (checked against Google's docs, 2026-10-24)
- **Live API:**
  - frames as JPEG/PNG, **max 1 fps**;
  - **audio+video sessions are limited to 2 min** (audio-only: 15 min), which is why the Live session is opened per conversation and not kept running;
  - a 128k context window for native-audio models;
  - audio-only output, with transcription for text.
- **Price, paid tier** (a free tier exists):
  - Live video input ≈ $0.002/min, audio input ≈ $0.005/min, audio output ≈ $0.018/min.
  - A 1-hour session with the watcher at 8 s intervals is about 450 flash calls, before skips. Each call stays small (one frame plus a summary).
  - The daily cap (`api.call_limit_per_day`) applies to watcher calls. Its default will be raised, and watcher calls get their own sub-cap.
- **Models available to our key:** `gemini-3.8-live` (recommended), `gemini-3.8-live-extended-thinking`, `gemini-3.1-flash-live-preview` (legacy), and the 2.5 native-audio models.

## 6. Reused vs new
- **Reused:**
  - `desktopCapturer` capture (B3b);
  - PageSummary and the extension;
  - the paper pipeline (B8);
  - the LLM client (B1);
  - stuckBus, escalation, the hint ladder (B2/B3), and NudgeQueue;
  - the voice router and local intents (B5a);
  - excluded domains, pause, sessions (A).
- **New backend (Tuan):**
  - `watch/` (watcher, session memory, enrichment)
  - a Live client (`gemini-3.8-live`)
  - extension YouTube caption reader
  - new signal types
  - new settings: `watch.enabled`, `watch.interval_seconds`, `watch.excluded_apps`, `watch.auto_import_papers`
  - IPC for the UI
- **New UI (Thu):** see §7.

## 7. Work split
| # | What | Owner |
|---|---|---|
| W1 | Watcher + session memory + Watch-mode settings and IPC (`watch-get/set`, `watch-memory-get`, `watch-memory-clear`, event `watch-state`) | Tuan |
| W2 | Learning mode: auto-import PDFs, YouTube captions (if feasible), grounded text Q&A over session memory (`watch-ask`) | Tuan |
| W3 | Live voice conversation (`gemini-3.8-live`): seeding, mic in, audio out (24 kHz), transcription, ElevenLabs fallback | Tuan |
| W4 | Homework mode: answer checking → `answer_seen_wrong` / `model_stuck` signals → existing escalation and ladder | Tuan |
| U1 | Watch-mode consent screen + toggle + excluded apps in Settings; watching indicator on the mascot | Thu |
| U2 | Wolfie chat panel in the overlay: text input, talk button, streamed transcript, citations. **Turn the existing `HintConversation` into this**, using `watch-ask` and the real ladder bubbles instead of mock data | Thu |
| U3 | Audio playback that handles 24 kHz (Live) and 16 kHz (ElevenLabs) PCM, plus mic capture to `voice-audio-in` | Thu |
| W5 (optional) | Photon (iMessage/WhatsApp/Telegram): phone nudges and asking Wolfie from your phone | later |

**Order:** W1 → W2 (+U2 text) → W4 → W3 (+U3) → W5. The backend work can again be split across two agents: W1+W2, and W3+W4.

## 8. To verify before or while building
- **YouTube captions** from a content script (caption tracks in the page's player data). If blocked, fall back to title, description, and frames.
- **Live session extension** (context compression and session resumption). We avoid relying on it by keeping sessions short.
- Live latency with seeded context, and the Live API's rate limits (not listed on the pricing page).
- The watcher's false-positive rate for "stuck" and "answer wrong". Tune with the demo pages before turning it on by default anywhere.

## 9. Spec changes (to log in DECISIONS.md once Thu agrees)
1. **Images leave the device continuously** while Watch mode is on, with opt-in consent. The spec only allowed it on a hint request.
2. **Learning mode answers directly.** The hint ladder is for homework only.
3. **New contract pieces:** signal types `model_stuck` and `answer_seen_wrong` (shared schema), the `watch.*` settings, the `watch-*` IPC.

Still not in scope: Wolfie acting on your behalf (clicking, typing, opening things on its own). Suggesting a link that the student clicks is fine.

## Thu's review
_(Thu: agree / concerns / changes)_
