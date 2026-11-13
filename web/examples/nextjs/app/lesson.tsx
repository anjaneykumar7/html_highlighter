"use client";

import { useEffect, useRef, useState } from "react";
import {
  HighlightableHtml,
  type HighlighterHandle,
  type HighlightModel,
} from "html-highlighter-web/react";
import { palette, question } from "./content";
import styles from "./page.module.css";

const KEY = "lesson-highlights";

// A client component: state, callbacks, switches, and saving to localStorage.
export function Lesson() {
  const [saved, setSaved] = useState<HighlightModel[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [color, setColor] = useState<string | null>(palette[0]);
  const [enabled, setEnabled] = useState(true);
  const [popup, setPopup] = useState(true);
  const ref = useRef<HighlighterHandle>(null);

  // Load after mount (localStorage doesn't exist on the server).
  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch {
      setSaved([]);
    }
  }, []);

  const save = (models: HighlightModel[]) => {
    setSaved(models);
    try {
      localStorage.setItem(KEY, JSON.stringify(models));
    } catch {}
  };

  return (
    <div className={styles.grid}>
      <section className={`${styles.card} ${styles.content}`}>
        <h2>Client component</h2>
        {saved === null ? (
          <p>Loading…</p>
        ) : (
          <HighlightableHtml
            ref={ref}
            sections={question}
            highlights={saved}
            onChange={save}
            onAddToNote={(note) => setNotes((n) => [note.text, ...n])}
            color={color}
            enabled={enabled}
            showAddToNote={popup}
            injectStyles={false}
          />
        )}
      </section>
      <aside className={`${styles.card} ${styles.side}`}>
        <div className={styles.swatches}>
          {palette.map((c) => (
            <button
              key={c ?? "none"}
              aria-label={c ?? "default"}
              aria-pressed={c === color}
              className={c ? styles.swatch : `${styles.swatch} ${styles.none}`}
              style={c ? { background: c } : undefined}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Highlighting enabled
        </label>
        <label>
          <input type="checkbox" checked={popup} onChange={(e) => setPopup(e.target.checked)} />
          Show &quot;Add to notes&quot;
        </label>
        <button onClick={() => ref.current?.clear({ notify: true })}>Clear all</button>
        <h3>Saved ({saved?.length ?? 0})</h3>
        <pre id="saved" className={styles.saved}>{JSON.stringify(saved ?? [], null, 2)}</pre>
        <h3>Notes</h3>
        <ul id="notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </aside>
    </div>
  );
}
