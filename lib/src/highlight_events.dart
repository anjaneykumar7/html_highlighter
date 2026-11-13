import 'dart:convert';

Map<String, dynamic>? _decodeObject(String message) {
  try {
    final decoded = jsonDecode(message);
    return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
  } catch (_) {
    return null;
  }
}

/// A highlight was added or removed (`HighlightChangeChannel`).
class HighlightChange {
  const HighlightChange({
    required this.raw,
    this.status,
    this.userType,
    this.highlightCount,
    this.data,
  });

  factory HighlightChange.fromJson(Map<String, dynamic> json) =>
      HighlightChange(
        raw: json,
        status: json['status'] as String?,
        userType: json['userType'] as String?,
        highlightCount: json['highlightCount'] is num
            ? (json['highlightCount'] as num).toInt()
            : null,
        data: json['data'],
      );

  /// Parses a channel message, or returns null if it is not a JSON object.
  static HighlightChange? tryParse(String message) {
    final json = _decodeObject(message);
    return json == null ? null : HighlightChange.fromJson(json);
  }

  /// The decoded message, untouched.
  final Map<String, dynamic> raw;
  final String? status;

  /// Highlight owner (e.g. `student`).
  final String? userType;
  final int? highlightCount;

  /// Payload as sent by the engine: the list of models.
  final dynamic data;

  /// The highlight models (all of them, not a diff). Persist these and pass
  /// them back to [HtmlHighlightBridge.restore]. Each model's `id` is its
  /// container's DOM id, e.g. `highlight-container--question-<id>`.
  List<Map<String, dynamic>> get models {
    final list = data;
    if (list is! List) return const [];
    return list
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  @override
  String toString() =>
      'HighlightChange(userType: $userType, models: ${models.length})';
}

/// The user asked to add a highlight to their notes (`AddToNoteChannel`).
class HighlightNoteRequest {
  const HighlightNoteRequest({required this.html, this.identifier});

  factory HighlightNoteRequest.fromJson(Map<String, dynamic> json) =>
      HighlightNoteRequest(
        html: json['data']?.toString() ?? '',
        identifier: json['identifier']?.toString(),
      );

  static HighlightNoteRequest? tryParse(String message) {
    final json = _decodeObject(message);
    return json == null ? null : HighlightNoteRequest.fromJson(json);
  }

  /// Selected HTML, including the engine's inline highlight styling.
  final String html;

  /// DOM id of the container the highlight lives in, when the engine sends it.
  final String? identifier;

  /// [html] without highlight backgrounds (the engine's yellow and any
  /// per-highlight colour on `data-highlight-id` spans).
  String get cleanHtml => html
      .replaceAll('background-color: yellow;', '')
      .replaceAllMapped(
        RegExp(r'<[^>]*data-highlight-id[^>]*>'),
        (m) => m[0]!.replaceAll(RegExp(r'background-color:\s*[^;"]*;?\s*'), ''),
      );
}

/// Result of a restore call (`HighlightChannel`).
class HighlightRestoreStatus {
  const HighlightRestoreStatus({required this.raw, this.status, this.message});

  static HighlightRestoreStatus? tryParse(String message) {
    final json = _decodeObject(message);
    if (json == null) return null;
    return HighlightRestoreStatus(
      raw: json,
      status: json['status']?.toString(),
      message: json['message']?.toString(),
    );
  }

  final Map<String, dynamic> raw;
  final String? status;
  final String? message;

  bool get isSuccess => status == 'success';
}
