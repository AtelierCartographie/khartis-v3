export const LABEL_LEADER_STYLES = ['straight', 'elbow', 'none'] as const;

export type LabelLeaderStyle = (typeof LABEL_LEADER_STYLES)[number];

export type LabelLeaderPoint = [number, number];

/**
 * Coordinates are in page pixels, relative to the feature anchor, y down.
 * The label is an axis-aligned box around `center`.
 */
export interface LabelLeaderInput {
  center: LabelLeaderPoint;
  halfSize: LabelLeaderPoint;
  symbolRadius: number;
  minGap: number;
  style: LabelLeaderStyle;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function distanceToRange(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function pointOnCircle(
  toward: LabelLeaderPoint,
  radius: number
): LabelLeaderPoint {
  const length = Math.hypot(toward[0], toward[1]);
  if (radius <= 0 || length === 0) {
    return [0, 0];
  }
  return [(toward[0] / length) * radius, (toward[1] / length) * radius];
}

/**
 * Where the leader meets the label: the middle of the facing vertical side
 * when the label sits mostly beside the anchor, otherwise the facing
 * horizontal side, kept within its central half so the leader never lands
 * on a corner.
 */
function resolveLabelPort(
  center: LabelLeaderPoint,
  halfSize: LabelLeaderPoint
): { port: LabelLeaderPoint; onVerticalSide: boolean } {
  const [cx, cy] = center;
  const [hw, hh] = halfSize;
  const horizontalGap = distanceToRange(0, cx - hw, cx + hw);
  const verticalGap = distanceToRange(0, cy - hh, cy + hh);

  if (horizontalGap >= verticalGap) {
    return {
      port: [cx > 0 ? cx - hw : cx + hw, cy],
      onVerticalSide: true
    };
  }

  return {
    port: [clamp(0, cx - hw / 2, cx + hw / 2), cy > 0 ? cy - hh : cy + hh],
    onVerticalSide: false
  };
}

/**
 * The polyline joining a symbol (a circle of `symbolRadius` around the
 * anchor, or the anchor alone) to its displaced label, or null when the
 * label still reads as attached without one.
 */
export function computeLabelLeader({
  center,
  halfSize,
  symbolRadius,
  minGap,
  style
}: LabelLeaderInput): LabelLeaderPoint[] | null {
  if (style === 'none') {
    return null;
  }

  const [cx, cy] = center;
  const [hw, hh] = halfSize;
  const nearest: LabelLeaderPoint = [
    clamp(0, cx - hw, cx + hw),
    clamp(0, cy - hh, cy + hh)
  ];
  const radius = Math.max(0, symbolRadius);
  const gap = Math.hypot(nearest[0], nearest[1]) - radius;
  if (gap < minGap) {
    return null;
  }

  const { port, onVerticalSide } = resolveLabelPort(center, halfSize);
  const [px, py] = port;

  if (style === 'elbow' && onVerticalSide && Math.abs(py) < Math.abs(px)) {
    if (Math.abs(py) < radius) {
      const x = Math.sign(px) * Math.sqrt(radius * radius - py * py);
      return [[x, py], port];
    }

    const elbow: LabelLeaderPoint = [Math.sign(px) * Math.abs(py), py];
    const start = pointOnCircle(elbow, radius);
    return start[0] === elbow[0] && start[1] === elbow[1]
      ? [start, port]
      : [start, elbow, port];
  }

  return [pointOnCircle(port, radius), port];
}

/** Label block centre relative to its feature anchor, in page pixels. */
export type LabelOffset = [number, number];

export interface LabelLayout {
  leaderStyle: LabelLeaderStyle;
  offsets: Record<string, LabelOffset>;
}

/** Keyed by visualization id, then by feature key. */
export type LabelLayouts = Record<string, LabelLayout>;

export const DEFAULT_LABEL_LEADER_STYLE: LabelLeaderStyle = 'straight';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLabelLeaderStyle(value: unknown): value is LabelLeaderStyle {
  return (
    typeof value === 'string' &&
    (LABEL_LEADER_STYLES as readonly string[]).includes(value)
  );
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
    Object.entries(data).flatMap(([vizId, layout]) => {
      if (!isRecord(layout)) return [];
      const offsets = isRecord(layout.offsets)
        ? Object.fromEntries(
            Object.entries(layout.offsets).flatMap(([key, value]) => {
              const offset = parseLabelOffset(value);
              return offset ? [[key, offset]] : [];
            })
          )
        : {};
      const leaderStyle = isLabelLeaderStyle(layout.leaderStyle)
        ? layout.leaderStyle
        : DEFAULT_LABEL_LEADER_STYLE;
      if (
        Object.keys(offsets).length === 0 &&
        leaderStyle === DEFAULT_LABEL_LEADER_STYLE
      ) {
        return [];
      }
      return [[vizId, { leaderStyle, offsets }]];
    })
  );
}
