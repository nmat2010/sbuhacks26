# Component inventory

Each piece below appears in `pages/*.html`. Class names in the HTML are the originals; the right column is the suggested component.

| In the HTML | Component | Props / notes |
|---|---|---|
| `.card` | `PixelCard` | 4px cream notched border + 8px hard drop shadow. `as` prop for `section`/`aside`. |
| `.card2` | `PixelCard variant="inset"` | Nested rows, inputs, chips. Border is `--ws-edge`. |
| `.btn`, `.btn.gold`, `.small`, `.big` | `PixelButton` | `tone="red" \| "gold"`, `size="sm" \| "md" \| "lg"`. Renders `<a>` when `href` is set. Min height 44-48px. |
| `.nav`, `.nav.on` | `NavItem` | Active state is `--ws-red-dark` fill + gold square. `aria-current="page"` on the active link. |
| `.opt`, `.opt.on` | `OptionButton` | Timer chips, filters, pixel scale. `aria-pressed`. |
| `.seg` (+ `.g .b .w`) | `SegBar` | `value` 0-10, `tone="gold" \| "green" \| "weak"`. Ten 12px blocks with 3px gaps. Needs `role="img"` + `aria-label`. |
| `.tag` (`solved`, `hint`, `stuck`) | `OutcomeTag` | Labels SOLVED / HINTED / STUCK. The text is the primary cue, colour is secondary. |
| `.tag` gold / green | `Badge` | WEAK SPOT, NEW. |
| `.src` | `SourceTag` | Dark label: SLIDES, PDF, PROBLEM SET, VIDEO, BRIGHTSPACE. |
| `.chip` | `Chip` | `card2` pill for course, date, topic. |
| `.d`, `.d.c .d.x .d.t` | `StreakGrid` | 7-column grid, Mon first. Statuses: clean (gold), leaned-on-ai (red + X), no-session (dark), open (gold outline). |
| Inline `<svg>` step path | `StepChart` | Generate path from `HourlyFocus[]`: slot width = width / hours, `H` then `V` commands, area fill below, gold 4px stroke. Peak band behind the highest slot. |
| `.sw` | `Switch` | `role="switch"`, `aria-checked`, ON/OFF text beside it. |
| `.opt` with `-` / `+` | `Stepper` | Attempt length, unlock minutes, AI cap, try-first timer. |
| `.field` | `PixelInput` | Dark fill, `--ws-edge` border, 48px min height. |
| Wolfie `<svg>` | `WolfieSprite` | 16x16 rect grid, `shape-rendering="crispEdges"`, `image-rendering: pixelated`. Takes `size`, later `mood` (idle, watching, ready). |
| Top bar + sidebar + `main` | `AppShell` | Sidebar stacks above content on narrow screens. Sidebar footer shows sprite, mood, level. |

## Page to data map

| Page | Reads |
|---|---|
| Dashboard | latest `Session` + its `ProblemAttempt[]`, `StreakSummary`, top weak `TopicScore`, `HourlyFocus[]` |
| Report | all `Session`s in range, selected session's attempts, aggregates for the four tiles |
| Strength / Weakness | `TopicScore[]` grouped by `band`, weakest topic's attempts for the spotlight |
| Brightspace Material | `BrightspaceItem[]` grouped by course, `matchesWeakSpot` from `TopicScore` |
| Settings | `Settings` (the independence rules feed the streak calculation) |

## Behaviour to add (in order)

1. Routing between the five pages and the active nav state.
2. Session start: topic field, timer choice, running state, end session writes a `Session`.
3. Problem logging into `ProblemAttempt`.
4. Gate events from the extension, then the streak calculation.
5. Topic scoring and the weak/strong grouping.
6. Hourly focus aggregation for the productivity curve.
7. Brightspace sync into `BrightspaceItem`.
8. Settings persistence, including the toggle that hides the curve.
