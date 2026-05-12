import Textbox from '@borgar/textbox';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  resolveLegendFontFamily,
  type CommonLegendTextOptions
} from './utils';

export type KhartisLegendSwatchType = 'box' | 'line' | 'symbol' | 'pattern';
export type KhartisDoubleSymbolPosition =
  | 'overlay'
  | 'juxtaposition'
  | 'division';

export interface KhartisLegendSwatchItem {
  label: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  symbol?: string | null;
  size?: number;
  patternUrl?: string | null;
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
): string {
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
    drawShape: (item, x, rowTop, size, index, rowHeight) =>
      draw_swatch_shape(item, type, x, rowTop, size, index, rowHeight)
  });
}

export function draw_khartis_line_width_legend(
  steps: KhartisLineWidthLegendStep[],
  options: KhartisLineWidthLegendOptions = {}
): string {
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
): string {
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
): string {
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

function draw_row_legend<T>(options: RowLegendOptions<T>): string {
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
    wrap_text(options.getLabel(item), font, labelWidth).slice(0, 2)
  );
  const footerLabelLines = footerItems.map((item) =>
    wrap_text(item.label, font, labelWidth).slice(0, 2)
  );
  const measuredLabelWidth = Math.max(
    0,
    ...[...labelLines, ...footerLabelLines]
      .flat()
      .map((line) => Textbox.measureText(line, font))
  );
  const bodyWidth = margin + shapeWidth + gap + measuredLabelWidth + margin;
  const maxTextWidth = bodyWidth - margin * 2;
  const header = render_header(
    options,
    margin,
    margin,
    maxTextWidth,
    titleSize,
    subtitleSize,
    fontFamily
  );
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
      options.items.length + index,
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
  const note = render_note(
    options.note,
    margin,
    bottom + (options.note ? section_gap : 0),
    maxTextWidth,
    noteSize,
    fontFamily
  );
  const height = bottom + note.height + margin;
  const defs = rows
    .map((row) => row.defs)
    .concat(footerRows.map((row) => row.defs))
    .filter((def): def is string => Boolean(def))
    .join('');

  return `<g class="${escapeSvgAttribute(options.className)}" font-family="${escapeSvgAttribute(fontFamily)}">
    ${createLegendCanvasRect(bodyWidth, height)}
    ${defs ? `<defs>${defs}</defs>` : ''}
    <g class="items" font-size="${fontSize}" dominant-baseline="middle">
      ${rows.map((row) => row.markup).join('')}
      ${footerRows.map((row) => row.markup).join('')}
    </g>
    ${header.markup}
    ${note.markup}
  </g>`;
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
  index: number,
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
    return draw_pattern_box(item, x, y, size, index);
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
  size: number,
  index: number
): { markup: string; defs?: string } {
  const id = `khartis-legend-pattern-${index}`;
  const fill = escapeSvgAttribute(item.fill ?? '#ffffff');
  const url = sanitizeDataImageUrl(item.patternUrl);

  if (!url) {
    return {
      markup: `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" stroke="${escapeSvgAttribute(item.stroke ?? 'rgba(0, 0, 0, 0.15)')}" stroke-width="${item.strokeWidth ?? 1}" />`
    };
  }

  return {
    defs: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${fill}" /><image href="${url}" width="${size}" height="${size}" preserveAspectRatio="none" /></pattern>`,
    markup: `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="url(#${id})" stroke="${escapeSvgAttribute(item.stroke ?? 'rgba(0, 0, 0, 0.15)')}" stroke-width="${item.strokeWidth ?? 1}" />`
  };
}

function render_header(
  options: CommonLegendTextOptions,
  x: number,
  y: number,
  maxWidth: number,
  titleSize: number,
  subtitleSize: number,
  fontFamily: string
): { markup: string; height: number } {
  const headerGap = 3;
  let markup = '';
  let cursor = y;

  if (options.title) {
    const lines = wrap_text(
      options.title,
      createLegendFont({
        fontSize: titleSize,
        fontFamily,
        weight: 'bold'
      }),
      maxWidth
    );
    const lineHeight = titleSize * 1.2;
    markup += `<g class="title" text-anchor="start" dominant-baseline="hanging" font-size="${titleSize}" font-weight="bold">`;
    lines.forEach((line, index) => {
      markup += `<text x="${x}" y="${cursor + index * lineHeight}">${escapeSvgText(line)}</text>`;
    });
    markup += `</g>`;
    cursor += lines.length * lineHeight + headerGap;
  }

  if (options.subtitle) {
    const lines = wrap_text(
      options.subtitle,
      createLegendFont({ fontSize: subtitleSize, fontFamily }),
      maxWidth
    );
    const lineHeight = subtitleSize * 1.2;
    markup += `<g class="subtitle" text-anchor="start" dominant-baseline="hanging" font-size="${subtitleSize}">`;
    lines.forEach((line, index) => {
      markup += `<text x="${x}" y="${cursor + index * lineHeight}">${escapeSvgText(line)}</text>`;
    });
    markup += `</g>`;
    cursor += lines.length * lineHeight + headerGap;
  }

  return { markup, height: Math.max(0, cursor - y) };
}

function render_note(
  note: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number,
  noteSize: number,
  fontFamily: string
): { markup: string; height: number } {
  if (!note) {
    return { markup: '', height: 0 };
  }

  const lines = wrap_text(
    note,
    createLegendFont({ fontSize: noteSize, fontFamily }),
    maxWidth
  );
  const lineHeight = noteSize * 1.2;
  let markup = `<g class="note" text-anchor="start" dominant-baseline="hanging" font-size="${noteSize}">`;
  lines.forEach((line, index) => {
    markup += `<text x="${x}" y="${y + index * lineHeight}">${escapeSvgText(line)}</text>`;
  });
  markup += `</g>`;

  return { markup, height: lines.length * lineHeight };
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

function wrap_text(text: string, font: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = words[0] ?? '';

  for (let index = 1; index < words.length; index++) {
    const candidate = `${currentLine} ${words[index]}`;
    if (Textbox.measureText(candidate, font) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = words[index];
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function normalizeOpacity(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }

  return Math.max(0, Math.min(1, value));
}

function sanitizeDataImageUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (
    /^data:image\/(?:png|webp|jpeg|svg\+xml);base64,[a-z0-9+/=]+$/i.test(value)
  ) {
    return escapeSvgAttribute(value);
  }

  return null;
}
