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

---

## Update: first real run, and the fix (65bf79f + follow-up)
- **What Tuan saw:** `watch-memory-get` was empty, and clicking Wolfie showed "Let me take a look..." followed by "No problem, I won't look".
- **Cause, from the DB:**
  - There were zero `watch.observed` events. System Events returns empty window titles for Chrome (and often for VS Code), so the title-based identity check skipped every window.
  - The "stuck" bubbles were the mascot-click help flow, falling back to the old screenshot prompt. No struggle signal fired.
- **Fix:**
  - **Front window:** a native helper (`desktop/native/front-window.swift`, a universal binary, rebuilt with `npm run build:native`) gives the front window's id, title, and whether the app handles https links. The watcher captures exactly that window id.
  - **Chromium browsers** (Chrome, Brave, Edge) are asked through Automation: incognito windows and excluded sites are skipped.
    - The browser's tab title must match the window title (unread counts, the 🔊 marker and a profile suffix are tolerated).
    - After capturing, the helper runs again, and the frame is dropped if the window or title changed.
    - The browser's answer is cached per window id + title for 60 s.
  - **Unknown browsers** (any app that opens https links) and Safari/Firefox are skipped unless the extension's tab report matches.
  - **"Really working" layer:**
    - "away" after 10 min without input, except while watching a video;
    - stuck signals only for study activities;
    - the engine holds its level (no new offers) while the student isn't engaged; manual help is unaffected.
  - **Status:** `watch-get` returns a `note` for every skip reason.
- **Reviews:** two more Opus passes; their findings are fixed: window/probe binding, unknown browsers, lectures counted as "away", offers orphaned by an engagement flip, the packaged helper path (`extraResources`), and probe caching.
- **Verified:**
  - 621 tests pass; typecheck, lint and smoke are clean.
  - Live on Tuan's Mac: the helper returned the real Chrome window (id 2083, matching Electron's capture id), the Chrome probe returned `mode: normal`, and the title match passed on "(1) Facebook 🔊" vs "(1) Facebook".
- **To check on the next run:**
  - macOS asks "Electron wants to control Google Chrome": choose OK.
  - Ask for Automation on the consent screen (Thu, U1), so the prompt doesn't appear mid-session.

## Update: chat panel wired (93a8205)
- **Problem:** Thu's `HintConversation` was mock data. It sat inside the click-through overlay, so it couldn't be clicked or typed in, and a click on Wolfie also started the bubble help flow.
- **Fix:**
  - A click opens or closes the chat only.
  - "Help me with this" runs the help flow, and its steps and buttons appear in the chat.
  - Typed messages go to `chat-send`: a follow-up to the open hint or explanation, otherwise an answer from the session or general knowledge.
  - "What I see" comes from `watch-get`.
  - The overlay takes the mouse while the chat is open, and the CSS fits the 360×520 window.
- **Verified:**
  - `WOLFIE_SMOKE_SHOT` ran the real app in demo mode: it opened the chat, sent a question and got the answer.
  - The captured picture shows the panel above the mascot.
  - 621 tests pass; typecheck and lint are clean.
- **Not verified:** the "Help me with this" flow inside the chat on Tuan's screen. Without Watch mode it opens the macOS screenshot prompt, so the automated run skipped it.

## Update: second real run (chat scrolling, paper import)
- **Chat "can't scroll":**
  - Reproduced in the real app with Electron mouse-wheel input. Wheel scrolling worked, but the message area was only 135 px tall, so long answers were unreadable.
  - Fix: the overlay window grows to 780 px (capped by the screen) while the chat is open, with the same width and the mascot staying put (new `overlay-expand` IPC). "What I see" is one line, and new messages scroll to their first line.
  - Re-measured: the message area is now 414 px and wheel scrolling moves it.
- **Paper never imported:** the ACL PDF showed `paperId: null`, with no import or failure event.
  - The import code itself works: `importPdfUrl('https://aclanthology.org/D17-1119.pdf')` succeeds in 0.5–0.7 s under both Node and Electron's runtime.
  - Bug fixed: the URL was marked "seen" before the auto-import check, so a paper opened while auto-import was off could never be imported that session.
  - Failures are now logged (`watch.paper_import_failed`, reason only) and retried after 3 min.
  - `watch-memory-get` shows `paperImport` per source.
- Tests: 623 pass.

## Update: "couldn't reach the AI" was Gemini's free-tier quota
- A test call with Tuan's key returned 429 RESOURCE_EXHAUSTED: "Generate content requests per day limit exceeded on Free Tier". That's `gemini-3.6-flash`, with a limit of **20 requests/day per project per model**, resetting at midnight Pacific.
- About 82 calls were made today, 69 of them by the watcher. Wolfie's own caps were not hit (13/200 and 69/2000).
- **Fix:**
  - A new `QUOTA` error code: a per-day 429 is not retried, and per-minute 429s stay retryable.
  - Answers and the paper Q&A say the quota is used up, and the watcher shows `limit_reached` with a quota note.
- **New option:** `GEMINI_WATCH_MODEL` gives the watcher its own model and quota pool. On this key today, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` and `gemini-flash-lite-latest` still respond, while `gemini-3.5-flash` is also at 20/day.
- **Recommendation:** turn on billing (Tier 1) for real use; the free tier can't support Watch mode.
- Tests: 625 pass.

## Update: third real run (chat scrolling root cause, "What I see" lag, homework offer)
- **Chat scrolling, root cause found:** `overlay.html` makes the whole page `-webkit-app-region: drag`. On macOS, real mouse moves and scrolls over a drag region are handled by the system as window dragging and never reach the page. Only the mascot was `no-drag`.
  - My earlier checks injected events inside Chromium, which skips that layer. A real macOS scroll event, posted with CGEvent over the chat, reproduced the bug: scrollTop stayed at 850.
  - Fix: the chat panel and speech bubbles are `no-drag`. Re-test with a real macOS scroll: 850 → 130.
  - Bubbles also get a 300 px scrollable maximum height. Long help answers (explanations, hint steps) open in the chat instead of a bubble; the short "Want a hint?" offer stays a bubble.
- **"What I see" lagged:** the chat only updated on watcher *state* changes.
  - Status is now emitted after every look.
  - A window or tab switch pokes the watcher to look right away (at most one look per 3 s).
  - The status carries `looking` / `lookingSince`, so the chat shows "Looking at <window>..." until a look about that window lands.
- **Homework: Wolfie didn't step in.** The signals did fire (`answer_seen_wrong` + `model_stuck` at 19:44:44), but escalation climbs glance → "?" → offer at 45 s per step, and it holds whenever the latest look isn't study work (the student checked VS Code). It reached level 1 only at 19:46:04.
  - Fix: `answer_seen_wrong` fast-tracks to the offer. It still waits 5 s after typing and respects decline, "I'm good", snooze and pause.
- Tests: 630 pass. Real-app smoke: chat round trip plus real OS scrolling.

## Update: wrong answers in other apps (copied problems, mixed-up concepts)
- **Reported:** a problem copied into Google Docs with a changed equation wasn't flagged, and the same gap would apply to a conceptual answer like "underfitting" described as overfitting.
- **Cause:**
  - Each look saw only the current screen and a one-line previous summary, never the original problem from the other tab.
  - Answers were checked only in "homework mode", and a Doc was usually classified as "writing".
- **Fix:**
  - **Prompt `watch-observe.v2`** (v1 kept): check any answer, step or explanation the student wrote, in any app, including conceptual answers (wrong concept = wrong) and whether a copied problem matches the original in the session notes. The issue sentence says what is off, never the answer.
  - Each look now gets `session_notes` (sources and key points, 1,500 characters).
  - `answer_seen_wrong` fires in any study activity (never while browsing) and carries the issue.
  - The offer reads "Hmm, something looks off: <issue>. Want a hint?"
  - A look is a single try with a 30 s timeout; it was 20 s with a retry, and lite models sometimes take 20 s+.
- **Verified on real `gemini-3.1-flash-lite` with synthetic Docs screenshots:**
  - "This definition describes overfitting rather than underfitting."
  - "The problem statement in the scratch work (2x + 5 = 31) does not match the original problem (2x + 5 = 13)."
  - One call took 22 s, which is why the timeout was raised.
- Tests: 632 pass.

## Update: no new nudge after "Not now"
- **Reported:** after declining the offer, a changed (still wrong) underfitting answer got no nudge.
- **Cause (spec 4c as built):** "Not now" gives 3 min with no offers, then target − 1 until 10 min after the decline, so even a strong signal stops at "?". In practice there are no offers for 10 minutes.
- **Fix, for wrong answers only:** a different wrong answer is offered help again, at full strength, once 1 minute has passed since "Not now".
  - The same answer is never flagged twice (the watcher dedupes).
  - Vague signals keep the 3 min quiet plus the 10 min weaker period.
  - "I'm good" still silences offers for the session.
- Tests: 635 pass.

- Follow-up: the bubble queue spaced help offers 3 min apart (default `nudge.cooldown_minutes.stuck`), which would have delayed the re-offer to ~3 min after the first offer. The default is now 1 min; the engine paces offers itself.

## Update: two wrong answers, the hint went to the other one
- **Reported:** a Doc with two wrong answers (an underfitting definition that describes overfitting, and an equation copied as `= 12` instead of `= 13`). The offer named the underfitting issue, but "give me a hint" helped with the equation.
- **Cause:** each look recorded one `answer_check`, and the hint ladder didn't know which problem the offer was about, so the model chose on its own.
- **Fix:**
  - **Prompt `watch-observe.v3`:** `answer_checks` has one entry per answered question (up to 4), each with its `question`.
  - **Watcher:** flags each new wrong answer and keeps `openIssues()` in screen order; an issue is dropped when a later look sees it corrected, or after 10 min unseen.
  - **Offer** lists all issues: "Hmm, 2 things look off: (1) …; (2) …. Want a hint? We'll start with the first."
  - **Hint flow:**
    - the ladder gets `HintContext.focus` (question plus what looks off) for the first open issue, and the hint prompt is told to help only with it;
    - a flagged wrong answer always gets hints, even in learning mode;
    - after "I got it", Wolfie offers hints for the next issue (`next_issue`).
- **Verified on real models with Tuan's exact Doc text:**
  - `gemini-3.1-flash-lite` returned both checks: "describes overfitting rather than underfitting"; "transcribed as 2x + 5 = 12 instead of 2x + 5 = 13".
  - The focused ladder on `gemini-3.5-flash-lite` addressed the definition: "Does it describe a model that is too detailed, or one that is too simple?"
- Tests: 640 pass.

## Update: thinking pause on an unanswered question
- **Reported:** while thinking about "what is overfitting?" (blank answer), no hint was offered.
  - Every look said `stuck: false`. The student was on it about 40 s.
  - Stuck without a wrong answer needs strong evidence (a model judgment after a long unchanged screen, 4 min idle, 12 min on one problem), then climbs over 90 s.
  - The "5 s" the student waited is only the typing guard.
- **Fix, a thinking pause:**
  - Prompt `watch-observe.v4` adds `unanswered_question`, the question the student is on with no answer yet.
  - When the latest look (≤3 min old) showed one and there has been no keyboard/mouse input for `watch.stall_seconds` (default 60, range 15–600), and none since that look, the watcher raises one `model_stuck` (strong, `stall: true`) per question. It uses input idle time, not pixels (a blinking caret changes pixels), and no extra model call.
  - The engine offers right away: "Taking a moment on "What is overfitting"? Want a hint to get started?"
  - The hint flow focuses on that question ("help them get started (no answer)"). Flagged wrong answers still come first.
- **Verified on real `gemini-3.1-flash-lite`:** a Doc with two wrong answers and a blank "what is overfitting?" returned both wrong checks plus `unanswered_question: "what is overfitting?"`.
- Tests: 645 pass.

## Update: chat history kept, and remembered
- **Reported:** closing and reopening the chat lost the conversation.
- **Fix:**
  - **Storage:** the conversation lives in the main process and in SQLite (migration `205_b_chat_messages`, newest 200 messages, `chat/log.ts`).
  - **What's recorded:**
    - questions from typing (`chat-send`) and voice, with their answers (label and citations);
    - help-flow steps and offers, including ones shown as bubbles while the chat was closed (the transient "Let me take a look..." is skipped);
    - the label of each button pressed;
    - only the newest step keeps active buttons.
  - **Panel:** loads `chat-history` and follows `chat-history-changed`; opens scrolled to the end; has a "Clear" button (`chat-clear`). "Help me with this" goes through `chat-help`, so it's recorded.
  - **Memory:** the last 6 turns go with each question (`conversation` in the watch-answer payload, plus a prompt rule on continuity), so Wolfie remembers what was said.
  - **Privacy:** local only, and included in "Clear all data" (`DATA_TABLES`).
- **Verified:** two real app runs on the same data folder. Run 1 opened with the greeting and asked 5 questions; run 2 opened the chat with all 10 messages. 651 tests pass.

## Update: suggesting new study material
- **Reported:** asked "what other sources should I learn to understand his work?" and "give me a source on YouTube that can teach me that", Wolfie only repeated the session's own video and paper.
- **Search grounding is not an option on this key.**
  - Gemini's Google Search tool returns 429 on every Gemini 3 model on the free tier, with or without a JSON schema. Plain calls work.
  - The 2.5 models are retired for new keys.
  - The YouTube Data API rejects AI Studio keys (it needs OAuth).
- **Fix: the model suggests, the app checks.**
  - **Prompt `watch-answer.v2`:**
    - adds `resources`: 2–4 items, only when the student asks for new material;
    - a video is a YouTube search phrase, never a URL; a link is given only when the model is sure of it;
    - suggestions are matched to the session (for a paper: the background it builds on) and never repeat the session's sources;
    - "that", "it" and "the second one" refer to the conversation first.
  - **`watch/resources.ts`:**
    - **Videos:** the top real result from YouTube's public search page (`ytInitialData`). Live streams are skipped, as are videos already in the session or already suggested.
    - **Links:** fetched to check that they load; a site's bare home page doesn't count.
    - **Fallback:** anything unchecked becomes a YouTube or Google search link, so no link is made up. Only http(s) links are allowed; there's a 6 s timeout per lookup.
  - **`answer.ts`:**
    - recognizes material requests (`asksForMaterial`);
    - for those, doesn't attach the watched video (it pulled answers back to that video) and sets `asks_for_new_material`;
    - resolves the resources; if the lookup fails, the answer still arrives without them.
  - **Chat:** resources show as clickable cards (title, why it helps, channel and length or site) and open in the browser (`open-link`, http(s) only). They're kept in the chat history and included in the recent turns, so "tell me more about the second one" works. Voice answers list the titles in the bubble.
- **Verified on real `gemini-3.5-flash-lite` with Tuan's questions:**
  - **"What should I learn to understand his work?"** Three steps (domain adaptation, then factor analysis/PCA, then CRFs), with a StatQuest PCA video and Google searches for a domain-adaptation survey and a CRF tutorial.
  - **"Teach me that"** (after an answer listing logistic regression, SVMs, CRFs and factor analysis):
    - before the fix: drifted to NLP basics;
    - after: StatQuest Logistic Regression, StatQuest SVM, and Ben Lambert's Factor Analysis (2.5 s).
  - **"Tell me more about the second one":** explained the suggested PCA video.
  - **Real app (demo model):** the card showed a real Edureka video.
- **Note:** the smoke run used the real profile and added 2 test messages to Tuan's chat; they were deleted. Smoke runs should set `WOLFIE_USER_DATA`.
- **Optional later:** with billing on, Gemini's Google Search tool could replace the YouTube page lookup.
- Tests: 662 pass (48 + 538 + 76). Typecheck and lint are clean (only existing warnings).

## Update: longer memory, page-bound issues, logging for gaps in looks
- **Reported:**
  1. While watching the suggested PCA video, Wolfie didn't recognize it.
  2. `watch-memory-get` stopped at 10 sources and 20 recent looks.
  3. "Help me with this" gave a hint for an equation Tuan had already deleted.
- **(2) Memory limits.** The view showed 20 of the 60 stored looks, and 60 looks at ~10 s is only about 10 minutes. The bigger limit was what reaches the model: 8 sources and the last 10 looks.
  - **Stored:** 60 sources and 720 looks (about 2 h).
  - **Prompt timeline:** back-to-back looks at one source are merged into one line ("60 min ago until 30 min ago: …"), up to 40 lines, so a whole session fits instead of the last ~2 minutes. Up to 15 sources go in.
  - **Budgets:** answers 9000 chars (was 5000); hint context 8000 (was 6000). The watcher's own notes stay at 1500.
  - **View:** `watch-memory-get` returns 60 recent looks.
- **(3) Deleted question.**
  - **Cause:** an issue stayed open for 10 min unless seen corrected; deleting it didn't count, and the issue wasn't tied to a page.
  - **Fix:** each issue remembers its page (memory source key).
    - `openIssues()` returns only issues on the page the student is on now.
    - An issue is dropped after two looks at its page that no longer show that question (deleted, or moved on). Two looks, because one look can miss an answer.
- **(1) Video not recognized.** The DB shows no looks from 00:43:59 to 00:45:54, but skips and failed looks were never logged, so the cause can't be told.
  - Ruled out: the default browser is Chrome, and the helper (2 s) and AppleScript probe (2.5 s) have timeouts.
  - **Added logging:**
    - `watch.skipped {state, reason}`: once per reason until the next real look (no titles or apps);
    - `watch.failed {code}` for each failed look (e.g. RATE_LIMITED for a Gemini 503/429).
    - The next gap can be read from the `events` table.
- Tests: 666 pass (48 + 542 + 76). Typecheck and lint are clean (existing warnings only).

## Update: button presses recorded in the right order
- **Reported:** in the chat, "Another hint" and "I got it" appeared *after* Wolfie's reply to them. "Yes, give me a hint" and typed messages were in order.
- **Cause:** the nudge queue is an EventEmitter, so 'response' listeners run in the order they were registered.
  - The help flow subscribed before the chat log, and it shows the next ladder step synchronously (the ladder is generated up front), so that step was recorded before the press.
  - The first hint needs a Gemini call, so its press was recorded first; typed messages are saved before anything else happens.
- **Fix:** the chat wiring moved to `attachChatLog()` (chat/log.ts) and records presses with `prependListener`, so it runs first.
  - A test with a synchronous "flow" listener fails with the old order and passes now.
- Tests: 667 pass. Typecheck and lint are clean.

## Update: "I'm stuck" button beside Wolfie
- **Asked:** a button the student can press when stuck, instead of waiting for the 60 s thinking pause. Placement next to Wolfie, without merging Thu's sprite commit.
- **Built:**
  - **`StuckButton.tsx`:** its own component; one line in overlay `App.tsx`, to keep the later merge with Thu's App.tsx rewrite small.
    - A red "🆘 I'm stuck" pill at Wolfie's lower left, always visible while the chat is closed.
    - It shows "On it..." for 4 s after a press, and takes the mouse only while hovered.
  - **IPC `help-stuck`:**
    - records "I'm stuck" in the chat;
    - when Watch mode is on, `Watcher.stuckNow()` turns the latest look's unanswered question (≤3 min old) into a thinking pause immediately;
    - then starts the help flow (the same path as "Help me with this").
  - **What the flow does with it:**
    - hints focused on that question ("help them get started", no answer);
    - flagged wrong answers still come first;
    - a press while a ladder is open means "another hint";
    - in learning mode with nothing on screen to work on, it explains instead.
  - The timed pause won't offer again for a question already marked stuck.
- **Verified:** a real app run on a scratch profile (`WOLFIE_USER_DATA`, new `WOLFIE_SMOKE_STUCK`) showed the button and recorded the press in the chat. The full help steps need a running session, as with "Help me with this".
- Tests: 668 pass. Typecheck and lint are clean.

## Merge: Thu's sprite animation (origin/main 8fe107c) into tuan/watch-mode
- **Rule from Tuan:** take Thu's sprite work (the idle / talking / angry / sleeping / thinking states); keep Tuan's chat and everything about talking to Wolfie.
- **Taken from Thu:**
  - **Sprite code:** the sprite sheets (`assets/wolfie_*.png`, replacing `wolfie_mascot.png`), `SpriteAnimation.tsx`, the new `Mascot.tsx` with five animated states, and her `HoverMenu.tsx`.
  - **Also taken:** `MascotEffects.tsx` and `mascot-animations.css`, which nothing uses yet, and her `.gitignore` line. Her copies of the PNGs at the repo root come along too.
  - **In `App.tsx`:**
    - her sprite choices: stuck levels 1–2 → thinking, help → talking, distraction / AI tool → angry;
    - her hover-menu buttons that show each sprite for 3 s, plus "open chat".
  - **New `spriteFor()`:** maps main's `overlay-state` values to her sprites (glance and question-mark → thinking, alert → angry).
- **Kept from Tuan:**
  - `HintConversation.tsx/.css` (the persistent chat, no-drag, resource cards);
  - the `App.tsx` structure: the mascot click opens the chat; help answers open the chat; mouse handling; the "I'm stuck" button.
  - Left out from Thu's App.tsx:
    - dragging Wolfie inside the window (it conflicts with the chat, bubble and button layout);
    - the click that no longer opened the chat;
    - the chat rendered elsewhere on the page (a portal).
- **Fix to Thu's code:** removed an unused `CSSProperties` import in `MascotEffects.tsx`, which failed typecheck.
- **Verified:**
  - 668 tests pass; typecheck and lint are clean.
  - Real app on a scratch profile: Thu's idle sprite is drawn under the chat; the chat opens and answers; wheel scrolling moves the chat (925 → 325); "I'm stuck" reaches the chat.
  - A screenshot taken right at startup shows no sprite yet: her canvas draws once the sheet image loads.

## Update: thinking sprite, chat clears Wolfie's head, steady "I'm stuck" button
- **Thinking sprite while a reply is on its way:**
  - **`overlay/thinking.ts`:** counts overlapping waits (`beginThinking` / `whileThinking`); Wolfie stops thinking when the last one ends.
  - **Hint flow:** `busy` now goes through `setBusy()`, which reports `thinking(on)`. That covers the hint ladder (help, "I'm stuck", "Help me with this", accepted offers), "Show the answer", follow-ups and Watch-mode explanations.
    - Pre-built ladder steps ("Another hint") show instantly, so they don't think.
  - **Questions:** typed (`chat-send`) and voice answers are wrapped in `whileThinking`.
  - **Wiring:** the intelligence register broadcasts the `wolfie-thinking` event. The overlay shows the thinking sprite while it's on, ahead of bubbles and the base state.
  - Watch mode's background looks don't count.
- **Chat panel:** its bottom edge moved from 150 px to 190 px above the window's bottom, so Thu's 220 px sprite shows its whole head.
- **"I'm stuck" button:**
  - It shrank on hover because it was positioned against the mascot's box, which the hover menu reflows.
  - It's now pinned to the window at the same spot (`position: fixed`, left 54, bottom 52), on one line (`nowrap`, `max-content`).
- **Verified:**
  - Real app on a scratch profile:
    - the button is 87×28 before and while hovering (hover menu open);
    - the wolfie-thinking events were `[true, false]` around a chat answer;
    - the chat ends above Wolfie's cap;
    - wheel scrolling works.
  - Tests: 671 pass (new: flow thinking, overlapping waits). Typecheck and lint are clean.
- **Process note:** auto mode's permission check stopped responding mid-task; the work resumed after switching permission modes.
