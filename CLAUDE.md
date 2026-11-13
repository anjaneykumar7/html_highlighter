# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The agent rules, commands and gotchas for this package live in `AGENTS.md`,
which is imported here so there's one source of truth. `CONTEXT.md` explains
how the pieces work and why (engine quirks, colour layer, model format,
platform notes); read it before changing behaviour. `README.md` is the public
API reference.

@AGENTS.md

The web version lives in `web/` (plain ES modules, React bindings, its own
`README.md` and tests: `cd web && npm test`).

## Running a subset of tests

```bash
flutter test test/html_highlighter_test.dart                # one file
flutter test --plain-name "colours"                         # tests/groups whose name contains "colours"
flutter test --plain-name "bridge works over any HighlightHost"
cd example && flutter test                                  # playground widget test
```

All package tests are in `test/html_highlighter_test.dart` and use `_FakeHost`
in place of a WebView.

## Architecture in brief

A Flutter package that highlights text in HTML shown in a `webview_flutter`
WebView. Two halves talk over JS channels:

- **Page side** (inside the WebView), assembled by `buildHighlightDocument`
  in this order: `highlightDefaultCss` → content wrapped in
  `highlightContainer(...)` divs (any number) → the engine
  (`assets/highlighter.js`) → `highlightColorLayerScript` →
  `HighlighterScripts.mouseSelectionShim` → the app's `addScripts`. The
  engine is touch-only and colour-blind.
  Inside `highlighter.js`, after the engine IIFE, come the stale-selection
  guard and the page controls (on/off, "Add to notes" popup); colours and
  mouse support are separate scripts.
- **Dart side**: `HtmlHighlightBridge` registers the channels named in
  `HighlightChannels`, parses messages into `HighlightChange` /
  `HighlightNoteRequest` / `HighlightRestoreStatus`, stamps `"color"` onto
  every model via `HighlightColorBook`, and drives the page with
  `runJavaScript` (`restore`, `setHighlightColor`, `clear`, toggles). It only
  sees the page through the `HighlightHost` interface
  (`WebViewHighlightHost` in production, a fake in tests).
- `HighlightableHtmlView` is the convenience widget that wires both halves and
  supplies `defaultHighlightGestureRecognizers`.

Things that span several files and are easy to break:

- **Payloads**: changes arrive as `{status, userType, data: [models]}`;
  restore sends `{userType, highlights}` and stamps `userType` on every model
  (older saved data may have none). Each model's `id` is its container's DOM
  id, which is how an app tells question / explanation / article apart.
- **On/off switches go through page controls**, not the engine:
  `setUserHighlightEnabled` → `__hlSetHighlightingEnabled` (which also calls
  the engine's `toggleUserHighlight`), `setAddToNoteVisible` →
  `__hlSetAddNoteVisible`. The widget re-applies them on every page load.
- **Changes are full snapshots**: every add/remove posts the whole `models`
  array, not a diff.
- **Colour is mirrored**: the page-side `__hlColorLayer` map and the Dart
  `HighlightColorBook` must both be updated by `setHighlightColor` and seeded
  by `restore`.
- **Mouse support works by dispatching the engine's own events**
  (`touchend` to create, `contextmenu` to remove) rather than duplicating
  engine logic.
- `example/` is a playground app (one combined page with list, tables, image
  and video / PDF iframes; colour picker, switches, saved JSON, event log, JS
  console, Self-test); its debug code is not package API.
