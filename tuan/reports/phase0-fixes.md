# Report: Phase 0 fix-up (2026-10-24)

**By:** Claude (Opus), for Tuan
**Branch:** `tuan/phase0-fixes`, from `main` @ 85ff9b7 with `tuan/plan` merged in.

## Done
All 10 problems from the planning review are fixed, plus 5 bugs found along the way. The full table is in `tuan/PLAN.md` under "Phase 0: fixed", and the reasoning is in `DECISIONS.md` under "Phase 0 fix-up".

Verified:
- `npm install`: works on Node 24 after bumping `better-sqlite3` to 13 and Electron to 44.7.0.
- `npm run typecheck`: clean in shared, desktop, and extension.
- `npm test`: 58 passed. Shared has 47 (36 contract, 11 escalation scenarios); desktop has 11 (DB, migrations, settings, `logEvent`, NudgeQueue).
- `npm run lint`: clean.
- `npm run smoke`: Electron starts, migrations 001 and 002 run, the NudgeQueue initializes, and the overlay renders with no errors. The renderer → preload → main → SQLite round trip returns `["pong",{"value":"test-…"}]`.
- `npm run build:extension`: every file the manifest references exists in `extension/dist`.

## Not verified
- I didn't load the extension in a real Chrome profile. Only the build and manifest paths were checked.
- I haven't looked at the dashboard window or Thu's `test-nudge.html` panel by eye.

## Touched Thu's files (small edits, listed in the COORDINATION.md proposal)
- `nudge/queue.ts`: ids, `respond()`, `userInitiated`, and `push()` now returns `string | null`.
- `nudge/index.ts`: DB logging and limits from settings.
- `overlay/App.tsx`: React import fix, `overlay-state` listener, `mascot-click`.
- `useNudge.ts`: sends `nudge-response`.
- `main.ts`: kept Thu's menu; pause now also sets the sleeping sprite.

## Open
- Thu has to review the Contract Change Proposal in `COORDINATION.md`.
- Thu still needs to decide on desktop voice intents.
- `web/` still has no skeleton. That's Thu's part of Phase 0.

## Next
A feasibility review of `tuan/PLAN.md` by a separate agent, then launch Agents A and B from this branch.
