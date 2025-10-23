export function hexToRgb(hex: string): [number, number, number] {
  const sanitizedHex = hex.replace('#', '');

  const r = parseInt(sanitizedHex.substring(0, 2), 16);
  const g = parseInt(sanitizedHex.substring(2, 4), 16);
  const b = parseInt(sanitizedHex.substring(4, 6), 16);

  return [r, g, b];
}

export function hexToRgba(
  hex: string,
  alpha: number = 1
): [number, number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, Math.round(alpha * 255)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
