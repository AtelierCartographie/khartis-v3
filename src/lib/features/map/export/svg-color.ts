import { clamp, roundSvgValue } from './svg-values';

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
interface CssColor {
  hex: string;
  opacity: number;
}
const NAMED_CSS_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff'
};

function toHexByte(value: number): string {
  return Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, '0');
}

function parseHexColor(value: string): CssColor | null {
  const match = value.match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return null;

  const digits = match[1];
  const expanded =
    digits.length <= 4
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  if (expanded.length !== 6 && expanded.length !== 8) return null;

  const alpha =
    expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 : 1;
  return { hex: `#${expanded.slice(0, 6).toLowerCase()}`, opacity: alpha };
}

function parseRgbFunction(value: string): CssColor | null {
  const match = value.match(/^rgba?\(([^)]*)\)$/i);
  if (!match) return null;

  const tokens = match[1].split(/[\s,/]+/).filter(Boolean);
  if (tokens.length < 3) return null;

  const channel = (token: string): number =>
    token.endsWith('%')
      ? (Number.parseFloat(token) / 100) * 255
      : Number.parseFloat(token);
  const [red, green, blue] = tokens.slice(0, 3).map(channel);
  const alphaToken = tokens[3];
  const alpha =
    alphaToken === undefined
      ? 1
      : alphaToken.endsWith('%')
        ? Number.parseFloat(alphaToken) / 100
        : Number.parseFloat(alphaToken);

  if (![red, green, blue, alpha].every(Number.isFinite)) return null;

  return {
    hex: `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`,
    opacity: clamp(alpha, 0, 1)
  };
}

let colorNormalizationContext: OffscreenCanvasRenderingContext2D | null = null;

// Modern colour syntaxes (`oklch()`, `color()`) survive getComputedStyle;
// the canvas serializes them back to hex or rgba.
function normalizeColorThroughCanvas(value: string): string | null {
  if (typeof OffscreenCanvas === 'undefined') return null;

  colorNormalizationContext ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (!colorNormalizationContext) return null;

  colorNormalizationContext.fillStyle = '#010203';
  colorNormalizationContext.fillStyle = value;
  const normalized = String(colorNormalizationContext.fillStyle ?? '');
  return normalized && normalized !== '#010203' ? normalized : null;
}

// Design tools read SVG 1.1 paint only: `rgba()`, `hsl()` or `transparent`
// render black in Inkscape and are dropped by Illustrator and Figma.
function parseCssColor(value: string): CssColor | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'none') return null;
  if (normalized === 'transparent') return { hex: '#000000', opacity: 0 };

  const named = NAMED_CSS_COLORS[normalized];
  if (named) return { hex: named, opacity: 1 };

  const parsed = parseHexColor(normalized) ?? parseRgbFunction(normalized);
  if (parsed) return parsed;

  const canvasColor = normalizeColorThroughCanvas(normalized);
  return canvasColor
    ? (parseHexColor(canvasColor) ?? parseRgbFunction(canvasColor))
    : null;
}

export function isTransparentColor(value: string): boolean {
  if (!value.trim()) return true;
  const color = parseCssColor(value);
  return color !== null && color.opacity <= 0;
}

function resolveSvgPaintUrl(value: string): string | null {
  const match = value.match(/^url\(\s*["']?[^"')]*?(#[^"')]+)["']?\s*\)$/i);
  return match ? `url(${match[1]})` : null;
}

// Paint as `#rrggbb` plus a separate opacity attribute, the form every
// design tool reads. An unparsable value is kept as is.
export function cssPaintAttributeEntries(
  attribute: 'fill' | 'stroke',
  value: string,
  extraOpacity = 1
): [string, string][] {
  const trimmed = value.trim();
  const url = resolveSvgPaintUrl(trimmed);
  if (url) {
    return extraOpacity < 1
      ? [
          [attribute, url],
          [`${attribute}-opacity`, roundSvgValue(extraOpacity)]
        ]
      : [[attribute, url]];
  }

  if (!trimmed || trimmed.toLowerCase() === 'none') {
    return [[attribute, 'none']];
  }

  const color = parseCssColor(trimmed);
  if (!color) return [[attribute, trimmed]];

  const opacity = clamp(color.opacity * extraOpacity, 0, 1);
  if (opacity <= 0) return [[attribute, 'none']];

  return opacity < 1
    ? [
        [attribute, color.hex],
        [`${attribute}-opacity`, roundSvgValue(opacity)]
      ]
    : [[attribute, color.hex]];
}
export function cssPaintAttributes(
  attribute: 'fill' | 'stroke',
  value: string,
  extraOpacity = 1
): string {
  return cssPaintAttributeEntries(attribute, value, extraOpacity)
    .map(([name, entry]) => `${name}="${escapeXml(entry)}"`)
    .join(' ');
}
export function opacityAttribute(value: string): string {
  const opacity = Number.parseFloat(value);
  return Number.isFinite(opacity) && opacity < 1
    ? `opacity="${roundSvgValue(clamp(opacity, 0, 1))}"`
    : '';
}
export interface ParsedBoxShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
  opacity: number;
}
export function parseBoxShadow(value: string): ParsedBoxShadow | null {
  if (!value || value.trim().toLowerCase() === 'none') {
    return null;
  }

  const colorMatch = value.match(/rgba?\(([^)]+)\)|#[0-9a-fA-F]{3,8}/);
  if (!colorMatch) return null;

  const colorToken = colorMatch[0];
  const rest = value.replace(colorToken, '').trim();
  const numbers = rest
    .split(/\s+/)
    .map((token) => Number(token.replace(/px$/, '')))
    .filter((n) => Number.isFinite(n));

  if (numbers.length < 2) return null;

  const [offsetX, offsetY, blur = 0] = numbers;
  const color = parseCssColor(colorToken);
  if (!color || color.opacity <= 0) return null;

  return {
    offsetX,
    offsetY,
    blur,
    color: color.hex,
    opacity: color.opacity
  };
}
