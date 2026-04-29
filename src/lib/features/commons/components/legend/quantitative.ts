import { m } from '$lib/paraglide/messages.js';
import Textbox from '@borgar/textbox';
import { bisectLeft, bisectRight } from 'd3-array';
import {
  createLegendCanvasRect,
  createLegendFont,
  escapeSvgAttribute,
  escapeSvgText,
  linearScale,
  magnitude,
  resolveLegendFontFamily,
  round,
  round_extreme,
  type CommonLegendTextOptions
} from './utils';

export interface QuantiColorLegendOptions extends CommonLegendTextOptions {
  variable_width?: boolean;
  nodata?: boolean;
  nodataLabel?: string;
}

export function draw_quanti_color_legend(
  thresholds: number[],
  colors: string[],
  options: QuantiColorLegendOptions = {}
): string {
  let { variable_width, title, subtitle, note, fontSize, nodata } = options;
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
    Textbox.measureText(d.toLocaleString(), font)
  );
  const label_gap = 5;
  const label_safety_padding = Math.max(6, Math.round(fontSize * 0.6));
  const overlap_test = (i: number, positions: number[]) =>
    labels_length[i] / 2 + labels_length[i + 1] / 2 + label_gap <
    positions[i + 1] - positions[i];
  const original_margin = 10;
  const margin_top = original_margin;
  const margin_left = original_margin + labels_length[0] / 2;
  const margin_right = original_margin + labels_length[nb_boxes] / 2;
  let box_width = 40;
  const max_box_width = 200;
  let boxes_width: number;
  const box_height = 15;
  const test_indices = index.slice(0, -1);
  const header_gap = 3;

  do {
    boxes_width = box_width * nb_boxes;
    const x_scale = linearScale(
      [x_domain[0], x_domain[nb_boxes]],
      [margin_left, boxes_width + margin_left]
    );
    x = x_domain.map(x_scale);
    box_width++;
  } while (
    box_width < max_box_width &&
    test_indices.every((d) => overlap_test(d, x)) === false
  );

  const scale_body_width = margin_left + boxes_width + margin_right;
  const nodata_gap = 10;
  const nodata_box_h = box_height;
  const nodata_box_w = Math.round(fontSize * 2);
  const nodata_label = options.nodataLabel ?? m.legend_no_data_label();
  const nodata_body_width = nodata
    ? margin_left +
      nodata_box_w +
      label_gap +
      Textbox.measureText(nodata_label, font) +
      label_safety_padding +
      original_margin
    : 0;
  const body_width = Math.max(scale_body_width, nodata_body_width);
  const max_text_width = body_width - margin_left - original_margin;
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
  const title_lines = title ? wrap_text(title, title_font, max_text_width) : [];
  const subtitle_lines = subtitle
    ? wrap_text(subtitle, subtitle_font, max_text_width)
    : [];
  const note_lines = note ? wrap_text(note, note_font, max_text_width) : [];
  const actual_header_height =
    (title_lines.length > 0
      ? title_lines.length * (titleSize * 1.2) + header_gap
      : 0) +
    (subtitle_lines.length > 0
      ? subtitle_lines.length * (subtitleSize * 1.2) + header_gap
      : 0);
  const actual_box_top = margin_top + actual_header_height + 5;
  const actual_tick_end = actual_box_top + box_height + 5;
  const actual_labels_bottom = actual_tick_end + 5 + fontSize;
  const nodata_section_height = nodata ? nodata_gap + nodata_box_h + 5 : 0;
  const note_gap = 8;
  const actual_note_height =
    note_lines.length > 0 ? note_gap + note_lines.length * (noteSize * 1.2) : 0;
  const width = body_width;
  const height =
    actual_labels_bottom +
    nodata_section_height +
    actual_note_height +
    margin_top;
  const boxes = index
    .slice(0, -1)
    .map((d, i) =>
      box(x[i], actual_box_top, x[i + 1] - x[i], box_height, colors[d])
    );
  const ticks = x
    .slice(1, -1)
    .map((d) => tick(d, actual_box_top, actual_tick_end));
  const labels = x.map((d, i) => label(d, actual_tick_end, thresholds[i]));

  return create_svg_markup(boxes, ticks, labels);

  function create_svg_markup(
    boxes: string[],
    ticks: string[],
    labels: string[]
  ): string {
    const safeFontFamily = escapeSvgAttribute(resolvedFontFamily);
    let header_markup = '';
    let y_cursor = margin_top;

    if (title_lines.length > 0) {
      const line_h = titleSize * 1.2;
      header_markup += `<g class="title" text-anchor="start" dominant-baseline="hanging" font-size="${titleSize}" font-weight="bold">`;
      title_lines.forEach((line, i) => {
        header_markup += `<text x="${margin_left}" y="${y_cursor + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      header_markup += `</g>`;
      y_cursor += title_lines.length * line_h + header_gap;
    }

    if (subtitle_lines.length > 0) {
      const line_h = subtitleSize * 1.2;
      header_markup += `<g class="subtitle" text-anchor="start" dominant-baseline="hanging" font-size="${subtitleSize}">`;
      subtitle_lines.forEach((line, i) => {
        header_markup += `<text x="${margin_left}" y="${y_cursor + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      header_markup += `</g>`;
    }

    let nodata_markup = '';
    if (nodata) {
      const nodata_y = actual_labels_bottom + nodata_gap;
      const nodata_label_x = margin_left + nodata_box_w + label_gap;
      nodata_markup = `<g class="nodata">
        <rect x="${margin_left}" y="${nodata_y}" width="${nodata_box_w}" height="${nodata_box_h}" fill="#d9d9d9" stroke="none"/>
        <text x="${nodata_label_x}" y="${nodata_y + nodata_box_h / 2}" dominant-baseline="central" font-size="${fontSize}">${escapeSvgText(nodata_label)}</text>
      </g>`;
    }

    let note_markup = '';
    if (note_lines.length > 0) {
      const note_y = actual_labels_bottom + nodata_section_height + note_gap;
      const line_h = noteSize * 1.2;
      note_markup += `<g class="note" text-anchor="start" dominant-baseline="hanging" font-size="${noteSize}">`;
      note_lines.forEach((line, i) => {
        note_markup += `<text x="${margin_left}" y="${note_y + i * line_h}">${escapeSvgText(line)}</text>`;
      });
      note_markup += `</g>`;
    }

    return `<g class="quantitative_legend" font-family="${safeFontFamily}">
      ${createLegendCanvasRect(width, height)}
      <g class="box" stroke="none">
        ${boxes.join('')}
      </g>
      <g class="ticks" stroke="black">
        ${ticks.join('')}
      </g>
      <g class="labels" text-anchor="middle" dominant-baseline="hanging" font-size="${fontSize}"
         font-variant="tabular-nums" transform="translate(0,5)">
        ${labels.join('')}
      </g>
      ${header_markup}
      ${nodata_markup}
      ${note_markup}
    </g>`;
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

function tick(x: number, y1: number, y2: number): string {
  return `<path d="M${x},${y1}L${x},${y2}" />`;
}

function label(x: number, y: number, text: number): string {
  return `<text x="${x}" y="${y}">${escapeSvgText(text.toLocaleString())}</text>`;
}

function wrap_text(text: string, font: string, maxWidth: number): string[] {
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
