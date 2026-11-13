import 'dart:ui' show Color;

import 'package:flutter/foundation.dart';

/// Key under which a highlight model stores its colour, e.g.
/// `{"commonId": "ab12", ..., "color": "#4ADE80"}`.
const String highlightColorKey = 'color';

/// `#RRGGBB` for opaque colours, `#RRGGBBAA` otherwise (valid CSS).
String highlightColorToCss(Color color) {
  final argb = color.toARGB32();
  String hex(int v) => v.toRadixString(16).padLeft(2, '0').toUpperCase();
  final a = (argb >> 24) & 0xFF;
  final rgb = '#${hex((argb >> 16) & 0xFF)}${hex((argb >> 8) & 0xFF)}'
      '${hex(argb & 0xFF)}';
  return a == 0xFF ? rgb : '$rgb${hex(a)}';
}

/// Parses `#RGB`, `#RRGGBB` or `#RRGGBBAA`. Returns null for anything else.
Color? highlightColorFromCss(String? css) {
  if (css == null) return null;
  var h = css.trim();
  if (!h.startsWith('#')) return null;
  h = h.substring(1);
  if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
  if (h.length == 6) h = '${h}FF';
  if (h.length != 8) return null;
  final v = int.tryParse(h, radix: 16);
  if (v == null) return null;
  // RRGGBBAA -> AARRGGBB
  return Color(((v & 0xFF) << 24) | (v >> 8));
}

/// Remembers which colour each highlight (by `commonId`) has, and stamps it
/// onto models coming from the engine, so saved JSON carries the colour.
///
/// * New highlights get the current [pen] colour.
/// * Restored highlights keep their saved colour; restored highlights saved
///   *without* a colour stay on the engine default and are never re-coloured.
class HighlightColorBook {
  /// CSS colour for new highlights; null = engine default (yellow), and no
  /// colour is written into the model.
  String? pen;

  final Map<String, String?> _colors = {};

  /// Colour recorded for [commonId] (null = engine default / unknown).
  String? colorOf(String commonId) => _colors[commonId];

  /// Records the colours of models that are being restored.
  void seed(Iterable<Map<String, dynamic>> models) {
    for (final m in models) {
      final id = m['commonId']?.toString();
      if (id == null) continue;
      final c = m[highlightColorKey];
      _colors[id] = c is String && c.isNotEmpty ? c : null;
    }
  }

  /// Adds the `color` field to every model in [models] (in place).
  void stamp(List<Map<String, dynamic>> models) {
    for (final m in models) {
      final id = m['commonId']?.toString();
      if (id == null) continue;
      final existing = m[highlightColorKey];
      if (existing is String && existing.isNotEmpty) {
        _colors[id] = existing;
        continue;
      }
      final color = _colors.containsKey(id) ? _colors[id] : (_colors[id] = pen);
      if (color != null) m[highlightColorKey] = color;
    }
  }

  @visibleForTesting
  Map<String, String?> get debugColors => Map.unmodifiable(_colors);
}

/// Page-side colour layer. Append after the engine script.
///
/// Paints every highlight span (`[data-highlight-id]`) with the colour known
/// for its `commonId`. Unknown (new) highlights get the current pen colour.
/// API: `__hlColorLayer.setPen(css|null)`, `__hlColorLayer.seed(models)`.
const String highlightColorLayerScript = r'''
(function () {
  if (window.__hlColorLayer) return;
  var colors = {};
  var pen = null;
  function paint(span) {
    var id = span.getAttribute('data-highlight-id');
    if (!id) return;
    if (!Object.prototype.hasOwnProperty.call(colors, id)) colors[id] = pen;
    var c = colors[id];
    if (c) span.style.backgroundColor = c;
  }
  function paintTree(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.hasAttribute('data-highlight-id')) paint(node);
    var spans = node.querySelectorAll('[data-highlight-id]');
    for (var i = 0; i < spans.length; i++) paint(spans[i]);
  }
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      for (var i = 0; i < r.addedNodes.length; i++) paintTree(r.addedNodes[i]);
    });
  }).observe(document.body, { childList: true, subtree: true });
  window.__hlColorLayer = {
    setPen: function (c) { pen = c || null; },
    seed: function (models) {
      (models || []).forEach(function (m) {
        if (m && m.commonId) colors[m.commonId] = m.color || null;
      });
      paintTree(document.body);
    },
    colorOf: function (id) { return colors[id]; }
  };
})();
''';
