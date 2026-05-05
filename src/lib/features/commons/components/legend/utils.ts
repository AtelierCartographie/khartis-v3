import {
  clampFontSize,
  resolveFontFamilyStack
} from '$lib/features/step-toolbar/fonts.constants';
import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';

export type ScaleFn = (value: number) => number;

export interface MagnitudeResult {
  order: number;
  integers: number;
  decimals: number | null;
}

export interface LegendSvgDefinition {
  markup: string;
  width: number;
  height: number;
}

export interface CommonLegendTextOptions {
  title?: string | null;
  subtitle?: string | null;
  note?: string | null;
  fontSize?: number;
  fontFamily?: string;
}

export function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value).replace(/"/g, '&quot;');
}

export function createLegendSvg(markup: string): LegendSvgDefinition {
  const size = /<rect[^>]*width="([^"]+)"[^>]*height="([^"]+)"/.exec(markup);
  const width = Number(size?.[1] ?? 0);
  const height = Number(size?.[2] ?? 0);

  return {
    markup,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0
  };
}

export function resolveLegendFontFamily(fontFamily?: string): string {
  return resolveFontFamilyStack(fontFamily);
}

export function createLegendFont(options: {
  fontSize: number;
  fontFamily?: string;
  lineHeight?: number;
  weight?: 'bold';
}): string {
  const { lineHeight, weight } = options;
  const fontSize = clampFontSize(
    options.fontSize,
    PRINT_STANDARD_TOKENS.legend.fontSize
  );
  const fontFamily = resolveLegendFontFamily(options.fontFamily);
  const size = lineHeight ? `${fontSize}px/${lineHeight}px` : `${fontSize}px`;

  return `${weight ? `${weight} ` : ''}${size} ${fontFamily}`;
}

export function createLegendCanvasRect(width: number, height: number): string {
  return `<rect width="${width}" height="${height}" fill="transparent" pointer-events="none" />`;
}

export function linearScale(
  [d0, d1]: [number, number],
  [r0, r1]: [number, number]
): ScaleFn {
  if (d0 === d1) {
    return () => (r0 + r1) / 2;
  }

  return (value: number) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

export function sqrtScale(
  [d0, d1]: [number, number],
  [r0, r1]: [number, number]
): ScaleFn {
  const sd0 = Math.sqrt(d0);
  const sd1 = Math.sqrt(d1);

  if (sd0 === sd1) {
    return () => (r0 + r1) / 2;
  }

  return (value: number) =>
    r0 + ((Math.sqrt(value) - sd0) / (sd1 - sd0)) * (r1 - r0);
}

function bisectRight(values: ArrayLike<number>, value: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (value < values[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

export function magnitude(value: number): MagnitudeResult {
  if (!Number.isFinite(value) || value === 0) {
    return { order: 0, integers: 0, decimals: null };
  }

  const sign = Math.sign(value);
  const abs = Math.abs(value);
  const exponent = Math.floor(Math.log10(abs));
  const order = 10 ** exponent;

  if (abs < 1) {
    return { order: order * sign, integers: 0, decimals: -exponent };
  }

  return { order: order * sign, integers: exponent + 1, decimals: null };
}

export function filter_candidates_by_distances(
  sorted_data: ArrayLike<number>,
  candidates: number[],
  n_ticks: number = 4
): number[] {
  if (candidates.length <= n_ticks) {
    return candidates;
  }

  const distances = candidates_distances_from_data(sorted_data, candidates);
  const indexed = distances.map((distance, index) => ({ distance, index }));
  indexed.sort((a, b) => a.distance - b.distance);
  const exit_indices = new Set(indexed.slice(n_ticks).map((x) => x.index));

  return candidates.filter((_, index) => !exit_indices.has(index));
}

export function candidates_distances_from_data(
  sorted_data: ArrayLike<number>,
  candidates: number[]
): number[] {
  const len = sorted_data.length;
  return candidates.map((candidate) => {
    const hi = bisectRight(sorted_data as number[], candidate);
    const lo = hi - 1;

    if (lo < 0) {
      const mag_high = magnitude(sorted_data[0]);
      return Math.abs(sorted_data[0] - candidate) / Math.max(1, mag_high.order);
    }

    if (hi >= len) {
      const mag_low = magnitude(sorted_data[len - 1]);
      return (
        Math.abs(sorted_data[len - 1] - candidate) / Math.max(1, mag_low.order)
      );
    }

    const low = sorted_data[lo];
    const high = sorted_data[hi];
    const mag_low = magnitude(low);
    const mag_high = magnitude(high);
    const diff_from_low =
      Math.abs(low - candidate) / Math.max(1, mag_low.order);
    const diff_from_high =
      Math.abs(high - candidate) / Math.max(1, mag_high.order);

    return Math.min(diff_from_low, diff_from_high);
  });
}

export function round(value: number, significant_digits: number): number {
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const nIntegers = exponent + 1;
  const precision = 10 ** -(nIntegers - significant_digits);
  return Math.round(value * precision) / precision;
}

export function round_extreme(
  sorted_data: ArrayLike<number>,
  first: number,
  type: 'min' | 'max'
): number {
  if (type === 'min' && first === 0) {
    first = get_next_extreme(sorted_data, first, type) ?? first;
  }

  const second = get_next_extreme(sorted_data, first, type);
  if (second === undefined) {
    return first;
  }

  let first_rounded = first;
  const { integers, decimals } = magnitude(first);
  let i = decimals ? decimals : integers;
  const significant_number = first < 10 ? 1 : 2;

  while (
    i >= significant_number &&
    ((type === 'min' && first_rounded < second) ||
      (type === 'max' && first_rounded > second))
  ) {
    first_rounded = round(first, i);
    i--;
  }

  return first_rounded;
}

function get_next_extreme(
  sorted_data: ArrayLike<number>,
  first: number,
  type: 'min' | 'max'
): number | undefined {
  const len = sorted_data.length;
  if (len === 0) return undefined;

  if (type === 'max') {
    const index = bisectRight(sorted_data as number[], first) - 1;
    for (let i = index; i >= 0; i--) {
      if (sorted_data[i] < first) return sorted_data[i];
    }
    return undefined;
  }

  const index = bisectRight(sorted_data as number[], first);
  if (index < len) return sorted_data[index];
  return undefined;
}
