import type { HighlightSection } from "html-highlighter-web/react";

export const question: HighlightSection[] = [
  {
    type: "question",
    id: "demo-q1",
    html: `<p>A 54-year-old man has crushing chest pain. An ECG shows ST-segment
elevation in leads II, III and aVF.</p>
<p>Which coronary artery is most likely occluded?</p>
<ol type="A"><li>Left anterior descending</li><li>Left circumflex</li>
<li><b>Right coronary</b></li><li>Left main</li></ol>`,
  },
  {
    type: "explanation",
    id: "demo-q1",
    html: `<p>ST elevation in the <b>inferior leads</b> indicates an inferior wall
infarction, usually from the <b>right coronary artery</b>.</p>
<table><thead><tr><th>Artery</th><th>Territory</th></tr></thead>
<tbody><tr><td>Right coronary</td><td>Inferior wall</td></tr>
<tr><td>Left anterior descending</td><td>Anterior wall and septum</td></tr></tbody></table>`,
  },
];

export const article: HighlightSection[] = [
  {
    type: "article",
    id: "sa-node",
    html: `<p>The sinoatrial node is the heart's primary pacemaker and fires
60 to 100 times per minute. This block is rendered by a Server Component.</p>`,
  },
];

export const palette = ["#FDE047", "#86EFAC", "#93C5FD", "#F9A8D4", null] as const;
