import 'package:webview_flutter/webview_flutter.dart';

/// Whatever renders the page: a mobile WebView, or an iframe on Flutter web.
///
/// [HtmlHighlightBridge] only needs these two operations, which keeps it
/// independent of the rendering technology.
abstract class HighlightHost {
  /// Executes [script] in the page.
  Future<void> runJavaScript(String script);

  /// Exposes `window.<name>.postMessage(string)` to the page and delivers
  /// each message to [onMessage]. Must be called before the page loads.
  Future<void> addChannel(String name, void Function(String message) onMessage);
}

/// [HighlightHost] backed by a `webview_flutter` [WebViewController]
/// (Android, iOS, macOS).
class WebViewHighlightHost implements HighlightHost {
  WebViewHighlightHost(this.controller);

  final WebViewController controller;

  @override
  Future<void> runJavaScript(String script) => controller.runJavaScript(script);

  @override
  Future<void> addChannel(
    String name,
    void Function(String message) onMessage,
  ) =>
      controller.addJavaScriptChannel(
        name,
        onMessageReceived: (m) => onMessage(m.message),
      );
}
