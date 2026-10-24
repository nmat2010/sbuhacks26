# Coordination Protocol for Thu and Tuan

This document provides a structured way for both developers (and their Claude Code agents) to coordinate work, report progress, and integrate features.

## Daily Status Updates

Each developer should update their section at the start and end of each work session.

### Thu's Status

**Current Phase:** Phase 1 (Mascot overlay and voice)
**Status:** 🟡 In Progress
**Last Updated:** 2026-10-24

**Completed:**
- [x] Phase 0: Complete infrastructure scaffold
- [x] Coordination documentation
- [x] SPEC.md updated for web app approach

**In Progress:**
- [ ] Phase 1: NudgeQueue implementation
- [ ] Phase 1: Overlay sprite states and speech bubbles
- [ ] Phase 1: Voice UI coordination layer

**Blocked:**
- Waiting for Tuan's STT/TTS provider implementations (can use mock for now)

**Next Up:**
- Complete NudgeQueue
- Build sprite animation system
- Create speech bubble component

**Notes for Tuan:**
- All Phase 0 infrastructure is ready for you to build on top of
- Database schema is in `desktop/src/main/db/index.ts`
- Shared contracts are in `shared/src/schemas/`
- IPC preload is in `desktop/electron/preload.ts`
- I'll create the voice UI layer that will use your STT/TTS providers
- NudgeQueue API will be exposed via IPC for you to use in Phase 2+

---

### Tuan's Status

**Current Phase:** Phase 0 fix-up (branch `tuan/phase0-fixes`)
**Status:** 🟢 Done, waiting on Thu's review of the contract change below
**Last Updated:** 2026-10-24

**Completed:**
- [ ] Review Phase 0 infrastructure

**In Progress:**
- [ ] Nothing currently

**Blocked:**
- None

**Next Up:**
- Phase 2: Session monitoring and extension connection

**Notes for Thu:**
- (Tuan will update here)

---

## Agent A
_(Agent A: status notes, integration offers, proposals.)_

## Agent B
_(Agent B: status notes, integration offers, proposals.)_

**Status (Agent B, branch `tuan/b-intelligence`):** B1, B5a, B2, B3a, B3b done; details in `tuan/reports/agent-b.md`.

### Integration Offer: hint service (for Agent A, A8)
**By:** Agent B
**Provides:** the web app hint round trip.
```typescript
import { requestHints, requestFollowup, getHintService } from '../hints/index.js';
const res = await requestHints(request.context, request.source, request.assessment);       // HintResponse
const reply = await requestFollowup(followup, context, source, assessment);                // HintFollowupResponse
```
Model failures never throw: they come back as `offline: true` (the labeled rule-based ladder). `assessment` may be false; the service also checks the stored session's `assessment_mode` and `assessment.domains`. With `DEMO_MODE=1` (or no key) the deterministic mock answers, keyed by `context.problemId`.

### Integration Offer: voice intents (for Agent A, A4)
**By:** Agent B
**Provides:** `voiceBus` (`desktop/src/main/voice/bus.ts`) announces every local intent. Listen for `taking_a_break`, `need_this` and `ignore` to answer an open distraction/AI-tool nudge by voice; use `getNudgeQueue().respond({ id, action, via: 'voice' })` with your buttons' action strings so the answer is logged like a click.
**Also:** any nudge with `spokenText` is spoken when voice mode is on (hook in `voice/nudge-speech.ts`, wired in `intelligence/register.ts`). Set `spokenText` on distraction and streak nudges and they get voice with no extra code. Do not set it on nudges where you do not want speech.

### Integration Note: front window (for Agent A, A1)
**By:** Agent B
**What I need:** the frontmost window's app name and title, so the screenshot fallback can capture the right window instead of the primary screen.
**API:** `setFrontWindowProvider(() => ({ app, title }))` in `desktop/src/main/hints/capture.ts`. Optional; without it the primary screen is captured.

### Integration Note: clear-all-data (for Agent A, A10)
Agent B tables are in `migrations-b.ts` `tables` (already included in `DATA_TABLES`). Stored hint images live in `<userData>/images/`; "Clear all data" should delete that folder too.

### Integration Offer: plan (for Agent A, A8 / A4 optional hook)
**By:** Agent B
```typescript
import { getPlanSnapshot, getTodayPlanContext } from '../plan/index.js';
getPlanSnapshot();      // PlanSnapshotType for the `plan.snapshot` sync message (items from 7 days ago to 14 days ahead)
getTodayPlanContext();  // { text: "Today's goal: ...", title, dueDate, goalTitle, itemId } | null, for nudge copy
```

### Integration Offer: plan IPC for Thu (onboarding and plan UI)
**By:** Agent B. Types are in `desktop/src/common/ipc-intelligence.ts` (`PlanOnboardingInput`, `PlanView`, ...). Channels: `plan-onboarding-get`, `plan-onboarding-save` (validates; returns a friendly `error` string), `plan-get`, `plan-generate` (slow, show a spinner; optional `{goalId}`), `plan-item-add`, `plan-item-update` (status/title/dueDate/notes; checking off = `status: 'completed'`), `plan-item-delete`, `plan-reorder`, `plan-item-regenerate`. All results are `{ success, error?, data? }`. Dates are `YYYY-MM-DD`.

### Integration Offer: ideas and papers IPC for Thu
**By:** Agent B. `ideas-suggest(goalId)` (slow: up to ~15 s because paper checks are rate limited; show a spinner) returns `IdeasResult` (3-5 ideas, up to 5 verified papers with links, how many were dropped, and `verificationUnavailable`). `paper-add({title, url, goalId?, authors?, year?, arxivId?, planItemDueDate?})` creates the paper and optionally the plan item "Read: ...". `papers-list`, `paper-set-status`, `paper-delete`. Types are in `ipc-intelligence.ts`.

### Integration Offer: IPC for Thu (voice and hint bubbles)
**By:** Agent B. Channels are typed in `desktop/src/common/ipc-intelligence.ts`.
- `voice-audio-in` (invoke, mic frames, 16 kHz 16-bit mono PCM; the preload has no generic `send`, so this is an invoke), `voice-audio-out` / `voice-stop-playback` (events: play or drop encoded audio), `voice-mic` (green dot), `voice-trouble` (message for a bubble), `voice-utterance` (invoke: typed text as if spoken, for the developer panel), `voice-status`.
- Bubble button actions the overlay will see on `nudge-response`: `accept_hint`, `decline`, `im_good` (offer), `another_hint`, `got_it`, `show_answer` (ladder).
- **Please send** `nudge-response {id, action: 'dismissed'}` when the student closes a bubble with the X and `{action: 'timeout'}` when a bubble fades on its own. A dismissal counts as a decline and closes a hint ladder; a timeout is neither.
- Escalation levels 1 and 2 arrive as `overlay-state` (`glance`, `question-mark`). The level-3 offer and every ladder level are `kind: 'stuck', level: 3` bubbles with buttons. A `stuck` bubble with `spokenText` is spoken by main, so the renderer does not need to call TTS for it.

---

## Integration Checkpoints

Track when features from both tracks need to come together.

### Checkpoint M1: First Integration
**Target:** After Phase 1 (Thu) + Phase 2-3 (Tuan)
**Status:** 🔴 Not started

**Thu's Deliverables:**
- [ ] Overlay with NudgeQueue working
- [ ] Voice UI with mock provider
- [ ] Dashboard shell

**Tuan's Deliverables:**
- [ ] Session monitoring
- [ ] Extension connection
- [ ] Distraction warnings

**Integration Test:**
- [ ] Opening YouTube triggers a nudge that appears on overlay
- [ ] Nudge can be spoken in voice mode

**Blockers:**
- None yet

---

### Checkpoint M2: Hints End-to-End
**Target:** After Phase 4 (Tuan) + escalation sprites (Thu)
**Status:** 🔴 Not started

**Thu's Deliverables:**
- [ ] Escalation sprite states (glance, question mark)
- [ ] Hint conversation UI

**Tuan's Deliverables:**
- [ ] Signal detection
- [ ] Escalation engine
- [ ] Hint service with LLM integration
- [ ] Demo pages

**Integration Test:**
- [ ] Demo scenario A runs end to end
- [ ] Wrong answers trigger escalation → offer → 5-level hints

**Blockers:**
- None yet

---

### Checkpoint M3: Cross-Device Sync
**Target:** After Phase 10 (both)
**Status:** 🔴 Not started

**Thu's Deliverables:**
- [ ] Web app sync client
- [ ] IndexedDB offline queue

**Tuan's Deliverables:**
- [ ] Desktop WebSocket server
- [ ] Pairing code system
- [ ] Message authentication

**Integration Test:**
- [ ] Web app pairs with desktop
- [ ] Hint request round-trips successfully
- [ ] Offline queue replays on reconnect

**Blockers:**
- None yet

---

## Shared Interface Contracts

### Already Frozen (Don't change without discussion)

1. **Nudge Schema** (`shared/src/schemas/nudge.ts`)
   - Used by: Both
   - Status: ✅ Frozen

2. **Hint Schemas** (`shared/src/schemas/hint.ts`)
   - Used by: Both
   - Status: ✅ Frozen

3. **Sync Messages** (`shared/src/schemas/sync.ts`)
   - Used by: Both
   - Status: ✅ Frozen

4. **Database Schema** (`desktop/src/main/db/index.ts`)
   - Used by: Both
   - Status: ✅ Frozen

5. **IPC Channels** (`desktop/electron/preload.ts`)
   - Used by: Both
   - Status: ⚠️ Can extend, don't break existing

## Contract Change Proposal: Phase 0 fix-up
**Proposed by:** Tuan
**Affects:** `shared/` (all schemas and fixtures), `desktop/src/main/nudge/`, `desktop/electron/{main,preload}.ts`, `desktop/src/renderer/overlay/{App.tsx,hooks/useNudge.ts}`, `extension/`
**Reason:** `npm install` failed on Node 24, the overlay crashed (`React` not imported, preload could not load), the schemas said `ipad` while the DB said `webapp`, most fixtures were missing, and Phases 3–4 need nudge ids, responses, and sprite-only escalation states.
**Change:** the full list is in `DECISIONS.md` → "Phase 0 fix-up". The parts that touch Thu's code:
- `NudgeQueue.push()` returns `string | null` (the id) instead of `boolean`; new `respond()` / `'response'` event; `push(n, { userInitiated: true })` for hint replies.
- Overlay sends `nudge-response {id, action}` from `handleButtonClick`, listens to `overlay-state`, and invokes `mascot-click`.
- New IPC channels must be added to `desktop/src/common/ipc.ts`; `window.electronAPI.on()` returns an unsubscribe.
- `web/` must use `device: 'webapp'`, the `SyncMessageSchema` envelope, and the shared escalation engine plus `runEscalationScenario` in its tests.
- **Voice (needs Thu's decision):** `useVoiceIntents` uses Web Speech, which does not work inside Electron, and its words (help/dismiss/close) are not the spec's. Proposal: the desktop overlay uses Tuan's STT provider and local intent parser (B5); Web Speech stays for the web app.
**Impact:** Thu pulls `tuan/phase0-fixes` (or main after merge), reruns `npm install`, and builds Phase 1+ on top.
**Status:** ⏳ Waiting for Thu

### How to Propose Changes to Shared Contracts

1. **Create a discussion in this file:**
   ```markdown
   ## Contract Change Proposal: [Name]
   **Proposed by:** [Your name]
   **Affects:** [What files/components]
   **Reason:** [Why this change is needed]
   **Proposed Change:**
   ```yaml
   # Before
   ...
   # After
   ...
   ```
   **Impact:** [Who needs to update what]
   ```

2. **Wait for acknowledgment** from the other person (or their Claude agent)
3. **Make the change** and update both implementations simultaneously

---

## Communication Protocol

### Reporting Progress

Update your status section above with:
- What phase you're on
- What you completed today
- What you're working on now
- What's blocking you
- What the other person needs to know

### Requesting Help

Create a section like this:

```markdown
## Help Request: [Short description]
**From:** [Your name]
**To:** [Other person's name]
**Priority:** [High/Medium/Low]
**Context:** [What you're trying to do]
**Question:** [Specific question or blocker]
**Attempted:** [What you already tried]
```

### Signaling Blockers

If you're blocked:
1. Update your "Blocked" section
2. Create a help request
3. Work on something else in your track if possible

### Integration Readiness

When your part of an integration checkpoint is ready:
1. Check off your deliverables
2. Add a note: "✅ [Your name] ready for M[X] integration"
3. Wait for the other person to be ready
4. Coordinate a time to test together

---

## File Ownership Map

To avoid merge conflicts, here's who typically works in which files:

### Thu Owns (Primary)
- `desktop/src/renderer/overlay/` - Overlay UI
- `desktop/src/renderer/dashboard/` - Dashboard UI
- `web/` - Entire web app (when created)
- `desktop/src/main/voice/` - Voice UI coordination
- Mascot sprites and assets

### Tuan Owns (Primary)
- `desktop/src/main/monitor/` - Session monitoring
- `desktop/src/main/rules/` - Distraction/AI tool matching
- `desktop/src/main/stuck/` - Signal detection & escalation
- `desktop/src/main/llm/` - LLM integration
- `desktop/src/main/voice/` - STT/TTS providers
- `desktop/src/main/streak/` - Streak engine
- `desktop/src/main/sync/` - Sync server
- `extension/` - Entire extension

### Shared (Need coordination)
- `shared/` - All shared schemas and fixtures
- `desktop/src/main/db/` - Database
- `desktop/electron/main.ts` - Main process
- `desktop/electron/preload.ts` - IPC definitions
- `demo-pages/` - Demo scenarios

### How to Handle Shared Files

1. **Before editing:** Check if the other person is working on it
2. **Small changes:** Just make them and note in your status
3. **Big changes:** Coordinate via help request
4. **Conflicts:** The person who committed second resolves the conflict

---

## Code Integration Pattern

When integrating your work with the other person's:

### Pattern 1: You depend on their code

```markdown
## Integration Note: [Feature name]
**By:** [Your name]
**Depends on:** [Other person's feature]
**Status:** Waiting
**What I need:** [Specific interface/function/API]
**Workaround:** [What I'm using as a stub/mock while waiting]
**Ready to integrate when:** [Specific condition]
```

### Pattern 2: Your code is ready for them

```markdown
## Integration Offer: [Feature name]
**By:** [Your name]
**Provides:** [What this offers]
**API:**
```typescript
// Example usage
import { yourFunction } from './path';
yourFunction(params);
```
**Tests:** [How to verify it works]
**Documentation:** [Link to relevant docs or inline explanation]
```

---

## Testing Coordination

### Running Tests Before Committing

```bash
# Run all tests
npm test

# Run specific workspace tests
npm test --workspace=shared
npm test --workspace=desktop
npm test --workspace=extension
```

### Integration Test Checklist

Before marking an integration checkpoint complete:
- [ ] All unit tests pass
- [ ] Integration test scenario works end-to-end
- [ ] No console errors
- [ ] Performance is acceptable
- [ ] Both developers have tested on their machines
- [ ] Changes are documented

---

## Git Workflow

### Branch Naming
- `thu/phase-[N]-[feature-name]` - Thu's work
- `tuan/phase-[N]-[feature-name]` - Tuan's work
- `integration/m[N]-[checkpoint-name]` - Integration work

### Commit Messages
```
[Phase N] Brief description

- Detailed change 1
- Detailed change 2

Owner: [Thu/Tuan]
Status: [In Progress/Complete/Ready for Integration]
```

### Pull Request Protocol
1. Create PR from your branch
2. Add the other person as reviewer
3. Tag with phase label
4. Link to relevant checkpoint in COORDINATION.md

---

## Emergency Contact Points

If something is critically blocking the other person:

### For Thu
- Working on: Overlay, Dashboard, Web App, Voice UI
- Best reached via: [Add contact method]
- Typical work hours: [Add hours]

### For Tuan
- Working on: Desktop logic, Extension, LLM, Monitoring
- Best reached via: [Add contact method]
- Typical work hours: [Add hours]

---

## Quick Reference: Who Does What

| Feature | Owner | Helper | Phase |
|---------|-------|--------|-------|
| Overlay window | Thu | - | 1 |
| NudgeQueue | Thu | - | 1 |
| Voice UI | Thu | Tuan (providers) | 1 |
| STT/TTS providers | Tuan | - | 1 |
| Session monitoring | Tuan | - | 2 |
| Extension connection | Tuan | - | 2 |
| AI tool warnings | Tuan | Thu (tone review) | 3 |
| Signal detection | Tuan | - | 4 |
| Escalation engine | Tuan | - | 4 |
| Hint service | Tuan | - | 4 |
| Extension PageSummary | Tuan | - | 4 |
| Demo scenarios | Tuan | - | 4 |
| Escalation sprites | Thu | - | 4 |
| Hint conversation UI | Thu | - | 4 |
| Plan generation logic | Tuan | - | 5 |
| Onboarding UI | Thu | - | 5 |
| Plan UI | Thu | - | 5 |
| Paper recommendations | Tuan | - | 6 |
| Paper extraction | Tuan | - | 7 |
| Reading view UI | Thu | - | 7 |
| Dashboard UI | Thu | - | 8 |
| Dashboard queries | Tuan | - | 8 |
| Streak engine | Tuan | - | 9 |
| Streak UI | Thu | - | 9 |
| Wolfie reactions | Thu | - | 9 |
| Sync server | Tuan | - | 10 |
| Web app sync client | Thu | - | 10 |
| Web app notebook | Thu | - | 11 |
| Web app Wolfie | Thu | - | 11 |
| Web app voice | Thu | - | 11 |
| Canvas signals | Thu | - | 12 |
| Camera UI | Thu | - | 12 |
| Hint support (handwriting) | Tuan | - | 12 |

---

## Version History

- **2026-10-24**: Created coordination document (Thu)
- [Future updates will be logged here]
