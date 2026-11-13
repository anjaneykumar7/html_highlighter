import { HighlightableHtml } from "html-highlighter-web/react";
import { article } from "./content";
import { Lesson } from "./lesson";
import styles from "./page.module.css";

// A Server Component. It can render HighlightableHtml directly (the module is
// "use client"), as long as it passes no functions.
export default function Page() {
  return (
    <main className={styles.main}>
      <h1>html-highlighter in Next.js</h1>
      <Lesson />
      <section className={`${styles.card} ${styles.content}`}>
        <h2>Server component</h2>
        <HighlightableHtml
          id="server-block"
          sections={article}
          color="#93C5FD"
          injectStyles={false}
          highlights={[
            {
              commonId: "srv1",
              id: "highlight-container--article-sa-node",
              startOffset: 4,
              endOffset: 20,
              userType: "student",
            },
          ]}
        />
      </section>
    </main>
  );
}
