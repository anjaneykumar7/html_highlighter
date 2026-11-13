# Context: html_highlighter

Background for anyone, human or agent, working on this package. `README.md`
covers how to *use* it; this file covers how it *works* and why.

## How it fits together

```
Flutter (Dart)                                     Page (inside the WebView)
──────────────                                     ─────────────────────────
HighlightableHtmlView                              <head> head, highlightDefaultCss, addCss
  │  buildHighlightDocument() ───── loads ──────▶  <div data-highlight-type="highlight-range"
  │  gestureRecognizers (long-press on iOS!)              id="highlight-container--<type>-<id>">…</div>
  │                                                <script> highlighter.js </script>
  │                                                <script> highlightColorLayerScript </script>
  │                                                <script> mouseSelectionShim </script>
  │                                                <script> addScripts… </script>
  ▼
HtmlHighlightBridge
  ├─ attach() ── channels ◀──────────────────────  HighlightChangeChannel.postMessage(json)
  │    └─ stampColors() adds "color" (HighlightColorBook)
  │                         ◀──────────────────────  AddToNoteChannel.postMessage(json)
  │                         ◀──────────────────────  HighlightChannel.postMessage(json)  (restore status)
  ├─ restore() ─ runJavaScript ────────────────▶  __hlColorLayer.seed(models); setHighlightFromFlutter(payload)
  ├─ setHighlightColor() ──────────────────────▶  __hlColorLayer.setPen(css)
  ├─ setUserHighlightEnabled() ────────────────▶  __hlSetHighlightingEnabled(b)
  ├─ setAddToNoteVisible() ────────────────────▶  __hlSetAddNoteVisible(b)
  └─ clear() / toggleStudyAssist() ────────────▶  clearModels() / toggleStudyAssist()
  │
HighlightHost (interface) ── WebViewHighlightHost wraps WebViewController
```

| File (`lib/src/`) | Role |
|---|---|
| `highlight_engine.dart` | `HighlighterScripts`: loads `packages/html_highlighter/assets/highlighter.js` (cached), `scriptTag`, `mouseSelectionShim` |
| `highlight_container.dart` | `highlightContainer()` / `highlightContainerId()`: the markup the engine selects on |
| `highlight_styles.dart` | `highlightDefaultCss`: highlight colours by owner and `.noselect` |
| `highlight_colors.dart` | `highlightColorLayerScript` (page), `HighlightColorBook` (Dart), CSS colour converters |
| `highlight_events.dart` | parsing channel messages: `HighlightChange`, `HighlightNoteRequest`, `HighlightRestoreStatus` |
| `highlight_channels.dart` | channel names (`HighlightChannels`) |
| `html_highlight_bridge.dart` | channel registration, colour stamping, restore, colour pen, on/off switches, `clear` |
| `highlight_host.dart` | renderer abstraction (`HighlightHost`, `WebViewHighlightHost`); fakes in tests |
| `highlightable_html_view.dart` | the convenience widget (creates the controller with inline media playback on iOS/macOS), `buildHighlightDocument`, `defaultHighlightGestureRecognizers` |

## Inside `assets/highlighter.js`

The file has three parts, in this order:

1. **The engine**, in an IIFE. It wires every container on the page (any
   number) and publishes `setHighlightFromFlutter`, `clearModels`,
   `toggleUserHighlight` and `toggleStudyAssist` on `window`; everything else
   stays private. It has no comments beyond a header and no debug logging (a
   test keeps `console.log` out; it only reports real problems with
   `console.error` / `console.warn`).
2. **The stale-selection guard** (see [Touch](#touch-and-the-stale-selection-guard)).
3. **The page controls**, which back the on/off switches:
   - `__hlSetHighlightingEnabled(on)`. While off, it blocks in the capture
     phase: creating (container `touchend`, including the mouse shim's
     synthetic one) and removing (the span `touchstart` that starts the
     long-press timer, and `contextmenu`). It also makes container text
     unselectable and calls the engine's own `toggleUserHighlight`, so the
     engine's state matches. Taps on existing highlights still open the popup.
   - `__hlSetAddNoteVisible(show)` toggles a body class whose CSS hides the
     highlight popup (the popup only holds "Add to notes").
   - **Always on: no selections across media.** A selection inside a
     container that contains or crosses `iframe, video, audio, img, picture,
     svg, canvas, object, embed` (checked with `Range.intersectsNode`) is
     cleared on `selectionchange`, and a capture-phase `touchend` listener
     stops it reaching the engine in case one slips through (this also
     catches the mouse shim's synthetic `touchend`).
   - The bridge's `setUserHighlightEnabled` / `setAddToNoteVisible` call these.
     `HighlightableHtmlView` applies `highlightingEnabled` / `showAddToNote`
     on every page load and whenever they change.

Everything else the package adds (colours, mouse support, default styles,
gestures, the bridge) lives in separate scripts or in Dart.

## Engine behaviour worth knowing

- **Creating:** a highlight starts on the container's `touchend` when the
  selection isn't empty. Each highlight is a set of `<span>`s carrying
  `data-highlight-id` (= `commonId`). Overlapping highlights merge into a new
  `commonId`.
- **Tapping and removing:** tap a highlight to open its popup; long-press
  (350 ms) or right-click (`contextmenu`) to remove it. The engine blocks the
  page's own context menu.
- **Containers:** highlighting only works inside them; text outside can be
  selected but never highlighted. `data-highlighton="false"` makes a container
  unselectable.
- **Owners:** models carry `userType`. Only `student` models are reported
  back, and admin/ops highlights can't be removed by the user.
- **Styling:** the engine only adds the class `highlight-text-<userType>` to
  spans. Colour comes from CSS (`highlightDefaultCss`), so a page without it
  shows invisible highlights unless they have a per-highlight colour.
- **Change payload:** `{status, userType: "student", data: models}`, always
  the **whole** current list, not a diff. A removal sends it twice; as each
  message is the full list, apps don't need to care.
- **Images and iframes** inside a container are fine: offsets count text only,
  so they don't shift highlights, and highlighting text around them leaves
  them in place (the self-test checks both). An iframe's content is a separate
  document and can't be highlighted. When building "Add to notes" HTML the
  engine drops any `<img>` or `<p>` whose parent is a `<p>`, so put images in
  a `<figure>` or `<div>`.
- **Restore payload:** `{userType, highlights}`. `HtmlHighlightBridge.restore`
  stamps `userType` on every model (so models saved without one restore),
  retries once after 150 ms if the engine isn't loaded yet, and re-applies
  after 150 ms. The second pass nests duplicate spans in the page, but not
  duplicate models.
- **Selection edge case:** a triple-click or whole-paragraph drag ends the
  range at offset 0 of the next element. The engine treats "start offset ==
  end offset" as empty and ignores it.
- **Fixed in the engine:** the post-create callback read an undefined
  `commonId`, threw right after sending the change, and so the popup never
  opened after a new highlight. It now uses `highlightedData.commonId`
  (covered by a test that reads the asset).
- **Console:** nothing reaches Flutter unless the page defines a
  `ConsoleChannel`, as the playground does. `setHighlightFromFlutter` still
  posts one "function started" message to that channel when it exists.

## Touch and the stale-selection guard

The engine highlights whatever is selected when a container gets `touchend`,
with no check for when it was selected or whether highlighting is on (it only
relies on `.noselect` to stop *new* selections). On touch, holding a highlight
to remove it also makes the WebView select the word underneath, and the next
tap used to turn that leftover selection back into a highlight.

The guard listens in the capture phase to **trusted** touches only (synthetic
events from the mouse shim and the self-test are ignored):

- When a press removes its highlight, it clears the selection. The removed
  span is detached by the time the finger lifts, so its `touchend` never
  reaches `document`; the guard listens on the span itself.
- On a `touchend` inside a container, it drops any selection that already
  existed when the touch began. Only a selection made by the current touch can
  become a highlight.

A related iOS quirk that isn't a bug: when text is already selected, iOS uses
the next touch to dismiss that selection, so a long-press right after one may
not create a highlight. Holding again works.

## Per-highlight colours

The engine knows nothing about colour, so colour is layered on top:

- **Page:** `highlightColorLayerScript` keeps a `commonId → colour` map. A
  `MutationObserver` paints every `[data-highlight-id]` span as it appears.
  Unknown (new) ids get the current pen colour, set with
  `__hlColorLayer.setPen`. `__hlColorLayer.seed(models)` runs before each
  restore, so restored highlights get their saved colour. Ones saved without a
  colour are recorded as "default" and never repainted.
- **Dart:** `HtmlHighlightBridge.colors` (`HighlightColorBook`) keeps the same
  map and pen, and stamps `"color"` onto models in every change before the app
  sees them. Both sides take the pen from `setHighlightColor`, so they agree.
- Painting is an inline `background-color`, so it overrides the engine's class
  colour.
- `HighlightNoteRequest.cleanHtml` strips these colours from note HTML, but
  only on `data-highlight-id` spans, so content backgrounds survive.

## Mouse / trackpad support

The engine is touch-only. `mouseSelectionShim` adds three things:

- `pointerup` (mouse, left button) with a non-empty selection inside a
  container → dispatches `touchend` on that container, which creates the
  highlight.
- `pointerdown` held 350 ms on a highlight (moving more than 6 px cancels) →
  dispatches `contextmenu` on the span, so the engine's own removal handler
  runs and its rules still apply. The click that ends the hold is swallowed so
  the popup doesn't open.
- Touch pointers are ignored, so nothing fires twice on touch devices.

## Page document order

`buildHighlightDocument` builds: `<head>` with the app's `head`,
`highlightDefaultCss` (unless `defaultStyles: false`) and `addCss`; then the
body, the engine, the colour layer, the mouse shim (unless
`mouseSelection: false`) and finally each `addScripts` entry. An entry that
already starts with `<script` is used as is; anything else is wrapped in a
`<script>` block; blank entries are skipped. The engine must come after the
containers, because it wires them when the page loads.

## Model format (what apps persist)

```json
{"commonId": "aB3x…", "id": "highlight-container--explanation-<qid>",
 "startOffset": 120, "endOffset": 164, "userType": "student", "color": "#86EFAC"}
```
- `id` is the container's DOM id; its `<type>` part (`question`,
  `explanation`, `article`…) tells the app where the highlight lives.
- `color` is optional; data saved before colours existed has none.
- `userType` is the owner (`student`, `admin`, `ops`).
- Offsets are text offsets inside the container, so they break if its HTML
  changes.
- Store them JSON-encoded wherever suits the app, e.g. per question or per
  article.

## Platform notes

- Supported: Android, iOS, macOS (`webview_flutter` `^4.14.1`).
- **iOS/iPadOS:** highlighting relies on native long-press text selection, so
  the `WebViewWidget` must own `LongPressGestureRecognizer`
  (`defaultHighlightGestureRecognizers`). Without it the touch still reaches
  the page (`touchend` fires), but there's no selection ("No range found").
  Xcode needs an iOS deployment target of at least 15.0.
  Media: WKWebView doesn't draw a PDF in an iframe pointed straight at it,
  and an iframe pointed straight at an `.mp4` never started playing. What
  works (and the playground does): iframes with a small `srcdoc` page, one
  holding `<video playsinline>`, one rendering the PDF with pdf.js (the PDF's
  host must allow CORS). Inline video also needs the WebView's
  `allowsInlineMediaPlayback`, which the iOS plugin turns off by default; the
  widget creates its controller with it on (`allowsInlineMediaPlayback`
  option). WebKit may defer off-screen iframes, so the PDF renders when it
  scrolls into view.
- **macOS:** the app needs the `com.apple.security.network.client`
  entitlement. Without it WKWebView renders nothing, and Dart sees no error.
  `setBackgroundColor` is unimplemented there; the widget ignores the error.
  Xcode needs a deployment target of at least 12.0.
- **Android:** a long-press that selects text ends in `touchcancel`, not
  `touchend` (sequence: `touchstart`, `contextmenu`, selection,
  `touchcancel`). The engine highlights on a container's `touchend`, so
  `highlighter.js` finishes such a touch with `touchend` when a new selection
  formed during it (the rule after the page controls). Media need the app's
  `INTERNET` permission; Flutter only adds it to the debug and profile
  manifests, so a release build without it loads no remote video or PDF.
  The playground's network probe (a `no-cors` fetch to w3.org) logs
  `ERR_BLOCKED_BY_RESPONSE` in Chrome's WebView; it's only a debug check.
- Channel names must be unique per controller: iOS/macOS throw, Android
  replaces.
- Web isn't supported: `webview_flutter_web` has no JS channels or
  `runJavaScript`. A web version would need an iframe-based `HighlightHost`.

## What has been verified, and where

Current state = one engine, one combined page (with list, table, image and
iframes), `webview_flutter` 4.14.1, checked on the iPad Air 11" simulator
(iOS 26.5) with real touch, then on an iPhone 17 simulator (self-test 9/9,
touch highlights) and an Android 35 emulator (Pixel 7, release build, touch
through `adb input motionevent`). The macOS and Chrome columns were checked earlier
in the package's life, before the switch to a single engine.

| Check | iPad simulator (touch), current | Android 35 emulator (touch), current | macOS app, earlier | Chrome (in-app browser), earlier |
|---|---|---|---|---|
| Self-test: create, colour, popup, removal, list item, table cell, image and iframe neighbours, selection across an iframe blocked | ✓ 9/9 | ✓ 9/9 | ✓ (first four + list) | ✓ (first four + list) |
| Create by long-press in question / explanation / article / table cell | ✓ | ✓ (after the `touchcancel` fix) | ✓ (mouse) | ✓ (mouse) |
| Per-highlight colours + `"color"` saved; "Reload page" restores them in colour | ✓ | ✓ | — | ✓ |
| Popup and "Add to notes" | ✓ | ✓ | ✓ | ✓ |
| Remove by press-and-hold | ✓ | ✓ | ✓ (self-test) | ✓ |
| Remove by right-click | n/a | n/a | not confirmed | ✓ |
| Removed highlight stays gone after the next tap (guard) | ✓ | ✓ | n/a | n/a |
| Highlighting off: can't create or remove; tap still opens popup | ✓ | ✓ (create, remove) | — | — |
| "Add to notes" off: tap shows nothing | ✓ | — | — | — |
| `clear()` empties the page, saved list kept | ✓ | — | — | ✓ |
| `addScripts` (block and plain JS) run; `addCss` applied | ✓ | ✓ | — | — |
| Image (inline SVG) shows; text next to it highlights | ✓ | ✓ (self-test) | — | — |
| Video iframe (`srcdoc` page with `<video playsinline>`): plays inline | ✓ | ✓ (ready, 960×540) | — | — |
| PDF iframe (`srcdoc` page with pdf.js): renders its pages | ✓ (3 of 14 shown) | ✓ (3 of 14 shown) | — | — |

Not yet tested: a real iPad, iPhone or Android phone.

An investigation into "lost taps" on the iPad found no bug. The app handled
every tap; the `flutter run` log and the simulator screenshots were what
lagged behind. See AGENTS.md, Gotchas.

## Web version (`web/`)

A separate, framework-agnostic ES module with the same features and the same
saved JSON, for web pages; nothing in it is shared with the Dart code.

- `web/highlighter.js` is a fresh implementation, not a copy of
  `assets/highlighter.js`: the WebView engine relies on page-wide globals,
  `DOMContentLoaded` wiring and Flutter channels, and can't be torn down,
  which breaks in React. `createHighlighter(root, options)` scopes everything
  to one element (listeners on `root`, one popup per instance), and
  `destroy()` removes listeners and the popup and unwraps every highlight.
- **Offsets are compatible by construction:** both count every text node of
  the container in document order. A test restores offsets saved by the
  Flutter playground (262–270 → "infarcts") onto the playground's own HTML
  and checks a new web highlight gets the same numbers. The web version fixes
  the WebView engine's failure to restore a highlight starting at a text
  node's first character; the data format is unchanged.
- Behaviour mirrors the WebView: create on `mouseup` / `touchend`, popup on
  tap, remove on press-and-hold (pointer events for mouse, touch events for
  touch) or `contextmenu`, merge with the owner's overlapping highlights,
  report the owner's full list, other owners' highlights read-only, the
  stale-selection guard, and the no-selection-across-media rule. Unlike the
  WebView engine it doesn't block the page's context menu outside highlights.
- **Web-only interaction (not in the Flutter package):** with a mouse or pen,
  hovering a highlight opens its popup (`popupOnHover`; closes 300 ms after the
  pointer leaves both the highlight and the popup) and a click removes it
  (`clickToRemove`). A "pinned" popup (opened by a tap, or right after
  creating) ignores hover-out and closes on an outside click. The click's
  pointer type comes from `e.pointerType`, falling back to the last
  `pointerdown`/`touchstart`; a click that ends a text selection never
  removes.
- **Popup placement:** below the highlight's last line, unless that area
  overlaps media inside the root (checked with `getBoundingClientRect`) or the
  window bottom; then above its first line. Clamped to the window
  horizontally; `data-placement` on the popup says which. Found because a
  popup under "Text before the iframe" landed on the iframe and was hidden.
- `web/react.js` (`"use client"`) wraps it: `useHighlighter(ref, options)`
  creates the instance in an effect, keeps callbacks in a ref so prop changes
  don't recreate it, applies `color` / `enabled` / `showAddToNote` live, and
  redraws `highlights` when `contentKey` changes. `HighlightableHtml` renders
  containers with `dangerouslySetInnerHTML` (React doesn't touch their
  insides, so the highlight spans survive re-renders) and derives
  `contentKey` from the sections. StrictMode's double mount is safe because
  `destroy()` unwraps.
- Tests: `web/test/*.test.js` (Node's test runner + jsdom), including
  server-side rendering with no DOM and a TypeScript check of the `.d.ts`
  files. Checked in Chromium through `web/demo/`, and in a real Next.js 16
  App Router app (`web/examples/nextjs/`, installed from an `npm pack`
  tarball): production builds with Turbopack and webpack, `next start` and
  `next dev`, no hydration warnings, StrictMode draws each highlight once.
- **Styles:** `web/Highlighter.css` (exported as
  `html-highlighter-web/Highlighter.css`, `sideEffects: ["*.css"]`) holds the
  same rules as `DEFAULT_CSS`; a test keeps them identical. Apps import the
  file and pass `injectStyles: false`; without it the script injects
  `DEFAULT_CSS` as a `<style id="html-highlighter-styles">` (reference-counted,
  removed on the last `destroy()`). The Next.js example uses the file and
  CSS Modules, no `globals.css`.
- `HighlightableHtml` passes `id`, `className`, `style` and other attributes to
  its wrapper; the single-block container is set with `containerType` /
  `containerId` (an earlier `id`/`type` pair silently swallowed the wrapper's
  `id`, found by the Next.js test).

## Playground

`example/` (Android, iOS, macOS; app id `com.example.htmlHighlighterExample`)
has:
- one page with question, explanation and article containers (lists, tables,
  an inline-SVG image, and video / PDF iframes built by `videoFrame` /
  `pdfFrame`), and a colour picker
- "Highlighting enabled" and "Show 'Add to notes'" switches, `clear()`
- the saved JSON, notes, an event log and a JS console
- "Reload page", which rebuilds the WebView to prove restore works
- an `addCss` / `addScripts` demo (the scripts log to the JS console, and one
  reports whether each iframe loaded and whether the network is reachable;
  the frames themselves log "video ready …" and "pdf rendered …")
- a **Self-test** button that drives create, colour, popup, removal, list,
  table, image-neighbour, iframe-neighbour and media-span-blocked checks
  inside the real WebView

The debug helpers (`example/lib/debug_tools.dart`) are playground-only and not
part of the package. See `example/README.md`.
