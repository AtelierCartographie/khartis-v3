import { m } from '$lib/paraglide/messages';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import Textbox from '@borgar/textbox';
import type { LegendPatternFill } from './khartis-extensions';
import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  linearScale,
  measureLegendLongestToken,
  renderLegendHeader,
  renderLegendNote,
  resolveLegendFontFamily,
  scaleLegendMetric,
  type CommonLegendTextOptions,
  type LegendSvgDefinition
} from './utils';

/**
 * The mark drawn in each class cell. Polygons fill the cell; lines cross it
 * with their stroke, so neighbouring classes read as one graduated line;
 * symbols sit in the middle of it.
 */
export type QuantiColorSwatch =
  | { type: 'box' }
  | { type: 'line'; strokeWidth: number; dashed?: boolean }
  | {
      type: 'symbol';
      path: string;
      outline?: boolean;
      nodataPath?: string;
    };

export interface QuantiColorLegendOptions extends CommonLegendTextOptions {
  swatch?: QuantiColorSwatch;
  /** Gives each class a length proportional to its share of the value range. */
  variable_width?: boolean;
  orientation?: 'horizontal' | 'vertical';
  /** Vertical bars only: the lowest class at the bottom, like a thermometer. */
  lowAtBottom?: boolean;
  nodata?: boolean;
  nodataLabel?: string;
  nodataFill?: string;
  nodataPatternFill?: LegendPatternFill | null;
  classPatternFills?: (LegendPatternFill | null)[];
  /** Draws each class as a colored outline, as for a classed stroke. */
  outlineWidth?: number;
  /** Opacity of the class color, as the map applies it. */
  opacity?: number;
}

const DEFAULT_NODATA_FILL = NEUTRAL_CARTOGRAPHY_COLORS.missingData;

export function draw_quanti_color_legend(
  thresholds: number[],
  colors: string[],
  options: QuantiColorLegendOptions = {}
): LegendSvgDefinition {
  if (options.orientation === 'vertical') {
    return draw_vertical_quanti_color_legend(thresholds, colors, options);
  }

  let { variable_width, title, subtitle, note, fontSize, nodata } = options;
  const classPatternFills = options.classPatternFills;
  const swatch: QuantiColorSwatch = options.swatch ?? { type: 'box' };
  variable_width ??= false;
  title ??= null;
  subtitle ??= null;
  note ??= null;
  fontSize ??= 12;
  nodata ??= false;
  const resolvedFontFamily = resolveLegendFontFamily(options.fontFamily);

  const titleSize = title ? Math.round(fontSize * 1.16) : 0;
  const subtitleSize = subtitle ? fontSize : 0;
  const noteSize = note ? Math.round(fontSize * 0.92) : 0;
  const nb_boxes = thresholds.length - 1;
  const index = thresholds.slice().map((_d, i) => i);
  const x_domain = variable_width ? thresholds : index;
  let x: number[] = [];
  const font = createLegendFont({ fontSize, fontFamily: resolvedFontFamily });
  const labels_length = thresholds.map((d) =>
    Textbox.measureText(formatValue(d), font)
  );
  const label_gap = scaleLegendMetric(10, fontSize);
  const label_safety_padding = scaleLegendMetric(7, fontSize);
  const margin = scaleLegendMetric(10, fontSize);
  const margin_top = margin;
  const margin_left = margin + labels_length[0] / 2;
  const margin_right = margin + labels_length[nb_boxes] / 2;
  const box_height = scaleLegendMetric(15, fontSize);
  const tick_gap = scaleLegendMetric(5, fontSize);
  const header_gap = scaleLegendMetric(3, fontSize);
  const labels_fit = (positions: number[]): boolean =>
    positions.every(
      (_position, i) =>
        i + 1 >= positions.length ||
        labels_length[i] / 2 + labels_length[i + 1] / 2 + label_gap <=
          positions[i + 1] - positions[i]
    );
  const positions_for = (width: number): number[] => {
    const x_scale = linearScale(
      [x_domain[0], x_domain[nb_boxes]],
      [margin_left, width * nb_boxes + margin_left]
    );
    return x_domain.map(x_scale);
  };

  // Every discretization threshold stays labelled on a single row, so the class
  // boxes widen until no two labels collide. Proportional boxes keep their
  // share of the value range, and only a class too narrow for its labels is
  // pushed open.
  let box_width = scaleLegendMetric(40, fontSize);
  if (variable_width) {
    x = spread_positions(
      positions_for(box_width),
      thresholds
        .slice(1)
        .map(
          (_d, i) => labels_length[i] / 2 + labels_length[i + 1] / 2 + label_gap
        )
    );
  } else {
    x = positions_for(box_width);
    while (!labels_fit(x)) {
      box_width += 1;
      x = positions_for(box_width);
    }
  }
  const boxes_width = x[nb_boxes] - x[0];

  const scale_body_width = margin_left + boxes_width + margin_right;
  const section_gap = scaleLegendMetric(10, fontSize);
  const nodata_box_h = box_height;
  const nodata_box_w = Math.round(fontSize * 2);
  const nodata_label = options.nodataLabel ?? m.legend_no_data_label();
  const nodata_body_width = nodata
    ? margin_left +
      nodata_box_w +
      label_gap +
      Textbox.measureText(nodata_label, font) +
      label_safety_padding +
      margin
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
  const body_width = Math.max(
    scale_body_width,
    nodata_body_width,
    margin_left +
      Math.max(
        measureLegendLongestToken(title, title_font),
        measureLegendLongestToken(subtitle, subtitle_font),
        measureLegendLongestToken(note, note_font)
      ) +
      margin
  );
  const max_text_width = body_width - margin_left - margin;
  const header = renderLegendHeader({
    title,
    subtitle,
    x: margin_left,
    y: margin_top,
    maxWidth: max_text_width,
    titleSize,
    subtitleSize,
    fontFamily: resolvedFontFamily,
    gap: header_gap,
    titleFont: title_font,
    subtitleFont: subtitle_font
  });
  const actual_box_top = margin_top + header.height + tick_gap;
  const actual_tick_end = actual_box_top + box_height + tick_gap;
  const actual_labels_bottom = actual_tick_end + tick_gap + fontSize;
  const nodata_section_height = nodata
    ? section_gap + nodata_box_h + tick_gap
    : 0;
  const noteBlock = renderLegendNote({
    note,
    x: margin_left,
    y: actual_labels_bottom + nodata_section_height + section_gap,
    maxWidth: max_text_width,
    noteSize,
    fontFamily: resolvedFontFamily,
    noteFont: note_font
  });
  const actual_note_height =
    noteBlock.height > 0 ? section_gap + noteBlock.height : 0;
  const width = body_width;
  const height =
    actual_labels_bottom +
    nodata_section_height +
    actual_note_height +
    margin_top;
  const boxes = index.slice(0, -1).map((d, i) => {
    const patternFill = classPatternFills?.[d];
    if (patternFill) {
      return pattern_box(
        x[i],
        actual_box_top,
        x[i + 1] - x[i],
        box_height,
        patternFill
      );
    }

    if (swatch.type !== 'box') {
      return {
        markup: swatch_cell(
          swatch,
          x[i],
          actual_box_top,
          x[i + 1] - x[i],
          box_height,
          colors[d],
          options.opacity
        )
      };
    }

    if (options.outlineWidth) {
      return {
        markup: outline_box(
          x[i],
          actual_box_top,
          x[i + 1] - x[i],
          box_height,
          colors[d],
          options.outlineWidth,
          options.opacity
        )
      };
    }

    return {
      markup: box(
        x[i],
        actual_box_top,
        x[i + 1] - x[i],
        box_height,
        colors[d],
        options.opacity
      )
    };
  });
  const boxesDefs = boxes
    .map((entry) => entry.defs)
    .filter((defs): defs is string => Boolean(defs))
    .join('');
  const ticks = x
    .slice(1, -1)
    .map((d) => tick(d, actual_box_top, actual_tick_end));
  const labels = x.map((d, i) => label(d, actual_tick_end, thresholds[i]));

  return create_svg_markup(
    boxes.map((entry) => entry.markup),
    ticks,
    labels
  );

  function create_svg_markup(
    boxesMarkup: string[],
    ticks: string[],
    labels: string[]
  ): LegendSvgDefinition {
    const safeFontFamily = escapeSvgAttribute(resolvedFontFamily);

    let nodata_markup = '';
    let nodata_defs = '';
    if (nodata) {
      const nodata_y = actual_labels_bottom + section_gap;
      const nodata_label_x = margin_left + nodata_box_w + label_gap;
      const nodata_fill = options.nodataFill ?? DEFAULT_NODATA_FILL;
      const nodata_box =
        swatch.type !== 'box'
          ? {
              markup: swatch_cell(
                swatch.type === 'symbol' && swatch.nodataPath
                  ? { ...swatch, path: swatch.nodataPath, outline: false }
                  : swatch,
                margin_left,
                nodata_y,
                nodata_box_w,
                nodata_box_h,
                nodata_fill
              )
            }
          : options.nodataPatternFill
            ? pattern_box(
                margin_left,
                nodata_y,
                nodata_box_w,
                nodata_box_h,
                options.nodataPatternFill,
                nodata_fill
              )
            : {
                markup: box(
                  margin_left,
                  nodata_y,
                  nodata_box_w,
                  nodata_box_h,
                  nodata_fill
                )
              };
      nodata_defs = nodata_box.defs ?? '';
      nodata_markup = `<g class="nodata" stroke="none">
        ${nodata_box.markup}
        <text x="${nodata_label_x}" y="${nodata_y + nodata_box_h / 2}" dominant-baseline="central" font-size="${fontSize}">${escapeSvgText(nodata_label)}</text>
      </g>`;
    }

    return {
      markup: `<g class="quantitative_legend" font-family="${safeFontFamily}">
      ${createLegendCanvasRect(width, height)}
      ${boxesDefs || nodata_defs ? `<defs>${boxesDefs}${nodata_defs}</defs>` : ''}
      <g class="box" stroke="none">
        ${boxesMarkup.join('')}
      </g>
      <g class="ticks" stroke="black">
        ${ticks.join('')}
      </g>
      <g class="labels" text-anchor="middle" dominant-baseline="hanging" font-size="${fontSize}"
         font-variant="tabular-nums" transform="translate(0,${tick_gap})">
        ${labels.join('')}
      </g>
      ${header.markup}
      ${nodata_markup}
      ${noteBlock.markup}
    </g>`,
      width,
      height
    };
  }
}

// Positions keep their order and spacing but open up wherever two labels would
// otherwise be closer than their minimum gap.
function spread_positions(positions: number[], min_gaps: number[]): number[] {
  const spread = positions.slice(0, 1);
  for (let i = 1; i < positions.length; i++) {
    const previous = spread[i - 1];
    const shift = previous - positions[i - 1];
    spread.push(
      Math.max(positions[i] + shift, previous + (min_gaps[i - 1] ?? 0))
    );
  }
  return spread;
}

function draw_vertical_quanti_color_legend(
  thresholds: number[],
  colors: string[],
  options: QuantiColorLegendOptions
): LegendSvgDefinition {
  const fontSize = options.fontSize ?? 12;
  const title = options.title ?? null;
  const subtitle = options.subtitle ?? null;
  const note = options.note ?? null;
  const nodata = options.nodata ?? false;
  const swatch: QuantiColorSwatch = options.swatch ?? { type: 'box' };
  const resolvedFontFamily = resolveLegendFontFamily(options.fontFamily);
  const titleSize = title ? Math.round(fontSize * 1.16) : 0;
  const subtitleSize = subtitle ? fontSize : 0;
  const noteSize = note ? Math.round(fontSize * 0.92) : 0;
  const nb_boxes = thresholds.length - 1;
  const font = createLegendFont({ fontSize, fontFamily: resolvedFontFamily });
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
  const margin = scaleLegendMetric(10, fontSize);
  const header_gap = scaleLegendMetric(3, fontSize);
  const tick_gap = scaleLegendMetric(5, fontSize);
  const label_gap = scaleLegendMetric(8, fontSize);
  const section_gap = scaleLegendMetric(10, fontSize);
  const cell_width = scaleLegendMetric(22, fontSize);
  const label_spacing = fontSize * 1.2 + scaleLegendMetric(2, fontSize);
  const base_cell_height = Math.max(
    label_spacing,
    scaleLegendMetric(22, fontSize)
  );
  const labels = thresholds.map((value) => formatValue(value));
  const label_width = Math.max(
    0,
    ...labels.map((label) => Textbox.measureText(label, font))
  );
  const nodata_label = options.nodataLabel ?? m.legend_no_data_label();
  const nodata_label_width = nodata
    ? Textbox.measureText(nodata_label, font)
    : 0;
  const scale_body_width =
    margin + cell_width + tick_gap * 2 + label_width + margin;
  const nodata_body_width = nodata
    ? margin + cell_width + label_gap + nodata_label_width + margin
    : 0;
  const body_width = Math.max(
    scale_body_width,
    nodata_body_width,
    margin * 2 +
      Math.max(
        measureLegendLongestToken(title, title_font),
        measureLegendLongestToken(subtitle, subtitle_font),
        measureLegendLongestToken(note, note_font)
      )
  );
  const max_text_width = body_width - margin * 2;
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
  // The end labels are centred on the bar ends, so half a line sticks out.
  const bar_top = margin + header.height + tick_gap + fontSize / 2;

  // Offsets from the low end of the bar, one per threshold.
  const domain = options.variable_width
    ? thresholds
    : thresholds.map((_value, index) => index);
  const offset_scale = linearScale(
    [domain[0], domain[nb_boxes]],
    [0, base_cell_height * nb_boxes]
  );
  const offsets = spread_positions(
    domain.map(offset_scale),
    thresholds.slice(1).map(() => label_spacing)
  );
  const bar_height = offsets[nb_boxes] - offsets[0];
  const low_at_bottom = options.lowAtBottom ?? true;
  const y_of = (index: number): number =>
    low_at_bottom
      ? bar_top + bar_height - (offsets[index] - offsets[0])
      : bar_top + (offsets[index] - offsets[0]);

  const cells = thresholds.slice(0, -1).map((_value, i) => {
    const top = Math.min(y_of(i), y_of(i + 1));
    const height = Math.abs(y_of(i + 1) - y_of(i));
    const patternFill = options.classPatternFills?.[i];
    if (patternFill) {
      return pattern_box(margin, top, cell_width, height, patternFill);
    }
    if (swatch.type === 'line') {
      // The classes read as one graduated line running down the bar.
      return {
        markup: swatch_cell(
          swatch,
          margin,
          top,
          cell_width,
          height,
          colors[i],
          options.opacity,
          'vertical'
        )
      };
    }
    if (swatch.type !== 'box') {
      const mark_height = Math.min(height, scaleLegendMetric(15, fontSize));
      return {
        markup: swatch_cell(
          swatch,
          margin,
          top + (height - mark_height) / 2,
          cell_width,
          mark_height,
          colors[i],
          options.opacity
        )
      };
    }
    if (options.outlineWidth) {
      return {
        markup: outline_box(
          margin,
          top,
          cell_width,
          height,
          colors[i],
          options.outlineWidth,
          options.opacity
        )
      };
    }
    return {
      markup: box(margin, top, cell_width, height, colors[i], options.opacity)
    };
  });
  // As on the horizontal bar, inner thresholds cross the bar and stick out
  // towards their label; the two ends need no tick.
  const tick_x2 = margin + cell_width + tick_gap;
  const ticks = thresholds
    .slice(1, -1)
    .map((_value, i) => y_of(i + 1))
    .map((y) => `<path d="M${margin},${y}L${tick_x2},${y}" />`);
  const label_markup = thresholds.map(
    (_value, i) =>
      `<text x="${tick_x2 + tick_gap}" y="${y_of(i)}">${escapeSvgText(labels[i])}</text>`
  );
  const bar_bottom = bar_top + bar_height + fontSize / 2;

  let nodata_markup = '';
  let nodata_defs = '';
  let nodata_bottom = bar_bottom;
  if (nodata) {
    const nodata_h = scaleLegendMetric(15, fontSize);
    const nodata_y = bar_bottom + section_gap;
    const nodata_fill = options.nodataFill ?? DEFAULT_NODATA_FILL;
    const nodata_box =
      swatch.type !== 'box'
        ? {
            markup: swatch_cell(
              swatch.type === 'symbol' && swatch.nodataPath
                ? { ...swatch, path: swatch.nodataPath, outline: false }
                : swatch,
              margin,
              nodata_y,
              cell_width,
              nodata_h,
              nodata_fill
            )
          }
        : options.nodataPatternFill
          ? pattern_box(
              margin,
              nodata_y,
              cell_width,
              nodata_h,
              options.nodataPatternFill,
              nodata_fill
            )
          : {
              markup: box(margin, nodata_y, cell_width, nodata_h, nodata_fill)
            };
    nodata_defs = nodata_box.defs ?? '';
    nodata_markup = `<g class="nodata" stroke="none">
        ${nodata_box.markup}
        <text x="${margin + cell_width + label_gap}" y="${nodata_y + nodata_h / 2}" dominant-baseline="central" font-size="${fontSize}">${escapeSvgText(nodata_label)}</text>
      </g>`;
    nodata_bottom = nodata_y + nodata_h;
  }

  const noteBlock = renderLegendNote({
    note,
    x: margin,
    y: nodata_bottom + section_gap,
    maxWidth: max_text_width,
    noteSize,
    fontFamily: resolvedFontFamily,
    noteFont: note_font
  });
  const note_height = noteBlock.height > 0 ? section_gap + noteBlock.height : 0;
  const height = nodata_bottom + note_height + margin;
  const defs = cells
    .map((cell) => ('defs' in cell ? cell.defs : undefined))
    .filter((value): value is string => Boolean(value))
    .join('');
  const safeFontFamily = escapeSvgAttribute(resolvedFontFamily);

  return {
    markup: `<g class="quantitative_legend quantitative_legend--vertical" font-family="${safeFontFamily}">
      ${createLegendCanvasRect(body_width, height)}
      ${defs || nodata_defs ? `<defs>${defs}${nodata_defs}</defs>` : ''}
      <g class="box" stroke="none">
        ${cells.map((cell) => cell.markup).join('')}
      </g>
      <g class="ticks" stroke="black">
        ${ticks.join('')}
      </g>
      <g class="labels" text-anchor="start" dominant-baseline="central" font-size="${fontSize}" font-variant="tabular-nums">
        ${label_markup.join('')}
      </g>
      ${header.markup}
      ${nodata_markup}
      ${noteBlock.markup}
    </g>`,
    width: body_width,
    height
  };
}

function swatch_cell(
  swatch: Exclude<QuantiColorSwatch, { type: 'box' }>,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  opacity?: number,
  direction: 'horizontal' | 'vertical' = 'horizontal'
): string {
  const safeColor = escapeSvgAttribute(color);
  const paintOpacity =
    opacity !== undefined
      ? ` ${swatch.type === 'line' || (swatch.type === 'symbol' && swatch.outline) ? 'stroke' : 'fill'}-opacity="${clamp_opacity(opacity)}"`
      : '';

  if (swatch.type === 'line') {
    const dash = swatch.dashed ? ' stroke-dasharray="5,3"' : '';
    if (direction === 'vertical') {
      const center = x + width / 2;
      return `<line x1="${center}" y1="${y}" x2="${center}" y2="${y + height}" stroke="${safeColor}" stroke-width="${Math.min(width, swatch.strokeWidth)}"${paintOpacity}${dash}/>`;
    }
    const mid = y + height / 2;
    return `<line x1="${x}" y1="${mid}" x2="${x + width}" y2="${mid}" stroke="${safeColor}" stroke-width="${Math.min(height, swatch.strokeWidth)}"${paintOpacity}${dash}/>`;
  }

  // Symbol paths span about 16 units around their origin.
  const scale = height / 16;
  const transform = `translate(${x + width / 2},${y + height / 2}) scale(${scale})`;
  const paint = swatch.outline
    ? `fill="none" stroke="${safeColor}" stroke-width="${2 / scale}"`
    : `fill="${safeColor}" stroke="rgba(0, 0, 0, 0.25)" stroke-width="${0.75 / scale}"`;
  return `<path d="${escapeSvgAttribute(swatch.path)}" transform="${transform}" ${paint}${paintOpacity}/>`;
}

function box(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  opacity?: number
): string {
  const fillOpacity =
    opacity !== undefined ? ` fill-opacity="${clamp_opacity(opacity)}"` : '';
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeSvgAttribute(fill)}"${fillOpacity}/>`;
}

function clamp_opacity(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

// Inset so that neighbouring outlines stay apart instead of merging.
function outline_box(
  x: number,
  y: number,
  width: number,
  height: number,
  stroke: string,
  strokeWidth: number,
  opacity?: number
): string {
  const inset = strokeWidth / 2 + 1;
  const strokeOpacity =
    opacity !== undefined ? ` stroke-opacity="${clamp_opacity(opacity)}"` : '';
  return `<rect x="${x + inset}" y="${y + strokeWidth / 2}" width="${Math.max(0, width - 2 * inset)}" height="${height - strokeWidth}" fill="none" stroke="${escapeSvgAttribute(stroke)}" stroke-width="${strokeWidth}"${strokeOpacity}/>`;
}

function pattern_box(
  x: number,
  y: number,
  width: number,
  height: number,
  patternFill: LegendPatternFill,
  background = '#ffffff'
): { markup: string; defs?: string } {
  const backgroundRect = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeSvgAttribute(background)}"/>`;
  const patternRect = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeSvgAttribute(patternFill.fillUrl)}" opacity="1"/>`;

  return {
    markup: `${backgroundRect}${patternRect}`,
    defs: patternFill.defs
  };
}

function tick(x: number, y1: number, y2: number): string {
  return `<path d="M${x},${y1}L${x},${y2}" />`;
}

function label(x: number, y: number, text: number): string {
  return `<text x="${x}" y="${y}">${escapeSvgText(formatValue(text))}</text>`;
}
