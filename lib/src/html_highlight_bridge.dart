import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'dart:ui' show Color;

import 'highlight_channels.dart';
import 'highlight_colors.dart';
import 'highlight_events.dart';
import 'highlight_host.dart';

/// Connects a page running the highlight engine to Dart.
///
/// ```dart
/// final bridge = HtmlHighlightBridge(webViewController);
/// // or, for any other renderer: HtmlHighlightBridge.withHost(myHost)
/// await bridge.attach(onHighlightChanged: (c) => save(c.models));
/// // after onPageFinished:
/// await bridge.restore(savedModels);
/// ```
class HtmlHighlightBridge {
  /// Bridge for a `webview_flutter` page (Android / iOS / macOS).
  HtmlHighlightBridge(
    WebViewController controller, {
    void Function(String message)? onError,
  }) : this.withHost(WebViewHighlightHost(controller), onError: onError);

  /// Bridge for any [HighlightHost] (e.g. the iframe used on Flutter web).
  HtmlHighlightBridge.withHost(this.host, {this.onError});

  final HighlightHost host;

  /// Receives JS execution / parsing errors. Defaults to [debugPrint].
  final void Function(String message)? onError;

  final Set<String> _attached = {};

  /// Per-highlight colours (see [setHighlightColor]).
  final HighlightColorBook colors = HighlightColorBook();

  void _report(String message) =>
      (onError ?? (m) => debugPrint('[html_highlighter] $m'))(message);

  /// Registers the engine's channels on [host]. Only channels with a
  /// callback are registered, so the host page may still own any channel it
  /// leaves null. Call once, before loading the page.
  Future<void> attach({
    ValueChanged<HighlightChange>? onHighlightChanged,
    ValueChanged<HighlightNoteRequest>? onAddToNote,
    ValueChanged<HighlightRestoreStatus>? onRestoreStatus,
  }) async {
    final channels = <String, void Function(String)>{
      if (onHighlightChanged != null)
        HighlightChannels.change: (m) {
          final change = HighlightChange.tryParse(m);
          if (change == null) {
            _report('Unparseable highlight change: $m');
            return;
          }
          onHighlightChanged(stampColors(change, colors));
        },
      if (onAddToNote != null)
        HighlightChannels.addToNote: (m) {
          final note = HighlightNoteRequest.tryParse(m);
          if (note == null) {
            _report('Unparseable add-to-note message: $m');
            return;
          }
          onAddToNote(note);
        },
      if (onRestoreStatus != null)
        HighlightChannels.restoreStatus: (m) {
          final status = HighlightRestoreStatus.tryParse(m);
          if (status != null) onRestoreStatus(status);
        },
    };

    for (final entry in channels.entries) {
      if (!_attached.add(entry.key)) continue;
      try {
        await host.addChannel(entry.key, entry.value);
      } catch (e) {
        _attached.remove(entry.key);
        _report('Could not register ${entry.key}: $e');
      }
    }
  }

  /// Re-applies saved highlight [highlights] (models from
  /// [HighlightChange.models]). Call after the page has finished loading.
  ///
  /// [userType] is stamped on every model (models saved without one restore
  /// as this owner). If the engine has not loaded yet the call is retried
  /// once after [retryDelay]. [reapplyAfter] applies the highlights a second
  /// time, which helps when content is still laying out.
  Future<void> restore(
    List<dynamic> highlights, {
    String userType = 'student',
    Duration? retryDelay,
    Duration? reapplyAfter,
  }) async {
    if (highlights.isEmpty) return;

    final models = highlights
        .map((item) => item is Map
            ? <String, dynamic>{
                ...Map<String, dynamic>.from(item),
                'userType': userType,
              }
            : <String, dynamic>{})
        .toList();

    colors.seed(models);

    final payload = {'userType': userType, 'highlights': models};
    final retry = retryDelay ?? const Duration(milliseconds: 150);
    final reapply = reapplyAfter ?? const Duration(milliseconds: 150);

    await runScript(buildRestoreScript(
      jsonEncode(payload),
      retryMs: retry.inMilliseconds,
      reapplyMs: reapply.inMilliseconds,
      seedJson: jsonEncode(models),
    ));
  }

  /// Colour for highlights the user creates from now on. It is written into
  /// each new model as `"color": "#RRGGBB[AA]"` and re-applied on [restore].
  /// Existing highlights keep their colour. Null = engine default (yellow),
  /// without a `color` field. Needs [highlightColorLayerScript] on the page.
  Future<void> setHighlightColor(Color? color) {
    final css = color == null ? null : highlightColorToCss(color);
    colors.pen = css;
    return runScript('if (window.__hlColorLayer) '
        '{ window.__hlColorLayer.setPen(${jsonEncode(css)}); }');
  }

  /// Returns [change] with each model's `color` filled in from [book].
  @visibleForTesting
  static HighlightChange stampColors(
      HighlightChange change, HighlightColorBook book) {
    if (change.data is! List) return change;
    final models = change.models;
    book.stamp(models);
    return HighlightChange.fromJson({...change.raw, 'data': models});
  }

  /// Removes every highlight from the page (the saved list is yours to keep).
  Future<void> clear() => _callIfDefined('clearModels');

  /// Turns user highlighting on or off. While off, users can't create or
  /// remove highlights; existing ones stay visible and still open their popup
  /// when tapped.
  Future<void> setUserHighlightEnabled(bool enabled) =>
      _callIfDefined('__hlSetHighlightingEnabled', '$enabled');

  /// Shows or hides the "Add to notes" popup that opens when a highlight is
  /// tapped. Hidden means the popup never appears.
  Future<void> setAddToNoteVisible(bool visible) =>
      _callIfDefined('__hlSetAddNoteVisible', '$visible');

  /// Flips study-assist mode.
  Future<void> toggleStudyAssist() => _callIfDefined('toggleStudyAssist');

  Future<void> _callIfDefined(String fn, [String args = '']) =>
      runScript("if (typeof $fn === 'function') { $fn($args); } "
          "else { console.log('html_highlighter: $fn is not defined'); }");

  /// Runs [script], reporting instead of throwing on failure.
  Future<void> runScript(String script) async {
    try {
      await host.runJavaScript(script);
    } catch (e) {
      _report('JavaScript error: $e');
    }
  }

  /// The JS that hands [payloadJson] to `setHighlightFromFlutter`.
  @visibleForTesting
  static String buildRestoreScript(
    String payloadJson, {
    required int retryMs,
    int? reapplyMs,
    String? seedJson,
  }) {
    final seed = seedJson == null
        ? ''
        : '\n  if (window.__hlColorLayer) { window.__hlColorLayer.seed($seedJson); }';
    final reapply = reapplyMs == null
        ? ''
        : '\n    setTimeout(function () { setHighlightFromFlutter(__hlPayload); }, $reapplyMs);';
    return '''
(function () {
  var __hlPayload = $payloadJson;$seed
  try {
    if (typeof setHighlightFromFlutter === 'function') {
      setHighlightFromFlutter(__hlPayload);$reapply
    } else {
      console.log("setHighlightFromFlutter function not found");
      setTimeout(function () {
        if (typeof setHighlightFromFlutter === 'function') {
          setHighlightFromFlutter(__hlPayload);
        }
      }, $retryMs);
    }
  } catch (e) {
    console.log("Highlight error: " + e.toString());
  }
})();
''';
  }
}
