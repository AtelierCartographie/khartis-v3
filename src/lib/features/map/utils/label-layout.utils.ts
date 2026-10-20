export type LabelLeaderPoint = [number, number];

export type LabelAlignment = 'start' | 'middle' | 'end';

/**
 * Coordinates are in page pixels, relative to the feature anchor, y down.
 * The label is an axis-aligned box around `center`.
 */
export interface LabelLeaderInput {
  center: LabelLeaderPoint;
  halfSize: LabelLeaderPoint;
  symbolRadius: number;
  /** Clear space kept between a symbol and the start of its leader. */
  symbolGap: number;
  minGap: number;
}

type LeaderEnd = 'horizontal' | 'vertical' | 'diagonal';

interface LeaderPort {
  port: LabelLeaderPoint;
  end: LeaderEnd;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function distanceToRange(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function signOf(value: number): number {
  return value < 0 ? -1 : 1;
}

function resolveGaps(
  [cx, cy]: LabelLeaderPoint,
  [hw, hh]: LabelLeaderPoint
): { horizontal: number; vertical: number } {
  return {
    horizontal: distanceToRange(0, cx - hw, cx + hw),
    vertical: distanceToRange(0, cy - hh, cy + hh)
  };
}

/**
 * Cartographers flush a label towards its feature: left when it sits on the
 * right, right when it sits on the left, centred above or below.
 */
export function resolveLabelAlignment(
  center: LabelLeaderPoint,
  halfSize: LabelLeaderPoint
): LabelAlignment {
  const gaps = resolveGaps(center, halfSize);
  if (gaps.horizontal === 0 || gaps.horizontal < gaps.vertical) {
    return 'middle';
  }
  return center[0] > 0 ? 'start' : 'end';
}

// The middle of the facing vertical side, reached by a horizontal last leg.
function resolveSidePort(
  [cx, cy]: LabelLeaderPoint,
  [hw]: LabelLeaderPoint
): LeaderPort | null {
  const x = cx - hw > 0 ? cx - hw : cx + hw < 0 ? cx + hw : null;
  if (x === null || Math.abs(cy) > Math.abs(x)) return null;
  return { port: [x, cy], end: 'horizontal' };
}

// The facing horizontal edge, within its central half, reached by a vertical
// last leg, or by the 45 degree leg alone when that is the only way in.
function resolveEdgePort(
  [cx, cy]: LabelLeaderPoint,
  [hw, hh]: LabelLeaderPoint
): LeaderPort | null {
  const y = cy - hh > 0 ? cy - hh : cy + hh < 0 ? cy + hh : null;
  if (y === null) return null;
  const x = clamp(0, cx - hw / 2, cx + hw / 2);
  if (Math.abs(x) <= Math.abs(y)) {
    return { port: [x, y], end: 'vertical' };
  }
  const diagonalX = signOf(x) * Math.abs(y);
  return diagonalX >= cx - hw && diagonalX <= cx + hw
    ? { port: [diagonalX, y], end: 'diagonal' }
    : null;
}

// Where the 45 degree ray towards the label enters its box.
function resolveDiagonalPort(
  [cx, cy]: LabelLeaderPoint,
  [hw, hh]: LabelLeaderPoint
): LeaderPort | null {
  const sx = signOf(cx);
  const sy = signOf(cy);
  const enter = Math.max(sx * cx - hw, sy * cy - hh, 0);
  const exit = Math.min(sx * cx + hw, sy * cy + hh);
  return enter > 0 && enter <= exit
    ? { port: [sx * enter, sy * enter], end: 'diagonal' }
    : null;
}

/**
 * The polyline joining a symbol (a circle of `symbolRadius` around the
 * anchor, or the anchor alone) to its displaced label, or null when the
 * label still reads as attached without one. Every segment is horizontal,
 * vertical or at 45 degrees: a diagonal leg out of the symbol, then a
 * horizontal or vertical leg into the label.
 */
export function computeLabelLeader({
  center,
  halfSize,
  symbolRadius,
  symbolGap,
  minGap
}: LabelLeaderInput): LabelLeaderPoint[] | null {
  const [cx, cy] = center;
  const [hw, hh] = halfSize;
  const nearest: LabelLeaderPoint = [
    clamp(0, cx - hw, cx + hw),
    clamp(0, cy - hh, cy + hh)
  ];
  const symbol = Math.max(0, symbolRadius);
  if (Math.hypot(nearest[0], nearest[1]) - symbol < minGap) {
    return null;
  }

  const gaps = resolveGaps(center, halfSize);
  const candidates =
    gaps.horizontal >= gaps.vertical
      ? [resolveSidePort, resolveEdgePort]
      : [resolveEdgePort, resolveSidePort];
  const route =
    candidates.reduce<LeaderPort | null>(
      (found, resolve) => found ?? resolve(center, halfSize),
      null
    ) ?? resolveDiagonalPort(center, halfSize);
  if (!route) return null;

  const { port, end } = route;
  const [px, py] = port;
  const elbow: LabelLeaderPoint =
    end === 'horizontal'
      ? [signOf(px) * Math.abs(py), py]
      : end === 'vertical'
        ? [px, signOf(py) * Math.abs(px)]
        : port;
  const radius = symbol > 0 ? symbol + Math.max(0, symbolGap) : 0;
  const elbowDistance = Math.hypot(elbow[0], elbow[1]);

  if (elbowDistance > radius) {
    const start: LabelLeaderPoint = [
      (elbow[0] / elbowDistance) * radius,
      (elbow[1] / elbowDistance) * radius
    ];
    return elbow === port ? [start, port] : [start, elbow, port];
  }

  // The bend falls inside the buffer: leave it along the last leg's line.
  const start: LabelLeaderPoint =
    end === 'vertical'
      ? [px, signOf(py) * Math.sqrt(Math.max(0, radius * radius - px * px))]
      : [signOf(px) * Math.sqrt(Math.max(0, radius * radius - py * py)), py];
  return [start, port];
}

/** Label block centre relative to its feature anchor, in page pixels. */
export type LabelOffset = [number, number];

/** Keyed by visualization id, then by feature key. */
export type LabelLayouts = Record<string, Record<string, LabelOffset>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function roundLabelOffset([dx, dy]: LabelOffset): LabelOffset {
  return [Math.round(dx * 10) / 10, Math.round(dy * 10) / 10];
}

function parseLabelOffset(value: unknown): LabelOffset | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [dx, dy] = value;
  return typeof dx === 'number' &&
    typeof dy === 'number' &&
    Number.isFinite(dx) &&
    Number.isFinite(dy)
    ? [dx, dy]
    : null;
}

/**
 * Reads persisted label layouts, dropping anything malformed. `fromEntries`
 * keeps keys such as `__proto__` as plain own properties.
 */
export function parseLabelLayouts(data: unknown): LabelLayouts {
  if (!isRecord(data)) return {};

  return Object.fromEntries(
    Object.entries(data).flatMap(([vizId, offsets]) => {
      if (!isRecord(offsets)) return [];
      const valid = Object.fromEntries(
        Object.entries(offsets).flatMap(([key, value]) => {
          const offset = parseLabelOffset(value);
          return offset ? [[key, offset]] : [];
        })
      );
      return Object.keys(valid).length > 0 ? [[vizId, valid]] : [];
    })
  );
}
