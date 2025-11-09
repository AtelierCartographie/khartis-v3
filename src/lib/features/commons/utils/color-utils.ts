export interface HSLColor {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface ColorValue {
  hex: string;
  hue: number;
  saturation: number;
  lightness: number;
}

export function hslToHex(h: number, s: number, l: number): string {
  h = h % 360;
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

export function hexToHsl(hex: string): HSLColor {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;

      case g:
        h = (b - r) / d + 2;
        break;

      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    hue: Math.round(h * 360),
    saturation: Math.round(s * 100),
    lightness: Math.round(l * 100)
  };
}

export function createColorValue(
  hex: string,
  hue?: number,
  saturation?: number,
  lightness?: number
): ColorValue {
  if (
    hue !== undefined &&
    saturation !== undefined &&
    lightness !== undefined
  ) {
    return {
      hex: hslToHex(hue, saturation, lightness),
      hue,
      saturation,
      lightness
    };
  }

  const hsl = hexToHsl(hex);
  return {
    hex,
    ...hsl
  };
}

export function isValidHexColor(hex: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(hex);
}
