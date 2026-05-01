import Textbox from '@borgar/textbox';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  resolveLegendFontFamily,
  type CommonLegendTextOptions
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
  patternUrl?: string | null;
}

export interface CategoricalLegendOptions extends CommonLegendTextOptions {
  type?: CategoricalShapeType;
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

export function draw_categorical_legend(
  raw_categories: CategoryItem[],
  options: CategoricalLegendOptions = {}
): string {
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
  const margin = { top: 12, right: 12, bottom: 12, left: 12 };
  const box_dim = Math.round(fontSize * 1.25);
  const box = { h: box_dim, w: type === 'line' ? box_dim * 1.5 : box_dim };
  const footerBox = {
    h: box_dim,
    w: footerType === 'line' ? box_dim * 1.5 : box_dim
  };
  const gap = Math.max(6, Math.round(fontSize * 0.5));
  const gutter = 24;
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
  const footer_lines = footerItems.map((item) =>
    text_box.linebreak(item.label)
  );
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
  const body_width = Math.max(category_body_width, footer_body_width);
  const max_text_width = body_width - margin.left - margin.right;
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
  const title_lines = title
    ? wrap_text_cat(title, title_font, max_text_width)
    : [];
  const subtitle_lines = subtitle
    ? wrap_text_cat(subtitle, subtitle_font, max_text_width)
    : [];
  const note_lines = note ? wrap_text_cat(note, note_font, max_text_width) : [];
  const actual_header_height =
    (title_lines.length > 0
      ? title_lines.length * (titleSize * 1.2) + header_gap
      : 0) +
    (subtitle_lines.length > 0
      ? subtitle_lines.length * (subtitleSize * 1.2) + header_gap
      : 0);
  const y_start = margin.top + actual_header_height + gap * 2;
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
      d.patternUrl
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
  const footer_start =
    footerItems.length > 0
      ? categories_bottom + Math.max(3, gap)
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
      item.patternUrl,
      `categorical-legend-footer-pattern-${index}`
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
  const note_gap = 8;
  const note_section_height =
    note_lines.length > 0 ? note_gap + note_lines.length * (noteSize * 1.2) : 0;
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

  function create_svg_markup(boxes: string[], labels: string[]): string {
    const dx = gap;
    const safeFontFamily = escapeSvgAttribute(resolvedFontFamily);
    let header_markup = '';
    let y_cursor = margin.top;

    if (title_lines.length > 0) {
      const line_h = titleSize * 1.2;
      header_markup += `<g class="title" text-anchor="start" dominant-baseline="hanging" font-size="${titleSize}" font-weight="bold">`;
      title_lines.forEach((line, i) => {
        header_markup += `<text x="${margin.left}" y="${y_cursor + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      header_markup += `</g>`;
      y_cursor += title_lines.length * line_h + header_gap;
    }

    if (subtitle_lines.length > 0) {
      const line_h = subtitleSize * 1.2;
      header_markup += `<g class="subtitle" text-anchor="start" dominant-baseline="hanging" font-size="${subtitleSize}">`;
      subtitle_lines.forEach((line, i) => {
        header_markup += `<text x="${margin.left}" y="${y_cursor + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      header_markup += `</g>`;
    }

    let note_markup = '';
    if (note_lines.length > 0) {
      const note_y = content_bottom + note_gap;
      const line_h = noteSize * 1.2;
      note_markup += `<g class="note" text-anchor="start" dominant-baseline="hanging" font-size="${noteSize}">`;
      note_lines.forEach((line, i) => {
        note_markup += `<text x="${margin.left}" y="${note_y + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      note_markup += `</g>`;
    }

    return `<g class="categorical_legend" font-family="${safeFontFamily}">
      ${createLegendCanvasRect(width, height)}
      <g class="box">
        ${boxes.join('')}
      </g>
      <g class="labels" text-anchor="start" dominant-baseline="middle" font-size="${fontSize}" transform="translate(${dx},0)">
        ${labels.join('')}
      </g>
      ${header_markup}
      ${note_markup}
    </g>`;
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
  patternUrl?: string | null,
  patternId?: string
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
      return `<path d="${escapeSvgAttribute(symbol ?? '')}" transform="translate(${cx},${cy})${scale}" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${safeStrokeWidth}" />`;
    }
    case 'pattern': {
      const id = patternId ?? 'categorical-legend-pattern';
      const url = sanitizeDataImageUrl(patternUrl);
      if (!url) {
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${safeFill}" stroke="${safeStroke}" stroke-width="${safeStrokeWidth}" />`;
      }

      return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${safeFill}" /><image href="${url}" width="${width}" height="${height}" preserveAspectRatio="none" /></pattern></defs><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id})" stroke="${safeStroke}" stroke-width="${safeStrokeWidth}" />`;
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
    return `<text x="${x}" y="${centerY}">${escapeSvgText(text.lines[0]?.toLocaleString() ?? '')}</text>`;
  }

  return `<text>${text.lines
    .map((d, i) => {
      const lineY = centerY + (i - (text.nb_lines - 1) / 2) * dy;
      return `<tspan x="${x}" y="${lineY}">${escapeSvgText(d.toLocaleString())}</tspan>`;
    })
    .join('')}</text>`;
}

function wrap_text_cat(text: string, font: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = words[0] ?? '';

  for (let i = 1; i < words.length; i++) {
    const candidate = `${currentLine} ${words[i]}`;
    if (Textbox.measureText(candidate, font) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
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
