import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:html_highlighter/html_highlighter.dart';

class _FakeBundle extends CachingAssetBundle {
  final List<String> requested = [];

  @override
  Future<ByteData> load(String key) async {
    requested.add(key);
    return ByteData.sublistView(utf8.encode('// $key'));
  }
}

class _FakeHost implements HighlightHost {
  final Map<String, void Function(String)> channels = {};
  final List<String> scripts = [];

  @override
  Future<void> addChannel(String name, void Function(String) onMessage) async =>
      channels[name] = onMessage;

  @override
  Future<void> runJavaScript(String script) async => scripts.add(script);
}

String _engineJs() => File('assets/highlighter.js').readAsStringSync();

/// Start of the stale-selection guard.
const _guardMarker =
    '\n(function () {\n  if (window.__hlSelectionGuard) return;';

/// Start of the page controls.
const _controlsMarker = '// Page controls';

/// The engine itself: everything before the guard.
String _engineCore() {
  final js = _engineJs();
  return js.substring(0, js.indexOf(_guardMarker));
}

void main() {
  group('engine', () {
    test('ships as one script', () {
      expect(
          Directory('assets')
              .listSync()
              .whereType<File>()
              .map((f) => f.uri.pathSegments.last),
          ['highlighter.js']);
      expect(File('pubspec.yaml').readAsStringSync(),
          contains('- assets/highlighter.js'));
    });

    test('defines and publishes its entry points, with no modes', () {
      final core = _engineCore();
      for (final name in [
        'setHighlightFromFlutter',
        'clearModels',
        'toggleUserHighlight',
        'toggleStudyAssist',
      ]) {
        expect(core, contains('function $name('));
        expect(core, contains('window.$name = $name;'));
      }
      expect(_engineJs(), isNot(contains('__hlEngineMode')));
    });

    test('stale-selection guard runs after the engine, before its handlers',
        () {
      // Regression: on touch, removing a highlight by press-and-hold left the
      // word selected, and the next tap re-created the highlight.
      final js = _engineJs();
      final guardAt = js.indexOf(_guardMarker);
      expect(guardAt, greaterThan(0));
      final guard = js.substring(guardAt, js.indexOf(_controlsMarker));
      expect(guard, contains('document.addEventListener(\n    "touchstart"'));
      expect(guard, contains('document.addEventListener(\n    "touchend"'));
      expect('},\n    true\n  );'.allMatches(guard).length, 2,
          reason: 'both listeners must use the capture phase');
      expect(guard, contains('if (!e.isTrusted) return;'));
      expect(guard, contains('span.addEventListener("touchend", done)'));
      expect(guard, contains('if (span.isConnected) return;'));
      expect(guard, contains('sameSelection(atStart, snapshot())'));
      expect(guard, contains('removeAllRanges()'));
    });

    test('engine has no debug logging', () {
      // Errors and warnings stay; console.log chatter was removed.
      expect(_engineJs(), isNot(contains('console.log(')));
    });

    test('post-create callback has commonId in scope', () {
      // Regression: it read an undefined `commonId`, threw after posting the
      // change and never opened the popup.
      final js = _engineCore();
      final start = js.indexOf('var onHighlightCallback = function');
      final end = js.indexOf(');', js.indexOf('showPopup(', start));
      final callback = js.substring(start, end);
      expect(callback, contains('highlightedData.commonId'));
      expect(callback, isNot(contains('=== commonId)')));
    });

    test('loads from the package-prefixed asset key', () async {
      final bundle = _FakeBundle();
      final js = await HighlighterScripts.load(bundle: bundle);
      expect(bundle.requested, [HighlighterScripts.assetKey]);
      expect(HighlighterScripts.assetKey,
          'packages/html_highlighter/assets/highlighter.js');
      expect(js, '// ${HighlighterScripts.assetKey}');
      expect(await HighlighterScripts.scriptTag(bundle: bundle),
          startsWith('<script>'));
    });
  });

  group('highlightContainer', () {
    test('produces the markup the engines select on', () {
      final html =
          highlightContainer(type: 'question', id: 'q1', html: '<p>Hi</p>');
      expect(html, contains('data-highlight-type="highlight-range"'));
      expect(html, contains('data-container-type="question"'));
      expect(html, contains('id="highlight-container--question-q1"'));
      expect(html, isNot(contains('data-highlighton')));
      expect(html, endsWith('<p>Hi</p></div>'));
    });

    test('writes data-highlighton when enabled is given', () {
      expect(
          highlightContainer(
              type: 'article', id: 'a', html: '', enabled: false),
          contains('data-highlighton="false"'));
    });
  });

  group('HighlightChange', () {
    test('parses the engine payload ({userType, data: [...]})', () {
      final change = HighlightChange.tryParse(jsonEncode({
        'status': 'success',
        'userType': 'student',
        'data': [
          {'commonId': 'a'},
          {'commonId': 'b'}
        ],
      }))!;
      expect(change.userType, 'student');
      expect(change.models.map((m) => m['commonId']), ['a', 'b']);
    });

    test('rejects non-object messages', () {
      expect(HighlightChange.tryParse('not json'), isNull);
      expect(HighlightChange.tryParse('[1,2]'), isNull);
    });
  });

  test('HighlightNoteRequest strips the highlight background', () {
    final note = HighlightNoteRequest.tryParse(jsonEncode({
      'identifier': 'highlight-container--article-9',
      'data': '<span style="background-color: yellow;">x</span>',
    }))!;
    expect(note.identifier, 'highlight-container--article-9');
    expect(note.cleanHtml, '<span style="">x</span>');
  });

  test('note HTML keeps images and iframes', () {
    const img = '<img src="data:image/svg+xml;utf8,<svg/>" alt="ECG">';
    const iframe = '<iframe src="https://example.com/a.pdf"></iframe>';
    const note = HighlightNoteRequest(
        html: '<figure>$img</figure>'
            '<span data-highlight-id="x" style="background-color: #86EFAC;">'
            'caption</span>$iframe');
    expect(note.cleanHtml, contains(img));
    expect(note.cleanHtml, contains(iframe));
    expect(note.cleanHtml, isNot(contains('#86EFAC')));
  });

  test('containers keep image and iframe markup untouched', () {
    const inner = '<p>Before</p>'
        '<img src="data:image/svg+xml;utf8,<svg/>" alt="x">'
        '<iframe src="https://example.com/v.mp4"></iframe><p>After</p>';
    final html = highlightContainer(type: 'article', id: 'm', html: inner);
    expect(html, contains(inner));
    expect(html, startsWith('<div data-highlight-type="highlight-range"'));
  });

  group('restore script', () {
    test('passes the payload and retries once', () {
      final js =
          HtmlHighlightBridge.buildRestoreScript('[{"a":1}]', retryMs: 500);
      expect(js, contains('var __hlPayload = [{"a":1}];'));
      expect(js, contains('}, 500);'));
      expect(js, isNot(contains('}, 150);')));
    });

    test('optionally re-applies', () {
      final js = HtmlHighlightBridge.buildRestoreScript('{}',
          retryMs: 150, reapplyMs: 150);
      expect('setHighlightFromFlutter(__hlPayload)'.allMatches(js).length, 3);
    });
  });

  test('buildHighlightDocument puts the engine after the content', () {
    final doc = buildHighlightDocument(body: '<p id="c"></p>', engineJs: '//E');
    expect(doc.indexOf('<p id="c">'), lessThan(doc.indexOf('//E')));
    expect(doc.indexOf('//E'), lessThan(doc.indexOf('__hlMouseShim')));
    expect(
        buildHighlightDocument(body: '', engineJs: '', mouseSelection: false),
        isNot(contains('__hlMouseShim')));
  });

  test('addScripts and addCss are added after the engine and default styles',
      () {
    final doc = buildHighlightDocument(
      body: '',
      engineJs: '//E',
      addCss: '.menu { color: red; }',
      addScripts: const [
        '<script>window.one = 1;</script>',
        '  ',
        'window.two = 2;',
      ],
    );
    // Full blocks kept as is; plain JS wrapped; blank entries dropped.
    expect(doc, contains('<script>window.one = 1;</script>'));
    expect(doc, contains('<script>\nwindow.two = 2;\n</script>'));
    expect('<script>\n\n</script>'.allMatches(doc), isEmpty);
    // In order, after the engine and the mouse shim.
    expect(
        doc.indexOf('window.one'), greaterThan(doc.indexOf('__hlMouseShim')));
    expect(doc.indexOf('window.two'), greaterThan(doc.indexOf('window.one')));
    // CSS after the default styles, in its own <style>.
    expect(doc, contains('<style>.menu { color: red; }</style>'));
    expect(doc.indexOf('.menu'),
        greaterThan(doc.indexOf('.highlight-text-student')));
    expect(buildHighlightDocument(body: '', engineJs: ''),
        isNot(contains('<style></style>')));
  });

  test('mouse shim covers selection and long-press removal', () {
    const shim = HighlighterScripts.mouseSelectionShim;
    expect(shim, contains("new Event('touchend')"));
    expect(shim, contains("new MouseEvent('contextmenu'"));
    expect(shim, contains('[data-highlight-id]'));
    expect(shim, contains("e.pointerType !== 'mouse'"));
  });

  test('default styles colour article highlights and come before user css', () {
    expect(highlightDefaultCss, contains('.highlight-text-student'));
    expect(highlightDefaultCss, contains('.highlight-text-admin'));
    expect(highlightDefaultCss, contains('.noselect'));
    final doc =
        buildHighlightDocument(body: '', engineJs: '', addCss: '/*mine*/');
    expect(doc.indexOf('.highlight-text-student'),
        lessThan(doc.indexOf('/*mine*/')));
    expect(buildHighlightDocument(body: '', engineJs: '', defaultStyles: false),
        isNot(contains('.highlight-text-student')));
  });

  test('engine only colours highlights through CSS classes', () {
    // If this ever changes, highlightDefaultCss may no longer be needed.
    expect(_engineCore(),
        contains('span.className = "highlight-text-".concat(userType)'));
  });

  test('widget lets media play inline by default', () {
    // Without it, iOS WebKit only plays video fullscreen and an embedded
    // player can load forever.
    const view = HighlightableHtmlView(body: '');
    expect(view.allowsInlineMediaPlayback, isTrue);
    expect(view.highlightingEnabled, isTrue);
    expect(view.showAddToNote, isTrue);
    expect(File('pubspec.yaml').readAsStringSync(),
        contains('webview_flutter_wkwebview:'));
  });

  group('page controls', () {
    test('bridge toggles highlighting and the note popup', () async {
      final host = _FakeHost();
      final bridge = HtmlHighlightBridge.withHost(host);
      await bridge.setUserHighlightEnabled(false);
      await bridge.setAddToNoteVisible(false);
      expect(host.scripts[0], contains('__hlSetHighlightingEnabled(false)'));
      expect(host.scripts[1], contains('__hlSetAddNoteVisible(false)'));
    });

    test('selections across media never become highlights', () {
      final js = _engineJs();
      final controls = js.substring(js.indexOf('window.__hlControls = true'));
      for (final tag in ['iframe', 'video', 'img', 'svg', 'canvas']) {
        expect(controls, contains(tag), reason: tag);
      }
      expect(controls, contains('range.intersectsNode(media[i])'));
      // Runs in the capture phase on touchend, before the engine, and also
      // catches the mouse shim's synthetic touchend (no isTrusted check).
      final rule = controls.substring(
          controls.indexOf('// Never highlight across media'),
          controls.indexOf('// No right-click'));
      expect(rule, contains('"touchend"'));
      expect(rule, contains('},\n    true\n  );'));
      expect(rule, contains('removeAllRanges()'));
      expect(rule, contains('e.stopPropagation()'));
      expect(rule, isNot(contains('isTrusted')));
      // The selection itself is cleared as soon as it spans media.
      expect(rule, contains('"selectionchange"'));
    });

    test('engine defines the controls after the guard', () {
      final js = _engineJs();
      expect(
          js.indexOf(_controlsMarker), greaterThan(js.indexOf(_guardMarker)));
      final controls = js.substring(js.indexOf('window.__hlControls = true'));
      expect(
          controls, contains('window.__hlSetHighlightingEnabled = function'));
      expect(controls, contains('window.__hlSetAddNoteVisible = function'));
      // The engine's own toggle stays in sync.
      expect(controls, contains('window.toggleUserHighlight(enabled)'));
      // Blocks creation, long-press and right-click removal while off.
      for (final event in ['touchstart', 'touchend', 'contextmenu']) {
        expect(controls, contains('"$event",'), reason: event);
      }
      expect(controls, contains('hl-hide-add-note'));
      expect(_engineCore(), isNot(contains('__hlControls')));
    });

    test('an Android long-press (touchcancel) finishes with touchend', () {
      final js = _engineJs();
      final start = js.indexOf('window.__hlTouchCancel = true');
      // After the controls, so their touchend rules see the finished touch.
      expect(start, greaterThan(js.indexOf('window.__hlControls = true')));
      final rule = js.substring(start);
      expect(rule, contains('"touchcancel"'));
      expect(rule, contains('if (!e.isTrusted) return;'));
      // Only a selection that formed during this touch, inside the container.
      expect(rule, contains('same(now, before)'));
      expect(rule, contains('container.contains(now[0])'));
      expect(rule, contains('new Event("touchend", { bubbles: true'));
      expect(_engineCore(), isNot(contains('__hlTouchCancel')));
    });
  });

  test('bridge works over any HighlightHost', () async {
    final host = _FakeHost();
    final bridge = HtmlHighlightBridge.withHost(host);
    HighlightChange? got;
    await bridge.attach(onHighlightChanged: (c) => got = c);
    expect(host.channels.keys, [HighlightChannels.change]);

    host.channels[HighlightChannels.change]!(jsonEncode({
      'userType': 'student',
      'data': [
        {'commonId': 'z'}
      ]
    }));
    expect(got!.models.single['commonId'], 'z');

    await bridge.restore([
      {'commonId': 'z'}
    ], userType: 'admin');
    expect(host.scripts.single, contains('"userType":"admin"'));
    expect(host.scripts.single, contains('"highlights":['));

    await bridge.setUserHighlightEnabled(false);
    expect(host.scripts.last, contains('__hlSetHighlightingEnabled(false)'));
  });

  test('restore stamps an owner on models saved without one', () async {
    // Older saved data may have no `userType`.
    final host = _FakeHost();
    await HtmlHighlightBridge.withHost(host).restore([
      {
        'commonId': 'q',
        'id': 'highlight-container--question-1',
        'startOffset': 3,
        'endOffset': 9,
      }
    ]);
    final script = host.scripts.single;
    expect(script, contains('"userType":"student","highlights":[{'));
    expect(script, contains('"endOffset":9,"userType":"student"'));
    expect(script, contains('}, 150);'));
  });

  group('colours', () {
    test('css round trip', () {
      expect(highlightColorToCss(const Color(0xFF4ADE80)), '#4ADE80');
      expect(highlightColorToCss(const Color(0x804ADE80)), '#4ADE8080');
      expect(highlightColorFromCss('#4ADE80'), const Color(0xFF4ADE80));
      expect(highlightColorFromCss('#4ADE8080'), const Color(0x804ADE80));
      expect(highlightColorFromCss('#fff'), const Color(0xFFFFFFFF));
      expect(highlightColorFromCss('yellow'), isNull);
    });

    test(
        'new highlights get the pen, restored keep theirs, legacy stay default',
        () {
      final book = HighlightColorBook()
        ..seed([
          {'commonId': 'old-blue', 'color': '#60A5FA'},
          {'commonId': 'legacy'},
        ])
        ..pen = '#F472B6';
      final models = [
        {'commonId': 'old-blue'},
        {'commonId': 'legacy'},
        {'commonId': 'new1'},
      ];
      book.stamp(models);
      expect(models[0]['color'], '#60A5FA');
      expect(models[1].containsKey('color'), isFalse);
      expect(models[2]['color'], '#F472B6');

      // Changing the pen doesn't recolour existing highlights.
      book.pen = '#4ADE80';
      final again = [
        {'commonId': 'new1'},
        {'commonId': 'new2'},
      ];
      book.stamp(again);
      expect(again[0]['color'], '#F472B6');
      expect(again[1]['color'], '#4ADE80');
    });

    test('stampColors fills colours, keeping saved ones', () {
      final book = HighlightColorBook()..pen = '#60A5FA';
      final change = HtmlHighlightBridge.stampColors(
          HighlightChange.fromJson({
            'userType': 'student',
            'data': [
              {'commonId': 'a'},
              {'commonId': 'b', 'color': '#4ADE80'}
            ],
          }),
          book);
      expect(change.models.map((m) => m['color']), ['#60A5FA', '#4ADE80']);
      expect(change.userType, 'student');
      expect(book.colorOf('b'), '#4ADE80');
    });

    test('bridge stamps colours on changes and seeds them on restore',
        () async {
      final host = _FakeHost();
      final bridge = HtmlHighlightBridge.withHost(host);
      HighlightChange? got;
      await bridge.attach(onHighlightChanged: (c) => got = c);

      await bridge.restore([
        {'commonId': 'r1', 'color': '#60A5FA'}
      ]);
      expect(host.scripts.last, contains('__hlColorLayer.seed('));
      expect(host.scripts.last, contains('"color":"#60A5FA"'));

      await bridge.setHighlightColor(const Color(0xFFF472B6));
      expect(host.scripts.last, contains('setPen("#F472B6")'));

      host.channels[HighlightChannels.change]!(jsonEncode({
        'userType': 'student',
        'data': [
          {'commonId': 'r1'},
          {'commonId': 'n1'}
        ],
      }));
      expect(got!.models.map((m) => m['color']), ['#60A5FA', '#F472B6']);

      await bridge.setHighlightColor(null);
      expect(host.scripts.last, contains('setPen(null)'));
    });

    test('page includes the colour layer after the engine', () {
      final doc = buildHighlightDocument(body: '', engineJs: '//E');
      expect(doc.indexOf('//E'), lessThan(doc.indexOf('__hlColorLayer')));
    });

    test('cleanHtml strips per-highlight colours only on highlight spans', () {
      const note = HighlightNoteRequest(
          html:
              '<span data-highlight-id="x" style="background-color: #60A5FA; cursor: pointer;">a</span>'
              '<td style="background-color: red;">b</td>');
      expect(note.cleanHtml, contains('style="cursor: pointer;"'));
      expect(note.cleanHtml, contains('background-color: red;'));
    });
  });
}
