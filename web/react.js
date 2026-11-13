"use client";
// React bindings for html-highlighter (React 17+, Next.js App and Pages Router).
// Plain JavaScript (no JSX), so it needs no build step.

import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { createHighlighter, highlightContainerId } from "./highlighter.js";

/**
 * Attaches a highlighter to the element in `ref` while the component is
 * mounted. Returns a stable API object (`getModels`, `restore`, `remove`,
 * `clear`, `highlightSelection`, `noteFor`, `refresh`, `instance`).
 *
 * `highlights` are drawn on mount and whenever `contentKey` changes (pass
 * something that changes when the HTML inside the element is replaced).
 * Changing them at other times doesn't redraw, so feeding `onChange` straight
 * back into `highlights` is safe.
 */
export function useHighlighter(ref, options = {}) {
  const instance = useRef(null);
  const latest = useRef(options);
  latest.current = options;

  const {
    color = null,
    enabled = true,
    showAddToNote = true,
    userType = "student",
    injectStyles = true,
    longPressMs,
    addToNoteLabel,
    popupAfterCreate,
    popupOnHover,
    clickToRemove,
    hoverDelayMs,
    hoverHideMs,
    contentKey,
  } = options;

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const now = latest.current;
    const hl = createHighlighter(root, {
      color: now.color,
      enabled: now.enabled !== false,
      showAddToNote: now.showAddToNote !== false,
      userType,
      injectStyles,
      longPressMs,
      addToNoteLabel,
      popupAfterCreate,
      popupOnHover,
    clickToRemove,
      hoverDelayMs,
      hoverHideMs,
      onChange: (models, info) => latest.current.onChange?.(models, info),
      onAddToNote: (note) => latest.current.onAddToNote?.(note),
    });
    if (now.highlights && now.highlights.length) hl.restore(now.highlights);
    instance.current = hl;
    return () => {
      hl.destroy();
      if (instance.current === hl) instance.current = null;
    };
  }, [
    ref,
    contentKey,
    userType,
    injectStyles,
    longPressMs,
    addToNoteLabel,
    popupAfterCreate,
    popupOnHover,
    clickToRemove,
    hoverDelayMs,
    hoverHideMs,
  ]);

  useEffect(() => {
    instance.current?.setColor(color);
  }, [color]);
  useEffect(() => {
    instance.current?.setEnabled(enabled);
  }, [enabled]);
  useEffect(() => {
    instance.current?.setAddToNoteVisible(showAddToNote);
  }, [showAddToNote]);

  return useMemo(
    () => ({
      getModels: () => instance.current?.getModels() ?? [],
      getAllModels: () => instance.current?.getAllModels() ?? [],
      restore: (list, opts) => instance.current?.restore(list, opts) ?? 0,
      remove: (commonId) => instance.current?.remove(commonId) ?? false,
      clear: (opts) => instance.current?.clear(opts),
      highlightSelection: () => instance.current?.highlightSelection() ?? null,
      noteFor: (commonId) => instance.current?.noteFor(commonId) ?? null,
      refresh: () => instance.current?.refresh() ?? 0,
      get instance() {
        return instance.current;
      },
    }),
    []
  );
}

/**
 * Renders HTML in highlight containers and makes it highlightable.
 *
 *   <HighlightableHtml
 *     sections={[{ type: "question", id: q.id, html: q.html }]}
 *     highlights={saved}
 *     onChange={(models) => setSaved(models)}
 *     onAddToNote={(note) => addNote(note.cleanHtml)}
 *     color="#86EFAC"
 *   />
 *
 * Or a single block: `html`, with optional `containerType` (default
 * "article") and `containerId` (default "content"). Any other props (`id`,
 * `className`, `style`, `data-*`…) go on the wrapper element. The ref exposes
 * the same API as useHighlighter.
 */
export const HighlightableHtml = forwardRef(function HighlightableHtml(props, ref) {
  const {
    sections,
    html,
    containerType = "article",
    containerId = "content",
    highlights,
    onChange,
    onAddToNote,
    color,
    enabled,
    showAddToNote,
    userType,
    injectStyles,
    longPressMs,
    addToNoteLabel,
    popupAfterCreate,
    popupOnHover,
    clickToRemove,
    hoverDelayMs,
    hoverHideMs,
    as = "div",
    ...rest
  } = props;

  const list = sections || [{ type: containerType, id: containerId, html: html || "" }];
  const contentKey = list
    .map((s) => `${s.type}\u0000${s.id}\u0000${s.html}\u0000${s.enabled}`)
    .join("\u0001");

  const rootRef = useRef(null);
  const api = useHighlighter(rootRef, {
    highlights,
    onChange,
    onAddToNote,
    color,
    enabled,
    showAddToNote,
    userType,
    injectStyles,
    longPressMs,
    addToNoteLabel,
    popupAfterCreate,
    popupOnHover,
    clickToRemove,
    hoverDelayMs,
    hoverHideMs,
    contentKey,
  });
  useImperativeHandle(ref, () => api, [api]);

  return createElement(
    as,
    { ...rest, ref: rootRef },
    list.map((s) =>
      createElement("div", {
        key: highlightContainerId(s.type, s.id),
        id: highlightContainerId(s.type, s.id),
        "data-highlight-type": "highlight-range",
        "data-container-type": s.type,
        "data-highlighton": s.enabled === false ? "false" : undefined,
        className: s.className,
        dangerouslySetInnerHTML: { __html: s.html },
      })
    )
  );
});
