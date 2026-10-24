# Next steps: who does what (draft from Tuan, 2026-10-24)

> **Update (later on 2026-10-24): direction change proposed, please read [`WATCH_MODE.md`](WATCH_MODE.md).**
> Tuan wants Wolfie to follow the *content* of a study session with Gemini, not just which app is open:
> - **Learning mode** answers questions about the paper or video directly, with citations.
> - **Homework mode** checks your answers and nudges with the hint ladder.
>
> It reuses everything already built. Thu's part:
> - U1: Watch-mode consent and toggle;
> - U2: turn `HintConversation` into a real chat panel;
> - U3: audio playback at 24 kHz and 16 kHz, and mic capture.
>
> Please review it before building more overlay or voice UI.
>
> **Web app: settled.** Thu has already built `web/` (88bdd1b), so Thu keeps it and section 2 below is closed. Tuan won't touch `web/`.
>
> **Still unwired on `main` (as of 1410a5c), from Tuan's first real run:**
> - **Dashboard:** History doesn't call `history-get`. Settings doesn't call `settings-get/set`, `status-get`, pairing, permissions, or data. Onboarding has a commented-out call to `save-onboarding-data`, which doesn't exist; the real channel is `plan-onboarding-save`.
> - **Overlay:** the mascot isn't draggable yet (SPEC Phase 0/11). There's no talk button, mic capture, or audio playback. A warning bubble stays after you leave the site. `HintConversation` has a commented-out call to `request-hint`, which doesn't exist: hint steps arrive as normal bubbles, or will come through `watch-ask` (`WATCH_MODE.md`).
> - **Settings needs per-site on/off for warnings** (e.g. YouTube as a learning source). Use `settings-set('monitored.distractions', [...])` and toggle the entry's `enabled`.
> - **Already fixed by Tuan** on `tuan/fix-self-window`, not yet merged: the overlay now floats over full-screen apps and on all desktops; the bubble fits in the window and its buttons take clicks; clicking Wolfie no longer counts as an app switch.

Thu, this is a proposal, not a decision. I don't know what you've done locally since "dashboard UI" (5a1f2b9), so **please fill in section 1 first**. Then we can split the rest without redoing each other's work. Until you reply, I'll stay out of `desktop/src/renderer/**` and `web/**`. I'll only do real-hardware testing and fix bugs in the backend folders.

## 0. What's on `main` now
- Tuan's whole track is built: sessions and monitor, the extension and its server, warnings, stuck signals and escalation, the hint service and ladder, plan, papers and reading, streak engine, history, settings and data, the LAN sync server, and voice providers. 525 tests pass, and `npm run smoke` passes.
- Your Phase 1, hover menu, mascot, and dashboard shells are merged with it. I wired Today to the real session and streak channels.
- Not yet tested on real hardware or with real API keys. That's my next job (see `TESTING.md`, "Real-hardware pass").

**After you pull:**
- Run `npm install`; Node 22 or newer is needed, and there's no rebuild step.
- Please keep `"type": "module"` in `desktop/package.json`. The main bundle is ESM and the preload is `preload.cjs`. Switching to CommonJS stops the app from starting.
- Every IPC channel is typed: core channels in `desktop/src/common/ipc.ts`, Tuan's sensing channels in `ipc-sensing.ts`, Tuan's intelligence channels in `ipc-intelligence.ts`. `COORDINATION.md`, sections "Agent A" and "Agent B", explains each channel.

## 1. Thu: what have you already done or started? (please fill in)
| Area | Not started / In progress / Done | Notes |
|---|---|---|
| Overlay: hint ladder buttons + nudge responses |  |  |
| Overlay: voice (mic/playback) |  |  |
| Dashboard: Goals & Plan |  |  |
| Dashboard: Papers + reading view |  |  |
| Dashboard: History |  |  |
| Dashboard: Settings (incl. pairing, permissions, data) |  |  |
| First-run consent / permissions screen |  |  |
| Streak UI + Wolfie reactions |  |  |
| Web app (`web/`) |  |  |

## 2. Proposed split
**Proposal: Tuan takes the web app (`web/`, SPEC Phases 10 client, 11, 12). Thu keeps the desktop UI (overlay and dashboard).**
- **Why:** Tuan's track is finished and yours is the largest. The web app is built mostly against contracts Tuan already wrote: the sync handshake, the shared escalation engine, and the fixtures. The desktop screens are yours already.
- **If you've already started the web app,** say so in section 1 and we'll split differently. For example, you keep the notebook and Wolfie widget, and Tuan does the sync client, canvas signals, and camera.

Thu, please tick one: _(closed: Thu built `web/` and keeps it)_
- [ ] Yes, Tuan takes the web app.
- [ ] No, Thu keeps the web app; Tuan takes these desktop screens instead: ____
- [ ] Other: ____

## 3. Thu's desktop UI work, and the channels to call
Everything below already exists in main. You only need to call it.

**Overlay**
- **Bubble responses:** send `nudge-response {id, action, via}` for every bubble.
  - Button actions: `accept_hint`, `decline`, `im_good`, `another_hint`, `got_it`, `show_answer`, and for warnings `taking_break`, `need_for_task`, `ignore_session`.
  - Send `action: 'dismissed'` when the student closes a bubble and `'timeout'` when it fades. The escalation and the hint ladder depend on these.
- **Hint ladder:** each step arrives as a normal `nudge-show` bubble with its buttons. "Show the answer" is left out in assessment mode by the backend, so just render the buttons you get.
- **Voice (needs your decision, see `COORDINATION.md`):** proposal is that the desktop uses Tuan's providers.
  - Mic PCM (16 kHz, 16-bit mono) goes to `voice-audio-in`.
  - Playback audio arrives on `voice-audio-out`; stop playing on `voice-stop-playback`.
  - Also available: `voice-mic` (show the green dot), `voice-trouble` (message for the bubble), and `voice-utterance` (typed input for the test panel).
  - Web Speech would stay for the web app only.
- **Already wired:** mascot click (`mascot-click`), pause/resume (`nudge-pause`/`nudge-resume`), sprite state (`overlay-state`).

**Dashboard**
| Screen | Channels |
|---|---|
| Today | `session-get/start/stop`, `streak-get` (done); add the events `session-changed`, `streak-changed`, and today's items from `plan-get`; assessment toggle `session-set-assessment` |
| Goals & Plan | `plan-onboarding-get/save`, `plan-generate`, `plan-get`, `plan-item-add/update/delete`, `plan-reorder`, `plan-item-regenerate` |
| Papers + reading | `ideas-suggest`, `paper-add`, `papers-list`, `paper-set-status`, `paper-delete`, `paper-import-pdf`, `paper-import-arxiv`, `paper-make-readable`, `paper-content`, `paper-ask`, `paper-questions`, `paper-focus`; event `paper-answer` |
| History | `history-get` (per-session time by category, nudges, deepest escalation and hint levels) |
| Settings | `settings-get/set`, event `settings-changed`, `status-get` |
| Pairing (in Settings) | extension: `extension-pairing-get/regenerate`, event `extension-status`; iPad: `sync-info-get`, `sync-regenerate-code`, `sync-unpair`, event `sync-changed` |
| Permissions / first run | `permissions-get`, `permissions-request` |
| Data | `data-export`, `data-clear` (needs a confirm), event `data-cleared` |

**Copy review:** placeholder messages are in `desktop/src/main/rules/messages.ts` (warnings) and `desktop/src/main/streak/messages.ts` (streak reactions). Edit them directly.

**Still waiting on your acknowledgement:** the Phase 0 contract-change proposal and the voice decision, both in `COORDINATION.md`.

## 4. Together, at the end (M5)
All demo scenarios offline with `DEMO_MODE=1`, a full test pass, a privacy review (SPEC §7), and the pitch walkthrough.

## How to avoid overlap
- One owner per folder: Thu owns `desktop/src/renderer/**`; `web/**` goes to whoever section 2 says.
- If you need a backend change, write it under your section in `COORDINATION.md` or message Tuan. Please don't edit `desktop/src/main/**`. Tuan will make the change.
- Pull `main` before you start each session and push small commits often.
