import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import {
  createHighlighter,
  highlightContainer,
  highlightContainerId,
  DEFAULT_CSS,
} from "../highlighter.js";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function page(body) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`);
  const { window } = dom;
  return { window, document: window.document };
}

function select(win, startNode, startOffset, endNode, endOffset) {
  const range = win.document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const sel = win.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return range;
}

// Selects the first occurrence of `text` inside `el` (single text node).
function selectText(win, el, text) {
  const walker = win.document.createTreeWalker(el, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.data.indexOf(text);
    if (i >= 0) return select(win, n, i, n, i + text.length);
  }
  throw new Error(`text not found: ${text}`);
}

function mouseup(win, target) {
  target.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, button: 0 }));
}

function pointer(win, type, target, extra = {}) {
  const e = new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...extra });
  Object.defineProperty(e, "pointerType", { value: extra.pointerType || "mouse" });
  target.dispatchEvent(e);
  return e;
}

function touch(win, type, target, x = 10, y = 10) {
  const e = new win.Event(type, { bubbles: true, cancelable: true });
  const list = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperty(e, "touches", { value: list });
  target.dispatchEvent(e);
}

const container = (type, id, html) => highlightContainer({ type, id, html });

// A finger tap: touchstart, touchend, then the click the browser sends.
function tap(win, target) {
  touch(win, "touchstart", target);
  touch(win, "touchend", target);
  target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function hover(win, type, target, relatedTarget = null) {
  const e = new win.MouseEvent(type, { bubbles: type !== "pointerenter" && type !== "pointerleave", relatedTarget });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  target.dispatchEvent(e);
}

test("container markup matches the Flutter package", () => {
  assert.equal(highlightContainerId("question", "q1"), "highlight-container--question-q1");
  const html = container("question", "q1", "<p>Hi</p>");
  assert.match(html, /^<div data-highlight-type="highlight-range" data-container-type="question" id="highlight-container--question-q1">/);
  assert.ok(html.endsWith("<p>Hi</p></div>"));
  assert.match(highlightContainer({ type: "a", id: "b", html: "", enabled: false }), /data-highlighton="false"/);
});

test("selecting text and releasing the mouse creates a coloured highlight", async () => {
  const { window, document } = page(container("article", "a1", "<p>Hello <b>big</b> world</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, {
    color: "#86EFAC",
    onChange: (models, info) => changes.push({ models, info }),
  });
  const box = document.getElementById("highlight-container--article-a1");
  const big = box.querySelector("b").firstChild;
  const world = box.querySelector("p").lastChild;
  select(window, big, 0, world, 4); // "big wor"
  mouseup(window, box);
  await tick();

  assert.equal(changes.length, 1);
  const [model] = changes[0].models;
  assert.equal(changes[0].info.type, "add");
  assert.equal(model.id, "highlight-container--article-a1");
  assert.equal(model.startOffset, 6);
  assert.equal(model.endOffset, 13);
  assert.equal(model.userType, "student");
  assert.equal(model.color, "#86EFAC");
  const spans = box.querySelectorAll(`[data-highlight-id="${model.commonId}"]`);
  assert.equal([...spans].map((s) => s.textContent).join(""), "big wor");
  assert.equal(spans[0].className, "highlight-text-student");
  assert.equal(spans[0].style.backgroundColor, "rgb(134, 239, 172)");
  assert.equal(box.textContent, "Hello big world", "text is unchanged");
  assert.ok(window.getSelection().isCollapsed, "selection cleared");
  hl.destroy();
});

test("saved Flutter offsets restore onto the same HTML (format compatibility)", () => {
  // The explanation container of the Flutter playground's sample page; the
  // models below were saved by the Flutter app on the iPad simulator.
  const dart = readFileSync(new URL("../../example/lib/sample_content.dart", import.meta.url), "utf8");
  const start = dart.indexOf("highlightContainer(type: 'explanation', id: 'demo-q1', html: '''");
  // Dart drops a newline right after an opening ''' .
  const inner = dart
    .slice(dart.indexOf("'''", start) + 3, dart.indexOf("<figure>", start))
    .replace(/^\n/, "");
  const { document } = page(container("explanation", "demo-q1", inner));
  const hl = createHighlighter(document.body);
  const drawn = hl.restore([
    { commonId: "l9yze01f", id: "highlight-container--explanation-demo-q1", startOffset: 262, endOffset: 270, userType: "student", color: "#FDE047" },
    { commonId: "20y8waug", id: "highlight-container--explanation-demo-q1", startOffset: 286, endOffset: 302, userType: "student", color: "#86EFAC" },
  ]);
  assert.equal(drawn, 2);
  const text = (id) => [...document.querySelectorAll(`[data-highlight-id="${id}"]`)].map((s) => s.textContent).join("");
  assert.equal(text("l9yze01f"), "infarcts");
  assert.equal(text("20y8waug"), "bradyarrhythmias");
  hl.destroy();
});

test("a new highlight gets the same offsets the Flutter engine saved", async () => {
  const dart = readFileSync(new URL("../../example/lib/sample_content.dart", import.meta.url), "utf8");
  const start = dart.indexOf("highlightContainer(type: 'explanation', id: 'demo-q1', html: '''");
  // Dart drops a newline right after an opening ''' .
  const inner = dart
    .slice(dart.indexOf("'''", start) + 3, dart.indexOf("<figure>", start))
    .replace(/^\n/, "");
  const { window, document } = page(container("explanation", "demo-q1", inner));
  let saved = [];
  const hl = createHighlighter(document.body, { onChange: (m) => (saved = m) });
  const box = document.getElementById("highlight-container--explanation-demo-q1");
  selectText(window, box, "infarcts");
  mouseup(window, box);
  await tick();
  assert.deepEqual([saved[0].startOffset, saved[0].endOffset], [262, 270]);
  hl.destroy();
});

test("restore keeps colours; models without one use the owner class", () => {
  const { document } = page(container("article", "a", "<p>one two three four</p>"));
  const hl = createHighlighter(document.body);
  hl.restore([
    { commonId: "c1", id: "highlight-container--article-a", startOffset: 0, endOffset: 3, color: "#93C5FD" },
    { commonId: "c2", id: "highlight-container--article-a", startOffset: 4, endOffset: 7 },
  ]);
  const [c1] = document.querySelectorAll('[data-highlight-id="c1"]');
  const [c2] = document.querySelectorAll('[data-highlight-id="c2"]');
  assert.equal(c1.textContent, "one", "starts at the very first character");
  assert.equal(c1.style.backgroundColor, "rgb(147, 197, 253)");
  assert.equal(c2.style.backgroundColor, "");
  assert.equal(c2.className, "highlight-text-student");
  assert.equal(hl.getModels()[1].userType, "student", "owner stamped on restore");
  hl.destroy();
});

test("other owners' highlights show but are not reported or removable", async () => {
  const { window, document } = page(container("article", "a", "<p>alpha beta gamma</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m) => changes.push(m) });
  hl.restore([{ commonId: "adm", id: "highlight-container--article-a", startOffset: 0, endOffset: 5, userType: "admin" }]);
  const span = document.querySelector('[data-highlight-id="adm"]');
  assert.equal(span.className, "highlight-text-admin");
  assert.equal(hl.getModels().length, 0);
  assert.equal(hl.getAllModels().length, 1);
  span.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  assert.ok(document.querySelector('[data-highlight-id="adm"]'), "still there");
  assert.equal(hl.remove("adm"), false);
  assert.equal(changes.length, 0);
  hl.destroy();
});

test("overlapping highlights merge into one", async () => {
  const { window, document } = page(container("article", "a", "<p>abcdefghijklmnop</p>"));
  let saved = [];
  const hl = createHighlighter(document.body, { onChange: (m) => (saved = m) });
  hl.restore([{ commonId: "old", id: "highlight-container--article-a", startOffset: 2, endOffset: 6 }]);
  const p = document.querySelector("p");
  // Select "efghij" (offsets 4..10), overlapping "cdef".
  const walker = document.createTreeWalker(p, 4);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  const startNode = nodes.find((n) => n.data.includes("ef"));
  const endNode = nodes.find((n) => n.data.includes("ghij"));
  select(window, startNode, startNode.data.indexOf("e"), endNode, endNode.data.indexOf("j") + 1);
  mouseup(window, p);
  await tick();
  assert.equal(saved.length, 1);
  assert.deepEqual([saved[0].startOffset, saved[0].endOffset], [2, 10]);
  assert.ok(!document.querySelector('[data-highlight-id="old"]'));
  assert.equal(p.textContent, "abcdefghijklmnop");
  hl.destroy();
});

test("right-click and press-and-hold remove a highlight", async () => {
  const { window, document } = page(container("article", "a", "<p>one two three</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { longPressMs: 20, onChange: (m, i) => changes.push(i.type) });
  hl.restore([
    { commonId: "r1", id: "highlight-container--article-a", startOffset: 0, endOffset: 3 },
    { commonId: "r2", id: "highlight-container--article-a", startOffset: 4, endOffset: 7 },
  ]);
  document.querySelector('[data-highlight-id="r1"]')
    .dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  assert.ok(!document.querySelector('[data-highlight-id="r1"]'));

  const r2 = document.querySelector('[data-highlight-id="r2"]');
  pointer(window, "pointerdown", r2);
  await tick(40);
  assert.ok(!document.querySelector('[data-highlight-id="r2"]'));
  assert.deepEqual(changes, ["remove", "remove"]);
  assert.equal(document.querySelector("p").textContent, "one two three");
  hl.destroy();
});

test("a tap opens the popup and Add to notes sends a note", async () => {
  const { window, document } = page(container("article", "a", "<p>Some <i>notable</i> text</p>"));
  const notes = [];
  const hl = createHighlighter(document.body, { onAddToNote: (n) => notes.push(n) });
  hl.restore([{ commonId: "n1", id: "highlight-container--article-a", startOffset: 5, endOffset: 12, color: "#FDE047" }]);
  tap(window, document.querySelector('[data-highlight-id="n1"]'));
  const popup = document.querySelector(".hl-popup");
  assert.ok(popup.hasAttribute("data-open"));
  popup.querySelector("button").click();
  assert.ok(!popup.hasAttribute("data-open"));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, "notable");
  assert.equal(notes[0].identifier, "highlight-container--article-a");
  assert.match(notes[0].html, /data-highlight-id="n1"/);
  assert.equal(notes[0].cleanHtml, "notable");
  hl.destroy();
  assert.ok(!document.querySelector(".hl-popup"), "popup removed on destroy");
});

test("highlighting off: no create, no removal, popup still opens", async () => {
  const { window, document } = page(container("article", "a", "<p>first second third</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { longPressMs: 20, onChange: (m) => changes.push(m) });
  hl.restore([{ commonId: "k", id: "highlight-container--article-a", startOffset: 0, endOffset: 5 }]);
  hl.setEnabled(false);
  assert.ok(document.body.classList.contains("hl-off"));

  const p = document.querySelector("p");
  selectText(window, p, "third");
  mouseup(window, p);
  await tick();
  const k = document.querySelector('[data-highlight-id="k"]');
  k.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  pointer(window, "pointerdown", k);
  await tick(40);
  assert.equal(changes.length, 0);
  assert.ok(document.querySelector('[data-highlight-id="k"]'));

  k.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.ok(document.querySelector('[data-highlight-id="k"]'), "click doesn't remove while off");
  assert.ok(document.querySelector(".hl-popup").hasAttribute("data-open"), "it opens the popup instead");
  hl.setEnabled(true);
  assert.ok(!document.body.classList.contains("hl-off"));
  hl.destroy();
});

test("Add to notes hidden: tapping a highlight shows nothing", () => {
  const { window, document } = page(container("article", "a", "<p>quiet please</p>"));
  const hl = createHighlighter(document.body, { showAddToNote: false });
  hl.restore([{ commonId: "q", id: "highlight-container--article-a", startOffset: 0, endOffset: 5 }]);
  tap(window, document.querySelector('[data-highlight-id="q"]'));
  const popup = document.querySelector(".hl-popup");
  assert.ok(!popup || !popup.hasAttribute("data-open"));
  hl.destroy();
});

test("selections across media are cleared and never highlight", async () => {
  const { window, document } = page(
    container("article", "m", '<p>Before the clip.</p><iframe title="v"></iframe><p>After the clip.</p><img alt="x"><p>Tail.</p>')
  );
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m) => changes.push(m) });
  const [before, after] = document.querySelectorAll("p");
  select(window, before.firstChild, 2, after.firstChild, 5);
  mouseup(window, before);
  await tick();
  assert.equal(changes.length, 0);
  assert.ok(window.getSelection().isCollapsed, "cleared");

  // selectionchange alone clears it too.
  select(window, before.firstChild, 2, after.firstChild, 5);
  document.dispatchEvent(new window.Event("selectionchange"));
  assert.ok(window.getSelection().isCollapsed);

  // Text on one side still highlights.
  selectText(window, after, "After");
  mouseup(window, after);
  await tick();
  assert.equal(changes.length, 1);
  hl.destroy();
});

test("a selection left over from before a touch is not highlighted", async () => {
  const { window, document } = page(container("article", "a", "<p>stale words here</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m) => changes.push(m) });
  const p = document.querySelector("p");
  selectText(window, p, "words");
  touch(window, "touchstart", p);
  touch(window, "touchend", p);
  await tick();
  assert.equal(changes.length, 0);
  assert.ok(window.getSelection().isCollapsed);
  hl.destroy();
});

test("an Android long-press that ends in touchcancel highlights the selection", async () => {
  const { window, document } = page(container("article", "a", "<p>hold this word</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m) => changes.push(m) });
  const p = document.querySelector("p");
  touch(window, "touchstart", p);
  selectText(window, p, "this"); // Android selects the word, then cancels the touch
  touch(window, "touchcancel", p);
  await tick();
  assert.equal(changes.length, 1);
  assert.equal(changes[0][0].startOffset, 5);
  assert.equal(changes[0][0].endOffset, 9);
  hl.destroy();
});

test("a cancelled touch that didn't change the selection highlights nothing", async () => {
  const { window, document } = page(container("article", "a", "<p>scroll past this</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m) => changes.push(m) });
  const p = document.querySelector("p");
  touch(window, "touchstart", p);
  touch(window, "touchcancel", p); // a scroll: no selection
  selectText(window, p, "past");
  touch(window, "touchstart", p);
  touch(window, "touchcancel", p); // a scroll with an old selection
  await tick();
  assert.equal(changes.length, 0);
  hl.destroy();
});

test("removing by press on touch clears the word selected under it", async () => {
  const { window, document } = page(container("article", "a", "<p>press here please</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { longPressMs: 20, onChange: (m) => changes.push(m) });
  hl.restore([{ commonId: "t", id: "highlight-container--article-a", startOffset: 6, endOffset: 10 }]);
  const span = document.querySelector('[data-highlight-id="t"]');
  touch(window, "touchstart", span);
  await tick(40);
  selectText(window, document.querySelector("p"), "here"); // what iOS would do
  touch(window, "touchend", document.querySelector("p"));
  await tick();
  assert.equal(changes.length, 1, "only the removal");
  assert.equal(changes[0].length, 0);
  assert.ok(window.getSelection().isCollapsed);
  hl.destroy();
});

test("unselectable containers and cross-container selections are ignored", async () => {
  const { window, document } = page(
    highlightContainer({ type: "a", id: "off", html: "<p>locked text</p>", enabled: false }) +
      container("a", "x", "<p>first box</p>") +
      container("a", "y", "<p>second box</p>")
  );
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m) => changes.push(m) });
  const locked = document.querySelector("#highlight-container--a-off p");
  selectText(window, locked, "locked");
  mouseup(window, locked);
  await tick();
  const first = document.querySelector("#highlight-container--a-x p").firstChild;
  const second = document.querySelector("#highlight-container--a-y p").firstChild;
  select(window, first, 2, second, 3);
  mouseup(window, document.body);
  await tick();
  assert.equal(changes.length, 0);
  hl.destroy();
});

test("refresh redraws highlights after the HTML is replaced", () => {
  const { document } = page(container("article", "a", "<p>swap me out</p>"));
  const hl = createHighlighter(document.body);
  hl.restore([{ commonId: "s", id: "highlight-container--article-a", startOffset: 0, endOffset: 4 }]);
  const box = document.getElementById("highlight-container--article-a");
  box.innerHTML = "<p>swap me out</p>";
  assert.equal(hl.refresh(), 1);
  assert.equal(document.querySelector('[data-highlight-id="s"]').textContent, "swap");
  hl.destroy();
});

test("clear empties the page; notify is opt-in", () => {
  const { document } = page(container("article", "a", "<p>gone soon</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m, i) => changes.push(i.type) });
  hl.restore([{ commonId: "g", id: "highlight-container--article-a", startOffset: 0, endOffset: 4 }]);
  hl.clear();
  assert.ok(!document.querySelector("[data-highlight-id]"));
  assert.deepEqual(changes, []);
  hl.restore([{ commonId: "g", id: "highlight-container--article-a", startOffset: 0, endOffset: 4 }]);
  hl.clear({ notify: true });
  assert.deepEqual(changes, ["clear"]);
  hl.destroy();
});

test("destroy unwraps highlights, stops listening and removes the styles", async () => {
  const { window, document } = page(container("article", "a", "<p>tidy up after</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m) => changes.push(m) });
  const second = createHighlighter(document.body, { injectStyles: true });
  assert.equal(document.querySelectorAll("#html-highlighter-styles").length, 1);
  assert.ok(document.getElementById("html-highlighter-styles").textContent.includes(".highlight-text-student"));
  hl.restore([{ commonId: "d", id: "highlight-container--article-a", startOffset: 0, endOffset: 4 }]);
  second.destroy();
  assert.ok(document.getElementById("html-highlighter-styles"), "still used by the first");
  hl.destroy();
  assert.ok(!document.getElementById("html-highlighter-styles"));
  assert.ok(!document.querySelector("[data-highlight-id]"));
  assert.equal(document.querySelector("p").childNodes.length, 1, "text nodes merged back");
  const p = document.querySelector("p");
  selectText(window, p, "tidy");
  mouseup(window, p);
  await tick();
  assert.equal(changes.length, 0);
  assert.ok(DEFAULT_CSS.includes(".hl-popup"));
});

test("mouse click removes a highlight; a tap opens its popup", async () => {
  const { window, document } = page(container("article", "a", "<p>click to remove this</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m, i) => changes.push(i.type) });
  hl.restore([
    { commonId: "c1", id: "highlight-container--article-a", startOffset: 0, endOffset: 5 },
    { commonId: "c2", id: "highlight-container--article-a", startOffset: 6, endOffset: 8 },
    { commonId: "adm", id: "highlight-container--article-a", startOffset: 9, endOffset: 15, userType: "admin" },
  ]);
  document.querySelector('[data-highlight-id="c1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.ok(!document.querySelector('[data-highlight-id="c1"]'));
  assert.deepEqual(changes, ["remove"]);

  tap(window, document.querySelector('[data-highlight-id="c2"]'));
  assert.ok(document.querySelector('[data-highlight-id="c2"]'), "tap keeps it");
  assert.ok(document.querySelector(".hl-popup").hasAttribute("data-open"));

  // Another owner's highlight: a click shows the popup, never removes.
  document.querySelector('[data-highlight-id="adm"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.ok(document.querySelector('[data-highlight-id="adm"]'));
  assert.deepEqual(changes, ["remove"]);
  hl.destroy();
});

test("a click that ends a text selection doesn't remove", async () => {
  const { window, document } = page(container("article", "a", "<p>keep me safe</p>"));
  const changes = [];
  const hl = createHighlighter(document.body, { onChange: (m, i) => changes.push(i.type) });
  hl.restore([{ commonId: "k1", id: "highlight-container--article-a", startOffset: 0, endOffset: 9 }]);
  const span = document.querySelector('[data-highlight-id="k1"]');
  selectText(window, span, "me");
  span.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.ok(document.querySelector('[data-highlight-id="k1"]'));
  assert.ok(!changes.includes("remove"));
  hl.destroy();
});

test("clickToRemove: false keeps click-to-open", () => {
  const { window, document } = page(container("article", "a", "<p>stay put</p>"));
  const hl = createHighlighter(document.body, { clickToRemove: false });
  hl.restore([{ commonId: "s1", id: "highlight-container--article-a", startOffset: 0, endOffset: 4 }]);
  document.querySelector('[data-highlight-id="s1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.ok(document.querySelector('[data-highlight-id="s1"]'));
  assert.ok(document.querySelector(".hl-popup").hasAttribute("data-open"));
  hl.destroy();
});

test("hovering opens the popup; leaving closes it unless you move onto it", async () => {
  const { window, document } = page(container("article", "a", "<p>hover over this text</p>"));
  const hl = createHighlighter(document.body, { hoverDelayMs: 10, hoverHideMs: 20 });
  hl.restore([{ commonId: "h1", id: "highlight-container--article-a", startOffset: 0, endOffset: 5 }]);
  const span = document.querySelector('[data-highlight-id="h1"]');
  const p = document.querySelector("p");
  const isOpen = () => !!document.querySelector(".hl-popup[data-open]");

  hover(window, "pointerover", span);
  await tick(30);
  assert.ok(isOpen(), "opens on hover");

  // Leave towards the popup: stays open.
  const popup = document.querySelector(".hl-popup");
  hover(window, "pointerout", span, popup);
  hover(window, "pointerenter", popup, span);
  await tick(40);
  assert.ok(isOpen(), "stays while on the popup");

  // Leave the popup for plain text: closes.
  hover(window, "pointerleave", popup, p);
  await tick(40);
  assert.ok(!isOpen(), "closes after leaving");

  // A quick pass doesn't open it.
  hover(window, "pointerover", span);
  hover(window, "pointerout", span, p);
  await tick(30);
  assert.ok(!isOpen(), "no popup for a brief pass");
  hl.destroy();
});

test("a pinned popup (after create) doesn't close on leave; hover respects the switches", async () => {
  const { window, document } = page(container("article", "a", "<p>pinned popup text here</p>"));
  const hl = createHighlighter(document.body, { hoverDelayMs: 5, hoverHideMs: 10 });
  const p = document.querySelector("p");
  selectText(window, p, "pinned");
  mouseup(window, p);
  await tick();
  const span = document.querySelector("[data-highlight-id]");
  const isOpen = () => !!document.querySelector(".hl-popup[data-open]");
  assert.ok(isOpen(), "opened after create");
  hover(window, "pointerover", span);
  hover(window, "pointerout", span, p);
  await tick(30);
  assert.ok(isOpen(), "pinned: stays");

  document.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }));
  assert.ok(!isOpen(), "closes on an outside click");

  hl.setAddToNoteVisible(false);
  hover(window, "pointerover", span);
  await tick(20);
  assert.ok(!isOpen(), "hidden popup never opens on hover");
  hl.destroy();

  const second = page(container("article", "b", "<p>no hover here</p>"));
  const off = createHighlighter(second.document.body, { popupOnHover: false, hoverDelayMs: 5 });
  off.restore([{ commonId: "n", id: "highlight-container--article-b", startOffset: 0, endOffset: 2 }]);
  hover(second.window, "pointerover", second.document.querySelector("[data-highlight-id]"));
  await tick(20);
  assert.ok(!second.document.querySelector(".hl-popup[data-open]"), "popupOnHover: false");
  off.destroy();
});

test("the popup opens above a highlight when media is right below it", () => {
  const { window, document } = page(
    container("article", "m", '<p>Text before the iframe.</p><iframe title="v"></iframe><p>After.</p>')
  );
  const hl = createHighlighter(document.body);
  hl.restore([{ commonId: "up", id: "highlight-container--article-m", startOffset: 0, endOffset: 11 }]);
  const span = document.querySelector('[data-highlight-id="up"]');
  const iframe = document.querySelector("iframe");
  const rect = (top, height, left = 20, width = 300) =>
    ({ top, bottom: top + height, left, right: left + width, width, height, x: left, y: top });
  // Layout: highlight at 100–120 px, iframe from 130 px, popup 40 px tall.
  span.getBoundingClientRect = () => rect(100, 20, 20, 120);
  Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return 40; } });
  Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return 110; } });

  iframe.getBoundingClientRect = () => rect(130, 200);
  tap(window, span);
  const popup = document.querySelector(".hl-popup");
  assert.equal(popup.dataset.placement, "above");
  assert.equal(popup.style.top, `${100 - 6 - 40}px`);

  // No media below: it stays below.
  iframe.getBoundingClientRect = () => rect(400, 200);
  tap(window, span);
  assert.equal(popup.dataset.placement, "below");
  assert.equal(popup.style.top, `${120 + 6}px`);
  hl.destroy();
});

test("Highlighter.css matches DEFAULT_CSS and is exported", () => {
  const css = readFileSync(new URL("../Highlighter.css", import.meta.url), "utf8");
  const rules = css.replace(/\/\*[\s\S]*?\*\//, "").trim();
  assert.equal(rules, DEFAULT_CSS.trim(), "keep Highlighter.css and DEFAULT_CSS in step");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.exports["./Highlighter.css"], "./Highlighter.css");
  assert.ok(pkg.files.includes("Highlighter.css"));
  assert.ok(pkg.sideEffects.includes("*.css"), "bundlers must keep the CSS import");
});

test("injectStyles: false adds no <style>", () => {
  const { document } = page(container("article", "a", "<p>styled elsewhere</p>"));
  const hl = createHighlighter(document.body, { injectStyles: false });
  assert.ok(!document.getElementById("html-highlighter-styles"));
  hl.destroy();
});
