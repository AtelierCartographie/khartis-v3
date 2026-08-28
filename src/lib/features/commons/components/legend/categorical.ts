import Textbox from '@borgar/textbox';
import { PATTERN_OVERLAY_OPACITY } from '$lib/features/commons/constants/pattern.constants';
import type { LegendPatternFill } from './khartis-extensions';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  renderLegendHeader,
  renderLegendNote,
  resolveLegendFontFamily,
  type CommonLegendTextOptions,
  type LegendSvgDefinition
} from './utils';

export type CategoricalShapeType = 'box' | 'line' | 'symbol';
export type CategoricalFooterShapeType = CategoricalShapeType | 'pattern';

export interface CategoryItem {
  label: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  symbol?: string | null;
  size?: number;
  patternFill?: LegendPatternFill | null;
  patternOpacity?: number;
}

export interface CategoricalLegendOptions extends CommonLegendTextOptions {
  type?: CategoricalFooterShapeType;
  footerItems?: CategoryItem[];
  footerType?: CategoricalFooterShapeType;
}

interface CategoryWithLayout extends CategoryItem {
  width: number;
  nb_lines: number;
  lines: string[];
  x_index: number;
  y_index: number;
  x: number;
  y: number;
}

interface ColumnInfo {
  index: number;
  width: number;
  x: number;
}

function measureLongestToken(value: string | null, font: string): number {
  if (!value) return 0;

  return Math.max(
    0,
    ...value
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => Math.ceil(Textbox.measureText(token, font)))
  );
}

export function draw_categorical_legend(
  raw_categories: CategoryItem[],
  options: CategoricalLegendOptions = {}
): LegendSvgDefinition {
  let { type, title, subtitle, note, fontSize } = options;
  type ??= 'box';
  title ??= null;
  subtitle ??= null;
  note ??= null;
  fontSize ??= 12;
  const resolvedFontFamily = resolveLegendFontFamily(options.fontFamily);

  const footerItems = options.footerItems ?? [];
  const footerType = options.footerType ?? type;
  const titleSize = title ? Math.round(fontSize * 1.16) : 0;
  const subtitleSize = subtitle ? fontSize : 0;
  const noteSize = note ? Math.round(fontSize * 0.92) : 0;
  const line_height = fontSize * 1.2;
  const font = createLegendFont({
    fontSize,
    lineHeight: line_height,
    fontFamily: resolvedFontFamily
  });
  const marginValue = Math.max(10, Math.round(fontSize * 0.6));
  const margin = {
    top: marginValue,
    right: marginValue,
    bottom: marginValue,
    left: marginValue
  };
  const box_dim = Math.round(fontSize * 1.25);
  const box = { h: box_dim, w: type === 'line' ? box_dim * 1.5 : box_dim };
  const footerBox = {
    h: box_dim,
    w: footerType === 'line' ? box_dim * 1.5 : box_dim
  };
  const gap = Math.max(8, Math.round(fontSize * 0.6));
  const gutter = Math.max(16, Math.round(fontSize * 1.2));
  let label_width = Math.round(fontSize * 15);
  const items_nb = raw_categories.length;
  const column_nb = items_nb <= 4 ? 1 : items_nb <= 8 ? 2 : 3;

  label_width = adjust_label_width(raw_categories, label_width);

  const text_box = new Textbox({
    font,
    width: label_width,
    height: line_height * 2
  });

  const categories: CategoryWithLayout[] = raw_categories.map((d, i) => {
    const line_break = text_box.linebreak(d.label);
    const nb_lines = line_break.length;
    const lines = line_break.map((segment) => segment.join(''));
    const { x_index, y_index } = get_xy_index(i);

    return {
      ...d,
      width: line_break.width,
      nb_lines,
      lines,
      x_index,
      y_index,
      x: 0,
      y: 0
    };
  });

  let x_col = 0;
  const columns_width: ColumnInfo[] = [...Array(column_nb)]
    .map((_d, i) => i)
    .map((i) => {
      const current_col = categories.filter((d) => d.x_index === i);
      const max_label_width =
        current_col.length > 0
          ? Math.max(...current_col.map((d) => d.width))
          : 0;
      const width = Math.ceil(box.w + gap + max_label_width);
      const x = x_col + gutter * i;
      x_col += width;
      return { index: i, width, x };
    });

  const last_column = columns_width[column_nb - 1] ?? {
    index: 0,
    width: 0,
    x: 0
  };
  const category_body_width =
    margin.left + last_column.x + last_column.width + margin.right;
  const footer_lines = footerItems.map((item) => {
    const maxLineCount = Math.max(
      2,
      item.label.trim().split(/\s+/).filter(Boolean).length
    );
    return new Textbox({
      font,
      width: label_width,
      height: line_height * maxLineCount
    }).linebreak(item.label);
  });
  const maxLabelLineCount = Math.max(
    1,
    ...categories.map((item) => item.nb_lines)
  );
  const row_body_height = Math.max(box.h, line_height * maxLabelLineCount);
  const row_step = row_body_height + gap;
  const maxFooterLineCount = Math.max(
    1,
    ...footer_lines.map((lineBreak) => lineBreak.length)
  );
  const footer_body_height = Math.max(
    footerBox.h,
    line_height * maxFooterLineCount
  );
  const footer_row_step = footer_body_height + gap;
  const footer_label_width =
    footer_lines.length > 0
      ? Math.max(...footer_lines.map((lineBreak) => lineBreak.width))
      : 0;
  const footer_body_width =
    footerItems.length > 0
      ? margin.left + footerBox.w + gap + footer_label_width + margin.right
      : 0;
  const header_gap = 3;
  const title_font = createLegendFont({
    fontSize: titleSize,
    fontFamily: resolvedFontFamily,
    lineHeight: titleSize * 1.2,
    weight: 'bold'
  });
  const subtitle_font = createLegendFont({
    fontSize: subtitleSize,
    fontFamily: resolvedFontFamily,
    lineHeight: subtitleSize * 1.2
  });
  const note_font = createLegendFont({
    fontSize: noteSize,
    fontFamily: resolvedFontFamily,
    lineHeight: noteSize * 1.2
  });
  const body_width = Math.max(
    category_body_width,
    footer_body_width,
    margin.left +
      Math.max(
        measureLongestToken(title, title_font),
        measureLongestToken(subtitle, subtitle_font),
        measureLongestToken(note, note_font)
      ) +
      margin.right
  );
  const max_text_width = body_width - margin.left - margin.right;
  const header = renderLegendHeader({
    title,
    subtitle,
    x: margin.left,
    y: margin.top,
    maxWidth: max_text_width,
    titleSize,
    subtitleSize,
    fontFamily: resolvedFontFamily,
    gap: header_gap,
    titleFont: title_font,
    subtitleFont: subtitle_font
  });
  const y_start = margin.top + header.height + gap * 2;
  categories.forEach((d) => {
    const x = margin.left + columns_width[d.x_index].x;
    const y = y_start + d.y_index * row_step;
    d.x = x;
    d.y = y;
  });

  const boxes = categories.map((d) =>
    create_shape(
      type,
      d.x,
      d.y,
      box.w,
      box.h,
      d.fill,
      d.stroke,
      d.strokeWidth,
      d.symbol,
      d.size,
      d.patternFill,
      d.patternOpacity
    )
  );
  const labels = categories.map((d) =>
    create_label(d.x + box.w, d.y, row_body_height, line_height, d)
  );
  const categories_bottom =
    categories.length > 0
      ? y_start +
        (Math.max(...categories.map((item) => item.y_index)) + 1) * row_step -
        gap
      : y_start;
  const section_gap = Math.max(10, Math.round(fontSize * 0.6));
  const footer_start =
    footerItems.length > 0
      ? categories_bottom + section_gap
      : categories_bottom;
  const footerBoxes = footerItems.map((item, index) =>
    create_shape(
      footerType,
      margin.left,
      footer_start + index * footer_row_step,
      footerBox.w,
      footerBox.h,
      item.fill,
      item.stroke,
      item.strokeWidth,
      item.symbol,
      item.size,
      item.patternFill,
      item.patternOpacity
    )
  );
  const footerLabels = footerItems.map((item, index) =>
    create_label(
      margin.left + footerBox.w,
      footer_start + index * footer_row_step,
      footer_body_height,
      line_height,
      {
        ...item,
        width: footer_lines[index]?.width ?? 0,
        nb_lines: footer_lines[index]?.length ?? 1,
        lines: footer_lines[index]?.map((segment) => segment.join('')) ?? [
          item.label
        ],
        x_index: 0,
        y_index: index,
        x: margin.left,
        y: footer_start + index * footer_row_step
      }
    )
  );
  const footer_bottom =
    footerItems.length > 0
      ? footer_start + footerItems.length * footer_row_step - gap
      : categories_bottom;
  const content_bottom =
    footerItems.length > 0 ? footer_bottom : categories_bottom;
  const noteBlock = renderLegendNote({
    note,
    x: margin.left,
    y: content_bottom + section_gap,
    maxWidth: max_text_width,
    noteSize,
    fontFamily: resolvedFontFamily,
    noteFont: note_font
  });
  const note_section_height =
    noteBlock.height > 0 ? section_gap + noteBlock.height : 0;
  const width = body_width;
  const height = content_bottom + note_section_height + margin.bottom;

  return create_svg_markup(
    [...boxes, ...footerBoxes],
    [...labels, ...footerLabels]
  );

  function adjust_label_width(
    categories: CategoryItem[],
    width: number
  ): number {
    const widths = categories.map((d) =>
      Math.ceil(Textbox.measureText(d.label, font))
    );
    const is_one_line_only = widths.every((d) => d < width);

    if (is_one_line_only === false) {
      const { label } = categories[widths.indexOf(Math.max(...widths))];
      const text_box = new Textbox({ font, width, height: line_height * 2 });
      let lo = 0;
      let hi = width;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        text_box.width(mid);
        if (text_box.linebreak(label).hasOverflow) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      return lo;
    }

    return width;
  }

  function get_xy_index(i: number): { x_index: number; y_index: number } {
    let x_index: number;
    let y_index: number;
    switch (column_nb) {
      case 1:
        x_index = 0;
        y_index = i;
        break;
      case 2: {
        const nb_items_col = Math.round(items_nb / 2);
        x_index = i < nb_items_col ? 0 : 1;
        y_index = i % nb_items_col;
        break;
      }
      case 3: {
        const c1 = Math.ceil(items_nb / 3);
        const c2 = Math.ceil((items_nb - c1) / 2);
        const c1c2 = c1 + c2;
        x_index = i < c1 ? 0 : i < c1c2 ? 1 : 2;
        y_index = i < c1 ? i : i < c1c2 ? i - c1 : i - c1c2;
        break;
      }
      default:
        x_index = 0;
        y_index = i;
    }
    return { x_index, y_index };
  }

  function create_svg_markup(
    boxes: string[],
    labels: string[]
  ): LegendSvgDefinition {
    const dx = gap;
    const safeFontFamily = escapeSvgAttribute(resolvedFontFamily);

    return {
      markup: `<g class="categorical_legend" font-family="${safeFontFamily}">
      ${createLegendCanvasRect(width, height)}
      <g class="box">
        ${boxes.join('')}
      </g>
      <g class="labels" text-anchor="start" dominant-baseline="middle" font-size="${fontSize}" transform="translate(${dx},0)">
        ${labels.join('')}
      </g>
      ${header.markup}
      ${noteBlock.markup}
    </g>`,
      width,
      height
    };
  }
}

function create_shape(
  type: CategoricalFooterShapeType,
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
  symbol?: string | null,
  size?: number,
  patternFill?: LegendPatternFill | null,
  patternOpacity?: number
): string {
  const safeFill = escapeSvgAttribute(fill ?? 'none');
  const safeStroke = escapeSvgAttribute(stroke ?? 'none');
  const safeStrokeWidth = Number.isFinite(strokeWidth) ? strokeWidth : 0;

  switch (type) {
    case 'box':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${safeStrokeWidth}" />`;
    case 'line': {
      const y1 = y + height / 2;
      const y2 = y1;
      return `<line x1="${x}" y1="${y1}" x2="${x + width}" y2="${y2}" stroke="${safeStroke || safeFill}" stroke-width="${safeStrokeWidth}" />`;
    }
    case 'symbol': {
      const [cx, cy] = [x + width / 2, y + height / 2];
      const scale = size && size > 0 ? ` scale(${size / height})` : '';
      const transform = `translate(${cx},${cy})${scale}`;
      const path = escapeSvgAttribute(symbol ?? '');

      return `<path d="${path}" transform="${transform}" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${safeStrokeWidth}" />`;
    }
    case 'pattern': {
      const baseRect = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${safeStrokeWidth}" />`;
      if (!patternFill) {
        return baseRect;
      }

      return `<defs>${patternFill.defs}</defs>${baseRect}<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeSvgAttribute(patternFill.fillUrl)}" opacity="${patternOpacity ?? PATTERN_OVERLAY_OPACITY}" stroke="none" />`;
    }
  }
}

function create_label(
  x: number,
  y: number,
  rowHeight: number,
  dy: number,
  text: CategoryWithLayout
): string {
  const centerY = y + rowHeight / 2;

  if (text.nb_lines === 1) {
    return `<text x="${x}" y="${centerY}">${escapeSvgText(text.lines[0] ?? '')}</text>`;
  }

  return `<text aria-label="${escapeSvgAttribute(text.label)}">${text.lines
    .map((d, i) => {
      const lineY = centerY + (i - (text.nb_lines - 1) / 2) * dy;
      return `<tspan x="${x}" y="${lineY}">${escapeSvgText(d)}</tspan>`;
    })
    .join('')}</text>`;
}
