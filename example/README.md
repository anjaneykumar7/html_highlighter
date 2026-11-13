# html_highlighter playground

A test app for the [`html_highlighter`](../README.md) package. It shows one
page of sample medical content (a question, its explanation and an article,
with lists, tables, an image, and video / PDF iframes) so you can try every
feature and see exactly what an app would save. App id:
`com.example.htmlHighlighterExample`.

Platforms: **macOS, iOS / iPadOS, Android**. Web, Windows and Linux aren't
supported, because `webview_flutter` can't run there.

## Run

```bash
flutter run -d macos                               # Mac (mouse / trackpad)
flutter run -d <simulator-udid>                    # iPad / iPhone simulator (touch)
flutter run -d <android-device>                    # Android
flutter run -d macos --dart-define=SELF_TEST=true  # run the self-test on start
```

Setup this project already has, which your own apps need too:
- **macOS:** the `com.apple.security.network.client` entitlement, without
  which the WebView is blank, and a deployment target of 12.0.
- **iOS:** a deployment target of 15.0.
- The video and PDF iframes need a network connection (the PDF also loads
  pdf.js from cdnjs). Each iframe holds a small `srcdoc` page: a
  `<video playsinline>` and a pdf.js renderer, because iOS won't play or draw
  an iframe pointed straight at an `.mp4` or a PDF.

## What's on screen

On a tablet or desktop the page and the panel sit side by side; on a phone
(narrower than 720 points) the page is on top and the panel below it.

| Area | What it does |
|---|---|
| Page (left) | the highlightable WebView: question, explanation and article sections, with a list, tables, an image and video / PDF iframes inside highlight containers |
| **Highlight colour** | colour for *new* highlights. Each highlight keeps its own colour, saved as `"color"`. The last swatch is the engine default (yellow, no colour saved). |
| **Reload page** | rebuilds the WebView and restores the saved list, to check restore |
| **Self-test** | runs automated checks inside the real WebView |
| **Forget saved** | clears the saved list (the page keeps its highlights until reload) |
| **clear()** | remove all highlights on the page (the saved list is kept) |
| **Highlighting enabled** | allow creating and removing highlights (`highlightingEnabled`) |
| **Show "Add to notes"** | show the popup when a highlight is tapped (`showAddToNote`) |
| **Saved highlights** | the JSON an app would persist |
| **Notes** | entries from the highlight popup's "Add to notes" |
| **Event log** | every change, note, colour pick, reload and page load |
| **JS console** | the page's `console.log` and errors (also printed as `[js] …`), including the `addScripts` demo lines and `media: …` iframe checks |

## How to use it

- **Highlight:** select text with the mouse, or long-press a word on touch.
- **Popup:** tap or click a highlight (unless "Show 'Add to notes'" is off).
- **Remove:** press and hold a highlight (or right-click it with a mouse).
- **On touch,** if a long-press doesn't highlight, iOS was dismissing an
  earlier selection: hold again.

## Self-test

Prints `SELFTEST <check> PASS|FAIL` for: `create`, `colour`,
`popup-after-create`, `longpress-remove`, `contextmenu-remove` (only if
needed), `list-item`, `table-cell`, `image-neighbour` (highlights the image
caption; the image must still be loaded) and `iframe-neighbour` (highlights the
text after an iframe; the iframe must stay in place) and `media-span-blocked`
(a selection from the paragraph before an iframe to the one after it must be
cleared and not highlighted). It uses synthetic mouse
events, so on iOS also check real touch by hand. It leaves a scripted
selection behind, so the first long-press after it may only dismiss that.

## Reading the logs

- App events print as `[event] …` and the page console as `[js] …`.
- On the iOS simulator the `flutter run` output lags behind the app, so a tap
  can look lost in the terminal when it already worked. **Trust the in-app
  event log.**

## Files

| File | Purpose |
|---|---|
| `lib/main.dart` | the playground UI |
| `lib/sample_content.dart` | the sample page (`samplePageBody`), image and media URLs, `videoFrame` / `pdfFrame`, its CSS and the `addScripts` demo (including the media check) |
| `lib/debug_tools.dart` | console forwarding and the self-test script (playground only, not package API) |
| `test/widget_test.dart` | checks the sample page's containers, list, tables, image and iframes, and that the media frames' `srcdoc` is escaped correctly |
