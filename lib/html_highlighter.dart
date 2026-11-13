/// Persistent text highlighting for HTML rendered inside a `WebView`.
///
/// * [HighlighterScripts] – the bundled JS engine and the mouse shim.
/// * [highlightContainer] – wraps HTML so the engine can highlight inside it.
/// * [HtmlHighlightBridge] – wires the engine to a `WebViewController`
///   (or any [HighlightHost]).
/// * [HighlightableHtmlView] – a ready-made widget for the simple case.
library;

export 'src/highlight_channels.dart';
export 'src/highlight_colors.dart';
export 'src/highlight_container.dart';
export 'src/highlight_engine.dart';
export 'src/highlight_events.dart';
export 'src/highlight_host.dart';
export 'src/highlight_styles.dart';
export 'src/highlightable_html_view.dart';
export 'src/html_highlight_bridge.dart';
