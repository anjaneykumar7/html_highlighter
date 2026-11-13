import 'package:flutter_test/flutter_test.dart';
import 'package:html_highlighter_example/sample_content.dart';

int _containers(String html) =>
    'data-highlight-type="highlight-range"'.allMatches(html).length;

int _at(String needle) => samplePageBody.indexOf(needle);

void main() {
  test('one page holds question, explanation and article containers', () {
    expect(_containers(samplePageBody), 7);
    expect(
      _at('highlight-container--question-'),
      lessThan(_at('highlight-container--explanation-')),
    );
    expect(
      _at('highlight-container--explanation-'),
      lessThan(_at('highlight-container--article-')),
    );
  });

  test('lists sit inside highlight containers', () {
    expect(_at('<ol'), greaterThan(_at('highlight-container--question-')));
    expect(_at('<ol'), lessThan(_at('<h4>Explanation')));
    expect(
      _at('<ul>'),
      greaterThan(_at('highlight-container--article-av-node')),
    );
  });

  test('tables sit inside highlight containers', () {
    expect(
      _at('<table>'),
      greaterThan(_at('highlight-container--explanation-')),
    );
    expect(
      samplePageBody.lastIndexOf('<table>'),
      greaterThan(_at('highlight-container--article-rates')),
    );
  });

  test('an image sits inside the explanation container', () {
    final img = _at('<img src="$sampleImageSrc"');
    expect(img, greaterThan(_at('highlight-container--explanation-')));
    expect(img, lessThan(_at('highlight-container--article-')));
    expect(sampleImageSrc, startsWith('data:image/svg+xml'));
    expect(samplePageBody, contains('alt="ECG strip with ST elevation"'));
    // In a <figure>, not a <p>: the engine drops images nested in <p> from
    // note HTML.
    expect(samplePageBody, contains('<figure>\n  <img'));
  });

  test('video and PDF iframes sit inside the media container', () {
    final media = _at('highlight-container--article-media');
    expect(media, greaterThan(0));
    expect('<iframe'.allMatches(samplePageBody).length, 2);
    expect(_at('title="Sample video"'), greaterThan(media));
    expect(_at('title="Sample PDF"'), greaterThan(media));
    // Highlightable text before and after the iframes.
    final after = samplePageBody.lastIndexOf('</iframe>');
    expect(samplePageBody.indexOf('<p>', after), greaterThan(after));
  });

  test('media iframes carry their page in a correctly escaped srcdoc', () {
    for (final frame in [
      videoFrame(sampleVideoUrl, title: 'V'),
      pdfFrame(samplePdfUrl, title: 'P'),
    ]) {
      final start = frame.indexOf('srcdoc="') + 'srcdoc="'.length;
      final end = frame.indexOf('"', start);
      final doc = frame.substring(start, end);
      // The attribute ends exactly where the embedded page ends.
      expect(doc.trimRight(), endsWith('</html>'));
      expect(doc, isNot(contains('"')));
      expect(frame.substring(end), startsWith('" allow='));
    }
  });

  test('the video frame plays inline and the PDF frame uses pdf.js', () {
    final video = videoFrame(sampleVideoUrl, title: 'V');
    expect(video, contains('playsinline'));
    expect(video, contains('src=&quot;$sampleVideoUrl&quot;'));
    final pdf = pdfFrame(samplePdfUrl, title: 'P', maxPages: 2);
    expect(pdf, contains(pdfJsUrl));
    expect(pdf, contains(pdfJsWorkerUrl));
    expect(pdf, contains("getDocument('$samplePdfUrl')"));
    expect(pdf, contains('Math.min(pdf.numPages, 2)'));
    expect(samplePdfUrl, endsWith('.pdf'));
  });
}
