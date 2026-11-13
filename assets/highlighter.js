// html_highlighter engine.
//
// Wires every highlight container on the page (any number). Publishes on
// `window`: setHighlightFromFlutter (restore payload {userType, highlights}),
// clearModels, toggleUserHighlight and toggleStudyAssist. Models carry
// `userType`; only "student" highlights are reported back and removable.

(function () {
  window.setHighlightFromFlutter = setHighlightFromFlutter;
  window.clearModels = clearModels;
  window.toggleUserHighlight = toggleUserHighlight;
  window.toggleStudyAssist = toggleStudyAssist;

  var models = [];
  document.body.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  var popupMap = {};

  function hideAllPopups() {
    Object.keys(popupMap).forEach(function (commonId) {
      hidePopup(commonId);
    });
  }

  var userHighlight = true;
  var studyAssist = false;

  function clearModels() {
    try {
      models.forEach(function (model) {
        handleUnhighlight(model.commonId, "article", true);
      });
    } catch (e) {
    }
  }

  function toggleUserHighlight(value) {
    userHighlight = value;
    if (userHighlight) {
      studyAssist = false;
    }

    var body = document.body;

    body.classList.toggle("noselect", !userHighlight);
    const highlightDivs = document.querySelectorAll(
      '[data-highlight-type="highlight-range"]'
    );
    highlightDivs.forEach((container) => {
      container.setAttribute("data-highlighton", userHighlight);

      container.classList.toggle("noselect", !userHighlight);
    });
  }

  function toggleStudyAssist() {
    studyAssist = !studyAssist;
    if (!studyAssist.value) {
      userHighlight.value = false;
    }
  }

  window.addEventListener("copyComplete", function (event) {
    var data = event.detail;
    if (window.AddToNoteChannel) {
      AddToNoteChannel.postMessage(JSON.stringify(data));
    }
  });
  document.addEventListener("DOMContentLoaded", function () {
    var highlightDiv = document.querySelectorAll(
      '[data-highlight-type="highlight-range"]'
    );
    if (highlightDiv.length === 0) {
      window.alert("No Highligh container found");
    }

    highlightDiv.forEach((firstHighlightContainer) => {
      var markerStatus = firstHighlightContainer.getAttribute("data-highlighton");
      if (markerStatus === "false") {
        firstHighlightContainer.classList.add("noselect");
      }

      firstHighlightContainer.addEventListener("touchend", function (e) {
        var selection = window.getSelection();
        if (!selection) {
          return;
        }
        var onHighlightCallback = function (highlightedData, markerStatus) {
          if (
            window.HighlightChangeChannel &&
            window.HighlightChangeChannel.postMessage
          ) {
            window.HighlightChangeChannel.postMessage(
              JSON.stringify({
                status: "success",
                highlightCount: highlightedData.length,
                userType: "student",
                data: models.filter(function (model) {
                  return model.userType === "student";
                }),
              })
            );
          }

          showPopup(
            {
              target: document.querySelector(
                `span[data-highlight-id="${highlightedData.commonId}"]`
              ),
            },
            highlightedData.commonId
          );

          window.dispatchEvent(
            new CustomEvent("highlightComplete", {
              detail: highlightedData,
            })
          );
        };

        if (selection.rangeCount === 0) {
          return;
        }
        var range = selection.getRangeAt(0);
        if (!range) {
          throw new Error("No range found");
        }

        if (
          range.startOffset === range.endOffset &&
          range.startContainer === range.endContainer
        ) {
          return;
        }

        if (range.startOffset === range.endOffset) {
          return;
        }

        var highlightDiv = getHighLightParentDiv(range.commonAncestorContainer);
        if (!highlightDiv) {
          return;
        }
        var model = getDataModelFromRange(range, highlightDiv);
        getNodeFromModel(model);
        var overlapping = findOverlapping(models, model);
        if (userHighlight == true) {
          overlapping = overlapping.filter(function (a) {
            return a.userType === "student";
          });
        }
        if (overlapping.length > 0) {
          overlapping.forEach(function (a) {
            model.startOffset = Math.min(model.startOffset, a.startOffset);
            model.endOffset = Math.max(model.endOffset, a.endOffset);
            if (a.userType !== "student") return;
            handleUnhighlight(a.commonId, "article");
          });
        }
        models.push(model);
        highlightFromModel(model);
        onHighlightCallback(model, markerStatus);
        clearSelection();
      });
    });
  });

  function findOverlapping(models, model) {
    var overlapping = [];
    for (var _i = 0, models_1 = models; _i < models_1.length; _i++) {
      var aModel = models_1[_i];
      if (aModel.id !== model.id) {
        continue;
      }
      if (aModel.endOffset < model.startOffset) {
        continue;
      }
      if (aModel.startOffset > model.endOffset) {
        continue;
      }
      overlapping.push(aModel);
    }
    return overlapping;
  }

  function highlightFromModel(model) {
    var data = getNodeFromModel(model);
    if (!data) {
      return;
    }
    var range = document.createRange();

    var dataType = model.id.split("--")[1].split("-")[0];

    const userType = model.userType ?? "admin";

    range.setStart(data.start, data.startOffset);
    range.setEnd(data.end, data.endOffset);
    highlightTextNodesBetween(
      range.commonAncestorContainer,
      data.start,
      data.end,
      data.startOffset,
      data.endOffset,
      model.commonId,
      dataType,
      model.id,
      userType
    );
  }

  function clearSelection() {
    var _a, _b, _c, _d;
    window.getSelection
      ? (
          (_a = window.getSelection()) === null || _a === void 0
            ? void 0
            : _a.empty
        )
        ? (_b = window.getSelection()) === null || _b === void 0
          ? void 0
          : _b.empty()
        : ((_c = window.getSelection()) === null || _c === void 0
            ? void 0
            : _c.removeAllRanges) &&
          ((_d = window.getSelection()) === null || _d === void 0
            ? void 0
            : _d.removeAllRanges())
      : document.selection && document.selection.empty();
  }

  function getNodeFromModel(model) {
    var _a, _b;
    var container = document.getElementById(model.id);
    if (!container) {
      console.error("Invalid selection");
      return null;
    }
    var ignoreTypes = [];
    var walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      function filterNodes(node) {
        if (!node.parentNode || node === container) {
          return NodeFilter.FILTER_ACCEPT;
        }
        if (
          node.parentNode.dataset &&
          ignoreTypes.findIndex(function (a) {
            return a === node.parentNode.dataset.highlightType;
          }) >= 0
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return filterNodes(node.parentNode);
      }
    );
    var current = walker.currentNode;
    var finished = false;
    var offset = 0;
    var start = null;
    var end = null;
    var hStartOffset = null;
    var hEndOffset = null;
    while (current && !finished) {
      if (current === container) {
        current = walker.nextNode();
        continue;
      }
      var startOffset = offset;
      var endOffset =
        startOffset +
        ((_b =
          (_a = current.textContent) === null || _a === void 0
            ? void 0
            : _a.length) !== null && _b !== void 0
          ? _b
          : 0);
      if (
        !start &&
        model.startOffset <= endOffset &&
        model.startOffset >= startOffset
      ) {
        start = current;
        hStartOffset = model.startOffset - startOffset;
      }
      if (
        !end &&
        model.endOffset <= endOffset &&
        model.endOffset >= startOffset
      ) {
        end = current;
        hEndOffset = model.endOffset - startOffset;
      }
      offset = endOffset;
      current = walker.nextNode();
    }
    if (!start || !end || !hStartOffset || !hEndOffset) {
      return null;
    }
    return {
      start: start,
      end: end,
      startOffset: hStartOffset,
      endOffset: hEndOffset,
    };
  }

  function getDataModelFromRange(range, highlightDiv) {
    var startOffset = getOffset(
      highlightDiv,
      range.startContainer,
      range.startOffset
    );
    var endOffset = getOffset(highlightDiv, range.endContainer, range.endOffset);
    var id = highlightDiv.id;
    var commonId = generateRandomId();
    return {
      commonId: commonId,
      id: id,
      startOffset: startOffset,
      endOffset: endOffset,
      userType: "student",
    };
  }

  function getOffset(container, node, offset) {
    var _b, _c;
    var calculatedOffset = 0;
    var ignoreTypes = [];
    var walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      function filterNodes(node) {
        if (!node.parentNode || node === container) {
          return NodeFilter.FILTER_ACCEPT;
        }
        if (
          node.parentNode.dataset &&
          ignoreTypes.findIndex(function (a) {
            return a === node.parentNode.dataset.highlightType;
          }) >= 0
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return filterNodes(node.parentNode);
      }
    );
    var current = walker.currentNode;
    var finished = false;
    while (current && !finished) {
      if (current === container) {
        current = walker.nextNode();
        continue;
      }
      if (current === node) {
        finished = true;
        calculatedOffset += offset;
      } else {
        calculatedOffset +=
          (_c =
            (_b = current.textContent) === null || _b === void 0
              ? void 0
              : _b.length) !== null && _c !== void 0
            ? _c
            : 0;
      }
      current = walker.nextNode();
    }
    return calculatedOffset;
  }

  function getHighLightParentDiv(a) {
    if (a.getAttribute) {
      if (a.getAttribute("data-highlight-type")) {
        return a;
      }
    }
    if (!a.parentElement) {
      return null;
    }
    return getHighLightParentDiv(a.parentElement);
  }

  function highlightTextNodesBetween(
    commonAncestor,
    startNode,
    endNode,
    startOffset,
    endOffset,
    commonId,
    dataType,
    containerId,
    userType
  ) {
    if (!commonAncestor || !startNode || !endNode) return [];
    if (!popupMap[commonId]) {
      var popup = document.createElement("div");
      popup.className = "highlight-popup-".concat(commonId);
      popup.style.position = "absolute";
      popup.style.backgroundColor = "#fff";
      popup.style.border = "1px solid #ccc";
      popup.style.padding = "5px";
      popup.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
      popup.style.zIndex = "1000";
      popup.style.display = "none";
      document.body.appendChild(popup);
      popupMap[commonId] = {
        popup: popup,
        texts: [],
      };
    }
    function highlightTextNodesInRange(start, end, ancestor, dataType, userType) {
      var _a, _b;
      var highlightedNodes = [];
      var range = document.createRange();
      var startContainer =
        start.nodeType === Node.TEXT_NODE ? start : start.firstChild || start;
      var endContainer =
        end.nodeType === Node.TEXT_NODE ? end : end.lastChild || end;
      range.setStart(
        startContainer,
        Math.min(
          startOffset,
          ((_a = startContainer.textContent) === null || _a === void 0
            ? void 0
            : _a.length) || 0
        )
      );
      range.setEnd(
        endContainer,
        Math.min(
          endOffset,
          ((_b = endContainer.textContent) === null || _b === void 0
            ? void 0
            : _b.length) || 0
        )
      );
      var textNodes = [];
      var walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_ALL, {
        acceptNode: function () {
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      var current = walker.currentNode;
      var started = false;
      var finished = false;
      while (current && !finished) {
        if (current === start) started = true;
        if (started && current.nodeType === Node.TEXT_NODE) {
          var textContent = current.textContent || "";
          if (textContent.trim().length > 0) {
            textNodes.push(current);
          }
        }
        if (current === end) finished = true;
        current = walker.nextNode();
      }
      textNodes.forEach(function (textNode, index) {
        var text = textNode.textContent || "";
        if (!text) return;
        var startPos = 0;
        var endPos = text.length;
        if (textNode === start) startPos = Math.min(startOffset, text.length);
        if (textNode === end) endPos = Math.min(endOffset, text.length);
        if (startPos >= endPos) return;
        var highlightText = text.slice(startPos, endPos);
        var span = document.createElement("span");
        var spanId = "highlight-".concat(commonId, "-").concat(index);
        span.id = spanId;

        span.className = "highlight-text-".concat(userType);
        span.style.cursor = "pointer";
        span.textContent = highlightText;
        var parent = textNode.parentNode;
        if (!parent) return;
        var textBefore =
          startPos > 0 ? document.createTextNode(text.slice(0, startPos)) : null;
        var textAfter =
          endPos < text.length
            ? document.createTextNode(text.slice(endPos))
            : null;
        span.dataset.originalText = text;
        span.dataset.startPos = startPos.toString();
        span.dataset.endPos = endPos.toString();
        span.dataset.highlightId = commonId;

        const mm = models.find((model) => model.commonId === commonId);

        var unhighlightHandler = function () {
          return handleUnhighlight(commonId, dataType);
        };
        let longPressTimer;
        let longPressTriggered = false;

        span.addEventListener(
          "touchstart",
          function (e) {
            if (e.touches.length > 1) {
              e.preventDefault();
            }

            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
              longPressTriggered = true;
              if (userHighlight === true) {
                unhighlightHandler();
              }
            }, 350);
          },
          {
            passive: false,
          }
        );

        span.addEventListener("touchend", function (e) {
          clearTimeout(longPressTimer);
          if (!longPressTriggered) {
            showPopup(e, commonId);
          }
        });

        span.addEventListener("touchcancel", function () {
          clearTimeout(longPressTimer);
        });

        span.addEventListener("touchmove", function () {
          clearTimeout(longPressTimer);
        });

        span.addEventListener("click", function (e) {
          showPopup(e, commonId);
        });

        span.addEventListener("contextmenu", function (e) {
          if (mm && mm.userType !== "student") return;
          e.preventDefault();
          if (userHighlight === true) {
            unhighlightHandler();
          }
        });

        document.addEventListener("click", function (e) {
          var isHighlightSpanAdmin = e.target.classList.contains(
            "highlight-text-admin"
          );
          var isHighlightSpanStudent = e.target.classList.contains(
            "highlight-text-student"
          );
          var isInsidePopup = e.target.closest("[class*='highlight-popup-']");

          if (
            !isHighlightSpanAdmin &&
            !isInsidePopup &&
            !isHighlightSpanStudent
          ) {
            hideAllPopups();
          }
        });

        popupMap[commonId].texts.push(highlightText);
        if (textBefore) parent.insertBefore(textBefore, textNode);
        parent.insertBefore(span, textNode);
        if (textAfter) parent.insertBefore(textAfter, textNode);
        parent.removeChild(textNode);
        highlightedNodes.push({
          span: span,
          text: highlightText,
          fullOriginalText: text,
          id: spanId,
          unhighlightHandler: unhighlightHandler,
        });
      });
      return highlightedNodes;
    }
    return highlightTextNodesInRange(
      startNode,
      endNode,
      commonAncestor,
      dataType,
      userType
    );
  }

  function handleUnhighlight(commonId, dataType, removeAllHighlights = false) {
    var highlightId = "highlight-".concat(commonId);

    const mm = models.find((model) => model.commonId === commonId);

    if (mm && mm.userType !== "student" && !removeAllHighlights) return;

    var allSpans = document.querySelectorAll('[id^="'.concat(highlightId, '-"]'));

    var OnUnHighlightCallback = function (commonId) {
      models = models.filter(function (model) {
        return model.commonId !== commonId;
      });
      if (
        window.HighlightChangeChannel &&
        window.HighlightChangeChannel.postMessage &&
        !removeAllHighlights
      ) {
        window.HighlightChangeChannel.postMessage(
          JSON.stringify({
            status: "success",
            dataType: dataType,
            userType: "student",
            data: models.filter(function (model) {
              return model.userType === "student";
            }),
          })
        );
      }
    };
    allSpans.forEach(function (span) {
      var element = span;
      var parent = element.parentNode;
      if (!parent) return;
      var originalText = element.dataset.originalText || "";
      var startPos = parseInt(element.dataset.startPos || "0");
      var endPos = parseInt(
        element.dataset.endPos || originalText.length.toString()
      );
      var previousSibling = element.previousSibling;
      var nextSibling = element.nextSibling;
      var textBefore =
        startPos > 0 &&
        (previousSibling === null || previousSibling === void 0
          ? void 0
          : previousSibling.nodeType) === Node.TEXT_NODE
          ? previousSibling.textContent || ""
          : "";
      var textAfter =
        endPos < originalText.length &&
        (nextSibling === null || nextSibling === void 0
          ? void 0
          : nextSibling.nodeType) === Node.TEXT_NODE
          ? nextSibling.textContent || ""
          : "";
      var restoredText =
        textBefore + originalText.slice(startPos, endPos) + textAfter;
      var newTextNode = document.createTextNode(restoredText);
      if (textBefore && previousSibling) parent.removeChild(previousSibling);
      parent.replaceChild(newTextNode, element);
      if (textAfter && nextSibling) parent.removeChild(nextSibling);
    });
    if (popupMap[commonId]) {
      document.body.removeChild(popupMap[commonId].popup);
      delete popupMap[commonId];
    }
    if (userHighlight === true) {
      OnUnHighlightCallback(commonId);
    }
  }
  function generateRandomId(length) {
    if (length === void 0) {
      length = 8;
    }
    return Math.random()
      .toString(36)
      .substring(2, 2 + length);
  }

  function hidePopup(commonId) {
    var popup = popupMap[commonId].popup;
    if (popup) {
      popup.style.display = "none";
    }
  }

  function highlightTextNodesFromArray(savedModel, container) {
    if (!container || !savedModel.length) return [];
    var identifier = container.id.replace("highlight-container-", "");
    savedModel.forEach(function (model) {
      if (model.id !== "highlight-container-".concat(identifier)) return;
      try {
        highlightFromModel(model);
      } catch (error) {
        console.error("Error highlighting text nodes:", error);
      }
    });
    var filteredModel = models.filter(function (m) {
      var _a;
      return (
        m.commonId !==
        ((_a = savedModel.find(function (i) {
          return i.commonId === m.commonId;
        })) === null || _a === void 0
          ? void 0
          : _a.commonId)
      );
    });
    models = __spreadArray(
      __spreadArray([], filteredModel, true),
      savedModel,
      true
    );
  }
  var __spreadArray =
    (this && this.__spreadArray) ||
    function (to, from, pack) {
      if (pack || arguments.length === 2)
        for (var i = 0, l = from.length, ar; i < l; i++) {
          if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
          }
        }
      return to.concat(ar || Array.prototype.slice.call(from));
    };

  function setHighlightFromFlutter(message) {
    try {
      if (window.ConsoleChannel && window.ConsoleChannel.postMessage) {
        window.ConsoleChannel.postMessage(
          "setHighlightFromFlutter function started"
        );
      }
    } catch (e) {
      console.error("Channel error:", e);
    }

    try {
      const highlightedData =
        typeof message === "string" ? JSON.parse(message) : message;

      const data = highlightedData["highlights"];

      if (!Array.isArray(data)) {
        console.error("Invalid highlight data format: expected an array");
        if (window.HighlightChannel && window.HighlightChannel.postMessage) {
          window.HighlightChannel.postMessage(
            JSON.stringify({
              status: "error",
              message: "Invalid data format",
            })
          );
        }
        return;
      }

      var highlightDivs = document.querySelectorAll(
        '[data-highlight-type="highlight-range"]'
      );
      if (highlightDivs.length === 0) {
        const error = "No highlight container found";
        console.error(error);

        if (window.HighlightChannel && window.HighlightChannel.postMessage) {
          window.HighlightChannel.postMessage(
            JSON.stringify({
              status: "error",
              message: error,
            })
          );
        }
        return;
      }

      try {
        highlightDivs.forEach((container) => {
          if (typeof highlightTextNodesFromArray !== "function") {
            console.error("highlightTextNodesFromArray function is not defined!");
            if (window.HighlightChannel && window.HighlightChannel.postMessage) {
              window.HighlightChannel.postMessage(
                JSON.stringify({
                  status: "error",
                  message: "highlightTextNodesFromArray function is not defined",
                })
              );
            }
            return;
          }

          highlightTextNodesFromArray(data, container);

          if (window.HighlightChannel && window.HighlightChannel.postMessage) {
            window.HighlightChannel.postMessage(
              JSON.stringify({
                status: "success",
                highlightCount: data.length,
                containerId: container.id || "unnamed",
              })
            );
          }
        });
      } catch (highlightError) {
        console.error(
          "Error in highlightTextNodesFromArray:",
          highlightError.message
        );
        console.error("Stack:", highlightError.stack);

        if (window.HighlightChannel && window.HighlightChannel.postMessage) {
          window.HighlightChannel.postMessage(
            JSON.stringify({
              status: "error",
              message: highlightError.message,
              type: "highlight_error",
            })
          );
        }
      }
    } catch (error) {
      console.error("Error in setHighlightFromFlutter:", error.message);
      console.error("Stack:", error.stack);

      if (window.HighlightChannel && window.HighlightChannel.postMessage) {
        window.HighlightChannel.postMessage(
          JSON.stringify({
            status: "error",
            message: error.message,
            type: "general_error",
          })
        );
      }
    }
  }

  function showPopup(event, commonId) {
    var _a = popupMap[commonId],
      popup = _a.popup,
      texts = _a.texts;
    if (!popup || !texts.length) return;

    Object.keys(popupMap).forEach(function (otherCommonId) {
      if (otherCommonId !== commonId) {
        hidePopup(otherCommonId);
      }
    });
    var span = event.target;
    var highlightDiv = getHighLightParentDiv(span);
    var identifier = highlightDiv.id || "";

    popup.innerHTML = "";
    if (identifier.includes("question-")) {
      return;
    }
    var buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.gap = "8px";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16px");
    svg.setAttribute("height", "16px");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M3 9V19.4C3 19.9601 3 20.2399 3.10899 20.4538C3.20487 20.642 3.35774 20.7952 3.5459 20.8911C3.7596 21 4.0395 21 4.59846 21H15.0001M14 13V10M14 10V7M14 10H11M14 10H17M7 13.8002V6.2002C7 5.08009 7 4.51962 7.21799 4.0918C7.40973 3.71547 7.71547 3.40973 8.0918 3.21799C8.51962 3 9.08009 3 10.2002 3H17.8002C18.9203 3 19.4801 3 19.9079 3.21799C20.2842 3.40973 20.5905 3.71547 20.7822 4.0918C21.0002 4.51962 21.0002 5.07969 21.0002 6.19978L21.0002 13.7998C21.0002 14.9199 21.0002 15.48 20.7822 15.9078C20.5905 16.2841 20.2842 16.5905 19.9079 16.7822C19.4805 17 18.9215 17 17.8036 17H10.1969C9.07899 17 8.5192 17 8.0918 16.7822C7.71547 16.5905 7.40973 16.2842 7.21799 15.9079C7 15.4801 7 14.9203 7 13.8002Z"
    );
    path.setAttribute("stroke", "#ffffff");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    var copyButton = document.createElement("button");
    var OnCopyCallback = function (copyText, identifier) {
      hidePopup(commonId);
      window.dispatchEvent(
        new CustomEvent("copyComplete", {
          detail: {
            data: copyText,
            identifier: identifier,
          },
        })
      );
    };
    copyButton.textContent = "Add to notes";
    copyButton.style.marginTop = "0";
    copyButton.addEventListener("click", function (e) {
      var _a;
      e.stopPropagation();
      var model = models.find(function (m) {
        return m.commonId === commonId;
      });
      if (!model) {
        console.warn("No model found for commonId:", commonId);
        return;
      }
      var rangeData = getNodeFromModel(model);
      if (!rangeData) {
        console.warn("Could not reconstruct range for commonId:", commonId);
        return;
      }
      var range = document.createRange();
      range.setStart(rangeData.start, rangeData.startOffset);
      range.setEnd(rangeData.end, rangeData.endOffset);
      var div = document.createElement("div");
      div.appendChild(range.cloneContents());
      var popupElements = div.getElementsByClassName("hover-content-popup");
      while (popupElements.length > 0 && popupElements[0].parentNode) {
        (_a = popupElements[0]) === null || _a === void 0
          ? void 0
          : _a.parentNode.removeChild(popupElements[0]);
      }
      div
        .querySelectorAll(
          "[data-original-text], [data-start-pos],[data-long-html],[data-short-html]"
        )
        .forEach((el) => {
          el.removeAttribute("data-original-text");
          el.removeAttribute("data-short-html");
          el.removeAttribute("data-short-text");
          el.removeAttribute("data-link-type");
          el.removeAttribute("data-link-id");
        });
      div.querySelectorAll("img, p").forEach((el) => {
        if (el.parentElement.tagName === "P") {
          el.parentElement.remove();
        }
      });

      var htmlContent = div.innerHTML;

      OnCopyCallback(htmlContent, identifier);
    });
    buttonContainer.appendChild(svg);
    buttonContainer.appendChild(copyButton);
    popup.appendChild(buttonContainer);

    var highlightSpans = document.querySelectorAll(
      'span[data-highlight-id="'.concat(commonId, '"]')
    );
    var lastSpan = highlightSpans[highlightSpans.length - 1];
    var rect = lastSpan.getBoundingClientRect();
    popup.style.top = "".concat(rect.bottom + window.scrollY, "px");
    popup.style.left = "".concat(rect.left + window.scrollX, "px");
    popup.style.display = "block";
    popup.style.backgroundColor = "black";
    popup.style.color = "white";
    popup.style.padding = "8px";
    popup.style.borderRadius = "4px";
    popup.style.fontWeight = "bold";
    span.addEventListener("mouseleave", function () {
      setTimeout(function () {
        if (!popup.matches(":hover")) {
          popup.style.display = "none";
        }
      }, 200);
    });
    popup.addEventListener("mouseleave", function () {
      popup.style.display = "none";
    });
    popup.addEventListener("mouseenter", function () {
      popup.style.display = "block";
    });
    popup.addEventListener("mousepress", function () {
      popup.style.display = "block";
    });
    popup.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }
})();

// Stale-selection guard. The engine highlights whatever is
// selected when a container gets `touchend`. On touch, holding a highlight to
// remove it also selects the word underneath, so the next tap used to bring
// the highlight back. Listening to trusted touches in the capture phase, this
// clears the selection when a press removes its highlight and drops any
// selection that already existed when the touch began.
(function () {
  if (window.__hlSelectionGuard) return;
  window.__hlSelectionGuard = true;
  var CONTAINER = '[data-highlight-type="highlight-range"]';
  var selectionAtStart = null;

  function snapshot() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    return {
      anchorNode: sel.anchorNode,
      anchorOffset: sel.anchorOffset,
      focusNode: sel.focusNode,
      focusOffset: sel.focusOffset,
    };
  }

  function sameSelection(a, b) {
    return (
      !!a &&
      !!b &&
      a.anchorNode === b.anchorNode &&
      a.anchorOffset === b.anchorOffset &&
      a.focusNode === b.focusNode &&
      a.focusOffset === b.focusOffset
    );
  }

  function clearSelection() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) sel.removeAllRanges();
  }

  // A removed span is detached when the finger lifts, so its touchend never
  // reaches `document`; listen on the span itself.
  function watchPressedHighlight(span) {
    function done() {
      span.removeEventListener("touchend", done);
      span.removeEventListener("touchcancel", done);
      if (span.isConnected) return;
      clearSelection();
      setTimeout(clearSelection, 0);
    }
    span.addEventListener("touchend", done);
    span.addEventListener("touchcancel", done);
  }

  document.addEventListener(
    "touchstart",
    function (e) {
      if (!e.isTrusted) return;
      var t = e.target;
      var span = t && t.closest ? t.closest("[data-highlight-id]") : null;
      if (span) watchPressedHighlight(span);
      selectionAtStart = snapshot();
    },
    true
  );

  document.addEventListener(
    "touchend",
    function (e) {
      if (!e.isTrusted) return;
      var atStart = selectionAtStart;
      selectionAtStart = null;

      var t = e.target;
      var container = t && t.closest ? t.closest(CONTAINER) : null;
      if (container && atStart && sameSelection(atStart, snapshot())) {
        clearSelection();
      }
    },
    true
  );
})();

// Page controls, driven by HtmlHighlightBridge:
// - __hlSetHighlightingEnabled(on): when off, no new highlights and no
//   removal; existing highlights stay and still open their popup on tap.
// - __hlSetAddNoteVisible(show): when hidden, the highlight popup (which only
//   holds "Add to notes") never appears.
// - Always: a selection in a container that contains or crosses embedded
//   media (iframe, video, image…) is cleared as soon as it forms and never
//   becomes a highlight.
(function () {
  if (window.__hlControls) return;
  window.__hlControls = true;
  var CONTAINER = '[data-highlight-type="highlight-range"]';
  var HIGHLIGHT = "[data-highlight-id]";
  var MEDIA = "iframe, video, audio, img, picture, svg, canvas, object, embed";
  var enabled = true;

  var style = document.createElement("style");
  style.textContent =
    "body.hl-highlighting-off " + CONTAINER +
    " { -webkit-user-select: none; user-select: none; }\n" +
    'body.hl-hide-add-note [class*="highlight-popup-"]' +
    " { display: none !important; }";
  (document.head || document.documentElement).appendChild(style);

  function closest(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  // No long-press timer on highlights while off (the tap still opens the popup).
  document.addEventListener(
    "touchstart",
    function (e) {
      if (!enabled && closest(e.target, HIGHLIGHT)) e.stopPropagation();
    },
    true
  );

  // No new highlight from a selection while off (touch and the mouse shim).
  document.addEventListener(
    "touchend",
    function (e) {
      if (enabled) return;
      if (closest(e.target, CONTAINER) && !closest(e.target, HIGHLIGHT)) {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) sel.removeAllRanges();
        e.stopPropagation();
      }
    },
    true
  );

  // True when the current selection contains or crosses an embedded media
  // element. A range that only touches one at its edge doesn't count.
  function selectionSpansMedia() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    var range = sel.getRangeAt(0);
    var root = range.commonAncestorContainer;
    if (root.nodeType !== 1) root = root.parentNode;
    if (!root || !root.querySelectorAll) return false;
    var media = root.querySelectorAll(MEDIA);
    for (var i = 0; i < media.length; i++) {
      if (range.intersectsNode(media[i])) return true;
    }
    return false;
  }

  // Never highlight across media (touch and the mouse shim).
  document.addEventListener(
    "touchend",
    function (e) {
      if (!closest(e.target, CONTAINER) || closest(e.target, HIGHLIGHT)) return;
      if (!selectionSpansMedia()) return;
      window.getSelection().removeAllRanges();
      e.stopPropagation();
    },
    true
  );

  // Don't even let such a selection exist: clear it as soon as it grows
  // across media (e.g. dragging a selection handle past a video).
  document.addEventListener("selectionchange", function () {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    var node = sel.anchorNode;
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!closest(el, CONTAINER)) return;
    if (selectionSpansMedia()) sel.removeAllRanges();
  });

  // No right-click / press-and-hold removal while off.
  document.addEventListener(
    "contextmenu",
    function (e) {
      if (!enabled && closest(e.target, HIGHLIGHT)) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );

  window.__hlSetHighlightingEnabled = function (on) {
    enabled = on !== false;
    document.body.classList.toggle("hl-highlighting-off", !enabled);
    if (!enabled) {
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0) sel.removeAllRanges();
    }
    if (typeof window.toggleUserHighlight === "function") {
      window.toggleUserHighlight(enabled);
    }
  };

  window.__hlSetAddNoteVisible = function (show) {
    document.body.classList.toggle("hl-hide-add-note", show === false);
  };
})();

// Android long-press. Chrome on Android ends a long-press that selects text
// with `touchcancel`, never `touchend`, so the engine (which highlights on a
// container's touchend) never saw it. When a trusted touch is cancelled and a
// new selection formed in a container during that touch, finish the touch
// with the engine's own `touchend`, which the switches and media rule above
// also see. A cancelled scroll leaves the selection as it was and is ignored.
(function () {
  if (window.__hlTouchCancel) return;
  window.__hlTouchCancel = true;
  var CONTAINER = '[data-highlight-type="highlight-range"]';
  var HIGHLIGHT = "[data-highlight-id]";
  var atStart = null;

  function closest(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  function snapshot() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    return [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset];
  }

  function same(a, b) {
    if (!a || !b) return a === b;
    for (var i = 0; i < 4; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  document.addEventListener(
    "touchstart",
    function (e) {
      if (e.isTrusted) atStart = snapshot();
    },
    true
  );

  document.addEventListener(
    "touchcancel",
    function (e) {
      if (!e.isTrusted) return;
      var before = atStart;
      atStart = null;
      var target = e.target;
      var container = closest(target, CONTAINER);
      if (!container || closest(target, HIGHLIGHT)) return;
      var now = snapshot();
      if (!now || same(now, before)) return;
      if (!container.contains(now[0]) || !container.contains(now[2])) return;
      target.dispatchEvent(new Event("touchend", { bubbles: true, cancelable: true }));
    },
    true
  );
})();
