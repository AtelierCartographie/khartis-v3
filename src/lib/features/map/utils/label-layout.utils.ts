import {
  flushAlignment,
  leaderGeometry,
  type Box,
  type TextAnchor
} from '@ateliercartographie/label-placer';

export type LabelLeaderPoint = [number, number];

export type LabelAlignment = TextAnchor;

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

function boxAround(
  [cx, cy]: LabelLeaderPoint,
  [hw, hh]: LabelLeaderPoint
): Box {
  return [cx - hw, cy - hh, cx + hw, cy + hh];
}

/**
 * Cartographers flush a label towards its feature: left when it sits on the
 * right, right when it sits on the left, centred above or below.
 */
export function resolveLabelAlignment(
  center: LabelLeaderPoint,
  halfSize: LabelLeaderPoint
): LabelAlignment {
  return flushAlignment([0, 0], boxAround(center, halfSize));
}

/**
 * The octilinear polyline joining a symbol (a circle of `symbolRadius` around
 * the anchor, or the anchor alone) to its displaced label, or null when the
 * label still reads as attached without one. The automatic placement draws
 * its leaders with the same geometry.
 */
export function computeLabelLeader({
  center,
  halfSize,
  symbolRadius,
  symbolGap,
  minGap
}: LabelLeaderInput): LabelLeaderPoint[] | null {
  return leaderGeometry({
    anchor: [0, 0],
    box: boxAround(center, halfSize),
    symbol:
      symbolRadius > 0 ? { type: 'circle', radius: symbolRadius } : undefined,
    symbolGap,
    minGap
  });
}

/** Label block centre relative to its feature anchor, in page pixels. */
export type LabelOffset = [number, number];

/** Text typed over the data value of a label, for a translation or a fix. */
export interface LabelTextOverride {
  primary?: string;
  secondary?: string;
}

export interface LabelLayout {
  offsets: Record<string, LabelOffset>;
  texts: Record<string, LabelTextOverride>;
}

/** Keyed by visualization id; inside, offsets and texts by feature key. */
export type LabelLayouts = Record<string, LabelLayout>;

const LABEL_TEXT_MAX_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function roundLabelOffset([dx, dy]: LabelOffset): LabelOffset {
  return [Math.round(dx * 10) / 10, Math.round(dy * 10) / 10];
}

/** A typed label text, or undefined when it is blank and the data value stands. */
export function normalizeLabelText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, LABEL_TEXT_MAX_LENGTH);
  return text.length > 0 ? text : undefined;
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

function parseLabelTextOverride(value: unknown): LabelTextOverride | null {
  if (!isRecord(value)) return null;
  const primary = normalizeLabelText(value.primary);
  const secondary = normalizeLabelText(value.secondary);
  if (!primary && !secondary) return null;
  return {
    ...(primary && { primary }),
    ...(secondary && { secondary })
  };
}

function parseEntries<T>(
  value: unknown,
  parse: (entry: unknown) => T | null
): Record<string, T> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const parsed = parse(entry);
      return parsed ? [[key, parsed]] : [];
    })
  );
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
      const offsets = parseEntries(layout.offsets, parseLabelOffset);
      const texts = parseEntries(layout.texts, parseLabelTextOverride);
      return Object.keys(offsets).length > 0 || Object.keys(texts).length > 0
        ? [[vizId, { offsets, texts }]]
        : [];
    })
  );
}
