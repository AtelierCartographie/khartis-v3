import { m } from '$lib/paraglide/messages';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import Textbox from '@borgar/textbox';
import { bisectLeft, bisectRight } from 'd3-array';
import type { LegendPatternFill } from './khartis-extensions';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  linearScale,
  magnitude,
  measureLegendLongestToken,
  renderLegendHeader,
  renderLegendNote,
  resolveLegendFontFamily,
  round,
  scaleLegendMetric,
  round_extreme,
  type CommonLegendTextOptions,
  type LegendSvgDefinition
} from './utils';

export interface QuantiColorLegendOptions extends CommonLegendTextOptions {
  variable_width?: boolean;
  nodata?: boolean;
  nodataLabel?: string;
  classPatternFills?: (LegendPatternFill | null)[];
}

export function draw_quanti_color_legend(
  thresholds: number[],
  colors: string[],
  options: QuantiColorLegendOptions = {}
): LegendSvgDefinition {
  let { variable_width, title, subtitle, note, fontSize, nodata } = options;
  const classPatternFills = options.classPatternFills;
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
  // boxes widen until no two labels collide.
  let box_width = scaleLegendMetric(40, fontSize);
  x = positions_for(box_width);
  while (!labels_fit(x)) {
    box_width += 1;
    x = positions_for(box_width);
  }
  const boxes_width = box_width * nb_boxes;

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

    return {
      markup: box(x[i], actual_box_top, x[i + 1] - x[i], box_height, colors[d])
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
    if (nodata) {
      const nodata_y = actual_labels_bottom + section_gap;
      const nodata_label_x = margin_left + nodata_box_w + label_gap;
      nodata_markup = `<g class="nodata">
        <rect x="${margin_left}" y="${nodata_y}" width="${nodata_box_w}" height="${nodata_box_h}" fill="#d9d9d9" stroke="none"/>
        <text x="${nodata_label_x}" y="${nodata_y + nodata_box_h / 2}" dominant-baseline="central" font-size="${fontSize}">${escapeSvgText(nodata_label)}</text>
      </g>`;
    }

    return {
      markup: `<g class="quantitative_legend" font-family="${safeFontFamily}">
      ${createLegendCanvasRect(width, height)}
      ${boxesDefs ? `<defs>${boxesDefs}</defs>` : ''}
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

export function round_thresholds(
  sorted_data: ArrayLike<number>,
  thresholds: number[]
): number[] {
  const first = 0;
  const last = thresholds.length - 1;

  return thresholds.map((threshold, i) => {
    switch (i) {
      case first:
        return round_extreme(sorted_data, threshold, 'min');
      case last:
        return round_extreme(sorted_data, threshold, 'max');
      default: {
        const lo = bisectLeft(sorted_data as number[], threshold);
        const hi = bisectRight(sorted_data as number[], threshold);
        const previous = lo > 0 ? sorted_data[lo - 1] : threshold;
        const next = hi < sorted_data.length ? sorted_data[hi] : threshold;
        const { integers, decimals } = magnitude(threshold);
        let min_significant = decimals ? decimals : integers;
        const significant_digit = threshold < 10 ? 1 : 2;
        let rounded_threshold = threshold;

        for (; min_significant >= significant_digit; min_significant--) {
          const rounded = round(threshold, min_significant);
          if (previous < rounded && next > rounded) {
            rounded_threshold = rounded;
          } else {
            break;
          }
        }

        return rounded_threshold;
      }
    }
  });
}

function box(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string
): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeSvgAttribute(fill)}"/>`;
}

function pattern_box(
  x: number,
  y: number,
  width: number,
  height: number,
  patternFill: LegendPatternFill
): { markup: string; defs?: string } {
  const backgroundRect = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff"/>`;
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
