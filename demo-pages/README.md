# Demo pages

Static scripted scenarios (SPEC 4f). Owned by Agent A (A7); not built yet.

| Page | Scenario | Problem id (matches the mock hint bank) |
|---|---|---|
| `algebra.html` | A: wrong-answer loop leads to the offer and hints | `demo-algebra-problem` |
| `continue.html` | B: disabled "Continue" button causes dead-control clicks | `demo-disabled-button` |
| `coding.html` | C: coding-practice page with failing results | `demo-code-error` |
| `distraction.md` | D: steps for the Phase 3 distraction demo | n/a |

Each page sets `data-problem-id` on the problem element; the content script copies it into `PageSummary.problemId`.
