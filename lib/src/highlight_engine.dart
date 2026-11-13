import 'package:flutter/services.dart';

/// Loads (and caches) the highlight engine, `assets/highlighter.js`.
abstract final class HighlighterScripts {
  /// Key to load the engine from the root [AssetBundle].
  static const String assetKey =
      'packages/html_highlighter/assets/highlighter.js';

  static Future<String>? _cache;

  /// Returns the engine's JavaScript source.
  ///
  /// Pass [bundle] to load from somewhere other than [rootBundle] (tests).
  static Future<String> load({AssetBundle? bundle}) {
    if (bundle != null) return bundle.loadString(assetKey);
    return _cache ??= rootBundle.loadString(assetKey).catchError((Object e) {
      _cache = null;
      throw e;
    });
  }

  /// Returns the engine wrapped in a `<script>` tag, ready to append to a
  /// page body (after the highlight containers).
  static Future<String> scriptTag({AssetBundle? bundle}) async =>
      '<script>\n${await load(bundle: bundle)}\n</script>';

  /// Makes the touch-only engine usable with a mouse or trackpad (macOS,
  /// desktop, simulators). Touch input is untouched. Append it after the
  /// engine script.
  ///
  /// * Finishing a left-button text selection inside a container fires the
  ///   container's `touchend`, which is what creates a highlight.
  /// * Pressing and holding the left button on a highlight for 350 ms removes
  ///   it, mirroring touch long-press. It goes through the engine's own
  ///   `contextmenu` handler, so engine rules (e.g. admin highlights can't be
  ///   removed) still apply. Right-click keeps working where the host
  ///   delivers it.
  static const String mouseSelectionShim = r'''
(function () {
  if (window.__hlMouseShim) return;
  window.__hlMouseShim = true;
  var SELECTOR = '[data-highlight-type="highlight-range"]';
  var LONG_PRESS_MS = 350;
  var MOVE_TOLERANCE = 6;
  var press = null;
  var swallowClick = false;

  function cancelPress() {
    if (press) { clearTimeout(press.timer); press = null; }
  }

  document.addEventListener('pointerdown', function (e) {
    cancelPress();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    var span = e.target && e.target.closest ? e.target.closest('[data-highlight-id]') : null;
    if (!span) return;
    var x = e.clientX, y = e.clientY;
    press = {
      x: x,
      y: y,
      timer: setTimeout(function () {
        press = null;
        swallowClick = true;
        span.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y
        }));
      }, LONG_PRESS_MS)
    };
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (press && (Math.abs(e.clientX - press.x) > MOVE_TOLERANCE ||
                  Math.abs(e.clientY - press.y) > MOVE_TOLERANCE)) {
      cancelPress();
    }
  }, true);
  document.addEventListener('pointercancel', cancelPress, true);

  // The click that ends a long-press must not open the highlight popup.
  document.addEventListener('click', function (e) {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('pointerup', function (e) {
    cancelPress();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('[class*="highlight-popup-"]')) return;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    var node = sel.anchorNode;
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    var container = el && el.closest ? el.closest(SELECTOR) : null;
    if (!container) return;
    container.dispatchEvent(new Event('touchend'));
  }, true);
})();
''';

  /// Drops cached sources.
  static void clearCache() => _cache = null;
}
