import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes, RefObject } from "react";
import type {
  Highlighter,
  HighlighterOptions,
  HighlightModel,
  HighlightNote,
} from "./highlighter.js";

export type { HighlightModel, HighlightNote, HighlighterOptions } from "./highlighter.js";

export interface UseHighlighterOptions extends HighlighterOptions {
  /** Change it when the HTML inside the element is replaced; highlights are redrawn. */
  contentKey?: unknown;
}

export interface HighlighterHandle {
  getModels(): HighlightModel[];
  getAllModels(): HighlightModel[];
  restore(models: HighlightModel[], opts?: { userType?: string }): number;
  remove(commonId: string): boolean;
  clear(opts?: { notify?: boolean }): void;
  highlightSelection(): HighlightModel | null;
  noteFor(commonId: string): HighlightNote | null;
  refresh(): number;
  readonly instance: Highlighter | null;
}

export function useHighlighter(
  ref: RefObject<Element | null>,
  options?: UseHighlighterOptions
): HighlighterHandle;

export interface HighlightSection {
  type: string;
  id: string;
  html: string;
  /** false makes this section unselectable. */
  enabled?: boolean;
  className?: string;
}

export interface HighlightableHtmlProps
  extends HighlighterOptions,
    Omit<HTMLAttributes<HTMLElement>, "onChange" | "color"> {
  /** Several blocks, each its own container. */
  sections?: HighlightSection[];
  /** Or one block. */
  html?: string;
  /** Type of the single block. Default "article". */
  containerType?: string;
  /** Id of the single block. Default "content". */
  containerId?: string;
  /** Element to render. Default "div". */
  as?: string;
}

export const HighlightableHtml: ForwardRefExoticComponent<
  HighlightableHtmlProps & RefAttributes<HighlighterHandle>
>;
