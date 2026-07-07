import Textbox from '@borgar/textbox';
import { PATTERN_OVERLAY_OPACITY } from '$lib/features/commons/constants/pattern.constants';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  renderLegendHeader,
  renderLegendNote,
  resolveLegendFontFamily,
  wrapLegendText,
  type CommonLegendTextOptions,
  type LegendSvgDefinition
} from './utils';

export type KhartisLegendSwatchType = 'box' | 'line' | 'symbol' | 'pattern';
export type KhartisDoubleSymbolPosition =
  'overlay' | 'juxtaposition' | 'division';

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

export interface KhartisDoubleSymbolsLegendStep {
  label: string;
  size: number;
  symbol: string;
  fill: string;
  secondaryFill: string;
  stroke?: string;
  opacity?: number;
  positionMode?: KhartisDoubleSymbolPosition;
}

export interface KhartisDoubleSymbolsLegendOptions extends CommonLegendTextOptions {
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

export function draw_khartis_double_symbols_legend(
  steps: KhartisDoubleSymbolsLegendStep[],
  options: KhartisDoubleSymbolsLegendOptions = {}
): LegendSvgDefinition {
  const shapeWidth = getDoubleSymbolShapeWidth(steps);

  return draw_row_legend({
    ...options,
    className: 'khartis_double_symbol_legend',
    items: steps,
    getLabel: (step) => step.label,
    shapeWidth,
    minRowHeight: Math.max(
      18,
      ...steps.map((step) => getDoubleSymbolRadius(step.size) * 2)
    ),
    footerItems: options.footerItems,
    footerType: options.footerType,
    drawShape: (step, x, rowTop, _size, _index, rowHeight) => {
      const radius = getDoubleSymbolRadius(step.size);
      const mode = step.positionMode ?? 'overlay';
      const pairWidth = getDoubleSymbolPairWidth(step);
      const left = x + (shapeWidth - pairWidth) / 2;
      const baselinePadding = 1;
      const cy = rowTop + rowHeight - radius - baselinePadding;
      const firstX = left + radius;
      const secondX =
        mode === 'juxtaposition' ? left + radius * 2 + 8 : left + radius * 2;
      const first = draw_symbol(
        {
          symbol: step.symbol,
          fill: step.fill,
          stroke: step.stroke,
          opacity: step.opacity,
          size: radius
        },
        firstX,
        cy,
        radius * 2
      );
      const second = draw_symbol(
        {
          symbol: step.symbol,
          fill: step.secondaryFill,
          stroke: step.stroke,
          opacity: step.opacity,
          size: radius
        },
        secondX,
        cy,
        radius * 2
      );

      return {
        markup: `<g class="double-symbol-pair" data-position-mode="${escapeSvgAttribute(mode)}">${first}${second}</g>`,
        labelY: cy
      };
    }
  });
}

function getDoubleSymbolRadius(size: number): number {
  return Math.max(4, Math.min(12, size));
}

function getDoubleSymbolPairWidth(
  step: KhartisDoubleSymbolsLegendStep
): number {
  const radius = getDoubleSymbolRadius(step.size);
  const mode = step.positionMode ?? 'overlay';

  return mode === 'juxtaposition' ? radius * 3 + 8 : radius * 3;
}

function getDoubleSymbolShapeWidth(
  steps: KhartisDoubleSymbolsLegendStep[]
): number {
  return Math.max(38, ...steps.map((step) => getDoubleSymbolPairWidth(step)));
}

function draw_row_legend<T>(options: RowLegendOptions<T>): LegendSvgDefinition {
  const fontSize = options.fontSize ?? 12;
  const fontFamily = resolveLegendFontFamily(options.fontFamily);
  const titleSize = options.title ? Math.round(fontSize * 1.16) : 0;
  const subtitleSize = options.subtitle ? fontSize : 0;
  const noteSize = options.note ? Math.round(fontSize * 0.92) : 0;
  const lineHeight = fontSize * 1.2;
  const font = createLegendFont({ fontSize, lineHeight, fontFamily });
  const margin = Math.max(10, Math.round(fontSize * 0.6));
  const gap = Math.max(8, Math.round(fontSize * 0.6));
  const shapeSize = Math.round(fontSize * 1.25);
  const footerType = options.footerType ?? 'box';
  const footerItems = options.footerItems ?? [];
  const shapeWidth = Math.max(
    options.shapeWidth ?? shapeSize,
    footerItems.length > 0 ? getSwatchShapeWidth(footerType, shapeSize) : 0
  );
  const labelWidth = Math.round(fontSize * 15);
  const labelLines = options.items.map((item) =>
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
  const bodyWidth = margin + shapeWidth + gap + measuredLabelWidth + margin;
  const maxTextWidth = bodyWidth - margin * 2;
  const header = renderLegendHeader({
    title: options.title,
    subtitle: options.subtitle,
    x: margin,
    y: margin,
    maxWidth: maxTextWidth,
    titleSize,
    subtitleSize,
    fontFamily
  });
  const maxLabelLineCount = Math.max(
    1,
    ...labelLines.map((lines) => lines.length)
  );
  const rowBodyHeight = Math.max(
    options.minRowHeight ?? 0,
    shapeSize,
    lineHeight * maxLabelLineCount
  );
  const rowStep = rowBodyHeight + gap;
  const startY = margin + header.height + gap;
  const rows = options.items.map((item, index) => {
    const x = margin;
    const rowTop = startY + index * rowStep;
    const labelX = x + shapeWidth + gap;
    const shape = options.drawShape(
      item,
      x,
      rowTop,
      shapeSize,
      index,
      rowBodyHeight
    );
    const labelY = shape.labelY ?? rowTop + rowBodyHeight / 2;
    const label = render_label(
      labelLines[index] ?? [],
      labelX,
      labelY,
      lineHeight
    );

    return {
      markup: `${shape.markup}${label}`,
      defs: shape.defs
    };
  });
  const mainBottom =
    options.items.length > 0
      ? startY + options.items.length * rowStep - gap
      : startY;
  const maxFooterLineCount = Math.max(
    1,
    ...footerLabelLines.map((lines) => lines.length)
  );
  const footerBodyHeight = Math.max(shapeSize, lineHeight * maxFooterLineCount);
  const footerRowStep = footerBodyHeight + gap;
  const section_gap = Math.max(10, Math.round(fontSize * 0.6));
  const footerStartY =
    footerItems.length > 0 ? mainBottom + section_gap : mainBottom;
  const footerRows = footerItems.map((item, index) => {
    const x = margin;
    const rowTop = footerStartY + index * footerRowStep;
    const labelX = x + shapeWidth + gap;
    const labelY = rowTop + footerBodyHeight / 2;
    const shape = draw_swatch_shape(
      item,
      footerType,
      x,
      rowTop,
      shapeSize,
      footerBodyHeight
    );
    const label = render_label(
      footerLabelLines[index] ?? [],
      labelX,
      labelY,
      lineHeight
    );

    return {
      markup: `${shape.markup}${label}`,
      defs: shape.defs
    };
  });
  const footerBottom =
    footerItems.length > 0
      ? footerStartY + footerItems.length * footerRowStep - gap
      : mainBottom;
  const bottom = footerItems.length > 0 ? footerBottom : mainBottom;
  const note = renderLegendNote({
    note: options.note,
    x: margin,
    y: bottom + (options.note ? section_gap : 0),
    maxWidth: maxTextWidth,
    noteSize,
    fontFamily
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
    return {
      markup: draw_symbol(item, x + size / 2, rowTop + rowHeight / 2, size)
    };
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
): string {
  const scale = Math.max(0.1, (item.size ?? size) / 16);
  return `<path d="${escapeSvgAttribute(item.symbol ?? '')}" transform="translate(${cx},${cy}) scale(${scale})" fill="${escapeSvgAttribute(item.fill ?? 'none')}" stroke="${escapeSvgAttribute(item.stroke ?? 'rgba(0, 0, 0, 0.25)')}" stroke-width="${item.strokeWidth ?? 0.75}" opacity="${normalizeOpacity(item.opacity)}" />`;
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
  lineHeight: number
): string {
  if (lines.length <= 1) {
    return `<text x="${x}" y="${y}">${escapeSvgText(lines[0] ?? '')}</text>`;
  }

  return `<text>${lines
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
