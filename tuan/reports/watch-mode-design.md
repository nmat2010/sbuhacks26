# Report: Watch mode design (2026-10-24)

## Done
- **Model check with Tuan's key:**
  - available: `gemini-3.8-live`, `gemini-3.8-live-extended-thinking`, `gemini-3.1-flash-live-preview` (legacy), and the 2.5 native-audio models;
  - limits from Google's docs: 1 fps frames, 2-min audio+video sessions (15 min audio-only), 128k context, audio-only output, plus pricing.
- **Photon** (photon.codes) checked: it's a framework for messaging channels (iMessage, WhatsApp, Telegram, ...), not a desktop pop-up. It's parked as optional W5.
- **Tuan chose the hybrid design:** a flash watcher every ~8 s builds session memory, and `gemini-3.8-live` is opened per conversation.
- Wrote `WATCH_MODE.md`: scenarios, architecture, privacy, limits and cost, reuse, work split W1–W4 (Tuan) and U1–U3 (Thu), items to verify, spec changes.
- Updated `NEXT_STEPS.md`:
  - a pointer to the design;
  - the web app settled with Thu (she built `web/`);
  - what's still unwired on `main` from Tuan's first real run;
  - the fixes waiting on `tuan/fix-self-window`.

## State of main (1410a5c) when checked
- Typecheck is clean and 525 tests pass.
- Thu wired the plan and paper screens. History, Settings, overlay voice, and drag aren't done yet.

## Next
- Wait for Thu's review of `WATCH_MODE.md`, then build W1 → W2 → W4 → W3 (possibly 2 agents).
- Merge `tuan/fix-self-window` after Tuan checks the overlay on screen.
