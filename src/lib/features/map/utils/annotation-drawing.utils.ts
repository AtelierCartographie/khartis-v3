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

  if (closed && smoothedPoints.length > 1) {
    return dedupeDrawingPoints(smoothedPoints);
  }

  return dedupeDrawingPoints(smoothedPoints);
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
