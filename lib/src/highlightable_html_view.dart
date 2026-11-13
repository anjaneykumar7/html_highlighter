import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'highlight_colors.dart';
import 'highlight_engine.dart';
import 'highlight_events.dart';
import 'highlight_styles.dart';
import 'html_highlight_bridge.dart';

/// Builds a complete HTML document around [body] with the highlight engine
/// appended after the content.
///
/// [addCss] goes in a `<style>` after the default styles. Each entry of
/// [addScripts] is appended after the engine, in order: either a full
/// `<script>…</script>` block or plain JavaScript (wrapped for you).
String buildHighlightDocument({
  required String body,
  required String engineJs,
  String head = '',
  String addCss = '',
  List<String> addScripts = const [],
  bool mouseSelection = true,
  bool defaultStyles = true,
}) =>
    '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  $head
  ${defaultStyles ? '<style>$highlightDefaultCss</style>' : ''}
  ${addCss.trim().isEmpty ? '' : '<style>$addCss</style>'}
</head>
<body>
$body
<script>
$engineJs
</script>
<script>
$highlightColorLayerScript
</script>
${mouseSelection ? '<script>${HighlighterScripts.mouseSelectionShim}</script>' : ''}
${addScripts.map(_scriptBlock).join('\n')}
</body>
</html>''';

/// [script] as a `<script>` block: kept as is when it already is one,
/// wrapped otherwise. Empty entries are dropped.
String _scriptBlock(String script) {
  final s = script.trim();
  if (s.isEmpty) return '';
  return s.toLowerCase().startsWith('<script') ? s : '<script>\n$s\n</script>';
}

/// Gestures a highlightable WebView needs to own:
/// long-press for native text selection, drags for selection handles and
/// scrolling, tap for popups. Inside a Flutter scroll view, pass your own set
/// without the drag recognizers so the outer view can scroll.
final Set<Factory<OneSequenceGestureRecognizer>>
    defaultHighlightGestureRecognizers = {
  Factory<TapGestureRecognizer>(() => TapGestureRecognizer()),
  Factory<LongPressGestureRecognizer>(() => LongPressGestureRecognizer()),
  Factory<VerticalDragGestureRecognizer>(() => VerticalDragGestureRecognizer()),
  Factory<HorizontalDragGestureRecognizer>(
      () => HorizontalDragGestureRecognizer()),
  Factory<ScaleGestureRecognizer>(() => ScaleGestureRecognizer()),
};

/// A WebView that renders [body] with selectable, persistent highlights.
///
/// [body] must contain one or more `highlightContainer(...)` blocks; text
/// outside them can be selected but never highlighted.
class HighlightableHtmlView extends StatefulWidget {
  const HighlightableHtmlView({
    super.key,
    required this.body,
    this.initialHighlights = const [],
    this.userType = 'student',
    this.onHighlightChanged,
    this.onAddToNote,
    this.onCreated,
    this.head = '',
    this.addCss = '',
    this.addScripts = const [],
    this.restoreDelay = const Duration(milliseconds: 800),
    this.backgroundColor,
    this.loadingBuilder,
    this.gestureRecognizers,
    this.mouseSelection = true,
    this.onLoaded,
    this.onLoadError,
    this.defaultStyles = true,
    this.highlightColor,
    this.highlightingEnabled = true,
    this.showAddToNote = true,
    this.allowsInlineMediaPlayback = true,
  });

  /// HTML placed inside `<body>`.
  final String body;

  /// Models previously received from [onHighlightChanged].
  final List<Map<String, dynamic>> initialHighlights;

  /// Owner stamped on restored highlights.
  final String userType;

  final ValueChanged<HighlightChange>? onHighlightChanged;
  final ValueChanged<HighlightNoteRequest>? onAddToNote;

  /// Called once the controller and bridge exist, before the page loads.
  /// Register extra channels or settings here.
  final void Function(WebViewController controller, HtmlHighlightBridge bridge)?
      onCreated;

  /// Extra markup for `<head>` (fonts, CDN scripts…).
  final String head;

  /// Your CSS, added after the default styles (e.g. `'.menu { … }'`).
  final String addCss;

  /// Your scripts, appended after the engine in order. Each entry is a full
  /// `<script>…</script>` block or plain JavaScript (wrapped for you).
  final List<String> addScripts;

  /// Wait after page load before restoring highlights (lets fonts/images lay out).
  final Duration restoreDelay;
  final Color? backgroundColor;
  final WidgetBuilder? loadingBuilder;

  /// Gestures the WebView claims from Flutter. Defaults to
  /// [defaultHighlightGestureRecognizers]. On iOS the WebView must win
  /// long-press, or native text selection (and so highlighting) never starts.
  final Set<Factory<OneSequenceGestureRecognizer>>? gestureRecognizers;

  /// Allow creating highlights by selecting with a mouse / trackpad.
  final bool mouseSelection;

  /// Called after the page finished loading and [initialHighlights] were
  /// restored.
  final VoidCallback? onLoaded;

  /// Called when the WebView reports a resource error.
  final ValueChanged<String>? onLoadError;

  /// Include [highlightDefaultCss] (highlight colours, `.noselect`) before
  /// [css]. Turn off only if you supply those rules yourself.
  final bool defaultStyles;

  /// Colour for new highlights, saved in each model as `"color"` and
  /// re-applied on restore. Null = engine default yellow, no `color` saved.
  /// Change it any time; existing highlights keep their colour.
  final Color? highlightColor;

  /// Whether users can create and remove highlights. When false, existing
  /// highlights stay visible and still open their popup. Change it any time.
  final bool highlightingEnabled;

  /// Whether tapping a highlight opens the "Add to notes" popup. Change it
  /// any time.
  final bool showAddToNote;

  /// iOS / macOS: let video (including video in iframes) play inside the
  /// page. When false, WebKit only plays it fullscreen, and an embedded player
  /// can sit there loading forever. Other platforms ignore it. Read once,
  /// when the WebView is created.
  final bool allowsInlineMediaPlayback;

  @override
  State<HighlightableHtmlView> createState() => _HighlightableHtmlViewState();
}

class _HighlightableHtmlViewState extends State<HighlightableHtmlView> {
  late final WebViewController _controller = _createController();

  WebViewController _createController() {
    final platform = WebViewPlatform.instance;
    final params = platform is WebKitWebViewPlatform
        ? WebKitWebViewControllerCreationParams(
            allowsInlineMediaPlayback: widget.allowsInlineMediaPlayback,
          )
        : const PlatformWebViewControllerCreationParams();
    return WebViewController.fromPlatformCreationParams(params);
  }
  late final HtmlHighlightBridge _bridge = HtmlHighlightBridge(_controller);
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    if (widget.backgroundColor != null) {
      try {
        await _controller.setBackgroundColor(widget.backgroundColor!);
      } on UnimplementedError {
        // macOS WKWebView has no background-colour support; the page's own
        // CSS background is used instead.
      }
    }
    await _bridge.attach(
      onHighlightChanged: (c) => widget.onHighlightChanged?.call(c),
      onAddToNote: (n) => widget.onAddToNote?.call(n),
    );
    await _controller.setNavigationDelegate(NavigationDelegate(
      onPageStarted: (_) {
        if (mounted) setState(() => _loading = true);
      },
      onPageFinished: (_) async {
        await _bridge.setHighlightColor(widget.highlightColor);
        if (!widget.highlightingEnabled) {
          await _bridge.setUserHighlightEnabled(false);
        }
        if (!widget.showAddToNote) await _bridge.setAddToNoteVisible(false);
        if (widget.initialHighlights.isNotEmpty) {
          await Future<void>.delayed(widget.restoreDelay);
          if (!mounted) return;
          await _bridge.restore(
            widget.initialHighlights,
            userType: widget.userType,
          );
        }
        if (mounted) setState(() => _loading = false);
        widget.onLoaded?.call();
      },
      onWebResourceError: (error) {
        if (mounted) setState(() => _loading = false);
        widget.onLoadError?.call(error.description);
      },
    ));
    widget.onCreated?.call(_controller, _bridge);
    await _load();
  }

  Future<void> _load() async {
    final js = await HighlighterScripts.load();
    if (!mounted) return;
    await _controller.loadHtmlString(buildHighlightDocument(
      body: widget.body,
      engineJs: js,
      head: widget.head,
      addCss: widget.addCss,
      addScripts: widget.addScripts,
      mouseSelection: widget.mouseSelection,
      defaultStyles: widget.defaultStyles,
    ));
  }

  @override
  void didUpdateWidget(covariant HighlightableHtmlView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.highlightColor != widget.highlightColor) {
      _bridge.setHighlightColor(widget.highlightColor);
    }
    if (oldWidget.highlightingEnabled != widget.highlightingEnabled) {
      _bridge.setUserHighlightEnabled(widget.highlightingEnabled);
    }
    if (oldWidget.showAddToNote != widget.showAddToNote) {
      _bridge.setAddToNoteVisible(widget.showAddToNote);
    }
    if (oldWidget.body != widget.body ||
        oldWidget.addCss != widget.addCss ||
        oldWidget.head != widget.head ||
        !listEquals(oldWidget.addScripts, widget.addScripts)) {
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(
          controller: _controller,
          gestureRecognizers:
              widget.gestureRecognizers ?? defaultHighlightGestureRecognizers,
        ),
        if (_loading)
          Positioned.fill(
            child: widget.loadingBuilder?.call(context) ??
                const Center(child: CircularProgressIndicator()),
          ),
      ],
    );
  }
}
