# Report: Agent A (Sensing & Data)

**Branch:** `tuan/a-sensing`, from `tuan/phase0-fixes` @ f4de16a.
**Last updated after:** A5.

## Status

| Package | State | Commit |
|---|---|---|
| A1 sessions + monitor | done | 41e678d |
| A2 extension loopback server | done | 09a161c |
| A3 extension background + popup | done | 83a2313 |
| A4 rules + warnings (**M1**) | done | 32d4513 |
| A5 PageSummary + web signals | done | A5HASH |
| A7 demo pages | not started | |
| A6 desktop signals (**M2**) | not started | |
| A8 LAN sync server (**M3**) | not started | |
| A9 streak engine | not started | |
| A10 history / settings / data controls | not started | |

## Verified (automated)
`npm run typecheck`, `npm test`, `npm run smoke` (with `WOLFIE_USER_DATA=/tmp/wolfie-a`; logs `[extension] loopback server listening on 127.0.0.1:45678`), `npm run build:extension` (every file the manifest references exists in `extension/dist`).

Tests that prove each "Done when":
- **A1:** `desktop/src/main/monitor/__tests__/monitor.test.ts` (simulated window stream gives exactly the expected change-only `app_events` rows, idle flips, domains only for browsers, title capture off, pause marker, auto-start; denied Automation gives a status and no row, no crash), `window-source.test.ts` (osascript parsing/error classification, permission status/requests), `session/__tests__/session.test.ts` (sessions row, `session.start/end`, orphan recovery, mic flag).
- **A2:** `desktop/src/main/sync/__tests__/extension-link.test.ts` on port 0: no token / wrong token / wrong or missing origin rejected; first-use extension id stored then enforced; a valid client's domain lands in `app_events.url_domain`; `desk.state` pushed on session/pause/frontmost/settings changes; `problem-changed` only on `problemId` change; domain-only mode; summary round trip.
- **A3:** `extension/src/lib/__tests__/report.test.ts` (`reportableDomain`: excluded, incognito, paused, non-web), `background/__tests__/connection.test.ts` (hello, backoff, rejection), `popup/__tests__/view.test.ts` (jsdom).
- **A5:** `extension/src/content/__tests__/` (summary + redaction: no password/card/OTP/typed values anywhere in a summary, viewport-first 2,500-char text, <=120 controls with stable ids; detectors: each threshold; runtime in jsdom: wrong-answer loop, dead clicks (disabled, aria-disabled, no-effect), validation errors, domain-only mode sends and reads nothing, throttling).
- **A4:** `desktop/src/main/rules/__tests__/rules.test.ts` (matching, cooldown, ignore, "I need this"; an end-to-end test drives a simulated stream through the real `Monitor` and `NudgeQueue` into SQLite and checks `nudges.user_response` and `events`).

## Not verified (needs a person)
- Real macOS permissions: the osascript/JXA script compiles (`osacompile`) but was never run against a real Automation grant. First run will prompt for "System Events" control. Window titles additionally need Accessibility.
- The extension has not been loaded in a real Chrome profile (build and manifest references only).
- Overlay rendering of the rule nudges (Thu's UI).

## How to run / verify
```bash
npm ci
npm run typecheck && npm test
WOLFIE_USER_DATA=/tmp/wolfie-a npm run smoke
npm run build:extension          # load extension/dist unpacked in chrome://extensions
```
Lint note: this repo sits inside a parent checkout, so in this nested worktree `npm run lint` fails with "couldn't determine the plugin uniquely" (the parent's `.eslintrc.json` is also loaded). I ran `eslint --no-eslintrc -c <worktree>/.eslintrc.json` per workspace instead; it is clean. In a normal clone `npm run lint` works.

Manual M1 check: start the app (`WOLFIE_USER_DATA=/tmp/wolfie-a npm run dev`), read the pairing token via the `extension-pairing-get` IPC (or from the `settings` table, key `pairing.extension_token`), paste it in the extension popup, start a session, open youtube.com in Chrome: the overlay should show the warning within about 3 s.

## Decisions
See `DECISIONS.md` under "Agent A" (A1..A4).

## Needs from others
- **Thu:** a settings UI that shows the pairing token (`extension-pairing-get`) and the permission status (`permissions-get`); listen to `session-changed`, `mic-allowed`, `extension-status`. Tone review of `desktop/src/main/rules/messages.ts`. The overlay must send `nudge-response` with the button `action` ids (it does).
- **Agent B:** voice intents for the rule nudges should send `taking_break` / `need_for_task` / `ignore_session` (or the spoken phrase) as `NudgeResponse.action`. B2 may use `getActiveSession()`, `isPaused()`, `sessionEvents`; `setAssessmentMode` does not emit `change`.

## Blockers
None.
