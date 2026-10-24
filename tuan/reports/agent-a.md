# Report: Agent A (Sensing & Data)

**Branch:** `tuan/a-sensing`, from `tuan/phase0-fixes` @ f4de16a.
**Last updated after:** A10 (all packages done).

## Status

| Package | State | Commit |
|---|---|---|
| A1 sessions + monitor | done | 41e678d |
| A2 extension loopback server | done | 09a161c |
| A3 extension background + popup | done | 83a2313 |
| A4 rules + warnings (**M1**) | done | 32d4513 |
| A5 PageSummary + web signals | done | f9375f7 |
| A7 demo pages | done | b12c5af |
| A6 desktop signals (**M2**) | done | 0538f24 |
| A8 LAN sync server (**M3**) | done | b0a2dec |
| A9 streak engine | done | 249214e |
| A10 history / settings / data controls | done | 2f2bb74 |

## Verified (automated)
`npm run typecheck`, `npm test`, `npm run smoke` (with `WOLFIE_USER_DATA=/tmp/wolfie-a`; logs `[extension] loopback server listening on 127.0.0.1:45678`), `npm run build:extension` (every file the manifest references exists in `extension/dist`).

Tests that prove each "Done when":
- **A1:** `desktop/src/main/monitor/__tests__/monitor.test.ts` (simulated window stream gives exactly the expected change-only `app_events` rows, idle flips, domains only for browsers, title capture off, pause marker, auto-start; denied Automation gives a status and no row, no crash), `window-source.test.ts` (osascript parsing/error classification, permission status/requests), `session/__tests__/session.test.ts` (sessions row, `session.start/end`, orphan recovery, mic flag).
- **A2:** `desktop/src/main/sync/__tests__/extension-link.test.ts` on port 0: no token / wrong token / wrong or missing origin rejected; first-use extension id stored then enforced; a valid client's domain lands in `app_events.url_domain`; `desk.state` pushed on session/pause/frontmost/settings changes; `problem-changed` only on `problemId` change; domain-only mode; summary round trip.
- **A3:** `extension/src/lib/__tests__/report.test.ts` (`reportableDomain`: excluded, incognito, paused, non-web), `background/__tests__/connection.test.ts` (hello, backoff, rejection), `popup/__tests__/view.test.ts` (jsdom).
- **A10:** `desktop/src/main/history/__tests__/history.test.ts` (History totals equal an independent sum over the raw `app_events`, paused time excluded, per-session nudge/hint/escalation counts, web sessions, running session; settings reads exclude pairing, writes validated/normalized and bad ones store nothing; export covers every table and omits secrets; Clear leaves every table empty except the re-seeded `streak_state` row, with foreign keys on and stored images deleted).
- **A9:** `desktop/src/main/streak/__tests__/{compute,engine}.test.ts` (qualifying boundary, freeze earn every 7 days and cap 2, auto-consume, reset, longest kept, week calendar, work-only focus minutes, midnight split, DST spring forward and fall back, timezone change keeps old dates, late-synced web session repairs the past, desktop+web combined, celebration/milestone/freeze/reset/reminder each once and retried if the queue drops them, reminder time in the local zone), `monitor.test.ts` (sleep gap).
- **A8:** `desktop/src/main/sync/__tests__/lan-server.test.ts` (port 0, real sockets: right/wrong/locked pairing code, HMAC auth good/bad/unknown/replayed nonce, unauthenticated traffic rejected, sessions/activity/nudge logs stored and acked, offline replay of the whole queue on a new connection and after a restart creates no duplicates, out-of-order data, poison messages, hint round trip with the mock provider returning 5 distinct levels, followup and `hint.error`, replayed hint does not call the model twice, unpair cuts the device off, snapshots pushed).
- **A6:** `desktop/src/main/stuck/signals/__tests__/signals.test.ts` (fake-clock tests: each desktop signal's threshold and non-firing cases; `InputPoller`; `SignalSink` stores into `web_signals`, logs, emits on `stuckBus 'signal'`, drops outside a session; and an extension `ext.signal` over a real socket reaches the bus and `web_signals` in `extension-link.test.ts`).
- **A5:** `extension/src/content/__tests__/` (summary + redaction: no password/card/OTP/typed values anywhere in a summary, viewport-first 2,500-char text, <=120 controls with stable ids; detectors: each threshold; runtime in jsdom: wrong-answer loop, dead clicks (disabled, aria-disabled, no-effect), validation errors, domain-only mode sends and reads nothing, throttling).
- **A4:** `desktop/src/main/rules/__tests__/rules.test.ts` (matching, cooldown, ignore, "I need this"; an end-to-end test drives a simulated stream through the real `Monitor` and `NudgeQueue` into SQLite and checks `nudges.user_response` and `events`).

## Test totals at the last commit
shared 47, desktop 181, extension 73, all passing. `npm run typecheck` clean in all workspaces, lint clean (see note below), `npm run smoke` OK.

## Not verified (needs a person or a real environment)
- **macOS permissions:** the osascript/JXA script compiles (`osacompile`) but was never run against a real Automation grant. First run prompts for control of "System Events"; window titles additionally need Accessibility. `isTrustedAccessibilityClient` / `askForMediaAccess` / the System Settings deep links are untested outside unit fakes.
- **Chrome:** the extension has not been loaded in a real Chrome profile (build and manifest references only). Things to check there: popup pairing, `desk.state` arriving, MV3 keep-alive (the desktop heartbeats `desk.state` every 20 s and the extension has a 30 s alarm; Chrome 116+ should keep the worker alive on WebSocket traffic), and that a click on a natively `disabled` button reaches the content script as `pointerdown` (dead-click detection relies on it; `aria-disabled` and no-effect clicks do not).
- **Adapters:** the submit selectors in `extension/src/content/adapters.ts` (leetcode, khanacademy) are from memory and unchecked against the live sites. Generic detection does not depend on them.
- **LAN sync:** no real iPad/browser client; the protocol was exercised only by a Node `ws` client in tests. The macOS firewall prompt on first listen on `0.0.0.0:45679` is expected and unseen. Thu's client must compute the HMAC as documented (test vector in `COORDINATION.md`).
- **Overlay/UI:** none of my nudges (rule warnings, streak messages) have been looked at in the overlay; Thu owns that.
- Two apps on the same machine: `npm run smoke`/`dev` from both worktrees at once will collide on ports 45678 and 45679 (the app logs and keeps running without those links).

## How to run / verify
```bash
npm ci
npm run typecheck && npm test
WOLFIE_USER_DATA=/tmp/wolfie-a npm run smoke   # logs the extension and sync servers listening
npm run build:extension                        # then load extension/dist unpacked in chrome://extensions
npx vite demo-pages --port 5174                # demo pages (algebra / continue / coding)
```
Lint note: this repo sits inside a parent checkout, so in this nested worktree `npm run lint` fails with "couldn't determine the plugin uniquely" (the parent's `.eslintrc.json` is also loaded). I ran `eslint --no-eslintrc -c <worktree>/.eslintrc.json` per workspace instead; it is clean. In a normal clone `npm run lint` works.

Manual M1 check: start the app (`WOLFIE_USER_DATA=/tmp/wolfie-a npm run dev`), get the pairing token (IPC `extension-pairing-get`, or the `settings` row `pairing.extension_token`), paste it in the extension popup, start a session from the mascot menu, open youtube.com in Chrome: the overlay should show the warning within about 3 s. Manual M2: open `http://localhost:5174/algebra.html` in a session and enter a wrong answer twice (right answer 4): `web_signals` gets a `wrong_answer_loop` row and `stuckBus 'signal'` fires.

## Decisions
See `DECISIONS.md` under "Agent A" (A1..A10), each with the reasoning.

## Deviations from the brief (small, all noted in DECISIONS)
- `desktop/src/main/__tests__/db.test.ts` (core file) now compares only the core migrations by name, because it asserted the exact full list and my migrations (`101_a_sync_seen`, `102_a_session_tz`) legitimately extend it. Agent B's migrations will hit the same assertion: keep either side's version when merging.
- `extension/manifest.json` gained the `alarms` permission (keep-alive).
- The monitor writes an idle row for a stretch in which the computer slept (more than 30 s between polls); the streak depends on it.
- `session/index.ts` also records the session's time zone (`a_session_tz`).

## Needs from others
- **Thu (UI):** all my IPC is typed in `desktop/src/common/ipc-sensing.ts` and summarized in `COORDINATION.md` ("Integration Offer" sections). Screens needed: extension pairing (token) and permissions, LAN pairing (code, IPs/QR, device list, unpair), settings (`settings-get/set`, `status-get`), history, streak, data export/clear (with a confirm). The web client must follow the handshake in `COORDINATION.md` (HMAC format, ack/replay with the same ids). Tone review of `rules/messages.ts` and `streak/messages.ts` (placeholder copy).
- **Agent B:**
  - B2: log `stuck.level` events with `payload.level` (History reads it); subscribe to `stuckBus` `signal`/`input`/`problem-changed` as described in the "Integration Offer: signals" section (signals re-emit to keep alive; `problem-changed` fires only on a new defined `problemId`).
  - B3a: `requestFollowup` is called by the LAN server for `hint.followup` (until implemented, web followups get `hint.error`); `getActiveSession().assessmentMode` can change mid-session without a `change` event.
  - B5a: rule-warning answers use `taking_break` / `need_for_task` / `ignore_session` (or the spoken phrase) as `NudgeResponse.action`.
  - B6: call `setPlanSnapshotProvider(getPlanSnapshot)` and `notifySnapshotsChanged('plan')` from `sync/snapshots.ts`; until then the web app gets an empty plan. I used a local empty stub, as agreed.

## Blockers
None.
