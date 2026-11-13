/** A saved highlight. Same JSON as the Flutter package. */
export interface HighlightModel {
  /** Random id of the highlight. */
  commonId: string;
  /** DOM id of its container: `highlight-container--<type>-<id>`. */
  id: string;
  /** Character offsets into the container's text. */
  startOffset: number;
  endOffset: number;
  /** Owner, e.g. "student", "admin", "ops". */
  userType?: string;
  /** CSS colour; absent means the default colour for the owner. */
  color?: string;
  [key: string]: unknown;
}

export interface HighlightNote {
  /** Selected HTML, highlight spans included. */
  html: string;
  /** Same HTML with the highlight spans unwrapped. */
  cleanHtml: string;
  /** Plain text of the highlight. */
  text: string;
  /** DOM id of the container. */
  identifier: string;
  model: HighlightModel;
}

export interface HighlightChangeInfo {
  type: "add" | "remove" | "clear";
  model: HighlightModel | null;
}

export interface HighlighterOptions {
  /** Saved highlights to show straight away. */
  highlights?: HighlightModel[];
  /** Colour for new highlights (CSS). Default: the owner's CSS colour. */
  color?: string | null;
  /** Allow creating and removing highlights. Default true. */
  enabled?: boolean;
  /** Show the "Add to notes" popup when a highlight is tapped. Default true. */
  showAddToNote?: boolean;
  /** Owner of new highlights; only these are reported and removable. Default "student". */
  userType?: string;
  /** Inject DEFAULT_CSS into the document. Default true. */
  injectStyles?: boolean;
  /** Press-and-hold time that removes a highlight. Default 350 ms. */
  longPressMs?: number;
  /** Popup button text. Default "Add to notes". */
  addToNoteLabel?: string;
  /** Open the popup right after a highlight is created. Default true. */
  popupAfterCreate?: boolean;
  /** Mouse / pen: clicking one of your highlights removes it (touch taps still open the popup). Default true. */
  clickToRemove?: boolean;
  /** Mouse / pen: open the popup while hovering a highlight. Default true. */
  popupOnHover?: boolean;
  /** Hover time before the popup opens. Default 150 ms. */
  hoverDelayMs?: number;
  /** Time after the pointer leaves the highlight and popup before it closes. Default 300 ms. */
  hoverHideMs?: number;
  /** Called with this owner's full list after every add or remove. */
  onChange?: (models: HighlightModel[], info: HighlightChangeInfo) => void;
  /** Called when "Add to notes" is pressed. */
  onAddToNote?: (note: HighlightNote) => void;
}

export interface Highlighter {
  getModels(): HighlightModel[];
  getAllModels(): HighlightModel[];
  restore(models: HighlightModel[], opts?: { userType?: string }): number;
  remove(commonId: string): boolean;
  clear(opts?: { notify?: boolean }): void;
  highlightSelection(): HighlightModel | null;
  setColor(color: string | null): void;
  setEnabled(enabled: boolean): void;
  setAddToNoteVisible(visible: boolean): void;
  noteFor(commonId: string): HighlightNote | null;
  refresh(): number;
  destroy(): void;
}

export const CONTAINER_SELECTOR: string;
export const DEFAULT_CSS: string;
export function highlightContainerId(type: string, id: string): string;
export function highlightContainer(args: {
  type: string;
  id: string;
  html: string;
  enabled?: boolean;
  attributes?: string;
}): string;
export function createHighlighter(
  root: Element,
  options?: HighlighterOptions
): Highlighter;
