# Wolfie Sensei: pixel-exact handoff

This bundle exists so the Electron app can match the approved mockups exactly.
The mockups are not a loose reference. Port them, do not redesign them.

## What's in the bundle

| File | What it is |
| --- | --- |
| `reference/*.html` | The 15 approved screens as standalone HTML. Open any in a browser. They are the source of truth. |
| `pixel.css` | Every style those screens use, scoped per screen under `.pg-<screen>`. Generated from the mockups. |
| `tokens.css` | Color and font variables. Reference only in pass 1. |
| `Sprite.tsx` | The mascot sprite as rectangles. Use it. Never use an emoji or an image. |

Screen to scope class (put the class on each screen's outermost `div`):

| Reference file | Class | Sprite use |
| --- | --- | --- |
| `welcome.html` | `pg-welcome` | idle, 256 |
| `connect.html` | `pg-connect` | idle, 192 |
| `brightspace.html` | `pg-brightspace` | idle, 112 |
| `permissions.html` | `pg-permissions` | none |
| `goals.html` | `pg-goals` | none |
| `distractions.html` | `pg-distractions` | none |
| `done.html` | `pg-done` | cheer, 224 |
| `overlay.html` | `pg-overlay` | idle 96 (gate card), plain 56 (warn card) |
| `dashboard.html` | `pg-dashboard` | idle, 88 (sidebar) |
| `quests.html`, `todo.html`, `goaltree.html`, `focus.html`, `shields.html`, `settings.html` | `pg-quests`, `pg-todo`, `pg-goaltree`, `pg-focus`, `pg-shields`, `pg-settings` | idle, 88 (sidebar) |

## Setup

```bash
npm i @fontsource/press-start-2p @fontsource/pixelify-sans
```

In the renderer entry file, import in this order:

```ts
import "./design/tokens.css";
import "@fontsource/press-start-2p";
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import "./design/pixel.css";
```

The reference pages load fonts from Google Fonts, so they need internet to render. The app must not: fontsource bundles the fonts locally.

## Prompt to paste into Claude Code

```
You are porting an approved design, not designing. Read design/HANDOFF.md first.

Source of truth: design/reference/*.html (standalone pages). Styles: design/pixel.css.
Sprite: design/Sprite.tsx. Tokens: design/tokens.css.

PASS 1: pixel-exact port. For each screen, open its reference file and convert the
markup to a React component mechanically:

1. Copy the markup inside <body> as it is. Change only what React requires:
   class -> className, for -> htmlFor, style="a-b:c" -> style={{ aBc: 'c' }},
   SVG attributes to camelCase, self-close void tags.
2. Add className="pg-<screen>" to the outermost div (table in HANDOFF.md).
3. Replace the inline sprite <svg> with <Sprite size={...} variant="..." /> at the same size.
4. Keep every string, size, color, spacing value and class name. Do not use Tailwind
   for these screens. Do not create shared components yet. No emoji. No restyling,
   no extra borders or highlights, no "improvements".
5. Do not copy the reference <style> or Google Fonts <link>. pixel.css and
   @fontsource replace them.

Verify before moving on: with Playwright, screenshot design/reference/<screen>.html and
your rendered screen at the same 1280px-wide viewport. Compare them. List every visible
difference (fonts, colors, borders, button bevels, spacing, wrapping, sprite) and fix
until they match. If something differs because of a global reset (for example
box-sizing), fix it globally, not per screen.

Order: welcome, connect, brightspace, permissions, goals, distractions, done, overlay,
dashboard, quests, todo, goaltree, focus, shields, settings.

Stop after welcome and show me both screenshots side by side. Continue only after I approve.

PASS 2 (only after every screen matches): extract shared pieces (Card, Button,
ModeSegmented, Meter, Toggle, SideNav, ProgressMap, TitleBar) into components and move
literal colors to the variables in tokens.css. Nothing may change visually. Keep the
reference screenshots as a regression check.
```

## Known things to watch

- **Global resets.** The mockups were drawn in a canvas that may apply its own base styles. If every screen is a few pixels off in the same way, check `box-sizing` and default `button` styles first.
- **Same class name, different meaning.** `.seg`, `.chip` and `.tag` look different on different screens. That is why `pixel.css` is scoped per screen. Do not merge them until pass 2.
- **Sample data.** Course names, dates, XP, counts and times are made up. Bracketed `[PLACEHOLDER: ...]` text is copy that needs a real decision (data handling). Keep it until it is decided.
- **Static screens.** The mockups have no behavior. Wire up state after the visual port is approved.
- **Sprite.** It is a placeholder, not the official mascot. Replace it only inside `Sprite.tsx`.
