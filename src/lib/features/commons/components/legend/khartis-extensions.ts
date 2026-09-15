import Textbox from '@borgar/textbox';
import { PATTERN_OVERLAY_OPACITY } from '$lib/features/commons/constants/pattern.constants';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  measureLegendLongestToken,
  renderLegendHeader,
  renderLegendNote,
  resolveLegendFontFamily,
  splitLegendOverflow,
  wrapLegendText,
  type CommonLegendTextOptions,
  type LegendSvgDefinition
} from './utils';

export type KhartisLegendSwatchType = 'box' | 'line' | 'symbol' | 'pattern';

export interface LegendPatternFill {
  defs: string;
  fillUrl: string;
}

export interface KhartisLegendSwatchItem {
  label: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  symbol?: string | null;
  size?: number;
  patternFill?: LegendPatternFill | null;
  patternOpacity?: number;
  dashed?: boolean;
}

export interface KhartisSwatchLegendOptions extends CommonLegendTextOptions {
  type?: KhartisLegendSwatchType;
  footerItems?: KhartisLegendSwatchItem[];
  footerType?: KhartisLegendSwatchType;
}

export interface KhartisLineWidthLegendStep {
  label: string;
  width: number;
  color: string;
  opacity?: number;
  dashed?: boolean;
}

export interface KhartisLineWidthLegendOptions extends CommonLegendTextOptions {
  footerItems?: KhartisLegendSwatchItem[];
  footerType?: KhartisLegendSwatchType;
}

export interface KhartisDensityLegendOptions extends CommonLegendTextOptions {
  ratioLabel: string;
  dotSize: number;
  fill: string;
  footerItems?: KhartisLegendSwatchItem[];
  footerType?: KhartisLegendSwatchType;
}

type RowShapeFactory<T> = (
  item: T,
  x: number,
  rowTop: number,
  size: number,
  index: number,
  rowHeight: number
) => { markup: string; defs?: string; labelY?: number };

interface RowLegendOptions<T> extends CommonLegendTextOptions {
  className: string;
  items: T[];
  getLabel: (item: T) => string;
  drawShape: RowShapeFactory<T>;
  shapeWidth?: number;
  minRowHeight?: number;
  // Set when the items carry their own drawn size: the shape column and each
  // row then grow with the item, so a legend meant to read at map scale is not
  // squeezed into a box derived from the font size.
  getShapeSize?: (item: T) => number | undefined;
  footerItems?: KhartisLegendSwatchItem[];
  footerType?: KhartisLegendSwatchType;
}

export function draw_khartis_swatch_legend(
  items: KhartisLegendSwatchItem[],
  options: KhartisSwatchLegendOptions = {}
): LegendSvgDefinition {
  const type = options.type ?? 'box';

  return draw_row_legend({
    ...options,
    className: `khartis_${type}_legend`,
    items,
    getLabel: (item) => item.label,
    shapeWidth: getSwatchShapeWidth(
      type,
      Math.round((options.fontSize ?? 12) * 1.25)
    ),
    ...(type === 'symbol'
      ? { getShapeSize: (item: KhartisLegendSwatchItem) => item.size }
      : {}),
    footerItems: options.footerItems,
    footerType: options.footerType,
    drawShape: (item, x, rowTop, size, _index, rowHeight) =>
      draw_swatch_shape(item, type, x, rowTop, size, rowHeight)
  });
}

export function draw_khartis_line_width_legend(
  steps: KhartisLineWidthLegendStep[],
  options: KhartisLineWidthLegendOptions = {}
): LegendSvgDefinition {
  return draw_row_legend({
    ...options,
    className: 'khartis_line_width_legend',
    items: steps,
    getLabel: (step) => step.label,
    shapeWidth: 34,
    minRowHeight: Math.max(18, ...steps.map((step) => step.width + 8)),
    footerItems: options.footerItems,
    footerType: options.footerType,
    drawShape: (step, x, rowTop, _size, _index, rowHeight) => {
      const mid = rowTop + rowHeight / 2;
      const swatch: Partial<KhartisLegendSwatchItem> = {
        stroke: step.color,
        strokeWidth: step.width,
        opacity: step.opacity,
        dashed: step.dashed
      };

      return { markup: draw_line(swatch, x, mid, 34) };
    }
  });
}

export function draw_khartis_density_legend(
  options: KhartisDensityLegendOptions
): LegendSvgDefinition {
  return draw_row_legend({
    ...options,
    className: 'khartis_density_legend',
    items: [options],
    getLabel: (item) => item.ratioLabel,
    footerItems: options.footerItems,
    footerType: options.footerType,
    drawShape: (item, x, rowTop, size, _index, rowHeight) => {
      const radius = Math.max(2, Math.min(size / 2, item.dotSize * 2));
      return {
        markup: `<circle cx="${x + size / 2}" cy="${rowTop + rowHeight / 2}" r="${radius}" fill="${escapeSvgAttribute(item.fill)}" />`
      };
    }
  });
}

function draw_row_legend<T>(options: RowLegendOptions<T>): LegendSvgDefinition {
  const fontSize = options.fontSize ?? 12;
  const fontFamily = resolveLegendFontFamily(options.fontFamily);
  const titleSize = options.title ? Math.round(fontSize * 1.16) : 0;
  const subtitleSize = options.subtitle ? fontSize : 0;
  const noteSize = options.note ? Math.round(fontSize * 0.92) : 0;
  const lineHeight = fontSize * 1.2;
  const font = createLegendFont({ fontSize, lineHeight, fontFamily });
  const titleFont = createLegendFont({
    fontSize: titleSize,
    fontFamily,
    weight: 'bold'
  });
  const subtitleFont = createLegendFont({
    fontSize: subtitleSize,
    fontFamily
  });
  const noteFont = createLegendFont({ fontSize: noteSize, fontFamily });
  const margin = Math.max(10, Math.round(fontSize * 0.6));
  const gap = Math.max(8, Math.round(fontSize * 0.6));
  const shapeSize = Math.round(fontSize * 1.25);
  const footerType = options.footerType ?? 'box';
  const { items, overflowLabel } = splitLegendOverflow(options.items);
  const footerItems: KhartisLegendSwatchItem[] = [
    ...(overflowLabel
      ? [{ label: overflowLabel, fill: 'none', stroke: 'none', strokeWidth: 0 }]
      : []),
    ...(options.footerItems ?? [])
  ];
  const itemShapeSizes = items.map((item) =>
    Math.max(shapeSize, options.getShapeSize?.(item) ?? 0)
  );
  const footerShapeSizes = footerItems.map((item) =>
    Math.max(shapeSize, options.getShapeSize ? (item.size ?? 0) : 0)
  );
  const shapeWidth = Math.max(
    options.shapeWidth ?? shapeSize,
    footerItems.length > 0 ? getSwatchShapeWidth(footerType, shapeSize) : 0,
    ...itemShapeSizes,
    ...footerShapeSizes
  );
  const labelWidth = Math.round(fontSize * 15);
  const labelLines = items.map((item) =>
    wrapLegendText(options.getLabel(item), font, labelWidth).slice(0, 2)
  );
  const footerLabelLines = footerItems.map((item) =>
    wrapLegendText(item.label, font, labelWidth).slice(0, 2)
  );
  const measuredLabelWidth = Math.max(
    0,
    ...[...labelLines, ...footerLabelLines]
      .flat()
      .map((line) => Textbox.measureText(line, font))
  );
  const contentWidth = margin + shapeWidth + gap + measuredLabelWidth + margin;
  const textWidth =
    margin * 2 +
    Math.max(
      measureLegendLongestToken(options.title, titleFont),
      measureLegendLongestToken(options.subtitle, subtitleFont),
      measureLegendLongestToken(options.note, noteFont)
    );
  const bodyWidth = Math.max(contentWidth, textWidth);
  const maxTextWidth = bodyWidth - margin * 2;
  const header = renderLegendHeader({
    title: options.title,
    subtitle: options.subtitle,
    x: margin,
    y: margin,
    maxWidth: maxTextWidth,
    titleSize,
    subtitleSize,
    fontFamily,
    titleFont,
    subtitleFont
  });
  const maxLabelLineCount = Math.max(
    1,
    ...labelLines.map((lines) => lines.length)
  );
  const rowBodyHeights = items.map((_, index) =>
    Math.max(
      options.minRowHeight ?? 0,
      itemShapeSizes[index] ?? shapeSize,
      lineHeight * maxLabelLineCount
    )
  );
  const startY = margin + header.height + gap;
  let nextRowTop = startY;
  const rows = items.map((item, index) => {
    const x = margin;
    const rowBodyHeight = rowBodyHeights[index] ?? shapeSize;
    const rowTop = nextRowTop;
    nextRowTop += rowBodyHeight + gap;
    const labelX = x + shapeWidth + gap;
    const shape = options.drawShape(
      item,
      x,
      rowTop,
      shapeWidth,
      index,
      rowBodyHeight
    );
    const labelY = shape.labelY ?? rowTop + rowBodyHeight / 2;
    const label = render_label(
      labelLines[index] ?? [],
      labelX,
      labelY,
      lineHeight,
      options.getLabel(item)
    );

    return {
      markup: `${shape.markup}${label}`,
      defs: shape.defs
    };
  });
  const mainBottom = items.length > 0 ? nextRowTop - gap : startY;
  const maxFooterLineCount = Math.max(
    1,
    ...footerLabelLines.map((lines) => lines.length)
  );
  const footerBodyHeights = footerItems.map((_, index) =>
    Math.max(
      footerShapeSizes[index] ?? shapeSize,
      lineHeight * maxFooterLineCount
    )
  );
  const section_gap = Math.max(10, Math.round(fontSize * 0.6));
  const footerStartY =
    footerItems.length > 0 ? mainBottom + section_gap : mainBottom;
  let nextFooterTop = footerStartY;
  const footerRows = footerItems.map((item, index) => {
    const x = margin;
    const footerBodyHeight = footerBodyHeights[index] ?? shapeSize;
    const rowTop = nextFooterTop;
    nextFooterTop += footerBodyHeight + gap;
    const labelX = x + shapeWidth + gap;
    const labelY = rowTop + footerBodyHeight / 2;
    const shape = draw_swatch_shape(
      item,
      footerType,
      x,
      rowTop,
      shapeWidth,
      footerBodyHeight
    );
    const label = render_label(
      footerLabelLines[index] ?? [],
      labelX,
      labelY,
      lineHeight,
      item.label
    );

    return {
      markup: `${shape.markup}${label}`,
      defs: shape.defs
    };
  });
  const footerBottom =
    footerItems.length > 0 ? nextFooterTop - gap : mainBottom;
  const bottom = footerItems.length > 0 ? footerBottom : mainBottom;
  const note = renderLegendNote({
    note: options.note,
    x: margin,
    y: bottom + (options.note ? section_gap : 0),
    maxWidth: maxTextWidth,
    noteSize,
    fontFamily,
    noteFont
  });
  const height = bottom + note.height + margin;
  const defs = rows
    .map((row) => row.defs)
    .concat(footerRows.map((row) => row.defs))
    .filter((def): def is string => Boolean(def))
    .join('');

  return {
    markup: `<g class="${escapeSvgAttribute(options.className)}" font-family="${escapeSvgAttribute(fontFamily)}">
    ${createLegendCanvasRect(bodyWidth, height)}
    ${defs ? `<defs>${defs}</defs>` : ''}
    <g class="items" font-size="${fontSize}" dominant-baseline="middle">
      ${rows.map((row) => row.markup).join('')}
      ${footerRows.map((row) => row.markup).join('')}
    </g>
    ${header.markup}
    ${note.markup}
  </g>`,
    width: bodyWidth,
    height
  };
}

function getSwatchShapeWidth(
  type: KhartisLegendSwatchType,
  shapeSize: number
): number {
  return type === 'line' ? 28 : shapeSize;
}

function draw_swatch_shape(
  item: KhartisLegendSwatchItem,
  type: KhartisLegendSwatchType,
  x: number,
  rowTop: number,
  size: number,
  rowHeight: number
): { markup: string; defs?: string } {
  const y = rowTop + (rowHeight - size) / 2;

  if (type === 'line') {
    return { markup: draw_line(item, x, rowTop + rowHeight / 2, 28) };
  }

  if (type === 'symbol') {
    return draw_symbol(item, x + size / 2, rowTop + rowHeight / 2, size);
  }

  if (type === 'pattern') {
    return draw_pattern_box(item, x, y, size);
  }

  return {
    markup: `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${escapeSvgAttribute(item.fill ?? 'none')}" stroke="${escapeSvgAttribute(item.stroke ?? 'rgba(0, 0, 0, 0.15)')}" stroke-width="${item.strokeWidth ?? 1}" opacity="${normalizeOpacity(item.opacity)}" />`
  };
}

function draw_line(
  item: Partial<KhartisLegendSwatchItem>,
  x: number,
  y: number,
  width: number
): string {
  const dash = item.dashed ? ' stroke-dasharray="5,3"' : '';
  return `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="${escapeSvgAttribute(item.stroke ?? item.fill ?? 'currentColor')}" stroke-width="${Math.max(0.5, item.strokeWidth ?? 2)}" opacity="${normalizeOpacity(item.opacity)}"${dash} stroke-linecap="round" />`;
}

function draw_symbol(
  item: Partial<KhartisLegendSwatchItem>,
  cx: number,
  cy: number,
  size: number
): { markup: string; defs?: string } {
  const scale = Math.max(0.1, (item.size ?? size) / 16);
  const transform = `translate(${cx},${cy}) scale(${scale})`;
  const path = escapeSvgAttribute(item.symbol ?? '');
  const stroke = escapeSvgAttribute(item.stroke ?? 'rgba(0, 0, 0, 0.25)');
  const strokeWidth = item.strokeWidth ?? 0.75;
  const opacity = normalizeOpacity(item.opacity);

  return {
    markup: `<path d="${path}" transform="${transform}" fill="${escapeSvgAttribute(item.fill ?? 'none')}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`
  };
}

function draw_pattern_box(
  item: KhartisLegendSwatchItem,
  x: number,
  y: number,
  size: number
): { markup: string; defs?: string } {
  const fill = escapeSvgAttribute(item.fill ?? '#ffffff');
  const stroke = escapeSvgAttribute(item.stroke ?? 'rgba(0, 0, 0, 0.15)');
  const strokeWidth = item.strokeWidth ?? 1;
  const baseRect = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  if (!item.patternFill) {
    return { markup: baseRect };
  }

  return {
    defs: item.patternFill.defs,
    markup: `${baseRect}<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${escapeSvgAttribute(item.patternFill.fillUrl)}" opacity="${item.patternOpacity ?? PATTERN_OVERLAY_OPACITY}" stroke="none" />`
  };
}

function render_label(
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  label?: string
): string {
  if (lines.length <= 1) {
    return `<text x="${x}" y="${y}">${escapeSvgText(lines[0] ?? '')}</text>`;
  }

  const accessibleName = label ?? lines.join(' ');

  return `<text aria-label="${escapeSvgAttribute(accessibleName)}">${lines
    .map((line, index) => {
      const lineY = y + (index - (lines.length - 1) / 2) * lineHeight;
      return `<tspan x="${x}" y="${lineY}">${escapeSvgText(line)}</tspan>`;
    })
    .join('')}</text>`;
}

function normalizeOpacity(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }

  return Math.max(0, Math.min(1, value));
}
