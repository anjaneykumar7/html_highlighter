# html-highlighter (web)

Persistent, multi-colour text highlighting for HTML in a web page, with React
and Next.js bindings. It is the web counterpart of the Flutter package in the
parent folder and saves **the same JSON**, so highlights made in the app show
on the web and the other way round.

- Select text inside a highlight container to highlight it, in any colour.
- **Mouse / pen:** hover a highlight for its "Add to notes" popup; click it to
  remove it.
- **Touch:** tap a highlight for the popup; press and hold (350 ms) to remove.
- Right-click or press-and-hold also removes with a mouse.
- The popup opens below the highlight, or above it when media (an iframe,
  video, image) or the window edge is in the way.
- Overlapping highlights merge; every change reports the full list.
- Switches for highlighting on/off and for the popup.
- Selections across media (iframe, video, image…) are cleared, never highlighted.
- Touch: a highlight removed by press-and-hold doesn't come back on the next tap.
- Android: a long-press that selects text ends in `touchcancel`, not `touchend`;
  it still creates a highlight when a new selection formed during the touch.
- Plain ES modules, no build step, no dependencies. TypeScript types included.

## Files

| File | What it is |
|---|---|
| `highlighter.js` | the engine; framework-agnostic ES module |
| `react.js` | `HighlightableHtml` component and `useHighlighter` hook (`"use client"`) |
| `Highlighter.css` | the styles: highlight colours, the popup, "off" and unselectable states |
| `highlighter.d.ts`, `react.d.ts` | TypeScript types |
| `demo/` | plain-JS and React demo pages |
| `examples/nextjs/` | a Next.js 16 App Router app (Server and client components) |
| `test/` | tests (Node test runner + jsdom) |

## Install

```bash
npm install html-highlighter-web
```

To try local changes in an app, pack this folder (`npm pack`) and install the
tarball. Avoid `npm link` or a `file:` folder dependency: the folder's own
`node_modules` (React, used by the tests) would give your app a second copy
of React.

```js
import { createHighlighter, highlightContainer } from "html-highlighter-web";
import { HighlightableHtml, useHighlighter } from "html-highlighter-web/react";
```

React is an optional peer dependency (17+); the core needs nothing.

## Styles

Import `Highlighter.css` once and turn off the script's own style tag:

```js
import "html-highlighter-web/Highlighter.css";   // e.g. in Next.js app/layout.tsx
createHighlighter(el, { injectStyles: false });  // or <HighlightableHtml injectStyles={false} />
```

Without the import, the script adds the same rules as a `<style>` tag
(`injectStyles`, default `true`), so it also works with no CSS setup.
Override any rule after the file, e.g.
`.highlight-text-student { background-color: #fef08a; }`. Per-highlight
colours are inline and win over the class colour. The same CSS is exported
as the `DEFAULT_CSS` string.

## Markup

Highlighting works inside **containers**. Each needs an `id`; its DOM id is
what saved highlights point to:

```html
<div data-highlight-type="highlight-range" data-container-type="question"
     id="highlight-container--question-q1"> …your HTML… </div>
```

`highlightContainer({ type, id, html, enabled })` builds that string;
`highlightContainerId(type, id)` gives the id. `enabled: false` (attribute
`data-highlighton="false"`) makes a container unselectable. Text outside
containers can be selected but never highlighted.

## Plain JavaScript

```js
import { createHighlighter, highlightContainer } from "html-highlighter-web";

page.innerHTML = highlightContainer({ type: "article", id: "intro", html });
const hl = createHighlighter(page, {
  highlights: saved,                    // saved models to show
  color: "#86EFAC",                     // colour for new highlights
  onChange: (models) => save(models),   // full list after each add/remove
  onAddToNote: (note) => addNote(note.cleanHtml),
});

hl.setColor("#F9A8D4");
hl.setEnabled(false);          // no creating or removing
hl.setAddToNoteVisible(false); // no popup
hl.clear();                    // empty the page (your saved list is untouched)
hl.destroy();                  // stop, remove the popup, unwrap highlights
```

| Option | Default | Notes |
|---|---|---|
| `highlights` | – | saved models shown at start (same as calling `restore`) |
| `color` | `null` | CSS colour for new highlights, saved as `"color"`; `null` = the owner's CSS colour (yellow) |
| `enabled` | `true` | `false`: no creating or removing; existing highlights still open their popup |
| `showAddToNote` | `true` | `false`: no popup |
| `userType` | `"student"` | owner of new highlights; only this owner's highlights are reported and removable |
| `onChange(models, info)` | – | this owner's full list; `info.type` is `"add"`, `"remove"` or `"clear"` |
| `onAddToNote(note)` | – | `{ html, cleanHtml, text, identifier, model }` |
| `longPressMs` | `350` | press-and-hold time that removes |
| `addToNoteLabel` | `"Add to notes"` | popup button text |
| `popupAfterCreate` | `true` | open the popup right after a new highlight (stays open until you click elsewhere) |
| `popupOnHover` | `true` | mouse / pen: hovering a highlight opens its popup; it closes when the pointer leaves the highlight and the popup |
| `hoverDelayMs` / `hoverHideMs` | `150` / `300` | hover time before opening / grace time before closing |
| `clickToRemove` | `true` | mouse / pen: clicking one of your highlights removes it. `false`: a click opens the popup instead. A click that ends a text selection never removes; touch taps always open the popup |
| `injectStyles` | `true` | add the styles as a `<style>` tag; set `false` when you import `Highlighter.css` |

Methods: `getModels()`, `getAllModels()`, `restore(models)`, `remove(commonId)`,
`clear({ notify })`, `highlightSelection()`, `noteFor(commonId)`, `refresh()`
(redraw after you replaced the containers' HTML), `setColor`, `setEnabled`,
`setAddToNoteVisible`, `destroy()`.

## React

```jsx
import { HighlightableHtml } from "html-highlighter-web/react";

export function Question({ q, saved, onSave }) {
  return (
    <HighlightableHtml
      sections={[
        { type: "question", id: q.id, html: q.html },
        { type: "explanation", id: q.id, html: q.explanation },
      ]}
      highlights={saved}
      onChange={onSave}
      onAddToNote={(note) => addNote(note.cleanHtml)}
      color="#86EFAC"
      enabled
      showAddToNote
    />
  );
}
```

- Props are the options above plus `sections` (or one `html`, with
  `containerType` and `containerId`), `as` (element, default `div`) and any
  HTML attributes (`id`, `className`, `style`…), which go on the wrapper.
- `highlights` are drawn on mount and whenever the sections' HTML changes.
  Feeding `onChange` back into `highlights` is safe: it doesn't redraw.
- `color`, `enabled` and `showAddToNote` apply live.
- The ref gives `getModels`, `restore`, `remove`, `clear`, `noteFor`,
  `refresh`, `highlightSelection`.
- Works in StrictMode (the double mount draws each highlight once).

With your own markup, use the hook:

```jsx
const ref = useRef(null);
const highlights = useHighlighter(ref, { highlights: saved, onChange: save });
return <article ref={ref}>…containers…</article>;
```

Pass `contentKey` to the hook when the HTML inside changes, so highlights are
redrawn.

## Next.js

- `react.js` starts with `"use client"`, so `HighlightableHtml` can be used
  directly from a Server Component page; it renders the HTML on the server and
  draws highlights after hydration.
- Neither module touches `window` or `document` on import (a test checks
  this with `renderToString` and no DOM).
- Both are plain ESM, so no `transpilePackages` setting is needed.
- Import `html-highlighter-web/Highlighter.css` in `app/layout.tsx` and pass
  `injectStyles={false}`; your own page styles can stay in CSS Modules (no
  `globals.css` needed). `sideEffects: ["*.css"]` keeps bundlers from
  dropping the import.
- Callbacks (`onChange`, `onAddToNote`) are functions, so pass them from a
  client component; a Server Component can render `HighlightableHtml` with
  data only (sections, saved highlights, colour, switches).
- Tested with Next.js 16.4.5 (App Router): `next build` with Turbopack and
  with `--webpack`, `next start`, and `next dev`; no hydration warnings. See
  `examples/nextjs/`. The Pages Router isn't tested.

## Saved format

```json
{ "commonId": "ie878at3", "id": "highlight-container--question-q1",
  "startOffset": 22, "endOffset": 41, "userType": "student", "color": "#FDE047" }
```

Offsets count every character of the container's text, as in the Flutter
engine; a test restores highlights saved by the Flutter app and checks a new
web highlight gets the same offsets. They only line up while the container's
HTML is unchanged. Models without `userType` restore as the instance's owner.

## Images, video and PDF

Media can sit inside containers; text around it highlights normally, and a
selection that crosses media is cleared. Put images in a `<figure>` or `<div>`.
Unlike the iOS WebView, a desktop browser shows a PDF or video iframe directly.

## Develop

```bash
npm install           # dev dependencies: jsdom, react, react-dom, typescript
npm test              # node --test test/*.test.js
npm run typecheck     # checks the .d.ts files against a TSX usage example
npm run demo          # then open http://localhost:8765/demo/ (index.html, react.html)
```

The React demo loads React from esm.sh, so it needs a network connection.
Tested in jsdom (Node 22), Chromium (the Claude in-app browser) and a
Next.js 16 app; not yet tested in Safari or on a phone browser.
