# Report: Agent B (Intelligence)

**Branch:** `tuan/b-intelligence` (from `tuan/phase0-fixes` @ f4de16a)

## Status
| Package | State |
|---|---|
| B1 LLM client | done |
| B5a Voice core | not started |
| B2 Escalation runtime | not started |
| B3a Hint service | not started |
| B3b Hint flow (M2) | not started |
| B4 Handwriting + camera | not started |
| B6 Plan | not started |
| B5b ElevenLabs | not started |
| B7 Ideas + papers | not started |
| B8 Paper reading | not started |
| M2-int | pending (needs A7) |

## B1 details
- Files: `desktop/src/main/llm/{client,provider,gemini-provider,mock-provider,schema,usage,redact,data-url}.ts`, `llm/prompts/*`, `db/migrations-b.ts` (`201_b_llm_usage`).
- Tests: `llm/__tests__/client.test.ts`, `llm/__tests__/gemini-provider.test.ts` (fake provider and fake SDK; no network): timeout + abort + retry, retry limit, no retry on auth, 429 retry, schema retry with feedback, INVALID_JSON, daily cap per local day, mock exempt, retries counted, log redaction, SQLite usage store, provider selection, `gemini-pro` refused, inlineData/schema/system prompt sent as expected.
- Not verified: a real Gemini call (no key available). The request shape follows the installed `@google/genai` 2.28 typings.

## How to verify
```
npm ci && npm run typecheck && npm test
cd desktop && npx eslint --no-eslintrc -c ../.eslintrc.json src electron   # lint workaround for nested worktrees, see DECISIONS.md
WOLFIE_USER_DATA=/tmp/wolfie-b npm run smoke
```
