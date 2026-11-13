// html-highlighter for the web.
//
// Persistent, multi-colour text highlighting for HTML in a web page: select
// text inside a highlight container to highlight it, tap or click a highlight
// for an "Add to notes" popup, press and hold (or right-click) to remove it.
// Saved highlights use the same JSON as the Flutter package, so they move
// freely between the app and the web:
//
//   {commonId, id, startOffset, endOffset, userType, color?}
//
// Framework-agnostic ES module. Nothing touches `window` or `document` until
// createHighlighter() is called, so it is safe to import during server-side
// rendering (Next.js). React bindings live in ./react.js.

export const CONTAINER_SELECTOR = '[data-highlight-type="highlight-range"]';
const HIGHLIGHT_SELECTOR = "[data-highlight-id]";
const MEDIA_SELECTOR =
  "iframe, video, audio, img, picture, svg, canvas, object, embed";
const NO_WRAP_SELECTOR = "script, style, textarea, select, option, noscript, svg";
const STYLE_ID = "html-highlighter-styles";
const MOVE_TOLERANCE = 8;

/** Default styles; injected once per document unless `injectStyles: false`. */
export const DEFAULT_CSS = `
.highlight-text-student { background-color: yellow; }
.highlight-text-admin { background-color: #e8e239; }
${HIGHLIGHT_SELECTOR} {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}
.hl-off ${CONTAINER_SELECTOR}, ${CONTAINER_SELECTOR}.hl-off,
${CONTAINER_SELECTOR}[data-highlighton="false"], .noselect {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.hl-popup {
  position: absolute;
  z-index: 2147483000;
  display: none;
  padding: 6px;
  border-radius: 8px;
  background: #111;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35), 0 4px 14px rgba(0, 0, 0, 0.3);
}
.hl-popup[data-open] { display: block; }
.hl-popup button {
  font: 600 13px/1.2 system-ui, -apple-system, sans-serif;
  color: #111;
  background: #fff;
  border: 0;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
}
`;

/** DOM id of a container: `highlight-container--<type>-<id>`. */
export function highlightContainerId(type, id) {
  return `highlight-container--${type}-${id}`;
}

/**
 * Wraps `html` in a highlight container (an HTML string). Same markup as the
 * Flutter package's `highlightContainer`.
 */
export function highlightContainer({ type, id, html, enabled, attributes = "" }) {
  const on = enabled == null ? "" : ` data-highlighton="${enabled}"`;
  const extra = attributes ? ` ${attributes}` : "";
  return (
    `<div data-highlight-type="highlight-range" ` +
    `data-container-type="${escapeAttr(type)}" ` +
    `id="${escapeAttr(highlightContainerId(type, id))}"${on}${extra}>` +
    `${html}</div>`
  );
}

/**
 * Starts highlighting inside `root` (an element that is, or contains,
 * highlight containers). Returns the instance API; call `destroy()` when done.
 */
export function createHighlighter(root, options = {}) {
  if (!root || !root.ownerDocument) {
    throw new Error("html-highlighter: createHighlighter needs a DOM element");
  }
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const owner = options.userType || "student";
  const longPressMs = options.longPressMs ?? 350;
  const label = options.addToNoteLabel || "Add to notes";
  const injectStyles = options.injectStyles !== false;
  const popupAfterCreate = options.popupAfterCreate !== false;
  const popupOnHover = options.popupOnHover !== false;
  const clickToRemove = options.clickToRemove !== false;
  const hoverDelayMs = options.hoverDelayMs ?? 150;
  const hoverHideMs = options.hoverHideMs ?? 300;

  let pen = options.color || null;
  let enabled = options.enabled !== false;
  let showAddToNote = options.showAddToNote !== false;
  let models = [];
  let destroyed = false;

  // ---- styles -------------------------------------------------------------

  if (injectStyles) {
    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = DEFAULT_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.dataset.users = String(Number(style.dataset.users || 0) + 1);
  }
  root.classList.toggle("hl-off", !enabled);

  // ---- DOM helpers ----------------------------------------------------------

  function closest(node, selector) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return el && el.closest ? el.closest(selector) : null;
  }

  function containerOf(node) {
    const c = closest(node, CONTAINER_SELECTOR);
    return c && (c === root || root.contains(c)) ? c : null;
  }

  function containers() {
    const list = Array.from(root.querySelectorAll(CONTAINER_SELECTOR));
    if (root.matches && root.matches(CONTAINER_SELECTOR)) list.unshift(root);
    return list;
  }

  function containerById(id) {
    return containers().find((c) => c.id === id) || null;
  }

  function textNodes(container) {
    const walker = doc.createTreeWalker(container, 4 /* SHOW_TEXT */);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    return nodes;
  }

  // Characters of `container`'s text before the boundary point (node, offset).
  // Same measure as the WebView engine: every text node counts.
  function offsetOf(container, node, offset) {
    const range = doc.createRange();
    range.setStart(container, 0);
    range.setEnd(node, offset);
    let total = 0;
    for (const t of textNodes(container)) {
      if (t === node) return total + offset;
      if (!range.isPointInRange(t, t.data.length)) break;
      total += t.data.length;
    }
    return total;
  }

  // Text positions of a model's offsets inside its container.
  function locate(container, start, end) {
    let pos = 0;
    let s = null;
    let e = null;
    for (const t of textNodes(container)) {
      const len = t.data.length;
      if (!s && start >= pos && start < pos + len) s = { node: t, offset: start - pos };
      if (!e && end > pos && end <= pos + len) e = { node: t, offset: end - pos };
      if (s && e) break;
      pos += len;
    }
    return s && e ? { start: s, end: e } : null;
  }

  function rangeFor(model) {
    const container = containerById(model.id);
    const loc = container && locate(container, model.startOffset, model.endOffset);
    if (!loc) return null;
    const range = doc.createRange();
    range.setStart(loc.start.node, loc.start.offset);
    range.setEnd(loc.end.node, loc.end.offset);
    return { container, range, loc };
  }

  function skipText(t) {
    if (closest(t, NO_WRAP_SELECTOR)) return true;
    // Whitespace between blocks (list items, table cells…) isn't text.
    return t.data.trim() === "" && /\n/.test(t.data);
  }

  function spansOf(commonId) {
    return Array.from(root.querySelectorAll(`[data-highlight-id="${commonId}"]`));
  }

  // Wraps the model's text in <span>s. Returns how many spans were made.
  function render(model) {
    const found = rangeFor(model);
    if (!found) return 0;
    const { container, loc } = found;
    const all = textNodes(container);
    const from = all.indexOf(loc.start.node);
    const to = all.indexOf(loc.end.node);
    let made = 0;
    all.slice(from, to + 1).forEach((t) => {
      const s = t === loc.start.node ? loc.start.offset : 0;
      const e = t === loc.end.node ? loc.end.offset : t.data.length;
      if (s >= e || skipText(t)) return;
      if (e < t.data.length) t.splitText(e);
      const target = s > 0 ? t.splitText(s) : t;
      const span = doc.createElement("span");
      span.className = `highlight-text-${model.userType || owner}`;
      span.id = `highlight-${model.commonId}-${made}`;
      span.dataset.highlightId = model.commonId;
      if (model.color) span.style.backgroundColor = model.color;
      target.parentNode.insertBefore(span, target);
      span.appendChild(target);
      made++;
    });
    return made;
  }

  function unrender(commonId) {
    spansOf(commonId).forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
  }

  function newId() {
    let id;
    do id = Math.random().toString(36).slice(2, 10);
    while (id.length < 8 || models.some((m) => m.commonId === id));
    return id;
  }

  function own(model) {
    return (model.userType || owner) === owner;
  }

  function modelOf(commonId) {
    return models.find((m) => m.commonId === commonId) || null;
  }

  function copy(model) {
    return { ...model };
  }

  function emit(type, model) {
    if (options.onChange) options.onChange(api.getModels(), { type, model: copy(model) });
  }

  function clearSelection() {
    const sel = win.getSelection && win.getSelection();
    if (sel && sel.rangeCount > 0) sel.removeAllRanges();
  }

  // True when the range contains or crosses embedded media.
  function rangeSpansMedia(range) {
    let host = range.commonAncestorContainer;
    if (host.nodeType !== 1) host = host.parentNode;
    if (!host || !host.querySelectorAll) return false;
    return Array.from(host.querySelectorAll(MEDIA_SELECTOR)).some((m) =>
      range.intersectsNode(m)
    );
  }

  // ---- creating -------------------------------------------------------------

  function createFromSelection() {
    if (destroyed || !enabled) return null;
    const sel = win.getSelection && win.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const container = containerOf(range.commonAncestorContainer);
    if (!container) return null;
    if (container.getAttribute("data-highlighton") === "false") return null;
    if (rangeSpansMedia(range)) {
      clearSelection();
      return null;
    }
    if (range.toString().trim() === "") return null;
    if (!container.id) {
      console.warn("html-highlighter: highlight containers need an id");
      return null;
    }
    const model = {
      commonId: newId(),
      id: container.id,
      startOffset: offsetOf(container, range.startContainer, range.startOffset),
      endOffset: offsetOf(container, range.endContainer, range.endOffset),
      userType: owner,
    };
    if (model.endOffset <= model.startOffset) return null;
    if (pen) model.color = pen;

    // Merge with this owner's overlapping (or touching) highlights.
    models
      .filter(
        (m) =>
          m.id === model.id &&
          own(m) &&
          !(m.endOffset < model.startOffset || m.startOffset > model.endOffset)
      )
      .forEach((m) => {
        model.startOffset = Math.min(model.startOffset, m.startOffset);
        model.endOffset = Math.max(model.endOffset, m.endOffset);
        unrender(m.commonId);
        models = models.filter((x) => x !== m);
      });

    clearSelection();
    render(model);
    models.push(model);
    emit("add", model);
    if (popupAfterCreate) openPopup(model.commonId);
    return copy(model);
  }

  // ---- popup ----------------------------------------------------------------

  let popup = null;
  let popupFor = null;
  // A pinned popup (opened by a click/tap or after creating) stays until the
  // user clicks elsewhere; a hover popup closes when the pointer leaves.
  let popupPinned = false;
  let hoverOpenTimer = null;
  let hoverHideTimer = null;

  function isMouse(e) {
    return e.pointerType === "mouse" || e.pointerType === "pen";
  }

  function cancelHoverTimers() {
    win.clearTimeout(hoverOpenTimer);
    win.clearTimeout(hoverHideTimer);
    hoverOpenTimer = hoverHideTimer = null;
  }

  function scheduleHoverHide() {
    win.clearTimeout(hoverHideTimer);
    if (popupPinned || !popupFor) return;
    hoverHideTimer = win.setTimeout(closePopup, hoverHideMs);
  }

  // True when `node` is part of the highlight the popup belongs to, or the popup.
  function insideHovered(node) {
    if (!node) return false;
    if (popup && popup.contains(node)) return true;
    const span = closest(node, HIGHLIGHT_SELECTOR);
    return !!span && span.dataset.highlightId === popupFor;
  }

  function ensurePopup() {
    if (popup) return popup;
    popup = doc.createElement("div");
    popup.className = "hl-popup";
    popup.setAttribute("role", "dialog");
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const model = popupFor && modelOf(popupFor);
      closePopup();
      if (model && options.onAddToNote) {
        const note = api.noteFor(model.commonId);
        if (note) options.onAddToNote(note);
      }
    });
    popup.appendChild(button);
    popup.addEventListener("pointerenter", (e) => {
      if (isMouse(e)) win.clearTimeout(hoverHideTimer);
    });
    popup.addEventListener("pointerleave", (e) => {
      if (isMouse(e) && !insideHovered(e.relatedTarget)) scheduleHoverHide();
    });
    doc.body.appendChild(popup);
    return popup;
  }

  function openPopup(commonId, pinned = true) {
    if (!showAddToNote || destroyed) return;
    const spans = spansOf(commonId);
    if (!spans.length) return;
    cancelHoverTimers();
    // Hovering a highlight whose popup is already pinned keeps it pinned.
    popupPinned = pinned || (popupPinned && popupFor === commonId);
    const p = ensurePopup();
    p.setAttribute("data-open", "");
    placePopup(p, spans);
    popupFor = commonId;
  }

  // Below the highlight, unless that space is covered by media (an iframe,
  // video, image…) or runs off the bottom of the window: then above it.
  // Always kept inside the window horizontally.
  function placePopup(p, spans) {
    const gap = 6;
    const first = spans[0].getBoundingClientRect();
    const last = spans[spans.length - 1].getBoundingClientRect();
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const viewW = doc.documentElement.clientWidth || win.innerWidth;
    let left = Math.max(4, Math.min(last.left, viewW - w - 4));
    let top = last.bottom + gap;
    const below = { left, right: left + w, top, bottom: top + h };
    const blocked = below.bottom > win.innerHeight || overlapsMedia(below);
    const above = first.top - gap - h;
    if (blocked && above >= 0) {
      top = above;
      left = Math.max(4, Math.min(first.left, viewW - w - 4));
      p.dataset.placement = "above";
    } else {
      p.dataset.placement = "below";
    }
    p.style.top = `${top + win.scrollY}px`;
    p.style.left = `${left + win.scrollX}px`;
  }

  function overlapsMedia(rect) {
    return Array.from(root.querySelectorAll(MEDIA_SELECTOR)).some((m) => {
      const r = m.getBoundingClientRect();
      return r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
    });
  }

  function closePopup() {
    cancelHoverTimers();
    if (popup) popup.removeAttribute("data-open");
    popupFor = null;
    popupPinned = false;
  }

  // ---- removing ---------------------------------------------------------------

  function removeHighlight(commonId, notify = true) {
    const model = modelOf(commonId);
    if (!model || !own(model)) return false;
    unrender(commonId);
    models = models.filter((m) => m !== model);
    if (popupFor === commonId) closePopup();
    if (notify) emit("remove", model);
    return true;
  }

  // ---- input --------------------------------------------------------------------

  let press = null; // {commonId, x, y, timer}
  let removedByPress = false;
  let swallowClick = false;
  let touchSnapshot = null;
  let lastPointerType = "mouse";

  function snapshot() {
    const sel = win.getSelection && win.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    return [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset];
  }

  function sameSnapshot(a, b) {
    return !!a && !!b && a.every((v, i) => v === b[i]);
  }

  function startPress(target, x, y) {
    cancelPress();
    const span = closest(target, HIGHLIGHT_SELECTOR);
    if (!span || !enabled) return;
    const model = modelOf(span.dataset.highlightId);
    if (!model || !own(model)) return;
    press = {
      commonId: model.commonId,
      x,
      y,
      timer: win.setTimeout(() => {
        const id = press && press.commonId;
        press = null;
        if (!id || !enabled) return;
        removedByPress = true;
        swallowClick = true;
        win.setTimeout(() => (swallowClick = false), 600);
        removeHighlight(id);
        clearSelection();
        win.setTimeout(clearSelection, 0);
      }, longPressMs),
    };
  }

  function movePress(x, y) {
    if (press && Math.hypot(x - press.x, y - press.y) > MOVE_TOLERANCE) cancelPress();
  }

  function cancelPress() {
    if (press) win.clearTimeout(press.timer);
    press = null;
  }

  function afterPointerUp(isTouch) {
    cancelPress();
    if (removedByPress) {
      // The press removed a highlight; the word under it may now be selected.
      removedByPress = false;
      clearSelection();
      win.setTimeout(clearSelection, 0);
      return;
    }
    if (isTouch && sameSnapshot(touchSnapshot, snapshot())) {
      // A selection left over from before this touch: never highlight it.
      clearSelection();
      return;
    }
    win.setTimeout(createFromSelection, 0);
  }

  const on = [];
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    on.push(() => target.removeEventListener(type, fn, opts));
  }

  listen(root, "touchstart", (e) => {
    lastPointerType = "touch";
    touchSnapshot = snapshot();
    const t = e.touches[0];
    if (e.touches.length === 1) startPress(e.target, t.clientX, t.clientY);
  }, { passive: true });
  listen(root, "touchmove", (e) => {
    const t = e.touches[0];
    if (t) movePress(t.clientX, t.clientY);
  }, { passive: true });
  listen(root, "touchend", () => afterPointerUp(true));
  // Chrome on Android ends a long-press that selects text with `touchcancel`,
  // not `touchend`. Treat it as the end of the touch when a new selection
  // formed during it; a cancelled scroll leaves the selection as it was.
  listen(root, "touchcancel", () => {
    const now = snapshot();
    if (!removedByPress && (!now || sameSnapshot(touchSnapshot, now))) {
      cancelPress();
      return;
    }
    afterPointerUp(true);
  });

  listen(root, "pointerdown", (e) => {
    if (e.pointerType) lastPointerType = e.pointerType;
    if (e.pointerType === "touch" || e.button !== 0) return;
    startPress(e.target, e.clientX, e.clientY);
  });
  listen(root, "pointermove", (e) => {
    if (e.pointerType !== "touch") movePress(e.clientX, e.clientY);
  });
  listen(root, "pointercancel", (e) => {
    if (e.pointerType !== "touch") cancelPress();
  });
  listen(root, "mouseup", (e) => {
    if (e.button === 0) afterPointerUp(false);
  });

  listen(root, "click", (e) => {
    if (swallowClick) {
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const span = closest(e.target, HIGHLIGHT_SELECTOR);
    if (!span) return;
    const id = span.dataset.highlightId;
    const type = e.pointerType || lastPointerType;
    const sel = win.getSelection && win.getSelection();
    const selecting = sel && sel.rangeCount > 0 && !sel.isCollapsed;
    const model = modelOf(id);
    // Mouse / pen: a click removes (the popup comes from hovering). Touch has
    // no hover, so a tap opens the popup. A click that ends a text selection
    // never removes.
    if (clickToRemove && (type === "mouse" || type === "pen") && !selecting) {
      if (enabled && model && own(model)) {
        e.preventDefault();
        removeHighlight(id);
        return;
      }
    }
    openPopup(id);
  });

  // Mouse / pen: resting on a highlight opens its popup; leaving closes it.
  listen(root, "pointerover", (e) => {
    if (!popupOnHover || !showAddToNote || !isMouse(e) || e.buttons) return;
    const span = closest(e.target, HIGHLIGHT_SELECTOR);
    if (!span) return;
    const id = span.dataset.highlightId;
    if (popupFor === id) {
      win.clearTimeout(hoverHideTimer);
      return;
    }
    win.clearTimeout(hoverOpenTimer);
    hoverOpenTimer = win.setTimeout(() => {
      hoverOpenTimer = null;
      if (!press) openPopup(id, false);
    }, hoverDelayMs);
  });
  listen(root, "pointerout", (e) => {
    if (!isMouse(e)) return;
    const span = closest(e.target, HIGHLIGHT_SELECTOR);
    if (!span) return;
    const to = e.relatedTarget;
    const toSpan = closest(to, HIGHLIGHT_SELECTOR);
    if (toSpan && toSpan.dataset.highlightId === span.dataset.highlightId) return;
    if (popup && to && popup.contains(to)) return;
    win.clearTimeout(hoverOpenTimer);
    hoverOpenTimer = null;
    if (popupFor === span.dataset.highlightId) scheduleHoverHide();
  });

  listen(root, "contextmenu", (e) => {
    const span = closest(e.target, HIGHLIGHT_SELECTOR);
    if (!span) return;
    e.preventDefault();
    if (enabled) removeHighlight(span.dataset.highlightId);
  });

  // Never let a selection inside a container stretch across media.
  listen(doc, "selectionchange", () => {
    const sel = win.getSelection && win.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    if (!containerOf(sel.anchorNode)) return;
    if (rangeSpansMedia(sel.getRangeAt(0))) sel.removeAllRanges();
  });

  listen(doc, "pointerdown", (e) => {
    if (!popupFor) return;
    if (popup && popup.contains(e.target)) return;
    if (closest(e.target, HIGHLIGHT_SELECTOR)) return;
    closePopup();
  });
  listen(win, "resize", closePopup);

  // ---- API ------------------------------------------------------------------------

  const api = {
    /** This owner's highlights (what an app saves). */
    getModels() {
      return models.filter(own).map(copy);
    },

    /** Every highlight on the page, including other owners'. */
    getAllModels() {
      return models.map(copy);
    },

    /**
     * Shows saved highlights. A model without `userType` gets
     * `opts.userType` (default: this instance's owner). Returns how many were
     * drawn. Doesn't call onChange.
     */
    restore(list, opts = {}) {
      let drawn = 0;
      (list || []).forEach((item) => {
        if (!item || item.commonId == null || item.id == null) return;
        const model = { ...item, userType: item.userType || opts.userType || owner };
        if (modelOf(model.commonId)) {
          unrender(model.commonId);
          models = models.filter((m) => m.commonId !== model.commonId);
        }
        if (render(model) > 0) drawn++;
        models.push(model);
      });
      return drawn;
    },

    /** Removes one of this owner's highlights; calls onChange. */
    remove(commonId) {
      return removeHighlight(commonId);
    },

    /**
     * Removes every highlight from the page. Calls onChange (with an empty
     * list) only when `opts.notify` is true.
     */
    clear(opts = {}) {
      models.forEach((m) => unrender(m.commonId));
      const had = models.length;
      models = [];
      closePopup();
      if (opts.notify && had && options.onChange) {
        options.onChange([], { type: "clear", model: null });
      }
    },

    /** Turns the current selection into a highlight (e.g. from your own button). */
    highlightSelection() {
      return createFromSelection();
    },

    /** Colour for new highlights (CSS colour), or null for the default. */
    setColor(color) {
      pen = color || null;
    },

    /** Turns creating and removing highlights on or off. */
    setEnabled(value) {
      enabled = value !== false;
      root.classList.toggle("hl-off", !enabled);
      if (!enabled) {
        cancelPress();
        const sel = win.getSelection && win.getSelection();
        if (sel && sel.rangeCount && containerOf(sel.anchorNode)) clearSelection();
      }
    },

    /** Shows or hides the "Add to notes" popup. */
    setAddToNoteVisible(value) {
      showAddToNote = value !== false;
      if (!showAddToNote) closePopup();
    },

    /** The note for a highlight, as the popup would send it. */
    noteFor(commonId) {
      const model = modelOf(commonId);
      const found = model && rangeFor(model);
      if (!found) return null;
      // Prefer the drawn spans, so the HTML carries the highlight markup.
      const spans = spansOf(commonId);
      const range = found.range;
      if (spans.length) {
        range.setStartBefore(spans[0]);
        range.setEndAfter(spans[spans.length - 1]);
      }
      const box = doc.createElement("div");
      box.appendChild(range.cloneContents());
      const html = box.innerHTML;
      box.querySelectorAll(HIGHLIGHT_SELECTOR).forEach((span) => {
        while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
        span.remove();
      });
      return {
        html,
        cleanHtml: box.innerHTML,
        text: range.toString(),
        identifier: found.container.id,
        model: copy(model),
      };
    },

    /**
     * Re-draws highlights whose spans are missing, e.g. after the containers'
     * HTML was replaced. Returns how many were drawn.
     */
    refresh() {
      let drawn = 0;
      models.forEach((m) => {
        if (!spansOf(m.commonId).length && render(m) > 0) drawn++;
      });
      return drawn;
    },

    /** Stops listening, removes the popup and unwraps every highlight. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelPress();
      cancelHoverTimers();
      on.splice(0).forEach((off) => off());
      models.forEach((m) => unrender(m.commonId));
      models = [];
      if (popup) popup.remove();
      popup = null;
      root.classList.remove("hl-off");
      if (injectStyles) {
        const style = doc.getElementById(STYLE_ID);
        if (style) {
          const users = Number(style.dataset.users || 1) - 1;
          if (users <= 0) style.remove();
          else style.dataset.users = String(users);
        }
      }
    },
  };

  if (options.highlights) api.restore(options.highlights);
  return api;
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
