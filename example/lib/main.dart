import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:html_highlighter/html_highlighter.dart';

import 'debug_tools.dart';
import 'sample_content.dart';

/// `flutter run -d macos --dart-define=SELF_TEST=true` drives the engine
/// inside the real WebView and prints `[js] SELFTEST …` results.
const bool _selfTest = bool.fromEnvironment('SELF_TEST');

void main() {
  // debugPrint is rate-limited; under heavy console output the newest
  // [event]/[js] lines would reach the run log late and look like lost taps.
  debugPrint = debugPrintSynchronously;
  runApp(const PlaygroundApp());
}

class PlaygroundApp extends StatelessWidget {
  const PlaygroundApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'html_highlighter playground',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF368B9D)),
      home: const PlaygroundPage(),
    );
  }
}

class PlaygroundPage extends StatefulWidget {
  const PlaygroundPage({super.key});

  @override
  State<PlaygroundPage> createState() => _PlaygroundPageState();
}

class _PlaygroundPageState extends State<PlaygroundPage> {
  /// What a real app would persist: the latest models.
  List<Map<String, dynamic>> _saved = [];
  final List<String> _notes = [];
  final List<String> _log = [];
  final List<String> _jsLog = [];
  bool _selfTested = false;

  HtmlHighlightBridge? _bridge;

  static const List<Color?> _palette = [
    Color(0xFFFDE047), // yellow
    Color(0xFF86EFAC), // green
    Color(0xFF93C5FD), // blue
    Color(0xFFF9A8D4), // pink
    Color(0xFFFDBA74), // orange
    null, // engine default, no colour saved
  ];
  Color? _pen = _palette.first;
  int _reloads = 0;
  bool _highlightingOn = true;
  bool _showAddNote = true;

  void _logEvent(String message) {
    final t = TimeOfDay.now().format(context);
    debugPrint('[event] $message');
    setState(() => _log.insert(0, '$t  $message'));
  }

  void _onChanged(HighlightChange change) {
    setState(() => _saved = change.models);
    final where = change.models
        .map((m) => '${m['id']}'.split('--').last.split('-').first)
        .toSet()
        .join(',');
    _logEvent(
      'change  models=${change.models.length}'
      '${where.isEmpty ? '' : '  in $where'}',
    );
  }

  void _onNote(HighlightNoteRequest note) {
    final text = note.cleanHtml.replaceAll(RegExp(r'<[^>]*>'), '').trim();
    setState(() => _notes.insert(0, text));
    _logEvent('add to notes  "${_short(text)}"');
  }

  void _reload() {
    setState(() => _reloads++);
    _logEvent('reload  restoring ${_saved.length} saved');
  }

  void _onJs(String message) {
    final line = message.length > 300
        ? '${message.substring(0, 300)}…'
        : message;
    debugPrint('[js] $line');
    if (!mounted) return;
    setState(() {
      _jsLog.insert(0, line);
      if (_jsLog.length > 200) _jsLog.removeLast();
    });
  }

  Future<void> _onLoaded() async {
    _logEvent('page loaded  restored ${_saved.length}');
    if (!_selfTest || _selfTested) return;
    _selfTested = true;
    await Future<void>.delayed(const Duration(milliseconds: 600));
    debugPrint('[selftest] running');
    await _bridge?.runScript(selfTestScript);
    await Future<void>.delayed(const Duration(seconds: 3));
    debugPrint('[selftest] done');
  }

  Future<void> _runSelfTest() async {
    _logEvent('self-test');
    await _bridge?.runScript(selfTestScript);
  }

  static String _short(String s) =>
      s.length > 40 ? '${s.substring(0, 40)}…' : s;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final page = Padding(
      padding: const EdgeInsets.all(12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: theme.dividerColor),
          borderRadius: BorderRadius.circular(8),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: HighlightableHtmlView(
            key: ValueKey(_reloads),
            body: samplePageBody,
            addCss: sampleCss,
            addScripts: sampleScripts,
            backgroundColor: Colors.white,
            initialHighlights: _saved,
            highlightColor: _pen,
            highlightingEnabled: _highlightingOn,
            showAddToNote: _showAddNote,
            onHighlightChanged: _onChanged,
            onAddToNote: _onNote,
            head: consoleForwardScript,
            onCreated: (controller, bridge) {
              _bridge = bridge;
              controller.addJavaScriptChannel(
                consoleChannel,
                onMessageReceived: (m) => _onJs(m.message),
              );
            },
            onLoaded: _onLoaded,
            onLoadError: (e) => _logEvent('load error  $e'),
          ),
        ),
      ),
    );
    final panel = _SidePanel(
      saved: _saved,
      notes: _notes,
      log: _log,
      jsLog: _jsLog,
      highlightingOn: _highlightingOn,
      showAddNote: _showAddNote,
      onReload: _reload,
      onSelfTest: _runSelfTest,
      palette: _palette,
      pen: _pen,
      onPen: (c) {
        setState(() => _pen = c);
        _logEvent('pen  ${c == null ? 'default' : highlightColorToCss(c)}');
      },
      onForget: () {
        setState(() => _saved = []);
        _logEvent('forgot saved highlights');
      },
      onClearPage: () {
        _bridge?.clear();
        _logEvent('clear()  page only, saved list kept');
      },
      onToggleHighlighting: (on) {
        setState(() => _highlightingOn = on);
        _logEvent('highlightingEnabled  $on');
      },
      onToggleAddNote: (show) {
        setState(() => _showAddNote = show);
        _logEvent('showAddToNote  $show');
      },
    );
    return Scaffold(
      appBar: AppBar(title: const Text('html_highlighter playground')),
      // Wide (tablet, desktop): page and panel side by side. Narrow (phone):
      // page on top, panel below it.
      body: LayoutBuilder(
        builder: (context, constraints) => constraints.maxWidth >= 720
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: page),
                  SizedBox(width: 360, child: panel),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(flex: 3, child: page),
                  const Divider(height: 1),
                  Expanded(flex: 2, child: panel),
                ],
              ),
      ),
    );
  }
}

class _SidePanel extends StatelessWidget {
  const _SidePanel({
    required this.saved,
    required this.notes,
    required this.log,
    required this.jsLog,
    required this.highlightingOn,
    required this.showAddNote,
    required this.onReload,
    required this.onSelfTest,
    required this.palette,
    required this.pen,
    required this.onPen,
    required this.onForget,
    required this.onClearPage,
    required this.onToggleHighlighting,
    required this.onToggleAddNote,
  });

  final List<Map<String, dynamic>> saved;
  final List<String> notes;
  final List<String> log;
  final List<String> jsLog;
  final bool highlightingOn;
  final bool showAddNote;
  final VoidCallback onReload;
  final VoidCallback onSelfTest;
  final List<Color?> palette;
  final Color? pen;
  final ValueChanged<Color?> onPen;
  final VoidCallback onForget;
  final VoidCallback onClearPage;
  final ValueChanged<bool> onToggleHighlighting;
  final ValueChanged<bool> onToggleAddNote;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mono = theme.textTheme.bodySmall?.copyWith(fontFamily: 'Menlo');
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        Text('How to test', style: theme.textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(
          '• Pick a colour, then select text (mouse) or long-press a word (touch).\n'
          '• Each highlight keeps its colour; it is saved as "color" in the JSON.\n'
          '• Click a highlight for its popup ("Add to notes").\n'
          '• Press and hold (or right-click) a highlight to remove it.\n'
          '• "Reload page" rebuilds the WebView and restores the saved list.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        Text('Highlight colour', style: theme.textTheme.titleSmall),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: [
            for (final c in palette)
              Tooltip(
                message: c == null
                    ? 'Engine default (no colour saved)'
                    : highlightColorToCss(c),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => onPen(c),
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: c ?? Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: c == pen
                            ? theme.colorScheme.primary
                            : theme.dividerColor,
                        width: c == pen ? 3 : 1,
                      ),
                    ),
                    child: c == null
                        ? const Icon(Icons.format_color_reset, size: 16)
                        : null,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: onReload,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Reload page'),
            ),
            OutlinedButton.icon(
              onPressed: onSelfTest,
              icon: const Icon(Icons.science_outlined, size: 18),
              label: const Text('Self-test'),
            ),
            OutlinedButton(
              onPressed: saved.isEmpty ? null : onForget,
              child: const Text('Forget saved'),
            ),
            OutlinedButton(
              onPressed: onClearPage,
              child: const Text('clear()'),
            ),
          ],
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          dense: true,
          title: const Text('Highlighting enabled'),
          subtitle: const Text('Create and remove highlights'),
          value: highlightingOn,
          onChanged: onToggleHighlighting,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          dense: true,
          title: const Text('Show "Add to notes"'),
          subtitle: const Text('Popup when a highlight is tapped'),
          value: showAddNote,
          onChanged: onToggleAddNote,
        ),
        const Divider(height: 24),
        Text(
          'Saved highlights (${saved.length})',
          style: theme.textTheme.titleSmall,
        ),
        const SizedBox(height: 4),
        Container(
          constraints: const BoxConstraints(maxHeight: 200),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(6),
          ),
          child: SingleChildScrollView(
            child: SelectableText(
              saved.isEmpty
                  ? 'Nothing yet'
                  : const JsonEncoder.withIndent('  ').convert(saved),
              style: mono,
            ),
          ),
        ),
        const Divider(height: 24),
        Text('Notes (${notes.length})', style: theme.textTheme.titleSmall),
        for (final n in notes)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('• $n', style: theme.textTheme.bodySmall),
          ),
        const Divider(height: 24),
        Text('Event log', style: theme.textTheme.titleSmall),
        for (final l in log.take(40))
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(l, style: mono),
          ),
        const Divider(height: 24),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: Text(
            'JS console (${jsLog.length})',
            style: theme.textTheme.titleSmall,
          ),
          children: [
            for (final l in jsLog.take(80))
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    l,
                    style: mono?.copyWith(
                      color: l.startsWith('error') || l.startsWith('uncaught')
                          ? theme.colorScheme.error
                          : null,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
