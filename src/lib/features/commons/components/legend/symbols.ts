import { m } from '$lib/paraglide/messages';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import Textbox from '@borgar/textbox';
import { extent, ticks as d3_ticks } from 'd3-array';
import { SYMBOL_SDF_EXTENT } from '$lib/features/commons/constants/visualization.constants';

import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  fill_candidates_by_proximity,
  linearScale,
  magnitude,
  measureLegendLongestToken,
  renderLegendHeader,
  renderLegendNote,
  resolveLegendFontFamily,
  round_extreme,
  scaleLegendMetric,
  sqrtScale,
  type CommonLegendTextOptions,
  type LegendSvgDefinition,
  type ScaleFn
} from './utils';

export type SymbolType = 'circle' | 'square' | 'bar' | 'spike' | 'text';

// Mirror the map's square SDF ratio so legend squares match rendered symbols.
const SQUARE_SIDE_RATIO = 0.6 / SYMBOL_SDF_EXTENT;

export interface LegendColorSwatch {
  color: string;
  label: string;
}

export interface SymbolsLegendOptions extends CommonLegendTextOptions {
  type?: SymbolType;
  size?: number;
  bar_width?: number;
  fill?: string;
  stroke?: string;
  plus_color?: string;
  less_color?: string;
  /**
   * Colour boxes drawn under the graduated symbols. Cross-zero data supplies
   * the +/- pair; double proportional symbols on a shared scale supply one box
   * per variable, which is what tells the reader which colour is which.
   */
  colorSwatches?: LegendColorSwatch[];
  nodata?: boolean;
  nodataLabel?: string;
}

interface GetTicksOptions {
  scale: ScaleFn;
  spacing: number;
  min: number;
  max: number;
}

export function draw_symbols_legend(
  data: ArrayLike<number>,
  options: SymbolsLegendOptions = {}
): LegendSvgDefinition {
  const {
    type = 'circle',
    size = 40,
    bar_width: initial_bar_width = 8,
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
    type === 'spike' ? Math.round(initial_bar_width * 1.5) : initial_bar_width;
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

  if (cross_zero || all_negative) {
    values_array = values_array.map(Math.abs);
    [min, max] = extent(values_array) as [number, number];
  }

  const sorted_data = values_array.slice().sort((a, b) => a - b);

  const scale =
    type !== 'bar' && type !== 'spike'
      ? sqrtScale([0, max], [0, size])
      : linearScale([0, max], [0, size]);
  const spacing = symbolLabelSpacing(type, fontSize);
  let ticks = get_ticks(sorted_data, { scale, spacing, min, max });
  ticks = removeOverlappingSymbolTicks(ticks, scale, spacing);
  const values = ticks.reverse().map(scale);
  const x_max = type !== 'bar' && type !== 'spike' ? values[0] : bar_width;
  const y_max = values[0];
  const is_min_alone = values[values.length - 1] <= 1.5;
  const margin = scaleLegendMetric(10, fontSize);
  const header_gap = 3;
  const label_gap = scaleLegendMetric(10, fontSize);
  const label_safety_padding = scaleLegendMetric(7, fontSize);
  const font = createLegendFont({ fontSize, fontFamily: resolvedFontFamily });
  const sign_box_dim = Math.round(fontSize * 1.25);
  const sign_row_inner_gap = scaleLegendMetric(4, fontSize);
  const color_swatches: LegendColorSwatch[] =
    options.colorSwatches ??
    (cross_zero
      ? [
          { color: plus_color, label: '+' },
          { color: less_color, label: '−' }
        ]
      : []);
  const has_color_swatches = color_swatches.length > 0;
  const sign_label_max_width = has_color_swatches
    ? Math.max(
        ...color_swatches.map((swatch) =>
          Textbox.measureText(swatch.label, font)
        )
      ) + label_safety_padding
    : 0;
  const sign_legend_body_width = has_color_swatches
    ? margin + sign_box_dim + label_gap + sign_label_max_width + margin
    : 0;
  const sign_legend_section_height = has_color_swatches
    ? color_swatches.length * sign_box_dim +
      (color_swatches.length - 1) * sign_row_inner_gap
    : 0;
  const max_symbol_width =
    type !== 'bar' && type !== 'spike'
      ? margin + x_max * 2 + 20
      : margin + x_max + 20;
  const label_widths = ticks
    .map((d) => d * label_sign)
    .map((d) => Textbox.measureText(formatValue(d), font));
  const max_label_width = Math.max(...label_widths) + label_safety_padding;
  const nodata_dash_width = scaleLegendMetric(10, fontSize);
  const nodata_label = options.nodataLabel ?? m.legend_no_data_label();
  const nodata_dash_x = type === 'circle' ? y_max + margin : margin;
  const nodata_label_x = nodata_dash_x + nodata_dash_width + 15;
  const nodata_label_width = nodata
    ? Textbox.measureText(nodata_label, font) + label_safety_padding
    : 0;
  const main_body_width = max_symbol_width + max_label_width + margin;
  const nodata_body_width = nodata
    ? nodata_label_x + nodata_label_width + margin
    : 0;
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
  const text_body_width =
    margin * 2 +
    Math.max(
      measureLegendLongestToken(title, title_font),
      measureLegendLongestToken(subtitle, subtitle_font),
      measureLegendLongestToken(note, note_font)
    );
  const width = Math.max(
    main_body_width,
    nodata_body_width,
    sign_legend_body_width,
    text_body_width
  );
  const label_anchor_x = width - margin;
  const max_text_width = width - margin * 2;
  const header = renderLegendHeader({
    title,
    subtitle,
    x: margin,
    y: margin,
    maxWidth: max_text_width,
    titleSize,
    subtitleSize,
    fontFamily: resolvedFontFamily,
    gap: header_gap,
    titleFont: title_font,
    subtitleFont: subtitle_font
  });
  const title_margin_bottom = scaleLegendMetric(15, fontSize);
  const bottom_symbols =
    margin + header.height + title_margin_bottom + y_max * 2;
  const bottom_min_alone = bottom_symbols + 10;
  const symbols_bottom = is_min_alone ? bottom_min_alone : bottom_symbols;
  const section_gap = scaleLegendMetric(10, fontSize);
  const sign_legend_y = has_color_swatches
    ? symbols_bottom + section_gap
    : symbols_bottom;
  const sign_legend_bottom = has_color_swatches
    ? sign_legend_y + sign_legend_section_height
    : symbols_bottom;
  const nodata_section_height = nodata ? section_gap + fontSize : 0;
  const noteBlock = renderLegendNote({
    note,
    x: margin,
    y: sign_legend_bottom + nodata_section_height + section_gap,
    maxWidth: max_text_width,
    noteSize,
    fontFamily: resolvedFontFamily,
    noteFont: note_font
  });
  const note_section_height =
    noteBlock.height > 0 ? section_gap + noteBlock.height : 0;
  const height =
    sign_legend_bottom + nodata_section_height + note_section_height + margin;
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
    const symbol_height = (d: number): number =>
      type === 'square' ? d * 2 * SQUARE_SIDE_RATIO : d * 2;

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
        const top = bottom_symbols - symbol_height(d);
        symbols.push(symbol(type, x, bottom_symbols, d, bar_width));
        links.push(link(x_link, top, end_link, top));
        labels.push(label(label_anchor_x, top, ticks[i] * label_sign));
      }
    });

    return { symbols, links, labels };
  }

  function create_svg_markup(
    symbols: string[],
    links: string[],
    labels: string[]
  ): LegendSvgDefinition {
    const safeFontFamily = escapeSvgAttribute(resolvedFontFamily);

    let nodata_markup = '';
    if (nodata) {
      const dash_y = sign_legend_bottom + section_gap + fontSize / 2;
      nodata_markup = `<g class="nodata">
        <line x1="${nodata_dash_x - nodata_dash_width / 2}" y1="${dash_y}" x2="${nodata_dash_x + nodata_dash_width / 2}" y2="${dash_y}" stroke="black" stroke-width="1"/>
        <path d="M${nodata_dash_x + nodata_dash_width / 2},${dash_y}L${nodata_label_x - label_gap},${dash_y}" fill="none" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3,2"/>
        <text x="${nodata_label_x}" y="${dash_y}" text-anchor="start" font-size="${fontSize}" font-variant="tabular-nums" dominant-baseline="middle">${escapeSvgText(nodata_label)}</text>
      </g>`;
    }

    let sign_legend_markup = '';
    if (has_color_swatches) {
      const sign_box_x = margin;
      const sign_label_x = sign_box_x + sign_box_dim + label_gap;
      const rows = color_swatches
        .map((swatch, index) => {
          const row_y =
            sign_legend_y + index * (sign_box_dim + sign_row_inner_gap);
          return `<rect x="${sign_box_x}" y="${row_y}" width="${sign_box_dim}" height="${sign_box_dim}" fill="${escapeSvgAttribute(swatch.color)}" />
        <text x="${sign_label_x}" y="${row_y + sign_box_dim / 2}" text-anchor="start" dominant-baseline="middle">${escapeSvgText(swatch.label)}</text>`;
        })
        .join('');
      sign_legend_markup = `<g class="sign_legend" font-size="${fontSize}">
        ${rows}
      </g>`;
    }

    return {
      markup: `<g class="symbol_legend" font-family="${safeFontFamily}">
      ${createLegendCanvasRect(width, height)}
      <g class="symbols" fill="${escapeSvgAttribute(fill)}" stroke="${escapeSvgAttribute(stroke)}">
        ${symbols.join('')}
      </g>
      <g class="links" fill="none" stroke="currentColor" stroke-width="0.75" stroke-miterlimit="1" stroke-dasharray="3,2">
        ${links.join('')}
      </g>
      <g class="labels" text-anchor="end" font-size="${fontSize}" font-variant="tabular-nums">
        ${labels.join('')}
      </g>
      ${header.markup}
      ${sign_legend_markup}
      ${nodata_markup}
      ${noteBlock.markup}
    </g>`,
      width,
      height
    };
  }
}

// Circles and squares grow away from the baseline on both sides, so a step of the scale moves
// their label twice as far as a bar's.
function symbolLabelSpacing(type: SymbolType, fontSize: number): number {
  const multiplier =
    type === 'square'
      ? 2 * SQUARE_SIDE_RATIO
      : type !== 'bar' && type !== 'spike'
        ? 2
        : 1;

  return (fontSize * 1.2) / multiplier;
}

function removeOverlappingSymbolTicks(
  ticks: number[],
  scale: ScaleFn,
  spacing: number
): number[] {
  if (ticks.length <= 1) return ticks;

  const result: number[] = [];

  for (let i = ticks.length - 1; i >= 0; i--) {
    if (result.length === 0) {
      result.push(ticks[i]);
      continue;
    }

    const lastKept = result[result.length - 1];

    if (Math.abs(scale(lastKept) - scale(ticks[i])) >= spacing) {
      result.push(ticks[i]);
    }
  }

  return result.reverse();
}

function get_ticks(sorted_data: number[], options: GetTicksOptions): number[] {
  const { scale, spacing, max } = options;
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

  const lowest = scale(min_rounded);
  const ticks = fill_candidates_by_proximity(sorted_data, candidates, {
    position: scale,
    spacing,
    blockers: [min_rounded, max_rounded],
    lower_limit: lowest <= 1.5 ? 0 : lowest
  });

  return [min_rounded, ...ticks, max_rounded];
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
    case 'square': {
      const side = r * 2 * SQUARE_SIDE_RATIO;
      return `<rect x="${x}" y="${y - side}" width="${side}" height="${side}" />`;
    }
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
  return `<text x="${x}" y="${y}">${escapeSvgText(formatValue(text))}</text>`;
}

function empty_symbol_legend(
  fontSize: number,
  fontFamily?: string
): LegendSvgDefinition {
  const width = fontSize * 2;
  const height = fontSize * 2;
  return {
    markup: `<g class="symbol_legend" font-family="${escapeSvgAttribute(resolveLegendFontFamily(fontFamily))}">${createLegendCanvasRect(width, height)}</g>`,
    width,
    height
  };
}
