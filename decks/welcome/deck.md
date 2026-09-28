---
title: How these slides work
description: A tour of the deck format — layouts, columns, builds, notes and presenter view. Also the reference for writing new decks.
author: Claude Code
date: 2026-09-27
theme: paper
tags: [guide, reference]
footer: Conceptual · a tour
numbers: true
---

<!-- layout: title -->

# How these slides work

A deck is one Markdown file. This site only *displays* it.

Press **→** to begin · **?** for shortcuts

???
Speaker notes live after a line containing only three question marks.
They show up in the presenter view (press S), never on the audience screen.

---

## A deck is a folder

- `decks/<id>/deck.md` holds every slide
- Images and other assets sit beside it
- `decks/index.json` lists the decks shown in the library
- A line with only `---` starts a new slide
- A line with only `|||` starts a new column

???
Keep asset paths relative to the deck folder, e.g. `images/chart.png`.

---

<!-- layout: section -->

#### Part one

# Layouts

Pick one per slide with a comment directive.

---

## Slide directives

Put HTML comments on their own line anywhere in a slide:

```md
<!-- layout: statement -->
<!-- class: dark -->
<!-- build -->
<!-- bg: photo.jpg -->
```

Layouts: `title` `section` `center` `statement` `quote` `media-left` `media-right` `full`

---

<!-- layout: statement -->

Say **one thing** per slide, and make it big.

The `statement` layout is for the idea you want remembered.

---

<!-- layout: quote -->

> The best way to predict the future is to invent it.

Alan Kay, 1971

---

<!-- layout: media-right -->

![Concentric rings](diagram.svg)

## Media beside text

The first image on a `media-right` or `media-left` slide fills half the canvas.

Everything else flows into the other half.

---

## Columns: split with `|||`

|||

### Before

- Dense paragraphs
- Twelve bullets
- Tiny type

|||

### After

- One idea
- Few words
- Room to breathe

---

<!-- columns: 2 1 -->

## Weighted columns: `<!-- columns: 2 1 -->`

|||

<div class="callout">

Callouts, cards and other HTML blocks work too — leave a blank line inside the tag so Markdown still renders.

</div>

|||

<p class="stat"><strong>2 : 1</strong> column ratio</p>

---

<!-- layout: section -->
<!-- class: brand -->

#### Part two

# Presenting

---

<!-- build -->

## Builds reveal one step at a time

- `<!-- build -->` turns every list item into a step
- `<!-- build: dim -->` also dims the earlier steps
- Mark anything else with `{.fragment}` at the end of its line
- **←** steps back, and the overview shows everything

???
Next/Previous walk through the steps before changing slides.
The presenter view tells you how many builds remain on the current slide.

---

## Fragments on anything

A paragraph can appear on its own. {.fragment}

So can a highlight that changes colour. {.fragment .highlight}

<p class="fragment fade muted">Raw HTML elements take the class too.</p>

---

<!-- class: dark -->

## Code, tables and emphasis

|||

```js
// Fenced code keeps formatting
export function next() {
  if (step < steps) step++;
  else slide++;
}
```

|||

| Key | Action |
|:---|:---|
| `→` `Space` | Next |
| `O` | Overview |
| `S` | Presenter view |
| `F` | Fullscreen |

Text can be **bold**, *italic*, ==highlighted==, ~~struck~~ or `code`.

---

<!-- layout: center -->

## Presenter view

Press **S** to open a synced window with notes, the next slide and a timer.

Move either window and the other follows.

???
This is what the notes look like. Use them for the things you want to say
but don't want on the slide.

- Lists work in notes
- So does **emphasis**

---

<!-- layout: center -->

## Print or save as PDF

**⌘/Ctrl + P** prints one slide per page, with every build revealed.

<span class="muted small">Link to any slide with `#/n` in the URL.</span>

---

<!-- layout: statement -->
<!-- class: dark -->

Now ask Claude Code for a deck.

See `CLAUDE.md` for the full authoring reference.
