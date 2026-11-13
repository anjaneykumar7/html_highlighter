/// Playground-only debugging helpers. Not part of the package.
library;

/// Name of the channel the page's console is forwarded to.
const String consoleChannel = 'ConsoleChannel';

/// `<head>` script forwarding `console.log/error` and uncaught errors to
/// [consoleChannel]. Must run before the engine so its logs are captured.
const String consoleForwardScript = r'''
<script>
(function () {
  function fmt(a) {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  }
  function send(level, args) {
    try {
      if (window.ConsoleChannel) {
        window.ConsoleChannel.postMessage(
          level + ' ' + Array.prototype.map.call(args, fmt).join(' '));
      }
    } catch (e) {}
  }
  var log = console.log, err = console.error;
  console.log = function () { log.apply(console, arguments); send('log', arguments); };
  console.error = function () { err.apply(console, arguments); send('error', arguments); };
  window.addEventListener('error', function (e) {
    send('uncaught', [e.message + ' (line ' + e.lineno + ')']);
  });
})();
</script>
''';

/// Drives the page the way a mouse user would, inside the real WebView, and
/// reports `SELFTEST …` lines through the console:
/// 1. select text in the 2nd container and release the mouse → highlight?
/// 2. press and hold that highlight with the mouse → removed?
const String selfTestScript = r'''
(async function () {
  function report(s) { console.log('SELFTEST ' + s); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function count() { return document.querySelectorAll('[data-highlight-id]').length; }
  try {
    var containers = document.querySelectorAll('[data-highlight-type="highlight-range"]');
    var c = containers[containers.length > 1 ? 1 : 0];
    var walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.textContent.trim().length > 30 ? 1 : 3; }
    });
    var tn = walker.nextNode();
    if (!tn) { report('create FAIL no text node'); return; }

    var range = document.createRange();
    range.setStart(tn, 5);
    range.setEnd(tn, 25);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var before = count();
    tn.parentElement.dispatchEvent(new PointerEvent('pointerup', {
      pointerType: 'mouse', button: 0, bubbles: true, cancelable: true
    }));
    await wait(300);
    var after = count();
    report('create ' + (after > before ? 'PASS' : 'FAIL') +
      ' spans ' + before + '->' + after + ' in ' + c.id);
    var firstSpan = document.querySelector('[data-highlight-id]');
    var bg = firstSpan ? getComputedStyle(firstSpan).backgroundColor : 'none';
    report('colour ' + (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
      ? 'PASS' : 'FAIL') + ' ' + bg);
    var popupOpen = Array.prototype.some.call(
      document.querySelectorAll('[class*="highlight-popup-"]'),
      function (p) { return getComputedStyle(p).display !== 'none'; });
    report('popup-after-create ' + (popupOpen ? 'PASS' : 'FAIL'));
    if (after === 0) return;

    var seen = [];
    ['pointerdown', 'pointerup', 'contextmenu'].forEach(function (t) {
      document.addEventListener(t, function (e) {
        seen.push(t + '(' + (e.pointerType || '-') + ',b' + e.button + ')');
      }, true);
    });

    var span = document.querySelector('[data-highlight-id]');
    var b = span.getBoundingClientRect();
    var x = b.x + 2, y = b.y + 2;
    span.dispatchEvent(new PointerEvent('pointerdown', {
      pointerType: 'mouse', button: 0, bubbles: true, clientX: x, clientY: y
    }));
    await wait(450);
    span.dispatchEvent(new PointerEvent('pointerup', {
      pointerType: 'mouse', button: 0, bubbles: true, clientX: x, clientY: y
    }));
    await wait(250);
    report('longpress-remove ' + (count() === 0 ? 'PASS' : 'FAIL') +
      ' spans ' + after + '->' + count() + ' events ' + seen.join(' '));

    if (count() > 0) {
      var s2 = document.querySelector('[data-highlight-id]');
      s2.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y
      }));
      await wait(250);
      report('contextmenu-remove ' + (count() === 0 ? 'PASS' : 'FAIL') +
        ' spans now ' + count());
    }

    // List items inside a container.
    var li = document.querySelector('[data-highlight-type="highlight-range"] li');
    if (li) {
      var liText = document.createTreeWalker(li, NodeFilter.SHOW_TEXT).nextNode();
      var lr = document.createRange();
      lr.setStart(liText, 2);
      lr.setEnd(liText, Math.min(12, liText.length));
      sel.removeAllRanges();
      sel.addRange(lr);
      var beforeLi = count();
      li.dispatchEvent(new PointerEvent('pointerup', {
        pointerType: 'mouse', button: 0, bubbles: true, cancelable: true
      }));
      await wait(300);
      var liSpan = li.querySelector('[data-highlight-id]');
      report('list-item ' + (liSpan && count() > beforeLi ? 'PASS' : 'FAIL') +
        ' "' + (liSpan ? liSpan.textContent : '') + '"');
      if (liSpan) {
        liSpan.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, button: 2
        }));
        await wait(200);
      }
    } else {
      report('list-item SKIP no list in a container');
    }

    // Table cells inside a container.
    var td = document.querySelector('[data-highlight-type="highlight-range"] td');
    if (td) {
      var tdText = document.createTreeWalker(td, NodeFilter.SHOW_TEXT).nextNode();
      var tr = document.createRange();
      tr.setStart(tdText, 0);
      tr.setEnd(tdText, Math.min(8, tdText.length));
      sel.removeAllRanges();
      sel.addRange(tr);
      var beforeTd = count();
      td.dispatchEvent(new PointerEvent('pointerup', {
        pointerType: 'mouse', button: 0, bubbles: true, cancelable: true
      }));
      await wait(300);
      var tdSpan = td.querySelector('[data-highlight-id]');
      report('table-cell ' + (tdSpan && count() > beforeTd ? 'PASS' : 'FAIL') +
        ' "' + (tdSpan ? tdSpan.textContent : '') + '"');
      if (tdSpan) {
        tdSpan.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, button: 2
        }));
        await wait(200);
      }
    } else {
      report('table-cell SKIP no table in a container');
    }

    // Highlights a few characters of [el]'s first text node with the mouse
    // path and returns the new highlight span (or null).
    async function highlightIn(el) {
      var t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) { return n.textContent.trim().length > 8 ? 1 : 3; }
      }).nextNode();
      if (!t) return null;
      var start = t.textContent.search(/\S/);
      var r = document.createRange();
      r.setStart(t, start);
      r.setEnd(t, start + 6);
      sel.removeAllRanges();
      sel.addRange(r);
      el.dispatchEvent(new PointerEvent('pointerup', {
        pointerType: 'mouse', button: 0, bubbles: true, cancelable: true
      }));
      await wait(300);
      return el.querySelector('[data-highlight-id]');
    }
    async function removeSpan(span) {
      span.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, button: 2
      }));
      await wait(200);
    }

    // Text next to an image (a <figure> caption).
    var img = document.querySelector('[data-highlight-type="highlight-range"] img');
    if (img) {
      var cap = img.closest('figure') && img.closest('figure').querySelector('figcaption');
      var imgSpan = cap ? await highlightIn(cap) : null;
      var imgOk = imgSpan && img.isConnected && img.complete && img.naturalWidth > 0;
      report('image-neighbour ' + (imgOk ? 'PASS' : 'FAIL') +
        ' "' + (imgSpan ? imgSpan.textContent : '') + '" image ' +
        (img.complete ? img.naturalWidth + 'px wide' : 'not loaded'));
      if (imgSpan) await removeSpan(imgSpan);
    } else {
      report('image-neighbour SKIP no image in a container');
    }

    // Text right after an iframe; the iframe must stay the same element.
    var frame = document.querySelector('[data-highlight-type="highlight-range"] iframe');
    if (frame) {
      var next = frame.nextElementSibling;
      while (next && next.tagName !== 'P') next = next.nextElementSibling;
      var frameParent = frame.parentNode;
      var frameSpan = next ? await highlightIn(next) : null;
      var frameOk = frameSpan && frame.isConnected && frame.parentNode === frameParent;
      report('iframe-neighbour ' + (frameOk ? 'PASS' : 'FAIL') +
        ' "' + (frameSpan ? frameSpan.textContent : '') + '" iframes on page ' +
        document.querySelectorAll('iframe').length);
      if (frameSpan) await removeSpan(frameSpan);
    } else {
      report('iframe-neighbour SKIP no iframe in a container');
    }

    // A selection that runs across an iframe must not become a highlight.
    var across = document.querySelector('[data-highlight-type="highlight-range"] iframe');
    if (across) {
      var before = across.previousElementSibling, after = across.nextElementSibling;
      while (before && before.tagName !== 'P') before = before.previousElementSibling;
      while (after && after.tagName !== 'P') after = after.nextElementSibling;
      var t1 = before && document.createTreeWalker(before, NodeFilter.SHOW_TEXT).nextNode();
      var t2 = after && document.createTreeWalker(after, NodeFilter.SHOW_TEXT).nextNode();
      if (t1 && t2) {
        var span = document.createRange();
        span.setStart(t1, 5);
        span.setEnd(t2, 5);
        sel.removeAllRanges();
        sel.addRange(span);
        var beforeCount = count();
        before.dispatchEvent(new PointerEvent('pointerup', {
          pointerType: 'mouse', button: 0, bubbles: true, cancelable: true
        }));
        await wait(300);
        var blocked = count() === beforeCount && sel.isCollapsed !== false;
        report('media-span-blocked ' + (blocked ? 'PASS' : 'FAIL') +
          ' spans ' + beforeCount + '->' + count() +
          ', selection ' + (sel.rangeCount && !sel.isCollapsed ? 'kept' : 'cleared'));
        document.querySelectorAll('[data-highlight-id]').forEach(function (s) {
          s.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
        });
        await wait(200);
      } else {
        report('media-span-blocked SKIP no paragraphs around the iframe');
      }
    } else {
      report('media-span-blocked SKIP no iframe in a container');
    }
    report('finished');
  } catch (e) {
    report('ERROR ' + e);
  }
})();
''';
