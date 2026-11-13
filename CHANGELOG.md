# Changelog

## 0.1.1

- Docs: install with `flutter pub add`; the README links the source on
  GitHub, the engine (`assets/highlighter.js`) and the web module's
  `highlighter.js`, `react.js` and `Highlighter.css`.
- Docs: screenshots in the README and on pub.dev (`doc/images/`).
- The blog is no longer part of the repository.
- The web module is on npm as `html-highlighter-web`, at the same version
  as this package (a test keeps `pubspec.yaml` and `web/package.json` equal).

## 0.1.0

First version.

### Added

- **Web version (`web/`):** `highlighter.js` (framework-agnostic ES module,
  `createHighlighter`), `react.js` (`HighlightableHtml`, `useHighlighter`,
  `"use client"` for Next.js) and TypeScript types. Same features and saved
  JSON as the Flutter package; demos in `web/demo/`, a Next.js 16 example in
  `web/examples/nextjs/`, tests with Node's test runner and jsdom. With a
  mouse it opens the popup on hover and removes a highlight on click
  (`popupOnHover`, `clickToRemove`; web only), and the popup moves above the
  highlight when media or the window edge is below it. Styles ship as
  `web/Highlighter.css` (`html-highlighter-web/Highlighter.css`; use with
  `injectStyles: false`), the same rules as `DEFAULT_CSS`.
- **Engine:** one engine, `assets/highlighter.js`. It highlights inside any
  number of containers, so one page can hold a question, its explanation and
  article sections, and has no debug logging. Loaded with
  `HighlighterScripts.load()`. Models saved without `userType` restore as
  the owner passed to `restore` (default `student`).
- **Bridge:** `HtmlHighlightBridge`. It registers channels (`attach`),
  restores saved highlights (`restore`, payload `{userType, highlights}`), and
  provides `clear`, `setUserHighlightEnabled`, `setAddToNoteVisible`,
  `toggleStudyAssist` and `runScript`. It's built
  on the renderer-agnostic `HighlightHost` / `WebViewHighlightHost`.
- **Events:** `HighlightChange` (`models`, `userType`, raw `data`), `HighlightNoteRequest` (`cleanHtml`) and `HighlightRestoreStatus`.
  Channel names live in `HighlightChannels`.
- **Markup helpers:** `highlightContainer`, `highlightContainerId` and
  `buildHighlightDocument`.
- **Widget:** `HighlightableHtmlView`, with `initialHighlights`,
  `onHighlightChanged`, `onAddToNote`, `onCreated`, `onLoaded`, `onLoadError`,
  `addCss`, `head`, `addScripts` (a list; each entry a `<script>` block or
  plain JS) and `loadingBuilder`.
- **No highlights across media:** a selection inside a container that contains
  or crosses an iframe, video, audio, image, SVG, canvas, `object` or `embed`
  is cleared as soon as it forms and never becomes a highlight (page controls
  in `highlighter.js`).
- **Inline media:** `HighlightableHtmlView.allowsInlineMediaPlayback` (default
  `true`) creates the WebView so video plays inside the page on iOS/macOS
  (the iOS plugin turns it off by default). Adds a direct dependency on
  `webview_flutter_wkwebview` `^3.26.2`.
- **On/off switches:** `HighlightableHtmlView.highlightingEnabled`
  / `HtmlHighlightBridge.setUserHighlightEnabled` (no creating or removing
  highlights while off; existing ones still open their popup) and
  `showAddToNote` / `setAddToNoteVisible` (hide the "Add to notes" popup).
  Implemented as page controls in `highlighter.js`, after the engine.
- **Per-highlight colours:** `highlightColor` /
  `HtmlHighlightBridge.setHighlightColor`, saved as `"color"` in each model and
  re-applied on restore. Built from `highlightColorLayerScript` (page) and
  `HighlightColorBook` (Dart), with `highlightColorToCss` /
  `highlightColorFromCss`. Highlights saved without a colour keep the engine
  default. The engine is unchanged.
- **Default styles:** `highlightDefaultCss` (article highlight colours and
  `.noselect`), included by default (`defaultStyles`).
- **Mouse / trackpad:** `HighlighterScripts.mouseSelectionShim`, included by
  default (`mouseSelection`). Finishing a selection creates a highlight, and
  press-and-hold removes one.
- **Gestures:** `defaultHighlightGestureRecognizers`, used by default by
  `HighlightableHtmlView`.
- **Playground app** (`example/`, Android/iOS/macOS): one page with question,
  explanation and article containers (lists and tables inside), colour
  picker, "Highlighting enabled" / "Show 'Add to notes'" switches, `clear()`,
  saved JSON, notes, event log, JS console, "Reload page", `addCss` /
  `addScripts` demo, an inline-SVG image and video / PDF iframes (with a
  script that logs whether they loaded), and a Self-test button / `SELF_TEST`
  define (8 checks, including text next to an image and an iframe).
- Docs: `README.md`, `CONTEXT.md`, `AGENTS.md`.

### Fixed

- **Android: a long-press never created a highlight.** Chrome on Android
  ends a long-press that selects text with `touchcancel`, not `touchend`,
  and the engine highlights on a container's `touchend`. A small rule after
  the page controls in `highlighter.js` (outside the engine) now finishes
  such a touch with `touchend` when a new selection formed during it; a
  cancelled scroll is ignored. The web version treats `touchcancel` the same
  way. Found on an Android 35 emulator; a regression test reads the asset.
- **Playground on Android (release builds):** the app had no `INTERNET`
  permission outside debug/profile, so the sample video and PDF failed to
  load (`ERR_CACHE_MISS`). The main manifest now declares it.
- **Touch: a removed highlight came back on the next tap.** Holding a highlight to remove it made the WebView select
  the word underneath; the selection outlived the removal, and the next
  `touchend` in any container highlighted it again, even with user
  highlighting off. A stale-selection guard in `highlighter.js` (after the
  engine) now clears the selection when a press
  removes its highlight, and ignores any selection that existed before the
  current touch.
- **The popup never opened after a new highlight.** The engine's post-create
  callback read an undefined `commonId` and threw right after sending the
  change; it now uses `highlightedData.commonId`.
- **Highlights were invisible without the host app's CSS**, because the engine
  only adds a class. `highlightDefaultCss` now ships with the package.
- **iOS / iPadOS: nothing could be highlighted.** The WebView didn't own
  long-press, so native text selection never started. The widget now claims
  tap, long-press, drag and scale by default.
- **macOS:** `setBackgroundColor` threw `UnimplementedError` and stopped the
  page from loading. It's now best-effort.
- `HighlightNoteRequest.cleanHtml` now also strips per-highlight colours, but
  only on highlight spans.

### Notes

- iOS WKWebView won't draw a PDF in an iframe pointed straight at it, and an
  iframe pointed straight at an `.mp4` never played. The playground uses
  `srcdoc` iframes instead (pdf.js for the PDF, `<video playsinline>` for the
  video); both work on the iPad simulator.
- Requires `webview_flutter` 4.14.1 or later (tested with 4.14.1; iOS/macOS
  plugin 3.26.2, Android 4.14.1).
- Playground deployment targets: iOS 15.0 and macOS 12.0 (required by current
  Xcode). It also needs the macOS `network.client` entitlement.
- Investigated "lost taps" on the iPad simulator and found no bug; the run log
  and screenshots were lagging behind the app. The playground now uses
  `debugPrintSynchronously`.
