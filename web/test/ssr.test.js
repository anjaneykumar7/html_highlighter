// Server-side rendering, as in Next.js: no window, no document.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

test("importing both modules touches no browser globals", async () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(typeof globalThis.document, "undefined");
  const core = await import("../highlighter.js");
  const react = await import("../react.js");
  assert.equal(typeof core.createHighlighter, "function");
  assert.equal(typeof react.HighlightableHtml, "object");
});

test("react.js is a client module", () => {
  const src = readFileSync(new URL("../react.js", import.meta.url), "utf8");
  assert.ok(src.startsWith('"use client";'), "first statement is 'use client'");
  const core = readFileSync(new URL("../highlighter.js", import.meta.url), "utf8");
  assert.ok(!core.includes("use client"), "the core stays usable from any module");
});

test("HighlightableHtml renders its containers on the server", async () => {
  const { HighlightableHtml } = await import("../react.js");
  const html = renderToString(
    createElement(HighlightableHtml, {
      className: "lesson",
      id: "lesson-1",
      sections: [
        { type: "question", id: "q1", html: "<p>Which artery?</p>" },
        { type: "explanation", id: "q1", html: "<p>The right one.</p>", enabled: false },
      ],
      highlights: [{ commonId: "x", id: "highlight-container--question-q1", startOffset: 0, endOffset: 5 }],
    })
  );
  assert.match(html, /^<div class="lesson" id="lesson-1">/, "HTML attributes reach the wrapper");
  assert.match(html, /<div id="highlight-container--question-q1" data-highlight-type="highlight-range" data-container-type="question"><p>Which artery\?<\/p><\/div>/);
  assert.match(html, /id="highlight-container--explanation-q1"[^>]*data-highlighton="false"/);
  assert.ok(!html.includes("data-highlight-id"), "highlights are drawn on the client only");
});
