import { hslToHex } from '$lib/features/commons/utils/color-utils';
import {
  clampFontSize,
  resolveFontFamilyStack
} from '$lib/features/step-toolbar/fonts.constants';
import type { AnnotationStyle } from '$lib/features/step-toolbar/tools/annotations';

type HslColor = {
  hue: number;
  saturation: number;
  lightness: number;
};

export type AnnotationVectorStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
};

export type AnnotationGuideVectorStyle = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
};

const DEFAULT_TEXT_COLOR = '#000000';
const DEFAULT_TEXT_BACKGROUND_COLOR = '#ffffff';
const DEFAULT_TEXT_BACKGROUND_OPACITY = 0.9;
const DEFAULT_VECTOR_STROKE_WIDTH = 2;
const MIN_GUIDE_STROKE_WIDTH = 3;
const GUIDE_STROKE_WIDTH_OFFSET = 1;
const GUIDE_STROKE_COLOR = 'rgba(82, 82, 82, 0.9)';
const GUIDE_STROKE_DASHARRAY = '6,4';
const DASHED_STROKE_DASHARRAY = '5,5';
const DOTTED_STROKE_DASHARRAY = '2,2';

export function getColorValue(
  color: string | HslColor | undefined,
  fallback: string
): string {
  if (!color) return fallback;
  if (typeof color === 'string') return color;
  return hslToHex(color.hue, color.saturation, color.lightness);
}

export function toOpacityUnit(opacity: number | undefined): number {
  if (opacity === undefined) {
    return 1;
  }

  const rawValue = Number(opacity);
  if (!Number.isFinite(rawValue)) {
    return 1;
  }

  const percentValue = rawValue <= 1 ? rawValue * 100 : rawValue;
  const clampedPercent = Math.max(0, Math.min(100, percentValue));
  return clampedPercent / 100;
}

export function getTextStyleFromStyle(
  style: AnnotationStyle | undefined
): string {
  const resolvedStyle = style ?? {};
  const styles: string[] = [];

  if (resolvedStyle.font) {
    styles.push(`font-family: ${resolveFontFamilyStack(resolvedStyle.font)}`);
  }
  if (resolvedStyle.fontSize) {
    styles.push(`font-size: ${clampFontSize(resolvedStyle.fontSize, 8)}px`);
  }
  if (resolvedStyle.bold) {
    styles.push('font-weight: bold');
  }
  if (resolvedStyle.italic) {
    styles.push('font-style: italic');
  }
  if (resolvedStyle.underlined) {
    styles.push('text-decoration: underline');
  }
  if (resolvedStyle.textAlign) {
    styles.push(`text-align: ${resolvedStyle.textAlign}`);
  }
  styles.push(`opacity: ${toOpacityUnit(resolvedStyle.opacity)}`);

  const color = getColorValue(resolvedStyle.color, DEFAULT_TEXT_COLOR);
  styles.push(`color: ${color}`);

  if (resolvedStyle.backgroundColor) {
    const bgColor = getColorValue(
      resolvedStyle.backgroundColor,
      DEFAULT_TEXT_BACKGROUND_COLOR
    );
    const bgOpacity =
      resolvedStyle.backgroundOpacity !== undefined
        ? Math.max(0, Math.min(100, resolvedStyle.backgroundOpacity)) / 100
        : DEFAULT_TEXT_BACKGROUND_OPACITY;
    styles.push(
      `background: color-mix(in srgb, ${bgColor} ${bgOpacity * 100}%, transparent)`
    );
  } else {
    styles.push('background: transparent');
    styles.push('box-shadow: none');
  }

  return styles.join('; ');
}

export function getVectorStyle(
  style: AnnotationStyle | undefined
): AnnotationVectorStyle {
  const resolvedStyle = style ?? {};
  return {
    fill: getColorValue(resolvedStyle.fillColor, 'none'),
    stroke: getColorValue(resolvedStyle.strokeColor, DEFAULT_TEXT_COLOR),
    strokeWidth: resolvedStyle.strokeWidth ?? DEFAULT_VECTOR_STROKE_WIDTH,
    strokeDasharray:
      resolvedStyle.strokeStyle === 'dashed'
        ? DASHED_STROKE_DASHARRAY
        : resolvedStyle.strokeStyle === 'dotted'
          ? DOTTED_STROKE_DASHARRAY
          : undefined,
    opacity: toOpacityUnit(resolvedStyle.opacity)
  };
}

export function getGuideVectorStyle(
  style: AnnotationStyle | null | undefined
): AnnotationGuideVectorStyle {
  const resolvedStyle = style ?? {};

  return {
    stroke: GUIDE_STROKE_COLOR,
    strokeWidth: Math.max(
      (resolvedStyle.strokeWidth ?? DEFAULT_VECTOR_STROKE_WIDTH) +
        GUIDE_STROKE_WIDTH_OFFSET,
      MIN_GUIDE_STROKE_WIDTH
    ),
    strokeDasharray: GUIDE_STROKE_DASHARRAY
  };
}
