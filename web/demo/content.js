// Sample content shared by the demos: a question, its explanation (with an
// image and a table) and an article (with a list and an iframe).
const ecg =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 80'>" +
  "<rect width='320' height='80' fill='%23fff7f7'/><path d='M0 50 H40 L48 50 L54 20 L60 62 " +
  "L66 50 H110 L118 50 L124 20 L130 62 L136 50 H180 L188 50 L194 20 L200 62 L206 50 H250 " +
  "L258 50 L264 20 L270 62 L276 50 H320' fill='none' stroke='%23dc2626' stroke-width='2'/></svg>";

const frame =
  "<!doctype html><body style='margin:0;font:15px system-ui;background:#111;color:#fff;" +
  "display:grid;place-items:center;height:100vh'>Embedded content (an iframe)</body>";

export const sections = [
  {
    type: "question",
    id: "demo-q1",
    html: `<p>A 54-year-old man has crushing chest pain. An ECG shows ST-segment
elevation in leads II, III and aVF.</p>
<p>Which of the following coronary arteries is most likely occluded?</p>
<ol type="A"><li>Left anterior descending artery</li><li>Left circumflex artery</li>
<li><b>Right coronary artery</b></li><li>Left main coronary artery</li></ol>`,
  },
  {
    type: "explanation",
    id: "demo-q1",
    html: `<p>ST elevation in the <b>inferior leads (II, III, aVF)</b> indicates an
inferior wall myocardial infarction, usually from the <b>right coronary artery</b>.</p>
<figure><img src="${ecg}" alt="ECG strip" width="320" height="80">
<figcaption>ST elevation in an inferior lead.</figcaption></figure>
<table><thead><tr><th>Artery</th><th>Territory</th></tr></thead>
<tbody><tr><td>Right coronary</td><td>Inferior wall</td></tr>
<tr><td>Left anterior descending</td><td>Anterior wall and septum</td></tr></tbody></table>`,
  },
  {
    type: "article",
    id: "av-node",
    html: `<p>The atrioventricular node delays the impulse by about 0.1 seconds.</p>
<ul><li>First-degree AV block</li><li>Beta blockers and digoxin</li><li>Hyperkalaemia</li></ul>
<p>Text before the iframe.</p>
<iframe title="embedded" srcdoc="${frame}" style="width:100%;height:120px;border:0;border-radius:8px"></iframe>
<p>Text after the iframe. Selections across it are blocked.</p>`,
  },
];

export const palette = ["#FDE047", "#86EFAC", "#93C5FD", "#F9A8D4", "#FDBA74", null];

export const pageCss = `
:root { color-scheme: light; }
body { margin: 0; font: 16px/1.6 system-ui, -apple-system, sans-serif; color: #1f2933; background: #f4f6f8; }
main { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; max-width: 1100px; margin: 0 auto; padding: 20px 16px; }
@media (max-width: 800px) { main { grid-template-columns: 1fr; } }
.page { background: #fff; border-radius: 12px; padding: 8px 24px 24px; box-shadow: 0 1px 3px #0001; }
.page h4 { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; margin: 22px 0 4px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { border: 1px solid #d5dbe1; padding: 6px 10px; text-align: left; }
th { background: #f1f5f9; }
figcaption { font-size: 13px; color: #6b7280; }
aside { display: flex; flex-direction: column; gap: 12px; font-size: 14px; }
aside section { background: #fff; border-radius: 12px; padding: 12px 14px; box-shadow: 0 1px 3px #0001; }
aside h3 { margin: 0 0 8px; font-size: 13px; }
.swatches { display: flex; gap: 8px; }
.swatches button { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px #cbd5e1; cursor: pointer; }
.swatches button[aria-pressed="true"] { box-shadow: 0 0 0 2px #0f766e; }
.swatches button.none { background: repeating-linear-gradient(45deg, #fff 0 4px, #e2e8f0 4px 8px); }
label { display: flex; gap: 8px; align-items: center; }
pre { margin: 0; max-height: 220px; overflow: auto; font-size: 12px; background: #f1f5f9; padding: 8px; border-radius: 8px; }
.buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.buttons button { border: 1px solid #cbd5e1; background: #fff; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
ul.log { margin: 0; padding-left: 16px; max-height: 160px; overflow: auto; font-size: 12px; }
`;
