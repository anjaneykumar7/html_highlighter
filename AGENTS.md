# AGENTS.md: html_highlighter

Instructions for coding agents (Claude Code, Codex, Cursor…) working in this
package. Read `CONTEXT.md` first for how the pieces fit, and `README.md` for
the public API.

## Commands

Two Flutter SDKs are in play on this machine: an FVM-pinned 3.35.2 and the
global `flutter` (3.44, which the playground was last built with). Both work.
**Stick to one per build folder**: mixing them breaks the native build cache
(see Gotchas).

```bash
flutter pub get && flutter analyze && flutter test        # package
cd web && npm install && npm test && npm run typecheck    # web version
flutter test --plain-name "page controls"                 # tests whose name contains this
cd example && flutter analyze && flutter test             # playground
cd example && flutter run -d macos                        # macOS
cd example && flutter run -d <simulator-udid>             # iPad / iPhone simulator
cd example && flutter run -d macos --dart-define=SELF_TEST=true   # automated check
```

A change is done only when `analyze` reports no issues and all tests pass in
**both** the package and `example/` (and `npm test` in `web/` when you touch
it). Behaviour changes in page scripts also
need a run in a real WebView (Self-test, plus a manual check by touch on iOS
and Android).

**Driving a background `flutter run`** (no stdin): send it signals.
`kill -USR1 <pid>` hot-reloads; `kill -USR2 <pid>` hot-restarts. Find the pid
with `ps -ax | grep "flutter_tools.snapshot run"`. Const strings, such as the
page scripts and the sample HTML, need a hot restart; a hot restart also
re-runs the self-test when the app was started with `SELF_TEST=true`. Changes
to `pubspec.yaml` dependencies, native project files or the app id need a full
rebuild (stop and `flutter run` again).

## Rules

1. **The JS engine in `assets/highlighter.js` is shared behaviour.** It is one
   engine (no modes), and apps' saved highlights depend on its model format.
   - Keep it one file, one engine, and free of `console.log` (a test enforces
     this; `console.error` / `warn` for real problems are fine).
   - Don't change the model shape (`commonId`, `id`, `startOffset`,
     `endOffset`, `userType`, optional `color`), the channel names, the
     payload shapes, or the `setHighlightFromFlutter` signature.
   - Put new page-side behaviour outside the engine IIFE: in a separate
     script (mouse shim, colour layer, default CSS) or, if every page with
     the engine needs it, after the engine in `highlighter.js` (the
     stale-selection guard, the page controls, the no-selection-across-media
     rule).
   - If an engine change is unavoidable, tell the user, record it in
     `CHANGELOG.md` under *Fixed*, and add a regression test that reads the
     asset (see the `commonId` test).
2. **Channel names are a contract.** Keep them in `HighlightChannels`. The
   bridge must register each name at most once per host, because iOS/macOS
   throw on duplicates.
3. **Keep the bridge renderer-agnostic.** All page access goes through
   `HighlightHost` (`runJavaScript`, `addChannel`). Don't reach for
   `WebViewController` inside `HtmlHighlightBridge`.
4. **Colour has two halves that must agree.** The page map (`__hlColorLayer`)
   and the Dart map (`HighlightColorBook`) are both fed by `setHighlightColor`
   and by `restore`. Change one, change the other. Saved models without a
   `color` must keep the engine default and never be recoloured.
5. **A switch has three parts.** A page control in `highlighter.js`
   (`__hlSet…`), a bridge method that calls it, and a widget option that the
   widget applies on every page load and on change. Add or change all three
   together, with a test for the bridge call.
6. **Don't drop the default gestures.** `defaultHighlightGestureRecognizers`
   must keep `LongPressGestureRecognizer`; without it iOS highlighting breaks.
7. **Platforms:** Android, iOS, macOS only. Don't claim web/Windows/Linux
   support without a working `HighlightHost` for them.
8. **Public API** is whatever `lib/html_highlighter.dart` exports. Update
   `README.md` (options table included), `CONTEXT.md` (file table) and
   `CHANGELOG.md` when it changes. Keep `src/` private.
9. **Playground debug code stays in `example/`.** `debug_tools.dart`, the JS
   console, the media check script and Self-test aren't package API.
10. **The web version (`web/`) must keep the same saved format and features.**
    A feature added to one side (Flutter package or `web/`) should be added
    to the other, or the gap recorded in both READMEs. Keep `web/react.js`
    starting with `"use client"` and both web modules free of top-level
    `window` / `document` access (`test/ssr.test.js` checks). Keep the
    `.d.ts` files in step with the code (`npm run typecheck`). Style changes
    go in both `web/Highlighter.css` and `DEFAULT_CSS` (a test compares
    them).
11. **Published on pub.dev** (repository: github.com/anjaneykumar7/html_highlighter).
    A release: bump `version` in `pubspec.yaml`, add the version's section
    to `CHANGELOG.md`, run `flutter pub publish --dry-run` (no warnings),
    then the maintainer runs `flutter pub publish` (it needs their Google
    sign-in). A published version can't be deleted. `.pubignore` keeps
    `web/` and the agent docs out of the package.

## Gotchas

- **Highlights invisible?** The page is missing `highlightDefaultCss` (the
  engine only adds a class).
- **iOS: nothing highlights** ("No range found" in the JS console)? The
  WebView doesn't own long-press. Keep `defaultHighlightGestureRecognizers`.
- **iOS: a long-press didn't create a highlight?** If text was already
  selected (for example right after the self-test, which leaves a scripted
  selection), iOS spends the next touch dismissing it. Hold again.
- **iOS: PDF iframe blank, or video stuck loading?** An iframe pointed
  straight at a PDF or `.mp4` doesn't work in WKWebView. Use a `srcdoc` page:
  pdf.js for the PDF (its host must allow CORS), `<video playsinline>` for the
  video, and keep the widget's `allowsInlineMediaPlayback` on. See
  `videoFrame` / `pdfFrame` in `example/lib/sample_content.dart`. Off-screen
  iframes may only render once scrolled into view.
- **A removal logs `change` twice.** The engine sends the full list twice on
  removal; harmless.
- **Blank WebView on macOS?** The `network.client` entitlement is missing.
- `WebViewController.setBackgroundColor` throws `UnimplementedError` on
  macOS. Wrap it in a try/catch.
- **Xcode "deployment target … supported range is …"?** iOS needs 15.0+ and
  macOS 12.0+, in both the `Podfile` (plus its `post_install` override) and
  `Runner.xcodeproj`.
- **macOS build "has been modified since the module file"?** It's a stale
  native cache after switching Flutter SDKs. Delete `example/build/macos`.
- The playground's app id is `com.example.htmlHighlighterExample` (Android
  package `com.example.html_highlighter_example`). Changing it installs a
  second copy on a simulator; remove the old one with
  `xcrun simctl uninstall <udid> <old id>`.
- `flutter analyze` at the package root also scans `example/`.
- **npm install fails with ENOENT in `_cacache`?** The npm cache is corrupt;
  install with `--cache <some temp dir>` (or run `npm cache verify`).
- `node --test test/` doesn't take a folder on Node 22; `npm test` uses
  `node --test test/*.test.js`.
- The web demo is served by `.claude/launch.json` (`web-demo`, port 8765);
  the React demo loads React from esm.sh. The Next.js example is
  `nextjs-example` (port 3100; run `npm run pack-lib && npm run build` in
  `web/examples/nextjs` first, after any library change).
- **Android emulator stuck "offline", log says `hvf is not enabled` and
  `mprotect failed`?** Emulator 36.6 turns hardware acceleration off for the
  Android 37 16 KB-page image (`google_apis_playstore_ps16k`) on this Mac,
  wherever it's started from (`-accel-check` still says HVF works). Use an
  Android 35 arm64 image: the `hl-android35` AVD (Pixel 7). It needs about
  7.4 GB free disk for its data partition and ignores `-partition-size`.
  A stale `multiinstance.lock` makes an AVD refuse a second start; use
  `-read-only` rather than deleting someone's AVD data.
- **Android: "isn't responding" on a slow emulator?** A debug build runs Dart
  on the main thread through the JIT; on an emulator short of memory (software
  GL, swapping) frames take seconds and input times out. Test with
  `flutter build apk --release --dart-define=SELF_TEST=true` and
  `adb install`; `I/flutter` logs still reach `adb logcat -s flutter`.
- **Android: a long-press didn't highlight?** Check the `touchcancel` rule
  at the end of `highlighter.js` is there: Android ends a selecting
  long-press with `touchcancel`, not `touchend`. Drive touch with
  `adb shell "input motionevent DOWN x y; sleep 1.2; input motionevent UP x y"`
  (device pixels); `input swipe` on one spot didn't select.
- The blog (`.blog/`) must be served from the package root (`blog` in
  `.claude/launch.json`, port 8766); its demo imports `../web/highlighter.js`
  and `../web/Highlighter.css`, which `file://` can't load.
- **Next.js build fails with "Element type is invalid … got undefined"?** In
  the example it means Next.js picked `web/` as the workspace root (it has a
  lockfile); `next.config.mjs` pins `turbopack.root`. In an app, check for a
  second React copy (a linked library folder).
- **Reading the run log is misleading on the iOS simulator.**
  - The `flutter run` output lags behind the app, because the device log is
    forwarded in batches.
  - Flutter's default `debugPrint` is rate-limited; the playground switches
    to `debugPrintSynchronously`.
  - Simulator screenshots can come from before the next frame; take a second
    one before concluding a tap was lost.

  A tap can look "lost" in the log while the app already handled it. An
  earlier "lost tap" investigation found exactly this. Judge behaviour by the
  playground's **in-app event log**.
- **Simulator coordinates:** `touch_path`/`tap` take device points, not
  screenshot pixels. The iPad Air 11" is 820×1180 points. Native text
  selection needs a hold of about 900 ms on a word; removing a highlight needs
  a hold of over 350 ms.

## Testing tips

- WebViews don't run in `flutter test`. Unit-test the Dart side with a fake
  `HighlightHost` (see `_FakeHost` in `test/html_highlighter_test.dart`), and
  check the page behaviour in a real WebView. Tests that need the engine's
  source read `assets/highlighter.js` directly.
- **Self-test** (playground button, or `--dart-define=SELF_TEST=true`): look
  for `SELFTEST … PASS` lines covering create, colour, popup-after-create,
  long-press removal, list item, table cell, image neighbour, iframe
  neighbour and media-span-blocked (9 checks). It uses synthetic *mouse* events, so the touch guard
  isn't exercised: on iOS also test real touch by hand.
- **Quick browser check** without building an app: write a page with
  `buildHighlightDocument` from a throwaway test, serve it locally, stub the
  channels with a `<script>` in `head`, and run the self-test script in a
  browser.
- **Manual checklist** (playground, any platform):
  1. Pick a colour and select text (mouse) or long-press a word (touch). The
     highlight appears in that colour, the event log shows `change … in
     <container>`, and the saved JSON gains an entry with `"color"`.
  2. Pick another colour and highlight again. The first highlight keeps its
     colour.
  3. Highlight inside a list item, a table cell and the image caption.
  4. Tap a highlight: the popup appears. "Add to notes" adds an entry.
  5. Press and hold (or right-click) the highlight. It's removed and the JSON
     shrinks. On touch, then tap other text: the highlight must stay gone
     (the self-test can't check this; its events are synthetic).
  6. "Reload page": every highlight comes back in its own colour.
  7. Turn off "Highlighting enabled" and check you can't create or remove a
     highlight, while tapping one still opens its popup. Turn off "Show 'Add
     to notes'" and check tapping a highlight shows nothing. Turn both on.
  8. `clear()` empties the page but keeps the saved JSON.
  9. Scroll to "Watch and read": the video plays inline, the PDF shows its
     first pages, and the text before and after the iframes highlights. A
     selection dragged across the video or PDF is cleared and never
     highlights. The
     JS console shows `media: … loaded`, `video ready …` and `pdf rendered …`.
