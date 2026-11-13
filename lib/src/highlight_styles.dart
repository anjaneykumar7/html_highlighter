/// CSS the engine relies on but doesn't inject itself.
///
/// * The engine only adds a class to highlight spans
///   (`highlight-text-student` / `highlight-text-admin`), so without these
///   rules highlights are invisible (unless they have a per-highlight colour).
/// * `.noselect` is what the engine adds when highlighting is turned off.
///
/// Put your own CSS after it to override the colours.
const String highlightDefaultCss = '''
.highlight-text-student,
.highlight-text-student:active {
  background-color: yellow;
  -webkit-tap-highlight-color: transparent;
}
.highlight-text-admin {
  background-color: #e8e239;
  -webkit-tap-highlight-color: transparent;
}
.noselect {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -khtml-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
''';
