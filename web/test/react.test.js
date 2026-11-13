// React in a browser-like environment (jsdom).
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><head></head><body><div id=app></div></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement, StrictMode, act, useRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { HighlightableHtml, useHighlighter } = await import("../react.js");

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const win = dom.window;
const doc = win.document;

function selectText(el, text) {
  const walker = doc.createTreeWalker(el, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.data.indexOf(text);
    if (i >= 0) {
      const r = doc.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      win.getSelection().removeAllRanges();
      win.getSelection().addRange(r);
      return;
    }
  }
  throw new Error(text);
}

// A finger tap (a mouse click would remove the highlight).
function tap(el) {
  for (const type of ["touchstart", "touchend"]) {
    const e = new win.Event(type, { bubbles: true });
    Object.defineProperty(e, "touches", { value: type === "touchstart" ? [{ clientX: 1, clientY: 1 }] : [] });
    el.dispatchEvent(e);
  }
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
}

async function release(el) {
  el.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, button: 0 }));
  await act(async () => tick());
}

const sections = [
  { type: "question", id: "q1", html: "<p>Which coronary artery is occluded?</p>" },
  { type: "explanation", id: "q1", html: "<p>The right coronary artery.</p>" },
];

function mount(element) {
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  const root = createRoot(host);
  return { host, root, render: (el) => act(async () => root.render(el)) , el: element };
}

test("component: restore, create, colour prop, notes, unmount", async () => {
  const saved = [{ commonId: "s1", id: "highlight-container--question-q1", startOffset: 6, endOffset: 14, color: "#93C5FD" }];
  let changes = [];
  const notes = [];
  const { host, root, render } = mount();
  const ref = { current: null };
  const view = (color) =>
    createElement(HighlightableHtml, {
      ref,
      sections,
      highlights: saved,
      color,
      onChange: (m) => changes.push(m),
      onAddToNote: (n) => notes.push(n),
    });
  await render(view("#86EFAC"));

  const s1 = host.querySelector('[data-highlight-id="s1"]');
  assert.equal(s1.textContent, "coronary");
  assert.equal(s1.style.backgroundColor, "rgb(147, 197, 253)");

  const exp = host.querySelector("#highlight-container--explanation-q1");
  selectText(exp, "right");
  await release(exp);
  assert.equal(changes.length, 1);
  const created = changes[0].find((m) => m.id === "highlight-container--explanation-q1");
  assert.equal(created.color, "#86EFAC");
  assert.equal(changes[0].length, 2, "full list: restored + new");

  await render(view("#F9A8D4"));
  selectText(exp, "artery");
  await release(exp);
  assert.equal(changes.at(-1).find((m) => m.startOffset === 19)?.color, "#F9A8D4");

  // Ref API + popup note.
  assert.equal(ref.current.getModels().length, 3);
  tap(host.querySelector('[data-highlight-id="s1"]'));
  doc.querySelector(".hl-popup button").click();
  assert.equal(notes[0].text, "coronary");

  await act(async () => root.unmount());
  assert.ok(!doc.querySelector(".hl-popup"), "popup removed");
  assert.ok(!doc.getElementById("html-highlighter-styles"), "styles removed");
  host.remove();
});

test("component: enabled and showAddToNote props", async () => {
  const changes = [];
  const { host, root, render } = mount();
  const view = (enabled, showAddToNote) =>
    createElement(HighlightableHtml, {
      sections,
      highlights: [{ commonId: "e1", id: "highlight-container--question-q1", startOffset: 0, endOffset: 5 }],
      enabled,
      showAddToNote,
      onChange: (m) => changes.push(m),
    });
  await render(view(false, true));
  const q = host.querySelector("#highlight-container--question-q1");
  selectText(q, "artery");
  await release(q);
  assert.equal(changes.length, 0, "off: no create");

  await render(view(true, false));
  tap(host.querySelector('[data-highlight-id="e1"]'));
  const popup = doc.querySelector(".hl-popup");
  assert.ok(!popup || !popup.hasAttribute("data-open"), "popup hidden");
  selectText(q, "artery");
  await release(q);
  assert.equal(changes.length, 1, "on again: creates");
  await act(async () => root.unmount());
  host.remove();
});

test("StrictMode double mount draws each highlight once", async () => {
  const { host, root, render } = mount();
  await render(
    createElement(StrictMode, null,
      createElement(HighlightableHtml, {
        sections,
        highlights: [{ commonId: "d1", id: "highlight-container--question-q1", startOffset: 0, endOffset: 5 }],
      }))
  );
  assert.equal(host.querySelectorAll('[data-highlight-id="d1"]').length, 1);
  assert.equal(host.querySelector('[data-highlight-id="d1"]').textContent, "Which");
  await act(async () => root.unmount());
  host.remove();
});

test("new HTML redraws the latest highlights", async () => {
  const { host, root, render } = mount();
  const view = (text, highlights) =>
    createElement(HighlightableHtml, { html: `<p>${text}</p>`, containerId: "c", highlights });
  await render(view("first version", [{ commonId: "v1", id: "highlight-container--article-c", startOffset: 0, endOffset: 5 }]));
  assert.equal(host.querySelector('[data-highlight-id="v1"]').textContent, "first");
  await render(view("second version", [{ commonId: "v2", id: "highlight-container--article-c", startOffset: 7, endOffset: 14 }]));
  assert.ok(!host.querySelector('[data-highlight-id="v1"]'));
  assert.equal(host.querySelector('[data-highlight-id="v2"]').textContent, "version");
  await act(async () => root.unmount());
  host.remove();
});

test("useHighlighter works with your own markup", async () => {
  const changes = [];
  let api;
  function Lesson() {
    const ref = useRef(null);
    api = useHighlighter(ref, { onChange: (m) => changes.push(m), color: "#FDBA74" });
    return createElement("article", { ref },
      createElement("div", { id: "highlight-container--article-own", "data-highlight-type": "highlight-range" },
        createElement("p", null, "Rendered by React itself.")));
  }
  const { host, root, render } = mount();
  await render(createElement(Lesson));
  const box = host.querySelector("#highlight-container--article-own");
  selectText(box, "React");
  await release(box);
  assert.equal(changes.length, 1);
  assert.equal(changes[0][0].color, "#FDBA74");
  assert.equal(api.getModels().length, 1);
  api.clear();
  assert.ok(!host.querySelector("[data-highlight-id]"));
  await act(async () => root.unmount());
  host.remove();
});
