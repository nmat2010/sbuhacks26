# Report: Watch mode W1 + W2 build (2026-10-24)

**By:** Claude (Opus), for Tuan.
**Branch:** `tuan/watch-mode`, from `main` @ 39c56e4.
**Design:** `WATCH_MODE.md`.
**Review:** Opus 5.5 (medium effort) did 3 rounds: 15 findings, then 4 more plus 3 minor ones, then 5 minor. All are fixed except one harmless timer note (see Known limitations).

## What was built
- **Watcher** (`desktop/src/main/watch/watcher.ts`)
  - Every `watch.interval_seconds` (default 8 s) during a session, with Watch mode on and consented, not paused, it takes a 1024×640 JPEG of the active window only. It sends that, plus the page summary and the app/title/URL, to `gemini-3.6-flash` and gets a JSON observation back: activity, mode, subject, source and locator, summary, key points, stuck judgment, and an answer check.
  - Unchanged screens are skipped, with a re-check every 60 s so long pauses still register.
  - Stuck and wrong-answer judgments become `model_stuck` / `answer_seen_wrong` signals for the existing escalation engine.
  - A generation counter discards results from before a stop/reset, and a per-start token keeps it to a single timer loop.
- **Session memory** (`watch/memory.ts`)
  - Text only: sources (paper, video, page) with key points, locators and time, plus a recent timeline.
  - Cleared at session end; only counts go to the event log (`watch.session_summary`).
- **Answers** (`watch/answer.ts`)
  - Questions are answered from the session: paper passages (BM25 over imported papers), the YouTube video attached as Gemini `fileData` (Gemini watches it), and the current frame.
  - Learning mode answers directly, with checked citations. Homework mode, or a graded session/assessment domain, gives a hint only.
  - A video attempt gets one 40 s try, then the question is retried without the video.
- **Controller** (`watch/controller.ts`)
  - Consent screen state (`watch-consent`) and on/off (`watch-set`); turning it on fails without consent.
  - Starts and stops with session, pause and settings. Paper auto-import is opt-in (`watch.auto_import_papers`, off by default).
- **Help flow** (`hints/flow.ts`), the change Tuan asked for. With Watch mode on:
  - **Learning mode:** clicking Wolfie, accepting an offer, or saying "I'm stuck" gives a **direct explanation from the session**, with buttons Explain more simply / I got it / I'm good. Voice follow-ups stay in the same explanation and carry the previous answer.
  - **Homework mode:** the hint ladder runs with `sessionContext` plus the current frame. There's no per-session screenshot prompt; the frame is never stored (`imageNoStore`).
- **Extension**
  - Sends `contentUrl` only for PDF, arXiv and YouTube pages (normalised: m./www./youtu.be, shorts, live).
  - Sends `ext.tab_none` when the active tab is excluded, incognito, or not a web page, or when Chrome loses focus.
- **Desktop privacy guards**
  - The foreground info trusts a tab report only if it is under 45 s old and the tab title equals the window title (plus an optional " - profile" suffix). It fails closed without titles.
  - `tab_none` clears after a 3 s grace, and not while Wolfie itself is in front.
- **Budget:** watcher calls use their own daily cap (`watch.calls_per_day`, default 2000, separate counter rows). Questions use the main cap with a 45 s timeout.
- **IPC** (`common/ipc-intelligence.ts`):
  - calls: `watch-get`, `watch-set`, `watch-consent`, `watch-memory-get`, `watch-memory-clear`, `watch-ask`;
  - events: `watch-state` (for the watching indicator), `watch-answer`.
  - Spoken Watch answers also appear as a bubble until Thu's chat panel exists.

## Verified
- `npm run typecheck`: clean.
- `npm test`: 605 passed (48 shared, 481 desktop, 76 extension).
- `npm run lint`: 0 errors.
- `npm run build:extension`: OK.
- `npm run smoke`: OK.
- **Real Gemini (`gemini-3.6-flash`)**, through the app's own client, prompts and schemas:
  - **Watcher**, on a synthetic homework image (not the user's screen): it recognized the homework, read "x = 9" and flagged it wrong ("added 5 instead of subtracting") without revealing the answer, and judged the student stuck after a 150 s pause.
  - **Answer:** with a YouTube video attached, it answered from the video and cited a timestamp, in ~3.7 s. There was one transient 503 "high demand" from Google; the retry succeeded.
- **YouTube captions** can't be fetched directly (the timedtext endpoint needs a proof-of-origin token). Gemini's YouTube `fileData` works, so it is used instead.

## Not verified (needs Tuan at the machine)
- The full loop in the app on a real screen: watching, pop-ups, explanations, voice.
- The Chrome extension's new `tab_none` and `contentUrl` behavior in real Chrome, including incognito.
- That macOS Chrome window titles equal tab titles. If they carry another suffix format, browser pages will be skipped (fail closed) and the title rule needs adjusting.

## Known limitations
- **Browser pages need window titles on.** With `monitoring.capture_window_titles` off, Watch mode can't confirm which tab is in front, so it skips the browser by design. Non-browser apps are still watched, but window matching also needs titles. `watch-get` returns a `note` explaining this to the student.
- **After a page changes without a new tab report** (in-page navigation, an unread count changing the title), browser frames are skipped until the extension's next ~20 s heartbeat.
- **The delayed `tab_none` clear (3 s) isn't cancelled on quit.** It is harmless: it only clears the in-memory tracker (review note).
- **Safari and other browsers without the extension** are skipped (no tab report).
- **Papers behind a login** can't be imported; Wolfie still sees the visible page through frames.

## For Thu (UI, WATCH_MODE.md §7)
- **U1:** the consent screen (call `watch-consent`), a toggle (`watch-set {enabled}`), excluded apps, the auto-import checkbox, and a watching indicator driven by the `watch-state` event.
- **U2:** turn `HintConversation` into a chat panel: `watch-ask` for typed questions, the `watch-answer` event for spoken ones, citations shown.
- **U3:** audio playback and mic capture (unchanged from before).

## Next
- Merge `tuan/watch-mode` into `main` once Tuan has tried it.
- Then W4 (homework answer checking is mostly in place via `answer_seen_wrong`) and W3 (Live voice with `gemini-3.8-live`).
