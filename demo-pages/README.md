# Demo pages

Static scripted scenarios (SPEC 4f), owned by Agent A (A7). They have no build step and no external resources.

| Page | Scenario | Problem id (matches the mock hint bank) | Signal |
|---|---|---|---|
| `algebra.html` | A: wrong-answer loop leads to the offer and hints | `demo-algebra-problem` | `wrong_answer_loop` (2 wrong answers; the right one is 4) |
| `continue.html` | B: disabled "Continue" button causes dead-control clicks | `demo-disabled-button` | `dead_control_clicks` (3 clicks within 20 s; the email field above is empty) |
| `coding.html` | C: coding-practice page with failing tests | `demo-code-error` | `wrong_answer_loop` (Run twice; `add` has no `return`) |
| `distraction.md` | D: steps for the Phase 3 distraction demo | n/a | n/a |
| `index.html` | Links to the above | n/a | n/a |

Each page sets `data-problem-id` on the problem element; the content script copies it into `PageSummary.problemId`.

## Run
Content scripts do not run on `file://` pages, so serve them:

```bash
npx vite demo-pages --port 5174     # then open http://localhost:5174
```

Load the extension (`npm run build:extension`, load `extension/dist` unpacked), pair it with the desktop app, and start a session first. The extension's manifest matches all URLs, which includes `localhost`.

## Tests
`extension/src/content/__tests__/demo-pages.test.ts` loads each page in jsdom with its own script running, drives it like a student, and checks the extension's detectors raise the right signal and that the summary carries the right `problemId`:

```bash
npm test --workspace=extension
```
