type DrawingPoint = { x: number; y: number };

const MAX_DRAWING_SMOOTHING_ITERATIONS = 3;
const MAX_DRAWING_CUT_RATIO = 0.22;
const MIN_DRAWING_NEIGHBOR_WEIGHT = 0.18;
const MAX_DRAWING_NEIGHBOR_WEIGHT = 0.5;

function normalizeSmoothness(smoothness: number): number {
  return Math.max(0, Math.min(100, smoothness));
}

function getDrawingSmoothnessFactor(smoothness: number): number {
  return Math.sqrt(normalizeSmoothness(smoothness) / 100);
}

function interpolateDrawingPoint(
  start: DrawingPoint,
  end: DrawingPoint,
  ratio: number
): DrawingPoint {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio
  };
}

function roundDrawingPoint(point: DrawingPoint): DrawingPoint {
  return {
    x: Math.round(point.x * 100) / 100,
    y: Math.round(point.y * 100) / 100
  };
}

function dedupeDrawingPoints(points: DrawingPoint[]): DrawingPoint[] {
  const deduped: DrawingPoint[] = [];

  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      Math.abs(previous.x - point.x) < 0.01 &&
      Math.abs(previous.y - point.y) < 0.01
    ) {
      continue;
    }

    deduped.push(roundDrawingPoint(point));
  }

  return deduped;
}

function smoothDrawingPointPositions(
  points: DrawingPoint[],
  smoothnessFactor: number,
  closed: boolean
): DrawingPoint[] {
  if (points.length < 3 || smoothnessFactor < 0.001) {
    return points;
  }

  const passes = Math.max(
    1,
    Math.ceil(smoothnessFactor * MAX_DRAWING_SMOOTHING_ITERATIONS)
  );
  const neighborWeight =
    MIN_DRAWING_NEIGHBOR_WEIGHT +
    (MAX_DRAWING_NEIGHBOR_WEIGHT - MIN_DRAWING_NEIGHBOR_WEIGHT) *
      smoothnessFactor;

  let smoothedPoints = points.map((point) => ({ ...point }));

  for (let pass = 0; pass < passes; pass += 1) {
    smoothedPoints = smoothedPoints.map((point, index) => {
      if (!closed && (index === 0 || index === smoothedPoints.length - 1)) {
        return point;
      }

      const previous = getDrawingPoint(smoothedPoints, index - 1, closed);
      const next = getDrawingPoint(smoothedPoints, index + 1, closed);
      const neighborhood = {
        x: (previous.x + next.x) / 2,
        y: (previous.y + next.y) / 2
      };

      return interpolateDrawingPoint(point, neighborhood, neighborWeight);
    });
  }

  return smoothedPoints;
}

function cutDrawingCorners(
  points: DrawingPoint[],
  cutRatio: number,
  closed: boolean
): DrawingPoint[] {
  if (points.length < 2 || cutRatio < 0.001) {
    return points;
  }

  const nextPoints: DrawingPoint[] = [];

  if (!closed) {
    nextPoints.push(points[0]);
  }

  const segmentCount = closed ? points.length : points.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = getDrawingPoint(points, index, closed);
    const end = getDrawingPoint(points, index + 1, closed);

    nextPoints.push(
      interpolateDrawingPoint(start, end, cutRatio),
      interpolateDrawingPoint(start, end, 1 - cutRatio)
    );
  }

  if (!closed) {
    nextPoints.push(points[points.length - 1]);
  }

  return nextPoints;
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

function getSmoothedDrawingPoints(
  points: DrawingPoint[],
  smoothness: number,
  closed: boolean
): DrawingPoint[] {
  if (points.length < 2 || (closed && points.length < 3)) {
    return points;
  }

  const smoothnessFactor = getDrawingSmoothnessFactor(smoothness);
  if (smoothnessFactor < 0.001) {
    return points;
  }

  const cutRatio =
    MAX_DRAWING_CUT_RATIO * 0.5 +
    MAX_DRAWING_CUT_RATIO * 0.5 * smoothnessFactor;
  const iterations = Math.max(
    1,
    Math.ceil((smoothnessFactor * MAX_DRAWING_SMOOTHING_ITERATIONS) / 1.5)
  );

  let smoothedPoints = smoothDrawingPointPositions(
    points,
    smoothnessFactor,
    closed
  );

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    smoothedPoints = cutDrawingCorners(smoothedPoints, cutRatio, closed);
  }

  if (closed) {
    smoothedPoints = restoreClosedArea(points, smoothedPoints);
  }

  return dedupeDrawingPoints(smoothedPoints);
}

function signedArea(points: DrawingPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function centroid(points: DrawingPoint[]): DrawingPoint {
  const sum = points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// Averaging neighbours and cutting corners both pull a closed outline
// inward: the smoothed zone is scaled back about its centre to the area the
// user drew.
function restoreClosedArea(
  original: DrawingPoint[],
  smoothed: DrawingPoint[]
): DrawingPoint[] {
  const originalArea = Math.abs(signedArea(original));
  const smoothedArea = Math.abs(signedArea(smoothed));
  if (originalArea < 1e-6 || smoothedArea < 1e-6) return smoothed;

  const scale = Math.sqrt(originalArea / smoothedArea);
  const center = centroid(smoothed);
  return smoothed.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale
  }));
}

function distanceToSegment(
  point: DrawingPoint,
  start: DrawingPoint,
  end: DrawingPoint
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
    )
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * Keeps the anchors a freehand stroke needs to stay within `tolerance` of the
 * hand's path (Ramer–Douglas–Peucker). A stroke sampled every few pixels
 * otherwise carries so many anchors that smoothing has nothing left to round.
 * The first and last points are kept; two points or fewer come back as is.
 */
export function simplifyDrawingStroke(
  points: DrawingPoint[],
  tolerance: number
): DrawingPoint[] {
  if (points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = 0;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = distanceToSegment(
        points[index],
        points[startIndex],
        points[endIndex]
      );
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = index;
      }
    }
    if (farthest !== -1 && farthestDistance > tolerance) {
      keep[farthest] = 1;
      stack.push([startIndex, farthest], [farthest, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

export function smoothDrawingPath(
  points: DrawingPoint[],
  smoothness: number,
  closed: boolean
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const smoothedPoints = getSmoothedDrawingPoints(points, smoothness, closed);
  const path = smoothedPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  if (closed) {
    return `${path} Z`;
  }

  return path;
}

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

  const boundaryPoints = getSmoothedDrawingPoints(points, smoothness, closed);

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
