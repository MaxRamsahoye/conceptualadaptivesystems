# Conceptual

Designed presentations on civilisation research.

**Live:** https://maxramsahoye.github.io/conceptualadaptivesystems/

A small static site for **presenting** slide decks. Decks are plain Markdown
files written with Claude Code; the site renders and presents them. No build
step, no dependencies — host it on GitHub Pages or any static server.

## Use it

```sh
python3 -m http.server      # then open http://localhost:8000
```

- **Library** (`index.html`) — every deck with a live thumbnail, search (`/`).
- **Viewer** (`deck.html?d=<id>`) — `←` `→` / Space / click / swipe to move,
  `O` overview, `F` fullscreen, `T` light/dark, `B` black out, digits + Enter to jump, `?` for help.
  Every slide has a URL (`#/5`).
- **Presenter view** (`S`) — a second window with notes, next slide, build count,
  timer and clock; it stays in sync with the audience window either way.
- **PDF** — print from the viewer (⌘/Ctrl+P): one slide per page, builds revealed.

## Make a deck

Ask Claude Code, e.g. *"Make a 10-slide deck introducing conceptual adaptive
systems."* The format and workflow are in [`CLAUDE.md`](CLAUDE.md); the
[`welcome`](decks/welcome/deck.md) deck is a working tour of every feature.

```sh
node tools/check.mjs          # validate all decks
node tools/render.mjs <id>    # screenshot slides to .renders/<id>/ (needs Playwright)
```

## Deploy

GitHub Pages: Settings → Pages → deploy from branch `main`, folder `/`.
The `.nojekyll` file keeps Jekyll from rewriting the `.md` decks.

## Credits

Type: [ET Bembo](https://github.com/DavidBarts/ET_Bembo) (MIT) and
[IBM Plex Sans Arabic](https://github.com/IBM/plex) (SIL OFL 1.1); licences in `assets/fonts/`.
