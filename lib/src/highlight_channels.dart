/// Names of the JavaScript channels the highlight engines post to.
///
/// These are fixed by the bundled JS, so a page that uses the engine must not
/// register its own channels under the same names when it also uses
/// [HtmlHighlightBridge.attach] (iOS rejects duplicate channel names).
abstract final class HighlightChannels {
  /// Posted whenever a highlight is added or removed.
  static const String change = 'HighlightChangeChannel';

  /// Posted when the user taps "Add to notes" in the highlight popup.
  static const String addToNote = 'AddToNoteChannel';

  /// Status of `setHighlightFromFlutter` (restore) calls.
  static const String restoreStatus = 'HighlightChannel';
}
