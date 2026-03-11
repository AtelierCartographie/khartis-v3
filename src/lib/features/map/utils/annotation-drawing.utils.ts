type DrawingPoint = { x: number; y: number };

/**
 * Converts a list of drawing points to an SVG path string.
 * When smoothness > 0, applies Catmull-Rom spline interpolation for smooth curves.
 *
 * @param points - Array of 2D points
 * @param smoothness - 0 (straight lines) to 100 (maximum smoothing, tension=0.5)
 * @param closed - Whether to close the path (for zone drawings)
 */
export function smoothDrawingPath(
  points: DrawingPoint[],
  smoothness: number,
  closed: boolean
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const tension = (Math.max(0, Math.min(100, smoothness)) / 100) * 0.5;

  if (tension < 0.001 || points.length === 2) {
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
    return closed ? `${d} Z` : d;
  }

  const n = points.length;

  function getPoint(i: number): DrawingPoint {
    if (closed) {
      return points[((i % n) + n) % n];
    }
    return points[Math.max(0, Math.min(n - 1, i))];
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  const segments = closed ? n : n - 1;

  for (let i = 0; i < segments; i++) {
    const pm1 = getPoint(i - 1);
    const p0 = getPoint(i);
    const p1 = getPoint(i + 1);
    const p2 = getPoint(i + 2);

    // Catmull-Rom to cubic Bezier: compute control points from adjacent points
    const cp1x = p0.x + (p1.x - pm1.x) * tension;
    const cp1y = p0.y + (p1.y - pm1.y) * tension;
    const cp2x = p1.x - (p2.x - p0.x) * tension;
    const cp2y = p1.y - (p2.y - p0.y) * tension;

    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p1.x},${p1.y}`;
  }

  if (closed) {
    d += ' Z';
  }

  return d;
}

/**
 * Computes the bounding box for an SVG drawing given its points and stroke width.
 * Returns the SVG `width`, `height`, and `viewBox` attributes so the element
 * precisely wraps the drawing (including stroke padding).
 */
export function computeDrawingBounds(
  points: DrawingPoint[],
  strokeWidth: number = 2
): { width: number; height: number; viewBox: string } {
  if (points.length === 0) {
    return { width: 10, height: 10, viewBox: '0 0 10 10' };
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const padding = Math.ceil(strokeWidth / 2) + 2;
  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = Math.max(1, maxX - minX + padding * 2);
  const vbH = Math.max(1, maxY - minY + padding * 2);

  return {
    width: vbW,
    height: vbH,
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`
  };
}
