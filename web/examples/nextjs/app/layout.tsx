import type { ReactNode } from "react";
// The highlighter's own styles, imported once for the whole app.
import "html-highlighter-web/Highlighter.css";
import styles from "./page.module.css";

export const metadata = { title: "html-highlighter + Next.js" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={styles.page}>{children}</body>
    </html>
  );
}
