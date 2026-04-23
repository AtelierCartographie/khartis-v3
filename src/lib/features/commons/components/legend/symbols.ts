import Textbox from '@borgar/textbox';
import { extent, ticks as d3_ticks } from 'd3-array';
import { draw_categorical_legend } from './categorical';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  filter_candidates_by_distances,
  linearScale,
  magnitude,
  resolveLegendFontFamily,
  round_extreme,
  sqrtScale,
  type CommonLegendTextOptions,
  type ScaleFn
} from './utils';

export type SymbolType = 'circle' | 'square' | 'bar' | 'spike' | 'text';

export interface SymbolsLegendOptions extends CommonLegendTextOptions {
  type?: SymbolType;
  size?: number;
  bar_width?: number;
  fill?: string;
  stroke?: string;
  plus_color?: string;
  less_color?: string;
  nodata?: boolean;
  nodataLabel?: string;
}

interface GetTicksOptions {
  scale: ScaleFn;
  minGap: number;
  min: number;
  max: number;
}

export function draw_symbols_legend(
  data: ArrayLike<number>,
  options: SymbolsLegendOptions = {}
): string {
  const {
    type = 'circle',
    size = 40,
    bar_width: initial_bar_width = 12,
    title = null,
    subtitle = null,
    note = null,
    fontSize = 12,
    fontFamily,
    fill = 'none',
    stroke = 'currentColor',
    plus_color = 'coral',
    less_color = 'cadetblue',
    nodata = false
  } = options;
  const bar_width =
    type === 'spike' ? initial_bar_width * 2 : initial_bar_width;
  const resolvedFontFamily = resolveLegendFontFamily(fontFamily);
  const titleSize = title ? Math.round(fontSize * 1.16) : 0;
  const subtitleSize = subtitle ? fontSize : 0;
  const noteSize = note ? Math.round(fontSize * 0.92) : 0;
  let values_array: number[] = Array.isArray(data) ? data : Array.from(data);
  values_array = values_array.map(Number).filter(Number.isFinite);
  const initial_extent = extent(values_array);

  if (!initial_extent[0] && initial_extent[0] !== 0) {
    return empty_symbol_legend(fontSize, resolvedFontFamily);
  }

  let [min, max] = initial_extent as [number, number];
  const cross_zero = min < 0 && max > 0;
  const all_negative = min < 0 && max <= 0;
  const label_sign = all_negative ? -1 : 1;
  let box_sign_legend: string | null = null;

  if (cross_zero || all_negative) {
    values_array = values_array.map(Math.abs);
    [min, max] = extent(values_array) as [number, number];
  }

  const sorted_data = values_array.slice().sort((a, b) => a - b);

  if (cross_zero) {
    box_sign_legend = draw_categorical_legend(
      [
        { label: '+', fill: plus_color },
        { label: '-', fill: less_color }
      ],
      {
        type: 'box',
        fontSize,
        fontFamily: resolvedFontFamily
      }
    );
  }

  const scale =
    type !== 'bar' && type !== 'spike'
      ? sqrtScale([0, max], [0, size])
      : linearScale([0, max], [0, size]);
  const minGap = fontSize * 0.8;
  const ticks = get_ticks(sorted_data, { scale, minGap, min, max });
  const values = ticks.reverse().map(scale);
  const x_max = type !== 'bar' && type !== 'spike' ? values[0] : bar_width;
  const y_max = values[0];
  const is_min_alone = values[values.length - 1] <= 1.5;
  const margin = 10;
  const header_gap = 3;
  const label_gap = 5;
  const label_safety_padding = Math.max(6, Math.round(fontSize * 0.6));
  const font = createLegendFont({ fontSize, fontFamily: resolvedFontFamily });
  const max_symbol_width = margin + x_max * 2 + 20;
  const label_widths = ticks
    .map((d) => d * label_sign)
    .map((d) => Textbox.measureText(d.toLocaleString(), font));
  const max_label_width = Math.max(...label_widths) + label_safety_padding;
  const nodata_dash_width = 6;
  const nodata_label = options.nodataLabel ?? 'No data';
  const nodata_dash_x = type === 'circle' ? y_max + margin : margin;
  const nodata_label_x = nodata_dash_x + nodata_dash_width + 15;
  const nodata_label_width = nodata
    ? Textbox.measureText(nodata_label, font) + label_safety_padding
    : 0;
  const main_body_width = max_symbol_width + max_label_width + margin;
  const nodata_body_width = nodata
    ? nodata_label_x + nodata_label_width + margin
    : 0;
  const width = Math.max(main_body_width, nodata_body_width);
  const label_anchor_x = width - margin;
  const max_text_width = width - margin * 2;
  const title_font = createLegendFont({
    fontSize: titleSize,
    fontFamily: resolvedFontFamily,
    weight: 'bold'
  });
  const subtitle_font = createLegendFont({
    fontSize: subtitleSize,
    fontFamily: resolvedFontFamily
  });
  const note_font = createLegendFont({
    fontSize: noteSize,
    fontFamily: resolvedFontFamily
  });
  const title_lines = title
    ? wrap_text_symbols(title, title_font, max_text_width)
    : [];
  const subtitle_lines = subtitle
    ? wrap_text_symbols(subtitle, subtitle_font, max_text_width)
    : [];
  const note_lines = note
    ? wrap_text_symbols(note, note_font, max_text_width)
    : [];
  const actual_header_height =
    (title_lines.length > 0
      ? title_lines.length * (titleSize * 1.2) + header_gap
      : 0) +
    (subtitle_lines.length > 0
      ? subtitle_lines.length * (subtitleSize * 1.2) + header_gap
      : 0);
  const title_margin_bottom = Math.max(15, fontSize);
  const bottom_symbols =
    margin + actual_header_height + title_margin_bottom + y_max * 2;
  const bottom_min_alone = bottom_symbols + 10;
  const symbols_bottom = is_min_alone ? bottom_min_alone : bottom_symbols;
  const nodata_gap = 10;
  const nodata_section_height = nodata ? nodata_gap + fontSize : 0;
  const note_gap = 8;
  const note_section_height =
    note_lines.length > 0 ? note_gap + note_lines.length * (noteSize * 1.2) : 0;
  const height =
    symbols_bottom + margin + nodata_section_height + note_section_height;
  const { symbols, links, labels } = create_symbols();

  return create_svg_markup(symbols, links, labels);

  function create_symbols(): {
    symbols: string[];
    links: string[];
    labels: string[];
  } {
    const symbols: string[] = [];
    const links: string[] = [];
    const labels: string[] = [];
    const r = y_max;
    const x = type === 'circle' ? r + margin : margin;
    const x_link = x + bar_width / 2;
    const last = values.length - 1;

    values.forEach((d, i) => {
      const end_link = label_anchor_x - label_widths[i] - label_gap;
      if (i === last && d <= 1.5) {
        symbols.push(symbol(type, x, bottom_min_alone, d, bar_width));
        links.push(
          link(x_link, bottom_min_alone - d, end_link, bottom_min_alone - d)
        );
        labels.push(
          label(label_anchor_x, bottom_min_alone - d, ticks[i] * label_sign)
        );
      } else {
        symbols.push(symbol(type, x, bottom_symbols, d, bar_width));
        links.push(
          link(x_link, bottom_symbols - d * 2, end_link, bottom_symbols - d * 2)
        );
        labels.push(
          label(label_anchor_x, bottom_symbols - d * 2, ticks[i] * label_sign)
        );
      }
    });

    return { symbols, links, labels };
  }

  function create_svg_markup(
    symbols: string[],
    links: string[],
    labels: string[]
  ): string {
    const safeFontFamily = escapeSvgAttribute(resolvedFontFamily);
    let header_markup = '';
    let y_cursor = margin;

    if (title_lines.length > 0) {
      const line_h = titleSize * 1.2;
      header_markup += `<g class="title" text-anchor="start" dominant-baseline="hanging" font-size="${titleSize}" font-weight="bold">`;
      title_lines.forEach((line, i) => {
        header_markup += `<text x="${margin}" y="${y_cursor + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      header_markup += `</g>`;
      y_cursor += title_lines.length * line_h + header_gap;
    }

    if (subtitle_lines.length > 0) {
      const line_h = subtitleSize * 1.2;
      header_markup += `<g class="subtitle" text-anchor="start" dominant-baseline="hanging" font-size="${subtitleSize}">`;
      subtitle_lines.forEach((line, i) => {
        header_markup += `<text x="${margin}" y="${y_cursor + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      header_markup += `</g>`;
    }

    let nodata_markup = '';
    if (nodata) {
      const nodata_y = symbols_bottom + margin + nodata_gap;
      const dash_y = nodata_y - fontSize / 2;
      nodata_markup = `<g class="nodata">
        <line x1="${nodata_dash_x - nodata_dash_width / 2}" y1="${dash_y}" x2="${nodata_dash_x + nodata_dash_width / 2}" y2="${dash_y}" stroke="black" stroke-width="1"/>
        <path d="M${nodata_dash_x + nodata_dash_width / 2},${dash_y}L${nodata_label_x - label_gap},${dash_y}" fill="none" stroke="currentColor" stroke-width="0.5" stroke-dasharray="3,2"/>
        <text x="${nodata_label_x}" y="${dash_y}" text-anchor="start" font-size="${fontSize}" font-variant="tabular-nums">${escapeSvgText(nodata_label)}</text>
      </g>`;
    }

    let note_markup = '';
    if (note_lines.length > 0) {
      const note_y = symbols_bottom + margin + nodata_section_height + note_gap;
      const line_h = noteSize * 1.2;
      note_markup += `<g class="note" text-anchor="start" dominant-baseline="hanging" font-size="${noteSize}">`;
      note_lines.forEach((line, i) => {
        note_markup += `<text x="${margin}" y="${note_y + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      note_markup += `</g>`;
    }

    return `<g class="symbol_legend" font-family="${safeFontFamily}">
      ${createLegendCanvasRect(width, height)}
      <g class="symbols" fill="${escapeSvgAttribute(fill)}" stroke="${escapeSvgAttribute(stroke)}">
        ${symbols.join('')}
      </g>
      <g class="links" fill="none" stroke="currentColor" stroke-width="0.5" stroke-miterlimit="1" stroke-dasharray="3,2">
        ${links.join('')}
      </g>
      <g class="labels" text-anchor="end" font-size="${fontSize}" font-variant="tabular-nums">
        ${labels.join('')}
      </g>
      ${header_markup}
      ${nodata_markup}
      ${note_markup}
      <g class="sign_legend" transform="translate(${0},${height})">
        ${cross_zero ? box_sign_legend : ''}
      </g>
    </g>`;
  }
}

function get_ticks(sorted_data: number[], options: GetTicksOptions): number[] {
  const { scale, minGap, max } = options;
  const { min } = options;
  const max_rounded = round_extreme(sorted_data, max, 'max');
  const min_rounded = round_extreme(sorted_data, min, 'min');
  let candidates: number[] = [];
  const mag_min = magnitude(min);
  const mag_max = magnitude(max);

  if (min === 0) {
    mag_min.order = Math.sign(max);
    mag_min.integers = 1;
  }

  if (mag_max.integers === 0 && mag_min.integers === 0) {
    return [min_rounded, max_rounded];
  }

  const diff_mag = mag_max.integers - mag_min.integers;
  switch (diff_mag) {
    case 0:
      candidates = d3_ticks(min, max, 5);
      break;
    default:
      for (let i = 0; i <= diff_mag; ++i) {
        candidates.push(mag_min.order * Math.pow(10, i));
        candidates.push(mag_min.order * Math.pow(10, i) * 5);
      }
  }

  candidates = candidates.filter((d) => d > min && d < max);

  const half_minGap = minGap / 2;
  const lower_limit = scale(min) <= 1.5 ? 0 : scale(min) + half_minGap;
  const max_candidates = candidates.length;
  let n_ticks = 4;
  let ticks: number[];

  do {
    let upper_limit = scale(max);
    ticks = filter_candidates_by_distances(sorted_data, candidates, n_ticks);
    ticks = ticks
      .reverse()
      .filter(
        (d) =>
          scale(d) + half_minGap <= upper_limit &&
          scale(d) >= lower_limit &&
          Boolean((upper_limit = scale(d)))
      );
    n_ticks++;
  } while (ticks.length < 2 && n_ticks < max_candidates);

  return [min_rounded, ...ticks.reverse(), max_rounded];
}

function symbol(
  type: SymbolType,
  x: number,
  y: number,
  r: number,
  bar_width: number
): string {
  switch (type) {
    case 'circle':
      return `<circle cx="${x}" cy="${y - r}" r="${r}" />`;
    case 'square':
      return `<rect x="${x}" y="${y - r * 2}" width="${r * 2}" height="${r * 2}" />`;
    case 'bar':
      return `<rect x="${x}" y="${y - r * 2}" width="${bar_width}" height="${r * 2}" />`;
    case 'spike': {
      const [x2, y2] = [x + bar_width / 2, y - r * 2];
      return `<path d="M${x},${y}L${x2},${y2}L${x + bar_width},${y}" />`;
    }
    case 'text': {
      const bu = (r * 2) / 7;
      const y0 = y - bu * 7;
      return `<path d="M ${x} ${y0} h${bu * 5} v${bu} h${-bu * 2} v${bu * 6} h${-bu} v${-bu * 6} h${-bu * 2} v${-bu} Z" />`;
    }
  }
}

function link(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M${x1},${y1}L${x2},${y2}" />`;
}

function label(x: number, y: number, text: number): string {
  return `<text x="${x}" y="${y}">${escapeSvgText(text.toLocaleString())}</text>`;
}

function wrap_text_symbols(
  text: string,
  font: string,
  maxWidth: number
): string[] {
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

function empty_symbol_legend(fontSize: number, fontFamily?: string): string {
  const width = fontSize * 2;
  const height = fontSize * 2;
  return `<g class="symbol_legend" font-family="${escapeSvgAttribute(resolveLegendFontFamily(fontFamily))}">${createLegendCanvasRect(width, height)}</g>`;
}
