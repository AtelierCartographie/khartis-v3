export type VectorPoint = { x: number; y: number };

export type SegmentDistance = {
  distSq: number;
  closest: VectorPoint;
  t: number;
};

const CURVE_EPSILON = 0.5;
const ARROW_HEAD_BASE_LENGTH = 7;
const ARROW_HEAD_LENGTH_FACTOR = 3;
const ARROW_HEAD_BASE_WIDTH = 6;
const ARROW_HEAD_WIDTH_FACTOR = 2.4;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function distanceToSegmentSq(
  point: VectorPoint,
  segStart: VectorPoint,
  segEnd: VectorPoint
): SegmentDistance {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 0.0001) {
    const ddx = point.x - segStart.x;
    const ddy = point.y - segStart.y;
    return {
      distSq: ddx * ddx + ddy * ddy,
      closest: { x: segStart.x, y: segStart.y },
      t: 0
    };
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq
    )
  );
  const closest = { x: segStart.x + t * dx, y: segStart.y + t * dy };
  const ddx = point.x - closest.x;
  const ddy = point.y - closest.y;
  return { distSq: ddx * ddx + ddy * ddy, closest, t };
}

export function getArrowHeadSize(strokeWidth: number): {
  length: number;
  width: number;
} {
  const stroke = Math.max(1, strokeWidth);
  return {
    length: ARROW_HEAD_BASE_LENGTH + stroke * ARROW_HEAD_LENGTH_FACTOR,
    width: ARROW_HEAD_BASE_WIDTH + stroke * ARROW_HEAD_WIDTH_FACTOR
  };
}

function getSegmentControlPoint(
  start: VectorPoint,
  end: VectorPoint,
  offset: number
): VectorPoint {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  if (Math.abs(offset) < CURVE_EPSILON) {
    return { x: midX, y: midY };
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;

  return { x: midX + normalX * offset, y: midY + normalY * offset };
}

export function getSegmentTensionHandle(
  start: VectorPoint,
  end: VectorPoint,
  offset: number
): VectorPoint {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  if (Math.abs(offset) < CURVE_EPSILON) {
    return { x: midX, y: midY };
  }

  const control = getSegmentControlPoint(start, end, offset);
  return { x: (midX + control.x) / 2, y: (midY + control.y) / 2 };
}

function isCurvedOffset(offset: number | undefined): boolean {
  return offset !== undefined && Math.abs(offset) >= CURVE_EPSILON;
}

export function buildVectorLinePath(
  points: VectorPoint[],
  controlOffsets?: number[]
): string {
  if (points.length === 0) return '';
  if (points.length === 1)
    return `M ${round(points[0].x)} ${round(points[0].y)}`;

  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const offset = controlOffsets?.[index] ?? 0;
    if (isCurvedOffset(offset)) {
      const control = getSegmentControlPoint(start, end, offset);
      path += ` Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`;
    } else {
      path += ` L ${round(end.x)} ${round(end.y)}`;
    }
  }

  return path;
}

export type ArrowHeadGeometry = {
  path: string;
  tip: VectorPoint;
  left: VectorPoint;
  right: VectorPoint;
};

export function getArrowHeadGeometry(
  points: VectorPoint[],
  controlOffsets: number[] | undefined,
  strokeWidth: number
): ArrowHeadGeometry | null {
  if (points.length < 2) return null;

  const lastIndex = points.length - 1;
  const start = points[lastIndex - 1];
  const tip = points[lastIndex];
  const offset = controlOffsets?.[lastIndex - 1] ?? 0;

  let directionX: number;
  let directionY: number;
  if (isCurvedOffset(offset)) {
    const control = getSegmentControlPoint(start, tip, offset);
    directionX = tip.x - control.x;
    directionY = tip.y - control.y;
  } else {
    directionX = tip.x - start.x;
    directionY = tip.y - start.y;
  }

  const length = Math.hypot(directionX, directionY) || 1;
  const unitX = directionX / length;
  const unitY = directionY / length;
  const { length: headLength, width: headWidth } =
    getArrowHeadSize(strokeWidth);
  const baseX = tip.x - unitX * headLength;
  const baseY = tip.y - unitY * headLength;
  const half = headWidth / 2;
  const left = { x: baseX - unitY * half, y: baseY + unitX * half };
  const right = { x: baseX + unitY * half, y: baseY - unitX * half };

  return {
    path: `M ${round(left.x)} ${round(left.y)} L ${round(tip.x)} ${round(tip.y)} L ${round(right.x)} ${round(right.y)} Z`,
    tip: { x: tip.x, y: tip.y },
    left,
    right
  };
}

export function computeVectorPathBounds(
  points: VectorPoint[],
  controlOffsets: number[] | undefined,
  strokeWidth: number,
  hasArrowHead: boolean
): {
  width: number;
  height: number;
  viewBox: string;
  originX: number;
  originY: number;
} {
  const envelope: VectorPoint[] = points.map((point) => ({ ...point }));

  for (let index = 0; index < points.length - 1; index += 1) {
    const offset = controlOffsets?.[index] ?? 0;
    if (isCurvedOffset(offset)) {
      envelope.push(
        getSegmentControlPoint(points[index], points[index + 1], offset)
      );
    }
  }

  if (hasArrowHead) {
    const head = getArrowHeadGeometry(points, controlOffsets, strokeWidth);
    if (head) {
      envelope.push(head.left, head.right, head.tip);
    }
  }

  if (envelope.length === 0) {
    return {
      width: 10,
      height: 10,
      viewBox: '0 0 10 10',
      originX: 0,
      originY: 0
    };
  }

  const xs = envelope.map((point) => point.x);
  const ys = envelope.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const padding = Math.ceil(strokeWidth / 2) + 2;
  const originX = minX - padding;
  const originY = minY - padding;
  const width = Math.max(1, maxX - minX + padding * 2);
  const height = Math.max(1, maxY - minY + padding * 2);

  return {
    width,
    height,
    viewBox: `${round(originX)} ${round(originY)} ${round(width)} ${round(height)}`,
    originX,
    originY
  };
}

export function insertControlOffsetAt(
  controlOffsets: number[] | undefined,
  segmentIndex: number,
  segmentCount: number
): number[] {
  const offsets = Array.from(
    { length: segmentCount },
    (_, index) => controlOffsets?.[index] ?? 0
  );
  offsets.splice(segmentIndex, 1, 0, 0);
  return offsets;
}

export function removeControlOffsetForPoint(
  controlOffsets: number[] | undefined,
  pointIndex: number,
  segmentCount: number
): number[] {
  const offsets = Array.from(
    { length: segmentCount },
    (_, index) => controlOffsets?.[index] ?? 0
  );
  if (pointIndex <= 0) {
    offsets.splice(0, 1);
  } else if (pointIndex >= segmentCount) {
    offsets.splice(segmentCount - 1, 1);
  } else {
    offsets.splice(pointIndex - 1, 2, 0);
  }
  return offsets;
}
