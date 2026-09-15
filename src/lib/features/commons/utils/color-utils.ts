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

export function hexToRgb(hex: string): [number, number, number] {
  const sanitizedHex = hex.replace('#', '');

  const r = parseInt(sanitizedHex.substring(0, 2), 16);
  const g = parseInt(sanitizedHex.substring(2, 4), 16);
  const b = parseInt(sanitizedHex.substring(4, 6), 16);

  return [r, g, b];
}

export function webglToHex([r, g, b]: [
  number,
  number,
  number,
  number
]): string {
  return (
    '#' +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  );
}

export function hexToOklchHue(hex: string): number {
  const [red, green, blue] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  const long = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  );
  const medium = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  );
  const short = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  );

  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;

  return ((((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
}

export function darkenHex(hex: string, ratio: number): string {
  const { hue, saturation, lightness } = hexToHsl(hex);
  return hslToHex(hue, saturation, Math.round(lightness * (1 - ratio)));
}
