import Textbox from '@borgar/textbox';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  type LegendSvgDefinition,
  legendTitleFontSize,
  renderLegendHeader,
  renderLegendNote,
  resolveLegendFontFamily,
  scaleLegendMetric,
  wrapLegendText
} from './utils';

/** Widest a title set beside the entries may run before it wraps. */
export const SIDE_TITLE_MAX_WIDTH = 120;
/** Gap between a side title and the entries, at the reference font size. */
export const SIDE_TITLE_GAP = 14;

interface SideTextOptions {
  fontSize?: number;
  fontFamily?: string;
}

/**
 * The title and subtitle of a legend drawn on their own, to sit at the left of
 * its entries. The right edge keeps the gap the entries' own margin lacks.
 */
export function draw_legend_side_header(
  options: SideTextOptions & {
    title?: string | null;
    subtitle?: string | null;
    /** Widest the text may run, in pixels; defaults to SIDE_TITLE_MAX_WIDTH scaled to the font. */
    maxWidth?: number;
  }
): LegendSvgDefinition | null {
  const { title, subtitle, fontSize = 12 } = options;
  if (!title?.trim() && !subtitle?.trim()) return null;

  const fontFamily = resolveLegendFontFamily(options.fontFamily);
  const titleSize = title ? legendTitleFontSize(fontSize) : 0;
  const subtitleSize = subtitle ? fontSize : 0;
  const margin = scaleLegendMetric(10, fontSize);
  const gap = scaleLegendMetric(SIDE_TITLE_GAP, fontSize);
  const maxWidth =
    options.maxWidth ?? scaleLegendMetric(SIDE_TITLE_MAX_WIDTH, fontSize);
  const titleFont = createLegendFont({
    fontSize: titleSize,
    fontFamily,
    weight: 'bold'
  });
  const subtitleFont = createLegendFont({ fontSize: subtitleSize, fontFamily });

  const textWidth = Math.max(
    0,
    ...measureLines(title, titleFont, maxWidth),
    ...measureLines(subtitle, subtitleFont, maxWidth)
  );
  const header = renderLegendHeader({
    title,
    subtitle,
    x: margin,
    y: margin,
    maxWidth,
    titleSize,
    subtitleSize,
    fontFamily,
    titleFont,
    subtitleFont
  });
  // The entries start after their own left margin, so only the rest of the
  // gap belongs to the header.
  const width = margin + textWidth + Math.max(0, gap - margin);
  const height = margin * 2 + header.height;

  return {
    markup: `<g class="side_title" font-family="${escapeSvgAttribute(fontFamily)}">
      ${createLegendCanvasRect(width, height)}
      ${header.markup}
    </g>`,
    width,
    height
  };
}

/** A legend note drawn across the whole frame, under a side title and its entries. */
export function draw_legend_side_note(
  options: SideTextOptions & { note?: string | null; width: number }
): LegendSvgDefinition | null {
  const { note, fontSize = 12, width } = options;
  if (!note?.trim()) return null;

  const fontFamily = resolveLegendFontFamily(options.fontFamily);
  const noteSize = Math.round(fontSize * 0.92);
  const margin = scaleLegendMetric(10, fontSize);
  const block = renderLegendNote({
    note,
    x: margin,
    y: 0,
    maxWidth: Math.max(1, width - margin * 2),
    noteSize,
    fontFamily
  });
  if (block.height === 0) return null;
  const height = block.height + margin;

  return {
    markup: `<g class="side_note" font-family="${escapeSvgAttribute(fontFamily)}">
      ${createLegendCanvasRect(width, height)}
      ${block.markup}
    </g>`,
    width,
    height
  };
}

function measureLines(
  text: string | null | undefined,
  font: string,
  maxWidth: number
): number[] {
  if (!text?.trim()) return [];
  return wrapLegendText(text, font, maxWidth).map((line) =>
    Math.ceil(Textbox.measureText(line, font))
  );
}
