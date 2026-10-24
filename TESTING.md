# Testing

## Automated

```bash
npm install          # Node >= 22 (better-sqlite3 13 has Node-API prebuilds; no native rebuild)
npm run typecheck    # all workspaces
npm test             # shared contract + escalation tests, desktop DB/settings/NudgeQueue tests
npm run lint
npm run smoke        # launches Electron, does a renderer-to-SQLite round trip, quits
npm run build:extension   # then load extension/dist unpacked in chrome://extensions
```

- `shared/src/__tests__/contracts.test.ts`: every fixture in `shared/src/fixtures/messages.json` validates, every sync/extension message type has a fixture, and invalid examples are rejected.
- `shared/src/__tests__/escalation.test.ts`: runs every scenario in `shared/src/fixtures/escalation.json` through `runEscalationScenario` (`@wolfie/shared/testing`). The web app must run the same file.
- Desktop tests use `openDatabase(':memory:')` and `setDatabaseForTesting(db)`; no Electron needed.

### Running from a Claude Code / VS Code agent shell
VS Code sets `ELECTRON_RUN_AS_NODE=1` for its extension host, so Electron would start as plain Node and fail with "electron does not provide an export named BrowserWindow". `npm run dev` and `npm run smoke` already unset it.

## Real-hardware pass (Tuan, next)
Goal: run everything that has only been tested with fakes so far. Write down each failure here, then fix it.

1. **Keys:** copy `desktop/.env.example` to `desktop/.env` and set `GEMINI_API_KEY`, `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID` (and the models). Keep `DEMO_MODE=0`.
2. **Start:** `npm run dev`. Expected: both windows open, and the log shows the extension server on 127.0.0.1:45678 and the LAN server on 45679.
3. **macOS permissions** (dev builds are attributed to the terminal or VS Code app): grant Screen Recording, Accessibility, Automation (System Events), and Microphone. Then check `permissions-get` from the test panel's devtools console with `await window.electronAPI.invoke('permissions-get')`.
4. **Session and monitor:** start a session from the mascot menu, switch apps for about 5 minutes, then check `history-get`. The time per app should look right, and idle periods should be recorded.
5. **Extension:** run `npm run build:extension` and load `extension/dist` unpacked in Chrome. Copy the token from `extension-pairing-get` into the popup, which should then say connected. Open youtube.com during the session: a warning should appear within 3 s. An excluded site (chase.com) and an incognito tab should send nothing.
6. **Demo pages:** run `npx vite demo-pages --port 5174`.
   - Scenario A (algebra): enter two wrong answers. Wolfie should glance, then show "?", then the offer. Accept it and step through the 5 hint levels.
   - Repeat with `DEMO_MODE=1`, with real Gemini, and with Wi-Fi off (offline ladder).
   - Scenarios B (disabled Continue) and C (failing code) should show the same pattern.
7. **Assessment mode:** turn on `session-set-assessment(true)`. "Show the answer" should disappear.
8. **Screen capture fallback:** in a non-browser app, click Wolfie. The first-capture confirm should show a preview, and the hints should mention what's on screen. With image storage off, `<userData>/images/` should be empty afterwards.
9. **Voice:** turn voice on. "I'm stuck" should start the flow, "I don't get step 2" should get a reply that fits the context, and "stop" should cut playback. Talking over Wolfie should stop it. Try with and without headphones.
10. **Papers:** import an arXiv URL, ask about a paragraph (the answer should cite a section), and ask an off-topic question (it should be labeled general knowledge).
11. **Streak:** set `streak.qualifying_minutes` to 1 and run a 1-minute session. The celebration should fire once, and `streak-get` should show today as qualified.
12. **Sleep/wake** during a session, and **multi-monitor** overlay placement.

## Manual checklist (fill in as phases land)
- [ ] macOS permissions: Screen Recording, Accessibility, Microphone, first-run explanation, denial does not crash
- [ ] Overlay click-through except on the mascot; drag; multi-monitor
- [ ] Sleep/wake during a session
- [ ] Extension: loads unpacked, pairs, excluded and incognito tabs report nothing
- [ ] Voice barge-in with and without headphones
- [ ] Network loss mid-hint shows the offline ladder
- [ ] Web app: touch/stylus drawing on iPad, camera permission denial message
