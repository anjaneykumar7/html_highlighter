/// The DOM id the engine expects for a container of [type] and [id]:
/// `highlight-container--<type>-<id>`.
String highlightContainerId(String type, String id) =>
    'highlight-container--$type-$id';

/// Wraps [html] in a container the highlight engine can select inside.
///
/// [type] becomes `data-container-type` and is part of the DOM id, e.g.
/// `question`, `explanation` or `article`; each model's `id` carries it, so
/// you can tell where a highlight lives.
///
/// [enabled] sets `data-highlighton` (`false` makes the container
/// unselectable); leave null to omit it.
String highlightContainer({
  required String type,
  required String id,
  required String html,
  bool? enabled,
  String style = 'width: 100%; height: fit-content;',
  String attributes = '',
}) {
  final highlightOn = enabled == null ? '' : ' data-highlighton="$enabled"';
  final extra = attributes.isEmpty ? '' : ' $attributes';
  return '<div data-highlight-type="highlight-range" '
      'data-container-type="$type" '
      'id="${highlightContainerId(type, id)}"$highlightOn '
      'style="$style"$extra>$html</div>';
}
