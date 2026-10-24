# Testing

## Automated

```bash
npm install          # Node >= 22 (better-sqlite3 13 has Node-API prebuilds; no native rebuild)
npm run typecheck    # all workspaces
npm test             # shared contract + escalation tests, desktop DB/settings/NudgeQueue tests
npm run lint
npm run smoke        # launches Electron, does a renderer -> preload -> main -> SQLite round trip, quits
npm run build:extension   # then load extension/dist unpacked in chrome://extensions
```

- `shared/src/__tests__/contracts.test.ts`: every fixture in `shared/src/fixtures/messages.json` validates, every sync/extension message type has a fixture, and invalid examples are rejected.
- `shared/src/__tests__/escalation.test.ts`: runs every scenario in `shared/src/fixtures/escalation.json` through `runEscalationScenario` (`@wolfie/shared/testing`). The web app must run the same file.
- Desktop tests use `openDatabase(':memory:')` and `setDatabaseForTesting(db)`; no Electron needed.

### Running from a Claude Code / VS Code agent shell
VS Code sets `ELECTRON_RUN_AS_NODE=1` for its extension host, so Electron would start as plain Node and fail with "electron does not provide an export named BrowserWindow". `npm run dev` and `npm run smoke` already unset it.

## Manual checklist (fill in as phases land)
- [ ] macOS permissions: Screen Recording, Accessibility, Microphone, first-run explanation, denial does not crash
- [ ] Overlay click-through except on the mascot; drag; multi-monitor
- [ ] Sleep/wake during a session
- [ ] Extension: loads unpacked, pairs, excluded and incognito tabs report nothing
- [ ] Voice barge-in with and without headphones
- [ ] Network loss mid-hint shows the offline ladder
- [ ] Web app: touch/stylus drawing on iPad, camera permission denial message
