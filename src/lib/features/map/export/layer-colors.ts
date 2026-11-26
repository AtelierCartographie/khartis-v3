import { resolveAccessorValue } from './binary-attributes';
import { escapeXml } from './svg-color';
import {
  clamp,
  roundSvgValue,
  toFiniteNumber,
  toNumberTuple
} from './svg-values';
import type { SvgColor } from './types';

export function resolveAccessorTuple(
  accessor: unknown,
  datum: unknown,
  index: number,
  fallback: number[]
): number[] {
  return (
    toNumberTuple(
      resolveAccessorValue(accessor, datum, index),
      fallback.length
    ) ?? fallback
  );
}
export function normalizeSvgColor(
  value: unknown,
  fallback: number[]
): SvgColor {
  const tuple = toNumberTuple(value, 4) ?? fallback;
  const red = toFiniteNumber(tuple[0], fallback[0] ?? 0);
  const green = toFiniteNumber(tuple[1], fallback[1] ?? 0);
  const blue = toFiniteNumber(tuple[2], fallback[2] ?? 0);
  const alpha = toFiniteNumber(tuple[3], fallback[3] ?? 255);
  const normalizedColor =
    red >= 0 &&
    red <= 1 &&
    green >= 0 &&
    green <= 1 &&
    blue >= 0 &&
    blue <= 1 &&
    alpha >= 0 &&
    alpha <= 1;

  return {
    red: Math.round(clamp(normalizedColor ? red * 255 : red, 0, 255)),
    green: Math.round(clamp(normalizedColor ? green * 255 : green, 0, 255)),
    blue: Math.round(clamp(normalizedColor ? blue * 255 : blue, 0, 255)),
    opacity: clamp(normalizedColor ? alpha : alpha / 255, 0, 1)
  };
}
export function applyLayerOpacity(
  color: SvgColor,
  layerOpacity: number
): SvgColor {
  return {
    ...color,
    opacity: clamp(color.opacity * layerOpacity, 0, 1)
  };
}
export function colorAttributes(
  attribute: 'fill' | 'stroke',
  color: SvgColor
): string {
  if (color.opacity <= 0) {
    return `${attribute}="none"`;
  }

  const value = `rgb(${color.red}, ${color.green}, ${color.blue})`;
  const opacityName = `${attribute}-opacity`;

  return `${attribute}="${escapeXml(value)}" ${opacityName}="${roundSvgValue(color.opacity)}"`;
}
export function svgColorKey(color: SvgColor): string {
  return `${color.red},${color.green},${color.blue},${color.opacity}`;
}
