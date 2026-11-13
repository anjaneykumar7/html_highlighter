// Type-checks the public API the way an app (e.g. Next.js) would use it.
import { useRef, useState } from "react";
import {
  createHighlighter,
  highlightContainer,
  type HighlightModel,
  type HighlightNote,
} from "html-highlighter-web";
import { HighlightableHtml, useHighlighter, type HighlighterHandle } from "html-highlighter-web/react";

const el = document.createElement("div");
el.innerHTML = highlightContainer({ type: "article", id: "a", html: "<p>x</p>" });
const hl = createHighlighter(el, {
  color: "#86EFAC",
  onChange: (models: HighlightModel[], info) => console.log(models.length, info.type),
  onAddToNote: (note: HighlightNote) => console.log(note.cleanHtml),
});
hl.setEnabled(false);
hl.destroy();

export function Lesson({ html }: { html: string }) {
  const [saved, setSaved] = useState<HighlightModel[]>([]);
  const ref = useRef<HighlighterHandle>(null);
  return (
    <HighlightableHtml
      ref={ref}
      className="lesson"
      sections={[{ type: "question", id: "q1", html }]}
      highlights={saved}
      onChange={setSaved}
      onAddToNote={(n) => console.log(n.text)}
      color="#F9A8D4"
      enabled
      showAddToNote={false}
    />
  );
}

export function Own() {
  const ref = useRef<HTMLDivElement>(null);
  const api = useHighlighter(ref, { userType: "student" });
  return <div ref={ref} onClick={() => api.getModels()} />;
}
