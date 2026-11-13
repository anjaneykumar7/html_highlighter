# Next.js example

A minimal Next.js 16 (App Router) app using `html-highlighter-web`, installed
the way a real app would get it: from an `npm pack` tarball.

- `app/page.tsx` is a **Server Component**. It renders `<HighlightableHtml>`
  directly (with saved highlights, no callbacks), which works because
  `react.js` is a `"use client"` module.
- `app/lesson.tsx` is a **client component** with state: colour swatches,
  the "Highlighting enabled" and "Show Add to notes" switches, "Clear all",
  notes, and saving to `localStorage`.
- **Styles:** `app/layout.tsx` imports `html-highlighter-web/Highlighter.css`
  and both components pass `injectStyles={false}`. The page's own layout is
  in a CSS Module (`app/page.module.css`); there is no `globals.css`.

## Run

```bash
npm run pack-lib   # packs ../.. and installs it (re-run after changing the library)
npm run build      # production build (Turbopack); `next build --webpack` also works
npm start          # http://localhost:3100
npm run dev        # dev mode on port 3100
```

## Notes

- `next.config.mjs` pins `turbopack.root`. Only needed because this example
  lives inside the library folder, which has its own `package-lock.json`;
  without it Next.js picks the library as the workspace root and the build
  fails with "Element type is invalid … got undefined".
- Install the library from a tarball (or a registry), not with `npm link` or a
  `file:` folder dependency. A linked folder brings its own `node_modules`
  with a second copy of React, which breaks hooks.
- Functions can't be passed from a Server Component, so callbacks
  (`onChange`, `onAddToNote`) belong in a client component, as in
  `lesson.tsx`.
