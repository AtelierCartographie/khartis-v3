type DrawingPoint = { x: number; y: number };

type DrawingBezierSegment = {
  cp1: DrawingPoint;
  cp2: DrawingPoint;
  end: DrawingPoint;
  start: DrawingPoint;
};

function normalizeSmoothness(smoothness: number): number {
  return Math.max(0, Math.min(100, smoothness));
}

function getDrawingTension(smoothness: number): number {
  return (normalizeSmoothness(smoothness) / 100) * 0.5;
}

function getDrawingPoint(
  points: DrawingPoint[],
  index: number,
  closed: boolean
): DrawingPoint {
  if (closed) {
    const length = points.length;
    return points[((index % length) + length) % length];
  }

  return points[Math.max(0, Math.min(points.length - 1, index))];
}

function getDrawingBezierSegments(
  points: DrawingPoint[],
  smoothness: number,
  closed: boolean
): DrawingBezierSegment[] {
  if (points.length < 2) {
    return [];
  }

  const tension = getDrawingTension(smoothness);
  if (tension < 0.001 || points.length === 2) {
    return [];
  }

  const segmentCount = closed ? points.length : points.length - 1;
  const segments: DrawingBezierSegment[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const previous = getDrawingPoint(points, index - 1, closed);
    const start = getDrawingPoint(points, index, closed);
    const end = getDrawingPoint(points, index + 1, closed);
    const next = getDrawingPoint(points, index + 2, closed);

    segments.push({
      start,
      end,
      cp1: {
        x: start.x + (end.x - previous.x) * tension,
        y: start.y + (end.y - previous.y) * tension
      },
      cp2: {
        x: end.x - (next.x - start.x) * tension,
        y: end.y - (next.y - start.y) * tension
      }
    });
  }

  return segments;
}

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

  const segments = getDrawingBezierSegments(points, smoothness, closed);
  if (segments.length === 0) {
    const path = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');

    return closed ? `${path} Z` : path;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (const segment of segments) {
    path +=
      ` C ${segment.cp1.x.toFixed(2)},${segment.cp1.y.toFixed(2)}` +
      ` ${segment.cp2.x.toFixed(2)},${segment.cp2.y.toFixed(2)}` +
      ` ${segment.end.x},${segment.end.y}`;
  }

  if (closed) {
    path += ' Z';
  }

  return path;
}

/**
 * Computes the bounding box for an SVG drawing given its points and stroke width.
 * When smoothing is enabled, the returned bounds include Bezier control points so
 * the exported SVG does not clip overshooting smoothed paths.
 */
export function computeDrawingBounds(
  points: DrawingPoint[],
  strokeWidth: number = 2,
  smoothness: number = 0,
  closed: boolean = false
): {
  width: number;
  height: number;
  viewBox: string;
  originX: number;
  originY: number;
} {
  if (points.length === 0) {
    return {
      width: 10,
      height: 10,
      viewBox: '0 0 10 10',
      originX: 0,
      originY: 0
    };
  }

  const segments = getDrawingBezierSegments(points, smoothness, closed);
  const boundaryPoints =
    segments.length === 0
      ? points
      : segments.flatMap((segment) => [
          segment.start,
          segment.cp1,
          segment.cp2,
          segment.end
        ]);

  const xs = boundaryPoints.map((point) => point.x);
  const ys = boundaryPoints.map((point) => point.y);
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
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    originX: vbX,
    originY: vbY
  };
}
