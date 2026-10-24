# Report: Integration of Agents A + B + Thu's main (2026-10-24)

**By:** Claude (Opus), for Tuan
**Branch:** `integration/tuan-m3`, from `tuan/phase0-fixes` + `tuan/b-intelligence` (f6fbc5b) + `tuan/a-sensing` (fef97b8) + `origin/main` (5a1f2b9, Thu's "fix overlay", "add wolfie mascot", "dashboard UI"). Not pushed and not merged to `main`.

## What's in it
- **Agent A (A1–A10):** sessions and active-window monitor, permissions status, extension loopback server, extension background and popup, AI-tool and distraction warnings, PageSummary with redaction, web and desktop struggle signals, demo pages A–D, LAN sync server with pairing, streak engine, history, settings and data controls. Report: `tuan/reports/agent-a.md`.
- **Agent B (B1–B8 + M2-int):** LLM client with a Gemini provider, voice core (intents, echo suppression, router), escalation runtime, hint service and hint flow, handwriting and camera sources, plan generation, ElevenLabs providers, ideas and papers with verification, paper reading, and the offline demo scenario A test. Report: `tuan/reports/agent-b.md`.
- **Thu (main):** hover menu, mascot art, dashboard views, overlay fixes.

## How the merge was resolved
1. **`db.test.ts`:** both agents made the same fix. I kept the version that checks only core migrations.
2. **B's post-merge patch:** applied (`tuan/reports/b-post-merge.patch`). It seeds B's tables in A's history test and registers B's plan snapshot with A's LAN sync, so the web app gets the real plan.
3. **`origin/main` conflicts:**
   - **Module format:** Thu switched the desktop main bundle to CommonJS (`main.cjs`, no `"type": "module"`) and added `@electron/rebuild`. I kept the ESM main plus a CommonJS preload. That setup is verified with smoke, and it's what B's ESM-only `pdfjs-dist` import needs. With `better-sqlite3` 13 there's no native rebuild step, so I dropped `@electron/rebuild`.
   - **Click-through handler:** Thu added a second `set-ignore-mouse-events` handler, which would have fired twice. I removed it and kept the typed one.
   - **Kept from Thu:** the 300×300 overlay, `skipTaskbar: false`, and the new `open-test-panel` action, now typed in `src/common/ipc.ts`.
4. **Thu's new code didn't typecheck:**
   - `TodayView` declared state setters that were only used in TODO comments. I wired those TODOs to A's real channels (`session-get`, `streak-get`, `session-start`, `session-stop`). Thu's types and rendering are unchanged.
   - The `.png` import had no types. I added `desktop/src/vite-env.d.ts` (Vite client types).
5. `.claude/worktrees/` is now in `.gitignore`.

## Verified on the merged tree
- `npm run typecheck`: clean in all workspaces.
- `npm test`: 525 passed (47 shared, 405 desktop, 73 extension).
- `npm run lint`: 0 errors, 4 warnings.
- `npm run build:extension`: OK.
- `npm run smoke` (fresh userData):
  - all 8 migrations run (001, 002, 101_a, 102_a, 201–204_b);
  - the extension server listens on 127.0.0.1:45678 and the LAN server on 45679;
  - the renderer → main → SQLite round trip returns OK, with no renderer errors.

## Not verified (needs a human or keys)
- Real macOS permissions (Screen Recording, Accessibility, Automation, Mic).
- Loading the extension in real Chrome, including the dead-click detection and the leetcode and Khan Academy adapters.
- The macOS firewall prompt and sync with a real iPad.
- Real Gemini, ElevenLabs, arXiv, and Semantic Scholar calls (no keys; everything runs on fakes).
- The `desktopCapturer` image, the first-capture confirm dialog, the PDF picker, the `Alt+Shift+H` shortcut, and audio playback and mic capture.
- What Thu's new overlay and dashboard look like (I haven't seen them).

## For Thu
- Pull this branch, or `main` once it's merged, and run `npm install`. Node 22 or newer is needed; no rebuild step.
- **Please keep `"type": "module"`** in `desktop/package.json`. The main bundle is ESM and the preload is CommonJS (`preload.cjs`). The reasons are in `DECISIONS.md` → Phase 0 fix-up.
- **IPC:** every channel is typed. Core channels are in `desktop/src/common/ipc.ts`, A's in `ipc-sensing.ts`, B's in `ipc-intelligence.ts`. The `COORDINATION.md` sections "Agent A" and "Agent B" list what each screen needs, including the web-app handshake test vector and the voice audio channels.
- The overlay should send `nudge-response` with `dismissed` when the student closes a bubble and `timeout` when it fades.
- Please review the placeholder copy in `desktop/src/main/rules/messages.ts` and `desktop/src/main/streak/messages.ts`.
- The contract-change proposal in `COORDINATION.md` still needs your acknowledgement, and so does the desktop voice decision.

## Merged
- 2026-10-24: `main` fast-forwarded to b7d1ce5 and pushed (no new commits on origin/main since 5a1f2b9). `integration/tuan-m3` pushed too.
