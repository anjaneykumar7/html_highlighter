import 'package:html_highlighter/html_highlighter.dart';

/// The playground page: a question, its explanation, then an article with
/// several sections. One highlightable container per block, with lists,
/// tables, an image and video / PDF iframes inside them.
final String samplePageBody = '$_questionAndExplanation$_article';

/// Shown in the explanation: an ECG strip drawn as an inline SVG, so it needs
/// no network.
const String sampleImageSrc =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' "
    "viewBox='0 0 320 80'><rect width='320' height='80' fill='%23fff7f7'/>"
    "<path d='M0 50 H40 L48 50 L54 20 L60 62 L66 50 H110 L118 50 L124 20 "
    "L130 62 L136 50 H180 L188 50 L194 20 L200 62 L206 50 H250 L258 50 "
    "L264 20 L270 62 L276 50 H320' fill='none' stroke='%23dc2626' "
    "stroke-width='2'/></svg>";

/// A short CC0 sample video (MDN) and pdf.js's demo PDF, shown in iframes.
/// Both need a network connection. The PDF host must allow cross-origin reads
/// (CORS), because pdf.js fetches it.
const String sampleVideoUrl =
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const String samplePdfUrl =
    'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

/// pdf.js, used by the PDF iframe (iOS won't draw a raw PDF in an iframe).
const String pdfJsUrl =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const String pdfJsWorkerUrl =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/// An iframe whose page is a `<video playsinline>`. Pointing an iframe straight
/// at an `.mp4` makes WebKit open a bare media document, which never started on
/// the iOS simulator; a small page with an inline video does.
String videoFrame(String url, {required String title}) =>
    _frame(title, 'media', '''
<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}
video{display:block;width:100%;height:100%;object-fit:contain}</style>
</head><body>
<video controls playsinline preload="metadata" src="$url"></video>
<script>
var v = document.querySelector('video');
function say(m) { try { parent.console.log('media: "$title" ' + m); } catch (e) {} }
v.addEventListener('loadedmetadata', function () {
  say('video ready, ' + v.videoWidth + 'x' + v.videoHeight + ', ' +
      Math.round(v.duration) + ' s');
});
v.addEventListener('error', function () {
  say('video error ' + (v.error && v.error.code));
});
</script>
</body></html>''');

/// An iframe whose page renders the first pages of a PDF with pdf.js. iOS
/// WKWebView leaves an iframe pointing straight at a PDF blank.
String pdfFrame(String url, {required String title, int maxPages = 3}) =>
    _frame(title, 'media pdf', '''
<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#525659;font:14px -apple-system,sans-serif}
#status{color:#fff;padding:12px}
canvas{display:block;margin:8px auto;background:#fff;box-shadow:0 1px 4px #0006}</style>
<script src="$pdfJsUrl"></script>
</head><body>
<div id="status">Loading PDF…</div>
<script>
function say(m) { try { parent.console.log('media: "$title" ' + m); } catch (e) {} }
var statusEl = document.getElementById('status');
pdfjsLib.GlobalWorkerOptions.workerSrc = '$pdfJsWorkerUrl';
pdfjsLib.getDocument('$url').promise.then(async function (pdf) {
  var ratio = window.devicePixelRatio || 1;
  var pages = Math.min(pdf.numPages, $maxPages);
  for (var i = 1; i <= pages; i++) {
    var page = await pdf.getPage(i);
    var width = document.body.clientWidth - 16;
    var scale = width / page.getViewport({ scale: 1 }).width;
    var vp = page.getViewport({ scale: scale * ratio });
    var c = document.createElement('canvas');
    c.width = vp.width;
    c.height = vp.height;
    c.style.width = (vp.width / ratio) + 'px';
    document.body.appendChild(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
  statusEl.textContent = 'Showing ' + pages + ' of ' + pdf.numPages + ' pages';
  say('pdf rendered ' + pages + ' of ' + pdf.numPages + ' pages');
}).catch(function (e) {
  statusEl.textContent = 'Could not load the PDF: ' + e;
  say('pdf error ' + e);
});
</script>
</body></html>''');

/// An iframe with [doc] as its page (`srcdoc`, escaped for the attribute).
String _frame(String title, String cssClass, String doc) {
  final escaped = doc.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return '<iframe class="$cssClass" title="$title" srcdoc="$escaped" '
      'allow="autoplay; fullscreen" allowfullscreen></iframe>';
}

final String _questionAndExplanation =
    '''
<h4>Question</h4>
${highlightContainer(type: 'question', id: 'demo-q1', html: '''
<p>A 54-year-old man comes to the emergency department because of crushing
substernal chest pain that began 40 minutes ago while he was shovelling snow.
He has a history of hypertension and type 2 diabetes mellitus. His pulse is
104/min and blood pressure is 150/92 mm Hg. An ECG shows ST-segment elevation
in leads II, III and aVF.</p>
<p>Which of the following coronary arteries is most likely occluded?</p>
<ol type="A" class="options">
  <li>Left anterior descending artery</li>
  <li>Left circumflex artery</li>
  <li><b>Right coronary artery</b></li>
  <li>Left main coronary artery</li>
</ol>
''')}
<h4>Explanation</h4>
${highlightContainer(type: 'explanation', id: 'demo-q1', html: '''
<p>ST elevation in the <b>inferior leads (II, III, aVF)</b> indicates an
inferior wall myocardial infarction. In about 80% of people the inferior wall
is supplied by the <b>right coronary artery</b> (right-dominant circulation),
so it is the most likely culprit vessel.</p>
<p>Inferior infarcts can also cause bradyarrhythmias, because the right coronary
artery usually supplies the sinoatrial and atrioventricular nodes. Right
ventricular involvement should be suspected when hypotension follows nitrate
administration.</p>
<figure>
  <img src="$sampleImageSrc" alt="ECG strip with ST elevation" width="320" height="80">
  <figcaption>ST elevation in an inferior lead. Text around images is
  highlightable too.</figcaption>
</figure>
<table>
  <caption>Coronary artery territories</caption>
  <thead>
    <tr><th>Artery</th><th>Territory</th><th>ECG leads</th></tr>
  </thead>
  <tbody>
    <tr><td>Right coronary</td><td>Inferior wall</td><td>II, III, aVF</td></tr>
    <tr><td>Left anterior descending</td><td>Anterior wall and septum</td><td>V1 to V4</td></tr>
    <tr><td>Left circumflex</td><td>Lateral wall</td><td>I, aVL, V5, V6</td></tr>
  </tbody>
</table>
<p>Tables are highlightable too.</p>
''')}
''';

final String _article =
    '''
<h2>Cardiac conduction system</h2>
${_section('sa-node', 'Sinoatrial node', '''
The sinoatrial (SA) node is the heart's primary pacemaker. It sits in the wall
of the right atrium near the opening of the superior vena cava and normally
fires 60 to 100 times per minute.''')}
${_section('av-node', 'Atrioventricular node', '''
The atrioventricular (AV) node delays the impulse by about 0.1 seconds, giving
the atria time to finish emptying into the ventricles. This delay appears on
the ECG as the PR segment.</p>
<p>Causes of a prolonged PR interval include:</p>
<ul>
  <li>First-degree AV block</li>
  <li>Drugs such as beta blockers and digoxin</li>
  <li>Hyperkalaemia</li>
</ul>
<p>Lists are highlightable too.''')}
${_section('purkinje', 'Bundle of His and Purkinje fibres', '''
From the AV node the impulse travels down the bundle of His, splits into the
left and right bundle branches, and spreads through the Purkinje fibres, which
conduct faster than any other cardiac tissue.''')}
${_sectionHtml('rates', 'Intrinsic pacemaker rates', '''
<p>If a faster pacemaker fails, the next one down the system takes over at its
own rate.</p>
<table>
  <thead>
    <tr><th>Pacemaker</th><th>Rate (per minute)</th></tr>
  </thead>
  <tbody>
    <tr><td>Sinoatrial node</td><td>60 to 100</td></tr>
    <tr><td>Atrioventricular junction</td><td>40 to 60</td></tr>
    <tr><td>Purkinje fibres</td><td>20 to 40</td></tr>
  </tbody>
</table>''')}
${_sectionHtml('media', 'Watch and read', '''
<p>This short clip plays inside an iframe. The text around it can still be
highlighted.</p>
${videoFrame(sampleVideoUrl, title: 'Sample video')}
<p>The handout below is a PDF shown in an iframe.</p>
${pdfFrame(samplePdfUrl, title: 'Sample PDF')}
<p>Iframes are separate documents: their contents can't be highlighted, but
the text before and after them can.</p>''')}
''';

String _section(String id, String title, String text) =>
    _sectionHtml(id, title, '<p>$text</p>');

String _sectionHtml(String id, String title, String html) =>
    '''
<h3>$title</h3>
${highlightContainer(type: 'article', id: id, enabled: true, html: html)}
''';

const String sampleCss = '''
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 15px;
  line-height: 1.65;
  color: #1f2933;
  padding: 8px 20px 40px;
  margin: 0;
  background: #ffffff;
}
h2 { font-size: 20px; margin: 16px 0 4px; }
h3 { font-size: 16px; margin: 20px 0 4px; color: #368B9D; }
h4 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em;
     color: #6b7280; margin: 20px 0 4px; }
.options { padding-left: 24px; color: #374151; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 14px; }
caption { text-align: left; font-weight: 600; margin-bottom: 6px; }
th, td { border: 1px solid #d5dbe1; padding: 6px 10px; text-align: left;
         vertical-align: top; }
th { background: #f1f5f9; font-weight: 600; }
figure { margin: 12px 0; }
figure img { max-width: 100%; height: auto; border: 1px solid #f3d1d1;
             border-radius: 6px; }
figcaption { font-size: 13px; color: #6b7280; margin-top: 4px; }
iframe.media { display: block; width: 100%; height: 220px; margin: 12px 0;
               border: 1px solid #d5dbe1; border-radius: 6px; }
iframe.pdf { height: 320px; }
''';

/// Passed as `addScripts`: one full `<script>` block and one plain-JS entry.
/// Both log to the playground's JS console, proving they ran.
const List<String> sampleScripts = [
  '<script>console.log("addScripts: <script> block ran");</script>',
  'console.log("addScripts: plain JS entry ran");',
  _mediaCheckScript,
];

/// Logs whether each iframe loaded and whether the page can reach the
/// network, so iframe problems show up in the JS console.
const String _mediaCheckScript = r'''
document.querySelectorAll('iframe').forEach(function (f) {
  function loaded() {
    // srcdoc frames can finish before this script runs.
    try { return f.contentDocument && f.contentDocument.readyState === 'complete'; }
    catch (e) { return false; }
  }
  if (loaded()) { console.log('media: "' + f.title + '" loaded'); return; }
  var timer = setTimeout(function () {
    console.log('media: "' + f.title + '" did not load within 15 s');
  }, 15000);
  f.addEventListener('load', function () {
    clearTimeout(timer);
    console.log('media: "' + f.title + '" loaded');
  });
});
fetch('https://www.w3.org/', { mode: 'no-cors' })
  .then(function () { console.log('media: network ok'); })
  .catch(function (e) { console.log('media: network error ' + e); });
''';
