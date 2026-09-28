# Slides site — guide for Claude Code

This repository is a **static site that displays slide decks**. It never creates
slides itself: decks are Markdown files that you (Claude Code) write. The site
has no build step and no dependencies — edit files, commit, done.

## Creating a deck

1. Pick an id: lowercase, digits, hyphens (e.g. `adaptive-systems-intro`).
2. Create `decks/<id>/deck.md` (format below). Put images next to it,
   e.g. `decks/<id>/images/…`, and reference them with relative paths.
3. Add the id to the `decks` array in `decks/index.json` — otherwise the deck
   won't appear in the library (it is still reachable at `deck.html?d=<id>`).
4. Run `node tools/check.mjs <id>` — fix every ✖ error; read every ⚠ warning.
5. Run `node tools/render.mjs <id>` and **look at the PNGs** in
   `.renders/<id>/` (Read them). It also reports slides whose content overflows
   the canvas. Fix overflow by cutting words or splitting the slide, not by
   shrinking fonts everywhere.
6. Commit `decks/<id>/` and `decks/index.json`. Never commit `.renders/`.

To edit an existing deck, change its `deck.md` and repeat steps 4–5.

## Changing the site itself

After editing anything in `assets/`, `index.html` or `deck.html`, run
`node tools/stamp.mjs` before committing. It rewrites the `?v=<hash>` on every
asset URL and import so GitHub Pages visitors get the whole new version at
once, instead of a mix of fresh and cached files. `tools/check.mjs` fails if
stamps are stale. Deck files don't need stamping (they're fetched uncached).

## deck.md format

```md
---
title: Deck title                 # required; shown in the library and tab
description: One sentence.        # shown on the library card
author: Name
date: 2026-09-27                  # YYYY-MM-DD; library sorts newest first
theme: paper                      # paper | ink | signal
accent: "#0f766e"                 # optional: override the theme accent colour
aspect: 16:9                      # 16:9 (1280×720) | 16:10 | 4:3 | 1:1
tags: [research, talk]
footer: Short footer text         # optional, on every slide except title/full
numbers: true                     # optional slide numbers in the footer
draft: true                       # optional: hide from library (show with ?drafts)
---

<!-- layout: title -->

# First slide

Subtitle line

---

## Second slide

- A line with only `---` starts a new slide
- A line with only `|||` starts a new column

???
Speaker notes go after a line containing only `???`.
They appear in presenter view only. Markdown works here.
```

### Directives (HTML comments on their own line, anywhere in a slide)

| Directive | Values | Effect |
|---|---|---|
| `<!-- layout: X -->` | `default` `title` `section` `center` `statement` `quote` `media-left` `media-right` `full` | Slide layout |
| `<!-- class: X -->` | `dark` `light` `brand` `dim` `middle` `contain` or any custom class | Classes on the slide |
| `<!-- bg: X -->` | image path, URL, colour or gradient | Full-bleed background (pair images with `class: dark dim`) |
| `<!-- bg-fit: contain -->` | `cover` (default) `contain` | Background image sizing |
| `<!-- build -->` | `items` (default) or `dim` | Reveal list items one by one (`dim` fades earlier ones) |
| `<!-- columns: 2 1 -->` | numbers (fr) or CSS lengths | Column proportions |
| `<!-- id: name -->` | slug | Deep link `deck.html?d=…#name` |
| `<!-- title: Text -->` | text | Title used in overview/presenter when the slide has no heading |
| `<!-- hidden -->` | — | Skip this slide when presenting |

### Layouts

- `title` — opening slide. `# Title`, then a subtitle paragraph, then an optional small meta line.
- `section` — chapter divider, bottom-aligned. Optional `#### Kicker` above `# Heading`.
- `default` — `## Heading` at top, content below.
- `center` — everything centred.
- `statement` — one big sentence. `**bold**` renders in the accent colour. A second paragraph is a small caption.
- `quote` — `> quote` then an attribution paragraph.
- `media-left` / `media-right` — the first image fills half the slide; the rest sits in the other half.
- `full` — no padding; a lone image/video fills the canvas (`class: contain` to letterbox instead of crop).

### Columns

`|||` on its own line splits the slide. A heading at the very top spans all
columns; if only a heading comes before the first `|||`, columns start after it.
Anything else before the first `|||` is column one. Up to 4 columns.

### Markdown supported

Headings, **bold**, *italic*, ~~strike~~, ==highlight==, `code`, links, images,
fenced code with a language (` ```js `), block quotes, nested lists, task lists
(`- [x]`), tables with alignment, `***` rules, and raw HTML (leave a blank line
inside an HTML block if its contents should be parsed as Markdown).

A lone image with a title becomes a captioned figure: `![alt](img.jpg "Caption")`.

**Attributes**: append `{.class #id}` after a space at the end of a heading,
paragraph or list item line, or directly after an image: `![x](a.png){.w-50}`.

### Fragments (step-by-step reveals)

- `{.fragment}` on any paragraph/heading/list item, or `class="fragment"` in HTML.
- Variants: `.fragment.fade` (no slide-up), `.fragment.highlight` (turns accent colour).
- `<!-- build -->` makes every list item a fragment.

### Typography, colour and theme

- Titles and headings use **IBM Plex Sans Arabic**; body text and descriptions
  use **ET Bembo** (both self-hosted in `assets/fonts/`). Don't swap fonts per deck.
- The accent colour is `#16a34a` in every theme; only override `accent:` when asked.
- The site defaults to light; viewers can flip light/dark with the toggle (or `T`). Slides pinned with
  `class: dark` / `light` / `brand` keep their colours; everything else follows
  the toggle. `tools/render.mjs` always renders decks as authored.

### Utility classes

Text: `muted` `accent` `small` `tiny` `large` `huge` `lead` `center` `right` `mono` `caps`
Blocks: `card` `callout` `stat` (a `**number**` inside becomes a huge figure) `push-bottom` `grow`
Images: `w-25` `w-33` `w-50` `w-66` `w-75` `w-100` `rounded` `shadow` `tall` `cover`

## Writing good slides

- The canvas is 1280×720 at 30px body text. Budget roughly **≤ 40 words and
  ≤ 6 bullets** per slide; the validator warns above 80 words / 7 bullets.
- One idea per slide. Put the detail in `???` notes, not on the slide.
- Start with a `title` slide; use `section` slides to chunk long talks.
- Every image needs meaningful alt text.
- Code blocks: ≤ 14 lines, ≤ ~55 characters wide in a single column (≤ ~40 in two columns).
- Don't add custom CSS unless asked; if you must, a `<style>` block in a slide
  applies to the whole page — scope it with a custom `class:`.

## Site structure

```
index.html            library (reads decks/index.json)
deck.html             viewer: ?d=<id>  ·  &presenter  ·  &capture  ·  &check
assets/js/markdown.js Markdown → HTML (pure, used by Node tools too)
assets/js/deck.js     deck.md → slides (pure)
assets/js/render.js   slide DOM, thumbnails, overflow measurement
assets/js/viewer.js   navigation, overview, presenter sync, keyboard
assets/js/library.js  library page
assets/css/fonts.css  @font-face for ET Bembo + IBM Plex Sans Arabic
assets/css/slides.css slide themes, layouts, utilities
assets/js/theme.js    light/dark toggle (shared, synced across windows)
assets/css/site.css   site chrome, presenter, print
tools/check.mjs       validator (no dependencies)
tools/stamp.mjs       cache-busting ?v= stamps on asset URLs
tools/render.mjs      screenshots + overflow report (needs Playwright)
```

Preview locally with `python3 -m http.server` and open http://localhost:8000.
On localhost the viewer shows a yellow flag on slides that overflow.
