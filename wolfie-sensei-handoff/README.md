# Wolfie Sensei: dashboard redesign handoff

Visual spec for the redesigned dashboard and its four sidebar pages. The pages are static; the job is to rebuild them as real components, wire them to data, and keep the look identical.

## What is here

```
design/
  pages/            Clean, standalone HTML for each page (open in a browser)
  source-dc/        The same pages in the original design-canvas format (reference only)
  reference/        Screenshots at 1280px and 390px: the visual acceptance target
  tokens.css        Colours, fonts, layout tokens, the notched pixel-border recipe
  types.ts          Draft data model behind every number on the pages
  COMPONENTS.md     Component inventory, page-to-data map, build order
```

All numbers on the pages are sample data.

## Rules that keep it looking right

- Square only: no border-radius, blur, gradients or soft shadows. Borders are 4px box-shadow steps (see `tokens.css`).
- Headings use Press Start 2P, body text Pixelify Sans. Do not substitute fonts.
- Small text must pass 4.5:1. Weak-state text uses `--ws-weak-text`; the fill red is for bars and tags only.
- Status never relies on colour alone: tags carry text (SOLVED / HINTED / STUCK), streak squares carry an X, switches show ON/OFF.
- Interactive elements are real `<a>` / `<button>` / `<input>` with 44px minimum targets and visible focus (3px gold outline).
- The layout is fluid: sidebar is 232px and stacks above content on narrow screens. Check 1280px and 390px.

## Starter prompt for Claude Code

> Read `README.md`, `design/tokens.css`, `design/COMPONENTS.md` and `design/types.ts`. Port the five pages in `design/pages/` into our app as reusable components, starting with the shell, `PixelCard`, `PixelButton`, `SegBar`, `OutcomeTag`, `StreakGrid` and `StepChart`, then the Dashboard page. Replace the hardcoded sample numbers with data from the types in `types.ts`, using fixture data first. Do not change the visual design. After each page, screenshot it at 1280px and 390px with Playwright and compare it to `design/reference/`; fix any visible difference before moving on.

Then work through "Behaviour to add" in `COMPONENTS.md`, one item at a time.
