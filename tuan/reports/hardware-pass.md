# Report: Real-hardware pass (in progress, 2026-10-24)

## Keys
- The Gemini key and `gemini-3.6-flash` were checked against the API: they work.
- ElevenLabs works: TTS returned audio, and the `scribe_v2_realtime` socket opened.
- The ElevenLabs key is restricted and has no `voices_read` permission. Wolfie never needs it.

## Steps 4–5: session, monitor, extension (from Tuan's run 14:02–14:11)
Checked with the same `getHistory()` that `history-get` uses, against the dev DB, opened read-only.
- ✅ App switches are recorded (Code, Chrome, System Settings), so the Automation permission works.
- ✅ The extension paired; its id is stored in `pairing.extension_id`. Domains are reported: `www.youtube.com`, `chatgpt.com`.
- ✅ Warnings fired in the same second the domain arrived: YouTube → distraction, ChatGPT → ai_tool. That's within the 3 s target.
- ✅ Categories: work 514 s, ai_tool 3.8 s, distraction 8.6 s.
- ⚠️ **Window titles are empty for Code and Chrome.** System Events needs Accessibility (and Screen Recording) for the app that launched Wolfie. Grant them, then fully restart VS Code.
- ⚠️ **No `user_response` on the two warnings.** The overlay sends a response only on a button click. Closing the bubble with × or letting it time out sends nothing; that's Thu's overlay item in `NEXT_STEPS.md`. Still to confirm whether a button was actually clicked.
- 🐞 **Fixed: Wolfie's own window counted as an app switch.** Clicking the mascot or a bubble made "Electron / Wolfie Overlay" the front app. That made Chrome↔Wolfie look like rapid switching: `context_switch_loop` fired at 14:02:41 and escalated to "?". It also flipped the extension's "browser frontmost" flag. The fix (branch `tuan/fix-self-window`): the JXA query now returns the frontmost pid, and the monitor skips polls where that pid is Wolfie's main process (`process.pid`, confirmed on the real machine). It still records each poll, so time spent on Wolfie isn't mistaken for sleep. 2 new monitor tests, 1 new parse test; 527 tests pass.
- 🐞 **Fixed: `TESTING.md` smoke comment.** Its `->` arrows redirected output into files named `main` and `SQLite` when the line was pasted into a shell.

## Seen but not ours
- After Thu's "onboarding" push, `desktop/src/renderer/dashboard/App.tsx` has an unused `isOnboarded`. It fails typecheck and lint on `main`. Thu should fix it.

## Next
- Steps 6–12 of the TESTING.md hardware pass: demo pages, assessment mode, capture, voice, papers, streak, sleep/multi-monitor.

## Tuan's app-usage feedback (after the first real run)
Fixed on `tuan/fix-self-window`:
- **Overlay hidden behind full-screen apps and other desktops.** The window was "always on top" only at the normal level. It's now a macOS panel at the `floating` level, visible on all workspaces and over full-screen apps.
- **Bubble cut off.** The window was 300×300 with the mascot centered, so the bubble (140 px above the mascot, up to 300 px wide) ran out of the window. The window is now 360×520, bottom-right of the work area, and the mascot is bottom-aligned, so the bubble fits above it. The extra area stays transparent and click-through.
- **Bubble buttons didn't work.** The window ignores the mouse outside hover areas, and the bubble wasn't inside one, so clicks went through to the app behind. The bubble now takes the mouse while hovered. This is probably why the two warnings had no `user_response`.

Left for Thu (already in the plan, `NEXT_STEPS.md` section 3):
- **Drag the mascot** (SPEC Phase 0 accept, Phase 11). Not implemented: the mascot is `no-drag` and nothing moves the window.
- **Talk button, mic capture, and TTS playback.** The backend produces audio on `voice-audio-out`, but the overlay doesn't play it or capture the mic.
- **Close the bubble when its warning no longer applies,** and send `dismissed`/`timeout`.
- The Settings screen (per-site on/off for warnings), the rest of the dashboard, and the reading view.
- `HintConversation` (Thu's mock) opens on mascot click alongside the real hint flow. It should render the real ladder bubbles instead.

Not in the spec (needs a scope decision):
- Opening a YouTube video on a topic for the student.
